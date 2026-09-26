/** alignd print edition — deck sheets, title, and rules. Params: ?doc=deck|rules&mono=0|1&size=a4|letter */
import type { Card, Effects } from './engine';
import { METERS } from './engine';
import { categoryMark, deckSigil, telemetryFigure } from './svg';
import cardsData from '../../data/cards.json';
import endingsData from '../../data/endings.json';
import qrSvgRaw from '../../assets/qr.svg?raw';

const CARDS = cardsData as unknown as Card[];
interface Ending { id: string; meter: string | null; bound: number | null; name: string; title: string; verdict: string; detail: string }
const ENDINGS = endingsData as unknown as Ending[];

const params = new URLSearchParams(location.search);
const DOC = params.get('doc') === 'rules' ? 'rules' : 'deck';
const MONO = params.get('mono') === '1';
const SIZE = params.get('size') === 'letter' ? 'letter' : 'a4';
if (MONO) document.body.classList.add('mono');

const app = document.getElementById('app')!;

function qrSvg(): string {
  // Mono edition: paper ground would print as halftone — use pure white.
  return MONO
    ? (qrSvgRaw as unknown as string).replace(/#F4F1EA/g, '#FFFFFF')
    : (qrSvgRaw as unknown as string);
}

function fmtDelta(v: number): string {
  if (v === 0) return '—';
  return `${v > 0 ? '+' : '−'}${Math.abs(v)}`;
}

function el(tag: string, cls: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function deltaCells(effects: Effects): string {
  return METERS.map(
    (m) => `<div class="p-delta"><span class="l">${m}</span><span class="v">${fmtDelta(effects[m] ?? 0)}</span></div>`,
  ).join('');
}

function cardFront(card: Card, n: number): HTMLElement {
  const node = el('article', 'pcard');
  node.dataset.cat = card.category;
  node.setAttribute('data-testid', 'pcard');
  node.setAttribute('data-card-id', card.id);
  const nn = String(n).padStart(3, '0');
  node.innerHTML =
    `<div class="p-band"><span>${esc(card.category)}</span><span class="p-id">${esc(card.id)}</span></div>` +
    `<div class="p-speaker">${esc(card.speaker)}</div>` +
    `<div class="p-dilemma-zone"><div class="p-tele">${telemetryFigure(card)}</div>` +
    `<p class="p-dilemma" data-testid="pcard-prompt">${esc(card.prompt)}</p>` +
    `<div class="p-mark">${categoryMark(card.category)}</div></div>` +
    `<div class="p-choice"><div class="p-clabel">${esc(card.choiceA.label)}</div>` +
    `<div class="p-deltas">${deltaCells(card.choiceA.effects)}</div></div>` +
    `<hr class="p-rule heavy" />` +
    `<div class="p-choice"><div class="p-clabel">${esc(card.choiceB.label)}</div>` +
    `<div class="p-deltas">${deltaCells(card.choiceB.effects)}</div></div>` +
    `<div class="p-foot"><span>AD-FORM-${nn} / REV.A</span><span>${n}/${CARDS.length}</span></div>`;
  return node;
}

function cardBack(): HTMLElement {
  const node = el('article', 'pback');
  node.setAttribute('data-testid', 'pcard-back');
  node.innerHTML =
    `<div class="sigil">${deckSigil(96)}</div>` +
    `<div class="deckname">alignd</div>` +
    `<div class="formno">AD-BACK-001 / REV.A</div>`;
  return node;
}

function sheet(sizeCls: string, mirror = false): HTMLElement {
  const sec = el('section', `sheet ${sizeCls}`);
  sec.setAttribute('data-testid', 'psheet');
  for (const pos of ['tl', 'tr', 'bl', 'br']) sec.append(el('div', `crop ${pos}`));
  const grid = el('div', mirror ? 'grid mirror' : 'grid');
  sec.append(grid);
  app.append(sec);
  return grid;
}

const sizeCls = SIZE === 'letter' ? 'size-letter' : 'size-a4';

function renderDeck(): void {
  // Title sheet — carries the QR (never on card backs).
  const title = el('section', `title-sheet ${sizeCls}`);
  title.setAttribute('data-testid', 'title-sheet');
  title.innerHTML =
    `<div class="sigil">${deckSigil(160)}</div><h1>alignd</h1>` +
    `<div class="sub">Frontier lab governance · ${CARDS.length}-card deck</div>` +
    `<div class="qr" data-testid="title-qr">${qrSvg()}</div>` +
    `<div class="qr-cap">SCAN FOR DIGITAL COMPANION · AD-WEB-01</div>`;
  app.append(title);

  const chunks: Card[][] = [];
  for (let i = 0; i < CARDS.length; i += 9) chunks.push(CARDS.slice(i, i + 9));
  chunks.forEach((chunk, ci) => {
    const grid = sheet(sizeCls);
    chunk.forEach((card, k) => grid.append(cardFront(card, ci * 9 + k + 1)));
  });
  chunks.forEach((chunk) => {
    const grid = sheet(sizeCls, true);
    chunk.forEach(() => grid.append(cardBack()));
  });
}

function meterLine(m: string, name: string): string {
  const lo = ENDINGS.find((e) => e.meter === m && e.bound === 0);
  const hi = ENDINGS.find((e) => e.meter === m && e.bound === 100);
  return `<div>${m} ${name}: 0 ${esc(lo?.title ?? '')} · 100 ${esc(hi?.title ?? '')}</div>`;
}

function renderRules(): void {
  const p1 = el('section', `rules-sheet ${sizeCls}`);
  p1.setAttribute('data-testid', 'rules-front');
  p1.innerHTML =
    `<h1>alignd: how to play</h1>` +
    `<h2>Setup</h2><p>Shuffle the deck. Place the four meters at 50: Capability, Alignment, Runway, Trust. Draw one card at a time.</p>` +
    `<h2>Each turn</h2><p>Read the dilemma aloud. Pick one of the two options. Move the meters by the signed numbers shown. Dashes mean no change. Both options always cost you something.</p>` +
    `<h2>The meters</h2><div class="meter-table" data-testid="rules-meters">` +
    meterLine('C', 'Capability') + meterLine('A', 'Alignment') +
    meterLine('R', 'Runway') + meterLine('T', 'Trust') + `</div>` +
    `<h2>Dying</h2><p>Any meter reaching exactly 0 or 100 ends the run at once, each end with its own name. Two meters failing on one choice is a Compound Failure. Survive 40 cards for Tenure: you lasted by never deciding anything hard.</p>`;
  const p2 = el('section', `rules-sheet ${sizeCls}`);
  p2.setAttribute('data-testid', 'rules-back');
  const endings = ENDINGS.map((e) => `<li><b>${esc(e.name)}</b>: ${esc(e.detail)}</li>`).join('');
  p2.innerHTML =
    `<h1>alignd: endings</h1><ul>${endings}</ul>` +
    `<div class="qr-row"><div class="qr" data-testid="rules-qr">${qrSvg()}</div>` +
    `<div class="qr-cap">SCAN FOR DIGITAL COMPANION · AD-WEB-01</div></div>`;
  app.append(p1, p2);
}

if (DOC === 'rules') renderRules();
else renderDeck();
