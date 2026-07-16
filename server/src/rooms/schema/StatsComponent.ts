// server/src/rooms/schema/StatsComponent.ts
import { Schema, type } from "@colyseus/schema";
import { StatName } from "../../data/statDefinitions";

/**
 * Core Stats System component, nested inside both Player and Npc
 * (`@type(StatsComponent) stats`). Holds:
 *  - base* fields: permanent character stats (from character creation /
 *    leveling / persistence) - NOT affected by equipment or buffs.
 *  - plain fields (strength/dexterity/...): the EFFECTIVE (final) value,
 *    i.e. base + all active modifiers applied. This is what any future
 *    combat/damage formula, and any client-side character sheet UI,
 *    should read.
 *
 * Deliberately flat typed fields rather than a MapSchema<number>: the
 * set of 5 core stats is fixed and known ahead of time, so real fields
 * give proper TS typing and cheaper Colyseus sync than a generic map.
 * Extensibility for *sources* of stat changes (weapons, armor, buffs)
 * comes from the separate, non-synced modifier system in StatsSystem -
 * not from this schema's shape. Adding a 6th core stat later is a
 * schema change here (a new base/effective field pair) plus adding it to
 * data/statDefinitions.ts's STAT_NAMES - StatsSystem itself needs no
 * changes since it already iterates STAT_NAMES generically.
 *
 * getBase/setBase/getEffective/setEffective use an explicit switch
 * rather than dynamic bracket-property access, so every stat stays
 * strongly typed (no `as any` casts scattered through StatsSystem).
 */
export class StatsComponent extends Schema {
  @type("number") baseStrength = 10;
  @type("number") baseDexterity = 10;
  @type("number") baseWillpower = 10;
  @type("number") baseCharisma = 10;
  @type("number") baseLuck = 10;

  @type("number") strength = 10;
  @type("number") dexterity = 10;
  @type("number") willpower = 10;
  @type("number") charisma = 10;
  @type("number") luck = 10;

  getBase(stat: StatName): number {
    switch (stat) {
      case "strength": return this.baseStrength;
      case "dexterity": return this.baseDexterity;
      case "willpower": return this.baseWillpower;
      case "charisma": return this.baseCharisma;
      case "luck": return this.baseLuck;
    }
  }

  setBase(stat: StatName, value: number): void {
    switch (stat) {
      case "strength": this.baseStrength = value; break;
      case "dexterity": this.baseDexterity = value; break;
      case "willpower": this.baseWillpower = value; break;
      case "charisma": this.baseCharisma = value; break;
      case "luck": this.baseLuck = value; break;
    }
  }

  getEffective(stat: StatName): number {
    switch (stat) {
      case "strength": return this.strength;
      case "dexterity": return this.dexterity;
      case "willpower": return this.willpower;
      case "charisma": return this.charisma;
      case "luck": return this.luck;
    }
  }

  setEffective(stat: StatName, value: number): void {
    switch (stat) {
      case "strength": this.strength = value; break;
      case "dexterity": this.dexterity = value; break;
      case "willpower": this.willpower = value; break;
      case "charisma": this.charisma = value; break;
      case "luck": this.luck = value; break;
    }
  }
}