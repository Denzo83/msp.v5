/* MyStat Tracker: enter game stats on a phone while watching the replay.
   Every tap is an event in game.events; all stats are worked out by replaying them,
   so undo and delete are just "remove the event". Saved in localStorage after every tap. */
'use strict';

const ROOT = document.getElementById('app');
const K_GAMES = 'mstat.games.v1', K_BUNDLE = 'mstat.bundle.v1';
const APP_VERSION = 1;

const FALLBACK = {
  teams: {
    'pretty-good': { name: 'Pretty Good', short: 'PG' },
    'chuckers-chuckers': { name: 'Chuckers Chuckers', short: 'CC', partialStats: true },
    'all-stars': { name: 'All Stars', short: 'AS' }
  },
  players: {}, rosters: {}, nums: {}, seasons: [], opponents: [], fetched: 0
};
const DEFAULT_TRACKED = { 'chuckers-chuckers': ['findlay-wendtman', 'jackson-neaves'] };

function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

let DB = load(K_GAMES, { games: {}, order: [] });
let BUNDLE = load(K_BUNDLE, null) || FALLBACK;
let ui = { screen: 'home', gid: null, sel: null, pend: null, draft: null, off: [], on: [], who: 'all', toast: null, sheet: null, setup: null, logFilter: 'all' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sgn = (n) => (n > 0 ? '+' : '') + n;
const fmtClock = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pct = (m, a) => (a ? Math.round(m / a * 100) + '%' : '–');

function persist() {
  const g = cur();
  if (g) g.updated = Date.now();
  if (!store(K_GAMES, DB)) toast('Could not save on this phone. Export the game now so nothing is lost.');
}
function cur() { return ui.gid ? DB.games[ui.gid] : null; }

/* ---------- roster data from the v5 site ---------- */
function slim(b) {
  const counts = {}, nums = {};
  (b.games || []).slice().sort((a, c) => (a.d < c.d ? -1 : 1)).forEach((g) => {
    counts[g.t] = counts[g.t] || {}; nums[g.t] = nums[g.t] || {};
    (g.L || []).concat(g.D || []).forEach((l) => {
      counts[g.t][l[0]] = (counts[g.t][l[0]] || 0) + 1;
      if (l[1] != null && l[1] !== '') nums[g.t][l[0]] = String(l[1]);
    });
  });
  const rosters = {};
  Object.keys(counts).forEach((t) => { rosters[t] = Object.keys(counts[t]).sort((a, c) => counts[t][c] - counts[t][a]); });
  const players = {};
  Object.entries(b.players || {}).forEach(([id, p]) => { players[id] = { name: p.name, short: p.short }; });
  const teams = {};
  Object.entries(b.teams || {}).forEach(([id, t]) => { teams[id] = { name: t.name, short: t.short, partialStats: !!t.partialStats }; });
  const opponents = Array.from(new Set(Object.values(b.opponents || {}))).sort((a, c) => a.localeCompare(c));
  return { teams, players, rosters, nums, seasons: b.seasons || [], opponents, fetched: Date.now() };
}
function refreshBundle(manual) {
  return fetch('../data/bundle.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((b) => { BUNDLE = slim(b); store(K_BUNDLE, BUNDLE); if (manual) toast('Players and opponents updated from the site'); render(); })
    .catch(() => { if (manual) toast('Could not reach the site. Using the saved player list.'); });
}

/* ---------- court geometry (FIBA half court in decimetres, basket near the top) ---------- */
const BX = 75, BY = 15.75;
function zoneOf(x, y) {
  const dx = x - BX, dy = y - BY, d = Math.sqrt(dx * dx + dy * dy);
  const ang = Math.atan2(dx, dy) * 180 / Math.PI, side = dx < 0 ? 'Left' : 'Right';
  const corner3 = (x < 9 || x > 141) && y <= 29.9;
  if (corner3 || (y > 29.9 && d > 67.5)) {
    if (corner3) return { zone: side + ' corner 3', g: 'c3', three: true };
    if (Math.abs(ang) < 22) return { zone: 'Top of the arc 3', g: 't3', three: true };
    return { zone: side + ' wing 3', g: 'w3', three: true };
  }
  if (d <= 12.5) return { zone: 'At the rim', g: 'paint', three: false, paint: true };
  if (x >= 50.5 && x <= 99.5 && y <= 58) return { zone: 'Paint', g: 'paint', three: false, paint: true };
  if (y <= 29.9) return { zone: side + ' baseline mid-range', g: 'mid', three: false };
  if (Math.abs(ang) < 22) return { zone: 'Top of the key mid-range', g: 'mid', three: false };
  return { zone: side + ' elbow mid-range', g: 'mid', three: false };
}
const ZGROUPS = [['paint', 'At the rim and paint'], ['mid', 'Mid-range'], ['c3', 'Corner 3'], ['w3', 'Wing 3'], ['t3', 'Top of the arc 3']];
const COURT_LINES = '<rect x="50.5" y="0" width="49" height="58" style="fill:#1C2029"></rect>' +
  '<path d="M9 0 L9 29.9 A67.5 67.5 0 0 0 141 29.9 L141 0"></path><path d="M57 58 A18 18 0 0 0 93 58"></path>' +
  '<path d="M62.5 15.75 A12.5 12.5 0 0 0 87.5 15.75"></path><path d="M66 12 L84 12" style="stroke:#6B7385;stroke-width:1.2"></path>' +
  '<circle cx="75" cy="15.75" r="2.25" style="stroke:#F59E0B;stroke-width:0.9"></circle>';

/* ---------- names ---------- */
function rosterEntry(g, id) { return g.roster.find((r) => r.id === id) || { id, name: id }; }
function pname(g, id) { if (id === 'tm') return 'Teammate'; return rosterEntry(g, id).name; }
function first(g, id) { return pname(g, id).split(' ')[0]; }
function rest(g, id) { return pname(g, id).split(' ').slice(1).join(' '); }
function shortN(g, id) { if (id === 'tm') return 'teammate'; const n = pname(g, id).split(' '); return n.length > 1 ? n[0] + ' ' + n[n.length - 1].charAt(0) + '.' : n[0]; }
function teamName(id) { return ((BUNDLE.teams[id] || FALLBACK.teams[id]) || { name: id }).name; }
function teamShort(id) { const t = BUNDLE.teams[id] || FALLBACK.teams[id]; return t ? t.name : id; }
function periodLabel(g, q) { return g.periods === 2 ? 'H' + q : 'Q' + q; }

/* ---------- clock ---------- */
function remaining(g) { const c = g.clock; return c.running ? Math.max(0, c.rem - (Date.now() - c.at) / 1000) : c.rem; }
function setClock(g, rem, running) { g.clock.rem = rem; g.clock.running = running; g.clock.at = Date.now(); }

/* ---------- replay: works out every stat from the events ---------- */
function blank() { return { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, pf: 0, stl: 0, to: 0, blk: 0, ast: 0, pts: 0, pm: 0, stint: 0, sec: 0, dunk: 0 }; }
function replay(g, upto) {
  const P = {};
  g.roster.forEach((r) => { P[r.id] = blank(); });
  const S = { us: 0, them: 0, P, court: [], starters: [], q: 1, tq: 1, tc: g.len * 60, sc: null, pot: false, fouls: {}, qs: {},
    lineups: {}, lineupPm: 0, flow: [0], ties: 0, changes: 0, leader: 0, maxLead: 0, maxDef: 0, runT: null, runP: 0, bestRun: { us: 0, them: 0 },
    x: { paint: 0, sc: 0, fb: 0, pot: 0, astFg: 0, fgm: 0, bench: 0, rest: 0 }, shots: [], after: [] };
  const lkey = () => S.court.slice().sort().join('|');
  const lineup = () => { const k = lkey(); if (!S.lineups[k]) S.lineups[k] = { ids: S.court.slice(), sec: 0, pf: 0, pa: 0 }; return S.lineups[k]; };
  const advance = (q, c) => {
    if (!g.clockOn || c == null) return;
    if (q !== S.tq) { S.tq = q; S.tc = c; return; }
    const dt = S.tc - c;
    if (dt > 0 && S.court.length) { S.court.forEach((id) => { if (P[id]) P[id].sec += dt; }); lineup().sec += dt; }
    S.tc = c;
  };
  const score = (pts, mine, q) => {
    if (mine) S.us += pts; else S.them += pts;
    S.qs[q] = S.qs[q] || { us: 0, them: 0 };
    S.qs[q][mine ? 'us' : 'them'] += pts;
    const d = mine ? pts : -pts;
    S.court.forEach((id) => { if (P[id]) { P[id].pm += d; P[id].stint += d; } });
    if (S.court.length) { const L = lineup(); if (mine) L.pf += pts; else L.pa += pts; }
    S.lineupPm += d;
    const m = S.us - S.them, now = m > 0 ? 1 : (m < 0 ? -1 : 0);
    if (now === 0) S.ties++; else if (S.leader !== 0 && now !== S.leader) S.changes++;
    if (now !== 0) S.leader = now;
    S.maxLead = Math.max(S.maxLead, m); S.maxDef = Math.max(S.maxDef, -m);
    const side = mine ? 'us' : 'them';
    if (S.runT === side) S.runP += pts; else { S.runT = side; S.runP = pts; }
    S.bestRun[side] = Math.max(S.bestRun[side], S.runP);
    S.flow.push(m);
  };
  const evs = upto == null ? g.events : g.events.slice(0, upto);
  evs.forEach((e) => {
    advance(e.q, e.c);
    const p = e.p && P[e.p] ? P[e.p] : null;
    switch (e.t) {
      case 'start': S.court = e.on.slice(); S.starters = e.on.slice(); break;
      case 'sub':
        S.court = S.court.filter((id) => e.out.indexOf(id) < 0).concat(e.in.filter((id) => S.court.indexOf(id) < 0));
        e.in.forEach((id) => { if (P[id]) P[id].stint = 0; });
        S.lineupPm = 0; break;
      case 'addplayer': if (!P[e.id]) P[e.id] = blank(); break;
      case 'shot':
        if (!p) break;
        p.fga++; if (e.pts === 3) p.tpa++;
        if (e.made) {
          p.fgm++; if (e.pts === 3) p.tpm++; p.pts += e.pts; S.x.fgm++;
          if (e.st === 'Dunk') p.dunk++;
          if (e.ast && e.ast !== 'tm' && P[e.ast]) P[e.ast].ast++;
          if (e.ast) S.x.astFg++;
          if (e.zg === 'paint') S.x.paint += e.pts;
          if (e.sc) S.x.sc += e.pts;
          if (e.fb) S.x.fb += e.pts;
          if (e.pot) S.x.pot += e.pts;
          if (S.starters.indexOf(e.p) < 0) S.x.bench += e.pts;
          score(e.pts, true, e.q);
          S.sc = null; S.pot = false;
        }
        if (e.x != null) S.shots.push({ p: e.p, x: e.x, y: e.y, made: e.made, pts: e.pts, g: e.zg });
        break;
      case 'ft':
        if (!p) break;
        p.fta++;
        if (e.made) {
          p.ftm++; p.pts++;
          if (e.sc) S.x.sc++;
          if (e.pot) S.x.pot++;
          if (S.starters.indexOf(e.p) < 0) S.x.bench++;
          score(1, true, e.q);
        }
        break;
      case 'oreb': if (p) p.oreb++; S.sc = e.p; break;
      case 'dreb': if (p) p.dreb++; S.sc = null; S.pot = false; break;
      case 'stl': if (p) p.stl++; S.pot = true; S.sc = null; break;
      case 'blk': if (p) p.blk++; break;
      case 'to': if (p) p.to++; S.sc = null; S.pot = false; break;
      case 'foul': if (p) p.pf++; S.fouls[e.q] = (S.fouls[e.q] || 0) + 1; break;
      case 'teamfoul': S.fouls[e.q] = (S.fouls[e.q] || 0) + 1; break;
      case 'opp': score(e.pts, false, e.q); S.sc = null; S.pot = false; break;
      case 'oppto': S.pot = true; S.sc = null; break;
      case 'rest': if (e.ast && P[e.ast]) P[e.ast].ast++; score(e.pts, true, e.q); S.x.rest += e.pts; if (e.pts > 1) { S.sc = null; S.pot = false; } break;
      case 'period': advance(e.q, 0); S.q = e.next; S.tq = e.next; S.tc = g.len * 60; break;
      default: break;
    }
    S.after.push(S.us + '–' + S.them);
  });
  if (upto == null && g.status === 'live') advance(g.clock.q, Math.round(remaining(g)));
  S.q = g.clock.q;
  return S;
}

/* ---------- event text ---------- */
function describe(g, e) {
  const n = e.p ? pname(g, e.p) : '';
  switch (e.t) {
    case 'start': return 'Starting: ' + e.on.map((id) => pname(g, id)).join(', ');
    case 'sub': return 'Sub: ' + [e.in.length ? e.in.map((id) => pname(g, id)).join(', ') + ' in' : '', e.out.length ? e.out.map((id) => pname(g, id)).join(', ') + ' out' : ''].filter(Boolean).join(' · ');
    case 'addplayer': return 'Added ' + pname(g, e.id) + ' to the roster';
    case 'shot': {
      const t = [];
      if (e.zone) t.push(e.zone);
      if (e.st) t.push(e.st);
      if (e.made) t.push(e.ast ? 'ast ' + shortN(g, e.ast) : 'unassisted');
      if (e.fb) t.push('fast break');
      if (e.sc) t.push('2nd chance');
      if (e.made && e.pot) t.push('off turnover');
      if (e.made && e.and1) t.push('and-1');
      if (!e.made && e.blkd) t.push('blocked');
      return n + ' ' + e.pts + 'PT ' + (e.made ? 'make' : 'miss') + (t.length ? ' · ' + t.join(' · ') : '');
    }
    case 'ft': return n + ' FT ' + (e.made ? 'made' : 'missed') + (e.sc ? ' · 2nd chance' : '');
    case 'oreb': return n + ' offensive rebound';
    case 'dreb': return n + ' defensive rebound';
    case 'stl': return n + ' steal';
    case 'blk': return n + ' block';
    case 'to': return n + ' turnover';
    case 'foul': return n + ' foul';
    case 'teamfoul': return 'Team foul (untracked player)';
    case 'opp': return 'Opponent ' + (e.pts === 1 ? 'free throw' : e.pts + 'PT make');
    case 'oppto': return 'Opponent turnover';
    case 'rest': return 'Rest of team ' + (e.pts === 1 ? 'free throw' : e.pts + 'PT make') + (e.ast ? ' · ast ' + shortN(g, e.ast) : '');
    case 'period': return 'End of ' + periodLabel(g, e.q);
    default: return e.t;
  }
}
const kindOf = (e) => (e.t === 'opp' || e.t === 'oppto' ? 'o' : (e.t === 'sub' || e.t === 'period' || e.t === 'start' || e.t === 'addplayer' ? 's' : ''));
const scoring = (e) => (e.t === 'shot' && e.made) || (e.t === 'ft' && e.made) || e.t === 'opp' || e.t === 'rest';

/* ---------- adding events ---------- */
function add(e) {
  const g = cur();
  e.q = g.clock.q;
  e.c = g.clockOn ? Math.round(remaining(g)) : null;
  e.n = (g.seq = (g.seq || 0) + 1);
  g.events.push(e);
  persist();
}
function undo() {
  const g = cur();
  const i = g.events.length - 1;
  if (i < 1 || g.events[i].t === 'start') { toast('Nothing to undo yet'); return; }
  const e = g.events.pop();
  if (e.t === 'period') { g.clock.q = e.q; setClock(g, 0, false); }
  persist();
  toast('Undone: ' + describe(g, e));
}

/* ---------- icons ---------- */
const I = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" class="ico" style="stroke-width:2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>',
  undo: '<svg width="20" height="20" viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M9 14L4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-3"></path></svg>',
  play: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor"><path d="M8 5l11 7-11 7z"></path></svg>',
  pause: '<svg width="18" height="18" viewBox="0 0 24 24" class="ico" style="stroke-width:3" aria-hidden="true"><path d="M8 5v14M16 5v14"></path></svg>',
  swap: '<svg width="16" height="16" viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M7 4L3 8l4 4"></path><path d="M3 8h14"></path><path d="M17 20l4-4-4-4"></path><path d="M21 16H7"></path></svg>',
  track: '<svg width="22" height="22" viewBox="0 0 24 24" class="ico" style="stroke-width:2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v8M8 12h8"></path></svg>',
  list: '<svg width="22" height="22" viewBox="0 0 24 24" class="ico" style="stroke-width:2" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h0M4.5 12h0M4.5 18h0"></path></svg>',
  table: '<svg width="22" height="22" viewBox="0 0 24 24" class="ico" style="stroke-width:2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18M9 10v10"></path></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" class="ico" style="stroke-width:2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 24 24" class="ico" style="stroke-width:3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
  tick: '<svg width="14" height="14" viewBox="0 0 24 24" class="ico" style="stroke:#fff;stroke-width:3" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" class="ico" style="stroke:#A3ABBA;stroke-width:2.4" aria-hidden="true"><path d="M9 5l7 7-7 7"></path></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" class="ico" style="stroke-width:2.4" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" class="ico" style="stroke-width:2.6" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>'
};

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg) {
  ui.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = null; render(); }, 3500);
  render();
}

/* =================== SCREENS =================== */

function vHome() {
  const games = DB.order.map((id) => DB.games[id]).filter(Boolean);
  const items = games.map((g) => {
    const S = replay(g);
    return '<button class="gitem" data-act="open" data-arg="' + g.id + '"><span class="m"><b>' + esc(teamName(g.team)) + ' vs ' + esc(g.opp) + '</b>' +
      '<span class="muted small">' + esc(g.date) + ' · ' + esc(g.season) + (g.final ? ' · Final' : '') + '</span></span>' +
      '<span class="badge' + (g.status === 'live' ? ' live' : '') + '">' + (g.status === 'live' ? 'In progress' : 'Done') + '</span>' +
      '<span class="sc">' + S.us + '–' + S.them + '</span></button>';
  }).join('');
  const synced = BUNDLE.fetched ? 'Players last loaded ' + new Date(BUNDLE.fetched).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'Players not loaded yet';
  return '<div class="scr"><header class="hdr"><div class="ttl"><span class="kick">MyStatPro</span><span class="big">MyStat Tracker</span></div></header>' +
    '<div class="body"><button class="btn full" data-act="newGame">' + I.plus + 'New game</button>' +
    '<div class="sec"><h2 class="h2">Games on this phone</h2>' + (items ? '<div class="glist">' + items + '</div>' : '<div class="empty">No games yet. Tap New game to start.</div>') + '</div>' +
    '<div class="sec" style="margin-top:auto"><span class="muted small">' + esc(synced) + '. <button class="pill" style="height:30px" data-act="sync">Refresh</button></span>' +
    '<span class="muted small">Everything saves on this phone as you tap. Export each game when you finish so it can go on the site.</span></div></div></div>';
}

/* ---------- setup ---------- */
function newSetup() {
  const seasons = BUNDLE.seasons || [];
  const team = 'pretty-good';
  const s = { team, opp: '', date: today(), season: seasons.length ? seasons[seasons.length - 1].name : '', final: false, venue: 'Court 1', periods: 4, len: 10, clockOn: true, trackAll: true, playing: [], starters: [], extra: [] };
  applyTeamDefaults(s);
  return s;
}
function applyTeamDefaults(s) {
  const t = BUNDLE.teams[s.team] || FALLBACK.teams[s.team] || {};
  s.trackAll = !t.partialStats;
  s.playing = (DEFAULT_TRACKED[s.team] || []).slice();
  s.starters = s.trackAll ? [] : s.playing.slice();
}
function setupRoster(s) {
  const ids = (BUNDLE.rosters[s.team] || []).slice();
  if (!s.trackAll && DEFAULT_TRACKED[s.team]) DEFAULT_TRACKED[s.team].forEach((id) => { if (ids.indexOf(id) < 0) ids.unshift(id); });
  s.extra.forEach((x) => { if (ids.indexOf(x.id) < 0) ids.push(x.id); });
  return ids.map((id) => {
    const x = s.extra.find((e) => e.id === id);
    const p = BUNDLE.players[id];
    return { id, name: x ? x.name : (p ? p.name : id), isNew: x ? !!x.isNew : !p };
  });
}
function vSetup() {
  const s = ui.setup;
  const teams = Object.keys(BUNDLE.teams).length ? BUNDLE.teams : FALLBACK.teams;
  const teamBtns = Object.keys(teams).map((id) => '<button class="chip' + (s.team === id ? ' on' : '') + '" data-act="setTeam" data-arg="' + id + '">' + esc(teams[id].name) + '</button>').join('');
  const opts = (BUNDLE.opponents || []).map((o) => '<option value="' + esc(o) + '"></option>').join('');
  const seasonOpts = (BUNDLE.seasons || []).slice().reverse().map((x) => '<option value="' + esc(x.name) + '"></option>').join('');
  const allNames = Object.values(BUNDLE.players || {}).map((p) => '<option value="' + esc(p.name) + '"></option>').join('');
  const word = s.trackAll ? 'Starter' : 'On court';
  const rows = setupRoster(s).map((r) => {
    const on = s.playing.indexOf(r.id) >= 0, st = s.starters.indexOf(r.id) >= 0;
    return '<div class="rrow' + (on ? '' : ' dim') + '"><button class="pick" data-act="togPlay" data-arg="' + esc(r.id) + '" aria-pressed="' + on + '">' +
      '<span class="box' + (on ? ' on' : '') + '">' + I.tick + '</span><span style="font-size:15px;font-weight:600">' + esc(r.name) + (r.isNew ? ' <span class="badge">new</span>' : '') + '</span></button>' +
      '<button class="st' + (st ? ' on' : '') + '" data-act="togStart" data-arg="' + esc(r.id) + '" aria-pressed="' + st + '"' + (on ? '' : ' disabled') + '>' + word + '</button></div>';
  }).join('');
  const n = s.starters.length, need = Math.min(5, s.playing.length);
  const countText = s.trackAll ? n + ' of ' + need + ' starters picked' : s.playing.length + ' tracked · ' + n + ' on court';
  const tog = (key, label, sub) => '<button class="tog' + (s[key] ? ' on' : '') + '" data-act="setupTog" data-arg="' + key + '" aria-pressed="' + !!s[key] + '"><span class="l"><b>' + label + '</b><span>' + sub + '</span></span><span class="sw"></span></button>';
  return '<div class="scr"><header class="hdr"><button class="round" aria-label="Back" data-act="home">' + I.back + '</button><div class="ttl"><span class="kick">MyStat Tracker</span><span class="big">New game</span></div></header>' +
    '<div class="body" style="gap:20px">' +
    '<div class="sec"><h2 class="h2">Team</h2><div class="g3">' + teamBtns + '</div></div>' +
    '<div class="sec"><label class="h2" for="f-opp">Opponent</label><input id="f-opp" class="field" list="opps" data-bind="opp" value="' + esc(s.opp) + '" placeholder="Opponent name" autocomplete="off"><datalist id="opps">' + opts + '</datalist>' +
    '<span class="muted small">Pick a name you have played before so the spelling matches the site.</span></div>' +
    '<div class="g2"><div class="sec"><label class="h2" for="f-date">Date</label><input id="f-date" class="field" type="date" data-bind="date" value="' + esc(s.date) + '"></div>' +
    '<div class="sec"><label class="h2" for="f-season">Season</label><input id="f-season" class="field" list="seasons" data-bind="season" value="' + esc(s.season) + '" autocomplete="off"><datalist id="seasons">' + seasonOpts + '</datalist></div></div>' +
    '<div class="sec"><h2 class="h2">Court</h2><div class="g3">' + ['Court 1', 'Court 2', 'Court 3'].map((c) => '<button class="chip' + (s.venue === c ? ' on' : '') + '" data-act="setVenue" data-arg="' + c + '">' + c + '</button>').join('') + '</div></div>' +
    '<div class="sec"><h2 class="h2">Format</h2><div class="g2">' +
    '<button class="chip' + (s.periods === 4 ? ' on' : '') + '" data-act="setPeriods" data-arg="4">4 quarters</button><button class="chip' + (s.periods === 2 ? ' on' : '') + '" data-act="setPeriods" data-arg="2">2 halves</button></div>' +
    '<div class="row"><label for="f-len" class="muted" style="flex:1">Minutes per ' + (s.periods === 2 ? 'half' : 'quarter') + '</label><input id="f-len" class="field" style="width:96px;text-align:center" type="number" inputmode="numeric" min="1" max="40" data-bind="len" value="' + s.len + '"></div></div>' +
    '<div class="sec"><h2 class="h2">Options</h2>' +
    tog('final', 'Finals game', 'A semi final or grand final.') +
    tog('clockOn', 'Run a game clock', 'Gives minutes played. Start and pause it along with the replay.') +
    tog('trackAll', 'Track every player', s.trackAll ? 'Every player gets full stats and plus-minus.' : 'Only ticked players get stats. Everyone else scores on the Rest of team buttons so the score stays right.') + '</div>' +
    '<div class="sec"><div class="between"><h2 class="h2">' + (s.trackAll ? 'Who is playing' : 'Tracked players') + '</h2><span class="small" style="font-weight:700;color:' + ((s.trackAll ? n === need && n > 0 : s.playing.length > 0) ? '#5B9BFF' : '#FBBF24') + '">' + countText + '</span></div>' +
    rows +
    '<div class="row" style="margin-top:4px"><input id="f-add" class="field" list="allp" placeholder="Add a player (fill-in or new)" autocomplete="off"><datalist id="allp">' + allNames + '</datalist><button class="btn ghost" style="min-height:50px" data-act="addSetupPlayer">Add</button></div></div>' +
    '<button class="btn full" style="min-height:58px;font-size:17px" data-act="startGame">Start game</button>' +
    '</div></div>';
}

/* ---------- tracking ---------- */
function vTrack() {
  const g = cur(), S = replay(g);
  if (S.court.indexOf(ui.sel) < 0) ui.sel = S.court[0] || null;
  const sel = ui.sel, sp = sel ? S.P[sel] : null;
  const cols = Math.max(2, Math.min(5, S.court.length || 2));
  const tiles = S.court.map((id) => {
    const p = S.P[id], on = id === sel;
    return '<button class="tile' + (on ? ' on' : '') + '" data-act="sel" data-arg="' + esc(id) + '" aria-pressed="' + on + '"><b>' + esc(first(g, id)) + '</b><i>' + esc(rest(g, id)) + '</i><span>' + p.pts + ' pts · ' + p.pf + 'F</span></button>';
  }).join('');
  const dis = sel ? '' : ' disabled';
  const shotBtn = (pts, made, label) => '<button class="shot' + (made ? '' : ' miss') + '" data-act="shot" data-arg="' + pts + (made ? 'm' : 'x') + '"' + dis + ' aria-label="' + label + (made ? ' made' : ' missed') + '"><b>' + label + '</b><span>' + (made ? 'Made' : 'Missed') + '</span></button>';
  const statBtn = (k, label) => '<button class="stat" data-act="stat" data-arg="' + k + '"' + dis + ' aria-label="' + label + '">' + k.toUpperCase() + '</button>';
  const lastE = g.events[g.events.length - 1];
  const clockPart = g.clockOn ?
    '<button class="clock" id="clk" data-act="sheet" data-arg="clock" aria-label="Set the clock">' + fmtClock(remaining(g)) + '</button>' +
    '<button class="play' + (g.clock.running ? ' run' : '') + '" data-act="clockToggle" aria-label="' + (g.clock.running ? 'Pause game clock' : 'Start game clock') + '">' + (g.clock.running ? I.pause : I.play) + '</button>' : '';
  const lu = S.lineupPm, luColor = lu > 0 ? '#5B9BFF' : (lu < 0 ? '#FBBF24' : '#A3ABBA');
  const restRow = g.trackAll ? '' :
    '<div class="sec" style="gap:6px"><h2 class="h2">Rest of team (untracked)</h2><div class="g4">' +
    '<button class="restb" data-act="rest" data-arg="2" aria-label="Rest of team made a 2">+2</button><button class="restb" data-act="rest" data-arg="3" aria-label="Rest of team made a 3">+3</button>' +
    '<button class="restb" data-act="rest" data-arg="1" aria-label="Rest of team made a free throw">+1 FT</button><button class="restb" style="font-size:17px" data-act="teamfoul" aria-label="Team foul by an untracked player">FOUL</button></div></div>';
  const wins = (S.sc ? '<span class="win">2nd-chance window · after ' + esc(shortN(g, S.sc)) + ' OREB</span>' : '') + (S.pot ? '<span class="win o">Points-off-turnover window</span>' : '');
  return '<div class="trk"><header class="thdr"><div class="row" style="justify-content:space-between">' +
    '<button class="round" aria-label="Game menu" data-act="sheet" data-arg="period"><svg width="20" height="20" viewBox="0 0 24 24" class="ico" style="stroke-width:2" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"></path><circle cx="15" cy="7" r="2"></circle><circle cx="9" cy="17" r="2"></circle></svg></button>' +
    '<div class="row"><button class="qbtn" data-act="sheet" data-arg="period">' + periodLabel(g, g.clock.q) + I.down + '</button>' + clockPart + '</div>' +
    '<button class="round" aria-label="Undo last entry" data-act="undo">' + I.undo + '</button></div>' +
    '<div class="board"><div style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="nm">' + esc(teamName(g.team)) + '</span><span class="pts" style="color:#5B9BFF">' + S.us + '</span></div>' +
    '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;padding-bottom:4px"><span class="small muted" style="font-size:11px">Team fouls</span><span style="font-family:var(--disp);font-size:22px;font-weight:700">' + (S.fouls[g.clock.q] || 0) + '</span></div>' +
    '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0"><span class="nm">' + esc(g.opp) + '</span><span class="pts" style="color:#FBBF24">' + S.them + '</span></div></div></header>' +
    '<div class="mid"><div class="pad"><div class="between" style="align-items:center"><div class="row" style="gap:10px;align-items:baseline"><h2 class="h2">On court</h2><span class="small" style="font-weight:700;color:' + luColor + '">Lineup ' + sgn(lu) + '</span></div>' +
    '<button class="subbtn" data-act="goSubs">' + I.swap + 'Subs</button></div>' +
    (tiles ? '<div class="tiles" style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr))">' + tiles + '</div>' : '<div class="empty">No tracked player on the court. Tap Subs to put someone on.</div>') + '</div>' +
    '<div class="pad" style="padding-top:12px"><div class="between"><span style="font-size:16px;font-weight:700">' + (sel ? esc(pname(g, sel)) : 'Pick a player') + '</span>' +
    (sp ? '<span class="small muted">' + sp.pts + ' pts · ' + (sp.oreb + sp.dreb) + ' reb · ' + sp.ast + ' ast · ' + sgn(sp.pm) + '</span>' : '') + '</div>' +
    '<div class="g3">' + shotBtn(2, true, '2PT') + shotBtn(3, true, '3PT') + shotBtn(1, true, 'FT') + shotBtn(2, false, '2PT') + shotBtn(3, false, '3PT') + shotBtn(1, false, 'FT') + '</div>' +
    '<div class="g3">' + statBtn('oreb', 'Offensive rebound') + statBtn('dreb', 'Defensive rebound') + statBtn('stl', 'Steal') + statBtn('blk', 'Block') + statBtn('to', 'Turnover') + statBtn('foul', 'Foul') + '</div></div>' +
    '<div class="pad" style="padding-top:12px">' + restRow +
    '<div class="sec" style="gap:6px"><h2 class="h2">' + esc(g.opp) + '</h2><div class="g4">' +
    '<button class="oppb" data-act="opp" data-arg="2" aria-label="Opponent made a 2">+2</button><button class="oppb" data-act="opp" data-arg="3" aria-label="Opponent made a 3">+3</button>' +
    '<button class="oppb" data-act="opp" data-arg="1" aria-label="Opponent made a free throw">+1 FT</button><button class="oppb" data-act="oppto" aria-label="Opponent turnover">TO</button></div></div></div>' +
    '<div class="lastbox">' + (wins ? '<div class="row" style="flex-wrap:wrap;gap:6px">' + wins + '</div>' : '') +
    '<div class="last"><div class="t"><span class="kick">Last entry' + (lastE && lastE.c != null ? ' · ' + periodLabel(g, lastE.q) + ' ' + fmtClock(lastE.c) : '') + '</span><span>' + esc(lastE ? describe(g, lastE) : '') + '</span></div><span class="s">' + S.us + '–' + S.them + '</span></div></div></div>' +
    navBar('track') + '</div>';
}
function navBar(on) {
  const b = (k, ico, label) => '<button class="' + (on === k ? 'on' : '') + '" data-act="go" data-arg="' + k + '"' + (on === k ? ' aria-current="page"' : '') + '>' + ico + label + '</button>';
  return '<nav class="nav" aria-label="Game screens">' + b('track', I.track, 'Track') + b('log', I.list, 'Play-by-play') + b('box', I.table, 'Box score') + '</nav>';
}
function flowHeader(title, kick, back) {
  const g = cur(), S = replay(g);
  return '<header class="hdr"><button class="round" aria-label="Back" data-act="' + back + '">' + I.back + '</button><div class="ttl"><span class="kick">' + esc(kick) + '</span><span class="big">' + esc(title) + '</span></div><span class="right">' + S.us + '–' + S.them + '</span></header>';
}

function vCourt() {
  const g = cur(), pd = ui.pend, d = ui.draft;
  const total = pd.made ? 3 : 2;
  let mk = '';
  if (d.x != null) {
    mk = '<circle cx="' + d.x + '" cy="' + d.y + '" r="7" style="fill:none;stroke:' + (pd.made ? '#5B9BFF' : '#FBBF24') + ';stroke-width:0.6;opacity:0.7"></circle>' +
      (pd.made ? '<circle cx="' + d.x + '" cy="' + d.y + '" r="3.4" style="fill:#2F6BFF;stroke:#fff;stroke-width:0.8"></circle>' :
        '<path d="M' + (d.x - 2.6) + ' ' + (d.y - 2.6) + 'L' + (d.x + 2.6) + ' ' + (d.y + 2.6) + 'M' + (d.x - 2.6) + ' ' + (d.y + 2.6) + 'L' + (d.x + 2.6) + ' ' + (d.y - 2.6) + '" style="stroke:#FBBF24;stroke-width:1.5;stroke-linecap:round"></path>');
  }
  const mismatch = d.x != null && d.three !== (pd.pts === 3);
  return '<div class="scr">' + flowHeader(pd.pts + 'PT ' + (pd.made ? 'make' : 'miss'), pname(g, pd.p) + ' · step 1 of ' + total, 'cancelShot') +
    '<div class="body"><p class="muted" style="margin:0;font-size:14px">Tap the spot the shot was taken from. Tap again to move it.</p>' +
    '<button class="court" id="court" data-act="court" aria-label="Half court. Tap to mark where the shot was taken."><svg viewBox="0 0 150 140" aria-hidden="true"><g class="lines">' + COURT_LINES + '<rect x="0.5" y="0.5" width="149" height="139"></rect><path d="M57 140 A18 18 0 0 1 93 140"></path></g>' + mk + '</svg></button>' +
    '<div class="card between" style="align-items:center"><div style="display:flex;flex-direction:column;gap:2px"><span class="kick">Zone</span><b style="font-size:16px">' + esc(d.zone || 'No spot yet') + '</b></div><span class="tag">' + (d.x == null ? 'Tap the court' : (d.three ? '3PT zone' : (d.paint ? 'In the paint' : 'Mid-range'))) + '</span></div>' +
    (mismatch ? '<div class="warn"><span>' + (d.three ? 'That spot is outside the arc, but you picked 2PT.' : 'That spot is inside the arc, but you picked 3PT.') + '</span><button data-act="fixShot">' + (d.three ? 'Make it 3PT' : 'Make it 2PT') + '</button></div>' : '') +
    '<div class="foot"><button class="btn ghost" data-act="skipLoc">Skip</button><button class="btn' + (d.x == null ? ' off' : '') + '" data-act="toDetails"' + (d.x == null ? ' disabled' : '') + '>Next</button></div></div></div>';
}

function vDetails() {
  const g = cur(), pd = ui.pend, d = ui.draft;
  const types = pd.pts === 3 ? ['Catch & shoot', 'Off the dribble', 'Step-back'] : ['Layup', 'Dunk', 'Floater', 'Jumper', 'Hook', 'Tip-in'];
  const chips = types.map((t) => '<button class="chip' + (d.st === t ? ' on' : '') + '" data-act="shotType" data-arg="' + esc(t) + '" aria-pressed="' + (d.st === t) + '">' + esc(t) + '</button>').join('');
  const S = replay(g);
  const tg = [['fb', 'Fast break', 'Scored in transition, before the defence set up']];
  if (pd.made) tg.push(['and1', 'And-1', 'Fouled on the make. Log the free throw next.']);
  else tg.push(['blkd', 'Blocked', 'The shot was blocked']);
  tg.push(['sc', '2nd chance', S.sc ? 'Auto-on: after ' + shortN(g, S.sc) + '’s offensive rebound' : 'Came straight after an offensive rebound']);
  const togs = tg.map((t) => '<button class="tog' + (d[t[0]] ? ' on' : '') + '" data-act="draftTog" data-arg="' + t[0] + '" aria-pressed="' + !!d[t[0]] + '"><span class="l"><b>' + t[1] + '</b><span>' + esc(t[2]) + '</span></span><span class="sw"></span></button>').join('');
  return '<div class="scr">' + flowHeader(pd.pts + 'PT ' + (pd.made ? 'make' : 'miss'), pname(g, pd.p) + ' · step 2 of ' + (pd.made ? 3 : 2), 'toCourt') +
    '<div class="body"><div class="row" style="flex-wrap:wrap"><span class="tag">' + esc(d.zone || 'No location') + '</span>' + (pd.made && d.pot ? '<span class="win o" style="font-size:12px">Counts as points off a turnover</span>' : '') + '</div>' +
    '<div class="sec"><div class="between"><h2 class="h2">Shot type</h2><span class="small muted">Optional</span></div><div class="g3">' + chips + '</div></div>' +
    '<div class="sec"><h2 class="h2">Tags</h2>' + togs + '</div>' +
    '<div style="margin-top:auto"><button class="btn full" style="min-height:56px;font-size:17px" data-act="' + (pd.made ? 'toAssist' : 'saveShot') + '">' + (pd.made ? 'Next: who assisted?' : 'Log the miss') + '</button></div></div></div>';
}

function vAssist() {
  const g = cur(), pd = ui.pend, S = replay(g);
  if (pd.rest) {
    const ms = S.court.map((id) => {
      const ini = pname(g, id).split(' ').map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase();
      return '<button class="mate" data-act="saveRest" data-arg="' + esc(id) + '"><span class="av">' + esc(ini) + '</span><span class="n"><b>' + esc(pname(g, id)) + '</b><span>' + S.P[id].ast + ' ast so far</span></span>' + I.chev + '</button>';
    }).join('');
    return '<div class="scr">' + flowHeader('Rest of team +' + pd.pts, 'Untracked teammate scored', 'cancelRest') +
      '<div class="body" style="gap:10px"><h2 style="margin:0;font-family:var(--disp);font-size:30px;font-weight:800;line-height:1">Who assisted it?</h2>' +
      '<p class="muted" style="margin:0 0 4px;font-size:14px">Pick a tracked player if they made the pass.</p>' + ms +
      '<button class="btn dash full" style="min-height:60px;margin-top:4px" data-act="saveRest" data-arg="">No tracked assist</button></div></div>';
  }
  const mates = S.court.filter((id) => id !== pd.p).map((id) => {
    const ini = pname(g, id).split(' ').map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase();
    return '<button class="mate" data-act="saveShot" data-arg="' + esc(id) + '"><span class="av">' + esc(ini) + '</span><span class="n"><b>' + esc(pname(g, id)) + '</b><span>' + S.P[id].ast + ' ast so far</span></span>' + I.chev + '</button>';
  }).join('');
  const tm = g.trackAll ? '' : '<button class="mate" data-act="saveShot" data-arg="tm"><span class="av">TM</span><span class="n"><b>An untracked teammate</b><span>Counts as assisted, no player credited</span></span>' + I.chev + '</button>';
  return '<div class="scr">' + flowHeader(pd.pts + 'PT make', pname(g, pd.p) + ' · step 3 of 3', 'toDetails') +
    '<div class="body" style="gap:10px"><h2 style="margin:0;font-family:var(--disp);font-size:30px;font-weight:800;line-height:1">Who assisted ' + esc(first(g, pd.p)) + '’s ' + pd.pts + '?</h2>' +
    '<p class="muted" style="margin:0 0 4px;font-size:14px">' + (g.trackAll ? 'Only teammates on the court right now are shown.' : 'Tracked teammates on the court, or someone untracked.') + '</p>' +
    mates + tm + '<button class="btn dash full" style="min-height:60px;margin-top:4px" data-act="saveShot" data-arg="">No assist</button></div></div>';
}

function vSubs() {
  const g = cur(), S = replay(g);
  const bench = g.roster.map((r) => r.id).filter((id) => S.court.indexOf(id) < 0);
  const row = (id, isCourt) => {
    const p = S.P[id], on = (isCourt ? ui.off : ui.on).indexOf(id) >= 0;
    const sub = isCourt ? 'Stint ' + sgn(p.stint) + ' · Game ' + sgn(p.pm) + ' · ' + p.pts + ' pts' : 'Game ' + sgn(p.pm) + ' · ' + p.pts + ' pts · ' + p.pf + ' fouls';
    return '<button class="srow' + (on ? (isCourt ? ' off' : ' in') : '') + '" data-act="' + (isCourt ? 'subOff' : 'subOn') + '" data-arg="' + esc(id) + '" aria-pressed="' + on + '"><span class="n"><b>' + esc(pname(g, id)) + '</b><span>' + sub + '</span></span><span class="mk">' + (on ? (isCourt ? 'Coming off' : 'Going on') : '') + '</span></button>';
  };
  const no = ui.off.length, ni = ui.on.length, after = S.court.length - no + ni;
  const ok = (no > 0 || ni > 0) && after <= 5;
  let label = 'Pick players to swap';
  if (no || ni) {
    if (after > 5) label = 'Too many on court (' + after + '). Pick ' + (after - 5) + ' more coming off';
    else if (g.trackAll && no !== ni) label = 'Confirm (leaves ' + after + ' on court)';
    else label = 'Confirm ' + Math.max(no, ni) + ' change' + (Math.max(no, ni) > 1 ? 's' : '');
  }
  const lu = S.lineupPm;
  return '<div class="scr">' + flowHeader('Substitutions', periodLabel(g, g.clock.q) + (g.clockOn ? ' · ' + fmtClock(remaining(g)) : ''), 'cancelSubs') +
    '<div class="body" style="gap:8px"><p class="muted" style="margin:0;font-size:14px">Tap who is coming off, then who is going on.</p>' +
    '<div class="between" style="margin-top:4px"><h2 class="h2">On court</h2><span class="small" style="font-weight:700;color:' + (lu > 0 ? '#5B9BFF' : (lu < 0 ? '#FBBF24' : '#A3ABBA')) + '">This lineup ' + sgn(lu) + '</span></div>' +
    (S.court.length ? S.court.map((id) => row(id, true)).join('') : '<div class="empty">Nobody on the court</div>') +
    '<h2 class="h2" style="margin-top:8px">Bench</h2>' + (bench.length ? bench.map((id) => row(id, false)).join('') : '<div class="empty">Nobody on the bench</div>') +
    '<button class="btn dash full" data-act="addLatePlayer">' + I.plus + 'Add a player who arrived late</button>' +
    '<div style="margin-top:auto;padding-top:8px"><button class="btn full' + (ok ? '' : ' off') + '" style="min-height:56px;font-size:17px" data-act="confirmSubs"' + (ok ? '' : ' disabled') + '>' + label + '</button></div></div></div>';
}

/* ---------- play-by-play ---------- */
function vLog() {
  const g = cur(), S = replay(g);
  const keep = (e) => ui.logFilter === 'all' || (ui.logFilter === 'score' && scoring(e)) || (ui.logFilter === 'subs' && e.t === 'sub') || (ui.logFilter === e.p);
  const byQ = {};
  g.events.forEach((e, i) => { if (!keep(e)) return; (byQ[e.q] = byQ[e.q] || []).push({ e, i }); });
  const qs = Object.keys(byQ).map(Number).sort((a, b) => b - a);
  const groups = qs.map((q) => '<h3 class="qh">' + (g.periods === 2 ? 'Half ' : 'Quarter ') + q + '</h3>' + byQ[q].reverse().map(({ e, i }) => {
    const k = kindOf(e);
    return '<div class="ev"><span class="tm">' + (e.c != null ? fmtClock(e.c) : '') + '</span><span class="dot' + (k ? ' ' + k : '') + '"></span><span class="tx">' + esc(describe(g, e)) + '</span>' +
      (scoring(e) ? '<span class="sc' + (k === 'o' ? ' o' : '') + '">' + S.after[i] + '</span>' : '') +
      (e.t !== 'start' ? '<button class="del" aria-label="Delete this entry" data-act="delEvent" data-arg="' + e.n + '">' + I.trash + '</button>' : '') + '</div>';
  }).join('')).join('');
  const pills = [['all', 'All'], ['score', 'Scoring'], ['subs', 'Subs']].concat(g.roster.map((r) => [r.id, first(g, r.id)]))
    .map((f) => '<button class="pill' + (ui.logFilter === f[0] ? ' on' : '') + '" data-act="logFilter" data-arg="' + esc(f[0]) + '">' + esc(f[1]) + '</button>').join('');
  const n = S.flow.length - 1, W = 330;
  const px = (i) => 8 + (n ? i * (W - 22) / n : 0), maxAbs = Math.max(6, ...S.flow.map(Math.abs)), py = (v) => 60 - v * (48 / maxAbs);
  const pts = S.flow.map((v, i) => px(i).toFixed(1) + ',' + py(v).toFixed(1)).join(' ');
  return '<div class="trk"><header class="hdr"><div class="ttl"><span class="kick">' + periodLabel(g, g.clock.q) + (g.clockOn ? ' · ' + fmtClock(remaining(g)) : '') + '</span><span class="big">Play-by-play</span></div><span class="right" style="color:var(--text)">' + S.us + '–' + S.them + '</span></header>' +
    '<div style="flex:1;overflow-y:auto"><div class="body">' +
    '<div class="card sec" style="gap:10px"><div class="between"><h2 class="h2">Game flow</h2><span class="small muted">Score margin</span></div>' +
    '<svg width="100%" viewBox="0 0 330 120" role="img" aria-label="Score margin through the game"><line x1="0" y1="60" x2="330" y2="60" style="stroke:#3A4150;stroke-dasharray:3 3"></line>' +
    '<text x="6" y="14" style="fill:#A3ABBA;font-size:10px">' + esc(teamName(g.team)) + ' ahead</text><text x="6" y="112" style="fill:#A3ABBA;font-size:10px">' + esc(g.opp) + ' ahead</text>' +
    (n ? '<polyline points="' + pts + '" style="fill:none;stroke:#5B9BFF;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round"></polyline><circle cx="' + px(n).toFixed(1) + '" cy="' + py(S.flow[n]).toFixed(1) + '" r="4" style="fill:#5B9BFF"></circle>' : '') + '</svg>' +
    '<div class="g4" style="gap:6px">' + [[S.changes, 'Lead changes'], [S.ties, 'Ties'], [sgn(S.maxLead), 'Largest lead'], [S.bestRun.us + '–0', 'Best run']].map((x) =>
      '<div style="background:var(--card2);border-radius:10px;padding:8px 4px;display:flex;flex-direction:column;align-items:center;gap:2px"><b style="font-family:var(--disp);font-size:22px;line-height:1">' + x[0] + '</b><span style="font-size:11px;color:var(--sub);text-align:center">' + x[1] + '</span></div>').join('') + '</div></div>' +
    '<div class="scroller">' + pills + '</div>' + (groups || '<div class="empty">Nothing here yet</div>') +
    '<p class="muted small">To fix a mistake, delete the entry and enter it again. Everything after it updates.</p></div></div>' + navBar('log') + '</div>';
}

/* ---------- box score ---------- */
function vBox() {
  const g = cur(), S = replay(g);
  const ids = g.roster.map((r) => r.id).filter((id) => { const p = S.P[id]; return S.starters.indexOf(id) >= 0 || p.sec > 0 || p.fga || p.fta || p.oreb || p.dreb || p.ast || p.stl || p.blk || p.to || p.pf || wasOn(g, id); });
  ids.sort((a, b) => { const sa = S.starters.indexOf(a), sb = S.starters.indexOf(b); return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb) || S.P[b].pts - S.P[a].pts; });
  const T = blank();
  const cols = g.clockOn ? ['MIN'] : [];
  const head = ['Player'].concat(cols, ['PTS', 'FG', 'FG%', '3P', '3P%', 'FT', 'FT%', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', '+/-']);
  const line = (name, p, tot) => {
    const c = [esc(name)];
    if (g.clockOn) c.push(tot ? '' : String(Math.round(p.sec / 60)));
    c.push(String(p.pts), p.fgm + '-' + p.fga, pct(p.fgm, p.fga), p.tpm + '-' + p.tpa, pct(p.tpm, p.tpa), p.ftm + '-' + p.fta, pct(p.ftm, p.fta),
      String(p.oreb), String(p.dreb), String(p.oreb + p.dreb), String(p.ast), String(p.stl), String(p.blk), String(p.to), String(p.pf), tot ? '' : sgn(p.pm));
    return '<tr' + (tot ? ' class="tot"' : '') + '>' + c.map((v, i) => '<td' + (i === (g.clockOn ? 2 : 1) ? ' class="pts"' : '') + '>' + v + '</td>').join('') + '</tr>';
  };
  const rows = ids.map((id) => { const p = S.P[id]; Object.keys(T).forEach((k) => { T[k] += p[k]; }); return line(shortN(g, id), p, false); }).join('');
  const qkeys = Object.keys(S.qs).map(Number).sort((a, b) => a - b);
  const quarters = qkeys.map((q) => '<div style="background:var(--card2);border-radius:10px;padding:8px 4px;display:flex;flex-direction:column;align-items:center;gap:2px"><span class="small muted">' + periodLabel(g, q) + '</span><b style="font-family:var(--disp);font-size:19px">' + S.qs[q].us + '–' + S.qs[q].them + '</b></div>').join('');
  const fgm = T.fgm + 0;
  const extras = [
    [S.x.paint, 'Points in the paint', ''], [S.x.sc, 'Second-chance points', T.oreb + ' offensive rebounds'],
    [S.x.fb, 'Fast-break points', ''], [S.x.pot, 'Points off turnovers', ''],
    [fgm ? Math.round(S.x.astFg / fgm * 100) + '%' : '–', 'Assisted makes', S.x.astFg + ' of ' + fgm + ' tracked makes'],
    [g.trackAll ? S.x.bench : S.x.rest, g.trackAll ? 'Bench points' : 'Rest of team points', g.trackAll ? 'Players who did not start' : 'Untracked players'],
    [sgn(S.maxLead), 'Largest lead', S.maxDef ? 'Biggest deficit −' + S.maxDef : ''], [S.changes, 'Lead changes', S.ties + ' ties']
  ].map((x) => '<div class="stile"><b>' + x[0] + '</b><span>' + x[1] + '</span><i>' + esc(x[2]) + '</i></div>').join('');
  // shot chart
  const shots = S.shots.filter((s) => ui.who === 'all' || s.p === ui.who);
  const dots = shots.filter((s) => !s.made).map((s) => '<path d="M' + (s.x - 1.8) + ' ' + (s.y - 1.8) + 'L' + (s.x + 1.8) + ' ' + (s.y + 1.8) + 'M' + (s.x - 1.8) + ' ' + (s.y + 1.8) + 'L' + (s.x + 1.8) + ' ' + (s.y - 1.8) + '" style="fill:none;stroke:#FBBF24;stroke-width:1.1;stroke-linecap:round"></path>').join('') +
    shots.filter((s) => s.made).map((s) => '<circle cx="' + s.x + '" cy="' + s.y + '" r="2.3" style="fill:#2F6BFF;stroke:#fff;stroke-width:0.5"></circle>').join('');
  const zones = ZGROUPS.map((z) => {
    const zs = shots.filter((s) => s.g === z[0]), m = zs.filter((s) => s.made).length, a = zs.length, p = a ? Math.round(m / a * 100) : 0;
    return '<div class="zrow"><span style="font-weight:600">' + z[1] + '</span><span style="text-align:right;color:#D2D7E0">' + m + '/' + a + '</span><span class="row"><span class="bar"><i style="width:' + p + '%"></i></span><b style="width:34px;font-size:12px;text-align:right">' + (a ? p + '%' : '–') + '</b></span></div>';
  }).join('');
  const pickers = [['all', 'Everyone']].concat(ids.map((id) => [id, first(g, id)])).map((f) => '<button class="pill' + (ui.who === f[0] ? ' on' : '') + '" data-act="who" data-arg="' + esc(f[0]) + '">' + esc(f[1]) + '</button>').join('');
  const lus = Object.values(S.lineups).filter((l) => l.ids.length && (l.sec > 0 || l.pf || l.pa)).sort((a, b) => (b.pf - b.pa) - (a.pf - a.pa) || b.sec - a.sec).slice(0, 5)
    .map((l) => { const pm = l.pf - l.pa; return '<div class="card between" style="align-items:center"><span style="display:flex;flex-direction:column;gap:3px;min-width:0"><span style="font-size:13px;font-weight:600;line-height:1.35">' + esc(l.ids.map((id) => shortN(g, id)).join(' · ')) + '</span><span class="small muted">' + (g.clockOn ? fmtClock(l.sec) + ' together · ' : '') + l.pf + '–' + l.pa + '</span></span><b style="font-family:var(--disp);font-size:26px;color:' + (pm >= 0 ? '#5B9BFF' : '#FBBF24') + '">' + (pm >= 0 ? '+' + pm : '−' + (-pm)) + '</b></div>'; }).join('');
  const done = g.status !== 'live';
  return '<div class="trk"><header class="hdr"><div class="ttl"><span class="kick">' + (done ? 'Final' : periodLabel(g, g.clock.q) + ' · in progress') + ' · ' + esc(g.date) + '</span><span class="big">Box score</span></div>' +
    '<button class="round" style="margin-left:auto" aria-label="All games" data-act="home"><svg width="20" height="20" viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M3 11l9-7 9 7"></path><path d="M5 10v10h14V10"></path></svg></button></header>' +
    '<div style="flex:1;overflow-y:auto"><div class="body" style="gap:16px">' +
    '<div class="card sec" style="gap:14px;padding:16px"><div class="board"><div style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="nm">' + esc(teamName(g.team)) + '</span><span class="pts" style="color:#5B9BFF;font-size:58px">' + S.us + '</span></div>' +
    '<span class="small" style="font-weight:700;color:var(--sub);padding-bottom:8px">' + (done ? (S.us > S.them ? 'Win' : (S.us < S.them ? 'Loss' : 'Draw')) : 'Live') + '</span>' +
    '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0"><span class="nm">' + esc(g.opp) + '</span><span class="pts" style="color:#FBBF24;font-size:58px">' + S.them + '</span></div></div>' +
    (quarters ? '<div class="g4" style="gap:6px">' + quarters + '</div>' : '') + '</div>' +
    exportCard(g, done) +
    '<div class="sec"><h2 class="h2">Team extras</h2><div class="g2">' + extras + '</div></div>' +
    '<div class="sec"><div class="between"><h2 class="h2">Players</h2><span class="small muted">Scroll sideways for more</span></div><div class="tblwrap"><table class="box"><thead><tr>' + head.map((h) => '<th scope="col">' + h + '</th>').join('') + '</tr></thead><tbody>' + rows + line(g.trackAll ? 'Team' : 'Tracked', T, true) + '</tbody></table></div>' +
    (g.trackAll ? '' : '<span class="small muted">Only tracked players are shown. The score includes everyone.</span>') + '</div>' +
    '<div class="sec"><div class="between"><h2 class="h2">Shot chart</h2><span class="small muted">' + shots.filter((s) => s.made).length + ' of ' + shots.length + ' with a spot</span></div><div class="scroller">' + pickers + '</div>' +
    '<svg viewBox="0 0 150 100" style="width:100%;display:block;background:var(--card);border-radius:14px" role="img" aria-label="Shot chart"><g class="lines">' + COURT_LINES + '</g>' + dots + '</svg>' +
    '<div class="row small muted" style="gap:16px"><span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:5px;background:#2F6BFF;display:inline-block"></span>Made</span><span class="row" style="gap:6px"><b style="color:#FBBF24;font-size:14px">×</b>Missed</span></div>' +
    '<div class="card" style="padding:4px 12px">' + zones + '</div></div>' +
    (lus ? '<div class="sec"><h2 class="h2">Lineups</h2>' + lus + '</div>' : '') +
    (done ? '' : '<button class="btn ghost full" data-act="finish">Finish game</button>') +
    '</div></div>' + (done ? '' : navBar('box')) + '</div>';
}
function wasOn(g, id) { return g.events.some((e) => (e.t === 'start' && e.on.indexOf(id) >= 0) || (e.t === 'sub' && e.in.indexOf(id) >= 0)); }
function exportCard(g, done) {
  return '<div class="card sec" style="background:var(--bar);border:1.5px solid var(--line);padding:16px;gap:12px"><div class="sec" style="gap:4px"><span class="big" style="font-size:24px">Export game</span>' +
    '<span class="muted">One small file with every play, shot spot, assist and sub. Send it to the laptop and add it to the site.</span></div>' +
    '<div class="card small" style="word-break:break-all;font-weight:600">' + esc(fileName(g)) + '</div>' +
    '<div class="g2"><button class="btn" data-act="exportSave">Save file</button><button class="btn ghost" data-act="exportShare">Share…</button></div>' +
    (done ? '<div class="g2"><button class="btn ghost" data-act="reopen">Reopen to edit</button><button class="btn danger" data-act="delGame">Delete</button></div>' : '<span class="muted small">You can export mid-game too, as a backup.</span>') + '</div>';
}

/* ---------- sheets ---------- */
function vSheet() {
  const g = cur();
  if (!ui.sheet || !g) return '';
  let inner = '';
  if (ui.sheet === 'period') {
    const q = g.clock.q, last = q >= g.periods;
    inner = '<span class="big" style="font-size:24px">' + periodLabel(g, q) + (g.clockOn ? ' · ' + fmtClock(remaining(g)) : '') + '</span>' +
      (last ? '' : '<button class="btn full" data-act="endPeriod">End ' + periodLabel(g, q) + ', start ' + periodLabel(g, q + 1) + '</button>') +
      (last ? '<button class="btn full" data-act="endPeriod">Add overtime</button>' : '') +
      (g.clockOn ? '<button class="btn ghost full" data-act="sheet" data-arg="clock">Set the clock</button>' : '') +
      '<button class="btn ghost full" data-act="finish">Finish game</button>' +
      '<button class="btn ghost full" data-act="home">All games (this one stays saved)</button>' +
      '<button class="btn ghost full" data-act="closeSheet">Cancel</button>';
  } else if (ui.sheet === 'clock') {
    const r = Math.round(remaining(g));
    inner = '<span class="big" style="font-size:24px">Set the clock</span><span class="muted">Match the time showing on the replay.</span>' +
      '<div class="row"><input id="f-min" class="field" type="number" inputmode="numeric" min="0" max="60" value="' + Math.floor(r / 60) + '" style="text-align:center;font-size:22px" aria-label="Minutes">' +
      '<b style="font-size:22px">:</b><input id="f-sec" class="field" type="number" inputmode="numeric" min="0" max="59" value="' + (r % 60) + '" style="text-align:center;font-size:22px" aria-label="Seconds"></div>' +
      '<button class="btn full" data-act="setClock">Set</button><button class="btn ghost full" data-act="closeSheet">Cancel</button>';
  }
  return '<div class="veil" data-act="veil"><div class="sheet" role="dialog" aria-modal="true">' + inner + '</div></div>';
}

/* =================== RENDER =================== */
function render() {
  let h = '';
  const g = cur();
  if (!g && ui.screen !== 'home' && ui.screen !== 'setup') ui.screen = 'home';
  switch (ui.screen) {
    case 'setup': h = vSetup(); break;
    case 'track': h = vTrack(); break;
    case 'court': h = vCourt(); break;
    case 'details': h = vDetails(); break;
    case 'assist': h = vAssist(); break;
    case 'subs': h = vSubs(); break;
    case 'log': h = vLog(); break;
    case 'box': h = vBox(); break;
    default: h = vHome();
  }
  const scroller = ROOT.querySelector('.mid, [style*="overflow-y:auto"]');
  const keepScroll = scroller && ui.lastScreen === ui.screen ? scroller.scrollTop : 0;
  const winScroll = ui.lastScreen === ui.screen ? window.scrollY : 0;
  ROOT.innerHTML = h + vSheet() + (ui.toast ? '<div class="toast" role="status"><span>' + esc(ui.toast) + '</span><button aria-label="Dismiss" data-act="dismiss">' + I.x + '</button></div>' : '');
  const sc2 = ROOT.querySelector('.mid, [style*="overflow-y:auto"]');
  if (sc2 && keepScroll) sc2.scrollTop = keepScroll;
  if (ui.lastScreen === ui.screen) window.scrollTo(0, winScroll); else window.scrollTo(0, 0);
  ui.lastScreen = ui.screen;
  wake();
}

/* =================== ACTIONS =================== */
function go(screen) { ui.screen = screen; render(); }
function startShot(arg) {
  const g = cur(), S = replay(g);
  const pts = Number(arg.charAt(0)), made = arg.charAt(1) === 'm';
  if (!ui.sel) return;
  if (pts === 1) {
    add({ t: 'ft', p: ui.sel, made, sc: !!S.sc, pot: S.pot });
    render(); return;
  }
  ui.pend = { p: ui.sel, pts, made };
  ui.draft = { x: null, y: null, zone: null, zg: null, three: false, paint: false, st: null, fb: false, and1: false, blkd: false, sc: !!S.sc, pot: S.pot };
  go('court');
}
function saveShot(ast) {
  const pd = ui.pend, d = ui.draft;
  const e = { t: 'shot', p: pd.p, pts: pd.pts, made: pd.made };
  if (d.x != null) { e.x = d.x; e.y = d.y; e.zone = d.zone; e.zg = d.zg; }
  if (d.st) e.st = d.st;
  if (pd.made && ast) e.ast = ast;
  if (d.fb) e.fb = true;
  if (d.sc) e.sc = true;
  if (pd.made && d.pot) e.pot = true;
  if (pd.made && d.and1) e.and1 = true;
  if (!pd.made && d.blkd) e.blkd = true;
  add(e);
  const and1 = pd.made && d.and1;
  ui.sel = pd.p; ui.pend = null; ui.draft = null;
  ui.screen = 'track';
  if (and1) toast('And-1: now tap FT Made or Missed for ' + shortN(cur(), pd.p)); else render();
}

const ACT = {
  home: () => { ui.sheet = null; ui.gid = null; go('home'); },
  sync: () => refreshBundle(true),
  newGame: () => { ui.setup = newSetup(); refreshBundle(false); go('setup'); },
  open: (id) => { ui.gid = id; ui.logFilter = 'all'; ui.who = 'all'; const g = cur(); go(g.status === 'live' ? 'track' : 'box'); },
  setTeam: (id) => { const s = ui.setup; if (s.team === id) return; s.team = id; s.extra = []; applyTeamDefaults(s); render(); },
  setVenue: (v) => { ui.setup.venue = v; render(); },
  setPeriods: (n) => { ui.setup.periods = Number(n); if (Number(n) === 2 && ui.setup.len === 10) ui.setup.len = 20; else if (Number(n) === 4 && ui.setup.len === 20) ui.setup.len = 10; render(); },
  setupTog: (k) => { const s = ui.setup; s[k] = !s[k]; if (k === 'trackAll') s.starters = s.trackAll ? s.starters.slice(0, 5) : s.starters; render(); },
  togPlay: (id) => {
    const s = ui.setup, i = s.playing.indexOf(id);
    if (i >= 0) { s.playing.splice(i, 1); s.starters = s.starters.filter((x) => x !== id); }
    else { s.playing.push(id); if (s.starters.length < 5) s.starters.push(id); }
    render();
  },
  togStart: (id) => {
    const s = ui.setup, i = s.starters.indexOf(id);
    if (i >= 0) s.starters.splice(i, 1);
    else { if (s.starters.length >= 5) { toast('Only 5 can start. Untick one first.'); return; } s.starters.push(id); }
    render();
  },
  addSetupPlayer: () => {
    const el = document.getElementById('f-add'), name = (el.value || '').trim();
    if (!name) return;
    const s = ui.setup;
    const found = Object.entries(BUNDLE.players).find(([, p]) => p.name.toLowerCase() === name.toLowerCase() || (p.short || '').toLowerCase() === name.toLowerCase());
    const id = found ? found[0] : slug(name);
    if (!id) return;
    if (!s.extra.find((x) => x.id === id)) s.extra.push({ id, name: found ? found[1].name : name, isNew: !found });
    if (s.playing.indexOf(id) < 0) s.playing.push(id);
    render();
  },
  startGame: () => {
    const s = ui.setup, roster = setupRoster(s).filter((r) => s.playing.indexOf(r.id) >= 0);
    if (!roster.length) { toast(s.trackAll ? 'Tick who is playing first' : 'Tick at least one tracked player'); return; }
    const need = Math.min(5, roster.length);
    if (s.trackAll && s.starters.length !== need) { toast('Pick ' + need + ' starters (' + s.starters.length + ' picked)'); return; }
    if (!s.opp.trim()) { toast('Add the opponent’s name'); document.getElementById('f-opp').focus(); return; }
    const len = Math.max(1, Math.min(40, Number(s.len) || 10));
    const nums = (BUNDLE.nums || {})[s.team] || {};
    const g = { app: 'mystat-tracker', v: APP_VERSION, id: uid(), team: s.team, opp: s.opp.trim(), date: s.date || today(), season: (s.season || '').trim(), final: !!s.final, venue: s.venue || '',
      periods: s.periods, len, clockOn: !!s.clockOn, trackAll: !!s.trackAll,
      roster: roster.map((r) => ({ id: r.id, name: r.name, num: nums[r.id] || '', isNew: !!r.isNew })),
      events: [], seq: 0, clock: { q: 1, rem: len * 60, running: false, at: 0 }, status: 'live', created: Date.now(), updated: Date.now() };
    DB.games[g.id] = g; DB.order.unshift(g.id);
    ui.gid = g.id;
    add({ t: 'start', on: s.starters.filter((id) => roster.some((r) => r.id === id)) });
    ui.sel = s.starters[0] || null; ui.setup = null;
    go('track');
  },
  sel: (id) => { ui.sel = id; render(); },
  shot: (arg) => startShot(arg),
  stat: (k) => { if (!ui.sel) return; add({ t: k, p: ui.sel }); render(); },
  opp: (n) => { add({ t: 'opp', pts: Number(n) }); render(); },
  oppto: () => { add({ t: 'oppto' }); render(); },
  rest: (n) => {
    const S = replay(cur()), pts = Number(n);
    if (pts === 1 || !S.court.length) { add({ t: 'rest', pts }); render(); return; }
    ui.pend = { rest: true, pts, made: true }; go('assist');
  },
  saveRest: (ast) => { const e = { t: 'rest', pts: ui.pend.pts }; if (ast) e.ast = ast; add(e); ui.pend = null; go('track'); },
  cancelRest: () => { ui.pend = null; go('track'); },
  teamfoul: () => { add({ t: 'teamfoul' }); render(); },
  undo: () => undo(),
  clockToggle: () => { const g = cur(); setClock(g, remaining(g), !g.clock.running); persist(); render(); },
  court: (a, el, ev) => {
    const r = el.getBoundingClientRect();
    let x = (ev.clientX - r.left) / r.width * 150, y = (ev.clientY - r.top) / r.height * 140;
    x = Math.round(Math.max(1, Math.min(149, x)) * 10) / 10; y = Math.round(Math.max(1, Math.min(139, y)) * 10) / 10;
    const z = zoneOf(x, y);
    Object.assign(ui.draft, { x, y, zone: z.zone, zg: z.g, three: z.three, paint: !!z.paint });
    render();
  },
  fixShot: () => { ui.pend.pts = ui.draft.three ? 3 : 2; render(); },
  skipLoc: () => { Object.assign(ui.draft, { x: null, y: null, zone: null, zg: null }); go('details'); },
  toDetails: () => { if (ui.draft.x == null && ui.screen === 'court') return; go('details'); },
  toCourt: () => go('court'),
  toAssist: () => go('assist'),
  cancelShot: () => { ui.pend = null; ui.draft = null; go('track'); },
  shotType: (t) => { ui.draft.st = ui.draft.st === t ? null : t; render(); },
  draftTog: (k) => { ui.draft[k] = !ui.draft[k]; render(); },
  saveShot: (ast) => saveShot(ast || null),
  goSubs: () => { ui.off = []; ui.on = []; go('subs'); },
  cancelSubs: () => { ui.off = []; ui.on = []; go('track'); },
  subOff: (id) => { const i = ui.off.indexOf(id); if (i >= 0) ui.off.splice(i, 1); else ui.off.push(id); render(); },
  subOn: (id) => { const i = ui.on.indexOf(id); if (i >= 0) ui.on.splice(i, 1); else ui.on.push(id); render(); },
  confirmSubs: () => {
    const S = replay(cur()), outs = ui.off.slice(), ins = ui.on.slice();
    if (!(outs.length || ins.length) || S.court.length - outs.length + ins.length > 5) return;
    add({ t: 'sub', in: ins, out: outs });
    ui.off = []; ui.on = [];
    go('track');
  },
  addLatePlayer: () => {
    const name = (window.prompt('Player name') || '').trim();
    if (!name) return;
    const g = cur();
    const found = Object.entries(BUNDLE.players).find(([, p]) => p.name.toLowerCase() === name.toLowerCase());
    const id = found ? found[0] : slug(name);
    if (g.roster.some((r) => r.id === id)) { toast(name + ' is already on the roster'); return; }
    g.roster.push({ id, name: found ? found[1].name : name, num: ((BUNDLE.nums || {})[g.team] || {})[id] || '', isNew: !found });
    add({ t: 'addplayer', id });
    render();
  },
  go: (k) => go(k),
  logFilter: (f) => { ui.logFilter = f; render(); },
  delEvent: (n) => {
    const g = cur(), i = g.events.findIndex((e) => String(e.n) === String(n));
    if (i < 0) return;
    if (!window.confirm('Delete this entry?\n\n' + describe(g, g.events[i]))) return;
    const e = g.events.splice(i, 1)[0];
    if (e.t === 'period' && i === g.events.length) { g.clock.q = e.q; setClock(g, 0, false); }
    persist(); toast('Deleted: ' + describe(g, e));
  },
  who: (id) => { ui.who = id; render(); },
  sheet: (k) => { ui.sheet = k; render(); },
  closeSheet: () => { ui.sheet = null; render(); },
  veil: (a, el, ev) => { if (ev.target === el) { ui.sheet = null; render(); } },
  endPeriod: () => {
    const g = cur();
    add({ t: 'period', next: g.clock.q + 1 });
    g.clock.q += 1; setClock(g, g.len * 60, false);
    persist(); ui.sheet = null; toast(periodLabel(g, g.clock.q) + ' ready. Press play when the replay restarts.');
  },
  setClock: () => {
    const g = cur(), m = Number(document.getElementById('f-min').value) || 0, s = Number(document.getElementById('f-sec').value) || 0;
    setClock(g, Math.max(0, m * 60 + s), g.clock.running); persist(); ui.sheet = null; render();
  },
  finish: () => {
    if (!window.confirm('Finish the game? You can reopen it later if you need to fix something.')) return;
    const g = cur(); setClock(g, remaining(g), false); g.status = 'done'; persist(); ui.sheet = null; go('box');
  },
  reopen: () => { const g = cur(); g.status = 'live'; persist(); go('track'); },
  delGame: () => {
    const g = cur();
    if (!window.confirm('Delete ' + teamName(g.team) + ' vs ' + g.opp + ' from this phone? Export it first if you still need it.')) return;
    delete DB.games[g.id]; DB.order = DB.order.filter((id) => id !== g.id); store(K_GAMES, DB); ui.gid = null; go('home');
  },
  exportSave: () => { const f = exportFile(); const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); },
  exportShare: () => {
    const f = exportFile();
    if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: f.name }).catch(() => {});
    else { toast('Sharing files isn’t supported here, so it was saved instead'); ACT.exportSave(); }
  },
  dismiss: () => { ui.toast = null; render(); }
};

/* ---------- export ---------- */
function fileName(g) { return g.date + '-' + g.team + '-vs-' + (slug(g.opp) || 'opponent') + '.mstat.json'; }
function exportFile() {
  const g = cur(), S = replay(g);
  const box = {};
  g.roster.forEach((r) => { const p = S.P[r.id]; box[r.id] = Object.assign({}, p, { min: g.clockOn ? Math.round(p.sec / 60) : null }); delete box[r.id].stint; });
  const out = {
    format: 'mystat-tracker', version: APP_VERSION, exported: new Date().toISOString(),
    game: { team: g.team, opponent: g.opp, date: g.date, season: g.season, final: g.final, venue: g.venue || '', periods: g.periods, periodMinutes: g.len, clock: g.clockOn, trackAll: g.trackAll, status: g.status,
      score: { us: S.us, them: S.them }, byPeriod: S.qs },
    roster: g.roster, events: g.events,
    summary: { box, starters: S.starters, extras: S.x, maxLead: S.maxLead, maxDeficit: S.maxDef, leadChanges: S.changes, ties: S.ties }
  };
  return new File([JSON.stringify(out)], fileName(g), { type: 'application/json' });
}

/* ---------- events, inputs, clock tick ---------- */
ROOT.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = ACT[b.dataset.act];
  if (fn) fn(b.dataset.arg, b, ev);
});
ROOT.addEventListener('input', (ev) => {
  const k = ev.target.dataset && ev.target.dataset.bind;
  if (k && ui.setup) ui.setup[k] = k === 'len' ? ev.target.value : ev.target.value;
});
setInterval(() => {
  const g = cur();
  if (!g || !g.clockOn) return;
  const el = document.getElementById('clk');
  if (el) el.textContent = fmtClock(remaining(g));
  if (g.clock.running && remaining(g) <= 0) { setClock(g, 0, false); persist(); toast('End of ' + periodLabel(g, g.clock.q) + '. Open the ' + periodLabel(g, g.clock.q) + ' menu to start the next one.'); }
}, 500);

/* keep the screen awake while tracking */
let lock = null;
function wake() {
  const want = !!cur() && ['track', 'court', 'details', 'assist', 'subs'].indexOf(ui.screen) >= 0;
  if (want && !lock && navigator.wakeLock && document.visibilityState === 'visible') {
    navigator.wakeLock.request('screen').then((l) => { lock = l; l.addEventListener('release', () => { lock = null; }); }).catch(() => {});
  } else if (!want && lock) { lock.release().catch(() => {}); lock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { lock = null; wake(); } });

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
refreshBundle(false);
render();
