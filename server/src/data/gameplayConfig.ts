/**
 * Tunable numbers for core movement/collision/NPC-spawn mechanics.
 * OverworldRoom.ts reads from here instead of holding these as its own
 * top-of-file constants - keeps every "why is this number what it is"
 * question answerable by looking in one place, and matches the ECS
 * requirement that mechanics files contain no hardcoded data.
 *
 * NOTE: client/src/network/PredictedMovement.ts still hardcodes its own
 * copy of `moveSpeed` (as PREDICTED_MOVE_SPEED) and the tick rate (as
 * FIXED_STEP_MS) - this is the same accepted client/server duplication
 * trade-off SPEC.md already documents for map data and collision math,
 * left untouched in this phase for the same reason mapData.ts's client
 * copy was left untouched (see that file's comment).
 */
export const GAMEPLAY_CONFIG = {
  /** Pixels per second, both axes combined (diagonal movement is normalized). */
  moveSpeed: 120,
  /** Server simulation tick rate, in milliseconds (20Hz). */
  simulationTickMs: 1000 / 20,
  /**
   * Milliseconds between checks of every designated NPC spawn point (see
   * data/npcSpawnPoints.ts + NpcSpawnSystem.ts). Temporary test-harness
   * cadence - the final game triggers spawning per-zone/per-point, not
   * on a single global timer.
   */
  npcSpawnCheckIntervalMs: 10000,
  /** Multiplied by TILE_SIZE to get the NPC "bump" contact radius. */
  npcContactRadiusRatio: 0.6,
  /** Minimum ms between repeated npc-contact broadcasts for the same player. */
  npcContactCooldownMs: 1000,
  /** Multiplied by TILE_SIZE for the AABB-style corner-check collision box half-width. */
  collisionHalfWidthRatio: 0.35,
  /** Multiplied by TILE_SIZE - how close an existing NPC must be to a spawn point to count as "occupying" it. */
  spawnPointOccupancyRadiusRatio: 2,
};