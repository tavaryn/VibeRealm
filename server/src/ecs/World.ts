import { OverworldState } from "../rooms/schema/OverworldState";
import { EntityId, ServerOnlyComponent } from "./types";

/**
 * A system is stateless game logic that reads/writes one or more
 * component stores each tick (or in response to a message). Systems hold
 * no entity data themselves - all state lives in `World` - so they stay
 * easy to test, reorder, or replace independently.
 */
export interface System {
  /** Short, unique name - used in logs if a system throws mid-tick. */
  readonly name: string;
  /** Called once per simulation tick with elapsed seconds. */
  update(world: World, dtSeconds: number): void;
}

/**
 * The ECS "world" for a single OverworldRoom. Wraps the existing
 * Colyseus `OverworldState` (still the source of truth for every synced
 * component - Position/Identity/Health/TargetRef are, for now, still flat
 * fields on Player/Npc, to be split into real component sub-schemas in a
 * later phase) and adds a home for server-only component stores (data
 * clients never need to see) plus a simple system registry/scheduler.
 *
 * PHASE 1 STATUS: scaffolding only. OverworldRoom.ts does not construct
 * or call into this yet - it still owns its update loop and component-ish
 * state (npcContactCooldown, player.inputUp/Down/Left/Right) directly,
 * unchanged from before this phase. A later phase will migrate movement
 * first, at which point OverworldRoom becomes a thin adapter that
 * constructs a World, registers systems, and forwards Colyseus
 * messages/ticks into it.
 */
export class World {
  readonly state: OverworldState;

  private systems: System[] = [];

  // Generic home for server-only (non-synced) component stores, keyed by
  // a component name chosen by whichever system owns it (e.g.
  // "movementInput", "npcContactCooldown"). A Map-of-Maps here (rather
  // than one field per component type) means World never needs to change
  // just because a new server-only component gets added later.
  private serverOnlyComponents = new Map<string, Map<EntityId, ServerOnlyComponent>>();

  constructor(state: OverworldState) {
    this.state = state;
  }

  /** Registers a system to run (in registration order) on every update(). */
  registerSystem(system: System): void {
    this.systems.push(system);
  }

  /** Runs every registered system once, in registration order. */
  update(dtSeconds: number): void {
    for (const system of this.systems) {
      try {
        system.update(this, dtSeconds);
      } catch (err) {
        console.error(`[ecs] System "${system.name}" threw during update:`, err);
      }
    }
  }

  /**
   * Gets (creating on first use) the server-only component store for a
   * given component name, e.g.
   * `world.componentStore<CooldownEntry>("npcContactCooldown")`. Kept
   * generic-by-name rather than one strongly-typed field per component,
   * so adding a new server-only component later never requires editing
   * World itself.
   */
  componentStore<T extends ServerOnlyComponent>(name: string): Map<EntityId, T> {
    let store = this.serverOnlyComponents.get(name);
    if (!store) {
      store = new Map<EntityId, T>();
      this.serverOnlyComponents.set(name, store);
    }
    return store as Map<EntityId, T>;
  }
}