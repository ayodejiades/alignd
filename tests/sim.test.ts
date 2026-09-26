import { describe, it, expect } from 'vitest';
import { simulateRun, randomPolicy, mulberry32 } from '../web/src/engine';
import cards from '../data/cards.json';

const RUNS = 2000;

function runBatch() {
  const out: { ending: string; survived: number }[] = [];
  for (let i = 0; i < RUNS; i++) {
    const r = simulateRun(cards as never[], 1000 + i, randomPolicy, mulberry32(5000 + i));
    out.push({ ending: r.ending, survived: r.survived });
  }
  return out;
}

describe('simulation — §9 tests 9–12 (uniform random policy)', () => {
  const results = runBatch();
  const sorted = [...results].map((r) => r.survived).sort((a, b) => a - b);
  const median = (sorted[RUNS / 2 - 1] + sorted[RUNS / 2]) / 2;

  it('9: median run length between 16 and 34 cards', () => {
    expect(median).toBeGreaterThanOrEqual(16);
    expect(median).toBeLessThanOrEqual(34);
  });

  it('10: P(run ends before 8 cards) < 0.05', () => {
    const p = results.filter((r) => r.survived < 8).length / RUNS;
    expect(p).toBeLessThan(0.05);
  });

  it('11: all 10 endings reachable; no single ending exceeds 35%', () => {
    const counts = new Map<string, number>();
    for (const r of results) counts.set(r.ending, (counts.get(r.ending) ?? 0) + 1);
    const expected = [
      'OUTCOMPETED', 'LOSS_OF_CONTROL', 'CATASTROPHE', 'PARALYSIS',
      'INSOLVENT', 'OVERCAPITALISED', 'NATIONALISED', 'UNCHECKED',
      'COMPOUND_FAILURE', 'TENURE',
    ];
    for (const e of expected) {
      expect(counts.get(e) ?? 0, `ending ${e} unreachable`).toBeGreaterThan(0);
    }
    for (const [e, n] of counts) {
      expect(n / RUNS, `ending ${e} dominates`).toBeLessThanOrEqual(0.35);
    }
  });

  it('12: P(TENURE) between 2% and 12%', () => {
    const p = results.filter((r) => r.ending === 'TENURE').length / RUNS;
    expect(p).toBeGreaterThanOrEqual(0.02);
    expect(p).toBeLessThanOrEqual(0.12);
  });
});
