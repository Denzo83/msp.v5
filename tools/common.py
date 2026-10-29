"""Shared helpers for the MyStatPro v5 tools.

Everything here uses only the Python standard library, so the tools run
anywhere Python 3.8+ is installed (no pip installs needed).
"""

import json
import re
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
GAMES_DIR = DATA / 'games'
PLAYERS_FILE = DATA / 'players.json'
TEAMS_FILE = DATA / 'teams.json'
BUNDLE_FILE = DATA / 'bundle.json'

STAT_KEYS = ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'pf', 'stl', 'to', 'blk', 'ast', 'pts']


# ---------------------------------------------------------------- json io

def load_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path, data, compact=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        if compact:
            json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
        else:
            json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')


# ---------------------------------------------------------------- names

def norm(name):
    """Normalise a name for matching: 'K.  Denzin' -> 'k denzin'."""
    return re.sub(r'\s+', ' ', name.replace('.', ' ').strip().lower()).strip()


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def short_form(full):
    """'Kyle Denzin' -> 'K. Denzin'. Single names stay as they are."""
    parts = full.split()
    if len(parts) < 2 or parts[0].endswith('.'):
        return full
    return f'{parts[0][0]}. {" ".join(parts[1:])}'


class Roster:
    """Name -> player id lookup built from data/players.json."""

    def __init__(self, players):
        self.players = players
        self.index = {}
        for pid, p in players.items():
            for alias in [p['name'], p.get('short', '')] + p.get('aliases', []):
                if alias:
                    self.index.setdefault(norm(alias), set()).add(pid)

    def resolve(self, name):
        """Return (player_id, None) or (None, reason)."""
        hits = self.index.get(norm(name), set())
        if len(hits) == 1:
            return next(iter(hits)), None
        if len(hits) > 1:
            return None, f'"{name}" matches more than one player: {", ".join(sorted(hits))}'
        return None, f'"{name}" is not a known player'


# ---------------------------------------------------------------- seasons

def season_key(text):
    """'2026 Spring' -> '2026-spring'."""
    m = re.match(r'^\s*(\d{4})\s*[- ]*\s*([A-Za-z]+)?\s*$', text or '')
    if not m:
        raise ValueError(f'Season should look like "2026 Spring", got "{text}"')
    year, part = m.group(1), (m.group(2) or 'season').lower()
    return f'{year}-{part}'


def season_name(key):
    year, _, part = key.partition('-')
    return f'{year} {part.title()}'


# ---------------------------------------------------------------- export parsing

class _ExportParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ''
        self.date = None
        self.rows = []
        self._in_title = False
        self._in_stats = False
        self._row = None
        self._cell = None
        self._detail = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title':
            self._in_title = True
        elif tag == 'table' and a.get('id') == 'stats':
            self._in_stats = True
        elif self._in_stats and tag == 'tr':
            self._row = []
        elif self._in_stats and tag in ('td', 'th') and self._row is not None:
            self._cell = ''
        elif tag == 'span' and a.get('class') == 'detail' and self.date is None:
            self._detail = True

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False
        elif tag == 'table' and self._in_stats:
            self._in_stats = False
        elif self._in_stats and tag in ('td', 'th') and self._cell is not None:
            self._row.append(self._cell.strip())
            self._cell = None
        elif self._in_stats and tag == 'tr' and self._row is not None:
            self.rows.append(self._row)
            self._row = None
        elif tag == 'span':
            self._detail = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._cell is not None:
            self._cell += data
        if self._detail and self.date is None and data.strip():
            self.date = data.strip()


def _pair(text):
    if not text or text == '-':
        return 0, 0
    m = re.match(r'^(\d+)\s*-\s*(\d+)$', text)
    if not m:
        raise ValueError(f'Expected "made-attempted", got "{text}"')
    return int(m.group(1)), int(m.group(2))


def _num(text):
    if not text or text == '-':
        return 0
    return int(text)


def parse_export(path):
    """Read an EasyStats box-score HTML export.

    Returns a dict with date, home/away team names and scores, and rows:
    [{'number', 'name', 'played', stats...}]. Column positions come from the
    header row because some exports leave out the percentage columns.
    """
    p = _ExportParser()
    p.feed(Path(path).read_text(encoding='utf-8', errors='replace'))
    m = re.match(r'^(.+?)\s+(\d+)\s+at\s+(.+?)\s+(\d+)\s*$', p.title.strip())
    if not m:
        raise ValueError(f'Could not read the teams and score from the title "{p.title}"')
    try:
        date = datetime.strptime(p.date, '%d %b %Y').strftime('%Y-%m-%d')
    except (TypeError, ValueError):
        raise ValueError(f'Could not read the game date ("{p.date}")')
    if not p.rows:
        raise ValueError('No stats table found in the export')

    header = [h.lower() for h in p.rows[0]]
    col = {h: i for i, h in reversed(list(enumerate(header))) if h}
    need = ['fg', '3pt', 'ft', 'oreb', 'dreb', 'foul', 'stl', 'to', 'blk', 'asst', 'pts']
    missing = [c for c in need if c not in col]
    if missing:
        raise ValueError(f'Export is missing columns: {", ".join(missing)}')

    rows = []
    for r in p.rows[1:]:
        if not r:
            continue
        m2 = re.match(r'^#(\d+)\s+(.+)$', r[0].strip())
        if not m2:
            continue
        cells = r[1:]
        played = any(c.strip() not in ('-', '') for c in cells)

        def cell(key):
            i = col[key]
            return r[i] if i < len(r) else '-'

        fgm, fga = _pair(cell('fg'))
        tpm, tpa = _pair(cell('3pt'))
        ftm, fta = _pair(cell('ft'))
        rows.append({
            'number': m2.group(1), 'name': m2.group(2).strip(), 'played': played,
            'fgm': fgm, 'fga': fga, 'tpm': tpm, 'tpa': tpa, 'ftm': ftm, 'fta': fta,
            'oreb': _num(cell('oreb')), 'dreb': _num(cell('dreb')), 'pf': _num(cell('foul')),
            'stl': _num(cell('stl')), 'to': _num(cell('to')), 'blk': _num(cell('blk')),
            'ast': _num(cell('asst')), 'pts': _num(cell('pts')),
        })
    return {
        'date': date,
        'away': m.group(1).strip(), 'away_score': int(m.group(2)),
        'home': m.group(3).strip(), 'home_score': int(m.group(4)),
        'rows': rows,
    }


def stat_signature(line):
    return tuple(line.get(k, 0) for k in STAT_KEYS)
