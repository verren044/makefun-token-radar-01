// Token Radar — entrypoint (radar-4). Node 22, standard library only.
// Usage: MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildDossier } from "./vendor/makefun-board.ts";
import {
  parseSnapshot,
  buildBoard,
  buildPayload,
  boardGates,
  cutStepsGate,
  MODEL_VERSION,
} from "./lib/model.ts";

function fail(message: string): never {
  throw new Error(message);
}

function copyTree(srcDir: string, destDir: string): number {
  mkdirSync(destDir, { recursive: true });
  let count = 0;
  const walk = (src: string, dest: string) => {
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      const s = join(src, entry.name);
      const d = join(dest, entry.name);
      if (entry.isDirectory()) {
        mkdirSync(d, { recursive: true });
        walk(s, d);
      } else if (entry.isFile()) {
        cpSync(s, d);
        count++;
      }
    }
  };
  walk(srcDir, destDir);
  return count;
}

const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function main(): void {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf("--input");
  // Default like the kit starter: --input, else MAKEFUN_INPUT_DIR, else /input.
  // Accepts a dir or a file (a dir means <dir>/snapshot.json).
  const inputArg = inputIdx !== -1 && args[inputIdx + 1]
    ? args[inputIdx + 1]!
    : (process.env.MAKEFUN_INPUT_DIR ?? "/input");
  const inputPath = inputArg.endsWith(".json") ? inputArg : join(inputArg, "snapshot.json");
  const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? "./out");
  let raw: string;
  try {
    raw = readFileSync(inputPath, "utf8");
  } catch {
    fail(`cannot read snapshot ${inputPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw!);
  } catch {
    fail(`snapshot ${inputPath} does not parse as JSON`);
  }
  const snapshot = parseSnapshot(parsed);
  const board = buildBoard(snapshot);

  const gate = boardGates(snapshot, board.rows);
  if (gate) fail(`board gate failed: ${gate}`);
  const cut = cutStepsGate(board.rows);
  if (cut) fail(`farm steps gate failed: ${cut}`);

  const payload = buildPayload(snapshot, board);
  mkdirSync(outDir, { recursive: true });

  const boardJson = JSON.stringify({ rows: board.rows, validation: board.validation }) + "\n";
  writeFileSync(join(outDir, "board.json"), boardJson);
  const dataJs = `window.RADAR=${JSON.stringify(payload)};\n`;
  writeFileSync(join(outDir, "data.js"), dataJs);

  const repoRoot = resolve(import.meta.dirname ?? ".");
  const dashDir = join(repoRoot, "dashboard");
  const shotsDir = join(repoRoot, "screenshots");
  if (!existsSync(dashDir)) fail("dashboard/ is missing from the repository");
  if (!existsSync(shotsDir)) fail("screenshots/ is missing from the repository");
  const dashCount = copyTree(dashDir, join(outDir, "dashboard"));
  if (dashCount < 3) fail(`dashboard/ holds only ${dashCount} files, fewer than 3`);
  const shotNames = readdirSync(shotsDir).filter((n) => {
    const st = statSync(join(shotsDir, n));
    return st.isFile();
  });
  if (shotNames.length < 3) fail(`screenshots/ holds only ${shotNames.length} files, fewer than 3`);
  for (const name of shotNames) {
    if (!PLAIN_NAME.test(name)) fail(`screenshots/${name} is not a plain dossier name`);
  }
  copyTree(shotsDir, join(outDir, "screenshots"));

  const dossier = buildDossier(outDir, {
    text_max_bytes: Math.floor(1.5 * 1024 * 1024),
    screenshots: { max: 8, max_bytes: 256 * 1024 },
    dashboard: { max_files: 16, max_bytes: 64 * 1024 },
  });
  writeFileSync(join(outDir, "dossier.json"), dossier);

  const fit = board.validation.launch_price_fit;
  const top = board.rows[0]!;
  const bottom = board.rows[board.rows.length - 1]!;
  const fmt3 = (v: number | null) => (v === null ? "n/a" : v.toFixed(3));
  const fmtPct = (v: number | null) => (v === null ? "n/a" : `${v.toFixed(1)}%`);
  console.log(
    `${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.rows.length} rows scored (${board.early.length} early, ${board.live.length} live set aside)`,
  );
  const c = board.coverage;
  console.log(
    `coverage: ranked ${c.ranked} (watchlist ${c.watchlist_ranked} + early ${c.early_ranked}), live-token ${c.live_token}, CEX ${c.cex_pre_token}, versioned ${c.versioned_pre_token}, above-floor pre-token ${c.above_floor_pre_token}, other ${c.other}, total ${c.total}`,
  );
  const radar2 = board.validation.candidates.find((x) => x.name === "radar-2 (v1)")!;
  const fitted = board.validation.candidates.find((x) => x.name === "fitted log-regression")!;
  console.log(
    `fitted launch price: R² ${fit.r2.toFixed(3)} on ${fit.n} live protocols (${fit.zero_mcap_excluded} zero-mcap left out), residual SD ${fit.resid_sd.toFixed(2)} log points; held-out ratio Spearman ${fmt3(fitted.mean_ratio_spearman)} vs radar-2 ${fmt3(radar2.mean_ratio_spearman)}`,
  );
  console.log(
    `global multiple ${board.calib.global.toFixed(4)}x, ${board.calib.stats.filter((s) => !s.from_global).length} calibrated categories, top ${top.slug} $${top.implied_value_usd}, bottom ${bottom.slug} $${bottom.implied_value_usd}`,
  );
  console.log(`validation: selected ${board.validation.selected}`);
  for (const cand of board.validation.candidates) {
    console.log(
      `  ${cand.name}: ${fmt3(cand.mean_mcap_spearman)} / ${fmt3(cand.mean_ratio_spearman)} / ${fmtPct(cand.mean_mdape)}`,
    );
  }
  const selectedCand = board.validation.candidates.find(
    (x) => x.name === board.validation.selected,
  )!;
  for (const fold of selectedCand.folds) {
    console.log(
      `  ${fold.window}: train ${fold.train_n}, test ${fold.test_n}, mcap Spearman ${fmt3(fold.mcap_spearman)}, ratio Spearman ${fmt3(fold.ratio_spearman)}, MdAPE ${fmtPct(fold.mdape)}`,
    );
  }
  const rr = board.validation.rank_ranges;
  console.log(
    `bootstrap rank ranges (${rr.refits} refits): median width ${rr.median_width}, p25 ${rr.p25_width}, p75 ${rr.p75_width}, tight rows ${rr.tight_rows}`,
  );
  const verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const row of board.rows) verdicts[row.verdict as keyof typeof verdicts]++;
  console.log(`farm verdicts: FARM ${verdicts.FARM}, THIN ${verdicts.THIN}, SKIP ${verdicts.SKIP}`);
  console.log(
    `wrote board.json, data.js, dashboard/, screenshots/ and dossier.json to ${outDir} (${MODEL_VERSION})`,
  );
}

main();
