import { Schema, type } from "@colyseus/schema";

/**
 * Player schema - core per-player synced state.
 *
 * `hp`/`maxHp` are groundwork for the Combat MVP (SPEC.md roadmap #2) -
 * not consumed by any combat logic yet, but the Targeting System's HUD
 * needs them to render a target's HP bar, and `Npc` already has them, so
 * adding them here now keeps the two schemas symmetric.
 *
 * `targetId`/`targetType` are new for the Targeting System. They ARE
 * synced (rather than kept server-only) so any client could eventually
 * show "who is targeting whom" (e.g. a marker above a player being
 * targeted by someone else). Today only the local player's own target is
 * consumed client-side, to drive the target HUD frame.
 */
export class Player extends Schema {
  @type("string") id = "";
  @type("string") username = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") level = 1;
  @type("number") xp = 0;
  @type("number") hp = 100;
  @type("number") maxHp = 100;
  @type({ map: "number" }) stats = new Map<string, number>();

  // "" = no target. Empty string instead of null/undefined since Schema
  // string fields don't support null, and it keeps client checks simple
  // (`if (player.targetId) { ... }`).
  @type("string") targetId = "";
  // "player" | "npc" | "" (no target). Plain string rather than an enum
  // type for Schema-encoding simplicity; validated server-side in
  // OverworldRoom before ever being set.
  @type("string") targetType = "";

  // Server-only movement input flags, never synced to clients.
  inputUp = false;
  inputDown = false;
  inputLeft = false;
  inputRight = false;
}
