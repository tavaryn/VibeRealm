/**
 * Chat moderation helpers, deliberately separate from OverworldRoom so the
 * same sanitize/rate-limit logic can be reused by future room types
 * (proximity chat, dungeon instances, guild chat, etc.) without duplication.
 */

const MAX_MESSAGE_LENGTH = 200;
const MIN_MESSAGE_INTERVAL_MS = 600; // basic spam guard, not a full token bucket

/**
 * Strips HTML tags and trims/truncates a raw chat message.
 * Returns null if the message is empty after cleanup (nothing to send).
 *
 * Note: the client also renders with textContent (never innerHTML), so this
 * is defense-in-depth rather than the only line of protection.
 */
export function sanitizeMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const stripped = raw.replace(/<[^>]*>/g, "").trim();
  if (stripped.length === 0) return null;
  return stripped.slice(0, MAX_MESSAGE_LENGTH);
}

/**
 * Minimal per-session rate limiter: one message per MIN_MESSAGE_INTERVAL_MS.
 * Good enough to stop accidental key-repeat spam for the MVP; swap for a
 * proper token bucket if griefing becomes a real problem later.
 */
export class ChatRateLimiter {
  private lastMessageAt = new Map<string, number>();

  canSend(sessionId: string): boolean {
    const now = Date.now();
    const last = this.lastMessageAt.get(sessionId) ?? 0;
    if (now - last < MIN_MESSAGE_INTERVAL_MS) return false;
    this.lastMessageAt.set(sessionId, now);
    return true;
  }

  remove(sessionId: string): void {
    this.lastMessageAt.delete(sessionId);
  }
}
