import { v7 as uuidv7 } from "uuid";

/**
 * Central ID-generation helper for every server-created entity (players,
 * NPCs, and anything else added later). Replaces the old approach of
 * reusing Colyseus's `client.sessionId` as a player's "id" and whatever
 * ad-hoc scheme `npcFactory.ts` used for NPC ids.
 *
 * Why UUID v7:
 * - Time-ordered: a millisecond timestamp is embedded in the most
 *   significant bits, so ids sort naturally by creation time (handy in
 *   logs, admin output, and eventually database indexes) without a
 *   separate `createdAt` column.
 * - Globally unique without a shared counter: no coordination needed if
 *   VibeRealm ever runs multiple rooms/processes (future dungeon
 *   instances, horizontal scaling) - unlike an in-memory incrementing
 *   counter.
 * - Decoupled from `client.sessionId`: sessionId is tied to a single live
 *   WebSocket connection and is regenerated every reconnect. A UUID v7
 *   `id` field is a much better foundation for a *stable* per-account
 *   identity once real accounts/auth exist (SPEC.md Roadmap #10) - the
 *   room still uses `client.sessionId` as the MapSchema key internally
 *   (Colyseus needs that for client.leave()/broadcast targeting), but the
 *   `id` field becomes a forward-compatible, database-friendly primary
 *   key that isn't tangled up with the transport layer.
 *
 * NOTE: `id` is currently regenerated fresh on every join (same
 * ephemerality as `sessionId` was) since there's no persisted per-account
 * id yet in playerStore.ts's players.json - see the SPEC.md note this
 * change adds under Section 10 for the natural follow-up once accounts
 * exist.
 *
 * The optional prefix (e.g. "player", "npc") is purely for human
 * readability in logs/admin command output - it is NOT parsed or relied
 * on anywhere, so it's safe to omit or change later without breaking
 * anything.
 */
export function generateId(prefix?: string): string {
  const id = uuidv7();
  return prefix ? `${prefix}_${id}` : id;
}
