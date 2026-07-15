"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commandRegistry_1 = require("./commandRegistry");
const banList_1 = require("./banList");
const entityLookup_1 = require("./entityLookup");
/**
 * All built-in commands, registered as a side effect of importing this
 * file once at startup (see index.ts: `import "./admin/commands"`). Add
 * new commands (e.g. /spawn, /teleport) by copy-pasting one of these
 * `commandRegistry.register({...})` blocks - nothing else needs to change.
 */
function requireRoom(ctx) {
    if (!ctx.room) {
        ctx.reply("No active room right now - try again in a moment.");
        return false;
    }
    return true;
}
commandRegistry_1.commandRegistry.register({
    name: "givexp",
    description: "Grants XP to a player, applying level-ups the same way passive XP does.",
    usage: "/givexp <username|sessionId> <amount>",
    adminOnly: true,
    execute: (ctx) => {
        if (!requireRoom(ctx))
            return;
        const [identifier, amountStr] = ctx.args;
        const amount = Number(amountStr);
        if (!identifier || !Number.isFinite(amount)) {
            ctx.reply("Usage: /givexp <username|sessionId> <amount>");
            return;
        }
        const target = (0, entityLookup_1.findPlayerByIdentifier)(ctx.room, identifier);
        if (!target) {
            ctx.reply(`No connected player found matching "${identifier}".`);
            return;
        }
        ctx.room.grantXp(target.player, amount, target.sessionId);
        ctx.reply(`Granted ${amount} XP to "${target.player.username}" (now level ${target.player.level}, ${target.player.xp} xp).`);
    },
});
commandRegistry_1.commandRegistry.register({
    name: "who",
    description: "Lists currently connected players.",
    usage: "/who",
    adminOnly: true,
    execute: (ctx) => {
        if (!requireRoom(ctx))
            return;
        const names = [];
        ctx.room.state.players.forEach((p) => names.push(`${p.username} (Lv.${p.level}, hp ${p.hp}/${p.maxHp})`));
        ctx.reply(names.length ? `Online (${names.length}): ${names.join(", ")}` : "No players connected.");
    },
});
commandRegistry_1.commandRegistry.register({
    name: "quit",
    description: "Gracefully shuts down the whole server process.",
    usage: "/quit",
    adminOnly: true,
    execute: (ctx) => {
        const who = (0, commandRegistry_1.describeActor)(ctx.actor);
        console.log(`[admin] Shutdown requested by ${who}`);
        ctx.room?.broadcast("server-shutdown", {
            message: "The server is shutting down for maintenance. Please rejoin shortly.",
        });
        ctx.reply("Shutting down...");
        // Small delay so the broadcast above actually reaches clients before
        // the process (and its WebSocket transport) goes away.
        setTimeout(() => ctx.requestShutdown(), 500);
    },
});
commandRegistry_1.commandRegistry.register({
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
        (0, banList_1.addBan)(username, reason, (0, commandRegistry_1.describeActor)(ctx.actor));
        if (ctx.room) {
            // NOTE: target.sessionId (the live-connection / MapSchema key), NOT
            // target.player.id (the UUID v7 identity field) - since the UUID
            // migration, `state.players` is still keyed by Colyseus's
            // client.sessionId, but Player.id is now an independently
            // generated value. See entityLookup.ts's PlayerLookupResult doc
            // comment for the full reasoning.
            const target = (0, entityLookup_1.findPlayerByIdentifier)(ctx.room, username);
            if (target) {
                const client = ctx.room.clients.find((c) => c.sessionId === target.sessionId);
                client?.leave(4003, `Banned: ${reason}`);
            }
        }
        ctx.reply(`Banned "${username}". Reason: ${reason}`);
    },
});
commandRegistry_1.commandRegistry.register({
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
        const removed = (0, banList_1.removeBan)(username);
        ctx.reply(removed ? `Unbanned "${username}".` : `"${username}" was not banned.`);
    },
});
commandRegistry_1.commandRegistry.register({
    name: "kick",
    description: "Disconnects a currently-online player without banning them.",
    usage: "/kick <username> [reason]",
    adminOnly: true,
    execute: (ctx) => {
        if (!requireRoom(ctx))
            return;
        const [username, ...reasonParts] = ctx.args;
        if (!username) {
            ctx.reply("Usage: /kick <username> [reason]");
            return;
        }
        const reason = reasonParts.join(" ") || "Kicked by admin";
        const target = (0, entityLookup_1.findPlayerByIdentifier)(ctx.room, username);
        if (!target) {
            ctx.reply(`No connected player found matching "${username}".`);
            return;
        }
        // sessionId, not target.player.id - see /ban's comment above.
        const client = ctx.room.clients.find((c) => c.sessionId === target.sessionId);
        if (!client) {
            ctx.reply(`Found "${target.player.username}" in state but no matching connection - skipping.`);
            return;
        }
        client.leave(4001, reason);
        ctx.reply(`Kicked "${target.player.username}". Reason: ${reason}`);
    },
});
commandRegistry_1.commandRegistry.register({
    name: "kill",
    description: "Removes an NPC, or zeroes a player's HP and disconnects them (no combat/respawn system yet).",
    usage: "/kill <playerUsername|sessionId|npcId|npcName>",
    adminOnly: true,
    execute: (ctx) => {
        if (!requireRoom(ctx))
            return;
        const [identifier] = ctx.args;
        if (!identifier) {
            ctx.reply("Usage: /kill <playerUsername|sessionId|npcId|npcName>");
            return;
        }
        const target = (0, entityLookup_1.findPlayerByIdentifier)(ctx.room, identifier);
        if (target) {
            // No death/respawn system exists yet (SPEC.md Roadmap #1) - the
            // honest MVP behavior is "zero their hp and disconnect them" rather
            // than faking a death/respawn flow that isn't built yet.
            target.player.hp = 0;
            // sessionId, not target.player.id - see /ban's comment above.
            const client = ctx.room.clients.find((c) => c.sessionId === target.sessionId);
            client?.leave(4002, "Killed by admin");
            ctx.reply(`Killed player "${target.player.username}".`);
            return;
        }
        const npc = (0, entityLookup_1.findNpcByIdentifier)(ctx.room, identifier);
        if (npc) {
            ctx.room.state.npcs.delete(npc.id);
            ctx.reply(`Killed NPC "${npc.name}" (${npc.id}).`);
            return;
        }
        ctx.reply(`No player or NPC found matching "${identifier}".`);
    },
});
commandRegistry_1.commandRegistry.register({
    name: "givexp",
    description: "Grants XP to a player, applying level-ups the same way passive XP does.",
    usage: "/givexp <username|sessionId> <amount>",
    adminOnly: true,
    execute: (ctx) => {
        if (!requireRoom(ctx))
            return;
        const [identifier, amountStr] = ctx.args;
        const amount = Number(amountStr);
        if (!identifier || !Number.isFinite(amount)) {
            ctx.reply("Usage: /givexp <username|sessionId> <amount>");
            return;
        }
        const target = (0, entityLookup_1.findPlayerByIdentifier)(ctx.room, identifier);
        if (!target) {
            ctx.reply(`No connected player found matching "${identifier}".`);
            return;
        }
        ctx.room.grantXp(target.player, amount);
        ctx.reply(`Granted ${amount} XP to "${target.player.username}" (now level ${target.player.level}, ${target.player.xp} xp).`);
    },
});
