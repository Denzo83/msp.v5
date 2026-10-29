"""Read a MyStat Tracker export (.mstat.json) and work out the game's stats.

The tracker saves every tap as an event. This replays those events the same
way the tracker does, so the numbers here always match what was on the phone.
Only the Python standard library is used.
"""

import json
import math
from pathlib import Path

STATS = ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'pf', 'stl', 'to', 'blk', 'ast', 'pts']


def load(path):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if data.get('format') != 'mystat-tracker':
        raise ValueError(f'{Path(path).name} is not a MyStat Tracker export')
    return data


def _blank():
    p = {k: 0 for k in STATS}
    p.update(pm=0, sec=0, dunk=0)
    return p


def replay(data):
    """Return a dict with the score, per-player stats and the tracked extras."""
    g = data['game']
    period_len = g['periodMinutes'] * 60
    clock_on = bool(g.get('clock'))
    P = {r['id']: _blank() for r in data['roster']}
    S = {
        'us': 0, 'them': 0, 'court': [], 'starters': [], 'tq': 1, 'tc': period_len, 'sc': None, 'pot': False,
        'qs': {}, 'lineups': {}, 'flow': [0], 'ties': 0, 'changes': 0, 'leader': 0, 'max_lead': 0, 'max_def': 0,
        'run_t': None, 'run_p': 0, 'best_run': {'us': 0, 'them': 0},
        'x': {'paint': 0, 'sc': 0, 'fb': 0, 'pot': 0, 'astFg': 0, 'fgm': 0, 'bench': 0, 'rest': 0},
        'shots': [], 'assists': {},
    }

    def lineup():
        key = '|'.join(sorted(S['court']))
        if key not in S['lineups']:
            S['lineups'][key] = {'ids': list(S['court']), 'sec': 0, 'pf': 0, 'pa': 0}
        return S['lineups'][key]

    def advance(q, c):
        if not clock_on or c is None:
            return
        if q != S['tq']:
            S['tq'], S['tc'] = q, c
            return
        dt = S['tc'] - c
        if dt > 0 and S['court']:
            for pid in S['court']:
                if pid in P:
                    P[pid]['sec'] += dt
            lineup()['sec'] += dt
        S['tc'] = c

    def score(pts, mine, q):
        if mine:
            S['us'] += pts
        else:
            S['them'] += pts
        qs = S['qs'].setdefault(q, {'us': 0, 'them': 0})
        qs['us' if mine else 'them'] += pts
        d = pts if mine else -pts
        for pid in S['court']:
            if pid in P:
                P[pid]['pm'] += d
        if S['court']:
            L = lineup()
            L['pf' if mine else 'pa'] += pts
        m = S['us'] - S['them']
        now = (m > 0) - (m < 0)
        if now == 0:
            S['ties'] += 1
        elif S['leader'] != 0 and now != S['leader']:
            S['changes'] += 1
        if now != 0:
            S['leader'] = now
        S['max_lead'] = max(S['max_lead'], m)
        S['max_def'] = max(S['max_def'], -m)
        side = 'us' if mine else 'them'
        if S['run_t'] == side:
            S['run_p'] += pts
        else:
            S['run_t'], S['run_p'] = side, pts
        S['best_run'][side] = max(S['best_run'][side], S['run_p'])
        S['flow'].append(m)

    def assist(passer, scorer):
        S['assists'].setdefault(passer, {})
        S['assists'][passer][scorer] = S['assists'][passer].get(scorer, 0) + 1

    for e in data['events']:
        advance(e.get('q'), e.get('c'))
        t = e['t']
        p = P.get(e.get('p'))
        if t == 'start':
            S['court'] = list(e['on'])
            S['starters'] = list(e['on'])
        elif t == 'sub':
            S['court'] = [pid for pid in S['court'] if pid not in e['out']] + [pid for pid in e['in'] if pid not in S['court']]
        elif t == 'addplayer':
            P.setdefault(e['id'], _blank())
        elif t == 'shot' and p:
            p['fga'] += 1
            if e['pts'] == 3:
                p['tpa'] += 1
            if e.get('made'):
                p['fgm'] += 1
                if e['pts'] == 3:
                    p['tpm'] += 1
                p['pts'] += e['pts']
                S['x']['fgm'] += 1
                if e.get('st') == 'Dunk':
                    p['dunk'] += 1
                if e.get('ast'):
                    S['x']['astFg'] += 1
                    if e['ast'] != 'tm' and e['ast'] in P:
                        P[e['ast']]['ast'] += 1
                        assist(e['ast'], e['p'])
                if e.get('zg') == 'paint':
                    S['x']['paint'] += e['pts']
                if e.get('sc'):
                    S['x']['sc'] += e['pts']
                if e.get('fb'):
                    S['x']['fb'] += e['pts']
                if e.get('pot'):
                    S['x']['pot'] += e['pts']
                if e['p'] not in S['starters']:
                    S['x']['bench'] += e['pts']
                score(e['pts'], True, e['q'])
                S['sc'], S['pot'] = None, False
            if e.get('x') is not None:
                S['shots'].append([e['p'], e['x'], e['y'], 1 if e.get('made') else 0, e['pts'], e.get('zg', ''), e.get('st', ''),
                                   1 if e.get('fb') else 0, 1 if e.get('sc') else 0, e.get('ast', '') if e.get('made') else ''])
        elif t == 'ft' and p:
            p['fta'] += 1
            if e.get('made'):
                p['ftm'] += 1
                p['pts'] += 1
                if e.get('sc'):
                    S['x']['sc'] += 1
                if e.get('pot'):
                    S['x']['pot'] += 1
                if e['p'] not in S['starters']:
                    S['x']['bench'] += 1
                score(1, True, e['q'])
        elif t == 'oreb':
            if p:
                p['oreb'] += 1
            S['sc'] = e.get('p')
        elif t == 'dreb':
            if p:
                p['dreb'] += 1
            S['sc'], S['pot'] = None, False
        elif t == 'stl':
            if p:
                p['stl'] += 1
            S['pot'], S['sc'] = True, None
        elif t == 'blk':
            if p:
                p['blk'] += 1
        elif t == 'to':
            if p:
                p['to'] += 1
            S['sc'], S['pot'] = None, False
        elif t == 'foul':
            if p:
                p['pf'] += 1
        elif t == 'opp':
            score(e['pts'], False, e['q'])
            S['sc'], S['pot'] = None, False
        elif t == 'oppto':
            S['pot'], S['sc'] = True, None
        elif t == 'rest':
            if e.get('ast') and e['ast'] in P:
                P[e['ast']]['ast'] += 1
                assist(e['ast'], 'rest')
            score(e['pts'], True, e['q'])
            S['x']['rest'] += e['pts']
            if e['pts'] > 1:
                S['sc'], S['pot'] = None, False
        elif t == 'period':
            advance(e['q'], 0)
            S['tq'], S['tc'] = e['next'], period_len
    S['P'] = P
    return S


def was_on_court(data, pid):
    return any((e['t'] == 'start' and pid in e['on']) or (e['t'] == 'sub' and pid in e['in']) for e in data['events'])


def check_against_summary(data, S):
    """Compare with the box score the phone worked out. Returns a list of differences."""
    probs = []
    summ = (data.get('summary') or {}).get('box') or {}
    for pid, box in summ.items():
        mine = S['P'].get(pid)
        if not mine:
            continue
        for k in STATS + ['pm']:
            if box.get(k, 0) != mine[k]:
                probs.append(f'{pid} {k}: phone says {box.get(k)}, replay says {mine[k]}')
    sc = data['game'].get('score') or {}
    if sc and (sc.get('us') != S['us'] or sc.get('them') != S['them']):
        probs.append(f'score: phone says {sc.get("us")}-{sc.get("them")}, replay says {S["us"]}-{S["them"]}')
    return probs


def tracked_block(data, S, idmap):
    """The extra stats saved with the game (only tracker games have these)."""
    g = data['game']
    m = lambda pid: idmap.get(pid, pid)
    clock_on = bool(g.get('clock'))
    players = [m(r['id']) for r in data['roster']]
    qs = sorted(S['qs'])
    lineups = sorted(S['lineups'].values(), key=lambda L: -(L['sec'] or (L['pf'] + L['pa'])))
    return {
        'app': 'mystat-tracker',
        'trackAll': bool(g.get('trackAll', True)),
        'periods': g['periods'], 'periodMinutes': g['periodMinutes'], 'clock': clock_on,
        'byPeriod': [[S['qs'][q]['us'], S['qs'][q]['them']] for q in qs],
        'starters': [m(p) for p in S['starters']],
        'pm': {m(pid): S['P'][pid]['pm'] for pid in S['P'] if m(pid) in players},
        'min': {m(pid): round(S['P'][pid]['sec'] / 60, 1) for pid in S['P'] if m(pid) in players} if clock_on else None,
        'dunks': {m(pid): S['P'][pid]['dunk'] for pid in S['P'] if S['P'][pid]['dunk']},
        'shots': [[m(s[0])] + s[1:9] + [m(s[9]) if s[9] and s[9] != 'tm' else s[9]] for s in S['shots']],
        'assists': {m(a): {('rest' if b == 'rest' else m(b)): n for b, n in v.items()} for a, v in S['assists'].items()},
        'extras': dict(S['x']),
        'lineups': [[[m(p) for p in L['ids']], L['sec'], L['pf'], L['pa']] for L in lineups if L['ids'] and (L['sec'] or L['pf'] or L['pa'])],
        'flow': S['flow'], 'leadChanges': S['changes'], 'ties': S['ties'], 'maxLead': S['max_lead'], 'maxDeficit': S['max_def'],
        'bestRun': S['best_run'],
    }
