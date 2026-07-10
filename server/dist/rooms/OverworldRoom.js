"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverworldRoom = void 0;
const core_1 = require("@colyseus/core");
const OverworldState_1 = require("./schema/OverworldState");
const Player_1 = require("./schema/Player");
const mapData_1 = require("../map/mapData");
const playerStore_1 = require("../persistence/playerStore");
const chatModeration_1 = require("../chat/chatModeration");
const npcFactory_1 = require("../npc/npcFactory");
const MOVE_SPEED = 120; // pixels per second
const SIMULATION_TICK_MS = 1000 / 20; // 20 Hz server movement tick
const XP_TICK_MS = 25000; // passive XP grant interval
const XP_PER_TICK = 5;
const NPC_SPAWN_INTERVAL_MS = 10000; // testing cadence - one mob every 10s
const MAX_HOSTILE_MOBS = 15; // simple population cap so mobs don't grow unbounded
const NPC_CONTACT_RADIUS = mapData_1.TILE_SIZE * 0.6; // how close a player must be to "touch" an NPC
const NPC_CONTACT_COOLDOWN_MS = 1000; // avoid spamming contact events every tick while pressed against a mob
function xpForNextLevel(level) {
    return level * 100;
}
/**
 * Single shared overworld room. Server-authoritative movement + collision,
 * plus a slow passive XP timer. Kept intentionally simple for the MVP;
 * combat/skills can hook into the same simulation loop later.
 */
class OverworldRoom extends core_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 100;
        this.chatRateLimiter = new chatModeration_1.ChatRateLimiter();
        this.npcContactCooldown = new Map();
    }
    onCreate() {
        this.setState(new OverworldState_1.OverworldState());
        // Fixed-rate authoritative movement loop. Clients only ever send
        // *input state*, never positions - the server decides where players go.
        this.setSimulationInterval((deltaTime) => this.update(deltaTime), SIMULATION_TICK_MS);
        // Decoupled slow tick for passive progression.
        this.clock.setInterval(() => this.grantPassiveXp(), XP_TICK_MS);
        // Testing spawner: one hostile mob every 10s, up to a population cap.
        // Replace with a real spawn-table/zone system once combat exists.
        this.clock.setInterval(() => this.spawnRandomHostileMob(), NPC_SPAWN_INTERVAL_MS);
        this.onMessage("move", (client, input) => {
            const player = this.state.players.get(client.sessionId);
            if (!player)
                return;
            player.inputUp = !!input.up;
            player.inputDown = !!input.down;
            player.inputLeft = !!input.left;
            player.inputRight = !!input.right;
        });
        // Global chat: sent as a broadcast message (not Schema state), since chat
        // history doesn't need to be synced/diffed like player state does - it's
        // fire-and-forget for whoever is currently in the room. No persistence
        // for MVP per SPEC.md. Swapping this for room.send-based proximity chat
        // later just means filtering the broadcast recipient list here.
        this.onMessage("chat", (client, payload) => {
            const player = this.state.players.get(client.sessionId);
            if (!player)
                return;
            if (!this.chatRateLimiter.canSend(client.sessionId))
                return;
            const text = (0, chatModeration_1.sanitizeMessage)(payload?.text);
            if (!text)
                return;
            this.broadcast("chat-message", {
                username: player.username,
                text,
                timestamp: Date.now(),
            });
        });
    }
    onJoin(client, options) {
        const username = (options?.username || `Player${client.sessionId.slice(0, 4)}`).slice(0, 16);
        const saved = (0, playerStore_1.loadPlayer)(username);
        const player = new Player_1.Player();
        player.id = client.sessionId;
        player.username = username;
        player.level = saved.level;
        player.xp = saved.xp;
        // Default stat block - just "power" for now. Combat/classes work later
        // reads/writes this map without requiring another schema change.
        player.stats.set("power", saved.stats?.power ?? 10);
        // Simple fixed spawn point near map center for the MVP.
        player.x = Math.floor(mapData_1.MAP_WIDTH / 2) * mapData_1.TILE_SIZE;
        player.y = Math.floor(mapData_1.MAP_HEIGHT / 2) * mapData_1.TILE_SIZE;
        this.state.players.set(client.sessionId, player);
        console.log(`[join] ${username} (${client.sessionId})`);
    }
    onLeave(client) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            (0, playerStore_1.savePlayer)({
                username: player.username,
                level: player.level,
                xp: player.xp,
                stats: { power: player.stats.get("power") ?? 10 },
            });
            this.state.players.delete(client.sessionId);
            this.chatRateLimiter.remove(client.sessionId);
            this.npcContactCooldown.delete(client.sessionId);
            console.log(`[leave] ${player.username} (saved level ${player.level}, xp ${player.xp})`);
        }
    }
    update(deltaTime) {
        const dt = deltaTime / 1000;
        this.state.players.forEach((player) => {
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
            // Normalize so diagonal movement isn't faster than cardinal movement.
            const len = Math.sqrt(dx * dx + dy * dy);
            dx = (dx / len) * MOVE_SPEED * dt;
            dy = (dy / len) * MOVE_SPEED * dt;
            this.tryMove(player, dx, dy);
        });
    }
    // Axis-separated movement: resolving X and Y independently lets a player
    // slide along a wall instead of stopping dead when moving diagonally into it.
    tryMove(player, dx, dy) {
        const nextX = player.x + dx;
        const blockingNpcX = this.findNpcNear(nextX, player.y);
        if (this.isPositionWalkable(nextX, player.y) && !blockingNpcX) {
            player.x = nextX;
        }
        else if (blockingNpcX) {
            this.handleNpcContact(player, blockingNpcX);
        }
        const nextY = player.y + dy;
        const blockingNpcY = this.findNpcNear(player.x, nextY);
        if (this.isPositionWalkable(player.x, nextY) && !blockingNpcY) {
            player.y = nextY;
        }
        else if (blockingNpcY) {
            this.handleNpcContact(player, blockingNpcY);
        }
    }
    // Checks a small collision box (not just the center point) against the
    // tile grid so players can't clip a corner into a wall tile.
    isPositionWalkable(x, y) {
        const half = mapData_1.TILE_SIZE * 0.35;
        const corners = [
            [x - half, y - half],
            [x + half, y - half],
            [x - half, y + half],
            [x + half, y + half],
        ];
        return corners.every(([cx, cy]) => (0, mapData_1.isWalkable)(Math.floor(cx / mapData_1.TILE_SIZE), Math.floor(cy / mapData_1.TILE_SIZE)));
    }
    // Treats NPCs as simple radius-based obstacles rather than tile-snapped
    // walls, since NPCs will eventually move (patrol/chase AI) and won't
    // always sit neatly on a tile boundary.
    findNpcNear(x, y) {
        let found;
        this.state.npcs.forEach((npc) => {
            if (found)
                return;
            const dx = x - npc.x;
            const dy = y - npc.y;
            if (Math.sqrt(dx * dx + dy * dy) < NPC_CONTACT_RADIUS) {
                found = npc;
            }
        });
        return found;
    }
    // No combat yet - just a rate-limited notification so the client can show
    // a log message / bump feedback. This is the natural hook point for
    // damage-on-touch or aggro once combat exists.
    handleNpcContact(player, npc) {
        const now = Date.now();
        const last = this.npcContactCooldown.get(player.id) ?? 0;
        if (now - last < NPC_CONTACT_COOLDOWN_MS)
            return;
        this.npcContactCooldown.set(player.id, now);
        this.broadcast("npc-contact", {
            sessionId: player.id,
            npcId: npc.id,
            npcName: npc.name,
            isHostile: npc.isHostile,
        });
    }
    spawnRandomHostileMob() {
        if (this.state.npcs.size >= MAX_HOSTILE_MOBS)
            return; // simple population cap
        const spawnPoint = (0, npcFactory_1.findRandomWalkableSpawn)();
        if (!spawnPoint)
            return;
        const npc = (0, npcFactory_1.createHostileMob)(spawnPoint.x, spawnPoint.y);
        this.state.npcs.set(npc.id, npc);
        console.log(`[npc] spawned ${npc.name} (${npc.id}) at (${spawnPoint.x}, ${spawnPoint.y})`);
    }
    grantPassiveXp() {
        this.state.players.forEach((player) => {
            player.xp += XP_PER_TICK;
            const needed = xpForNextLevel(player.level);
            if (player.xp >= needed) {
                player.xp -= needed;
                player.level += 1;
                this.broadcast("level-up", {
                    sessionId: player.id,
                    username: player.username,
                    level: player.level,
                });
            }
        });
    }
}
exports.OverworldRoom = OverworldRoom;
