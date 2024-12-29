"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const node_cluster_1 = __importDefault(require("node:cluster"));
const config_schema_1 = require("./config-schema");
const server_schema_1 = require("./server-schema");
function createServer(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const { worker_count } = config;
        const WORKER_POOL = [];
        if (node_cluster_1.default.isPrimary) {
            for (let i = 0; i < worker_count; i++) {
                const w = node_cluster_1.default.fork({
                    config: JSON.stringify(config.config),
                });
                WORKER_POOL.push(w);
            }
            const server = node_http_1.default.createServer((req, res) => {
                const index = Math.floor(Math.random() * WORKER_POOL.length);
                const worker = WORKER_POOL.at(index);
                if (!worker) {
                    throw new Error("Worker not found");
                }
                const payload = {
                    requestType: "HTTP",
                    headers: req.headers,
                    body: null,
                    url: `${req.url}`,
                };
                worker.send(JSON.stringify(payload));
                worker.on("message", (workerReply) => __awaiter(this, void 0, void 0, function* () {
                    const reply = yield server_schema_1.workerMessageReplySchema.parseAsync(JSON.parse(workerReply));
                    if (reply.errorCode) {
                        res.writeHead(parseInt(reply.errorCode));
                        res.end(reply.error);
                    }
                    else {
                        res.writeHead(200);
                        res.end(reply.data);
                        return;
                    }
                }));
            });
            server.listen(config.port, () => {
                console.log(`Reverse Proxy Ninja 🥷 ${" "} is Listing on PORT: ${config.port}`);
            });
        }
        else {
            const configuration = yield config_schema_1.rootConfigSchema.parseAsync(JSON.parse(process.env.config));
            process.on("message", (message) => __awaiter(this, void 0, void 0, function* () {
                const validatedMessage = yield server_schema_1.workerMessageSchema.parseAsync(JSON.parse(message));
                const requestUrl = validatedMessage.url;
                const rule = config.config.server.rules.find((e) => {
                    const regex = new RegExp(`^${e.path}.*$`);
                    return regex.test(requestUrl);
                });
                if (!rule) {
                    const reply = {
                        errorCode: "404",
                        error: "Rule not found",
                    };
                    if (process.send) {
                        return process.send(JSON.stringify(reply));
                    }
                }
                const upstreamId = rule === null || rule === void 0 ? void 0 : rule.upstreams[0];
                const upstream = config.config.server.upstreams.find((e) => e.id === upstreamId);
                if (!upstream) {
                    const reply = {
                        errorCode: "500",
                        error: "Upstreams not found",
                    };
                    if (process.send) {
                        return process.send(JSON.stringify(reply));
                    }
                }
                const request = node_http_1.default.request({ host: upstream === null || upstream === void 0 ? void 0 : upstream.url, path: requestUrl, method: "GET" }, (proxyRes) => {
                    let body = "";
                    proxyRes.on("data", (chunk) => {
                        body += chunk;
                    });
                    proxyRes.on("end", () => {
                        const reply = {
                            data: body,
                        };
                        if (process.send) {
                            return process.send(JSON.stringify(reply));
                        }
                    });
                });
                request.end();
            }));
        }
    });
}
exports.default = createServer;
