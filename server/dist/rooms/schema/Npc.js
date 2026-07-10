"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Npc = void 0;
const schema_1 = require("@colyseus/schema");
/**
 * Generic NPC/mob state, synced the same way Player is - Colyseus diffs
 * this automatically so clients only receive changes, not full snapshots.
 *
 * `behavior` is a placeholder for future AI (e.g. "patrol", "aggro",
 * "flee"). NPCs are static for the MVP - the field exists now so adding
 * real AI later doesn't require another schema change.
 */
class Npc extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.name = "Mob";
        this.level = 1;
        this.hp = 10;
        this.maxHp = 10;
        this.isHostile = false;
        this.x = 0;
        this.y = 0;
        // Extensible stat block, same pattern as Player.stats.
        this.stats = new schema_1.MapSchema();
        // Future AI hook - unused for now beyond being informational.
        this.behavior = "static";
    }
}
exports.Npc = Npc;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Npc.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Npc.prototype, "name", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Npc.prototype, "level", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Npc.prototype, "hp", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Npc.prototype, "maxHp", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], Npc.prototype, "isHostile", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Npc.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Npc.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)({ map: "number" }),
    __metadata("design:type", Object)
], Npc.prototype, "stats", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Npc.prototype, "behavior", void 0);
