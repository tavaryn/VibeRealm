import { CommandExecutionContext, CommandHandler, ValidationResult } from "../types";
import { TargetingSystem, TargetType } from "../../systems/TargetingSystem";

export interface SetTargetPayload {
  targetId?: string | null;
  targetType?: TargetType | null;
}

/**
 * Wraps the existing "set-target" message as a Command. TargetingSystem
 * still owns the actual validate-against-state-and-apply logic (does the
 * target id exist, etc.) - this handler's validate() only checks the
 * payload's shape is well-formed before handing off to it, same
 * request/validate/echo pattern documented in SPEC.md Section 3.
 *
 * Factory function (not a plain object like moveIntentCommand) because
 * this handler needs a TargetingSystem instance injected - constructed
 * once in OverworldRoom.onCreate() alongside the other systems.
 */
export function createSetTargetCommand(targetingSystem: TargetingSystem): CommandHandler<SetTargetPayload> {
  return {
    type: "set-target",

    validate(_ctx: CommandExecutionContext, payload: SetTargetPayload): ValidationResult {
      const targetId = payload?.targetId ?? null;
      const targetType = payload?.targetType ?? null;

      // Clearing the target (both null) is always a well-formed request.
      if (targetId === null && targetType === null) return { ok: true };

      if (typeof targetId !== "string" || (targetType !== "player" && targetType !== "npc")) {
        return { ok: false, reason: "Malformed set-target payload." };
      }
      return { ok: true };
    },

    execute(ctx: CommandExecutionContext, payload: SetTargetPayload): void {
      targetingSystem.setTarget(ctx.player, payload?.targetId ?? null, payload?.targetType ?? null);
    },
  };
}
