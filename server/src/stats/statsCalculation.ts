// server/src/stats/statsCalculation.ts
import { StatModifier, StatName } from "../data/statDefinitions";

/**
 * Pure calculation function - the one place "how do modifiers combine"
 * is decided, so future combat/damage formulas (and StatsSystem, and any
 * future unit tests) all agree on the same math.
 *
 * Order of operations (standard MMORPG convention): sum all flat
 * modifiers for the stat and add to base first, THEN apply the sum of
 * all percent modifiers to that total. Result is clamped at 0 (a
 * heavily-debuffed stat can't go negative) and rounded to 2 decimal
 * places to avoid accumulating floating-point dust across many
 * modifiers.
 */
export function calculateEffectiveStat(
  base: number,
  modifiers: readonly StatModifier[],
  stat: StatName
): number {
  const relevant = modifiers.filter((m) => m.stat === stat);

  const flatSum = relevant
    .filter((m) => m.type === "flat")
    .reduce((sum, m) => sum + m.value, 0);

  const percentSum = relevant
    .filter((m) => m.type === "percent")
    .reduce((sum, m) => sum + m.value, 0);

  const raw = (base + flatSum) * (1 + percentSum);
  const clamped = Math.max(0, raw);
  return Math.round(clamped * 100) / 100;
}