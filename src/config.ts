import fs from "node:fs/promises";
import { parse } from "yaml";
import { rootConfigSchema } from "./config-schema";

async function parseYAMLConfig(filePath: string) {
  const configFileContent = await fs.readFile(filePath, "utf-8");
  const parseConfiguration = parse(configFileContent);
  return JSON.stringify(parseConfiguration);
}

async function validateConfig(config: string) {
  const validatedConfig = await rootConfigSchema.parseAsync(JSON.parse(config));
  return validatedConfig
}
