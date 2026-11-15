import type { Input } from './simulation';

type Action = 'left' | 'right' | 'jump' | 'branch' | 'merge';
const bindings: Record<string, Action> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'branch', KeyW: 'branch', ArrowDown: 'merge', KeyS: 'merge',
};

export class Controls {
  private keys = new Set<string>();
  private pointers = new Map<number, Action>();
  private buttonKeys = new Map<string, Action>();
  private edges = new Set<Action>();
  private abort = new AbortController();

  constructor(private readonly onPause: () => void, private readonly onGesture: () => void) {
    const options = { signal: this.abort.signal };
    const ownsInput = (target: EventTarget | null): boolean => target instanceof HTMLElement &&
      Boolean(target.closest('#tuning-panel, button, input, textarea, select, summary, a, [contenteditable="true"]'));
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLElement && e.target.closest('#tuning-panel')) return;
      if (e.code === 'Escape' && !e.repeat) { this.onPause(); return; }
      if (ownsInput(e.target)) return;
      if (!bindings[e.code]) return;
      e.preventDefault();
      if (e.repeat && !this.keys.has(e.code)) return;
      if (!e.repeat && !this.activeActions().has(bindings[e.code]!)) this.edges.add(bindings[e.code]!);
      this.keys.add(e.code);
      this.paintPressed();
      this.onGesture();
    }, options);
    document.addEventListener('focusin', e => { if (ownsInput(e.target)) this.clear(); }, options);
    document.addEventListener('pointerdown', e => {
      if (e.target instanceof HTMLElement && !e.target.closest('input, textarea, [contenteditable="true"]')) window.getSelection()?.removeAllRanges();
    }, options);
    window.addEventListener('keyup', e => { this.keys.delete(e.code); this.buttonKeys.delete(e.code); this.paintPressed(); }, options);
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      const action = button.dataset.control as Action;
      button.addEventListener('keydown', e => {
        if (e.code !== 'Space' && e.code !== 'Enter') return;
        e.preventDefault();
        if (!e.repeat) {
          if (!this.activeActions().has(action)) this.edges.add(action);
          this.buttonKeys.set(e.code, action);
        }
        this.paintPressed(); this.onGesture();
      }, options);
      button.addEventListener('pointerdown', e => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        if (!this.activeActions().has(action)) this.edges.add(action);
        this.pointers.set(e.pointerId, action);
        this.paintPressed();
        this.onGesture();
      }, options);
      const release = (e: PointerEvent): void => {
        this.pointers.delete(e.pointerId);
        if (e.type === 'pointercancel') this.edges.delete(action);
        this.paintPressed();
      };
      button.addEventListener('pointerup', release, options);
      button.addEventListener('pointercancel', release, options);
      button.addEventListener('lostpointercapture', release, options);
      button.addEventListener('contextmenu', e => e.preventDefault(), options);
    }
  }

  sample(): Input {
    const active = this.activeActions();
    const input = {
      move: Number(active.has('right')) - Number(active.has('left')),
      jump: active.has('jump') || this.edges.has('jump'),
      jumpPressed: this.edges.has('jump'),
      branch: active.has('branch') || this.edges.has('branch'),
      merge: active.has('merge') || this.edges.has('merge'),
    };
    this.edges.clear();
    return input;
  }

  clear(): void {
    this.keys.clear(); this.pointers.clear(); this.buttonKeys.clear(); this.edges.clear();
    this.paintPressed();
  }

  private activeActions(): Set<Action> {
    const active = new Set([...this.keys].map(key => bindings[key]!));
    for (const action of this.pointers.values()) active.add(action);
    for (const action of this.buttonKeys.values()) active.add(action);
    return active;
  }

  private paintPressed(): void {
    const active = this.activeActions();
    for (const key of document.querySelectorAll<HTMLElement>('[data-control], [data-keycap]')) {
      key.classList.toggle('pressed', active.has((key.dataset.control ?? key.dataset.keycap) as Action));
    }
  }

  destroy(): void { this.clear(); this.abort.abort(); }
}
