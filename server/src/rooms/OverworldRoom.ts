import { Room, Client } from "@colyseus/core";
import { OverworldState } from "./schema/OverworldState";
import { Player } from "./schema/Player";
import { Npc } from "./schema/Npc";
import { isWalkable, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from "../map/mapData";
import { loadPlayer, savePlayer } from "../persistence/playerStore";
import { sanitizeMessage, ChatRateLimiter } from "../chat/chatModeration";
import { createHostileMob, findRandomWalkableSpawn } from "../npc/npcFactory";

const MOVE_SPEED = 120; // pixels per second
const SIMULATION_TICK_MS = 1000 / 20; // 20 Hz server movement tick
const XP_TICK_MS = 25000; // passive XP grant interval
const XP_PER_TICK = 5;
const NPC_SPAWN_INTERVAL_MS = 10000; // testing cadence - one mob every 10s
const MAX_HOSTILE_MOBS = 15; // simple population cap so mobs don't grow unbounded
const NPC_CONTACT_RADIUS = TILE_SIZE * 0.6; // how close a player must be to "touch" an NPC
const NPC_CONTACT_COOLDOWN_MS = 1000; // avoid spamming contact events every tick while pressed against a mob

type TargetType = "player" | "npc";

function xpForNextLevel(level: number): number {
  return level * 100;
}

/**
 * Single shared overworld room. Server-authoritative movement + collision,
 * a slow passive XP timer, server-validated targeting, and (new) a small
 * unicast ack on movement input to support client-side prediction -
 * see the "move" handler below and client GameScene.reconcileFromAck.
 * Kept intentionally simple for the MVP; combat can hook into the
 * validated target the same way `set-target` does today (see
 * `setPlayerTarget`).
 */
export class OverworldRoom extends Room<OverworldState> {
  maxClients = 100;
  private chatRateLimiter = new ChatRateLimiter();
  private npcContactCooldown = new Map<string, number>();

  onCreate() {
    this.setState(new OverworldState());

    // Fixed-rate authoritative movement loop. Clients only ever send
    // *input state*, never positions - the server decides where players go.
    this.setSimulationInterval((deltaTime) => this.update(deltaTime), SIMULATION_TICK_MS);

    // Decoupled slow tick for passive progression.
    this.clock.setInterval(() => this.grantPassiveXp(), XP_TICK_MS);

    // Testing spawner: one hostile mob every 10s, up to a population cap.
    // Replace with a real spawn-table/zone system once combat exists.
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

        // Client-side prediction support: echo back the seq the client
        // tagged this input change with, plus this player's authoritative
        // position *right now* (i.e. before the new input flags above
        // take effect on the next simulation tick). The client uses this
        // to discard/replay its local prediction history and correct any
        // drift without a visible jump - see GameScene.reconcileFromAck().
        // Unicast (client.send), not broadcast - no other client needs
        // this, and it costs nothing beyond the client's own round-trip.
        if (typeof input.seq === "number") {
          client.send("move-ack", { seq: input.seq, x: player.x, y: player.y });
        }
      }
    );

    // Targeting: client requests a target (from a click or TAB-cycle);
    // server validates the target actually exists before committing it to
    // the player's synced state. Passing a falsy targetId/targetType
    // clears the current target. This is the single choke point future
    // combat code (e.g. an "attack" message) can reuse to re-validate a
    // player's current target before applying damage.
    this.onMessage(
      "set-target",
      (client, payload: { targetId?: string | null; targetType?: TargetType | null }) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        this.setPlayerTarget(player, payload?.targetId ?? null, payload?.targetType ?? null);
      }
    );

    // Global chat: sent as a broadcast message (not Schema state), since chat
    // history doesn't need to be synced/diffed like player state does - it's
    // fire-and-forget for whoever is currently in the room. No persistence
    // for MVP per SPEC.md. Swapping this for room.send-based proximity chat
    // later just means filtering the broadcast recipient list here.
    this.onMessage("chat", (client, payload: { text?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      if (!this.chatRateLimiter.canSend(client.sessionId)) return;

      const text = sanitizeMessage(payload?.text);
      if (!text) return;

      this.broadcast("chat-message", {
        username: player.username,
        text,
        timestamp: Date.now(),
      });
    });
  }

  onJoin(client: Client, options: { username?: string }) {
    const username = (options?.username || `Player${client.sessionId.slice(0, 4)}`).slice(0, 16);
    const saved = loadPlayer(username);

    const player = new Player();
    player.id = client.sessionId;
    player.username = username;
    player.level = saved.level;
    player.xp = saved.xp;
    // Default stat block - just "power" for now. Combat/classes work later
    // reads/writes this map without requiring another schema change.
    player.stats.set("power", saved.stats?.power ?? 10);
    // hp/maxHp aren't persisted yet (no combat to reduce them) - every
    // join starts full health. Revisit once damage/death/respawn exist.
    player.maxHp = 100;
    player.hp = 100;
    // Simple fixed spawn point near map center for the MVP.
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

      // Clear anyone who had the now-departed player targeted, so their
      // HUD target frame doesn't keep showing a target that no longer
      // exists. NPC targets never point at a player's sessionId, so no
      // equivalent cleanup is needed there.
      this.state.players.forEach((otherPlayer) => {
        if (otherPlayer.targetType === "player" && otherPlayer.targetId === client.sessionId) {
          otherPlayer.targetId = "";
          otherPlayer.targetType = "";
        }
      });

      console.log(`[leave] ${player.username} (saved level ${player.level}, xp ${player.xp})`);
    }
  }

  // Server-authoritative target validation. Silently ignores an invalid
  // target (unknown id/type) rather than erroring, since a mismatch here
  // just means a client's local candidate list was stale by a tick or two
  // (e.g. it clicked an NPC that despawned a moment earlier).
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

      // Normalize so diagonal movement isn't faster than cardinal movement.
      const len = Math.sqrt(dx * dx + dy * dy);
      dx = (dx / len) * MOVE_SPEED * dt;
      dy = (dy / len) * MOVE_SPEED * dt;

      this.tryMove(player, dx, dy);
    });
  }

  // Axis-separated movement: resolving X and Y independently lets a player
  // slide along a wall instead of stopping dead when moving diagonally into it.
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

  // Checks a small collision box (not just the center point) against the
  // tile grid so players can't clip a corner into a wall tile.
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

  // Treats NPCs as simple radius-based obstacles rather than tile-snapped
  // walls, since NPCs will eventually move (patrol/chase AI) and won't
  // always sit neatly on a tile boundary.
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

  // No combat yet - just a rate-limited notification so the client can show
  // a log message / bump feedback. This is the natural hook point for
  // damage-on-touch or aggro once combat exists.
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
    if (this.state.npcs.size >= MAX_HOSTILE_MOBS) return; // simple population cap

    const spawnPoint = findRandomWalkableSpawn();
    if (!spawnPoint) return;

    const npc = createHostileMob(spawnPoint.x, spawnPoint.y);
    this.state.npcs.set(npc.id, npc);
    console.log(`[npc] spawned ${npc.name} (${npc.id}) at (${spawnPoint.x}, ${spawnPoint.y})`);
  }

  private grantPassiveXp() {
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