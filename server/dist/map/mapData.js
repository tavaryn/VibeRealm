"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tileMap = exports.MAP_HEIGHT = exports.MAP_WIDTH = exports.TILE_SIZE = void 0;
exports.isWalkable = isWalkable;
/**
 * Static overworld map for the MVP. 0 = walkable, 1 = wall/obstacle.
 *
 * NOTE: This is duplicated in client/src/map/mapData.ts so the client can
 * render tiles without waiting on a network round trip. For the MVP that's
 * an acceptable trade-off; once maps become dynamic or numerous, move this
 * into a shared package (or have the server send map data on room join).
 */
exports.TILE_SIZE = 32;
exports.MAP_WIDTH = 30;
exports.MAP_HEIGHT = 30;
exports.tileMap = generateMap();
function generateMap() {
    const map = [];
    for (let y = 0; y < exports.MAP_HEIGHT; y++) {
        const row = [];
        for (let x = 0; x < exports.MAP_WIDTH; x++) {
            const isBorder = x === 0 || y === 0 || x === exports.MAP_WIDTH - 1 || y === exports.MAP_HEIGHT - 1;
            row.push(isBorder ? 1 : 0);
        }
        map.push(row);
    }
    // A handful of scattered obstacles so movement/collision is visibly testable.
    const obstacles = [
        [5, 5], [6, 5], [7, 5],
        [10, 12], [11, 12],
        [15, 16], [16, 16],
        [20, 8], [21, 8], [22, 9],
        [12, 20], [13, 20], [14, 20],
        [25, 25], [25, 26],
    ];
    for (const [ox, oy] of obstacles) {
        if (map[oy] && map[oy][ox] !== undefined)
            map[oy][ox] = 1;
    }
    return map;
}
function isWalkable(tileX, tileY) {
    if (tileY < 0 || tileY >= exports.MAP_HEIGHT || tileX < 0 || tileX >= exports.MAP_WIDTH)
        return false;
    return exports.tileMap[tileY][tileX] === 0;
}
