import { World } from "../World";
import { Player } from "../../rooms/schema/Player";
import { LevelingSystem } from "./LevelingSystem";
import { StatsSystem } from "./StatsSystem";
import { COMBAT_CONFIG } from "../../data/combatConfig";
import { TILE_SIZE } from "../../data/mapData";
import { ValidationResult } from "../commands/types";

const COOLDOWN_STORE_NAME = "attackCooldown";

interface CooldownEntry {
  lastAttackAt: number;
}

/**
 * Minimal melee combat: attack the player's current target, gated by
 * range + a per-session cooldown, damage derived from the attacker's
 * effective Strength stat (see StatsComponent/StatsSystem). NPC targets
 * only for this slice - see canAttack()'s targetType check; PvP,
 * ranged/skill damage, and death/respawn flow are still future work
 * (SPEC.md Section 6, #1 "Combat MVP" roadmap item), not implemented
 * here. This system exists to exercise the Command Pattern end-to-end
 * with one real, working action, not to front-run that roadmap item.
 *
 * Split into canAttack() (pure, side-effect-free validation - called by
 * AttackCommand.validate on every attempt, including rejected ones) and
 * attemptAttack() (the actual mutation - called only after validate()
 * passed), mirroring the Command Pattern's own validate/execute split.
 *
 * Takes LevelingSystem + StatsSystem by constructor injection (same
 * pattern as NpcContactSystem/NpcSpawnSystem) so it can grant XP on kill
 * and clean up the dead NPC's stat registration, without importing
 * OverworldRoom or needing to know how those systems are wired.
 */
export class CombatSystem {
  constructor(
    private readonly world: World,
    private readonly levelingSystem: LevelingSystem,
    private readonly statsSystem: StatsSystem,
    private readonly broadcast: (type: string, message?: any) => void
  ) {}

  /** No side effects - safe to call on every attempt, including ones that get rejected. */
  canAttack(player: Player, sessionId: string): ValidationResult {
    if (!player.targetId || player.targetType !== "npc") {
      return { ok: false, reason: "No NPC target selected." };
    }

    const npc = this.world.state.npcs.get(player.targetId);
    if (!npc || npc.hp <= 0) {
      return { ok: false, reason: "Target no longer exists." };
    }

    const dx = player.x - npc.x;
    const dy = player.y - npc.y;
    const range = TILE_SIZE * COMBAT_CONFIG.meleeRangeRatio;
    if (Math.sqrt(dx * dx + dy * dy) > range) {
      return { ok: false, reason: "Target out of range." };
    }

    const cooldown = this.cooldownStore().get(sessionId);
    if (cooldown && Date.now() - cooldown.lastAttackAt < COMBAT_CONFIG.attackCooldownMs) {
      return { ok: false, reason: "Attack on cooldown." };
    }

    return { ok: true };
  }

  /** Applies damage. Assumes canAttack() was already checked by the calling command handler. */
  attemptAttack(player: Player, sessionId: string): void {
    const npc = this.world.state.npcs.get(player.targetId);
    if (!npc) return; // re-check - target could vanish between validate() and execute()

    this.cooldownStore().set(sessionId, { lastAttackAt: Date.now() });

    const damage = Math.round(
      COMBAT_CONFIG.baseDamage + player.stats.getEffective("strength") * COMBAT_CONFIG.strengthDamageMultiplier
    );
    npc.hp = Math.max(0, npc.hp - damage);

    if (npc.hp <= 0) {
      const npcId = npc.id;
      const npcName = npc.name;
      this.world.state.npcs.delete(npcId);
      this.statsSystem.unregister(npcId);

      // Clear this NPC as anyone's current target - mirrors how
      // OverworldRoom.onLeave already clears a departed player as a
      // target for everyone else (don't leave a dangling reference).
      this.world.state.players.forEach((p) => {
        if (p.targetType === "npc" && p.targetId === npcId) {
          p.targetId = "";
          p.targetType = "";
        }
      });

      this.broadcast("npc-defeated", { npcId, npcName, killedBySessionId: sessionId });
      this.levelingSystem.grantXp(player, COMBAT_CONFIG.xpPerNpcKill, sessionId);
      return;
    }

    this.broadcast("combat-event", {
      attackerSessionId: sessionId,
      npcId: npc.id,
      npcName: npc.name,
      damage,
      targetHp: npc.hp,
      targetMaxHp: npc.maxHp,
    });
  }

  /** Called from OverworldRoom.onLeave() so a disconnected player's cooldown entry doesn't linger forever. */
  clearFor(sessionId: string): void {
    this.cooldownStore().delete(sessionId);
  }

  private cooldownStore() {
    return this.world.componentStore<CooldownEntry>(COOLDOWN_STORE_NAME);
  }
}
