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
exports.Player = void 0;
const schema_1 = require("@colyseus/schema");
/**
 * Player schema - core per-player synced state.
 *
 * `hp`/`maxHp` are groundwork for the Combat MVP (SPEC.md roadmap #2) -
 * not consumed by any combat logic yet, but the Targeting System's HUD
 * needs them to render a target's HP bar, and `Npc` already has them, so
 * adding them here now keeps the two schemas symmetric.
 *
 * `targetId`/`targetType` are new for the Targeting System. They ARE
 * synced (rather than kept server-only) so any client could eventually
 * show "who is targeting whom" (e.g. a marker above a player being
 * targeted by someone else). Today only the local player's own target is
 * consumed client-side, to drive the target HUD frame.
 */
class Player extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.username = "";
        this.x = 0;
        this.y = 0;
        this.level = 1;
        this.xp = 0;
        this.hp = 100;
        this.maxHp = 100;
        this.stats = new Map();
        // "" = no target. Empty string instead of null/undefined since Schema
        // string fields don't support null, and it keeps client checks simple
        // (`if (player.targetId) { ... }`).
        this.targetId = "";
        // "player" | "npc" | "" (no target). Plain string rather than an enum
        // type for Schema-encoding simplicity; validated server-side in
        // OverworldRoom before ever being set.
        this.targetType = "";
        // Server-only movement input flags, never synced to clients.
        this.inputUp = false;
        this.inputDown = false;
        this.inputLeft = false;
        this.inputRight = false;
    }
}
exports.Player = Player;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", Object)
], Player.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", Object)
], Player.prototype, "username", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Player.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Player.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Player.prototype, "level", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Player.prototype, "xp", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Player.prototype, "hp", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Player.prototype, "maxHp", void 0);
__decorate([
    (0, schema_1.type)({ map: "number" }),
    __metadata("design:type", Object)
], Player.prototype, "stats", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", Object)
], Player.prototype, "targetId", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", Object)
], Player.prototype, "targetType", void 0);
