/**
 * Shared by OverworldRoom's passive-XP tick AND the /givexp admin command
 * (server/src/admin/commands.ts), so both compute the level-up threshold
 * identically. Pulled out specifically so the admin module doesn't need to
 * import OverworldRoom itself (see the note in admin/types.ts).
 */
export function xpForNextLevel(level: number): number {
  return level * 100;
}