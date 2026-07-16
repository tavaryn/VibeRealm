# VibeRealm

Colyseus (server) + Phaser 3 (client), both TypeScript. Two independent
npm packages: `server/` and `client/`. Server-side game logic is
organized as a lightweight ECS (Entities/Components/Systems) - see
"Architecture" below.

## Running VibeRealm

The server serves the client's build itself on the same port it runs the
Colyseus WebSocket transport on - **one process, one port**, for both
local development and playing with friends over the internet. There's no
separate Vite dev server step.

**1. Install dependencies:**
```bash
cd server && npm install
cd ../client && npm install
```

**2. (Optional) Make yourself an admin.** See "Admin commands" below -
either set the `ADMIN_USERNAMES` env var or edit `server/data/admins.json`
before starting the server.

**3. Build the client:**
```bash
cd client
npm run build
```
This produces `client/dist/`, which the server automatically detects and
serves. **You need to re-run this any time you change anything under
`client/src` or `client/index.html`** - the server does not watch/rebuild
the client itself, it just serves whatever is already in `client/dist`.
Forgetting this step is the most common cause of "I made a change but
nothing happened" - if a fix doesn't seem to apply, rebuild the client and
hard-refresh your browser (Ctrl+Shift+R) before digging further.

**4. Start the server** (from `server/`):
```bash
npm run dev
```
You should see: `VibeRealm server listening on port 2567`, followed by
`[admin] Server console ready. Type "/help" for a list of commands.` and a
`viberealm>` prompt - the same terminal is now both your server log *and*
an interactive admin console (see below).

**5. Connect:** open `http://localhost:2567` in your browser. You'll land
on a login screen - enter any username and click **Enter World** (or press
Enter) to join.

**6. Test multiplayer:** open the same URL in two different browser tabs
(or one normal + one incognito window) and log in with a different
username in each. Move each with WASD or arrow keys - movement should feel
instant on the tab you're controlling (client-side prediction), while the
*other* tab sees that player interpolate smoothly. Chat to each other
(press Enter), see the same NPCs spawn/despawn at their fixed locations,
click another player or NPC (or press TAB to cycle targets) to see the
target frame update, and clear the target with Escape or by clicking empty
map space.

Player level/xp is saved to `server/data/players.json` on disconnect and
reloaded next time that username joins. The shared overworld itself
(currently spawned NPCs, etc.) persists in memory for as long as the
server process keeps running, independent of whether anyone is currently
connected - see "Persistent world" below.

## Architecture

Server-side game logic lives under `server/src/ecs/systems/`, one file
per responsibility - `MovementSystem` (movement + wall/NPC collision,
runs every simulation tick), `NpcSpawnSystem` (checks designated spawn
points on an interval), `NpcContactSystem` ("bumped into an NPC"
notification, cooldown-gated), `TargetingSystem` (validates click/TAB
target requests), and `LevelingSystem` (XP grants + level-up broadcasts).
`OverworldRoom` itself is a thin adapter: Colyseus lifecycle hooks,
message wiring, and a couple of small pass-through methods the admin
module calls - it doesn't contain game logic directly anymore.

Every tunable number and content definition (the tile map, NPC templates
and spawn points, default character stats, leveling curve, movement
speed/tick rate) lives in `server/src/data/` rather than being hardcoded
inside logic files - so tuning the game or adding new NPC types/spawn
points is a data change, not a code change, in the common case.

This is intentionally a **lightweight** ECS, not a generic engine - two
entity types (Player, NPC) and one room don't need a full component-query
framework. Entities are just UUID v7 strings (see below); most components
are still flat fields directly on the `Player`/`Npc` Colyseus schemas
(splitting them into real nested sub-schemas is a natural next step once
Combat MVP needs logic to apply generically across both).

**Entity identity:** every player and NPC has a UUID v7 `id`
(`server/src/utils/generateId.ts`) - time-ordered, globally unique, and a
much better foundation for a future persistent account identity than the
old schemes (a copy of the player's Colyseus session id; a sequential
counter for NPCs). One important distinction: `state.players` is still
keyed by the actual Colyseus `sessionId` (needed for kicking/banning a
live connection), not by `player.id` - the two are deliberately different
strings. `Npc.id`, by contrast, *is* the NPC's map key, since NPCs aren't
tied to a live connection the way players are.

## Admin commands

VibeRealm has a server-authoritative admin command system, usable two
ways - both run through the exact same validated/logged code path:

- **Server console:** the terminal running `npm run dev`/`npm start`
  doubles as an interactive prompt. Type a command (`/help`, `who`, etc. -
  the leading `/` is optional here) and press Enter. The console is
  always treated as admin.
- **In-game chat:** any admin can type a `/`-prefixed message in the chat
  box (same input used for normal chat - Enter to open it) to run a
  command. Non-admins attempting a privileged command get a polite denial
  instead of the command running.

**Becoming an admin:** add your username (case-insensitive) to
`server/data/admins.json` -

```json
["YourUsername"]
```

- this file is auto-created (empty) on first run if it doesn't exist yet -
or set an environment variable before starting the server:

```bash
ADMIN_USERNAMES=YourUsername,YourFriend npm run dev
```

**Built-in commands:**

| Command | Description |
|---|---|
| `/help` | Lists all available commands. |
| `/who` | Lists currently connected players. |
| `/quit` | Broadcasts a shutdown warning, then gracefully stops the server process. |
| `/ban <username> [reason]` | Bans a username (persisted) and disconnects them if online. |
| `/unban <username>` | Removes a username from the ban list. |
| `/kick <username> [reason]` | Disconnects an online player without banning them. |
| `/kill <player or npc identifier>` | Removes an NPC outright, or zeroes a player's HP and disconnects them (no death/respawn system exists yet). Accepts a username/NPC name or the raw session/NPC id. |
| `/givexp <username or sessionId> <amount>` | Grants XP to a player, applying the same level-up logic as passive XP. |

**Known limitation:** command replies and the shutdown warning are sent to
the browser but not yet shown anywhere in the game UI - check the browser
dev console (F12) to see them for now.

**Adding a new command:** open `server/src/admin/commands.ts` and add
another `commandRegistry.register({...})` block - no other files need to
change. See SPEC.md Section 3d for the full design.

**Security note:** admin status is username-based only (no password
layer) - fine for a friends-only self-hosted server, but don't rely on it
if you ever expose VibeRealm more broadly without adding real
authentication first.

## Login screen & disconnecting

- On page load (or after being disconnected), you'll see a login card
  instead of the game. Enter a username and submit - the button shows
  "Connecting..." briefly, then the game appears once the server confirms
  the join. A failed connection attempt (e.g. server not running, or a
  banned username) shows an inline error and lets you retry without
  reloading the page.
- If your connection to the server ever drops - the server process is
  stopped/restarted, you're kicked/banned by an admin, your network
  blips - you'll be returned automatically to the login screen with a
  "Disconnected from the server." message. Just log back in (same or
  different username) to rejoin; no page reload needed.
- There's no automatic reconnect-with-retry yet, and no session-resume
  (picking back up mid-session at your old position) - a dropped
  connection always means logging in again fresh. That's a known,
  intentional MVP limitation (see SPEC.md Roadmap).
- Typing works normally in both the login username field and the chat
  box, including letters that overlap with the WASD movement keys (e.g.
  "Aaadam") - keystrokes in either field are kept from reaching the
  in-game movement controls.

## Persistent world

The shared overworld room does **not** get torn down when the last player
disconnects - it (and everything in it, like spawned NPCs) stays alive for
as long as the server process is running. This means:

- If you log out and back in, previously-spawned NPCs will still be
  there, instead of the world resetting to empty.
- The world only actually resets if you stop and restart the server
  process itself (`Ctrl+C` then `npm run dev`/`npm start` again, or via
  the `/quit` admin command followed by a manual restart) - not on every
  player disconnecting.
- Your own saved progress (level/xp/stats) is unaffected either way - it's
  saved to `server/data/players.json` on disconnect and reloaded on your
  next join, regardless of what the shared room's NPC population is doing.

## NPCs

Hostile mobs spawn at a handful of fixed, hand-placed locations scattered
around the overworld (`server/src/data/npcSpawnPoints.ts`) rather than at
random tiles - each point holds at most one NPC, and a periodic check
(every ~10s) refills any point that's currently empty (e.g. after you
`/kill` one). This is a placeholder for the real per-zone spawning design
the finished game will use once multiple maps/zones exist - see SPEC.md
Section 3c for the details and what's still intentionally simplified
about it (a single global check interval rather than per-point respawn
timers, and no concept of "entering a zone" yet, since there's only one).

Mob stats and the display-name pool live in
`server/src/data/npcTemplates.ts` - adding a second mob type is a new
entry in that file plus (once needed) some template-selection logic in
`server/src/npc/npcFactory.ts`, not a rewrite of the spawning system.

## Testing movement feel under simulated lag

Since client-side prediction is designed to mask network latency, it's
worth verifying it under something other than perfect localhost
conditions:

- Chrome DevTools → **Network conditions** tab → uncheck "Use browser
  default" → pick or create a **Custom** throttling profile with added
  latency (e.g. 150-300ms). Recent Chrome versions apply this to
  WebSocket traffic too, not just HTTP.
- With that active, movement should still feel instant (no input lag) and
  should not visibly rubber-band, skip, or snap when stopping, turning, or
  walking into walls. If it does, check `MovementSystem.ts`'s collision
  logic and `GameScene.ts`'s `applyServerCorrection`/`reconcileFromAck`
  tuning constants (`CORRECTION_RATE`, dead-zone threshold,
  `SNAP_THRESHOLD`).

## Playing with friends over the internet

Dev and production share the same single-port model, so there's no extra
build step beyond what's above.

**1.** Make sure you've run `npm run build` in `client/` after your latest
changes (step 3 above).

**2. Start the server** (from `server/`, either works):
```bash
npm run dev     # ts-node-dev, fine for friends/testing
# or, closer to a real production run:
npm run build
npm start
```

**3. Forward port `2567`** (TCP) on your router to your machine's LAN IP.

**4. Give your friend your public IP:** `http://<your-public-ip>:2567`.
He opens that directly in Edge or Chrome - no Node.js, no zip, nothing
installed on his end. He'll land on the same login screen you do.

Rebuild the client (`npm run build` in `client/`) any time you change
client code and want friends to see the update, then restart the server
process afterward. (Restarting the server *will* reset the shared world -
see "Persistent world" above - so give friends a heads-up before you do,
or use `/quit` to warn everyone with a broadcast message first.)

## What's implemented

- **ECS architecture:** movement/collision, NPC spawning, NPC contact
  notification, targeting, and leveling each live in their own system
  under `server/src/ecs/systems/`, with all tunable numbers/content
  definitions in `server/src/data/` rather than hardcoded - see
  "Architecture" above.
- **UUID v7 entity identity:** every player and NPC has a stable,
  forward-compatible UUID v7 `id`, decoupled from Colyseus's own session
  id (see "Architecture" above).
- **Admin Command System:** server console + in-game (`/`-prefixed chat)
  commands routed through a single shared registry - `/help`, `/who`,
  `/quit`, `/ban`, `/unban`, `/kick`, `/kill`, `/givexp`. Admin status is
  username-based; bans are persisted and enforced before a join is ever
  accepted.
- **Login screen** (HTML/CSS overlay) shown on load and again after any
  disconnect. Username entry only for MVP.
- **Graceful disconnect handling:** a dropped connection tears down local
  game state and returns the player to the login screen with a status
  message.
- **Persistent shared world:** the overworld room (and its NPCs) stays
  alive for the lifetime of the server process, surviving every client
  disconnecting.
- Shared 30x30 tile overworld with border walls + scattered obstacles.
- Server-authoritative movement: client sends input state only, server
  simulates position at a fixed 20Hz tick and validates collision.
- **Client-side movement prediction with server reconciliation**: the
  local player's own movement is predicted instantly, then smoothly
  corrected against the server's authoritative position. Remote players
  and NPCs are unaffected and still interpolate as before.
- Colyseus Schema state sync (delta/patch, not full broadcasts).
- Passive XP every ~25s, level-up threshold `level * 100`, broadcast toast.
  Shared level-up logic also powers the `/givexp` admin command.
- Simple HTML HUD (username, level, XP bar) driven by schema `onChange`.
- Basic interpolation so other players move smoothly between updates.
- Global chat (sanitized, rate-limited), Enter to open/send, Escape or
  click away to return to movement. Messages starting with `/` are routed
  to the admin command system instead of being broadcast.
- **Hostile NPCs:** spawn at fixed designated points (not random tiles),
  one per point, refilled on a periodic check - see "NPCs" above. Synced
  via Schema, block player movement, and trigger a rate-limited "bumped
  into" toast. Static for now - `behavior` field on `Npc` is a placeholder
  for AI later. Can be force-removed via `/kill`.
- **Targeting System:** click a player or NPC, or press TAB to cycle
  nearest-first through visible entities. Clear the target with Escape or
  by clicking empty map space. Server validates every request before
  committing it. Target HUD (top-right) shows name, level, and an HP bar.
- `Player` schema also carries `hp`/`maxHp` - groundwork for combat, not
  yet consumed by any damage logic (though `/kill` can zero it directly).
- Single-port model for both dev and production.

## Suggested next follow-ups (ask for these one at a time)

1. **Combat MVP** - simple melee attack message + server-validated hit
   detection against the player's current target + XP/loot on kill. A
   natural fit for a new `ecs/systems/CombatSystem.ts`; may also be the
   point where `Player`/`Npc` split their synced fields into real nested
   component sub-schemas, per SPEC.md roadmap.
2. **Wire admin `command-reply`/`server-shutdown` into the UI** - currently
   only visible in the browser dev console.
3. **NPC AI** - patrol/aggro/chase behavior using the `behavior`
   placeholder field and the unsynced `targetId`/`targetType` fields
   already on `Npc`.
4. **Zones/multiple maps** - extend the fixed-spawn-point design from a
   single flat list to per-zone spawn point sets, and move spawning from
   a global timer to zone-entry-triggered/per-point respawn timers.
   Pairs naturally with loading real Tiled JSON maps instead of the
   hardcoded tile array.
5. **Basic interest management** - only send nearby players'/NPCs' state
   deltas once entity counts grow, using a simple grid bucket per room.
6. **Persistence upgrade** - swap `playerStore.ts`'s JSON file for
   Postgres, keeping the same `loadPlayer`/`savePlayer` function
   signatures. Also decide whether `hp`/`maxHp` and a truly *stable*
   (not per-session-regenerated) `player.id` get persisted once real
   accounts exist.
7. **Reconnection / session-resume** - automatic reconnect-with-backoff
   after a disconnect, and resuming a dropped session instead of always
   requiring a fresh manual login.
8. **Web admin panel** - an authenticated HTTP layer calling the same
   `commandRegistry.execute()` already used by console and chat.
9. **More admin commands** - `/spawn`, `/teleport`, `/setlevel`, `/mute`,
   `/broadcast`, following the same single-registration pattern.
10. **Configurable external port** - if you ever need the client to connect
    to a different external port than the server's internal one.
