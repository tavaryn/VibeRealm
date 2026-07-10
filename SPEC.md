# VibeRealm - Browser MMORPG Project Specification

**Last Updated:** 2026-07-10
**Version:** 0.5 (MVP In Progress)
**Status:** Playable MVP - movement (with client-side prediction), leveling, chat, NPCs, and targeting implemented
**Project Goal:** Build a playable MVP iteratively, one feature at a time, with Claude as ongoing development partner.

## 1. Vision & High-Level Goals
VibeRealm is a lightweight, browser-based 2D top-down MMORPG. It emphasizes **real-time multiplayer exploration** in a shared small overworld, simple but satisfying **leveling and progression**, and social features like chat. Graphics are intentionally simple (colored shapes, basic tiles, text labels) to allow rapid development and focus on **mechanically intricate systems** that can be expanded over time.

Core fantasy: A cozy yet adventurous persistent world where players can see each other, level up through exploration and future activities, target and fend off (eventually fight) hostile mobs, and build a small community. The game is designed for solo development with AI assistance (Claude), easy local testing, and low-cost hosting for friends.

**Target Audience:** Friends, indie game enthusiasts, and the developer (for learning and fun).
**Success Metrics for MVP:** 2+ concurrent players can connect (including over the internet, not just LAN), move around a shared world with responsive, non-laggy-feeling controls, gain levels, chat in real-time, encounter simple hostile NPCs, and target players/NPCs to see their name/level/HP, all with smooth feel and basic persistence.

## 2. Tech Stack
- **Backend:** Colyseus (imported directly via `@colyseus/core`, not the `colyseus` meta-package - see Section 9 for why) + TypeScript + Node.js.
- **Frontend:** Phaser 3 (game rendering, camera, input handling, Arcade Physics for bounds) + plain HTML/CSS overlay for HUD, target frame, and chat. Built with Vite.
- **Persistence (MVP):** In-memory state (Colyseus Schema `MapSchema`) + username-based JSON file save/load (`server/data/players.json`) for level/xp/stats. Future: SQLite or Postgres, same load/save function signatures.
- **Development Tools:** Git, VS Code (or similar), Claude Projects for AI assistance.
- **Hosting:** Self-hosted on the developer's own machine with router port forwarding (single port, see Section 3). Render.com/Railway.app remain options for future always-on hosting.

**Alternatives Considered:** Socket.io + Express (originally planned, replaced early with Colyseus for built-in Schema-based delta sync and room/instancing support). Pure Canvas (more boilerplate). Heavy frameworks like React (unnecessary for a game loop).

## 3. Architecture Overview

- **Client-Server Model:** Fully server-authoritative. Clients send only input state (movement keys, chat text, target selection); the server simulates, validates, and syncs everything else.
  - **Movement is now client-side predicted with server reconciliation** (new this version - see the dedicated subsection below). Remote players and NPCs still interpolate toward server-confirmed positions exactly as before; only the local player's own movement changed.
  - Target selection follows the earlier pattern unchanged: a client's click/TAB press is a *request*, and the target frame only updates once the server has validated and echoed it back via synced state - never assumed optimistically client-side. (Combat, when it arrives, is expected to follow this same request/validate/echo pattern rather than prediction, since instant "did I hit" client-side guessing is much riskier to get right than movement.)
- **Core Components:**
  - **Colyseus Rooms**: The main overworld runs in a single `OverworldRoom`. Future dungeons/housing can use separate Room types for instancing.
  - **Colyseus Schemas**: `Player` and `Npc` both live in `OverworldState` as `MapSchema`s. Clients receive only deltas/patches for efficiency - critical for scaling to hundreds of players.
    - `Player` carries `hp`/`maxHp` (groundwork for Combat MVP, not yet consumed by any combat logic) and `targetId`/`targetType` (synced).
    - `Npc` also carries `targetId`/`targetType`, but deliberately **not** synced (no `@type` decorator).
  - **Targeting System**: Unchanged from v0.4 - client requests (click or TAB) are validated server-side via `set-target` before being committed to synced state.
  - **Client-Side Movement Prediction & Reconciliation** *(new)*: See dedicated subsection below.
  - **Interest Management / Spatial Awareness**: Not yet implemented. NPC-vs-player collision, and target-candidate gathering for TAB-cycling, are both O(n) checks per relevant tick/keypress - fine at MVP scale, flagged as the first thing to revisit if entity counts grow.
  - **Game Logic Separation**: Networking/state handled by Colyseus; game rules (movement validation, collision, leveling, chat moderation, NPC spawning, target validation) live in clearly separated modules/methods for easier testing and future extraction.
- **Data Flow**: Client sends input state (movement flags, now tagged with a prediction sequence number), a chat/action message, or a target request → `OverworldRoom` simulates/validates on a fixed 20Hz tick (movement) or immediately on message receipt (chat, targeting, move-ack) → Schema state updates → Colyseus automatically broadcasts patches to relevant clients. Chat messages remain a separate fire-and-forget broadcast event, not part of Schema state.
- **Extensibility**: Designed so adding combat, classes, skills, NPC AI, or new Room types requires minimal changes to the core networking layer. `Npc` schema deliberately mirrors `Player`'s shape so future combat code can treat "anything with hp/stats/a target" uniformly.
- **Deployment model - unified for dev AND production:** The Express server serves the client's build (`client/dist/`) on the same port Colyseus's WebSocket transport uses, so only **one process and one port** are involved end-to-end, in both development and when playing with friends. Day-to-day development is: `cd client && npm run build` once (and again after any client-side change), then `cd server && npm run dev` - connect at `http://localhost:2567` (or the LAN/public IP, same port). **Important habit:** the server does not currently watch/rebuild the client automatically - after editing anything under `client/src` or `client/index.html`, you must re-run `npm run build` in `client/` and hard-refresh the browser before the change will show up.
- **Project Structure:** Two independent npm packages, not a single monorepo - chosen so the Vite-based Phaser client and the Colyseus/Node server can each use their own tooling, TS config, and dependency versions without conflict.

### 3a. Client-Side Movement Prediction & Reconciliation *(new in v0.5)*

**Problem it solves:** waiting for a full server round-trip before the local player visibly moves feels laggy and cumbersome, even on a fast connection, because every keypress has to cross the network twice (client→server→client) before anything changes on screen.

**How it works:**
- The client mirrors the server's exact movement/collision math in a new module (`client/src/network/predictedMovement.ts`) - same `MOVE_SPEED`, same axis-separated wall-collision box. This is a **third duplicated copy of movement logic** (alongside the existing server/client `mapData.ts` tile-data duplication) and must be kept in sync manually if either ever changes - flagged the same way as the tile-data duplication already is.
- Every rendered frame, the client immediately simulates the local player's movement using that frame's real delta time (**not** a fixed-timestep batch - an earlier fixed-20Hz-batch version caused visible choppiness, since the on-screen position only actually changed ~20 times/sec instead of every frame; per-frame variable-dt stepping fixed this and works fine for reconciliation since each step records its own `dt`). This *predicted* position (`predictedX/Y` in `GameScene`) is what actually renders the local player - remote players/NPCs are unaffected and still interpolate as before.
- Each local step is recorded in a short rolling history buffer (`{seq, input, dt}`). Every time the client sends a `"move"` message (still only on input-state-change, as before), it's tagged with the current sequence number.
- The server, after applying an input change, unicasts back a `"move-ack"` message: `{seq, x, y}` - its authoritative position *at the moment it received that input change* (meaning: still reflecting the *previous* input, since the server didn't know about the change until this message arrived - a normal and expected effect of network latency, not something to "fix").
- The client discards history entries at or before that `seq`, then **replays** the remaining (already-locally-predicted) steps on top of the server-confirmed position to get its best current position estimate. Critically, this replayed result is **not** written directly to the rendered `predictedX/Y` (an earlier version did this and caused a visible "skip forward" every time the player stopped or changed direction, since the ack's position legitimately lags behind by however long the stop/turn message took to arrive). Instead it's written to a separate `serverX/Y` reference point.
- Every frame, `predictedX/Y` is gently blended toward `serverX/Y` (`applyServerCorrection`): small differences get nudged in smoothly (a `CORRECTION_RATE` blend, with a small dead zone to ignore sub-pixel wall-collision noise); large differences (e.g. rejoining, a future teleport/respawn) snap instantly rather than visibly sliding across the map. This same blend also absorbs ordinary drift from ongoing Schema `onChange` updates (e.g. minor per-tick collision-resolution differences while holding a key into a wall), not just ack-driven corrections - one mechanism handles both cases.
- **Known accepted trade-off:** NPC collision is **not** predicted client-side (only wall/tile collision is) - NPCs are currently static, so bumping one may show a brief, small visual correction rather than being predicted smoothly. Worth revisiting once NPC AI (patrol/chase) makes NPCs common, moving obstacles.
- **Guard against runaway catch-up:** per-frame delta is clamped (`MAX_FRAME_DELTA_MS`) so a backgrounded browser tab returning with a huge delta doesn't cause a sudden simulated leap.

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
  @type("number") hp;          // starts at 100; groundwork for Combat MVP, unused by any logic yet
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
- **Important:** the tile array is duplicated between `server/src/map/mapData.ts` (authoritative, used for collision) and `client/src/map/mapData.ts` (render-only **and now also used for client-side movement prediction** - see Section 3a). They must be kept in sync manually until this is refactored into a shared package. The client copy now also exports an `isWalkable()` helper mirroring the server's, used by `predictedMovement.ts`.
- Player/NPC collision uses a small AABB-style corner check against tiles (`isWalkable`), and a simple radius-based circle check between entities (NPCs aren't tile-snapped, since they're expected to eventually move). This exact corner-check math is now duplicated client-side too (`predictedMovement.ts`) for prediction purposes.

**Persistence:**
- `server/data/players.json`, keyed by username: `{ username, level, xp, stats: { power } }`. Loaded on join, saved on disconnect. No auth/passwords for MVP. `hp`/`maxHp` are not currently persisted.

## 5. MVP Features (Implemented)

**Overworld Exploration**
- 30×30 tile map, colored-rectangle rendering (green = walkable, gray = wall), camera follows local player.
- Player and NPC labels show name/level above their shape.

**Player Movement**
- WASD or arrow keys. Client sends only input-state changes (not positions); server simulates movement at a fixed 20Hz tick and validates collision (walls + NPCs).
- **Client-side prediction + reconciliation** (new, v0.5): the local player's own movement is predicted instantly client-side and smoothly corrected against the server - see Section 3a for full mechanics. Feels responsive/instant regardless of network round-trip time.
- Remote players still interpolate smoothly between server position updates, unchanged.

**Leveling & Progression**
- Start at level 1, 0 XP. Passive XP gain (+5) every ~25 seconds while connected, server-validated.
- Level-up threshold: `level * 100` XP. On level up, server broadcasts a `level-up` event; client shows a toast.
- HUD (HTML overlay, top-left): username, level, XP progress bar.

**Chat System**
- Global chat, HTML overlay (bottom-left): scrollable log + input box.
- Press Enter to open chat (if not already focused) or send (if focused); Escape or clicking elsewhere returns keyboard control to movement.
- Server sanitizes (strips HTML tags, trims, caps at 200 chars) and rate-limits (600ms min interval per session) before broadcasting `chat-message` events.
- Client renders with `textContent` only (never `innerHTML`) as defense-in-depth against injected markup.

**NPCs (Hostile Mobs)**
- Server spawns 1 hostile mob every ~10 seconds at a random walkable tile, capped at 15 concurrent mobs.
- Synced via `OverworldState.npcs` (`MapSchema<Npc>`), rendered client-side as colored rectangles (red = hostile; a neutral color is reserved for future friendly NPCs) with name/level labels.
- Treated as simple circular obstacles for player movement (can't walk through them) - server-side only; **not** predicted client-side (see Section 3a trade-off note).
- Bumping into a hostile NPC triggers a rate-limited (1s) toast notification (`npc-contact` message) and a server console log.
- `behavior` field on `Npc` exists but is unused - reserved for future patrol/aggro/chase AI.

**Targeting System**
- Players can select a target by clicking a player/NPC in the Phaser scene, or by pressing TAB to cycle nearest-first through currently visible players and NPCs (wraps around at the end of the list).
- Players can clear their target with **Escape** or by **clicking anywhere on the map with nothing targetable under the pointer**.
- Click/TAB/clear requests are sent via a `set-target` message; the server validates before committing.
- Target HUD (HTML overlay, top-right): shows the current target's name, level, and an HP bar, driven entirely by the local player's own synced target fields.
- If the current target disconnects (players) the server clears the targeting player's target fields, and the HUD frame hides itself.
- No combat effect yet - purely selection/display, feeding directly into Combat MVP next.

**Multiplayer & Persistence**
- Join/leave handling; other players rendered as distinct colored circles with labels.
- Username-based "login" (no passwords) via a `window.prompt()` on connect.
- Level/xp/stats saved on disconnect, loaded on join.

**UI/Controls**
- Full browser window canvas (800×600 internal resolution).
- HTML overlays: top-left HUD, top-right target frame, bottom-left chat panel, dynamically-created toast notifications.
- Keyboard/mouse for MVP (WASD/arrows for movement, Enter/Escape for chat, click or TAB to target, Escape or clicking empty map space to clear target).

## 6. Future Features Roadmap (Prioritized)

1. **Combat MVP**: melee attack message, server-validated hit detection against the player's current target (reusing the Targeting System's validation pattern), XP/loot on kill. Builds directly on the existing NPC-contact hook and the `hp`/`maxHp`/target fields. *(Client-side prediction for movement is now done - this is the next logical feature.)*
2. **NPC AI**: patrol/aggro/chase behavior, using the already-present (currently unused) `behavior` field and the unsynced `targetId`/`targetType` fields on `Npc`. Will also mean revisiting the "NPCs aren't predicted client-side" trade-off from Section 3a, since moving NPCs make that gap more noticeable.
3. **Better collision/tilemap authoring**: load a Tiled JSON map instead of the hardcoded array, ideally from a single shared source instead of the current server/client duplication (which now spans both `mapData.ts` *and* the movement-collision math in `predictedMovement.ts`).
4. **Basic interest management**: only send nearby players'/NPCs' state deltas once entity counts grow, using a simple grid bucket per room. Also relevant to TAB-cycle candidate gathering, currently O(n) per keypress.
5. **Classes & Skills**: class selection, ability hotbar, different playstyles.
6. **Content**: instanced dungeons (separate Colyseus room types), quests.
7. **Social & Persistence (Later)**: player housing, trading, guilds, proximity chat.
8. **Persistence upgrade**: swap `playerStore.ts`'s JSON file for Postgres, keeping the same `loadPlayer`/`savePlayer` function signatures. Will also need to decide whether `hp`/`maxHp` become persisted once combat/death exist.
9. **Polish & Scale**: real sprites/tilesets, procedural elements, proper accounts/auth, configurable external port.

Each phase should update this SPEC with detailed mechanics once implemented.

## 7. UI/UX & Graphics
- Style: simple 2D top-down. Green/gray tile palette. Distinct player colors (blue = local player, red = remote players); NPCs red (hostile) or a reserved neutral color (future friendly NPCs).
- Controls: keyboard + mouse for MVP. Touch not yet implemented.
- Layout: canvas fills the game area; top-left HUD; top-right target frame; bottom-left chat log + input; toast notifications appear top-center, auto-dismiss.
- Graphics MVP: no external assets - Phaser `Graphics`/shape primitives and text only.

## 8. Non-Functional Requirements
- **Performance:** 60 FPS client target. Server simulation tick at 20Hz. Local player movement is now client-predicted at full render framerate (not tied to the server's 20Hz tick) for responsiveness, while remaining fully corrected against server truth. NPC-vs-player collision, and TAB-cycle target-candidate gathering, are currently O(n) per player per tick/keypress - acceptable at current scale, flagged for revisit if that grows substantially.
- **Security:** All critical actions (movement, chat, targeting) validated/sanitized server-side. Client-side movement prediction is purely a rendering/feel technique - the server never trusts client-reported positions; it only ever receives input flags and independently simulates/validates its own authoritative position, exactly as before. Chat has basic rate limiting and HTML-tag stripping. Target requests are validated against actual room state before being committed.
- **Known accepted vulnerability trade-off:** the server depends on `@colyseus/core` in the 0.15.x line, which carries a moderate `nanoid` advisory. Fixing it requires upgrading to Colyseus 0.17 - a deliberate future migration, not a drive-by fix.
- **Known accepted architecture trade-off (new, v0.5):** movement/collision math is now duplicated in *three* places conceptually kept in sync - `server/src/rooms/OverworldRoom.ts` (authoritative), `client/src/network/predictedMovement.ts` (client prediction), and the tile data itself in both `mapData.ts` copies. All three must move together if `MOVE_SPEED`, the tick rate, or the collision box ever change, or client prediction will silently start drifting more than expected. Flagged for the same future "single shared source" fix as the tile-data duplication (Roadmap #3).
- **Extensibility:** Loose coupling between networking (Colyseus) and game logic (map, chat, NPC, targeting, persistence, and now prediction modules). Easy to add new event handlers, entity types, and systems without touching the room's core loop structure.
- **Reliability:** Graceful disconnects (state saved before removal; any player targeting the departing player has their target cleared). No reconnection logic yet.
- **Testing:** Manual multi-tab/browser testing, including Chrome DevTools network throttling (added latency) to verify prediction/reconciliation feels smooth under lag. No automated tests yet.

## 9. Coding Standards & Conventions
- Modern TypeScript everywhere (`const`/`let`, arrow functions, async/await, classes/modules, strict mode).
- Clear, abundant comments, especially for networking, collision, and anything with a non-obvious "why" (e.g., the `@colyseus/core` vs `colyseus` meta-package choice, the server/client map-data duplication, why NPC targeting fields are unsynced, why prediction reconciliation blends through `serverX/Y` instead of snapping `predictedX/Y` directly).
- Descriptive variable/event names; message/event names (`"move"`, `"chat"`, `"chat-message"`, `"level-up"`, `"npc-contact"`, `"set-target"`, `"move-ack"`) are treated as a small informal protocol - keep client and server in sync when changing them.
- Version pinning: prefer loose caret ranges (`^0.15.0`) over exact patch pins for fast-moving dependencies like Colyseus packages.
- **Why `@colyseus/core` instead of `colyseus`:** avoids an unnecessary and vulnerable dependency chain (`grant` → `request-oauth` → `jwk-to-pem`/`uuid` → `elliptic`) pulled in by the meta-package's unused auth/Redis dependencies.
- Error handling on both client and server for network/message boundaries.
- Git commits: atomic, clear messages (e.g., `feat: add client-side movement prediction with reconciliation`).

## 10. Known Issues / Technical Debt / TODOs
- [ ] Server/client tile-map duplication (`mapData.ts` in both packages), now joined by movement/collision math duplication (`predictedMovement.ts` vs `OverworldRoom.ts`) - should become a single shared source once maps stop being trivial/hardcoded.
- [ ] NPC collision is not predicted client-side - bumping an NPC may show a brief visual correction. Fine while NPCs are static; revisit alongside NPC AI (Roadmap #2).
- [ ] NPC-vs-player collision, and TAB-cycle target-candidate gathering, are O(n) per tick/keypress; fine now, revisit if NPC/player counts grow.
- [ ] No reconnection/session-resume logic if a client's connection drops mid-session.
- [ ] External port isn't configurable independent of the server's internal port.
- [ ] Residual moderate `nanoid` advisory in `@colyseus/core` ≤0.16.24 accepted as a trade-off until the Colyseus 0.17 migration.
- [ ] Deployment checklist/environment variables beyond `PORT` not yet formalized.
- [ ] `hp`/`maxHp` are not yet persisted - needs a decision once damage/death/respawn exist.
- [ ] The client build (`client/dist`) is not automatically rebuilt/watched by the server process.
- [ ] Prediction correction tuning (`CORRECTION_RATE`, dead-zone threshold, `SNAP_THRESHOLD`) is based on local/low-latency testing so far - worth revisiting once tested over a real internet connection with friends, not just localhost/DevTools throttling.

## 11. Changelog
- **2026-07-10 (v0.5):** Added client-side movement prediction with server reconciliation. Local player movement is now predicted instantly client-side (new `client/src/network/predictedMovement.ts`, mirroring server movement/collision math) instead of waiting on server round-trips, fixing "laggy/cumbersome" feel even on fast connections. `"move"` messages now carry a sequence number; server unicasts a new `"move-ack"` message with its confirmed position. Client replays any locally-predicted-but-not-yet-confirmed steps on top of that, then blends smoothly toward the result (not an instant snap) to avoid visible "pop"/skip when stopping or changing direction, and to absorb minor wall-collision discretization drift. Went through two follow-up fixes after initial implementation: (1) switched from fixed-20Hz-batch local simulation to per-rendered-frame simulation, since the batch approach caused visible ~20fps choppiness; (2) routed ack-based corrections through the same continuous soft-blend used for ordinary drift, rather than snapping instantly, since instant snapping caused a visible skip specifically when stopping/turning (the server's ack position legitimately reflects the old input for the duration of the stop message's network trip - not something to "fix" abruptly). Remote players and NPCs are unaffected - still interpolated as before. NPC collision remains unpredicted client-side (accepted trade-off, flagged for revisit with NPC AI). Movement/collision math is now duplicated in three conceptually-linked places (server, client prediction, tile data) that must be kept in sync together.
- **2026-07-10 (v0.4):** Added Targeting System. `Player` schema gains `hp`/`maxHp` (groundwork for Combat MVP) and synced `targetId`/`targetType`; `Npc` schema gains `targetId`/`targetType` as well, but intentionally unsynced. New server-validated `set-target` message lets clients request a target (click on a player/NPC, or TAB to cycle nearest-first through visible entities) or clear it. New client module `TargetFrame.ts` renders the target's name/level/HP bar. **Architecture change:** dev workflow is now single-process - the Express server serves the built client on the same port as the Colyseus WebSocket transport in *both* dev and production.
- **2026-07-09 (v0.3):** Added global chat system (sanitization, rate limiting, HTML overlay UI). Added hostile NPC system (Schema, spawner, collision, contact notification). Added `stats` map to `Player` schema. Switched server dependency from `colyseus` meta-package to `@colyseus/core` directly. Bumped `vite` to `^8.0.0`. Added single-port production deployment. Project officially renamed from working title "EchoRealm" to **VibeRealm**.
- **2026-07-06 (v0.1):** Initial SPEC created. Defined MVP scope and architecture; initial scaffold implemented server-authoritative movement, tile collision, passive leveling, and Colyseus Schema sync.

## Appendix
- **References:** Colyseus docs (rooms, Schema, `getStateCallbacks` for 0.17+), Phaser 3 docs, Vite docs.
- **Deployment notes:** Single-port model, used for both dev and production - build the client (`npm run build` in `client/`), run the server (`npm run dev` or `npm run build && npm start` in `server/`), forward TCP port 2567 on the router for friends.
- **Testing notes (new, v0.5):** Chrome DevTools → Network conditions → custom throttling with added latency is a useful way to verify prediction/reconciliation feels smooth under simulated lag, even when developing on localhost.
- **Next steps reminder:** Use this SPEC in all Claude prompts for context. Update it after each major feature or architectural decision - this version was rewritten after client-side movement prediction shipped (and was tuned through two follow-up smoothness fixes), to keep it from drifting out of sync with the implementation again.