import shipped from './defaults.json' with { type: 'json' };

const field = (label: string, unit: string, min: number, max: number, step: number) => ({ label, unit, min, max, step, toggle: false });
const toggle = (label: string) => ({ ...field(label, '', 0, 1, 1), toggle: true });
export const FIELDS = {
  character: {
    speed: field('Move speed', 'px/s', 30, 240, 1),
    idleMs: field('Idle frame', 'ms', 50, 500, 5),
    walkMs: field('Walk frame', 'ms', 20, 200, 1),
    jumpMs: field('Jump frame', 'ms', 20, 200, 1),
    landMs: field('Landing hold', 'ms', 16, 300, 1),
  },
  physics: {
    gravity: field('Gravity', 'px/s²', 150, 1800, 10),
    jumpHeight: field('Full-held jump height', 'px; tap is half', 12, 120, 1),
    hitProtection: field('Post-hit protection', 's', 0.1, 3, 0.05),
  },
  enemies: {
    patrolSpeed: field('Patrol phase speed', '×', 0.2, 3, 0.05),
    spinSpeed: field('Spinner phase speed', '×', 0.2, 3, 0.05),
    gateSpeed: field('Gate phase speed', '×', 0.2, 3, 0.05),
    patrolRange: field('Patrol travel radius', 'px', 0, 60, 1),
    spinnerHeight: field('Spinner height', 'px', 10, 40, 1),
    spinnerBob: field('Spinner bob radius', 'px', 0, 20, 1),
    firingRate: field('Firing rate', '×', 0.25, 3, 0.05),
    shotSpeed: field('Projectile speed', 'px/s', 30, 200, 1),
    shotLife: field('Projectile lifetime', 's', 0.5, 5, 0.1),
  },
  branches: {
    length: field('Fork ramp length', 'px', 16, 64, 1),
    height: field('Lane separation', 'px', 40, 96, 1),
    liftDuration: field('Lift duration', 's', 0.1, 1, 0.01),
    collapseDuration: field('Collapse duration', 's', 0.1, 1, 0.01),
    liftEase: field('Lift deceleration power', 'power', 1, 5, 0.1),
    collapseEase: field('Collapse acceleration power', 'power', 1, 5, 0.1),
    holdDelay: field('Extra delay after merge tween', 's', 0, 1.5, 0.01),
  },
  camera: {
    startZoom: field('Starting zoom', '×', 0.6, 1.25, 0.01),
    minZoom: field('Minimum zoom', '×', 0.3, 0.8, 0.01),
    depthZoom: field('Depth zoom factor', '', 0.05, 1, 0.01),
    deadzone: field('Deadzone half-width', 'view fraction', 0.05, 0.3, 0.01),
    lookAhead: field('Directional look-ahead', 'view fraction', 0, 0.35, 0.01),
    lookDamping: field('Look-ahead response', '1/s', 1, 20, 0.5),
    followDamping: field('Horizontal response', '1/s', 1, 25, 0.5),
    verticalDamping: field('Vertical response', '1/s', 1, 25, 0.5),
    zoomDamping: field('Zoom response', '1/s', 1, 20, 0.5),
  },
  effects: {
    particles: field('Burst particles', 'count', 0, 24, 1),
    particleLife: field('Burst lifetime', 's', 0.1, 1.5, 0.05),
    particleSpread: field('Burst spread', '×', 0.2, 3, 0.1),
    shakeAmount: field('Hit shake amplitude', 'world px', 0, 6, 1),
    shakeDuration: field('Hit shake duration', 's', 0, 0.5, 0.01),
    shakeFrequency: field('Hit shake frequency', 'rad/s', 20, 160, 5),
    paletteStrength: field('Palette treatment', 'mix', 0, 1, 0.05),
    inactiveOpacity: field('Inactive enemy opacity', 'alpha', 0.2, 1, 0.05),
    highlightStrength: field('Staged lineage glow', 'alpha', 0, 1, 0.05),
  },
  coins: {
    popSpeed: field('Coin pop speed', 'px/s', 40, 160, 1),
    spread: field('Coin launch spread', 'px/s', 10, 90, 1),
    gravity: field('Coin gravity', 'px/s²', 250, 1000, 10),
    bounce: field('Coin restitution', 'ratio', 0.1, 0.65, 0.01),
    friction: field('Coin surface retention', 'ratio', 0.5, 0.95, 0.01),
    shimmer: field('Idle shimmer', 'alpha', 0, 1, 0.05),
  },
  crt: {
    enabled: toggle('CRT monitor treatment'),
    opticalEnabled: toggle('Stationary optical aberration'),
    opticalDesktop: field('Optical split on desktop', 'CSS px at edge', 0, 18, 0.25),
    opticalMobile: field('Optical split on mobile', 'CSS px at edge', 0, 12, 0.25),
    scanlinesEnabled: toggle('Scanlines'),
    scanlineStrength: field('Scanline depth', 'mix', 0, 0.85, 0.01),
    scanlinePeriod: field('Scanline spacing', 'CSS px', 2, 24, 0.25),
    glowEnabled: toggle('Pixel glow'),
    glowStrength: field('Glow strength', 'mix', 0, 2, 0.05),
    glowRadius: field('Glow radius', 'world px', 0.5, 16, 0.25),
    glowThreshold: field('Emissive threshold', 'channel level', 0, 1, 0.05),
    curvatureEnabled: toggle('Static CRT curvature'),
    curvature: field('Curvature', 'edge warp', 0, 0.25, 0.005),
    hudStrength: field('Canvas HUD and splash treatment', 'mix', 0, 1, 0.05),
  },
  motion: {
    enabled: toggle('Object motion aberration'),
    strength: field('Motion fringe strength', 'additive alpha', 0, 0.25, 0.01),
    exposureMs: field('Motion exposure', 'ms', 0, 35, 1),
    maxWorldPixels: field('Maximum fringe', 'world px', 0, 3, 1),
    maxDesktopCss: field('Desktop fringe cap', 'CSS px', 0, 5, 0.25),
    maxMobileCss: field('Mobile fringe cap', 'CSS px', 0, 3, 0.25),
  },
  audio: {
    mergePitchStep: field('Merge pitch rise per layer', 'semitones', 0, 5, 0.5),
    successThreshold: field('Combo flourish at layer', 'count', 2, 12, 1),
  },
};
export type Section = keyof typeof FIELDS;
export type Tuning = { [S in Section]: { [K in keyof typeof FIELDS[S]]: number } };
export const SECTIONS: Record<Section, string> = {
  character: 'Character & animation', physics: 'Jump & physics', enemies: 'Enemies & projectiles',
  branches: 'Forks & held merge', camera: 'Camera feel', effects: 'Pixels, highlights & particles', audio: 'Merge audio',
  crt: 'CRT monitor optics', motion: 'Object motion aberration',
  coins: 'Coin pop & bounce',
};
export const RESTART_SECTIONS: Section[] = ['enemies', 'branches'];
export const entries = <T extends object>(object: T) => Object.entries(object) as [keyof T, T[keyof T]][];
function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as Record<string, unknown>;
}
function exactKeys(object: Record<string, unknown>, keys: string[], name: string): void {
  if (Object.keys(object).length !== keys.length || keys.some(key => !Object.hasOwn(object, key))) {
    throw new Error(`${name} must contain exactly: ${keys.join(', ')}.`);
  }
}
export function parseTuning(data: unknown): Tuning {
  const root = record(data, 'Tuning file');
  exactKeys(root, ['format', 'version', 'values'], 'Tuning file');
  if (root.format !== 'forking-hell-tuning' || (root.version !== 1 && root.version !== 2)) throw new Error('Unsupported tuning format or version. Expected forking-hell-tuning version 1 or 2.');
  let values = record(root.values, 'values');
  if (root.version === 1) {
    exactKeys(values, Object.keys(FIELDS).filter(key => !['crt', 'motion', 'coins'].includes(key)), 'version 1 values');
    const branches = record(values.branches, 'version 1 branches');
    const eased = Object.hasOwn(branches, 'liftEase') || Object.hasOwn(branches, 'collapseEase');
    exactKeys(branches, ['length', 'height', 'transition', 'holdDelay', ...(eased ? ['liftEase', 'collapseEase'] : [])], 'version 1 branches');
    values = {
      ...values,
      branches: {
        length: branches.length, height: branches.height, holdDelay: branches.holdDelay,
        liftDuration: branches.transition, collapseDuration: branches.transition,
        liftEase: eased ? branches.liftEase : 3, collapseEase: eased ? branches.collapseEase : 3,
      },
      crt: { ...shipped.values.crt, enabled: 0 }, motion: { ...shipped.values.motion, enabled: 0 },
      coins: { ...shipped.values.coins },
    };
  }
  exactKeys(values, Object.keys(FIELDS), 'values');
  for (const [section, fields] of entries(FIELDS)) {
    const value = record(values[section], section);
    exactKeys(value, Object.keys(fields), section);
    for (const [key, f] of Object.entries(fields)) {
      const n = value[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < f.min || n > f.max) throw new Error(`${section}.${key} must be a finite number from ${f.min} to ${f.max}.`);
      if (f.toggle && n !== 0 && n !== 1) throw new Error(`${section}.${key} must be 0 (off) or 1 (on).`);
      if ((key === 'particles' || key === 'successThreshold' || key === 'length' || key === 'height') && !Number.isInteger(n)) throw new Error(`${section}.${key} must be a whole number.`);
    }
  }
  // Shape and every numeric leaf were validated above; clone so callers cannot mutate the import.
  const result = structuredClone(values) as Tuning;
  if (result.camera.minZoom > result.camera.startZoom) throw new Error('Minimum zoom cannot exceed starting zoom.');
  if (result.enemies.spinnerBob > result.enemies.spinnerHeight) throw new Error('Spinner bob radius cannot exceed its height.');
  return result;
}
export const DEFAULTS: Tuning = parseTuning(shipped);
export function tuningDocument(values: Tuning): { format: string; version: number; values: Tuning } {
  return { format: 'forking-hell-tuning', version: 2, values: structuredClone(values) };
}
export function needsRestart(before: Tuning, after: Tuning): boolean {
  return RESTART_SECTIONS.some(section => JSON.stringify(before[section]) !== JSON.stringify(after[section]));
}
