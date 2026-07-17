import { Npc } from "../rooms/schema/Npc";
import { generateId } from "../utils/generateId";
import { NPC_TEMPLATES } from "../data/npcTemplates";
import { STAT_NAMES, StatName } from "../data/statDefinitions";

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
  // Only set recognized Core Stats System keys (StatsComponent only has
  // strength/dexterity/willpower/charisma/luck - see data/statDefinitions.ts).
  // NOTE: npcTemplates.ts's "armor" key isn't part of StatsComponent yet
  // and is currently unused by CombatSystem's damage formula - it's
  // silently skipped here rather than thrown on. If/when armor becomes a
  // real mitigation stat, add it to STAT_NAMES/StatsComponent first.
  Object.entries(template.stats).forEach(([key, value]) => {
    if ((STAT_NAMES as readonly string[]).includes(key)) {
      npc.stats.setBase(key as StatName, value);
    }
  });
  npc.behavior = template.behavior;
  npc.xpReward = template.xpReward; // Combat MVP (v0.9)
  return npc;
}