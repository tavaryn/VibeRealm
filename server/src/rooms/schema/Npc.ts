import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * Generic NPC/mob state, synced the same way Player is - Colyseus diffs
 * this automatically so clients only receive changes, not full snapshots.
 *
 * `behavior` is a placeholder for future AI (e.g. "patrol", "aggro",
 * "flee"). NPCs are static for the MVP - the field exists now so adding
 * real AI later doesn't require another schema change.
 */
export class Npc extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "Mob";
  @type("number") level: number = 1;
  @type("number") hp: number = 10;
  @type("number") maxHp: number = 10;
  @type("boolean") isHostile: boolean = false;
  @type("number") x: number = 0;
  @type("number") y: number = 0;

  // Extensible stat block, same pattern as Player.stats.
  @type({ map: "number" }) stats = new MapSchema<number>();

  // Future AI hook - unused for now beyond being informational.
  @type("string") behavior: string = "static";
}
