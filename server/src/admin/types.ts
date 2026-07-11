import type { Client } from "@colyseus/core";
import type { OverworldState } from "../rooms/schema/OverworldState";

/**
 * Minimal structural interface the admin/command system needs from a room.
 * Deliberately NOT importing OverworldRoom itself, so this file (and
 * everything that depends on it - commands.ts, consoleInput.ts) has no
 * import cycle back to the room implementation. OverworldRoom satisfies
 * this interface automatically since Colyseus's base Room class already
 * provides `state`, `clients`, and `broadcast` - the only room-specific
 * addition is `grantXp`, added directly on OverworldRoom below.
 */
export interface AdminRoomApi {
  state: OverworldState;
  clients: Client[];
  broadcast: (type: string, message?: any) => void;
  grantXp: (player: any, amount: number) => void;
}

export type CommandActorType = "console" | "chat";

export interface CommandActor {
  type: CommandActorType;
  /** Set for chat-originated commands only. */
  username?: string;
  sessionId?: string;
  isAdmin: boolean;
}

export interface CommandContext {
  actor: CommandActor;
  /** Command args, already split on whitespace - NOT including the command name. */
  args: string[];
  /** Sends a response back to whoever issued the command. */
  reply: (message: string) => void;
  /** The currently-active OverworldRoom, or null if none exists yet. */
  room: AdminRoomApi | null;
  /** Requests a full server shutdown - see adminRuntime.ts / index.ts. */
  requestShutdown: () => void;
}

export interface CommandDefinition {
  name: string; // without leading slash, lowercase
  description: string;
  usage: string; // e.g. "/ban <username> [reason]"
  adminOnly: boolean;
  execute: (ctx: CommandContext) => void | Promise<void>;
}