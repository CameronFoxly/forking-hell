import { expect, test } from '@playwright/test';
import { DEFAULTS, FIELDS } from '../src/tuning';
import type { Tuning } from '../src/tuning';

test('CRT is static and disabling it restores the exact native-grid presentation', async ({ page }) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'Test-only deterministic fixture is not distributed.');
  await page.goto('/tests/render-fixture.html');
  await page.waitForFunction(() => Boolean(window.effectProbe));
  const result = await page.evaluate(async () => ({
    off: await window.effectProbe(false), on: await window.effectProbe(true),
    stable: await window.effectProbe(true), restored: await window.effectProbe(false),
  }));
  expect(result.on).not.toBe(result.off);
  expect(result.stable).toBe(result.on);
  expect(result.restored).toBe(result.off);
  const light = await page.evaluate(async ({ off, on }) => {
    const sums = [];
    for (const url of [off, on]) {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) sum += pixels[i]! + pixels[i + 1]! + pixels[i + 2]!;
      sums.push(sum);
    }
    return sums[1]! / sums[0]!;
  }, result);
  expect(light).toBeGreaterThan(.8); expect(light).toBeLessThan(1.2);
});

test('CRT and motion remain independently tunable and pause clears motion', async ({ page }) => {
  await page.goto('/'); await page.locator('#start').click();
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().crtActive)).toBe(true);
  await page.locator('#tuning-toggle').click();
  await page.getByText('CRT monitor optics', { exact: true }).click();
  await page.locator('#tune-crt-enabled').uncheck();
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().crtActive)).toBe(false);
  await page.locator('#tuning-close').click(); await page.locator('#game').focus();
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.forkingHell.diagnostics().motionDraws > 0);
  expect(await page.evaluate(() => window.forkingHell.snapshot().time)).toBe(0);
  await page.keyboard.press('Escape'); await page.keyboard.up('Space');
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().motionDraws)).toBe(0);
  await page.locator('#reduced').check(); await page.keyboard.press('Escape');
  await page.keyboard.press('KeyW');
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().motionDraws)).toBe(0);
});

test('every CRT amount produces distinct low, default and high shader output in gameplay and intro', async ({ page, isMobile }) => {
  test.skip(Boolean(process.env.PREVIEW_URL), 'Test-only deterministic fixture is not distributed.');
  await page.goto('/tests/render-fixture.html');
  await page.waitForFunction(() => Boolean(window.effectProbe));
  const optical = isMobile ? 'opticalMobile' : 'opticalDesktop';
  const cases: [keyof Tuning['crt'], Partial<Tuning['crt']>][] = [
    [optical, { opticalEnabled: 1 }], ['scanlineStrength', { scanlinesEnabled: 1 }],
    ['scanlinePeriod', { scanlinesEnabled: 1, scanlineStrength: .6 }],
    ['glowStrength', { glowEnabled: 1 }], ['glowRadius', { glowEnabled: 1, glowStrength: 1 }],
    ['glowThreshold', { glowEnabled: 1, glowStrength: 1 }],
    ['curvature', { curvatureEnabled: 1 }],
    ['hudStrength', { opticalEnabled: 1, opticalDesktop: 12, opticalMobile: 12, scanlinesEnabled: 1, scanlineStrength: .6 }],
  ];
  for (const started of [true, false]) for (const [key, overrides] of cases) {
    const config = { ...DEFAULTS.crt, opticalEnabled: 0, scanlinesEnabled: 0, glowEnabled: 0, curvatureEnabled: 0, hudStrength: 1, ...overrides };
    const values = [FIELDS.crt[key].min, DEFAULTS.crt[key], FIELDS.crt[key].max];
    const images = [];
    for (const value of values) images.push(await page.evaluate(
      ({ config, key, value, started, mobile }) => window.effectProbe(true, { ...config, [key]: value }, started, mobile),
      { config, key, value, started, mobile: isMobile },
    ));
    expect(new Set(images).size, `${started ? 'gameplay' : 'intro'} ${key}`).toBe(3);
  }
});

test('Tune preserves disabled values and explains live mobile/intro and reduced-effect overrides', async ({ page, isMobile }) => {
  await page.goto('/'); await page.locator('#tuning-toggle').click();
  await page.getByText('CRT monitor optics', { exact: true }).click();
  await page.locator('#tune-crt-opticalDesktop').fill('18'); await page.locator('#tune-crt-opticalDesktop').press('Tab');
  await page.locator('#tune-crt-opticalEnabled').uncheck();
  await expect(page.locator('#tune-crt-opticalDesktop')).toBeDisabled();
  await expect(page.locator('#tune-crt-opticalDesktop')).toHaveValue('18');
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().crtUniforms?.optical)).toBe(0);
  await expect(page.locator('#crt-status')).toContainText('Intro treatment');
  if (isMobile) await expect(page.locator('#crt-status')).toContainText('mobile optical amount');
  await page.locator('#tune-crt-opticalEnabled').check();
  await expect(page.locator('#tune-crt-opticalDesktop')).toBeEnabled();
  await page.locator('#tuning-close').click(); await page.locator('#start').click();
  await page.keyboard.press('Escape'); await page.locator('#reduced').check();
  await page.locator('#tuning-toggle').click();
  await expect(page.locator('#crt-status')).toContainText('Reduced effects caps');
});

test('GPU budget recovery clears only the owned notice', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'One bounded desktop buffer-budget exercise.');
  await page.goto('/');
  await page.setViewportSize({ width: 4700, height: 2800 });
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().crtBudgetBlocked)).toBe(true);
  await expect(page.locator('#notice')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().crtActive)).toBe(true);
  await expect(page.locator('#notice')).toBeHidden();
  await page.setViewportSize({ width: 4700, height: 2800 });
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().crtBudgetBlocked)).toBe(true);
  await page.evaluate(() => { document.getElementById('notice-message')!.textContent = 'Unrelated warning'; });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => page.evaluate(() => window.forkingHell.diagnostics().crtActive)).toBe(true);
  await expect(page.locator('#notice')).toBeVisible();
  await expect(page.locator('#notice-message')).toHaveText('Unrelated warning');
});
