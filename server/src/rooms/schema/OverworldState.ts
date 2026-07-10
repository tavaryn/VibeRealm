import { Schema, MapSchema, type } from "@colyseus/schema";
import { Player } from "./Player";
import { Npc } from "./Npc";

export class OverworldState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Npc }) npcs = new MapSchema<Npc>();
}
