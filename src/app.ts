import express from "express";
import cluster, { Worker } from "node:cluster";
import axios from "axios";
import { ConfigSchemaType, rootConfigSchema } from "./config-schema";
import {
  workerMessageSchema,
  WorkerMessageType,
  workerMessageReplySchema,
  WorkerMessageReplyType,
} from "./server-schema";

interface serverConfig {
  port: number;
  worker_count: number;
  config: ConfigSchemaType;
}

async function createServer(config: serverConfig) {
  const { worker_count } = config;
  const WORKER_POOL: Worker[] = [];

  if (cluster.isPrimary) {
    for (let i = 0; i < worker_count; i++) {
      const worker = cluster.fork({
        config: JSON.stringify(config.config),
      });
      WORKER_POOL.push(worker);
    }

    const app = express();

    app.use(express.json());

    app.all("*", (req: any, res: any) => {
      const index = Math.floor(Math.random() * WORKER_POOL.length);
      const worker = WORKER_POOL[index];

      if (!worker) {
        return res.status(500).send("Worker not found");
      }

      const payload: WorkerMessageType = {
        requestType: "HTTP",
        headers: req.headers,
        body: req.body,
        url: req.url,
      };

      worker.send(JSON.stringify(payload));

      worker.once("message", async (workerReply: string) => {
        const reply: WorkerMessageReplyType =
          await workerMessageReplySchema.parseAsync(JSON.parse(workerReply));

        if (reply.errorCode) {
          return res.status(parseInt(reply.errorCode)).send(reply.error);
        } else {
          return res.status(200).send(reply.data);
        }
      });
    });

    app.listen(config.port, () => {
      console.log(
        `Reverse Proxy Ninja 🥷 is listening on PORT: ${config.port}`
      );
    });
  } else {
    const configuration = await rootConfigSchema.parseAsync(
      JSON.parse(process.env.config as string)
    );
    process.on("message", async (message: string) => {
      
      const validatedMessage = await workerMessageSchema.parseAsync(
        JSON.parse(message)
      );
      const requestUrl = validatedMessage.url;

      const rule = configuration.server.rules.find((rule) => {
        const regex = new RegExp(`^${rule.path}(/|$)`);
        return regex.test(requestUrl);
      });

      if (!rule) {
        console.error("No rule matched for:", requestUrl);
        const reply = { errorCode: "404", error: "Rule not found" };
        return process.send?.(JSON.stringify(reply));
      }

      const upstreamId = rule.upstreams[0];
      const upstream = configuration.server.upstreams.find(
        (upstream) => upstream.id === upstreamId
      );

      if (!upstream) {
        console.error("Upstream not found for ID:", upstreamId);
        const reply = { errorCode: "500", error: "Upstream not found" };
        return process.send?.(JSON.stringify(reply));
      }
      console.log("Matched Upstream:", upstream);
      
      try {
        const proxyRes = await axios.get(`${upstream.url}/${requestUrl}`);
        console.log("Response from upstream:", proxyRes.data);
        const reply = { data: proxyRes.data };
        return process.send?.(JSON.stringify(reply));
      } catch (error: any) {
        console.error("Error in upstream request:", error.message);
        const reply = {
          errorCode: "500",
          error: error.message || "Proxy error",
        };
        return process.send?.(JSON.stringify(reply));
      }
    });
  }
}

export default createServer;
