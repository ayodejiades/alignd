/** Print-edition tests (§9 tests 23–28, DOM-level half).
 * PDF-artifact half (page counts, ink coverage, raster QR decode) lives in
 * scripts/verify-pdfs.ts and runs against dist/*.pdf via `npm run test:print`.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_URL = 'https://ayodejiades.github.io/alignd/';
const MM = 96 / 25.4; // CSS px per mm
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cards = JSON.parse(readFileSync(resolve(root, 'data/cards.json'), 'utf8')) as unknown[];
const N = cards.length;
const SHEETS_PER_SIDE = Math.ceil(N / 9);

async function gotoPrint(page: Page, qs: string) {
  await page.goto(`/alignd/print.html?${qs}`);
  await page.locator('[data-testid="psheet"], [data-testid="title-sheet"], [data-testid="rules-front"]').first().waitFor({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
}

test.describe('print deck (test 23 — sheet count)', () => {
  for (const size of ['a4', 'letter']) {
    test(`deck ${size}: 1 title + ${SHEETS_PER_SIDE} front + ${SHEETS_PER_SIDE} back sheets`, async ({ page }) => {
      await gotoPrint(page, `doc=deck&mono=0&size=${size}`);
      expect(await page.locator('[data-testid="title-sheet"]').count()).toBe(1);
      expect(await page.locator('[data-testid="psheet"]').count()).toBe(SHEETS_PER_SIDE * 2);
      // every card rendered exactly once, unique ids
      const ids = await page.locator('[data-testid="pcard"]').evaluateAll((els) =>
        els.map((e) => e.getAttribute('data-card-id')),
      );
      expect(ids.length).toBe(N);
      expect(new Set(ids).size).toBe(N);
      // backs match fronts per sheet
      expect(await page.locator('[data-testid="pcard-back"]').count()).toBe(N);
    });
  }
});

test.describe('print geometry (test 24 — 63×88mm trim, 4mm gutters)', () => {
  for (const size of ['a4', 'letter']) {
    for (const mono of ['0', '1']) {
      test(`deck ${size} mono=${mono}: cards measure 63×88mm`, async ({ page }) => {
        await gotoPrint(page, `doc=deck&mono=${mono}&size=${size}`);
        const boxes = await page.locator('[data-testid="pcard"]').evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return { w: r.width, h: r.height };
          }),
        );
        expect(boxes.length).toBe(N);
        for (const b of boxes) {
          expect(Math.abs(b.w - 63 * MM)).toBeLessThan(1.5);
          expect(Math.abs(b.h - 88 * MM)).toBeLessThan(1.5);
        }
        // gutter: horizontal pitch between adjacent cards in a row = 63 + 4mm
        const pitch = await page.locator('.grid').first().evaluate((grid) => {
          const cards = [...grid.querySelectorAll('[data-testid="pcard"]')].slice(0, 3);
          const rs = cards.map((e) => e.getBoundingClientRect());
          return [rs[1].left - rs[0].left, rs[1].top - rs[0].top];
        });
        expect(Math.abs(pitch[0] - 67 * MM)).toBeLessThan(2);
        expect(Math.abs(pitch[1])).toBeLessThan(2);
        // grid fits the page width (A4 210mm / Letter 215.9mm)
        const pageW = size === 'a4' ? 210 * MM : 215.9 * MM;
        const gridW = await page.locator('.grid').first().evaluate((g) => g.getBoundingClientRect().width);
        expect(gridW).toBeLessThanOrEqual(pageW + 1);
        expect(gridW).toBeGreaterThan(190 * MM);
      });
    }
  }
});

test.describe('print mono (test 25 — greyscale only)', () => {
  test('deck mono: every computed colour channel is grey', async ({ page }) => {
    await gotoPrint(page, 'doc=deck&mono=1&size=a4');
    const bad = await page.evaluate(() => {
      const props = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];
      const out: string[] = [];
      const all = document.querySelectorAll('*');
      const re = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/;
      all.forEach((e) => {
        const cs = getComputedStyle(e);
        for (const p of props) {
          const m = re.exec(cs.getPropertyValue(p));
          // Near-grey tolerance: ink #14161A (20,22,26) is functionally
          // neutral; real accents (teal #3D5A5C, red #A83A28) deviate by 30+.
          if (m && Math.max(+m[1], +m[2], +m[3]) - Math.min(+m[1], +m[2], +m[3]) > 8) {
            out.push(`${p}=${m[0]}`);
          }
          if (out.length > 5) return;
        }
      });
      return out;
    });
    expect(bad).toEqual([]);
    // SVG paint attributes are ink-only too (ink #14161A, paper/white, tint grey)
    const paints = await page.evaluate(() => {
      const vals = new Set<string>();
      document.querySelectorAll('svg [stroke], svg [fill], svg path').forEach((e) => {
        for (const a of ['stroke', 'fill']) {
          const v = e.getAttribute(a);
          if (v && v !== 'none') vals.add(v.toLowerCase());
        }
      });
      return [...vals];
    });
    for (const v of paints) {
      if (v.startsWith('#')) {
        const h = v.slice(1);
        const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8);
      }
    }
  });
});

test.describe('rules sheet (test 26 — one sheet, two sides, ≤400 words)', () => {
  test('rules: front + back, word budget', async ({ page }) => {
    await gotoPrint(page, 'doc=rules&mono=0&size=a4');
    expect(await page.locator('[data-testid="rules-front"]').count()).toBe(1);
    expect(await page.locator('[data-testid="rules-back"]').count()).toBe(1);
    const words = await page.locator('#app').evaluate((app) =>
      (app.textContent ?? '').trim().split(/\s+/).filter(Boolean).length,
    );
    expect(words).toBeLessThanOrEqual(400);
  });
});

test.describe('overflow (test 27 — no text spills its zone)', () => {
  for (const mono of ['0', '1']) {
    test(`all ${N} cards fit 63×88mm (mono=${mono})`, async ({ page }) => {
      await gotoPrint(page, `doc=deck&mono=${mono}&size=a4`);
      const overflows = await page.locator('[data-testid="pcard"]').evaluateAll(
        (els, trimPx) => {
          const bad: string[] = [];
          els.forEach((e) => {
            const html = e as HTMLElement;
            const cid = e.getAttribute('data-card-id') ?? '';
            if (html.scrollHeight > trimPx.h + 2 || html.scrollWidth > trimPx.w + 2) {
              bad.push(`${cid}: card ${html.scrollWidth}×${html.scrollHeight}`);
            }
            e.querySelectorAll('.p-dilemma, .p-clabel').forEach((inner) => {
              const h = inner as HTMLElement;
              if (h.scrollHeight > h.clientHeight + 2 || h.scrollWidth > h.clientWidth + 2) {
                bad.push(`${cid}: ${(inner as HTMLElement).className} spills`);
              }
            });
            // Ensure no vertical overlap between card zones
            const dilemma = e.querySelector('.p-dilemma')!.getBoundingClientRect();
            const choices = e.querySelectorAll('.p-choice');
            const choiceA = choices[0]?.getBoundingClientRect();
            const choiceB = choices[1]?.getBoundingClientRect();
            const foot = e.querySelector('.p-foot')!.getBoundingClientRect();
            if (choiceA && dilemma.bottom > choiceA.top + 0.5) {
              bad.push(`${cid}: dilemma overlaps choice A by ${(dilemma.bottom - choiceA.top).toFixed(1)}px`);
            }
            if (choiceA && choiceB && choiceA.bottom > choiceB.top + 0.5) {
              bad.push(`${cid}: choice A overlaps choice B by ${(choiceA.bottom - choiceB.top).toFixed(1)}px`);
            }
            if (choiceB && foot && choiceB.bottom > foot.top + 0.5) {
              bad.push(`${cid}: choice B overlaps footer by ${(choiceB.bottom - foot.top).toFixed(1)}px`);
            }
          });
          return bad;
        },
        { w: 63 * MM, h: 88 * MM },
      );
      expect(overflows).toEqual([]);
    });
  }
});

test.describe('delta row + QR placement', () => {
  test('delta cells are fixed C A R T order; zeros print as em-dash', async ({ page }) => {
    await gotoPrint(page, 'doc=deck&mono=0&size=a4');
    const rows = await page.locator('.p-deltas').first().evaluate((row) => ({
      letters: [...row.querySelectorAll('.l')].map((e) => e.textContent),
      values: [...row.querySelectorAll('.v')].map((e) => e.textContent),
    }));
    expect(rows.letters).toEqual(['C', 'A', 'R', 'T']);
    const allValues = await page.locator('.p-delta .v').evaluateAll((els) => els.map((e) => e.textContent));
    expect(allValues.length).toBe(N * 2 * 4);
    for (const v of allValues) expect(v).toMatch(/^[+−—]/);
    expect(allValues).toContain('—');
  });

  test('QR on title + rules only, never on card backs', async ({ page }) => {
    await gotoPrint(page, 'doc=deck&mono=0&size=a4');
    expect(await page.locator('[data-testid="title-qr"] svg').count()).toBe(1);
    expect(await page.locator('[data-testid="pcard-back"] .qr').count()).toBe(0);
    expect(await page.locator('[data-testid="pcard-back"] svg').count()).toBe(N); // sigils only
    await gotoPrint(page, 'doc=rules&mono=0&size=a4');
    expect(await page.locator('[data-testid="rules-qr"] svg').count()).toBe(1);
  });
});

test.describe('QR decodes (test 28 — rendered artwork half)', () => {
  const jsqrPath = resolve(root, 'node_modules/jsqr/dist/jsQR.js');
  const jsqrSrc = readFileSync(jsqrPath, 'utf8');

  for (const [doc, sel] of [['deck', '[data-testid="title-qr"] svg'], ['rules', '[data-testid="rules-qr"] svg']] as const) {
    for (const mono of ['0', '1']) {
      test(`${doc} mono=${mono}: QR decodes to production URL`, async ({ page }) => {
        await gotoPrint(page, `doc=${doc}&mono=${mono}&size=a4`);
        await page.addScriptTag({ content: jsqrSrc });
        const decoded = await page.locator(sel).evaluate((svg) => {
          const xml = new XMLSerializer().serializeToString(svg);
          const img = new Image();
          const loaded = new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = rej;
          });
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
          return loaded.then(() => {
            const S = 328;
            const c = document.createElement('canvas');
            c.width = S;
            c.height = S;
            const ctx = c.getContext('2d')!;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, S, S);
            ctx.drawImage(img, 0, 0, S, S);
            const data = ctx.getImageData(0, 0, S, S);
            // @ts-expect-error injected UMD global
            const out = window.jsQR(data.data, S, S);
            return out ? out.data : null;
          });
        });
        expect(decoded).toBe(PRODUCTION_URL);
      });
    }
  }
});
