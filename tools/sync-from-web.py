#!/usr/bin/env python3
"""Sync the web games in E:\\Fun\\X3 Bar into this repo's app/src/main/assets/.

The TV bundle is a set of copies of the web games. They are byte-identical to the
originals except for a few mechanical edits, which is exactly what this script
does - so "I improved a web game, get it on the TV" stays a one-command job
instead of hand-editing HTML and forgetting a step.

What it changes, per file:
  * drops the service-worker registration (there is no sw.js in the bundle and a
    cached SW in a file:// WebView is nothing but trouble)
  * drops the PWA manifest link (same reason)
  * rewrites cross-page links to the bundle's lowercase filenames, and sends
    "home" to the TV launcher instead of the web hub
  * on the menu pages, injects a small TV block: the X3FFILES launch map that
    x3f-exercises.js reads, 10-foot type scaling, and initial D-pad focus

Usage:
    python tools/sync-from-web.py [path-to-web-folder] [--check]

--check reports what would change without writing (used to confirm the bundle is
in sync with the web build).
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ASSETS = REPO / "app" / "src" / "main" / "assets"
DEFAULT_WEB = Path(r"E:\Fun\X3 Bar")

# web filename -> bundled asset name
GAMES = {
    "X3F_Nova.html": "nova.html",
    "X3F_Splash.html": "splash.html",
    "X3F_Bloom.html": "bloom.html",
    "X3F_Flow.html": "flow.html",
    "X3F_Arena.html": "arena.html",
    "X3F_Duel.html": "duel.html",
    "X3F_Rhythm.html": "rhythm.html",
    "X3F_Calibrate.html": "calibrate.html",
}
# the menu pages get the extra TV block
MENUS = {
    "X3F_Routine.html": "routine.html",
    "X3F_Library.html": "library.html",
    "X3F_Progress.html": "progress.html",
}
SHARED = ["x3f-exercises.js", "x3f-form.js", "x3f-nav.js"]

# web link target -> bundle link target
LINKS = {
    "index.html": "launcher.html",
    "X3F_Routine.html": "routine.html",
    "X3F_Library.html": "library.html",
    "X3F_Progress.html": "progress.html",
    "X3F_Calibrate.html": "calibrate.html",
}

SW_RE = re.compile(r"<script>if\('serviceWorker'in navigator\).*?</script>", re.S)
MANIFEST_RE = re.compile(r'<link rel="manifest"[^>]*>')

# Injected just before </head> on the menu pages. x3f-exercises.js reads
# window.X3FFILES to decide what a "Play" button navigates to.
TV_BLOCK = """<script>
/* --- Android TV bundle (x3f-tv) --- launch targets use the bundle's filenames */
window.X3FFILES={bloom:'bloom.html',splash:'splash.html',nova:'nova.html',flow:'flow.html',
 zone:'arena.html',max:'arena.html',boss:'arena.html',duel:'duel.html',rhythm:'rhythm.html',
 ascent:'ascent.html'};
</script>
<style>
/* 10-foot pass: wider columns and bigger type for couch distance. The native
   shell only widens .app, so the menu pages scale themselves here. */
@media (min-width:1200px){
  .wrap,.cwrap{max-width:1240px!important}
  body{font-size:17px}
  .exname,.cname{font-size:1.15em}
  .detail,.exhint,.muscle,.note,.prog{font-size:14px!important}
  .day{font-size:17px;padding:16px 12px}
  .mini,.set,.play,select{font-size:14px!important}
  .cta{font-size:17px!important;padding:16px 22px!important}
  .go{font-size:19px!important;padding:18px!important}
}
</style>
<script>
/* the remote has nothing focused until the first D-pad press - fix that */
addEventListener('load',function(){setTimeout(function(){
  try{ if(window.X3FNav && !X3FNav.current()) X3FNav.focusFirst(); }catch(e){}
},180)});
</script>
"""


def convert(text: str, is_menu: bool) -> str:
    text = SW_RE.sub("", text)
    text = MANIFEST_RE.sub("", text)
    for web, tv in LINKS.items():
        text = text.replace('href="%s"' % web, 'href="%s"' % tv)
    if is_menu:
        text = text.replace("</head>", TV_BLOCK + "</head>", 1)
    return text


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    web = Path(args[0]) if args else DEFAULT_WEB
    if not web.is_dir():
        print("web folder not found: %s" % web)
        return 2

    changed, missing = [], []
    for src_name, dst_name in list(GAMES.items()) + list(MENUS.items()):
        src = web / src_name
        if not src.exists():
            missing.append(src_name)
            continue
        out = convert(src.read_text(encoding="utf-8"), src_name in MENUS)
        dst = ASSETS / dst_name
        if not dst.exists() or dst.read_text(encoding="utf-8") != out:
            changed.append(dst_name)
            if not check:
                dst.write_text(out, encoding="utf-8")

    for name in SHARED:
        src = web / name
        if not src.exists():
            missing.append(name)
            continue
        out = src.read_text(encoding="utf-8")
        dst = ASSETS / name
        if not dst.exists() or dst.read_text(encoding="utf-8") != out:
            changed.append(name)
            if not check:
                dst.write_text(out, encoding="utf-8")

    print(("would change: " if check else "synced: ") + (", ".join(changed) if changed else "nothing"))
    if missing:
        print("missing in web folder: " + ", ".join(missing))
    return 1 if (check and changed) else 0


if __name__ == "__main__":
    raise SystemExit(main())
