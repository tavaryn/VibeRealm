import { Schema, type } from "@colyseus/schema";

/**
 * Player schema - core per-player synced state.
 *
 * `id` is a UUID v7 (see server/src/utils/generateId.ts) - independent of
 * this player's Colyseus `client.sessionId` (see OverworldRoom.onJoin).
 *
 * `hp`/`maxHp` are consumed by Combat MVP (v0.9) via CombatSystem, and by
 * the Targeting System's HUD (target HP bar).
 *
 * `targetId`/`targetType` are for the Targeting System - synced so any
 * client could eventually show "who is targeting whom."
 *
 * `isAttacking` (new, Combat MVP v0.9) is the server-confirmed auto-attack
 * toggle - set true/false via the "attack" message, consumed every tick
 * by CombatSystem. Synced (rather than kept server-only) so any client
 * can see an attacker's state (e.g. for a future attack animation), and
 * so the local client's own Attack button reflects the server's
 * authoritative confirmation rather than an optimistic guess - same
 * request/validate/echo pattern as targetId/targetType.
 *
 * `stats` now carries "strength"/"dexterity"/"armor" (Combat MVP v0.9),
 * replacing the old placeholder "power" key - see data/characterTemplates.ts.
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
  // string fields don't support null.
  @type("string") targetId = "";
  // "player" | "npc" | "" (no target).
  @type("string") targetType = "";

  // Combat MVP (v0.9): server-confirmed auto-attack toggle.
  @type("boolean") isAttacking = false;

  // Server-only movement input flags, never synced to clients.
  inputUp = false;
  inputDown = false;
  inputLeft = false;
  inputRight = false;
}