"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHostileMob = createHostileMob;
exports.findRandomWalkableSpawn = findRandomWalkableSpawn;
const Npc_1 = require("../rooms/schema/Npc");
const mapData_1 = require("../data/mapData");
const generateId_1 = require("../utils/generateId");
const npcTemplates_1 = require("../data/npcTemplates");
/**
 * Creates a basic hostile mob at the given pixel position, built entirely
 * from the "hostile_basic" template in data/npcTemplates.ts. Static/no-AI
 * for MVP - once more mob variety or AI exists, this is where template
 * selection logic (by area, level range, etc.) would go, still reading
 * from data/npcTemplates.ts rather than holding any values itself.
 */
function createHostileMob(x, y) {
    const template = npcTemplates_1.NPC_TEMPLATES.find((t) => t.id === "hostile_basic");
    const npc = new Npc_1.Npc();
    // UUID v7 (see server/src/utils/generateId.ts) - globally unique with no
    // shared counter to coordinate, so it stays safe if VibeRealm ever
    // spawns NPCs from more than one room/process (future dungeon
    // instances). This IS the state.npcs MapSchema key too (see
    // OverworldRoom.spawnRandomHostileMob) - NPCs don't have the
    // player/sessionId split, since they're not tied to a live connection.
    npc.id = (0, generateId_1.generateId)("npc");
    npc.name = template.names[Math.floor(Math.random() * template.names.length)];
    npc.level = template.level;
    npc.hp = template.hp;
    npc.maxHp = template.maxHp;
    npc.isHostile = template.isHostile;
    npc.x = x;
    npc.y = y;
    Object.entries(template.stats).forEach(([key, value]) => npc.stats.set(key, value));
    npc.behavior = template.behavior;
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
