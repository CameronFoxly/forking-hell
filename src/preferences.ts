export type Preferences = { reducedMotion: boolean; sound: boolean; music: boolean; best: number };
const KEY = 'forking-hell:v1';

export function loadPreferences(storage: Pick<Storage, 'getItem'>, reducedMotion: boolean): Preferences {
  const fallback: Preferences = { reducedMotion, sound: true, music: false, best: 0 };
  const raw = storage.getItem(KEY);
  if (raw === null) return fallback;
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) throw new Error('Saved settings are not an object');
  const data = value as Record<string, unknown>;
  return {
    reducedMotion: typeof data.reducedMotion === 'boolean' ? data.reducedMotion : fallback.reducedMotion,
    sound: typeof data.sound === 'boolean' ? data.sound : true,
    music: typeof data.music === 'boolean' ? data.music : false,
    best: typeof data.best === 'number' && Number.isSafeInteger(data.best) && data.best >= 0 ? data.best : 0,
  };
}

export function savePreferences(storage: Pick<Storage, 'setItem'>, preferences: Preferences): void {
  storage.setItem(KEY, JSON.stringify(preferences));
}
