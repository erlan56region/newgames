#!/usr/bin/env python3
"""Chroma-key the generated character art and bake simple Jim run frames.
Run from the repository root: python3 earthworm-jim-2/tools/build_art.py
Requires Pillow. Raw sources live in art/raw; game-ready PNGs in art/sprites.
"""
from PIL import Image
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'art' / 'raw'
OUT = ROOT / 'art' / 'sprites'
OUT.mkdir(parents=True, exist_ok=True)

CHARS = ['jim', 'psy-crow', 'evil-cat', 'bob', 'major-mucus', 'queen', 'peter', 'snott']


def dekey(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # flat magenta production background
            if r > 140 and b > 140 and g < 125 and min(r, b) - g > 55:
                px[x, y] = (0, 0, 0, 0)
                continue
            # remove magenta spill on anti-aliased outline pixels only
            if a and b > g + 25 and r > g + 45 and min(r, b) - g > 45:
                px[x, y] = (min(r, g + 55), g, min(b, g + 35), a)
    return im


def trim(im: Image.Image, pad=6) -> Image.Image:
    box = im.getbbox()
    if not box:
        return im
    l, t, r, b = box
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(im.width, r + pad); b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def fit(im: Image.Image, max_h=512, max_w=768) -> Image.Image:
    scale = min(max_h / im.height, max_w / im.width, 1.0)
    if scale < 1.0:
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    return im


manifest = {}
for name in CHARS:
    src = RAW / f'{name}.png'
    im = Image.open(src)
    if name == 'bob':
        # source accidentally contains three copies; keep the middle one only
        im = im.crop((int(im.width * 0.34), 0, int(im.width * 0.66), im.height))
    im = fit(trim(dekey(im)))
    dest = OUT / f'{name}.png'
    im.save(dest, optimize=True)
    manifest[name] = {'file': f'art/sprites/{name}.png', 'w': im.width, 'h': im.height}
    print(name, im.size)

# Bake four lightweight run frames by shearing Jim's lower legs in opposite directions.
jim = Image.open(OUT / 'jim.png').convert('RGBA')
W, H = jim.size
hip = int(H * 0.66)
top = jim.crop((0, 0, W, hip))
mid = W // 2
leg_l = jim.crop((0, hip, mid, H))
leg_r = jim.crop((mid, hip, W, H))
frames = []
for i, shift in enumerate((-12, 0, 12, 0)):
    frame = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    frame.paste(top, (0, 0))
    lh = H - hip
    # affine shear: x' = x + k*y, anchored at the hip
    ll = leg_l.transform((leg_l.width + 24, lh), Image.AFFINE,
                         (1, shift / max(1, lh), 12, 0, 1, 0), resample=Image.BICUBIC)
    lr = leg_r.transform((leg_r.width + 24, lh), Image.AFFINE,
                         (1, -shift / max(1, lh), 12, 0, 1, 0), resample=Image.BICUBIC)
    frame.paste(ll, (-12, hip), ll)
    frame.paste(lr, (mid - 12, hip), lr)
    fn = f'jim-run-{i}.png'
    frame.save(OUT / fn, optimize=True)
    frames.append(f'art/sprites/{fn}')
manifest['jim_run'] = frames

# background plate
bg = Image.open(RAW / 'bg-junk.jpg').convert('RGB')
bg.save(ROOT / 'art' / 'bg-junk.jpg', quality=90, optimize=True)
manifest['bg_junk'] = 'art/bg-junk.jpg'

(ROOT / 'art' / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print('manifest written')
