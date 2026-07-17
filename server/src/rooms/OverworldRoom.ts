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
import { CombatSystem } from "../ecs/systems/CombatSystem";
import { GameCommandRegistry } from "../ecs/commands/GameCommandRegistry";
import { commandLog } from "../ecs/commands/CommandLog";
import { moveIntentCommand } from "../ecs/commands/handlers/moveIntentCommand";
import { createSetTargetCommand } from "../ecs/commands/handlers/setTargetCommand";
import { createAttackCommand } from "../ecs/commands/handlers/attackCommand";

const SIMULATION_TICK_MS = GAMEPLAY_CONFIG.simulationTickMs;
const XP_TICK_MS = LEVELING_CONFIG.passiveXpIntervalMs;
const NPC_SPAWN_CHECK_INTERVAL_MS = GAMEPLAY_CONFIG.npcSpawnCheckIntervalMs;

/**
 * Single shared overworld room. Thin ECS adapter - see SPEC.md Section 3a.
 *
 * This version adds the Command Pattern: every player-issued action
 * ("move", "set-target", "attack", and any future skill/action) is now
 * dispatched through `gameCommands` (a GameCommandRegistry) instead of
 * being handled inline in each onMessage callback. OverworldRoom's own
 * job in each handler shrinks to "hand this off to the registry" -
 * actor resolution, validation, execution, and logging all now live in
 * GameCommandRegistry + the individual command handlers under
 * ecs/commands/. See SPEC.md Section 3a for the ECS architecture this
 * builds on, and ecs/commands/GameCommandRegistry.ts's doc comment for
 * why this is a separate registry from admin/commandRegistry.ts.
 *
 * Also adds a minimal CombatSystem (melee-only, NPC-only - see that
 * file's doc comment) as the first real command beyond the pre-existing
 * move/target actions, to prove the pattern end-to-end.
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
  private combatSystem!: CombatSystem;
  private gameCommands!: GameCommandRegistry;

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
    this.combatSystem = new CombatSystem(
      this.world,
      this.levelingSystem,
      this.statsSystem,
      (type, message) => this.broadcast(type, message)
    );

    // --- Command Pattern wiring ---
    // Every action a player can take is registered here, once. Adding a
    // new action later (a skill, an interact-with-object command, etc.)
    // means: write a new handler file under ecs/commands/handlers/,
    // register() it here, and add one onMessage(...) line below that
    // dispatches it - nothing else in this class needs to change.
    this.gameCommands = new GameCommandRegistry();
    this.gameCommands.register(moveIntentCommand);
    this.gameCommands.register(createSetTargetCommand(this.targetingSystem));
    this.gameCommands.register(createAttackCommand(this.combatSystem));

    this.world.registerSystem(
      new MovementSystem((player, npc, sessionId) =>
        this.npcContactSystem.handleContact(player, npc, sessionId)
      )
    );
    // Tick-registered purely so timed stat modifiers (future buffs/
    // debuffs) expire on their own - permanent modifiers (equipment)
    // never touch this tick path. See StatsSystem.update().
    this.world.registerSystem(this.statsSystem);

    // Cleans up a departed NPC's stat-modifier entry (e.g. after /kill
    // or being defeated in combat) the same way onLeave below does for
    // players - avoids repeating the exact "leaked server-only component
    // keyed by a removed entity" class of bug this project already hit
    // once with npcContactCooldown.
    this.state.npcs.onRemove((npc) => this.statsSystem.unregister(npc.id));

    this.setSimulationInterval((deltaTime) => this.world.update(deltaTime / 1000), SIMULATION_TICK_MS);
    this.clock.setInterval(() => this.levelingSystem.grantPassiveTick(), XP_TICK_MS);
    this.clock.setInterval(() => this.npcSpawnSystem.tick(), NPC_SPAWN_CHECK_INTERVAL_MS);

    // "move" - continuous input-state changes. Wrapped as the
    // "move-intent" command (see moveIntentCommand.ts).
    this.onMessage(
      "move",
      (
        client,
        payload: { up: boolean; down: boolean; left: boolean; right: boolean; seq?: number }
      ) => {
        this.gameCommands.dispatch(
          this.world,
          client.sessionId,
          "move-intent",
          payload,
          (type, msg) => this.broadcast(type, msg),
          (type, msg) => client.send(type, msg),
          payload?.seq
        );
      }
    );

    // "set-target" - click/TAB target requests. Wrapped as the
    // "set-target" command (see setTargetCommand.ts).
    this.onMessage(
      "set-target",
      (client, payload: { targetId?: string | null; targetType?: TargetType | null }) => {
        this.gameCommands.dispatch(
          this.world,
          client.sessionId,
          "set-target",
          payload,
          (type, msg) => this.broadcast(type, msg),
          (type, msg) => client.send(type, msg)
        );
      }
    );

    // "attack" - new: a discrete melee attack against the player's
    // current target. Wrapped as the "attack" command (see
    // attackCommand.ts / CombatSystem.ts). Payload is intentionally
    // empty - see attackCommand.ts's doc comment for why.
    this.onMessage("attack", (client, payload: Record<string, never>) => {
      this.gameCommands.dispatch(
        this.world,
        client.sessionId,
        "attack",
        payload ?? {},
        (type, msg) => this.broadcast(type, msg),
        (type, msg) => client.send(type, msg)
      );
    });

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
      this.combatSystem.clearFor(client.sessionId);
      commandLog.clearFor(client.sessionId);

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
