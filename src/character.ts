import { DEFAULTS } from './tuning';
import type { Tuning } from './tuning';

export type Clip = 'Idle' | 'Walk' | 'Jump_Up' | 'JumpDown' | 'Land';
export type CharacterFrame = { key: string; x: number; y: number; w: number; h: number; duration: number };
export type CharacterAtlas = Record<Clip, CharacterFrame[]>;
const CLIPS: Clip[] = ['Idle', 'Walk', 'Jump_Up', 'JumpDown', 'Land'];

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid character atlas record');
  return value as Record<string, unknown>;
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('Invalid character frame dimension or duration');
  return value;
}
function coordinate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('Invalid character frame coordinate');
  return value;
}
function isClip(value: string): value is Clip { return CLIPS.some(clip => clip === value); }

export function parseCharacterAtlas(data: unknown, width: number, height: number): CharacterAtlas {
  const root = record(data);
  const size = record(record(root.meta).size);
  if (width !== 130 || height !== 135 || size.w !== width || size.h !== height) throw new Error('Character image and atlas must both be 130 x 135');
  const ordered: Record<Clip, { order: number; frame: CharacterFrame }[]> = { Idle: [], Walk: [], Jump_Up: [], JumpDown: [], Land: [] };
  for (const [key, value] of Object.entries(record(root.frames))) {
    const match = /#(Idle|Walk|Jump_Up|JumpDown|Land)(?:\s+(\d+))?\.aseprite$/.exec(key);
    if (!match?.[1] || !isClip(match[1])) continue;
    const raw = record(value), rect = record(raw.frame);
    const frame = { key, x: coordinate(rect.x), y: coordinate(rect.y), w: positive(rect.w), h: positive(rect.h), duration: positive(raw.duration) };
    if (frame.w !== 26 || frame.h !== 27 || raw.trimmed !== false || raw.rotated !== false || frame.x + frame.w > width || frame.y + frame.h > height) throw new Error('Character frames must be untrimmed, unrotated 26 x 27 atlas rectangles');
    ordered[match[1]].push({ order: match[2] ? Number(match[2]) : 0, frame });
  }
  const atlas: CharacterAtlas = { Idle: [], Walk: [], Jump_Up: [], JumpDown: [], Land: [] };
  for (const clip of CLIPS) {
    if (!ordered[clip].length) throw new Error(`Missing character clip: ${clip}`);
    atlas[clip] = ordered[clip].sort((a, b) => a.order - b.order).map(entry => entry.frame);
  }
  if (atlas.Jump_Up.length < 4 || atlas.JumpDown.length < 4) throw new Error('Both jump clips require at least four frames');
  return atlas;
}

// Frame/state contract follows CameronFoxly/sprite-tester; player animation is forward-only,
// independently of the signed environmental clock.
export class CharacterAnimation {
  clip: Clip = 'Idle';
  index = 0;
  private elapsed = 0;
  private firstDraw = false;
  private launchAdvance = false;
  private landing: number | null = null;

  constructor(readonly atlas: CharacterAtlas, public settings: Tuning['character'] = DEFAULTS.character) {}
  get frame(): CharacterFrame { return this.atlas[this.clip][this.index]!; }
  reset(): void { this.clip = 'Idle'; this.index = 0; this.elapsed = 0; this.firstDraw = false; this.launchAdvance = false; this.landing = null; }
  jumped(): void { this.enter('Jump_Up', true); this.firstDraw = true; this.landing = null; }
  landed(): void { this.enter('Land', true); this.firstDraw = true; this.landing = this.settings.landMs; }

  update(seconds: number, grounded: boolean, velocityYUp: number, axis: number): void {
    if (this.launchAdvance) { this.launchAdvance = false; this.index = 1; this.elapsed = 0; }
    const dt = Math.max(0, Math.min(0.1, seconds)) * 1000;
    if (this.landing !== null) {
      if (this.firstDraw) return;
      this.landing -= dt;
      if (this.landing > 2) return;
      this.landing = null;
      this.enter(axis ? 'Walk' : 'Idle');
      return;
    }
    if (!grounded) {
      const next = velocityYUp > 0 ? 'Jump_Up' : 'JumpDown';
      if (this.enter(next) || this.firstDraw) return;
      this.advance(dt, 2);
    } else if (!this.enter(axis ? 'Walk' : 'Idle')) this.advance(dt, 0);
  }

  afterDraw(): void {
    if (!this.firstDraw) return;
    this.firstDraw = false;
    this.launchAdvance = this.clip === 'Jump_Up';
  }

  private enter(clip: Clip, restart = false): boolean {
    if (clip === this.clip && !restart) return false;
    this.clip = clip; this.index = 0; this.elapsed = 0; this.launchAdvance = false;
    return true;
  }
  private advance(dt: number, loop: number): void {
    this.elapsed += dt;
    const duration = this.clip === 'Idle' ? this.settings.idleMs : this.clip === 'Walk' ? this.settings.walkMs : this.settings.jumpMs;
    while (this.elapsed >= duration) {
      this.elapsed -= duration;
      this.index = this.index + 1 < this.atlas[this.clip].length ? this.index + 1 : loop;
    }
  }
}
