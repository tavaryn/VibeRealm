import { World } from "../World";
import { Player } from "../../rooms/schema/Player";
import { Npc } from "../../rooms/schema/Npc";
import { GAMEPLAY_CONFIG } from "../../data/gameplayConfig";

/** Server-only component: last time this session triggered a contact broadcast. */
interface ContactCooldownEntry {
  lastContactAt: number;
}

const COOLDOWN_STORE_NAME = "npcContactCooldown";

/**
 * Owns the "bumped into an NPC" notification - cooldown-gated so walking
 * into (and staying pressed against) a mob doesn't spam a toast every
 * simulation tick. Migrated from OverworldRoom's private
 * npcContactCooldown Map + handleNpcContact() method (ECS migration Phase
 * 3) - logic unchanged, only relocated. The cooldown map itself lives in
 * World's generic server-only component store (see ecs/World.ts,
 * introduced in Phase 1) instead of as a private field directly on
 * OverworldRoom.
 *
 * Reactive, not tick-based: MovementSystem calls handleContact() directly
 * whenever it detects a blocked move, via the same callback-injection
 * pattern used since Phase 2 - see MovementSystem.ts's constructor and
 * OverworldRoom.onCreate()'s wiring.
 *
 * Keyed by Colyseus client.sessionId (NOT player.id) - must match the key
 * OverworldRoom.onLeave() clears via clearFor(), or entries leak forever
 * after a player disconnects. Same UUID v7 / sessionId distinction
 * documented on Player.ts and admin/entityLookup.ts.
 */
export class NpcContactSystem {
  constructor(
    private readonly world: World,
    private readonly broadcast: (type: string, message?: any) => void
  ) {}

  handleContact(player: Player, npc: Npc, sessionId: string): void {
    const cooldown = this.world.componentStore<ContactCooldownEntry>(COOLDOWN_STORE_NAME);
    const now = Date.now();
    const last = cooldown.get(sessionId)?.lastContactAt ?? 0;
    if (now - last < GAMEPLAY_CONFIG.npcContactCooldownMs) return;
    cooldown.set(sessionId, { lastContactAt: now });

    this.broadcast("npc-contact", {
      sessionId,
      npcId: npc.id,
      npcName: npc.name,
      isHostile: npc.isHostile,
    });
  }

  /** Called from OverworldRoom.onLeave() so a disconnected player's cooldown entry doesn't linger forever. */
  clearFor(sessionId: string): void {
    this.world.componentStore<ContactCooldownEntry>(COOLDOWN_STORE_NAME).delete(sessionId);
  }
}