#!/usr/bin/env python3
"""Make the championship ring images used on player pages.

Takes assets/rings/originals/ring.jpg, removes the blue background, redraws
the year on the side panel and tints the gems and banners in each team's
colour. Writes assets/rings/<team>-<year>.png.

    python tools/rings.py               (2025 up to next year)
    python tools/rings.py 2031          (2025 up to 2031)

Needs: pip install pillow numpy opencv-python-headless
"""
import datetime
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = str(ROOT / 'assets/rings/originals/ring.jpg')
FONT = str(ROOT / 'tools/fonts/Poppins-Bold.ttf')
OUT = ROOT / 'assets/rings'
LAST = int(sys.argv[1]) if len(sys.argv) > 1 else datetime.date.today().year + 1
src = cv2.imread(SRC)
h, w = src.shape[:2]

# background mask (blue touching the edge, plus the big hole inside the band)
bg = cv2.inRange(src, (190, 60, 10), (255, 130, 70))
n, lab, stats, _ = cv2.connectedComponentsWithStats(bg, 8)
keep = np.zeros_like(bg)
for i in range(1, n):
    x, y, ww, hh, area = stats[i]
    if x == 0 or y == 0 or x + ww >= w or y + hh >= h or area > 4000:
        keep[lab == i] = 255
alpha = cv2.GaussianBlur(255 - cv2.dilate(keep, np.ones((3, 3), np.uint8), iterations=2), (5, 5), 0)

# erase the printed year
box = cv2.boxPoints(((293, 603), (196, 60), 45)).astype(np.int32)
band = np.zeros((h, w), np.uint8); cv2.fillPoly(band, [box], 255)
band = cv2.GaussianBlur(band, (9, 9), 0).astype(float)[..., None] / 255
panel = np.full_like(src, (45, 142, 205))  # the side panel's gold (BGR)
base = (src * (1 - band) + panel * band).astype(np.uint8)

# team accents: blue gems and navy banners shift to the team's hue (OpenCV hue 0-180)
TEAMS = {'pretty-good': None, 'chuckers-chuckers': 135, 'all-stars': 8}
def tint(img, hue):
    if hue is None:
        return img
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.int32)
    blue = (hsv[..., 0] > 95) & (hsv[..., 0] < 130) & (hsv[..., 1] > 70) & (hsv[..., 2] > 30)
    hsv[..., 0][blue] = hue
    if hue < 20:  # warm teams: keep the gems from vanishing into the gold
        hsv[..., 2][blue] = (hsv[..., 2][blue] * 0.8).astype(np.int32)
    return cv2.cvtColor(hsv.clip(0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)

def year_layer(year):
    font = ImageFont.truetype(FONT, 64)
    t = Image.new('RGBA', (260, 100), (0, 0, 0, 0))
    d = ImageDraw.Draw(t)
    d.text((130, 52), year, font=font, anchor='mm', fill=(252, 200, 40, 255), stroke_width=7, stroke_fill=(28, 18, 30, 255))
    t = t.resize((int(260 * 0.8), 100), Image.LANCZOS)  # a touch condensed, like the original
    t = t.rotate(-45, resample=Image.BICUBIC, expand=True)
    return t

ys, xs = np.where(alpha > 10)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
for team, hue in TEAMS.items():
    t_img = tint(base, hue)
    rgba = Image.fromarray(cv2.cvtColor(t_img, cv2.COLOR_BGR2RGB)).convert('RGBA')
    rgba.putalpha(Image.fromarray(alpha))
    for year in range(2025, LAST + 1):
        im = rgba.copy()
        yl = year_layer(str(year))
        im.alpha_composite(yl, (293 - yl.size[0] // 2, 603 - yl.size[1] // 2))
        im = im.crop((x0, y0, x1, y1))
        im.thumbnail((200, 222), Image.LANCZOS)
        im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(OUT / f'{team}-{year}.png', optimize=True)
print(f'Ring images written to assets/rings/ for 2025-{LAST}')
