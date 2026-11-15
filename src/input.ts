import type { Input } from './simulation';

type Action = 'left' | 'right' | 'jump' | 'branch' | 'merge';
const bindings: Record<string, Action> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'branch', KeyW: 'branch', ArrowDown: 'merge', KeyS: 'merge',
};

export class Controls {
  private keys = new Set<string>();
  private pointers = new Map<number, Action>();
  private edges = new Set<Action>();
  private abort = new AbortController();

  constructor(private readonly onPause: () => void, private readonly onGesture: () => void) {
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && !e.repeat) { this.onPause(); return; }
      if (!bindings[e.code] || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
      e.preventDefault();
      if (e.repeat && !this.keys.has(e.code)) return;
      if (!e.repeat) this.edges.add(bindings[e.code]!);
      this.keys.add(e.code);
      this.onGesture();
    }, options);
    window.addEventListener('keyup', e => { this.keys.delete(e.code); }, options);
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      const action = button.dataset.control as Action;
      button.addEventListener('pointerdown', e => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, action);
        this.edges.add(action);
        button.classList.add('pressed');
        this.onGesture();
      }, options);
      const release = (e: PointerEvent): void => {
        this.pointers.delete(e.pointerId);
        if (![...this.pointers.values()].includes(action)) button.classList.remove('pressed');
      };
      button.addEventListener('pointerup', release, options);
      button.addEventListener('pointercancel', release, options);
      button.addEventListener('lostpointercapture', release, options);
      button.addEventListener('contextmenu', e => e.preventDefault(), options);
    }
  }

  sample(): Input {
    const active = new Set([...this.keys].map(k => bindings[k]));
    for (const action of this.pointers.values()) active.add(action);
    const input = {
      move: Number(active.has('right')) - Number(active.has('left')),
      jump: active.has('jump') || this.edges.has('jump'),
      branch: active.has('branch') || this.edges.has('branch'),
      merge: active.has('merge') || this.edges.has('merge'),
    };
    this.edges.clear();
    return input;
  }

  clear(): void {
    this.keys.clear(); this.pointers.clear(); this.edges.clear();
    document.querySelectorAll('.pressed').forEach(button => button.classList.remove('pressed'));
  }

  destroy(): void { this.clear(); this.abort.abort(); }
}
