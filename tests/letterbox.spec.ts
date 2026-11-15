import { expect, test } from '@playwright/test';

test('outer page, gutters and Tune are opaque black without changing canvas ink or layout', async ({ page }, info) => {
  const sizes = info.project.name === 'touch'
    ? [{ width: 390, height: 844 }, { width: 844, height: 390 }]
    : [{ width: 1280, height: 800 }, { width: 1920, height: 810 }];
  for (const size of sizes) {
    await page.setViewportSize(size); await page.goto('/');
    await expect(page.locator('#start')).toBeEnabled();
    for (const tune of [false, true]) {
      if (tune) await page.locator('#tuning-toggle').click();
      const bounds = await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas')!;
        const rect = canvas.getBoundingClientRect(), game = document.querySelector('#game')!.getBoundingClientRect();
        const points = [[1, 1], [1, innerHeight - 1]];
        if (rect.left - game.left > 2) points.push([(rect.left + game.left) / 2, rect.top + rect.height / 2]);
        if (game.right - rect.right > 2) points.push([(rect.right + game.right) / 2, rect.top + rect.height / 2]);
        if (rect.top - game.top > 2) points.push([rect.left + rect.width / 2, (rect.top + game.top) / 2]);
        if (game.bottom - rect.bottom > 2) points.push([rect.left + rect.width / 2, (rect.bottom + game.bottom) / 2]);
        const panel = document.querySelector<HTMLElement>('#tuning-panel')!;
        if (!panel.hidden) {
          const panelRect = panel.getBoundingClientRect();
          for (let n = points.length - 1; n >= 0; n--) {
            const [x, y] = points[n]!;
            if (x! >= panelRect.left && x! < panelRect.right && y! >= panelRect.top && y! < panelRect.bottom) points.splice(n, 1);
          }
          points.push([panelRect.left + 10, panelRect.top + 10]);
        }
        return { points, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, backing: [canvas.width, canvas.height] };
      });
      expect(bounds.rect.width / bounds.rect.height).toBeCloseTo(16 / 9);
      expect(bounds.backing[0]! / bounds.backing[1]!).toBeCloseTo(16 / 9);
      const screenshot = (await page.screenshot()).toString('base64');
      const pixels = await page.evaluate(async ({ screenshot, bounds }) => {
        const image = new Image(); image.src = `data:image/png;base64,${screenshot}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        const scale = image.width / innerWidth;
        const colors = bounds.points.map(([x, y]) => [...context.getImageData(Math.floor(x! * scale), Math.floor(y! * scale), 1, 1).data]);
        const r = bounds.rect, ink = context.getImageData(Math.ceil(r.x * scale), Math.ceil(r.y * scale), Math.floor(r.width * scale), Math.floor(r.height * scale)).data;
        let count = 0;
        for (let n = 0; n < ink.length; n += 4) if (ink[n] === 8 && ink[n + 1] === 6 && ink[n + 2] === 15 && ink[n + 3] === 255) count++;
        return { colors, ink: count };
      }, { screenshot, bounds });
      expect(pixels.colors).toEqual(bounds.points.map(() => [0, 0, 0, 255]));
      expect(pixels.ink).toBeGreaterThan(100);
    }
  }
});
