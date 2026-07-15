/**
 * NPC/mob definitions - the "real mob table" npcFactory.ts's old comment
 * said would replace the hardcoded name pool once combat/loot got built
 * out. Each template is everything needed to spawn one kind of NPC;
 * npcFactory.ts's createHostileMob() reads from here instead of holding
 * any of these values itself.
 */
export interface NpcTemplate {
  /** Stable lookup key - used by npcFactory.ts, never shown to players. */
  id: string;
  /** Display-name pool; one is picked at random each time this template spawns. */
  names: string[];
  level: number;
  hp: number;
  maxHp: number;
  isHostile: boolean;
  stats: Record<string, number>;
  /** Matches Npc schema's `behavior` field - "static" until patrol/aggro AI exists. */
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
    stats: { power: 5 },
    behavior: "static",
  },
];