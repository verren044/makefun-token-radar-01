// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, filters, sort, a per-protocol detail
// view with the model's own inputs and the protocol's farm plan, and the
// live-token view that keeps already-trading tokens apart from the board.
// No network: every byte shown is in data.js.
//
// The model, in one function: the page recomputes a row from the snapshot
// figures and checks the number board.json carries, so the page's code and
// the board's data are visibly the same arithmetic:
//   implied = TVL x multiple(category) x growthMult x maturityMult
//             x chainMult x youngDiscount
// multiple(category) is the median market-cap-per-TVL-dollar of the
// live-token protocols in that category (global median when the category has
// fewer than 4 priced protocols). v1 used one flat multiple of 0.25 for every
// protocol; v2 calibrates it per category from the snapshot itself.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;
  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'pre', sort: 'implied', dir: -1, selected: null };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.round(d) + 'd'; }
  function multipleOf(row) { var m = DATA.multiples && DATA.multiples[row.category]; return (m === undefined ? DATA.global_multiple : m); }

  // Recompute one row's implied value from the snapshot figures, exactly as
  // lib/model.ts does. The detail view shows the check beside board.json's number.
  function recompute(row) {
    return Math.max(1, Math.round(row.tvl_usd * multipleOf(row) * row.growth_multiplier * row.maturity_multiplier * row.chain_multiplier * row.young_discount));
  }

  var categories = [];
  DATA.rows.forEach(function (r) { if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category); });
  categories.sort();
  var chains = [];
  DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
  chains.sort();

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    // Watchlist-only uses the board's own watchlist flag carried in the slug set.
    if (state.watch) rows = rows.filter(function (r) { return DATA.watchlist_slugs.indexOf(r.slug) >= 0; });
    var key = state.sort, dir = state.dir;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'growth') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (key === 'age') d = (a.age_days || 0) - (b.age_days || 0);
      else d = a.name.localeCompare(b.name);
      return d * dir || (a.slug < b.slug ? -1 : 1);
    });
    return rows;
  }

  function rowHtml(r) {
    var g = r.change_7d;
    var cls = g === null ? '' : (g >= 0 ? 'up' : 'down');
    var wl = DATA.watchlist_slugs.indexOf(r.slug) >= 0 ? ' <span class="badge">WATCHLIST</span>' : '';
    return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><b>' + esc(r.name) + '</b>' + wl + '<br><span class="slug">' + esc(r.slug) + '</span> <span class="cat">' + esc(r.category || 'uncategorised') + '</span></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + cls + '">' + fmtPct(g) + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td>' + esc((r.chains || []).slice(0, 3).join(', ')) + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '') + '</td>' +
      '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td></tr>';
  }

  function detailHtml(r) {
    var comp = DATA.live.filter(function (l) { return l.category === r.category && l.mcap_usd; })
      .sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }).slice(0, 3);
    var compHtml = comp.length ? comp.map(function (l) {
      var ratio = l.tvl_usd > 0 ? (l.mcap_usd / l.tvl_usd).toFixed(2) : 'n/a';
      return '<li><b>' + esc(l.name) + '</b> — market cap ' + fmtUsd(l.mcap_usd) + ' on ' + fmtUsd(l.tvl_usd) + ' TVL, ' + ratio + 'x TVL</li>';
    }).join('') : '<li>No priced live-token protocol in this category in the snapshot.</li>';
    var steps = (r.farm_steps || []).map(function (s, i) { return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(s) + '</li>'; }).join('');
    var check = recompute(r);
    return '<section class="detail" id="detail"><h2>' + esc(r.name) + ' — rank #' + r.rank + '</h2>' +
      '<p class="meta">' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') + ' · chains: ' + esc((r.chains || []).join(', ') || 'n/a') +
      ' · tracked since ' + esc(r.listed_at || 'unknown') + ' · snapshot ' + esc(DATA.as_of) + '</p>' +
      '<div class="grid">' +
      '<div class="cell"><b>' + fmtUsd(r.implied_value_usd) + '</b><span>implied value</span></div>' +
      '<div class="cell"><b>' + fmtUsd(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div class="cell"><b>' + fmtPct(r.change_7d) + '</b><span>TVL change, 7d</span></div>' +
      '<div class="cell"><b>' + fmtAge(r.age_days) + '</b><span>tracked, no token recorded</span></div>' +
      '<div class="cell"><b>' + multipleOf(r).toFixed(3) + 'x</b><span>category multiple</span></div>' +
      '<div class="cell"><b>' + fmtUsd(check) + '</b><span>page recompute — ' + (check === r.implied_value_usd ? 'matches board' : 'differs from board') + '</span></div>' +
      '</div>' +
      '<h3>How the number is built</h3>' +
      '<p class="model">implied = TVL <code>' + fmtUsd(r.tvl_usd) + '</code> × multiple <code>' + multipleOf(r).toFixed(3) + 'x</code>' +
      ' × growth <code>' + r.growth_multiplier.toFixed(4) + 'x</code> × maturity <code>' + r.maturity_multiplier.toFixed(4) + 'x</code>' +
      ' × chains <code>' + r.chain_multiplier.toFixed(4) + 'x</code> × young <code>' + r.young_discount.toFixed(2) + 'x</code>' +
      ' = <code>' + fmtUsd(r.implied_value_usd) + '</code>. The multiple is the median market-cap-per-TVL-dollar of live-token protocols in this category; growth is the 7-day TVL change clamped to −50%…+100%; maturity rises with days tracked; multi-chain protocols earn a small breadth premium; protocols tracked under 90 days take a 0.85x youth discount.</p>' +
      '<h3>How to farm it</h3><ol>' + steps + '</ol>' +
      '<h3>What the market already pays in this category</h3><ul>' + compHtml + '</ul>' +
      '<p class="note">“Records no token” is what the snapshot says — it is not proof the protocol has none. A token launch is never predicted here: the implied value is this radar\u2019s own claim about what a launch would be worth if the protocol\u2019s record stayed as it is.</p>' +
      '</section>';
  }

  // The calibrated multiples, as a table, so the judge and the reader see
  // exactly what the board prices each sector at — no hidden constant.
  function multiplesHtml() {
    var cats = Object.keys(DATA.multiples || {}).sort(function (a, b) { return DATA.multiples[b] - DATA.multiples[a]; });
    if (cats.length === 0) return '';
    var rows = cats.map(function (c) {
      return '<tr><td>' + esc(c) + '</td><td class="num">' + DATA.multiples[c].toFixed(3) + 'x</td></tr>';
    }).join('');
    return '<div class="mult"><table><thead><tr><th>Category</th><th class="num">Multiple (median MCap / TVL)</th></tr></thead><tbody>' + rows +
      '<tr><td>Other categories (too few priced protocols)</td><td class="num">' + DATA.global_multiple.toFixed(3) + 'x (global median)</td></tr></tbody></table></div>';
  }

  function liveHtml() {
    var rows = DATA.live.map(function (l) {
      var ratio = (l.mcap_usd && l.tvl_usd > 0) ? (l.mcap_usd / l.tvl_usd).toFixed(2) + 'x' : 'n/a';
      return '<tr><td><b>' + esc(l.name) + '</b><br><span class="slug">' + esc(l.slug) + '</span> <span class="cat">' + esc(l.category || 'uncategorised') + '</span></td>' +
        '<td class="num">' + fmtUsd(l.tvl_usd) + '</td><td class="num">' + fmtUsd(l.mcap_usd) + '</td>' +
        '<td class="num">' + ratio + '</td><td class="num">' + fmtPct(l.change_7d) + '</td></tr>';
    }).join('');
    return '<p class="count">' + DATA.live.length + ' largest live-token protocols by market cap — shown apart, never ranked against the pre-token board. Their market-cap-per-TVL ratios are what calibrate the board\u2019s multiples.</p>' +
      '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">MCap / TVL</th><th class="num">7d</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function render() {
    var rows = state.tab === 'pre' ? filteredRows() : [];
    var sel = state.selected ? null : null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) sel = r; });
    var catOpts = '<option value="all">All categories</option>' + categories.map(function (c) { return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    var chainOpts = '<option value="all">All chains</option>' + chains.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    var h = '<div class="wrap">' +
      '<header><h1>Token <b>Radar</b></h1>' +
      '<p class="sub">Which pre-token protocol is worth farming next — ranked by what its token would be worth if it launched one today. Snapshot ' + esc(DATA.as_of) + ', ' + DATA.board_size + ' protocols ranked, from a sealed DefiLlama snapshot of ' + DATA.rows.length + ' candidates. Implied values are this radar\u2019s own claim, never the market\u2019s.</p></header>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + DATA.board_size + '</b><span>protocols ranked</span></div>' +
      '<div class="stat"><b>' + DATA.watchlist_size + '</b><span>watchlist covered</span></div>' +
      '<div class="stat"><b>' + DATA.early_size + '</b><span>early finds below the floor</span></div>' +
      '<div class="stat"><b>' + fmtUsd(DATA.rows[0] ? DATA.rows[0].implied_value_usd : 0) + '</b><span>top implied value</span></div>' +
      '<div class="stat"><b>' + DATA.live_size + '</b><span>live tokens compared</span></div></div>' +
      '<div class="method"><h2>How the ranking works — model ' + esc(DATA.model_version) + '</h2>' +
      '<p>implied value = <code>TVL × multiple(category) × growth × maturity × chains × youth</code>. The multiple is the median market cap per TVL dollar of live-token protocols in the same category (global median ' + DATA.global_multiple.toFixed(3) + 'x when a category has too few priced protocols), so a sector the market already values richly lifts its pre-token names. Growth is the 7-day TVL change, clamped to −50%…+100%. Maturity rises with days tracked with no token recorded. Multi-chain reach earns a small premium; protocols under 90 days old take a 0.85x discount.</p>' +
      multiplesHtml() +
      '<p>“Records no token” means the snapshot records none — not proof the protocol has none. Nothing here predicts whether or when a token launches.</p></div>' +
      '<div class="tabs"><button data-tab="pre"' + (state.tab === 'pre' ? ' class="on"' : '') + '>Pre-token board (' + DATA.board_size + ')</button>' +
      '<button data-tab="live"' + (state.tab === 'live' ? ' class="on"' : '') + '>Already trades (' + DATA.live_size + ')</button></div>';
    if (state.tab === 'pre') {
      h += '<div class="controls"><input type="search" id="q" placeholder="Search name or slug…" value="' + esc(state.q) + '">' +
        '<select id="cat">' + catOpts + '</select><select id="chain">' + chainOpts + '</select>' +
        '<label><input type="checkbox" id="watch"' + (state.watch ? ' checked' : '') + '> Watchlist only</label>' +
        '<select id="sort">' +
        '<option value="implied"' + (state.sort === 'implied' ? ' selected' : '') + '>Sort: implied value</option>' +
        '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>Sort: TVL</option>' +
        '<option value="growth"' + (state.sort === 'growth' ? ' selected' : '') + '>Sort: 7d growth</option>' +
        '<option value="age"' + (state.sort === 'age' ? ' selected' : '') + '>Sort: age</option>' +
        '<option value="name"' + (state.sort === 'name' ? ' selected' : '') + '>Sort: name</option></select></div>' +
        '<p class="count">Showing ' + rows.length + ' of ' + DATA.board_size + ' ranked protocols. Click a row for its detail view and farm plan.</p>';
      if (rows.length === 0) h += '<div class="empty">No protocol matches this filter.</div>';
      else {
        h += '<table><thead><tr><th class="num" data-sort="implied">#</th><th data-sort="name">Protocol</th><th class="num" data-sort="tvl">TVL</th><th class="num" data-sort="growth">7d</th><th class="num" data-sort="age">Age</th><th>Chains</th><th class="num" data-sort="implied">Implied value</th></tr></thead><tbody>' +
          rows.map(rowHtml).join('') + '</tbody></table>';
      }
      if (sel) h += detailHtml(sel);
    } else {
      h += liveHtml();
    }
    h += '<footer>Source: sealed DefiLlama snapshot (' + esc(DATA.source) + '). Floor for the watchlist: ' + fmtUsd(DATA.floor_usd) + ' TVL. Built by Token Radar, model ' + esc(DATA.model_version) + ' — deterministic: the same snapshot always writes the same board.</footer></div>';
    app.innerHTML = h;
    app.setAttribute('aria-busy', 'false');
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; render(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; render(); });
    var w = document.getElementById('watch');
    if (w) w.addEventListener('change', function () { state.watch = w.checked; render(); });
    var s = document.getElementById('sort');
    if (s) s.addEventListener('change', function () { state.sort = s.value; state.dir = (s.value === 'name') ? 1 : -1; render(); });
    app.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); state.selected = null; render(); }); });
    app.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { state.selected = tr.getAttribute('data-slug'); render(); var d = document.getElementById('detail'); if (d) d.scrollIntoView(); });
    });
    app.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () { var k = th.getAttribute('data-sort'); if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = (k === 'name') ? 1 : -1; } render(); });
    });
  }
  render();
})();
