#!/usr/bin/env tsx
/**
 * Generate assets/qr.svg from the LOCKED production URL.
 * Run once; the SVG is committed. Never regenerate against another URL —
 * every printed QR must decode to the production URL (test 28).
 */
import QRCode from 'qrcode';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_URL = 'https://ayodejiades.github.io/alignd/';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const svg = await QRCode.toString(PRODUCTION_URL, {
    type: 'svg',
    errorCorrectionLevel: 'Q',
    margin: 4, // quiet zone, 4 modules minimum
    color: { dark: '#14161A', light: '#F4F1EA' },
  });
  mkdirSync(resolve(root, 'assets'), { recursive: true });
  writeFileSync(resolve(root, 'assets/qr.svg'), svg + '\n');
  console.log(`build:qr OK — ${PRODUCTION_URL} -> assets/qr.svg (${svg.length} bytes)`);
}

main();
