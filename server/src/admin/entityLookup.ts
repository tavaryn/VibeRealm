import { AdminRoomApi } from "./types";

/**
 * Result of a player lookup: the Schema instance itself, plus the
 * Colyseus `sessionId` it's stored under in `state.players` (the
 * MapSchema key). These are no longer guaranteed to be the same string -
 * see server/src/utils/generateId.ts and OverworldRoom.onJoin for why
 * `player.id` is now an independent UUID v7 instead of a copy of
 * `sessionId`. Callers that need to find the *live WebSocket client*
 * (kick/ban/kill) must use `sessionId`, not `player.id`.
 */
export interface PlayerLookupResult {
  player: any;
  sessionId: string;
}

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
export function findPlayerByIdentifier(
  room: AdminRoomApi,
  identifier: string
): PlayerLookupResult | undefined {
  const bySessionId = room.state.players.get(identifier);
  if (bySessionId) return { player: bySessionId, sessionId: identifier };

  const idLower = identifier.toLowerCase();
  let result: PlayerLookupResult | undefined;
  room.state.players.forEach((player: any, sessionId: string) => {
    if (result) return;
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
export function findNpcByIdentifier(room: AdminRoomApi, identifier: string): any {
  const byId = room.state.npcs.get(identifier);
  if (byId) return byId;

  const idLower = identifier.toLowerCase();
  let found: any;
  room.state.npcs.forEach((npc: any) => {
    if (!found && npc.name.toLowerCase() === idLower) {
      found = npc;
    }
  });
  return found;
}