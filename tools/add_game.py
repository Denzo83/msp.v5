#!/usr/bin/env python3
"""Add EasyStats exports to the site.

One script for every team: it works out which team played from the names in
the export. Players are matched by NAME (jersey numbers are only stored for
display), so a number change or a borrowed jersey never splits a player.

Examples
    python tools/add_game.py "Swish cheese vs Pretty good box-scores-27 Oct 2026.html" --season "2026 Spring" --opp-score 42
    python tools/add_game.py game.html --season "2026 Spring" --playoff --opp-score 51
    python tools/add_game.py *.html --season "2026 Spring"          (several at once; asks for each opponent score)

If the export has a name the site doesn't know yet, it stops and tells you.
Then either add them as a new player:
    --new "T. Smith"                     (shows as "T. Smith")
    --new "T. Smith=Tom Smith"           (shows as "Tom Smith")
or say it's someone who already exists, written differently:
    --link "T. Smith=tom-smith"

Options
    --season "2026 Spring"   season name (defaults to the team's latest season)
    --playoff                mark as a playoff game
    --opp-score N            opponent's score (EasyStats usually exports 0)
    --team-score N           our real final score, for teams where only some players are
                             stat-tracked (Chuckers); otherwise it's the export's total
    --team pretty-good       only needed if the team name in the export isn't recognised
    --replace                overwrite a game that's already been added
    --dry-run                show what would be saved without saving
"""

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import build
from common import (DATA, GAMES_DIR, PLAYERS_FILE, Roster, load_json, norm, parse_export, save_json,
                    season_key, season_name, short_form, slug)


def find_team(teams, ex, forced):
    if forced:
        if forced not in teams:
            sys.exit(f'Unknown team "{forced}". Choose one of: {", ".join(teams)}')
        side = 'home' if norm(ex['home']) in [norm(v) for v in teams[forced]['variants']] else 'away'
        return forced, side
    for tid, t in teams.items():
        variants = [norm(v) for v in t['variants']]
        if norm(ex['home']) in variants:
            return tid, 'home'
        if norm(ex['away']) in variants:
            return tid, 'away'
    sys.exit(f'Neither "{ex["home"]}" nor "{ex["away"]}" is one of our teams. '
             f'Use --team, or add the spelling to "variants" in data/teams.json.')


def suggestions(players, name):
    surname = norm(name).split(' ')[-1]
    return [pid for pid, p in players.items() if norm(p['name']).split(' ')[-1] == surname]


def main():
    ap = argparse.ArgumentParser(description='Add EasyStats exports to MyStatPro', add_help=True)
    ap.add_argument('files', nargs='+')
    ap.add_argument('--season')
    ap.add_argument('--playoff', action='store_true')
    ap.add_argument('--opp-score', type=int)
    ap.add_argument('--team-score', type=int)
    ap.add_argument('--team')
    ap.add_argument('--new', action='append', default=[])
    ap.add_argument('--link', action='append', default=[])
    ap.add_argument('--replace', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    teams = load_json(DATA / 'teams.json')
    players = load_json(PLAYERS_FILE, {})

    # apply --new / --link first so this run can use them
    changed = False
    for item in args.new:
        export_name, _, display = item.partition('=')
        export_name, display = export_name.strip(), (display or export_name).strip()
        pid = slug(display)
        if pid in players:
            sys.exit(f'A player with id "{pid}" already exists ({players[pid]["name"]}). Use --link instead.')
        players[pid] = {'name': display, 'short': short_form(display), 'aliases': [], 'images': {}}
        if norm(export_name) != norm(display) and norm(export_name) != norm(short_form(display)):
            players[pid]['aliases'].append(export_name)
        print(f'New player: {display} ({pid})')
        changed = True
    for item in args.link:
        export_name, _, pid = item.partition('=')
        pid = pid.strip()
        if pid not in players:
            sys.exit(f'No player with id "{pid}". Player ids are in data/players.json.')
        players[pid].setdefault('aliases', []).append(export_name.strip())
        print(f'"{export_name.strip()}" now means {players[pid]["name"]}')
        changed = True
    roster = Roster(players)

    saved = 0
    for path in args.files:
        ex = parse_export(path)
        tid, side = find_team(teams, ex, args.team)
        other = 'away' if side == 'home' else 'home'
        opponent = ex[other].strip()

        # season
        existing = [load_json(f) for f in (GAMES_DIR / tid).glob('*.json')] if (GAMES_DIR / tid).exists() else []
        if args.season:
            skey = season_key(args.season)
        elif existing:
            skey = max(existing, key=lambda g: g['date'])['season']
            print(f'No --season given, using the team\'s latest: {season_name(skey)}')
        else:
            sys.exit('This team has no games yet, so please give --season "2026 Spring".')

        # names
        problems, lines, dnp = [], [], []
        for r in ex['rows']:
            pid, why = roster.resolve(r['name'])
            if not pid:
                hint = suggestions(players, r['name'])
                extra = f' Did you mean: {", ".join(hint)}? (use --link "{r["name"]}=<id>")' if hint else ''
                problems.append(f'  #{r["number"]} {why}.{extra}')
                continue
            stats = {k: r[k] for k in ('fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'pf', 'stl', 'to', 'blk', 'ast', 'pts')}
            if r['played']:
                lines.append({'p': pid, 'n': r['number'], **stats})
            else:
                dnp.append({'p': pid, 'n': r['number']})
        if problems:
            print(f'\n{Path(path).name}: some names need sorting out before this game can be added:')
            print('\n'.join(problems))
            print('\nAdd them with --new "Name" (or --new "Short=Full Name"), or --link "Name=player-id".')
            sys.exit(1)
        ids = [l['p'] for l in lines + dnp]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            sys.exit(f'{Path(path).name}: {", ".join(dupes)} appear more than once in this export.')

        us = ex[side + '_score']
        if args.team_score is not None:
            us = args.team_score
        elif teams[tid].get('partialStats') and sys.stdin.isatty() and not args.dry_run:
            ans = input(f'{ex["date"]} vs {opponent}: only some {teams[tid]["name"]} players are tracked, so the export says {us}. '
                        f'Enter the real final score (Enter to keep {us}): ').strip()
            us = int(ans) if ans else us
        them = args.opp_score
        if them is None:
            them = ex[other + '_score']
            if them == 0 and sys.stdin.isatty() and not args.dry_run:
                ans = input(f'{ex["date"]} vs {opponent}: opponent score is 0 in the export. Enter their score (Enter to keep 0): ').strip()
                them = int(ans) if ans else 0

        gid = f'{ex["date"]}-{slug(opponent)}'
        out = GAMES_DIR / tid / f'{gid}.json'
        if out.exists() and not args.replace:
            print(f'Skipped {Path(path).name}: {tid}/{gid} is already added (use --replace to overwrite).')
            continue
        game = {
            'id': gid, 'team': tid, 'date': ex['date'], 'season': skey, 'opponent': opponent,
            'home': side == 'home', 'us': us, 'them': them, 'playoff': args.playoff, 'source': 'export',
            'lines': sorted(lines, key=lambda l: -l['pts']), 'dnp': dnp,
        }
        result = 'W' if us > them else 'L' if us < them else 'T'
        print(f'{teams[tid]["name"]} {us}-{them} {opponent} ({result}) · {ex["date"]} · {season_name(skey)}'
              f'{" · playoff" if args.playoff else ""} · {len(lines)} played, {len(dnp)} DNP')
        if not args.dry_run:
            save_json(out, game)
            keep = DATA.parent / 'exports' / tid / f'{gid}.html'
            keep.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, keep)
            saved += 1

    if args.dry_run:
        print('Dry run: nothing saved.')
        return
    if changed:
        save_json(PLAYERS_FILE, dict(sorted(players.items())))
    if saved or changed:
        build()


if __name__ == '__main__':
    main()
