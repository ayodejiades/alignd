#!/usr/bin/env python3
"""Soften NON-forced axes on forced cards to cut background volatility.

For each non-pool card, values on meters that are NOT same-sign-forced
are scaled by FACTOR (default 0.65), rounded half away from zero,
clamped to abs [5,20], signs and zeros preserved. Forced-axis values
untouched. Pool cards (max|d| <= 8) skipped.
Non-uniform scaling CAN flip orderings -> run lint after and fix stragglers.
Usage: python3 scripts/tune-soften.py [--apply] [--factor F]
"""
import json
import sys

OPENER_MAX = 8
METERS = ("C", "A", "R", "T")
# Floor: never cool a card to max|d| <= 9. Cooling to <= OPENER_MAX would
# silently draft mid-game cards into the opener pool (which must stay
# deliberate, not accidental). Cards already at max|d| <= 9 are skipped.


def maxabs(card):
    m = 0
    for side in ("choiceA", "choiceB"):
        for k in METERS:
            m = max(m, abs(card[side]["effects"].get(k, 0)))
    return m


def forced_axes(card):
    out = set()
    for k in METERS:
        a = card["choiceA"]["effects"].get(k, 0)
        b = card["choiceB"]["effects"].get(k, 0)
        if a != 0 and b != 0 and (a > 0) == (b > 0):
            out.add(k)
    return out


def rhalf(x: float) -> int:
    return int(x + 0.5) if x >= 0 else -int(-x + 0.5)


def main():
    apply = "--apply" in sys.argv
    factor = float(sys.argv[sys.argv.index("--factor") + 1]) if "--factor" in sys.argv else 0.65
    with open("data/cards.json") as f:
        cards = json.load(f)
    plan = []
    for card in cards:
        if maxabs(card) <= 9:
            plan.append((card["id"], None))
            continue
        axes = forced_axes(card)
        changes = {}
        for side in ("choiceA", "choiceB"):
            for k, v in card[side]["effects"].items():
                if k not in axes and v != 0:
                    nv = rhalf(abs(v) * factor)
                    nv = max(5, min(20, nv))
                    nv = nv if v > 0 else -nv
                    if nv != v:
                        changes[(side, k)] = (v, nv)
        # Floor guard: if cooling would leave max|d| <= OPENER_MAX, the card
        # would join the opener pool — skip it instead.
        if changes:
            vals = []
            for side in ("choiceA", "choiceB"):
                for k, v in card[side]["effects"].items():
                    vals.append(changes.get((side, k), (v, v))[1])
            if max(abs(v) for v in vals) <= OPENER_MAX:
                changes = {}
        plan.append((card["id"], changes))

    n = sum(1 for _, ch in plan if ch)
    print(f"factor={factor} cards-changed={n}")
    if not apply:
        for pid, ch in plan:
            if ch:
                print(f"  {pid}: " + ", ".join(f"{s}.{k} {o}->{nw}" for (s, k), (o, nw) in ch.items()))
        print("(dry run; pass --apply to write)")
        return

    with open("data/cards.json") as f:
        text = f.read()
    blocks = text.split('    "id": "')
    assert len(blocks) - 1 == len(cards)
    out = [blocks[0]]
    for i, card in enumerate(cards):
        blk = '    "id": "' + blocks[i + 1]
        pid, changes = plan[i]
        cid = card["id"]
        assert blk.startswith('    "id": "' + cid + '"'), "order " + cid
        if changes:
            lines = blk.split("\n")
            for (side, k), (ov, nv) in changes.items():
                old, new = f'"{k}": {ov}', f'"{k}": {nv}'
                nrep = 0
                for li, ln in enumerate(lines):
                    if f'"{side}"' in ln and old in ln:
                        lines[li] = ln.replace(old, new, 1)
                        nrep += 1
                assert nrep == 1, f"{pid}.{side}.{k}: {nrep}x"
            blk = "\n".join(lines)
        out.append(blk)
    with open("data/cards.json", "w") as f:
        f.write("".join(out))
    print("wrote data/cards.json")


main()
