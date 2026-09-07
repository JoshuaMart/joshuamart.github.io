/* BountyBench results explorer. Reads /data/bountybench.json and renders
   filters, summary tiles, a per-arm table and a per-lab table. No dependencies. */
(function () {
  const ROOT_ID = 'bb-explorer';
  const DATA_URL = '/data/bountybench.json';

  const CSS = `
  #bb-explorer { font-family: var(--font-sans); margin: 2rem 0; border: 1px solid var(--color-outline-variant); background: var(--color-surface-low); }
  #bb-explorer * { box-sizing: border-box; }
  .bb-head { padding: 1rem 1.25rem; border-bottom: 1px solid var(--color-outline-variant); display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem 1.5rem; }
  .bb-head h4 { margin: 0; font-family: var(--font-serif); font-size: 1.25rem; color: var(--color-paper); }
  .bb-head span { font-family: var(--font-mono); font-size: .7rem; text-transform: uppercase; letter-spacing: .12em; color: var(--color-sand); }
  .bb-filters { padding: .75rem 1.25rem; display: grid; gap: .75rem; border-bottom: 1px solid var(--color-outline-variant); }
  .bb-row { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
  .bb-row > label { font-family: var(--font-mono); font-size: .65rem; text-transform: uppercase; letter-spacing: .12em; color: var(--color-sand); min-width: 5.5rem; }
  .bb-pill { font-family: var(--font-mono); font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; padding: .3rem .7rem; border: 1px solid var(--color-outline-variant); background: transparent; color: var(--color-sand); cursor: pointer; transition: color .15s, background .15s; }
  .bb-pill:hover { color: var(--color-paper); border-color: var(--color-border-hover); }
  .bb-pill.on { background: var(--color-paper); color: var(--color-deep-navy); border-color: var(--color-paper); }
  .bb-pill.mode.on { background: var(--color-ochre); border-color: var(--color-ochre); }
  .bb-pill.reset { margin-left: auto; border-style: dashed; }
  .bb-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); border-bottom: 1px solid var(--color-outline-variant); }
  .bb-tile { padding: .9rem 1rem; border-right: 1px solid var(--color-outline-variant); }
  .bb-tile:last-child { border-right: 0; }
  .bb-tile b { display: block; font-family: var(--font-serif); font-size: 1.6rem; font-weight: 500; color: var(--color-paper); line-height: 1.1; }
  .bb-tile small { display: block; font-family: var(--font-mono); font-size: .62rem; text-transform: uppercase; letter-spacing: .1em; color: var(--color-sand); margin-top: .35rem; }
  .bb-tile em { display: block; font-style: normal; font-family: var(--font-mono); font-size: .7rem; color: var(--color-sand); margin-top: .15rem; }
  .bb-section { padding: 1rem 1.25rem; }
  .bb-section h5 { margin: 0 0 .6rem; font-family: var(--font-mono); font-size: .68rem; text-transform: uppercase; letter-spacing: .12em; color: var(--color-ochre); font-weight: 500; }
  .bb-section p.bb-note { margin: 0 0 .75rem; font-size: .85rem; color: var(--color-sand); line-height: 1.5; }
  .bb-scroll { overflow-x: auto; }
  table.bb { width: 100%; border-collapse: collapse; font-size: .8rem; margin: 0; }
  table.bb th { font-family: var(--font-mono); font-size: .62rem; text-transform: uppercase; letter-spacing: .1em; color: var(--color-sand); text-align: right; padding: .4rem .5rem; border-bottom: 1px solid var(--color-outline-variant); white-space: nowrap; font-weight: 500; }
  table.bb th:first-child, table.bb td:first-child { text-align: left; }
  table.bb td { padding: .45rem .5rem; text-align: right; border-bottom: 1px solid rgba(68,71,77,.4); font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--color-text-main); }
  table.bb td.name { font-family: var(--font-mono); font-size: .72rem; color: var(--color-paper); }
  table.bb td.dim { color: var(--color-sand); }
  table.bb tr.best td { color: var(--color-paper); }
  .bb-bar { display: inline-flex; height: .6rem; width: 8rem; background: var(--color-surface-elevated); vertical-align: middle; overflow: hidden; }
  .bb-bar i { display: block; height: 100%; }
  .bb-bar .r0 { background: #3a4657; } .bb-bar .r1 { background: #55627a; } .bb-bar .r2 { background: #7b8496; } .bb-bar .r3 { background: #a9aea0; } .bb-bar .r4 { background: var(--color-ochre); }
  .bb-legend { font-family: var(--font-mono); font-size: .62rem; color: var(--color-sand); margin-top: .5rem; display: flex; gap: 1rem; flex-wrap: wrap; }
  .bb-legend i { display: inline-block; width: .7rem; height: .7rem; vertical-align: middle; margin-right: .3rem; }
  .bb-empty { padding: 2rem; text-align: center; color: var(--color-sand); font-family: var(--font-mono); font-size: .75rem; }
  .bb-cov { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .5rem; }
  .bb-cov span { font-family: var(--font-mono); font-size: .62rem; padding: .2rem .45rem; border: 1px solid var(--color-outline-variant); color: var(--color-sand); }
  .bb-cov span.hit { color: var(--color-deep-navy); background: var(--color-ochre); border-color: var(--color-ochre); }
  @media (max-width: 640px) { .bb-row > label { min-width: 100%; } .bb-pill.reset { margin-left: 0; } }
  `;

  const EXIT_LABEL = { solved: 'solved', timeout: 'timed out', voluntary_stop: 'stopped early', turns_exhausted: 'turns exhausted' };

  function wilson(k, n) {
    if (!n) return [0, 0];
    const z = 1.96, p = k / n, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d;
    const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }
  const pct = (x) => (100 * x).toFixed(0) + '%';
  const usd = (x) => '$' + (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
  const usd3 = (x) => '$' + x.toFixed(3);
  const uniq = (a) => Array.from(new Set(a));
  const maxRung = (c) => (c.rungs.length ? Math.max.apply(null, c.rungs) : 0);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function toObjects(data) {
    const cols = data.columns;
    return data.rows.map((r) => { const o = {}; cols.forEach((c, i) => (o[c] = r[i])); return o; });
  }

  function init(root, data) {
    const cells = toObjects(data);
    const dims = {
      campaign: { label: 'Campaign', values: uniq(cells.map((c) => c.campaign)), name: (v) => data.campaigns[v]?.label || v },
      model: { label: 'Model', values: uniq(cells.map((c) => c.model)).sort() },
      harness: { label: 'Harness', values: uniq(cells.map((c) => c.harness)).sort() },
      family: { label: 'Family', values: uniq(cells.map((c) => c.family)).sort() },
      seed: { label: 'Seed', values: uniq(cells.map((c) => c.seed)).sort((a, b) => a - b), name: (v) => 'seed ' + v },
    };
    const state = { sel: {}, mode: 'arms' };
    const defaults = () => { Object.keys(dims).forEach((k) => (state.sel[k] = new Set(dims[k].values))); state.sel.campaign = new Set(['m6-model-axis']); };
    defaults();

    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    root.innerHTML = `
      <div class="bb-head"><h4>BountyBench results explorer</h4><span>${cells.length} cells across ${dims.campaign.values.length} campaigns</span></div>
      <div class="bb-filters"></div>
      <div class="bb-tiles"></div>
      <div class="bb-section bb-arms"></div>
      <div class="bb-section bb-labs"></div>`;
    const filtersEl = root.querySelector('.bb-filters');
    const tilesEl = root.querySelector('.bb-tiles');
    const armsEl = root.querySelector('.bb-arms');
    const labsEl = root.querySelector('.bb-labs');

    function renderFilters() {
      let html = '';
      for (const k of Object.keys(dims)) {
        const d = dims[k];
        html += `<div class="bb-row"><label>${d.label}</label>` + d.values.map((v) =>
          `<button class="bb-pill ${state.sel[k].has(v) ? 'on' : ''}" data-dim="${k}" data-val="${esc(v)}">${esc(d.name ? d.name(v) : v)}</button>`).join('') + `</div>`;
      }
      html += `<div class="bb-row"><label>Combine</label>
        <button class="bb-pill mode ${state.mode === 'arms' ? 'on' : ''}" data-mode="arms">each arm separately</button>
        <button class="bb-pill mode ${state.mode === 'union' ? 'on' : ''}" data-mode="union">union: a lab counts if any selected cell solved it</button>
        <button class="bb-pill reset" data-reset>reset</button></div>`;
      filtersEl.innerHTML = html;
    }

    filtersEl.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.reset !== undefined) { defaults(); state.mode = 'arms'; }
      else if (b.dataset.mode) state.mode = b.dataset.mode;
      else {
        const k = b.dataset.dim; let v = b.dataset.val; if (k === 'seed') v = Number(v);
        const s = state.sel[k];
        if (e.shiftKey) { s.clear(); s.add(v); } else if (s.has(v)) s.delete(v); else s.add(v);
      }
      renderFilters(); render();
    });

    function selected() { return cells.filter((c) => Object.keys(dims).every((k) => state.sel[k].has(c[k]))); }

    function stats(rows) {
      const n = rows.length, k = rows.filter((c) => c.solve).length;
      const cost = rows.reduce((a, c) => a + c.cost_usd, 0);
      const turns = n ? rows.reduce((a, c) => a + c.turns, 0) / n : 0;
      const exits = {}; rows.forEach((c) => (exits[c.exit] = (exits[c.exit] || 0) + 1));
      const [lo, hi] = wilson(k, n);
      const lost = rows.filter((c) => !c.solve && c.lost_proofs).length;
      return { n, k, cost, turns, exits, lo, hi, lost, rate: n ? k / n : 0 };
    }

    function renderTiles(rows) {
      const s = stats(rows);
      if (!s.n) { tilesEl.innerHTML = '<div class="bb-empty">no cells match this selection</div>'; return; }
      const labs = uniq(rows.map((c) => c.lab));
      const covered = uniq(rows.filter((c) => c.solve).map((c) => c.lab));
      const exitStr = Object.keys(s.exits).sort((a, b) => s.exits[b] - s.exits[a]).map((e) => `${s.exits[e]} ${EXIT_LABEL[e] || e}`).join(' · ');
      const tiles = state.mode === 'union' ? [
        [covered.length + '/' + labs.length, 'labs covered', pct(covered.length / labs.length) + ' by at least one cell'],
        [s.n, 'cells run', exitStr],
        [usd(s.cost), 'total spend', usd(s.cost / s.n) + ' per cell'],
        [usd3(covered.length ? s.cost / covered.length : 0), 'per lab covered', 'spend ÷ labs covered'],
        [s.turns.toFixed(0), 'mean turns', 'LLM calls per cell'],
      ] : [
        [s.k + '/' + s.n, 'solves / cells', exitStr],
        [pct(s.rate), 'solve rate', '95% CI ' + pct(s.lo) + ' to ' + pct(s.hi)],
        [usd(s.cost), 'total spend', usd(s.cost / s.n) + ' per cell'],
        [usd3(s.k ? s.cost / s.k : 0), 'per solve', s.k ? 'spend ÷ solves' : 'no solve'],
        [s.turns.toFixed(0), 'mean turns', 'LLM calls per cell'],
        [s.lost, 'proof not reported', 'rung fired server-side, proof missing from trace'],
      ];
      tilesEl.innerHTML = tiles.map(([b, l, e]) => `<div class="bb-tile"><b>${b}</b><small>${l}</small><em>${e}</em></div>`).join('');
    }

    function armKey(c) { return [c.harness, c.model, c.campaign]; }

    function renderArms(rows) {
      if (!rows.length) { armsEl.innerHTML = ''; return; }
      if (state.mode === 'union') {
        const labs = uniq(rows.map((c) => c.lab)).sort();
        const hit = new Set(rows.filter((c) => c.solve).map((c) => c.lab));
        const groups = {}; rows.forEach((c) => { const k = armKey(c).join(' · '); (groups[k] = groups[k] || []).push(c); });
        const keys = Object.keys(groups);
        armsEl.innerHTML = `<h5>Union of ${keys.length} arm${keys.length > 1 ? 's' : ''}</h5>
          <p class="bb-note">Every selected cell runs against every lab. A lab is covered when any of them solved it, and the spend is the sum of all of them. Compare one model on two seeds against two models on one seed each.</p>
          <div class="bb-cov">${labs.map((l) => `<span class="${hit.has(l) ? 'hit' : ''}">${esc(l)}</span>`).join('')}</div>`;
        return;
      }
      const groups = {}; rows.forEach((c) => { const k = armKey(c).join('|'); (groups[k] = groups[k] || []).push(c); });
      const list = Object.keys(groups).map((k) => ({ k, parts: k.split('|'), s: stats(groups[k]) })).sort((a, b) => b.s.rate - a.s.rate || a.s.cost - b.s.cost);
      const best = list[0]?.s.rate;
      armsEl.innerHTML = `<h5>By arm (harness × model)</h5><div class="bb-scroll"><table class="bb">
        <tr><th>arm</th><th>campaign</th><th>solves</th><th>rate</th><th>95% CI</th><th>$ / cell</th><th>$ / solve</th><th>turns</th><th>timed out</th><th>stopped early</th></tr>
        ${list.map((a) => `<tr class="${a.s.rate === best ? 'best' : ''}"><td class="name">${esc(a.parts[0])} + ${esc(a.parts[1])}</td><td class="dim">${esc(dims.campaign.name(a.parts[2]))}</td>
          <td>${a.s.k}/${a.s.n}</td><td>${pct(a.s.rate)}</td><td class="dim">${pct(a.s.lo)} to ${pct(a.s.hi)}</td>
          <td>${usd3(a.s.cost / a.s.n)}</td><td>${a.s.k ? usd3(a.s.cost / a.s.k) : '<span class="dim">no solve</span>'}</td><td>${a.s.turns.toFixed(0)}</td>
          <td class="dim">${a.s.exits.timeout || 0}</td><td class="dim">${a.s.exits.voluntary_stop || 0}</td></tr>`).join('')}
      </table></div>
      <p class="bb-note" style="margin-top:.6rem">Intervals are Wilson 95%. Two arms whose intervals overlap are not separated by this data; the paired tests in the article are stricter still.</p>`;
    }

    function renderLabs(rows) {
      if (!rows.length) { labsEl.innerHTML = ''; return; }
      const groups = {}; rows.forEach((c) => (groups[c.lab] = groups[c.lab] || []).push(c));
      const list = Object.keys(groups).map((lab) => {
        const g = groups[lab]; const hist = [0, 0, 0, 0, 0];
        g.forEach((c) => hist[c.solve ? 4 : Math.min(3, maxRung(c))]++);
        return { lab, family: g[0].family, n: g.length, k: g.filter((c) => c.solve).length, hist, cost: g.reduce((a, c) => a + c.cost_usd, 0) };
      }).sort((a, b) => a.family.localeCompare(b.family) || b.k / b.n - a.k / a.n);
      labsEl.innerHTML = `<h5>By lab: where the failures stop</h5><div class="bb-scroll"><table class="bb">
        <tr><th>lab</th><th>family</th><th>solves</th><th>rate</th><th>highest rung reached</th><th>$ / cell</th></tr>
        ${list.map((l) => `<tr><td class="name">${esc(l.lab)}</td><td class="dim">${esc(l.family)}</td><td>${l.k}/${l.n}</td><td>${pct(l.k / l.n)}</td>
          <td><span class="bb-bar" title="${l.hist.map((h, i) => (i === 4 ? 'solved' : 'rung ' + i) + ': ' + h).join(', ')}">${l.hist.map((h, i) => `<i class="r${i}" style="width:${(100 * h) / l.n}%"></i>`).join('')}</span></td>
          <td class="dim">${usd3(l.cost / l.n)}</td></tr>`).join('')}
      </table></div>
      <div class="bb-legend"><span><i class="r0" style="background:#3a4657"></i>nothing</span><span><i style="background:#55627a"></i>rung 1</span><span><i style="background:#7b8496"></i>rung 2</span><span><i style="background:#a9aea0"></i>rung 3</span><span><i style="background:var(--color-ochre)"></i>solved</span></div>`;
    }

    function render() { const rows = selected(); renderTiles(rows); renderArms(rows); renderLabs(rows); }
    renderFilters(); render();
  }

  function boot() {
    const root = document.getElementById(ROOT_ID); if (!root) return;
    fetch(DATA_URL).then((r) => r.json()).then((data) => init(root, data))
      .catch((e) => { root.innerHTML = '<div class="bb-empty">could not load results (' + esc(e.message) + ')</div>'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
