import { CommandActor, CommandDefinition, CommandContext, AdminRoomApi } from "./types";

export function describeActor(actor: CommandActor): string {
  if (actor.type === "console") return "console (server operator)";
  return `${actor.username ?? "unknown"} [${actor.sessionId ?? "?"}]`;
}

/**
 * Simple name -> handler registry. New commands are added by calling
 * `commandRegistry.register({...})` once at startup (see commands.ts) -
 * nothing else in the system needs to change to support a new command.
 * A future web admin panel would call `execute()` the same way console
 * and chat already do, just with its own actor type and reply mechanism
 * (e.g. an HTTP response instead of console.log/client.send).
 */
class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();

  register(def: CommandDefinition) {
    const key = def.name.toLowerCase();
    if (this.commands.has(key)) {
      console.warn(`[admin] Overwriting existing command registration: /${key}`);
    }
    this.commands.set(key, def);
  }

  list(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }

  /**
   * Parses a raw input line (e.g. "/ban Steve griefing") and runs the
   * matching command, if any. Every attempt - success, permission denial,
   * unknown command, or a thrown error - is logged server-side, regardless
   * of whether it came from the console or in-game chat.
   */
  async execute(
    rawInput: string,
    actor: CommandActor,
    reply: (message: string) => void,
    deps: { room: AdminRoomApi | null; requestShutdown: () => void }
  ): Promise<void> {
    const trimmed = rawInput.trim();
    const withoutSlash = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
    const [nameRaw, ...args] = withoutSlash.split(/\s+/).filter(Boolean);
    const name = (nameRaw || "").toLowerCase();

    if (!name) {
      reply("No command entered.");
      return;
    }

    const def = this.commands.get(name);
    const who = describeActor(actor);

    if (!def) {
      console.log(`[admin] ${who} attempted unknown command: /${name}`);
      reply(`Unknown command: /${name}. Try /help.`);
      return;
    }

    if (def.adminOnly && !actor.isAdmin) {
      console.log(`[admin] DENIED - ${who} attempted /${name} without admin privileges`);
      reply("You do not have permission to run that command.");
      return;
    }

    const ctx: CommandContext = { actor, args, reply, room: deps.room, requestShutdown: deps.requestShutdown };

    console.log(`[admin] ${who} ran: /${name} ${args.join(" ")}`.trim());
    try {
      await def.execute(ctx);
    } catch (err) {
      console.error(`[admin] Error running /${name}:`, err);
      reply(`Command failed: ${(err as Error).message ?? "unknown error"}`);
    }
  }
}

export const commandRegistry = new CommandRegistry();