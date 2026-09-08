"""X3F — generate every asset in the manifest, then make it fit a 5 MB APK.

    python tools/art/build.py            generate anything missing, then process
    python tools/art/build.py --only cards        just that group
    python tools/art/build.py --only cards:bloom  just that one
    python tools/art/build.py --force             regenerate even if present
    python tools/art/build.py --process-only      skip generation, just resize

WHY GENERATION AND PROCESSING ARE ONE SCRIPT. The models return 1024px+ images
of 300-600 KB each. Forty of those is fifteen megabytes against a bundle that
must stay under five, and the roadmap already lists "2.5 MB of it is PNG" as a
problem. An asset that is not resized on the way in never gets resized, so the
resize is not a separate step anybody can forget.

WHAT PROCESSING DOES

  Resizes to the size the asset is actually DRAWN at, not the size it arrived.
  A card is ~320 design px wide on a 1920 canvas; at devicePixelRatio 2 that is
  640 real pixels, so 640 is the width. Anything beyond that is bytes the TV
  decodes and throws away, and decoded images cost memory against a 30-40 MB
  graphics budget, not just disk.

  Converts to WEBP. Android WebView has supported lossy WebP since API 14 and
  alpha since 4.2; this app's minSdk is 24, so it is safe, and it roughly halves
  the bytes at the same visual quality. JPEG fallbacks are kept for the browser
  build's older paths.

  Never overwrites a generated original. Originals live in tools/art/raw/ so a
  re-process never needs a re-generation, and a regeneration costs money.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
RAW = HERE / "raw"
WEB = REPO / "web"
CLI = Path("E:/Fun/getimg-studio/src/cli.js")

sys.path.insert(0, str(HERE))
import manifest  # noqa: E402

# Where each group lands, and how wide it is actually drawn.
#   width  = the largest number of REAL pixels the asset is ever painted at
#   dest   = relative to web/
GROUPS = {
    "moves":  dict(dest="assets/moves",  width=760,  quality=82),
    "cards":  dict(dest="assets/cards",  width=640,  quality=82),
    "ui":     dict(dest="assets/ui",     width=1280, quality=80),
    "phase":  dict(dest="assets/phase",  width=1280, quality=80),
    # The launcher icon and banner are Android resources, not web assets, and
    # Android wants exact sizes: a TV banner is 320x180 dp.
    "mark":   dict(dest=None,            width=512,  quality=92),
}
MARK_DEST = REPO / "app" / "src" / "main" / "res" / "drawable-nodpi"


def raw_path(item):
    return RAW / item["dir"] / (item["slug"] + "." + ("png" if item["fmt"] == "png" else "jpg"))


def generate(item, force=False):
    out = raw_path(item)
    if out.exists() and not force:
        return "have", out, 0.0
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.parent / "_tmp"
    tmp.mkdir(exist_ok=True)
    for f in tmp.iterdir():
        f.unlink()

    cmd = ["node", str(CLI), item["prompt"], "-m", "nano banana 2",
           "-a", item["aspect"], "-f", item["fmt"], "-o", str(tmp), "--json"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    txt = r.stdout
    try:
        data = json.loads(txt[txt.index("["):])
    except Exception:
        raise RuntimeError("generate failed for %s/%s: %s" %
                           (item["dir"], item["slug"], (r.stderr or txt)[-400:]))
    cost = float(data[0].get("cost") or 0)
    src = Path(data[0]["path"])
    if out.exists():
        out.unlink()
    src.replace(out)
    for f in tmp.iterdir():
        f.unlink()
    tmp.rmdir()
    return "made", out, cost


def process(item):
    from PIL import Image
    g = GROUPS[item["dir"]]
    src = raw_path(item)
    if not src.exists():
        return None
    im = Image.open(src)

    if item["dir"] == "mark":
        MARK_DEST.mkdir(parents=True, exist_ok=True)
        # Android TV: the banner is 320x180 dp and the icon square.
        # An Android TV banner is 320x180 dp; at xhdpi (the density a 1080p TV
        # reports) that is 640x360 real pixels, and anything beyond it is bytes
        # the launcher downsamples and throws away. The icon is 320x320 for the
        # same reason. The first pass shipped 1280x720 and 512x512, which cost a
        # megabyte between them for no visible gain.
        if item["slug"] == "banner":
            im = im.convert("RGB").resize((640, 360), Image.LANCZOS)
        else:
            im = im.convert("RGB").resize((320, 320), Image.LANCZOS)
        dst = MARK_DEST / (item["slug"] + ".png")
        # quantise: these are flat, low-chroma marks, so a palette is lossless
        # to the eye and roughly a quarter of the bytes.
        im.convert("P", palette=Image.ADAPTIVE, colors=128).save(dst, "PNG", optimize=True)
        return dst

    w = item.get("width", g["width"])
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im = im.convert("RGB")
    outdir = WEB / g["dest"]
    outdir.mkdir(parents=True, exist_ok=True)

    # WebP is the one the app loads; the JPEG stays as a fallback for any path
    # that predates it and costs little at this size.
    webp = outdir / (item["slug"] + ".webp")
    im.save(webp, "WEBP", quality=g["quality"], method=6)
    jpg = outdir / (item["slug"] + ".jpg")
    im.save(jpg, "JPEG", quality=g["quality"], optimize=True, progressive=True)
    return webp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None, help="group, or group:slug")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--process-only", action="store_true")
    a = ap.parse_args()

    items = manifest.ALL
    if a.only:
        if ":" in a.only:
            grp, slug = a.only.split(":", 1)
            items = [i for i in items if i["dir"] == grp and i["slug"] == slug]
        else:
            items = [i for i in items if i["dir"] == a.only]
    if not items:
        print("nothing matched --only", a.only)
        return 1

    spent = 0.0
    for i, item in enumerate(items, 1):
        tag = "%s/%s" % (item["dir"], item["slug"])
        try:
            if a.process_only:
                state, cost = "skip", 0.0
            else:
                state, _, cost = generate(item, a.force)
            spent += cost
            dst = process(item)
            size = (dst.stat().st_size // 1024) if dst else 0
            print("%2d/%d  %-22s %-5s  %4d KB  %s" %
                  (i, len(items), tag, state, size, dst.name if dst else "-"))
        except Exception as e:
            print("%2d/%d  %-22s FAILED  %s" % (i, len(items), tag, str(e)[:160]))
    print("\nspent this run: $%.2f" % spent)
    return 0


if __name__ == "__main__":
    sys.exit(main())
