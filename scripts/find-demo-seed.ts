#!/usr/bin/env tsx
/**
 * Find the demo seed (§10): first seed under the balancing policy that
 *  - survives 18–22 cards,
 *  - passes through ≥1 card where both options are net-negative, and
 *  - ends on UNCHECKED (Trust 100), the thesis ending.
 * Writes docs/demo-path.json with the ?seed= URL + verified transcript.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Card,
  newRun,
  step,
  currentCard,
  balancingPolicy,
  isBothBad,
  mulberry32,
} from '../web/src/engine';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CARDS = JSON.parse(readFileSync(resolve(root, 'data/cards.json'), 'utf8')) as Card[];
const PRODUCTION_URL = 'https://ayodejiades.github.io/alignd/';

const MAX_SEED = 500000;

for (let seed = 1; seed <= MAX_SEED; seed++) {
  let state = newRun(CARDS, seed);
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const choices: ('A' | 'B')[] = [];
  const drawn: Card[] = [];
  while (!state.over) {
    const card = currentCard(state);
    if (!card) break;
    drawn.push(card);
    const side = balancingPolicy(card, state.meters, rand);
    choices.push(side);
    state = step(state, side);
  }
  if (state.ending !== 'UNCHECKED') continue;
  if (state.index < 18 || state.index > 22) continue;
  const badIdx = drawn.map((c, i) => (isBothBad(c) ? i : -1)).filter((i) => i >= 0);
  if (badIdx.length === 0) continue;
  const badSet = new Set(badIdx);
  const steps: Record<string, unknown>[] = [
    {
      say: 'Already inside the runner: the first card is on screen.',
      goto: `?seed=${seed}`, // relative: baseUrl already ends in /alignd/
      waitFor: '[data-testid="screen-game"]',
      waitMs: 900,
    },
  ];
  choices.forEach((s, i) => {
    steps.push({
      say: badSet.has(i)
        ? `Turn ${i + 1}: both options are visibly bad. Let it sit.`
        : `Turn ${i + 1}: a choice; the meters move.`,
      click: `[data-testid="choice-${s.toLowerCase()}"]`,
      waitMs: 700, // past the 220ms transition + 400ms meter animation, so each click lands once
    });
  });
  steps.push({
    say: 'The run ends on UNCHECKED: the verdict screen reads out.',
    waitFor: '[data-testid="screen-verdict"]',
    waitMs: 2500,
  });
  const out = {
    seed,
    url: `${PRODUCTION_URL}?seed=${seed}`,
    ending: state.ending,
    survived: state.index,
    finalMeters: state.meters,
    choices: choices.map((s, i) => ({ turn: i + 1, card: drawn[i].id, choice: s })),
    bothBadTurns: badIdx.map((i) => ({ turn: i + 1, card: drawn[i].id })),
    deck: drawn.map((c) => c.id),
    baseUrl: PRODUCTION_URL,
    viewport: { width: 1920, height: 1080 },
    steps,
  };
  mkdirSync(resolve(root, 'docs'), { recursive: true });
  writeFileSync(resolve(root, 'docs/demo-path.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`demo seed: ${seed} — UNCHECKED after ${state.index} cards, both-bad at turn(s) ${badIdx.map((i) => i + 1).join(',')}`);
  console.log(`docs/demo-path.json written -> ${out.url}`);
  process.exit(0);
}
console.error(`no demo seed in 1..${MAX_SEED}`);
process.exit(1);
