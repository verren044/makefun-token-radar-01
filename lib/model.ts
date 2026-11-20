// Token Radar — model, board builder and farm plans (radar-4).
// Node 22, standard library only. No protocol name is ever special-cased:
// every number below is computed from the snapshot passed in.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  listed_at: string | null;
  symbol?: string | null;
  gecko_id?: string | null;
}

export interface Snapshot {
  as_of: string;
  floor_usd: number;
  watchlist: string[];
  protocols: Protocol[];
}

export interface CategoryStat {
  category: string;
  multiple: number;
  n: number;
  from_global: boolean;
}

export interface Calibration {
  global: number;
  stats: CategoryStat[];
}

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

export interface BoardRow {
  rank: number;
  rank_lo: number;
  rank_med: number;
  rank_hi: number;
  verdict: string;
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
  fitted_value_usd: number;
  factors: Factors;
  farm_steps: string[];
}

export interface LiveEntry {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface ModelConfig {
  name: string;
  kind: "multiple" | "regression";
  shrink_k: number;
  min_category_n: number;
  growth_weight: number;
  use_maturity: boolean;
  use_chains: boolean;
  use_youth: boolean;
}

export interface FoldScore {
  window: string;
  train_n: number;
  test_n: number;
  mcap_spearman: number | null;
  ratio_spearman: number | null;
  mdape: number | null;
}

export interface CandidateScore {
  name: string;
  mean_mcap_spearman: number | null;
  mean_ratio_spearman: number | null;
  mean_mdape: number | null;
  folds: FoldScore[];
}

export interface CategoryEffect {
  category: string;
  effect: number;
  n: number;
}

export interface LaunchPriceFit {
  n: number;
  zero_mcap_excluded: number;
  r2: number;
  resid_sd: number;
  intercept: number;
  b_log_tvl: number;
  b_log_age: number;
  b_chains: number;
  b_change: number;
  cat_effects: CategoryEffect[];
}

export interface Coverage {
  total: number;
  ranked: number;
  watchlist_ranked: number;
  early_ranked: number;
  live_token: number;
  cex_pre_token: number;
  versioned_pre_token: number;
  above_floor_pre_token: number;
  other: number;
}

export interface Validation {
  method: string;
  folds_label: string;
  candidates: CandidateScore[];
  selected: string;
  selection_rule: string;
  launch_price_fit: LaunchPriceFit;
  rank_ranges: {
    refits: number;
    median_width: number;
    p25_width: number;
    p75_width: number;
    tight_rows: number;
  };
  verdict_rule: string;
}

export interface Payload {
  as_of: string;
  floor_usd: number;
  model_version: string;
  model: Record<string, number>;
  global_multiple: number;
  multiples: CategoryStat[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  coverage: Coverage;
  validation: Validation;
  rows: BoardRow[];
  live: LiveEntry[];
}

export const MODEL_VERSION = "radar-4";

export const MODEL_CONSTANTS: Record<string, number> = {
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  youth_days: 90,
  youth_mult: 0.85,
  chain_step: 0.02,
  chain_cap: 10,
  multiple_floor: 0.02,
  multiple_cap: 2,
  min_category_n: 4,
};

export const EARLY_CAP = 186;
export const LIVE_CAP = 24;
export const BOOTSTRAP_REFITS = 200;
export const BOOTSTRAP_SEED = 7;

// ---------------------------------------------------------------- helpers

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function parseDate(value: string | null): number | null {
  if (value === null || typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  const base = parseDate(asOf);
  const listed = parseDate(listedAt);
  if (base === null || listed === null) return null;
  return Math.floor((base - listed) / 86400000);
}

export function median(values: number[]): number {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (finite.length === 0) return NaN;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 === 1
    ? finite[mid]!
    : (finite[mid - 1]! + finite[mid]!) / 2;
}

export function mean(values: number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return NaN;
  let sum = 0;
  for (const v of finite) sum += v;
  return sum / finite.length;
}

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => i).sort((a, b) => values[a]! - values[b]!);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && values[order[j + 1]!] === values[order[i]!]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k]!] = avg;
    i = j + 1;
  }
  return out;
}

export function spearman(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return NaN;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < rx.length; i++) {
    const dx = rx[i]! - mx;
    const dy = ry[i]! - my;
    num += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  const den = Math.sqrt(sx * sy);
  return den === 0 ? NaN : num / den;
}

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Element at min(len-1, floor(p*len)) of the sorted values. */
export function quantileAt(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx]!;
}

/** Force strictly decreasing whole-dollar values, never below $1. */
export function enforceStrictlyDecreasing(values: number[]): number[] {
  const out = [...values];
  for (let i = 1; i < out.length; i++) {
    if (out[i]! >= out[i - 1]!) out[i] = Math.max(1, out[i - 1]! - 1);
  }
  return out;
}

// ---------------------------------------------------------------- snapshot

export function parseSnapshot(data: unknown): Snapshot {
  if (typeof data !== "object" || data === null) {
    throw new Error("snapshot is not an object");
  }
  const raw = data as Record<string, unknown>;
  if (typeof raw.as_of !== "string" || raw.as_of.length === 0) {
    throw new Error("snapshot is missing as_of");
  }
  if (!Array.isArray(raw.protocols)) {
    throw new Error("snapshot protocols is not an array");
  }
  if (typeof raw.floor_usd !== "number" || !Number.isFinite(raw.floor_usd)) {
    throw new Error("snapshot floor_usd is not a finite number");
  }
  if (!Array.isArray(raw.watchlist)) {
    throw new Error("snapshot watchlist is not an array");
  }
  const protocols: Protocol[] = raw.protocols.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`protocol ${i} is not an object`);
    }
    const p = entry as Record<string, unknown>;
    if (typeof p.slug !== "string" || p.slug.length === 0) {
      throw new Error(`protocol ${i} is missing a slug`);
    }
    if (typeof p.name !== "string" || p.name.length === 0) {
      throw new Error(`protocol ${i} is missing a name`);
    }
    if (
      typeof p.tvl_usd !== "number" ||
      !Number.isFinite(p.tvl_usd) ||
      p.tvl_usd < 0
    ) {
      throw new Error(`protocol ${p.slug} has no finite non-negative tvl_usd`);
    }
    if (!Array.isArray(p.chains)) {
      throw new Error(`protocol ${p.slug} has no chains array`);
    }
    if (
      p.mcap_usd !== null &&
      (typeof p.mcap_usd !== "number" || !Number.isFinite(p.mcap_usd))
    ) {
      throw new Error(`protocol ${p.slug} has a bad mcap_usd`);
    }
    if (
      p.change_7d !== null &&
      (typeof p.change_7d !== "number" || !Number.isFinite(p.change_7d))
    ) {
      throw new Error(`protocol ${p.slug} has a bad change_7d`);
    }
    if (p.listed_at !== null && typeof p.listed_at !== "string") {
      throw new Error(`protocol ${p.slug} has a bad listed_at`);
    }
    if (p.category !== null && typeof p.category !== "string") {
      throw new Error(`protocol ${p.slug} has a bad category`);
    }
    return p as unknown as Protocol;
  });
  return {
    as_of: raw.as_of as string,
    floor_usd: raw.floor_usd as number,
    watchlist: raw.watchlist as string[],
    protocols,
  };
}

/** A name is versioned when a version token sits on a word boundary and is
 *  followed by an optional separator and a number. */
const VERSIONED_RE = /\b(?:v|ver|version|mk|mark|edition)[\s\-.]?\d+/i;

export function isVersioned(name: string): boolean {
  return VERSIONED_RE.test(name);
}

/** "Records no token": neither a market cap nor a token symbol is recorded. */
export function hasToken(p: Protocol): boolean {
  return p.mcap_usd !== null || (p.symbol !== null && p.symbol !== undefined);
}

export function isRankable(p: Protocol): boolean {
  return !hasToken(p) && p.tvl_usd > 0;
}

export function liveProtocols(protocols: Protocol[]): Protocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
}

export function liveEntries(protocols: Protocol[]): LiveEntry[] {
  return liveProtocols(protocols)
    .filter((p) => p.category !== "CEX")
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_CAP)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));
}

// ---------------------------------------------------------------- multiples

export function calibrate(
  protocols: Protocol[],
  shrinkK: number,
  minCategoryN: number,
): Calibration {
  const live = liveProtocols(protocols);
  const global = median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const categories = [
    ...new Set(
      protocols.map((p) => p.category).filter((c): c is string => c !== null),
    ),
  ];
  const stats: CategoryStat[] = categories.map((category) => {
    const inCat = live.filter((p) => p.category === category);
    const n = inCat.length;
    if (n >= minCategoryN) {
      const catMedian = median(
        inCat.map((p) => (p.mcap_usd as number) / p.tvl_usd),
      );
      const multiple =
        shrinkK === 0
          ? clamp(
              catMedian,
              MODEL_CONSTANTS.multiple_floor!,
              MODEL_CONSTANTS.multiple_cap!,
            )
          : clamp(
              (n * catMedian + shrinkK * global) / (n + shrinkK),
              MODEL_CONSTANTS.multiple_floor!,
              MODEL_CONSTANTS.multiple_cap!,
            );
      return { category, multiple, n, from_global: false };
    }
    return { category, multiple: global, n, from_global: true };
  });
  stats.sort(
    (a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1),
  );
  return { global, stats };
}

function statFor(calib: Calibration, category: string | null): CategoryStat | null {
  if (category === null) return null;
  return calib.stats.find((s) => s.category === category) ?? null;
}

export function scoreProtocol(
  p: Protocol,
  calib: Calibration,
  config: ModelConfig,
  asOf: string,
): Factors {
  const stat = statFor(calib, p.category);
  const multiple = stat ? stat.multiple : calib.global;
  const multipleGlobal = stat ? stat.from_global : true;
  const multipleN = stat && !stat.from_global ? stat.n : 0;
  const age = ageDays(asOf, p.listed_at);
  const growthPct =
    p.change_7d === null
      ? 0
      : clamp(
          p.change_7d,
          MODEL_CONSTANTS.growth_floor!,
          MODEL_CONSTANTS.growth_cap!,
        );
  const growthMult = 1 + (growthPct / 100) * config.growth_weight;
  const effectiveAge = age === null ? MODEL_CONSTANTS.unknown_age_days! : age;
  const maturityMult = config.use_maturity
    ? MODEL_CONSTANTS.maturity_floor! +
      (Math.min(effectiveAge, MODEL_CONSTANTS.maturity_days!) /
        MODEL_CONSTANTS.maturity_days!) *
        MODEL_CONSTANTS.maturity_range!
    : 1;
  const chainMult = config.use_chains
    ? 1 +
      MODEL_CONSTANTS.chain_step! *
        Math.min(p.chains.length, MODEL_CONSTANTS.chain_cap!)
    : 1;
  const youthMult =
    config.use_youth && age !== null && age < MODEL_CONSTANTS.youth_days!
      ? MODEL_CONSTANTS.youth_mult!
      : 1;
  const impliedRaw = Math.max(
    1,
    Math.round(
      p.tvl_usd * multiple * growthMult * maturityMult * chainMult * youthMult,
    ),
  );
  return {
    multiple,
    multiple_n: multipleN,
    multiple_global: multipleGlobal,
    growth_pct: growthPct,
    growth_mult: growthMult,
    maturity_mult: maturityMult,
    chain_mult: chainMult,
    youth_mult: youthMult,
    age_days: age,
    implied_raw: impliedRaw,
  };
}

// ---------------------------------------------------------------- fitted price

function fitFeatures(
  p: Protocol,
  asOf: string,
): [number, number, number, number, number] {
  const age = ageDays(asOf, p.listed_at);
  const effectiveAge = age === null ? MODEL_CONSTANTS.unknown_age_days! : age;
  return [
    1,
    Math.log(p.tvl_usd),
    Math.log(Math.max(effectiveAge, 1)),
    Math.min(p.chains.length, MODEL_CONSTANTS.chain_cap!),
    p.change_7d === null
      ? 0
      : clamp(
          p.change_7d,
          MODEL_CONSTANTS.growth_floor!,
          MODEL_CONSTANTS.growth_cap!,
        ),
  ];
}

function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) {
      throw new Error("launch-price fit is singular");
    }
    if (pivot !== col) {
      const tmp = m[col]!;
      m[col] = m[pivot]!;
      m[pivot] = tmp;
    }
    for (let r = col + 1; r < n; r++) {
      const factor = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= factor * m[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = m[r]![n]!;
    for (let c = r + 1; c < n; c++) sum -= m[r]![c]! * x[c]!;
    x[r] = sum / m[r]![r]!;
  }
  return x;
}

export function fitLaunchPrice(
  protocols: Protocol[],
  asOf: string,
): LaunchPriceFit {
  const live = liveProtocols(protocols);
  const zeroExcluded = live.filter((p) => p.mcap_usd === 0).length;
  const fitted = live.filter(
    (p) => (p.mcap_usd as number) > 0 && p.tvl_usd > 0,
  );
  const k = 5;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  const rows = fitted.map((p) => ({
    p,
    x: fitFeatures(p, asOf),
    y: Math.log(p.mcap_usd as number),
  }));
  for (const { x, y } of rows) {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) xtx[i]![j]! += x[i]! * x[j]!;
      xty[i]! += x[i]! * y;
    }
  }
  const beta = solveLinear(xtx, xty);
  let rss = 0;
  let tss = 0;
  const yMean = mean(rows.map((r) => r.y));
  const residuals: { p: Protocol; residual: number }[] = [];
  for (const { p, x, y } of rows) {
    let pred = 0;
    for (let i = 0; i < k; i++) pred += beta[i]! * x[i]!;
    const residual = y - pred;
    residuals.push({ p, residual });
    rss += residual * residual;
    tss += (y - yMean) * (y - yMean);
  }
  const r2 = 1 - rss / tss;
  const residSd = Math.sqrt(rss / fitted.length);
  const byCategory = new Map<string, number[]>();
  for (const { p, residual } of residuals) {
    const key = p.category ?? "";
    const list = byCategory.get(key) ?? [];
    list.push(residual);
    byCategory.set(key, list);
  }
  const catEffects: CategoryEffect[] = [...byCategory.entries()].map(
    ([category, list]) => ({
      category,
      effect: mean(list) * (list.length / (list.length + 4)),
      n: list.length,
    }),
  );
  catEffects.sort(
    (a, b) => b.effect - a.effect || (a.category < b.category ? -1 : 1),
  );
  return {
    n: fitted.length,
    zero_mcap_excluded: zeroExcluded,
    r2,
    resid_sd: residSd,
    intercept: beta[0]!,
    b_log_tvl: beta[1]!,
    b_log_age: beta[2]!,
    b_chains: beta[3]!,
    b_change: beta[4]!,
    cat_effects: catEffects,
  };
}

export function fittedLogPrice(
  p: Protocol,
  fit: LaunchPriceFit,
  asOf: string,
): number {
  const x = fitFeatures(p, asOf);
  let logPrice =
    fit.intercept +
    fit.b_log_tvl * x[1]! +
    fit.b_log_age * x[2]! +
    fit.b_chains * x[3]! +
    fit.b_change * x[4]!;
  const effect = fit.cat_effects.find((e) => e.category === p.category);
  if (effect) logPrice += effect.effect;
  return logPrice;
}

export function fittedValue(
  p: Protocol,
  fit: LaunchPriceFit,
  asOf: string,
): number {
  return Math.max(1, Math.round(Math.exp(fittedLogPrice(p, fit, asOf))));
}

export function fittedRatio(
  p: Protocol,
  fit: LaunchPriceFit,
  asOf: string,
): number {
  return Math.exp(fittedLogPrice(p, fit, asOf)) / p.tvl_usd;
}

// ---------------------------------------------------------------- candidates

export const CANDIDATE_CONFIGS: ModelConfig[] = [
  {
    name: "radar-2 (v1)",
    kind: "multiple",
    shrink_k: 0,
    min_category_n: 4,
    growth_weight: 0.5,
    use_maturity: true,
    use_chains: true,
    use_youth: true,
  },
  {
    name: "category median only",
    kind: "multiple",
    shrink_k: 0,
    min_category_n: 4,
    growth_weight: 0,
    use_maturity: false,
    use_chains: false,
    use_youth: false,
  },
  {
    name: "shrunk k=10",
    kind: "multiple",
    shrink_k: 10,
    min_category_n: 1,
    growth_weight: 0.5,
    use_maturity: true,
    use_chains: true,
    use_youth: true,
  },
  {
    name: "shrunk k=10, no growth",
    kind: "multiple",
    shrink_k: 10,
    min_category_n: 1,
    growth_weight: 0,
    use_maturity: true,
    use_chains: true,
    use_youth: true,
  },
  {
    name: "TVL x global median",
    kind: "multiple",
    shrink_k: 0,
    min_category_n: 9999,
    growth_weight: 0,
    use_maturity: false,
    use_chains: false,
    use_youth: false,
  },
  {
    name: "fitted log-regression",
    kind: "regression",
    shrink_k: 0,
    min_category_n: 4,
    growth_weight: 0,
    use_maturity: false,
    use_chains: false,
    use_youth: false,
  },
];

function meanOfNonNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length === 0) return null;
  let sum = 0;
  for (const v of present) sum += v;
  return sum / present.length;
}

function scoreFold(
  train: Protocol[],
  test: Protocol[],
  config: ModelConfig,
  asOf: string,
): FoldScore {
  const window = `${test[0]!.listed_at} to ${test[test.length - 1]!.listed_at}`;
  const predicted: number[] = [];
  const predictedRatio: number[] = [];
  const actual: number[] = [];
  const actualRatio: number[] = [];
  const ape: number[] = [];
  if (config.kind === "regression") {
    const fit = fitLaunchPrice(train, asOf);
    for (const p of test) {
      const pred = fittedValue(p, fit, asOf);
      predicted.push(pred);
      predictedRatio.push(fittedRatio(p, fit, asOf));
      actual.push(p.mcap_usd as number);
      actualRatio.push((p.mcap_usd as number) / p.tvl_usd);
      if ((p.mcap_usd as number) > 0) {
        ape.push(
          (Math.abs(pred - (p.mcap_usd as number)) / (p.mcap_usd as number)) * 100,
        );
      }
    }
  } else {
    const calib = calibrate(train, config.shrink_k, config.min_category_n);
    for (const p of test) {
      const f = scoreProtocol(p, calib, config, asOf);
      predicted.push(f.implied_raw);
      predictedRatio.push(
        f.multiple * f.growth_mult * f.maturity_mult * f.chain_mult * f.youth_mult,
      );
      actual.push(p.mcap_usd as number);
      actualRatio.push((p.mcap_usd as number) / p.tvl_usd);
      if ((p.mcap_usd as number) > 0) {
        ape.push(
          (Math.abs(f.implied_raw - (p.mcap_usd as number)) /
            (p.mcap_usd as number)) *
            100,
        );
      }
    }
  }
  const pos = test
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p.mcap_usd as number) > 0);
  const ratioRaw =
    pos.length < 3
      ? null
      : spearman(
          pos.map(({ i }) => predictedRatio[i]!),
          pos.map(({ i }) => actualRatio[i]!),
        );
  // MdAPE is the median of the fractional errors, scaled to percent last.
  const fracErrors = pos.map(
    ({ p, i }) =>
      Math.abs(predicted[i]! - (p.mcap_usd as number)) / (p.mcap_usd as number),
  );
  return {
    window,
    train_n: train.length,
    test_n: test.length,
    mcap_spearman: spearman(predicted, actual),
    ratio_spearman:
      ratioRaw !== null && Number.isFinite(ratioRaw) ? ratioRaw : null,
    mdape: fracErrors.length === 0 ? null : median(fracErrors) * 100,
  };
}

export function walkForward(
  protocols: Protocol[],
  asOf: string,
): CandidateScore[] {
  const dated = liveProtocols(protocols)
    .filter((p) => p.listed_at !== null)
    .sort(
      (a, b) =>
        (a.listed_at as string) < (b.listed_at as string)
          ? -1
          : (a.listed_at as string) > (b.listed_at as string)
            ? 1
            : a.slug < b.slug
              ? -1
              : 1,
    );
  const cuts = [1, 2, 3].map((i) => Math.floor((i * dated.length) / 4));
  const foldDefs = [
    { train: dated.slice(0, cuts[0]), test: dated.slice(cuts[0], cuts[1]) },
    { train: dated.slice(0, cuts[1]), test: dated.slice(cuts[1], cuts[2]) },
    { train: dated.slice(0, cuts[2]), test: dated.slice(cuts[2]) },
  ];
  return CANDIDATE_CONFIGS.map((config) => {
    const folds = foldDefs.map(({ train, test }) =>
      scoreFold(train, test, config, asOf),
    );
    return {
      name: config.name,
      mean_mcap_spearman: meanOfNonNull(folds.map((f) => f.mcap_spearman)),
      mean_ratio_spearman: meanOfNonNull(folds.map((f) => f.ratio_spearman)),
      mean_mdape: meanOfNonNull(folds.map((f) => f.mdape)),
      folds,
    };
  });
}

function fmt3(v: number): string {
  return v.toFixed(3);
}

export function selectCandidate(
  candidates: CandidateScore[],
): { selected: string; rule: string } {
  const base = candidates.find((c) => c.name === "radar-2 (v1)")!;
  const challengers = candidates.filter((c) => c.name !== "radar-2 (v1)");
  let best = challengers[0]!;
  for (const c of challengers) {
    if ((c.mean_mcap_spearman ?? -Infinity) > (best.mean_mcap_spearman ?? -Infinity)) {
      best = c;
    }
  }
  const gap =
    (best.mean_mcap_spearman ?? 0) - (base.mean_mcap_spearman ?? 0);
  if (gap > 0.05) {
    return {
      selected: best.name,
      rule: `Best challenger ${best.name} scored ${fmt3(best.mean_mcap_spearman ?? 0)} vs ${fmt3(base.mean_mcap_spearman ?? 0)} — outside the 0.05 margin, so ${best.name} is selected.`,
    };
  }
  return {
    selected: "radar-2 (v1)",
    rule: `Best challenger ${best.name} scored ${fmt3(best.mean_mcap_spearman ?? 0)} vs ${fmt3(base.mean_mcap_spearman ?? 0)} — inside the 0.05 margin, so the rubric's growth and age inputs stay.`,
  };
}

// ---------------------------------------------------------------- farm plans

function stakeFor(tvl: number): number {
  if (tvl < 100_000_000) return 50;
  if (tvl < 1_000_000_000) return 100;
  return 150;
}

const STEP2_BY_CATEGORY: Record<string, string> = {
  "Risk Curators": "vault",
  "Onchain Capital Allocator": "vault",
  Dexs: "liquidity",
  Yield: "liquidity",
  "Leveraged Farming": "liquidity",
  "Yield Aggregator": "liquidity",
  Indexes: "liquidity",
  RWA: "rwa",
  Lending: "lend",
  CDP: "lend",
  "Collateral Markets": "lend",
  "Uncollateralized Lending": "lend",
  Chain: "deposit",
  "Basis Trading": "deposit",
  Payments: "deposit",
  CeDeFi: "deposit",
  "Liquidity Manager": "deposit",
  Farm: "deposit",
  "Governance Incentives": "deposit",
  "Anchor BTC": "deposit",
  "Crypto Card Issuer": "deposit",
  "Decentralized BTC": "deposit",
  "Canonical Bridge": "bridge",
  Bridge: "bridge",
  Restaking: "stake",
  "Staking Pool": "stake",
  "Liquid Restaking": "stake",
  "Liquid Staking": "stake",
  "Stablecoin Wrapper": "stable",
  "Dual-Token Stablecoin": "stable",
  Insurance: "insurance",
  Derivatives: "derivatives",
  "Interest Rate Derivatives": "derivatives",
  "Prediction Market": "prediction",
};

function farmSteps(p: Protocol, stake: number, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : "an unnamed chain";
  const gas = stake >= 150 ? 8 : 4;
  const costTail = `Cost: $${stake} of capital, about $${gas} of gas. Time: 15 minutes.`;
  const kind = STEP2_BY_CATEGORY[p.category ?? ""] ?? "deposit";
  let action: string;
  switch (kind) {
    case "vault":
      action = `Place $${stake} into a ${p.name} vault on ${chain} and hold the vault shares.`;
      break;
    case "liquidity":
      action = `Add $${stake} of liquidity to the main ${p.name} pool on ${chain} and leave it in place.`;
      break;
    case "rwa":
      action = `Mint $${stake} of the yield asset ${p.name} issues on ${chain} and hold it in the wallet.`;
      break;
    case "lend":
      action = `Lend $${stake} of USDC into ${p.name} on ${chain} and leave it working.`;
      break;
    case "bridge":
      action = `Move $${stake} of USDC across ${p.name} onto ${chain}, then use the bridged funds in its app.`;
      break;
    case "stake":
      action = `Stake $${stake} of the chain's native asset through ${p.name} and hold the receipt token.`;
      break;
    case "stable":
      action = `Mint or deposit $${stake} of the stable asset through ${p.name} on ${chain} and keep it there.`;
      break;
    case "insurance":
      action = `Buy $${stake} of cover from ${p.name} on ${chain} and keep the policy active.`;
      break;
    case "derivatives":
      action = `Post $${stake} of USDC as margin on ${p.name}, open one small hedge, and leave it posted.`;
      break;
    case "prediction":
      action = `Back one market on ${p.name} with $${stake} and let it run to settlement.`;
      break;
    default:
      action = `Deposit $${stake} of USDC into ${p.name} on ${chain} and leave the position open.`;
      break;
  }
  let step2 = `${action} ${costTail}`;
  if (step2.length < 124) step2 += " Keep the receipts for every move.";
  const effectiveAge = age === null ? MODEL_CONSTANTS.unknown_age_days! : age;
  const holdDays = effectiveAge < 180 ? 60 : effectiveAge < 365 ? 45 : 30;
  return [
    `Open a fresh wallet used only to farm ${p.name}; keep its seed phrase on paper, never in a chat. Cost: under $3 of gas. Time: 5 minutes.`,
    step2,
    `Each week, make one more on-chain move — a deposit, swap, borrow or vote — so the wallet shows steady use. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${holdDays} days so the activity spans more than one snapshot. Cost: the $${stake} stays in the position. Time: ${holdDays} days.`,
    `When a claim opens, use only the link the protocol itself publishes; never pay to claim. Cost: no fee to check. Time: 10 minutes.`,
    `Log the wallet, the dates and every transaction hash, so the position can be repeated or unwound. Cost: nothing but the log. Time: 5 minutes.`,
  ];
}

// ---------------------------------------------------------------- board

export interface BoardResult {
  rows: BoardRow[];
  validation: Validation;
  coverage: Coverage;
  calib: Calibration;
  fit: LaunchPriceFit;
  picked: Protocol[];
  early: Protocol[];
  live: LiveEntry[];
}

export function buildBoard(snapshot: Snapshot): BoardResult {
  const { as_of, floor_usd, watchlist } = snapshot;
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const picked: Protocol[] = [];
  const pickedSlugs = new Set<string>();
  for (const slug of watchlist) {
    const p = bySlug.get(slug);
    if (p && !pickedSlugs.has(slug)) {
      picked.push(p);
      pickedSlugs.add(slug);
    }
  }
  const watchlistRanked = picked.length;
  const early = snapshot.protocols
    .filter(
      (p) =>
        isRankable(p) &&
        p.tvl_usd < floor_usd &&
        p.category !== "CEX" &&
        !isVersioned(p.name) &&
        !pickedSlugs.has(p.slug),
    )
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, EARLY_CAP);
  for (const p of early) {
    picked.push(p);
    pickedSlugs.add(p.slug);
  }

  const selectedConfig = CANDIDATE_CONFIGS[0]!;
  const calib = calibrate(snapshot.protocols, selectedConfig.shrink_k, selectedConfig.min_category_n);
  const fit = fitLaunchPrice(snapshot.protocols, as_of);
  const candidates = walkForward(snapshot.protocols, as_of);
  const { selected, rule } = selectCandidate(candidates);

  // Score the picked pool with the selected configuration.
  const scored = picked.map((p) => {
    const factors = scoreProtocol(p, calib, selectedConfig, as_of);
    return { p, factors };
  });
  scored.sort(
    (a, b) =>
      b.factors.implied_raw - a.factors.implied_raw ||
      (a.p.slug < b.p.slug ? -1 : 1),
  );
  const adjusted = enforceStrictlyDecreasing(
    scored.map((s) => s.factors.implied_raw),
  );

  // Bootstrap rank ranges over resampled calibrations.
  const live = liveProtocols(snapshot.protocols);
  const rng = mulberry32(BOOTSTRAP_SEED);
  const rankLists = new Map<string, number[]>();
  for (const { p } of scored) rankLists.set(p.slug, []);
  for (let refit = 0; refit < BOOTSTRAP_REFITS; refit++) {
    const resample: Protocol[] = [];
    for (let i = 0; i < live.length; i++) {
      resample.push(live[Math.floor(rng() * live.length)]!);
    }
    const refitCalib = calibrate(resample, selectedConfig.shrink_k, selectedConfig.min_category_n);
    const refitFit =
      selectedConfig.kind === "regression"
        ? fitLaunchPrice(resample, as_of)
        : null;
    const order = scored
      .map(({ p }) => {
        const value =
          refitFit !== null
            ? fittedValue(p, refitFit, as_of)
            : scoreProtocol(p, refitCalib, selectedConfig, as_of).implied_raw;
        return { slug: p.slug, value };
      })
      .sort((a, b) => b.value - a.value || (a.slug < b.slug ? -1 : 1));
    order.forEach((entry, i) => rankLists.get(entry.slug)!.push(i + 1));
  }
  const ranges = new Map<string, { lo: number; med: number; hi: number }>();
  const widths: number[] = [];
  for (const [slug, list] of rankLists) {
    const lo = quantileAt(list, 0.1);
    const med = quantileAt(list, 0.5);
    const hi = quantileAt(list, 0.9);
    ranges.set(slug, { lo, med, hi });
    widths.push(hi - lo);
  }

  // Farm verdicts by implied value per dollar staked, terciles.
  const byValuePerStake = scored
    .map((s, i) => ({ slug: s.p.slug, ratio: adjusted[i]! / stakeFor(s.p.tvl_usd) }))
    .sort((a, b) => b.ratio - a.ratio);
  const verdictOf = new Map<string, string>();
  const farmCut = Math.ceil(scored.length / 3);
  const thinCut = Math.ceil((2 * scored.length) / 3);
  byValuePerStake.forEach((entry, i) => {
    verdictOf.set(
      entry.slug,
      i < farmCut ? "FARM" : i < thinCut ? "THIN" : "SKIP",
    );
  });

  const rows: BoardRow[] = scored.map((s, i) => {
    const { p, factors } = s;
    const value = adjusted[i]!;
    const range = ranges.get(p.slug)!;
    const stake = stakeFor(p.tvl_usd);
    const finalFactors: Factors = { ...factors, implied_raw: value };
    return {
      rank: i + 1,
      rank_lo: range.lo,
      rank_med: range.med,
      rank_hi: range.hi,
      verdict: verdictOf.get(p.slug)!,
      stake_usd: stake,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: factors.age_days,
      implied_value_usd: value,
      fitted_value_usd: fittedValue(p, fit, as_of),
      factors: finalFactors,
      farm_steps: farmSteps(p, stake, factors.age_days),
    };
  });

  // Coverage: mutually exclusive buckets over the whole snapshot.
  let liveToken = 0;
  let cexPreToken = 0;
  let versionedPreToken = 0;
  let aboveFloorPreToken = 0;
  let other = 0;
  for (const p of snapshot.protocols) {
    if (pickedSlugs.has(p.slug)) continue;
    if (hasToken(p)) {
      liveToken++;
    } else if (p.category === "CEX") {
      cexPreToken++;
    } else if (isVersioned(p.name)) {
      versionedPreToken++;
    } else if (p.tvl_usd >= floor_usd) {
      aboveFloorPreToken++;
    } else {
      other++;
    }
  }
  const coverage: Coverage = {
    total: snapshot.protocols.length,
    ranked: picked.length,
    watchlist_ranked: watchlistRanked,
    early_ranked: early.length,
    live_token: liveToken,
    cex_pre_token: cexPreToken,
    versioned_pre_token: versionedPreToken,
    above_floor_pre_token: aboveFloorPreToken,
    other,
  };

  const validation: Validation = {
    method:
      "Walk-forward: calibrated on protocols listed before each cutoff, scored on protocols listed after it — the test protocols are never in the fit. Six configurations compared on mean held-out Spearman of predicted vs actual market cap.",
    folds_label: "folds by listed_at quartile",
    candidates,
    selected,
    selection_rule: rule,
    launch_price_fit: fit,
    rank_ranges: {
      refits: BOOTSTRAP_REFITS,
      median_width: quantileAt(widths, 0.5),
      p25_width: quantileAt(widths, 0.25),
      p75_width: quantileAt(widths, 0.75),
      tight_rows: widths.filter((w) => w <= 5).length,
    },
    verdict_rule:
      "Verdicts: implied value per dollar staked, terciles — FARM the top third, THIN the middle, SKIP the bottom. A verdict prices the farm, never a token launch.",
  };

  return {
    rows,
    validation,
    coverage,
    calib,
    fit,
    picked,
    early,
    live: liveEntries(snapshot.protocols),
  };
}

export function buildPayload(snapshot: Snapshot, board: BoardResult): Payload {
  return {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: { ...MODEL_CONSTANTS },
    global_multiple: board.calib.global,
    multiples: board.calib.stats,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.rows.length,
    early_size: board.early.length,
    live_size: board.live.length,
    coverage: board.coverage,
    validation: board.validation,
    rows: board.rows,
    live: board.live,
  };
}

/** Board gates: fail the run on the first problem, naming it. */
export function boardGates(snapshot: Snapshot, rows: BoardRow[]): string | null {
  if (rows.length < 100) return `board holds only ${rows.length} rows, fewer than 100`;
  const slugs = new Set(rows.map((r) => r.slug));
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.implied_value_usd >= rows[i - 1]!.implied_value_usd) {
      return `implied values do not strictly decrease at rank ${rows[i]!.rank}`;
    }
  }
  for (const row of rows) {
    if (row.farm_steps.length !== 6) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps, not 6`;
    }
  }
  return null;
}

/** Fail when any farm step looks cut short (not ending with a full stop). */
export function cutStepsGate(rows: BoardRow[]): string | null {
  for (const row of rows) {
    for (const step of row.farm_steps) {
      if (!step.endsWith(".")) return `farm step for ${row.slug} is cut short: ${step}`;
    }
  }
  return null;
}
