import * as readline from "readline";
import { commandRegistry } from "./commandRegistry";
import { getActiveRoom, requestShutdown } from "./adminRuntime";

/**
 * Lets you type admin commands directly into the terminal running the
 * server (no separate client needed). The console is always treated as
 * admin - it's the person running the process. Reuses the exact same
 * `commandRegistry.execute()` path as in-game chat commands; only the
 * actor type and reply mechanism (console.log vs client.send) differ.
 */
export function startConsoleInput() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "viberealm> " });
  console.log('[admin] Server console ready. Type "/help" for a list of commands.');
  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      await commandRegistry.execute(
        trimmed,
        { type: "console", isAdmin: true },
        (msg) => console.log(msg),
        { room: getActiveRoom(), requestShutdown }
      );
    }
    rl.prompt();
  });
}