export const STEP = 1 / 60;
export const UNIT = 24;
export const LANE = 58;
export const SPEED = 90;
export const GRAVITY = 850;
export const JUMP_HEIGHT = 38;
export const PLAYER_WIDTH = 26;
export const PLAYER_HEIGHT = 27;
export const CHUNK = 480;
export const SHOT_LIFE = 2.8;
export const SHOT_SPEED = 86;
export const ATTACK_RANGE = SHOT_LIFE * SHOT_SPEED + 30;

export type HazardKind = 'patrol' | 'spinner' | 'shooter' | 'gate';
export type Input = { move: number; jump: boolean; branch: boolean; merge: boolean };
export type Encounter = { id: string; kind: HazardKind; x: number; phase: number; period: number };
export type Branch = {
  id: number;
  forkX: number;
  forkBase: number;
  staged: Set<string>;
  converted: Set<string>;
};
export type Shot = { id: string; branchId: number; sourceId: string; birth: number; x: number; y: number; vx: number; vy: number };
export type Coin = { id: string; branchId: number; x: number; bornAt: number; offset: number; collected: boolean };
export type Burst = { x: number; branchId: number; age: number; kind: 'stage' | 'merge' | 'coin' | 'hit' | 'fork' };
export type Transition = { kind: 'branch' | 'merge'; age: number; from: number; offset: number };
export type GameEvent = 'jump' | 'land' | 'branch' | 'stage' | 'merge' | 'coin' | 'hit' | 'over';
export type Player = { x: number; y: number; vy: number; grounded: boolean; health: number; invulnerable: number; facing: -1 | 1 };

const EMPTY_INPUT: Input = { move: 0, jump: false, branch: false, merge: false };

function hash(seed: number, index: number): number {
  let n = (seed ^ Math.imul(index + 1, 0x45d9f3b)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

export function encounters(seed: number, chunk: number): Encounter[] {
  if (chunk < 0) return [];
  if (chunk === 0) return [
    { id: '0:0', kind: 'patrol', x: 232, phase: 0, period: 3.6 },
    { id: '0:1', kind: 'spinner', x: 384, phase: 1.2, period: 3.2 },
  ];
  const kinds: HazardKind[] = ['patrol', 'spinner', 'shooter', 'gate'];
  const count = Math.min(4, 2 + Math.floor(chunk / 6));
  return Array.from({ length: count }, (_, i) => {
    const n = hash(seed, chunk * 11 + i);
    return {
      id: `${chunk}:${i}`,
      kind: chunk === 1 && i === 0 ? 'shooter' : kinds[n % kinds.length]!,
      x: chunk * CHUNK + 65 + i * (CHUNK / count) + ((n >>> 4) % 35),
      phase: ((n >>> 12) % 628) / 100,
      period: Math.max(1.35, 3.4 - chunk * 0.035) + ((n >>> 20) % 4) * 0.12,
    };
  });
}

export function hazardPose(hazard: Encounter, time: number): { x: number; y: number; angle: number; active: boolean } {
  const phase = time * (Math.PI * 2 / hazard.period) + hazard.phase;
  return {
    x: hazard.x + (hazard.kind === 'patrol' ? Math.sin(phase) * 24 : 0),
    y: hazard.kind === 'spinner' ? 17 + Math.sin(phase * 0.5) * 9 : 0,
    angle: phase,
    active: hazard.kind !== 'gate' || Math.sin(phase) > -0.35,
  };
}

export function shotPosition(shot: Shot, time: number): { x: number; y: number } | null {
  const age = time - shot.birth;
  return age >= 0 && age < SHOT_LIFE ? { x: shot.x + shot.vx * age, y: shot.y + shot.vy * age } : null;
}

export function sweptHit(ax: number, ay: number, bx: number, by: number, halfWidth: number, halfHeight: number): boolean {
  let near = 0;
  let far = 1;
  for (const [a, b, radius] of [[ax, bx, halfWidth], [ay, by, halfHeight]]) {
    if (a === undefined || b === undefined || radius === undefined) continue;
    const delta = b - a;
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(a) > radius) return false;
    } else {
      const t1 = (-radius - a) / delta;
      const t2 = (radius - a) / delta;
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
      if (near > far) return false;
    }
  }
  return true;
}

export class Simulation {
  readonly seed: number;
  player: Player = { x: 64, y: 0, vy: 0, grounded: true, health: 3, invulnerable: 0, facing: 1 };
  branches: Branch[] = [{ id: 0, forkX: 0, forkBase: 0, staged: new Set(), converted: new Set() }];
  readonly coins = new Map<string, Coin>();
  readonly shots = new Map<string, Shot>();
  readonly awarded = new Set<string>();
  readonly bursts: Burst[] = [];
  readonly events: GameEvent[] = [];
  readonly chunks = new Map<number, Encounter[]>();
  time = 0;
  realTime = 0;
  maxX = 64;
  direction = 0;
  axis = 0;
  coinScore = 0;
  destructionScore = 0;
  transition: Transition | null = null;
  paused = false;
  gameOver = false;
  tutorial = { moved: false, jumped: false, branched: false, staged: false, merged: false, collected: false };
  private nextBranch = 1;
  private held = { jump: false, branch: false, merge: false };
  private readonly firstConvertedDepth = new Map<string, number>();
  private readonly shotBuckets = new Map<string, Set<Shot>>();
  private readonly branchShots = new Map<number, Set<Shot>>();
  private readonly coinBuckets = new Map<number, Set<Coin>>();
  private readonly branchCoins = new Map<number, Set<Coin>>();

  constructor(seed = 0xf04c) {
    this.seed = seed;
  }

  get top(): Branch { return this.branches[this.branches.length - 1]!; }
  get depth(): number { return this.branches.length - 1; }
  get distanceScore(): number { return Math.floor(Math.max(0, this.maxX - 64) / UNIT) * 5; }
  get score(): number { return this.coinScore + this.destructionScore + this.distanceScore; }
  get currentDepth(): number { return this.surfaceAt(this.depth, this.player.x).depth; }
  get playerWorldY(): number {
    const shift = this.transition ? this.transition.offset * (1 - Math.min(1, this.transition.age / 0.34)) : 0;
    return this.surfaceAt(this.depth, this.player.x).height + this.player.y + shift;
  }

  surfaceAt(depth: number, x: number): { height: number; depth: number } {
    for (let i = depth; i > 0; i--) {
      const branch = this.branches[i]!;
      if (x < branch.forkX) continue;
      const t = Math.min(1, (x - branch.forkX) / UNIT);
      return { height: branch.forkBase + (i * LANE - branch.forkBase) * t, depth: i };
    }
    return { height: 0, depth: 0 };
  }

  nearby(minX: number, maxX: number): Encounter[] {
    const result: Encounter[] = [];
    for (let c = Math.max(0, Math.floor(minX / CHUNK)); c <= Math.floor(maxX / CHUNK); c++) {
      let chunk = this.chunks.get(c);
      if (!chunk) {
        chunk = encounters(this.seed, c);
        this.chunks.set(c, chunk);
        if (this.chunks.size > 24) this.chunks.delete(this.chunks.keys().next().value!);
      }
      result.push(...chunk.filter(h => h.x >= minX - 24 && h.x <= maxX + 24));
    }
    return result;
  }

  isConverted(depth: number, id: string): boolean {
    const first = this.firstConvertedDepth.get(id);
    return first !== undefined && first <= depth;
  }

  isOrdinaryActive(depth: number, hazard: Encounter): boolean {
    return !this.isConverted(depth, hazard.id) && (hazard.kind === 'shooter' || depth !== this.depth || depth === 0);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.direction = 0;
    this.held = { jump: false, branch: false, merge: false };
  }

  branch(): boolean {
    if (this.transition || this.gameOver || this.paused) return false;
    const previousHeight = this.surfaceAt(this.depth, this.player.x).height;
    const forkBase = this.surfaceAt(this.depth, this.player.x - UNIT).height;
    this.branches.push({
      id: this.nextBranch++,
      forkX: this.player.x - UNIT,
      forkBase,
      staged: new Set(),
      converted: new Set(),
    });
    this.transition = { kind: 'branch', age: 0, from: this.depth - 1, offset: previousHeight - this.surfaceAt(this.depth, this.player.x).height };
    this.tutorial.branched = true;
    this.events.push('branch');
    this.bursts.push({ x: this.top.forkX, branchId: this.top.id, age: 0, kind: 'fork' });
    return true;
  }

  stage(id: string): boolean {
    if (this.depth === 0 || this.top.staged.has(id) || this.isConverted(this.depth, id)) return false;
    this.top.staged.add(id);
    this.tutorial.staged = true;
    this.events.push('stage');
    return true;
  }

  merge(): boolean {
    if (this.depth === 0 || this.transition || this.gameOver || this.paused) return false;
    const child = this.top;
    const parent = this.branches[this.depth - 1]!;
    const previousHeight = this.surfaceAt(this.depth, this.player.x).height;
    for (const id of child.staged) {
      if (!this.isConverted(this.depth - 1, id)) {
        parent.converted.add(id);
        this.firstConvertedDepth.set(id, Math.min(this.firstConvertedDepth.get(id) ?? Infinity, this.depth - 1));
        const chunkIndex = Number(id.split(':')[0]);
        const target = encounters(this.seed, chunkIndex).find(h => h.id === id);
        if (!target) throw new Error(`Unknown staged encounter: ${id}`);
        const rewardId = `${parent.id}/${id}`;
        if (!this.awarded.has(rewardId)) {
          this.awarded.add(rewardId);
          this.destructionScore += 100;
          for (let i = 0; i < 3; i++) {
            const coinId = `${rewardId}/${i}`;
            const coin: Coin = {
              id: coinId, branchId: parent.id, x: target.x + (i - 1) * 13,
              offset: i * 0.09, bornAt: this.realTime, collected: false,
            };
            this.coins.set(coinId, coin);
            const key = Math.floor(coin.x / CHUNK);
            const bucket = this.coinBuckets.get(key) ?? new Set<Coin>();
            bucket.add(coin); this.coinBuckets.set(key, bucket);
            const owned = this.branchCoins.get(parent.id) ?? new Set<Coin>();
            owned.add(coin); this.branchCoins.set(parent.id, owned);
          }
          this.bursts.push({ x: target.x, branchId: parent.id, age: 0, kind: 'merge' });
        }
      }
      if (this.depth > 1) parent.staged.add(id);
    }
    const parentCoins = this.branchCoins.get(parent.id) ?? new Set<Coin>();
    for (const coin of this.branchCoins.get(child.id) ?? []) { coin.branchId = parent.id; parentCoins.add(coin); }
    if (parentCoins.size) this.branchCoins.set(parent.id, parentCoins);
    this.branchCoins.delete(child.id);
    for (const shot of this.branchShots.get(child.id) ?? []) {
      this.shots.delete(shot.id);
      for (const key of this.shotBucketKeys(shot)) {
        const bucket = this.shotBuckets.get(key);
        bucket?.delete(shot);
        if (bucket?.size === 0) this.shotBuckets.delete(key);
      }
    }
    this.branchShots.delete(child.id);
    this.branches.pop();
    this.transition = { kind: 'merge', age: 0, from: this.depth + 1, offset: previousHeight - this.surfaceAt(this.depth, this.player.x).height };
    this.tutorial.merged = true;
    this.events.push('merge');
    return true;
  }

  coinY(coin: Coin): number {
    const t = Math.max(0, this.realTime - coin.bornAt - coin.offset);
    return Math.max(5, 17 + 90 * t - 160 * t * t);
  }

  coinsNear(minX: number, maxX: number): Coin[] {
    const coins: Coin[] = [];
    for (let key = Math.floor(minX / CHUNK); key <= Math.floor(maxX / CHUNK); key++) {
      for (const coin of this.coinBuckets.get(key) ?? []) if (coin.x >= minX && coin.x <= maxX) coins.push(coin);
    }
    return coins;
  }

  private hurt(): void {
    if (this.player.invulnerable > 0) return;
    this.player.health--;
    this.player.invulnerable = 1.35;
    this.bursts.push({ x: this.player.x, branchId: this.branches[this.currentDepth]!.id, age: 0, kind: 'hit' });
    this.events.push('hit');
    if (this.player.health <= 0) {
      this.gameOver = true;
      this.direction = 0;
      this.events.push('over');
    }
  }

  private shotBucketKeys(shot: Shot): string[] {
    const endX = shot.x + shot.vx * SHOT_LIFE;
    const endY = shot.y + shot.vy * SHOT_LIFE;
    const keys: string[] = [];
    for (let x = Math.floor(Math.min(shot.x, endX) / 128); x <= Math.floor(Math.max(shot.x, endX) / 128); x++) {
      for (let y = Math.floor(Math.min(shot.y, endY) / 128); y <= Math.floor(Math.max(shot.y, endY) / 128); y++) keys.push(`${x}:${y}`);
    }
    return keys;
  }

  shotsNear(minX: number, maxX: number, minY: number, maxY: number): Set<Shot> {
    const shots = new Set<Shot>();
    for (let x = Math.floor(minX / 128); x <= Math.floor(maxX / 128); x++) {
      for (let y = Math.floor(minY / 128); y <= Math.floor(maxY / 128); y++) {
        for (const shot of this.shotBuckets.get(`${x}:${y}`) ?? []) shots.add(shot);
      }
    }
    return shots;
  }

  private ensureShots(hazard: Encounter, branch: Branch, ground: number, start: number, end: number): void {
    const phase = hazard.phase;
    const first = Math.ceil((Math.min(start, end) - SHOT_LIFE - phase) / hazard.period);
    const last = Math.floor((Math.max(start, end) - phase) / hazard.period);
    for (let n = first; n <= last; n++) {
      const id = `${branch.id}/${hazard.id}/${n}`;
      if (this.shots.has(id)) continue;
      const x = hazard.x;
      const y = ground + 12;
      const dx = this.player.x - x;
      const dy = this.playerWorldY + PLAYER_HEIGHT / 2 - y;
      const distance = Math.hypot(dx, dy);
      if (distance > ATTACK_RANGE) continue;
      const shot: Shot = {
        id, branchId: branch.id, sourceId: hazard.id, birth: n * hazard.period + phase, x, y,
        vx: distance > 0 ? dx / distance * SHOT_SPEED : -SHOT_SPEED,
        vy: distance > 0 ? dy / distance * SHOT_SPEED : 0,
      };
      this.shots.set(id, shot);
      const owned = this.branchShots.get(branch.id) ?? new Set<Shot>();
      owned.add(shot);
      this.branchShots.set(branch.id, owned);
      for (const key of this.shotBucketKeys(shot)) {
        const bucket = this.shotBuckets.get(key) ?? new Set<Shot>();
        bucket.add(shot);
        this.shotBuckets.set(key, bucket);
      }
    }
  }

  step(input: Input = EMPTY_INPUT, dt = STEP): void {
    if (this.paused || this.gameOver) return;
    if (!(dt > 0 && dt <= 1 / 30)) throw new Error('Simulation requires a positive fixed step of at most 1/30s');
    this.realTime += dt;
    const oldWorldY = this.playerWorldY;
    const wasGrounded = this.player.grounded;
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    const jump = input.jump && !this.held.jump;
    const fork = input.branch && !this.held.branch;
    const merge = input.merge && !this.held.merge;
    this.held = { jump: input.jump, branch: input.branch, merge: input.merge };
    if (fork) this.branch();
    else if (merge) this.merge();
    if (jump && this.player.grounded) {
      this.player.vy = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
      this.player.grounded = false;
      this.events.push('jump');
      this.tutorial.jumped = true;
    }
    if (this.transition) {
      this.transition.age += dt;
      if (this.transition.age >= 0.34) this.transition = null;
    }

    const oldX = this.player.x;
    const oldGround = this.surfaceAt(this.depth, oldX).height;
    const oldTime = this.time;
    let verticalPosition = oldGround + this.player.y;
    if (!this.player.grounded) {
      verticalPosition += this.player.vy * dt - 0.5 * GRAVITY * dt * dt;
      this.player.vy -= GRAVITY * dt;
    }
    const move = Math.sign(input.move);
    this.axis = move;
    if (move !== 0) this.player.facing = move < 0 ? -1 : 1;
    this.player.x = Math.max(PLAYER_WIDTH / 2, oldX + move * SPEED * dt);
    let physicalDepth = this.currentDepth;
    const hazards = this.nearby(oldX - ATTACK_RANGE - 30, oldX + ATTACK_RANGE + 30);
    const grounds = new Map<number, Float64Array>();
    const heightAt = (depth: number, x: number): number => {
      let heights = grounds.get(x);
      if (!heights) {
        heights = new Float64Array(this.branches.length);
        for (let d = 1; d <= this.depth; d++) {
          const branch = this.branches[d]!;
          heights[d] = x < branch.forkX ? heights[d - 1]! :
            branch.forkBase + (d * LANE - branch.forkBase) * Math.min(1, (x - branch.forkX) / UNIT);
        }
        grounds.set(x, heights);
      }
      return heights[depth]!;
    };
    const shift = this.transition ? this.transition.offset * (1 - this.transition.age / 0.34) : 0;
    const proposedGround = this.surfaceAt(this.depth, this.player.x).height;
    const proposedFoot = (this.player.grounded ? proposedGround : Math.max(proposedGround, verticalPosition)) + shift;
    for (const hazard of hazards) {
      if (hazard.kind !== 'gate') continue;
      const pose = hazardPose(hazard, oldTime);
      if (!pose.active) continue;
      const left = pose.x - 26;
      const right = pose.x + 26;
      const edge = oldX <= left && this.player.x > left ? left :
        oldX >= right && this.player.x < right ? right : null;
      if (edge === null) continue;
      const ratio = (edge - oldX) / (this.player.x - oldX);
      const foot = oldWorldY + (proposedFoot - oldWorldY) * ratio;
      for (let depth = 0; depth <= this.depth; depth++) {
        if (hazard.x < this.branches[depth]!.forkX || !this.isOrdinaryActive(depth, hazard)) continue;
        const floor = heightAt(depth, hazard.x);
        if (foot < floor + 29 && foot + PLAYER_HEIGHT > floor) {
          this.player.x = edge;
          break;
        }
      }
    }
    const ground = this.surfaceAt(this.depth, this.player.x);
    physicalDepth = ground.depth;
    if (this.player.grounded) this.player.y = 0;
    else {
      this.player.y = verticalPosition - ground.height;
      if (this.player.y <= 0) {
        this.player.y = 0; this.player.vy = 0; this.player.grounded = true;
      }
    }
    if (!wasGrounded && this.player.grounded) this.events.push('land');
    const displacement = this.player.x - oldX;
    this.time += displacement / SPEED;
    this.direction = Math.sign(displacement);
    this.maxX = Math.max(this.maxX, this.player.x);
    if (Math.abs(this.player.x - 64) > UNIT) this.tutorial.moved = true;

    for (const hazard of hazards) {
      if (hazard.x < this.branches[physicalDepth]!.forkX || this.isConverted(physicalDepth, hazard.id)) continue;
      if (physicalDepth === this.depth && this.depth > 0) {
        const switchY = hazard.kind === 'shooter' ? 43 : 15;
        const targetY = this.surfaceAt(this.depth, hazard.x).height + switchY;
        if (!this.transition && Math.abs(this.player.x - hazard.x) < 18 && Math.abs(this.playerWorldY + PLAYER_HEIGHT / 2 - targetY) < 18 && this.stage(hazard.id)) {
          this.bursts.push({ x: hazard.x, branchId: this.top.id, age: 0, kind: 'stage' });
        }
      }
    }
    for (const hazard of hazards) {
      const before = hazardPose(hazard, oldTime);
      const after = hazardPose(hazard, this.time);
      if (!(before.active || after.active) || Math.min(before.x, after.x) > Math.max(oldX, this.player.x) + 26 ||
        Math.max(before.x, after.x) < Math.min(oldX, this.player.x) - 26) continue;
      const h = hazard.kind === 'gate' ? 29 : hazard.kind === 'spinner' ? 11 : 17;
      for (let depth = 0; depth <= this.depth; depth++) {
        if (hazard.x < this.branches[depth]!.forkX || !this.isOrdinaryActive(depth, hazard)) continue;
        if (sweptHit(
          oldX - before.x, oldWorldY + PLAYER_HEIGHT / 2 - heightAt(depth, before.x) - before.y - h / 2,
          this.player.x - after.x, this.playerWorldY + PLAYER_HEIGHT / 2 - heightAt(depth, after.x) - after.y - h / 2,
          hazard.kind === 'gate' ? 26 : 22, PLAYER_HEIGHT / 2 + h / 2,
        )) this.hurt();
      }
    }

    // All active layers keep ranged sources. The finite projectile lifetime bounds relevance, not the viewport.
    for (let depth = 0; depth <= this.depth; depth++) {
      const branch = this.branches[depth]!;
      for (const hazard of hazards) {
        if (hazard.kind === 'shooter' && hazard.x >= branch.forkX && !this.isConverted(depth, hazard.id) &&
          Math.abs(heightAt(depth, hazard.x) - this.playerWorldY) <= ATTACK_RANGE) {
          this.ensureShots(hazard, branch, heightAt(depth, hazard.x), oldTime, this.time);
        }
      }
    }
    const worldY = this.playerWorldY;
    for (const shot of this.shotsNear(Math.min(oldX, this.player.x) - PLAYER_WIDTH, Math.max(oldX, this.player.x) + PLAYER_WIDTH, Math.min(oldWorldY, worldY) - 12, Math.max(oldWorldY, worldY) + 30)) {
      const lo = Math.max(Math.min(oldTime, this.time), shot.birth);
      const hi = Math.min(Math.max(oldTime, this.time), shot.birth + SHOT_LIFE);
      if (lo > hi || (oldTime === this.time && !shotPosition(shot, this.time))) continue;
      const startTime = this.direction < 0 ? hi : lo;
      const endTime = this.direction < 0 ? lo : hi;
      const span = this.time - oldTime;
      const startRatio = span === 0 ? 0 : (startTime - oldTime) / span;
      const endRatio = span === 0 ? 1 : (endTime - oldTime) / span;
      const startX = shot.x + shot.vx * (startTime - shot.birth);
      const endX = shot.x + shot.vx * (endTime - shot.birth);
      const startY = shot.y + shot.vy * (startTime - shot.birth);
      const endY = shot.y + shot.vy * (endTime - shot.birth);
      if (sweptHit(
        oldX + (this.player.x - oldX) * startRatio - startX,
        oldWorldY + (worldY - oldWorldY) * startRatio + PLAYER_HEIGHT / 2 - startY,
        oldX + (this.player.x - oldX) * endRatio - endX,
        oldWorldY + (worldY - oldWorldY) * endRatio + PLAYER_HEIGHT / 2 - endY, PLAYER_WIDTH / 2 + 2, PLAYER_HEIGHT / 2 + 2,
      )) this.hurt();
    }
    for (const coin of this.coinsNear(this.player.x - 14, this.player.x + 14)) {
      if (coin.branchId === this.branches[physicalDepth]!.id && Math.abs(this.player.x - coin.x) < 13 &&
        Math.abs(this.playerWorldY + PLAYER_HEIGHT / 2 - this.surfaceAt(physicalDepth, coin.x).height - this.coinY(coin)) < 18 && this.realTime - coin.bornAt > 0.12 && !this.transition) {
        coin.collected = true;
        this.coins.delete(coin.id);
        const key = Math.floor(coin.x / CHUNK);
        const bucket = this.coinBuckets.get(key);
        bucket?.delete(coin);
        if (bucket?.size === 0) this.coinBuckets.delete(key);
        this.branchCoins.get(coin.branchId)?.delete(coin);
        this.coinScore += 25;
        this.tutorial.collected = true;
        this.events.push('coin');
        this.bursts.push({ x: coin.x, branchId: coin.branchId, age: 0, kind: 'coin' });
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      this.bursts[i]!.age += dt;
      if (this.bursts[i]!.age > 0.65) this.bursts.splice(i, 1);
    }
  }
}
