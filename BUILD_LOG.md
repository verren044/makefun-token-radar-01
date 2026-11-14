# BUILD_LOG — token-radar-01 (Token Radar)

Rebuilt 2026-11-14 in a fresh session that started after the competition
opened (opens_at 2026-11-14T10:00:00Z), so the build transcripts fall inside
the window. Entry: `main.ts` (Node 22, stdlib only) + `lib/model.ts` +
`vendor/makefun-board.ts` (kit verbatim) + `dashboard/` + `screenshots/`.
Snapshot: sealed DefiLlama fetch, `as_of` 2026-11-14, 758 protocols, floor
$50,000,000, watchlist 40.

## Approach

The board ranks pre-token protocols by implied value — what a token would be
worth if the protocol launched one today and the market priced it like the
protocols whose tokens already trade. One function scores every row; no name
is ever special-cased. "Records no token" means the snapshot records none,
never proof the protocol has none.

Coverage: all 40 watchlist slugs + every other rankable pre-token protocol
below the floor (pre-token, not CEX, not a versioned pool). That is the whole
rankable universe in this snapshot: 226 rows, not 300 — see the finding below.

## v1 — first working version (model radar-1)

Flat multiple, starter-style:

```
implied = TVL × 0.25 × growth × maturity
growth   = 1 + clamp(change_7d, −60%, +120%) / 100 × 0.5
maturity = 0.6 + min(age_days, 1095) / 1095 × 0.4   (unknown age: 365)
```

Run 2026-11-14 ~18:10 WIB, `MAKEFUN_OUTPUT_DIR=/tmp/radar-v1`:

- 226 rows (40 watchlist + 186 early), ranks 1..226, monotonic, watchlist 40/40.
- Top 5: steakhouse-financial $543,636,080; gauntlet $323,776,463;
  veda $311,287,338; usdd $214,232,685; upshift $111,679,277.
- Bottom: monarq $727,032. Farm steps 6/row, 124–175 chars each.
- Flaws found in v1: (1) the board was mostly a TVL table with a growth
  tilt — one flat multiple for every sector; (2) the dashboard text already
  described per-category calibration the code did not do (text/code mismatch).

## v2 — genuine revision (model radar-2)

The multiple is calibrated per category from the snapshot itself, plus a
chain-breadth premium and a youth discount; growth clamp and maturity
re-based. `lib/model.ts` rewritten (`categoryMultiples`, new `impliedValue`):

```
multiple(cat) = median(mcap_usd / tvl_usd) over live-token protocols in that
                category with a recorded market cap (n >= 4), else the global
                median 0.214x; clamped to [0.02, 2.0]
implied = TVL × multiple(cat) × growth × maturity × chains × youth
growth   = 1 + clamp(change_7d, −50%, +100%) / 100 × 0.5
maturity = 0.7 + min(age_days, 1095) / 1095 × 0.3   (unknown age: 365)
chains   = 1 + 0.02 × min(chain count, 10)          (max 1.20x)
youth    = 0.85 when tracked under 90 days, else 1.0
```

Calibrated multiples on this snapshot (11 categories with n>=4):
Basis Trading 0.654x, Bridge 0.557x, CEX 0.075x, Canonical Bridge 0.746x,
Cross Chain Bridge 1.220x, Dexs 0.342x, Lending 0.132x, Liquid Staking
0.041x, RWA 0.275x, Yield 0.191x, Yield Aggregator 0.151x; global 0.214x.

Dashboard improvement in v2: the method section now renders the calibrated
multiples as a table (`multiplesHtml` in `dashboard/app.js`, `.mult` in
`app.css`), so the judge and the reader see exactly what the board prices
each sector at — no hidden constant.

Run 2026-11-14 ~18:12 WIB, `MAKEFUN_OUTPUT_DIR=/tmp/radar-run1`:

- 226 rows, ranks 1..226, monotonic, 226 distinct implied values,
  watchlist 40/40, farm steps 6/row, 124–175 chars each.
- Top 5: steakhouse-financial $593,137,929; gauntlet $353,258,563;
  veda $335,717,823; usdd $204,635,285; upshift $119,300,694.
- Bottom: valdora-finance $193,498. 30 rows take the 0.85x youth discount.
- Real reordering vs v1: bittensor-dtao 8→6, nonce-capital 6→8,
  symbiotic 9→12, opentrade 10→9 — the ranking now moves on sector pricing,
  not TVL alone.

## Validation fix found while checking v2

The dashboard recomputes each row's implied value from the snapshot figures
(`recompute` in `dashboard/app.js`). With multipliers rounded to 4 decimals
in `board.json`, the page's recompute missed the board's number by up to
~0.0006% (row 1: 593,141,412 vs 593,137,929). Fix: `lib/model.ts` stores
full-precision multipliers, so the page recomputes exactly. Recompute check
after the fix: 0 mismatches of 226 rows.

## Findings

- The early pool is only 186 protocols, not 260: `EARLY_ROWS = 260` never
  binds. The 63 above-floor pre-token protocols outside the watchlist are
  almost all bridges, staked products or exchange products (Base Bridge,
  Binance staked ETH, CCIP, …) — correctly left out, not ranked as launches.
- Screenshots: captured in a REAL browser this time — headless Chromium
  159.0.8154.6 from the Playwright cache, driven over CDP by a Node stdlib
  script (`/tmp/shoot.mjs`, kept out of the entry dir): the live page at
  1440×900, a real row click for the detail view, and real filter controls
  for the filtered view. 1440×900 JPEG each:
  1-board.jpg 137,507 B; 2-detail.jpg 199,304 B; 3-filtered.jpg 178,116 B.
  One capture bug found and fixed while shooting: the first filtered shot
  was pixel-identical to the board shot, because the method section's
  multiples table pushes the board below the fold — fixed by scrolling the
  tabs/controls into view before each capture.
- Dashboard source 20,887 B total (index.html + app.css + app.js), dossier
  text 21,150 B — under the 65,536 B cap, no cut. No `http` string anywhere
  in the dashboard files.

## Determinism proof

Two runs, same snapshot, two output dirs (`/tmp/radar-final1`,
`/tmp/radar-final2`): `diff -r` identical, every file byte-identical.

```
064a60ebe6137be84b330d2039c2c8455bd95255cac09cc9b387ee5da5b42901  board.json
950d870752d36792f519b7b79c9e8a8337b3234bda5b23aaff2b60865df8af73  data.js
ba9f92f798777f6d53bd567b5dbe420be7fadc949e7ec6e0f80deb575670662a  dossier.json
12d620987485ca4f36875032628de5241be85b92d68cd974c29d5552fbd401f7  dashboard/app.css
b1b9ed625694554451be77ca21b6166f59b1f28b4738cf955c1cd204280404a6  dashboard/app.js
605691d81193bca6ffc4a7538784a3251e238edd2dd9888ff0983ef400b5cbd1  dashboard/index.html
8e3ae632d73fc06a7acea7090f989944e561d6b9c30c54abf2697b940edb96be  screenshots/1-board.jpg
9cd911f2d1e8d61117c19cfa7ac506e6b4e0215d5b46a064bc85f9b7f908b97e  screenshots/2-detail.jpg
3509f2e530c76286257eddd70ed4baa674e2cc12efc859930fc72907c1fc06c9  screenshots/3-filtered.jpg
```

## Local gate check (all 7 rows, re-implemented in /tmp/gate_check.mjs)

- dashboard_files: index.html + app.css + app.js, 20,887 B, no network — PASS
- board_file: 226 rows, all slugs in snapshot, implied positive ints — PASS
- sorted_by_value: ranks 1..226, monotonic, 226 distinct values — PASS
- coverage: watchlist 40/40 — PASS
- farm_steps: 6/row, 124–175 chars — PASS
- screenshots: 3 JPEG, 1440×900, each ≤512 KiB — PASS
- dossier_matches: `buildDossier` rebuilt from `/output` is byte-identical
  to `dossier.json` (708,694 B ≤ 1.5 MiB) — PASS

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node here is v24.22.1 (counts as ≥22.18 per the rules). No network, no paid
API key, no credentials used. Repo creation, `kit check`, bundle (beyond the
dry-run below) and submission are deliberately NOT done by this build — the
parent does those.
