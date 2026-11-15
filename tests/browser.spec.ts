import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.forkingHell?.diagnostics().shaderPasses > 2);
  await page.locator('#start').click();
}
const snapshot = (page: Page) => page.evaluate(() => window.forkingHell.snapshot());

test('the common shader produces only palette pixels on a physical integer lattice', async ({ page }) => {
  await start(page);
  await page.locator('#tuning-toggle').click();
  await page.getByText('CRT monitor optics', { exact: true }).click();
  await page.locator('#tune-crt-enabled').uncheck();
  await page.getByText('Object motion aberration', { exact: true }).first().click();
  await page.locator('#tune-motion-enabled').uncheck();
  await page.locator('#tuning-close').click();
  await page.waitForTimeout(100);
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) throw new Error('No WebGL context');
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4) colors.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    const rect = canvas.getBoundingClientRect();
    return { colors: [...colors], width: canvas.width, height: canvas.height, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, dpr: devicePixelRatio };
  });
  const palette = [0x08060f, 0x221943, 0x352558, 0x6951a6, 0xa17be3, 0xd5b0ff, 0x75f6ec, 0xf5ecff, 0xffd394, 0xff799d];
  expect(pixels.colors.length).toBeGreaterThan(5);
  expect(pixels.colors.filter(c => !palette.includes(c))).toEqual([]);
  expect(pixels.width).toBeCloseTo(pixels.rect.width * pixels.dpr, 4);
  expect(pixels.height).toBeCloseTo(pixels.rect.height * pixels.dpr, 4);
  expect(pixels.rect.width * pixels.dpr / 480).toBeCloseTo(Math.round(pixels.rect.width * pixels.dpr / 480), 5);
  expect(pixels.rect.x * pixels.dpr).toBeCloseTo(Math.round(pixels.rect.x * pixels.dpr), 4);
  expect(pixels.rect.y * pixels.dpr).toBeCloseTo(Math.round(pixels.rect.y * pixels.dpr), 4);
});

test('keyboard movement controls environmental time but not jump gravity', async ({ page }) => {
  await start(page);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyD');
  const forward = await snapshot(page);
  await page.waitForTimeout(100);
  expect((await snapshot(page)).time).toBeCloseTo(forward.time, 4);
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  expect((await snapshot(page)).y).toBeGreaterThan(0);
  expect((await snapshot(page)).time).toBeCloseTo(forward.time, 4);
  await page.keyboard.down('KeyA'); await page.waitForTimeout(150); await page.keyboard.up('KeyA');
  expect((await snapshot(page)).time).toBeLessThan(forward.time);
  await page.waitForTimeout(650);
  expect((await snapshot(page)).y).toBe(0);
});

test('pause clears input, freezes both clocks and resumes without held movement', async ({ page }) => {
  await start(page);
  await page.keyboard.down('KeyD'); await page.keyboard.down('Space');
  await page.waitForTimeout(100); await page.keyboard.press('Escape');
  const frozen = await snapshot(page);
  await page.waitForTimeout(180);
  expect(await snapshot(page)).toEqual(frozen);
  await page.keyboard.press('Escape');
  expect((await snapshot(page)).paused).toBe(false);
  await page.waitForTimeout(100);
  expect((await snapshot(page)).x).toBe(frozen.x);
  await page.keyboard.up('KeyD'); await page.keyboard.up('Space');
});

test('three native simultaneous touches move, jump, fork and cancel cleanly', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'touch', 'Native multi-touch injection uses Chromium CDP.');
  await start(page);
  const client = await context.newCDPSession(page);
  const touchPoints = [];
  for (const [id, control] of ['right', 'jump', 'branch'].entries()) {
    const rect = await page.locator(`[data-control="${control}"]`).boundingBox();
    if (!rect) throw new Error('Touch target missing');
    expect(rect.width).toBeGreaterThanOrEqual(44);
    touchPoints.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
  await page.waitForTimeout(180);
  const active = await snapshot(page);
  expect(active.x).toBeGreaterThan(64);
  expect(active.y).toBeGreaterThan(0);
  expect(active.depth).toBe(1);
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(60);
  const stopped = await snapshot(page);
  await page.waitForTimeout(150);
  expect((await snapshot(page)).x).toBe(stopped.x);
  expect((await snapshot(page)).depth).toBe(1);
});

test('nested staging merges one level, awards each copy and survives restart without extra canvases', async ({ page }) => {
  await start(page);
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 1 && !window.forkingHell.snapshot().transition);
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 2 && !window.forkingHell.snapshot().transition);
  expect((await snapshot(page)).depth).toBe(2);
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => window.forkingHell.snapshot().staged.includes('0:0'));
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyS');
  await page.waitForFunction(() => window.forkingHell.snapshot().depth === 1 && !window.forkingHell.snapshot().transition);
  expect((await snapshot(page)).depth).toBe(1);
  expect((await snapshot(page)).converted).toBe(1);
  expect((await snapshot(page)).staged).toContain('0:0');
  await page.keyboard.press('KeyS'); await page.waitForTimeout(600);
  expect((await snapshot(page)).depth).toBe(0);
  expect((await snapshot(page)).converted).toBe(2);
  expect((await snapshot(page)).coins).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.locator('#restart').click();
  expect((await snapshot(page)).score).toBe(0);
  expect((await snapshot(page)).depth).toBe(0);
  expect(await page.locator('canvas').count()).toBe(1);
});

test('native source pixels share the camera scale through branching and restart', async ({ page }) => {
  await start(page);
  const initial = await page.evaluate(() => window.forkingHell.diagnostics().zoom);
  for (let depth = 1; depth <= 3; depth++) {
    await page.keyboard.press('KeyW');
    await page.waitForFunction(d => window.forkingHell.snapshot().depth === d && !window.forkingHell.snapshot().transition, depth);
    const data = await page.evaluate(() => window.forkingHell.diagnostics());
    expect(data.zoom).toBeLessThan(initial);
    expect(data.worldPixelScales.length).toBeGreaterThan(1);
    expect(data.worldPixelScales.every(scale => scale === 1)).toBe(true);
    expect(data.worldPixelPitch).toBe(data.zoom * data.physicalPixelScale);
    expect(data.filterResolution).toEqual(data.worldTarget);
  }
  await page.keyboard.press('Escape'); await page.locator('#restart').click();
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().zoom)).toBe(initial);
});

test('a too-small window pauses rather than cropping the playable composition', async ({ page }) => {
  await start(page);
  await page.setViewportSize({ width: 120, height: 320 });
  await expect(page.locator('#size-warning')).toBeVisible();
  expect((await snapshot(page)).paused).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('#size-warning')).toBeHidden();
  expect((await snapshot(page)).paused).toBe(true);
});

test('game over saves the score and a new run clears gameplay resources', async ({ page }) => {
  await start(page);
  // Release in the game frame, not after a cross-process wait that can overshoot the hazard.
  await page.evaluate(() => {
    const releaseAtContact = (): void => {
      if (window.forkingHell.snapshot().x >= 232) window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
      else requestAnimationFrame(releaseAtContact);
    };
    requestAnimationFrame(releaseAtContact);
  });
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => window.forkingHell.snapshot().x >= 232);
  await page.keyboard.up('KeyD');
  await page.waitForFunction(() => window.forkingHell.snapshot().gameOver, undefined, { timeout: 7000 });
  await expect(page.locator('#score-breakdown')).toContainText('destruction');
  expect((await snapshot(page)).health).toBe(0);
  await page.locator('#again').click();
  expect((await snapshot(page)).health).toBe(3);
  expect((await snapshot(page)).score).toBe(0);
  expect(await page.locator('canvas').count()).toBe(1);
});

test('missing WebGL and denied fullscreen produce explicit explanations', async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => { throw new Error('Denied'); };
  });
  await start(page);
  await page.locator('#fullscreen').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('#notice')).toContainText('Fullscreen is unavailable');
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...options: unknown[]) {
        if (type.startsWith('webgl')) return null;
        return Reflect.apply(original, this, [type, ...options]);
      },
    });
  });
  await page.reload();
  await expect(page.locator('#error')).toContainText('WebGL is unavailable');
  await expect(page.locator('#start')).toBeDisabled();
});

test('settings survive reload and focus loss pauses without resuming automatically', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Escape');
  await page.locator('#sound').uncheck();
  await page.locator('#music').check();
  await page.locator('#reduced').check();
  await page.reload();
  await page.locator('#start').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await snapshot(page)).paused).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await snapshot(page)).paused).toBe(true);
  await expect(page.locator('#sound')).not.toBeChecked();
  await expect(page.locator('#music')).toBeChecked();
  await expect(page.locator('#reduced')).toBeChecked();
});

test('blocked local storage reports the limitation but still starts', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('Storage blocked for test'); } });
  });
  await start(page);
  await expect(page.locator('#notice')).toBeVisible();
  expect((await snapshot(page)).started).toBe(true);
});
