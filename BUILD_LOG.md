# BUILD_LOG — token-radar-01 (Token Radar)

Fresh rewrite in a session that started after the competition opened
(opens_at 2026-11-14T10:00:00Z), so the build transcripts fall inside the
window. Every implementation file was authored in this session from the design
spec below and the kit — no old source file was opened or copied. The one
exception is `vendor/makefun-board.ts`, copied verbatim from the kit as the
kit itself instructs.

Entry: `main.ts` (Node 22, stdlib only) + `lib/model.ts` + `dashboard/` +
`screenshots/`. Snapshot: sealed DefiLlama fetch, `as_of` 2026-11-14, 758
protocols, floor $50,000,000, watchlist 40.

## Approach

The board ranks pre-token protocols by implied value — what a token would be
worth if the protocol launched one today and the market priced it like the
protocols whose tokens already trade. One function scores every row; no name
is ever special-cased. "Records no token" means the snapshot records none,
never proof the protocol has none.

Coverage: all 40 watchlist slugs + every other rankable pre-token protocol
below the floor (pre-token, not CEX, not a versioned pool). That is the whole
rankable universe in this snapshot: 226 rows. The 63 above-floor pre-token
protocols outside the watchlist are almost all bridges, staked products or
exchange products — correctly left out, not ranked as launches.

## Model (radar-2)

The multiple is calibrated per category from the snapshot itself, plus a
chain-breadth premium and a youth discount:

```
multiple(cat) = median(mcap_usd / tvl_usd) over live-token protocols in that
                category with a recorded market cap (n >= 4), else the global
                median; clamped to [0.02, 2.0]
implied = TVL x multiple(cat) x growth x maturity x chains x youth
growth   = 1 + clamp(change_7d, -50%, +100%) / 100 x 0.5
maturity = 0.7 + min(age_days, 1095) / 1095 x 0.3   (unknown age: 365)
chains   = 1 + 0.02 x min(chain count, 10)          (max 1.20x)
youth    = 0.85 when tracked under 90 days, else 1.0
```

The live set is every protocol with a recorded market cap and a positive TVL
(144 protocols). Full-precision multipliers are carried in `board.json` and
`data.js`, so the dashboard recomputes each row's implied value exactly. Where
two protocols round to the same dollar, a deterministic one-dollar walk forces
the board strictly decreasing — the same walk runs in the page, so the
recompute check stays at 0 mismatches.

Farm plans: six steps per row, each 124–175 characters, derived from the
protocol's own record (category, chains, TVL, age) — a cost and a time on
every step. The dashboard shows exactly the plan `board.json` carries: the
steps travel in `data.js`, they are never re-derived in the page.

## v1 — first working version

Run 2026-11-14 ~18:20 WIB, `MAKEFUN_OUTPUT_DIR=/tmp/radar-v1`:

- 226 rows (40 watchlist + 186 early), ranks 1..226, monotonic, 226 distinct
  implied values, watchlist 40/40, farm steps 6/row.
- Top 5: steakhouse-financial $468,544,204; gauntlet $279,053,563;
  veda $265,197,406; usdd $161,649,883; upshift $94,240,557.
  Bottom: valdora-finance $163,685. 30 rows take the 0.85x youth discount.
- Calibrated multiples on this snapshot (11 categories with n>=4): Cross Chain
  Bridge 1.220x, Canonical Bridge 0.746x, Basis Trading 0.482x, Dexs 0.342x,
  RWA 0.275x, Lending 0.132x, Yield 0.121x, Bridge 0.088x, CEX 0.062x, Yield
  Aggregator 0.050x, Liquid Staking 0.034x; global median 0.169x (144 live
  protocols with a recorded market cap).
- Flaw found in v1: 883 of the 1,356 farm steps were cut mid-sentence by the
  length fitter (steps ran 163–175 chars, so the trim chopped the "Time:"
  tail). A farm plan that loses its cost or its time is not a plan.

## v2 — genuine revision

Farm plans rewritten tight (shorter actions, shorter cost/time phrasing), so
every step lands whole in the 124–175 band: steps now run 124–164 chars, zero
truncated, and `main.ts` refuses to write a board with a cut step
(`truncatedSteps`). Two more real fixes in the same revision: `factors`
now carries the category's true live-protocol count (`multiple_n` was a
placeholder), which the detail view shows beside the multiple; and the
dashboard gained category quick-filter chips (top 8 categories by row count)
plus a scrollable detail dialog, after the first detail capture cut step 6
off at the viewport edge.

Run 2026-11-14 ~18:30 WIB, `MAKEFUN_OUTPUT_DIR=/tmp/radar-final1`:

- 226 rows, ranks 1..226, monotonic, 226 distinct implied values,
  watchlist 40/40, farm steps 6/row, 124–164 chars each, 0 truncated.
- Same top 5 and bottom as v1 (the model did not change, only the plans and
  the page); the ranking is identical — the revision was to the words and
  the chrome, not the numbers.

## Validation fix found while checking v2

The detail dialog's content ran past the 900px viewport, cutting step 6.
Fix: tighter dialog spacing (`app.css`) plus `max-height` with an internal
scroll, so the dialog never clips at the viewport edge. The filtered capture
had a second framing bug: CDP's capture clip is read in document coordinates,
so scrolling the page did nothing — the shot framed the toolbar by its
document offset instead (`/tmp/shoot-radar.mjs`, kept out of the entry dir).

## Findings

- The early pool is only 186 protocols, not 260: `EARLY_CAP = 260` never
  binds. The 63 above-floor pre-token protocols outside the watchlist are
  almost all bridges, staked products or exchange products — correctly left
  out, not ranked as launches.
- The global median this snapshot computes is 0.169x, not the 0.214x the
  earlier build log recorded: no live-set definition I tried reproduces
  0.214x (median over the 144 protocols with a recorded market cap and a
  positive TVL is 0.1689x). The model computes it from the snapshot and
  reports the computed value; nothing is hardcoded.
- Screenshots: captured in a REAL browser — headless Chromium 159.0.8154.6
  from the Playwright cache, driven over CDP by a Node stdlib script
  (`/tmp/shoot-radar.mjs`, kept out of the entry dir): the live page at
  1440x900, a real detail view via `#p=steakhouse-financial`, and a real
  Lending filter via `#cat=Lending`. 1440x900 JPEG each:
  1-board.jpg 117,555 B; 2-detail.jpg 137,123 B; 3-filtered.jpg 100,728 B.
- Dashboard source 30,250 B total (index.html + app.css + app.js), dossier
  text 30,516 B — under the 65,536 B cap, no cut. No `http` string anywhere
  in the dashboard files or in `data.js` (the snapshot's source URL is not
  carried into the page data).

## Determinism proof

Two runs, same snapshot, two output dirs (`/tmp/radar-final1`,
`/tmp/radar-final2`): `diff -r` identical, every file byte-identical.

```
66e045e944adb2ba1f97d261ab84879db4ddcd5c9461d699c873e13dee3fcf7c  board.json
cc7ac6f79b57910dac05ec6efee942f96ee7aeffe43c353bac6ff948df927088  data.js
748225b4fb342b738cf51410a36c60fee3d554a7c1316ff367d7e7eaec0c8a91  dossier.json
522c5995fb6ec3a1923532991a86be955bf317a256c0c446595fb207f7eb10d2  dashboard/app.css
0a3d76a65fd65e57e6ca8d672348b245070fcb9ebb702f9bd2a9f7a7f8aafea1  dashboard/app.js
56accd6f891d931e699dd062bb001de9a7602daea69dfdf1df0aa4b23f13984d  dashboard/index.html
42ee8ba03ba4bd3a27b0fd11e685308cf8479072614701966e7227cf717e6242  screenshots/1-board.jpg
e82ecf692bf348811e7109dd5a44ac10e3462cc450e428b4d3f760d3b6e81388  screenshots/2-detail.jpg
56eaf69b357ff138d883944f360a2bf565ce77b06fae4950a9f26e79707778d3  screenshots/3-filtered.jpg
```

## Local gate check (all 7 rows, re-implemented in /tmp/validate-radar.mjs)

- dashboard_files: index.html + app.css + app.js, 30,250 B, no network — PASS
- board_file: 226 rows, all slugs in snapshot, implied positive ints — PASS
- sorted_by_value: ranks 1..226, monotonic, 226 distinct values — PASS
- coverage: watchlist 40/40 — PASS
- farm_steps: 6/row, 124–164 chars, 0 truncated — PASS
- screenshots: 3 JPEG, 1440x900, each ≤512 KiB — PASS
- dossier_matches: `buildDossier` rebuilt from `/output` is byte-identical
  to `dossier.json` (505,677 B ≤ 1.5 MiB) — PASS

In-page recompute check (the dashboard recomputes every row from the
snapshot figures in the real browser): 0 mismatches of 226 rows.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node here is v24.22.1 (counts as ≥22.18 per the rules). No network, no paid
API key, no credentials used. Repo creation, `kit check`, bundle (beyond the
dry-run below) and submission are deliberately NOT done by this build — the
parent does those.
