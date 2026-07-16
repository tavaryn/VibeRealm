// server/src/admin/commands.ts
import { commandRegistry, describeActor } from "./commandRegistry";
import { addBan, removeBan } from "./banList";
import { findPlayerByIdentifier, findNpcByIdentifier } from "./entityLookup";
import { generateId } from "../utils/generateId";
import { STAT_NAMES, StatName, StatModifier } from "../data/statDefinitions";
import { CommandContext, AdminRoomApi } from "./types";

function requireRoom(ctx: CommandContext): boolean {
  if (!ctx.room) {
    ctx.reply("No active room right now - try again in a moment.");
    return false;
  }
  return true;
}

/**
 * Shared "resolve identifier to (entityId, target schema)" helper for the
 * new stats commands - mirrors the player-then-NPC fallback pattern
 * /kill already uses. `entityId` is the sessionId for a player or
 * npc.id for an NPC - the same key StatsSystem expects everywhere else.
 */
function resolveStatsTarget(
  room: AdminRoomApi,
  identifier: string
): { entityId: string; target: any } | undefined {
  const player = findPlayerByIdentifier(room, identifier);
  if (player) return { entityId: player.sessionId, target: player.player };

  const npc = findNpcByIdentifier(room, identifier);
  if (npc) return { entityId: npc.id, target: npc };

  return undefined;
}

commandRegistry.register({
  name: "help",
  description: "Lists available admin commands.",
  usage: "/help",
  adminOnly: true,
  execute: (ctx) => {
    const lines = commandRegistry.list().map((c) => `${c.usage} - ${c.description}`);
    ctx.reply(["Available commands:", ...lines].join("\n"));
  },
});

commandRegistry.register({
  name: "who",
  description: "Lists currently connected players.",
  usage: "/who",
  adminOnly: true,
  execute: (ctx) => {
    if (!requireRoom(ctx)) return;
    const names: string[] = [];
    ctx.room!.state.players.forEach((p: any) =>
      names.push(`${p.username} (Lv.${p.level}, hp ${p.hp}/${p.maxHp})`)
    );
    ctx.reply(names.length ? `Online (${names.length}): ${names.join(", ")}` : "No players connected.");
  },
});

commandRegistry.register({
  name: "quit",
  description: "Gracefully shuts down the whole server process.",
  usage: "/quit",
  adminOnly: true,
  execute: (ctx) => {
    const who = describeActor(ctx.actor);
    console.log(`[admin] Shutdown requested by ${who}`);
    ctx.room?.broadcast("server-shutdown", {
      message: "The server is shutting down for maintenance. Please rejoin shortly.",
    });
    ctx.reply("Shutting down...");
    setTimeout(() => ctx.requestShutdown(), 500);
  },
});

commandRegistry.register({
  name: "ban",
  description: "Bans a username (persisted) and disconnects them if online.",
  usage: "/ban <username> [reason]",
  adminOnly: true,
  execute: (ctx) => {
    const [username, ...reasonParts] = ctx.args;
    if (!username) {
      ctx.reply("Usage: /ban <username> [reason]");
      return;
    }
    const reason = reasonParts.join(" ") || "No reason given";
    addBan(username, reason, describeActor(ctx.actor));

    if (ctx.room) {
      const target = findPlayerByIdentifier(ctx.room, username);
      if (target) {
        const client = ctx.room.clients.find((c) => c.sessionId === target.sessionId);
        client?.leave(4003, `Banned: ${reason}`);
      }
    }

    ctx.reply(`Banned "${username}". Reason: ${reason}`);
  },
});

commandRegistry.register({
  name: "unban",
  description: "Removes a username from the ban list.",
  usage: "/unban <username>",
  adminOnly: true,
  execute: (ctx) => {
    const [username] = ctx.args;
    if (!username) {
      ctx.reply("Usage: /unban <username>");
      return;
    }
    const removed = removeBan(username);
    ctx.reply(removed ? `Unbanned "${username}".` : `"${username}" was not banned.`);
  },
});

commandRegistry.register({
  name: "kick",
  description: "Disconnects a currently-online player without banning them.",
  usage: "/kick <username> [reason]",
  adminOnly: true,
  execute: (ctx) => {
    if (!requireRoom(ctx)) return;
    const [username, ...reasonParts] = ctx.args;
    if (!username) {
      ctx.reply("Usage: /kick <username> [reason]");
      return;
    }
    const reason = reasonParts.join(" ") || "Kicked by admin";
    const target = findPlayerByIdentifier(ctx.room!, username);
    if (!target) {
      ctx.reply(`No connected player found matching "${username}".`);
      return;
    }
    const client = ctx.room!.clients.find((c) => c.sessionId === target.sessionId);
    if (!client) {
      ctx.reply(`Found "${target.player.username}" in state but no matching connection - skipping.`);
      return;
    }
    client.leave(4001, reason);
    ctx.reply(`Kicked "${target.player.username}". Reason: ${reason}`);
  },
});

commandRegistry.register({
  name: "kill",
  description:
    "Removes an NPC, or zeroes a player's HP and disconnects them (no combat/respawn system yet).",
  usage: "/kill <playerUsername|sessionId|npcId|npcName>",
  adminOnly: true,
  execute: (ctx) => {
    if (!requireRoom(ctx)) return;
    const [identifier] = ctx.args;
    if (!identifier) {
      ctx.reply("Usage: /kill <playerUsername|sessionId|npcId|npcName>");
      return;
    }

    const target = findPlayerByIdentifier(ctx.room!, identifier);
    if (target) {
      target.player.hp = 0;
      const client = ctx.room!.clients.find((c) => c.sessionId === target.sessionId);
      client?.leave(4002, "Killed by admin");
      ctx.reply(`Killed player "${target.player.username}".`);
      return;
    }

    const npc = findNpcByIdentifier(ctx.room!, identifier);
    if (npc) {
      ctx.room!.state.npcs.delete(npc.id);
      ctx.reply(`Killed NPC "${npc.name}" (${npc.id}).`);
      return;
    }

    ctx.reply(`No player or NPC found matching "${identifier}".`);
  },
});

commandRegistry.register({
  name: "givexp",
  description: "Grants XP to a player, applying level-ups the same way passive XP does.",
  usage: "/givexp <username|sessionId> <amount>",
  adminOnly: true,
  execute: (ctx) => {
    if (!requireRoom(ctx)) return;
    const [identifier, amountStr] = ctx.args;
    const amount = Number(amountStr);
    if (!identifier || !Number.isFinite(amount)) {
      ctx.reply("Usage: /givexp <username|sessionId> <amount>");
      return;
    }

    const target = findPlayerByIdentifier(ctx.room!, identifier);
    if (!target) {
      ctx.reply(`No connected player found matching "${identifier}".`);
      return;
    }

    ctx.room!.grantXp(target.player, amount, target.sessionId);
    ctx.reply(
      `Granted ${amount} XP to "${target.player.username}" (now level ${target.player.level}, ${target.player.xp} xp).`
    );
  },
});

commandRegistry.register({
  name: "stats",
  description: "Shows base/effective Core Stats and active modifiers for a player or NPC.",
  usage: "/stats <playerUsername|sessionId|npcId|npcName>",
  adminOnly: true,
  execute: (ctx) => {
    if (!requireRoom(ctx)) return;
    const [identifier] = ctx.args;
    if (!identifier) {
      ctx.reply("Usage: /stats <identifier>");
      return;
    }

    const resolved = resolveStatsTarget(ctx.room!, identifier);
    if (!resolved) {
      ctx.reply(`No player or NPC found matching "${identifier}".`);
      return;
    }

    const { entityId, target } = resolved;
    const statLines = STAT_NAMES.map(
      (stat) => `  ${stat}: base ${target.stats.getBase(stat)} -> effective ${target.stats.getEffective(stat)}`
    );

    const modifiers = ctx.room!.getStatModifiers(entityId);
    const modLines = modifiers.length
      ? modifiers.map((m) => {
          const expiry = m.expiresAt
            ? `, expires in ${Math.max(0, Math.round((m.expiresAt - Date.now()) / 1000))}s`
            : "";
          return `  [${m.id}] ${m.stat} ${m.type} ${m.value} (from ${m.source}${expiry})`;
        })
      : ["  (no active modifiers)"];

    ctx.reply(
      [`Stats for "${identifier}" (${entityId}):`, ...statLines, "Active modifiers:", ...modLines].join("\n")
    );
  },
});

commandRegistry.register({
  name: "addmod",
  description: "Adds a stat modifier to a player or NPC - for testing gear/buffs before Combat MVP exists.",
  usage: "/addmod <identifier> <stat> <flat|percent> <value> <durationSeconds|0> [source]",
  adminOnly: true,
  execute: (ctx) => {
    if (!requireRoom(ctx)) return;
    const [identifier, statRaw, typeRaw, valueRaw, durationRaw, ...sourceParts] = ctx.args;

    if (!identifier || !statRaw || !typeRaw || !valueRaw || !durationRaw) {
      ctx.reply("Usage: /addmod <identifier> <stat> <flat|percent> <value> <durationSeconds|0> [source]");
      return;
    }

    if (!STAT_NAMES.includes(statRaw as StatName)) {
      ctx.reply(`Unknown stat "${statRaw}". Valid stats: ${STAT_NAMES.join(", ")}`);
      return;
    }
    if (typeRaw !== "flat" && typeRaw !== "percent") {
      ctx.reply('Modifier type must be "flat" or "percent".');
      return;
    }

    const value = Number(valueRaw);
    const duration = Number(durationRaw);
    if (!Number.isFinite(value) || !Number.isFinite(duration)) {
      ctx.reply("Value and duration must be numbers (duration 0 = permanent).");
      return;
    }

    const resolved = resolveStatsTarget(ctx.room!, identifier);
    if (!resolved) {
      ctx.reply(`No player or NPC found matching "${identifier}".`);
      return;
    }

    const modifier: StatModifier = {
      id: generateId("mod"),
      stat: statRaw as StatName,
      type: typeRaw,
      value,
      source: sourceParts.join(" ") || `admin (${describeActor(ctx.actor)})`,
      expiresAt: duration > 0 ? Date.now() + duration * 1000 : undefined,
    };

    ctx.room!.addStatModifier(resolved.entityId, modifier);
    ctx.reply(
      `Added modifier [${modifier.id}] ${modifier.stat} ${modifier.type} ${modifier.value} to "${identifier}"` +
        (duration > 0 ? ` (expires in ${duration}s).` : " (permanent).")
    );
  },
});

commandRegistry.register({
  name: "removemod",
  description: "Removes a previously-added stat modifier by its id (see /stats for ids).",
  usage: "/removemod <identifier> <modifierId>",
  adminOnly: true,
  execute: (ctx) => {
    if (!requireRoom(ctx)) return;
    const [identifier, modifierId] = ctx.args;
    if (!identifier || !modifierId) {
      ctx.reply("Usage: /removemod <identifier> <modifierId>");
      return;
    }

    const resolved = resolveStatsTarget(ctx.room!, identifier);
    if (!resolved) {
      ctx.reply(`No player or NPC found matching "${identifier}".`);
      return;
    }

    const removed = ctx.room!.removeStatModifier(resolved.entityId, modifierId);
    ctx.reply(removed ? `Removed modifier "${modifierId}".` : `No modifier "${modifierId}" found on "${identifier}".`);
  },
});