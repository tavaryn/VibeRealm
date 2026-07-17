import { CommandExecutionContext, CommandHandler, ValidationResult } from "../types";
import { CombatSystem } from "../../systems/CombatSystem";

/**
 * Attack takes NO client-supplied targeting info - it always acts on the
 * player's current server-confirmed target (player.targetId/targetType),
 * the same "request against already-validated state" shape
 * TargetingSystem itself uses. This closes off a class of cheating where
 * a client could send an attack for a target id it was never actually
 * granted (e.g. one clicked before losing line-of-sight/target).
 */
export type AttackPayload = Record<string, never>;

export function createAttackCommand(combatSystem: CombatSystem): CommandHandler<AttackPayload> {
  return {
    type: "attack",

    validate(ctx: CommandExecutionContext, _payload: AttackPayload): ValidationResult {
      return combatSystem.canAttack(ctx.player, ctx.sessionId);
    },

    execute(ctx: CommandExecutionContext, _payload: AttackPayload): void {
      combatSystem.attemptAttack(ctx.player, ctx.sessionId);
    },
  };
}
