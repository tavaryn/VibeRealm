import type { Client } from "@colyseus/core";
import type { OverworldState } from "../rooms/schema/OverworldState";

export interface AdminRoomApi {
  state: OverworldState;
  clients: Client[];
  broadcast: (type: string, message?: any) => void;
  grantXp: (player: any, amount: number, sessionId: string) => void;
}

export type CommandActorType = "console" | "chat";

export interface CommandActor {
  type: CommandActorType;
  username?: string;
  sessionId?: string;
  isAdmin: boolean;
}

export interface CommandContext {
  actor: CommandActor;
  args: string[];
  reply: (message: string) => void;
  room: AdminRoomApi | null;
  requestShutdown: () => void;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  adminOnly: boolean;
  execute: (ctx: CommandContext) => void | Promise<void>;
}