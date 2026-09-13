import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  dailySeed,
  buildDeck,
  newRun,
  step,
  applyChoice,
  initialMeters,
  balancingPolicy,
  isOpenerCard,
  maxAbsDelta,
} from '../web/src/engine';
import cards from '../data/cards.json';

describe('engine units', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
    const c = mulberry32(43);
    expect(c()).not.toBe(seqA[0]);
  });

  it('same seed produces identical card sequence across fresh runs', () => {
    const d1 = buildDeck(cards as never[], 12345).map((c) => c.id);
    const d2 = buildDeck(cards as never[], 12345).map((c) => c.id);
    expect(d1).toEqual(d2);
    const d3 = buildDeck(cards as never[], 999).map((c) => c.id);
    expect(d3).not.toEqual(d1);
  });

  it('daily seed derives from UTC date and is stable within a day', () => {
    const morning = new Date(Date.UTC(2026, 8, 26, 1, 0, 0));
    const evening = new Date(Date.UTC(2026, 8, 26, 23, 59, 59));
    const nextDay = new Date(Date.UTC(2026, 8, 27, 0, 0, 1));
    expect(dailySeed(morning)).toBe(20260926);
    expect(dailySeed(evening)).toBe(20260926);
    expect(dailySeed(nextDay)).toBe(20260927);
  });

  it('meters clamp to [0,100]; death fires exactly at the bound', () => {
    const { meters, deaths } = applyChoice({ C: 5, A: 50, R: 50, T: 50 }, { C: -20 });
    expect(meters.C).toBe(0);
    expect(deaths).toEqual(['C']);
    const over = applyChoice({ C: 95, A: 50, R: 50, T: 50 }, { C: 20 });
    expect(over.meters.C).toBe(100);
    expect(over.deaths).toEqual(['C']);
    const mid = applyChoice(initialMeters(), { C: 20 });
    expect(mid.meters.C).toBe(70);
    expect(mid.deaths).toEqual([]);
  });

  it('TENURE fires after surviving 40 cards', () => {
    // Gentle custom deck: ±0 oscillates, never dies.
    const calm = {
      id: 't', category: 'evals', speaker: 'S', prompt: 'x'.repeat(100),
      choiceA: { label: 'a', effects: { C: 5, A: -5 } },
      choiceB: { label: 'b', effects: { C: -5, A: 5 } },
    };
    const deck = Array.from({ length: 45 }, (_, i) => ({ ...calm, id: `t${i}` }));
    let s = newRun(deck as never[], 7);
    for (let i = 0; i < 40; i++) {
      s = step(s, i % 2 === 0 ? 'A' : 'B');
    }
    expect(s.over).toBe(true);
    expect(s.ending).toBe('TENURE');
    expect(s.index).toBe(40);
  });

  it('opener helpers behave', () => {
    for (const c of cards as never[]) {
      expect(maxAbsDelta(c as never)).toBeGreaterThan(0);
    }
    // At least the helper runs over the whole deck without throwing.
    const flags = (cards as never[]).map((c) => isOpenerCard(c as never));
    expect(flags.length).toBe((cards as unknown[]).length);
  });

  it('balancing policy prefers the less extreme option', () => {
    const card = {
      id: 'x', category: 'evals', speaker: 'S', prompt: 'x'.repeat(100),
      choiceA: { label: 'a', effects: { C: 20 } },
      choiceB: { label: 'b', effects: { C: -5 } },
    };
    // Meters high on C: +20 kills toward 100, -5 is safer.
    expect(balancingPolicy(card as never, { C: 90, A: 50, R: 50, T: 50 }, mulberry32(1))).toBe('B');
  });
});
