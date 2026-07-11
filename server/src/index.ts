import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { OverworldRoom } from "./rooms/OverworldRoom";
import "./admin/commands"; // side effect: registers all built-in admin commands
import { startConsoleInput } from "./admin/consoleInput";
import { setShutdownHandler } from "./admin/adminRuntime";

const app = express();
app.use(cors());
app.use(express.json());

const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
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

gameServer.define("overworld", OverworldRoom);

// Wired up for the /quit admin command (server/src/admin/commands.ts) - a
// bare process.exit() alone wouldn't let in-flight sends finish or
// release the port cleanly for an immediate restart.
setShutdownHandler(() => {
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
  startConsoleInput();
});