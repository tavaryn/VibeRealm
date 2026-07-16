// server/src/data/npcTemplates.ts
import { StatName } from "./statDefinitions";

/**
 * NPC/mob definitions. Each template is everything needed to spawn one
 * kind of NPC; npcFactory.ts's createHostileMob() reads from here
 * instead of holding any of these values itself.
 *
 * `stats` are Core Stats System base values for this mob type - read by
 * npcFactory.ts into the NPC's StatsComponent at spawn time, then
 * registered with StatsSystem (see NpcSpawnSystem.spawnAt) so future
 * combat/AI can apply modifiers (enrage buffs, debuffs from player
 * skills, etc.) the same way equipment/buffs work for players.
 */
export interface NpcTemplate {
  id: string;
  names: string[];
  level: number;
  hp: number;
  maxHp: number;
  isHostile: boolean;
  stats: Record<StatName, number>;
  behavior: string;
}

export const NPC_TEMPLATES: NpcTemplate[] = [
  {
    id: "hostile_basic",
    names: ["Slime", "Goblin", "Wild Boar", "Feral Wolf"],
    level: 1,
    hp: 20,
    maxHp: 20,
    isHostile: true,
    stats: {
      strength: 8,
      dexterity: 6,
      willpower: 4,
      charisma: 2,
      luck: 5,
    },
    behavior: "static",
  },
];