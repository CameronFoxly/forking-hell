import { expect, test } from '@playwright/test';
import { DEFAULTS, tuningDocument } from '../src/tuning';

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
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array[0] = 123; return array; } });
  });
  await page.goto('/'); await page.locator('#tuning-toggle').click();
  const config = structuredClone(DEFAULTS);
  // Keep firing-event crossings aligned with this reproduction's scripted positions.
  config.character.speed = 90;
  config.enemies.firingRate = 1; config.enemies.shotSpeed = 86;
  config.branches.liftDuration = .8; config.branches.collapseDuration = .2;
  await page.locator('#tuning-file').setInputFiles({ name: 'projectiles.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tuningDocument(config))) });
  await page.locator('#tuning-apply').click(); await page.locator('#tuning-close').click(); await page.locator('#game').focus();
  for (let n = 0; n < 2; n++) {
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.forkingHell.snapshot().transition === null);
  }
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => window.forkingHell.snapshot().x >= 445);
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 3);
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => window.forkingHell.snapshot().x >= 500);
  await page.keyboard.up('KeyD');
  const emitted = await page.evaluate(() => window.forkingHell.projectiles());
  expect(emitted.shots.filter(shot => shot.sourceId === '1:0')).toHaveLength(3);
  expect(emitted.sources.filter(source => source.sourceId === '1:0' && source.active)).toHaveLength(3);
  await page.keyboard.down('KeyA'); await page.waitForFunction(() => window.forkingHell.snapshot().x <= 445); await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD'); await page.waitForFunction(() => window.forkingHell.snapshot().x >= 500); await page.keyboard.up('KeyD');
  const replay = await page.evaluate(() => window.forkingHell.projectiles());
  for (const shot of replay.shots.filter(shot => shot.sourceId === '1:0')) {
    const source = replay.sources.find(source => source.id === `${shot.branchId}/${shot.sourceId}`)!;
    expect(shot.y).toBeCloseTo(source.muzzle.y);
  }
  await page.keyboard.down('KeyD'); await page.waitForFunction(() => window.forkingHell.snapshot().x >= 550);
  await page.waitForFunction(() => window.forkingHell.snapshot().staged.includes('1:0'));
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyS');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 2 && window.forkingHell.snapshot().transition === null);
  const converted = await page.evaluate(() => window.forkingHell.projectiles().sources.find(source => source.sourceId === '1:0' && source.converted)!.branchId);
  await page.keyboard.down('KeyA'); await page.waitForFunction(() => window.forkingHell.snapshot().x <= 445); await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD'); await page.waitForFunction(() => window.forkingHell.snapshot().x >= 500); await page.keyboard.up('KeyD');
  const final = await page.evaluate(() => ({ snapshot: window.forkingHell.snapshot(), ...window.forkingHell.projectiles() }));
  expect(final.snapshot.gameOver).toBe(false);
  expect(final.shots.some(shot => shot.branchId === converted && shot.sourceId === '1:0')).toBe(false);
  expect(final.shots.some(shot => shot.branchId === 0 && shot.sourceId === '1:0')).toBe(true);
});
