#!/usr/bin/env tsx
/**
 * Render print PDFs via headless Chromium (page.pdf), so print reuses the
 * web stack. Requires `npm run build` first (runs it automatically).
 * Outputs (A4 + US Letter):
 *   dist/deck-color-a4.pdf, dist/deck-color-letter.pdf,
 *   dist/deck-mono-a4.pdf,  dist/deck-mono-letter.pdf,
 *   dist/rules-a4.pdf,      dist/rules-letter.pdf
 */
import { chromium } from 'playwright';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PORT = 4191;
const BASE = `http://localhost:${PREVIEW_PORT}/alignd/print.html`;

async function waitForServer(url: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`preview server never came up at ${url}`);
}

async function main() {
  console.log('build:pdf — vite build…');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
  mkdirSync(resolve(root, 'dist'), { recursive: true });

  const server: ChildProcess = spawn(
    'npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'],
    { cwd: root, stdio: 'pipe' },
  );
  try {
    await waitForServer(`${BASE}?doc=rules&size=a4`);
    const browser = await chromium.launch();
    const jobs: { name: string; url: string; format: 'A4' | 'Letter' }[] = [];
    for (const size of ['a4', 'letter'] as const) {
      const format = size === 'a4' ? 'A4' : 'Letter';
      jobs.push(
        { name: `deck-color-${size}.pdf`, url: `${BASE}?doc=deck&mono=0&size=${size}`, format },
        { name: `deck-mono-${size}.pdf`, url: `${BASE}?doc=deck&mono=1&size=${size}`, format },
        { name: `rules-${size}.pdf`, url: `${BASE}?doc=rules&mono=0&size=${size}`, format },
      );
    }
    for (const job of jobs) {
      const page = await browser.newPage();
      await page.goto(job.url);
      await page.locator('[data-testid="psheet"], [data-testid="title-sheet"], [data-testid="rules-front"]').first().waitFor({ timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.pdf({
        path: resolve(root, 'dist', job.name),
        format: job.format,
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
        preferCSSPageSize: false,
      });
      console.log(`build:pdf — dist/${job.name}`);
      await page.close();
    }
    await browser.close();
  } finally {
    server.kill();
  }
  console.log('build:pdf OK');
}

main();
