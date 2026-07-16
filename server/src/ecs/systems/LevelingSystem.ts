import { World } from "../World";
import { Player } from "../../rooms/schema/Player";
import { xpForNextLevel } from "../../util/leveling";
import { LEVELING_CONFIG } from "../../data/levelingConfig";

/**
 * Owns XP granting + level-up logic. Migrated from OverworldRoom's
 * grantXp()/grantPassiveXp() methods (ECS migration Phase 4) - logic
 * unchanged, only relocated. Takes a broadcast callback (same
 * dependency-injection pattern as NpcContactSystem) so this system never
 * needs to import or know about Colyseus's Room type directly.
 *
 * Deliberately NOT a tick-based System (no update(world, dtSeconds)) -
 * passive XP is a coarse ~25s interval action, driven by OverworldRoom's
 * existing clock.setInterval(...), unchanged from before this phase.
 * grantXp() itself is also called directly by the /givexp admin command,
 * via OverworldRoom.grantXp() - a thin public wrapper kept specifically
 * so admin/types.ts's AdminRoomApi interface doesn't need to know this
 * system exists (see that file's "no import cycle" comment).
 */
export class LevelingSystem {
  constructor(
    private readonly world: World,
    private readonly broadcast: (type: string, message?: any) => void
  ) {}

  /** Grants XP to a single player and applies any level-ups crossed. */
  grantXp(player: Player, amount: number, sessionId: string): void {
    player.xp += amount;
    // while, not if - so one large admin grant can cross multiple level
    // thresholds in a single call, same as enough passive ticks eventually would.
    while (player.xp >= xpForNextLevel(player.level)) {
      player.xp -= xpForNextLevel(player.level);
      player.level += 1;
      this.broadcast("level-up", {
        sessionId,
        username: player.username,
        level: player.level,
      });
    }
  }

  /** Grants the passive per-tick XP amount to every connected player. */
  grantPassiveTick(): void {
    this.world.state.players.forEach((player, sessionId) =>
      this.grantXp(player, LEVELING_CONFIG.passiveXpAmount, sessionId)
    );
  }
}