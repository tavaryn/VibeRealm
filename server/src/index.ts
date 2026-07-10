import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { OverworldRoom } from "./rooms/OverworldRoom";

const app = express();
app.use(cors());
app.use(express.json());

// Serve the client's production build from this same server/port, so
// deploying only ever requires exposing one port (the game port below)
// instead of a separate one for the Vite dev server. Run `npm run build`
// in client/ first - see README.md.
//
// __dirname is server/src in dev (ts-node-dev) and server/dist after a
// server-side build, so in both cases going up two levels reaches the
// VibeRealm project root, then into client/dist.
const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  // SPA fallback: any GET that isn't a static asset or the WebSocket
  // upgrade still returns index.html, so a browser refresh works normally.
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
} else {
  console.warn(
    `[warn] No client build found at ${clientDistPath}. ` +
      `Run "npm run build" in client/ if you want this server to serve the game client. ` +
      `(Not needed if you're using the Vite dev server separately.)`
  );
}

const port = Number(process.env.PORT) || 2567;
const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Room name string here must match room.joinOrCreate("overworld", ...) on the client.
gameServer.define("overworld", OverworldRoom);

httpServer.listen(port, () => {
  console.log(`VibeRealm server listening on port ${port}`);
});
