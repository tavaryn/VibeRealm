/**
 * Default stats for a brand-new player - used by playerStore.ts's
 * loadPlayer() fallback (when no saved data exists for a username yet)
 * and by OverworldRoom.onJoin() for the fields playerStore doesn't
 * persist at all yet (hp/maxHp - see SPEC.md Section 10's "hp/maxHp
 * aren't persisted" TODO).
 */
export const DEFAULT_CHARACTER_TEMPLATE = {
  level: 1,
  xp: 0,
  hp: 100,
  maxHp: 100,
  stats: {
    power: 10,
  },
};