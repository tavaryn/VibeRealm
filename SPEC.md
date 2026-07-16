# VibeRealm - Browser MMORPG Project Specification

**Last Updated:** 2026-07-15
**Version:** 0.8 (MVP In Progress)
**Status:** Playable MVP - movement (with client-side prediction), leveling, chat, NPCs, targeting, a login screen, disconnect handling, a server-authoritative admin command system, UUID v7 entity identity, and a lightweight ECS architecture are implemented; the overworld room is persistent across client connects/disconnects.
**Project Goal:** Build a playable MVP iteratively, one feature at a time, with Claude as ongoing development partner.

## 1. Vision & High-Level Goals
VibeRealm is a lightweight, browser-based 2D top-down MMORPG. It emphasizes **real-time multiplayer exploration** in a shared small overworld, simple but satisfying **leveling and progression**, and social features like chat. Graphics are intentionally simple (colored shapes, basic tiles, text labels) to allow rapid development and focus on **mechanically intricate systems** that can be expanded over time.

Core fantasy: A cozy yet adventurous persistent world where players can see each other, level up through exploration and future activities, target and fend off (eventually fight) hostile mobs, and build a small community. The game is designed for solo development with AI assistance (Claude), easy local testing, and low-cost hosting for friends. The developer (as server operator) can also moderate and manage that world directly, via server console or in-game admin commands.

**Target Audience:** Friends, indie game enthusiasts, and the developer (for learning and fun).
**Success Metrics for MVP:** 2+ concurrent players can connect (including over the internet, not just LAN) via a proper login screen, move around a shared world with responsive, non-laggy-feeling controls, gain levels, chat in real-time, encounter simple hostile NPCs at designated locations, target players/NPCs to see their name/level/HP, be returned cleanly to login if disconnected, and have the developer able to moderate/manage the world (ban, kick, grant XP, shut down gracefully) - all while the shared world itself (players' saved progress, NPCs) persists independently of any single client's connection, for as long as the server process runs.

## 2. Tech Stack
- **Backend:** Colyseus (imported directly via `@colyseus/core`, not the `colyseus` meta-package - see Section 9 for why) + TypeScript + Node.js. Server-side game logic is organized as a lightweight ECS (Entities/Components/Systems) - see Section 3a.
- **Frontend:** Phaser 3 (game rendering, camera, input handling, Arcade Physics for bounds) + plain HTML/CSS overlay for the login screen, HUD, target frame, and chat. Built with Vite.
- **Entity Identity:** UUID v7 (`uuid@^11`, pinned below `uuid@12`'s CommonJS-dropping breaking change) - see Section 3c.
- **Persistence (MVP):** In-memory state (Colyseus Schema `MapSchema`) + username-based JSON file save/load (`server/data/players.json`) for level/xp/stats. Also JSON files for admin roles (`server/data/admins.json`) and bans (`server/data/bans.json`) - see Section 3d. Future: SQLite or Postgres, same load/save function signatures.
- **Development Tools:** Git, VS Code (or similar), Claude Projects for AI assistance.
- **Hosting:** Self-hosted on the developer's own machine with router port forwarding (single port, see Section 3). Render.com/Railway.app remain options for future always-on hosting.

**Alternatives Considered:** Socket.io + Express (originally planned, replaced early with Colyseus for built-in Schema-based delta sync and room/instancing support). Pure Canvas (more boilerplate). Heavy frameworks like React (unnecessary for a game loop). A full generic ECS engine/library (considered and deliberately rejected in favor of a lightweight, hand-rolled pattern sized for this project - see Section 3a).

## 3. Architecture Overview

- **Client-Server Model:** Fully server-authoritative. Clients send only input state (movement keys, chat text, target selection, and admin command text); the server simulates, validates, and syncs everything else.
  - **Movement is client-side predicted with server reconciliation** (see Section 3b). Remote players and NPCs still interpolate toward server-confirmed positions; only the local player's own movement is predicted.
  - Target selection follows the same request/validate/echo pattern: a client's click/TAB press is a *request*, and the target frame only updates once the server has validated and echoed it back via synced state - never assumed optimistically client-side.
  - **Client entry is gated by a login screen** and **the shared overworld room is persistent** across client connects/disconnects - see Section 3b.
  - **Admin commands** (server console or in-game `/`-prefixed chat) are validated, executed, and logged entirely server-side via a shared command registry - see Section 3d.
- **Core Components:**
  - **Colyseus Rooms**: The main overworld runs in a single, persistent `OverworldRoom`. Future dungeons/housing can use separate Room types for instancing.
  - **Colyseus Schemas**: `Player` and `Npc` both live in `OverworldState` as `MapSchema`s. Clients receive only deltas/patches for efficiency.
    - `Player` carries `id` (UUID v7 - see Section 3c), `hp`/`maxHp` (groundwork for Combat MVP), and `targetId`/`targetType` (synced).
    - `Npc` also carries `id` (UUID v7, and the actual `state.npcs` MapSchema key) and `targetId`/`targetType`, deliberately **not** synced (no `@type` decorator).
  - **ECS Systems** (`server/src/ecs/systems/`): `MovementSystem`, `NpcSpawnSystem`, `NpcContactSystem`, `TargetingSystem`, `LevelingSystem` - see Section 3a for the full architecture.
  - **Admin Command System**: A single `CommandRegistry` (server-only, not part of any Schema, and not an ECS system) that both server console input and in-game chat route into - see Section 3d.
  - **Game Logic Separation**: Networking/state handled by Colyseus; every piece of game logic (movement, collision, leveling, chat moderation, NPC spawning/contact, targeting, admin commands) lives in its own module - either an ECS system or, for message-driven/administrative concerns, its own dedicated file.
- **Data Flow**: Client shows a login screen on load → on submit, it connects and joins/creates `"overworld"` (rejected at `onAuth` if the username is banned) → once joined, the client sends input state (movement flags, tagged with a prediction sequence number), a chat/action message (including admin commands, prefixed with `/`), or a target request → `OverworldRoom` forwards this into the relevant ECS system (movement flags update `Player` fields consumed by `MovementSystem` on the next tick; a `set-target` message calls `TargetingSystem.setTarget()` directly; admin commands route through `CommandRegistry`) → Schema state updates → Colyseus automatically broadcasts patches to relevant clients.
- **Extensibility**: Designed so adding combat, classes, skills, NPC AI, new Room types, new admin commands, or new zones/maps requires minimal changes to the core networking layer or to unrelated systems. The ECS pattern (Section 3a) and the static data layer (Section 3c... see note below) mean new game content is usually a new data file entry and/or a new system, not a rewrite of existing ones.
- **Deployment model - unified for dev AND production:** The Express server serves the client's build (`client/dist/`) on the same port Colyseus's WebSocket transport uses, so only **one process and one port** are involved end-to-end, in both development and when playing with friends. Day-to-day development is: `cd client && npm run build` once (and again after any client-side change), then `cd server && npm run dev` - connect at `http://localhost:2567` (or the LAN/public IP, same port). **Important habit:** the server does not currently watch/rebuild the client automatically - after editing anything under `client/src` or `client/index.html`, you must re-run `npm run build` in `client/` and hard-refresh the browser before the change will show up. The server terminal is also an interactive admin console once running (see Section 3d).
- **Project Structure:** Two independent npm packages, not a single monorepo - chosen so the Vite-based Phaser client and the Colyseus/Node server can each use their own tooling, TS config, and dependency versions without conflict. `node_modules/` and `dist/` (both packages) and `server/data/*.json` (runtime persistence) are gitignored as of this version - previously committed by accident; see Section 10.

### 3a. ECS Architecture *(new in v0.8)*

**Problem it solves:** as the room's feature set grew (movement, NPCs, targeting, leveling, admin commands), all of that logic lived directly on `OverworldRoom` as private methods and fields. That worked fine early on, but every new mechanic (combat, skills, inventory, housing) would have kept adding to one increasingly large class, with game data (tile maps, mob stats, tuning numbers) hardcoded inline alongside the logic that used it.

**Design philosophy - lightweight, not a generic engine:** a full textbook ECS (generic entity registry, component arrays, a query DSL) is built for engines managing thousands of heterogeneous entities with many optional component combinations. VibeRealm has two entity types and one room. Building a from-scratch ECS framework here would add indirection without payoff. Instead, VibeRealm adopts the *pattern* - data/logic separation, systems that don't know about "Player" specifically wherever avoidable - sized for this codebase:

- **Entities** are just UUID v7 strings (see Section 3c) - no `Entity` class exists.
- **Synced components** remain flat fields directly on the `Player`/`Npc` Colyseus Schemas for now (not yet split into nested component sub-schemas - a possible future refinement, not required for the current feature set).
- **Server-only (non-synced) components** - data clients never need to see - live in `World`'s generic component store (`world.componentStore<T>(name)`, a `Map<EntityId, T>` keyed by a chosen component name). Currently used for `NpcContactSystem`'s per-session cooldown timestamps.
- **Systems** (`server/src/ecs/systems/`) are the actual game logic, each in its own file:
  - `MovementSystem` - tick-based (implements `ecs/World.ts`'s `System` interface: `update(world, dtSeconds)`), runs every 20Hz simulation tick. Owns wall/NPC collision. Reports a blocked-by-NPC move via an injected `onNpcContact` callback rather than owning contact notification itself.
  - `NpcSpawnSystem` - reactive-on-interval (not tick-based); `tick()` is called from `OverworldRoom`'s existing `clock.setInterval(...)`, checking every designated spawn point (see Section 3c's spawn-point redesign) and spawning into any that's currently empty.
  - `NpcContactSystem` - purely reactive; `handleContact()` is called directly by `MovementSystem`'s injected callback whenever a move is blocked by an NPC. Owns the per-session cooldown (stored via `World`'s component store) and the `npc-contact` broadcast.
  - `TargetingSystem` - purely reactive; `setTarget()` is called directly from `OverworldRoom`'s `"set-target"` message handler. Validates and applies target-selection requests.
  - `LevelingSystem` - reactive/interval; `grantXp()` is called both by `OverworldRoom`'s passive-XP interval (via `grantPassiveTick()`) and by the `/givexp` admin command (via a thin `OverworldRoom.grantXp()` wrapper - see below). Owns the level-up threshold loop and the `level-up` broadcast.
- **`World`** (`server/src/ecs/World.ts`) wraps the Colyseus `OverworldState`, holds the generic server-only component store, and provides a simple `registerSystem()`/`update()` scheduler for tick-based systems (currently just `MovementSystem`). Reactive/interval systems (the rest) aren't registered with this scheduler - they're constructed once and called into directly from wherever their trigger actually happens (a message handler, an interval, an admin command), since forcing every system through one uniform "tick" interface added no value for logic that isn't naturally tick-driven.
- **`OverworldRoom` is now a thin adapter**: Colyseus lifecycle hooks (`onAuth`/`onJoin`/`onLeave`/`onDispose`), message wiring (`"move"`, `"set-target"`, `"chat"`), interval/tick scheduling, and two small compatibility wrappers (`grantXp()`) kept specifically so the admin module (`server/src/admin/`) can keep calling `room.grantXp(...)` directly without needing to import or know that ECS systems exist at all - preserving the existing "admin module never imports `OverworldRoom` directly, only a structural `AdminRoomApi` interface" rule from Section 9.
- **Migration was done in four incremental phases**, each independently tested before moving to the next (matching the project's usual "one feature at a time" workflow): (1) data layer + scaffolding, no behavior change; (2) movement/collision → `MovementSystem`; (3) NPC spawning/contact → `NpcSpawnSystem`/`NpcContactSystem` (with a mid-phase redesign of the spawning mechanic itself - see Section 3c); (4) targeting/leveling → `TargetingSystem`/`LevelingSystem`.
- **Known accepted trade-off:** synced components (`Position`/`Identity`/`Health`/`TargetRef`-equivalents) are not yet split into real nested Colyseus sub-schemas - `Player`/`Npc` remain flat field lists. Splitting them is a natural next refinement once a system needs to operate generically across "anything with health" or "anything with a position" rather than being written against `Player`/`Npc` specifically (e.g. Combat MVP, which needs damage logic to apply to both).

### 3b. Client-Side Movement Prediction & Login/Session Lifecycle

Unchanged in this version - see the equivalent sections in earlier SPEC revisions for full mechanics (client-side prediction with server reconciliation via `move-ack`; the HTML/CSS login screen and `room.onLeave`-driven disconnect handling; the persistent `autoDispose = false` overworld room). `MovementSystem` (Section 3a) now owns the server side of the collision math that client-side prediction mirrors, but the actual math and the prediction/reconciliation protocol between client and server are byte-for-byte unchanged from before the ECS migration - this was explicitly verified during Phase 2 testing.

### 3c. UUID v7 Entity Identity & the Static Data Layer *(UUID work done pre-v0.8, data layer new in v0.8)*

**UUID v7 migration:** All entity ids (`Player.id`, `Npc.id`) now use UUID v7 (`server/src/utils/generateId.ts`, backed by `uuid@^11`) instead of ad-hoc schemes (a copy of `client.sessionId` for players; a module-level incrementing counter for NPCs).
- **Why UUID v7:** time-ordered (a millisecond timestamp is embedded, so ids sort naturally in logs/future DB indexes without a separate `createdAt` column); globally unique with no shared counter to coordinate (safe if VibeRealm ever spawns entities from more than one room/process); and a much better foundation for a *stable* per-account player identity once real accounts/auth exist (Roadmap #10) than a value tied to a single WebSocket connection.
- **Critical distinction preserved:** `state.players` is still keyed by Colyseus's own `client.sessionId`, NOT by `player.id` - Colyseus needs `sessionId` for `client.leave()`/matching `room.clients` entries, and targeting/collision/NPC-contact-cooldown tracking all continue to use that map key. `player.id` is an independent, forward-compatible identity field, currently regenerated fresh on every join (same ephemerality as `sessionId` was) since no persisted per-account id exists yet in `players.json`. `Npc.id`, by contrast, IS the `state.npcs` MapSchema key (NPCs aren't tied to a live connection, so no split was needed there).
- **Admin command impact:** `admin/entityLookup.ts`'s `findPlayerByIdentifier()` returns `{ player, sessionId }` rather than just the player Schema instance, since the two are no longer guaranteed to be the same string. `/ban`, `/kick`, `/kill` all resolve the live WebSocket client via the returned `sessionId`, never `player.id`. `admin/types.ts`'s `AdminRoomApi.grantXp` signature takes `sessionId` explicitly for the same reason (used for the `level-up` broadcast's `sessionId` field).
- **Bugs this surfaced and fixed along the way:** `npcContactCooldown` was originally keyed by `player.id` but cleaned up on disconnect by `sessionId` - a silent memory leak (every disconnect left a stale entry) - fixed by threading `sessionId` through explicitly (now the `NpcContactSystem`'s component-store key, post-ECS-migration). The `npc-contact` and `level-up` broadcasts' `sessionId` fields had the same bug (harmless for `level-up`, since the client only reads `username`/`level` from it, but genuinely broke the `npc-contact` "bumped into" toast, since the client compares that field against its own session id).

**Static data layer** (`server/src/data/`): every tunable number and content definition that used to be hardcoded inline (in `OverworldRoom.ts`'s top-of-file constants, or inside `npcFactory.ts`) now lives in its own file here:
- `mapData.ts` - the tile grid (moved from the old `server/src/map/`, no content change).
- `npcTemplates.ts` - NPC/mob definitions (name pool, base stats) as an array of templates, keyed by `id` - replaces `npcFactory.ts`'s old hardcoded name pool.
- `npcSpawnPoints.ts` *(new)* - see the spawn-point redesign below.
- `characterTemplates.ts` - default new-player stats (starting level/xp/hp/maxHp/power).
- `levelingConfig.ts` - the XP-per-level formula's multiplier, passive XP amount/interval.
- `gameplayConfig.ts` - movement speed, simulation tick rate, collision box ratio, NPC contact radius/cooldown, spawn-point occupancy radius.
- **Not to be confused with** `server/data/` (lowercase, one level up from `src/`) - that's the *runtime* persistence folder (`players.json`, `admins.json`, `bans.json`), a completely unrelated thing that happens to share the word "data."

**NPC spawning redesign** *(mid-migration pivot)*: the original ECS-migration plan simply relocated the pre-existing "spawn one mob every ~10s at any random walkable tile, up to a population cap of 15" mechanic into a system unchanged. Partway through Phase 3, this was deliberately redesigned instead, since that mechanic was only ever a testing convenience and was never meant to survive into the real game (which will spawn NPCs at fixed per-zone locations - camps, dungeon entrances, patrol posts):
- `data/npcSpawnPoints.ts` now lists fixed spawn point coordinates (currently 8, scattered around the single overworld zone) as `{ id, x, y, templateId }` - a flat array today since there's only one zone, designed to extend naturally to `Record<zoneId, NpcSpawnPoint[]>` once multiple zones/maps exist, without needing another redesign.
- `NpcSpawnSystem.tick()` (still triggered by the same coarse `clock.setInterval`, per `gameplayConfig.npcSpawnCheckIntervalMs`) checks every designated point and spawns into any that's currently unoccupied (a simple proximity check against existing NPCs, `gameplayConfig.spawnPointOccupancyRadiusRatio`).
- Population is now **emergent** from the number of designated spawn points rather than a separate arbitrary cap - `gameplayConfig.maxHostileMobs` was removed entirely.
- `templateId` on each spawn point is forward-looking and not yet consumed (`npcFactory.createHostileMob()` still only knows the single `hostile_basic` template) - ready for whenever a second mob type exists and different points want different mobs.
- **Known accepted trade-off, deliberately temporary:** a single global interval re-checks every point on the same cadence (rather than each point independently managing its own respawn delay), and spawning is still driven by wall-clock time rather than a zone/map actually being "entered" (there's only one zone today, so that concept doesn't mean anything yet). Both are real future work once zones/maps exist (see Roadmap).

### 3d. Admin Command System

Unchanged in this version - see earlier SPEC revisions for full mechanics (single `CommandRegistry` shared by the server console and in-game `/`-prefixed chat; bans persisted and checked in `onAuth`; built-in commands `/help`, `/who`, `/quit`, `/ban`, `/unban`, `/kick`, `/kill`, `/givexp`). The only change from the UUID v7 and ECS work is internal: `entityLookup.ts`'s return shape (Section 3c) and `OverworldRoom.grantXp()` now delegating to `LevelingSystem` (Section 3a) instead of containing the logic directly - the admin module's own code and the command set itself are unaffected.

## 4. Data Models & Schemas

**Player Schema** (Colyseus Schema, `server/src/rooms/schema/Player.ts`):
```ts
class Player extends Schema {
  @type("string") id;           // UUID v7 - NOT the same as this player's Colyseus sessionId (see Section 3c)
  @type("string") username;
  @type("number") x;
  @type("number") y;
  @type("number") level;       // starts at 1
  @type("number") xp;          // starts at 0
  @type("number") hp;          // starts at 100; groundwork for Combat MVP, unused by any logic yet
  @type("number") maxHp;       // starts at 100
  @type({ map: "number" }) stats;   // extensible; currently just "power" (default 10)

  @type("string") targetId;    // "" = no target
  @type("string") targetType;  // "player" | "npc" | ""

  // Server-only, not synced to clients:
  inputUp; inputDown; inputLeft; inputRight;  // current movement input flags, read by MovementSystem
}
```

**NPC Schema** (Colyseus Schema, `server/src/rooms/schema/Npc.ts`):
```ts
class Npc extends Schema {
  @type("string") id;    // UUID v7 - this IS the state.npcs MapSchema key (see Section 3c)
  @type("string") name;
  @type("number") x;
  @type("number") y;
  @type("number") level;
  @type("number") hp;
  @type("number") maxHp;
  @type("boolean") isHostile;
  @type({ map: "number" }) stats;   // mirrors Player.stats, currently "power"
  @type("string") behavior;         // placeholder for future AI state machine; always "static" for now

  // Server-only, deliberately unsynced:
  targetId; targetType;
}
```

**Room State** (`OverworldState`):
```ts
class OverworldState extends Schema {
  @type({ map: Player }) players;   // keyed by client.sessionId, NOT Player.id - see Section 3c
  @type({ map: Npc }) npcs;         // keyed by Npc.id
}
```

**World/Map:**
- 30×30 tile grid (`server/src/data/mapData.ts`), `0` = walkable, `1` = wall/obstacle. Border tiles are always walls; a handful of scattered obstacle tiles are hardcoded.
- **Important:** the tile array is duplicated between `server/src/data/mapData.ts` (authoritative, used for collision) and `client/src/map/mapData.ts` (render-only **and** used for client-side movement prediction) - unchanged accepted trade-off, see Section 8.
- Player/NPC collision uses a small AABB-style corner check against tiles (`MovementSystem.isPositionWalkable`), and a simple radius-based circle check between entities. This exact corner-check math is duplicated client-side too (`predictedMovement.ts`) for prediction purposes.

**NPC Spawn Points** (`server/src/data/npcSpawnPoints.ts`) - see Section 3c for the full design:
```ts
interface NpcSpawnPoint {
  id: string;
  x: number;
  y: number;
  templateId: string;  // not yet consumed - reserved for multiple mob templates
}
```

**Persistence:**
- `server/data/players.json`, keyed by username: `{ username, level, xp, stats: { power } }`. Loaded on join, saved on disconnect. `hp`/`maxHp` are not currently persisted.
- **Room-scoped state (NPCs, etc.) is persistent for the lifetime of the server process** rather than tied to client connections - it is *not* saved to disk, so it still resets on an actual server restart.
- **`server/data/admins.json`**: a plain JSON array of admin usernames, checked case-insensitively.
- **`server/data/bans.json`**: an array of `{ username, reason, bannedBy, bannedAt }` entries.
- All three are gitignored as of this version (Section 10) - runtime instance data, not source.

## 5. MVP Features (Implemented)

**ECS Architecture** *(new)*
- Movement/collision, NPC spawning, NPC contact notification, targeting, and leveling each live in their own system under `server/src/ecs/systems/`, coordinated by a lightweight `World` (Section 3a).
- All tunable numbers and content definitions (map, NPC templates/spawn points, character defaults, leveling curve, gameplay tuning) live in `server/src/data/`, not hardcoded inline in logic files.

**UUID v7 Entity Identity** *(new, documented for the first time this version)*
- Every player and NPC has a stable UUID v7 `id`, independent of Colyseus's own `client.sessionId` for players (Section 3c).

**Admin Command System**
- Server console + in-game `/`-prefixed chat, both routed through a single shared registry. Built-ins: `/help`, `/who`, `/quit`, `/ban`, `/unban`, `/kick`, `/kill`, `/givexp`. Unchanged this version aside from internal plumbing (Section 3c/3d).

**Login Screen & Session Lifecycle**
- Unchanged this version - full-viewport login screen, graceful disconnect handling, persistent overworld room.

**Overworld Exploration**
- 30×30 tile map, colored-rectangle rendering, camera follows local player.

**Player Movement**
- WASD or arrow keys, server-authoritative at a fixed 20Hz tick (now `MovementSystem`), client-side prediction + reconciliation unchanged and verified byte-for-byte identical post-migration.

**Leveling & Progression**
- Passive XP gain (+5) every ~25s, level-up threshold `level * 100`, now owned by `LevelingSystem`. HUD unchanged.

**Chat System**
- Unchanged this version - global chat, sanitized/rate-limited, `/`-prefixed messages routed to admin commands.

**NPCs (Hostile Mobs)** *(spawning mechanic redesigned this version)*
- Spawn only at 8 designated fixed points scattered around the overworld (`data/npcSpawnPoints.ts`), one NPC per point, checked on a coarse interval (`NpcSpawnSystem`) - see Section 3c for the full redesign rationale. Population is emergent from spawn point count, not a separate cap.
- Bumping into a hostile NPC still triggers a rate-limited (1s) toast notification (`NpcContactSystem`), now correctly keyed by session id end-to-end (Section 3c bug fix).
- Can still be force-removed via `/kill`; a new one will respawn at that point once the next spawn-point check runs.

**Targeting System**
- Unchanged this version - click or TAB-cycle, server-validated via `TargetingSystem`, target HUD unchanged.

**Multiplayer & Persistence**
- Unchanged this version.

**UI/Controls**
- Unchanged this version.

## 6. Future Features Roadmap (Prioritized)

1. **Combat MVP**: melee attack message, server-validated hit detection against the player's current target, XP/loot on kill. A natural next candidate for a new `ecs/systems/CombatSystem.ts`. May also be the point where `hp`/`maxHp`/position get split into real nested Colyseus sub-schemas (Section 3a's noted trade-off), since combat needs to apply generically to both Player and Npc.
2. **NPC AI**: patrol/aggro/chase behavior, using the already-present (currently unused) `behavior` field and the unsynced `targetId`/`targetType` fields on `Npc`. Will also mean revisiting the "NPCs aren't predicted client-side" trade-off.
3. **Zones/multiple maps**: extend `data/npcSpawnPoints.ts` from a flat array to `Record<zoneId, NpcSpawnPoint[]>` (or one file per zone), and move spawning from a global wall-clock interval to zone-load-triggered/per-point respawn timers (Section 3c's two flagged temporary simplifications). Likely pairs naturally with loading real Tiled JSON maps instead of the hardcoded array (old Roadmap #3).
4. **Basic interest management**: only send nearby players'/NPCs' state deltas once entity counts grow.
5. **Wire admin `command-reply`/`server-shutdown` into visible UI**: currently only visible via the browser dev console.
6. **Classes & Skills**: class selection, ability hotbar, different playstyles.
7. **Content**: instanced dungeons (separate Colyseus room types), quests.
8. **Social & Persistence (Later)**: player housing, trading, guilds, proximity chat.
9. **Persistence upgrade**: swap `playerStore.ts`'s JSON file for Postgres. Decide whether `hp`/`maxHp` and a *stable* (not per-session-regenerated) `player.id` get persisted once real accounts exist.
10. **Polish & Scale**: real sprites/tilesets, procedural elements, proper accounts/auth, configurable external port.
11. **Reconnection / session-resume**: automatic reconnect-with-backoff and session-resume.
12. **Web admin panel**: an HTTP layer calling the same `commandRegistry.execute()` used by console and chat today.
13. **More admin commands**: `/spawn`, `/teleport`, `/setlevel`, `/mute`, `/broadcast`.
14. **Synced ECS components** *(new)*: split `Position`/`Health`/`TargetRef`-equivalent fields from `Player`/`Npc` into real nested Colyseus sub-schemas, so systems (especially the eventual `CombatSystem`) can operate generically across "anything with health" rather than being written against `Player`/`Npc` by name.

Each phase should update this SPEC with detailed mechanics once implemented.

## 7. UI/UX & Graphics
Unchanged this version - see earlier SPEC revisions.

## 8. Non-Functional Requirements
- **Performance:** Unchanged (60 FPS client target, 20Hz server tick). NPC-vs-player collision and TAB-cycle candidate gathering remain O(n) per tick/keypress, still acceptable at current scale.
- **Security:** Unchanged - all critical actions validated/sanitized server-side; movement prediction is a client-feel technique only.
- **Known accepted vulnerability trade-off:** `@colyseus/core` 0.15.x still carries a moderate `nanoid` advisory (unchanged, pending a future 0.17 migration).
- **Known accepted architecture trade-off:** movement/collision math remains duplicated in three conceptually-linked places - `MovementSystem.ts` (authoritative), `client/src/network/predictedMovement.ts` (client prediction), and the tile data itself in both `mapData.ts` copies. Relocating the authoritative copy into `MovementSystem.ts` during the ECS migration did not change this trade-off's shape, only where the "server" side of it lives.
- **`ignoreDeprecations` note** *(new)*: `server/tsconfig.json` sets `"ignoreDeprecations": "5.0"` to silence a `TS5107` deprecation warning (`moduleResolution: node10`) that a locally-installed TypeScript 5.9.3 escalates to a hard build error. This value is specific to what 5.9.x's compiler actually validates (its own emitted guidance pointing at `"6.0"` turned out not to be accepted by that version) and will need revisiting - likely via an actual migration to `moduleResolution: nodenext`, not just a new suppression value - whenever TypeScript is next upgraded past 6.0. Flagged here so it isn't rediscovered as a surprise.
- **Reliability:** Unchanged - persistent overworld room, graceful disconnect handling, `/quit` for clean shutdown.
- **Extensibility:** Significantly improved this version - see Section 3a. New game logic is now, in the common case, a new system file plus a data file entry, rather than a growing `OverworldRoom`.
- **Testing:** Manual multi-tab/browser testing (unchanged), plus this version's ECS migration was verified in four independently-tested phases rather than as one large change - each phase confirmed to behave identically (or, for the NPC spawn redesign, exactly as intended) before moving to the next. No automated tests yet.

## 9. Coding Standards & Conventions
- Modern TypeScript everywhere (`const`/`let`, arrow functions, async/await, classes/modules, strict mode).
- Clear, abundant comments, especially for networking, collision, and anything with a non-obvious "why."
- Descriptive variable/event names; message/event names are treated as a small informal protocol.
- Version pinning: prefer loose caret ranges (`^0.15.0`) for fast-moving dependencies, but pin tightly (e.g. `uuid@^11`, staying below a known breaking major) when a specific major-version boundary is known to break something (CommonJS support, in `uuid`'s case).
- **ECS conventions (new, v0.8):**
  - Every piece of gameplay logic lives in its own file under `ecs/systems/`, one responsibility each.
  - Tick-based systems implement `ecs/World.ts`'s `System` interface (`update(world, dtSeconds)`) and are registered with `World.registerSystem()`. Reactive or interval-driven systems (the majority so far) are plain classes constructed once in `OverworldRoom.onCreate()` and called into directly from wherever their trigger actually occurs - forcing every system through one uniform tick interface was judged to add no value for logic that isn't naturally tick-driven.
  - Systems that need to broadcast to clients take a `broadcast` callback via constructor injection rather than importing Colyseus's `Room` type directly - keeps systems testable in isolation and avoids a dependency on the room implementation.
  - **No hardcoded data in logic files.** Every tunable number or content definition (map data, NPC templates/spawn points, character defaults, leveling curve, gameplay tuning) lives in `server/src/data/`, imported by whichever system(s) need it.
- **`@colyseus/core` vs `colyseus`, `autoDispose`, admin import direction:** unchanged from earlier SPEC revisions - see those sections for the "why."
- **UUID v7 / sessionId distinction (new, v0.8):** `player.id` (UUID v7) and the Colyseus `client.sessionId` used as the `state.players` MapSchema key are deliberately different strings after this version's migration - any new code that needs to reach a live WebSocket client (kick/ban/kill-style operations) must use `sessionId`, never `player.id`. `Npc.id`, by contrast, IS its MapSchema key (no split needed, since NPCs aren't tied to a live connection).
- Error handling on both client and server for network/message boundaries, unchanged.
- Git commits: atomic, clear messages (e.g., `feat: migrate movement to MovementSystem (ECS Phase 2)`, `fix: rekey npcContactCooldown by sessionId not player.id`, `refactor: NPC spawning uses fixed spawn points instead of random tiles`).

## 10. Known Issues / Technical Debt / TODOs
- [ ] Server/client tile-map duplication, joined by movement/collision math duplication (`MovementSystem.ts` vs `predictedMovement.ts`) - should become a single shared source once maps stop being trivial/hardcoded.
- [ ] NPC collision is not predicted client-side.
- [ ] NPC-vs-player collision, and TAB-cycle target-candidate gathering, are O(n) per tick/keypress.
- [ ] No automatic reconnection/session-resume logic.
- [ ] External port isn't configurable independent of the server's internal port.
- [ ] Residual moderate `nanoid` advisory in `@colyseus/core` ≤0.16.24.
- [ ] `hp`/`maxHp` are not yet persisted.
- [ ] The client build (`client/dist`) is not automatically rebuilt/watched by the server process.
- [ ] Prediction correction tuning is based on local/low-latency testing so far.
- [ ] No password/auth yet.
- [ ] Admin `command-reply` and `server-shutdown` client messages aren't rendered in the game UI yet.
- [ ] A banned username's failed login shows generic connection-error copy, not a specific ban message.
- [ ] Admin permission is username-only with no password layer.
- [ ] `admins.json`/`bans.json` are read from disk on every check (no caching).
- [ ] **(new, v0.8)** `player.id` is regenerated fresh on every join, same ephemerality as `sessionId` - not yet a truly stable per-account identity, since no persisted per-account id exists in `players.json` yet. Revisit alongside Roadmap #10/#9.
- [ ] **(new, v0.8)** NPC spawning is still a single global wall-clock interval re-checking every spawn point, and isn't triggered by zone entry (there's only one zone) - both explicitly deferred until zones/maps exist (Roadmap #3).
- [ ] **(new, v0.8)** Synced Colyseus components (`Position`/`Health`/`TargetRef`-equivalents) are not yet split into real nested sub-schemas - `Player`/`Npc` remain flat field lists (Roadmap #14).
- [ ] **(new, v0.8)** `server/tsconfig.json`'s `"ignoreDeprecations": "5.0"` is a stopgap for a TypeScript 5.9.3-specific quirk (Section 8) and will need real attention (likely a `moduleResolution` migration) on the next TypeScript upgrade past 6.0.
- [x] **(resolved, v0.8)** `server/node_modules`, `server/dist`, `client/node_modules`, `client/dist`, and `server/data/*.json` were previously committed to git by accident (no `.gitignore` existed) - a `.gitignore` now exists and `git rm --cached` was used to untrack them.

## 11. Changelog
- **2026-07-15 (v0.8):** Two major, previously-undocumented pieces of work landed in this version:
  1. **UUID v7 entity identity migration** (done prior to this SPEC update, documented here for the first time): `Player.id`/`Npc.id` now use UUID v7 (`server/src/utils/generateId.ts`, `uuid@^11`) instead of ad-hoc schemes (a copy of `client.sessionId` for players; a sequential counter for NPCs). `state.players` remains keyed by `client.sessionId`, NOT `player.id` - the two are now deliberately different strings. This surfaced and fixed two related bugs: `npcContactCooldown` was keyed by `player.id` but cleaned up by `sessionId` (a silent per-disconnect memory leak), and the `npc-contact`/`level-up` broadcasts' `sessionId` fields had the same mismatch (breaking the "bumped into" toast entirely, since the client compares that field against its own session id). Admin lookup (`entityLookup.ts`) now returns `{ player, sessionId }` so `/ban`/`/kick`/`/kill` correctly resolve the live connection.
  2. **Lightweight ECS migration**, done in four incrementally-tested phases: (1) a `server/src/data/` static data layer (map, NPC templates, character defaults, leveling/gameplay tuning) extracted from previously-hardcoded values, plus `ecs/` scaffolding (`World`, component-store pattern); (2) movement/collision → `MovementSystem`, verified byte-for-byte identical to the pre-migration logic since client-side prediction mirrors it independently; (3) NPC spawning/contact → `NpcSpawnSystem`/`NpcContactSystem`, with a mid-phase redesign replacing "spawn anywhere randomly on a timer, capped at 15" with fixed designated spawn points (`data/npcSpawnPoints.ts`, 8 points, one NPC per point, population emergent from point count) - the old mechanic was only ever a testing convenience and was never meant to represent the finished per-zone spawning design; (4) targeting/leveling → `TargetingSystem`/`LevelingSystem`. `OverworldRoom` is now a thin adapter: Colyseus lifecycle/message wiring plus a couple of compatibility wrappers (`grantXp()`) for the admin module, which still doesn't need to know any ECS systems exist.
  Also this version: added a proper `.gitignore` (previously absent) and untracked `node_modules`/`dist`/`server/data/*.json`, which had been committed by accident; pinned `server/tsconfig.json`'s `ignoreDeprecations` to `"5.0"` (the value actually accepted by the installed TypeScript 5.9.3, despite that compiler's own error text pointing at `"6.0"`) to resolve a `moduleResolution: node10` deprecation warning escalating to a build-blocking error.
- **2026-07-10 (v0.7):** Added a server-authoritative Admin Command System. New `server/src/admin/` module: a `CommandRegistry` shared by an interactive server console and in-game `/`-prefixed chat. Built-in commands: `/help`, `/who`, `/quit`, `/ban`/`/unban`, `/kick`, `/kill`, `/givexp`.
- **2026-07-10 (v0.6):** Added a proper login screen replacing the old blocking `window.prompt()`, graceful disconnect handling, and fixed the shared `OverworldRoom` being destroyed/recreated empty on last-client-leave (`autoDispose = false`).
- **2026-07-10 (v0.5):** Added client-side movement prediction with server reconciliation.
- **2026-07-10 (v0.4):** Added Targeting System.
- **2026-07-09 (v0.3):** Added global chat system, hostile NPC system, `stats` map on `Player`. Switched to `@colyseus/core` direct import. Project renamed from "EchoRealm" to **VibeRealm**.
- **2026-07-06 (v0.1):** Initial SPEC created.

## Appendix
- **References:** Colyseus docs (rooms, Schema, `autoDispose`, `onAuth`), Phaser 3 docs, Vite docs, Node `readline` docs, `uuid` package docs (v7 support, CommonJS-vs-ESM breaking change at v12), TypeScript deprecation/migration docs (`moduleResolution: node10`/`nodenext`, `ignoreDeprecations`).
- **Deployment notes:** Unchanged - single-port model for both dev and production; forward TCP port 2567 on the router for friends; set `ADMIN_USERNAMES` (or edit `server/data/admins.json`) before running if you want in-game admin commands available.
- **Testing notes:** In addition to earlier testing guidance (DevTools latency throttling, kill/restart-server disconnect flow, `/who`/`/givexp`/`/ban`/`/quit` from both console and chat) - this version's ECS migration was verified phase-by-phase: movement/collision feel and wall-sliding behavior unchanged after Phase 2; spawn-point occupancy behavior (exactly one NPC per point, refilling a vacated point rather than spawning anywhere) after Phase 3; targeting/leveling round-trips (including `/givexp`'s full chain through the admin wrapper into `LevelingSystem`) after Phase 4.
- **Next steps reminder:** Use this SPEC in all Claude prompts for context. Update it after each major feature or architectural decision - this version was rewritten after the ECS migration and UUID v7 documentation gap were both closed, to keep it from drifting out of sync with the implementation again.
