// server/src/rooms/schema/Player.ts
import { Schema, type } from "@colyseus/schema";
import { StatsComponent } from "./StatsComponent";

/**
 * Player schema - core per-player synced state.
 *
 * `id` is a UUID v7 (see server/src/utils/generateId.ts) - a stable,
 * forward-compatible identity string, deliberately NOT the same value as
 * this player's Colyseus `client.sessionId` (which remains the actual
 * `state.players` MapSchema key - see OverworldRoom.onJoin).
 *
 * `hp`/`maxHp` are groundwork for the Combat MVP - not consumed by any
 * combat logic yet, but the Targeting System's HUD needs them.
 *
 * `stats` is the Core Stats System (Strength/Dexterity/Willpower/
 * Charisma/Luck) - see StatsComponent.ts and
 * ecs/systems/StatsSystem.ts for the full design. Base values are set on
 * join (from persistence or character defaults); effective values are
 * kept in sync by StatsSystem whenever a modifier is added/removed.
 *
 * `targetId`/`targetType` are for the Targeting System - synced so any
 * client could eventually show "who is targeting whom."
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

  @type(StatsComponent) stats = new StatsComponent();

  // "" = no target. Empty string instead of null/undefined since Schema
  // string fields don't support null, and it keeps client checks simple
  // (`if (player.targetId) { ... }`).
  @type("string") targetId = "";
  @type("string") targetType = "";

  // Server-only movement input flags, never synced to clients.
  inputUp = false;
  inputDown = false;
  inputLeft = false;
  inputRight = false;
}