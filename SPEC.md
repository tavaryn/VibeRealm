# VibeRealm - Browser MMORPG Project Specification

**Last Updated:** 2026-07-09
**Version:** 0.3 (MVP In Progress)
**Status:** Playable MVP - movement, leveling, chat, and NPCs implemented
**Project Goal:** Build a playable MVP iteratively, one feature at a time, with Claude as ongoing development partner.

## 1. Vision & High-Level Goals
VibeRealm is a lightweight, browser-based 2D top-down MMORPG. It emphasizes **real-time multiplayer exploration** in a shared small overworld, simple but satisfying **leveling and progression**, and social features like chat. Graphics are intentionally simple (colored shapes, basic tiles, text labels) to allow rapid development and focus on **mechanically intricate systems** that can be expanded over time.

Core fantasy: A cozy yet adventurous persistent world where players can see each other, level up through exploration and future activities, fend off (eventually fight) hostile mobs, and build a small community. The game is designed for solo development with AI assistance (Claude), easy local testing, and low-cost hosting for friends.

**Target Audience:** Friends, indie game enthusiasts, and the developer (for learning and fun).
**Success Metrics for MVP:** 2+ concurrent players can connect (including over the internet, not just LAN), move around a shared world, gain levels, chat in real-time, and encounter simple hostile NPCs, all with smooth feel and basic persistence.

## 2. Tech Stack
- **Backend:** Colyseus (imported directly via `@colyseus/core`, not the `colyseus` meta-package - see Section 9 for why) + TypeScript + Node.js.
- **Frontend:** Phaser 3 (game rendering, camera, input handling, Arcade Physics for bounds) + plain HTML/CSS overlay for HUD and chat. Built with Vite.
- **Persistence (MVP):** In-memory state (Colyseus Schema `MapSchema`) + username-based JSON file save/load (`server/data/players.json`) for level/xp/stats. Future: SQLite or Postgres, same load/save function signatures.
- **Development Tools:** Git, VS Code (or similar), Claude Projects for AI assistance.
- **Hosting:** Self-hosted on the developer's own machine with router port forwarding (single port, see Section 3). Render.com/Railway.app remain options for future always-on hosting.

**Alternatives Considered:** Socket.io + Express (originally planned, replaced early with Colyseus for built-in Schema-based delta sync and room/instancing support). Pure Canvas (more boilerplate). Heavy frameworks like React (unnecessary for a game loop).

## 3. Architecture Overview
- **Client-Server Model:** Fully server-authoritative. Clients send only input state (movement keys, chat text); the server simulates and validates everything. Remote players interpolate toward server-confirmed positions; client-side prediction for the local player is a planned follow-up (currently the local player also interpolates, for simplicity).
- **Core Components:**
  - **Colyseus Rooms**: The main overworld runs in a single `OverworldRoom`. Future dungeons/housing can use separate Room types for instancing.
  - **Colyseus Schemas**: `Player` and `Npc` both live in `OverworldState` as `MapSchema`s. Clients receive only deltas/patches for efficiency - critical for scaling to hundreds of players.
  - **Interest Management / Spatial Awareness**: Not yet implemented. NPC-vs-player collision is currently an O(n) check per movement tick, fine at MVP scale (a handful of NPCs, one room), but flagged as the first thing to revisit if entity counts grow.
  - **Game Logic Separation**: Networking/state handled by Colyseus; game rules (movement validation, collision, leveling, chat moderation, NPC spawning) live in clearly separated modules (see folder structure below) for easier testing and future extraction.
- **Data Flow**: Client sends input state (movement flags, or a chat/action message) → `OverworldRoom` simulates/validates on a fixed 20Hz tick → Schema state updates → Colyseus automatically broadcasts patches to relevant clients. Chat messages are a separate fire-and-forget broadcast event, not part of Schema state (no need to diff/sync a growing message history, and no persistence required for MVP).
- **Extensibility**: Designed so adding combat, classes, skills, NPC AI, or new Room types requires minimal changes to the core networking layer. `Npc` schema deliberately mirrors `Player`'s shape (`level`, `stats` map) so future combat code can treat "anything with hp/stats" uniformly.
- **Deployment model**: The Express server can serve the client's production build (`client/dist/`) on the same port Colyseus's WebSocket transport uses, so only **one port** needs forwarding on the developer's router for friends to connect over the internet - no separate client hosting needed.
- **Project Structure:** Two independent npm packages, not a single monorepo - chosen so the Vite-based Phaser client and the Colyseus/Node server can each use their own tooling, TS config, and dependency versions without conflict.

```
VibeRealm/
├── server/                      # Colyseus backend (own package.json, tsconfig.json)
│   ├── src/
│   │   ├── rooms/
│   │   │   ├── OverworldRoom.ts        # Main room: movement sim, XP tick, chat, NPC spawning/collision
│   │   │   └── schema/
│   │   │       ├── Player.ts           # Player schema (id, username, x, y, level, xp, stats map)
│   │   │       ├── Npc.ts              # NPC schema (id, name, x, y, level, hp, stats map, isHostile, behavior placeholder)
│   │   │       └── OverworldState.ts   # Room state: players + npcs MapSchemas
│   │   ├── map/
│   │   │   └── mapData.ts              # Tile map data + collision helper (must mirror client copy)
│   │   ├── chat/
│   │   │   └── chatModeration.ts       # sanitizeMessage() + ChatRateLimiter, reusable by future room types
│   │   ├── npc/
│   │   │   └── npcFactory.ts           # createHostileMob(), findRandomWalkableSpawn()
│   │   ├── persistence/
│   │   │   └── playerStore.ts          # JSON player save/load (players.json)
│   │   └── index.ts                    # Server entry point; also serves client/dist in production
│   └── data/
│       └── players.json                # JSON persistence (gitignored in practice)
├── client/                      # Phaser frontend (own package.json, tsconfig.json, Vite)
│   ├── index.html                      # HUD + chat panel markup/CSS
│   └── src/
│       ├── main.ts                      # Phaser game bootstrap
│       ├── scenes/
│       │   └── GameScene.ts             # Map render, input, player/NPC visuals, HUD wiring
│       ├── network/
│       │   └── NetworkManager.ts        # Thin wrapper around colyseus.js
│       ├── ui/
│       │   └── ChatUI.ts                # Chat log/input DOM handling
│       └── map/
│           └── mapData.ts               # Client copy of tile map (render-only, must mirror server copy)
├── SPEC.md
└── README.md
```

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
  @type({ map: "number" }) stats;   // extensible; currently just "power" (default 10)

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
- **Important:** the tile array is duplicated between `server/src/map/mapData.ts` (authoritative, used for collision) and `client/src/map/mapData.ts` (render-only). They must be kept in sync manually until this is refactored into a shared package. A past bug (player spawn point overlapping a wall tile) came from exactly this kind of mismatch/oversight - worth a sanity check whenever the map is edited.
- Player/NPC collision uses a small AABB-style corner check against tiles (`isWalkable`), and a simple radius-based circle check between entities (NPCs aren't tile-snapped, since they're expected to eventually move).

**Persistence:**
- `server/data/players.json`, keyed by username: `{ username, level, xp, stats: { power } }`. Loaded on join, saved on disconnect. No auth/passwords for MVP.

## 5. MVP Features (Implemented)

**Overworld Exploration**
- 30×30 tile map, colored-rectangle rendering (green = walkable, gray = wall), camera follows local player.
- Player and NPC labels show name/level above their shape.

**Player Movement**
- WASD or arrow keys. Client sends only input-state changes (not positions); server simulates movement at a fixed 20Hz tick and validates collision (walls + NPCs).
- Remote (and currently local) players interpolate smoothly between server position updates.

**Leveling & Progression**
- Start at level 1, 0 XP. Passive XP gain (+5) every ~25 seconds while connected, server-validated.
- Level-up threshold: `level * 100` XP. On level up, server broadcasts a `level-up` event; client shows a toast.
- HUD (HTML overlay, top-left): username, level, XP progress bar.

**Chat System**
- Global chat, HTML overlay (bottom-left): scrollable log + input box.
- Press Enter to open chat (if not already focused) or send (if focused); Escape or clicking elsewhere returns keyboard control to movement.
- Server sanitizes (strips HTML tags, trims, caps at 200 chars) and rate-limits (600ms min interval per session) before broadcasting `chat-message` events. Not part of Schema state - broadcast only, no history persistence.
- Client renders with `textContent` only (never `innerHTML`) as defense-in-depth against injected markup.

**NPCs (Hostile Mobs)**
- Server spawns 1 hostile mob every ~10 seconds at a random walkable tile, capped at 15 concurrent mobs.
- Synced via `OverworldState.npcs` (`MapSchema<Npc>`), rendered client-side as colored rectangles (red = hostile; a neutral color is reserved for future friendly NPCs) with name/level labels.
- Treated as simple circular obstacles for player movement (can't walk through them).
- Bumping into a hostile NPC triggers a rate-limited (1s) toast notification (`npc-contact` message) and a server console log - not real combat yet, just a placeholder hook for it.
- `behavior` field on `Npc` exists but is unused - reserved for future patrol/aggro/chase AI.

**Multiplayer & Persistence**
- Join/leave handling; other players rendered as distinct colored circles with labels.
- Username-based "login" (no passwords) via a `window.prompt()` on connect.
- Level/xp/stats saved on disconnect, loaded on join.

**UI/Controls**
- Full browser window canvas (800×600 internal resolution).
- HTML overlays: top-left HUD, bottom-left chat panel, dynamically-created toast notifications (level-up, NPC contact).
- Keyboard-only for MVP (WASD/arrows for movement, Enter/Escape for chat).

## 6. Future Features Roadmap (Prioritized)

1. **Client-side prediction** for the local player (instant local movement + reconciliation) instead of interpolating it like remote players.
2. **Combat MVP**: melee attack message, server-validated hit detection, XP/loot on kill. Builds directly on the existing NPC-contact hook.
3. **NPC AI**: patrol/aggro/chase behavior, using the already-present (currently unused) `behavior` field on `Npc`.
4. **Better collision/tilemap authoring**: load a Tiled JSON map instead of the hardcoded array, ideally from a single shared source instead of the current server/client duplication.
5. **Basic interest management**: only send nearby players'/NPCs' state deltas once entity counts grow, using a simple grid bucket per room.
6. **Classes & Skills**: class selection, ability hotbar, different playstyles.
7. **Content**: instanced dungeons (separate Colyseus room types), quests.
8. **Social & Persistence (Later)**: player housing, trading, guilds, proximity chat (the chat moderation module is already factored out to support this without duplication).
9. **Persistence upgrade**: swap `playerStore.ts`'s JSON file for Postgres, keeping the same `loadPlayer`/`savePlayer` function signatures.
10. **Polish & Scale**: real sprites/tilesets, procedural elements, proper accounts/auth, configurable external port for deployments where the router's external port differs from the server's internal port.

Each phase should update this SPEC with detailed mechanics once implemented.

## 7. UI/UX & Graphics
- Style: simple 2D top-down. Green/gray tile palette. Distinct player colors (blue = local player, red = remote players); NPCs red (hostile) or a reserved neutral color (future friendly NPCs).
- Controls: keyboard only for MVP (WASD/arrows move, Enter/Escape control chat). Mouse/touch not yet implemented.
- Layout: canvas fills the game area; top-left HUD (name, level, XP bar); bottom-left chat log + input; toast notifications appear top-center, auto-dismiss.
- Graphics MVP: no external assets - Phaser `Graphics`/shape primitives and text only. Upgrade path: preload sprite/tileset images later.

## 8. Non-Functional Requirements
- **Performance:** 60 FPS client target. Server simulation tick at 20Hz. NPC-vs-player collision is currently O(n) per player per tick - acceptable at current scale (a handful of NPCs), flagged for revisit if that grows substantially.
- **Security:** All critical actions (movement, chat) validated/sanitized server-side. Chat has basic rate limiting and HTML-tag stripping; client also defends by rendering with `textContent` only. No auth/accounts yet - anyone can claim any username.
- **Known accepted vulnerability trade-off:** the server depends on `@colyseus/core` in the 0.15.x line, which carries a moderate `nanoid` advisory (predictable output only when called with non-integer arguments - not something triggerable through Colyseus's normal internal usage). Fixing it requires upgrading to Colyseus 0.17, which changes the Schema callback API (`onAdd`/`onChange` need a proxy wrapper via `getStateCallbacks`) - a deliberate future migration, not a drive-by `npm audit fix --force`. Switching from the `colyseus` meta-package to `@colyseus/core` directly already eliminated the more serious `elliptic`/`grant`/`jwk-to-pem` vulnerability chain (those came from an unused auth/Redis dependency tree the meta-package pulled in).
- **Extensibility:** Loose coupling between networking (Colyseus) and game logic (map, chat, NPC, persistence modules). Easy to add new event handlers, entity types, and systems without touching the room's core loop structure.
- **Reliability:** Graceful disconnects (state saved before removal). No reconnection logic yet (a dropped connection currently just re-joins as a fresh session, reloading saved progress by username).
- **Testing:** Manual multi-tab/browser testing. No automated tests yet.

## 9. Coding Standards & Conventions
- Modern TypeScript everywhere (`const`/`let`, arrow functions, async/await, classes/modules, strict mode).
- Clear, abundant comments, especially for networking, collision, and anything with a non-obvious "why" (e.g., the `@colyseus/core` vs `colyseus` meta-package choice, the server/client map-data duplication).
- Descriptive variable/event names; message/event names (`"move"`, `"chat"`, `"chat-message"`, `"level-up"`, `"npc-contact"`) are treated as a small informal protocol - keep client and server in sync when changing them.
- Version pinning: prefer loose caret ranges (`^0.15.0`) over exact patch pins for fast-moving dependencies like Colyseus packages, since not every patch release makes it to npm and pinning a nonexistent patch causes `ETARGET` install failures.
- **Why `@colyseus/core` instead of `colyseus`:** the `colyseus` meta-package hard-depends on `@colyseus/auth`, `@colyseus/redis-driver`, and `@colyseus/redis-presence` on the 0.15.x line - none of which this project uses - pulling in an unnecessary and vulnerable dependency chain (`grant` → `request-oauth` → `jwk-to-pem`/`uuid` → `elliptic`). Importing `Server`/`Room`/`Client` from `@colyseus/core` directly avoids all of it.
- Error handling on both client and server for network/message boundaries.
- Git commits: atomic, clear messages (e.g., `feat: add global chat with rate limiting`).

## 10. Known Issues / Technical Debt / TODOs
- [ ] Client-side prediction/reconciliation for the local player's own movement (currently interpolated like remote players).
- [ ] Server/client tile-map duplication (`mapData.ts` in both packages) should become a single shared source once maps stop being trivial/hardcoded.
- [ ] NPC-vs-player collision is O(n) per tick; fine now, revisit if NPC/player counts grow.
- [ ] No reconnection/session-resume logic if a client's connection drops mid-session.
- [ ] External port isn't configurable independent of the server's internal port - would matter if a future router/NAT setup needs them to differ.
- [ ] Residual moderate `nanoid` advisory in `@colyseus/core` ≤0.16.24 accepted as a trade-off until the Colyseus 0.17 migration (see Section 8).
- [ ] Deployment checklist/environment variables beyond `PORT` not yet formalized.

## 11. Changelog
- **2026-07-09 (v0.3):** Added global chat system (sanitization, rate limiting, HTML overlay UI). Added hostile NPC system (Schema, spawner, collision, contact notification). Added `stats` map to `Player` schema. Switched server dependency from `colyseus` meta-package to `@colyseus/core` directly (dropped unused auth/redis dependency chain and its vulnerabilities). Bumped `vite` to `^8.0.0` (patches an esbuild dev-server vulnerability; requires Node `^20.19.0` or `>=22.12.0`). Added single-port production deployment (Express serves the built client alongside the Colyseus WebSocket transport). Project officially renamed from working title "EchoRealm" to **VibeRealm** across all code, config, and docs.
- **2026-07-06 (v0.1):** Initial SPEC created. Defined MVP scope and architecture; initial scaffold implemented server-authoritative movement, tile collision, passive leveling, and Colyseus Schema sync.

## Appendix
- **References:** Colyseus docs (rooms, Schema, `getStateCallbacks` for 0.17+), Phaser 3 docs, Vite docs.
- **Deployment notes:** Single-port model - build the client (`npm run build` in `client/`), run the server (`npm run dev` or `npm run build && npm start` in `server/`), forward TCP port 2567 on the router. No separate static hosting or reverse proxy required for the current friends-testing scale.
- **Next steps reminder:** Use this SPEC in all Claude prompts for context. Update it after each major feature or architectural decision - this version was rewritten after chat and NPCs shipped and the project was renamed, to keep it from drifting out of sync with the implementation again.
