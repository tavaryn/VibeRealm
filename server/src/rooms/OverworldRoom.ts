import { Room, Client } from "@colyseus/core";
import { OverworldState } from "./schema/OverworldState";
import { Player } from "./schema/Player";
import { Npc } from "./schema/Npc";
import { isWalkable, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from "../map/mapData";
import { loadPlayer, savePlayer } from "../persistence/playerStore";
import { sanitizeMessage, ChatRateLimiter } from "../chat/chatModeration";
import { createHostileMob, findRandomWalkableSpawn } from "../npc/npcFactory";
import { xpForNextLevel } from "../util/leveling";
import { commandRegistry } from "../admin/commandRegistry";
import { isAdmin } from "../admin/adminAuth";
import { isBanned } from "../admin/banList";
import { setActiveRoom, requestShutdown } from "../admin/adminRuntime";

const MOVE_SPEED = 120; // pixels per second
const SIMULATION_TICK_MS = 1000 / 20; // 20 Hz server movement tick
const XP_TICK_MS = 25000; // passive XP grant interval
const XP_PER_TICK = 5;
const NPC_SPAWN_INTERVAL_MS = 10000; // testing cadence - one mob every 10s
const MAX_HOSTILE_MOBS = 15; // simple population cap so mobs don't grow unbounded
const NPC_CONTACT_RADIUS = TILE_SIZE * 0.6; // how close a player must be to "touch" an NPC
const NPC_CONTACT_COOLDOWN_MS = 1000; // avoid spamming contact events every tick while pressed against a mob

type TargetType = "player" | "npc";

/**
 * Single shared overworld room. Server-authoritative movement + collision,
 * a slow passive XP timer, server-validated targeting, client-side
 * prediction support (move-ack), and (new) an admin command system - both
 * the server console and in-game "/"-prefixed chat route into the same
 * shared CommandRegistry (see server/src/admin/).
 */
export class OverworldRoom extends Room<OverworldState> {
  maxClients = 100;

  private chatRateLimiter = new ChatRateLimiter();
  private npcContactCooldown = new Map<string, number>();

  onCreate() {
    // VibeRealm has exactly one persistent shared overworld, not disposable
    // per-session rooms - see SPEC.md Section 3b for the full rationale.
    this.autoDispose = false;

    this.setState(new OverworldState());

    this.setSimulationInterval((deltaTime) => this.update(deltaTime), SIMULATION_TICK_MS);
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

    // Global chat, with a new admin-command interception step at the top.
    this.onMessage("chat", async (client, payload: { text?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      const raw = (payload?.text ?? "").trim();

      // Anything starting with "/" is routed to the shared command
      // registry instead of being broadcast as chat - regardless of
      // whether the sender turns out to be an admin, since the registry
      // itself checks and logs that. This is the exact same execute()
      // path the server console uses (see admin/consoleInput.ts); only
      // the actor type and reply mechanism differ - which is the whole
      // point of the handler/registry pattern (a future web admin panel
      // would be a third caller of the same function).
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

    // Registers this room as "the" active room for admin commands (used
    // by the server console, which isn't inside any room itself - see
    // admin/adminRuntime.ts). Cleared in onDispose() below.
    setActiveRoom(this);
    console.log("[admin] OverworldRoom registered as the active room for admin commands.");
  }

  // Runs before onJoin - rejecting here means a banned username never
  // gets a Player created for it at all, rather than being kicked a
  // moment after joining.
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
    player.id = client.sessionId;
    player.username = username;
    player.level = saved.level;
    player.xp = saved.xp;
    player.stats.set("power", saved.stats?.power ?? 10);
    player.maxHp = 100;
    player.hp = 100;
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
        stats: { power: player.stats.get("power") ?? 10 },
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
    // Room is being destroyed (only expected on an actual server
    // shutdown, since autoDispose=false keeps it alive otherwise) - clear
    // the admin system's reference so console commands correctly report
    // "no active room" instead of holding a stale one.
    setActiveRoom(null);
  }

  // Public so the admin /givexp command (server/src/admin/commands.ts)
  // can reuse the exact same level-up logic as passive XP, rather than
  // duplicating it.
  grantXp(player: Player, amount: number) {
    player.xp += amount;
    // while, not if - so one large admin grant can cross multiple level
    // thresholds in a single call, same as enough passive ticks eventually would.
    while (player.xp >= xpForNextLevel(player.level)) {
      player.xp -= xpForNextLevel(player.level);
      player.level += 1;
      this.broadcast("level-up", {
        sessionId: player.id,
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

  private update(deltaTime: number) {
    const dt = deltaTime / 1000;

    this.state.players.forEach((player) => {
      let dx = 0;
      let dy = 0;
      if (player.inputUp) dy -= 1;
      if (player.inputDown) dy += 1;
      if (player.inputLeft) dx -= 1;
      if (player.inputRight) dx += 1;

      if (dx === 0 && dy === 0) return;

      const len = Math.sqrt(dx * dx + dy * dy);
      dx = (dx / len) * MOVE_SPEED * dt;
      dy = (dy / len) * MOVE_SPEED * dt;

      this.tryMove(player, dx, dy);
    });
  }

  private tryMove(player: Player, dx: number, dy: number) {
    const nextX = player.x + dx;
    const blockingNpcX = this.findNpcNear(nextX, player.y);
    if (this.isPositionWalkable(nextX, player.y) && !blockingNpcX) {
      player.x = nextX;
    } else if (blockingNpcX) {
      this.handleNpcContact(player, blockingNpcX);
    }

    const nextY = player.y + dy;
    const blockingNpcY = this.findNpcNear(player.x, nextY);
    if (this.isPositionWalkable(player.x, nextY) && !blockingNpcY) {
      player.y = nextY;
    } else if (blockingNpcY) {
      this.handleNpcContact(player, blockingNpcY);
    }
  }

  private isPositionWalkable(x: number, y: number): boolean {
    const half = TILE_SIZE * 0.35;
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

  private findNpcNear(x: number, y: number): Npc | undefined {
    let found: Npc | undefined;
    this.state.npcs.forEach((npc) => {
      if (found) return;
      const dx = x - npc.x;
      const dy = y - npc.y;
      if (Math.sqrt(dx * dx + dy * dy) < NPC_CONTACT_RADIUS) {
        found = npc;
      }
    });
    return found;
  }

  private handleNpcContact(player: Player, npc: Npc) {
    const now = Date.now();
    const last = this.npcContactCooldown.get(player.id) ?? 0;
    if (now - last < NPC_CONTACT_COOLDOWN_MS) return;
    this.npcContactCooldown.set(player.id, now);

    this.broadcast("npc-contact", {
      sessionId: player.id,
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
    this.state.players.forEach((player) => this.grantXp(player, XP_PER_TICK));
  }
}