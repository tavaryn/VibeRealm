"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHostileMob = createHostileMob;
exports.findRandomWalkableSpawn = findRandomWalkableSpawn;
const Npc_1 = require("../rooms/schema/Npc");
const mapData_1 = require("../map/mapData");
let nextNpcId = 1;
// Purely cosmetic name pool for now - swap for a real mob table when
// combat/loot get built out.
const HOSTILE_MOB_NAMES = ["Slime", "Goblin", "Wild Boar", "Feral Wolf"];
/** Creates a basic hostile mob at the given pixel position. Static/no-AI for MVP. */
function createHostileMob(x, y) {
    const npc = new Npc_1.Npc();
    npc.id = `npc_${nextNpcId++}`;
    npc.name = HOSTILE_MOB_NAMES[Math.floor(Math.random() * HOSTILE_MOB_NAMES.length)];
    npc.level = 1;
    npc.hp = 20;
    npc.maxHp = 20;
    npc.isHostile = true;
    npc.x = x;
    npc.y = y;
    npc.stats.set("power", 5);
    npc.behavior = "static"; // TODO: patrol/aggro AI later
    return npc;
}
/**
 * Finds a random walkable tile's pixel position (top-left corner, matching
 * the convention used everywhere else in this codebase - see Player spawn
 * in OverworldRoom.onJoin). Retries a handful of times in case the random
 * roll lands on a wall tile. Returns null if nothing walkable was found
 * after maxAttempts, which shouldn't happen on the current map but keeps
 * this safe if the map changes later.
 */
function findRandomWalkableSpawn(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        const tileX = Math.floor(Math.random() * mapData_1.MAP_WIDTH);
        const tileY = Math.floor(Math.random() * mapData_1.MAP_HEIGHT);
        if ((0, mapData_1.isWalkable)(tileX, tileY)) {
            return { x: tileX * mapData_1.TILE_SIZE, y: tileY * mapData_1.TILE_SIZE };
        }
    }
    return null;
}
