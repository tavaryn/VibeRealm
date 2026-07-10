/**
 * Client copy of the overworld tile map, used only for rendering.
 * MUST stay in sync with server/src/map/mapData.ts - the server is the
 * source of truth for collision. See the note in that file for the
 * plan to de-duplicate this once maps become dynamic.
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
