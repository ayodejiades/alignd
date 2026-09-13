/** alignd runner — three screens, vanilla DOM, no runtime network. */
import {
  METERS,
  TENURE_AFTER,
  balancingPolicy,
  currentCard,
  dailySeed,
  endingForSingle,
  initialMeters,
  newRun,
  shareString,
  step,
  type Card,
  type Effects,
  type EndingId,
  type MeterKey,
  type Meters,
  type RunState,
} from './engine';
import { categoryMark, deckSigil, telemetryFigure } from './svg';
import cardsData from '../../data/cards.json';
import endingsData from '../../data/endings.json';

const CARDS = cardsData as unknown as Card[];
interface Ending {
  id: string;
  meter: string | null;
  bound: number | null;
  name: string;
  title: string;
  verdict: string;
  detail: string;
}
const ENDINGS = new Map<string, Ending>(
  (endingsData as unknown as Ending[]).map((e) => [e.id, e]),
);

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const daily = seedParam === null || seedParam === '';
const seed: number = daily ? dailySeed() : Number.parseInt(seedParam!, 10) || 0;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOCK_MS = REDUCED ? 0 : 210;

let run: RunState = newRun(CARDS, seed);
let locked = false;

function utcDay(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function loadLast(): { day: string; ending: string; survived: number } | null {
  try {
    const raw = localStorage.getItem('alignd.last');
    return raw ? (JSON.parse(raw) as { day: string; ending: string; survived: number }) : null;
  } catch {
    return null;
  }
}

function saveLast(ending: EndingId, survived: number): void {
  try {
    localStorage.setItem('alignd.last', JSON.stringify({ day: utcDay(), ending, survived }));
  } catch {
    /* private browsing: game still works */
  }
}

const METER_NAMES: Record<MeterKey, string> = {
  C: 'Capability',
  A: 'Alignment',
  R: 'Runway',
  T: 'Trust',
};

/** Full stakes line for a meter, e.g. "Capability: 0 Outcompeted · 100 Loss of Control". */
function meterStakes(m: MeterKey): string {
  const lo = ENDINGS.get(endingForSingle(m, 0));
  const hi = ENDINGS.get(endingForSingle(m, 100));
  return `${METER_NAMES[m]}: 0 ${lo?.title ?? ''} · 100 ${hi?.title ?? ''}`;
}

function hasSeenHint(): boolean {
  try {
    return localStorage.getItem('alignd.seen') === '1';
  } catch {
    return true; // storage unavailable: never nag
  }
}

function markSeenHint(): void {
  try {
    localStorage.setItem('alignd.seen', '1');
  } catch {
    /* private browsing: hint simply shows again next visit */
  }
  app.querySelector('[data-testid="first-hint"]')?.remove();
}

/* Page-level footer: attribution + source.
   Kept out of the card zone; hidden on short viewports during play. */
function pageFooter(cls = ''): HTMLElement {
  const foot = el('footer', `page-footer ${cls}`.trim());
  foot.setAttribute('data-testid', 'page-footer');
  const line = el('span', '', 'alignd · a game about running a frontier AI lab. ');
  const src = document.createElement('a');
  src.className = 'foot-link';
  src.href = 'https://github.com/ayodejiades/alignd';
  src.textContent = 'Source';
  src.setAttribute('data-testid', 'footer-source');
  foot.append(line, src);
  return foot;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function fmtDelta(v: number): string {
  if (v === 0) return '—';
  const sign = v > 0 ? '+' : '−';
  return `${sign}${Math.abs(v)}`;
}

function deltaRow(effects: Effects): HTMLElement {
  const row = el('div', 'deltas');
  for (const m of METERS) {
    const cell = el('div', 'delta');
    const letter = el('span', 'd-letter', m);
    const val = el('span', 'd-val', fmtDelta(effects[m] ?? 0));
    cell.append(letter, val);
    row.append(cell);
  }
  return row;
}

/* ---------------- manual modal ---------------- */

function openRulesModal(): void {
  const existing = document.getElementById('rules-modal');
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = el('div', 'rules-overlay');
  overlay.id = 'rules-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'How to Play: Operating Manual');
  overlay.setAttribute('data-testid', 'rules-modal');

  const card = el('div', 'rules-dialog');

  const band = el('div', 'rules-band');
  band.append(el('span', '', 'OPERATING MANUAL'), el('span', 'rules-code', 'DOC-REF-01'));
  card.append(band);

  const content = el('div', 'rules-body');

  const h2 = el('h2', 'rules-title', 'How to Play');
  content.append(h2);

  const intro = el(
    'p',
    'rules-p',
    'You direct a frontier AI laboratory. Each turn, pick Option A or B. Every choice shifts four meters by signed amounts. Dashes indicate no change. Both options always cost something.',
  );
  content.append(intro);

  const h3Win = el('h3', 'rules-h3', 'How to Win');
  content.append(h3Win);
  const pWin = el(
    'p',
    'rules-p',
    'Survive 40 cards to earn Tenure. If any meter touches 0 or 100, the run ends immediately.',
  );
  content.append(pWin);

  const h3Meters = el('h3', 'rules-h3', 'The CART Meters (0 to 100, Start at 50)');
  content.append(h3Meters);

  const ul = el('ul', 'rules-list');
  ul.append(el('li', '', 'C: Capability. 0 Outcompeted · 100 Loss of Control.'));
  ul.append(el('li', '', 'A: Alignment. 0 Catastrophe · 100 Paralysis.'));
  ul.append(el('li', '', 'R: Runway. 0 Insolvent · 100 Overcapitalised.'));
  ul.append(el('li', '', 'T: Trust. 0 Nationalised · 100 Unchecked.'));
  content.append(ul);

  const h3Controls = el('h3', 'rules-h3', 'Controls');
  content.append(h3Controls);
  const pControls = el(
    'p',
    'rules-p',
    'Use Arrow keys (← / →), tap either option, or swipe.',
  );
  content.append(pControls);

  const btnRow = el('div', 'rules-btn-row');
  const closeBtn = el('button', 'btn', 'Resume Game') as HTMLButtonElement;
  closeBtn.setAttribute('data-testid', 'btn-close-rules');
  closeBtn.addEventListener('click', () => overlay.remove());
  btnRow.append(closeBtn);

  const resetHintBtn = el('button', 'btn ghost', 'Reset First-Card Hint') as HTMLButtonElement;
  resetHintBtn.setAttribute('data-testid', 'btn-reset-hint');
  resetHintBtn.addEventListener('click', () => {
    try {
      localStorage.removeItem('alignd.seen');
    } catch {}
    resetHintBtn.textContent = 'Hint reset for next run';
    resetHintBtn.disabled = true;
  });
  btnRow.append(resetHintBtn);

  content.append(btnRow);
  card.append(content);
  overlay.append(card);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    }
  };
  document.addEventListener('keydown', onKeyDown);

  document.body.append(overlay);
  closeBtn.focus();
}

/* ---------------- title ---------------- */

function renderTitle(): void {
  app.innerHTML = '';
  const wrap = el('div', 'title-wrap');
  wrap.setAttribute('data-testid', 'screen-title');

  const wm = el('h1', 'wordmark', 'alignd');
  wrap.append(wm);
  const sigil = el('div', 'sigil');
  sigil.innerHTML = deckSigil(72);
  wrap.append(sigil);
  const how = el('div', 'how');
  how.setAttribute('data-testid', 'how-it-works');
  for (const line of [
    'Every card offers two choices. Both cost something.',
    'Four meters (C/A/R/T) start at 50.',
    'Any meter at 0 or 100 ends the run with a named ending.',
  ]) {
    how.append(el('p', 'how-line', line));
  }
  wrap.append(how);

  const row = el('div', 'btn-row');
  const play = el('button', 'btn', '▶ Play today’s deck') as HTMLButtonElement;
  play.setAttribute('data-testid', 'btn-play');
  play.addEventListener('click', () => {
    location.search = '?play=1';
  });
  const free = el('button', 'btn ghost', 'Free play') as HTMLButtonElement;
  free.setAttribute('data-testid', 'btn-free');
  free.addEventListener('click', () => {
    const s = (Math.random() * 2 ** 31) | 0;
    location.search = `?seed=${s}`;
  });
  row.append(play, free);

  const subRow = el('div', 'sub-links');
  const print = el('a', 'small-link', 'Print the cards') as HTMLAnchorElement;
  print.setAttribute('href', './print.html');
  print.setAttribute('data-testid', 'link-print');
  const rules = el('button', 'small-link', 'Manual / Rules') as HTMLButtonElement;
  rules.type = 'button';
  rules.setAttribute('data-testid', 'link-rules');
  rules.addEventListener('click', openRulesModal);
  subRow.append(print, rules);

  wrap.append(row, subRow);

  const last = loadLast();
  if (last && last.day === utcDay()) {
    wrap.append(el('div', 'played-note', `Already played today: ${last.ending} · ${last.survived} cards.`));
  }
  app.append(wrap, pageFooter());
  play.focus();
}

/* ---------------- game ---------------- */

function meterNode(m: keyof Meters, value: number): HTMLElement {
  const box = el('div', 'meter');
  box.setAttribute('data-testid', `meter-${m}`);
  const letter = document.createElement('button');
  letter.type = 'button';
  letter.className = 'm-letter';
  letter.textContent = m;
  letter.setAttribute('aria-label', meterStakes(m));
  letter.setAttribute('data-testid', `meter-tip-${m}`);
  letter.addEventListener('click', () => letter.blur());
  const tip = el('span', 'm-tip', meterStakes(m));
  tip.setAttribute('data-testid', `meter-tip-text-${m}`);
  tip.setAttribute('role', 'status');
  box.append(letter, tip);
  const bar = el('div', 'm-bar');
  const fill = el('div', 'm-fill') as HTMLElement;
  fill.style.height = `${value}%`;
  const lo = el('div', 'm-band lo');
  const hi = el('div', 'm-band hi');
  for (const t of [0, 50, 100]) {
    const tick = el('div', 'm-tick') as HTMLElement;
    tick.style.bottom = `${t}%`;
    bar.append(tick);
  }
  bar.append(fill, lo, hi);
  box.append(bar);
  const val = el('div', 'm-val', String(value));
  val.setAttribute('data-testid', `meter-val-${m}`);
  box.append(val);
  return box;
}

function cardNode(card: Card, pos: number, total: number): HTMLElement {
  const node = el('article', 'card') as HTMLElement;
  node.dataset.cat = card.category;
  node.setAttribute('data-testid', 'card');
  node.setAttribute('data-card-id', card.id);

  const band = el('div', 'band');
  const cat = el('span', '', card.category);
  const cid = el('span', 'card-id', card.id);
  band.append(cat, cid);
  node.append(band);

  node.append(el('div', 'speaker', card.speaker));

  const zone = el('div', 'dilemma-zone');
  const tele = el('div', 'telemetry');
  tele.innerHTML = telemetryFigure(card);
  zone.append(tele);
  zone.append(el('p', 'dilemma', card.prompt));
  const mark = el('div', 'catmark');
  mark.innerHTML = categoryMark(card.category);
  zone.append(mark);
  node.append(zone);

  const mkChoice = (side: 'A' | 'B', keyHint: string): HTMLButtonElement => {
    const choice = card[side === 'A' ? 'choiceA' : 'choiceB'];
    const b = document.createElement('button');
    b.className = 'choice';
    b.setAttribute('data-testid', side === 'A' ? 'choice-a' : 'choice-b');
    const label = el('span', 'c-label');
    const key = el('span', 'c-key', keyHint);
    label.append(key);
    label.append(document.createTextNode(choice.label));
    b.append(label, deltaRow(choice.effects));
    b.addEventListener('click', () => choose(side));
    return b;
  };

  node.append(mkChoice('A', '← A'));
  const hr = document.createElement('hr');
  hr.className = 'rule heavy';
  node.append(hr);
  node.append(mkChoice('B', 'B →'));

  const foot = el('div', 'footer');
  const n = String(pos).padStart(3, '0');
  foot.append(el('span', '', `AD-FORM-${n} / REV.A`), el('span', '', `${pos}/${total}`));
  node.append(foot);
  return node;
}

function renderGame(): void {
  app.innerHTML = '';
  const wrap = el('div', '');
  wrap.setAttribute('data-testid', 'screen-game');

  const meters = el('div', 'meters');
  meters.setAttribute('data-testid', 'meters');
  for (const m of METERS) meters.append(meterNode(m, run.meters[m]));
  wrap.append(meters);

  const counter = el('div', 'counter');
  counter.setAttribute('data-testid', 'card-counter');
  const turnText = el('span', 'turn-text', `TURN ${String(run.index + 1).padStart(2, '0')}/${TENURE_AFTER}`);
  const sep = document.createTextNode(' · ');
  const rulesLink = el('button', 'counter-link', 'Manual') as HTMLButtonElement;
  rulesLink.type = 'button';
  rulesLink.setAttribute('data-testid', 'btn-rules');
  rulesLink.addEventListener('click', openRulesModal);
  counter.append(turnText, sep, rulesLink);
  wrap.append(counter);

  const card = currentCard(run);
  if (!card) {
    renderVerdict('TENURE');
    return;
  }
  if (!hasSeenHint()) {
    const hint = el('div', 'hint');
    hint.setAttribute('data-testid', 'first-hint');
    hint.append(document.createTextNode('Swipe, click, or ← / →. Both sides always cost you something. '));
    const hintBtn = el('button', 'hint-link', 'View manual.') as HTMLButtonElement;
    hintBtn.type = 'button';
    hintBtn.setAttribute('data-testid', 'btn-hint-manual');
    hintBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRulesModal();
    });
    hint.append(hintBtn);
    wrap.append(hint);
  }
  wrap.append(cardNode(card, run.index + 1, run.deck.length));
  wrap.append(pageFooter('game-footer'));
  app.append(wrap);

  const firstChoice = wrap.querySelector('[data-testid="choice-a"]') as HTMLElement | null;
  firstChoice?.focus({ preventScroll: true });
}

function refreshMeters(): void {
  for (const m of METERS) {
    const box = app.querySelector(`[data-testid="meter-${m}"]`);
    if (!box) continue;
    const fill = box.querySelector('.m-fill') as HTMLElement | null;
    const val = box.querySelector(`[data-testid="meter-val-${m}"]`);
    if (fill) fill.style.height = `${run.meters[m]}%`;
    if (val) val.textContent = String(run.meters[m]);
  }
  const turnText = app.querySelector('[data-testid="card-counter"] .turn-text');
  if (turnText) {
    turnText.textContent = `TURN ${String(run.index + 1).padStart(2, '0')}/${TENURE_AFTER}`;
  } else {
    const counter = app.querySelector('[data-testid="card-counter"]');
    if (counter) counter.textContent = `TURN ${String(run.index + 1).padStart(2, '0')}/${TENURE_AFTER}`;
  }
}

function choose(side: 'A' | 'B'): void {
  if (locked || run.over) return;
  locked = true;
  markSeenHint();
  const cardEl = app.querySelector('[data-testid="card"]') as HTMLElement | null;
  run = step(run, side);
  refreshMeters();
  const advance = (): void => {
    locked = false;
    if (run.over && run.ending) {
      saveLast(run.ending, run.index);
      renderVerdict(run.ending);
    } else {
      renderGame();
    }
  };
  if (cardEl && !REDUCED) {
    cardEl.classList.add('leaving');
    window.setTimeout(advance, LOCK_MS);
  } else {
    advance();
  }
}

/* ---------------- verdict ---------------- */

function renderVerdict(endingId: EndingId): void {
  app.innerHTML = '';
  const ending = ENDINGS.get(endingId);
  const wrap = el('div', 'verdict-wrap');
  wrap.setAttribute('data-testid', 'screen-verdict');

  const stamp = el('div', 'stamp', ending?.name ?? endingId);
  stamp.setAttribute('data-testid', 'verdict-stamp');
  wrap.append(stamp);
  const name = el('h2', 'verdict-name', ending?.title ?? endingId);
  name.setAttribute('data-testid', 'verdict-name');
  wrap.append(name);
  wrap.append(el('p', 'verdict-text', ending?.verdict ?? ''));
  if (ending?.detail) wrap.append(el('p', 'verdict-text', ending.detail));

  const meta = el('div', 'verdict-meta');
  meta.setAttribute('data-testid', 'verdict-meta');
  meta.innerHTML = '';
  const survived = el('div', '', `${run.index} card${run.index === 1 ? '' : 's'} survived · seed ${seed}`);
  survived.setAttribute('data-testid', 'verdict-survived');
  const metersLine = el(
    'div',
    '',
    `C ${run.meters.C} · A ${run.meters.A} · R ${run.meters.R} · T ${run.meters.T}`,
  );
  metersLine.setAttribute('data-testid', 'verdict-meters');
  meta.append(survived, metersLine);
  wrap.append(meta);

  const row = el('div', 'btn-row');
  const replay = el('button', 'btn', 'Replay') as HTMLButtonElement;
  replay.setAttribute('data-testid', 'btn-replay');
  replay.addEventListener('click', () => {
    if (daily) {
      run = newRun(CARDS, seed);
      renderGame();
    } else {
      location.search = `?seed=${(Math.random() * 2 ** 31) | 0}`;
    }
  });
  row.append(replay);

  const shareBtn = el('button', 'btn ghost', 'Share') as HTMLButtonElement;
  shareBtn.setAttribute('data-testid', 'btn-share');
  const shareText = shareString(endingId, run.index, seed, daily);
  const shareRow = el('div', 'share-row');
  const input = document.createElement('input');
  input.readOnly = true;
  input.value = shareText;
  input.setAttribute('data-testid', 'share-text');
  input.setAttribute('aria-label', 'Share text');
  shareBtn.addEventListener('click', async () => {
    const hint = app.querySelector('.share-hint');
    try {
      await navigator.clipboard.writeText(shareText);
      if (hint) hint.textContent = 'Copied to clipboard.';
    } catch {
      input.select();
      if (hint) hint.textContent = 'Copy unavailable; select the text and copy it manually.';
    }
  });
  shareRow.append(input, shareBtn);
  wrap.append(row, shareRow);
  wrap.append(el('div', 'share-hint', 'Share names the outcome, never the cards. No spoilers.'));
  app.append(wrap, pageFooter());
  replay.focus();
}

/* ---------------- boot ---------------- */

function boot(): void {
  const showTitle = !params.has('play') && !params.has('seed');
  if (showTitle) {
    renderTitle();
  } else {
    renderGame();
  }

  if (params.has('rules') || params.has('manual')) {
    openRulesModal();
  }

  document.addEventListener('keydown', (e) => {
    if (document.getElementById('rules-modal')) return;
    const verdict = app.querySelector('[data-testid="screen-verdict"]');
    if (e.key === 'ArrowLeft') {
      if (verdict) return;
      const a = app.querySelector('[data-testid="choice-a"]') as HTMLElement | null;
      if (a) {
        e.preventDefault();
        choose('A');
      }
    } else if (e.key === 'ArrowRight') {
      if (verdict) return;
      const b = app.querySelector('[data-testid="choice-b"]') as HTMLElement | null;
      if (b) {
        e.preventDefault();
        choose('B');
      }
    }
  });

  // swipe: left = A, right = B
  let touchX: number | null = null;
  document.addEventListener('touchstart', (e) => {
    touchX = e.touches[0]?.clientX ?? null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
    touchX = null;
    if (Math.abs(dx) < 48) return;
    if (document.getElementById('rules-modal')) return;
    if (app.querySelector('[data-testid="screen-verdict"]')) return;
    choose(dx < 0 ? 'A' : 'B');
  }, { passive: true });

  // test hook (state inspection only)
  (window as unknown as { __alignd: unknown }).__alignd = {
    getState: () => ({ meters: { ...run.meters }, index: run.index, over: run.over, ending: run.ending, seed }),
    policy: balancingPolicy,
    initial: initialMeters(),
  };
}

boot();
