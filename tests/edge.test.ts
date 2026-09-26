import { describe, it, expect } from 'vitest';
import {
  applyChoice,
  balancingPolicy,
  buildDeck,
  initialMeters,
  isOpenerCard,
  mulberry32,
  newRun,
  randomPolicy,
  simulateRun,
  step,
} from '../web/src/engine';
import cards from '../data/cards.json';

describe('edge cases — §9 tests 32–35', () => {
  it('32 simultaneous-death: two meters dying at once → COMPOUND FAILURE deterministically', () => {
    // Construct: C=15, A=80 then C-15 and A+20 on one choice.
    const deck = [
      {
        id: 'compound_01', category: 'evals', speaker: 'S', prompt: 'x'.repeat(100),
        choiceA: { label: 'trigger both', effects: { C: -15, A: 20 } },
        choiceB: { label: 'safe', effects: { C: 5, A: -5 } },
      },
    ];
    let s = newRun(deck as never[], 1);
    s = { ...s, meters: { C: 15, A: 80, R: 50, T: 50 } };
    const after = step(s, 'A');
    expect(after.over).toBe(true);
    expect(after.ending).toBe('COMPOUND_FAILURE');
    expect(after.deadMeters).toHaveLength(2);
    // Deterministic: repeat gives the same result.
    let s2 = newRun(deck as never[], 1);
    s2 = { ...s2, meters: { C: 15, A: 80, R: 50, T: 50 } };
    expect(step(s2, 'A').ending).toBe('COMPOUND_FAILURE');
  });

  it('33 no-early-death: P(death before card 6) == 0 over 2000 runs', () => {
    let early = 0;
    for (let i = 0; i < 2000; i++) {
      const r = simulateRun(cards as never[], 9000 + i, randomPolicy, mulberry32(3000 + i));
      if (r.survived < 6) early++;
    }
    expect(early).toBe(0);
  });

  it('34 human-policy-sim: balancing policy median 20–36, no ending >40%', () => {
    const RUNS = 2000;
    const results: { ending: string; survived: number }[] = [];
    for (let i = 0; i < RUNS; i++) {
      const r = simulateRun(cards as never[], 20000 + i, balancingPolicy, mulberry32(7000 + i));
      results.push({ ending: r.ending, survived: r.survived });
    }
    const sorted = results.map((r) => r.survived).sort((a, b) => a - b);
    const median = (sorted[RUNS / 2 - 1] + sorted[RUNS / 2]) / 2;
    expect(median).toBeGreaterThanOrEqual(20);
    expect(median).toBeLessThanOrEqual(36);
    const counts = new Map<string, number>();
    for (const r of results) counts.set(r.ending, (counts.get(r.ending) ?? 0) + 1);
    for (const [e, n] of counts) {
      expect(n / RUNS, `ending ${e} dominates under balancing policy`).toBeLessThanOrEqual(0.4);
    }
  });

  it('35 no-category-clumps: no category >2 consecutively over 500 shuffles', () => {
    for (let seed = 0; seed < 500; seed++) {
      const deck = buildDeck(cards as never[], seed);
      for (let i = 2; i < deck.length; i++) {
        const triple = deck[i].category === deck[i - 1].category && deck[i].category === deck[i - 2].category;
        expect(triple, `seed ${seed} clump at ${i}: ${deck[i].category}`).toBe(false);
      }
    }
  });

  it('opener guarantee: first five cards come from the calmest available pool', () => {
    // With the full deck this must be true openers; with 19 cards it is best-effort.
    const deck = buildDeck(cards as never[], 42);
    const head = deck.slice(0, 5);
    const openers = (cards as never[] as { id: string }[]).filter((c) =>
      isOpenerCard(c as never),
    ).length;
    if (openers >= 5) {
      expect(head.every((c) => isOpenerCard(c))).toBe(true);
    } else {
      expect(head).toHaveLength(5);
    }
    void applyChoice;
    void initialMeters;
  });
});
