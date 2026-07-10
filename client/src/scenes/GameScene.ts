import Phaser from "phaser";
import { NetworkManager, TargetType, MoveInput } from "../network/NetworkManager";
import { ChatUI } from "../ui/ChatUI";
import { TargetFrame } from "../ui/TargetFrame";
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, tileMap } from "../map/mapData";
import { simulateMove } from "../network/predictedMovement";

interface PlayerVisual {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
}

interface NpcVisual {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
}

// Distance-sortable candidate for TAB-cycling, built fresh each press from
// current Schema state (players + NPCs). Kept as a small local type rather
// than reusing PlayerVisual/NpcVisual since it only needs position + id/type.
interface TargetCandidate {
  id: string;
  type: TargetType;
  x: number;
  y: number;
}

// One entry per locally-simulated prediction step (see stepPrediction).
// Recorded so that when a "move-ack" arrives, we can discard the steps it
// already accounts for and replay only the ones simulated since - see
// reconcileFromAck().
interface PredictionHistoryEntry {
  seq: number;
  input: MoveInput;
  dt: number;
}

export class GameScene extends Phaser.Scene {
  private network = new NetworkManager();
  private playerVisuals = new Map<string, PlayerVisual>();
  private npcVisuals = new Map<string, NpcVisual>();
  private localSessionId = "";
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private lastInput = { up: false, down: false, left: false, right: false };
  private chatUI!: ChatUI;
  private targetFrame!: TargetFrame;

  // Mirrors the local player's own synced targetId/targetType (updated via
  // that player's onChange, same as the HUD). This is the single source of
  // truth for what the target frame shows and what TAB cycles "from" -
  // fully server-authoritative, no optimistic client-side guessing.
  private currentTargetId = "";
  private currentTargetType: TargetType | "" = "";

  // --- Client-side prediction state (local player only) ---
  // predictedX/Y is what actually drives the local player's on-screen
  // position every frame now, instead of the lerp-toward-server-state used
  // for remote players. serverX/Y is the latest confirmed position from
  // the normal Schema sync, used for gentle continuous correction. seq/
  // history support the sharper ack-based replay correction that fires
  // right when an input change is confirmed - see the big comment block
  // above reconcileFromAck() for why both exist.
  private predictedX = 0;
  private predictedY = 0;
  private serverX = 0;
  private serverY = 0;
  private inputSeq = 0;
  private inputHistory: PredictionHistoryEntry[] = [];


  // Tuning constants for reconciliation - see applyServerCorrection().
  private static readonly SNAP_THRESHOLD = TILE_SIZE * 1.5; // big desync -> snap instantly (rejoin, teleport)
  private static readonly CORRECTION_RATE = 0.15; // gentle per-frame pull for small, expected drift
  private static readonly MAX_FRAME_DELTA_MS = 250; // clamp guard against huge jumps (e.g. backgrounded tab)
  private static readonly MAX_HISTORY_ENTRIES = 200; // ~10s at 20Hz - bounds memory if acks stop arriving

  constructor() {
    super("GameScene");
  }

  create() {
    this.drawMap();
    this.setupInput();
    this.chatUI = new ChatUI((text) => this.network.sendChat(text));
    this.targetFrame = new TargetFrame();
    this.connectToServer();
  }

  private drawMap() {
    const graphics = this.add.graphics();
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const walkable = tileMap[y][x] === 0;
        graphics.fillStyle(walkable ? 0x2e7d32 : 0x555555, 1);
        graphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }
    const worldW = MAP_WIDTH * TILE_SIZE;
    const worldH = MAP_HEIGHT * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.physics.world.setBounds(0, 0, worldW, worldH);
  }

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey("W"),
      A: this.input.keyboard!.addKey("A"),
      S: this.input.keyboard!.addKey("S"),
      D: this.input.keyboard!.addKey("D"),
    };

    // TAB-cycle targeting. addCapture() tells Phaser to intercept this key
    // at the native DOM level immediately, synchronously preventing the
    // browser's default Tab-focus-cycling behavior. Just calling
    // event.preventDefault() inside the keydown-TAB handler below is NOT
    // reliable on its own - Phaser's keyboard plugin processes queued key
    // events during its own update loop, which can run after the browser
    // has already moved focus, causing exactly the "sometimes" behavior.
    this.input.keyboard!.addCapture("TAB");
    this.input.keyboard!.on("keydown-TAB", () => {
      if (this.chatUI.isFocused()) return; // don't hijack Tab while typing chat
      this.cycleTarget();
    });

    // Escape-to-deselect. Guarded the same way as TAB: while chat is
    // focused, Escape's job is to blur the chat input (handled in
    // ChatUI itself) - it shouldn't also clear the target underneath.
    this.input.keyboard!.on("keydown-ESC", () => {
      if (this.chatUI.isFocused()) return;
      this.clearTarget();
    });

    // Click-on-empty-space-to-deselect. Phaser's scene-level "pointerdown"
    // event includes a list of every interactive game object under the
    // pointer at click time. Player/NPC shapes are interactive (see
    // makeTargetable) and so is any future in-canvas UI - a hotbar or
    // minimap built from Phaser GameObjects just needs setInteractive()
    // called on it (even with a no-op handler) to be excluded here
    // automatically. An empty list means the click landed on bare map
    // (grass/dirt/water/wall) with nothing interactive under it, so we
    // clear the target. HTML overlays (HUD, chat, target frame, and any
    // future DOM-based UI) never reach this handler at all, since a click
    // on them never reaches the canvas underneath - no extra guard needed.
    this.input.on(
      "pointerdown",
      (_pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        if (currentlyOver.length === 0) {
          this.clearTarget();
        }
      }
    );
  }

  private async connectToServer() {
    const username =
      window.prompt("Enter a username:", "Hero") || `Hero${Math.floor(Math.random() * 1000)}`;
    const room = await this.network.connect(username);
    this.localSessionId = room.sessionId;

    room.state.players.onAdd((player: any, sessionId: string) => {
      this.addPlayerVisual(sessionId, player);

      player.onChange(() => {
        const visual = this.playerVisuals.get(sessionId);
        if (!visual) return;
        visual.targetX = player.x;
        visual.targetY = player.y;
        visual.label.setText(`${player.username} (Lv.${player.level})`);

        if (sessionId === this.localSessionId) {
          this.updateHud(player.username, player.level, player.xp);

          // Latest authoritative reference point, used by
          // applyServerCorrection() for gentle continuous drift
          // correction. NOT applied directly to the container - the
          // container's position is driven every frame by predictedX/Y
          // in stepPrediction(), so a stale/late patch here can never
          // cause a visible jump on its own.
          this.serverX = player.x;
          this.serverY = player.y;

          // Track our own confirmed target and refresh the frame. Reading
          // this off the Schema (rather than a local click-time guess)
          // keeps the target frame authoritative - if the server rejected
          // an invalid click/TAB request, this simply won't change.
          this.currentTargetId = player.targetId;
          this.currentTargetType = (player.targetType as TargetType) || "";
          this.refreshTargetFrame();
        }
      });
    });

    room.state.players.onRemove((_player: any, sessionId: string) => {
      const visual = this.playerVisuals.get(sessionId);
      if (visual) {
        visual.container.destroy();
        this.playerVisuals.delete(sessionId);
      }
    });

    room.state.npcs.onAdd((npc: any, npcId: string) => {
      this.addNpcVisual(npcId, npc);

      npc.onChange(() => {
        const visual = this.npcVisuals.get(npcId);
        if (!visual) return;
        visual.targetX = npc.x;
        visual.targetY = npc.y;
        visual.label.setText(`${npc.name} (Lv.${npc.level})`);

        // If this NPC is our current target, its hp/level may have just
        // changed (future combat) - refresh immediately rather than
        // waiting for the next frame's poll.
        if (this.currentTargetType === "npc" && this.currentTargetId === npcId) {
          this.refreshTargetFrame();
        }
      });
    });

    room.state.npcs.onRemove((_npc: any, npcId: string) => {
      const visual = this.npcVisuals.get(npcId);
      if (visual) {
        visual.container.destroy();
        this.npcVisuals.delete(npcId);
      }
      // Don't clear currentTarget* here - the server already clears a
      // player's target when the targeted entity goes away (players, on
      // leave). NPCs don't currently despawn, but if they do later, the
      // next refreshTargetFrame() call will safely no-op on a missing id.
    });

    room.onMessage("level-up", (msg: { username: string; level: number }) => {
      this.showToast(`${msg.username} reached level ${msg.level}!`);
    });

    room.onMessage("chat-message", (msg: { username: string; text: string; timestamp: number }) => {
      this.chatUI.addMessage(msg.username, msg.text, msg.timestamp);
    });

    room.onMessage(
      "npc-contact",
      (msg: { sessionId: string; npcId: string; npcName: string; isHostile: boolean }) => {
        if (msg.sessionId !== this.localSessionId) return; // only react to our own contact
        const prefix = msg.isHostile ? "⚔️ " : "";
        this.showToast(`${prefix}Bumped into ${msg.npcName}!`, msg.isHostile ? "211,47,47" : "255,179,0");
      }
    );

    // Client-side prediction reconciliation: the server echoes back the
    // seq we tagged an outbound "move" message with, plus our confirmed
    // position as of processing that input change. See reconcileFromAck()
    // for the replay logic this drives.
    room.onMessage("move-ack", (msg: { seq: number; x: number; y: number }) => {
      this.reconcileFromAck(msg);
    });
  }

  private addPlayerVisual(sessionId: string, player: any) {
    const isLocal = sessionId === this.localSessionId;
    const color = isLocal ? 0x42a5f5 : 0xef5350;

    const circle = this.add.circle(0, 0, TILE_SIZE * 0.3, color);
    const label = this.add
      .text(0, -TILE_SIZE * 0.7, `${player.username} (Lv.${player.level})`, {
        fontSize: "11px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    const container = this.add.container(player.x, player.y, [circle, label]);

    // Click-to-target. Interactive is set on the shape itself (not the
    // container) - Circle/Rectangle Shape objects have well-defined
    // geometry Phaser can hit-test natively, which is more reliable than a
    // manually-specified container hit area. Skipped for the local player -
    // targeting yourself isn't useful yet.
    if (!isLocal) {
      this.makeTargetable(circle, sessionId, "player");
    }

    if (isLocal) {
      // Seed prediction state from our spawn position so the very first
      // frame doesn't jump - predictedX/Y (not player.x/y) drives this
      // container from here on out, see stepPrediction().
      this.predictedX = player.x;
      this.predictedY = player.y;
      this.serverX = player.x;
      this.serverY = player.y;

      this.cameras.main.startFollow(container, true, 0.15, 0.15);
      this.updateHud(player.username, player.level, player.xp);
    }

    this.playerVisuals.set(sessionId, {
      container,
      label,
      targetX: player.x,
      targetY: player.y,
    });
  }

  // Rectangles (vs. players' circles) so NPCs read as visually distinct at
  // a glance. Red = hostile; amber reserved for future neutral/friendly NPCs.
  private addNpcVisual(npcId: string, npc: any) {
    const color = npc.isHostile ? 0xd32f2f : 0xffb300;
    const size = TILE_SIZE * 0.32;

    const body = this.add
      .rectangle(0, 0, size * 2, size * 2, color)
      .setStrokeStyle(1, 0x000000, 0.4);
    const label = this.add
      .text(0, -TILE_SIZE * 0.7, `${npc.name} (Lv.${npc.level})`, {
        fontSize: "11px",
        color: npc.isHostile ? "#ff8a80" : "#ffe082",
      })
      .setOrigin(0.5);

    const container = this.add.container(npc.x, npc.y, [body, label]);
    this.makeTargetable(body, npcId, "npc");

    this.npcVisuals.set(npcId, {
      container,
      label,
      targetX: npc.x,
      targetY: npc.y,
    });
  }

  // Shared click-to-target wiring for player/NPC shape objects. Called on
  // the circle/rectangle itself (a Shape GameObject with defined geometry)
  // rather than the parent container, which Phaser hit-tests more
  // reliably than a manually-specified container hit area. Interactive
  // children of a Container are fully supported and still hit-test
  // correctly as the container moves/interpolates.
  private makeTargetable(shape: Phaser.GameObjects.Shape, id: string, type: TargetType) {
    shape.setInteractive({ useHandCursor: true });
    shape.on("pointerdown", () => this.setTarget(id, type));
  }

  // Sends a target request to the server. Purely a request - the target
  // frame only updates once the server echoes back the confirmed
  // targetId/targetType on our own player (see the onChange handler
  // above), keeping this fully server-authoritative.
  private setTarget(id: string, type: TargetType) {
    this.network.sendSetTarget(id, type);
  }

  // Requests the target be cleared (Escape, or clicking empty map space).
  // Same server round-trip as setTarget - null/null tells the server to
  // reset targetId/targetType to "" (see OverworldRoom.setPlayerTarget).
  private clearTarget() {
    this.network.sendSetTarget(null, null);
  }

  // Builds a fresh, distance-sorted candidate list from current Schema
  // state each press (players + NPCs, excluding ourselves) and advances to
  // the next one after whatever we're currently targeting - wrapping
  // around at the end of the list.
  private cycleTarget() {
    const room = this.network.room;
    const localPos = this.getLocalPlayerPosition();
    if (!room || !localPos) return;

    const candidates: TargetCandidate[] = [];

    room.state.players.forEach((player: any, sessionId: string) => {
      if (sessionId === this.localSessionId) return;
      candidates.push({ id: sessionId, type: "player", x: player.x, y: player.y });
    });
    room.state.npcs.forEach((npc: any, npcId: string) => {
      candidates.push({ id: npcId, type: "npc", x: npc.x, y: npc.y });
    });

    if (candidates.length === 0) return;

    candidates.sort(
      (a, b) =>
        Phaser.Math.Distance.Between(localPos.x, localPos.y, a.x, a.y) -
        Phaser.Math.Distance.Between(localPos.x, localPos.y, b.x, b.y)
    );

    const currentIndex = candidates.findIndex(
      (c) => c.id === this.currentTargetId && c.type === this.currentTargetType
    );
    const next = candidates[(currentIndex + 1) % candidates.length];
    this.setTarget(next.id, next.type);
  }

  // Now reads from predictedX/Y (the local player's actual rendered
  // position) rather than the container directly, though at present these
  // are the same thing every frame - kept as a named accessor since
  // "where's the local player" is a meaningful concept future systems
  // (e.g. melee range checks) will also want.
  private getLocalPlayerPosition(): { x: number; y: number } | undefined {
    if (!this.playerVisuals.has(this.localSessionId)) return undefined;
    return { x: this.predictedX, y: this.predictedY };
  }

  // Reads whatever we're currently targeting straight from Schema state
  // and pushes it into the target frame. Called on every target-relevant
  // onChange AND once per game tick below, so the HP bar stays live even
  // before any explicit combat system exists to trigger onChange itself.
  private refreshTargetFrame() {
    const room = this.network.room;
    if (!room || !this.currentTargetId || !this.currentTargetType) {
      this.targetFrame.clear();
      return;
    }

    if (this.currentTargetType === "player") {
      const target = room.state.players.get(this.currentTargetId);
      if (!target) {
        this.targetFrame.clear();
        return;
      }
      this.targetFrame.update(target.username, target.level, target.hp, target.maxHp);
    } else {
      const target = room.state.npcs.get(this.currentTargetId);
      if (!target) {
        this.targetFrame.clear();
        return;
      }
      this.targetFrame.update(target.name, target.level, target.hp, target.maxHp);
    }
  }

  update(_time: number, delta: number) {
    this.handleInput();
    this.stepPrediction(delta);
    this.interpolateVisuals();
    this.refreshTargetFrame();
  }

  private handleInput() {
    if (!this.network.room) return;

    if (this.chatUI.isFocused()) {
      // If a movement key was held down right as the player clicked into
      // chat, make sure the server hears "stop" - otherwise it keeps
      // simulating movement from the last input state it received, since
      // we're no longer sending updates while focused.
      this.stopMovementIfNeeded();
      return;
    }

    const input = {
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
    };

    // Only send when input state changes - keeps bandwidth minimal since
    // the server simulates continuous movement itself between messages.
    const changed =
      input.up !== this.lastInput.up ||
      input.down !== this.lastInput.down ||
      input.left !== this.lastInput.left ||
      input.right !== this.lastInput.right;

    if (changed) {
      this.lastInput = input;
      // Tag with the current seq BEFORE stepPrediction() advances it this
      // frame - this seq represents "everything simulated up to here used
      // the OLD input." The server echoes it back once processed, and
      // reconcileFromAck() replays every step recorded AFTER this seq
      // (which will all have used the NEW input) on top of the server's
      // confirmed position. See predictedMovement.ts's header comment.
      this.network.sendInput(input, this.inputSeq);
    }
  }

  private stopMovementIfNeeded() {
    const stopped = { up: false, down: false, left: false, right: false };
    const wasMoving =
      this.lastInput.up || this.lastInput.down || this.lastInput.left || this.lastInput.right;
    if (wasMoving) {
      this.lastInput = stopped;
      this.network.sendInput(stopped, this.inputSeq);
    }
  }


  private stepPrediction(delta: number) {
  if (!this.network.room || !this.playerVisuals.has(this.localSessionId)) return;
  if (this.chatUI.isFocused()) return; // movement is suppressed while typing, mirroring the server

  // Simulate every rendered frame directly with that frame's real delta,
  // rather than batching into fixed 50ms chunks. Batching was matched to
  // the server's 20Hz tick for reconciliation accuracy, but it meant the
  // local player's on-screen position only actually changed ~20 times/sec
  // - visually choppy, even though input itself was still instant.
  // Reconciliation doesn't care what step size was used (each history
  // entry stores its own dt - see simulateLocalStep), so per-frame
  // variable-dt stepping is simulation-fair and fixes the smoothness.
  const clampedDelta = Math.min(delta, GameScene.MAX_FRAME_DELTA_MS);
  this.simulateLocalStep(clampedDelta / 1000);

  this.applyServerCorrection();

  const visual = this.playerVisuals.get(this.localSessionId);
  if (visual) {
    visual.container.x = this.predictedX;
    visual.container.y = this.predictedY;
  }
}

  private simulateLocalStep(dt: number) {
    this.inputSeq++;
    const input: MoveInput = { ...this.lastInput };

    this.inputHistory.push({ seq: this.inputSeq, input, dt });
    if (this.inputHistory.length > GameScene.MAX_HISTORY_ENTRIES) {
      this.inputHistory.splice(0, this.inputHistory.length - GameScene.MAX_HISTORY_ENTRIES);
    }

    const result = simulateMove(this.predictedX, this.predictedY, input, dt);
    this.predictedX = result.x;
    this.predictedY = result.y;
  }

  // Gentle, continuous pull of the prediction toward the latest confirmed
  // server position (updated on every local-player onChange, i.e. roughly
  // every tick the server actually moved us). This is what catches drift
  // that isn't tied to a specific input-change message - e.g. holding a
  // movement key into a wall for a while, where minor differences between
  // the client's and server's per-tick collision resolution could
  // otherwise slowly accumulate. Small errors get nudged in smoothly;
  // large ones (rejoining, a future teleport/respawn) snap immediately
  // rather than visibly sliding across the map.
private applyServerCorrection() {
  const errX = this.serverX - this.predictedX;
  const errY = this.serverY - this.predictedY;
  const dist = Math.hypot(errX, errY);

  if (dist > GameScene.SNAP_THRESHOLD) {
    this.predictedX = this.serverX;
    this.predictedY = this.serverY;
  } else if (dist > 1.5) { // was 0.25 - ignore sub-pixel noise near walls
    this.predictedX += errX * GameScene.CORRECTION_RATE;
    this.predictedY += errY * GameScene.CORRECTION_RATE;
  }
}

// Fires when a "move-ack" arrives (see connectToServer). `ack.x/y` is the
// server's authoritative position at the moment it processed the input
// change we tagged with `ack.seq` - note this reflects the server having
// kept simulating with the *previous* input for the entire network
// round-trip (it doesn't know about our new input until this message
// arrives), so it can legitimately be further along than where we
// visually stopped/turned locally. That's expected, not drift to hide -
// but it means writing it straight into predictedX/Y would produce a
// visible pop exactly when stopping or changing direction.
//
// Instead: replay every history entry recorded after this ack's seq (the
// steps we predicted locally after sending this input change) on top of
// ack.x/y to get our best current estimate of the true position, then
// hand that to serverX/Y - the same reference applyServerCorrection()
// already blends predictedX/Y toward every frame. This folds ack-driven
// correction into the same smooth catch-up as ordinary onChange-driven
// correction, instead of a separate instant snap.
private reconcileFromAck(ack: { seq: number; x: number; y: number }) {
  this.inputHistory = this.inputHistory.filter((entry) => entry.seq > ack.seq);

  let x = ack.x;
  let y = ack.y;
  for (const entry of this.inputHistory) {
    const result = simulateMove(x, y, entry.input, entry.dt);
    x = result.x;
    y = result.y;
  }

  this.serverX = x;
  this.serverY = y;
}

  private interpolateVisuals() {
    // Remote players still interpolate toward the last synced position -
    // unchanged. The local player is deliberately skipped here: its
    // container position is driven directly by predictedX/Y in
    // stepPrediction() every frame, which is what makes its movement feel
    // instant instead of lerped.
    this.playerVisuals.forEach((visual, sessionId) => {
      if (sessionId === this.localSessionId) return;
      visual.container.x = Phaser.Math.Linear(visual.container.x, visual.targetX, 0.25);
      visual.container.y = Phaser.Math.Linear(visual.container.y, visual.targetY, 0.25);
    });

    // NPCs are static for the MVP, so this is a no-op in practice today -
    // but it means patrol/chase AI later gets smooth movement for free.
    this.npcVisuals.forEach((visual) => {
      visual.container.x = Phaser.Math.Linear(visual.container.x, visual.targetX, 0.25);
      visual.container.y = Phaser.Math.Linear(visual.container.y, visual.targetY, 0.25);
    });
  }

  private updateHud(username: string, level: number, xp: number) {
    const nameEl = document.getElementById("hud-name");
    const levelEl = document.getElementById("hud-level");
    const xpFillEl = document.getElementById("xp-bar-fill") as HTMLElement | null;
    if (nameEl) nameEl.textContent = username;
    if (levelEl) levelEl.textContent = `Level ${level}`;
    if (xpFillEl) {
      const needed = level * 100;
      const pct = Math.min(100, (xp / needed) * 100);
      xpFillEl.style.width = `${pct}%`;
    }
  }

  private showToast(message: string, color = "76,175,80") {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText =
      "position:absolute;top:60px;left:50%;transform:translateX(-50%);" +
      `background:rgba(${color},0.9);color:#fff;padding:8px 16px;border-radius:6px;` +
      "font-family:sans-serif;z-index:20;";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }
}