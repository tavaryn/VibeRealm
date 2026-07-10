# VibeRealm

Colyseus (server) + Phaser 3 (client), both TypeScript. Two independent
npm packages: `server/` and `client/`.

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

**2. Build the client:**
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

**3. Start the server** (from `server/`):
```bash
npm run dev
```
You should see: `VibeRealm server listening on port 2567`

**4. Connect:** open `http://localhost:2567` in your browser. You'll land
on a login screen - enter any username and click **Enter World** (or press
Enter) to join.

**5. Test multiplayer:** open the same URL in two different browser tabs
(or one normal + one incognito window) and log in with a different
username in each. Move each with WASD or arrow keys - movement should feel
instant on the tab you're controlling (client-side prediction), while the
*other* tab sees that player interpolate smoothly. Chat to each other
(press Enter), see the same NPCs spawn/despawn, click another player or
NPC (or press TAB to cycle targets) to see the target frame update, and
clear the target with Escape or by clicking empty map space.

Player level/xp is saved to `server/data/players.json` on disconnect and
reloaded next time that username joins. The shared overworld itself
(currently spawned NPCs, etc.) persists in memory for as long as the
server process keeps running, independent of whether anyone is currently
connected - see "Persistent world" below.

## Login screen & disconnecting

- On page load (or after being disconnected), you'll see a login card
  instead of the game. Enter a username and submit - the button shows
  "Connecting..." briefly, then the game appears once the server confirms
  the join. A failed connection attempt (e.g. server not running) shows an
  inline error and lets you retry without reloading the page.
- If your connection to the server ever drops - the server process is
  stopped/restarted, your network blips, or you're kicked - you'll be
  returned automatically to the login screen with a
  "Disconnected from the server." message. Just log back in (same or
  different username) to rejoin; no page reload needed.
- There's no automatic reconnect-with-retry yet, and no session-resume
  (picking back up mid-session at your old position) - a dropped
  connection always means logging in again fresh. That's a known,
  intentional MVP limitation (see SPEC.md Roadmap #10).
- Typing works normally in both the login username field and the chat
  box, including letters that overlap with the WASD movement keys (e.g.
  "Aaadam") - keystrokes in either field are kept from reaching the
  in-game movement controls.

## Persistent world

The shared overworld room does **not** get torn down when the last player
disconnects - it (and everything in it, like spawned NPCs) stays alive for
as long as the server process is running. This means:

- If you log out and back in, previously-spawned NPCs will still be there
  (possibly joined by a few more that spawned while you were away),
  instead of the world resetting to empty.
- The world only actually resets if you stop and restart the server
  process itself (`Ctrl+C` then `npm run dev`/`npm start` again) - not on
  every player disconnecting.
- Your own saved progress (level/xp/stats) is unaffected either way - it's
  saved to `server/data/players.json` on disconnect and reloaded on your
  next join, regardless of what the shared room's NPC population is doing.

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
  walking into walls. If it does, check `GameScene.ts`'s
  `applyServerCorrection`/`reconcileFromAck` tuning constants
  (`CORRECTION_RATE`, dead-zone threshold, `SNAP_THRESHOLD`).

## Playing with friends over the internet

Dev and production now share the same single-port model, so there's no
extra build step beyond what's above.

**1.** Make sure you've run `npm run build` in `client/` after your latest
changes (step 2 above).

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
see "Persistent world" above - so give friends a heads-up before you do.)

## What's implemented

- **Login screen** (HTML/CSS overlay) shown on load and again after any
  disconnect, replacing the old `window.prompt()`. Username entry only for
  MVP - a password field slot exists in the markup, hidden and unused, for
  future auth.
- **Graceful disconnect handling:** a dropped connection tears down local
  game state and returns the player to the login screen with a status
  message, instead of leaving a frozen/broken scene.
- **Persistent shared world:** the overworld room (and its NPCs) now stays
  alive for the lifetime of the server process, surviving every client
  disconnecting - it no longer silently resets to empty between sessions.
- Shared 30x30 tile overworld with border walls + scattered obstacles.
- Server-authoritative movement: client sends input state only, server
  simulates position at a fixed 20Hz tick and validates collision.
- **Client-side movement prediction with server reconciliation**: the
  local player's own movement is predicted instantly (no waiting on a
  server round-trip), then smoothly corrected against the server's
  authoritative position - see SPEC.md Section 3a for the full mechanics.
  Remote players and NPCs are unaffected and still interpolate as before.
  Server remains fully authoritative; prediction is a client-feel
  technique only, not a trust change.
- Colyseus Schema state sync (delta/patch, not full broadcasts).
- Passive XP every ~25s, level-up threshold `level * 100`, broadcast toast.
- Simple HTML HUD (username, level, XP bar) driven by schema `onChange`.
- Basic interpolation so other players move smoothly between updates.
- Global chat (sanitized, rate-limited), Enter to open/send, Escape or
  click away to return to movement.
- Hostile NPCs: spawn every ~10s (capped population), synced via Schema,
  block player movement, and trigger a rate-limited "bumped into" toast.
  Static for now - `behavior` field on `Npc` is a placeholder for AI later.
  Not predicted client-side (accepted trade-off, see SPEC.md Section 3a).
- **Targeting System:** click a player or NPC, or press TAB to cycle
  nearest-first through visible entities. Clear the target with Escape or
  by clicking empty map space. Server validates every request before
  committing it. Target HUD (top-right) shows name, level, and an HP bar.
- `Player` schema now also carries `hp`/`maxHp` - groundwork for combat,
  not yet consumed by any damage logic.
- Single-port model for both dev and production.

## Suggested next follow-ups (ask for these one at a time)

1. **Combat MVP** - simple melee attack message + server-validated hit
   detection against the player's current target (reusing the Targeting
   System's validation pattern) + XP/loot on kill, per SPEC.md roadmap.
2. **NPC AI** - patrol/aggro/chase behavior using the `behavior` placeholder
   field and the unsynced `targetId`/`targetType` fields already on `Npc`.
   Will also mean deciding whether to extend client-side prediction to
   cover NPC collision once NPCs actually move.
3. **Better collision/tilemap authoring** - load a Tiled JSON map instead of
   the hardcoded array, for both server collision and client rendering
   (and client-side prediction too).
4. **Basic interest management** - only send nearby players'/NPCs' state
   deltas once entity counts grow, using a simple grid bucket per room.
5. **Persistence upgrade** - swap `playerStore.ts`'s JSON file for
   Postgres, keeping the same `loadPlayer`/`savePlayer` function
   signatures. Also decide whether `hp`/`maxHp` get persisted once combat
   and death/respawn exist.
6. **Reconnection / session-resume** - automatic reconnect-with-backoff
   after a disconnect, and resuming a dropped session (same identity,
   position, etc.) instead of always requiring a fresh manual login.
7. **Configurable external port** - if you ever need the client to connect
   to a different external port than the server's internal one.
