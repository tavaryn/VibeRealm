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
 * NPC schema. `targetId`/`targetType` are intentionally NOT @type-decorated:
 * per the Targeting System requirements, NPC targets don't need client-side
 * display yet, so keeping them as plain (unsynced) server-side fields costs
 * zero sync bandwidth. They're still fully server-authoritative from day
 * one and ready for future aggro/chase AI to read/write - see SPEC.md
 * roadmap #3 - without any schema migration when that AI is built.
 */
class Npc extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.name = "";
        this.x = 0;
        this.y = 0;
        this.level = 1;
        this.hp = 50;
        this.maxHp = 50;
        this.isHostile = true;
        this.stats = new Map();
        this.behavior = "static";
        // Server-only, unsynced - see class comment above. "self" is included
        // in the union now so a future AI state machine can represent an NPC
        // idling/guarding its own spawn point without a special-case value.
        this.targetId = "";
        this.targetType = "";
    }
}
exports.Npc = Npc;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", Object)
], Npc.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", Object)
], Npc.prototype, "name", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Npc.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Npc.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Npc.prototype, "level", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Npc.prototype, "hp", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Object)
], Npc.prototype, "maxHp", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Object)
], Npc.prototype, "isHostile", void 0);
__decorate([
    (0, schema_1.type)({ map: "number" }),
    __metadata("design:type", Object)
], Npc.prototype, "stats", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", Object)
], Npc.prototype, "behavior", void 0);
