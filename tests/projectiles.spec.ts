import { expect, test } from '@playwright/test';
import { DEFAULTS, tuningDocument } from '../src/tuning';
import { firstShooter, SHOOTER_SEED } from './encounter-fixtures';

test('nested moving shooters render flight from the exact fractional muzzle, not a target lane', async ({ page }) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'Test-only deterministic renderer fixture is not distributed.');
  await page.goto('/tests/render-fixture.html'); await page.waitForFunction(() => Boolean(window.muzzleProbe));
  for (const kind of ['branch', 'merge'] as const) {
    const colors = await page.evaluate(async kind => {
      const probe = await window.muzzleProbe(kind);
      const image = new Image(); image.src = probe.image; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return probe.points.map(point => [...context.getImageData(Math.round(point.x) - probe.left, probe.top - Math.round(point.y), 1, 1).data]);
    }, kind);
    expect(colors.length).toBe(kind === 'branch' ? 3 : 2);
    for (const color of colors) expect(color).toEqual([255, 211, 148, 255]);
  }
});

test('keyboard-driven nested lift, rewind, merge and recross never emit from a converted source', async ({ page }) => {
  test.setTimeout(45000);
  await page.addInitScript(seed => {
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array[0] = seed; return array; } });
  }, SHOOTER_SEED);
  await page.goto('/'); await page.locator('#tuning-toggle').click();
  const config = structuredClone(DEFAULTS);
  config.character.speed = 90;
  config.enemies.firingRate = 1; config.enemies.shotSpeed = 86;
  config.branches.liftDuration = .8; config.branches.collapseDuration = .2;
  const shooter = firstShooter(SHOOTER_SEED, config.enemies);
  const event = Math.ceil(((shooter.x - 190 - 64) / config.character.speed - shooter.phase) / shooter.period);
  const eventX = 64 + config.character.speed * (shooter.phase + event * shooter.period);
  const before = eventX - 20, after = eventX + 20;
  await page.locator('#tuning-file').setInputFiles({ name: 'projectiles.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tuningDocument(config))) });
  await page.locator('#tuning-apply').click(); await page.locator('#tuning-close').click(); await page.locator('#game').focus();
  for (let n = 0; n < 2; n++) {
    await page.keyboard.press('KeyW');
    await page.waitForFunction(depth => window.forkingHell.snapshot().depth === depth && window.forkingHell.snapshot().transition === null, n + 1);
  }
  await page.keyboard.down('KeyD');
  await page.waitForFunction(x => window.forkingHell.snapshot().x >= x, before);
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 3);
  await page.keyboard.down('KeyD');
  await page.waitForFunction(x => window.forkingHell.snapshot().x >= x, after);
  await page.keyboard.up('KeyD');
  const emitted = await page.evaluate(() => window.forkingHell.projectiles());
  expect(emitted.shots.filter(shot => shot.sourceId === shooter.id)).toHaveLength(3);
  expect(emitted.sources.filter(source => source.sourceId === shooter.id && source.active)).toHaveLength(3);
  await page.keyboard.down('KeyA'); await page.waitForFunction(x => window.forkingHell.snapshot().x <= x, before); await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD'); await page.waitForFunction(x => window.forkingHell.snapshot().x >= x, after); await page.keyboard.up('KeyD');
  const replay = await page.evaluate(() => window.forkingHell.projectiles());
  for (const shot of replay.shots.filter(shot => shot.sourceId === shooter.id)) {
    const source = replay.sources.find(source => source.id === `${shot.branchId}/${shot.sourceId}`)!;
    expect(shot.y).toBeCloseTo(source.muzzle.y);
  }
  await page.keyboard.down('KeyD'); await page.waitForFunction(x => window.forkingHell.snapshot().x >= x - 10, shooter.x);
  await page.waitForFunction(id => window.forkingHell.snapshot().staged.includes(id), shooter.id);
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyS');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 2 && window.forkingHell.snapshot().transition === null);
  const converted = await page.evaluate(id => window.forkingHell.projectiles().sources.find(source => source.sourceId === id && source.converted)!.branchId, shooter.id);
  await page.keyboard.down('KeyA'); await page.waitForFunction(x => window.forkingHell.snapshot().x <= x, before); await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD'); await page.waitForFunction(x => window.forkingHell.snapshot().x >= x, after); await page.keyboard.up('KeyD');
  const final = await page.evaluate(() => ({ snapshot: window.forkingHell.snapshot(), ...window.forkingHell.projectiles() }));
  expect(final.snapshot.gameOver).toBe(false);
  expect(final.shots.some(shot => shot.branchId === converted && shot.sourceId === shooter.id)).toBe(false);
  expect(final.shots.some(shot => shot.branchId === 0 && shot.sourceId === shooter.id)).toBe(true);
});
