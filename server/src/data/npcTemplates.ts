/**
 * NPC/mob definitions - npcFactory.ts's createHostileMob() reads from
 * here instead of holding any of these values itself.
 *
 * Combat MVP (v0.9): added strength/dexterity/armor (mirrors Player's
 * stat set, so CombatSystem's damage formula works identically whether
 * an NPC is the attacker or the defender - not consumed as an attacker
 * yet since NPCs don't fight back until NPC AI exists, but the data is
 * ready). Also added xpReward - what CombatSystem grants the killer
 * on a landed killing blow.
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
  /** XP granted to whoever lands the killing blow (Combat MVP). */
  xpReward: number;
}

export const NPC_TEMPLATES: NpcTemplate[] = [
  {
    id: "hostile_basic",
    names: ["Slime", "Goblin", "Wild Boar", "Feral Wolf"],
    level: 1,
    hp: 20,
    maxHp: 20,
    isHostile: true,
    stats: { strength: 5, dexterity: 3, armor: 2 },
    behavior: "static",
    xpReward: 25,
  },
];