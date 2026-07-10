import { Schema, type } from "@colyseus/schema";

/**
 * NPC schema. `targetId`/`targetType` are intentionally NOT @type-decorated:
 * per the Targeting System requirements, NPC targets don't need client-side
 * display yet, so keeping them as plain (unsynced) server-side fields costs
 * zero sync bandwidth. They're still fully server-authoritative from day
 * one and ready for future aggro/chase AI to read/write - see SPEC.md
 * roadmap #3 - without any schema migration when that AI is built.
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

  // Server-only, unsynced - see class comment above. "self" is included
  // in the union now so a future AI state machine can represent an NPC
  // idling/guarding its own spawn point without a special-case value.
  targetId = "";
  targetType: "player" | "npc" | "self" | "" = "";
}
