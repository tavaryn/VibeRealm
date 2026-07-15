import { Room, Client } from "@colyseus/core";
import { OverworldState } from "./schema/OverworldState";
import { Player } from "./schema/Player";
import { Npc } from "./schema/Npc";
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from "../data/mapData";
import { loadPlayer, savePlayer } from "../persistence/playerStore";
import { sanitizeMessage, ChatRateLimiter } from "../chat/chatModeration";
import { createHostileMob, findRandomWalkableSpawn } from "../npc/npcFactory";
import { xpForNextLevel } from "../util/leveling";
import { commandRegistry } from "../admin/commandRegistry";
import { isAdmin } from "../admin/adminAuth";
import { isBanned } from "../admin/banList";
import { setActiveRoom, requestShutdown } from "../admin/adminRuntime";
import { generateId } from "../utils/generateId";
import { GAMEPLAY_CONFIG } from "../data/gameplayConfig";
import { LEVELING_CONFIG } from "../data/levelingConfig";
import { DEFAULT_CHARACTER_TEMPLATE } from "../data/characterTemplates";
import { World } from "../ecs/World";
import { MovementSystem } from "../ecs/systems/MovementSystem";

const SIMULATION_TICK_MS = GAMEPLAY_CONFIG.simulationTickMs;
const XP_TICK_MS = LEVELING_CONFIG.passiveXpIntervalMs;
const XP_PER_TICK = LEVELING_CONFIG.passiveXpAmount;
const NPC_SPAWN_INTERVAL_MS = GAMEPLAY_CONFIG.npcSpawnIntervalMs;
const MAX_HOSTILE_MOBS = GAMEPLAY_CONFIG.maxHostileMobs;
const NPC_CONTACT_COOLDOWN_MS = GAMEPLAY_CONFIG.npcContactCooldownMs;

type TargetType = "player" | "npc";

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
export class OverworldRoom extends Room<OverworldState> {
  maxClients = 100;

  private chatRateLimiter = new ChatRateLimiter();
  // Keyed by Colyseus client.sessionId (NOT player.id) - must match the
  // key used in onLeave()'s cleanup below, or entries leak forever after
  // a player disconnects. See handleNpcContact() for why this is threaded
  // through explicitly rather than read off `player.id` (which, since the
  // UUID v7 migration, is no longer the same string as the session id).
  private npcContactCooldown = new Map<string, number>();

  // ECS world - owns the systems that run each simulation tick. Assigned
  // in onCreate() (needs `this.state` to already exist), hence the
  // definite-assignment assertion, same pattern Colyseus's own `state`
  // field uses.
  private world!: World;

  onCreate() {
    // VibeRealm has exactly one persistent shared overworld, not disposable
    // per-session rooms - see SPEC.md Section 3b for the full rationale.
    this.autoDispose = false;

    this.setState(new OverworldState());

    this.world = new World(this.state);
    // MovementSystem still reports NPC bumps back through this room's own
    // handleNpcContact() (cooldown + broadcast) rather than owning that
    // itself - see MovementSystem.ts's doc comment and Phase 3's planned
    // NpcContactSystem, which will replace this callback wiring.
    this.world.registerSystem(
      new MovementSystem((player, npc, sessionId) => this.handleNpcContact(player, npc, sessionId))
    );

    this.setSimulationInterval((deltaTime) => this.world.update(deltaTime / 1000), SIMULATION_TICK_MS);
    this.clock.setInterval(() => this.grantPassiveXp(), XP_TICK_MS);
    this.clock.setInterval(() => this.spawnRandomHostileMob(), NPC_SPAWN_INTERVAL_MS);

    this.onMessage(
      "move",
      (
        client,
        input: { up: boolean; down: boolean; left: boolean; right: boolean; seq?: number }
      ) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        player.inputUp = !!input.up;
        player.inputDown = !!input.down;
        player.inputLeft = !!input.left;
        player.inputRight = !!input.right;

        if (typeof input.seq === "number") {
          client.send("move-ack", { seq: input.seq, x: player.x, y: player.y });
        }
      }
    );

    this.onMessage(
      "set-target",
      (client, payload: { targetId?: string | null; targetType?: TargetType | null }) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        this.setPlayerTarget(player, payload?.targetId ?? null, payload?.targetType ?? null);
      }
    );

    // Global chat, with an admin-command interception step at the top.
    this.onMessage("chat", async (client, payload: { text?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const raw = (payload?.text ?? "").trim();

      if (raw.startsWith("/")) {
        await commandRegistry.execute(
          raw,
          {
            type: "chat",
            username: player.username,
            sessionId: client.sessionId,
            isAdmin: isAdmin(player.username),
          },
          (msg) => client.send("command-reply", { text: msg }),
          { room: this, requestShutdown }
        );
        return;
      }

      if (!this.chatRateLimiter.canSend(client.sessionId)) return;

      const text = sanitizeMessage(raw);
      if (!text) return;

      this.broadcast("chat-message", {
        username: player.username,
        text,
        timestamp: Date.now(),
      });
    });

    setActiveRoom(this);
    console.log("[admin] OverworldRoom registered as the active room for admin commands.");
  }

  async onAuth(_client: Client, options: { username?: string }) {
    const username = (options?.username || "").trim();
    if (username && isBanned(username)) {
      throw new Error("You are banned from this server.");
    }
    return true;
  }

  onJoin(client: Client, options: { username?: string }) {
    const username = (options?.username || `Player${client.sessionId.slice(0, 4)}`).slice(0, 16);
    const saved = loadPlayer(username);

    const player = new Player();
    player.id = generateId("player");
    player.username = username;
    player.level = saved.level;
    player.xp = saved.xp;
    player.stats.set("power", saved.stats?.power ?? DEFAULT_CHARACTER_TEMPLATE.stats.power);
    player.maxHp = DEFAULT_CHARACTER_TEMPLATE.maxHp;
    player.hp = DEFAULT_CHARACTER_TEMPLATE.hp;
    player.x = Math.floor(MAP_WIDTH / 2) * TILE_SIZE;
    player.y = Math.floor(MAP_HEIGHT / 2) * TILE_SIZE;

    this.state.players.set(client.sessionId, player);
    console.log(`[join] ${username} (${client.sessionId})`);
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      savePlayer({
        username: player.username,
        level: player.level,
        xp: player.xp,
        stats: { power: player.stats.get("power") ?? DEFAULT_CHARACTER_TEMPLATE.stats.power },
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
    setActiveRoom(null);
  }

  grantXp(player: Player, amount: number, sessionId: string) {
    player.xp += amount;
    while (player.xp >= xpForNextLevel(player.level)) {
      player.xp -= xpForNextLevel(player.level);
      player.level += 1;
      this.broadcast("level-up", {
        sessionId,
        username: player.username,
        level: player.level,
      });
    }
  }

  private setPlayerTarget(
    player: Player,
    targetId: string | null,
    targetType: TargetType | null
  ): boolean {
    if (!targetId || !targetType) {
      player.targetId = "";
      player.targetType = "";
      return true;
    }

    if (targetType === "player") {
      if (!this.state.players.has(targetId)) return false;
    } else if (targetType === "npc") {
      if (!this.state.npcs.has(targetId)) return false;
    } else {
      return false;
    }

    player.targetId = targetId;
    player.targetType = targetType;
    return true;
  }

  private handleNpcContact(player: Player, npc: Npc, sessionId: string) {
    const now = Date.now();
    const last = this.npcContactCooldown.get(sessionId) ?? 0;
    if (now - last < NPC_CONTACT_COOLDOWN_MS) return;
    this.npcContactCooldown.set(sessionId, now);

    this.broadcast("npc-contact", {
      sessionId,
      npcId: npc.id,
      npcName: npc.name,
      isHostile: npc.isHostile,
    });
  }

  private spawnRandomHostileMob() {
    if (this.state.npcs.size >= MAX_HOSTILE_MOBS) return;

    const spawnPoint = findRandomWalkableSpawn();
    if (!spawnPoint) return;

    const npc = createHostileMob(spawnPoint.x, spawnPoint.y);
    this.state.npcs.set(npc.id, npc);
    console.log(`[npc] spawned ${npc.name} (${npc.id}) at (${spawnPoint.x}, ${spawnPoint.y})`);
  }

  private grantPassiveXp() {
    this.state.players.forEach((player, sessionId) => this.grantXp(player, XP_PER_TICK, sessionId));
  }
}