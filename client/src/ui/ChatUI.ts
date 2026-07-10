/**
 * Thin wrapper around the chat DOM elements (see index.html for #chat-log /
 * #chat-input). Kept separate from GameScene so chat rendering logic doesn't
 * clutter the Phaser scene code, and so it's easy to swap in a Phaser DOM
 * element version later without touching game logic.
 */
export class ChatUI {
  private logEl: HTMLElement;
  private inputEl: HTMLInputElement;

  constructor(onSend: (text: string) => void) {
    this.logEl = document.getElementById("chat-log")!;
    this.inputEl = document.getElementById("chat-input") as HTMLInputElement;

    this.inputEl.addEventListener("keydown", (e) => {
      // Stop the keystroke from ever reaching Phaser's global keyboard
      // listener - otherwise typing "w/a/s/d" in chat would also move
      // the player character.
      e.stopPropagation();

      if (e.key === "Enter") {
        const text = this.inputEl.value.trim();
        if (text.length > 0) {
          onSend(text);
          this.inputEl.value = "";
        }
      } else if (e.key === "Escape") {
        this.inputEl.blur();
      }
    });

    // Classic MMO convenience: pressing Enter while NOT already typing
    // opens the chat box instead of doing nothing / moving the character.
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && document.activeElement !== this.inputEl) {
        e.preventDefault();
        this.inputEl.focus();
      }
    });

    // Phaser calls preventDefault() on canvas pointer events, which has the
    // side effect of suppressing the browser's normal "blur the focused
    // input on click elsewhere" behavior. Do it ourselves so clicking back
    // into the game returns keyboard control to the player.
    document.addEventListener("mousedown", (e) => {
      if (e.target !== this.inputEl) {
        this.inputEl.blur();
      }
    });
  }

  isFocused(): boolean {
    return document.activeElement === this.inputEl;
  }

  addMessage(username: string, text: string, timestamp: number): void {
    const time = new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const line = document.createElement("div");
    line.className = "chat-line";

    // textContent (never innerHTML) so nothing from the network can inject
    // markup, regardless of what the server already sanitized.
    const meta = document.createElement("span");
    meta.className = "chat-meta";
    meta.textContent = `[${time}] ${username}: `;

    const body = document.createElement("span");
    body.textContent = text;

    line.appendChild(meta);
    line.appendChild(body);
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
}
