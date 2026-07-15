"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPlayer = loadPlayer;
exports.savePlayer = savePlayer;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const characterTemplates_1 = require("../data/characterTemplates");
const DATA_DIR = path_1.default.join(__dirname, "..", "..", "data");
const DATA_FILE = path_1.default.join(DATA_DIR, "players.json");
function ensureFile() {
    if (!fs_1.default.existsSync(DATA_DIR))
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs_1.default.existsSync(DATA_FILE))
        fs_1.default.writeFileSync(DATA_FILE, "{}");
}
function readAll() {
    ensureFile();
    try {
        return JSON.parse(fs_1.default.readFileSync(DATA_FILE, "utf-8"));
    }
    catch {
        return {};
    }
}
function loadPlayer(username) {
    const all = readAll();
    return (all[username] ?? {
        username,
        level: characterTemplates_1.DEFAULT_CHARACTER_TEMPLATE.level,
        xp: characterTemplates_1.DEFAULT_CHARACTER_TEMPLATE.xp,
        stats: { power: characterTemplates_1.DEFAULT_CHARACTER_TEMPLATE.stats.power },
    });
}
function savePlayer(data) {
    const all = readAll();
    all[data.username] = data;
    fs_1.default.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2));
}
