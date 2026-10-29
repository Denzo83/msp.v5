#!/usr/bin/env python3
"""One-off migration: MyStatPro v4 data -> v5 name-based data.

v4 stored every stat line under the jersey number only, so a number worn by
more than one person got merged. This script rebuilds each game with a named
player on every line:

  1. If the original EasyStats export for that game is in v4's
     "data/game htmls" folder, the names come straight from the export
     (lines are matched on their exact stats, so renumbering doesn't matter).
  2. Otherwise the number is looked up in that team's v4 roster.
  3. data/overrides.json can force any line to a different player.

Every game that relied on step 2 is listed in data/migration-report.md so
you can check it. Re-running is safe: it rebuilds data/games from scratch.

Usage:
    python tools/migrate_v4.py path/to/mystats.pro-v4 exports [more/export/folders ...]
"""

import shutil
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (DATA, GAMES_DIR, ROOT, load_json, norm, parse_export, save_json,
                    season_key, short_form, slug, stat_signature)

TEAMS = load_json(DATA / 'teams.json')
V4_FOLDERS = {'pretty-good': 'pretty-good', 'chuckers-chuckers': 'chuckers-chuckers', 'all-stars': 'all-stars'}


def shrink(path, size=480):
    """Resize big photos so the site loads fast on phones (needs Pillow; skipped if missing)."""
    try:
        from PIL import Image
    except ImportError:
        return
    with Image.open(path) as im:
        if max(im.size) <= size:
            return
        im.thumbnail((size, size))
        im.save(path, optimize=True)


def team_for(name):
    n = norm(name)
    for tid, t in TEAMS.items():
        if n in [norm(v) for v in t['variants']]:
            return tid
    return None


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    force = '--force' in sys.argv
    argv = [a for a in sys.argv[1:] if a != '--force']
    v4 = Path(argv[0])
    extra = [Path(p) for p in argv[1:]]

    # safety: this rebuilds data/games from v4, so stop if games were added since
    v4_ids = {f'{tid}/{f.stem}' for tid, folder in V4_FOLDERS.items() for f in (v4 / 'data' / folder / 'games').glob('*.json')}
    newer = [f'{f.parent.name}/{f.stem}' for f in GAMES_DIR.rglob('*.json') if f'{f.parent.name}/{f.stem}' not in v4_ids] if GAMES_DIR.exists() else []
    if newer and not force:
        sys.exit(f'Stopped: {len(newer)} game(s) were added after the migration (e.g. {newer[0]}) and re-running would delete them. '
                 'Add --force if you really want to rebuild from v4.')

    # ---- exports we still have, indexed by (team, date)
    exports = defaultdict(list)
    export_files = list((v4 / 'data' / 'game htmls').rglob('*.html'))
    for folder in extra:
        export_files += list(folder.rglob('*.html'))
    for f in export_files:
        try:
            ex = parse_export(f)
        except ValueError as e:
            print(f'  skipped {f.name}: {e}')
            continue
        tid = team_for(ex['home']) or team_for(ex['away'])
        if tid and not any(e['rows'] == ex['rows'] for e in exports[(tid, ex['date'])]):
            ex['file'] = f.name
            exports[(tid, ex['date'])].append(ex)

    # ---- collect every name we know about
    rosters = {tid: load_json(v4 / 'data' / folder / 'players.json', {}) for tid, folder in V4_FOLDERS.items()}
    names = {}  # name -> info
    for tid, roster in rosters.items():
        for num, p in roster.items():
            info = names.setdefault(p['name'], {'positions': set(), 'images': {}})
            if p.get('position'):
                info['positions'].add(p['position'])
            img = p.get('images', {}).get('portrait')
            if img:
                info['images'][tid] = img
    for exs in exports.values():
        for ex in exs:
            for r in ex['rows']:
                names.setdefault(r['name'], {'positions': set(), 'images': {}})

    def is_full(n):
        parts = n.split()
        return len(parts) >= 2 and not parts[0].endswith('.')

    players, alias_of = {}, {}
    for n in sorted(names):
        if is_full(n):
            pid = slug(n)
            players[pid] = {'name': n, 'short': short_form(n), 'aliases': [], 'position': '', 'images': {}}
            alias_of[n] = pid
    for n in sorted(names):
        if n in alias_of:
            continue
        parts = n.split()
        match = []
        if len(parts) >= 2 and parts[0].endswith('.'):
            initial, surname = parts[0][0].lower(), ' '.join(parts[1:]).lower()
            match = [pid for pid, p in players.items()
                     if p['name'].split()[0][0].lower() == initial
                     and ' '.join(p['name'].split()[1:]).lower() == surname]
        if len(match) == 1:
            alias_of[n] = match[0]
            if n != players[match[0]]['short']:
                players[match[0]]['aliases'].append(n)
        else:
            pid = slug(n)
            players[pid] = {'name': n, 'short': n, 'aliases': [], 'position': '', 'images': {}}
            alias_of[n] = pid

    # positions and photos (photo files are copied into assets/players)
    (ROOT / 'assets' / 'players').mkdir(parents=True, exist_ok=True)
    (ROOT / 'assets' / 'teams').mkdir(parents=True, exist_ok=True)
    for n, info in names.items():
        p = players[alias_of[n]]
        if info['positions'] and not p['position']:
            p['position'] = sorted(info['positions'])[0]
        for tid, img in info['images'].items():
            src = v4 / img
            if not src.exists() or 'placeholder' in src.name:
                continue
            dest = ROOT / 'assets' / 'players' / src.name.lower()
            shutil.copyfile(src, dest)
            shrink(dest)
            rel = f'assets/players/{dest.name}'
            p['images'].setdefault('default', rel)
            if rel != p['images']['default']:
                p['images'][tid] = rel
    for tid, t in TEAMS.items():
        src = v4 / 'Assets' / 'teams' / f'{tid}-logo.png'
        if src.exists():
            shutil.copyfile(src, ROOT / t['logo'])

    overrides = load_json(DATA / 'overrides.json', {})

    # ---- rebuild games
    if GAMES_DIR.exists():
        shutil.rmtree(GAMES_DIR)
    report = defaultdict(list)
    counts = defaultdict(int)
    for tid, folder in V4_FOLDERS.items():
        meta = load_json(v4 / 'data' / folder / 'seasons_meta.json', {})
        roster = rosters[tid]
        for gf in sorted((v4 / 'data' / folder / 'games').glob('*.json')):
            g = load_json(gf)
            raw_season = g['season'].replace('--', '-')
            disp = (meta.get(g['season']) or meta.get(raw_season) or {}).get('display_name')
            skey = season_key(disp) if disp else season_key(raw_season.replace('-', ' '))
            gid = gf.stem
            ex_list = exports.get((tid, g['date']), [])
            ex = ex_list[0] if len(ex_list) == 1 else None
            by_sig = {}
            if ex:
                for r in ex['rows']:
                    if r['played']:
                        by_sig.setdefault(stat_signature(r), []).append(r)

            lines = []
            for num, s in g['stats'].items():
                fg, tp, ft = s.get('fg') or [0, 0], s.get('3pt') or [0, 0], s.get('ft') or [0, 0]
                line = {'fgm': fg[0], 'fga': fg[1], 'tpm': tp[0], 'tpa': tp[1], 'ftm': ft[0], 'fta': ft[1],
                        'oreb': s.get('oreb') or 0, 'dreb': s.get('dreb') or 0, 'pf': s.get('foul') or 0,
                        'stl': s.get('stl') or 0, 'to': s.get('to') or 0, 'blk': s.get('blk') or 0,
                        'ast': s.get('asst') or 0, 'pts': s.get('pts') or 0}
                hit = by_sig.get(stat_signature(line), [])
                forced = overrides.get(f'{tid}/{gid}', {}).get(num)
                if forced:
                    pid, how = forced, 'override'
                elif len(hit) == 1:
                    pid, how = alias_of[hit[0]['name']], 'export'
                    num = hit[0]['number']
                elif num in roster:
                    pid, how = alias_of[roster[num]['name']], 'roster'
                else:
                    pid, how = f'unknown-{tid}-{num}', 'unknown'
                    players.setdefault(pid, {'name': f'Unknown #{num}', 'short': f'#{num}', 'aliases': [], 'position': '', 'images': {}})
                counts[how] += 1
                if how in ('roster', 'unknown'):
                    report[(tid, skey, num)].append((g['date'], gid, pid, line['pts']))
                lines.append({'p': pid, 'n': num, **line})

            dnp = []
            if ex:
                seen = {l['p'] for l in lines}
                for r in ex['rows']:
                    pid = alias_of[r['name']]
                    if not r['played'] and pid not in seen:
                        dnp.append({'p': pid, 'n': r['number']})

            game = {
                'id': gid, 'team': tid, 'date': g['date'], 'season': skey,
                'opponent': g['opponent'].strip(), 'home': g.get('homeAway') == 'home',
                'us': g['score']['us'], 'them': g['score']['them'], 'playoff': bool(g.get('isPlayoff')),
                'source': 'export' if ex else 'v4',
                'lines': sorted(lines, key=lambda l: -l['pts']), 'dnp': dnp,
            }
            save_json(GAMES_DIR / tid / f'{gid}.json', game)

    for p in players.values():
        p['aliases'] = sorted(set(p['aliases']))
    save_json(DATA / 'players.json', dict(sorted(players.items())))

    # ---- report
    out = ['# Migration report', '',
           f'Lines named from the original export: {counts["export"]}. '
           f'From the v4 roster (please check): {counts["roster"]}. '
           f'Overridden by hand: {counts["override"]}. Unknown: {counts["unknown"]}.', '',
           'Every game below had no export left, so the player was taken from the v4 roster by jersey number. '
           'If a line belongs to someone else, add it to `data/overrides.json`, for example:', '',
           '```json', '{ "pretty-good/2026-03-03-dkc": { "43": "jarren-owen" } }', '```', '',
           'then run the migration again.', '']
    for (tid, skey, num), items in sorted(report.items()):
        pid = items[0][2]
        out.append(f'## {TEAMS[tid]["name"]} · {skey} · #{num} → {players[pid]["name"]} ({len(items)} games)')
        out += [f'- {d} `{gid}` ({pts} pts)' for d, gid, _, pts in sorted(items)]
        out.append('')
    (DATA / 'migration-report.md').write_text('\n'.join(out), encoding='utf-8')

    print(f'Players: {len(players)}  Games written: {sum(1 for _ in GAMES_DIR.rglob("*.json"))}')
    print(f'Lines from exports: {counts["export"]}, from roster: {counts["roster"]}, '
          f'overrides: {counts["override"]}, unknown: {counts["unknown"]}')
    print('Report written to data/migration-report.md')


if __name__ == '__main__':
    main()
