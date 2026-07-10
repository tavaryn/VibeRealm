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

**4. Connect:** open `http://localhost:2567` in your browser.

**5. Test multiplayer:** open the same URL in two different browser tabs
(or one normal + one incognito window, since the username prompt is the
only "login"). Move each with WASD or arrow keys - you should see both
characters move on both screens, chat to each other (press Enter to open
the chat box), see the same NPCs spawn/despawn, click another player or
NPC (or press TAB to cycle targets) to see the target frame update in
the top-right with that entity's name, level, and HP bar, and clear the
target with Escape or by clicking empty map space.

Player level/xp is saved to `server/data/players.json` on disconnect and
reloaded next time that username joins.

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
You should now see the server log confirm it's listening (if
`client/dist` is missing, it'll print a warning reminding you to build it
first).

**3. Forward port `2567`** (TCP) on your router to your machine's LAN IP.
Since you're comfortable with router config, the short version: forward
external port 2567 to your PC's local IP, port 2567. If your router or
ISP ever requires a different **external** port, either update `PORT` in
`server/src/index.ts` or forward to a different external port than
2567 - just make sure your friend uses whatever the external port
actually is when connecting (the client currently assumes 2567; ask if
you need this made configurable via a query param or build-time setting).

**4. Give your friend your public IP:** `http://<your-public-ip>:2567`.
He opens that directly in Edge or Chrome - no Node.js, no zip, nothing
installed on his end.

Rebuild the client (`npm run build` in `client/`) any time you change
client code and want friends to see the update, then restart the server
process afterward so it's serving the fresh `client/dist`.

## What's implemented

- Shared 30x30 tile overworld with border walls + scattered obstacles.
- Server-authoritative movement: client sends input state only, server
  simulates position at a fixed 20Hz tick and validates collision.
- Colyseus Schema state sync (delta/patch, not full broadcasts).
- Passive XP every ~25s, level-up threshold `level * 100`, broadcast toast.
- Simple HTML HUD (username, level, XP bar) driven by schema `onChange`.
- Basic interpolation so other players move smoothly between updates.
- Global chat (sanitized, rate-limited), Enter to open/send, Escape or
  click away to return to movement.
- Hostile NPCs: spawn every ~10s (capped population), synced via Schema,
  block player movement, and trigger a rate-limited "bumped into" toast.
  Static for now - `behavior` field on `Npc` is a placeholder for AI later.
- **Targeting System:** click a player or NPC, or press TAB to cycle
  nearest-first through visible entities. Clear the target with Escape
  (ignored while chat is focused) or by clicking empty map space (grass,
  dirt, water, walls - anywhere with nothing targetable under the
  pointer). Server validates every request before committing it. Target
  HUD (top-right) shows name, level, and an HP bar, driven by the local
  player's own synced target fields - no combat effect yet, purely
  selection/display groundwork for combat.
- `Player` schema now also carries `hp`/`maxHp` - groundwork for combat,
  not yet consumed by any damage logic.
- Single-port model for both dev and production: the Express server
  serves the built client directly alongside the Colyseus WebSocket
  transport, so only one process/port is ever involved.

## Suggested next follow-ups (ask for these one at a time)

1. **Combat MVP** - simple melee attack message + server-validated hit
   detection against the player's current target (reusing the Targeting
   System's validation pattern) + XP/loot on kill, per SPEC.md roadmap.
2. **Client-side prediction** for the local player (instant local movement
   + reconciliation against server position) instead of interpolating it.
3. **NPC AI** - patrol/aggro/chase behavior using the `behavior` placeholder
   field and the unsynced `targetId`/`targetType` fields already on `Npc`.
4. **Better collision/tilemap authoring** - load a Tiled JSON map instead of
   the hardcoded array, for both server collision and client rendering.
5. **Basic interest management** - only send nearby players'/NPCs' state
   deltas once entity counts grow, using a simple grid bucket per room
   (also relevant to TAB-cycle candidate gathering, currently O(n)).
6. **Persistence upgrade** - swap `playerStore.ts`'s JSON file for
   Postgres, keeping the same `loadPlayer`/`savePlayer` function
   signatures. Also decide whether `hp`/`maxHp` get persisted once combat
   and death/respawn exist.
7. **Configurable external port** - if you ever need the client to connect
   to a different external port than the server's internal one (common
   with some router/NAT setups), we'll want a small config change here.
