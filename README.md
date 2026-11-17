# Token Radar — token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/verren044/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/verren044/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of the DefiLlama protocol index
and ranks every protocol that records no token yet by what its launch would be
worth, each with the steps to farm it. The winning dashboard is featured on
make.fun; this entry's job is to answer "which pre-token protocol is worth
farming next, and what do I do about it".

## The model (radar-3)

One function scores every row, from the snapshot's own figures:

```
multiple(cat) = median(mcap_usd / tvl_usd) over live-token protocols in the
                category (n >= 4), else the global median; clamped [0.02, 2.0]
implied = round(tvl x multiple x growth x maturity x chains x youth)
  growth   = 1 + clamp(change_7d, -50, +100) / 100 x 0.5
  maturity = 0.7 + min(age_days, 1095) / 1095 x 0.3   (unknown age: 365 days)
  chains   = 1 + 0.02 x min(chain count, 10)
  youth    = 0.85 while tracked under 90 days, else 1.0
```

No protocol name is special-cased. "Records no token" is the snapshot's record,
never proof a protocol has none.

Calibrated multiples on this snapshot (live-token median mcap/TVL, n>=4):
Cross Chain Bridge 1.220x, Canonical Bridge 0.746x, Basis Trading 0.482x,
Dexs 0.342x, RWA 0.275x, Lending 0.132x, Yield 0.121x, Bridge 0.088x,
CEX 0.062x, Yield Aggregator 0.050x, Liquid Staking 0.034x; global median
0.169x. Every other category is priced at the global median.

Validation (walk-forward, 3 expanding folds by listing date, 106 dated live
protocols): the model is calibrated only from protocols listed before each
cutoff and tested on held-out protocols it never saw in the fit. Mean held-out
mcap Spearman 0.235, ratio Spearman ≈ 0 — mcap/TVL itself is not predictable
from these figures, so the ranking is carried by TVL scale; the board shows the
full fold table, per-candidate comparison and bootstrap rank ranges (p10–p90,
200 seeded refits) in its "Model validation" panel. Every row also carries a
netted farm verdict — FARM, THIN or SKIP — from implied value per dollar staked.

## Layout

- `main.ts` — the entrypoint (Node 22, standard library only)
- `lib/model.ts` — the model, the board builder and the farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library, from the kit verbatim
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`
- `screenshots/` — the board, a protocol detail view and a filtered view

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18 or later. No network, no paid API key, no credentials. The program
writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json`
into the output directory, and writes the same bytes on every run.

## The board

226 rows on this snapshot: the 40 watchlist protocols plus 186 pre-token
protocols below the watchlist floor. Live-token protocols are set aside with
their market caps shown, never mixed into the ranking. Every row carries six
farm steps with a cost and a time.

See `BUILD_LOG.md` for the build history, the validation numbers and the
determinism proof.

---

<sub>Entered on [make.fun](https://make.fun/?ref=vvz66fvh&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
