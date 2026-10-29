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
- Add `--playoff` for playoff games.
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

Player ids, names, positions and photos are all in `data/players.json`, which you can edit by hand. After any hand edit, run `python tools/build.py`.

## Files

| Path | What it is |
|------|------------|
| `index.html`, `assets/` | The site. `assets/players/` holds the photos and `assets/teams/` the logos. |
| `data/games/<team>/<game>.json` | One file per game. This is the source of truth. |
| `data/players.json` | Every player: name, short name, other spellings, position and photo. |
| `data/teams.json` | Team names, colours, logos and the spellings used in exports. |
| `data/opponents.json` | Extra opponent spellings to merge, like "Kone wankenobi" into "Kobe wan kenobi". |
| `data/bundle.json` | Built from everything above by `tools/build.py`. Don't edit it. |
| `exports/` | The original EasyStats exports. |
| `tools/` | `add_game.py`, `build.py`, and the one-off `migrate_v4.py`. |

## Player photos

Put the image in `assets/players/`, then set it in `data/players.json`:

```json
"kyle-denzin": { "images": { "default": "assets/players/kyle-denzin.png", "all-stars": "assets/players/k-denzin.png" } }
```

A team key, like `all-stars` above, sets a different photo for that team's pages. If a player has no photo, their initials show instead.

## The v4 migration

`tools/migrate_v4.py` rebuilt every v4 game with a named player on each line. Where the original export still existed, names came straight from it. For the rest, the name came from v4's roster by jersey number. Those games are listed in `data/migration-report.md`.

To fix a wrong line, add it to `data/overrides.json`:

```json
{ "pretty-good/2026-03-03-dkc": { "43": "jarren-owen" } }
```

Then re-run `python tools/migrate_v4.py ../mystats.pro-v4 exports`. Or simply put the original export into `exports/<team>/` and re-run it. The script refuses to run once newer games have been added, so it can't wipe them by accident.

## Hosting on GitHub Pages

Push this folder to a new repo, then go to **Settings → Pages → Deploy from a branch → `main` / root**. The site appears at `https://<username>.github.io/<repo>/`.

To try it on your own computer, run `python -m http.server` in this folder and open `http://localhost:8000`. Opening `index.html` directly from disk won't load the data.
