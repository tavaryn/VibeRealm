import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * Synced player state. Every @type() field is automatically diffed and
 * sent to clients by Colyseus - no manual broadcast code required.
 *
 * Non-@type fields (the input flags below) live on the same object for
 * convenience but are server-only and never sent to clients.
 */
export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") username: string = "Player";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") level: number = 1;
  @type("number") xp: number = 0;

  // Extensible stat block (e.g. power) per SPEC.md Section 4. Empty keys
  // are fine to add later - combat/classes work will read/write this
  // without needing another schema migration.
  @type({ map: "number" }) stats = new MapSchema<number>();

  // Server-only input state, updated by the "move" message handler and
  // consumed each simulation tick in OverworldRoom.
  inputUp = false;
  inputDown = false;
  inputLeft = false;
  inputRight = false;
}
