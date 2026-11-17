// Token Radar's dashboard. It reads window.RADAR (written beside the page by main.ts)
// and renders the ranked board, a live-token view, a per-protocol detail view and the
// calibrated multiples. No network: every byte shown is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var root = document.getElementById('app');
  var boardBox = document.getElementById('board');
  var dialog = document.getElementById('detail');

  var state = { q: '', cat: 'all', tab: 'pre', sort: 'implied', dir: -1, sel: null };

  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return money.format(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function age(n) {
    if (n === null || n === undefined) return 'unknown';
    if (n >= 365) return (n / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(n)) + 'd';
  }
  function mult(n) { return n.toFixed(3) + 'x'; }

  // The model, as the page runs it: the same multiplication order as main.ts, so the
  // recomputed dollars are bit-identical, then the same strict-decrease walk.
  function rawValue(row) {
    var f = row.factors;
    return Math.max(1, Math.round(row.tvl_usd * f.multiple * f.growth_mult * f.maturity_mult * f.chain_mult * f.youth_mult));
  }
  function recomputedRows() {
    var vals = DATA.rows.map(rawValue);
    for (var i = 1; i < vals.length; i++) {
      if (vals[i] >= vals[i - 1]) vals[i] = Math.max(1, vals[i - 1] - 1);
    }
    return vals;
  }
  var RECOMPUTED = recomputedRows();
  var MISMATCHES = 0;
  DATA.rows.forEach(function (r, i) { if (RECOMPUTED[i] !== r.implied_value_usd) MISMATCHES++; });
  window.__RADAR_CHECK__ = { mismatches: MISMATCHES, total: DATA.rows.length, checked: true };

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'cls') node.className = attrs[k];
        else if (k === 'txt') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('cat')) state.cat = params.get('cat');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.sel = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.cat !== 'all') params.set('cat', state.cat);
    if (state.tab !== 'pre') params.set('tab', state.tab);
    if (state.sel) params.set('p', state.sel);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.cat !== 'all' && (r.category || 'Uncategorised') !== state.cat) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function sortButton(key, label) {
    return h('th', { scope: 'col' },
      h('button', {
        type: 'button',
        style: 'all:unset;cursor:pointer;text-transform:uppercase;letter-spacing:.06em;font-size:12px;font-weight:700;color:var(--ink-soft)',
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = -1; }
          renderBoard();
        }
      }, label, state.sort === key ? h('span', { txt: state.dir < 0 ? ' ▼' : ' ▲' }) : null)
    );
  }

  function boardTable() {
    var list = sortedRows(visibleRows());
    var count = document.getElementById('rowcount');
    count.textContent = list.length + ' of ' + DATA.board_size + ' rows shown';
    if (list.length === 0) {
      return h('div', { cls: 'empty' },
        h('h2', { txt: 'No protocol matches that filter' }),
        h('p', { txt: 'Clear the search or pick another category to see the board again.' }),
        h('button', {
          cls: 'btn', type: 'button', onclick: function () {
            state.q = ''; state.cat = 'all';
            document.getElementById('q').value = '';
            document.getElementById('cat').value = 'all';
            writeHash(); renderBoard();
          }
        }, 'Clear filters')
      );
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = h('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : pct(r.change_7d);
      var growthCls = r.change_7d === null ? 'num' : (r.change_7d >= 0 ? 'num pos' : 'num neg');
      var tr = h('tr', {
        'data-selected': state.sel === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        h('td', { cls: 'num' }, h('b', { txt: String(r.rank) }), h('div', { cls: 'rank-range', txt: r.rank_lo + '–' + r.rank_hi })),
        h('td', null, h('div', { cls: 'name' },
          h('b', { txt: r.name }),
          h('span', { txt: (r.category || 'Uncategorised') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        h('td', { cls: 'num', txt: usd(r.tvl_usd) }),
        h('td', { cls: growthCls, txt: growth }),
        h('td', { cls: 'num', txt: age(r.age_days) }),
        h('td', { cls: 'num', txt: mult(r.factors.multiple) }),
        h('td', null, h('div', null,
          h('div', { cls: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          h('span', { cls: 'num', txt: usd(r.implied_value_usd) })
        )),
        h('td', null, h('span', { cls: 'verdict verdict-' + r.verdict.toLowerCase(), txt: r.verdict })),
        h('td', null, h('span', { cls: 'tag', txt: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return h('div', { cls: 'table-wrap' },
      h('table', { cls: 'grid' },
        h('caption', { txt: 'Pre-token protocols, strongest implied value first. Ranks carry bootstrap p10–p90 ranges; verdicts price the farm (FARM / THIN / SKIP). Select a row for detail.' }),
        h('thead', null, h('tr', null,
          sortButton('implied', 'Rank'),
          sortButton('name', 'Protocol'),
          sortButton('tvl', 'TVL'),
          sortButton('growth', '7d'),
          sortButton('age', 'Age'),
          h('th', { scope: 'col', txt: 'Multiple' }),
          sortButton('implied', 'Implied value'),
          h('th', { scope: 'col', txt: 'Verdict' }),
          h('th', { scope: 'col', txt: 'Token' })
        )),
        tbody
      )
    );
  }

  function liveTable() {
    var count = document.getElementById('rowcount');
    count.textContent = DATA.live.length + ' live-token protocols';
    var tbody = h('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(h('tr', null,
        h('td', { cls: 'num', txt: '—' }),
        h('td', null, h('div', { cls: 'name' },
          h('b', { txt: r.name }),
          h('span', { txt: (r.category || 'Uncategorised') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        h('td', { cls: 'num', txt: usd(r.tvl_usd) }),
        h('td', { cls: r.change_7d !== null && r.change_7d >= 0 ? 'num pos' : 'num neg', txt: pct(r.change_7d) }),
        h('td', { cls: 'num', txt: usd(r.mcap_usd) }),
        h('td', { cls: 'num', txt: r.mcap_usd && r.tvl_usd ? mult(r.mcap_usd / r.tvl_usd) : 'n/a' }),
        h('td', null, h('span', { cls: 'tag live', txt: 'already trades' }))
      ));
    });
    return h('div', { cls: 'table-wrap' },
      h('table', { cls: 'grid' },
        h('caption', { txt: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col', txt: 'Rank' }),
          h('th', { scope: 'col', txt: 'Protocol' }),
          h('th', { scope: 'col', txt: 'TVL' }),
          h('th', { scope: 'col', txt: '7d' }),
          h('th', { scope: 'col', txt: 'Market cap' }),
          h('th', { scope: 'col', txt: 'Mcap / TVL' }),
          h('th', { scope: 'col', txt: 'Token' })
        )),
        tbody
      )
    );
  }

  function renderChips() {
    var box = document.getElementById('chips');
    box.textContent = '';
    var counts = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Uncategorised';
      counts[c] = (counts[c] || 0) + 1;
    });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 6);
    ['all'].concat(top).forEach(function (c) {
      var label = c === 'all' ? 'All categories' : c;
      var n = c === 'all' ? DATA.board_size : counts[c];
      box.appendChild(h('button', {
        type: 'button',
        'aria-pressed': state.cat === c ? 'true' : 'false',
        onclick: function () {
          state.cat = c;
          document.getElementById('cat').value = c;
          writeHash(); renderBoard();
        }
      }, label + ' ', h('span', { cls: 'n', txt: '(' + n + ')' })));
    });
  }

  function renderBoard() {
    boardBox.textContent = '';
    boardBox.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    document.getElementById('tab-pre').setAttribute('aria-pressed', state.tab === 'pre' ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
    renderChips();
  }

  function openDetail(slug) {
    var idx = -1;
    var row = null;
    DATA.rows.forEach(function (r, i) { if (r.slug === slug) { row = r; idx = i; } });
    if (!row) return;
    state.sel = slug;
    writeHash();
    dialog.textContent = '';
    var f = row.factors;
    var recomputed = RECOMPUTED[idx];
    var matches = recomputed === row.implied_value_usd;
    var body = h('div', { cls: 'detail-body' },
      h('div', { cls: 'detail-head' },
        h('div', null,
          h('span', { cls: 'rank', txt: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · bootstrap range ' + row.rank_lo + '–' + row.rank_hi }),
          h('h2', { id: 'detail-title', txt: row.name }),
          h('p', { cls: 'sub', txt: (row.category || 'Uncategorised') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
        ),
        h('button', { cls: 'close', type: 'button', 'aria-label': 'Close details', txt: 'Close', onclick: function () { dialog.close(); } })
      ),
      h('div', { cls: 'facts-grid' },
        h('div', null, h('span', { txt: 'TVL' }), h('b', { txt: usd(row.tvl_usd) })),
        h('div', null, h('span', { txt: 'Seven-day growth' }), h('b', { txt: pct(row.change_7d) })),
        h('div', null, h('span', { txt: 'Age with no token' }), h('b', { txt: age(row.age_days) })),
        h('div', null, h('span', { txt: 'Category multiple' }), h('b', { txt: mult(f.multiple) + (f.multiple_global ? ' (global median)' : ' (' + f.multiple_n + ' live protocols)') })),
        h('div', null, h('span', { txt: 'Growth multiplier' }), h('b', { txt: f.growth_mult.toFixed(4) + 'x' })),
        h('div', null, h('span', { txt: 'Maturity multiplier' }), h('b', { txt: f.maturity_mult.toFixed(4) + 'x' })),
        h('div', null, h('span', { txt: 'Chain multiplier' }), h('b', { txt: f.chain_mult.toFixed(4) + 'x' })),
        h('div', null, h('span', { txt: 'Youth multiplier' }), h('b', { txt: f.youth_mult.toFixed(2) + 'x' })),
        h('div', null, h('span', { txt: 'Implied value' }), h('b', { txt: usd(row.implied_value_usd) })),
        h('div', null, h('span', { txt: 'Farm verdict' }), h('b', { txt: row.verdict + ' · ' + usd(row.stake_usd) + ' staked' }))
      ),
      h('p', { cls: 'sub' }, 'Model ' + DATA.model_version + ': the page recomputes this row as ',
        h('b', { txt: usd(recomputed) }),
        matches ? h('span', { cls: 'match-ok', txt: ' — the same number the board carries.' }) : h('span', { cls: 'match-bad', txt: ' — which differs from the board.' }),
        ' This is an estimate, not a price.'
      ),
      h('p', { cls: 'sub', txt: DATA.validation.verdict_rule }),
      h('h3', { txt: 'Farm plan' }),
      h('ol', { cls: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return h('li', null, h('b', { txt: action }), h('span', { cls: 'cost', txt: tail }));
      }))
    );
    dialog.appendChild(body);
    dialog.addEventListener('close', function () {
      if (state.sel) { state.sel = null; writeHash(); renderBoard(); }
    }, { once: true });
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function renderStatic() {
    document.getElementById('snapshot-note').textContent = 'Snapshot ' + DATA.as_of + ' · DefiLlama protocol index · model ' + DATA.model_version;
    document.getElementById('hero-title').textContent = DATA.watchlist_size + ' watchlist protocols, ranked by implied value';
    document.getElementById('hero-lede').textContent = 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record, plus ' + DATA.early_size + ' early rows below that floor. Implied value is a model, not a promise.';
    var stats = document.getElementById('stats');
    var top = DATA.rows[0];
    [
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
      ['Pre-token rows scored', String(DATA.board_size)],
      ['Early rows below the floor', String(DATA.early_size)],
      ['Top implied value', top ? usd(top.implied_value_usd) : 'n/a']
    ].forEach(function (pair) {
      stats.appendChild(h('div', null, h('dt', { txt: pair[0] }), h('dd', { txt: pair[1] })));
    });

    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var select = document.getElementById('cat');
    select.appendChild(h('option', { value: 'all', txt: 'All categories' }));
    cats.forEach(function (c) { select.appendChild(h('option', { value: c, txt: c })); });
    select.value = state.cat;
    select.addEventListener('change', function () { state.cat = select.value; writeHash(); renderBoard(); });

    var search = document.getElementById('q');
    search.value = state.q;
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderBoard(); });

    var sort = document.getElementById('sort');
    sort.addEventListener('change', function () { state.sort = sort.value; state.dir = -1; renderBoard(); });
    document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre'; writeHash(); renderBoard(); });
    document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; writeHash(); renderBoard(); });

    var m = DATA.model;
    document.getElementById('formula').textContent =
      'implied = round( tvl x multiple(category) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.02 x min(chains, ' + m.chain_cap + ')) x youth )';
    document.getElementById('method-notes').textContent =
      'Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. A protocol tracked under ' + m.youth_days + ' days takes a ' + m.youth_mult + 'x youth discount. Multiples are clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']; a category needs ' + m.min_category_n + ' live protocols of its own, else it takes the global median of ' + DATA.global_multiple.toFixed(3) + 'x.';
    var tbody = document.querySelector('#mult-table tbody');
    DATA.multiples.forEach(function (s) {
      tbody.appendChild(h('tr', null,
        h('td', { txt: s.category }),
        h('td', { cls: 'num', txt: mult(s.multiple) }),
        h('td', { cls: 'num', txt: String(s.n) }),
        h('td', { txt: s.from_global ? 'Global median' : 'Category median' })
      ));
    });
    document.getElementById('recompute-note').textContent =
      'The page recomputes every row from the snapshot figures: ' + MISMATCHES + ' mismatches out of ' + DATA.rows.length + ' rows.';

    var v = DATA.validation;
    var sel = null;
    v.candidates.forEach(function (c) { if (c.name === v.selected) sel = c; });
    document.getElementById('validation-method').textContent = v.method;
    var fbody = document.querySelector('#fold-table tbody');
    (sel || v.candidates[0]).folds.forEach(function (f) {
      fbody.appendChild(h('tr', null,
        h('td', { txt: f.window }),
        h('td', { cls: 'num', txt: String(f.train_n) }),
        h('td', { cls: 'num', txt: String(f.test_n) }),
        h('td', { cls: 'num', txt: f.mcap_spearman.toFixed(3) }),
        h('td', { cls: 'num', txt: f.ratio_spearman === null ? 'n/a' : f.ratio_spearman.toFixed(3) }),
        h('td', { cls: 'num', txt: f.mdape === null ? 'n/a' : f.mdape.toFixed(1) + '%' })
      ));
    });
    document.getElementById('validation-selection').textContent =
      'Kept: ' + v.selected + ' — ' + v.selection_rule +
      ' Mean held-out: mcap Spearman ' + (sel ? sel.mean_mcap_spearman.toFixed(3) : 'n/a') +
      ', ratio Spearman ' + (sel && sel.mean_ratio_spearman !== null ? sel.mean_ratio_spearman.toFixed(3) : 'n/a') +
      ', MdAPE ' + (sel && sel.mean_mdape !== null ? sel.mean_mdape.toFixed(1) + '%' : 'n/a') + '.';
    document.getElementById('validation-ranges').textContent =
      'Rank ranges (200 bootstrap refits): median p90–p10 width ' + v.rank_ranges.median_width +
      ' of ' + DATA.board_size + ' ranks (p25 ' + v.rank_ranges.p25_width + ', p75 ' + v.rank_ranges.p75_width + '); only ' +
      v.rank_ranges.tight_rows + ' rows hold a range of 5 or less — the top is firm, the middle is not.';
    document.getElementById('validation-verdict').textContent = v.verdict_rule;
    var cbody = document.querySelector('#cand-table tbody');
    v.candidates.forEach(function (c) {
      cbody.appendChild(h('tr', null,
        h('td', { txt: c.name }),
        h('td', { cls: 'num', txt: c.mean_mcap_spearman.toFixed(3) }),
        h('td', { cls: 'num', txt: c.mean_ratio_spearman === null ? 'n/a' : c.mean_ratio_spearman.toFixed(3) }),
        h('td', { cls: 'num', txt: c.mean_mdape === null ? 'n/a' : c.mean_mdape.toFixed(1) + '%' }),
        h('td', { txt: c.name === v.selected ? 'Kept' : '—' })
      ));
    });
  }

  readHash();
  renderStatic();
  renderBoard();
  root.setAttribute('aria-busy', 'false');
  if (state.sel) openDetail(state.sel);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
