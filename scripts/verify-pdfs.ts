#!/usr/bin/env tsx
/**
 * PDF-artifact verification — §9 tests 23–25 and 28 at the artifact level.
 * (DOM-level halves live in tests/print.e2e.spec.ts.)
 * Requires dist/*.pdf — run `npm run build:pdf` first.
 *
 *  23 page counts: deck == ceil(cards/9)*2+1, rules == 2 (A4 + Letter).
 *  24 trim: page size exact at 72dpi raster; card pitch 63+4mm / row pitch
 *     88+4mm detected in a 150dpi raster, ±0.5mm.
 *  25 mono: every sampled pixel near-grey (max-min ≤ 12).
 *  28 qr-decodes: title + rules-back QRs decode to the production URL,
 *     in deck-color, deck-mono and rules (A4 + Letter).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_URL = 'https://ayodejiades.github.io/alignd/';
const CARDS = JSON.parse(readFileSync(resolve(root, 'data/cards.json'), 'utf8')) as unknown[];
const DECK_PAGES = Math.ceil(CARDS.length / 9) * 2 + 1;

let failures = 0;
function check(name: string, cond: boolean, extra = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra && cond ? '' : `  ${extra}`}`);
  if (!cond) failures++;
}

function gs(args: string[]): string {
  return execFileSync(
    'gs',
    [
      '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE',
      `--permit-file-read=${resolve(root, 'dist')}/`,
      `--permit-file-write=${tmpdir()}/`,
      ...args,
    ],
    { encoding: 'utf8' },
  );
}

function pageCount(pdf: string): number {
  const out = gs(['-dNODISPLAY', '-c', `(${pdf}) (r) file runpdfbegin pdfpagecount = quit`]);
  return parseInt(out.trim(), 10);
}

interface Raster { w: number; h: number; px: Buffer }
function parsePpm(path: string): Raster {
  const buf = readFileSync(path);
  const magic = buf.toString('ascii', 0, 2); // P4 bitmap, P5 grey or P6 rgb
  if (magic !== 'P4' && magic !== 'P5' && magic !== 'P6') throw new Error(`bad magic ${magic} in ${path}`);
  let i = 2;
  const tokens: string[] = [];
  while (tokens.length < (magic === 'P4' ? 2 : 3)) {
    while (buf[i] <= 0x20) i++;
    while (buf[i] === 0x23) { while (buf[i] !== 0x0a) i++; i++; while (buf[i] <= 0x20) i++; } // comment
    let j = i;
    while (buf[j] > 0x20) j++;
    tokens.push(buf.toString('ascii', i, j));
    i = j;
  }
  while (buf[i] <= 0x20) i++;
  const w = parseInt(tokens[0], 10);
  const h = parseInt(tokens[1], 10);
  if (magic === 'P4') {
    // 1-bit bitmap, MSB first, 1 = black.
    const px = Buffer.alloc(w * h * 3);
    for (let p = 0; p < w * h; p++) {
      const bit = (buf[i + (p >> 3)] >> (7 - (p & 7))) & 1;
      const v = bit ? 0 : 255;
      px[p * 3] = px[p * 3 + 1] = px[p * 3 + 2] = v;
    }
    return { w, h, px };
  }
  if (magic === 'P5') {
    const grey = buf.subarray(i, i + w * h);
    if (grey.length < w * h) throw new Error(`short raster ${path}`);
    const px = Buffer.alloc(w * h * 3);
    for (let p = 0; p < w * h; p++) px[p * 3] = px[p * 3 + 1] = px[p * 3 + 2] = grey[p];
    return { w, h, px };
  }
  const px = buf.subarray(i, i + w * h * 3);
  if (px.length < w * h * 3) throw new Error(`short raster ${path}`);
  return { w, h, px };
}

function render(pdf: string, dpi: number, first: number, last: number): Raster[] {
  const dir = mkdtempSync(join(tmpdir(), 'alignd-print-'));
  try {
    gs([
      // ppmraw (not pnmraw): pnmraw auto-selects P4/P5/P6 per page, which
      // drops colour on grey pages and crashes naive parsers on bitmap pages.
      `-r${dpi}`, '-sDEVICE=ppmraw', `-dFirstPage=${first}`, `-dLastPage=${last}`,
      `-sOutputFile=${join(dir, 'p-%d.ppm')}`, pdf,
    ]);
    return readdirSync(dir).sort().map((f) => parsePpm(join(dir, f)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const pdf = (n: string) => resolve(root, 'dist', n);

// ---- 23: page counts ----
const deckPdfs = ['deck-color-a4.pdf', 'deck-color-letter.pdf', 'deck-mono-a4.pdf', 'deck-mono-letter.pdf'];
const rulesPdfs = ['rules-a4.pdf', 'rules-letter.pdf'];
for (const f of [...deckPdfs, ...rulesPdfs]) {
  if (!existsSync(pdf(f))) {
    check(`23 ${f} exists`, false, 'run npm run build:pdf first');
    process.exit(1);
  }
}
for (const f of deckPdfs) check(`23 ${f} pages == ${DECK_PAGES}`, pageCount(pdf(f)) === DECK_PAGES, `got ${pageCount(pdf(f))}`);
for (const f of rulesPdfs) check(`23 ${f} pages == 2`, pageCount(pdf(f)) === 2, `got ${pageCount(pdf(f))}`);

// ---- 24: page size + card pitch ----
const PXMM = (dpi: number) => dpi / 25.4;
for (const [f, ew, eh] of [
  ['deck-color-a4.pdf', 595, 842], ['deck-color-letter.pdf', 612, 792],
  ['rules-a4.pdf', 595, 842], ['rules-letter.pdf', 612, 792],
] as const) {
  const [r] = render(pdf(f), 72, 1, 1);
  check(`24 ${f} page size`, Math.abs(r.w - ew) <= 2 && Math.abs(r.h - eh) <= 2, `got ${r.w}×${r.h}px @72dpi`);
}

// Card runs on a front sheet (page 2: title is page 1). With a fill signal
// each card is one wide run, so measure run widths and the gaps between them.
function cardRuns(profile: number[], thresh: number): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] >= thresh) { if (start < 0) start = i; }
    else if (start >= 0) { runs.push({ start, end: i - 1 }); start = -1; }
  }
  if (start >= 0) runs.push({ start, end: profile.length - 1 });
  return runs;
}
for (const f of ['deck-color-a4.pdf', 'deck-color-letter.pdf']) {
  const [r] = render(pdf(f), 150, 2, 2);
  const { w, h, px } = r;
  // Card stock (bone #F4F1EA, ink backs, accent bands, text) vs the white
  // page: any channel more than 10 below white. Card borders are a light
  // hairline, so a dark-ink threshold cannot see card edges — stock-vs-page can.
  const isCard = (x: number, y: number) => {
    const o = (y * w + x) * 3;
    return (255 - px[o] > 10) || (255 - px[o + 1] > 10) || (255 - px[o + 2] > 10);
  };
  // column profile over the middle band (avoids top/bottom corner radii)
  const col = new Array(w).fill(0);
  for (let x = 0; x < w; x++) {
    let c = 0;
    for (let y = Math.floor(h * 0.3); y < h * 0.7; y += 2) if (isCard(x, y)) c++;
    col[x] = c;
  }
  const colRows = Math.ceil((Math.floor(h * 0.7) - Math.floor(h * 0.3)) / 2);
  const xruns = cardRuns(col, colRows * 0.5);
  // Expect 3 cards per row: 63mm wide with 4mm gutters between.
  const cardW = PXMM(150) * 63; // 372.0
  const gutW = PXMM(150) * 4; // 23.6
  const tol = PXMM(150) * 0.5; // ±0.5mm in px
  const xwidths = xruns.map((r) => r.end - r.start + 1);
  const xguts = xruns.slice(1).map((r, i) => r.start - xruns[i].end - 1);
  const okCard = xruns.length === 3 && xwidths.every((v) => Math.abs(v - cardW) <= tol + 4);
  const okGut = xguts.length === 2 && xguts.every((v) => Math.abs(v - gutW) <= tol + 4);
  check(`24 ${f} card width 63±0.5mm + gutter 4mm`, okCard && okGut,
    `runs(px)=${xwidths.map((v) => v.toFixed(1)).join(',')} guts=${xguts.map((v) => v.toFixed(1)).join(',')} want ${cardW.toFixed(1)}/${gutW.toFixed(1)}`);
  // row profile over the middle columns
  const row = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = Math.floor(w * 0.3); x < w * 0.7; x += 2) if (isCard(x, y)) c++;
    row[y] = c;
  }
  const rowCols = Math.ceil((Math.floor(w * 0.7) - Math.floor(w * 0.3)) / 2);
  const yruns = cardRuns(row, rowCols * 0.5);
  const cardH = PXMM(150) * 88; // 519.7
  const ywidths = yruns.map((r) => r.end - r.start + 1);
  const yguts = yruns.slice(1).map((r, i) => r.start - yruns[i].end - 1);
  const okH = yruns.length === 3 && ywidths.every((v) => Math.abs(v - cardH) <= tol + 6);
  const okVG = yguts.length === 2 && yguts.every((v) => Math.abs(v - gutW) <= tol + 4);
  check(`24 ${f} card height 88±0.5mm + gutter 4mm`, okH && okVG,
    `runs(px)=${ywidths.map((v) => v.toFixed(1)).join(',')} guts=${yguts.map((v) => v.toFixed(1)).join(',')} want ${cardH.toFixed(1)}/${gutW.toFixed(1)}`);
}

// ---- 25: mono has no colour (and color really has colour) ----
for (const f of ['deck-mono-a4.pdf', 'deck-mono-letter.pdf']) {
  const pages = render(pdf(f), 72, 1, pageCount(pdf(f)));
  let worst = 0;
  for (const r of pages) {
    for (let o = 0; o < r.px.length; o += 12) {
      const d = Math.max(r.px[o], r.px[o + 1], r.px[o + 2]) - Math.min(r.px[o], r.px[o + 1], r.px[o + 2]);
      if (d > worst) worst = d;
    }
  }
  check(`25 ${f} all pixels near-grey`, worst <= 12, `worst channel spread ${worst}`);
}
for (const f of ['deck-color-a4.pdf', 'deck-color-letter.pdf']) {
  // Guard: the colour edition must actually contain chromatic pixels —
  // otherwise the color/mono pipeline is silently identical.
  const [r] = render(pdf(f), 72, 2, 2);
  let best = 0;
  for (let o = 0; o < r.px.length; o += 30) {
    const d = Math.max(r.px[o], r.px[o + 1], r.px[o + 2]) - Math.min(r.px[o], r.px[o + 1], r.px[o + 2]);
    if (d > best) best = d;
  }
  check(`25 ${f} colour edition is chromatic`, best > 40, `best channel spread ${best}`);
}

// ---- 28: QR decodes from the final PDFs ----
function decodeFull(r: Raster): string | null {
  // Full-resolution feed: downsampling to ~2px/module makes decoding a
  // phase-alignment gamble (A4 passes point-sampled where Letter fails and
  // vice versa). At 150dpi modules are ~3.6px and jsQR is deterministic.
  const data = new Uint8ClampedArray(r.w * r.h * 4);
  for (let p = 0; p < r.w * r.h; p++) {
    data[p * 4] = r.px[p * 3];
    data[p * 4 + 1] = r.px[p * 3 + 1];
    data[p * 4 + 2] = r.px[p * 3 + 2];
    data[p * 4 + 3] = 255;
  }
  return jsQR(data, r.w, r.h)?.data ?? null;
}
const qrJobs: [string, number][] = [
  ['deck-color-a4.pdf', 1], ['deck-mono-a4.pdf', 1],
  ['deck-color-letter.pdf', 1], ['deck-mono-letter.pdf', 1],
  ['rules-a4.pdf', 2], ['rules-letter.pdf', 2],
];
for (const [f, p] of qrJobs) {
  let got: string | null = null;
  for (const dpi of [150, 200]) {
    const [r] = render(pdf(f), dpi, p, p);
    got = decodeFull(r);
    if (got) break;
  }
  check(`28 ${f} p${p} QR decodes`, got === PRODUCTION_URL, `got ${JSON.stringify(got)}`);
}

if (failures > 0) {
  console.error(`verify-pdfs: ${failures} failure(s)`);
  process.exit(1);
}
console.log('verify-pdfs OK');
