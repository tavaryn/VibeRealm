import { Room, Client } from "@colyseus/core";
import { OverworldState } from "./schema/OverworldState";
import { Player } from "./schema/Player";
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from "../data/mapData";
import { loadPlayer, savePlayer } from "../persistence/playerStore";
import { sanitizeMessage, ChatRateLimiter } from "../chat/chatModeration";
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
import { NpcSpawnSystem } from "../ecs/systems/NpcSpawnSystem";
import { NpcContactSystem } from "../ecs/systems/NpcContactSystem";
import { TargetingSystem, TargetType } from "../ecs/systems/TargetingSystem";
import { LevelingSystem } from "../ecs/systems/LevelingSystem";

const SIMULATION_TICK_MS = GAMEPLAY_CONFIG.simulationTickMs;
const XP_TICK_MS = LEVELING_CONFIG.passiveXpIntervalMs;
const NPC_SPAWN_CHECK_INTERVAL_MS = GAMEPLAY_CONFIG.npcSpawnCheckIntervalMs;

/**
 * Single shared overworld room. Server-authoritative movement + collision,
 * a slow passive XP timer, server-validated targeting, client-side
 * prediction support (move-ack), and an admin command system - both
 * the server console and in-game "/"-prefixed chat route into the same
 * shared CommandRegistry (see server/src/admin/).
 *
 * ECS migration status (Phase 4): targeting and leveling now live in
 * ecs/systems/TargetingSystem.ts and ecs/systems/LevelingSystem.ts,
 * alongside Phase 2's MovementSystem and Phase 3's NpcSpawnSystem/
 * NpcContactSystem. This class is now a thin adapter: message wiring,
 * lifecycle (onAuth/onJoin/onLeave/onDispose), and a couple of small
 * public wrappers (grantXp) kept specifically so the admin module
 * doesn't need to know any ECS systems exist - see LevelingSystem.ts's
 * doc comment.
 */
export class OverworldRoom extends Room<OverworldState> {
  maxClients = 100;

  private chatRateLimiter = new ChatRateLimiter();

  // ECS world + systems - all assigned in onCreate() (need `this.state`/
  // `this.world` to already exist), hence the definite-assignment
  // assertions, same pattern Colyseus's own `state` field uses.
  private world!: World;
  private npcSpawnSystem!: NpcSpawnSystem;
  private npcContactSystem!: NpcContactSystem;
  private targetingSystem!: TargetingSystem;
  private levelingSystem!: LevelingSystem;

  onCreate() {
    // VibeRealm has exactly one persistent shared overworld, not disposable
    // per-session rooms - see SPEC.md Section 3b for the full rationale.
    this.autoDispose = false;

    this.setState(new OverworldState());

    this.world = new World(this.state);
    this.npcSpawnSystem = new NpcSpawnSystem(this.world);
    this.targetingSystem = new TargetingSystem(this.world);
    // Both bound to this room's own broadcast() so neither system needs
    // to import or know about Colyseus's Room type directly.
    this.npcContactSystem = new NpcContactSystem(this.world, (type, message) =>
      this.broadcast(type, message)
    );
    this.levelingSystem = new LevelingSystem(this.world, (type, message) =>
      this.broadcast(type, message)
    );

    // MovementSystem reports NPC bumps via this callback into
    // NpcContactSystem, rather than owning cooldown/broadcast logic
    // itself - see MovementSystem.ts's doc comment.
    this.world.registerSystem(
      new MovementSystem((player, npc, sessionId) =>
        this.npcContactSystem.handleContact(player, npc, sessionId)
      )
    );

    this.setSimulationInterval((deltaTime) => this.world.update(deltaTime / 1000), SIMULATION_TICK_MS);
    this.clock.setInterval(() => this.levelingSystem.grantPassiveTick(), XP_TICK_MS);
    this.clock.setInterval(() => this.npcSpawnSystem.tick(), NPC_SPAWN_CHECK_INTERVAL_MS);

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
        this.targetingSystem.setTarget(player, payload?.targetId ?? null, payload?.targetType ?? null);
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
      this.npcContactSystem.clearFor(client.sessionId);

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

  // Thin public wrapper, kept specifically so admin/types.ts's
  // AdminRoomApi interface (and therefore admin/commands.ts's /givexp)
  // can keep calling `room.grantXp(...)` directly, without the admin
  // module needing to import or know that LevelingSystem exists.
  grantXp(player: Player, amount: number, sessionId: string) {
    this.levelingSystem.grantXp(player, amount, sessionId);
  }
}