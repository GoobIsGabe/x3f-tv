"""X3F — shrink the illustrated game sprites to the size they are actually drawn.

    python tools/art/sprites.py --check     report, change nothing
    python tools/art/sprites.py             rewrite them in place

WHY THIS IS NOT A RESTYLE. Bloom and Splash are bright, cute, illustrated arcade
games and their sprites are deliberately a different register from the graphite
training interface. That contrast is correct and load-bearing: the menus are a
training system, the games are the reason someone switches the television on. A
graphite dolphin on a graphite sea is an invisible dolphin. So the art stays and
only the BYTES change.

THE ACTUAL DEFECT (docs/audit/games-a.md W-06): they ship at roughly ten times
the size anything is drawn at. Bloom draws its bud at min(W,H)*0.05 — 54 real
pixels on a 1080-tall canvas — from a 306x512 source. Splash draws collectibles
at a couple of times their radius. Twelve files, 2.2 MB, on a bundle that must
stay under five, and every one of them is also DECODED at full size into a
30-40 MB graphics budget. Oversized art costs memory on the device, not just
disk in the repo.

WHY PNG AND NOT WEBP. WebP with alpha would be smaller and Android WebView has
supported it since 4.2 (this app is minSdk 24). But the games reference these by
filename in eight places, and swapping the extension is a code change to files
that were being rewritten in parallel. Quantising the PNG gets most of the win
for none of the risk; the WebP move can happen later behind the same filenames
if it is ever worth it.

Originals are preserved in tools/art/raw/sprites/ on first run, so this is
reversible and re-runnable.
"""
import argparse
import shutil
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
WEB = REPO / "web" / "assets"
BACKUP = HERE / "raw" / "sprites"

# The longest edge each asset is ever drawn at, doubled for devicePixelRatio 2,
# rounded up a little. Derived from the actual drawImage calls:
#   bud     min(W,H)*0.05  -> 54 px on a 1080 canvas
#   flower  min(W,H)*0.09  -> 97 px
#   petal   p.size*1.6     -> ~60 px
#   critter SZ*0.28        -> ~200 px, the biggest thing on screen
#   splash collectibles    r*2.2..2.7 -> ~110 px
TARGET = {
    "bloom/bg.jpg": 900,          # full-bleed background, drawn at canvas size
    "bloom/bud.png": 160,
    "bloom/flower.png": 256,
    "bloom/petal.png": 160,
    "bloom/critter.png": 420,
    "bloom/critter_cheer.png": 420,
    "bloom/critter_strain.png": 420,
    "splash/bubble.png": 256,
    "splash/dolphin.png": 420,
    "splash/fish.png": 256,
    "splash/pearl.png": 256,
    "splash/star.png": 256,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    BACKUP.mkdir(parents=True, exist_ok=True)
    before = after = 0
    for rel, longest in TARGET.items():
        src = WEB / rel
        if not src.exists():
            print("%-28s MISSING" % rel)
            continue
        b = src.stat().st_size
        before += b

        keep = BACKUP / rel.replace("/", "_")
        if not keep.exists() and not a.check:
            shutil.copy2(src, keep)

        im = Image.open(src)
        w, h = im.size
        scale = min(1.0, longest / max(w, h))
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))

        if a.check:
            print("%-28s %4dx%-4d -> %3dx%-3d  %4d KB" % (rel, w, h, nw, nh, b // 1024))
            continue

        if scale < 1.0:
            im = im.resize((nw, nh), Image.LANCZOS)

        if src.suffix == ".jpg":
            im.convert("RGB").save(src, "JPEG", quality=82, optimize=True, progressive=True)
        else:
            im = im.convert("RGBA")
            # Quantise with alpha preserved. 128 colours is invisible on flat
            # cel-shaded artwork like this and roughly halves what optimize
            # alone achieves.
            q = im.quantize(colors=128, method=Image.FASTOCTREE)
            q.save(src, "PNG", optimize=True)

        after += src.stat().st_size
        print("%-28s %4dx%-4d -> %3dx%-3d  %4d KB -> %3d KB" %
              (rel, w, h, nw, nh, b // 1024, src.stat().st_size // 1024))

    if not a.check:
        print("\ntotal %d KB -> %d KB  (%.0f%% smaller)" %
              (before // 1024, after // 1024, 100 * (1 - after / before) if before else 0))
        print("originals kept in", BACKUP)
    return 0


if __name__ == "__main__":
    sys.exit(main())
