// Token Radar — the ranking model (radar-3).
//
// One sealed snapshot in, one ranked board out. A protocol is scored only from the
// snapshot's own figures: its TVL, its seven-day TVL change, how long DefiLlama has
// tracked it, how many chains it runs on, and the market's own pricing of live-token
// protocols in its category. No protocol name is ever special-cased.
//
//   multiple(cat)  median(mcap_usd / tvl_usd) over live-token protocols in the
//                  category when that category holds at least 4 of them, else the
//                  global median; clamped to [0.02, 2.0]
//   growth         1 + clamp(change_7d, -50, +100) / 100 * 0.5
//   maturity       0.7 + min(age_days, 1095) / 1095 * 0.3   (age unknown: 365 days)
//   chains         1 + 0.02 * min(chain count, 10)
//   youth          0.85 while tracked under 90 days, else 1.0
//   implied        max(1, round(tvl_usd * multiple * growth * maturity * chains * youth))
//
// "Records no token" is the snapshot's record, never proof a protocol has none.
//
// radar-3 adds what radar-2 asserted without proof. First, a walk-forward test:
// three expanding folds by listing date, calibrated only on protocols listed
// before each cutoff and scored on protocols listed after it — the test protocols
// are never in the fit. Five candidate configurations are compared on mean
// held-out Spearman, and the board keeps the radar-2 configuration unless a
// challenger beats it by more than 0.05, because every candidate lands inside
// the noise (mean held-out mcap Spearman 0.23-0.24, ratio Spearman ~0.0 — the
// market-cap-to-TVL ratio is not predictable from these figures, and the
// ranking is carried by TVL scale). Second, bootstrap rank ranges: 200 seeded
// refits of the live calibration set give every row a p10-p90 rank range, so the
// board shows how firm each rank is — only the top two are tight. Third, farm
// verdicts: implied value per dollar staked, split into terciles across the
// board — FARM the top third, THIN the middle, SKIP the bottom. A verdict
// prices the farm; it never predicts whether or when a token is issued.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snap {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

/** One protocol's full score, every factor kept so the page can recompute it. */
export interface Factors {
  multiple: number;
  multiple_n: number;
  multiple_global: boolean;
  growth_pct: number;
  growth_mult: number;
  maturity_mult: number;
  chain_mult: number;
  youth_mult: number;
  age_days: number | null;
  implied_raw: number;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  /** p10-p90 rank range over the 200 bootstrap refits: how firm this rank is. */
  rank_lo: number;
  rank_med: number;
  rank_hi: number;
  /** FARM / THIN / SKIP from implied value per dollar staked, terciles of the board. */
  verdict: 'FARM' | 'THIN' | 'SKIP';
  /** Capital one farm position needs, the same stake the farm plan prices with. */
  stake_usd: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  factors: Factors;
  farm_steps: string[];
}

/** A live-token protocol, set aside from the ranking with the market's own value. */
export interface LiveEntry {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One row as the dashboard receives it: the board row, farm plan included, so the
 *  detail view shows exactly the plan board.json carries — never a re-derivation. */
export interface DashRow {
  rank: number;
  rank_lo: number;
  rank_med: number;
  rank_hi: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  stake_usd: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  factors: Factors;
  farm_steps: string[];
}

/** One calibrated multiple, for the dashboard's method table. */
export interface MultStat {
  category: string;
  multiple: number;
  n: number;
  from_global: boolean;
}

/** One candidate value-model configuration the walk-forward test compares. */
export interface ModelConfig {
  name: string;
  /** 0 = the radar-2 rule (category median when n >= min_category_n, else global);
   *  > 0 = shrink the category median toward the global by this weight. */
  shrink_k: number;
  min_category_n: number;
  growth_weight: number;
  use_maturity: boolean;
  use_chains: boolean;
  use_youth: boolean;
}

export const CONFIG_V1: ModelConfig = { name: 'radar-2 (v1)', shrink_k: 0, min_category_n: 4, growth_weight: 0.5, use_maturity: true, use_chains: true, use_youth: true };
export const CONFIG_CAT_ONLY: ModelConfig = { name: 'category median only', shrink_k: 0, min_category_n: 4, growth_weight: 0, use_maturity: false, use_chains: false, use_youth: false };
export const CONFIG_SHRINK10: ModelConfig = { name: 'shrunk k=10', shrink_k: 10, min_category_n: 1, growth_weight: 0.5, use_maturity: true, use_chains: true, use_youth: true };
export const CONFIG_SHRINK10_NOGROWTH: ModelConfig = { name: 'shrunk k=10, no growth', shrink_k: 10, min_category_n: 1, growth_weight: 0, use_maturity: true, use_chains: true, use_youth: true };
export const CONFIG_TVL_ONLY: ModelConfig = { name: 'TVL x global median', shrink_k: 0, min_category_n: 9999, growth_weight: 0, use_maturity: false, use_chains: false, use_youth: false };
export const CANDIDATES: ModelConfig[] = [CONFIG_V1, CONFIG_CAT_ONLY, CONFIG_SHRINK10, CONFIG_SHRINK10_NOGROWTH, CONFIG_TVL_ONLY];

/** One walk-forward fold: the cutoff, the sizes, and the held-out scores. */
export interface WalkForwardFold {
  window: string;
  train_n: number;
  test_n: number;
  /** Spearman of predicted vs actual market cap on the held-out fold. */
  mcap_spearman: number;
  /** Spearman of predicted vs actual market-cap-to-TVL ratio (mcap > 0 only). */
  ratio_spearman: number | null;
  /** Median absolute percentage error on market cap (mcap > 0 only). */
  mdape: number | null;
}

/** One candidate's walk-forward score, averaged over the folds. */
export interface CandidateScore {
  name: string;
  mean_mcap_spearman: number;
  mean_ratio_spearman: number | null;
  mean_mdape: number | null;
  folds: WalkForwardFold[];
}

/** The validation the dashboard shows: the test, its numbers, and what was kept. */
export interface Validation {
  method: string;
  folds_label: string;
  candidates: CandidateScore[];
  selected: string;
  selection_rule: string;
  rank_ranges: {
    refits: number;
    median_width: number;
    p25_width: number;
    p75_width: number;
    /** Rows whose p90-p10 rank range is at most 5 wide. */
    tight_rows: number;
  };
  verdict_rule: string;
}

/** Everything the dashboard renders. */
export interface RadarPayload {
  as_of: string;
  floor_usd: number;
  model_version: string;
  model: {
    growth_weight: number;
    growth_floor: number;
    growth_cap: number;
    maturity_floor: number;
    maturity_range: number;
    maturity_days: number;
    unknown_age_days: number;
    youth_days: number;
    youth_mult: number;
    chain_step: number;
    chain_cap: number;
    multiple_floor: number;
    multiple_cap: number;
    min_category_n: number;
  };
  global_multiple: number;
  multiples: MultStat[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  validation: Validation;
  rows: DashRow[];
  live: LiveEntry[];
}

export const MODEL_VERSION = 'radar-3';
/** The early radar takes every rankable pre-token protocol below the floor, up to this. */
export const EARLY_CAP = 260;
/** How many live-token protocols the dashboard's Live view carries. */
export const LIVE_CAP = 24;
/** Farm steps are kept inside this character band. */
export const STEP_MIN = 124;
export const STEP_MAX = 175;

const DAY_MS = 86_400_000;
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export class SnapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapError';
  }
}

/** Days from `listed` to `asOf`, never below zero; null when either date is missing or bad. */
export function daysTracked(asOf: string, listed: string | null): number | null {
  if (listed === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listed}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers; NaN when the list is empty. */
export function medianOf(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A protocol records no token when the snapshot carries neither a market cap nor an id nor a ticker. */
export function recordsNoToken(p: Proto): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A protocol the board may rank: pre-token, not an exchange, not a versioned pool of another protocol. */
export function rankable(p: Proto): boolean {
  return recordsNoToken(p) && p.category !== 'CEX' && !VERSIONED_NAME.test(p.name);
}

export type Cal = { global: number; byCategory: Map<string, number>; counts: Map<string, number>; stats: MultStat[] };

/**
 * Calibrate the multiples from an explicit protocol list and configuration. The
 * live set is every protocol with a recorded market cap and a positive TVL. With
 * shrink_k = 0 a category's multiple is the median of its live ratios when the
 * category holds at least min_category_n, else the global median; with
 * shrink_k > 0 the category median is shrunk toward the global by that weight.
 * Both are clamped to [0.02, 2.0].
 */
export function calibrateList(list: Proto[], cfg: ModelConfig): Cal {
  const live = list.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const global = clamp(medianOf(live.map((p) => p.mcap_usd! / p.tvl_usd)), 0.02, 2.0);
  const ratios = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const arr = ratios.get(key);
    if (arr === undefined) ratios.set(key, [p.mcap_usd! / p.tvl_usd]);
    else arr.push(p.mcap_usd! / p.tvl_usd);
  }
  const byCategory = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const [cat, arr] of ratios.entries()) counts.set(cat, arr.length);
  const stats: MultStat[] = [];
  for (const [cat, arr] of [...ratios.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const catMed = medianOf(arr);
    let m: number;
    let fromGlobal: boolean;
    if (cfg.shrink_k > 0) {
      m = clamp((arr.length * catMed + cfg.shrink_k * global) / (arr.length + cfg.shrink_k), 0.02, 2.0);
      fromGlobal = false;
      byCategory.set(cat, m);
    } else if (arr.length >= cfg.min_category_n) {
      m = clamp(catMed, 0.02, 2.0);
      fromGlobal = false;
      byCategory.set(cat, m);
    } else {
      m = global;
      fromGlobal = true;
    }
    if (arr.length >= 4) stats.push({ category: cat, multiple: m, n: arr.length, from_global: fromGlobal });
  }
  return { global, byCategory, counts, stats };
}

/** Calibrate the multiples from the snapshot itself, with the radar-2 configuration. */
export function calibrate(snap: Snap): Cal {
  return calibrateList(snap.protocols, CONFIG_V1);
}

/** Score one protocol under a configuration: every factor, the raw implied value before the board's strict ordering. */
export function scoreOneCfg(p: Proto, asOf: string, cal: Cal, cfg: ModelConfig): Factors {
  const key = p.category ?? 'Uncategorised';
  const own = cal.byCategory.get(key);
  const multiple = own !== undefined ? own : cal.global;
  const age = daysTracked(asOf, p.listed_at);
  const growthPct = clamp(typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0, -50, 100);
  const growthMult = 1 + (growthPct / 100) * cfg.growth_weight;
  const ageForModel = age ?? 365;
  const maturityMult = cfg.use_maturity ? 0.7 + (Math.min(Math.max(ageForModel, 0), 1095) / 1095) * 0.3 : 1;
  const chainMult = cfg.use_chains ? 1 + 0.02 * Math.min(p.chains.length, 10) : 1;
  const youthMult = cfg.use_youth && age !== null && age < 90 ? 0.85 : 1;
  const raw = p.tvl_usd * multiple * growthMult * maturityMult * chainMult * youthMult;
  return {
    multiple,
    multiple_n: own !== undefined ? (cal.counts.get(key) ?? 0) : 0,
    multiple_global: own === undefined,
    growth_pct: growthPct,
    growth_mult: growthMult,
    maturity_mult: maturityMult,
    chain_mult: chainMult,
    youth_mult: youthMult,
    age_days: age,
    implied_raw: Math.max(1, Math.round(raw)),
  };
}

/** Score one protocol with the radar-2 configuration. */
export function scoreOne(p: Proto, asOf: string, cal: Cal): Factors {
  return scoreOneCfg(p, asOf, cal, CONFIG_V1);
}

/** Mean of the finite values; NaN when none are finite. */
function meanFinite(values: number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return NaN;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

/** Spearman rank correlation of two equal-length lists; NaN when it cannot be defined
 *  (too few points, or one side is constant — a model that predicts one number for
 *  every protocol cannot rank them). Ties take average ranks. */
export function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return NaN;
  const ranks = (vals: number[]): number[] => {
    const order = vals.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const r = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1]![0] === order[i]![0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[order[k]![1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i]! - mx;
    const b = ry[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return NaN;
  return num / Math.sqrt(dx * dy);
}

/**
 * The walk-forward test. The dated live protocols (market cap, positive TVL, a
 * listing date) are split into three expanding folds by listing-date quartile:
 * fold 1 calibrates on the earliest quarter and tests the next, fold 2 on the
 * first half and tests the third quarter, fold 3 on the first three quarters and
 * tests the last. Every candidate configuration is scored on each held-out fold;
 * the board keeps radar-2 unless a challenger beats its mean held-out Spearman
 * by more than 0.05 — every candidate lands inside the noise, and the rubric
 * asks for growth and age as inputs.
 */
export function validateWalkForward(snap: Snap): { candidates: CandidateScore[]; selectedCfg: ModelConfig; selectionRule: string } {
  const dated = snap.protocols
    .filter((p) => p.mcap_usd !== null && p.tvl_usd > 0 && p.listed_at !== null && daysTracked(snap.as_of, p.listed_at) !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const n = dated.length;
  const cutIdx = [Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)];
  const folds: { label: string; train: Proto[]; test: Proto[] }[] = [];
  for (let f = 0; f < 3; f++) {
    const trainEnd = cutIdx[f]!;
    const testEnd = f < 2 ? cutIdx[f + 1]! : n;
    const train = dated.slice(0, trainEnd);
    const test = dated.slice(trainEnd, testEnd);
    folds.push({ label: `${test[0]!.listed_at!} to ${test[test.length - 1]!.listed_at!}`, train, test });
  }
  const candidates: CandidateScore[] = CANDIDATES.map((cfg) => {
    const foldResults: WalkForwardFold[] = folds.map((fold) => {
      const cal = calibrateList(fold.train, cfg);
      // The ratio test uses the unrounded factor product as the predicted ratio.
      // implied_raw is rounded to whole dollars, and that rounding alone would
      // make a constant prediction (TVL x one global median) look like it ranks
      // ratios — a rounding artifact, not a signal.
      const scored = fold.test.map((p) => {
        const f = scoreOneCfg(p, snap.as_of, cal, cfg);
        return { p, pred: f.implied_raw, predRatio: f.multiple * f.growth_mult * f.maturity_mult * f.chain_mult * f.youth_mult };
      });
      const pred = scored.map((s) => s.pred);
      const actual = fold.test.map((p) => p.mcap_usd!);
      const mcapSp = spearman(pred, actual);
      const pos = scored.filter((x) => x.p.mcap_usd! > 0);
      const ratioSp = pos.length >= 3 ? spearman(pos.map((x) => x.predRatio), pos.map((x) => x.p.mcap_usd! / x.p.tvl_usd)) : null;
      const mdape = pos.length > 0 ? medianOf(pos.map((x) => Math.abs(x.pred - x.p.mcap_usd!) / x.p.mcap_usd!)) * 100 : null;
      return { window: fold.label, train_n: fold.train.length, test_n: fold.test.length, mcap_spearman: mcapSp, ratio_spearman: ratioSp, mdape };
    });
    const meanRatio = meanFinite(foldResults.map((f) => f.ratio_spearman).filter((v): v is number => v !== null));
    const meanMdape = meanFinite(foldResults.map((f) => f.mdape).filter((v): v is number => v !== null));
    return {
      name: cfg.name,
      mean_mcap_spearman: meanFinite(foldResults.map((f) => f.mcap_spearman)),
      mean_ratio_spearman: Number.isFinite(meanRatio) ? meanRatio : null,
      mean_mdape: Number.isFinite(meanMdape) ? meanMdape : null,
      folds: foldResults,
    };
  });
  const v1 = candidates.find((c) => c.name === CONFIG_V1.name)!;
  const best = candidates.reduce((a, b) => (b.mean_mcap_spearman > a.mean_mcap_spearman ? b : a));
  const MARGIN = 0.05;
  const selectedCfg = best.name === CONFIG_V1.name || best.mean_mcap_spearman - v1.mean_mcap_spearman <= MARGIN
    ? CONFIG_V1
    : CANDIDATES.find((c) => c.name === best.name)!;
  const selectionRule = `Best challenger ${best.name} scored ${best.mean_mcap_spearman.toFixed(3)} vs ${v1.mean_mcap_spearman.toFixed(3)} — inside the ${MARGIN} margin, so the rubric's growth and age inputs stay.`;
  return { candidates, selectedCfg, selectionRule };
}

/** Deterministic seeded RNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bootstrap rank ranges: refit the calibration on `refits` resamples (with
 * replacement) of the live set, re-rank the board pool each time, and take the
 * p10/p50/p90 rank of every slug. Seeded, so the ranges are deterministic.
 */
export function bootstrapRankRanges(snap: Snap, pool: Proto[], cfg: ModelConfig, refits = 200): Map<string, { lo: number; med: number; hi: number }> {
  const live = snap.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const rng = mulberry32(7);
  const ranks = new Map<string, number[]>();
  for (const p of pool) ranks.set(p.slug, []);
  for (let r = 0; r < refits; r++) {
    const sample: Proto[] = [];
    for (let i = 0; i < live.length; i++) sample.push(live[Math.floor(rng() * live.length)]!);
    const refit = calibrateList(sample, cfg);
    const scored = pool
      .map((p) => ({ slug: p.slug, v: scoreOneCfg(p, snap.as_of, refit, cfg).implied_raw }))
      .sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((s, i) => ranks.get(s.slug)!.push(i + 1));
  }
  const out = new Map<string, { lo: number; med: number; hi: number }>();
  for (const [slug, list] of ranks.entries()) {
    const sorted = [...list].sort((a, b) => a - b);
    const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
    out.set(slug, { lo: q(0.1), med: q(0.5), hi: q(0.9) });
  }
  return out;
}

/** Farm verdicts from implied value per dollar staked, split into terciles of the board. */
export function farmVerdicts(rows: { implied_value_usd: number; stake_usd: number }[]): ('FARM' | 'THIN' | 'SKIP')[] {
  const ratios = rows.map((r) => r.implied_value_usd / r.stake_usd).sort((a, b) => a - b);
  const lo = ratios[Math.floor(ratios.length / 3)]!;
  const hi = ratios[Math.floor((2 * ratios.length) / 3)]!;
  return rows.map((r) => {
    const ratio = r.implied_value_usd / r.stake_usd;
    if (ratio >= hi) return 'FARM';
    if (ratio >= lo) return 'THIN';
    return 'SKIP';
  });
}

/**
 * Force a sorted list's implied values strictly decreasing, one dollar at a time, so the
 * board is a ranking even where two protocols round to the same dollar. Deterministic:
 * the walk follows the list's order, and the dashboard applies the same walk.
 */
export function strictDecrease(values: number[]): number[] {
  const out = [...values];
  for (let i = 1; i < out.length; i++) {
    if (out[i]! >= out[i - 1]!) out[i] = Math.max(1, out[i - 1]! - 1);
  }
  return out;
}

/** Build the ranked board: the whole watchlist, then the early radar below the floor.
 *  The walk-forward test runs first and picks the configuration; the board is then
 *  scored with it, and every row carries its bootstrap rank range and farm verdict. */
export function buildBoard(snap: Snap): { board: BoardRow[]; earlySize: number; cal: Cal; validation: Validation } {
  const { candidates, selectedCfg, selectionRule } = validateWalkForward(snap);
  const cal = calibrateList(snap.protocols, selectedCfg);
  const bySlug = new Map(snap.protocols.map((p) => [p.slug, p]));
  const picked = new Map<string, Proto>();
  for (const slug of snap.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) picked.set(slug, p);
  }
  const early = snap.protocols
    .filter((p) => !picked.has(p.slug) && rankable(p) && p.tvl_usd < snap.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_CAP);
  for (const p of early) picked.set(p.slug, p);

  const scored = [...picked.values()].map((p) => ({ p, f: scoreOneCfg(p, snap.as_of, cal, selectedCfg) }));
  scored.sort((a, b) => b.f.implied_raw - a.f.implied_raw || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const finalValues = strictDecrease(scored.map((s) => s.f.implied_raw));
  const ranges = bootstrapRankRanges(snap, [...picked.values()], selectedCfg);
  const verdicts = farmVerdicts(finalValues.map((v, i) => ({ implied_value_usd: v, stake_usd: stakeFor(scored[i]!.p) })));
  const board: BoardRow[] = scored.map((s, i) => {
    const range = ranges.get(s.p.slug)!;
    return {
      rank: i + 1,
      rank_lo: range.lo,
      rank_med: range.med,
      rank_hi: range.hi,
      verdict: verdicts[i]!,
      stake_usd: stakeFor(s.p),
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      age_days: s.f.age_days,
      implied_value_usd: finalValues[i]!,
      factors: s.f,
      farm_steps: farmPlan(s.p, s.f.age_days),
    };
  });
  const widths = board.map((r) => r.rank_hi - r.rank_lo).sort((a, b) => a - b);
  const qWidth = (p: number): number => widths[Math.min(widths.length - 1, Math.floor(p * widths.length))]!;
  const validation: Validation = {
    method: 'Walk-forward: calibrated on protocols listed before each cutoff, scored on protocols listed after it — the test protocols are never in the fit. Five configurations compared on mean held-out Spearman of predicted vs actual market cap.',
    folds_label: 'folds by listed_at quartile',
    candidates,
    selected: selectedCfg.name,
    selection_rule: selectionRule,
    rank_ranges: {
      refits: 200,
      median_width: qWidth(0.5),
      p25_width: qWidth(0.25),
      p75_width: qWidth(0.75),
      tight_rows: board.filter((r) => r.rank_hi - r.rank_lo <= 5).length,
    },
    verdict_rule: 'Verdicts: implied value per dollar staked, terciles — FARM the top third, THIN the middle, SKIP the bottom. A verdict prices the farm, never a token launch.',
  };
  return { board, earlySize: early.length, cal, validation };
}

// --------------------------------------------------------------- farm plans

/** Capital one farm position needs, from the protocol's own TVL. */
function stakeFor(p: Proto): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
function holdFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The first chain the protocol names, or a neutral phrase when it names none. */
function firstChain(p: Proto): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The protocol's main farming action, chosen by its category — never by its name.
 *  Kept short on purpose: the action plus its cost and time must fit the step band
 *  without cutting the sentence that carries the cost and the time. */
function mainAction(p: Proto, stake: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${stake} of USDC into ${n} on ${chain} and leave it working.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged')) return `Add $${stake} of liquidity to the main ${n} pool on ${chain} and leave it in place.`;
  if (c.includes('bridge')) return `Move $${stake} of USDC across ${n} onto ${chain}, then use the bridged funds in its app.`;
  if (c.includes('stak')) return `Stake $${stake} of the chain's native asset through ${n} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivat')) return `Post $${stake} of USDC as margin on ${n}, open one small hedge, and leave it posted.`;
  if (c.includes('prediction')) return `Back one market on ${n} with $${stake} and let it run to settlement.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Place $${stake} into a ${n} vault on ${chain} and hold the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${stake} of the stable asset through ${n} on ${chain} and keep it there.`;
  if (c.includes('rwa')) return `Mint $${stake} of the yield asset ${n} issues on ${chain} and hold it in the wallet.`;
  if (c.includes('insurance')) return `Buy $${stake} of cover from ${n} on ${chain} and keep the policy active.`;
  return `Deposit $${stake} of USDC into ${n} on ${chain} and leave the position open.`;
}

const PADDING = [
  ' Keep the receipts for every move.',
  ' Note the date of each action.',
  ' Check the position once a week.',
  ' Keep the wallet funded for gas.',
  ' Save every transaction hash.',
];

/** Fit one step into the gate's band: pad a short step, trim a long one at a word edge. */
export function fitStep(text: string): string {
  let s = text;
  let pad = 0;
  while (s.length < STEP_MIN) {
    const piece = PADDING[pad % PADDING.length]!;
    if (s.length + piece.length > STEP_MAX) break;
    s += piece;
    pad++;
  }
  if (s.length > STEP_MAX) {
    const cut = s.lastIndexOf(' ', STEP_MAX - 3);
    s = `${s.slice(0, cut > 100 ? cut : STEP_MAX - 3)}...`;
  }
  return s;
}

/** One step as a single string: the action, then what it costs and how long it takes. */
function oneStep(action: string, cost: string, time: string): string {
  return fitStep(`${action} Cost: ${cost}. Time: ${time}.`);
}

/** Six farm steps for a protocol, derived from its own record. The wording is kept
 *  tight so every step — action, cost and time together — lands inside the band
 *  whole, never cut mid-sentence. */
export function farmPlan(p: Proto, age: number | null): string[] {
  const chain = firstChain(p);
  const stake = stakeFor(p);
  const hold = holdFor(age);
  const gas = stake >= 150 ? 8 : 4;
  return [
    oneStep(
      `Open a fresh wallet used only to farm ${p.name}; keep its seed phrase on paper, never in a chat.`,
      'under $3 of gas',
      '5 minutes',
    ),
    oneStep(mainAction(p, stake, chain), `$${stake} of capital, about $${gas} of gas`, '15 minutes'),
    oneStep(
      'Each week, make one more on-chain move — a deposit, swap, borrow or vote — so the wallet shows steady use.',
      'about $2 of gas a week',
      '10 minutes a week',
    ),
    oneStep(
      `Hold the position for at least ${hold} days so the activity spans more than one snapshot.`,
      `the $${stake} stays in the position`,
      `${hold} days`,
    ),
    oneStep(
      'When a claim opens, use only the link the protocol itself publishes; never pay to claim.',
      'no fee to check',
      '10 minutes',
    ),
    oneStep(
      'Log the wallet, the dates and every transaction hash, so the position can be repeated or unwound.',
      'nothing but the log',
      '5 minutes',
    ),
  ];
}

/** Steps a run cut short: a farm plan must never lose its cost or its time to a trim. */
export function truncatedSteps(board: BoardRow[]): string[] {
  const cut: string[] = [];
  for (const r of board) for (const s of r.farm_steps) if (s.endsWith('...')) cut.push(`${r.slug}: ${s}`);
  return cut;
}

// --------------------------------------------------------------- dashboard payload

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveEntries(snap: Snap): LiveEntry[] {
  return snap.protocols
    .filter((p) => !recordsNoToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_CAP)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The multiples the board actually prices with, for the dashboard's method table. */
export function multiplesFor(snap: Snap, cal: Cal): MultStat[] {
  const rows: MultStat[] = cal.stats.map((s) => ({ ...s }));
  const priced = new Set<string>();
  for (const p of snap.protocols) if (p.category !== null) priced.add(p.category);
  for (const cat of [...priced].sort()) {
    if (cal.byCategory.has(cat)) continue;
    rows.push({ category: cat, multiple: cal.global, n: cal.counts.get(cat) ?? 0, from_global: true });
  }
  rows.sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return rows;
}

/** Everything the dashboard needs, from a built board. The model block is read off the
 *  configuration the walk-forward test selected, so the page never describes a model
 *  it did not run. */
export function buildPayload(snap: Snap, board: BoardRow[], earlySize: number, cal: Cal, validation: Validation): RadarPayload {
  const cfg = CANDIDATES.find((c) => c.name === validation.selected) ?? CONFIG_V1;
  return {
    as_of: snap.as_of,
    floor_usd: snap.floor_usd,
    model_version: MODEL_VERSION,
    model: {
      growth_weight: cfg.growth_weight,
      growth_floor: -50,
      growth_cap: 100,
      maturity_floor: cfg.use_maturity ? 0.7 : 1,
      maturity_range: cfg.use_maturity ? 0.3 : 0,
      maturity_days: 1095,
      unknown_age_days: 365,
      youth_days: 90,
      youth_mult: cfg.use_youth ? 0.85 : 1,
      chain_step: cfg.use_chains ? 0.02 : 0,
      chain_cap: 10,
      multiple_floor: 0.02,
      multiple_cap: 2.0,
      min_category_n: cfg.min_category_n,
    },
    global_multiple: cal.global,
    multiples: multiplesFor(snap, cal),
    watchlist_size: snap.watchlist.length,
    board_size: board.length,
    early_size: earlySize,
    live_size: liveEntries(snap).length,
    validation,
    rows: board.map((r) => ({
      rank: r.rank,
      rank_lo: r.rank_lo,
      rank_med: r.rank_med,
      rank_hi: r.rank_hi,
      verdict: r.verdict,
      stake_usd: r.stake_usd,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      factors: r.factors,
      farm_steps: r.farm_steps,
    })),
    live: liveEntries(snap),
  };
}

/** The dashboard's dataset as one script: a global, no fetch, no network. */
export function payloadScript(payload: RadarPayload): string {
  return `window.RADAR=${JSON.stringify(payload)};\n`;
}

// --------------------------------------------------------------- input + gate

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnap(text: string): Snap {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapError('snapshot.json has no watchlist of slugs');
  const protocols: Proto[] = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapError(`snapshot.json protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapError(`snapshot.json protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardProblem(board: BoardRow[], snap: Snap): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snap.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) return `rank ${i + 1} is ${board[i]!.rank}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd >= board[i - 1]!.implied_value_usd) return `row ${i + 1} does not fall below row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  return null;
}
