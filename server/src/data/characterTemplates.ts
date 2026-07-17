import { StatName } from "./statDefinitions";

/**
 * Default stats for a brand-new player - used by playerStore.ts's
 * loadPlayer() fallback (when no saved data exists for a username yet)
 * and by OverworldRoom.onJoin() for the fields playerStore doesn't
 * persist at all yet (hp/maxHp - see SPEC.md Section 10's "hp/maxHp
 * aren't persisted" TODO).
 *
 * `stats` must cover every key in data/statDefinitions.ts's STAT_NAMES -
 * these are base values for the Core Stats System's StatsComponent
 * (strength/dexterity/willpower/charisma/luck), not an independent shape.
 *
 * NOTE: an earlier draft of this file used a 3-stat placeholder shape
 * (strength/dexterity/armor) that didn't match StatsComponent at all -
 * "armor" isn't a StatsComponent field and wasn't consumed by anything,
 * which caused a real type mismatch (and, via playerStore.ts's matching
 * SavedPlayerData shape, a runtime crash once StatsComponent was wired
 * up as the real stats.setBase/getBase implementation). Fixed here by
 * aligning with the actual 5 Core Stats. If/when armor (or any other
 * mitigation stat) becomes real, add it to STAT_NAMES/StatsComponent
 * first, then it can be added here too.
 */
export const DEFAULT_CHARACTER_TEMPLATE: {
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  stats: Record<StatName, number>;
} = {
  level: 1,
  xp: 0,
  hp: 100,
  maxHp: 100,
  stats: {
    strength: 10,
    dexterity: 10,
    willpower: 10,
    charisma: 10,
    luck: 10,
  },
};