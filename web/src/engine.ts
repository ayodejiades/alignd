/**
 * alignd engine — pure TypeScript, no DOM, no network.
 * Meters C/A/R/T in [0,100], start at 50. Death exactly at 0/100.
 */
export type MeterKey = 'C' | 'A' | 'R' | 'T';
export type Meters = Record<MeterKey, number>;
export type Effects = Partial<Record<MeterKey, number>>;

export interface Choice {
  label: string;
  effects: Effects;
}
export interface Card {
  id: string;
  category: string;
  speaker: string;
  prompt: string;
  choiceA: Choice;
  choiceB: Choice;
}

export const METERS: readonly MeterKey[] = ['C', 'A', 'R', 'T'];
export const START_VALUE = 50;
export const MIN_VALUE = 0;
export const MAX_VALUE = 100;
export const TENURE_AFTER = 40;
export const OPENER_COUNT = 5;
// Tightened from §11.2's ≤10 to ≤8: 5×10=50 could kill from 50 on the
// fifth card, but 5×8=40 can never reach a bound — test 33's structural guarantee.
export const OPENER_MAX_DELTA = 8;

export function initialMeters(): Meters {
  return { C: 50, A: 50, R: 50, T: 50 };
}

/** mulberry32 PRNG seeded from an integer. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Daily seed = YYYYMMDD in UTC. */
export function dailySeed(date: Date = new Date()): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return y * 10000 + m * 100 + d;
}

export function maxAbsDelta(card: Card): number {
  let m = 0;
  for (const side of [card.choiceA, card.choiceB] as const) {
    if (!side?.effects) continue;
    for (const k of METERS) {
      const v = side.effects[k] ?? 0;
      if (Math.abs(v) > m) m = Math.abs(v);
    }
  }
  return m;
}

export function isOpenerCard(card: Card): boolean {
  return maxAbsDelta(card) <= OPENER_MAX_DELTA;
}

function shuffleInPlace<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Stratified shuffle: no category appears more than twice consecutively.
 * Repair pass swaps the offending card with a later card of another category.
 */
export function stratifiedShuffle(cards: Card[], rand: () => number): Card[] {
  const arr = shuffleInPlace([...cards], rand);
  for (let i = 2; i < arr.length; i++) {
    if (arr[i].category === arr[i - 1].category && arr[i].category === arr[i - 2].category) {
      let swap = -1;
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[j].category !== arr[i].category) {
          swap = j;
          break;
        }
      }
      if (swap === -1) {
        for (let j = 0; j < i - 2; j++) {
          if (arr[j].category !== arr[i].category) {
            swap = j;
            break;
          }
        }
      }
      if (swap !== -1) {
        [arr[i], arr[swap]] = [arr[swap], arr[i]];
      }
    }
  }
  return arr;
}

/**
 * Build the run deck: first OPENER_COUNT cards from the opener pool
 * (all deltas ≤10), remainder stratified. Deterministic per seed.
 * Fallback for small decks: calmest cards by maxAbsDelta fill the opener slots.
 */
export function buildDeck(allCards: Card[], seed: number): Card[] {
  const rand = mulberry32(seed);
  const openers = allCards.filter(isOpenerCard);
  let head: Card[];
  let rest: Card[];
  if (openers.length >= OPENER_COUNT) {
    head = stratifiedShuffle(openers, rand).slice(0, OPENER_COUNT);
    const headIds = new Set(head.map((c) => c.id));
    rest = stratifiedShuffle(
      allCards.filter((c) => !headIds.has(c.id)),
      rand,
    );
  } else {
    const calm = [...allCards].sort((a, b) => maxAbsDelta(a) - maxAbsDelta(b));
    head = shuffleInPlace(calm.slice(0, Math.min(OPENER_COUNT, calm.length)), rand);
    const headIds = new Set(head.map((c) => c.id));
    rest = stratifiedShuffle(
      allCards.filter((c) => !headIds.has(c.id)),
      rand,
    );
  }
  const deck = [...head, ...rest];
  // Repair clumps across the whole deck without moving cards between
  // the opener head and the rest, so the opener guarantee holds.
  for (let i = 2; i < deck.length; i++) {
    if (deck[i].category === deck[i - 1].category && deck[i].category === deck[i - 2].category) {
      const lo = i < head.length ? 0 : head.length;
      let swap = -1;
      for (let j = i + 1; j < deck.length; j++) {
        if (j < lo) continue;
        if (deck[j].category !== deck[i].category) {
          swap = j;
          break;
        }
      }
      if (swap === -1) {
        for (let j = lo; j < i - 2; j++) {
          if (deck[j].category !== deck[i].category) {
            swap = j;
            break;
          }
        }
      }
      if (swap !== -1) {
        [deck[i], deck[swap]] = [deck[swap], deck[i]];
      }
    }
  }
  return deck;
}

export interface ApplyResult {
  meters: Meters;
  deaths: MeterKey[];
}

export function applyChoice(meters: Meters, effects: Effects): ApplyResult {
  const next: Meters = { ...meters };
  for (const k of METERS) {
    const v = next[k] + (effects[k] ?? 0);
    next[k] = Math.min(MAX_VALUE, Math.max(MIN_VALUE, v));
  }
  const deaths = METERS.filter((k) => next[k] === MIN_VALUE || next[k] === MAX_VALUE);
  return { meters: next, deaths };
}

export type EndingId =
  | 'OUTCOMPETED'
  | 'LOSS_OF_CONTROL'
  | 'CATASTROPHE'
  | 'PARALYSIS'
  | 'INSOLVENT'
  | 'OVERCAPITALISED'
  | 'NATIONALISED'
  | 'UNCHECKED'
  | 'COMPOUND_FAILURE'
  | 'TENURE';

export function endingForSingle(meter: MeterKey, value: number): EndingId {
  if (meter === 'C') return value === 0 ? 'OUTCOMPETED' : 'LOSS_OF_CONTROL';
  if (meter === 'A') return value === 0 ? 'CATASTROPHE' : 'PARALYSIS';
  if (meter === 'R') return value === 0 ? 'INSOLVENT' : 'OVERCAPITALISED';
  return value === 0 ? 'NATIONALISED' : 'UNCHECKED';
}

export interface RunState {
  meters: Meters;
  deck: Card[];
  index: number; // cards survived (choices applied)
  over: boolean;
  ending: EndingId | null;
  deadMeters: MeterKey[];
}

export function newRun(allCards: Card[], seed: number): RunState {
  return {
    meters: initialMeters(),
    deck: buildDeck(allCards, seed),
    index: 0,
    over: false,
    ending: null,
    deadMeters: [],
  };
}

export function currentCard(state: RunState): Card | null {
  if (state.over) return null;
  return state.deck[state.index] ?? null;
}

/** Apply one choice; input is locked by the caller during transitions (§11.4). */
export function step(state: RunState, side: 'A' | 'B'): RunState {
  if (state.over) return state;
  const card = state.deck[state.index];
  if (!card) {
    return { ...state, over: true, ending: 'TENURE', deadMeters: [] };
  }
  const effects = side === 'A' ? card.choiceA.effects : card.choiceB.effects;
  const { meters, deaths } = applyChoice(state.meters, effects);
  const index = state.index + 1;
  if (deaths.length >= 2) {
    return { meters, deck: state.deck, index, over: true, ending: 'COMPOUND_FAILURE', deadMeters: deaths };
  }
  if (deaths.length === 1) {
    const m = deaths[0];
    return { meters, deck: state.deck, index, over: true, ending: endingForSingle(m, meters[m]), deadMeters: deaths };
  }
  if (index >= TENURE_AFTER) {
    return { meters, deck: state.deck, index, over: true, ending: 'TENURE', deadMeters: [] };
  }
  return { meters, deck: state.deck, index, over: false, ending: null, deadMeters: [] };
}

export type Policy = (card: Card, meters: Meters, rand: () => number) => 'A' | 'B';

export const randomPolicy: Policy = (_card, _meters, rand) => (rand() < 0.5 ? 'A' : 'B');

/** Human balancing policy: pick the option minimising max distance from 50. */
export const balancingPolicy: Policy = (card, meters) => {
  const score = (effects: Effects): number => {
    let worst = 0;
    for (const k of METERS) {
      const v = Math.min(MAX_VALUE, Math.max(MIN_VALUE, meters[k] + (effects[k] ?? 0)));
      worst = Math.max(worst, Math.abs(v - 50));
    }
    return worst;
  };
  const sa = score(card.choiceA.effects);
  const sb = score(card.choiceB.effects);
  if (sb < sa) return 'B';
  return 'A';
};

export interface SimResult {
  ending: EndingId;
  survived: number;
  meters: Meters;
  seed: number;
}

export function simulateRun(allCards: Card[], seed: number, policy: Policy, rand: () => number): SimResult {
  let state = newRun(allCards, seed);
  let guard = 0;
  while (!state.over && guard < 200) {
    const card = currentCard(state);
    if (!card) break;
    state = step(state, policy(card, state.meters, rand));
    guard++;
  }
  return {
    ending: state.ending ?? 'TENURE',
    survived: state.index,
    meters: state.meters,
    seed,
  };
}

/** Share string: outcome + cards survived + seed. Never card text. ≤280 chars. */
export function shareString(ending: EndingId, survived: number, seed: number, _daily?: boolean): string {
  return `alignd: ${ending} · ${survived} cards · seed ${seed}`;
}

/** A card where both options are net-negative (sum of deltas < 0 on both sides). */
export function isBothBad(card: Card): boolean {
  const sum = (e: Effects): number => METERS.reduce((s, k) => s + (e[k] ?? 0), 0);
  return sum(card.choiceA.effects) < 0 && sum(card.choiceB.effects) < 0;
}
