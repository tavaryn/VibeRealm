/**
 * Thin wrapper around the action-bar DOM elements (see index.html for
 * #action-bar / #attack-button). Mirrors the existing ChatUI/TargetFrame/
 * LoginScreen pattern - a small class wrapping a few DOM nodes, no
 * framework needed at this scale.
 *
 * Purely a dumb view: it doesn't decide WHETHER an attack toggle is
 * valid (needs a target, can't attack while downed, etc.) - that logic
 * lives in GameScene.toggleAutoAttack(), same request/validate/echo
 * pattern as targeting. This class only renders whatever isAttacking
 * state GameScene tells it to, driven by the server-confirmed
 * Player.isAttacking field - never an optimistic local guess.
 */
export class ActionBar {
  private attackBtn: HTMLButtonElement;

  constructor(onAttackClick: () => void) {
    this.attackBtn = document.getElementById("attack-button") as HTMLButtonElement;
    this.attackBtn.addEventListener("click", onAttackClick);
  }

  setAttacking(isAttacking: boolean): void {
    this.attackBtn.textContent = isAttacking ? "Stop Attack" : "Attack";
    this.attackBtn.classList.toggle("active", isAttacking);
  }

  setEnabled(enabled: boolean): void {
    this.attackBtn.disabled = !enabled;
  }
}