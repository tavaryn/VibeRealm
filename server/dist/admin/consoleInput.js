"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startConsoleInput = startConsoleInput;
const readline = __importStar(require("readline"));
const commandRegistry_1 = require("./commandRegistry");
const adminRuntime_1 = require("./adminRuntime");
/**
 * Lets you type admin commands directly into the terminal running the
 * server (no separate client needed). The console is always treated as
 * admin - it's the person running the process. Reuses the exact same
 * `commandRegistry.execute()` path as in-game chat commands; only the
 * actor type and reply mechanism (console.log vs client.send) differ.
 */
function startConsoleInput() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "viberealm> " });
    console.log('[admin] Server console ready. Type "/help" for a list of commands.');
    rl.prompt();
    rl.on("line", async (line) => {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            await commandRegistry_1.commandRegistry.execute(trimmed, { type: "console", isAdmin: true }, (msg) => console.log(msg), { room: (0, adminRuntime_1.getActiveRoom)(), requestShutdown: adminRuntime_1.requestShutdown });
        }
        rl.prompt();
    });
}
