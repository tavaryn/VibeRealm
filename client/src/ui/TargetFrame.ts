/**
 * Thin wrapper around the target-frame DOM elements (see index.html for
 * #target-frame / #target-name / #target-level / #target-hp-fill /
 * #target-hp-text). Mirrors the existing HUD/ChatUI pattern of writing
 * directly to a few DOM nodes - no framework needed at this scale.
 */
export class TargetFrame {
  private panelEl: HTMLElement;
  private nameEl: HTMLElement;
  private levelEl: HTMLElement;
  private hpFillEl: HTMLElement;
  private hpTextEl: HTMLElement;

  constructor() {
    this.panelEl = document.getElementById("target-frame")!;
    this.nameEl = document.getElementById("target-name")!;
    this.levelEl = document.getElementById("target-level")!;
    this.hpFillEl = document.getElementById("target-hp-fill")!;
    this.hpTextEl = document.getElementById("target-hp-text")!;
  }

  update(name: string, level: number, hp: number, maxHp: number): void {
    this.panelEl.style.display = "block";
    this.nameEl.textContent = name;
    this.levelEl.textContent = `Lv.${level}`;
    const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
    this.hpFillEl.style.width = `${pct}%`;
    this.hpTextEl.textContent = `${Math.max(0, Math.round(hp))} / ${maxHp}`;
  }

  clear(): void {
    this.panelEl.style.display = "none";
  }
}
