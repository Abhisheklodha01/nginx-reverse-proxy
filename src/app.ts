import express from "express";
import cluster from "node:cluster";
import { ConfigSchemaType, rootConfigSchema } from "./config-schema";

const app = express();
app.get("/", (req, res) => {
  res.send("Server is working fine");
});

interface serverConfig {
  port: number;
  worker_count: number;
  config: ConfigSchemaType;
}

async function createServer(config: serverConfig) {
  const { worker_count } = config;
  if (cluster.isPrimary) {
    for (let i = 0; i < worker_count; i++) {
      cluster.fork({
        config: JSON.stringify(config.config),
      });
    }
  } else {
    const configuration = await rootConfigSchema.parseAsync(
      JSON.parse(process.env.config as string)
    );
    app.listen(8000, () => {
      console.log("Server is running on port: 8000");
    });
  }
}

export default createServer;
