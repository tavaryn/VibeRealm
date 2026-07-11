import { AdminRoomApi } from "./types";

/**
 * Tiny module-level registry so admin commands - whether typed at the
 * server console or sent via in-game chat - can reach "the" currently
 * running OverworldRoom and trigger a full server shutdown, without
 * commands.ts/consoleInput.ts needing to import OverworldRoom directly
 * (which would create an import cycle, since OverworldRoom itself needs
 * to register here on creation).
 *
 * VibeRealm only ever runs one persistent overworld room (see SPEC.md
 * Section 3b), so a single module-level reference is sufficient for MVP -
 * this would need to become a lookup-by-room-id if multiple concurrent
 * rooms (e.g. future dungeon instances) ever need admin command support.
 */
let activeRoom: AdminRoomApi | null = null;
let shutdownHandler: (() => void) | null = null;

export function setActiveRoom(room: AdminRoomApi | null) {
  activeRoom = room;
}

export function getActiveRoom(): AdminRoomApi | null {
  return activeRoom;
}

export function setShutdownHandler(fn: () => void) {
  shutdownHandler = fn;
}

export function requestShutdown() {
  if (shutdownHandler) {
    shutdownHandler();
  } else {
    console.warn("[admin] Shutdown requested but no shutdown handler is registered - exiting immediately.");
    process.exit(0);
  }
}