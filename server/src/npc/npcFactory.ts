import { Npc } from "../rooms/schema/Npc";
import { isWalkable, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from "../map/mapData";

let nextNpcId = 1;

// Purely cosmetic name pool for now - swap for a real mob table when
// combat/loot get built out.
const HOSTILE_MOB_NAMES = ["Slime", "Goblin", "Wild Boar", "Feral Wolf"];

/** Creates a basic hostile mob at the given pixel position. Static/no-AI for MVP. */
export function createHostileMob(x: number, y: number): Npc {
  const npc = new Npc();
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
export function findRandomWalkableSpawn(maxAttempts = 30): { x: number; y: number } | null {
  for (let i = 0; i < maxAttempts; i++) {
    const tileX = Math.floor(Math.random() * MAP_WIDTH);
    const tileY = Math.floor(Math.random() * MAP_HEIGHT);
    if (isWalkable(tileX, tileY)) {
      return { x: tileX * TILE_SIZE, y: tileY * TILE_SIZE };
    }
  }
  return null;
}
