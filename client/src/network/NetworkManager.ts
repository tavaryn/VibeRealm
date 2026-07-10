import { Client, Room } from "colyseus.js";

// Derived from wherever this page was loaded from, rather than hardcoded.
// In production the server serves this client on the same port it runs
// Colyseus on (see server/src/index.ts), so this always resolves correctly
// whether that's http://localhost:2567 (solo), http://<lan-ip>:2567
// (friends on the same WiFi), or your forwarded public address/port.
// It also still works during local client-only dev via Vite on :5173,
// since the server's port is fixed at 2567 either way.
const SERVER_URL = `ws://${window.location.hostname}:2567`;

export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export type TargetType = "player" | "npc";

/**
 * Thin wrapper around colyseus.js so the rest of the client never talks
 * to the SDK directly. Makes it easy to swap rooms later (e.g. joining a
 * dungeon instance instead of "overworld").
 */
export class NetworkManager {
  private client: Client;
  public room?: Room;

  constructor() {
    this.client = new Client(SERVER_URL);
  }

  async connect(username: string): Promise<Room> {
    this.room = await this.client.joinOrCreate("overworld", { username });
    return this.room;
  }

  sendInput(input: MoveInput) {
    this.room?.send("move", input);
  }

  sendChat(text: string) {
    this.room?.send("chat", { text });
  }

  // Server validates the target actually exists before committing it (see
  // OverworldRoom.setPlayerTarget) - this is a request, not a guarantee.
  // Pass null/null to clear the current target.
  sendSetTarget(targetId: string | null, targetType: TargetType | null) {
    this.room?.send("set-target", { targetId, targetType });
  }
}
