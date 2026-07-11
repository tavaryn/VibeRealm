import fs from "fs";
import path from "path";

/**
 * Admin usernames come from two merged sources, mirroring the "simple
 * flag/role for MVP" pattern used elsewhere (see playerStore.ts):
 *  1. The ADMIN_USERNAMES env var (comma-separated) - handy for a one-off
 *     admin session without editing any files.
 *  2. server/data/admins.json (a plain JSON array of usernames) - handy
 *     for a standing list, especially since env vars don't persist across
 *     terminal sessions in Git Bash by default. Auto-created (empty) on
 *     first run if missing.
 * Usernames are compared case-insensitively.
 *
 * Known MVP trade-off: this re-reads admins.json from disk on every call
 * rather than caching, same simplicity-over-performance choice as
 * playerStore.ts - fine at this scale/call frequency (chat commands and
 * console input only).
 */
const ADMINS_FILE = path.join(__dirname, "..", "..", "data", "admins.json");

function loadFileAdmins(): string[] {
  try {
    if (!fs.existsSync(ADMINS_FILE)) {
      fs.mkdirSync(path.dirname(ADMINS_FILE), { recursive: true });
      fs.writeFileSync(ADMINS_FILE, JSON.stringify([], null, 2));
      return [];
    }
    const raw = fs.readFileSync(ADMINS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[admin] Failed to read admins.json:", err);
    return [];
  }
}

function loadEnvAdmins(): string[] {
  return (process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdmin(username: string): boolean {
  if (!username) return false;
  const lower = username.toLowerCase();
  const all = [...loadFileAdmins(), ...loadEnvAdmins()].map((u) => u.toLowerCase());
  return all.includes(lower);
}