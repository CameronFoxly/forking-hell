import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DEFAULTS } from '../src/tuning';

async function navigate(page: Page, selector: string, key = 'Tab'): Promise<void> {
  for (let n = 0; n < 45; n++) {
    if (await page.locator(selector).evaluate(node => node === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(page.locator(selector)).toBeFocused();
}

async function countedIntro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => {
      document.documentElement.dataset.starts = String(Number(document.documentElement.dataset.starts ?? 0) + 1);
      array[0] = 123; return array;
    } });
  });
  await page.goto('/');
  await expect(page.locator('#start')).toBeEnabled();
}

for (const key of ['ArrowRight', 'Enter', 'Space', 'KeyQ', 'KeyW', 'KeyS']) {
  test(`${key} starts once and is consumed until release`, async ({ page }) => {
    await countedIntro(page);
    await page.keyboard.down(key);
    await page.waitForFunction(() => window.forkingHell.snapshot().started);
    await expect(page.locator('#game')).toBeFocused();
    await page.keyboard.down(key); await page.keyboard.down(key);
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => {
      const state = window.forkingHell.snapshot();
      return { starts: document.documentElement.dataset.starts, x: state.x, y: state.y, depth: state.depth, paused: state.paused, scroll: [scrollX, scrollY] };
    })).toEqual({ starts: '1', x: 64, y: 0, depth: 0, paused: false, scroll: [0, 0] });
    expect(await page.locator('.pressed').count()).toBe(0);
    await page.keyboard.up(key);
    if (key === 'ArrowRight') {
      await page.keyboard.down(key); await page.waitForFunction(() => window.forkingHell.snapshot().x > 64); await page.keyboard.up(key);
    } else if (key === 'Space') {
      await page.keyboard.down(key); await page.waitForFunction(() => window.forkingHell.snapshot().y > 0); await page.keyboard.up(key);
    }
  });
}

test('modified Space never starts when the modifier is released first', async ({ page }) => {
  await countedIntro(page);
  await page.keyboard.down('Control'); await page.keyboard.down('Space');
  await page.keyboard.up('Control'); await page.keyboard.down('Space'); await page.keyboard.up('Space');
  expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(false);
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(true);
});

test('intro navigation, shortcuts, composition and Tune editing never start behind a menu', async ({ page }) => {
  test.setTimeout(60000);
  await countedIntro(page);
  for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'F8', 'Control+Enter', 'Control+ArrowRight', 'Alt+ArrowRight']) {
    await page.keyboard.press(key);
    expect(await page.evaluate(() => window.forkingHell.snapshot().started), key).toBe(false);
  }
  expect(await page.evaluate(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'q', code: 'KeyQ', isComposing: true, bubbles: true, cancelable: true,
  })))).toBe(true);
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(false);
  await navigate(page, '#tuning-toggle', 'ArrowUp'); await page.keyboard.press('Enter');
  for (const section of ['jumpBurst', 'doubleJumpBurst', 'jumpTrail']) {
    await navigate(page, `#tuning-sections details:has(#tune-${section}-${section === 'jumpTrail' ? 'rate' : 'count'}) summary`, 'ArrowDown');
    await page.keyboard.press('Space'); await page.keyboard.press('Tab');
    const field = page.locator(`#tune-${section}-${section === 'jumpTrail' ? 'rate' : 'count'}`);
    await expect(field).toBeFocused();
    await page.keyboard.press('Control+A'); await page.keyboard.type('12'); await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(false);
    await navigate(page, `#tuning-sections details:has(#tune-${section}-${section === 'jumpTrail' ? 'rate' : 'count'}) summary`, 'Shift+Tab');
  }
  await navigate(page, '#tuning-export', 'ArrowUp');
  const downloading = page.waitForEvent('download'); await page.keyboard.press('Space');
  expect((await downloading).suggestedFilename()).toBe('forking-hell-tuning-v3.json');
  await navigate(page, '#tuning-reset', 'ArrowDown'); await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.forkingHell.diagnostics().tuning.values)).toEqual(DEFAULTS);
  await page.keyboard.press('Escape');
  await expect(page.locator('#tuning-toggle')).toBeFocused();
  await page.keyboard.press('KeyQ');
  expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(false);
  await navigate(page, '#start'); await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(true);
});

test('keys during loading are not queued and the clickable start action remains available', async ({ page }) => {
  let release!: () => void;
  const loading = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/octocat.png', async route => { await loading; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#start')).toBeDisabled();
  await page.keyboard.down('ArrowRight'); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  release();
  await expect(page.locator('#start')).toBeEnabled();
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(false);
  await page.keyboard.up('ArrowRight');
  await page.locator('#start').click();
  expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(true);
  expect(await page.evaluate(() => window.forkingHell.snapshot().x)).toBe(64);
});

test('size recovery and notices keep keyboard focus, preserve start gating and restore the intro', async ({ page }) => {
  await page.addInitScript(() => { Element.prototype.requestFullscreen = async () => { throw new Error('Denied for recovery test'); }; });
  await page.setViewportSize({ width: 120, height: 320 });
  await page.goto('/');
  await expect(page.locator('#size-fullscreen')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('KeyQ');
  expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(false);
  await page.keyboard.press('Enter');
  await expect(page.locator('#notice')).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.locator('#dismiss-notice')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#size-fullscreen')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('#dismiss-notice')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#notice')).toBeHidden();
  await expect(page.locator('#size-fullscreen')).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('#start')).toBeFocused();
  expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(false);
});

test('artwork errors focus and contain Reload, and keyboard recovery does not auto-start', async ({ page }) => {
  let recovered = false;
  await page.route('**/assets/octocat.png', route => recovered ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.locator('#reload')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#reload')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('#reload')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('KeyQ');
  await expect(page.locator('#start')).toBeDisabled();
  recovered = true;
  await Promise.all([page.waitForEvent('domcontentloaded'), page.keyboard.press('Enter')]);
  await expect(page.locator('#start')).toBeEnabled();
  expect(await page.evaluate(() => window.forkingHell.snapshot().started)).toBe(false);
});

test('game-over controls are keyboard-contained and held activation cannot restart twice', async ({ page }) => {
  await countedIntro(page); await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const stopAtContact = (): void => {
      if (window.forkingHell.snapshot().health < 3) window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
      else requestAnimationFrame(stopAtContact);
    };
    requestAnimationFrame(stopAtContact);
  });
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => window.forkingHell.snapshot().gameOver, undefined, { timeout: 12000 });
  await page.keyboard.up('KeyD');
  await expect(page.locator('#again')).toBeFocused();
  for (const key of ['Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown', 'Escape']) {
    await page.keyboard.press(key); await expect(page.locator('#again')).toBeFocused();
  }
  expect(await page.locator('#again').evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid');
  await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await expect(page.locator('#game')).toBeFocused();
  expect(await page.evaluate(() => ({ starts: document.documentElement.dataset.starts, state: window.forkingHell.snapshot() })))
    .toMatchObject({ starts: '2', state: { gameOver: false, x: 64, health: 3, score: 0 } });
});

test('keyboard-only menus preserve native editing and restore clean gameplay input', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toBeFocused();
  await page.keyboard.down('KeyD');
  await expect(page.locator('[data-keycap="right"]')).toHaveClass(/pressed/);
  await page.keyboard.press('Escape');
  await page.keyboard.up('KeyD');
  await expect(page.locator('#resume')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#music')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#music')).toBeChecked();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#sound')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#sound')).not.toBeChecked();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#restart')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#reduced')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#game')).toBeFocused();
  expect(await page.locator('.pressed').count()).toBe(0);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  // Fullscreen is hidden in the narrow touch layout; seek Tune with native Tab order.
  for (let i = 0; i < 3 && !await page.locator('#tuning-toggle').evaluate(e => e === document.activeElement); i++) await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#tuning-toggle')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tuning-sections summary').first()).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.locator('#tune-character-speed')).toBeFocused();
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.forkingHell.diagnostics().tuning.values.character.speed)).toBe(DEFAULTS.character.speed + 1);
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.forkingHell.diagnostics().tuning.values.character.speed)).toBe(DEFAULTS.character.speed + 2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#tuning-toggle')).toBeFocused();
  await expect(page.locator('#tuning-panel')).toBeHidden();
  await page.keyboard.press('Tab');
  if (await page.locator('#fullscreen').evaluate(e => e === document.activeElement)) await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('#game')).toBeFocused();
  const before = await page.evaluate(() => window.forkingHell.snapshot());
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => window.forkingHell.snapshot().x)).toBe(before.x);
  await page.keyboard.press('Escape'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.forkingHell.snapshot().score)).toBe(0);
});
