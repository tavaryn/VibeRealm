import fs from "fs";
import path from "path";
import { DEFAULT_CHARACTER_TEMPLATE } from "../data/characterTemplates";

/**
 * Minimal username-based persistence for the MVP: level/xp/stats saved to
 * a JSON file on disconnect, loaded on join. No auth, no passwords.
 *
 * Designed to be swapped for Postgres/Redis later without touching callers:
 * loadPlayer()/savePlayer() are the only two functions the room code calls.
 *
 * NOTE: DATA_DIR below (server/data/, one level up from src/) is the
 * runtime *persistence* folder - unrelated to server/src/data/, the
 * static game-design data layer. Same word, different job.
 *
 * Combat MVP (v0.9): `stats` shape changed from `{ power }` to
 * `{ strength, dexterity, armor }` - see data/characterTemplates.ts.
 */
export interface SavedPlayerData {
  username: string;
  level: number;
  xp: number;
  stats?: { strength: number; dexterity: number; armor: number };
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
  return (
    all[username] ?? {
      username,
      level: DEFAULT_CHARACTER_TEMPLATE.level,
      xp: DEFAULT_CHARACTER_TEMPLATE.xp,
      stats: { ...DEFAULT_CHARACTER_TEMPLATE.stats },
    }
  );
}

export function savePlayer(data: SavedPlayerData): void {
  const all = readAll();
  all[data.username] = data;
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2));
}