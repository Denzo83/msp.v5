# MyStatPro v5

Stats, leaders, records and box scores for **Pretty Good**, **Chuckers Chuckers** and **All Stars**, in one site.
It runs on GitHub Pages with no build step: the browser loads `data/bundle.json` and works everything out from there.

## What changed from v4

- **Players are matched by name, not jersey number.** A number change, a borrowed jersey or three people wearing #43 no longer mixes up anyone's stats. The number each person wore is still saved on every game, for display.
- **One site, one parser** for all three teams. A player who plays for more than one team has a single page, and every page can show one team or all teams combined.
- **New screens:** team home, player pages (Overview, Stats, Game Log, Versus), leaders, records and games with full box scores. Dark mode is the default, with a light mode toggle.

## Adding a game

You need Python 3.8 or newer. Nothing else needs installing.

```bash
python tools/add_game.py "Swish cheese vs Pretty good box-scores-27 Oct 2026.html" --season "2026 Spring" --opp-score 42
git add -A && git commit -m "Add Swish cheese game" && git push
```

- The team is worked out from the export, so the same command works for every team.
- Add `--playoff` for finals games. The site labels a season's first finals game as the Semi Final and the second as the Grand Final.
- Use `--opp-score` because EasyStats usually exports the opponent's score as 0. If you leave it off, it will ask.
- **Chuckers:** only some players are tracked, so the export's total isn't the real score. Add `--team-score 40`, or it will ask.
- Leave off `--season` to use the team's latest season.
- Pass several files at once to add a batch.
- A copy of every export is kept in `exports/`, so names can always be re-checked later.

### New or unknown names

If an export has a name the site hasn't seen, nothing is saved. It tells you which name it doesn't know, and you re-run the command with one of these:

```bash
--new "T. Smith"                  # new player, shown as "T. Smith"
--new "T. Smith=Tom Smith"        # new player, shown as "Tom Smith"
--link "T. Smith=tom-smith"       # an existing player, written differently
```

Player ids, names and photos are all in `data/players.json`, which you can edit by hand. After any hand edit, run `python tools/build.py`.

## Files

| Path | What it is |
|------|------------|
| `index.html`, `assets/` | The site. `assets/players/` holds the photos and `assets/teams/` the logos. |
| `data/games/<team>/<game>.json` | One file per game. This is the source of truth. |
| `data/players.json` | Every player: name, short name, other spellings and photo. |
| `data/teams.json` | Team names, colours, logos and the spellings used in exports. |
| `data/numbers.json` | Jersey numbers actually worn when they differ from EasyStats, like Tim taking #43 and Levi moving to #17. |
| `data/opponents.json` | Extra opponent spellings to merge, like "Kone wankenobi" into "Kobe wan kenobi". |
| `data/bundle.json` | Built from everything above by `tools/build.py`. Don't edit it. |
| `exports/` | The original EasyStats exports. |
| `tools/` | `add_game.py`, `build.py`, and the one-off `migrate_v4.py`. |

## Player photos

1. Put the original image in `assets/players/originals/`, named after the player id:
   - `kyle-denzin.jpg` for the main photo
   - `kyle-denzin--all-stars.jpg` for a different photo on one team
2. Run `python tools/photos.py`. This needs `pip install pillow numpy` once.

The script frames every photo the same way. It finds the top of the hair and the width of the head, then crops so they land in the same place on every card. That way a player's photo doesn't jump around when you switch teams, and nobody's hair gets cut off. It then updates `data/players.json` and rebuilds the site data. A player without a photo shows their initials.

## The v4 migration

`tools/migrate_v4.py` rebuilt every v4 game with a named player on each line. Where the original export still existed, names came straight from it. For the rest, the name came from v4's roster by jersey number. Those games are listed in `data/migration-report.md`.

To fix a wrong line, add it to `data/overrides.json`:

```json
{ "pretty-good/2026-03-03-dkc": { "43": "jarren-owen" } }
```

Then re-run `python tools/migrate_v4.py ../mystats.pro-v4 exports`. Or simply put the original export into `exports/<team>/` and re-run it. The script refuses to run once newer games have been added, so it can't wipe them by accident.

## MyStat Tracker (tracker/)

`tracker/` is a separate phone app for entering stats while you watch a game replay, instead of EasyStats. It shares no code with the site, so it can move to its own repo later.

- Open `https://denzo83.github.io/msp.v5/tracker/` on the phone and use **Add to Home Screen**. It then opens full-screen and works offline.
- Every tap saves on the phone straight away. Games stay there until you delete them.
- On first load it reads player names from `data/bundle.json`, so names match the site. Players added during a game are marked as new.
- **Track every player** off (the default for Chuckers) tracks only the ticked players; everyone else scores on the Rest of team buttons so the score stays right.
- Each game exports as one `.mstat.json` file: the game details, the roster and a list of every event (shot with court x/y and zone, shot type, assist, fast break, second chance, points off turnover, and-1, rebounds, steals, blocks, turnovers, fouls, subs, opponent scores, quarter ends, clock times). It also carries a box score summary for checking.
- Add a tracker game to the site with `python tools/add_game.py 2026-10-29-chuckers-chuckers-vs-iceman.mstat.json`. The file already has the team, opponent, date, season, score and finals flag, so no options are usually needed (`--away`, `--season`, `--replace` and `--dry-run` work as for EasyStats files). Players added on the phone are created automatically, unless their surname matches someone already on the site; then it asks for `--new` or `--link`. A copy of the file is kept in `exports/<team>/`.
- Tracker games show extra stats on the site: minutes and +/- in the box score, game flow by quarter, team extras (paint, second-chance, fast-break and points off turnovers), a shot chart with zone percentages, who assisted who, and lineups. Player pages get a Tracked Games card on Overview and a **Shooting** tab: a shot chart (made shots are green circles, misses red crosses) or hot zones coloured by FG%, filters for 2PT/3PT and for one game or all of them, the best shot area, wheels for shot diet, 3s made by area, who they assist, assisted vs unassisted makes and who assists them, shot types, and on/off court +/- with their best teammates. Team pages get the same shot chart for the whole team.
- If the league logged a different score (like the 44–44 draw against The grubs), add `--official-score 44-44` and optionally `--score-note "..."`. The win, loss or draw follows the league's score for records and standings; the real score and every stat stay as tracked, with the note shown under the score.
- Every game is at the same stadium, so the site shows "vs" for all games. Which court each game was on lives in `data/courts.json` (every game is listed; fill in values like `"Court 1"` from the Newy Bball game log, then run `python tools/build.py`). The box score shows the court, player pages get a **Courts** tab (stats on each court, like Versus) and team pages a **By Court** record.
- After changing tracker files, bump `VERSION` in `tracker/sw.js` so phones pick up the new copy.

## Championship rings

Player pages show a ring for every championship (a grand final win) won by a team they played at least one game for that season. Each ring has the season's year on its side and the team's colour on its gems and banners (blue for Pretty Good, purple for Chuckers, amber for All Stars), with the season and team written under it. Tapping a ring opens that grand final.

The images live in `assets/rings/<team>-<year>.png` and are made from `assets/rings/originals/ring.jpg` by `python tools/rings.py` (needs `pip install pillow numpy opencv-python-headless`). Images exist up to 2027; run `python tools/rings.py 2030` to make later years.

## Hosting on GitHub Pages

Push this folder to a new repo, then go to **Settings → Pages → Deploy from a branch → `main` / root**. The site appears at `https://<username>.github.io/<repo>/`.

To try it on your own computer, run `python -m http.server` in this folder and open `http://localhost:8000`. Opening `index.html` directly from disk won't load the data.
