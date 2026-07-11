import fs from "fs";
import path from "path";

export interface BanEntry {
  username: string;
  reason: string;
  bannedBy: string;
  bannedAt: number;
}

const BANS_FILE = path.join(__dirname, "..", "..", "data", "bans.json");

function loadBans(): BanEntry[] {
  try {
    if (!fs.existsSync(BANS_FILE)) return [];
    const raw = fs.readFileSync(BANS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[admin] Failed to read bans.json:", err);
    return [];
  }
}

function saveBans(bans: BanEntry[]) {
  try {
    fs.mkdirSync(path.dirname(BANS_FILE), { recursive: true });
    fs.writeFileSync(BANS_FILE, JSON.stringify(bans, null, 2));
  } catch (err) {
    console.error("[admin] Failed to write bans.json:", err);
  }
}

export function isBanned(username: string): boolean {
  const lower = username.toLowerCase();
  return loadBans().some((b) => b.username.toLowerCase() === lower);
}

export function addBan(username: string, reason: string, bannedBy: string) {
  // Replace any existing entry for the same username rather than duplicating.
  const bans = loadBans().filter((b) => b.username.toLowerCase() !== username.toLowerCase());
  bans.push({ username, reason, bannedBy, bannedAt: Date.now() });
  saveBans(bans);
}

export function removeBan(username: string): boolean {
  const bans = loadBans();
  const next = bans.filter((b) => b.username.toLowerCase() !== username.toLowerCase());
  const changed = next.length !== bans.length;
  if (changed) saveBans(next);
  return changed;
}

export function listBans(): BanEntry[] {
  return loadBans();
}