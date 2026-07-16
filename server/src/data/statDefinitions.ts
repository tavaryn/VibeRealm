// server/src/data/statDefinitions.ts
/**
 * Core Stats System - shared type definitions. This is the single place
 * that defines "what stats exist" - StatsComponent, StatsSystem,
 * characterTemplates.ts, npcTemplates.ts, and playerStore.ts all key off
 * STAT_NAMES/StatName rather than hardcoding the list of 5 stats
 * themselves, so adding a 6th stat later is a one-line change here plus
 * a new pair of fields on StatsComponent.
 */
export type StatName = "strength" | "dexterity" | "willpower" | "charisma" | "luck";

export const STAT_NAMES: readonly StatName[] = [
  "strength",
  "dexterity",
  "willpower",
  "charisma",
  "luck",
];

/**
 * A single stat modifier from some source (a weapon, a piece of armor, a
 * buff/debuff, a future skill, etc.). Server-only - never synced to
 * clients directly; only the resulting *effective* stat value is synced
 * (see StatsComponent). Kept generic/data-driven so new modifier sources
 * never require a StatsSystem code change.
 *
 * `id` should be a STABLE identifier chosen by whatever is applying the
 * modifier - e.g. an equipment slot name like "weapon" or "chest", or a
 * buff name like "haste_potion". Re-adding a modifier with the same id
 * replaces the previous one (see StatsSystem.addModifier), which is
 * exactly the semantics equip/unequip and buff-refresh both want.
 */
export interface StatModifier {
  id: string;
  stat: StatName;
  /** "flat" = a flat +/- amount added to base before percent modifiers apply.
   *  "percent" = a fraction (0.1 = +10%) applied to (base + all flat modifiers). */
  type: "flat" | "percent";
  value: number;
  /** Human-readable origin, shown in admin tooling (e.g. "Iron Sword", "Haste Potion"). */
  source: string;
  /** Epoch ms when this modifier should expire. Omit for permanent modifiers (equipment). */
  expiresAt?: number;
}