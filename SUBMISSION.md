# SUBMISSION: alignd (Mangrove Game-night, Tabletop)

**One-line pitch:** a 100-card game about running a frontier AI lab, where every decision moves four meters and either extreme kills you.

## Experience it two ways

1. **Digital companion (five seconds):** open https://ayodejiades.github.io/alignd/ (first card in under two seconds, dead in about twenty cards, verdict, replay. Zero install, offline after first load).
2. **Tabletop (the submission):** print `dist/deck-color-a4.pdf` (or `-letter`; mono editions for laser printers), cut along the 4 mm gutters, shuffle. One-sheet rules in `dist/rules-a4.pdf`. Cards measure 63 × 88 mm; the QR on the title card and rules sheet points at the URL above.

## Track

**Tabletop**, with the web runner as the front door: both render from the same `data/cards.json`, so the print deck and the browser game are provably the same game, and an async reviewer can play the whole arc in one click before ever touching scissors.

## Fun

A run is twenty dilemmas in three minutes, and every card is engineered to have no right answer, only an answer that is right given your current meters. Selling out to the sovereign fund is suicide at Runway 70 and survival at Runway 12. The first five cards are drawn from a low-delta opener pool so the hook lands before the deaths do, input locks during transitions so fast clicks never eat a card, and the deterministic daily seed means strangers in the review pool all play the same shuffle and can compare scars.

## AI-risk relevance

The meters are the argument: Capability, Alignment, Runway, Trust, each lethal at both ends. The sharpest ending is Trust-100 UNCHECKED: winning the trust game dissolves oversight and the programme goes black, which is the thesis of the whole deck stated as a game over. Every verdict screen names the specific failure mode the run demonstrated (racing dynamics, evaluation gaps, oversight collapse, funding capture), so the relevance score is won where the reviewer is already reading closely.

## Replayability

One hundred cards across five categories of twenty, a stratified shuffle that never deals one category more than twice in a row, a shared daily deck plus Free Play, and a spoiler-free share string (outcome, cards survived, seed; never card text). Survival is rare but real: random play reaches Tenure ~4% of the time, balancing play survives longer, and no single ending dominates either distribution.

## AI-usage disclosure

Model-assisted: card drafting (all 100 dilemmas were drafted with model help against the no-dominant-choice lint, which rejected the morality tests), engine/runner/print code, and test scaffolding. Human: design direction (the institutional-placard look, the telemetry figure, inverted breakout cards), the content rule itself, balance tuning (opener pool, delta bands, simulation targets), verdict-screen writing, and playtesting. The final call on every card and every number was human.

## Honest limitations

No backend, so no global leaderboard and no "N% chose B"; both were cut rather than faked. The balancing-policy simulation approximates real play; only playtesting catches effectively-always-right cards the lint cannot see. The mono edition distinguishes categories by code text alone. Duplex backs will drift on home printers, so backs are optional for play. Demo video: screen beats are rendered; the physical-deck act awaits camera footage.
