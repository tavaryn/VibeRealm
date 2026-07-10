import fs from "fs";
import path from "path";

/**
 * Minimal username-based persistence for the MVP: level/xp saved to a JSON
 * file on disconnect, loaded on join. No auth, no passwords.
 *
 * Designed to be swapped for Postgres/Redis later without touching callers:
 * loadPlayer()/savePlayer() are the only two functions the room code calls.
 */
export interface SavedPlayerData {
  username: string;
  level: number;
  xp: number;
  stats?: { power: number };
}

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "players.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "{}");
}

function readAll(): Record<string, SavedPlayerData> {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function loadPlayer(username: string): SavedPlayerData {
  const all = readAll();
  return all[username] ?? { username, level: 1, xp: 0, stats: { power: 10 } };
}

export function savePlayer(data: SavedPlayerData): void {
  const all = readAll();
  all[data.username] = data;
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2));
}
