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
 * Synced player state. Every @type() field is automatically diffed and
 * sent to clients by Colyseus - no manual broadcast code required.
 *
 * Non-@type fields (the input flags below) live on the same object for
 * convenience but are server-only and never sent to clients.
 */
class Player extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.username = "Player";
        this.x = 0;
        this.y = 0;
        this.level = 1;
        this.xp = 0;
        // Extensible stat block (e.g. power) per SPEC.md Section 4. Empty keys
        // are fine to add later - combat/classes work will read/write this
        // without needing another schema migration.
        this.stats = new schema_1.MapSchema();
        // Server-only input state, updated by the "move" message handler and
        // consumed each simulation tick in OverworldRoom.
        this.inputUp = false;
        this.inputDown = false;
        this.inputLeft = false;
        this.inputRight = false;
    }
}
exports.Player = Player;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Player.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Player.prototype, "username", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Player.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Player.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Player.prototype, "level", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Player.prototype, "xp", void 0);
__decorate([
    (0, schema_1.type)({ map: "number" }),
    __metadata("design:type", Object)
], Player.prototype, "stats", void 0);
