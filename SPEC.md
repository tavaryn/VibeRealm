# VibeRealm - Browser MMORPG Project Specification

**Last Updated:** 2026-07-16
**Version:** 0.9 (MVP In Progress)
**Status:** Playable MVP - movement (with client-side prediction), leveling, chat, NPCs, targeting, a login screen, disconnect handling, a server-authoritative admin command system, UUID v7 entity identity, a lightweight ECS architecture, and a Core Stats System (Strength/Dexterity/Willpower/Charisma/Luck with a modifier layer for future gear/buffs) are implemented; the overworld room is persistent across client connects/disconnects.
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
- **Core Stats:** Strength/Dexterity/Willpower/Charisma/Luck, base values + a server-only modifier layer - see Section 3e.
- **Persistence (MVP):** In-memory state (Colyseus Schema `MapSchema`) + username-based JSON file save/load (`server/data/players.json`) for level/xp/stats. Also JSON files for admin roles (`server/data/admins.json`) and bans (`server/data/bans.json`) - see Section 3d. Future: SQLite or Postgres, same load/save function signatures.
- **Development Tools:** Git, VS Code (or similar), Claude Projects for AI assistance.
- **Hosting:** Self-hosted on the developer's own machine with router port forwarding (single port, see Section 3). Render.com/Railway.app remain options for future always-on hosting.

**Alternatives Considered:** Socket.io + Express (originally planned, replaced early with Colyseus for built-in Schema-based delta sync and room/instancing support). Pure Canvas (more boilerplate). Heavy frameworks like React (unnecessary for a game loop). A full generic ECS engine/library (considered and deliberately rejected in favor of a lightweight, hand-rolled pattern sized for this project - see Section 3a). A generic `Map<string, number>` for stats (considered and rejected in favor of typed flat Schema fields - see Section 3e - since the core stat set is fixed and known).

## 3. Architecture Overview

- **Client-Server Model:** Fully server-authoritative. Clients send only input state (movement keys, chat text, target selection, and admin command text); the server simulates, validates, and syncs everything else.
  - **Movement is client-side predicted with server reconciliation** (see Section 3b). Remote players and NPCs still interpolate toward server-confirmed positions; only the local player's own movement is predicted.
  - Target selection follows the same request/validate/echo pattern: a client's click/TAB press is a *request*, and the target frame only updates once the server has validated and echoed it back via synced state - never assumed optimistically client-side.
  - **Client entry is gated by a login screen** and **the shared overworld room is persistent** across client connects/disconnects - see Section 3b.
  - **Admin commands** (server console or in-game `/`-prefixed chat) are validated, executed, and logged entirely server-side via a shared command registry - see Section 3d.
  - **Core Stats are server-authoritative and derived**: clients never compute or set effective stat values themselves - `StatsSystem` recalculates them server-side any time a modifier changes, and only the resulting base/effective numbers are synced - see Section 3e.
- **Core Components:**
  - **Colyseus Rooms**: The main overworld runs in a single, persistent `OverworldRoom`. Future dungeons/housing can use separate Room types for instancing.
  - **Colyseus Schemas**: `Player` and `Npc` both live in `OverworldState` as `MapSchema`s. Clients receive only deltas/patches for efficiency.
    - `Player` carries `id` (UUID v7 - see Section 3c), `hp`/`maxHp` (groundwork for Combat MVP), `stats` (a nested `StatsComponent` - see Section 3e), and `targetId`/`targetType` (synced).
    - `Npc` also carries `id` (UUID v7, and the actual `state.npcs` MapSchema key), `stats` (same `StatsComponent`), and `targetId`/`targetType`, deliberately **not** synced (no `@type` decorator).
  - **ECS Systems** (`server/src/ecs/systems/`): `MovementSystem`, `NpcSpawnSystem`, `NpcContactSystem`, `TargetingSystem`, `LevelingSystem`, `StatsSystem` - see Section 3a for the full architecture.
  - **Admin Command System**: A single `CommandRegistry` (server-only, not part of any Schema, and not an ECS system) that both server console input and in-game chat route into - see Section 3d.
  - **Game Logic Separation**: Networking/state handled by Colyseus; every piece of game logic (movement, collision, leveling, chat moderation, NPC spawning/contact, targeting, admin commands, stat calculation) lives in its own module - either an ECS system or, for message-driven/administrative concerns, its own dedicated file.
- **Data Flow**: Client shows a login screen on load → on submit, it connects and joins/creates `"overworld"` (rejected at `onAuth` if the username is banned) → once joined, the client sends input state (movement flags, tagged with a prediction sequence number), a chat/action message (including admin commands, prefixed with `/`), or a target request → `OverworldRoom` forwards this into the relevant ECS system (movement flags update `Player` fields consumed by `MovementSystem` on the next tick; a `set-target` message calls `TargetingSystem.setTarget()` directly; admin commands route through `CommandRegistry`, including new `/stats`/`/addmod`/`/removemod` commands that call into `StatsSystem`) → Schema state updates → Colyseus automatically broadcasts patches to relevant clients.
- **Extensibility**: Designed so adding combat, classes, skills, NPC AI, new Room types, new admin commands, new zones/maps, or new stat-modifying gear/buffs requires minimal changes to the core networking layer or to unrelated systems. The ECS pattern (Section 3a), the static data layer (Section 3c), and the Core Stats modifier system (Section 3e) mean new game content is usually a new data file entry and/or a new system/modifier call, not a rewrite of existing ones.
- **Deployment model - unified for dev AND production:** The Express server serves the client's build (`client/dist/`) on the same port Colyseus's WebSocket transport uses, so only **one process and one port** are involved end-to-end, in both development and when playing with friends. Day-to-day development is: `cd client && npm run build` once (and again after any client-side change), then `cd server && npm run dev` - connect at `http://localhost:2567` (or the LAN/public IP, same port). **Important habit:** the server does not currently watch/rebuild the client automatically - after editing anything under `client/src` or `client/index.html`, you must re-run `npm run build` in `client/` and hard-refresh the browser before the change will show up. The server terminal is also an interactive admin console once running (see Section 3d).
- **Project Structure:** Two independent npm packages, not a single monorepo - chosen so the Vite-based Phaser client and the Colyseus/Node server can each use their own tooling, TS config, and dependency versions without conflict. `node_modules/` and `dist/` (both packages) and `server/data/*.json` (runtime persistence) are gitignored. `client/dist` is not yet updated to reflect stats (no client UI for stats exists yet - see Section 10).

### 3a. ECS Architecture

**Problem it solves:** as the room's feature set grew (movement, NPCs, targeting, leveling, admin commands, stats), all of that logic lived directly on `OverworldRoom` as private methods and fields early on. Instead, VibeRealm adopts the ECS *pattern* - data/logic separation, systems that don't know about "Player" specifically wherever avoidable - sized for this codebase:

- **Entities** are just UUID v7 strings (see Section 3c) - no `Entity` class exists.
- **Synced components** remain flat fields directly on the `Player`/`Npc` Colyseus Schemas for most data. `StatsComponent` (Section 3e) is the first *nested* synced component (`@type(StatsComponent) stats`), rather than another flat field list - a small, deliberate step toward Roadmap #14's fuller component-splitting refactor, scoped narrowly to stats since it was a clean, self-contained unit.
- **Server-only (non-synced) components** - data clients never need to see - live in `World`'s generic component store (`world.componentStore<T>(name)`, a `Map<EntityId, T>` keyed by a chosen component name). Used by `NpcContactSystem` (per-session cooldown timestamps) and now `StatsSystem` (per-entity active stat modifier lists).
- **Systems** (`server/src/ecs/systems/`) are the actual game logic, each in its own file:
  - `MovementSystem` - tick-based, runs every 20Hz simulation tick. Owns wall/NPC collision.
  - `NpcSpawnSystem` - reactive-on-interval; checks every designated spawn point and spawns into any that's currently empty. **Now also registers each newly-spawned NPC's `StatsComponent` with `StatsSystem`** as part of spawning, via a constructor-injected `StatsSystem` reference.
  - `NpcContactSystem` - purely reactive; owns the per-session cooldown and the `npc-contact` broadcast.
  - `TargetingSystem` - purely reactive; validates and applies target-selection requests.
  - `LevelingSystem` - reactive/interval; owns the level-up threshold loop and the `level-up` broadcast.
  - `StatsSystem` *(new, v0.9)* - owns the Core Stats System's modifier storage and effective-value recalculation. `register()`/`unregister()` bind an entity's `StatsComponent` for modifier tracking (called from `OverworldRoom.onJoin`/`onLeave` for players, `NpcSpawnSystem.spawnAt`/`state.npcs.onRemove` for NPCs); `addModifier()`/`removeModifier()`/`removeModifiersFromSource()`/`getModifiers()` manage the active modifier list and immediately recalculate synced effective values. Implements the tick-based `System` interface solely to expire timed modifiers (buffs/debuffs with an `expiresAt`) - permanent modifiers (equipment) never touch the tick path, and an entity with no timed modifiers costs a cheap no-op scan.
- **`World`** (`server/src/ecs/World.ts`) wraps the Colyseus `OverworldState`, holds the generic server-only component store, and provides a simple `registerSystem()`/`update()` scheduler for tick-based systems (`MovementSystem`, and now `StatsSystem`). Reactive/interval systems aren't registered with this scheduler - they're constructed once and called into directly from wherever their trigger actually happens.
- **`OverworldRoom` is now a thin adapter**: Colyseus lifecycle hooks, message wiring, interval/tick scheduling, and a handful of small compatibility wrapper methods (`grantXp()`, and now `addStatModifier()`/`removeStatModifier()`/`getStatModifiers()`) kept specifically so the admin module (`server/src/admin/`) can call into ECS systems without needing to import or know that they exist at all - preserving the "admin module never imports `OverworldRoom` directly, only a structural `AdminRoomApi` interface" rule from Section 9.
- **Known accepted trade-off:** synced components beyond `StatsComponent` (`Position`/`Identity`/`Health`/`TargetRef`-equivalents) are still flat field lists on `Player`/`Npc`, not yet split into their own nested sub-schemas. `StatsComponent` is a proof-of-concept for what that eventual fuller split (Roadmap #14) will look like once Combat MVP needs damage logic to apply generically across both entity types.

### 3b. Client-Side Movement Prediction & Login/Session Lifecycle

Unchanged - see earlier SPEC revisions for full mechanics (client-side prediction with server reconciliation via `move-ack`; the HTML/CSS login screen and `room.onLeave`-driven disconnect handling; the persistent `autoDispose = false` overworld room).

### 3c. UUID v7 Entity Identity & the Static Data Layer

Unchanged - see earlier SPEC revisions for the full UUID v7 migration rationale and the `server/src/data/` static data layer (`mapData.ts`, `npcTemplates.ts`, `npcSpawnPoints.ts`, `characterTemplates.ts`, `levelingConfig.ts`, `gameplayConfig.ts`). Both `characterTemplates.ts` and `npcTemplates.ts` now additionally define Core Stats defaults - see Section 3e and Section 4.

### 3d. Admin Command System

Unchanged in mechanics - see earlier SPEC revisions (single `CommandRegistry` shared by the server console and in-game `/`-prefixed chat; bans persisted and checked in `onAuth`). **New this version:** three commands for testing/inspecting the Core Stats System:
- `/stats <identifier>` - shows base and effective values for all 5 core stats, plus every active modifier (id, stat, type, value, source, and remaining time if temporary), for a given player or NPC.
- `/addmod <identifier> <stat> <flat|percent> <value> <durationSeconds|0> [source]` - adds a stat modifier for ad-hoc testing (a duration of `0` means permanent). Useful for simulating gear/buffs before an actual equipment or combat system exists.
- `/removemod <identifier> <modifierId>` - removes a previously-added modifier by id.

These commands exist purely as a test harness (mirroring how `/givexp` predates any combat system) - they call the same `StatsSystem` methods that a future equipment/buff system will call directly, not any special admin-only code path.

### 3e. Core Stats System *(new in v0.9)*

**Problem it solves:** Combat MVP, NPC AI, and future gear/skills all need a foundational set of character attributes to build formulas against (damage, hit chance, dodge, persuasion checks, drop luck, etc.). This needed to exist *before* any of those systems, with a design that cleanly separates "what a character innately has" from "what's temporarily or permanently modifying that," so equip/unequip and buff/debuff logic never has to mutate a character's permanent base stats directly.

**The five core stats:** Strength, Dexterity, Willpower, Charisma, Luck (`server/src/data/statDefinitions.ts`'s `StatName`/`STAT_NAMES` - the single source of truth for "what stats exist," referenced by every other file in this system rather than any of them hardcoding the list independently).

**`StatsComponent`** (`server/src/rooms/schema/StatsComponent.ts`) - a nested Colyseus Schema, embedded via `@type(StatsComponent) stats` on both `Player` and `Npc`:
- **`base*` fields** (`baseStrength`, `baseDexterity`, etc.) - permanent values, set at character creation/NPC-template-spawn time and updated only by explicit character progression (not yet implemented - e.g. a future stat-point-on-levelup system), never by equipment or buffs.
- **Plain fields** (`strength`, `dexterity`, etc.) - the **effective** (final, post-modifier) value. This is what any future combat/damage formula, AI decision logic, or client-side character sheet UI should read.
- Deliberately flat typed fields rather than a `MapSchema<number>`: the 5-stat set is fixed and known, so real fields give proper TypeScript typing and cheaper Colyseus delta sync than a generic map would. `getBase`/`setBase`/`getEffective`/`setEffective` provide a `StatName`-keyed accessor API (an explicit switch internally) so calling code never needs `as any` casts or bracket-property access.

**Modifiers are server-only, never synced directly** - only the resulting `base*`/effective fields are. A `StatModifier` (`data/statDefinitions.ts`) is `{ id, stat, type: "flat" | "percent", value, source, expiresAt? }`:
- `id` is a **stable identifier chosen by the caller** - e.g. an equipment slot name like `"weapon"` or a buff name like `"haste_potion"`. Re-adding a modifier with an existing id **replaces** the previous one (handled by `StatsSystem.addModifier`), which is exactly the semantics both "re-equip a different weapon into the same slot" and "refresh a buff's duration" want, with no duplicate-stacking risk.
- `type: "flat"` adds a flat amount to base before percent modifiers apply; `type: "percent"` is a fraction (e.g. `0.1` = +10%) applied to `(base + all flat modifiers)`. This ordering (flat first, then percent) is the calculation `calculateEffectiveStat()` (`server/src/stats/statsCalculation.ts`) implements - a small pure function, the single place this math lives, so combat/damage formulas built later can reuse or extend it with confidence rather than re-deriving the same logic.
- `expiresAt` (epoch ms) is optional - omitted for permanent modifiers (equipment), set for timed buffs/debuffs. `StatsSystem`'s tick-based `update()` expires these automatically.

**`StatsSystem`** (`server/src/ecs/systems/StatsSystem.ts`) owns the server-only modifier storage (`world.componentStore<{ stats, modifiers[] }>("statModifiers")`, keyed by `EntityId` - `sessionId` for players, `npc.id` for NPCs, same distinction already established for targeting/NPC-contact) and recalculation:
- `register(entityId, stats)` - binds an entity's `StatsComponent` for modifier tracking; called once per entity right after base stats are set (player join, NPC spawn). Immediately recalculates (effective == base, no modifiers yet).
- `unregister(entityId)` - called on player disconnect / NPC removal, to avoid leaking entries (the same class of bug the UUID v7 migration surfaced and fixed for `npcContactCooldown` - see Section 3c - deliberately guarded against here from day one).
- `addModifier`/`removeModifier`/`removeModifiersFromSource`/`getModifiers` - the public API a future equipment/buff/debuff system calls directly (see Section 6 Roadmap and the developer-facing usage examples in the project's chat history for exact call patterns).
- Entity-agnostic by design: `StatsSystem` never reads `world.state.players`/`npcs` itself - callers always pass in an `EntityId` plus (on `register`) the `StatsComponent` instance, keeping the system reusable for any future entity type without modification.

**Data-driven defaults:**
- `data/characterTemplates.ts`'s `DEFAULT_CHARACTER_TEMPLATE.stats` - a flat 10 across all 5 stats for a brand-new player (no classes/archetypes yet; the natural place to branch into per-class starting spreads once character creation exists).
- `data/npcTemplates.ts`'s `NpcTemplate.stats` - per-mob-type base values (`hostile_basic` currently: strength 8, dexterity 6, willpower 4, charisma 2, luck 5), read by `npcFactory.createHostileMob()` into the new NPC's `StatsComponent`.
- `server/data/players.json` (via `playerStore.ts`) now persists all 5 base stat values per username (replacing the old placeholder `power` field), with a per-stat fallback to `DEFAULT_CHARACTER_TEMPLATE.stats` so pre-v0.9 save files missing `stats` (or missing individual stat keys) still load safely.

**Extensibility for gear/buffs (not yet implemented, but the system is ready for it):** a future `EquipmentSystem` calls `statsSystem.addModifier(sessionId, { id: "weapon", stat: "strength", type: "flat", value: 5, source: "Iron Sword" })` on equip, and `statsSystem.removeModifier(sessionId, "weapon")` on unequip. A future buff/debuff system does the same with an `expiresAt` set. No changes to `StatsComponent` or `StatsSystem` are needed for new modifier *sources* - only adding an entirely new *stat* would require a schema change (a new base/effective field pair) plus one addition to `STAT_NAMES`.

**No combat/damage formulas exist yet** - this version is deliberately scoped to the stats foundation only, per the original feature request. `calculateEffectiveStat()` and the 5 core stats are the intended building blocks for Combat MVP (Roadmap #1) once that's tackled next.

## 4. Data Models & Schemas

**StatsComponent** (Colyseus Schema, `server/src/rooms/schema/StatsComponent.ts`) - nested inside both `Player` and `Npc`:
```ts
class StatsComponent extends Schema {
  @type("number") baseStrength;   // permanent, set at creation/spawn
  @type("number") baseDexterity;
  @type("number") baseWillpower;
  @type("number") baseCharisma;
  @type("number") baseLuck;

  @type("number") strength;       // effective (post-modifier) value
  @type("number") dexterity;
  @type("number") willpower;
  @type("number") charisma;
  @type("number") luck;

  getBase(stat): number;
  setBase(stat, value): void;
  getEffective(stat): number;
  setEffective(stat, value): void;
}
```

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
  @type(StatsComponent) stats; // Core Stats System - see Section 3e

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
  @type(StatsComponent) stats;      // Core Stats System - mirrors Player.stats
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

**Stat Definitions** (`server/src/data/statDefinitions.ts` - not a Schema, plain server-side types):
```ts
type StatName = "strength" | "dexterity" | "willpower" | "charisma" | "luck";
const STAT_NAMES: readonly StatName[];  // single source of truth for "what stats exist"

interface StatModifier {
  id: string;              // stable per-source id; re-adding with the same id replaces the old one
  stat: StatName;
  type: "flat" | "percent";
  value: number;
  source: string;          // human-readable origin, e.g. "Iron Sword"
  expiresAt?: number;      // epoch ms; omitted = permanent
}
```

**World/Map:**
- 30×30 tile grid (`server/src/data/mapData.ts`), `0` = walkable, `1` = wall/obstacle. Border tiles are always walls; a handful of scattered obstacle tiles are hardcoded.
- **Important:** the tile array is duplicated between `server/src/data/mapData.ts` (authoritative, used for collision) and `client/src/map/mapData.ts` (render-only **and** used for client-side movement prediction) - unchanged accepted trade-off, see Section 8.
- Player/NPC collision uses a small AABB-style corner check against tiles (`MovementSystem.isPositionWalkable`), and a simple radius-based circle check between entities. This exact corner-check math is duplicated client-side too (`predictedMovement.ts`) for prediction purposes.

**NPC Spawn Points** (`server/src/data/npcSpawnPoints.ts`):
```ts
interface NpcSpawnPoint {
  id: string;
  x: number;
  y: number;
  templateId: string;  // not yet consumed - reserved for multiple mob templates
}
```

**Persistence:**
- `server/data/players.json`, keyed by username: `{ username, level, xp, stats: { strength, dexterity, willpower, charisma, luck } }`. Loaded on join, saved on disconnect. `hp`/`maxHp` are not currently persisted. **Changed this version:** `stats` now holds the 5 Core Stats base values (previously a single placeholder `power` field) - old save files missing `stats` (or missing individual keys) fall back per-stat to `characterTemplates.ts` defaults.
- **Room-scoped state (NPCs, etc.) is persistent for the lifetime of the server process** rather than tied to client connections - it is *not* saved to disk, so it still resets on an actual server restart. This includes each NPC's `StatsComponent` and any active modifiers, tracked in `StatsSystem`'s in-memory store.
- **`server/data/admins.json`**: a plain JSON array of admin usernames, checked case-insensitively.
- **`server/data/bans.json`**: an array of `{ username, reason, bannedBy, bannedAt }` entries.
- All three are gitignored.

## 5. MVP Features (Implemented)

**Core Stats System** *(new)*
- Strength, Dexterity, Willpower, Charisma, Luck on every Player and NPC, as a nested synced `StatsComponent` (base + effective values).
- Server-only modifier layer (`StatsSystem`) supporting flat and percent modifiers, stable-id replace-on-reapply semantics (for equip/re-equip and buff-refresh), and automatic expiry of timed modifiers.
- Data-driven defaults for new players (`characterTemplates.ts`) and each NPC template (`npcTemplates.ts`); base stats now persist to `players.json`.
- Admin test/inspection commands: `/stats`, `/addmod`, `/removemod`.
- No combat/damage formulas yet - deliberately scoped to the stats foundation only.

**ECS Architecture**
- Movement/collision, NPC spawning, NPC contact notification, targeting, leveling, and now stat-modifier tracking/recalculation each live in their own system under `server/src/ecs/systems/`, coordinated by a lightweight `World`.
- All tunable numbers and content definitions (map, NPC templates/spawn points, character defaults, leveling curve, gameplay tuning, NPC/player base stats) live in `server/src/data/`, not hardcoded inline in logic files.

**UUID v7 Entity Identity**
- Every player and NPC has a stable UUID v7 `id`, independent of Colyseus's own `client.sessionId` for players.

**Admin Command System**
- Server console + in-game `/`-prefixed chat, both routed through a single shared registry. Built-ins: `/help`, `/who`, `/quit`, `/ban`, `/unban`, `/kick`, `/kill`, `/givexp`, and (new) `/stats`, `/addmod`, `/removemod`.

**Login Screen & Session Lifecycle**
- Full-viewport login screen, graceful disconnect handling, persistent overworld room.

**Overworld Exploration**
- 30×30 tile map, colored-rectangle rendering, camera follows local player.

**Player Movement**
- WASD or arrow keys, server-authoritative at a fixed 20Hz tick (`MovementSystem`), client-side prediction + reconciliation.

**Leveling & Progression**
- Passive XP gain (+5) every ~25s, level-up threshold `level * 100`, owned by `LevelingSystem`. HUD unchanged.

**Chat System**
- Global chat, sanitized/rate-limited, `/`-prefixed messages routed to admin commands.

**NPCs (Hostile Mobs)**
- Spawn only at 8 designated fixed points scattered around the overworld, one NPC per point, checked on a coarse interval (`NpcSpawnSystem`). Population is emergent from spawn point count. Each spawned NPC is registered with `StatsSystem` immediately.
- Bumping into a hostile NPC still triggers a rate-limited (1s) toast notification (`NpcContactSystem`).
- Can still be force-removed via `/kill`; a new one will respawn at that point once the next spawn-point check runs. `/kill` also cleans up that NPC's `StatsSystem` entry.

**Targeting System**
- Click or TAB-cycle, server-validated via `TargetingSystem`, target HUD unchanged.

**Multiplayer & Persistence**
- Unchanged this version, aside from `players.json`'s `stats` shape (see Section 4).

**UI/Controls**
- Unchanged this version. No client-side UI yet displays Core Stats - see Section 10.

## 6. Future Features Roadmap (Prioritized)

1. **Combat MVP**: melee attack message, server-validated hit detection against the player's current target, XP/loot on kill. Now has a stats foundation to build formulas against (`calculateEffectiveStat()`, the 5 core stats) - a natural candidate for a new `ecs/systems/CombatSystem.ts`. May also be the point where `hp`/`maxHp`/position get split into real nested Colyseus sub-schemas (mirroring the precedent `StatsComponent` set this version), since combat needs to apply generically to both Player and Npc.
2. **NPC AI**: patrol/aggro/chase behavior, using the already-present (currently unused) `behavior` field and the unsynced `targetId`/`targetType` fields on `Npc`. Could also read `StatsComponent` (e.g. higher-Dexterity mobs patrol faster) once AI exists.
3. **Zones/multiple maps**: extend `data/npcSpawnPoints.ts` from a flat array to `Record<zoneId, NpcSpawnPoint[]>`, and move spawning from a global wall-clock interval to zone-load-triggered/per-point respawn timers.
4. **Basic interest management**: only send nearby players'/NPCs' state deltas once entity counts grow.
5. **Wire admin `command-reply`/`server-shutdown` into visible UI**: currently only visible via the browser dev console.
6. **Equipment system**: the first real consumer of `StatsSystem.addModifier`/`removeModifier` for gear - item definitions, inventory, equip/unequip slots each mapping to a stable modifier id (e.g. `"weapon"`, `"chest"`).
7. **Buffs/debuffs**: the first real consumer of `StatModifier.expiresAt` - status effects from skills, potions, or future combat abilities.
8. **Classes & Skills**: class selection, ability hotbar, different playstyles - likely branches `characterTemplates.ts`'s flat starting stats into per-class spreads.
9. **Content**: instanced dungeons (separate Colyseus room types), quests.
10. **Social & Persistence (Later)**: player housing, trading, guilds, proximity chat.
11. **Persistence upgrade**: swap `playerStore.ts`'s JSON file for Postgres. Decide whether `hp`/`maxHp` and a *stable* (not per-session-regenerated) `player.id` get persisted once real accounts exist.
12. **Polish & Scale**: real sprites/tilesets, procedural elements, proper accounts/auth, configurable external port.
13. **Reconnection / session-resume**: automatic reconnect-with-backoff and session-resume.
14. **Web admin panel**: an HTTP layer calling the same `commandRegistry.execute()` used by console and chat today.
15. **More admin commands**: `/spawn`, `/teleport`, `/setlevel`, `/mute`, `/broadcast`.
16. **Synced ECS components**: split `Position`/`Health`/`TargetRef`-equivalent fields from `Player`/`Npc` into real nested Colyseus sub-schemas, so systems (especially the eventual `CombatSystem`) can operate generically across "anything with health" rather than being written against `Player`/`Npc` by name. `StatsComponent` is the first example of this pattern.
17. **Client-side stats UI**: a character sheet panel showing base/effective stats and (eventually) equipped items/active buffs - currently only inspectable via the `/stats` admin command.

Each phase should update this SPEC with detailed mechanics once implemented.

## 7. UI/UX & Graphics
Unchanged this version - see earlier SPEC revisions. No client-rendered stats UI exists yet (Roadmap #17) - Core Stats are currently server-only/admin-inspectable via `/stats`.

## 8. Non-Functional Requirements
- **Performance:** Unchanged (60 FPS client target, 20Hz server tick). `StatsSystem`'s per-tick modifier-expiry scan is O(entities-with-modifiers), cheap at current scale and a no-op for any entity with zero active modifiers.
- **Security:** Unchanged - all critical actions validated/sanitized server-side; movement prediction is a client-feel technique only. Stat modifiers can currently only be added via admin commands (server-side, admin-gated) - no client message path exists to set/modify stats directly.
- **Known accepted vulnerability trade-off:** `@colyseus/core` 0.15.x still carries a moderate `nanoid` advisory (unchanged, pending a future 0.17 migration).
- **Known accepted architecture trade-off:** movement/collision math remains duplicated in three conceptually-linked places (`MovementSystem.ts`, `predictedMovement.ts`, and both `mapData.ts` copies) - unchanged this version.
- **`ignoreDeprecations` note:** `server/tsconfig.json` sets `"ignoreDeprecations": "5.0"` to silence a `TS5107` deprecation warning that TypeScript 5.9.3 escalates to a hard build error - unchanged, still pending a `moduleResolution: nodenext` migration whenever TypeScript is next upgraded past 6.0.
- **Reliability:** Unchanged - persistent overworld room, graceful disconnect handling, `/quit` for clean shutdown. `StatsSystem.unregister()` is called on both player disconnect and NPC removal specifically to avoid repeating the exact "leaked server-only component" bug class the UUID v7 migration surfaced in `npcContactCooldown` (Section 3c).
- **Extensibility:** Significantly improved with the ECS migration and further improved this version - adding a new modifier source (gear, buffs) requires zero changes to `StatsComponent` or `StatsSystem`; only a new *stat* would require a schema change.
- **Testing:** Manual multi-tab/browser testing, plus new `/stats`/`/addmod`/`/removemod` admin commands for exercising the modifier system (flat/percent stacking, replace-by-id, timed expiry) ahead of any real equipment/buff system existing. No automated tests yet.

## 9. Coding Standards & Conventions
- Modern TypeScript everywhere (`const`/`let`, arrow functions, async/await, classes/modules, strict mode).
- Clear, abundant comments, especially for networking, collision, and anything with a non-obvious "why."
- Descriptive variable/event names; message/event names are treated as a small informal protocol.
- Version pinning: prefer loose caret ranges (`^0.15.0`) for fast-moving dependencies, but pin tightly (e.g. `uuid@^11`) when a specific major-version boundary is known to break something.
- **ECS conventions:**
  - Every piece of gameplay logic lives in its own file under `ecs/systems/`, one responsibility each.
  - Tick-based systems implement `ecs/World.ts`'s `System` interface (`update(world, dtSeconds)`) and are registered with `World.registerSystem()`. Reactive or interval-driven systems (the majority) are plain classes constructed once in `OverworldRoom.onCreate()` and called into directly from wherever their trigger actually occurs.
  - Systems that need to broadcast to clients take a `broadcast` callback via constructor injection rather than importing Colyseus's `Room` type directly.
  - **No hardcoded data in logic files.** Every tunable number or content definition lives in `server/src/data/`, imported by whichever system(s) need it.
- **`@colyseus/core` vs `colyseus`, `autoDispose`, admin import direction:** unchanged - see earlier SPEC revisions for the "why."
- **UUID v7 / sessionId distinction:** `player.id` (UUID v7) and the Colyseus `client.sessionId` used as the `state.players` MapSchema key are deliberately different strings - any new code that needs to reach a live WebSocket client (kick/ban/kill-style operations) must use `sessionId`, never `player.id`. **The Core Stats System follows the same rule**: `StatsSystem` is keyed by `EntityId` = `sessionId` for players, `npc.id` for NPCs - never `player.id`.
- **Stat modifier convention (new, v0.9):** always give a modifier a **stable, semantically-meaningful `id`** tied to its source/slot (e.g. `"weapon"`, `"buff_haste"`), never a freshly-random one, for anything that should replace-on-reapply (re-equipping, refreshing a buff). Only use a generated/random id (as `/addmod` does) for one-off ad-hoc/test modifiers where stacking multiple instances is intentional.
- Error handling on both client and server for network/message boundaries, unchanged.
- Git commits: atomic, clear messages (e.g., `feat: add Core Stats System (StatsComponent + StatsSystem)`, `fix: rekey npcContactCooldown by sessionId not player.id`).

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
- [ ] `player.id` is regenerated fresh on every join, not yet a truly stable per-account identity.
- [ ] NPC spawning is still a single global wall-clock interval, not zone-entry-triggered.
- [ ] Synced Colyseus components beyond `StatsComponent` are not yet split into real nested sub-schemas - `Player`/`Npc` remain otherwise flat field lists (Roadmap #16).
- [ ] `server/tsconfig.json`'s `"ignoreDeprecations": "5.0"` is a stopgap pending a future TypeScript upgrade past 6.0.
- [ ] **(new, v0.9)** No client-side UI displays Core Stats yet - only inspectable via the `/stats` admin command (Roadmap #17).
- [ ] **(new, v0.9)** No stat-point-on-levelup (or any other player-facing way to raise base stats) exists yet - base stats are currently static after character creation aside from admin `/addmod` modifiers.
- [ ] **(new, v0.9)** `StatsSystem`'s in-memory modifier store is not persisted - a server restart clears all active modifiers (permanent equipment modifiers will need to be *reapplied* from persisted inventory state once an equipment system exists, not assumed to survive a restart on their own).
- [x] **(resolved, v0.8)** `server/node_modules`, `server/dist`, `client/node_modules`, `client/dist`, and `server/data/*.json` were previously committed to git by accident - a `.gitignore` now exists and untracks them.

## 11. Changelog
- **2026-07-16 (v0.9):** Added the **Core Stats System**: Strength, Dexterity, Willpower, Charisma, and Luck on every Player and NPC.
  - New `StatsComponent` (nested Colyseus Schema, `@type(StatsComponent) stats` on both `Player` and `Npc`) holds `base*` (permanent) and plain (effective/final) fields per stat, with a `StatName`-keyed accessor API (`getBase`/`setBase`/`getEffective`/`setEffective`) instead of bracket-property access.
  - New `StatsSystem` (`ecs/systems/StatsSystem.ts`) owns a server-only modifier store (keyed by `EntityId` = sessionId for players, `npc.id` for NPCs, matching the established UUID v7/sessionId convention) and recalculates effective values via a new pure `calculateEffectiveStat()` function (`server/src/stats/statsCalculation.ts`: flat modifiers sum and add to base, then percent modifiers apply to that total). Modifiers use a stable, caller-chosen `id` so re-adding one (re-equipping gear, refreshing a buff) replaces rather than stacks. Timed modifiers (`expiresAt`) auto-expire via `StatsSystem`'s tick-based `update()`.
  - `OverworldRoom` registers/unregisters each player's stats with `StatsSystem` on join/leave; `NpcSpawnSystem` (now constructor-injected with a `StatsSystem` reference) does the same for each newly-spawned NPC, with cleanup wired to `state.npcs.onRemove`.
  - New data-driven defaults: `characterTemplates.ts` (flat 10s for new players) and `npcTemplates.ts` (per-template base stats, e.g. `hostile_basic`'s str 8/dex 6/wil 4/cha 2/luck 5). `playerStore.ts`'s persisted `stats` shape changed from a placeholder single `power` field to all 5 core stats, with per-stat fallback to defaults for old save files.
  - Three new admin commands for testing/inspection ahead of any real equipment/combat system: `/stats`, `/addmod`, `/removemod`.
  - No combat/damage formulas were added this version - deliberately scoped to the stats foundation only, per the feature request. No client-side UI changes were made (stats are currently server/admin-only visibility).
- **2026-07-15 (v0.8):** UUID v7 entity identity migration (`Player.id`/`Npc.id`, `uuid@^11`) documented for the first time, plus a lightweight ECS migration done in four incrementally-tested phases (data layer + scaffolding; movement/collision → `MovementSystem`; NPC spawning/contact → `NpcSpawnSystem`/`NpcContactSystem` with a spawn-point redesign; targeting/leveling → `TargetingSystem`/`LevelingSystem`). Added `.gitignore`; pinned `ignoreDeprecations`.
- **2026-07-10 (v0.7):** Added a server-authoritative Admin Command System (`/help`, `/who`, `/quit`, `/ban`/`/unban`, `/kick`, `/kill`, `/givexp`).
- **2026-07-10 (v0.6):** Added a proper login screen, graceful disconnect handling, fixed `autoDispose`.
- **2026-07-10 (v0.5):** Added client-side movement prediction with server reconciliation.
- **2026-07-10 (v0.4):** Added Targeting System.
- **2026-07-09 (v0.3):** Added global chat system, hostile NPC system, `stats` map on `Player`. Switched to `@colyseus/core` direct import. Project renamed from "EchoRealm" to **VibeRealm**.
- **2026-07-06 (v0.1):** Initial SPEC created.

## Appendix
- **References:** Colyseus docs (rooms, Schema, nested Schema components, `autoDispose`, `onAuth`), Phaser 3 docs, Vite docs, Node `readline` docs, `uuid` package docs (v7 support, CommonJS-vs-ESM breaking change at v12), TypeScript deprecation/migration docs (`moduleResolution: node10`/`nodenext`, `ignoreDeprecations`).
- **Deployment notes:** Unchanged - single-port model for both dev and production; forward TCP port 2567 on the router for friends; set `ADMIN_USERNAMES` (or edit `server/data/admins.json`) before running if you want in-game admin commands available.
- **Testing notes:** In addition to earlier testing guidance - this version's Core Stats System should be verified via `/stats` (base/effective values and default seeding for a fresh character and each NPC type), `/addmod` (flat modifier, percent modifier stacking on top, timed expiry after the given duration), and `/removemod` (explicit removal), plus a server restart + rejoin to confirm base stats persist correctly from `players.json` (including the fallback path for a pre-v0.9 save file missing the `stats` key).
- **Next steps reminder:** Use this SPEC in all Claude prompts for context. Update it after each major feature or architectural decision. Combat MVP (Roadmap #1) is the natural next feature, now that a stats foundation exists to build damage/hit-chance formulas against.
