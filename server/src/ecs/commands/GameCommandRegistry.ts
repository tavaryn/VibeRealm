import { World } from "../World";
import { CommandEnvelope, CommandExecutionContext, CommandHandler } from "./types";
import { commandLog } from "./CommandLog";

/**
 * Dispatches validated player-action commands (move, set-target, attack,
 * and any future skill/action) to their registered handler.
 *
 * Distinct from admin/commandRegistry.ts on purpose: that one routes
 * server-operator/chat `/`-prefixed commands (moderation - a completely
 * separate concern, with its own actor model and permission checks).
 * Keeping two registries means neither command set's assumptions leak
 * into the other.
 *
 * Centralizes actor resolution: every dispatch looks the player up from
 * `sessionId` (the one thing that's actually trustworthy, since it comes
 * from Colyseus's own connection - not anything client-supplied) before
 * a handler ever runs. A handler never has to re-derive or re-check
 * "does this session belong to a real connected player" - it just
 * receives an already-resolved `ctx.player`.
 */
export class GameCommandRegistry {
  private handlers = new Map<string, CommandHandler>();

  register(handler: CommandHandler): void {
    if (this.handlers.has(handler.type)) {
      console.warn(`[commands] Overwriting existing handler registration: "${handler.type}"`);
    }
    this.handlers.set(handler.type, handler);
  }

  /**
   * Resolves the actor, validates, and (if valid) executes + logs a
   * command. `payload` is exactly whatever the client sent for this
   * message type - untrusted input; each handler's validate() is
   * responsible for checking its shape/values, not just its business
   * rules.
   */
  dispatch(
    world: World,
    sessionId: string,
    type: string,
    payload: unknown,
    broadcast: (type: string, message?: any) => void,
    send: (type: string, message?: any) => void,
    seq?: number
  ): void {
    const handler = this.handlers.get(type);
    if (!handler) {
      console.warn(`[commands] No handler registered for command type "${type}"`);
      return;
    }

    const player = world.state.players.get(sessionId);
    if (!player) {
      // Session not present in state (e.g. a message arriving in the
      // brief window between disconnect and cleanup) - nothing to act on.
      return;
    }

    const ctx: CommandExecutionContext = { world, player, sessionId, broadcast, send };
    const result = handler.validate(ctx, payload);
    if (!result.ok) {
      // Deliberately NOT auto-replying here - most rejections (target
      // out of range, attack on cooldown, a stale move-intent from a
      // just-cleared session) are routine and expected under normal
      // play, not worth a message per attempt. A handler that DOES want
      // to tell the client why can call ctx.send(...) itself from
      // within its own validate()/execute().
      console.debug(`[commands] Rejected "${type}" from ${sessionId}: ${result.reason ?? "no reason given"}`);
      return;
    }

    handler.execute(ctx, payload);

    const envelope: CommandEnvelope = {
      type,
      actorSessionId: sessionId,
      seq,
      payload,
      receivedAt: Date.now(),
    };
    commandLog.record(envelope);
  }
}
