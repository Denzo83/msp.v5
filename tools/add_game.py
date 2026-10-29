#!/usr/bin/env python3
"""Add games to the site: EasyStats exports or MyStat Tracker files (.mstat.json).

One script for every team: it works out which team played from the names in
the export. Players are matched by NAME (jersey numbers are only stored for
display), so a number change or a borrowed jersey never splits a player.

Examples
    python tools/add_game.py "Swish cheese vs Pretty good box-scores-27 Oct 2026.html" --season "2026 Spring" --opp-score 42
    python tools/add_game.py game.html --season "2026 Spring" --playoff --opp-score 51
    python tools/add_game.py *.html --season "2026 Spring"          (several at once; asks for each opponent score)

MyStat Tracker files carry the team, opponent, date, season, score and finals
flag themselves, so usually no options are needed:
    python tools/add_game.py 2026-10-29-chuckers-chuckers-vs-iceman.mstat.json
Players added on the phone are created automatically, unless their surname
matches someone already on the site; then it asks you to use --new or --link.

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
    --away                   (tracker files) the game was an away game; tracker games count as home otherwise
    --replace                overwrite a game that's already been added
    --dry-run                show what would be saved without saving
"""

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import build
from tracker_file import check_against_summary, load as load_tracker, replay as replay_tracker, tracked_block, was_on_court
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
    ap.add_argument('--away', action='store_true')
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
        if str(path).endswith('.mstat.json'):
            res = add_tracker_game(path, args, teams, players, roster)
            if res is None:
                continue
            if res == 'players':
                changed = True
                roster = Roster(players)
                continue
            saved += 1
            changed = changed or res == 'saved+players'
            continue
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


def add_tracker_game(path, args, teams, players, roster):
    """Add one MyStat Tracker file. Returns None (skipped), 'saved' or 'saved+players'."""
    data = load_tracker(path)
    g = data['game']
    tid = args.team or g['team']
    if tid not in teams:
        sys.exit(f'{Path(path).name}: unknown team "{tid}". Use --team.')
    if g.get('status') == 'live':
        print(f'Note: {Path(path).name} was exported before the game was finished on the phone.')

    # map phone ids to site ids, creating new players where it is safe
    idmap, new_players, problems = {}, [], []
    links = {}
    for item in args.link:
        name, _, pid = item.partition('=')
        links[norm(name)] = pid.strip()
    news = {norm(item.partition('=')[0]) for item in args.new}
    for r in data['roster']:
        if r['id'] in players:
            idmap[r['id']] = r['id']
            continue
        if norm(r['name']) in links:
            idmap[r['id']] = links[norm(r['name'])]
            continue
        pid, _ = roster.resolve(r['name'])
        if pid:
            idmap[r['id']] = pid
            continue
        hint = suggestions(players, r['name'])
        if hint and norm(r['name']) not in news:
            problems.append(f'  {r["name"]} is new on the phone. Did you mean: {", ".join(hint)}? '
                            f'Use --link "{r["name"]}=<id>", or --new "{r["name"]}" if it really is someone new.')
            continue
        pid = slug(r['name'])
        if pid in players:
            idmap[r['id']] = pid
            continue
        new_players.append((pid, r['name']))
        idmap[r['id']] = pid
    if problems:
        print(f'\n{Path(path).name}: some names need sorting out first:')
        print('\n'.join(problems))
        sys.exit(1)

    S = replay_tracker(data)
    diffs = check_against_summary(data, S)
    if diffs:
        print(f'{Path(path).name}: the phone and this script disagree, using the replay:')
        print('\n'.join('  ' + d for d in diffs[:10]))

    nums = {r['id']: str(r.get('num') or '') for r in data['roster']}
    lines, dnp = [], []
    for r in data['roster']:
        p = S['P'][r['id']]
        played = any(p[k] for k in ('fga', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'to', 'pf')) or p['sec'] > 0 or was_on_court(data, r['id'])
        row = {'p': idmap[r['id']], 'n': nums[r['id']]}
        if played:
            row.update({k: p[k] for k in ('fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'pf', 'stl', 'to', 'blk', 'ast', 'pts')})
            lines.append(row)
        else:
            dnp.append(row)

    season_text = (args.season or g.get('season') or '').strip()
    if not season_text:
        sys.exit(f'{Path(path).name}: no season on the phone, so please give --season "2026 Spring".')
    try:
        skey = season_key(season_text)
    except ValueError as err:
        sys.exit(f'{Path(path).name}: {err}. Use --season "2026 Spring".')
    opponent = g['opponent'].strip()
    gid = f'{g["date"]}-{slug(opponent)}'
    out = GAMES_DIR / tid / f'{gid}.json'
    if out.exists() and not args.replace:
        print(f'Skipped {Path(path).name}: {tid}/{gid} is already added (use --replace to overwrite).')
        return None
    us = args.team_score if args.team_score is not None else S['us']
    them = args.opp_score if args.opp_score is not None else S['them']
    game = {
        'id': gid, 'team': tid, 'date': g['date'], 'season': skey, 'opponent': opponent,
        'home': not args.away and g.get('home', True), 'us': us, 'them': them, 'playoff': bool(args.playoff or g.get('final')),
        'source': 'tracker', 'lines': sorted(lines, key=lambda l: -l['pts']), 'dnp': dnp,
        'tracked': tracked_block(data, S, idmap),
    }
    result = 'W' if us > them else 'L' if us < them else 'T'
    print(f'{teams[tid]["name"]} {us}-{them} {opponent} ({result}) · {g["date"]} · {season_name(skey)}'
          f'{" · finals" if game["playoff"] else ""} · {len(lines)} played, {len(dnp)} DNP · '
          f'{len(game["tracked"]["shots"])} shots with a spot')
    for pid, name in new_players:
        print(f'New player: {name} ({pid})')
    if args.dry_run:
        return None
    for pid, name in new_players:
        players[pid] = {'name': name, 'short': short_form(name), 'aliases': [], 'images': {}}
    save_json(out, game)
    keep = DATA.parent / 'exports' / tid / f'{gid}.mstat.json'
    keep.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, keep)
    return 'saved+players' if new_players else 'saved'


if __name__ == '__main__':
    main()
