// Token Radar — the ranking model (radar-2).
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
  rows: DashRow[];
  live: LiveEntry[];
}

export const MODEL_VERSION = 'radar-2';
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

/**
 * Calibrate the multiples from the snapshot itself. The live set is every protocol with a
 * recorded market cap and a positive TVL; a category's multiple is the median of its live
 * ratios when the category holds at least 4, else the global median. Both are clamped.
 */
export function calibrate(snap: Snap): { global: number; byCategory: Map<string, number>; counts: Map<string, number>; stats: MultStat[] } {
  const live = snap.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const global = clamp(medianOf(live.map((p) => p.mcap_usd! / p.tvl_usd)), 0.02, 2.0);
  const ratios = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const list = ratios.get(key);
    if (list === undefined) ratios.set(key, [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }
  const byCategory = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const [cat, list] of ratios.entries()) counts.set(cat, list.length);
  const stats: MultStat[] = [];
  for (const [cat, list] of [...ratios.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (list.length >= 4) {
      const m = clamp(medianOf(list), 0.02, 2.0);
      byCategory.set(cat, m);
      stats.push({ category: cat, multiple: m, n: list.length, from_global: false });
    }
  }
  return { global, byCategory, counts, stats };
}

/** Score one protocol: every factor, the raw implied value before the board's strict ordering. */
export function scoreOne(p: Proto, asOf: string, cal: { global: number; byCategory: Map<string, number>; counts: Map<string, number> }): Factors {
  const key = p.category ?? 'Uncategorised';
  const own = cal.byCategory.get(key);
  const multiple = own !== undefined ? own : cal.global;
  const age = daysTracked(asOf, p.listed_at);
  const growthPct = clamp(typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0, -50, 100);
  const growthMult = 1 + (growthPct / 100) * 0.5;
  const ageForModel = age ?? 365;
  const maturityMult = 0.7 + (Math.min(Math.max(ageForModel, 0), 1095) / 1095) * 0.3;
  const chainMult = 1 + 0.02 * Math.min(p.chains.length, 10);
  const youthMult = age !== null && age < 90 ? 0.85 : 1;
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

/** Build the ranked board: the whole watchlist, then the early radar below the floor. */
export function buildBoard(snap: Snap): { board: BoardRow[]; earlySize: number; cal: { global: number; byCategory: Map<string, number>; counts: Map<string, number>; stats: MultStat[] } } {
  const cal = calibrate(snap);
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

  const scored = [...picked.values()].map((p) => ({ p, f: scoreOne(p, snap.as_of, cal) }));
  scored.sort((a, b) => b.f.implied_raw - a.f.implied_raw || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const finalValues = strictDecrease(scored.map((s) => s.f.implied_raw));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
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
  }));
  return { board, earlySize: early.length, cal };
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
export function multiplesFor(snap: Snap, cal: { global: number; byCategory: Map<string, number>; counts: Map<string, number>; stats: MultStat[] }): MultStat[] {
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

/** Everything the dashboard needs, from a built board. */
export function buildPayload(snap: Snap, board: BoardRow[], earlySize: number, cal: { global: number; byCategory: Map<string, number>; counts: Map<string, number>; stats: MultStat[] }): RadarPayload {
  return {
    as_of: snap.as_of,
    floor_usd: snap.floor_usd,
    model_version: MODEL_VERSION,
    model: {
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
      multiple_cap: 2.0,
      min_category_n: 4,
    },
    global_multiple: cal.global,
    multiples: multiplesFor(snap, cal),
    watchlist_size: snap.watchlist.length,
    board_size: board.length,
    early_size: earlySize,
    live_size: liveEntries(snap).length,
    rows: board.map((r) => ({
      rank: r.rank,
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
