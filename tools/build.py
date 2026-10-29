#!/usr/bin/env python3
"""Build data/bundle.json, the single file the website loads.

Run this after changing anything in data/ by hand. add_game.py runs it for
you automatically.

    python tools/build.py
"""

import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BUNDLE_FILE, DATA, GAMES_DIR, STAT_KEYS, load_json, save_json, season_name


def build(quiet=False):
    teams = load_json(DATA / 'teams.json')
    players = load_json(DATA / 'players.json', {})
    games, warnings, seasons = [], [], set()
    opp_alias = {k: v for k, v in load_json(DATA / 'opponents.json', {}).items() if not k.startswith('_')}

    def opp_key(name):
        name = opp_alias.get(name, name)
        return re.sub(r'[^a-z0-9]', '', name.lower().replace('\u2019', '').replace("'", ''))

    spellings = defaultdict(Counter)
    rules = load_json(DATA / 'numbers.json', {}).get('rules', [])

    def number_for(pid, team, date, typed):
        for r in rules:
            if r['player'] == pid and r['team'] == team and date >= r['from'] and date <= r.get('until', '9999'):
                return str(r['number'])
        return typed

    for f in sorted(GAMES_DIR.rglob('*.json')):
        g = load_json(f)
        seasons.add(g['season'])
        if g['team'] not in teams:
            warnings.append(f'{f.name}: unknown team "{g["team"]}"')
        lines = []
        for l in g['lines']:
            if l['p'] not in players:
                warnings.append(f'{f.name}: line for unknown player "{l["p"]}"')
            calc = 2 * (l['fgm'] - l['tpm']) + 3 * l['tpm'] + l['ftm']
            if calc != l['pts']:
                warnings.append(f'{f.name}: {l["p"]} has {l["pts"]} pts but shots add up to {calc}')
            lines.append([l['p'], number_for(l['p'], g['team'], g['date'], l['n'])] + [l[k] for k in STAT_KEYS])
        total = sum(l['pts'] for l in g['lines'])
        if total != g['us'] and not teams.get(g['team'], {}).get('partialStats'):
            warnings.append(f'{f.name}: player points add to {total}, team score is {g["us"]}')
        ok = opp_key(g['opponent'])
        spellings[ok][opp_alias.get(g['opponent'], g['opponent'])] += 1
        games.append({
            'id': g['id'], 't': g['team'], 'd': g['date'], 's': g['season'], 'o': ok,
            'h': 1 if g['home'] else 0, 'us': g['us'], 'them': g['them'], 'po': 1 if g['playoff'] else 0,
            'L': lines, 'D': [[d['p'], number_for(d['p'], g['team'], g['date'], d['n'])] for d in g.get('dnp', [])],
        })

    order = {'summer': 0, 'autumn': 1, 'fall': 1, 'winter': 2, 'spring': 3}
    season_list = sorted(seasons, key=lambda k: (k.split('-')[0], order.get(k.partition('-')[2], 9), k))
    bundle = {
        'version': 5,
        'statKeys': STAT_KEYS,
        'teams': teams,
        'players': players,
        'seasons': [{'key': k, 'name': season_name(k)} for k in season_list],
        'opponents': {k: max(c.items(), key=lambda kv: (kv[1], sum(ch.isupper() for ch in kv[0])))[0]
                      for k, c in sorted(spellings.items())},
        'games': sorted(games, key=lambda g: (g['d'], g['t'])),
    }
    save_json(BUNDLE_FILE, bundle, compact=True)
    if not quiet:
        print(f'Built data/bundle.json: {len(games)} games, {len(players)} players, {len(season_list)} seasons')
    for w in warnings:
        print(f'  check: {w}')
    return bundle


if __name__ == '__main__':
    build()
