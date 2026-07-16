// server/src/data/characterTemplates.ts
import { StatName } from "./statDefinitions";

/**
 * Default stats for a brand-new player - used by playerStore.ts's
 * loadPlayer() fallback (when no saved data exists for a username yet)
 * and by OverworldRoom.onJoin() for the fields playerStore doesn't
 * persist at all yet (hp/maxHp).
 *
 * `stats` are the Core Stats System's base values for a fresh character
 * - flat 10s across the board for MVP (no classes/archetypes yet). Once
 * character creation/classes exist, this is the natural place to branch
 * into per-class starting stat spreads.
 */
export const DEFAULT_CHARACTER_TEMPLATE = {
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
  } as Record<StatName, number>,
};