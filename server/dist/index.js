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
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve the client's production build from this same server/port, so
// deploying only ever requires exposing one port (the game port below)
// instead of a separate one for the Vite dev server. Run `npm run build`
// in client/ first - see README.md.
//
// __dirname is server/src in dev (ts-node-dev) and server/dist after a
// server-side build, so in both cases going up two levels reaches the
// VibeRealm project root, then into client/dist.
const clientDistPath = path_1.default.join(__dirname, "..", "..", "client", "dist");
if (fs_1.default.existsSync(clientDistPath)) {
    app.use(express_1.default.static(clientDistPath));
    // SPA fallback: any GET that isn't a static asset or the WebSocket
    // upgrade still returns index.html, so a browser refresh works normally.
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
// Room name string here must match room.joinOrCreate("overworld", ...) on the client.
gameServer.define("overworld", OverworldRoom_1.OverworldRoom);
httpServer.listen(port, () => {
    console.log(`VibeRealm server listening on port ${port}`);
});
