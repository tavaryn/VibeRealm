"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MovementSystem = void 0;
const mapData_1 = require("../../data/mapData");
const gameplayConfig_1 = require("../../data/gameplayConfig");
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
class MovementSystem {
    constructor(onNpcContact) {
        this.onNpcContact = onNpcContact;
        this.name = "MovementSystem";
    }
    update(world, dtSeconds) {
        const moveSpeed = gameplayConfig_1.GAMEPLAY_CONFIG.moveSpeed;
        world.state.players.forEach((player, sessionId) => {
            let dx = 0;
            let dy = 0;
            if (player.inputUp)
                dy -= 1;
            if (player.inputDown)
                dy += 1;
            if (player.inputLeft)
                dx -= 1;
            if (player.inputRight)
                dx += 1;
            if (dx === 0 && dy === 0)
                return;
            const len = Math.sqrt(dx * dx + dy * dy);
            dx = (dx / len) * moveSpeed * dtSeconds;
            dy = (dy / len) * moveSpeed * dtSeconds;
            this.tryMove(world, player, dx, dy, sessionId);
        });
    }
    tryMove(world, player, dx, dy, sessionId) {
        const nextX = player.x + dx;
        const blockingNpcX = this.findNpcNear(world, nextX, player.y);
        if (this.isPositionWalkable(nextX, player.y) && !blockingNpcX) {
            player.x = nextX;
        }
        else if (blockingNpcX) {
            this.onNpcContact(player, blockingNpcX, sessionId);
        }
        const nextY = player.y + dy;
        const blockingNpcY = this.findNpcNear(world, player.x, nextY);
        if (this.isPositionWalkable(player.x, nextY) && !blockingNpcY) {
            player.y = nextY;
        }
        else if (blockingNpcY) {
            this.onNpcContact(player, blockingNpcY, sessionId);
        }
    }
    isPositionWalkable(x, y) {
        const half = mapData_1.TILE_SIZE * gameplayConfig_1.GAMEPLAY_CONFIG.collisionHalfWidthRatio;
        const corners = [
            [x - half, y - half],
            [x + half, y - half],
            [x - half, y + half],
            [x + half, y + half],
        ];
        return corners.every(([cx, cy]) => (0, mapData_1.isWalkable)(Math.floor(cx / mapData_1.TILE_SIZE), Math.floor(cy / mapData_1.TILE_SIZE)));
    }
    findNpcNear(world, x, y) {
        const radius = mapData_1.TILE_SIZE * gameplayConfig_1.GAMEPLAY_CONFIG.npcContactRadiusRatio;
        let found;
        world.state.npcs.forEach((npc) => {
            if (found)
                return;
            const dx = x - npc.x;
            const dy = y - npc.y;
            if (Math.sqrt(dx * dx + dy * dy) < radius) {
                found = npc;
            }
        });
        return found;
    }
}
exports.MovementSystem = MovementSystem;
