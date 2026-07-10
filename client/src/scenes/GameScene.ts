import Phaser from "phaser";
import { NetworkManager, TargetType } from "../network/NetworkManager";
import { ChatUI } from "../ui/ChatUI";
import { TargetFrame } from "../ui/TargetFrame";
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, tileMap } from "../map/mapData";

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

  private getLocalPlayerPosition(): { x: number; y: number } | undefined {
    const visual = this.playerVisuals.get(this.localSessionId);
    return visual ? { x: visual.container.x, y: visual.container.y } : undefined;
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

  update() {
    this.handleInput();
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
      this.network.sendInput(input);
    }
  }

  private stopMovementIfNeeded() {
    const stopped = { up: false, down: false, left: false, right: false };
    const wasMoving =
      this.lastInput.up || this.lastInput.down || this.lastInput.left || this.lastInput.right;
    if (wasMoving) {
      this.lastInput = stopped;
      this.network.sendInput(stopped);
    }
  }

  private interpolateVisuals() {
    // Smoothly move every visual (including the local player, for MVP
    // simplicity) toward its latest server-confirmed position. True
    // client-side prediction for the local player is a good follow-up.
    this.playerVisuals.forEach((visual) => {
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
