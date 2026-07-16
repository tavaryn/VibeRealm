// server/src/npc/npcFactory.ts
import { Npc } from "../rooms/schema/Npc";
import { generateId } from "../utils/generateId";
import { NPC_TEMPLATES } from "../data/npcTemplates";
import { STAT_NAMES } from "../data/statDefinitions";

/**
 * Creates a basic hostile mob at the given pixel position, built entirely
 * from the "hostile_basic" template in data/npcTemplates.ts. Sets base
 * Core Stats values from the template - does NOT register with
 * StatsSystem itself (this factory has no ECS system references by
 * design; that's NpcSpawnSystem.spawnAt's job, right after the NPC is
 * added to state.npcs).
 */
export function createHostileMob(x: number, y: number): Npc {
  const template = NPC_TEMPLATES.find((t) => t.id === "hostile_basic")!;

  const npc = new Npc();
  npc.id = generateId("npc");
  npc.name = template.names[Math.floor(Math.random() * template.names.length)];
  npc.level = template.level;
  npc.hp = template.hp;
  npc.maxHp = template.maxHp;
  npc.isHostile = template.isHostile;
  npc.x = x;
  npc.y = y;
  STAT_NAMES.forEach((stat) => npc.stats.setBase(stat, template.stats[stat]));
  npc.behavior = template.behavior;
  return npc;
}