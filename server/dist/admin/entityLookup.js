"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findPlayerByIdentifier = findPlayerByIdentifier;
exports.findNpcByIdentifier = findNpcByIdentifier;
/**
 * Shared "find a player by sessionId, their own id, OR username" helper
 * used by every command that targets a specific player (/ban, /kick,
 * /kill, /givexp).
 *
 * Lookup order:
 *  1. Exact `sessionId` match (the MapSchema key) - what typing a raw
 *     session id has always matched.
 *  2. The player's own `id` field (UUID v7) - new, so admins can also
 *     reference the forward-compatible identity string if they ever have
 *     a reason to (e.g. copied from a log line).
 *  3. Case-insensitive username scan - unchanged from before.
 */
function findPlayerByIdentifier(room, identifier) {
    const bySessionId = room.state.players.get(identifier);
    if (bySessionId)
        return { player: bySessionId, sessionId: identifier };
    const idLower = identifier.toLowerCase();
    let result;
    room.state.players.forEach((player, sessionId) => {
        if (result)
            return;
        if (player.id?.toLowerCase() === idLower || player.username.toLowerCase() === idLower) {
            result = { player, sessionId };
        }
    });
    return result;
}
/**
 * Same idea as findPlayerByIdentifier, but for NPCs (id or name). NPCs
 * don't have a separate "session" concept - `npc.id` (UUID v7, generated
 * in npcFactory.ts) IS the `state.npcs` MapSchema key, so this stays a
 * single-object lookup, no split needed the way players' now is.
 */
function findNpcByIdentifier(room, identifier) {
    const byId = room.state.npcs.get(identifier);
    if (byId)
        return byId;
    const idLower = identifier.toLowerCase();
    let found;
    room.state.npcs.forEach((npc) => {
        if (!found && npc.name.toLowerCase() === idLower) {
            found = npc;
        }
    });
    return found;
}
