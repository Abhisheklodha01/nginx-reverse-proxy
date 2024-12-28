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
const config_schema_1 = require("./config-schema");
const app = (0, express_1.default)();
app.get("/", (req, res) => {
    res.send("Server is working fine");
});
function createServer(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const { worker_count } = config;
        if (node_cluster_1.default.isPrimary) {
            for (let i = 0; i < worker_count; i++) {
                node_cluster_1.default.fork({
                    config: JSON.stringify(config.config),
                });
            }
        }
        else {
            const configuration = yield config_schema_1.rootConfigSchema.parseAsync(JSON.parse(process.env.config));
            app.listen(8000, () => {
                console.log("Server is running on port: 8000");
            });
        }
    });
}
exports.default = createServer;
