import { describe, expect, it } from 'vitest';
import { loadPreferences, savePreferences } from '../src/preferences';

describe('local preferences', () => {
  it('roundtrips independent audio, reduced motion and personal best settings', () => {
    let value: string | null = null;
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
    const settings = { music: true, sound: false, reducedMotion: true, best: 420 };
    savePreferences(storage, settings);
    expect(loadPreferences(storage, false)).toEqual(settings);
  });
  it('uses reduced motion on first visit and surfaces malformed or unavailable storage to the UI', () => {
    expect(loadPreferences({ getItem: () => null }, true).reducedMotion).toBe(true);
    expect(() => loadPreferences({ getItem: () => '{broken' }, false)).toThrow();
    expect(() => savePreferences({ setItem: () => { throw new Error('Quota exceeded'); } }, { music: false, sound: true, reducedMotion: false, best: 0 })).toThrow('Quota exceeded');
  });
});
