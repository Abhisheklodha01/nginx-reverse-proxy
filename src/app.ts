import http, { request } from "node:http";
import cluster, { Worker } from "node:cluster";
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
      const w = cluster.fork({
        config: JSON.stringify(config.config),
      });
      WORKER_POOL.push(w);
    }
    const server = http.createServer((req, res) => {
      const index = Math.floor(Math.random() * WORKER_POOL.length);
      const worker = WORKER_POOL.at(index);
      if (!worker) {
        throw new Error("Worker not found");
      }
      const payload: WorkerMessageType = {
        requestType: "HTTP",
        headers: req.headers,
        body: null,
        url: `${req.url}`,
      };
      worker.send(JSON.stringify(payload));
      worker.on("message", async (workerReply: string) => {
        const reply: WorkerMessageReplyType =
          await workerMessageReplySchema.parseAsync(JSON.parse(workerReply));
        if (reply.errorCode) {
          res.writeHead(parseInt(reply.errorCode));
          res.end(reply.error);
        } else {
          res.writeHead(200);
          res.end(reply.data);
          return;
        }
      });
    });
    server.listen(config.port, () => {
      console.log(
        `Reverse Proxy Ninja 🥷 ${" "} is Listing on PORT: ${config.port}`
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
      const rule = config.config.server.rules.find((e) => {
        const regex = new RegExp(`^${e.path}.*$`);
        return regex.test(requestUrl);
      });
      if (!rule) {
        const reply: WorkerMessageReplyType = {
          errorCode: "404",
          error: "Rule not found",
        };
        if (process.send) {
          return process.send(JSON.stringify(reply));
        }
      }
      const upstreamId = rule?.upstreams[0];
      const upstream = config.config.server.upstreams.find(
        (e) => e.id === upstreamId
      );
      if (!upstream) {
        const reply: WorkerMessageReplyType = {
          errorCode: "500",
          error: "Upstreams not found",
        };
        if (process.send) {
          return process.send(JSON.stringify(reply));
        }
      }

      const request = http.request(
        { host: upstream?.url, path: requestUrl, method: "GET" },
        (proxyRes) => {
          let body = "";
          proxyRes.on("data", (chunk) => {
            body += chunk;
          });

          proxyRes.on("end", () => {
            const reply: WorkerMessageReplyType = {
              data: body,
            };
            if (process.send) {
              return process.send(JSON.stringify(reply));
            }
          });
        }
      );
      request.end();
    });
  }
}

export default createServer;
