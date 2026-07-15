"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.xpForNextLevel = xpForNextLevel;
const levelingConfig_1 = require("../data/levelingConfig");
/**
 * Shared by OverworldRoom's passive-XP tick AND the /givexp admin command
 * (server/src/admin/commands.ts), so both compute the level-up threshold
 * identically. Pulled out specifically so the admin module doesn't need to
 * import OverworldRoom itself (see the note in admin/types.ts). The
 * formula's actual multiplier now lives in data/levelingConfig.ts rather
 * than here, so this file stays pure logic with zero hardcoded numbers.
 */
function xpForNextLevel(level) {
    return level * levelingConfig_1.LEVELING_CONFIG.xpPerLevelMultiplier;
}
