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
exports.OverworldState = void 0;
const schema_1 = require("@colyseus/schema");
const Player_1 = require("./Player");
const Npc_1 = require("./Npc");
class OverworldState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.players = new schema_1.MapSchema();
        this.npcs = new schema_1.MapSchema();
    }
}
exports.OverworldState = OverworldState;
__decorate([
    (0, schema_1.type)({ map: Player_1.Player }),
    __metadata("design:type", Object)
], OverworldState.prototype, "players", void 0);
__decorate([
    (0, schema_1.type)({ map: Npc_1.Npc }),
    __metadata("design:type", Object)
], OverworldState.prototype, "npcs", void 0);
