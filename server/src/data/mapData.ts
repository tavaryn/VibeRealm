/**
 * Static overworld map for the MVP. 0 = walkable, 1 = wall/obstacle.
 *
 * Part of the server's ECS "data layer" (server/src/data/) - pure static
 * game data, no logic. NOT to be confused with server/data/ (lowercase,
 * one level up from src/) - that's the *runtime* persistence folder
 * (players.json, admins.json, bans.json), a completely different thing
 * that happens to share the word "data".
 *
 * NOTE: This is duplicated in client/src/map/mapData.ts so the client can
 * render tiles without waiting on a network round trip. That client copy
 * is intentionally left where it is for this ECS migration phase (moving
 * it would mean touching client/src/network/PredictedMovement.ts's import
 * too, for a client-only rename with no behavior change) - still a known
 * accepted trade-off per SPEC.md, revisit once maps become dynamic or a
 * shared package exists.
 */
export const TILE_SIZE = 32;
export const MAP_WIDTH = 30;
export const MAP_HEIGHT = 30;

export const tileMap: number[][] = generateMap();

function generateMap(): number[][] {
  const map: number[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      const isBorder = x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1;
      row.push(isBorder ? 1 : 0);
    }
    map.push(row);
  }

  // A handful of scattered obstacles so movement/collision is visibly testable.
  const obstacles: [number, number][] = [
    [5, 5], [6, 5], [7, 5],
    [10, 12], [11, 12],
    [15, 16], [16, 16],
    [20, 8], [21, 8], [22, 9],
    [12, 20], [13, 20], [14, 20],
    [25, 25], [25, 26],
  ];
  for (const [ox, oy] of obstacles) {
    if (map[oy] && map[oy][ox] !== undefined) map[oy][ox] = 1;
  }

  return map;
}

export function isWalkable(tileX: number, tileY: number): boolean {
  if (tileY < 0 || tileY >= MAP_HEIGHT || tileX < 0 || tileX >= MAP_WIDTH) return false;
  return tileMap[tileY][tileX] === 0;
}