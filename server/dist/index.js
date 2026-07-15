"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@colyseus/core");
const ws_transport_1 = require("@colyseus/ws-transport");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const OverworldRoom_1 = require("./rooms/OverworldRoom");
require("./admin/commands"); // side effect: registers all built-in admin commands
const consoleInput_1 = require("./admin/consoleInput");
const adminRuntime_1 = require("./admin/adminRuntime");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const clientDistPath = path_1.default.join(__dirname, "..", "..", "client", "dist");
if (fs_1.default.existsSync(clientDistPath)) {
    app.use(express_1.default.static(clientDistPath));
    app.get("*", (_req, res) => {
        res.sendFile(path_1.default.join(clientDistPath, "index.html"));
    });
}
else {
    console.warn(`[warn] No client build found at ${clientDistPath}. ` +
        `Run "npm run build" in client/ if you want this server to serve the game client. ` +
        `(Not needed if you're using the Vite dev server separately.)`);
}
const port = Number(process.env.PORT) || 2567;
const httpServer = (0, http_1.createServer)(app);
const gameServer = new core_1.Server({
    transport: new ws_transport_1.WebSocketTransport({ server: httpServer }),
});
gameServer.define("overworld", OverworldRoom_1.OverworldRoom);
// Wired up for the /quit admin command (server/src/admin/commands.ts) - a
// bare process.exit() alone wouldn't let in-flight sends finish or
// release the port cleanly for an immediate restart.
(0, adminRuntime_1.setShutdownHandler)(() => {
    console.log("[server] Shutting down (requested via admin command)...");
    httpServer.close(() => {
        console.log("[server] HTTP/WebSocket server closed. Exiting.");
        process.exit(0);
    });
    setTimeout(() => {
        console.warn("[server] Forcing exit after shutdown timeout.");
        process.exit(0);
    }, 3000);
});
httpServer.listen(port, () => {
    console.log(`VibeRealm server listening on port ${port}`);
    (0, consoleInput_1.startConsoleInput)();
});
