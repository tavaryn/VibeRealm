/**
 * Thin wrapper around the login-screen DOM elements (see index.html for
 * #login-screen / #login-form / #login-username / #login-error /
 * #login-submit). Mirrors the existing ChatUI/TargetFrame pattern of
 * writing directly to a few DOM nodes rather than pulling in a framework.
 *
 * Responsible only for the login FORM - it doesn't know anything about
 * Colyseus or GameScene. GameScene owns the "what happens when submitted"
 * logic and calls back in via the constructor callback, and calls
 * show()/hide() itself in response to connect success/failure or
 * disconnect - see GameScene.connectToServer / handleDisconnect.
 */
export class LoginScreen {
  private screenEl: HTMLElement;
  private formEl: HTMLFormElement;
  private inputEl: HTMLInputElement;
  private errorEl: HTMLElement;
  private submitBtn: HTMLButtonElement;

  constructor(onSubmit: (username: string) => void) {
    this.screenEl = document.getElementById("login-screen")!;
    this.formEl = document.getElementById("login-form") as HTMLFormElement;
    this.inputEl = document.getElementById("login-username") as HTMLInputElement;
    this.errorEl = document.getElementById("login-error")!;
    this.submitBtn = document.getElementById("login-submit") as HTMLButtonElement;

    // Without this, typing in the field still "works" visually, but every
    // keystroke also bubbles up to Phaser's global keyboard listener,
    // which has W/A/S/D bound as movement keys (see GameScene.setupInput)
    // and calls preventDefault() on them - silently eating those
    // characters before the browser ever types them into the input.
    // Stopping propagation here (same fix ChatUI already uses) keeps the
    // keystroke local to this field instead of letting it bubble past the
    // input element to document/window where Phaser is listening.
    this.inputEl.addEventListener("keydown", (e) => {
      e.stopPropagation();
    });

    this.formEl.addEventListener("submit", (e) => {
      // Prevent the browser's normal full-page-reload form submission -
      // this is a single-page app, submission is handled entirely in JS.
      e.preventDefault();

      const username = this.inputEl.value.trim();
      if (username.length === 0) {
        this.showError("Please enter a username.");
        return;
      }

      this.clearError();
      this.setSubmitting(true);
      onSubmit(username);
    });

    this.inputEl.focus();
  }

  /**
   * Reveals the login screen. Called on initial load implicitly (it's
   * visible by default in the HTML) and explicitly whenever GameScene
   * needs to send the player back here - e.g. after a failed connection
   * attempt or a server disconnect. `message`, if given, is shown as an
   * inline error/status line (e.g. "Disconnected from the server.").
   */
  show(message?: string): void {
    this.screenEl.style.display = "flex";
    this.setSubmitting(false);

    if (message) {
      this.showError(message);
    } else {
      this.clearError();
    }

    // Re-focus and select so the player can immediately retry (or just
    // press Enter again) without having to click into the field first.
    this.inputEl.focus();
    this.inputEl.select();
  }

  hide(): void {
    this.screenEl.style.display = "none";
  }

  showError(message: string): void {
    this.errorEl.textContent = message;
  }

  clearError(): void {
    this.errorEl.textContent = "";
  }

  private setSubmitting(isSubmitting: boolean): void {
    this.submitBtn.disabled = isSubmitting;
    this.submitBtn.textContent = isSubmitting ? "Connecting..." : "Enter World";
  }
}
