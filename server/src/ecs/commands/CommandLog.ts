import { CommandEnvelope } from "./types";

const MAX_ENTRIES_PER_SESSION = 50;

/**
 * Small in-memory ring buffer of recently EXECUTED (validation-passed)
 * commands, per session. Exists to satisfy "loggable, replayable" without
 * building a real event-sourcing store: useful today for debugging
 * ("what did this player just do"), and a ready foundation for a future
 * admin `/replay <sessionId>` command or basic anti-cheat auditing.
 *
 * Deliberately NOT persisted to disk - purely an in-memory debug aid,
 * cleared whenever the server restarts (same lifetime as room state).
 * Call clearFor() on disconnect (see OverworldRoom.onLeave) so entries
 * don't accumulate forever for sessions that never come back - the same
 * "server-only component keyed by a departed session" leak class this
 * project already hit once with npcContactCooldown (see SPEC.md
 * Section 3c) and doesn't want to repeat here.
 */
class CommandLog {
  private bySession = new Map<string, CommandEnvelope[]>();

  record(envelope: CommandEnvelope): void {
    const list = this.bySession.get(envelope.actorSessionId) ?? [];
    list.push(envelope);
    if (list.length > MAX_ENTRIES_PER_SESSION) {
      list.splice(0, list.length - MAX_ENTRIES_PER_SESSION);
    }
    this.bySession.set(envelope.actorSessionId, list);
  }

  /** Most-recent-last. Useful for a future debug/admin command. */
  getRecent(sessionId: string): readonly CommandEnvelope[] {
    return this.bySession.get(sessionId) ?? [];
  }

  clearFor(sessionId: string): void {
    this.bySession.delete(sessionId);
  }
}

export const commandLog = new CommandLog();
