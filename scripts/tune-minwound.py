#!/usr/bin/env python3
"""Raise the minimum wound of every same-sign forced pair to N.

For each non-pool card, for each meter where both choices are nonzero
with the same sign: if min(|a|,|b|) < N, raise the smaller side to
min(N, max) — or both to N when max < N. Order-preserving-or-equalizing,
so lint dominance is safe by construction (verified by lint after).
Pool cards (max|d| <= 8) are SKIPPED to protect test 33.
Usage: python3 scripts/tune-minwound.py [--apply] [--minwound N]
"""
import json
import sys

OPENER_MAX = 8
METERS = ("C", "A", "R", "T")


def maxabs(card):
    m = 0
    for side in ("choiceA", "choiceB"):
        for k in METERS:
            m = max(m, abs(card[side]["effects"].get(k, 0)))
    return m


def main():
    apply = "--apply" in sys.argv
    N = int(sys.argv[sys.argv.index("--minwound") + 1]) if "--minwound" in sys.argv else 14
    assert 5 <= N <= 20
    with open("data/cards.json") as f:
        cards = json.load(f)
    plan = []
    for card in cards:
        if maxabs(card) <= OPENER_MAX:
            plan.append((card["id"], {}))
            continue
        changes = {}
        for k in METERS:
            a = card["choiceA"]["effects"].get(k, 0)
            b = card["choiceB"]["effects"].get(k, 0)
            if a != 0 and b != 0 and (a > 0) == (b > 0):
                lo, hi = sorted([abs(a), abs(b)])
                if lo < N:
                    if hi >= N:
                        # raise only the smaller side to N (no order flip: N <= hi)
                        side = "choiceA" if abs(a) < abs(b) else "choiceB"
                        changes[(side, k)] = N if a > 0 else -N
                    else:
                        # raise both to N (equalize; cannot create dominance)
                        changes[("choiceA", k)] = N if a > 0 else -N
                        changes[("choiceB", k)] = N if b > 0 else -N
        plan.append((card["id"], changes))

    n = sum(1 for _, ch in plan if ch)
    print(f"minwound={N} pairs-raised on {n} cards")
    if not apply:
        for pid, ch in plan:
            if ch:
                print(f"  {pid}: " + ", ".join(f"{s}.{k}->{v}" for (s, k), v in ch.items()))
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
            for (side, k), nv in changes.items():
                ov = card[side]["effects"][k]
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
