"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NPC_TEMPLATES = void 0;
exports.NPC_TEMPLATES = [
    {
        id: "hostile_basic",
        names: ["Slime", "Goblin", "Wild Boar", "Feral Wolf"],
        level: 1,
        hp: 20,
        maxHp: 20,
        isHostile: true,
        stats: { power: 5 },
        behavior: "static",
    },
];
