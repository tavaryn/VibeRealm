import { World } from "../World";
import { createHostileMob } from "../../npc/npcFactory";
import { OVERWORLD_NPC_SPAWN_POINTS, NpcSpawnPoint } from "../../data/npcSpawnPoints";
import { GAMEPLAY_CONFIG } from "../../data/gameplayConfig";
import { TILE_SIZE } from "../../data/mapData";

/**
 * TEMPORARY TEST-HARNESS DESIGN - not the final spawning mechanic.
 *
 * NPCs now spawn ONLY at the designated points in data/npcSpawnPoints.ts
 * (one NPC per point at a time) instead of any random walkable tile -
 * see that file's doc comment for the full "why." What's still
 * intentionally simple/temporary about THIS system specifically:
 *
 * - A single global interval (OverworldRoom's existing
 *   `this.clock.setInterval(...)`) re-checks every point on the same
 *   cadence, rather than each point independently managing its own
 *   respawn delay.
 * - Spawning is driven by wall-clock time, not by a zone/map actually
 *   being entered - there's only one zone today, so "on zone load"
 *   doesn't mean anything yet.
 *
 * Both are real future work once zones/maps and per-point respawn timers
 * exist (see SPEC.md roadmap) - deliberately not built out now against a
 * single hardcoded overworld that doesn't have "zones."
 *
 * Population is naturally capped by the number of designated spawn
 * points (one live NPC per point, checked via a simple proximity test)
 * rather than a separate arbitrary max-mob count.
 */
export class NpcSpawnSystem {
  constructor(private readonly world: World) {}

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
    console.log(`[npc] spawned ${npc.name} (${npc.id}) at spawn point "${point.id}" (${point.x}, ${point.y})`);
  }
}