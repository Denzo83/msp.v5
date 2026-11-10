"""Refresh the newer tracker extras (quarter stats, shot quarters, technicals) on games
already on the site, without touching their box score lines (some were merged by hand).

    python3 tools/refresh_tracked.py
"""
import json
from pathlib import Path

from tracker_file import load, replay, tracked_block

ROOT = Path(__file__).resolve().parent.parent
KEYS = ('shots', 'byQ', 'tech', 'techs', 'pa')

for gf in sorted((ROOT / 'data' / 'games').glob('*/*.json')):
    game = json.loads(gf.read_text(encoding='utf-8'))
    src = ROOT / 'exports' / gf.parent.name / (gf.stem + '.mstat.json')
    if 'tracked' not in game or not src.exists():
        continue
    data = load(src)
    known = {l['p'] for l in game['lines']} | {d['p'] for d in game.get('dnp', [])} | set(game['tracked'].get('pm', {}))
    idmap = {r['id']: r['id'] for r in data['roster']}
    missing = [r['id'] for r in data['roster'] if r['id'] not in known]
    if missing:
        print(f'{gf.name}: skipped, roster ids not in the game: {missing}')
        continue
    block = tracked_block(data, replay(data), idmap)
    for k in KEYS:
        game['tracked'][k] = block[k]
    gf.write_text(json.dumps(game, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{gf.parent.name}/{gf.name}: refreshed')
