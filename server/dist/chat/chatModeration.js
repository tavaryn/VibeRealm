"use strict";
/**
 * Chat moderation helpers, deliberately separate from OverworldRoom so the
 * same sanitize/rate-limit logic can be reused by future room types
 * (proximity chat, dungeon instances, guild chat, etc.) without duplication.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatRateLimiter = void 0;
exports.sanitizeMessage = sanitizeMessage;
const MAX_MESSAGE_LENGTH = 200;
const MIN_MESSAGE_INTERVAL_MS = 600; // basic spam guard, not a full token bucket
/**
 * Strips HTML tags and trims/truncates a raw chat message.
 * Returns null if the message is empty after cleanup (nothing to send).
 *
 * Note: the client also renders with textContent (never innerHTML), so this
 * is defense-in-depth rather than the only line of protection.
 */
function sanitizeMessage(raw) {
    if (typeof raw !== "string")
        return null;
    const stripped = raw.replace(/<[^>]*>/g, "").trim();
    if (stripped.length === 0)
        return null;
    return stripped.slice(0, MAX_MESSAGE_LENGTH);
}
/**
 * Minimal per-session rate limiter: one message per MIN_MESSAGE_INTERVAL_MS.
 * Good enough to stop accidental key-repeat spam for the MVP; swap for a
 * proper token bucket if griefing becomes a real problem later.
 */
class ChatRateLimiter {
    constructor() {
        this.lastMessageAt = new Map();
    }
    canSend(sessionId) {
        const now = Date.now();
        const last = this.lastMessageAt.get(sessionId) ?? 0;
        if (now - last < MIN_MESSAGE_INTERVAL_MS)
            return false;
        this.lastMessageAt.set(sessionId, now);
        return true;
    }
    remove(sessionId) {
        this.lastMessageAt.delete(sessionId);
    }
}
exports.ChatRateLimiter = ChatRateLimiter;
