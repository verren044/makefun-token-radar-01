/* Token Radar dashboard (radar-4). Renders window.RADAR from ../data.js.
   No network: only local data.js and this file's own assets. */
(function () {
  "use strict";
  var D = window.RADAR;
  if (!D) { document.body.textContent = "data.js did not load."; return; }
  var M = D.model;

  /* ---------- formatting ---------- */
  function money(v) {
    if (v === null || v === undefined || !isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + Math.round(v / 1e3) + "K";
    return "$" + Math.round(v);
  }
  function pct(v) {
    if (v === null || v === undefined) return "—";
    return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  }
  function ageFmt(days) {
    if (days === null || days === undefined) return "—";
    if (days >= 365) return (days / 365).toFixed(1) + "y";
    return days + "d";
  }
  function multFmt(v) { return v.toFixed(3) + "x"; }
  function esc(s) { return String(s); }

  /* ---------- recompute check ---------- */
  function recompute(row) {
    var f = row.factors;
    var raw = row.tvl_usd * f.multiple * f.growth_mult * f.maturity_mult * f.chain_mult * f.youth_mult;
    return Math.max(1, Math.round(raw));
  }
  var mismatchCount = 0;
  D.rows.forEach(function (r) { if (recompute(r) !== r.implied_value_usd) mismatchCount++; });

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* ---------- KPI strip ---------- */
  var selected = D.validation.candidates.filter(function (c) { return c.name === D.validation.selected; })[0];
  var fit = D.validation.launch_price_fit;
  var kpis = [
    ["Snapshot", D.coverage.total + " protocols"],
    ["Pre-token rows scored", String(D.board_size)],
    ["Farm plans", D.board_size + " plans"],
    ["Live-token set aside", String(D.coverage.live_token)],
    ["Watchlist", D.watchlist_size + " / " + D.watchlist_size],
    ["Global multiple", multFmt(D.global_multiple)],
    ["Fitted R²", fit.r2.toFixed(3)],
    ["Walk-forward mean Spearman", selected.mean_mcap_spearman.toFixed(3)]
  ];
  var kpiGrid = $("kpi-grid");
  kpis.forEach(function (k) {
    var tile = el("div", "kpi");
    tile.appendChild(el("div", "kpi-label", k[0]));
    tile.appendChild(el("div", "kpi-value", k[1]));
    kpiGrid.appendChild(tile);
  });

  /* ---------- validation ---------- */
  $("validation-method").textContent = D.validation.method;
  var foldBody = document.querySelector("#fold-table tbody");
  selected.folds.forEach(function (f) {
    var tr = document.createElement("tr");
    tr.appendChild(el("td", null, f.window));
    tr.appendChild(el("td", "num", String(f.train_n)));
    tr.appendChild(el("td", "num", String(f.test_n)));
    tr.appendChild(el("td", "num", f.mcap_spearman === null ? "n/a" : f.mcap_spearman.toFixed(3)));
    tr.appendChild(el("td", "num", f.ratio_spearman === null ? "n/a" : f.ratio_spearman.toFixed(3)));
    tr.appendChild(el("td", "num", f.mdape === null ? "n/a" : f.mdape.toFixed(1) + "%"));
    foldBody.appendChild(tr);
  });
  function meanLine(c) {
    return "Mean held-out: mcap Spearman " + c.mean_mcap_spearman.toFixed(3) +
      ", ratio Spearman " + (c.mean_ratio_spearman === null ? "n/a" : c.mean_ratio_spearman.toFixed(3)) +
      ", MdAPE " + c.mean_mdape.toFixed(1) + "%.";
  }
  $("kept-line").textContent = "Kept: " + D.validation.selected + " — " + D.validation.selection_rule + " " + meanLine(selected);
  var rr = D.validation.rank_ranges;
  $("rank-ranges-line").textContent = "Rank ranges (" + rr.refits + " bootstrap refits): median p90–p10 width " +
    rr.median_width + " of " + D.board_size + " ranks (p25 " + rr.p25_width + ", p75 " + rr.p75_width +
    "); only " + rr.tight_rows + " rows hold a range of 5 or less — the top is firm, the middle is not.";
  $("verdict-rule-line").textContent = D.validation.verdict_rule;
  var fittedCand = D.validation.candidates.filter(function (c) { return c.name === "fitted log-regression"; })[0];
  $("fitted-line").textContent = "Fitted launch pricing: log market cap on log TVL, log age, chain count and seven-day change, fitted on " +
    fit.n + " live protocols (" + fit.zero_mcap_excluded + " with a market cap of exactly zero left out — a log fit cannot use them). R² " +
    fit.r2.toFixed(3) + ", residual SD " + fit.resid_sd.toFixed(2) + " log points. Held-out ratio Spearman " +
    fittedCand.mean_ratio_spearman.toFixed(3) + " — the first candidate that ranks the ratio — but held-out mcap Spearman " +
    fittedCand.mean_mcap_spearman.toFixed(3) + ", below " + D.validation.selected + ", so the board keeps " + D.validation.selected +
    " and every row carries the fitted price as a second estimate only.";

  /* ---------- coverage ---------- */
  var c = D.coverage;
  $("coverage-note").textContent = "The snapshot holds " + c.total + " protocols. " + c.ranked + " are ranked (" +
    c.watchlist_ranked + " watchlist + " + c.early_ranked + " early), " + c.live_token + " already trade and are set aside, " +
    c.cex_pre_token + " are centralised exchanges, " + c.versioned_pre_token + " are versioned pools of a ranked protocol, " +
    c.above_floor_pre_token + " sit above the floor without a token and are not on the watchlist, and " + c.other +
    " fall nowhere else. The buckets sum to " + c.total + " — nothing is silently left out.";
  var coverageRows = [
    ["Ranked on the board", c.ranked, "Watchlist (" + c.watchlist_ranked + ") plus the early radar below the floor (" + c.early_ranked + ")."],
    ["Live token, set aside", c.live_token, "Already trade; their market cap is a fact, not a model."],
    ["Centralised exchange, pre-token", c.cex_pre_token, "Exchanges rarely issue a token the same way a protocol does."],
    ["Versioned pool of a ranked protocol", c.versioned_pre_token, "A v2/v3/v4 entry whose base protocol is already ranked."],
    ["Above the floor, not on the watchlist", c.above_floor_pre_token, "No token on record and TVL above the floor, but outside the watchlist."],
    ["Other", c.other, "Everything else — none on this snapshot."],
    ["Total", c.total, "The sealed snapshot, whole."]
  ];
  var covBody = $("coverage-body");
  coverageRows.forEach(function (r) {
    var tr = document.createElement("tr");
    tr.appendChild(el("td", null, r[0]));
    tr.appendChild(el("td", "num", String(r[1])));
    tr.appendChild(el("td", null, r[2]));
    covBody.appendChild(tr);
  });

  /* ---------- method: formula, multiples, candidates, fit ---------- */
  $("formula-line").textContent = "implied = round( tvl x multiple(category) x (1 + clamp(change_7d, " +
    M.growth_floor + ", " + M.growth_cap + ") / 100 x " + M.growth_weight + ") x (" + M.maturity_floor +
    " + min(age_days, " + M.maturity_days + ") / " + M.maturity_days + " x " + M.maturity_range +
    ") x (1 + " + M.chain_step + " x min(chains, " + M.chain_cap + ")) x youth )";
  var multBody = $("multiples-body");
  D.multiples.forEach(function (s) {
    var tr = document.createElement("tr");
    tr.appendChild(el("td", null, s.category));
    tr.appendChild(el("td", "num", multFmt(s.multiple)));
    tr.appendChild(el("td", "num", String(s.n)));
    tr.appendChild(el("td", null, s.from_global ? "Global median" : "Category median"));
    multBody.appendChild(tr);
  });
  $("recompute-note").textContent = "The page recomputes every row from the snapshot figures: " +
    mismatchCount + " mismatches out of " + D.rows.length + " rows.";
  var candBody = $("candidates-body");
  D.validation.candidates.forEach(function (cand) {
    var tr = document.createElement("tr");
    tr.appendChild(el("td", null, cand.name));
    tr.appendChild(el("td", "num", cand.mean_mcap_spearman === null ? "n/a" : cand.mean_mcap_spearman.toFixed(3)));
    tr.appendChild(el("td", "num", cand.mean_ratio_spearman === null ? "n/a" : cand.mean_ratio_spearman.toFixed(3)));
    tr.appendChild(el("td", "num", cand.mean_mdape === null ? "n/a" : cand.mean_mdape.toFixed(1) + "%"));
    tr.appendChild(el("td", null, cand.name === D.validation.selected ? "Kept" : "—"));
    candBody.appendChild(tr);
  });
  var coeffRows = [
    ["Intercept", fit.intercept, "The log market cap of a protocol with TVL $1, age 1 day, 1 chain and no 7-day change — the fit's baseline."],
    ["log TVL", fit.b_log_tvl, "A 10x TVL multiplies the fitted price by about 3.3x."],
    ["log age", fit.b_log_age, "Older protocols price lower, all else equal — a 10x age multiplies the fitted price by about 0.70x."],
    ["Chains", fit.b_chains, "Each extra chain (up to 10) adds about 4.5% to the fitted price."],
    ["7-day change", fit.b_change, "Each point of 7-day TVL change moves the fitted price by about -3.8%."]
  ];
  var coeffBody = $("coefficients-body");
  coeffRows.forEach(function (r) {
    var tr = document.createElement("tr");
    tr.appendChild(el("td", null, r[0]));
    tr.appendChild(el("td", "num", r[1].toFixed(3)));
    tr.appendChild(el("td", null, r[2]));
    coeffBody.appendChild(tr);
  });
  var effects = fit.cat_effects.slice().sort(function (a, b) { return b.effect - a.effect; });
  var top2 = effects.slice(0, 2), low = effects[effects.length - 1];
  function signed(v) { return (v >= 0 ? "+" : "") + v.toFixed(2); }
  $("effects-line").textContent = "Category effects (shrunk residuals, log points): highest " + top2[0].category + " " +
    signed(top2[0].effect) + ", " + top2[1].category + " " + signed(top2[1].effect) + "; lowest " + low.category + " " +
    signed(low.effect) + ". " + effects.length + " categories carry an effect; a protocol in a category with no live protocols takes no effect.";

  /* ---------- board state ---------- */
  var catCounts = {}, catFirst = {};
  D.rows.forEach(function (r, i) {
    catCounts[r.category] = (catCounts[r.category] || 0) + 1;
    if (catFirst[r.category] === undefined) catFirst[r.category] = i;
  });
  var allCats = Object.keys(catCounts).sort(function (a, b) {
    return catCounts[b] - catCounts[a] || catFirst[a] - catFirst[b];
  });
  var topCats = allCats.slice(0, 6);
  var multByCat = {};
  D.multiples.forEach(function (s) { multByCat[s.category] = s; });

  var state = { q: "", cat: "", mode: "pre", sort: "implied", dir: -1, selected: null };
  var DEFAULT_DIR = { rank: 1, name: 1, tvl: -1, growth: -1, age: -1, implied: -1, fitted: -1 };

  function readHash() {
    var h = location.hash.replace(/^#/, "");
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get("q")) state.q = p.get("q");
    if (p.get("cat")) state.cat = p.get("cat");
    if (p.get("mode") === "live") state.mode = "live";
    if (p.get("row")) state.selected = p.get("row");
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.cat) p.set("cat", state.cat);
    if (state.mode === "live") p.set("mode", "live");
    if (state.selected) p.set("row", state.selected);
    var h = p.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }

  /* ---------- controls ---------- */
  var searchInput = $("search"), catSelect = $("category-select"), sortSelect = $("sort-select");
  var optAll = el("option", null, "All categories"); optAll.value = "";
  catSelect.appendChild(optAll);
  allCats.forEach(function (cat) {
    var o = el("option", null, cat + " (" + catCounts[cat] + ")"); o.value = cat;
    catSelect.appendChild(o);
  });
  var chipsBox = $("chips");
  function chip(label, cat) {
    var b = el("button", "chip" + (state.cat === cat ? " active" : ""), label);
    b.type = "button";
    b.addEventListener("click", function () {
      state.cat = cat; catSelect.value = cat; render(); writeHash();
    });
    chipsBox.appendChild(b);
  }
  chip("All categories (" + D.rows.length + ")", "");
  topCats.forEach(function (cat) { chip(cat + " (" + catCounts[cat] + ")", cat); });

  searchInput.addEventListener("input", function () { state.q = searchInput.value.trim(); render(); writeHash(); });
  catSelect.addEventListener("change", function () { state.cat = catSelect.value; render(); writeHash(); });
  sortSelect.addEventListener("change", function () {
    state.sort = sortSelect.value; state.dir = DEFAULT_DIR[state.sort] || -1; render(); writeHash();
  });
  function setMode(mode) {
    state.mode = mode;
    $("toggle-pre").classList.toggle("active", mode === "pre");
    $("toggle-live").classList.toggle("active", mode === "live");
    $("toggle-pre").setAttribute("aria-pressed", mode === "pre" ? "true" : "false");
    $("toggle-live").setAttribute("aria-pressed", mode === "live" ? "true" : "false");
    render(); writeHash();
  }
  $("toggle-pre").addEventListener("click", function () { setMode("pre"); });
  $("toggle-live").addEventListener("click", function () { setMode("live"); });
  document.querySelectorAll(".sort-head").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.getAttribute("data-sort");
      if (state.sort === key) { state.dir = -state.dir; }
      else { state.sort = key; state.dir = DEFAULT_DIR[key] || -1; }
      sortSelect.value = state.sort in { implied: 1, fitted: 1, tvl: 1, growth: 1, age: 1, name: 1 } ? state.sort : "implied";
      render(); writeHash();
    });
  });

  /* ---------- filtering + sorting ---------- */
  function matches(item) {
    if (state.cat && item.category !== state.cat) return false;
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    var hay = [item.name, item.slug, item.category || ""].concat(item.chains || []).join(" ").toLowerCase();
    return hay.indexOf(q) !== -1;
  }
  function sortValue(row, key) {
    switch (key) {
      case "rank": return row.rank;
      case "name": return row.name.toLowerCase();
      case "tvl": return row.tvl_usd;
      case "growth": return row.factors ? row.factors.growth_pct : (row.change_7d === null ? 0 : row.change_7d);
      case "age": return row.age_days === null ? M.unknown_age_days : row.age_days;
      case "implied": return row.implied_value_usd;
      case "fitted": return row.fitted_value_usd;
      default: return row.implied_value_usd;
    }
  }
  function sortRows(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var va = sortValue(a, key), vb = sortValue(b, key);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.rank - b.rank;
    });
  }

  /* ---------- rendering ---------- */
  var boardBody = $("board-body"), liveBody = $("live-body");
  var maxImplied = Math.max.apply(null, D.rows.map(function (r) { return r.implied_value_usd; }));

  function renderBoard(list) {
    boardBody.innerHTML = "";
    list.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.setAttribute("data-slug", row.slug);
      var open = function () { openDialog(row.slug); };
      tr.addEventListener("click", open);
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
      var rankCell = el("td");
      rankCell.appendChild(el("div", "rank-num", String(row.rank)));
      rankCell.appendChild(el("div", "rank-range", row.rank_lo + "–" + row.rank_hi));
      tr.appendChild(rankCell);
      var proto = el("td");
      proto.appendChild(el("div", "proto-name", row.name));
      proto.appendChild(el("div", "proto-sub", (row.category || "—") + " · " + row.chains.slice(0, 2).join(", ")));
      tr.appendChild(proto);
      tr.appendChild(el("td", "num", money(row.tvl_usd)));
      var chg = el("td", "num " + (row.change_7d === null ? "" : row.change_7d < 0 ? "pct-neg" : "pct-pos"), pct(row.change_7d));
      tr.appendChild(chg);
      tr.appendChild(el("td", "num", ageFmt(row.age_days)));
      tr.appendChild(el("td", "num", multFmt(row.factors.multiple)));
      var imp = el("td", "bar-cell");
      var track = el("div", "bar-track");
      var fill = el("div", "bar-fill");
      fill.style.width = Math.max(1, row.implied_value_usd / maxImplied * 100).toFixed(1) + "%";
      track.appendChild(fill);
      imp.appendChild(track);
      imp.appendChild(el("span", "bar-value", money(row.implied_value_usd)));
      tr.appendChild(imp);
      tr.appendChild(el("td", "num", money(row.fitted_value_usd)));
      var vcell = el("td");
      vcell.appendChild(el("span", "pill pill-" + row.verdict.toLowerCase(), row.verdict));
      tr.appendChild(vcell);
      var tcell = el("td");
      tcell.appendChild(el("span", "tag-token", "no token"));
      tr.appendChild(tcell);
      boardBody.appendChild(tr);
    });
  }

  function renderLive(list) {
    liveBody.innerHTML = "";
    var sorted = list.slice();
    if (state.sort === "tvl") sorted.sort(function (a, b) { return (b.tvl_usd - a.tvl_usd) * -state.dir; });
    else if (state.sort === "growth") sorted.sort(function (a, b) { return ((b.change_7d || 0) - (a.change_7d || 0)) * -state.dir; });
    else if (state.sort === "name") sorted.sort(function (a, b) { return (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) * state.dir; });
    else sorted.sort(function (a, b) { return b.mcap_usd - a.mcap_usd; });
    sorted.forEach(function (item) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", null, "—"));
      var proto = el("td");
      proto.appendChild(el("div", "proto-name", item.name));
      proto.appendChild(el("div", "proto-sub", (item.category || "—") + " · " + item.chains.slice(0, 2).join(", ")));
      tr.appendChild(proto);
      tr.appendChild(el("td", "num", money(item.tvl_usd)));
      var chg = el("td", "num " + (item.change_7d === null ? "" : item.change_7d < 0 ? "pct-neg" : "pct-pos"), pct(item.change_7d));
      tr.appendChild(chg);
      tr.appendChild(el("td", "num", money(item.mcap_usd)));
      tr.appendChild(el("td", "num", item.tvl_usd ? (item.mcap_usd / item.tvl_usd).toFixed(2) + "x" : "—"));
      var tcell = el("td");
      tcell.appendChild(el("span", "tag-token tag-live", "already trades"));
      tr.appendChild(tcell);
      liveBody.appendChild(tr);
    });
  }

  function render() {
    document.querySelectorAll(".sort-arrow").forEach(function (s) {
      var key = s.getAttribute("data-arrow");
      s.textContent = state.sort === key ? (state.dir === -1 ? "▼" : "▲") : "";
    });
    var isLive = state.mode === "live";
    $("board-table").hidden = isLive;
    $("live-table").hidden = !isLive;
    if (isLive) {
      var liveList = D.live.filter(matches);
      renderLive(liveList);
      $("row-count").textContent = liveList.length === D.live.length
        ? D.live.length + " live-token protocols"
        : liveList.length + " of " + D.live.length + " live-token protocols";
      $("board-caption").textContent = "Live-token protocols, largest market cap first. Their market cap is a fact, not a model.";
    } else {
      var rows = sortRows(D.rows.filter(matches));
      renderBoard(rows);
      $("row-count").textContent = rows.length + " of " + D.rows.length + " rows shown";
      $("board-caption").textContent = "Pre-token protocols, strongest implied value first. Ranks carry bootstrap p10–p90 ranges; verdicts price the farm (FARM / THIN / SKIP). Fitted price is the log-regression prediction — a second estimate, never the rank. Select a row for detail.";
    }
    chipsBox.querySelectorAll(".chip").forEach(function (b, i) {
      var cat = i === 0 ? "" : topCats[i - 1];
      b.classList.toggle("active", state.cat === cat);
    });
  }

  /* ---------- detail dialog ---------- */
  var backdrop = $("dialog-backdrop");
  function openDialog(slug) {
    var row = D.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    $("dialog-kicker").textContent = "Rank " + row.rank + " of " + D.rows.length + " · bootstrap range " + row.rank_lo + "–" + row.rank_hi;
    $("dialog-name").textContent = row.name;
    $("dialog-sub").textContent = (row.category || "—") + " · " + row.chains.join(", ");
    var f = row.factors;
    var stat = multByCat[row.category];
    var multNote = f.multiple_global ? "(global median)" : "(" + (stat ? stat.n : f.multiple_n) + " live protocols)";
    var facts = [
      ["TVL", money(row.tvl_usd)],
      ["Seven-day growth", pct(row.change_7d)],
      ["Age with no token", ageFmt(row.age_days)],
      ["Category multiple", multFmt(f.multiple) + " " + multNote],
      ["Growth multiplier", f.growth_mult.toFixed(4) + "x"],
      ["Maturity multiplier", f.maturity_mult.toFixed(4) + "x"],
      ["Chain multiplier", f.chain_mult.toFixed(4) + "x"],
      ["Youth multiplier", f.youth_mult.toFixed(2) + "x"],
      ["Implied value", money(row.implied_value_usd)],
      ["Fitted launch price", money(row.fitted_value_usd)],
      ["Farm verdict", row.verdict + " · $" + row.stake_usd + " staked"]
    ];
    var factsBox = $("dialog-facts");
    factsBox.innerHTML = "";
    facts.forEach(function (pair) {
      var wrap = document.createElement("div");
      wrap.appendChild(el("dt", null, pair[0]));
      wrap.appendChild(el("dd", null, pair[1]));
      factsBox.appendChild(wrap);
    });
    var again = recompute(row);
    $("dialog-recompute").textContent = "Model " + D.model_version + ": the page recomputes this row as " + money(again) +
      (again === row.implied_value_usd ? " — the same number the board carries." : " — which differs from the board.");
    $("dialog-fitted").textContent = "Fitted launch price " + money(row.fitted_value_usd) +
      " is the log-regression prediction (R² " + fit.r2.toFixed(3) + ") — a second estimate shown beside the implied value. The rank uses the multiple model, never the fit.";
    $("dialog-verdict-rule").textContent = D.validation.verdict_rule;
    var plan = $("dialog-plan");
    plan.innerHTML = "";
    row.farm_steps.forEach(function (step) {
      var li = document.createElement("li");
      var idx = step.indexOf(" Cost: ");
      if (idx === -1) { li.textContent = step; }
      else {
        li.appendChild(document.createTextNode(step.slice(0, idx)));
        li.appendChild(el("span", "step-cost", step.slice(idx + 1)));
      }
      plan.appendChild(li);
    });
    backdrop.hidden = false;
    writeHash();
  }
  function closeDialog() {
    backdrop.hidden = true;
    state.selected = null;
    writeHash();
  }
  $("dialog-close").addEventListener("click", closeDialog);
  backdrop.addEventListener("click", function (e) { if (e.target === backdrop) closeDialog(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !backdrop.hidden) closeDialog();
  });

  /* ---------- init ---------- */
  readHash();
  searchInput.value = state.q;
  catSelect.value = state.cat;
  if (state.mode === "live") setMode("live");
  render();
  if (state.selected) openDialog(state.selected);
})();
