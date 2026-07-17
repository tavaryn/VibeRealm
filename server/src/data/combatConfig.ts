/**
 * Tunable numbers for the minimal melee-combat slice (CombatSystem.ts).
 * Deliberately small/MVP-flavored - the full "Combat MVP" roadmap item
 * (SPEC.md Section 6, #1) will likely expand this file substantially
 * (per-weapon damage, skill costs, ranged attacks, PvP rules) once it's
 * tackled as its own feature.
 */
export const COMBAT_CONFIG = {
  /** Multiplied by TILE_SIZE to get the max melee attack distance. */
  meleeRangeRatio: 1.5,
  /** Minimum ms between a single session's attacks. */
  attackCooldownMs: 1000,
  /** Flat damage floor before the Strength scaling is added. */
  baseDamage: 5,
  /** Additional damage per point of effective Strength. */
  strengthDamageMultiplier: 0.5,
  /** XP granted to the attacker when their attack kills an NPC. */
  xpPerNpcKill: 25,
};
