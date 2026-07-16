// server/src/ecs/systems/NpcSpawnSystem.ts
import { World } from "../World";
import { StatsSystem } from "./StatsSystem";
import { createHostileMob } from "../../npc/npcFactory";
import { OVERWORLD_NPC_SPAWN_POINTS, NpcSpawnPoint } from "../../data/npcSpawnPoints";
import { GAMEPLAY_CONFIG } from "../../data/gameplayConfig";
import { TILE_SIZE } from "../../data/mapData";

/**
 * TEMPORARY TEST-HARNESS DESIGN - not the final spawning mechanic (see
 * data/npcSpawnPoints.ts for the full "why").
 *
 * Now takes a StatsSystem reference so every newly-spawned NPC gets
 * registered with the Core Stats System immediately (base values ->
 * effective values, ready for future modifiers) as part of spawning -
 * mirrors how OverworldRoom.onJoin registers a Player's stats.
 */
export class NpcSpawnSystem {
  constructor(
    private readonly world: World,
    private readonly statsSystem: StatsSystem
  ) {}

  /** Checks every designated spawn point and spawns into any that's currently empty. */
  tick(): void {
    for (const point of OVERWORLD_NPC_SPAWN_POINTS) {
      if (this.isOccupied(point)) continue;
      this.spawnAt(point);
    }
  }

  private isOccupied(point: NpcSpawnPoint): boolean {
    const radius = TILE_SIZE * GAMEPLAY_CONFIG.spawnPointOccupancyRadiusRatio;
    let occupied = false;
    this.world.state.npcs.forEach((npc) => {
      if (occupied) return;
      const dx = npc.x - point.x;
      const dy = npc.y - point.y;
      if (Math.sqrt(dx * dx + dy * dy) < radius) occupied = true;
    });
    return occupied;
  }

  private spawnAt(point: NpcSpawnPoint): void {
    const npc = createHostileMob(point.x, point.y);
    this.world.state.npcs.set(npc.id, npc);
    this.statsSystem.register(npc.id, npc.stats);
    console.log(`[npc] spawned ${npc.name} (${npc.id}) at spawn point "${point.id}" (${point.x}, ${point.y})`);
  }
}