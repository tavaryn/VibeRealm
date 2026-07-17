import { System, World } from "../World";
import { Player } from "../../rooms/schema/Player";
import { Npc } from "../../rooms/schema/Npc";
import { isWalkable, TILE_SIZE } from "../../data/mapData";
import { GAMEPLAY_CONFIG } from "../../data/gameplayConfig";

export type NpcContactHandler = (player: Player, npc: Npc, sessionId: string) => void;

/**
 * Server-authoritative movement + wall/NPC collision.
 *
 * Combat MVP (v0.9): a downed player (hp <= 0, awaiting CombatSystem's
 * respawn timer) is skipped entirely - they stay frozen in place until
 * respawn rather than being able to walk around at 0 hp. OverworldRoom's
 * "move" message handler also ignores input from a downed player, so
 * this is defense-in-depth (covers the case where stale input flags were
 * already set on the Player before they were downed mid-tick).
 */
export class MovementSystem implements System {
  readonly name = "MovementSystem";

  constructor(private readonly onNpcContact: NpcContactHandler) {}

  update(world: World, dtSeconds: number): void {
    const moveSpeed = GAMEPLAY_CONFIG.moveSpeed;

    world.state.players.forEach((player, sessionId) => {
      if (player.hp <= 0) return; // downed - frozen until CombatSystem respawns them

      let dx = 0;
      let dy = 0;
      if (player.inputUp) dy -= 1;
      if (player.inputDown) dy += 1;
      if (player.inputLeft) dx -= 1;
      if (player.inputRight) dx += 1;

      if (dx === 0 && dy === 0) return;

      const len = Math.sqrt(dx * dx + dy * dy);
      dx = (dx / len) * moveSpeed * dtSeconds;
      dy = (dy / len) * moveSpeed * dtSeconds;

      this.tryMove(world, player, dx, dy, sessionId);
    });
  }

  private tryMove(world: World, player: Player, dx: number, dy: number, sessionId: string) {
    const nextX = player.x + dx;
    const blockingNpcX = this.findNpcNear(world, nextX, player.y);
    if (this.isPositionWalkable(nextX, player.y) && !blockingNpcX) {
      player.x = nextX;
    } else if (blockingNpcX) {
      this.onNpcContact(player, blockingNpcX, sessionId);
    }

    const nextY = player.y + dy;
    const blockingNpcY = this.findNpcNear(world, player.x, nextY);
    if (this.isPositionWalkable(player.x, nextY) && !blockingNpcY) {
      player.y = nextY;
    } else if (blockingNpcY) {
      this.onNpcContact(player, blockingNpcY, sessionId);
    }
  }

  private isPositionWalkable(x: number, y: number): boolean {
    const half = TILE_SIZE * GAMEPLAY_CONFIG.collisionHalfWidthRatio;
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

  private findNpcNear(world: World, x: number, y: number): Npc | undefined {
    const radius = TILE_SIZE * GAMEPLAY_CONFIG.npcContactRadiusRatio;
    let found: Npc | undefined;
    world.state.npcs.forEach((npc) => {
      if (found) return;
      const dx = x - npc.x;
      const dy = y - npc.y;
      if (Math.sqrt(dx * dx + dy * dy) < radius) {
        found = npc;
      }
    });
    return found;
  }
}