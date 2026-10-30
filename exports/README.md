# Original game files

Every game added with `tools/add_game.py` keeps a copy of the file it came from here, in a folder per team:

- `*.html`: EasyStats box-score exports
- `*.mstat.json`: MyStat Tracker files (every play, shot spot, assist and sub)

They are named after the game (`<date>-<opponent>`), matching `data/games/<team>/`. Keep them: the site can always be rebuilt or re-checked from these.

## Games with no original file

These came over from v4, which only kept its own game data, so no export exists for them yet. If you re-export one from EasyStats, add it with `python tools/add_game.py <file>.html --replace` (plus `--opp-score` and, for Chuckers, `--team-score`). That updates the game with the real names and saves the file here.

### all-stars (2)

- 2026-09-21-castle-rollers
- 2026-10-19-revo-rim-shots

### chuckers-chuckers (14)

- 2026-02-08-obl
- 2026-02-12-burnt-ants
- 2026-03-05-circle-dirks
- 2026-03-12-post-peaks
- 2026-03-26-brickshow
- 2026-04-02-kobe-wan-kenobi
- 2026-04-09-obl
- 2026-04-16-burnt-ants
- 2026-05-22-sob
- 2026-07-16-sob
- 2026-07-30-playoff-jimmy-buckets
- 2026-08-06-the-grubs
- 2026-08-13-noideer
- 2026-08-20-btk

### pretty-good (32)

- 2026-01-27-taco-tuesday-s
- 2026-02-03-little-big-men
- 2026-02-10-dkc
- 2026-02-17-taco-tuesdays
- 2026-02-24-taco-tuesdays
- 2026-03-03-dkc
- 2026-03-10-rice
- 2026-03-17-little-big-men
- 2026-03-24-wins-n-tins
- 2026-03-31-taco-tuesdays
- 2026-04-07-dkc
- 2026-04-21-little-big-men
- 2026-04-28-little-big-men
- 2026-05-05-wins-n-tins
- 2026-05-19-little-big-men
- 2026-05-26-taco-tuesdays
- 2026-06-02-wins-n-tins
- 2026-06-09-rippit-good
- 2026-06-16-rice
- 2026-06-23-macho-men
- 2026-06-30-taco-tuesdays
- 2026-07-07-wins-n-tins
- 2026-07-14-rippit-good
- 2026-07-21-rice
- 2026-07-28-macho-men
- 2026-08-04-taco-tuesdays
- 2026-08-11-wins-n-tins
- 2026-08-18-rippit-good
- 2026-08-25-rice
- 2026-09-22-taco-tuesdays
- 2026-09-29-rice
- 2026-10-06-swish-cheese
