# VibeRealm

Colyseus (server) + Phaser 3 (client), both TypeScript. Two independent
npm packages: `server/` and `client/`.

## Local development (hot-reload, two ports)

Use this day-to-day while building - Vite's dev server gives you instant
client reloads on save.

**1. Install dependencies:**
```bash
cd server && npm install
cd ../client && npm install
```

**2. Start the server** (from `server/`):
```bash
npm run dev
```
You should see: `VibeRealm server listening on port 2567`

**3. Start the client** (from `client/`, in a second terminal):
```bash
npm run dev
```
Vite will print a local URL, typically `http://localhost:5173`.

**4. Test multiplayer:** open `http://localhost:5173` in two different
browser tabs (or one normal + one incognito window, since the username
prompt is the only "login"). Move each with WASD or arrow keys - you
should see both characters move on both screens, chat to each other
(press Enter to open the chat box), and see the same NPCs spawn/despawn.

Player level/xp is saved to `server/data/players.json` on disconnect and
reloaded next time that username joins.

## Playing with friends over the internet (single port)

For anyone outside your own machine to connect, the server now also
serves the client's production build itself, so only **one port** needs
forwarding on your router - no separate Vite dev server involved.

**1. Build the client:**
```bash
cd client
npm run build
```
This produces `client/dist/`, which the server automatically detects and
serves.

**2. Start the server** (from `server/`, either works):
```bash
npm run dev     # ts-node-dev, fine for friends/testing
# or, closer to a real production run:
npm run build
npm start
```
You should now see the server log confirm it's listening (if
`client/dist` is missing, it'll print a warning reminding you to build
it first).

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
client code and want friends to see the update - the dev workflow above
still doesn't require this step.

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
- Single-port production mode: the Express server can serve the built
  client directly, so only one port needs exposing/forwarding.

## Suggested next follow-ups (ask for these one at a time)

1. **Client-side prediction** for the local player (instant local movement
   + reconciliation against server position) instead of interpolating it.
2. **Better collision/tilemap authoring** - load a Tiled JSON map instead of
   the hardcoded array, for both server collision and client rendering.
3. **Basic interest management** - only send nearby players'/NPCs' state
   deltas once entity counts grow, using a simple grid bucket per room.
4. **Combat MVP** - simple melee attack message + server-validated hit
   detection + XP/loot on kill, per SPEC.md roadmap Week 2.
5. **NPC AI** - patrol/aggro/chase behavior using the `behavior` placeholder
   field already on the `Npc` schema.
6. **Persistence upgrade** - swap `playerStore.ts`'s JSON file for
   Postgres, keeping the same `loadPlayer`/`savePlayer` function signatures.
7. **Configurable external port** - if you ever need the client to connect
   to a different external port than the server's internal one (common
   with some router/NAT setups), we'll want a small config change here.
