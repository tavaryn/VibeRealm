// server/src/rooms/schema/Npc.ts
import { Schema, type } from "@colyseus/schema";
import { StatsComponent } from "./StatsComponent";

/**
 * NPC schema. `targetId`/`targetType` are intentionally NOT @type-decorated:
 * NPC targets don't need client-side display yet, so keeping them as
 * plain (unsynced) server-side fields costs zero sync bandwidth. They're
 * still fully server-authoritative and ready for future aggro/chase AI.
 *
 * `stats` mirrors Player's Core Stats System - see StatsComponent.ts and
 * ecs/systems/StatsSystem.ts. Base values are set from the NPC's
 * template (data/npcTemplates.ts) at spawn time.
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
  @type(StatsComponent) stats = new StatsComponent();
  @type("string") behavior = "static";

  // Server-only, unsynced - see class comment above.
  targetId = "";
  targetType: "player" | "npc" | "self" | "" = "";
}