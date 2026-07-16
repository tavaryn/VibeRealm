import { Npc } from "../rooms/schema/Npc";
import { generateId } from "../utils/generateId";
import { NPC_TEMPLATES } from "../data/npcTemplates";

/**
 * Creates a basic hostile mob at the given pixel position, built entirely
 * from the "hostile_basic" template in data/npcTemplates.ts. Static/no-AI
 * for MVP - once more mob variety or AI exists, this is where template
 * selection logic would go, still reading from data/npcTemplates.ts
 * rather than holding any values itself.
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
  return npc;
}