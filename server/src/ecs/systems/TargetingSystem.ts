import { World } from "../World";
import { Player } from "../../rooms/schema/Player";

export type TargetType = "player" | "npc";

/**
 * Validates and applies target-selection requests (click or TAB-cycle on
 * the client). Migrated from OverworldRoom's private setPlayerTarget()
 * method (ECS migration Phase 4) - logic unchanged, only relocated.
 *
 * Deliberately NOT a tick-based System - purely reactive, called directly
 * from OverworldRoom's existing "set-target" message handler, same
 * request/validate/echo pattern documented in SPEC.md Section 3.
 */
export class TargetingSystem {
  constructor(private readonly world: World) {}

  /**
   * Attempts to set (or clear, if targetId/targetType are null) a
   * player's target. Returns whether the request was accepted - the
   * caller doesn't currently do anything with a `false` return beyond
   * not applying it, since there's no reply message for a rejected
   * target request today (unchanged from before this phase).
   */
  setTarget(player: Player, targetId: string | null, targetType: TargetType | null): boolean {
    if (!targetId || !targetType) {
      player.targetId = "";
      player.targetType = "";
      return true;
    }

    if (targetType === "player") {
      if (!this.world.state.players.has(targetId)) return false;
    } else if (targetType === "npc") {
      if (!this.world.state.npcs.has(targetId)) return false;
    } else {
      return false;
    }

    player.targetId = targetId;
    player.targetType = targetType;
    return true;
  }
}