import { TILE_SIZE } from "./mapData";

/**
 * Designated NPC spawn points for the current single "overworld" zone/map.
 *
 * This is the data-layer half of a deliberate move away from "spawn
 * anywhere randomly on a timer" and toward "spawn at fixed, hand-placed
 * locations per map/zone" - which is how the finished game will actually
 * work (camps, dungeon entrances, patrol posts, etc., varying per zone).
 * The old random-tile/population-cap approach was purely a testing
 * convenience for exercising NPCs early and was never meant to survive
 * into the real game - see NpcSpawnSystem.ts's doc comment for what's
 * still temporary about the CURRENT version vs. this data shape.
 *
 * FUTURE: once multiple zones/maps exist, this naturally extends to
 * something like `Record<zoneId, NpcSpawnPoint[]>` (or one file per
 * zone) - the shape doesn't need to be redesigned again, just multiplied.
 * `templateId` is similarly forward-looking: it's not consumed yet
 * (npcFactory.createHostileMob() still only knows how to build the
 * single "hostile_basic" template), but the data's ready for the day a
 * second NPC template exists and different points want different mobs.
 *
 * Positions are pixel coordinates (tileX/Y * TILE_SIZE), chosen to sit
 * clearly clear of both the border walls and the scattered obstacle
 * tiles in data/mapData.ts. Not meaningful placements lore-wise yet -
 * just scattered enough to exercise multiple simultaneous NPCs.
 */
export interface NpcSpawnPoint {
  id: string;
  x: number;
  y: number;
  /** Key into data/npcTemplates.ts - reserved for when more than one template exists. */
  templateId: string;
}

export const OVERWORLD_NPC_SPAWN_POINTS: NpcSpawnPoint[] = [
  { id: "overworld_spawn_1", x: 3 * TILE_SIZE, y: 3 * TILE_SIZE, templateId: "hostile_basic" },
  { id: "overworld_spawn_2", x: 26 * TILE_SIZE, y: 3 * TILE_SIZE, templateId: "hostile_basic" },
  { id: "overworld_spawn_3", x: 3 * TILE_SIZE, y: 26 * TILE_SIZE, templateId: "hostile_basic" },
  { id: "overworld_spawn_4", x: 26 * TILE_SIZE, y: 26 * TILE_SIZE, templateId: "hostile_basic" },
  { id: "overworld_spawn_5", x: 15 * TILE_SIZE, y: 3 * TILE_SIZE, templateId: "hostile_basic" },
  { id: "overworld_spawn_6", x: 3 * TILE_SIZE, y: 15 * TILE_SIZE, templateId: "hostile_basic" },
  { id: "overworld_spawn_7", x: 26 * TILE_SIZE, y: 15 * TILE_SIZE, templateId: "hostile_basic" },
  { id: "overworld_spawn_8", x: 15 * TILE_SIZE, y: 26 * TILE_SIZE, templateId: "hostile_basic" },
];