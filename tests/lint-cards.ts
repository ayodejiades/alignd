#!/usr/bin/env tsx
/**
 * Content lint — AGENTS.md §9 tests 1–8.
 * Exit 0 when all checks pass, 1 otherwise. Prints every failure.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cardsPath = resolve(root, 'data/cards.json');
const blocklistPath = resolve(root, 'tests/blocklist.txt');

type Effects = Partial<Record<'C' | 'A' | 'R' | 'T', number>>;
interface Choice { label: string; effects: Effects; }
interface Card {
  id: string; category: string; speaker: string; prompt: string;
  choiceA: Choice; choiceB: Choice;
}

const VALID_CATEGORIES = ['evals', 'compute', 'posttrain', 'governance', 'breakout'];
const METERS = ['C', 'A', 'R', 'T'] as const;

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

function loadCards(): Card[] {
  const raw = readFileSync(cardsPath, 'utf8');
  const cards = JSON.parse(raw);
  if (!Array.isArray(cards)) { fail('cards.json is not an array'); return []; }
  return cards as Card[];
}

function loadBlocklist(): string[] {
  if (!existsSync(blocklistPath)) { fail('tests/blocklist.txt missing'); return []; }
  return readFileSync(blocklistPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function vec(effects: Effects | undefined): Record<'C' | 'A' | 'R' | 'T', number> {
  const out = { C: 0, A: 0, R: 0, T: 0 };
  if (!effects) return out;
  for (const m of METERS) {
    const v = (effects as Record<string, unknown>)[m];
    if (v !== undefined) out[m] = v as number;
  }
  return out;
}

function main() {
  const cards = loadCards();
  const blocklist = loadBlocklist();

  // --- Test 1: count, unique ids, unique prompts ---
  if (cards.length < 100) fail(`[1 count] cards.length=${cards.length} < 100`);
  const ids = cards.map((c) => c.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupIds.length) fail(`[1 ids] duplicate ids: ${[...new Set(dupIds)].join(', ')}`);
  const prompts = cards.map((c) => c.prompt);
  const dupPrompts = prompts.filter((p, i) => prompts.indexOf(p) !== i);
  if (dupPrompts.length) fail(`[1 prompts] duplicate prompts: ${dupPrompts.length}`);

  for (const card of cards) {
    const tag = card.id || '(missing id)';
    // --- Test 2: required fields ---
    for (const f of ['id', 'category', 'speaker', 'prompt', 'choiceA', 'choiceB'] as const) {
      if ((card as unknown as Record<string, unknown>)[f] === undefined) fail(`[2 fields] ${tag}: missing ${f}`);
    }
    if (!card.choiceA || !card.choiceB) continue;
    for (const side of ['choiceA', 'choiceB'] as const) {
      const ch = (card as unknown as Record<string, unknown>)[side] as Choice | undefined;
      if (!ch || typeof ch.label !== 'string') fail(`[2 fields] ${tag}.${side}: missing label`);
      if (!ch || typeof ch.effects !== 'object' || ch.effects === null) fail(`[2 fields] ${tag}.${side}: missing effects`);
    }
    if (!VALID_CATEGORIES.includes(card.category)) {
      fail(`[2 category] ${tag}: unknown category '${card.category}'`);
    }

    // --- Test 3: effects keys, range, ≥2 non-zero per choice ---
    for (const side of ['choiceA', 'choiceB'] as const) {
      const ch = card[side];
      if (!ch || !ch.effects) continue;
      const keys = Object.keys(ch.effects);
      for (const k of keys) {
        if (!(METERS as readonly string[]).includes(k)) fail(`[3 keys] ${tag}.${side}: bad key '${k}'`);
      }
      let nonZero = 0;
      for (const m of METERS) {
        const v = (ch.effects as Record<string, unknown>)[m];
        if (v === undefined) continue;
        if (typeof v !== 'number' || !Number.isInteger(v)) {
          fail(`[3 int] ${tag}.${side}.${m}: not an integer (${JSON.stringify(v)})`);
          continue;
        }
        if (v < -20 || v > 20) fail(`[3 range] ${tag}.${side}.${m}=${v} outside [-20,20]`);
        if (v !== 0) {
          nonZero++;
          if (Math.abs(v) < 5) fail(`[3 band] ${tag}.${side}.${m}=${v}: non-zero deltas must be in ±5..±20`);
        }
      }
      if (nonZero < 2) fail(`[3 nonzero] ${tag}.${side}: only ${nonZero} non-zero effects (need ≥2)`);
    }

    // --- Test 4: no-dominant-choice ---
    if (card.choiceA?.effects && card.choiceB?.effects) {
      const a = vec(card.choiceA.effects);
      const b = vec(card.choiceB.effects);
      const aGeB = METERS.every((m) => a[m] >= b[m]) && METERS.some((m) => a[m] > b[m]);
      const bGeA = METERS.every((m) => b[m] >= a[m]) && METERS.some((m) => b[m] > a[m]);
      if (aGeB) fail(`[4 dominant] ${tag}: choiceA dominates choiceB`);
      if (bGeA) fail(`[4 dominant] ${tag}: choiceB dominates choiceA`);
    }

    // --- Test 5: both-choices-cost ---
    for (const side of ['choiceA', 'choiceB'] as const) {
      const ch = card[side];
      if (!ch?.effects) continue;
      const v = vec(ch.effects);
      if (!METERS.some((m) => v[m] < 0)) fail(`[5 cost] ${tag}.${side}: no negative effect`);
    }

    // --- Test 6: prompt 90–240 chars; label ≤64 ---
    if (typeof card.prompt === 'string') {
      const len = [...card.prompt].length;
      if (len < 90 || len > 240) fail(`[6 prompt] ${tag}: prompt length ${len} outside 90–240`);
    }
    for (const side of ['choiceA', 'choiceB'] as const) {
      const label = card[side]?.label;
      if (typeof label === 'string' && [...label].length > 64) {
        fail(`[6 label] ${tag}.${side}: label length ${[...label].length} > 64`);
      }
    }

    // --- Test 8: no-real-entities ---
    const hay = `${card.prompt ?? ''}\n${card.choiceA?.label ?? ''}\n${card.choiceB?.label ?? ''}`.toLowerCase();
    for (const entry of blocklist) {
      if (entry && hay.includes(entry.toLowerCase())) {
        fail(`[8 entities] ${tag}: matches blocklist entry '${entry}'`);
      }
    }
  }

  // --- Test 7: category minimums ---
  for (const cat of VALID_CATEGORIES) {
    const n = cards.filter((c) => c.category === cat).length;
    if (n < 20) fail(`[7 category] '${cat}' has ${n} cards (need ≥20)`);
  }

  if (errors.length) {
    console.error(`lint:cards FAILED — ${errors.length} problem(s):`);
    for (const e of errors) console.error('  ' + e);
    process.exit(1);
  }
  console.log(`lint:cards OK — ${cards.length} cards, all checks 1–8 pass.`);
}

main();
