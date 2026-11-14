# Token Radar — token-radar-01

Which pre-token protocol is worth farming next, ranked by what its token would
be worth if it launched one today.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot
at `/input/snapshot.json`, scores every pre-token protocol, and writes:

- `/output/board.json` — 226 ranked rows (the whole 40-protocol watchlist plus
  186 early finds below the $50M floor — every rankable pre-token protocol in
  the snapshot), each with an implied value in whole dollars and a 6-step farm
  plan with costs and times.
- `/output/data.js` — the same board for the dashboard, plus the 24 largest
  live-token protocols shown apart, never ranked against the board.
- `/output/dashboard/` — a static page (no network): sortable/filterable board,
  a detail view per protocol with the model's own inputs, a per-category
  multiples table, and a live-token view.
- `/output/dossier.json` — built with the kit's `vendor/makefun-board.ts`.

## The value model (radar-2)

```
multiple(cat) = median(mcap_usd / tvl_usd) over live-token protocols in that
                category with a recorded market cap (n >= 4), else the global
                median 0.214x; clamped to [0.02, 2.0]
implied = TVL × multiple(cat) × growth × maturity × chains × youth
growth   = 1 + clamp(change_7d, −50%, +100%) / 100 × 0.5
maturity = 0.7 + min(age_days, 1095) / 1095 × 0.3   (unknown age: 365 days)
chains   = 1 + 0.02 × min(chain count, 10)
youth    = 0.85 when tracked under 90 days, else 1.0
```

The multiple is what the market already pays per TVL dollar in the same
sector — Lending names trade near 0.13x TVL, Dexs near 0.34x — so a pre-token
protocol is priced like its listed peers, not like every other sector. One
function scores every protocol; no name is ever special-cased. "Records no
token" means the snapshot records none — it is not proof the protocol has
none, and nothing here predicts whether or when a token launches.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Two runs on the same snapshot write byte-identical output (see BUILD_LOG.md).
