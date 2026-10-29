/* MyStatPro v5 — single-page stats site. All numbers are computed in the
   browser from data/bundle.json, which tools/build.py produces. */
(function () {
  'use strict';

  // ------------------------------------------------------------------ utils
  const $app = document.getElementById('app');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ALL_ACCENT = { color: '#1F4FD8', darkColor: '#5B9BFF' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtD = (d) => d.getDate() + ' ' + MON[d.getMonth()];
  const fmtDY = (d) => fmtD(d) + ' ' + d.getFullYear();
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const pct = (m, a) => (a ? (m / a) * 100 : 0);
  const initials = (name) => name.replace(/\./g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const isDark = () => document.documentElement.dataset.theme !== 'light';

  const ICON = {
    back: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    moon: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    sun: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    down: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px"><path d="M6 9l6 6 6-6"/></svg>',
    trophy: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
    bars: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V11M12 20V4M18 20v-6"/></svg>',
    cup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
  };

  // ------------------------------------------------------------------ data
  let D = null; // { teams, teamIds, players, seasons, seasonName, games, byId }

  function loadData(bundle) {
    const K = bundle.statKeys;
    const players = {};
    Object.keys(bundle.players).forEach((id) => { players[id] = Object.assign({ id }, bundle.players[id], { teams: {}, gp: 0 }); });
    const seasonIdx = {};
    bundle.seasons.forEach((s, i) => { seasonIdx[s.key] = i; });
    const games = bundle.games.map((g) => {
      const parts = g.d.split('-').map(Number);
      const game = {
        id: g.id, t: g.t, ds: g.d, date: new Date(parts[0], parts[1] - 1, parts[2]), s: g.s, ok: g.o,
        o: bundle.opponents[g.o] || g.o, home: !!g.h, us: g.us, them: g.them, po: !!g.po, win: g.us > g.them, lines: [], dnp: []
      };
      game.lines = g.L.map((row) => {
        const l = { p: row[0], n: row[1], g: game };
        K.forEach((k, i) => { l[k] = row[i + 2]; });
        l.reb = l.oreb + l.dreb;
        return l;
      });
      game.dnp = g.D.map((r) => ({ p: r[0], n: r[1] }));
      return game;
    });
    games.sort((a, b) => a.date - b.date || (a.t < b.t ? -1 : 1));
    games.forEach((g) => {
      g.lines.concat(g.dnp).forEach((l) => {
        const p = players[l.p];
        if (!p) return;
        const t = p.teams[g.t] || (p.teams[g.t] = { gp: 0, number: l.n, last: g.date });
        if (g.date >= t.last) { t.number = l.n; t.last = g.date; }
        if (l.g) { t.gp++; p.gp++; }
      });
    });
    const byId = {};
    games.forEach((g) => { byId[g.t + '/' + g.id] = g; });
    D = {
      teams: bundle.teams, teamIds: Object.keys(bundle.teams), players, seasons: bundle.seasons, seasonIdx,
      seasonName: (k) => (bundle.seasons.find((s) => s.key === k) || { name: k }).name, games, byId
    };
  }

  const SUMK = ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'pf', 'stl', 'to', 'blk', 'ast', 'pts'];
  function agg(lines) {
    const s = { n: lines.length, w: 0 };
    SUMK.forEach((k) => { s[k] = 0; });
    lines.forEach((l) => { SUMK.forEach((k) => { s[k] += l[k]; }); if (l.g && l.g.win) s.w++; });
    s.reb = s.oreb + s.dreb; s.twom = s.fgm - s.tpm; s.twoa = s.fga - s.tpa;
    return s;
  }
  const PCT = { fgp: 1, twop: 1, tpp: 1, ftp: 1, efg: 1, ts: 1 };
  const LABEL = {
    gp: 'GP', pts: 'PTS', reb: 'REB', oreb: 'OREB', dreb: 'DREB', ast: 'AST', stl: 'STL', blk: 'BLK', to: 'TO', pf: 'PF',
    fgm: 'FGM', fga: 'FGA', fgp: 'FG%', twom: '2PM', twoa: '2PA', twop: '2P%', tpm: '3PM', tpa: '3PA', tpp: '3P%',
    ftm: 'FTM', fta: 'FTA', ftp: 'FT%', efg: 'eFG%', ts: 'TS%', astto: 'AST/TO', stocks: 'STL+BLK', pra: 'PTS+REB+AST'
  };
  function metric(k, S) {
    if (!S.n) return 0;
    switch (k) {
      case 'gp': return S.n;
      case 'fgp': return pct(S.fgm, S.fga);
      case 'twop': return pct(S.twom, S.twoa);
      case 'tpp': return pct(S.tpm, S.tpa);
      case 'ftp': return pct(S.ftm, S.fta);
      case 'efg': return S.fga ? ((S.fgm + 0.5 * S.tpm) / S.fga) * 100 : 0;
      case 'ts': return (S.fga + 0.44 * S.fta) ? (S.pts / (2 * (S.fga + 0.44 * S.fta))) * 100 : 0;
      case 'astto': return S.to ? S.ast / S.to : S.ast;
      default: return S[k] / S.n;
    }
  }
  function fmtStat(k, S, mode) {
    if (!S.n) return '–';
    if (PCT[k]) return f1(metric(k, S));
    if (k === 'astto') return metric(k, S).toFixed(2);
    if (k === 'gp') return String(S.n);
    return mode === 'tot' ? String(S[k]) : f1(metric(k, S));
  }
  const lineVal = (k, l) => (k === 'reb' ? l.oreb + l.dreb : k === 'stocks' ? l.stl + l.blk : k === 'pra' ? l.pts + l.oreb + l.dreb + l.ast : l[k]);

  function filterGames(f) {
    return D.games.filter((g) => (f.team === 'all' || g.t === f.team) && (f.season === 'all' || g.s === f.season) &&
      (f.phase === 'all' || (f.phase === 'po' ? g.po : !g.po)));
  }
  const linesOf = (games, pid) => {
    const out = [];
    games.forEach((g) => g.lines.forEach((l) => { if (!pid || l.p === pid) out.push(l); }));
    return out;
  };
  const seasonsOf = (games) => D.seasons.map((s) => s.key).filter((k) => games.some((g) => g.s === k));
  const teamColor = (tid) => (tid === 'all' || !D.teams[tid] ? ALL_ACCENT : D.teams[tid]);
  const vsName = (g) => (g.home ? 'vs ' : '@ ') + g.o;

  // ------------------------------------------------------------------ routing
  let R = { path: [], q: new URLSearchParams() };
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [p, qs] = h.split('?');
    R = { path: p ? p.split('/').map(decodeURIComponent) : [], q: new URLSearchParams(qs || '') };
  }
  function href(path, params) {
    const q = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => { const v = params[k]; if (v !== null && v !== undefined && v !== '' && v !== false) q.set(k, v); });
    const s = q.toString();
    return '#/' + path.map(encodeURIComponent).join('/') + (s ? '?' + s : '');
  }
  // same page, changed params (used for toggles; doesn't add history)
  function here(changes) {
    const params = {};
    R.q.forEach((v, k) => { params[k] = v; });
    Object.keys(changes).forEach((k) => { params[k] = changes[k]; });
    return href(R.path, params);
  }
  const qv = (k, d) => (R.q.has(k) ? R.q.get(k) : d);
  const tog = (changes) => 'href="' + esc(here(changes)) + '" data-r';

  // ------------------------------------------------------------------ components
  function avatar(pid, cls, team) {
    const p = D.players[pid] || { name: pid, images: {} };
    const img = (team && p.images && p.images[team]) || (p.images && p.images.default);
    return '<span class="av ' + cls + '">' + esc(initials(p.name)) + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</span>';
  }
  function teamBadge(tid, cls) {
    const t = D.teams[tid];
    return '<span class="tb ' + (cls || 's28') + '" style="background:' + t.color + '">' + esc(t.short) + '</span>';
  }
  function logoSq(tid, extra) {
    const t = D.teams[tid];
    return '<span class="sq" style="background:' + t.color + ';color:#fff;' + (extra || '') + '">' + esc(t.short) +
      (t.logo ? '<img src="' + esc(t.logo) + '" alt="" onerror="this.remove()">' : '') + '</span>';
  }
  function chips(items, extraCls) {
    return items.map((c) => '<a class="chip ' + (extraCls || '') + (c.on ? ' on' : '') + '" ' + c.attr + '>' + (c.dot ? '<span class="dot" style="background:' + c.dot + '"></span>' : '') + esc(c.label) + '</a>').join('');
  }
  function seg(items, cls) {
    return '<div class="seg ' + (cls || '') + '">' + items.map((c) => '<a class="' + (c.on ? 'on' : '') + '" ' + c.attr + '>' + esc(c.label) + '</a>').join('') + '</div>';
  }
  function themeBtn() {
    return '<button class="hbtn icon" data-theme-toggle aria-label="Switch light or dark mode">' + (isDark() ? ICON.sun : ICON.moon) + '</button>';
  }
  function bottomNav(active, team) {
    const t = team && team !== 'all' ? team : null;
    const items = [
      ['home', 'Home', ICON.home, t ? href(['team', t], {}) : '#/'],
      ['players', 'Players', ICON.user, href(['players'], { team: t })],
      ['leaders', 'Leaders', ICON.bars, href(['leaders'], { team: t })],
      ['records', 'Records', ICON.cup, href(['records'], { team: t })],
      ['games', 'Games', ICON.cal, href(['games'], { team: t })]
    ];
    return '<nav class="bnav" aria-label="Main"><div>' + items.map((i) => '<a href="' + esc(i[3]) + '"' + (i[0] === active ? ' class="on" aria-current="page"' : '') + '>' + i[2] + i[1] + '</a>').join('') + '</div></nav>';
  }
  function shell(accentTid, inner, navActive, navTeam) {
    const c = teamColor(accentTid);
    document.documentElement.style.setProperty('--page-accent', c.color);
    return '<div class="app" style="--accent:' + c.color + ';--accent-dark:' + c.darkColor + '">' + inner + bottomNav(navActive, navTeam) + '</div>';
  }

  // filter controls shared by several pages
  function filterBlock(opts) {
    // opts: { teams: [tid] | null, team, seasons: [key], season, phase, allSeasons: bool }
    let h = '<section class="filters">';
    if (opts.teams) {
      h += '<div class="chips">' + chips([{ label: 'All Teams', dot: '#5B9BFF', on: opts.team === 'all', attr: tog({ team: null, season: null, opp: null, sel: null }) }]
        .concat(opts.teams.map((t) => ({ label: D.teams[t].name, dot: D.teams[t].color, on: opts.team === t, attr: tog({ team: t, season: null, opp: null, sel: null }) }))), 'tall') + '</div>';
    }
    const ss = [{ label: 'All seasons', on: opts.season === 'all', attr: tog({ season: 'all', sel: null, opp: null }) }]
      .concat(opts.seasons.slice().reverse().map((k) => ({ label: D.seasonName(k), on: opts.season === k, attr: tog({ season: k, sel: null, opp: null }) })));
    h += '<div class="scroller">' + chips(ss) + '</div>';
    if (opts.phase !== undefined) {
      h += seg([['all', 'All'], ['reg', 'Regular'], ['po', 'Playoffs']].map((p) => ({ label: p[1], on: opts.phase === p[0], attr: tog({ phase: p[0] === 'all' ? null : p[0], sel: null, opp: null }) })));
    }
    if (opts.scope) h += '<div class="scope">' + esc(opts.scope) + '</div>';
    return h + '</section>';
  }
  const phaseName = (ph) => ({ all: 'Reg + Playoffs', reg: 'Regular season', po: 'Playoffs' }[ph]);

  // donut chart
  function donut(segs, center, centerLbl) {
    const C = 2 * Math.PI * 60;
    const tot = segs.reduce((a, s) => a + s.v, 0);
    let off = 0;
    const arcs = segs.map((s) => {
      const len = tot ? (s.v / tot) * C : 0;
      const gap = len > 4 && segs.length > 1 ? 3 : 0;
      const a = '<circle cx="80" cy="80" r="60" fill="none" stroke-width="20" stroke="' + s.color + '" stroke-dasharray="' + Math.max(len - gap, 0) + ' ' + C + '" stroke-dashoffset="' + -off + '"/>';
      off += len;
      return a;
    }).join('');
    return '<div class="donut"><svg width="150" height="150" viewBox="0 0 160 160" role="img" aria-label="' + esc(centerLbl + ' ' + center) + '">' +
      '<circle cx="80" cy="80" r="60" fill="none" stroke="var(--chip)" stroke-width="20"/><g transform="rotate(-90 80 80)">' + arcs + '</g></svg>' +
      '<div class="c"><b>' + esc(center) + '</b><span>' + esc(centerLbl) + '</span></div></div>';
  }

  // line / bar trend chart. points: [{v, label, info}] ; opts: {pct, type, avg, sel, selParam}
  function trendChart(points, opts) {
    const n = points.length;
    if (!n) return '<div class="note">No games in this range.</div>';
    const vals = points.map((p) => p.v);
    const max = opts.pct ? 100 : Math.max(5, Math.ceil(Math.max.apply(null, vals.concat([1])) / 5) * 5);
    const X0 = 30, X1 = 344, Y0 = 12, Y1 = 138, slot = (X1 - X0) / n;
    const px = (i) => X0 + (i + 0.5) * slot, py = (v) => Y0 + (1 - v / max) * (Y1 - Y0);
    const sel = opts.sel == null || opts.sel >= n || opts.sel < 0 ? n - 1 : opts.sel;
    let s = '<svg class="chart" viewBox="0 0 350 160" role="img" aria-label="' + esc(opts.aria || 'Trend') + '">';
    [0, max / 2, max].forEach((v) => {
      s += '<line x1="30" x2="344" y1="' + py(v) + '" y2="' + py(v) + '" stroke="var(--line)"/><text x="24" y="' + (py(v) + 3) + '" text-anchor="end">' + v + '</text>';
    });
    const linkFor = (i) => esc(here({ [opts.selParam || 'sel']: i }));
    if (opts.type === 'bar') {
      const bw = Math.max(3, Math.min(22, slot * 0.62));
      points.forEach((p, i) => {
        s += '<a href="' + linkFor(i) + '" data-r><rect x="' + (px(i) - bw / 2) + '" y="' + py(p.v) + '" width="' + bw + '" height="' + Math.max(Y1 - py(p.v), 1) + '" rx="3" fill="var(--acc)" opacity="' + (i === sel ? 1 : 0.45) + '"/>' +
          '<rect x="' + (px(i) - slot / 2) + '" y="0" width="' + slot + '" height="140" fill="transparent"/></a>';
      });
    } else {
      const pts = points.map((p, i) => px(i).toFixed(1) + ',' + py(p.v).toFixed(1));
      s += '<polygon points="' + px(0).toFixed(1) + ',' + Y1 + ' ' + pts.join(' ') + ' ' + px(n - 1).toFixed(1) + ',' + Y1 + '" fill="var(--acc)" opacity=".14"/>';
      s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      points.forEach((p, i) => {
        const on = i === sel;
        s += '<a href="' + linkFor(i) + '" data-r><rect x="' + (px(i) - slot / 2) + '" y="0" width="' + slot + '" height="140" fill="transparent"/>' +
          '<circle cx="' + px(i) + '" cy="' + py(p.v) + '" r="' + (on ? 6 : n > 25 ? 2.5 : 4) + '" fill="' + (on ? 'var(--acc)' : 'var(--sub)') + '" stroke="var(--card)" stroke-width="2"/></a>';
      });
    }
    if (opts.avg != null) s += '<line x1="30" x2="344" y1="' + py(opts.avg) + '" y2="' + py(opts.avg) + '" stroke="var(--text)" stroke-width="1.2" stroke-dasharray="4 4" opacity=".7"/>';
    s += '<text x="30" y="156">' + esc(points[0].label) + '</text><text x="344" y="156" text-anchor="end">' + esc(points[n - 1].label) + '</text></svg>';
    return { svg: s, sel };
  }

  function shotBar(label, m, a, showCounts) {
    const p = pct(m, a);
    return '<div class="bar"><div class="top"><span>' + esc(label) + '</span><span><b>' + f1(p) + '%</b>' + (showCounts ? '<small>' + showCounts + '</small>' : '') + '</span></div><div class="track"><div style="width:' + Math.min(p, 100).toFixed(1) + '%"></div></div></div>';
  }
  const tile = (v, l, extra) => '<div class="tile"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + '</div>' + (extra || '') + '</div>';
  const wlClass = (g) => (g.win ? 'w' : 'l');

  // ------------------------------------------------------------------ views
  const VIEWS = {};

  // ---------- landing
  VIEWS.home = function () {
    let cards = '';
    D.teamIds.forEach((tid) => {
      const gs = D.games.filter((g) => g.t === tid);
      if (!gs.length) return;
      const latestS = gs[gs.length - 1].s;
      const sg = gs.filter((g) => g.s === latestS);
      const w = sg.filter((g) => g.win).length;
      const last = gs[gs.length - 1];
      cards += '<a class="tcard" href="' + href(['team', tid], {}) + '">' + logoSq(tid) +
        '<span style="flex:1;display:flex;flex-direction:column;gap:3px;min-width:0"><b style="font-size:18px">' + esc(D.teams[tid].name) + '</b>' +
        '<span class="note">' + esc(D.seasonName(latestS)) + ' · ' + w + '–' + (sg.length - w) + '</span>' +
        '<span class="note small">Last: <span class="res-' + wlClass(last) + '">' + (last.win ? 'W' : 'L') + '</span> ' + last.us + '–' + last.them + ' ' + esc(vsName(last)) + ' · ' + fmtD(last.date) + '</span></span>' +
        '<span class="more">' + ICON.back.replace('M15 5l-7 7 7 7', 'M9 5l7 7-7 7') + '</span></a>';
    });
    const recent = D.games.slice(-6).reverse().map((g) => gameRow(g, true)).join('');
    const all = D.games, w = all.filter((g) => g.win).length;
    const inner = '<header class="hero"><div class="hero-top"><h1>MyStatPro</h1>' + themeBtn() + '</div>' +
      '<div class="meta">' + all.length + ' games · ' + w + '–' + (all.length - w) + ' across ' + D.teamIds.length + ' teams · ' + Object.keys(D.players).length + ' players</div></header>' +
      '<div class="wrap" style="padding-top:16px">' + cards +
      '<div class="tiles two"><a class="tile" href="' + href(['leaders'], {}) + '"><div class="v">Leaders</div><div class="l">All teams combined</div></a>' +
      '<a class="tile" href="' + href(['records'], {}) + '"><div class="v">Records</div><div class="l">All-time bests</div></a></div>' +
      '<div class="card list"><div class="head"><h2>Latest Games</h2><a class="more" href="' + href(['games'], { season: 'all' }) + '">All games</a></div>' + recent + '</div></div>';
    return shell('all', inner, 'home', null);
  };

  function gameRow(g, showTeam) {
    const top = g.lines.slice().sort((a, b) => b.pts - a.pts)[0];
    return '<a class="lrow" href="' + href(['game', g.t, g.id], {}) + '"><span class="wl ' + wlClass(g) + '">' + (g.win ? 'W' : 'L') + '</span>' +
      '<span class="grow"><span style="display:flex;align-items:center;gap:6px;min-width:0">' + (showTeam ? '<span class="tag" style="background:' + D.teams[g.t].color + '">' + D.teams[g.t].short + '</span>' : '') +
      '<span class="t1" style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(vsName(g)) + '</span>' + (g.po ? '<span class="tag" style="background:var(--acc)">PLAYOFF</span>' : '') + '</span>' +
      '<span class="note small">' + fmtDY(g.date) + (top ? ' · Top: ' + esc(D.players[top.p].name) + ' ' + top.pts + ' pts' : '') + '</span></span>' +
      '<span class="big" style="font-size:22px">' + g.us + '–' + g.them + '</span></a>';
  }

  // ---------- team home
  VIEWS.team = function () {
    const tid = R.path[1];
    if (!D.teams[tid]) return notFound();
    const T = D.teams[tid];
    const teamGames = D.games.filter((g) => g.t === tid);
    const seasons = seasonsOf(teamGames);
    const season = qv('season', seasons[seasons.length - 1] || 'all');
    const phase = qv('phase', 'all');
    const G = filterGames({ team: tid, season, phase });
    const n = G.length, w = G.filter((g) => g.win).length;
    const roster = Object.values(D.players).filter((p) => p.teams[tid]);

    const tabs = '<div class="hero-seg">' + D.teamIds.map((t) => '<a class="' + (t === tid ? 'on' : '') + '" href="' + href(['team', t], {}) + '">' + esc(D.teams[t].short === 'CC' ? 'Chuckers' : D.teams[t].name) + '</a>').join('') + '</div>';
    let h = '<header class="hero"><div class="hero-top"><a class="hbtn" href="#/">' + ICON.back + 'All teams</a>' + themeBtn() + '</div>' +
      '<div class="hero-id"><span class="av logo">' + esc(T.short) + (T.logo ? '<img src="' + esc(T.logo) + '" alt="" onerror="this.remove()">' : '') + '</span><div>' +
      '<div class="kicker">' + esc(season === 'all' ? 'All seasons' : D.seasonName(season)) + '</div><h1>' + esc(T.name) + '</h1>' +
      '<div class="meta">' + w + '–' + (n - w) + ' · ' + phaseName(phase) + ' · ' + roster.length + ' players</div></div></div>' + tabs + '</header>';
    h += filterBlock({ seasons, season, phase });
    if (!n) return shell(tid, h + '<div class="wrap"><div class="empty">No games match these filters yet.</div></div>', 'home', tid);

    const last = G[n - 1];
    const lead = (g, key, lbl) => {
      const b = g.lines.slice().sort((a, c) => lineVal(key, c) - lineVal(key, a))[0];
      if (!b) return '';
      return '<a class="lrow nob" href="' + href(['player', b.p], { team: tid }) + '" style="min-height:48px">' + avatar(b.p, 's36', tid) +
        '<span class="grow"><b style="font-size:14px">' + esc(D.players[b.p].name) + '</b><span class="note small">' + b.pts + ' pts · ' + b.reb + ' reb · ' + b.ast + ' ast · ' + b.fgm + '/' + b.fga + ' FG</span></span>' +
        '<span style="display:flex;flex-direction:column;align-items:flex-end"><span class="big" style="font-size:26px;line-height:1">' + lineVal(key, b) + '</span><span class="note small" style="font-weight:700">' + lbl + '</span></span></a>';
    };
    h += '<div class="wrap">';
    h += '<div class="card"><div class="head"><span class="note small" style="font-weight:700;letter-spacing:.08em">LATEST RESULT · ' + fmtDY(last.date).toUpperCase() + '</span><a class="more" href="' + href(['game', tid, last.id], {}) + '">Box score</a></div>' +
      '<div class="board"><div>' + logoSq(tid) + esc(T.name) + '</div><div><div class="score">' + last.us + '<i>–</i>' + last.them + '</div><span class="resbadge" style="background:var(--' + (last.win ? 'win' : 'loss') + '-bg)">' + (last.win ? 'WIN' : 'LOSS') + '</span></div>' +
      '<div><span class="sq" style="background:var(--chip)">' + esc(initials(last.o)) + '</span>' + esc(last.o) + '</div></div>' +
      '<div style="border-top:1px solid var(--line);padding-top:12px;display:flex;flex-direction:column;gap:4px"><span class="note small" style="font-weight:700;letter-spacing:.08em">TOP PERFORMERS</span>' +
      lead(last, 'pts', 'PTS') + lead(last, 'reb', 'REB') + lead(last, 'ast', 'AST') + '</div></div>';

    // record
    let streak = '–';
    if (n) { let c = 0; for (let i = n - 1; i >= 0 && G[i].win === last.win; i--) c++; streak = (last.win ? 'W' : 'L') + c; }
    const pf = G.reduce((a, g) => a + g.us, 0) / n, pa = G.reduce((a, g) => a + g.them, 0) / n, diff = pf - pa;
    const form = G.slice(-10);
    h += '<div class="card"><h2>Record</h2><div class="tiles">' + tile(w + '–' + (n - w), 'Record') + tile(((w / n) * 100).toFixed(0) + '%', 'Win %') +
      '<div class="tile"><div class="v ' + (last.win ? 'up' : 'down') + '">' + streak + '</div><div class="l">Streak</div></div>' + tile(f1(pf), 'Pts for') + tile(f1(pa), 'Pts against') +
      '<div class="tile"><div class="v ' + (diff >= 0 ? 'up' : 'down') + '">' + (diff >= 0 ? '+' : '') + f1(diff) + '</div><div class="l">Diff / game</div></div></div>' +
      '<div style="display:flex;flex-direction:column;gap:8px"><span class="note small" style="font-weight:700;letter-spacing:.08em">LAST ' + form.length + ' · OLDEST TO NEWEST</span><div class="form">' +
      form.map((g) => '<span style="background:var(--' + (g.win ? 'win' : 'loss') + '-bg)" title="' + esc(vsName(g) + ' ' + g.us + '–' + g.them) + '">' + (g.win ? 'W' : 'L') + '</span>').join('') + '</div></div></div>';

    // scoring chart
    const range = qv('range', '10');
    let pts;
    if (range === 'season') {
      pts = seasonsOf(G).map((k) => { const gs = G.filter((g) => g.s === k); const f = gs.reduce((a, g) => a + g.us, 0) / gs.length, ag = gs.reduce((a, g) => a + g.them, 0) / gs.length; return { f, a: ag, label: D.seasonName(k), info: D.seasonName(k) + ' average · ' + gs.length + ' GP', val: f1(f) + ' – ' + f1(ag) }; });
    } else {
      pts = (range === 'all' ? G : G.slice(-10)).map((g) => ({ f: g.us, a: g.them, label: fmtD(g.date), info: (g.win ? 'W ' : 'L ') + vsName(g) + ' · ' + fmtD(g.date), val: g.us + ' – ' + g.them }));
    }
    h += '<div class="card"><div class="head" style="align-items:flex-end"><h2>Scoring</h2><label class="ctl">Range<select data-param="range">' +
      [['10', 'Last 10 games'], ['all', 'Every game'], ['season', 'By season']].map((o) => '<option value="' + o[0] + '"' + (o[0] === range ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label></div>' + dualChart(pts) + '</div>';

    // leaders preview
    const lk = qv('lt', 'pts');
    const byP = {};
    linesOf(G).forEach((l) => { (byP[l.p] = byP[l.p] || []).push(l); });
    const ranked = Object.keys(byP).map((pid) => { const S = agg(byP[pid]); return { pid, v: metric(lk, S) }; }).sort((a, b) => b.v - a.v).slice(0, 5);
    const topV = ranked.length ? ranked[0].v || 1 : 1;
    h += '<div class="card"><div class="head"><h2>Team Leaders</h2><a class="more" href="' + href(['leaders'], { team: tid, season, phase: phase === 'all' ? null : phase, cat: lk }) + '">All leaders</a></div>' +
      seg([['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK']].map((x) => ({ label: x[1], on: lk === x[0], attr: tog({ lt: x[0] }) }))) +
      '<div>' + ranked.map((x, i) => '<a class="lrow' + (i === 0 ? ' nob' : '') + '" href="' + href(['player', x.pid], { team: tid }) + '"><span class="rank">' + (i + 1) + '</span>' + avatar(x.pid, 's36', tid) +
        '<span class="grow"><b style="font-size:14px">' + esc(D.players[x.pid].name) + '</b><span class="track thin"><div style="width:' + ((x.v / topV) * 100).toFixed(1) + '%"></div></span></span><span class="big">' + f1(x.v) + '</span></a>').join('') + '</div></div>';

    // team averages
    const TA = agg(linesOf(G));
    const per = (k) => f1(TA[k] / n);
    h += '<div class="card"><div><h2>Team Averages</h2><div class="sub">Per game' + (T.partialStats ? ' · tracked players only' : '') + '</div></div>' +
      '<div class="tiles">' + tile(T.partialStats ? f1(pf) : per('pts'), 'PTS') + tile(per('reb'), 'REB') + tile(per('ast'), 'AST') + tile(per('stl'), 'STL') + tile(per('blk'), 'BLK') + tile(per('to'), 'TO') + '</div>' +
      shotBar('Field goals', TA.fgm, TA.fga, f1(TA.fgm / n) + '/' + f1(TA.fga / n)) + shotBar('3 pointers', TA.tpm, TA.tpa, f1(TA.tpm / n) + '/' + f1(TA.tpa / n)) + shotBar('Free throws', TA.ftm, TA.fta, f1(TA.ftm / n) + '/' + f1(TA.fta / n)) +
      (T.partialStats ? '<div class="note small">' + esc(T.partialNote || '') + '</div>' : '') + '</div>';

    // roster
    const rows = roster.map((p) => { const S = byP[p.id] ? agg(byP[p.id]) : null; return { p, S }; }).sort((a, b) => (b.S ? b.S.n : -1) - (a.S ? a.S.n : -1) || (b.S ? metric('pts', b.S) : 0) - (a.S ? metric('pts', a.S) : 0));
    h += '<div class="card"><div><h2>Roster</h2><div class="sub">Coloured dots show other teams they play for</div></div><div class="tiles two pgrid">' +
      rows.map((r) => {
        const others = Object.keys(r.p.teams).filter((t) => t !== tid);
        return '<a class="pcard" href="' + href(['player', r.p.id], { team: tid }) + '"><span class="top">' + avatar(r.p.id, 's44', tid) + '<span class="num">#' + esc(r.p.teams[tid].number) + '</span></span>' +
          '<span style="display:flex;flex-direction:column;gap:2px"><b>' + esc(r.p.name) + '</b><span class="t2">' + (r.p.position ? esc(r.p.position) + ' · ' : '') + (r.S ? f1(metric('pts', r.S)) + ' PPG · ' + r.S.n + ' GP' : 'No games in this filter') + '</span></span>' +
          '<span style="display:flex;gap:8px;min-height:12px">' + others.map((t) => '<span class="note small" style="display:flex;align-items:center;gap:4px"><span class="dot" style="background:' + D.teams[t].color + '"></span>' + D.teams[t].short + '</span>').join('') + '</span></a>';
      }).join('') + '</div></div>';

    h += '<div class="card list"><div class="head"><h2>Recent Games</h2><a class="more" href="' + href(['games'], { team: tid, season }) + '">All games</a></div>' + G.slice(-5).reverse().map((g) => gameRow(g, false)).join('') + '</div>';
    h += '</div>';
    return shell(tid, h, 'home', tid);
  };

  function dualChart(pts) {
    const m = pts.length;
    if (!m) return '<div class="note">No games.</div>';
    const all = [];
    pts.forEach((p) => all.push(p.f, p.a));
    const lo = Math.max(0, Math.floor((Math.min.apply(null, all) - 5) / 10) * 10), hi = Math.ceil((Math.max.apply(null, all) + 3) / 10) * 10 || 10;
    const X0 = 30, X1 = 344, Y0 = 10, Y1 = 148, slot = (X1 - X0) / m;
    const px = (i) => X0 + (i + 0.5) * slot, py = (v) => Y0 + (1 - (v - lo) / (hi - lo || 1)) * (Y1 - Y0);
    const selQ = Number(qv('sel', m - 1));
    const sel = selQ >= 0 && selQ < m ? selQ : m - 1;
    let s = '<div class="sel-row"><span class="big-num" style="color:var(--text);font-size:30px">' + esc(pts[sel].val) + '</span><span class="note">' + esc(pts[sel].info) + '</span></div>';
    s += '<svg class="chart" viewBox="0 0 350 170" role="img" aria-label="Points scored and allowed">';
    [lo, (lo + hi) / 2, hi].forEach((v) => { s += '<line x1="30" x2="344" y1="' + py(v) + '" y2="' + py(v) + '" stroke="var(--line)"/><text x="24" y="' + (py(v) + 3) + '" text-anchor="end">' + v + '</text>'; });
    s += '<polyline points="' + pts.map((p, i) => px(i).toFixed(1) + ',' + py(p.a).toFixed(1)).join(' ') + '" fill="none" stroke="var(--sub)" stroke-width="2" stroke-dasharray="5 4"/>';
    s += '<polyline points="' + pts.map((p, i) => px(i).toFixed(1) + ',' + py(p.f).toFixed(1)).join(' ') + '" fill="none" stroke="var(--acc)" stroke-width="2.6" stroke-linejoin="round"/>';
    pts.forEach((p, i) => {
      const on = i === sel, r = on ? 5.5 : m > 25 ? 2 : 3.5;
      s += '<a href="' + esc(here({ sel: i })) + '" data-r><rect x="' + (px(i) - slot / 2) + '" y="0" width="' + slot + '" height="150" fill="' + (on ? 'var(--chip)' : 'transparent') + '" opacity=".6"/>' +
        '<circle cx="' + px(i) + '" cy="' + py(p.a) + '" r="' + r + '" fill="var(--sub)" stroke="var(--card)" stroke-width="2"/><circle cx="' + px(i) + '" cy="' + py(p.f) + '" r="' + r + '" fill="var(--acc)" stroke="var(--card)" stroke-width="2"/></a>';
    });
    s += '<text x="30" y="166">' + esc(pts[0].label) + '</text><text x="344" y="166" text-anchor="end">' + esc(pts[m - 1].label) + '</text></svg>';
    s += '<div style="display:flex;gap:16px" class="note small"><span style="display:flex;align-items:center;gap:6px"><svg width="22" height="6" aria-hidden="true"><line x1="0" x2="22" y1="3" y2="3" stroke="var(--acc)" stroke-width="2.6"/></svg>Points for</span>' +
      '<span style="display:flex;align-items:center;gap:6px"><svg width="22" height="6" aria-hidden="true"><line x1="0" x2="22" y1="3" y2="3" stroke="var(--sub)" stroke-width="2" stroke-dasharray="5 4"/></svg>Points against</span></div>';
    return s;
  }

  // ---------- players list
  VIEWS.players = function () {
    const team = D.teams[qv('team')] ? qv('team') : 'all';
    const base = D.games.filter((g) => team === 'all' || g.t === team);
    const seasons = seasonsOf(base);
    const season = qv('season', 'all');
    const sort = qv('sort', 'gp');
    const G = filterGames({ team, season: seasons.indexOf(season) >= 0 ? season : 'all', phase: 'all' });
    const byP = {};
    linesOf(G).forEach((l) => { (byP[l.p] = byP[l.p] || []).push(l); });
    let list = Object.values(D.players).filter((p) => team === 'all' || p.teams[team]).map((p) => ({ p, S: agg(byP[p.id] || []) }));
    list.sort((a, b) => sort === 'name' ? a.p.name.localeCompare(b.p.name) : sort === 'ppg' ? metric('pts', b.S) - metric('pts', a.S) : b.S.n - a.S.n || a.p.name.localeCompare(b.p.name));
    let h = '<header class="hero"><div class="hero-top"><h1>Players</h1>' + themeBtn() + '</div><div class="hero-seg">' +
      [['all', 'All Teams']].concat(D.teamIds.map((t) => [t, D.teams[t].short === 'CC' ? 'Chuckers' : D.teams[t].name])).map((x) => '<a class="' + (team === x[0] ? 'on' : '') + '" ' + tog({ team: x[0] === 'all' ? null : x[0], season: null }) + '>' + esc(x[1]) + '</a>').join('') + '</div></header>';
    h += '<section class="filters"><input class="search" type="search" placeholder="Search players" aria-label="Search players" data-search=".pcard">' +
      '<div class="scroller">' + chips([{ label: 'All seasons', on: season === 'all', attr: tog({ season: null }) }].concat(seasons.slice().reverse().map((k) => ({ label: D.seasonName(k), on: season === k, attr: tog({ season: k }) })))) + '</div>' +
      seg([['gp', 'Most games'], ['ppg', 'Points'], ['name', 'A–Z']].map((x) => ({ label: x[1], on: sort === x[0], attr: tog({ sort: x[0] === 'gp' ? null : x[0] }) }))) + '</section>';
    h += '<div class="wrap"><div class="tiles two pgrid">' + list.map((r) => {
      const ts = Object.keys(r.p.teams).filter((t) => team === 'all' || t === team);
      return '<a class="pcard" data-name="' + esc((r.p.name + ' ' + r.p.short + ' ' + (r.p.aliases || []).join(' ')).toLowerCase()) + '" href="' + href(['player', r.p.id], { team: team === 'all' ? null : team }) + '">' +
        '<span class="top">' + avatar(r.p.id, 's44', team === 'all' ? null : team) + '<span class="num">' + ts.map((t) => '#' + esc(r.p.teams[t].number)).join(' ') + '</span></span>' +
        '<span style="display:flex;flex-direction:column;gap:2px"><b>' + esc(r.p.name) + '</b><span class="t2">' + (r.S.n ? r.S.n + ' GP · ' + f1(metric('pts', r.S)) + ' PPG · ' + f1(metric('reb', r.S)) + ' RPG' : 'No games in this filter') + '</span></span>' +
        '<span style="display:flex;gap:6px;flex-wrap:wrap">' + Object.keys(r.p.teams).map((t) => '<span class="tag" style="background:' + D.teams[t].color + '">' + D.teams[t].short + '</span>').join('') + '</span></a>';
    }).join('') + '</div><div class="empty hidden" data-search-empty>No players match that search.</div></div>';
    return shell(team, h, 'players', team);
  };

  // ---------- player page
  const STAT_OPTS = [['pts', 'Points'], ['reb', 'Rebounds'], ['oreb', 'Off. rebounds'], ['dreb', 'Def. rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['to', 'Turnovers'], ['pf', 'Fouls'],
    ['fgm', 'FG made'], ['fga', 'FG attempts'], ['fgp', 'FG %'], ['twop', '2PT %'], ['tpm', '3PT made'], ['tpa', '3PT attempts'], ['tpp', '3PT %'], ['ftm', 'FT made'], ['fta', 'FT attempts'], ['ftp', 'FT %'], ['efg', 'Effective FG %'], ['ts', 'True shooting %']];
  const GROUPS = {
    scoring: ['pts', 'fgm', 'fga', 'fgp', 'twom', 'twoa', 'twop'],
    shooting: ['tpm', 'tpa', 'tpp', 'ftm', 'fta', 'ftp', 'efg', 'ts'],
    reb: ['oreb', 'dreb', 'reb'],
    other: ['ast', 'stl', 'blk', 'to', 'pf', 'astto']
  };
  GROUPS.all = GROUPS.scoring.concat(GROUPS.shooting, GROUPS.reb, GROUPS.other);

  VIEWS.player = function () {
    const pid = R.path[1];
    const P = D.players[pid];
    if (!P) return notFound();
    const teamsPlayed = D.teamIds.filter((t) => P.teams[t] && P.teams[t].gp > 0);
    const team = teamsPlayed.indexOf(qv('team')) >= 0 ? qv('team') : 'all';
    const myGamesAll = D.games.filter((g) => g.lines.some((l) => l.p === pid) || g.dnp.some((d) => d.p === pid));
    const teamGames = myGamesAll.filter((g) => team === 'all' || g.t === team);
    const seasons = seasonsOf(teamGames.filter((g) => g.lines.some((l) => l.p === pid)));
    const season = seasons.indexOf(qv('season')) >= 0 ? qv('season') : 'all';
    const phase = qv('phase', 'all');
    const inPhase = (g) => phase === 'all' || (phase === 'po' ? g.po : !g.po);
    const list = linesOf(teamGames.filter((g) => (season === 'all' || g.s === season) && inPhase(g)), pid);
    const A = agg(list);
    const allA = agg(linesOf(myGamesAll, pid));
    const view = qv('tab', 'ov');
    const accentTid = team === 'all' ? (teamsPlayed.length === 1 ? teamsPlayed[0] : 'all') : team;
    const teamName = team === 'all' ? 'All teams' : D.teams[team].name;

    // header
    const others = Object.values(D.players).filter((p) => p.gp > 0).sort((a, b) => a.name.localeCompare(b.name));
    let h = '<header class="hero"><div class="hero-top"><a class="hbtn icon" href="' + (team !== 'all' ? href(['team', team], {}) : href(['players'], {})) + '" aria-label="Back">' + ICON.back + '</a>' +
      '<div style="display:flex;gap:8px"><button class="hbtn" data-menu-toggle aria-expanded="false">Switch player' + ICON.down + '</button>' + themeBtn() + '</div></div>' +
      '<div class="menu hidden" data-menu><input class="search" type="search" placeholder="Search" aria-label="Search players" data-search=".menu a">' +
      others.map((p) => '<a class="' + (p.id === pid ? 'on' : '') + '" data-name="' + esc(p.name.toLowerCase() + ' ' + p.short.toLowerCase()) + '" href="' + href(['player', p.id], { tab: view === 'ov' ? null : view }) + '"><b>' + esc(p.name) + '</b><span>' + Object.keys(p.teams).map((t) => D.teams[t].short === 'CC' ? 'Chuckers' : D.teams[t].name).join(' · ') + '</span></a>').join('') + '</div>' +
      '<div class="hero-id">' + avatar(pid, 'big', team === 'all' ? null : team) + '<div>' + (P.position ? '<div class="kicker">' + esc(P.position) + '</div>' : '') +
      '<h1>' + esc(P.name).replace(' ', '<br>') + '</h1><div class="meta">' + allA.n + ' games · ' + allA.w + '–' + (allA.n - allA.w) + ' record' + (teamsPlayed.length > 1 ? ' · ' + teamsPlayed.length + ' teams' : '') + '</div></div></div>' +
      '<div class="pills">' + teamsPlayed.map((t) => '<a class="pill" href="' + href(['team', t], {}) + '">' + teamBadge(t, 's26') + '#' + esc(P.teams[t].number) + ' ' + esc(D.teams[t].name) + '</a>').join('') + '</div></header>';
    h += '<nav class="tabs" aria-label="Player sections">' + [['ov', 'Overview'], ['stats', 'Stats'], ['log', 'Game Log'], ['opp', 'Versus']].map((v) => '<a class="' + (view === v[0] ? 'on' : '') + '" ' + tog({ tab: v[0] === 'ov' ? null : v[0], sel: null }) + '>' + v[1] + '</a>').join('') + '</nav>';
    h += filterBlock({ teams: teamsPlayed.length > 1 ? teamsPlayed : null, team, seasons, season, phase, scope: teamName + ' · ' + (season === 'all' ? 'All seasons' : D.seasonName(season)) + ' · ' + phaseName(phase) + ' · ' + A.n + ' GP' });
    if (!A.n) return shell(accentTid, h + '<div class="wrap"><div class="empty">No games match these filters yet.</div></div>', 'players', team);

    h += '<div class="wrap">';
    if (view === 'ov') h += playerOverview(pid, list, A, team, teamsPlayed, season, inPhase, teamGames);
    else if (view === 'stats') h += playerStats(pid, list, A, team, teamName, phase, teamGames, inPhase);
    else if (view === 'log') h += playerLog(list);
    else h += playerVersus(list, A);
    h += '</div>';
    return shell(accentTid, h, 'players', team);
  };

  function playerOverview(pid, list, A, team, teamsPlayed, season, inPhase, teamGames) {
    let h = '<div class="tiles wide">' + tile(f1(metric('pts', A)), 'PPG') + tile(f1(metric('reb', A)), 'RPG') + tile(f1(metric('ast', A)), 'APG') +
      tile(f1(metric('fgp', A)), 'FG%') + tile(f1(metric('tpp', A)), '3P%') + tile(f1(metric('ftp', A)), 'FT%') + '</div>';
    // donut
    const tab = qv('dt', 'pts');
    const P = isDark() ? ['#2F6BFF', '#8FD0FF', '#E6F0FF'] : ['#1B3A8C', '#2F6BFF', '#8FD0FF'];
    const miss = isDark() ? '#4A5263' : '#C9D2DF';
    const pg = (v) => (A.n ? v / A.n : 0);
    let segs, center, centerLbl, head, foot;
    const shots = (m, a, name) => { center = f1(pct(m, a)) + '%'; centerLbl = name; head = 'Shots'; foot = f1(pg(m)) + ' of ' + f1(pg(a)) + ' per game'; return [{ label: 'Made', v: pg(m), color: P[1] }, { label: 'Missed', v: pg(a - m), color: miss }]; };
    if (tab === 'pts') { segs = [{ label: '2 Pointers', v: pg(2 * A.twom), color: P[0] }, { label: '3 Pointers', v: pg(3 * A.tpm), color: P[1] }, { label: 'Free Throws', v: pg(A.ftm), color: P[2] }]; center = f1(metric('pts', A)); centerLbl = 'PPG'; head = 'Shot type'; foot = A.pts + ' total points'; }
    else if (tab === 'reb') { segs = [{ label: 'Offensive', v: pg(A.oreb), color: P[0] }, { label: 'Defensive', v: pg(A.dreb), color: P[1] }]; center = f1(metric('reb', A)); centerLbl = 'RPG'; head = 'Reb type'; foot = A.reb + ' total rebounds'; }
    else if (tab === 'fg') segs = shots(A.fgm, A.fga, 'FG%');
    else if (tab === '3pt') segs = shots(A.tpm, A.tpa, '3P%');
    else segs = shots(A.ftm, A.fta, 'FT%');
    h += '<div class="card"><h2>Season Averages</h2>' + seg([['pts', 'PTS'], ['reb', 'REB'], ['fg', 'FG'], ['3pt', '3PT'], ['ft', 'FT']].map((x) => ({ label: x[1], on: tab === x[0], attr: tog({ dt: x[0] === 'pts' ? null : x[0] }) }))) +
      '<div class="donut-row">' + donut(segs, center, centerLbl) + '<div class="legend"><div class="lh"><span>' + head + '</span><span>Per game</span></div>' +
      segs.map((s) => '<div class="li"><span class="dot" style="background:' + s.color + '"></span><span>' + s.label + '</span><b>' + f1(s.v) + '</b></div>').join('') + '<div class="note small">' + foot + '</div></div></div></div>';

    // trends
    const sk = STAT_OPTS.some((o) => o[0] === qv('stat')) ? qv('stat') : 'pts';
    const range = qv('range', '10'), type = qv('chart', 'line'), showAvg = qv('avg', '1') === '1';
    let pdata;
    if (range === 'season') {
      pdata = seasonsOf(list.map((l) => l.g)).map((k) => { const ls = list.filter((l) => l.g.s === k); return { ls, label: D.seasonName(k), info: D.seasonName(k) + ' · ' + ls.length + ' GP' }; });
    } else {
      const N = range === 'all' ? list.length : parseInt(range, 10);
      pdata = list.slice(-N).map((l) => ({ ls: [l], label: fmtD(l.g.date), info: vsName(l.g) + ' · ' + fmtDY(l.g.date) + ' · ' + D.teams[l.g.t].short }));
    }
    const pts = pdata.map((p) => ({ v: metric(sk, agg(p.ls)), label: p.label, info: p.info }));
    const allIn = [];
    pdata.forEach((p) => allIn.push.apply(allIn, p.ls));
    const avgV = metric(sk, agg(allIn));
    const isP = !!PCT[sk];
    const show = (v) => (isP ? f1(v) + '%' : String(Math.round(v * 10) / 10));
    const ch = trendChart(pts, { pct: isP, type, avg: showAvg ? avgV : null, sel: R.q.has('sel') ? Number(qv('sel')) : null, aria: LABEL[sk] + ' trend' });
    const rangeName = { '5': 'last 5 games', '10': 'last 10 games', '20': 'last 20 games', all: 'every game', season: 'each season' }[range];
    h += '<div class="card"><h2>Trends</h2><div class="grid2"><label class="ctl">Stat<select data-param="stat">' + STAT_OPTS.map((o) => '<option value="' + o[0] + '"' + (o[0] === sk ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
      '<label class="ctl">Range<select data-param="range">' + [['5', 'Last 5 games'], ['10', 'Last 10 games'], ['20', 'Last 20 games'], ['all', 'Every game'], ['season', 'By season']].map((o) => '<option value="' + o[0] + '"' + (o[0] === range ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label></div>' +
      '<div class="head">' + seg([['line', 'Line'], ['bar', 'Bars']].map((x) => ({ label: x[1], on: type === x[0], attr: tog({ chart: x[0] === 'line' ? null : x[0], sel: null }) })), 'inline') +
      '<a class="chip' + (showAvg ? ' on' : '') + '" ' + tog({ avg: showAvg ? '0' : null }) + '>Average line</a></div>';
    if (typeof ch === 'string') h += ch;
    else {
      h += '<div class="sel-row"><span class="big-num">' + show(pts[ch.sel].v) + ' ' + LABEL[sk] + '</span><span class="note">' + esc(pts[ch.sel].info) + '</span></div>' + ch.svg;
      if (showAvg) h += '<div class="note small" style="display:flex;align-items:center;gap:8px"><svg width="22" height="6" aria-hidden="true"><line x1="0" x2="22" y1="3" y2="3" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/></svg>Average across ' + rangeName + ': ' + show(avgV) + '</div>';
    }
    h += '</div>';

    // shooting
    h += '<div class="card"><h2>Shooting</h2>' + shotBar('Field goals', A.fgm, A.fga, A.fgm + '/' + A.fga) + shotBar('2 pointers', A.twom, A.twoa, A.twom + '/' + A.twoa) + shotBar('3 pointers', A.tpm, A.tpa, A.tpm + '/' + A.tpa) +
      shotBar('Free throws', A.ftm, A.fta, A.ftm + '/' + A.fta) + shotBar('Effective FG', metric('efg', A) / 100, 1) + shotBar('True shooting', metric('ts', A) / 100, 1) + '</div>';

    // by team
    if (team === 'all' && teamsPlayed.length > 1) {
      const base = list;
      const split = teamsPlayed.map((t) => ({ t, S: agg(base.filter((l) => l.g.t === t)) })).filter((x) => x.S.n);
      h += '<div class="card"><div><h2>By Team</h2><div class="sub">Share of games played. Tap a team to filter.</div></div><div class="split-bar">' +
        split.map((x) => '<div style="background:' + D.teams[x.t].color + ';width:' + ((x.S.n / base.length) * 100).toFixed(1) + '%"></div>').join('') + '</div>' +
        '<div><div class="trow th" style="grid-template-columns:minmax(0,1fr) 36px 44px 44px 44px"><span style="text-align:left">TEAM</span><span>GP</span><span>PPG</span><span>RPG</span><span>APG</span></div>' +
        split.map((x) => '<a class="trow" style="grid-template-columns:minmax(0,1fr) 36px 44px 44px 44px" ' + tog({ team: x.t, sel: null }) + '><span class="lft">' + teamBadge(x.t, 's30') + '<span><span class="t1">' + esc(D.teams[x.t].name) + '</span></span></span><span>' + x.S.n + '</span><b>' + f1(metric('pts', x.S)) + '</b><span>' + f1(metric('reb', x.S)) + '</span><span>' + f1(metric('ast', x.S)) + '</span></a>').join('') + '</div></div>';
    }

    // last 5
    h += '<div class="card list"><div class="head"><h2>Last 5 Games</h2><a class="more" ' + tog({ tab: 'log' }) + '>Full game log</a></div>' +
      '<div class="trow th" style="grid-template-columns:minmax(0,1fr) 30px 30px 30px 30px 30px"><span style="text-align:left">MATCHUP</span><span>PTS</span><span>REB</span><span>AST</span><span>STL</span><span>BLK</span></div>' +
      list.slice(-5).reverse().map((l) => '<a class="trow" style="grid-template-columns:minmax(0,1fr) 30px 30px 30px 30px 30px;min-height:60px;font-size:16px" href="' + href(['game', l.g.t, l.g.id], {}) + '"><span class="lft">' + teamBadge(l.g.t, 's28') +
        '<span><span class="t1">' + esc(vsName(l.g)) + '</span><span class="t2"><span class="res-' + wlClass(l.g) + '">' + (l.g.win ? 'W' : 'L') + '</span> ' + l.g.us + '–' + l.g.them + ' · ' + fmtD(l.g.date) + '</span></span></span>' +
        '<b>' + l.pts + '</b><span>' + l.reb + '</span><span>' + l.ast + '</span><span>' + l.stl + '</span><span>' + l.blk + '</span></a>').join('') + '</div>';

    // highs + career
    const highs = highList(list).slice(0, 3);
    h += '<div class="card"><div class="head"><h2>Highs</h2><a class="more" ' + tog({ tab: 'stats' }) + '>All career highs</a></div><div class="tiles">' + highs.map(highTile).join('') + '</div></div>';
    const rows = careerRows(pid, teamGames.filter(inPhase), team);
    h += '<div class="card list"><div class="head"><h2>Career</h2><a class="more" ' + tog({ tab: 'stats' }) + '>Full stats</a></div>' +
      '<div class="trow th" style="grid-template-columns:minmax(0,1fr) 30px 40px 40px 40px"><span style="text-align:left">SEASON</span><span>GP</span><span>PPG</span><span>RPG</span><span>APG</span></div>' +
      rows.map((r) => '<div class="trow' + (r.strong ? ' strong' : '') + '" style="grid-template-columns:minmax(0,1fr) 30px 40px 40px 40px"><span class="lft">' + r.badge + '<span><span class="t1">' + esc(r.season) + '</span><span class="t2">' + esc(r.team) + '</span></span></span>' +
        '<span>' + r.S.n + '</span><span>' + f1(metric('pts', r.S)) + '</span><span>' + f1(metric('reb', r.S)) + '</span><span>' + f1(metric('ast', r.S)) + '</span></div>').join('') + '</div>';
    return h;
  }

  function careerRows(pid, games, team) {
    const lines = linesOf(games, pid);
    const neutral = '<span class="tb s30" style="background:var(--on-chip)">ALL</span>';
    const rows = [{ S: agg(lines), season: 'Career', team: team === 'all' ? 'All teams' : D.teams[team].name, badge: avatar(pid, 's30', team === 'all' ? null : team), strong: true }];
    seasonsOf(lines.map((l) => l.g)).reverse().forEach((k) => {
      const ls = lines.filter((l) => l.g.s === k);
      const ts = D.teamIds.filter((t) => ls.some((l) => l.g.t === t));
      if (ts.length > 1) rows.push({ S: agg(ls), season: D.seasonName(k), team: 'Combined · ' + ts.length + ' teams', badge: neutral, strong: true });
      ts.forEach((t) => rows.push({ S: agg(ls.filter((l) => l.g.t === t)), season: D.seasonName(k), team: D.teams[t].name, badge: teamBadge(t, 's30'), strong: false }));
    });
    return rows;
  }

  function highList(list) {
    const hi = (label, f, filt, show) => {
      let best = null;
      list.forEach((l) => { if (filt && !filt(l)) return; if (!best || f(l) > f(best)) best = l; });
      return best ? { label, val: show ? show(best) : String(f(best)), sub: vsName(best.g) + ', ' + fmtDY(best.g.date), link: href(['game', best.g.t, best.g.id], {}) } : { label, val: '–', sub: '' };
    };
    return [
      hi('Points', (l) => l.pts), hi('Rebounds', (l) => l.reb), hi('Assists', (l) => l.ast),
      hi('Off reb', (l) => l.oreb), hi('Def reb', (l) => l.dreb), hi('Steals', (l) => l.stl),
      hi('Blocks', (l) => l.blk), hi('FG made', (l) => l.fgm), hi('3PT made', (l) => l.tpm),
      hi('FT made', (l) => l.ftm), hi('PTS+REB+AST', (l) => lineVal('pra', l)), hi('STL + BLK', (l) => l.stl + l.blk),
      hi('Best FG%', (l) => l.fgm / l.fga, (l) => l.fga >= 6, (l) => Math.round((l.fgm / l.fga) * 100) + '%')
    ];
  }
  const highTile = (h) => '<a class="tile" href="' + esc(h.link || '#') + '"><span class="l">' + esc(h.label) + '</span><span class="v">' + esc(h.val) + '</span><span class="s">' + esc(h.sub) + '</span></a>';

  function playerStats(pid, list, A, team, teamName, phase, teamGames, inPhase) {
    const mode = qv('mode', 'pg'), group = GROUPS[qv('group')] ? qv('group') : 'scoring';
    const keys = GROUPS[group];
    const rows = careerRows(pid, teamGames.filter(inPhase), team);
    const cols = '150px 40px repeat(' + keys.length + ', 58px)';
    let h = '<div class="card flush"><div class="head px"><h2>Full Stats</h2>' + seg([['pg', 'Per game'], ['tot', 'Totals']].map((x) => ({ label: x[1], on: mode === x[0], attr: tog({ mode: x[0] === 'pg' ? null : x[0] }) })), 'inline') + '</div>' +
      '<div class="scroller px">' + chips([['scoring', 'Scoring'], ['shooting', '3PT & FT'], ['reb', 'Rebounding'], ['other', 'Playmaking & D'], ['all', 'Everything']].map((x) => ({ label: x[1], on: group === x[0], attr: tog({ group: x[0] === 'scoring' ? null : x[0] }) }))) + '</div>' +
      '<div class="xscroll"><div><div class="trow th" style="grid-template-columns:' + cols + '"><span class="stick">SEASON</span><span>GP</span>' + keys.map((k) => '<span>' + LABEL[k] + '</span>').join('') + '</div>' +
      rows.map((r) => '<div class="trow' + (r.strong ? ' strong' : '') + '" style="grid-template-columns:' + cols + '"><span class="stick">' + r.badge.replace('s30', 's24') + '<span><span class="t1" style="font-size:13px">' + esc(r.season) + '</span><span class="t2" style="font-size:11px">' + esc(r.team) + '</span></span></span><span>' + r.S.n + '</span>' +
        keys.map((k) => '<span>' + fmtStat(k, r.S, mode) + '</span>').join('') + '</div>').join('') + '</div></div><div class="note small px">Swipe the table sideways for more columns. Career and season rows use the filters above.</div></div>';
    h += '<div class="card"><div><h2>Career Highs</h2><div class="sub">Tap one to open that box score</div></div><div class="tiles">' + highList(list).map(highTile).join('') + '</div></div>';
    const sr = (label, ls) => { const S = agg(ls); return S.n ? '<div class="trow" style="grid-template-columns:minmax(0,1fr) 30px 40px 36px 36px 44px 44px;min-height:48px;font-size:14px"><span style="text-align:left;font-weight:600">' + label + '</span><span>' + S.n + '</span><b>' + f1(metric('pts', S)) + '</b><span>' + f1(metric('reb', S)) + '</span><span>' + f1(metric('ast', S)) + '</span><span>' + f1(metric('fgp', S)) + '</span><span>' + f1(metric('tpp', S)) + '</span></div>' : ''; };
    h += '<div class="card list"><div class="head"><div><h2>Splits</h2><div class="sub">Per game</div></div></div><div class="trow th" style="grid-template-columns:minmax(0,1fr) 30px 40px 36px 36px 44px 44px"><span style="text-align:left">SPLIT</span><span>GP</span><span>PTS</span><span>REB</span><span>AST</span><span>FG%</span><span>3P%</span></div>' +
      sr('Home', list.filter((l) => l.g.home)) + sr('Away', list.filter((l) => !l.g.home)) + sr('Wins', list.filter((l) => l.g.win)) + sr('Losses', list.filter((l) => !l.g.win)) +
      sr('Regular season', list.filter((l) => !l.g.po)) + sr('Playoffs', list.filter((l) => l.g.po)) + '</div>';
    return h;
  }

  function playerLog(list) {
    const sort = qv('sort', 'date'), showAll = qv('all') === '1';
    const sv = (l) => (sort === 'fgp' ? (l.fga ? l.fgm / l.fga : -1) : lineVal(sort, l));
    const sorted = list.slice().sort((a, b) => (sort === 'date' ? b.g.date - a.g.date : sv(b) - sv(a) || b.g.date - a.g.date));
    const shown = showAll ? sorted : sorted.slice(0, 15);
    const colKey = ['pts', 'reb', 'oreb', 'ast', 'stl', 'blk', 'to', 'pf', 'fgm', 'tpm', 'ftm', 'fgp'];
    const cols = '170px repeat(8, 40px) repeat(3, 52px) 52px';
    let h = '<div class="card flush"><div class="head px" style="align-items:flex-end"><div><h2>Game Log</h2><div class="sub">' + list.length + ' games · tap a game for its box score</div></div>' +
      '<label class="ctl">Sort by<select data-param="sort">' + [['date', 'Newest'], ['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['to', 'Turnovers'], ['fgm', 'FG made'], ['tpm', '3PT made'], ['ftm', 'FT made'], ['fgp', 'FG %']]
        .map((o) => '<option value="' + o[0] + '"' + (o[0] === sort ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label></div>' +
      '<div class="xscroll"><div><div class="trow th" style="grid-template-columns:' + cols + '"><span class="stick">GAME</span><span>PTS</span><span>REB</span><span>OR</span><span>AST</span><span>STL</span><span>BLK</span><span>TO</span><span>PF</span><span>FG</span><span>3P</span><span>FT</span><span>FG%</span></div>';
    shown.forEach((l) => {
      const v = [l.pts, l.reb, l.oreb, l.ast, l.stl, l.blk, l.to, l.pf, l.fgm + '-' + l.fga, l.tpm + '-' + l.tpa, l.ftm + '-' + l.fta, l.fga ? Math.round((l.fgm / l.fga) * 100) : '–'];
      h += '<a class="trow" style="grid-template-columns:' + cols + ';min-height:56px" href="' + href(['game', l.g.t, l.g.id], {}) + '"><span class="stick">' + teamBadge(l.g.t, 's24') +
        '<span><span class="t1" style="font-size:13px;max-width:120px">' + esc(vsName(l.g)) + '</span><span class="t2" style="font-size:11px"><span class="res-' + wlClass(l.g) + '">' + (l.g.win ? 'W' : 'L') + '</span> ' + l.g.us + '–' + l.g.them + ' · ' + fmtD(l.g.date) + ' ' + String(l.g.date.getFullYear()).slice(2) + '</span></span></span>' +
        v.map((x, i) => '<span' + (colKey[i] === sort ? ' class="hl"' : '') + '>' + x + '</span>').join('') + '</a>';
    });
    h += '</div></div>';
    if (sorted.length > 15) h += '<div class="px" style="padding-bottom:8px"><a class="pbtn" ' + tog({ all: showAll ? null : '1' }) + '>' + (showAll ? 'Show fewer' : 'Show all ' + sorted.length + ' games') + '</a></div>';
    return h + '</div>';
  }

  function playerVersus(list, A) {
    const map = {};
    list.forEach((l) => { (map[l.g.ok] = map[l.g.ok] || []).push(l); });
    const keys = Object.keys(map).sort((a, b) => map[b].length - map[a].length || map[a][0].g.o.localeCompare(map[b][0].g.o));
    const sel = map[qv('opp')] ? qv('opp') : keys[0];
    const OL = map[sel] || [], OS = agg(OL);
    const name = OL.length ? OL[0].g.o : '–';
    const diff = (k) => { const d = metric(k, OS) - metric(k, A); return '<div class="d ' + (Math.abs(d) < 0.05 ? '' : (k === 'to' ? d < 0 : d > 0) ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '') + f1(d) + '</div>'; };
    let h = '<div class="card"><h2>Versus</h2><div class="scroller">' + chips(keys.map((k) => ({ label: map[k][0].g.o, on: k === sel, attr: tog({ opp: k }) })), 'tall') + '</div>' +
      '<div class="head" style="align-items:baseline"><span style="font-family:var(--display);font-size:32px;font-weight:700;line-height:1">' + esc(name) + '</span><span class="note">' + OS.n + ' GP · ' + OS.w + '–' + (OS.n - OS.w) + '</span></div>' +
      '<div class="tiles">' + [['pts', 'PPG'], ['reb', 'RPG'], ['ast', 'APG'], ['fgp', 'FG%'], ['tpp', '3P%'], ['ftp', 'FT%']].map((x) => tile(f1(metric(x[0], OS)), x[1], diff(x[0]))).join('') + '</div>' +
      '<div class="note small">Small number under each stat: difference from his average in all selected games.</div></div>';
    h += '<div class="card list"><div class="head"><h2>Every game vs ' + esc(name) + '</h2></div><div class="trow th" style="grid-template-columns:minmax(0,1fr) 32px 32px 32px 52px"><span style="text-align:left">GAME</span><span>PTS</span><span>REB</span><span>AST</span><span>FG</span></div>' +
      OL.slice().reverse().map((l) => '<a class="trow" style="grid-template-columns:minmax(0,1fr) 32px 32px 32px 52px" href="' + href(['game', l.g.t, l.g.id], {}) + '"><span class="lft">' + teamBadge(l.g.t, 's28') + '<span><span class="t1">' + fmtDY(l.g.date) + '</span><span class="t2"><span class="res-' + wlClass(l.g) + '">' + (l.g.win ? 'W' : 'L') + '</span> ' + l.g.us + '–' + l.g.them + ' · ' + esc(D.seasonName(l.g.s)) + '</span></span></span>' +
        '<b>' + l.pts + '</b><span>' + l.reb + '</span><span>' + l.ast + '</span><span>' + l.fgm + '-' + l.fga + '</span></a>').join('') + '</div>';
    h += '<div class="card list"><div class="head"><div><h2>All Opponents</h2><div class="sub">Tap a row to compare</div></div></div><div class="trow th" style="grid-template-columns:minmax(0,1fr) 30px 48px 42px 46px"><span style="text-align:left">OPPONENT</span><span>GP</span><span>W–L</span><span>PPG</span><span>FG%</span></div>' +
      keys.map((k) => { const S = agg(map[k]); return '<a class="trow" style="grid-template-columns:minmax(0,1fr) 30px 48px 42px 46px;min-height:48px;font-size:14px' + (k === sel ? ';color:var(--acc)' : '') + '" ' + tog({ opp: k }) + '><span style="text-align:left;font-weight:600">' + esc(map[k][0].g.o) + '</span><span>' + S.n + '</span><span>' + S.w + '–' + (S.n - S.w) + '</span><b>' + f1(metric('pts', S)) + '</b><span>' + f1(metric('fgp', S)) + '</span></a>'; }).join('') + '</div>';
    return h;
  }

  // ---------- leaders
  const CATS = [
    { k: 'pts', l: 'PTS', long: 'Points' }, { k: 'reb', l: 'REB', long: 'Rebounds' }, { k: 'ast', l: 'AST', long: 'Assists' },
    { k: 'stl', l: 'STL', long: 'Steals' }, { k: 'blk', l: 'BLK', long: 'Blocks' }, { k: 'tpm', l: '3PM', long: '3 pointers made' },
    { k: 'fgp', l: 'FG%', long: 'Field goal %', m: 'fgm', a: 'fga', min: 20 }, { k: 'tpp', l: '3P%', long: '3 point %', m: 'tpm', a: 'tpa', min: 10 },
    { k: 'ftp', l: 'FT%', long: 'Free throw %', m: 'ftm', a: 'fta', min: 10 }, { k: 'efg', l: 'eFG%', long: 'Effective FG %', a: 'fga', min: 20 },
    { k: 'ts', l: 'TS%', long: 'True shooting %', a: 'fga', min: 20 }, { k: 'oreb', l: 'OREB', long: 'Offensive rebounds' },
    { k: 'dreb', l: 'DREB', long: 'Defensive rebounds' }, { k: 'fgm', l: 'FGM', long: 'Field goals made' }, { k: 'fga', l: 'FGA', long: 'Field goal attempts' },
    { k: 'ftm', l: 'FTM', long: 'Free throws made' }, { k: 'astto', l: 'AST/TO', long: 'Assist to turnover', min: 10 },
    { k: 'to', l: 'TO', long: 'Turnovers' }, { k: 'pf', l: 'PF', long: 'Fouls' }, { k: 'gp', l: 'GP', long: 'Games played' }
  ];
  VIEWS.leaders = function () {
    const team = D.teams[qv('team')] ? qv('team') : 'all';
    const base = D.games.filter((g) => team === 'all' || g.t === team);
    const seasons = seasonsOf(base);
    const season = seasons.indexOf(qv('season')) >= 0 ? qv('season') : 'all';
    const phase = qv('phase', 'all'), mode = qv('mode', 'pg'), qual = qv('qual', '1') === '1';
    const cat = CATS.find((c) => c.k === qv('cat')) || CATS[0];
    const G = filterGames({ team, season, phase });
    const byP = {};
    linesOf(G).forEach((l) => { (byP[l.p] = byP[l.p] || []).push(l); });
    const players = Object.keys(byP).map((pid) => ({ pid, S: agg(byP[pid]), teams: D.teamIds.filter((t) => byP[pid].some((l) => l.g.t === t)) }));
    const isP = (c) => !!PCT[c.k];
    const value = (c, S) => (c.k === 'gp' || isP(c) || c.k === 'astto' ? metric(c.k, S) : mode === 'tot' ? S[c.k] : metric(c.k, S));
    const show = (c, v) => (isP(c) ? f1(v) + '%' : c.k === 'astto' ? v.toFixed(2) : c.k === 'gp' || mode === 'tot' ? String(Math.round(v)) : f1(v));
    const qualifies = (c, S) => !qual || (S.n >= 3 && (!c.min || (c.a ? S[c.a] >= c.min : c.k === 'astto' ? S.ast + S.to >= c.min : true)));
    const rank = (c) => players.filter((p) => qualifies(c, p.S)).map((p) => ({ p, v: value(c, p.S) })).sort((a, b) => b.v - a.v);
    const list = rank(cat), topV = list.length ? list[0].v || 1 : 1;
    const tag = (t) => '<span class="tag" style="background:' + D.teams[t].color + '">' + D.teams[t].short + '</span>';
    let h = '<header class="hero"><div class="hero-top"><h1>Leaders</h1>' + themeBtn() + '</div><div class="hero-seg">' +
      [['all', 'All Teams']].concat(D.teamIds.map((t) => [t, D.teams[t].short === 'CC' ? 'Chuckers' : D.teams[t].name])).map((x) => '<a class="' + (team === x[0] ? 'on' : '') + '" ' + tog({ team: x[0] === 'all' ? null : x[0], season: null }) + '>' + esc(x[1]) + '</a>').join('') + '</div></header>';
    h += filterBlock({ seasons, season, phase }).replace('</section>', '') +
      '<div class="head" style="display:flex;justify-content:space-between;gap:8px;align-items:center">' + seg([['pg', 'Per game'], ['tot', 'Totals']].map((x) => ({ label: x[1], on: mode === x[0], attr: tog({ mode: x[0] === 'pg' ? null : x[0] }) })), 'inline') +
      '<a class="chip' + (qual ? ' on' : '') + '" ' + tog({ qual: qual ? '0' : null }) + '>Qualified only</a></div>' +
      '<div class="scroller">' + chips(CATS.map((c) => ({ label: c.l, on: c.k === cat.k, attr: tog({ cat: c.k === 'pts' ? null : c.k }) })), 'tall') + '</div></section>';
    h += '<div class="wrap">';
    if (list.length) {
      const top = list[0];
      h += '<a class="card" style="flex-direction:row;align-items:center;gap:16px;text-decoration:none;color:var(--text)" href="' + href(['player', top.p.pid], { team: team === 'all' ? null : team, season: season === 'all' ? null : season }) + '">' + avatar(top.p.pid, 's76', team === 'all' ? null : team) +
        '<span style="flex:1;display:flex;flex-direction:column;gap:4px;min-width:0"><span class="note small" style="font-weight:700;letter-spacing:.08em">' + esc(cat.long.toUpperCase()) + ' LEADER</span><b style="font-size:18px">' + esc(D.players[top.p.pid].name) + '</b>' +
        '<span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + top.p.teams.map(tag).join('') + '<span class="note small">' + top.p.S.n + ' GP</span></span></span>' +
        '<span style="display:flex;flex-direction:column;align-items:flex-end"><span class="big-num" style="font-size:46px;font-weight:800">' + show(cat, top.v) + '</span><span class="note small" style="font-weight:700">' + (cat.k === 'gp' ? 'GAMES' : isP(cat) ? 'PERCENT' : cat.k === 'astto' ? 'RATIO' : mode === 'tot' ? 'TOTAL' : 'PER GAME') + '</span></span></a>';
    }
    h += '<div class="card list"><div class="head"><div><h2>' + esc(cat.long) + '</h2><div class="sub">' + (team === 'all' ? 'All teams combined' : esc(D.teams[team].name)) + ' · ' + (season === 'all' ? 'All seasons' : esc(D.seasonName(season))) + ' · ' + G.length + ' games</div></div></div>' +
      list.map((x, i) => {
        const S = x.p.S;
        let sub = S.n + ' GP';
        if (cat.m) sub += ' · ' + S[cat.m] + '/' + S[cat.a];
        else if (mode === 'pg' && cat.k !== 'gp' && !isP(cat) && cat.k !== 'astto') sub += ' · ' + S[cat.k] + ' total';
        return '<a class="lrow" style="min-height:60px" href="' + href(['player', x.p.pid], { team: team === 'all' ? null : team }) + '"><span class="rank">' + (i + 1) + '</span>' + avatar(x.p.pid, 's40', team === 'all' ? null : team) +
          '<span class="grow"><span style="display:flex;align-items:center;gap:6px;min-width:0"><b style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(D.players[x.p.pid].name) + '</b>' + x.p.teams.map((t) => '<span class="dot" style="width:9px;height:9px;background:' + D.teams[t].color + '"></span>').join('') + '</span>' +
          '<span class="track thin"><div style="width:' + Math.max(0, (x.v / topV) * 100).toFixed(1) + '%"></div></span><span class="note small">' + sub + '</span></span><span class="big" style="font-size:26px;min-width:56px">' + show(cat, x.v) + '</span></a>';
      }).join('') + (list.length ? '' : '<div class="note" style="padding:20px 0;text-align:center">Nobody qualifies yet. Turn off Qualified only to see everyone.</div>') +
      '<div class="note small" style="padding:12px 0;border-top:1px solid var(--line)">' + (qual ? 'Qualified: at least 3 games. Shooting % also needs 20 FG, 10 3PT or 10 FT attempts.' : 'Showing everyone, including players with very few games.') + '</div></div>';
    h += '<div class="card"><div><h2>Category Leaders</h2><div class="sub">Tap one to see the full list</div></div><div class="tiles two">' +
      CATS.map((c) => { const b = rank(c)[0]; return '<a class="tile" ' + tog({ cat: c.k === 'pts' ? null : c.k }) + ' style="border:1px solid ' + (c.k === cat.k ? 'var(--acc)' : 'transparent') + '"><span class="l">' + esc(c.long) + '</span><span class="v">' + (b ? show(c, b.v) : '–') + '</span><span class="s" style="font-weight:600;color:var(--text)">' + (b ? esc(D.players[b.p.pid].name) : 'Nobody qualifies') + '</span></a>'; }).join('') + '</div></div>';
    h += '</div>';
    return shell(team, h, 'leaders', team);
  };

  // ---------- records
  VIEWS.records = function () {
    const team = D.teams[qv('team')] ? qv('team') : 'all';
    const who = qv('who', 'player'), scope = qv('scope', 'game');
    const base = D.games.filter((g) => team === 'all' || g.t === team);
    const seasons = seasonsOf(base);
    const season = scope === 'career' || seasons.indexOf(qv('season')) < 0 ? 'all' : qv('season');
    const phase = qv('phase', 'all');
    const G = filterGames({ team, season, phase });
    const by = (arr, f, asc) => arr.slice().sort((a, b) => (asc ? f(a) - f(b) : f(b) - f(a)));
    const gameSub = (g) => vsName(g) + ' · ' + fmtDY(g.date) + ' · ' + D.teams[g.t].short;
    const gameLink = (g) => href(['game', g.t, g.id], {});
    const rec = (title, items) => (items.length ? { title, items: items.slice(0, 3) } : null);
    let recs = [];

    if (who === 'player' && scope === 'game') {
      const L = linesOf(G);
      const pg = (title, f, filt, show) => rec(title, by(filt ? L.filter(filt) : L, f).map((l) => ({ name: D.players[l.p].name, sub: (show ? l.fgm + '/' + l.fga + ' · ' : '') + gameSub(l.g), val: show ? show(l) : String(f(l)), link: gameLink(l.g) })));
      recs = [pg('Most points', (l) => l.pts), pg('Most rebounds', (l) => l.reb), pg('Most assists', (l) => l.ast), pg('Most steals', (l) => l.stl),
        pg('Most blocks', (l) => l.blk), pg('Most 3 pointers', (l) => l.tpm), pg('Most offensive rebounds', (l) => l.oreb), pg('Most field goals', (l) => l.fgm),
        pg('Most free throws', (l) => l.ftm), pg('Most PTS + REB + AST', (l) => lineVal('pra', l)),
        pg('Best FG% (8+ attempts)', (l) => l.fgm / l.fga, (l) => l.fga >= 8, (l) => Math.round((l.fgm / l.fga) * 100) + '%')];
    } else if (who === 'player') {
      const groups = {};
      linesOf(G).forEach((l) => { const key = scope === 'season' ? l.p + '|' + l.g.s : l.p; (groups[key] = groups[key] || { pid: l.p, s: l.g.s, lines: [] }).lines.push(l); });
      const P = Object.values(groups).map((x) => ({ pid: x.pid, s: x.s, S: agg(x.lines), tm: D.teamIds.filter((t) => x.lines.some((l) => l.g.t === t)).map((t) => D.teams[t].short).join(' + ') }));
      const sub = (x) => (scope === 'season' ? D.seasonName(x.s) + ' · ' : '') + x.tm + ' · ' + x.S.n + ' GP';
      const pr = (title, f, show, minGp) => rec(title, by(P.filter((x) => x.S.n >= (minGp || 1)), f).map((x) => ({ name: D.players[x.pid].name, sub: sub(x), val: show(f(x)), link: href(['player', x.pid], { season: scope === 'season' ? x.s : null }) })));
      const one = (v) => f1(v), int = (v) => String(v), pc = (v) => f1(v) + '%';
      if (scope === 'season') {
        recs = [pr('Highest points per game', (x) => metric('pts', x.S), one, 3), pr('Highest rebounds per game', (x) => metric('reb', x.S), one, 3), pr('Highest assists per game', (x) => metric('ast', x.S), one, 3),
          pr('Most points in a season', (x) => x.S.pts, int), pr('Most rebounds in a season', (x) => x.S.reb, int), pr('Most assists in a season', (x) => x.S.ast, int),
          pr('Most 3 pointers in a season', (x) => x.S.tpm, int), pr('Most steals in a season', (x) => x.S.stl, int), pr('Most blocks in a season', (x) => x.S.blk, int),
          pr('Best FG% in a season (30+ att)', (x) => (x.S.fga >= 30 ? metric('fgp', x.S) : 0), pc, 3), pr('Most games in a season', (x) => x.S.n, int)];
      } else {
        recs = [pr('Most career points', (x) => x.S.pts, int), pr('Most career rebounds', (x) => x.S.reb, int), pr('Most career assists', (x) => x.S.ast, int),
          pr('Most career 3 pointers', (x) => x.S.tpm, int), pr('Most career steals', (x) => x.S.stl, int), pr('Most career blocks', (x) => x.S.blk, int),
          pr('Most games played', (x) => x.S.n, int), pr('Best career PPG (8+ GP)', (x) => metric('pts', x.S), one, 8), pr('Best career FG% (8+ GP)', (x) => metric('fgp', x.S), pc, 8)];
      }
    } else if (scope === 'game') {
      const T = G.map((g) => ({ g, S: agg(g.lines) }));
      const full = T.filter((x) => !D.teams[x.g.t].partialStats);
      const tr = (title, arr, f, show, asc, filt) => rec(title, by(filt ? arr.filter(filt) : arr, f, asc).map((x) => ({ name: D.teams[x.g.t].name, sub: (x.g.win ? 'W ' : 'L ') + x.g.us + '–' + x.g.them + ' ' + gameSub(x.g), val: show(f(x)), link: gameLink(x.g) })));
      const int = (v) => String(v);
      recs = [tr('Most points scored', T, (x) => x.g.us, int), tr('Fewest points allowed', T, (x) => x.g.them, int, true),
        tr('Biggest win', T, (x) => x.g.us - x.g.them, (v) => '+' + v, false, (x) => x.g.win), tr('Most points in a loss', T, (x) => x.g.us, int, false, (x) => !x.g.win),
        tr('Most 3 pointers', full, (x) => x.S.tpm, int), tr('Most assists', full, (x) => x.S.ast, int), tr('Most rebounds', full, (x) => x.S.reb, int),
        tr('Most steals', full, (x) => x.S.stl, int), tr('Best team FG%', full, (x) => metric('fgp', x.S), (v) => f1(v) + '%')];
    } else {
      const groups = {};
      G.forEach((g) => { const key = scope === 'season' ? g.t + '|' + g.s : g.t; (groups[key] = groups[key] || { t: g.t, s: g.s, games: [] }).games.push(g); });
      const TT = Object.values(groups).map((x) => {
        const gs = x.games, n = gs.length, w = gs.filter((g) => g.win).length;
        let best = 0, cur = 0; gs.forEach((g) => { if (g.win) { cur++; best = Math.max(best, cur); } else cur = 0; });
        return { t: x.t, s: x.s, n, w, pf: gs.reduce((a, g) => a + g.us, 0) / n, pa: gs.reduce((a, g) => a + g.them, 0) / n, streak: best, pow: gs.filter((g) => g.po && g.win).length };
      });
      const sub = (x) => (scope === 'season' ? D.seasonName(x.s) : 'All-time') + ' · ' + x.w + '–' + (x.n - x.w);
      const tt = (title, f, show, asc) => rec(title, by(TT, f, asc).map((x) => ({ name: D.teams[x.t].name, sub: sub(x), val: show(f(x)), link: href(['team', x.t], { season: scope === 'season' ? x.s : 'all' }) })));
      const one = (v) => f1(v), int = (v) => String(v);
      recs = [tt('Best win %', (x) => (x.w / x.n) * 100, (v) => v.toFixed(0) + '%'), tt('Most wins', (x) => x.w, int), tt('Most points per game', (x) => x.pf, one),
        tt('Best defence (points allowed)', (x) => x.pa, one, true), tt('Best point differential', (x) => x.pf - x.pa, (v) => (v >= 0 ? '+' : '') + f1(v)),
        tt('Longest winning streak', (x) => x.streak, int), tt('Most playoff wins', (x) => x.pow, int)];
    }
    recs = recs.filter(Boolean);

    let h = '<header class="hero"><div class="hero-top"><h1>Records</h1>' + themeBtn() + '</div><div class="hero-seg">' +
      [['all', 'All Teams']].concat(D.teamIds.map((t) => [t, D.teams[t].short === 'CC' ? 'Chuckers' : D.teams[t].name])).map((x) => '<a class="' + (team === x[0] ? 'on' : '') + '" ' + tog({ team: x[0] === 'all' ? null : x[0], season: null }) + '>' + esc(x[1]) + '</a>').join('') + '</div></header>';
    h += '<section class="filters">' + seg([['player', 'Player'], ['team', 'Team']].map((x) => ({ label: x[1], on: who === x[0], attr: tog({ who: x[0] === 'player' ? null : x[0] }) }))) +
      seg([['game', 'Single game'], ['season', 'Season'], ['career', 'All-time']].map((x) => ({ label: x[1], on: scope === x[0], attr: tog({ scope: x[0] === 'game' ? null : x[0] }) })));
    if (scope !== 'career') h += '<div class="scroller">' + chips([{ label: 'All seasons', on: season === 'all', attr: tog({ season: null }) }].concat(seasons.slice().reverse().map((k) => ({ label: D.seasonName(k), on: season === k, attr: tog({ season: k }) })))) + '</div>';
    h += '<div class="chips">' + chips([['all', 'Reg + Playoffs'], ['reg', 'Regular'], ['po', 'Playoffs']].map((x) => ({ label: x[1], on: phase === x[0], attr: tog({ phase: x[0] === 'all' ? null : x[0] }) }))) + '</div>' +
      '<div class="scope">' + (who === 'player' ? 'Player records' : 'Team records') + ' · ' + (team === 'all' ? 'All teams' : esc(D.teams[team].name)) + ' · ' + (season === 'all' ? 'All seasons' : esc(D.seasonName(season))) + ' · ' + G.length + ' games</div></section>';
    h += '<div class="wrap">' + (recs.length ? '' : '<div class="empty">No games match these filters yet.</div>') + recs.map((r) => {
      const t = r.items[0];
      return '<div class="rec"><a class="top" href="' + esc(t.link) + '"><span class="trophy">' + ICON.trophy + '</span><span style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0"><span class="note small" style="font-weight:700;letter-spacing:.08em">' + esc(r.title.toUpperCase()) + '</span>' +
        '<b style="font-size:16px">' + esc(t.name) + '</b><span class="note small">' + esc(t.sub) + '</span></span><span class="val">' + esc(t.val) + '</span></a>' +
        r.items.slice(1).map((x, i) => '<a class="lrow" href="' + esc(x.link) + '"><span style="width:44px;text-align:center" class="rank">' + (i + 2) + '</span><span class="grow" style="gap:0"><span style="font-size:14px;font-weight:600">' + esc(x.name) + '</span><span class="note small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(x.sub) + '</span></span><span class="big" style="font-size:22px">' + esc(x.val) + '</span></a>').join('') + '</div>';
    }).join('');
    h += '<div class="note small" style="padding:4px">' + (who === 'player' && scope !== 'game' ? 'All Teams combines a player’s games across every team. Pick a team to see records with that team only.' : who === 'team' && scope === 'game' ? 'Team stat records leave out Chuckers, where only some players are tracked.' : 'Tap a record to open the game or page behind it.') + '</div></div>';
    return shell(team, h, 'records', team);
  };

  // ---------- games list
  VIEWS.games = function () {
    const team = D.teams[qv('team')] ? qv('team') : 'all';
    const base = D.games.filter((g) => team === 'all' || g.t === team);
    const seasons = seasonsOf(base);
    const season = qv('season') === 'all' ? 'all' : seasons.indexOf(qv('season')) >= 0 ? qv('season') : seasons[seasons.length - 1] || 'all';
    const phase = qv('phase', 'all'), res = qv('res', 'all');
    const G = filterGames({ team, season, phase }).filter((g) => res === 'all' || (res === 'w' ? g.win : !g.win));
    const w = G.filter((g) => g.win).length;
    let h = '<header class="hero"><div class="hero-top"><h1>Games</h1>' + themeBtn() + '</div><div class="hero-seg">' +
      [['all', 'All Teams']].concat(D.teamIds.map((t) => [t, D.teams[t].short === 'CC' ? 'Chuckers' : D.teams[t].name])).map((x) => '<a class="' + (team === x[0] ? 'on' : '') + '" ' + tog({ team: x[0] === 'all' ? null : x[0], season: null }) + '>' + esc(x[1]) + '</a>').join('') + '</div></header>';
    h += filterBlock({ seasons, season, phase }).replace('</section>', '') +
      '<div class="chips">' + chips([['all', 'All results'], ['w', 'Wins'], ['l', 'Losses']].map((x) => ({ label: x[1], on: res === x[0], attr: tog({ res: x[0] === 'all' ? null : x[0] }) }))) + '</div>' +
      '<div class="tiles">' + tile(w + '–' + (G.length - w), 'Record') + tile(G.length ? f1(G.reduce((a, g) => a + g.us, 0) / G.length) : '–', 'Pts for') + tile(G.length ? f1(G.reduce((a, g) => a + g.them, 0) / G.length) : '–', 'Pts against') + '</div></section>';
    h += '<div class="wrap">';
    const months = [];
    G.slice().reverse().forEach((g) => {
      const key = g.date.getFullYear() + '-' + g.date.getMonth();
      let m = months[months.length - 1];
      if (!m || m.key !== key) { m = { key, label: MONTHS[g.date.getMonth()] + ' ' + g.date.getFullYear(), games: [] }; months.push(m); }
      m.games.push(g);
    });
    h += months.map((m) => {
      const mw = m.games.filter((g) => g.win).length;
      return '<div class="card list" style="padding:16px 16px 4px"><div class="head" style="margin-bottom:8px"><h2 style="font-size:16px">' + m.label + '</h2><span class="note small">' + mw + '–' + (m.games.length - mw) + '</span></div>' +
        m.games.map((g) => {
          const top = g.lines.slice().sort((a, b) => b.pts - a.pts)[0];
          return '<a class="lrow" style="min-height:68px" href="' + href(['game', g.t, g.id], {}) + '"><span class="daybox"><b>' + g.date.getDate() + '</b><span>' + WD[g.date.getDay()] + '</span></span>' +
            '<span class="grow" style="gap:3px"><span style="display:flex;align-items:center;gap:6px;min-width:0"><span class="tag" style="background:' + D.teams[g.t].color + '">' + D.teams[g.t].short + '</span><span style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(vsName(g)) + '</span>' +
            (g.po ? '<span style="font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--acc)">PLAYOFF</span>' : '') + '</span><span class="note small">' + (top ? 'Top: ' + esc(D.players[top.p].name) + ' · ' + top.pts + ' pts' : '') + '</span></span>' +
            '<span style="display:flex;align-items:center;gap:8px"><span class="big" style="font-size:22px;white-space:nowrap">' + g.us + '–' + g.them + '</span><span class="wl ' + wlClass(g) + '" style="width:26px;height:26px">' + (g.win ? 'W' : 'L') + '</span></span></a>';
        }).join('') + '</div>';
    }).join('') || '<div class="empty">No games match these filters.</div>';
    h += '</div>';
    return shell(team, h, 'games', team);
  };

  // ---------- box score
  VIEWS.game = function () {
    const g = D.byId[R.path[1] + '/' + R.path[2]];
    if (!g) return notFound();
    const T = D.teams[g.t];
    const S = agg(g.lines);
    const teamGames = D.games.filter((x) => x.t === g.t);
    const i = teamGames.indexOf(g), prev = teamGames[i - 1], next = teamGames[i + 1];
    const lead = (key, lbl) => {
      const b = g.lines.slice().sort((a, c) => lineVal(key, c) - lineVal(key, a))[0];
      return b ? '<a class="lrow nob" style="min-height:52px" href="' + href(['player', b.p], { team: g.t }) + '">' + avatar(b.p, 's40', g.t) + '<span class="grow"><b style="font-size:14px">' + esc(D.players[b.p].name) + '</b><span class="note small">' + b.pts + ' pts · ' + b.reb + ' reb · ' + b.ast + ' ast · ' + b.fgm + '/' + b.fga + ' FG</span></span>' +
        '<span style="display:flex;flex-direction:column;align-items:flex-end"><span class="big" style="font-size:28px;line-height:1">' + lineVal(key, b) + '</span><span class="note small" style="font-weight:700">' + lbl + '</span></span></a>' : '';
    };
    let h = '<header class="hero" style="gap:18px"><div class="hero-top"><a class="hbtn" href="' + href(['games'], { team: g.t, season: g.s }) + '">' + ICON.back + 'All games</a><span class="kicker">' + (g.po ? 'PLAYOFF · ' : '') + esc(D.seasonName(g.s).toUpperCase()) + '</span></div>' +
      '<div class="board"><div>' + logoSq(g.t, 'border:2px solid rgba(255,255,255,.6)') + '<a href="' + href(['team', g.t], { season: g.s }) + '" style="color:#fff;text-decoration:none">' + esc(T.name) + '</a></div>' +
      '<div><div class="score">' + g.us + '<i>–</i>' + g.them + '</div><span class="resbadge" style="background:var(--' + (g.win ? 'win' : 'loss') + '-bg)">' + (g.win ? 'WIN' : 'LOSS') + '</span></div>' +
      '<div><span class="sq" style="background:rgba(0,0,0,.25);color:#fff">' + esc(initials(g.o)) + '</span>' + esc(g.o) + '</div></div>' +
      '<div style="text-align:center;font-size:13px;opacity:.92">' + fmtDY(g.date) + ' · ' + (g.home ? 'Home' : 'Away') + '</div></header>';
    h += '<div class="wrap" style="padding-top:16px"><div class="grid2"><a class="pbtn' + (prev ? '' : ' off') + '" href="' + (prev ? href(['game', g.t, prev.id], {}) : '#') + '">' + (prev ? 'Previous · ' + esc(prev.o) : 'No earlier game') + '</a>' +
      '<a class="pbtn' + (next ? '' : ' off') + '" href="' + (next ? href(['game', g.t, next.id], {}) : '#') + '">' + (next ? 'Next · ' + esc(next.o) : 'No later game') + '</a></div>';
    h += '<div class="card" style="gap:6px"><h2 style="font-size:18px;margin-bottom:6px">Game Leaders</h2>' + lead('pts', 'PTS') + lead('reb', 'REB') + lead('ast', 'AST') + '</div>';
    const cols = '140px repeat(9, 38px) repeat(3, 50px) 46px';
    const cells = (x) => [x.pts, x.reb, x.oreb, x.dreb, x.ast, x.stl, x.blk, x.to, x.pf, x.fgm + '-' + x.fga, x.tpm + '-' + x.tpa, x.ftm + '-' + x.fta, x.fga ? Math.round((x.fgm / x.fga) * 100) : '–'].map((v, k) => (k === 0 ? '<b>' + v + '</b>' : '<span>' + v + '</span>')).join('');
    h += '<div class="card flush" style="gap:10px"><div class="px"><h2 style="font-size:18px">Box Score</h2><div class="note small">Swipe sideways for every column · tap a player for their page</div></div><div class="xscroll"><div>' +
      '<div class="trow th" style="grid-template-columns:' + cols + '"><span class="stick">PLAYER</span><span>PTS</span><span>REB</span><span>OR</span><span>DR</span><span>AST</span><span>STL</span><span>BLK</span><span>TO</span><span>PF</span><span>FG</span><span>3P</span><span>FT</span><span>FG%</span></div>' +
      g.lines.slice().sort((a, b) => b.pts - a.pts).map((l) => '<a class="trow" style="grid-template-columns:' + cols + '" href="' + href(['player', l.p], { team: g.t }) + '"><span class="stick"><span><span class="t1" style="font-size:13px;max-width:116px">' + esc(D.players[l.p].name) + '</span><span class="t2" style="font-size:11px">#' + esc(l.n) + (D.players[l.p].position ? ' · ' + esc(D.players[l.p].position) : '') + '</span></span></span>' + cells(l) + '</a>').join('') +
      '<div class="trow strong" style="grid-template-columns:' + cols + '"><span class="stick"><span><span class="t1" style="font-size:13px">' + (T.partialStats ? 'Tracked totals' : 'Team totals') + '</span><span class="t2" style="font-size:11px">' + g.lines.length + ' players</span></span></span>' + cells(S) + '</div>' +
      '</div></div>' + (g.dnp.length ? '<div class="note small px">Did not play: ' + g.dnp.map((d) => esc((D.players[d.p] || { name: d.p }).name) + ' (#' + esc(d.n) + ')').join(', ') + '</div>' : '') + '</div>';
    h += '<div class="card"><h2 style="font-size:18px">Team Shooting</h2>' + shotBar('Field goals', S.fgm, S.fga, S.fgm + '/' + S.fga) + shotBar('3 pointers', S.tpm, S.tpa, S.tpm + '/' + S.tpa) + shotBar('Free throws', S.ftm, S.fta, S.ftm + '/' + S.fta) +
      '<div class="tiles">' + tile(S.reb, 'Reb') + tile(S.oreb + ' / ' + S.dreb, 'Off / Def') + tile(S.ast, 'Ast') + tile(S.stl, 'Stl') + tile(S.blk, 'Blk') + tile(S.to, 'TO') + '</div>' +
      '<div class="note small">' + (T.partialStats ? esc(T.partialNote) + ' ' : '') + 'Opponent stats aren’t tracked, only their final score.</div></div></div>';
    return shell(g.t, h, 'games', g.t);
  };

  function notFound() {
    return shell('all', '<header class="hero"><div class="hero-top"><a class="hbtn" href="#/">' + ICON.back + 'Home</a>' + themeBtn() + '</div><h1>Not found</h1></header><div class="wrap" style="padding-top:16px"><div class="empty">That page doesn’t exist. It may have been renamed.</div></div>', 'home', null);
  }

  // ------------------------------------------------------------------ render + events
  let lastPath = null;
  function render() {
    parseHash();
    const view = VIEWS[R.path[0] || 'home'] || notFound;
    const samePage = lastPath === R.path.join('/');
    const y = window.scrollY;
    $app.innerHTML = view();
    lastPath = R.path.join('/');
    if (samePage) window.scrollTo(0, y); else window.scrollTo(0, 0);
    const p = R.path[0];
    document.title = (p === 'player' && D.players[R.path[1]] ? D.players[R.path[1]].name + ' · ' : p === 'team' && D.teams[R.path[1]] ? D.teams[R.path[1]].name + ' · ' : p ? p.charAt(0).toUpperCase() + p.slice(1) + ' · ' : '') + 'MyStatPro';
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-theme-toggle]');
    if (t) {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('msp-theme', next); } catch (err) { /* storage unavailable */ }
      render();
      return;
    }
    const m = e.target.closest('[data-menu-toggle]');
    if (m) {
      const menu = document.querySelector('[data-menu]');
      menu.classList.toggle('hidden');
      m.setAttribute('aria-expanded', String(!menu.classList.contains('hidden')));
      if (!menu.classList.contains('hidden')) menu.querySelector('input').focus();
      return;
    }
    const openMenu = document.querySelector('[data-menu]:not(.hidden)');
    if (openMenu && !e.target.closest('[data-menu]')) openMenu.classList.add('hidden');
    const a = e.target.closest('a[data-r]');
    if (a && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      location.replace(a.getAttribute('href'));
    }
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('select[data-param]');
    if (s) location.replace(here({ [s.dataset.param]: s.value, sel: null }));
  });
  document.addEventListener('input', (e) => {
    const s = e.target.closest('[data-search]');
    if (!s) return;
    const q = s.value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll(s.dataset.search).forEach((el) => {
      const hit = !q || (el.dataset.name || '').indexOf(q) >= 0;
      el.classList.toggle('hidden', !hit);
      if (hit) shown++;
    });
    const empty = document.querySelector('[data-search-empty]');
    if (empty) empty.classList.toggle('hidden', shown > 0);
  });
  window.addEventListener('hashchange', render);

  fetch('data/bundle.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((b) => { loadData(b); render(); })
    .catch((err) => { $app.innerHTML = '<div class="error">Couldn’t load the stats (' + esc(err.message) + '). If you opened this file directly, run it through a web server or GitHub Pages instead.</div>'; });
})();
