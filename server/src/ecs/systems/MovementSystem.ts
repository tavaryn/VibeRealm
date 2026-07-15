import { System, World } from "../World";
import { Player } from "../../rooms/schema/Player";
import { Npc } from "../../rooms/schema/Npc";
import { isWalkable, TILE_SIZE } from "../../data/mapData";
import { GAMEPLAY_CONFIG } from "../../data/gameplayConfig";

export type NpcContactHandler = (player: Player, npc: Npc, sessionId: string) => void;

/**
 * Server-authoritative movement + wall/NPC collision. Migrated from
 * OverworldRoom's private update()/tryMove()/isPositionWalkable()/
 * findNpcNear() methods (ECS migration Phase 2) - the math itself is
 * completely unchanged, only relocated, so client-side prediction/
 * reconciliation (which mirrors this exact logic in
 * client/src/network/PredictedMovement.ts) keeps working identically.
 *
 * NPC "bump" contact notification (cooldown tracking + the actual
 * broadcast) is deliberately NOT this system's job - that's Phase 3's
 * NpcContactSystem. This system only needs to know *whether* an NPC
 * blocked a move, for correct collision - it reports that via the
 * injected `onNpcContact` callback. OverworldRoom currently wires that to
 * its own handleNpcContact() method, unchanged from before this phase.
 */
export class MovementSystem implements System {
  readonly name = "MovementSystem";

  constructor(private readonly onNpcContact: NpcContactHandler) {}

  update(world: World, dtSeconds: number): void {
    const moveSpeed = GAMEPLAY_CONFIG.moveSpeed;

    world.state.players.forEach((player, sessionId) => {
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