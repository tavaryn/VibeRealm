// server/src/ecs/systems/StatsSystem.ts
import { System, World } from "../World";
import { EntityId } from "../types";
import { StatsComponent } from "../../rooms/schema/StatsComponent";
import { StatModifier, STAT_NAMES } from "../../data/statDefinitions";
import { calculateEffectiveStat } from "../../stats/statsCalculation";

const MODIFIER_STORE_NAME = "statModifiers";

/** Server-only component: an entity's live modifier list + a reference
 *  to its synced StatsComponent, so this system can recalculate straight
 *  into the schema whenever a modifier is added/removed/expires. */
interface StatEntry {
  stats: StatsComponent;
  modifiers: StatModifier[];
}

/**
 * Owns the Core Stats System's modifier storage and effective-value
 * recalculation. Base values live directly on StatsComponent (set at
 * character creation / NPC spawn); this system is only concerned with
 * *modifiers* (equipment, buffs, debuffs) and keeping the synced
 * effective fields up to date.
 *
 * Entity-agnostic by design (per SPEC.md Section 3a's "systems shouldn't
 * know about Player/Npc specifically wherever avoidable") - callers pass
 * in an EntityId (sessionId for players, npc.id for NPCs - same
 * distinction already established by TargetingSystem/NpcContactSystem)
 * plus the StatsComponent instance to register. This system never reads
 * world.state.players/npcs itself.
 *
 * Tick-based (implements ecs/World.ts's System interface) purely to
 * expire timed modifiers (buffs/debuffs with `expiresAt`) - permanent
 * modifiers (equipment) never touch this path. Cheap early-exit: an
 * entity with no timed modifiers costs one array scan with no allocation
 * or recalculation.
 */
export class StatsSystem implements System {
  readonly name = "StatsSystem";

  constructor(private readonly world: World) {}

  /**
   * Registers an entity's StatsComponent so modifiers can be applied to
   * it. Call once per entity, right after its base stats are set (Player
   * on join, NPC on spawn). Immediately recalculates effective values
   * (== base, since there are no modifiers yet) so the schema is
   * consistent from the first tick.
   */
  register(entityId: EntityId, stats: StatsComponent): void {
    this.store().set(entityId, { stats, modifiers: [] });
    this.recalculate(entityId);
  }

  /** Call on player disconnect / NPC removal to avoid leaking entries. */
  unregister(entityId: EntityId): void {
    this.store().delete(entityId);
  }

  /**
   * Adds (or replaces, if the same `modifier.id` already exists - see
   * StatModifier's doc comment) a modifier and recalculates that
   * entity's effective stats immediately.
   */
  addModifier(entityId: EntityId, modifier: StatModifier): void {
    const entry = this.store().get(entityId);
    if (!entry) return;
    entry.modifiers = entry.modifiers.filter((m) => m.id !== modifier.id);
    entry.modifiers.push(modifier);
    this.recalculate(entityId);
  }

  /** Removes a modifier by id. Returns whether anything was actually removed. */
  removeModifier(entityId: EntityId, modifierId: string): boolean {
    const entry = this.store().get(entityId);
    if (!entry) return false;
    const before = entry.modifiers.length;
    entry.modifiers = entry.modifiers.filter((m) => m.id !== modifierId);
    if (entry.modifiers.length === before) return false;
    this.recalculate(entityId);
    return true;
  }

  /** Removes every modifier whose `source` matches (e.g. unequipping an
   *  item that granted more than one stat modifier at once). */
  removeModifiersFromSource(entityId: EntityId, source: string): number {
    const entry = this.store().get(entityId);
    if (!entry) return 0;
    const before = entry.modifiers.length;
    entry.modifiers = entry.modifiers.filter((m) => m.source !== source);
    const removed = before - entry.modifiers.length;
    if (removed > 0) this.recalculate(entityId);
    return removed;
  }

  /** Read-only view of an entity's currently active modifiers (for admin/debug UI). */
  getModifiers(entityId: EntityId): readonly StatModifier[] {
    return this.store().get(entityId)?.modifiers ?? [];
  }

  /** Expires timed modifiers. Registered with World's tick scheduler. */
  update(_world: World, _dtSeconds: number): void {
    const now = Date.now();
    this.store().forEach((entry, entityId) => {
      const before = entry.modifiers.length;
      entry.modifiers = entry.modifiers.filter((m) => !m.expiresAt || m.expiresAt > now);
      if (entry.modifiers.length !== before) {
        this.recalculate(entityId);
      }
    });
  }

  private recalculate(entityId: EntityId): void {
    const entry = this.store().get(entityId);
    if (!entry) return;
    for (const stat of STAT_NAMES) {
      const base = entry.stats.getBase(stat);
      entry.stats.setEffective(stat, calculateEffectiveStat(base, entry.modifiers, stat));
    }
  }

  private store() {
    return this.world.componentStore<StatEntry>(MODIFIER_STORE_NAME);
  }
}