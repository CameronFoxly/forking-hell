import type { GameEvent } from './simulation';
import { DEFAULTS } from './tuning';

export class AudioEngine {
  private context: AudioContext | null = null;
  private ambientGain: GainNode | null = null;
  private voices: OscillatorNode[] = [];
  sound = true;
  music = false;
  private suspended = true;
  private failed = false;

  constructor(private readonly report: (message: string) => void) {}

  async unlock(): Promise<void> {
    if (this.failed) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.ambientGain = this.context.createGain();
        this.ambientGain.gain.value = 0;
        this.ambientGain.connect(this.context.destination);
        for (const frequency of [110, 164.81, 220.25]) {
          const voice = this.context.createOscillator();
          voice.type = 'sine'; voice.frequency.value = frequency;
          voice.connect(this.ambientGain); voice.start(); this.voices.push(voice);
        }
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.updateAmbient();
    } catch (error) {
      this.failed = true;
      this.report(`Audio is unavailable; gameplay is unaffected. ${error instanceof Error ? error.message : ''}`);
    }
  }

  setPaused(paused: boolean): void { this.suspended = paused; this.updateAmbient(); }

  updateAmbient(): void {
    if (!this.context || !this.ambientGain) return;
    this.ambientGain.gain.setTargetAtTime(this.music && !this.suspended ? 0.012 : 0, this.context.currentTime, 0.12);
  }

  play(event: GameEvent, mergeCount = 1, tuning = DEFAULTS.audio): void {
    if (!this.sound || !this.context || this.context.state !== 'running') return;
    const settings: Record<GameEvent, [number, number, number]> = {
      jump: [220, 470, 0.1], land: [95, 65, 0.045], branch: [180, 640, 0.18], stage: [660, 990, 0.15],
      merge: [440, 110, 0.26], destroy: [600, 90, 0.08], combo: [660, 1320, 0.32], coin: [880, 1320, 0.07], hit: [150, 44, 0.15], over: [220, 55, 0.45],
    };
    const [start, end, duration] = settings[event];
    const pitch = event === 'merge' ? mergePitch(mergeCount, tuning.mergePitchStep) : 1;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = event === 'hit' ? 'sawtooth' : 'square';
    oscillator.frequency.setValueAtTime(start * pitch, now);
    if (event === 'combo') {
      for (const [index, ratio] of [1, 1.25, 1.5, 2].entries()) oscillator.frequency.setValueAtTime(start * ratio, now + index * .08);
    } else oscillator.frequency.exponentialRampToValueAtTime(end * pitch, now + duration);
    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain); gain.connect(this.context.destination);
    oscillator.start(now); oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  destroy(): void {
    for (const voice of this.voices) { voice.stop(); voice.disconnect(); }
    this.voices = [];
    void this.context?.close();
  }
}

export function mergePitch(count: number, semitones: number): number {
  return 2 ** (Math.min(24, Math.max(0, count - 1) * semitones) / 12);
}
