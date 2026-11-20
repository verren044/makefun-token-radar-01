# Token Radar — token-radar-01

[![make.fun bounty](https://make.fun/bounties/token-radar-01/badge/bounty)](https://make.fun/bounties/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun rank](https://make.fun/bounties/token-radar-01/badge/rank)](https://make.fun/bounties/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![make.fun reward](https://make.fun/bounties/token-radar-01/badge/reward)](https://make.fun/bounties/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that reads a sealed snapshot of the DefiLlama protocol
index and ranks every protocol that records no token yet by what its launch
would be worth, each with the steps to farm it. The winning dashboard is
featured on make.fun.

## The model (radar-4)

Each pre-token protocol is priced the way the market already prices the
protocols whose tokens trade: by the market-cap-over-TVL multiple of its
category.

```
multiple(cat) = median(mcap_usd / tvl_usd) over live-token protocols in that
                category with a recorded market cap (n >= 4), else the global
                median; clamped to [0.02, 2.0]
implied = round(TVL x multiple(cat) x growth x maturity x chains x youth)
growth   = 1 + clamp(change_7d, -50%, +100%) / 100 x 0.5
maturity = 0.7 + min(age_days, 1095) / 1095 x 0.3   (unknown age: 365 days)
chains   = 1 + 0.02 x min(chain count, 10)          (max 1.20x)
youth    = 0.85 when tracked under 90 days, else 1.0
```

No name is ever special-cased: one function scores every row, and "records
no token" is the snapshot's record — neither a market cap nor a token symbol
is recorded for the protocol — never proof the protocol has none.

Calibrated multiples on this snapshot (11 categories with n >= 4 live
protocols; every other category is priced at the global median):

| Category | Multiple | Live n |
| --- | --- | --- |
| Cross Chain Bridge | 1.220x | 4 |
| Canonical Bridge | 0.746x | 8 |
| Basis Trading | 0.482x | 8 |
| Dexs | 0.342x | 11 |
| RWA | 0.275x | 9 |
| Lending | 0.132x | 15 |
| Yield | 0.121x | 13 |
| Bridge | 0.088x | 8 |
| CEX | 0.062x | 11 |
| Yield Aggregator | 0.050x | 5 |
| Liquid Staking | 0.034x | 11 |

Global median: **0.1689x** (144 live protocols with a recorded market cap
and positive TVL).

Validation is walk-forward, not in-sample: the dated live set (106
protocols with a listing date) is split into three expanding folds by
listing-date quartile, each candidate calibrated only on protocols listed
before the cutoff and scored on protocols listed after it. Radar-2 (v1)
keeps the board with a mean held-out market-cap Spearman of **0.235**; the
held-out ratio Spearman is ≈ 0 (−0.021), so the ranking is carried by TVL
scale, not by the ratio — the board shows the fold table, the per-candidate
comparison and the bootstrap rank ranges (200 refits, median width 59,
3 tight rows) so that honesty is visible on every row.

Fitted launch pricing is the second estimate on every row. An OLS fit of
log market cap on log TVL, log age, chain count and 7-day change over 128
live protocols (15 zero-market-cap protocols left out), with shrunk
per-category residual effects, gives R² **0.216** and residual SD **2.05**
log points. Coefficients: intercept 7.613, log TVL 0.514, log age −0.158,
chains 0.044, change −0.039. As the sixth walk-forward candidate the
regression loses the ranking test (0.194 vs 0.235) but is the first to rank
the ratio (0.357 vs −0.021), so the board keeps radar-2 and every row
carries the fitted price as a second, weaker estimate, never the rank.

Coverage accounts for every protocol in the snapshot: 758 = 226 ranked +
416 live-token + 42 CEX + 11 versioned + 63 above-floor + 0 other.

| Snapshot | Ranked rows | Farm plans | Live-token set aside | Watchlist | Global multiple | Fitted R² | Walk-forward mean Spearman |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 758 | 226 | 226 | 24 | 40 | 0.1689x | 0.216 | 0.235 |

## Layout

- `main.ts` — entrypoint, Node 22, standard library only
- `lib/model.ts` — model, board builder, farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library, from the kit verbatim
- `dashboard/` — `index.html`, `app.css`, `app.js`
- `screenshots/` — board, detail, filtered

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18 or later. No network, no paid key, no credentials. Writes
`board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json`.
Same bytes on every run.

## The board

226 rows (40 watchlist + 186 early). The 24 live-token protocols are set
aside with their market caps shown, never mixed into the ranking. Every row
carries six farm steps with a cost and a time, and a FARM / THIN / SKIP
verdict priced by implied value per dollar staked (76 / 75 / 75).

---

Entered on make.fun with referral `vvz66fvh`.
