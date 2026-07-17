import { CommandExecutionContext, CommandHandler, ValidationResult } from "../types";

export interface MoveIntentPayload {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  seq?: number;
}

/**
 * Wraps the existing "move" message (a continuous input-STATE change,
 * not a discrete one-shot action) as a Command. Movement itself is still
 * simulated every tick by MovementSystem from the flags this handler
 * sets - this only validates the input shape and applies it, replacing
 * what used to be OverworldRoom's inline onMessage("move", ...) body.
 * The `seq` echo (move-ack) is unchanged - see GameScene.reconcileFromAck
 * on the client for what consumes it.
 */
export const moveIntentCommand: CommandHandler<MoveIntentPayload> = {
  type: "move-intent",

  validate(_ctx: CommandExecutionContext, payload: MoveIntentPayload): ValidationResult {
    if (
      typeof payload?.up !== "boolean" ||
      typeof payload?.down !== "boolean" ||
      typeof payload?.left !== "boolean" ||
      typeof payload?.right !== "boolean"
    ) {
      return { ok: false, reason: "Malformed move-intent payload." };
    }
    return { ok: true };
  },

  execute(ctx: CommandExecutionContext, payload: MoveIntentPayload): void {
    ctx.player.inputUp = payload.up;
    ctx.player.inputDown = payload.down;
    ctx.player.inputLeft = payload.left;
    ctx.player.inputRight = payload.right;

    if (typeof payload.seq === "number") {
      ctx.send("move-ack", { seq: payload.seq, x: ctx.player.x, y: ctx.player.y });
    }
  },
};
