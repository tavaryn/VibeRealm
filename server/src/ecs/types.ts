/**
 * Core ECS type definitions - Phase 1 scaffolding, now used by
 * ecs/World.ts and ecs/systems/MovementSystem.ts (Phase 2).
 */

/**
 * An entity is nothing more than a stable string id (UUID v7 - see
 * server/src/utils/generateId.ts). There is no Entity class - "having a
 * component" just means an id appears as a key in that component's
 * store (see World.componentStore()).
 */
export type EntityId = string;

/**
 * Marker type for a *synced* component: a small Colyseus Schema class
 * meant to be nested as a `@type` field inside an entity's top-level
 * Schema (e.g. Player, Npc), rather than a flat field list. Synced
 * components will live in ecs/components/ once introduced - this type
 * exists purely for documentation/searchability; Colyseus itself
 * doesn't need it.
 */
export type SyncedComponent = object;

/**
 * A non-synced (server-only) component is just a plain data object - no
 * base class required. Stored in a `Map<EntityId, T>` via
 * `World.componentStore()` rather than as a Colyseus Schema field, since
 * clients never need to see it.
 */
export type ServerOnlyComponent = object;