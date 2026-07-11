import { AdminRoomApi } from "./types";

/**
 * Shared "find a player by username OR sessionId" helper used by every
 * command that targets a specific entity (/ban, /kick, /kill, /givexp).
 * Tries an exact sessionId (MapSchema key) match first, then falls back
 * to a case-insensitive username scan.
 */
export function findPlayerByIdentifier(room: AdminRoomApi, identifier: string): any {
  const byId = room.state.players.get(identifier);
  if (byId) return byId;

  const idLower = identifier.toLowerCase();
  let found: any;
  room.state.players.forEach((player: any) => {
    if (!found && player.username.toLowerCase() === idLower) {
      found = player;
    }
  });
  return found;
}

/** Same idea as findPlayerByIdentifier, but for NPCs (id or name). */
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