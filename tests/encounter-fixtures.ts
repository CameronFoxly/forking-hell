import { encounters } from '../src/simulation';
import { DEFAULTS } from '../src/tuning';
import type { Encounter } from '../src/simulation';

// This seed naturally has an early shooter; production never forces one.
export const SHOOTER_SEED = 116;

export function firstShooter(seed = SHOOTER_SEED, settings = DEFAULTS.enemies): Encounter {
  for (let chunk = 1; chunk < 80; chunk++) {
    const shooter = encounters(seed, chunk, settings).find(hazard => hazard.kind === 'shooter');
    if (shooter) return shooter;
  }
  throw new Error(`No shooter found for scenario seed ${seed}`);
}
