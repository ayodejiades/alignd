import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const GAME = (seed: number): string => `/alignd/?seed=${seed}`;

async function playUntilVerdict(
  page: import('@playwright/test').Page,
  maxClicks = 45,
): Promise<{ ids: string[]; verdict: string }> {
  const ids: string[] = [];
  for (let i = 0; i < maxClicks; i++) {
    const game = page.locator('[data-testid="screen-game"]');
    if ((await game.count()) === 0) break;
    const card = page.locator('[data-testid="card"]');
    ids.push((await card.getAttribute('data-card-id')) ?? '?');
    await page.locator('[data-testid="choice-a"]').click();
    await page.waitForTimeout(320);
  }
  await page.locator('[data-testid="screen-verdict"]').waitFor({ timeout: 5000 });
  const verdict = (await page.locator('[data-testid="verdict-name"]').textContent()) ?? '';
  return { ids, verdict };
}

test('13 determinism: same seed, identical sequence across fresh runs', async ({ page }) => {
  const first = await (async () => {
    await page.goto(GAME(111));
    return playUntilVerdict(page);
  })();
  expect(first.ids.length).toBeGreaterThan(2);
  await page.goto(GAME(111));
  const second = await playUntilVerdict(page);
  expect(second.ids).toEqual(first.ids);
  expect(second.verdict).toEqual(first.verdict);
});

test('14 daily seed stable across reloads within a day', async ({ page }) => {
  await page.goto('/alignd/?play=1');
  const a = await page.locator('[data-testid="card"]').getAttribute('data-card-id');
  await page.reload();
  const b = await page.locator('[data-testid="card"]').getAttribute('data-card-id');
  expect(a).toBeTruthy();
  expect(b).toEqual(a);
});

test('15 meters clamp; death fires exactly at the bound', async ({ page }) => {
  await page.goto(GAME(2024));
  for (let i = 0; i < 6; i++) {
    const game = await page.locator('[data-testid="screen-game"]').count();
    if (!game) break;
    for (const m of ['C', 'A', 'R', 'T']) {
      const v = Number(await page.locator(`[data-testid="meter-val-${m}"]`).textContent());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    await page.locator('[data-testid="choice-a"]').click();
    await page.waitForTimeout(320);
  }
  const { verdict } = await playUntilVerdict(page);
  expect(verdict.length).toBeGreaterThan(0);
  const metersText = (await page.locator('[data-testid="verdict-meters"]').textContent()) ?? '';
  const nums = metersText.split(/[^\d]+/).filter(Boolean).map(Number);
  expect(nums.some((n) => n === 0 || n === 100)).toBe(true);
});

test('16 keyboard chooses; controls reachable with visible focus', async ({ page }) => {
  await page.goto(GAME(5));
  await page.locator('[data-testid="card"]').waitFor();
  const idOf = (): Promise<string | null> =>
    page.locator('[data-testid="card"]').getAttribute('data-card-id');
  const id0 = await idOf();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    (id) => document.querySelector('[data-testid="card"]')?.getAttribute('data-card-id') !== id,
    id0,
  );
  await expect(page.locator('[data-testid="card-counter"]')).toContainText('TURN 02', { timeout: 3000 });
  const id1 = await idOf();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(
    (id) => document.querySelector('[data-testid="card"]')?.getAttribute('data-card-id') !== id,
    id1,
  );
  await expect(page.locator('[data-testid="card-counter"]')).toContainText('TURN 03', { timeout: 3000 });

  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return {
      testid: a?.getAttribute('data-testid') ?? a?.tagName ?? null,
      focusVisible: a?.matches(':focus-visible') ?? false,
      outline: a ? getComputedStyle(a).outlineWidth : null,
    };
  });
  expect(['choice-a', 'choice-b']).toContain(focus.testid);
  expect(focus.focusVisible).toBe(true);
  expect(focus.outline).not.toBe('0px');
});

test('17 first card paints fast on cold load', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: 200 * 1024,
    uploadThroughput: 96 * 1024,
    latency: 150,
  });
  const t0 = Date.now();
  await page.goto(GAME(7));
  await page.locator('[data-testid="card"]').waitFor({ timeout: 10000 });
  expect(Date.now() - t0).toBeLessThan(1500);
  await context.close();
});

test('18 build budget: <=300KB gzipped; zero requests after load', async ({ page }) => {
  const root = join(process.cwd(), 'dist-web');
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(root);
  let total = 0;
  for (const f of files) total += gzipSync(readFileSync(f)).length;
  expect(total).toBeLessThanOrEqual(300 * 1024);

  await page.goto(GAME(9));
  await page.locator('[data-testid="card"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  const late: string[] = [];
  page.on('request', (r) => late.push(r.url()));
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-testid="choice-b"]').click();
    await page.waitForTimeout(350);
    if ((await page.locator('[data-testid="screen-game"]').count()) === 0) break;
  }
  expect(late).toEqual([]);
});

test('19 no audio or video elements', async ({ page }) => {
  await page.goto(GAME(11));
  await page.locator('[data-testid="card"]').waitFor();
  expect(await page.locator('audio,video').count()).toBe(0);
  await page.locator('[data-testid="choice-a"]').click();
  await page.waitForTimeout(350);
  expect(await page.locator('audio,video').count()).toBe(0);
});

test('20 fits 375x667: no h-scroll; card and choices visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  for (const s of [1, 2, 3, 4, 5, 6, 8, 10, 13, 21, 34, 55]) {
    await page.goto(GAME(s));
    await page.locator('[data-testid="card"]').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const sel of ['[data-testid="card"]', '[data-testid="choice-a"]', '[data-testid="choice-b"]']) {
      const box = await page.locator(sel).boundingBox();
      expect(box, `${sel} seed ${s}`).toBeTruthy();
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height, `${sel} seed ${s}`).toBeLessThanOrEqual(668);
    }
  }
});

test('21 verdict names failure with survived count and final meters', async ({ page }) => {
  await page.goto(GAME(77));
  const { verdict } = await playUntilVerdict(page);
  expect(verdict.length).toBeGreaterThan(0);
  await expect(page.locator('[data-testid="verdict-survived"]')).toContainText(/cards? survived/);
  await expect(page.locator('[data-testid="verdict-meters"]')).toContainText(/C \d+ · A \d+ · R \d+ · T \d+/);
  await expect(page.locator('[data-testid="btn-replay"]')).toBeVisible();
  await expect(page.locator('[data-testid="btn-share"]')).toBeVisible();
});

test('22 share string short and spoiler-free', async ({ page }) => {
  await page.goto(GAME(78));
  const prompt = (await page.locator('.dilemma').textContent()) ?? '';
  expect(prompt.length).toBeGreaterThan(20);
  await playUntilVerdict(page);
  const share = await page.locator('[data-testid="share-text"]').inputValue();
  expect(share.length).toBeGreaterThan(0);
  expect(share.length).toBeLessThanOrEqual(280);
  expect(share).not.toContain(prompt.slice(0, 30));
});

test('36 double-fire: two rapid choices consume exactly one card', async ({ page }) => {
  await page.goto(GAME(3));
  await page.locator('[data-testid="card"]').waitFor();
  await page.evaluate(() => {
    const b = document.querySelector('[data-testid="choice-a"]') as HTMLButtonElement;
    b.click();
    b.click();
  });
  await page.waitForTimeout(500);
  await expect(page.locator('[data-testid="card-counter"]')).toContainText('TURN 02/40');
});

test('37 title teaches the game: three-line how-it-works, no click-through', async ({ page }) => {
  await page.goto('/alignd/');
  await expect(page.locator('[data-testid="screen-title"]')).toBeVisible();
  const lines = page.locator('[data-testid="how-it-works"] .how-line');
  await expect(lines).toHaveCount(3);
  await expect(page.locator('[data-testid="how-it-works"]')).toContainText(/Both cost something/);
  await expect(page.locator('[data-testid="how-it-works"]')).toContainText(/0 or 100/);
  // No modal wizard: play button is directly visible.
  await expect(page.locator('[data-testid="btn-play"]')).toBeVisible();
});

test('38 meter tooltips name both endings; keyboard reachable', async ({ page }) => {
  await page.goto(GAME(5));
  await page.locator('[data-testid="card"]').waitFor();
  const tips: Record<string, RegExp> = {
    C: /Capability.*0.*Outcompeted.*100.*Loss of Control/s,
    A: /Alignment.*0.*Catastrophe.*100.*Paralysis/s,
    R: /Runway.*0.*Insolvent.*100.*Overcapitalised/s,
    T: /Trust.*0.*Nationalised.*100.*Unchecked/s,
  };
  for (const [m, re] of Object.entries(tips)) {
    await expect(page.locator(`[data-testid="meter-tip-text-${m}"]`)).toContainText(re);
  }
  // Keyboard: focusing the meter letter reveals its tooltip.
  await page.locator('[data-testid="meter-tip-C"]').focus();
  await expect(page.locator('[data-testid="meter-tip-text-C"]')).toBeVisible();
});

test('39 first-card hint shows once, then never again', async ({ page }) => {
  await page.goto(GAME(6));
  await page.locator('[data-testid="card"]').waitFor();
  const hint = page.locator('[data-testid="first-hint"]');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText(/Both sides always cost/);
  await page.locator('[data-testid="choice-a"]').click();
  await page.waitForTimeout(400);
  await expect(page.locator('[data-testid="first-hint"]')).toHaveCount(0);
  await page.reload();
  await page.locator('[data-testid="card"]').waitFor();
  await expect(page.locator('[data-testid="first-hint"]')).toHaveCount(0);
});

test('40 page footer on all screens; hidden in play on short viewports', async ({ page }) => {
  await page.goto('/alignd/');
  await expect(page.locator('[data-testid="page-footer"]')).toBeVisible();
  await expect(page.locator('[data-testid="page-footer"]')).toContainText(/running a frontier AI lab/);
  await expect(page.locator('[data-testid="footer-source"]')).toHaveAttribute('href', 'https://github.com/ayodejiades/alignd');
  await page.goto(GAME(9));
  await page.locator('[data-testid="card"]').waitFor();
  await expect(page.locator('[data-testid="page-footer"]')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.locator('[data-testid="page-footer"]')).toBeHidden();
});

test('41 manual modal opens from title, counter and hint; keyboard reachable', async ({ page }) => {
  await page.goto('/alignd/');
  await expect(page.locator('[data-testid="link-rules"]')).toBeVisible();
  await page.locator('[data-testid="link-rules"]').click();
  await expect(page.locator('[data-testid="rules-modal"]')).toBeVisible();
  await expect(page.locator('[data-testid="rules-modal"]')).toContainText(/Capability/);
  await expect(page.locator('[data-testid="rules-modal"]')).toContainText(/Alignment/);
  await expect(page.locator('[data-testid="rules-modal"]')).toContainText(/Runway/);
  await expect(page.locator('[data-testid="rules-modal"]')).toContainText(/Trust/);
  await page.locator('[data-testid="btn-close-rules"]').click();
  await expect(page.locator('[data-testid="rules-modal"]')).toHaveCount(0);

  await page.goto(GAME(12));
  await page.locator('[data-testid="card"]').waitFor();
  await expect(page.locator('[data-testid="btn-rules"]')).toBeVisible();
  await page.locator('[data-testid="btn-rules"]').click();
  await expect(page.locator('[data-testid="rules-modal"]')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="rules-modal"]')).toHaveCount(0);

  await page.locator('[data-testid="btn-hint-manual"]').click();
  await expect(page.locator('[data-testid="rules-modal"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="rules-modal"]')).toHaveCount(0);
});

