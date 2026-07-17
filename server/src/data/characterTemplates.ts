/**
 * Default stats for a brand-new player - used by playerStore.ts's
 * loadPlayer() fallback (when no saved data exists for a username yet)
 * and by OverworldRoom.onJoin() for the fields playerStore doesn't
 * persist at all yet (hp/maxHp - see SPEC.md Section 10's "hp/maxHp
 * aren't persisted" TODO).
 *
 * Combat MVP (v0.9): the old placeholder "power" stat is replaced with
 * three real combat stats - strength (unarmed/STR-weapon damage
 * scaling), dexterity (crit chance scaling, and future DEX-weapon
 * damage scaling), and armor (damage mitigation - see
 * data/combatConfig.ts for the full formula).
 */
export const DEFAULT_CHARACTER_TEMPLATE = {
  level: 1,
  xp: 0,
  hp: 100,
  maxHp: 100,
  stats: {
    strength: 10,
    dexterity: 10,
    armor: 5,
  },
};