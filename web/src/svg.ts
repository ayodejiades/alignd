/** Hand-written SVG artwork: telemetry figure, category marks, deck sigil. */
import type { Card, Effects, MeterKey } from './engine';
import { METERS } from './engine';

const INK = '#14161A';
const PAPER = '#F4F1EA';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Procedural telemetry figure: two polylines across C A R T, one per choice,
 * derived from that card's own deltas. 0.25pt ink strokes at 55% opacity.
 */
export function telemetryFigure(card: Card, size = 96): string {
  const w = size;
  const h = size;
  const pad = 8;
  const xs = METERS.map((_, i) => pad + (i * (w - 2 * pad)) / (METERS.length - 1));
  const yOf = (v: number): number => {
    const t = (20 - Math.max(-20, Math.min(20, v))) / 40; // +20 top, -20 bottom
    return pad + t * (h - 2 * pad);
  };
  const mid = yOf(0);
  const line = (effects: Effects, dash: string): string => {
    const pts = METERS.map((m: MeterKey, i: number) => `${xs[i].toFixed(1)},${yOf(effects[m] ?? 0).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${INK}" stroke-width="0.25" ${dash}/>`;
  };
  const dots = (effects: Effects): string =>
    METERS.map((m: MeterKey, i: number) => {
      const v = effects[m] ?? 0;
      return v === 0
        ? ''
        : `<circle cx="${xs[i].toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="1.1" fill="${INK}"/>`;
    }).join('');
  const labels = METERS.map(
    (m: MeterKey, i: number) =>
      `<text x="${xs[i].toFixed(1)}" y="${(h - 1).toFixed(0)}" font-size="5" text-anchor="middle" fill="${INK}" font-family="monospace">${m}</text>`,
  ).join('');
  return (
    `<svg class="telemetry-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Delta plot for two options">` +
    `<line x1="${pad}" y1="${mid}" x2="${w - pad}" y2="${mid}" stroke="${INK}" stroke-width="0.25" stroke-dasharray="1.5 1.5"/>` +
    line(card.choiceA.effects, '') +
    line(card.choiceB.effects, 'stroke-dasharray="2.5 1.8"') +
    dots(card.choiceA.effects) +
    dots(card.choiceB.effects) +
    labels +
    `</svg>`
  );
}

/** Per-category technical mark: plotter-style line art, ink only. */
export function categoryMark(category: string, size = 44): string {
  const s = `stroke="${INK}" stroke-width="0.5" fill="none"`;
  let inner = '';
  if (category === 'evals') {
    inner =
      `<circle cx="22" cy="22" r="13" ${s}/><circle cx="22" cy="22" r="6.5" ${s}/>` +
      `<line x1="22" y1="2" x2="22" y2="42" ${s}/><line x1="2" y1="22" x2="42" y2="22" ${s}/>`;
  } else if (category === 'compute') {
    inner =
      `<rect x="8" y="8" width="28" height="7" ${s}/><rect x="8" y="18.5" width="28" height="7" ${s}/><rect x="8" y="29" width="28" height="7" ${s}/>` +
      `<line x1="12" y1="11.5" x2="12" y2="11.5" ${s}/><line x1="12" y1="22" x2="12" y2="22" ${s}/><line x1="12" y1="32.5" x2="12" y2="32.5" ${s}/>`;
  } else if (category === 'posttrain') {
    inner =
      `<polyline points="4,36 14,36 14,26 24,26 24,16 34,16 34,8" ${s}/>` +
      `<line x1="4" y1="40" x2="40" y2="40" ${s}/>`;
  } else if (category === 'governance') {
    inner =
      `<line x1="10" y1="36" x2="10" y2="12" ${s}/><line x1="22" y1="36" x2="22" y2="6" ${s}/><line x1="34" y1="36" x2="34" y2="18" ${s}/>` +
      `<line x1="4" y1="36" x2="40" y2="36" ${s}/><line x1="4" y1="6" x2="40" y2="6" ${s}/>`;
  } else {
    // breakout: square containment with one corner breached
    inner =
      `<rect x="9" y="9" width="26" height="26" ${s}/>` +
      `<line x1="35" y1="9" x2="42" y2="2" ${s}/><line x1="9" y1="35" x2="2" y2="42" ${s}/>` +
      `<circle cx="22" cy="22" r="4" ${s}/>`;
  }
  return `<svg class="catmark-svg" width="${size}" height="${size}" viewBox="0 0 44 44" role="img" aria-label="${esc(category)} mark">${inner}</svg>`;
}

/** Deck sigil: four interlocking arcs for the four meters. Single ink. */
export function deckSigil(size = 96): string {
  const s = `stroke="${INK}" stroke-width="1" fill="none"`;
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 96 96" role="img" aria-label="alignd sigil">` +
    `<circle cx="36" cy="36" r="22" ${s}/><circle cx="60" cy="36" r="22" ${s}/>` +
    `<circle cx="36" cy="60" r="22" ${s}/><circle cx="60" cy="60" r="22" ${s}/>` +
    `</svg>`
  );
}

export { INK, PAPER };
