import { World } from "../World";
import { Player } from "../../rooms/schema/Player";

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Everything a handler needs to validate/execute against, resolved once
 * by GameCommandRegistry.dispatch() before any handler runs. `player` is
 * guaranteed to be a real, currently-connected Player - handlers never
 * need to re-check "does this session exist."
 */
export interface CommandExecutionContext {
  world: World;
  player: Player;
  sessionId: string;
  /** Broadcasts to every connected client. */
  broadcast: (type: string, message?: any) => void;
  /** Sends to only the client that issued this command. */
  send: (type: string, message?: any) => void;
}

/**
 * A CommandEnvelope is the serializable, loggable unit GameCommandRegistry
 * dispatches and (on success) records via CommandLog. `payload` is
 * whatever the client sent for this message type - handler-specific, and
 * must stay plain-JSON-serializable (no class instances/functions) so it
 * can be logged or replayed later without special-casing.
 *
 * `actorSessionId` and `receivedAt` are stamped by the registry itself
 * from the trusted Colyseus `client.sessionId` and the server clock -
 * NEVER read from anything the client supplied - so a command's origin
 * and timing can't be spoofed by whatever's inside `payload`.
 */
export interface CommandEnvelope<TPayload = unknown> {
  type: string;
  actorSessionId: string;
  seq?: number;
  payload: TPayload;
  receivedAt: number;
}

/**
 * A single action type's rules. `validate` must have no side effects -
 * it's called on every attempt, including ones that get silently
 * rejected (e.g. an attack retried every frame while on cooldown), so it
 * needs to be cheap and pure. `execute` is only ever called after
 * `validate` returned `{ ok: true }`.
 */
export interface CommandHandler<TPayload = any> {
  readonly type: string;
  validate(ctx: CommandExecutionContext, payload: TPayload): ValidationResult;
  execute(ctx: CommandExecutionContext, payload: TPayload): void;
}
