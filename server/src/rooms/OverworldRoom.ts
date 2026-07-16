// server/src/rooms/OverworldRoom.ts
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
import { STAT_NAMES, StatModifier } from "../data/statDefinitions";
import { World } from "../ecs/World";
import { MovementSystem } from "../ecs/systems/MovementSystem";
import { NpcSpawnSystem } from "../ecs/systems/NpcSpawnSystem";
import { NpcContactSystem } from "../ecs/systems/NpcContactSystem";
import { TargetingSystem, TargetType } from "../ecs/systems/TargetingSystem";
import { LevelingSystem } from "../ecs/systems/LevelingSystem";
import { StatsSystem } from "../ecs/systems/StatsSystem";

const SIMULATION_TICK_MS = GAMEPLAY_CONFIG.simulationTickMs;
const XP_TICK_MS = LEVELING_CONFIG.passiveXpIntervalMs;
const NPC_SPAWN_CHECK_INTERVAL_MS = GAMEPLAY_CONFIG.npcSpawnCheckIntervalMs;

/**
 * Single shared overworld room. Thin ECS adapter - see SPEC.md Section 3a.
 *
 * This version adds the Core Stats System: a `StatsSystem` instance
 * (tick-registered, purely for buff expiry) that every Player and NPC's
 * StatsComponent is registered with on join/spawn, and unregistered from
 * on leave/removal. Three small wrapper methods (addStatModifier/
 * removeStatModifier/getStatModifiers) exist for the same reason
 * grantXp() does - so the admin module can drive stat modifiers without
 * ever importing OverworldRoom or knowing StatsSystem exists.
 */
export class OverworldRoom extends Room<OverworldState> {
  maxClients = 100;

  private chatRateLimiter = new ChatRateLimiter();

  private world!: World;
  private npcSpawnSystem!: NpcSpawnSystem;
  private npcContactSystem!: NpcContactSystem;
  private targetingSystem!: TargetingSystem;
  private levelingSystem!: LevelingSystem;
  private statsSystem!: StatsSystem;

  onCreate() {
    this.autoDispose = false;

    this.setState(new OverworldState());

    this.world = new World(this.state);
    this.statsSystem = new StatsSystem(this.world);
    this.npcSpawnSystem = new NpcSpawnSystem(this.world, this.statsSystem);
    this.targetingSystem = new TargetingSystem(this.world);
    this.npcContactSystem = new NpcContactSystem(this.world, (type, message) =>
      this.broadcast(type, message)
    );
    this.levelingSystem = new LevelingSystem(this.world, (type, message) =>
      this.broadcast(type, message)
    );

    this.world.registerSystem(
      new MovementSystem((player, npc, sessionId) =>
        this.npcContactSystem.handleContact(player, npc, sessionId)
      )
    );
    // Tick-registered purely so timed stat modifiers (future buffs/
    // debuffs) expire on their own - permanent modifiers (equipment)
    // never touch this tick path. See StatsSystem.update().
    this.world.registerSystem(this.statsSystem);

    // Cleans up a departed NPC's stat-modifier entry (e.g. after /kill)
    // the same way onLeave below does for players - avoids repeating the
    // exact "leaked server-only component keyed by a removed entity"
    // class of bug this project already hit once with npcContactCooldown.
    this.state.npcs.onRemove((npc) => this.statsSystem.unregister(npc.id));

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

    STAT_NAMES.forEach((stat) =>
      player.stats.setBase(stat, saved.stats?.[stat] ?? DEFAULT_CHARACTER_TEMPLATE.stats[stat])
    );

    player.maxHp = DEFAULT_CHARACTER_TEMPLATE.maxHp;
    player.hp = DEFAULT_CHARACTER_TEMPLATE.hp;
    player.x = Math.floor(MAP_WIDTH / 2) * TILE_SIZE;
    player.y = Math.floor(MAP_HEIGHT / 2) * TILE_SIZE;

    this.state.players.set(client.sessionId, player);
    this.statsSystem.register(client.sessionId, player.stats);
    console.log(`[join] ${username} (${client.sessionId})`);
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      const stats = Object.fromEntries(
        STAT_NAMES.map((stat) => [stat, player.stats.getBase(stat)])
      ) as Record<string, number>;

      savePlayer({
        username: player.username,
        level: player.level,
        xp: player.xp,
        stats,
      });
      this.state.players.delete(client.sessionId);
      this.chatRateLimiter.remove(client.sessionId);
      this.npcContactSystem.clearFor(client.sessionId);
      this.statsSystem.unregister(client.sessionId);

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
    this.levelingSystem.grantXp(player, amount, sessionId);
  }

  // Thin wrappers, same purpose as grantXp() above - keep the admin
  // module decoupled from StatsSystem's existence.
  addStatModifier(entityId: string, modifier: StatModifier) {
    this.statsSystem.addModifier(entityId, modifier);
  }

  removeStatModifier(entityId: string, modifierId: string): boolean {
    return this.statsSystem.removeModifier(entityId, modifierId);
  }

  getStatModifiers(entityId: string): readonly StatModifier[] {
    return this.statsSystem.getModifiers(entityId);
  }
}