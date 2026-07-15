"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setActiveRoom = setActiveRoom;
exports.getActiveRoom = getActiveRoom;
exports.setShutdownHandler = setShutdownHandler;
exports.requestShutdown = requestShutdown;
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
let activeRoom = null;
let shutdownHandler = null;
function setActiveRoom(room) {
    activeRoom = room;
}
function getActiveRoom() {
    return activeRoom;
}
function setShutdownHandler(fn) {
    shutdownHandler = fn;
}
function requestShutdown() {
    if (shutdownHandler) {
        shutdownHandler();
    }
    else {
        console.warn("[admin] Shutdown requested but no shutdown handler is registered - exiting immediately.");
        process.exit(0);
    }
}
