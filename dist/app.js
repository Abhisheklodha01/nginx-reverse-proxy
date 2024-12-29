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
const express_1 = __importDefault(require("express"));
const node_cluster_1 = __importDefault(require("node:cluster"));
const axios_1 = __importDefault(require("axios"));
const config_schema_1 = require("./config-schema");
const server_schema_1 = require("./server-schema");
function createServer(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const { worker_count } = config;
        const WORKER_POOL = [];
        if (node_cluster_1.default.isPrimary) {
            for (let i = 0; i < worker_count; i++) {
                const worker = node_cluster_1.default.fork({
                    config: JSON.stringify(config.config),
                });
                WORKER_POOL.push(worker);
            }
            const app = (0, express_1.default)();
            app.use(express_1.default.json());
            app.all("*", (req, res) => {
                const index = Math.floor(Math.random() * WORKER_POOL.length);
                const worker = WORKER_POOL[index];
                if (!worker) {
                    return res.status(500).send("Worker not found");
                }
                const payload = {
                    requestType: "HTTP",
                    headers: req.headers,
                    body: req.body,
                    url: req.url,
                };
                worker.send(JSON.stringify(payload));
                worker.once("message", (workerReply) => __awaiter(this, void 0, void 0, function* () {
                    const reply = yield server_schema_1.workerMessageReplySchema.parseAsync(JSON.parse(workerReply));
                    if (reply.errorCode) {
                        return res.status(parseInt(reply.errorCode)).send(reply.error);
                    }
                    else {
                        return res.status(200).send(reply.data);
                    }
                }));
            });
            app.listen(config.port, () => {
                console.log(`Reverse Proxy Ninja 🥷 is listening on PORT: ${config.port}`);
            });
        }
        else {
            const configuration = yield config_schema_1.rootConfigSchema.parseAsync(JSON.parse(process.env.config));
            process.on("message", (message) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c, _d;
                const validatedMessage = yield server_schema_1.workerMessageSchema.parseAsync(JSON.parse(message));
                const requestUrl = validatedMessage.url;
                const rule = configuration.server.rules.find((rule) => {
                    const regex = new RegExp(`^${rule.path}(/|$)`);
                    return regex.test(requestUrl);
                });
                if (!rule) {
                    console.error("No rule matched for:", requestUrl);
                    const reply = { errorCode: "404", error: "Rule not found" };
                    return (_a = process.send) === null || _a === void 0 ? void 0 : _a.call(process, JSON.stringify(reply));
                }
                const upstreamId = rule.upstreams[0];
                const upstream = configuration.server.upstreams.find((upstream) => upstream.id === upstreamId);
                if (!upstream) {
                    console.error("Upstream not found for ID:", upstreamId);
                    const reply = { errorCode: "500", error: "Upstream not found" };
                    return (_b = process.send) === null || _b === void 0 ? void 0 : _b.call(process, JSON.stringify(reply));
                }
                console.log("Matched Upstream:", upstream);
                try {
                    const proxyRes = yield axios_1.default.get(`${upstream.url}/${requestUrl}`);
                    console.log("Response from upstream:", proxyRes.data);
                    const reply = { data: proxyRes.data };
                    return (_c = process.send) === null || _c === void 0 ? void 0 : _c.call(process, JSON.stringify(reply));
                }
                catch (error) {
                    console.error("Error in upstream request:", error.message);
                    const reply = {
                        errorCode: "500",
                        error: error.message || "Proxy error",
                    };
                    return (_d = process.send) === null || _d === void 0 ? void 0 : _d.call(process, JSON.stringify(reply));
                }
            }));
        }
    });
}
exports.default = createServer;
