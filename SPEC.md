# VibeRealm - Browser MMORPG Project Specification

**Last Updated:** 2026-07-10
**Version:** 0.7 (MVP In Progress)
**Status:** Playable MVP - movement (with client-side prediction), leveling, chat, NPCs, targeting, a login screen, disconnect handling, and a server-authoritative admin command system are implemented; the overworld room is persistent across client connects/disconnects.
**Project Goal:** Build a playable MVP iteratively, one feature at a time, with Claude as ongoing development partner.

## 1. Vision & High-Level Goals
VibeRealm is a lightweight, browser-based 2D top-down MMORPG. It emphasizes **real-time multiplayer exploration** in a shared small overworld, simple but satisfying **leveling and progression**, and social features like chat. Graphics are intentionally simple (colored shapes, basic tiles, text labels) to allow rapid development and focus on **mechanically intricate systems** that can be expanded over time.

Core fantasy: A cozy yet adventurous persistent world where players can see each other, level up through exploration and future activities, target and fend off (eventually fight) hostile mobs, and build a small community. The game is designed for solo development with AI assistance (Claude), easy local testing, and low-cost hosting for friends. The developer (as server operator) can also moderate and manage that world directly, via server console or in-game admin commands.

**Target Audience:** Friends, indie game enthusiasts, and the developer (for learning and fun).
**Success Metrics for MVP:** 2+ concurrent players can connect (including over the internet, not just LAN) via a proper login screen, move around a shared world with responsive, non-laggy-feeling controls, gain levels, chat in real-time, encounter simple hostile NPCs, target players/NPCs to see their name/level/HP, be returned cleanly to login if disconnected, and have the developer able to moderate/manage the world (ban, kick, grant XP, shut down gracefully) - all while the shared world itself (players' saved progress, NPCs) persists independently of any single client's connection, for as long as the server process runs.

## 2. Tech Stack
- **Backend:** Colyseus (imported directly via `@colyseus/core`, not the `colyseus` meta-package - see Section 9 for why) + TypeScript + Node.js.
- **Frontend:** Phaser 3 (game rendering, camera, input handling, Arcade Physics for bounds) + plain HTML/CSS overlay for the login screen, HUD, target frame, and chat. Built with Vite.
- **Persistence (MVP):** In-memory state (Colyseus Schema `MapSchema`) + username-based JSON file save/load (`server/data/players.json`) for level/xp/stats. Also JSON files for admin roles (`server/data/admins.json`) and bans (`server/data/bans.json`) - see Section 3c. Future: SQLite or Postgres, same load/save function signatures.
- **Development Tools:** Git, VS Code (or similar), Claude Projects for AI assistance.
- **Hosting:** Self-hosted on the developer's own machine with router port forwarding (single port, see Section 3). Render.com/Railway.app remain options for future always-on hosting.

**Alternatives Considered:** Socket.io + Express (originally planned, replaced early with Colyseus for built-in Schema-based delta sync and room/instancing support). Pure Canvas (more boilerplate). Heavy frameworks like React (unnecessary for a game loop).

## 3. Architecture Overview

- **Client-Server Model:** Fully server-authoritative. Clients send only input state (movement keys, chat text, target selection, and now admin command text); the server simulates, validates, and syncs everything else.
  - **Movement is client-side predicted with server reconciliation** (see the dedicated Section 3a below). Remote players and NPCs still interpolate toward server-confirmed positions; only the local player's own movement is predicted.
  - Target selection follows the same request/validate/echo pattern: a client's click/TAB press is a *request*, and the target frame only updates once the server has validated and echoed it back via synced state - never assumed optimistically client-side. (Combat, when it arrives, is expected to follow this same request/validate/echo pattern rather than prediction, since instant "did I hit" client-side guessing is much riskier to get right than movement.)
  - **Client entry is now gated by a login screen** and **the shared overworld room is persistent** across client connects/disconnects - see Section 3b below for both.
  - **Admin commands** (server console or in-game `/`-prefixed chat) are validated, executed, and logged entirely server-side via a shared command registry - see Section 3c below.
- **Core Components:**
  - **Colyseus Rooms**: The main overworld runs in a single, persistent `OverworldRoom` (see Section 3b). Future dungeons/housing can use separate Room types for instancing.
  - **Colyseus Schemas**: `Player` and `Npc` both live in `OverworldState` as `MapSchema`s. Clients receive only deltas/patches for efficiency - critical for scaling to hundreds of players.
    - `Player` carries `hp`/`maxHp` (groundwork for Combat MVP, not yet consumed by any combat logic) and `targetId`/`targetType` (synced).
    - `Npc` also carries `targetId`/`targetType`, but deliberately **not** synced (no `@type` decorator).
  - **Targeting System**: Client requests (click or TAB) are validated server-side via `set-target` before being committed to synced state.
  - **Admin Command System**: A single `CommandRegistry` (server-only, not part of any Schema) that both server console input and in-game chat route into - see Section 3c.
  - **Client-Side Movement Prediction & Reconciliation**: See Section 3a.
  - **Login Screen & Session Lifecycle**: See Section 3b.
  - **Interest Management / Spatial Awareness**: Not yet implemented. NPC-vs-player collision, and target-candidate gathering for TAB-cycling, are both O(n) checks per relevant tick/keypress - fine at MVP scale, flagged as the first thing to revisit if entity counts grow.
  - **Game Logic Separation**: Networking/state handled by Colyseus; game rules (movement validation, collision, leveling, chat moderation, NPC spawning, target validation, admin commands) live in clearly separated modules/methods for easier testing and future extraction.
- **Data Flow**: Client shows a login screen on load → on submit, it connects and joins/creates `"overworld"` (rejected at `onAuth` if the username is banned) → once joined, the client sends input state (movement flags, tagged with a prediction sequence number), a chat/action message (including admin commands, prefixed with `/`), or a target request → `OverworldRoom` simulates/validates on a fixed 20Hz tick (movement) or immediately on message receipt (chat, targeting, move-ack, admin commands) → Schema state updates → Colyseus automatically broadcasts patches to relevant clients. If the client's connection to the room ever ends (see Section 3b), it tears down its local visuals/state and returns to the login screen. Chat messages remain a separate fire-and-forget broadcast event, not part of Schema state; admin command replies are similarly a unicast fire-and-forget message, not Schema state.
- **Extensibility**: Designed so adding combat, classes, skills, NPC AI, new Room types, or new admin commands requires minimal changes to the core networking layer. `Npc` schema deliberately mirrors `Player`'s shape so future combat code can treat "anything with hp/stats/a target" uniformly. New admin commands are a single `commandRegistry.register({...})` call (Section 3c) - a future HTTP-based web admin panel would be a third caller of the same `commandRegistry.execute()` function, alongside console and chat.
- **Deployment model - unified for dev AND production:** The Express server serves the client's build (`client/dist/`) on the same port Colyseus's WebSocket transport uses, so only **one process and one port** are involved end-to-end, in both development and when playing with friends. Day-to-day development is: `cd client && npm run build` once (and again after any client-side change), then `cd server && npm run dev` - connect at `http://localhost:2567` (or the LAN/public IP, same port). **Important habit:** the server does not currently watch/rebuild the client automatically - after editing anything under `client/src` or `client/index.html`, you must re-run `npm run build` in `client/` and hard-refresh the browser before the change will show up. The server terminal is now also an interactive admin console once running (see Section 3c) - typing there works alongside the normal `npm run dev` log output.
- **Project Structure:** Two independent npm packages, not a single monorepo - chosen so the Vite-based Phaser client and the Colyseus/Node server can each use their own tooling, TS config, and dependency versions without conflict.

### 3a. Client-Side Movement Prediction & Reconciliation

**Problem it solves:** waiting for a full server round-trip before the local player visibly moves feels laggy and cumbersome, even on a fast connection, because every keypress has to cross the network twice (client→server→client) before anything changes on screen.

**How it works:**
- The client mirrors the server's exact movement/collision math in a new module (`client/src/network/predictedMovement.ts`) - same `MOVE_SPEED`, same axis-separated wall-collision box. This is a **third duplicated copy of movement logic** (alongside the existing server/client `mapData.ts` tile-data duplication) and must be kept in sync manually if either ever changes - flagged the same way as the tile-data duplication already is.
- Every rendered frame, the client immediately simulates the local player's movement using that frame's real delta time (**not** a fixed-timestep batch). This *predicted* position (`predictedX/Y` in `GameScene`) is what actually renders the local player - remote players/NPCs are unaffected and still interpolate as before.
- Each local step is recorded in a short rolling history buffer (`{seq, input, dt}`). Every time the client sends a `"move"` message (still only on input-state-change, as before), it's tagged with the current sequence number.
- The server, after applying an input change, unicasts back a `"move-ack"` message: `{seq, x, y}` - its authoritative position *at the moment it received that input change*.
- The client discards history entries at or before that `seq`, then **replays** the remaining (already-locally-predicted) steps on top of the server-confirmed position to get its best current position estimate, written to a separate `serverX/Y` reference point (not directly into `predictedX/Y`, to avoid a visible "skip forward" when stopping/turning).
- Every frame, `predictedX/Y` is gently blended toward `serverX/Y` (`applyServerCorrection`): small differences get nudged in smoothly; large differences (e.g. rejoining, a future teleport/respawn) snap instantly rather than visibly sliding across the map.
- **Known accepted trade-off:** NPC collision is **not** predicted client-side (only wall/tile collision is) - NPCs are currently static.
- **Guard against runaway catch-up:** per-frame delta is clamped (`MAX_FRAME_DELTA_MS`) so a backgrounded browser tab returning with a huge delta doesn't cause a sudden simulated leap.

### 3b. Login Screen & Session Lifecycle

**Problem it solves:** the previous flow used a blocking `window.prompt()` for a username immediately on page load, with no graceful handling if the connection ever dropped - a disconnected client just sat on a frozen/broken scene. Separately, the shared overworld room was quietly being destroyed and recreated (losing all NPCs) any time the last connected client left, because Colyseus rooms default to disposing themselves once empty.

**Client-side flow (login + disconnect):**
- A proper HTML/CSS login screen (`client/index.html` `#login-screen`, wrapped by `client/src/ui/LoginScreen.ts`) is shown by default, as a full-viewport overlay above the game canvas (z-index above the in-game HUD). It collects a username via a form (a password field slot exists in the markup, hidden and unused, for future auth) and calls back into `GameScene.connectToServer(username)` on submit.
- `GameScene.create()` no longer auto-connects - it sets up the map/input/HUD modules and the `LoginScreen` callback, then waits. Only once a room join succeeds does `LoginScreen.hide()` get called, revealing the game.
- A failed join attempt (server unreachable, banned username, etc.) shows an inline error on the login screen rather than failing silently. **Known limitation:** a banned username currently surfaces the same generic `"Couldn't connect to the server. Please try again."` message as any other join failure (see Section 3c and Section 10) - the specific ban reason set server-side in `onAuth` isn't yet threaded through to this UI copy.
- After a successful join, the client registers `room.onLeave((code) => ...)`, colyseus.js's built-in event for "this client's connection to the room has ended" - whether from an explicit kick/ban, a server restart/crash, or the network just dropping. This fires `GameScene.handleDisconnect()`, which:
  - Tears down all player/NPC visuals and resets local prediction/targeting state (`resetGameState()`) - necessary because Phaser reuses the same `GameScene` instance across login attempts rather than recreating it, so nothing from the old session should leak into the next one.
  - Shows the login screen again with a `"Disconnected from the server."` message, letting the player log back in (same or different username) without a page reload.
- An `isConnected` boolean flag on `GameScene` gates the entire per-frame `update()` loop, plus outbound target/chat sends, so nothing tries to talk to a closed/absent room while the login screen is up.
- **Keyboard input isolation:** Phaser's keyboard plugin listens globally on `window` and calls `preventDefault()` on any key bound via `addKey()` - including W/A/S/D - regardless of DOM focus. Both the chat input (`ChatUI`, pre-existing) and the login username field (`LoginScreen`) call `e.stopPropagation()` on their own `keydown` listeners so typing in either field never reaches Phaser's global handler and gets swallowed as a movement key.
- **Known accepted trade-off:** there's no automatic reconnect/retry - a dropped connection always requires the player to manually submit the login form again. No session-resume (rejoining mid-session with the same identity/position) exists yet either. Both are natural next increments on top of this (see Roadmap).

**Server-side flow (persistent room):**
- `OverworldRoom` now sets `this.autoDispose = false;` as the first line of `onCreate()`. (`autoDispose` is a getter/setter *accessor* on the base Colyseus `Room` class, not a plain field - it must be assigned via `this.autoDispose = ...` inside a method, not declared as a class property, or TypeScript raises TS2610.)
- **Why this was needed:** Colyseus's default (`autoDispose = true`) destroys a room - and all its state, including every spawned NPC - shortly after its last connected client leaves. Since VibeRealm's overworld is meant to be one persistent shared world (not a disposable per-session room), the *next* `joinOrCreate("overworld", ...)` was silently creating a **brand-new room with empty state**, which is why NPCs (and, had anyone tested it, any other room-only state) were vanishing across a disconnect/reconnect even though the server process itself never restarted.
- With `autoDispose = false`, the room - and its simulation tick, passive-XP interval, and NPC spawner interval - keeps running even with zero clients connected, for as long as the server process is alive. This matches the "living world" fantasy (the world doesn't pause between sessions) and is a deliberate, permanent choice for VibeRealm's single-shared-overworld design, not a temporary workaround.
- **Known accepted trade-off:** the NPC spawner and passive-XP timers now tick even while nobody is connected. Harmless today - passive XP has no players to apply to, and the NPC population cap (`MAX_HOSTILE_MOBS`) still applies - but worth remembering if a future system on one of these intervals ever becomes non-trivial to run with zero players present.
- Per-player data (level/xp/stats) was already persisted to `server/data/players.json` independently of room lifecycle and is unaffected by this change - this fix is specifically about *room-scoped* state (NPCs today; anything else room-scoped in the future) surviving emptiness, not about player save data (which was already safe).

### 3c. Admin Command System *(new in v0.7)*

**Problem it solves:** managing a live shared world (banning a griefer, granting test XP, force-removing a stuck NPC, shutting the server down cleanly before a restart) previously required editing files or killing the process outright - there was no in-world or in-terminal way to moderate/manage state while the server was running.

**Design - one registry, multiple entry points:**
- A single `CommandRegistry` (`server/src/admin/commandRegistry.ts`) maps a command name (e.g. `"ban"`) to a handler function (`CommandDefinition`). Registering a new command is one `commandRegistry.register({...})` call in `server/src/admin/commands.ts` - nothing about the registry, console input, or chat integration needs to change.
- Two entry points feed the same `commandRegistry.execute()` function today:
  - **Server console** (`server/src/admin/consoleInput.ts`) - uses Node's built-in `readline` to turn the server's own terminal into an interactive prompt (`viberealm> `) once the server is listening. The console is always treated as admin, since it's the person running the process.
  - **In-game chat** - any chat message starting with `/` is intercepted in `OverworldRoom`'s existing `"chat"` message handler *before* sanitization/rate-limiting, and routed into the registry instead of being broadcast as a normal message.
  - Both pass an `actor` (console vs. chat, with username/sessionId for chat), a `reply` callback (`console.log` for console; a new unicast `"command-reply"` message for chat), and a small `AdminRoomApi` view of the currently-active room.
  - This is intentionally the same shape a **future web admin panel** would use - it would just be a third caller of `commandRegistry.execute()`, with its own actor type and an HTTP response as the `reply` callback, requiring no changes to the registry or existing commands.
- **Permissions (MVP):** each command definition has an `adminOnly` flag. A chat-originated actor is admin if their username appears in `server/data/admins.json` (a plain JSON array, auto-created empty on first run) or the `ADMIN_USERNAMES` env var (comma-separated) - both checked case-insensitively. This is intentionally simple (no passwords/roles beyond "is or isn't an admin") and matches VibeRealm's existing username-only auth model; see Section 8 for the trust-model caveat this implies.
- **Bans:** persisted to `server/data/bans.json` (username, reason, who banned them, timestamp). Checked in a new `OverworldRoom.onAuth()`, which runs *before* `onJoin` - a banned username's join is rejected outright (no `Player` is ever created for it) rather than letting them join and then kicking them a moment later. `/ban` also immediately disconnects the target if they're currently online; `/unban` reverses it.
- **Logging:** every command attempt - success, permission denial, or unknown command - is logged server-side via `console.log`/`console.error` in the registry's `execute()` method, regardless of which entry point it came from. This is the closest thing to an audit trail today (see Section 10 for the "pipe stdout to a file" follow-up).
- **Built-in commands (MVP):** `/help`, `/who` (list connected players), `/quit` (graceful shutdown - broadcasts a warning, then closes the HTTP/WebSocket server and exits), `/ban <username> [reason]`, `/unban <username>`, `/kick <username> [reason]` (disconnect without banning), `/kill <player|npc identifier>` (removes an NPC outright, or - since there's no death/respawn system yet - zeroes a player's HP and disconnects them), `/givexp <username|sessionId> <amount>` (reuses the exact same level-up loop as passive XP, now pulled into a shared `OverworldRoom.grantXp()` method).
- **Entity lookup:** commands that target a specific player or NPC (`/ban`, `/kick`, `/kill`, `/givexp`) use a shared helper (`server/src/admin/entityLookup.ts`) that tries an exact Colyseus sessionId/npcId match first, then falls back to a case-insensitive username/name scan - so an admin can type either a display name or a raw session id.
- **Known accepted MVP trade-offs:**
  - `/kill` on a player is a stand-in for a real death system that doesn't exist yet (Roadmap #1) - it's honestly "zero hp and disconnect," not a proper death/respawn flow.
  - `command-reply` and `server-shutdown` messages are sent to the client but not yet rendered anywhere in the UI (they currently only show up in the browser dev console) - wiring them into the existing chat/toast UI is a small near-term follow-up (see Roadmap).
  - The banned-user login error isn't yet distinguished from a generic connection failure in the login screen's copy (see Section 3b and Section 10).
  - `admins.json`/`bans.json` are re-read from disk on every check rather than cached, mirroring the existing `players.json` trade-off - fine at MVP's call frequency.
  - Only one `OverworldRoom` instance is tracked as "the" active room for admin purposes (`server/src/admin/adminRuntime.ts`), matching VibeRealm's current single-shared-overworld design; this would need to become a lookup-by-room-id if multiple concurrent room instances (e.g. future dungeons) ever needed admin command support too.

## 4. Data Models & Schemas

**Player Schema** (Colyseus Schema, `server/src/rooms/schema/Player.ts`):
```ts
class Player extends Schema {
  @type("string") id;
  @type("string") username;
  @type("number") x;
  @type("number") y;
  @type("number") level;       // starts at 1
  @type("number") xp;          // starts at 0
  @type("number") hp;          // starts at 100; groundwork for Combat MVP, unused by any logic yet (also settable via /kill and unaffected-but-visible via /givexp's level-ups)
  @type("number") maxHp;       // starts at 100
  @type({ map: "number" }) stats;   // extensible; currently just "power" (default 10)

  // Targeting System fields - synced so any client could eventually show
  // "who is targeting whom." Only the local player's own target is
  // consumed client-side today (drives the target HUD frame).
  @type("string") targetId;    // "" = no target
  @type("string") targetType;  // "player" | "npc" | ""

  // Server-only, not synced to clients:
  inputUp; inputDown; inputLeft; inputRight;  // current movement input flags
}
```

**NPC Schema** (Colyseus Schema, `server/src/rooms/schema/Npc.ts`):
```ts
class Npc extends Schema {
  @type("string") id;
  @type("string") name;
  @type("number") x;
  @type("number") y;
  @type("number") level;
  @type("number") hp;
  @type("number") maxHp;
  @type("boolean") isHostile;
  @type({ map: "number" }) stats;   // mirrors Player.stats, currently "power"
  @type("string") behavior;         // placeholder for future AI state machine; always "static" for now

  // Targeting System fields, deliberately NOT @type-decorated - no client
  // needs to see an NPC's target yet, so this costs zero sync bandwidth.
  // Still fully server-authoritative and ready for future aggro/chase AI.
  targetId;    // "" = no target
  targetType;  // "player" | "npc" | "self" | ""
}
```

**Room State** (`OverworldState`):
```ts
class OverworldState extends Schema {
  @type({ map: Player }) players;
  @type({ map: Npc }) npcs;
}
```

**World/Map:**
- 30×30 tile grid, `0` = walkable, `1` = wall/obstacle. Border tiles are always walls; a handful of scattered obstacle tiles are hardcoded.
- **Important:** the tile array is duplicated between `server/src/map/mapData.ts` (authoritative, used for collision) and `client/src/map/mapData.ts` (render-only **and** used for client-side movement prediction). They must be kept in sync manually until this is refactored into a shared package. The client copy also exports an `isWalkable()` helper mirroring the server's, used by `predictedMovement.ts`.
- Player/NPC collision uses a small AABB-style corner check against tiles (`isWalkable`), and a simple radius-based circle check between entities (NPCs aren't tile-snapped, since they're expected to eventually move). This exact corner-check math is duplicated client-side too (`predictedMovement.ts`) for prediction purposes.

**Persistence:**
- `server/data/players.json`, keyed by username: `{ username, level, xp, stats: { power } }`. Loaded on join, saved on disconnect. No auth/passwords for MVP. `hp`/`maxHp` are not currently persisted.
- **Room-scoped state (NPCs, etc.) is persistent for the lifetime of the server process** (see Section 3b) rather than tied to client connections - it is *not* saved to disk, so it still resets on an actual server restart, same as before.
- **`server/data/admins.json`** *(new)*: a plain JSON array of admin usernames, checked case-insensitively. Not a Colyseus Schema/synced field - purely server-side, read on demand by `isAdmin()`. Auto-created empty if missing.
- **`server/data/bans.json`** *(new)*: an array of `{ username, reason, bannedBy, bannedAt }` entries. Also purely server-side; checked in `OverworldRoom.onAuth()` before a join is allowed to proceed.

## 5. MVP Features (Implemented)

**Admin Command System** *(new)*
- Server console (the same terminal running `npm run dev`/`npm start`) becomes an interactive prompt once the server starts - type a command (with or without a leading `/`) and press Enter.
- In-game: any admin whose username is in `server/data/admins.json` or the `ADMIN_USERNAMES` env var can type a `/`-prefixed message in chat to run the same commands, with results sent back privately (currently logged to the browser dev console only - not yet rendered in the chat UI).
- Built-in commands: `/help`, `/who`, `/quit`, `/ban`, `/unban`, `/kick`, `/kill`, `/givexp`. All server-validated and logged regardless of entry point.
- Bans are persisted (`server/data/bans.json`) and checked before a join is ever accepted (`onAuth`), not just after the fact.
- New commands require only a single registration call in `server/src/admin/commands.ts` - no changes to the registry, console wiring, or chat integration.

**Login Screen & Session Lifecycle**
- Full-viewport HTML/CSS login screen shown on load, above the game canvas. Username field (password field slot present in markup for future auth, currently hidden/unused).
- Submitting the form connects and joins the shared overworld; the screen hides only once the join succeeds. A failed connection attempt (including a banned username) shows an inline error and lets the player retry without reloading.
- If the client's connection to the room ends for any reason (kicked, banned, server restart, network drop), the client detects it (`room.onLeave`), tears down all local game state/visuals, and returns to the login screen with a "Disconnected from the server." message - ready to log back in.
- WASD (and the rest of the keyboard) work normally for typing in both the login username field and the chat box - keystrokes in either are kept from reaching Phaser's global movement-key bindings.

**Overworld Exploration**
- 30×30 tile map, colored-rectangle rendering (green = walkable, gray = wall), camera follows local player.
- Player and NPC labels show name/level above their shape.

**Player Movement**
- WASD or arrow keys. Client sends only input-state changes (not positions); server simulates movement at a fixed 20Hz tick and validates collision (walls + NPCs).
- **Client-side prediction + reconciliation**: the local player's own movement is predicted instantly client-side and smoothly corrected against the server - see Section 3a for full mechanics. Feels responsive/instant regardless of network round-trip time.
- Remote players still interpolate smoothly between server position updates, unchanged.

**Leveling & Progression**
- Start at level 1, 0 XP. Passive XP gain (+5) every ~25 seconds while connected, server-validated.
- Level-up threshold: `level * 100` XP. On level up, server broadcasts a `level-up` event; client shows a toast. Now shared between the passive-XP tick and the `/givexp` admin command via `OverworldRoom.grantXp()`.
- HUD (HTML overlay, top-left): username, level, XP progress bar.

**Chat System**
- Global chat, HTML overlay (bottom-left): scrollable log + input box.
- Press Enter to open chat (if not already focused) or send (if focused); Escape or clicking elsewhere returns keyboard control to movement.
- Server sanitizes (strips HTML tags, trims, caps at 200 chars) and rate-limits (600ms min interval per session) before broadcasting `chat-message` events. Messages starting with `/` skip sanitization/rate-limiting entirely and are routed to the admin command system instead (see Section 3c).
- Client renders with `textContent` only (never `innerHTML`) as defense-in-depth against injected markup.

**NPCs (Hostile Mobs)**
- Server spawns 1 hostile mob every ~10 seconds at a random walkable tile, capped at 15 concurrent mobs.
- Synced via `OverworldState.npcs` (`MapSchema<Npc>`), rendered client-side as colored rectangles (red = hostile; a neutral color is reserved for future friendly NPCs) with name/level labels.
- Treated as simple circular obstacles for player movement (can't walk through them) - server-side only; **not** predicted client-side (see Section 3a trade-off note).
- Bumping into a hostile NPC triggers a rate-limited (1s) toast notification (`npc-contact` message) and a server console log.
- `behavior` field on `Npc` exists but is unused - reserved for future patrol/aggro/chase AI.
- Can be force-removed via the `/kill` admin command.
- **The NPC population persists across client disconnects/reconnects** - the overworld room itself doesn't get torn down when empty, so NPCs (and the spawner/population cap) keep going independent of who's currently connected (see Section 3b).

**Targeting System**
- Players can select a target by clicking a player/NPC in the Phaser scene, or by pressing TAB to cycle nearest-first through currently visible players and NPCs (wraps around at the end of the list).
- Players can clear their target with **Escape** or by **clicking anywhere on the map with nothing targetable under the pointer**.
- Click/TAB/clear requests are sent via a `set-target` message; the server validates before committing.
- Target HUD (HTML overlay, top-right): shows the current target's name, level, and an HP bar, driven entirely by the local player's own synced target fields.
- If the current target disconnects (players) the server clears the targeting player's target fields, and the HUD frame hides itself.
- No combat effect yet - purely selection/display, feeding directly into Combat MVP next.

**Multiplayer & Persistence**
- Join/leave handling; other players rendered as distinct colored circles with labels.
- Username-based "login" (no passwords) via the login screen described above, now gated by a ban check (`onAuth`) before any join is accepted.
- Level/xp/stats saved on disconnect, loaded on join.

**UI/Controls**
- Full browser window canvas (800×600 internal resolution).
- HTML overlays: login screen (full-viewport, shown until connected), top-left HUD, top-right target frame, bottom-left chat panel, dynamically-created toast notifications.
- Keyboard/mouse for MVP (WASD/arrows for movement, Enter/Escape for chat, click or TAB to target, Escape or clicking empty map space to clear target). Admin commands via the same chat input (`/`-prefixed) or the server's own terminal.

## 6. Future Features Roadmap (Prioritized)

1. **Combat MVP**: melee attack message, server-validated hit detection against the player's current target (reusing the Targeting System's validation pattern), XP/loot on kill. Builds directly on the existing NPC-contact hook and the `hp`/`maxHp`/target fields.
2. **NPC AI**: patrol/aggro/chase behavior, using the already-present (currently unused) `behavior` field and the unsynced `targetId`/`targetType` fields on `Npc`. Will also mean revisiting the "NPCs aren't predicted client-side" trade-off from Section 3a, since moving NPCs make that gap more noticeable.
3. **Better collision/tilemap authoring**: load a Tiled JSON map instead of the hardcoded array, ideally from a single shared source instead of the current server/client duplication (which spans both `mapData.ts` *and* the movement-collision math in `predictedMovement.ts`).
4. **Basic interest management**: only send nearby players'/NPCs' state deltas once entity counts grow, using a simple grid bucket per room. Also relevant to TAB-cycle candidate gathering, currently O(n) per keypress.
5. **Wire admin `command-reply`/`server-shutdown` into visible UI** *(new)*: currently these client messages only reach the browser dev console - a small chat-log or toast integration would make in-game admin command usage actually usable without opening devtools.
6. **Classes & Skills**: class selection, ability hotbar, different playstyles.
7. **Content**: instanced dungeons (separate Colyseus room types), quests.
8. **Social & Persistence (Later)**: player housing, trading, guilds, proximity chat.
9. **Persistence upgrade**: swap `playerStore.ts`'s JSON file for Postgres, keeping the same `loadPlayer`/`savePlayer` function signatures. Will also need to decide whether `hp`/`maxHp` become persisted once combat/death exist, whether any room-scoped state beyond NPCs should ever be persisted to disk, and whether `admins.json`/`bans.json` should move to the same store.
10. **Polish & Scale**: real sprites/tilesets, procedural elements, proper accounts/auth (the login screen's password-field slot is ready for this - would also let admin auth move beyond "trust the username"), configurable external port.
11. **Reconnection / session-resume**: automatic reconnect-with-backoff after a disconnect, and resuming a dropped session (same identity/position) rather than always requiring a fresh manual login. Natural follow-up to the login-screen/disconnect-handling work in Section 3b.
12. **Web admin panel** *(new)*: an HTTP layer (e.g. a small authenticated Express route) calling the exact same `commandRegistry.execute()` used by console and chat today - the registry was deliberately designed so this requires no changes to existing commands, just a third `actor`/`reply` pairing.
13. **More admin commands** *(new)*: natural next additions following the same registration pattern - `/spawn`, `/teleport`, `/setlevel`, `/mute`, `/broadcast`.

Each phase should update this SPEC with detailed mechanics once implemented.

## 7. UI/UX & Graphics
- Style: simple 2D top-down. Green/gray tile palette. Distinct player colors (blue = local player, red = remote players); NPCs red (hostile) or a reserved neutral color (future friendly NPCs). Login screen uses a simple dark card/overlay style consistent with the in-game HUD's translucent-dark aesthetic.
- Controls: keyboard + mouse for MVP. Touch not yet implemented.
- Layout: canvas fills the game area; login screen overlays everything until connected; top-left HUD; top-right target frame; bottom-left chat log + input; toast notifications appear top-center, auto-dismiss.
- Graphics MVP: no external assets - Phaser `Graphics`/shape primitives and text only (the login screen is plain HTML/CSS, no canvas involvement).

## 8. Non-Functional Requirements
- **Performance:** 60 FPS client target. Server simulation tick at 20Hz. Local player movement is client-predicted at full render framerate (not tied to the server's 20Hz tick) for responsiveness, while remaining fully corrected against server truth. NPC-vs-player collision, and TAB-cycle target-candidate gathering, are currently O(n) per player per tick/keypress - acceptable at current scale, flagged for revisit if that grows substantially.
- **Security:** All critical actions (movement, chat, targeting, admin commands) validated/sanitized server-side. Client-side movement prediction is purely a rendering/feel technique - the server never trusts client-reported positions. Chat has basic rate limiting and HTML-tag stripping. Target requests are validated against actual room state before being committed. Login remains username-only (no password/auth) for MVP - the login screen's markup has an unused password-field slot reserved for when that's added. **Admin trust model (new, v0.7):** admin status is purely username-based (`admins.json`/`ADMIN_USERNAMES`), with no password layer of its own - it inherits the same "no real auth yet" trust model as login in general. This is an accepted MVP trade-off appropriate for a friends-only self-hosted server, explicitly flagged for revisit once real accounts/auth exist (Roadmap #10).
- **Known accepted vulnerability trade-off:** the server depends on `@colyseus/core` in the 0.15.x line, which carries a moderate `nanoid` advisory. Fixing it requires upgrading to Colyseus 0.17 - a deliberate future migration, not a drive-by fix.
- **Known accepted architecture trade-off:** movement/collision math is duplicated in *three* places conceptually kept in sync - `server/src/rooms/OverworldRoom.ts` (authoritative), `client/src/network/predictedMovement.ts` (client prediction), and the tile data itself in both `mapData.ts` copies. All three must move together if `MOVE_SPEED`, the tick rate, or the collision box ever change, or client prediction will silently start drifting more than expected.
- **Reliability:** The shared overworld room is persistent for the lifetime of the server process (`autoDispose = false`) - it and its NPCs survive every client disconnecting, rather than being torn down and recreated empty. Client-side, a dropped connection (`room.onLeave`) is handled gracefully: local state/visuals are torn down and the player is returned to the login screen to log back in, rather than being left on a frozen/broken scene. There is still no *automatic* reconnect-with-backoff, and no session-resume (rejoining mid-session with prior position/state) - both require a manual fresh login (see Roadmap). Player data (level/xp/stats) continues to be saved on disconnect and loaded on join, unaffected by any of this. `/quit` (new, v0.7) provides a clean, broadcast-warned shutdown path as an alternative to killing the process outright.
- **Extensibility:** Loose coupling between networking (Colyseus) and game logic (map, chat, NPC, targeting, persistence, prediction, login/session, and now admin command modules). Easy to add new event handlers, entity types, and systems without touching the room's core loop structure. The admin command registry specifically was designed so new commands, and even entirely new entry points (a future web panel), require no changes to existing code (see Section 3c).
- **Testing:** Manual multi-tab/browser testing, including Chrome DevTools network throttling (added latency) to verify prediction/reconciliation feels smooth under lag, manually killing/restarting the server process to verify the login screen's disconnect/reconnect flow, and manually exercising admin commands from both the server console and admin chat sessions (see README.md). No automated tests yet.

## 9. Coding Standards & Conventions
- Modern TypeScript everywhere (`const`/`let`, arrow functions, async/await, classes/modules, strict mode).
- Clear, abundant comments, especially for networking, collision, and anything with a non-obvious "why" (e.g., the `@colyseus/core` vs `colyseus` meta-package choice, the server/client map-data duplication, why NPC targeting fields are unsynced, why prediction reconciliation blends through `serverX/Y` instead of snapping `predictedX/Y` directly, why `autoDispose` must be assigned in `onCreate()` rather than declared as a class field, why the admin module avoids importing `OverworldRoom` directly).
- Descriptive variable/event names; message/event names (`"move"`, `"chat"`, `"chat-message"`, `"level-up"`, `"npc-contact"`, `"set-target"`, `"move-ack"`, `"command-reply"`, `"server-shutdown"`) are treated as a small informal protocol - keep client and server in sync when changing them.
- Version pinning: prefer loose caret ranges (`^0.15.0`) over exact patch pins for fast-moving dependencies like Colyseus packages.
- **Why `@colyseus/core` instead of `colyseus`:** avoids an unnecessary and vulnerable dependency chain (`grant` → `request-oauth` → `jwk-to-pem`/`uuid` → `elliptic`) pulled in by the meta-package's unused auth/Redis dependencies.
- **`autoDispose` gotcha:** it's a getter/setter accessor on the base Colyseus `Room` class, not a plain field - declaring `autoDispose = false` as a class property conflicts with that accessor and fails to compile (TS2610). Assign it via `this.autoDispose = false` inside a method (e.g. the top of `onCreate()`) instead.
- **Admin module import direction (new, v0.7):** `server/src/admin/*` never imports `OverworldRoom` directly - it depends only on a small structural interface (`AdminRoomApi` in `admin/types.ts`) that `OverworldRoom` happens to satisfy. `OverworldRoom` imports *from* the admin module (registry, auth, ban list, runtime registration), not the other way around, avoiding an import cycle.
- Error handling on both client and server for network/message boundaries, including a try/catch around the client's room-join attempt so a failed connection surfaces as a login-screen error rather than an unhandled rejection, and a try/catch around every admin command's execution so one broken command can't crash the room or hang the console/chat caller.
- Git commits: atomic, clear messages (e.g., `feat: add login screen and disconnect handling`, `fix: keep overworld room alive with zero clients connected`, `feat: add server-authoritative admin command system`).

## 10. Known Issues / Technical Debt / TODOs
- [ ] Server/client tile-map duplication (`mapData.ts` in both packages), joined by movement/collision math duplication (`predictedMovement.ts` vs `OverworldRoom.ts`) - should become a single shared source once maps stop being trivial/hardcoded.
- [ ] NPC collision is not predicted client-side - bumping an NPC may show a brief visual correction. Fine while NPCs are static; revisit alongside NPC AI (Roadmap #2).
- [ ] NPC-vs-player collision, and TAB-cycle target-candidate gathering, are O(n) per tick/keypress; fine now, revisit if NPC/player counts grow.
- [ ] No automatic reconnection/session-resume logic - a dropped connection returns the player gracefully to the login screen, but always requires a manual fresh login rather than auto-retrying or resuming the prior session (see Roadmap).
- [ ] External port isn't configurable independent of the server's internal port.
- [ ] Residual moderate `nanoid` advisory in `@colyseus/core` ≤0.16.24 accepted as a trade-off until the Colyseus 0.17 migration.
- [ ] Deployment checklist/environment variables beyond `PORT`/`ADMIN_USERNAMES` not yet formalized.
- [ ] `hp`/`maxHp` are not yet persisted - needs a decision once damage/death/respawn exist (also relevant to `/kill`'s current "zero hp and disconnect" behavior).
- [ ] The client build (`client/dist`) is not automatically rebuilt/watched by the server process.
- [ ] Prediction correction tuning (`CORRECTION_RATE`, dead-zone threshold, `SNAP_THRESHOLD`) is based on local/low-latency testing so far - worth revisiting once tested over a real internet connection with friends, not just localhost/DevTools throttling.
- [ ] The NPC spawner and passive-XP timers keep running even with zero clients connected, since the overworld room no longer disposes itself when empty. Harmless today given the existing mob population cap and XP simply having no player to apply to, but worth remembering if either interval ever does something more expensive.
- [ ] No password/auth yet - the login screen's password-field slot exists in the markup but is hidden and unused.
- [ ] **(new, v0.7)** Admin `command-reply` and `server-shutdown` client messages aren't rendered in the game UI yet - visible today only via the browser dev console. Small follow-up to wire into the existing chat log/toast system.
- [ ] **(new, v0.7)** A banned username's failed login shows the same generic connection-error copy as any other join failure - the specific ban reason from `onAuth` isn't yet surfaced distinctly in the login screen.
- [ ] **(new, v0.7)** Admin permission is username-only with no password layer - acceptable for a friends-only server today, but should be revisited once real accounts/auth exist (Roadmap #10).
- [ ] **(new, v0.7)** `admins.json`/`bans.json` are read from disk on every check (no caching) - fine at current call frequency, same trade-off already accepted for `players.json`.

## 11. Changelog
- **2026-07-10 (v0.7):** Added a server-authoritative Admin Command System. New `server/src/admin/` module: a `CommandRegistry` (name → handler) shared by two entry points - an interactive server console prompt (Node `readline`, always treated as admin) and in-game chat (`/`-prefixed messages, intercepted before normal chat sanitization/rate-limiting). Built-in commands: `/help`, `/who`, `/quit` (graceful shutdown with a broadcast warning), `/ban`/`/unban` (persisted to new `server/data/bans.json`, enforced via a new `OverworldRoom.onAuth()` that rejects banned usernames before a `Player` is ever created), `/kick`, `/kill` (removes NPCs; zeroes HP and disconnects players, pending a real death system), and `/givexp` (reuses passive XP's level-up logic, now extracted into a shared `OverworldRoom.grantXp()` method and a standalone `xpForNextLevel()` util). Admin status (new `server/data/admins.json` + `ADMIN_USERNAMES` env var) and bans are deliberately server-only, not part of any synced Schema. The admin module never imports `OverworldRoom` directly (depends only on a small structural `AdminRoomApi` interface) to avoid an import cycle, since `OverworldRoom` itself imports from the admin module. Designed so both new commands and entirely new entry points (a future web admin panel) require no changes to existing code - see SPEC.md Section 3c.
- **2026-07-10 (v0.6):** Added a proper login screen (HTML/CSS overlay, `client/src/ui/LoginScreen.ts`) replacing the old blocking `window.prompt()` - collects a username (with an unused password-field slot reserved for future auth) and only reveals the game once a room join succeeds; a failed join shows an inline retry-able error instead of hanging. Added graceful disconnect handling: `room.onLeave` on the client now tears down all local game state/visuals and returns the player to the login screen with a status message, instead of leaving a frozen scene. Fixed keyboard capture so typing (including W/A/S/D) works normally in both the login username field and chat, by stopping those inputs' keydown events from reaching Phaser's global movement-key bindings. **Separately, fixed a server-side bug** where the shared `OverworldRoom` (and everything in it, including spawned NPCs) was being destroyed and silently recreated empty every time the last connected client disconnected, because Colyseus rooms default to `autoDispose = true`. Set `this.autoDispose = false` (assigned in `onCreate()`, since `autoDispose` is a getter/setter accessor on the base `Room` class and can't be overridden as a plain class field - doing so fails to compile with TS2610) so the overworld - and its simulation/spawn/XP intervals - now persists for the lifetime of the server process, independent of client connections. No new client-server protocol messages were needed for any of this.
- **2026-07-10 (v0.5):** Added client-side movement prediction with server reconciliation. Local player movement is now predicted instantly client-side (new `client/src/network/predictedMovement.ts`, mirroring server movement/collision math) instead of waiting on server round-trips, fixing "laggy/cumbersome" feel even on fast connections. `"move"` messages now carry a sequence number; server unicasts a new `"move-ack"` message with its confirmed position. Client replays any locally-predicted-but-not-yet-confirmed steps on top of that, then blends smoothly toward the result (not an instant snap) to avoid visible "pop"/skip when stopping or changing direction, and to absorb minor wall-collision discretization drift. Remote players and NPCs are unaffected - still interpolated as before. NPC collision remains unpredicted client-side (accepted trade-off, flagged for revisit with NPC AI). Movement/collision math is now duplicated in three conceptually-linked places (server, client prediction, tile data) that must be kept in sync together.
- **2026-07-10 (v0.4):** Added Targeting System. `Player` schema gains `hp`/`maxHp` (groundwork for Combat MVP) and synced `targetId`/`targetType`; `Npc` schema gains `targetId`/`targetType` as well, but intentionally unsynced. New server-validated `set-target` message lets clients request a target (click on a player/NPC, or TAB to cycle nearest-first through visible entities) or clear it. New client module `TargetFrame.ts` renders the target's name/level/HP bar. **Architecture change:** dev workflow is now single-process - the Express server serves the built client on the same port as the Colyseus WebSocket transport in *both* dev and production.
- **2026-07-09 (v0.3):** Added global chat system (sanitization, rate limiting, HTML overlay UI). Added hostile NPC system (Schema, spawner, collision, contact notification). Added `stats` map to `Player` schema. Switched server dependency from `colyseus` meta-package to `@colyseus/core` directly. Bumped `vite` to `^8.0.0`. Added single-port production deployment. Project officially renamed from working title "EchoRealm" to **VibeRealm**.
- **2026-07-06 (v0.1):** Initial SPEC created. Defined MVP scope and architecture; initial scaffold implemented server-authoritative movement, tile collision, passive leveling, and Colyseus Schema sync.

## Appendix
- **References:** Colyseus docs (rooms, Schema, `getStateCallbacks` for 0.17+, `autoDispose`, `onAuth`), Phaser 3 docs, Vite docs, Node `readline` docs.
- **Deployment notes:** Single-port model, used for both dev and production - build the client (`npm run build` in `client/`), run the server (`npm run dev` or `npm run build && npm start` in `server/`), forward TCP port 2567 on the router for friends. Set `ADMIN_USERNAMES` (or edit `server/data/admins.json`) before running if you want in-game admin commands available.
- **Testing notes:** Chrome DevTools → Network conditions → custom throttling with added latency is a useful way to verify prediction/reconciliation feels smooth under simulated lag, even when developing on localhost. To verify the login/disconnect flow, kill the server process mid-session and confirm the client returns to the login screen; restart the server and confirm previously-spawned NPCs are still present after logging back in (persistent-room fix, v0.6). To verify admin commands, run `/who`, `/givexp`, `/ban`+rejoin-attempt, and `/quit` from both the server console and an admin chat session (see README.md).
- **Next steps reminder:** Use this SPEC in all Claude prompts for context. Update it after each major feature or architectural decision - this version was rewritten after the admin command system shipped, to keep it from drifting out of sync with the implementation again.