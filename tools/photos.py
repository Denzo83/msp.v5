#!/usr/bin/env python3
"""Make every player photo the same shape, size and framing.

Put the original image in assets/players/originals/, named
    <player-id>.png              the player's main photo
    <player-id>--<team-id>.png   a different photo for one team (e.g. kyle-denzin--all-stars.jpg)
then run
    python tools/photos.py

Each photo is lined up so the top of the hair sits at the same height and
the head is the same width and centred, so switching teams never makes the
picture jump. The results go to assets/players/<name>.jpg and
data/players.json is updated to point at them. Needs Pillow and numpy
(pip install pillow numpy).
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import build
from common import DATA, PLAYERS_FILE, ROOT, load_json, save_json

OUT_W, OUT_H = 400, 480          # portrait card shape used across the site (5:6)
HAIR_TOP = 0.09                  # top of hair, as a share of the height
HEAD_W = 0.40                    # head width, as a share of the width
SRC = ROOT / 'assets' / 'players' / 'originals'
DEST = ROOT / 'assets' / 'players'


def flatten(im):
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        a = np.asarray(im)
        opaque = a[..., 3] > 200
        bg = np.median(a[:8][opaque[:8]][:, :3], axis=0) if opaque[:8].any() else np.array([255, 255, 255])
        base = Image.new('RGB', im.size, tuple(int(c) for c in bg))
        base.paste(im, mask=im.split()[3])
        return base
    return im.convert('RGB')


def measure(im):
    """Return (hair_top_y, head_left_x, head_right_x) in image pixels.

    The cartoons have a dark outline round the head, so the dark pixels give the
    top of the hair and the width of the head whatever the background is.
    """
    a = np.asarray(im).astype(np.int32)
    h, w, _ = a.shape
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    dark = lum < 55
    c0, c1 = int(w * 0.22), int(w * 0.78)
    band = dark[:, c0:c1]
    counts = band.sum(axis=1)
    top = next((y for y in range(int(h * 0.01), h - 4) if counts[y] >= 3 and counts[y + 1] >= 3 and counts[y + 2] >= 3), 0)
    # light hair (blond, white) may have no dark outline on top, so also look for
    # the first rows that clearly differ from the plain background
    edge = np.concatenate([a[:8].reshape(-1, 3), a[:int(h * 0.3), :6].reshape(-1, 3), a[:int(h * 0.3), -6:].reshape(-1, 3)])
    bg = np.median(edge, axis=0)
    spread = np.percentile(np.abs(edge - bg).sum(axis=1), 90)
    differs = (np.abs(a - bg).sum(axis=2) > max(120, spread * 2))[:, c0:c1].mean(axis=1)
    alt = next((y for y in range(int(h * 0.01), h - 4) if differs[y] > 0.05 and differs[y + 1] > 0.05 and differs[y + 2] > 0.05), top)
    top = min(top, alt)
    lefts, rights = [], []
    for y in range(top + int(w * 0.10), min(h, top + int(w * 0.30))):
        xs = np.where(band[y])[0]
        if len(xs) >= 2:
            lefts.append(xs[0] + c0)
            rights.append(xs[-1] + c0)
    if not lefts:
        return top, w * 0.3, w * 0.7
    return top, float(np.median(lefts)), float(np.median(rights))


def normalise(src):
    im = flatten(Image.open(src))
    top, left, right = measure(im)
    head = max(right - left, 1)
    scale = min(2.5, max(0.3, (OUT_W * HEAD_W) / head))
    big = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    a = np.asarray(big)
    cx = (left + right) / 2 * scale
    x0 = round(cx - OUT_W / 2)
    y0 = round(top * scale - OUT_H * HAIR_TOP)
    pad = max(OUT_W, OUT_H)
    padded = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), mode='edge')
    crop = padded[y0 + pad:y0 + pad + OUT_H, x0 + pad:x0 + pad + OUT_W]
    return Image.fromarray(crop)


def main():
    players = load_json(PLAYERS_FILE, {})
    files = sorted(p for p in SRC.iterdir() if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp'))
    if not files:
        sys.exit(f'No photos in {SRC}')
    images = {}
    for f in files:
        pid, _, team = f.stem.partition('--')
        if pid not in players:
            print(f'  skipped {f.name}: no player with id "{pid}" in data/players.json')
            continue
        out = DEST / f'{f.stem}.jpg'
        normalise(f).save(out, quality=86, optimize=True, progressive=True)
        images.setdefault(pid, {})[team or 'default'] = f'assets/players/{out.name}'
        print(f'  {f.name} -> {out.name}')
    for pid, imgs in images.items():
        if 'default' not in imgs:
            imgs['default'] = next(iter(imgs.values()))
        players[pid]['images'] = imgs
    save_json(PLAYERS_FILE, players)
    build()


if __name__ == '__main__':
    main()
