"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverworldRoom = void 0;
const core_1 = require("@colyseus/core");
const OverworldState_1 = require("./schema/OverworldState");
const Player_1 = require("./schema/Player");
const mapData_1 = require("../data/mapData");
const playerStore_1 = require("../persistence/playerStore");
const chatModeration_1 = require("../chat/chatModeration");
const npcFactory_1 = require("../npc/npcFactory");
const leveling_1 = require("../util/leveling");
const commandRegistry_1 = require("../admin/commandRegistry");
const adminAuth_1 = require("../admin/adminAuth");
const banList_1 = require("../admin/banList");
const adminRuntime_1 = require("../admin/adminRuntime");
const generateId_1 = require("../utils/generateId");
const gameplayConfig_1 = require("../data/gameplayConfig");
const levelingConfig_1 = require("../data/levelingConfig");
const characterTemplates_1 = require("../data/characterTemplates");
const World_1 = require("../ecs/World");
const MovementSystem_1 = require("../ecs/systems/MovementSystem");
const SIMULATION_TICK_MS = gameplayConfig_1.GAMEPLAY_CONFIG.simulationTickMs;
const XP_TICK_MS = levelingConfig_1.LEVELING_CONFIG.passiveXpIntervalMs;
const XP_PER_TICK = levelingConfig_1.LEVELING_CONFIG.passiveXpAmount;
const NPC_SPAWN_INTERVAL_MS = gameplayConfig_1.GAMEPLAY_CONFIG.npcSpawnIntervalMs;
const MAX_HOSTILE_MOBS = gameplayConfig_1.GAMEPLAY_CONFIG.maxHostileMobs;
const NPC_CONTACT_COOLDOWN_MS = gameplayConfig_1.GAMEPLAY_CONFIG.npcContactCooldownMs;
/**
 * Single shared overworld room. Server-authoritative movement + collision,
 * a slow passive XP timer, server-validated targeting, client-side
 * prediction support (move-ack), and an admin command system - both
 * the server console and in-game "/"-prefixed chat route into the same
 * shared CommandRegistry (see server/src/admin/).
 *
 * ECS migration status (Phase 2): movement/collision now lives in
 * ecs/systems/MovementSystem.ts, run each tick via `this.world.update()`.
 * NPC contact's cooldown+broadcast, targeting, and leveling are still
 * directly on this class - later phases migrate those too. See
 * ecs/World.ts for the scaffolding this phase started using.
 */
class OverworldRoom extends core_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 100;
        this.chatRateLimiter = new chatModeration_1.ChatRateLimiter();
        // Keyed by Colyseus client.sessionId (NOT player.id) - must match the
        // key used in onLeave()'s cleanup below, or entries leak forever after
        // a player disconnects. See handleNpcContact() for why this is threaded
        // through explicitly rather than read off `player.id` (which, since the
        // UUID v7 migration, is no longer the same string as the session id).
        this.npcContactCooldown = new Map();
    }
    onCreate() {
        // VibeRealm has exactly one persistent shared overworld, not disposable
        // per-session rooms - see SPEC.md Section 3b for the full rationale.
        this.autoDispose = false;
        this.setState(new OverworldState_1.OverworldState());
        this.world = new World_1.World(this.state);
        // MovementSystem still reports NPC bumps back through this room's own
        // handleNpcContact() (cooldown + broadcast) rather than owning that
        // itself - see MovementSystem.ts's doc comment and Phase 3's planned
        // NpcContactSystem, which will replace this callback wiring.
        this.world.registerSystem(new MovementSystem_1.MovementSystem((player, npc, sessionId) => this.handleNpcContact(player, npc, sessionId)));
        this.setSimulationInterval((deltaTime) => this.world.update(deltaTime / 1000), SIMULATION_TICK_MS);
        this.clock.setInterval(() => this.grantPassiveXp(), XP_TICK_MS);
        this.clock.setInterval(() => this.spawnRandomHostileMob(), NPC_SPAWN_INTERVAL_MS);
        this.onMessage("move", (client, input) => {
            const player = this.state.players.get(client.sessionId);
            if (!player)
                return;
            player.inputUp = !!input.up;
            player.inputDown = !!input.down;
            player.inputLeft = !!input.left;
            player.inputRight = !!input.right;
            if (typeof input.seq === "number") {
                client.send("move-ack", { seq: input.seq, x: player.x, y: player.y });
            }
        });
        this.onMessage("set-target", (client, payload) => {
            const player = this.state.players.get(client.sessionId);
            if (!player)
                return;
            this.setPlayerTarget(player, payload?.targetId ?? null, payload?.targetType ?? null);
        });
        // Global chat, with an admin-command interception step at the top.
        this.onMessage("chat", async (client, payload) => {
            const player = this.state.players.get(client.sessionId);
            if (!player)
                return;
            const raw = (payload?.text ?? "").trim();
            if (raw.startsWith("/")) {
                await commandRegistry_1.commandRegistry.execute(raw, {
                    type: "chat",
                    username: player.username,
                    sessionId: client.sessionId,
                    isAdmin: (0, adminAuth_1.isAdmin)(player.username),
                }, (msg) => client.send("command-reply", { text: msg }), { room: this, requestShutdown: adminRuntime_1.requestShutdown });
                return;
            }
            if (!this.chatRateLimiter.canSend(client.sessionId))
                return;
            const text = (0, chatModeration_1.sanitizeMessage)(raw);
            if (!text)
                return;
            this.broadcast("chat-message", {
                username: player.username,
                text,
                timestamp: Date.now(),
            });
        });
        (0, adminRuntime_1.setActiveRoom)(this);
        console.log("[admin] OverworldRoom registered as the active room for admin commands.");
    }
    async onAuth(_client, options) {
        const username = (options?.username || "").trim();
        if (username && (0, banList_1.isBanned)(username)) {
            throw new Error("You are banned from this server.");
        }
        return true;
    }
    onJoin(client, options) {
        const username = (options?.username || `Player${client.sessionId.slice(0, 4)}`).slice(0, 16);
        const saved = (0, playerStore_1.loadPlayer)(username);
        const player = new Player_1.Player();
        player.id = (0, generateId_1.generateId)("player");
        player.username = username;
        player.level = saved.level;
        player.xp = saved.xp;
        player.stats.set("power", saved.stats?.power ?? characterTemplates_1.DEFAULT_CHARACTER_TEMPLATE.stats.power);
        player.maxHp = characterTemplates_1.DEFAULT_CHARACTER_TEMPLATE.maxHp;
        player.hp = characterTemplates_1.DEFAULT_CHARACTER_TEMPLATE.hp;
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
                stats: { power: player.stats.get("power") ?? characterTemplates_1.DEFAULT_CHARACTER_TEMPLATE.stats.power },
            });
            this.state.players.delete(client.sessionId);
            this.chatRateLimiter.remove(client.sessionId);
            this.npcContactCooldown.delete(client.sessionId);
            this.state.players.forEach((otherPlayer) => {
                if (otherPlayer.targetType === "player" && otherPlayer.targetId === client.sessionId) {
                    otherPlayer.targetId = "";
                    otherPlayer.targetType = "";
                }
            });
            console.log(`[leave] ${player.username} (saved level ${player.level}, xp ${player.xp})`);
        }
    }
    onDispose() {
        (0, adminRuntime_1.setActiveRoom)(null);
    }
    grantXp(player, amount, sessionId) {
        player.xp += amount;
        while (player.xp >= (0, leveling_1.xpForNextLevel)(player.level)) {
            player.xp -= (0, leveling_1.xpForNextLevel)(player.level);
            player.level += 1;
            this.broadcast("level-up", {
                sessionId,
                username: player.username,
                level: player.level,
            });
        }
    }
    setPlayerTarget(player, targetId, targetType) {
        if (!targetId || !targetType) {
            player.targetId = "";
            player.targetType = "";
            return true;
        }
        if (targetType === "player") {
            if (!this.state.players.has(targetId))
                return false;
        }
        else if (targetType === "npc") {
            if (!this.state.npcs.has(targetId))
                return false;
        }
        else {
            return false;
        }
        player.targetId = targetId;
        player.targetType = targetType;
        return true;
    }
    handleNpcContact(player, npc, sessionId) {
        const now = Date.now();
        const last = this.npcContactCooldown.get(sessionId) ?? 0;
        if (now - last < NPC_CONTACT_COOLDOWN_MS)
            return;
        this.npcContactCooldown.set(sessionId, now);
        this.broadcast("npc-contact", {
            sessionId,
            npcId: npc.id,
            npcName: npc.name,
            isHostile: npc.isHostile,
        });
    }
    spawnRandomHostileMob() {
        if (this.state.npcs.size >= MAX_HOSTILE_MOBS)
            return;
        const spawnPoint = (0, npcFactory_1.findRandomWalkableSpawn)();
        if (!spawnPoint)
            return;
        const npc = (0, npcFactory_1.createHostileMob)(spawnPoint.x, spawnPoint.y);
        this.state.npcs.set(npc.id, npc);
        console.log(`[npc] spawned ${npc.name} (${npc.id}) at (${spawnPoint.x}, ${spawnPoint.y})`);
    }
    grantPassiveXp() {
        this.state.players.forEach((player, sessionId) => this.grantXp(player, XP_PER_TICK, sessionId));
    }
}
exports.OverworldRoom = OverworldRoom;
