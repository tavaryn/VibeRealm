"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBanned = isBanned;
exports.addBan = addBan;
exports.removeBan = removeBan;
exports.listBans = listBans;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const BANS_FILE = path_1.default.join(__dirname, "..", "..", "data", "bans.json");
function loadBans() {
    try {
        if (!fs_1.default.existsSync(BANS_FILE))
            return [];
        const raw = fs_1.default.readFileSync(BANS_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (err) {
        console.error("[admin] Failed to read bans.json:", err);
        return [];
    }
}
function saveBans(bans) {
    try {
        fs_1.default.mkdirSync(path_1.default.dirname(BANS_FILE), { recursive: true });
        fs_1.default.writeFileSync(BANS_FILE, JSON.stringify(bans, null, 2));
    }
    catch (err) {
        console.error("[admin] Failed to write bans.json:", err);
    }
}
function isBanned(username) {
    const lower = username.toLowerCase();
    return loadBans().some((b) => b.username.toLowerCase() === lower);
}
function addBan(username, reason, bannedBy) {
    // Replace any existing entry for the same username rather than duplicating.
    const bans = loadBans().filter((b) => b.username.toLowerCase() !== username.toLowerCase());
    bans.push({ username, reason, bannedBy, bannedAt: Date.now() });
    saveBans(bans);
}
function removeBan(username) {
    const bans = loadBans();
    const next = bans.filter((b) => b.username.toLowerCase() !== username.toLowerCase());
    const changed = next.length !== bans.length;
    if (changed)
        saveBans(next);
    return changed;
}
function listBans() {
    return loadBans();
}
