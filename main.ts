// Token Radar — the entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot, scores every pre-token protocol with the model in
// lib/model.ts, and writes the entry's outputs:
//
//   /output/board.json     the ranked board, one row per protocol
//   /output/data.js        the dashboard's dataset, beside the page
//   /output/dashboard/    the page, copied from this repository
//   /output/screenshots/  the three captures, copied from this repository
//   /output/dossier.json  the judge's dossier, from vendor/makefun-board.ts
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// The program never touches the network, never reads a credential, and writes the
// same bytes on every run from the same snapshot.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardProblem, buildBoard, buildPayload, parseSnap, payloadScript, truncatedSteps } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

/** The caps the scorer enforces: the text cap shapes the dossier, the rest refuse. */
const TEXT_CAP = 65_536;
const SHOT_CAP = { max: 4, max_bytes: 524_288 };
const DASH_CAP = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read `--flag value` or `--flag=value` out of the process arguments. */
function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

/** Copy a directory's regular files into `to`, skipping dot-names, returning the names copied. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}

function main(): void {
  const inputArg = flag('input', '/input');
  const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputFile)) {
    fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
  }
  const out = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snap = parseSnap(readFileSync(inputFile, 'utf8'));
  const { board, earlySize, cal } = buildBoard(snap);
  const problem = boardProblem(board, snap);
  if (problem !== null) fail(`the model wrote a board the gate refuses: ${problem}`);
  const cut = truncatedSteps(board);
  if (cut.length > 0) fail(`${cut.length} farm steps were cut short: ${cut[0]}`);

  const payload = buildPayload(snap, board, earlySize, cal);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), payloadScript(payload));

  const dashFiles = copyDir(join(root, 'dashboard'), join(out, 'dashboard'));
  if (dashFiles.length < 3) fail(`dashboard/ holds ${dashFiles.length} files: hand in the page, its style and its script`);
  const shots = copyDir(join(root, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3) fail(`screenshots/ holds ${shots.length} images: hand in 3, the board, a detail view and a filtered view`);
  for (const name of shots) {
    if (!SHOT_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  }

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, { text_max_bytes: TEXT_CAP, screenshots: SHOT_CAP, dashboard: DASH_CAP }),
  );

  const top = board[0]!;
  const bottom = board[board.length - 1]!;
  process.stdout.write(
    `token radar: ${snap.protocols.length} protocols, ${snap.watchlist.length} on the watchlist, ${board.length} rows scored (${earlySize} early, ${payload.live_size} live set aside)\n` +
      `token radar: global multiple ${cal.global.toFixed(4)}x, ${cal.stats.length} calibrated categories, top ${top.slug} $${top.implied_value_usd}, bottom ${bottom.slug} $${bottom.implied_value_usd}\n` +
      `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
  );
}

main();
