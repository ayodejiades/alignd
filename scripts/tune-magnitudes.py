#!/usr/bin/env python3
"""Magnitude redistribution: heat forced cards, cool opposing cards.

Uniform per-card scaling preserves orderings, so lint dominance/cost
checks are safe by construction (verified by lint after).
Opener-pool cards (max|d| <= 8) are skipped to protect test 33.
Usage: python3 scripts/tune-magnitudes.py [--apply] [--forced N] [--calm N]
"""
import json
import sys

FORCED_TARGET = 17
# CALM_TARGET must stay ABOVE the opener threshold (OPENER_MAX_DELTA = 8
# in engine.ts): cooling calm cards to <=8 silently drafts them into the
# opener pool, which is meant to be deliberate, not accidental.
CALM_TARGET = 9
OPENER_MAX = 8
METERS = ("C", "A", "R", "T")


def maxabs(card):
    m = 0
    for side in ("choiceA", "choiceB"):
        for k in METERS:
            v = abs(card[side]["effects"].get(k, 0))
            m = max(m, v)
    return m


def is_forced(card):
    for k in METERS:
        a = card["choiceA"]["effects"].get(k, 0)
        b = card["choiceB"]["effects"].get(k, 0)
        if a != 0 and b != 0 and (a > 0) == (b > 0):
            return True
    return False


def rhalf(x: float) -> int:
    # round half away from zero
    return int(x + 0.5) if x >= 0 else -int(-x + 0.5)


def main():
    apply = "--apply" in sys.argv
    forced_t = int(sys.argv[sys.argv.index("--forced") + 1]) if "--forced" in sys.argv else FORCED_TARGET
    calm_t = int(sys.argv[sys.argv.index("--calm") + 1]) if "--calm" in sys.argv else CALM_TARGET

    with open("data/cards.json") as f:
        cards = json.load(f)

    plan = []
    for card in cards:
        cur = maxabs(card)
        if cur <= OPENER_MAX:
            plan.append((card["id"], "skip-opener", cur, None))
            continue
        forced = is_forced(card)
        target = forced_t if forced else calm_t
        factor = target / cur
        newfx = {}
        for side in ("choiceA", "choiceB"):
            newfx[side] = {}
            for k, v in card[side]["effects"].items():
                nv = rhalf(abs(v) * factor)
                nv = max(5, min(20, nv))
                newfx[side][k] = nv if v > 0 else -nv
        plan.append((card["id"], "forced" if forced else "calm", cur, newfx))

    n_forced = sum(1 for p in plan if p[1] == "forced")
    n_calm = sum(1 for p in plan if p[1] == "calm")
    n_skip = sum(1 for p in plan if p[1] == "skip-opener")
    print(f"forced={n_forced} calm={n_calm} skip-opener={n_skip} total={len(plan)}")
    for pid, kind, cur, newfx in plan:
        if kind == "skip-opener":
            print(f"  SKIP {pid} (max {cur})")
        else:
            ma = max(abs(v) for s in newfx.values() for v in s.values())
            print(f"  {kind.upper()} {pid} max {cur}->{ma}")

    if not apply:
        print("(dry run; pass --apply to write)")
        return

    # Block-scoped text replacement to preserve file formatting.
    with open("data/cards.json") as f:
        text = f.read()
    blocks = text.split('    "id": "')
    assert len(blocks) - 1 == len(cards), "card block split mismatch"
    out = [blocks[0]]
    for i, card in enumerate(cards):
        blk = '    "id": "' + blocks[i + 1]
        pid, kind, cur, newfx = plan[i]
        cid = card["id"]
        assert blk.startswith('    "id": "' + cid + '"'), "block order mismatch " + cid
        if newfx:
            for side in ("choiceA", "choiceB"):
                for k, nv in newfx[side].items():
                    ov = card[side]["effects"][k]
                    old = f'"{k}": {ov}'
                    new = f'"{k}": {nv}'
                    # scope to the choice line to avoid cross-choice collisions
                    lines = blk.split("\n")
                    nrep = 0
                    for li, ln in enumerate(lines):
                        if f'"{side}"' in ln and old in ln:
                            lines[li] = ln.replace(old, new, 1)
                            nrep += 1
                    assert nrep == 1, f"{pid}.{side}.{k}: replaced {nrep}x"
                    blk = "\n".join(lines)
        out.append(blk)
    with open("data/cards.json", "w") as f:
        f.write("".join(out))
    print("wrote data/cards.json")


main()
