import { Npc } from "../rooms/schema/Npc";
import { generateId } from "../utils/generateId";
import { NPC_TEMPLATES } from "../data/npcTemplates";

/**
 * Creates a basic hostile mob at the given pixel position, built entirely
 * from the "hostile_basic" template in data/npcTemplates.ts. Static/no-AI
 * for MVP.
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
  Object.entries(template.stats).forEach(([key, value]) => npc.stats.set(key, value));
  npc.behavior = template.behavior;
  npc.xpReward = template.xpReward; // Combat MVP (v0.9)
  return npc;
}