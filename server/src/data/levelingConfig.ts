/**
 * Tunable numbers for the leveling system. util/leveling.ts's
 * xpForNextLevel() and OverworldRoom's passive-XP timer both read from
 * here instead of hardcoding their own values.
 */
export const LEVELING_CONFIG = {
  /** xpForNextLevel(level) = level * this. */
  xpPerLevelMultiplier: 100,
  /** XP granted per passive tick while connected. */
  passiveXpAmount: 5,
  /** Milliseconds between passive XP ticks. */
  passiveXpIntervalMs: 25000,
};