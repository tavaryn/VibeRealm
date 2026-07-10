import { TILE_SIZE, isWalkable } from "../map/mapData";
import type { MoveInput } from "./NetworkManager";

/**
 * Client-side mirror of the server's authoritative movement/collision math
 * (server/src/rooms/OverworldRoom.ts: tryMove / isPositionWalkable). This
 * is used ONLY to *predict* the local player's movement one frame ahead of
 * server confirmation, for responsive-feeling controls - the server
 * remains the sole source of truth, and GameScene corrects any drift
 * between this prediction and the server's real position (see
 * GameScene.reconcileFromAck / applyServerCorrection).
 *
 * IMPORTANT: must be kept in sync with the server's constants and
 * collision logic, the same way mapData.ts already must be (see SPEC.md
 * Section 4). If MOVE_SPEED, the tick rate, or the collision box ever
 * change on the server, mirror the change here too, or prediction will
 * systematically drift and constantly fight the correction.
 */
export const PREDICTED_MOVE_SPEED = 120; // px/sec - must match server MOVE_SPEED
export const FIXED_STEP_MS = 1000 / 20; // must match server SIMULATION_TICK_MS (20Hz)

// Mirrors OverworldRoom.isPositionWalkable's corner-check collision box.
function isPositionWalkable(x: number, y: number): boolean {
  const half = TILE_SIZE * 0.35;
  const corners: [number, number][] = [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ];
  return corners.every(([cx, cy]) =>
    isWalkable(Math.floor(cx / TILE_SIZE), Math.floor(cy / TILE_SIZE))
  );
}

/**
 * Advances a position by one simulation step given input flags and dt
 * (seconds), using the same axis-separated movement as the server so
 * sliding along a wall behaves identically.
 *
 * NOTE: unlike the server, this does NOT check NPC collision - NPCs are
 * not predicted client-side. Accepted MVP trade-off: bumping into an NPC
 * may show a brief, small visual correction once the server's next
 * position update arrives, since all NPCs are currently static/rare
 * enough that this is a minor blip rather than a real feel problem.
 * Worth revisiting once NPC AI (patrol/chase) makes NPCs common obstacles.
 */
export function simulateMove(
  x: number,
  y: number,
  input: MoveInput,
  dt: number
): { x: number; y: number } {
  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;

  if (dx === 0 && dy === 0) return { x, y };

  // Normalize so diagonal movement isn't faster than cardinal movement -
  // mirrors the server's tryMove exactly.
  const len = Math.sqrt(dx * dx + dy * dy);
  dx = (dx / len) * PREDICTED_MOVE_SPEED * dt;
  dy = (dy / len) * PREDICTED_MOVE_SPEED * dt;

  let nextX = x;
  let nextY = y;

  const tryX = x + dx;
  if (isPositionWalkable(tryX, y)) nextX = tryX;

  const tryY = y + dy;
  if (isPositionWalkable(nextX, tryY)) nextY = tryY;

  return { x: nextX, y: nextY };
}