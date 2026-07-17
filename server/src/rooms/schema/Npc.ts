import { Schema, type } from "@colyseus/schema";

/**
 * NPC schema. `targetId`/`targetType` are intentionally NOT @type-decorated
 * (see class comment history) - zero sync cost, ready for future AI.
 *
 * `xpReward` (new, Combat MVP v0.9) is also server-only/unsynced - clients
 * never need to see it, they just receive the resulting level-up
 * broadcast when CombatSystem grants it to the killer. Set at spawn time
 * from the NPC's template (see npcFactory.ts / data/npcTemplates.ts).
 *
 * `stats` now carries "strength"/"dexterity"/"armor" (Combat MVP v0.9),
 * mirroring Player.stats, replacing the old placeholder "power" key.
 */
export class Npc extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") level = 1;
  @type("number") hp = 50;
  @type("number") maxHp = 50;
  @type("boolean") isHostile = true;
  @type({ map: "number" }) stats = new Map<string, number>();
  @type("string") behavior = "static";

  // Server-only, unsynced:
  targetId = "";
  targetType: "player" | "npc" | "self" | "" = "";
  /** XP granted to whoever lands the killing blow - Combat MVP (v0.9). */
  xpReward = 0;
}