#!/usr/bin/env python3
"""Sync the web games in web/ into this repo's app/src/main/assets/.

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

Both halves live in this one repo - web/ is the source, app/ is the TV wrapper -
so there is no second project to keep in step by hand.

Usage:
    python tools/sync-from-web.py [path-to-web-folder] [--check]

--check reports what would change without writing (used to confirm the bundle is
in sync with the web build).

WHY THIS SCRIPT FAILS LOUDLY NOW
--------------------------------
Every constant below is a *registration*. If a file is not named here it never
reaches the TV, and the symptom is not an error - it is a 404 inside a WebView
with no console, which the shell renders as Chromium's "webpage not available".
The audit found four ways that could happen in silence, so:

  * a registered source that is missing from web/ is a HARD FAILURE (exit 2).
    It used to be printed and then ignored, so renaming web/x3f-nav.js and
    running the sync reported success while leaving a stale copy in the bundle
    and 404ing every page that loads it.
  * a transform that does not match anything is a HARD FAILURE for the TV block
    and a warning for the rest. `text.replace("</head>", ...)` on a page with no
    literal </head> is a silent no-op, and the result is a bundle where
    window.X3FFILES never exists and every Play button navigates to a web
    filename that is not in the APK.
  * the X3FFILES launch map is cross-checked against the files this script
    actually produces, because it has been wrong since Ascent was dropped from
    GAMES and left in the map.
  * files sitting in the bundle that this script does not produce are listed.
    Nothing is deleted - launcher.html, index.html and logo.png are legitimately
    hand-maintained - but a stale orphan from a rename is now visible instead of
    shipping forever.

Exit codes: 0 clean, 1 --check found drift, 2 a registration is broken.
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ASSETS = REPO / "app" / "src" / "main" / "assets"
DEFAULT_WEB = REPO / "web"

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
    # The single-document menu shell (OVERHAUL-PLAN AD-1). It keeps its web
    # filename because it is a new page rather than a renamed one, and because
    # the shell's LAUNCHER constant will eventually point straight at it.
    "app.html": "app.html",
}

# Menu pages that size themselves in rem against `:root{font-size:calc(100vw/120)}`
# and must NOT receive TV_TYPE.
#
# TV_TYPE exists because the three original menu pages were written for a phone
# and needed a px-based rescue at couch distance. app.html is built on x3f-ui.css,
# whose entire premise is that a CSS pixel is not a panel pixel - so injecting
# `body{font-size:17px}` and eight `!important` px rules into it overrides the one
# thing that makes it identical at 960, 1280 and 1920 CSS px.
#
# It happens to be harmless today (app.html uses none of those class names and has
# no <select>), which is exactly why it needs writing down: it becomes a landmine
# the first time the shell adds a `.detail` or a dropdown, and the symptom would
# be "the new home looks wrong on the TV only".
RESOLUTION_INVARIANT = {"app.html"}

# Shared modules, copied byte for byte with NO transform. That is deliberate and
# is the whole point of them: one file serves the phone build and the TV bundle,
# so x3f-exercises.js cannot say one thing on the web and another on the couch.
#
# x3f-band.js is the single owner of "which band is this movement on" - the fix
# for the reported minimums/maximums bug. Leaving it out of this list would 404
# it on the TV, and every page that asks X3FBand.forMovement() would fall back to
# the very inconsistency it exists to remove, on the TV only.
#
# x3f-ui.css is a shared module that happens not to be JavaScript. It belongs
# here rather than in ART because it is text, is diffed as text, and must track
# web/ exactly the way the scripts do.
# x3f-sync.js and x3f-firebase-config.js are loaded by app.html. x3f-calflow.js
# is not loaded by anything yet - it is the calibration flow the Calibrate
# rewrite (Phase 1.3) will use. It is registered anyway: the cost is 15KB in an
# APK budget of 5MB, and the alternative failure mode is that the rewrite lands,
# nobody remembers this list, and Calibrate 404s its own state machine on the TV
# with no console to say so.
SHARED = ["x3f-exercises.js", "x3f-form.js", "x3f-nav.js", "x3f-hype.js", "x3f-music.js",
          "x3f-progress.js", "x3f-set.js", "x3f-cal.js", "x3f-fx.js", "x3f-band.js",
          "x3f-calflow.js", "x3f-sync.js", "x3f-firebase-config.js",
          "x3f-hud.js", "x3f-art.js", "x3f-onboard.js", "x3f-graduate.js",
          "x3f-ui.css"]

# Illustrated art, copied to the same relative paths the games request
# (ASSET_BASE='assets/bloom/' etc). Without these the games silently fall back to
# their procedural drawings, which is what shipped in v0.6 by mistake.
# bloom/bg.png is deliberately absent: Bloom loads bg.jpg, and the png is 1.7MB.
ART = {
    # the ambient backdrop the menus and the launcher sit on
    # Only the WEBP of each generated asset ships. The .jpg twin stays in web/
    # as a fallback for the browser build and is deliberately NOT bundled: it
    # would roughly double the art for a format the TV never asks for.
    "assets/ui": ["aurora.jpg", "backdrop.webp",
                  "badge-0.webp", "badge-1.webp", "badge-2.webp",
                  "badge-3.webp", "badge-4.webp"],
    # Card art for the leanback home, one per game.
    "assets/cards": ["bloom.webp", "boss.webp", "duel.webp", "flow.webp", "max.webp", "nova.webp", "rhythm.webp", "splash.webp", "workout.webp", "zone.webp"],
    # One diagram per movement, for the Library and the pre-set coaching card.
    "assets/moves": ["bent-row.webp", "calf-raise.webp", "chest-press.webp", "deadlift.webp", "drag-curl.webp", "front-squat.webp", "overhead-press.webp", "pec-crossover.webp", "split-squat.webp", "tricep-press.webp", "upright-row.webp"],
    # The three phases of the 12-week program.
    "assets/phase": ["1.webp", "2.webp", "3.webp"],
    "assets/bloom": ["bg.jpg", "critter.png", "critter_strain.png", "critter_cheer.png",
                     "flower.png", "bud.png", "petal.png"],
    "assets/splash": ["dolphin.png", "star.png", "pearl.png", "bubble.png", "fish.png"],
}

# Whole folders, copied recursively, filtered by extension.
#
# ART above names every file because that list is a DECISION - bg.png is left out
# on purpose. fonts/ is the opposite kind of thing: its contents are GENERATED by
# the subsetting step, the filenames are not chosen by hand, and shipping only
# some of them is never the right answer. So it is globbed.
#
# The extension filter is the safety rail. The APK has to stay under 5MB, and the
# natural mistake is to leave the 400KB unsubset .ttf sources next to the woff2
# output; an allow-list means that costs nothing instead of doubling the bundle.
#
# A declared tree that does not exist yet is a WARNING, not a failure, unlike a
# missing enumerated file. The difference is real: a missing enumerated file
# means somebody renamed something and forgot this list, which is a bug. A
# missing tree means a generated artefact has not been generated yet - and in
# fonts' case x3f-ui.css declares real fallbacks (system-ui), so the pages render
# in a substitute face rather than breaking. Blocking every other fix on it would
# be the wrong trade. The warning is loud so it cannot be forgotten.
#
# .txt is allowed for one reason only: the SIL Open Font License requires its own
# text to travel with the fonts it covers. Shipping the woff2 files without
# fonts/OFL.txt would be a licence violation, and a licence file is not the kind
# of thing anyone notices missing.
TREES = {
    "fonts": (".woff2", ".css", ".txt"),
}

# web link target -> bundle link target
LINKS = {
    "index.html": "launcher.html",
    "X3F_Routine.html": "routine.html",
    "X3F_Library.html": "library.html",
    "X3F_Progress.html": "progress.html",
    "X3F_Calibrate.html": "calibrate.html",
}

# Bundle files this script does not produce and must not complain about.
# launcher.html and index.html are hand-maintained byte-identical twins (the
# shell treats both as the launcher, and nine games' Back buttons still say
# location.href='index.html' in single quotes, which the LINKS rewrite cannot
# reach). logo.png is a native asset, not a web one.
UNMANAGED = {"launcher.html", "index.html", "logo.png"}

SW_RE = re.compile(r"<script>if\('serviceWorker'in navigator\).*?</script>", re.S)
MANIFEST_RE = re.compile(r'<link rel="manifest"[^>]*>')

# Injected just before </head> on the menu pages, in three separately-decided
# pieces. They used to be one string, which meant a new page could only take all
# of it or none of it.
#
# TV_FILES: x3f-exercises.js reads window.X3FFILES at call time to decide what a
# "Play" button navigates to. It has to be defined BEFORE the script tags that
# follow, which is why the whole block goes in <head> - that ordering is what
# lets the same x3f-exercises.js serve the phone build and the TV bundle.
TV_FILES = """<script>
/* --- Android TV bundle (x3f-tv) --- launch targets use the bundle's filenames.
   THE MENU KEYS ARE NOT OPTIONAL. app.html builds its links in JavaScript, via
   file(key, webName), which returns X3FFILES[key] or falls back to the WEB
   filename. The web filename does not exist in the APK - the bundle calls it
   routine.html, not X3F_Routine.html - so a key missing from this map is a link
   that navigates to nothing on the television, and MainActivity bounces a failed
   navigation back to the launcher.

   That is exactly what happened: with only the game keys here, the home screen's
   Start button and its entire Train rail (Workout, Library, Calibrate, Progress)
   plus every movement card were dead on the TV, while working perfectly in a
   browser. LINKS below could not save them, because it rewrites literal
   href="..." TEXT and a link assembled at runtime has none. Anything added to
   file() needs a key here. */
window.X3FFILES={bloom:'bloom.html',splash:'splash.html',nova:'nova.html',flow:'flow.html',
 zone:'arena.html',max:'arena.html',boss:'arena.html',duel:'duel.html',rhythm:'rhythm.html',
 ascent:'ascent.html',
 routine:'routine.html',library:'library.html',progress:'progress.html',
 calibrate:'calibrate.html',launcher:'launcher.html'};
</script>
"""

# TV_TYPE: the px-based 10-foot rescue for the three ORIGINAL menu pages, which
# were written for a phone. Not injected into anything in RESOLUTION_INVARIANT.
TV_TYPE = """<style>
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
"""

# TV_FOCUS: harmless on a page that seats its own cursor (the guard checks
# X3FNav.current() first), essential on one that does not.
TV_FOCUS = """<script>
/* the remote has nothing focused until the first D-pad press - fix that */
addEventListener('load',function(){setTimeout(function(){
  try{ if(window.X3FNav && !X3FNav.current()) X3FNav.focusFirst(); }catch(e){}
},180)});
</script>
"""

# Every .html the X3FFILES map points at. Cross-checked against what this script
# actually produces, so "the map advertises a page the bundle does not have" can
# never be a silent 404 again.
LAUNCH_TARGETS = sorted(set(re.findall(r"'([^']+\.html)'", TV_FILES)))


def convert(text: str, is_menu: bool, label: str, warn) -> str:
    """Apply the mechanical edits, and complain if one of them should have fired
    and did not.

    A `str.replace` that finds nothing returns the string unchanged and reports
    success, which is how a reformatted page can quietly ship without its TV
    block. The two strip rules warn only when the thing they remove is PRESENT in
    some other shape - a page that simply never registered a service worker is
    not a problem and must not cry wolf, or the warning stops being read.
    """
    if "serviceWorker" in text and not SW_RE.search(text):
        warn("%s: registers a service worker in a shape SW_RE does not match, so "
             "it is NOT being stripped. A cached SW inside a file:// WebView is "
             "exactly what that rule exists to prevent." % label)
    text = SW_RE.sub("", text)

    if "manifest.json" in text and not MANIFEST_RE.search(text):
        warn("%s: links the PWA manifest in a shape MANIFEST_RE does not match "
             "(rel must come first), so it is NOT being stripped." % label)
    text = MANIFEST_RE.sub("", text)

    for web, tv in LINKS.items():
        text = text.replace('href="%s"' % web, 'href="%s"' % tv)

    if is_menu:
        if "</head>" not in text:
            # Hard failure, not a warning. Without the TV block window.X3FFILES
            # never exists, x3f-exercises.js falls back to the web filenames, and
            # every Play button on the TV navigates to a page that is not in the
            # APK - twelve dead links from one silent no-op.
            raise ValueError("%s has no literal </head>, so the TV block cannot be "
                             "injected. Add one, or teach convert() where the block goes."
                             % label)
        block = TV_FILES
        if label not in RESOLUTION_INVARIANT:
            block += TV_TYPE
        block += TV_FOCUS
        text = text.replace("</head>", block + "</head>", 1)
    return text


def sync_text(src: Path, dst: Path, out: str, check: bool):
    """Write `out` to `dst` unless it is already there. Returns True if it differed."""
    if dst.exists() and dst.read_text(encoding="utf-8") == out:
        return False
    if not check:
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(out, encoding="utf-8")
    return True


def sync_bytes(blob: bytes, dst: Path, check: bool):
    if dst.exists() and dst.read_bytes() == blob:
        return False
    if not check:
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(blob)
    return True


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    web = Path(args[0]) if args else DEFAULT_WEB
    if not web.is_dir():
        print("web folder not found: %s" % web)
        return 2

    changed, missing, warnings, fatal = [], [], [], []
    produced = set()          # bundle-relative paths this run is responsible for

    def warn(msg):
        warnings.append(msg)

    def fail(msg):
        """A warning nobody can ship past.

        Warnings here do not affect the exit code, which is right for most of
        them - an orphaned bundle file or a Play button that was already dead is
        worth saying and not worth blocking a build over. It is exactly wrong for
        a dead link on the HOME SCREEN, which is what fail() is for: CI runs this
        script with --check, and a defect that only reaches the television is a
        defect nothing else in the pipeline can catch."""
        fatal.append(msg)

    for src_name, dst_name in list(GAMES.items()) + list(MENUS.items()):
        produced.add(dst_name)
        src = web / src_name
        if not src.exists():
            missing.append(src_name)
            continue
        try:
            out = convert(src.read_text(encoding="utf-8"), src_name in MENUS, src_name, warn)
        except ValueError as e:
            print("TRANSFORM FAILED: %s" % e)
            return 2
        if sync_text(src, ASSETS / dst_name, out, check):
            changed.append(dst_name)

    for name in SHARED:
        produced.add(name)
        src = web / name
        if not src.exists():
            missing.append(name)
            continue
        if sync_text(src, ASSETS / name, src.read_text(encoding="utf-8"), check):
            changed.append(name)

    for folder, names in ART.items():
        for name in names:
            rel = folder + "/" + name
            produced.add(rel)
            src = web / folder / name
            if not src.exists():
                missing.append(rel)
                continue
            if sync_bytes(src.read_bytes(), ASSETS / folder / name, check):
                changed.append(rel)

    for folder, suffixes in TREES.items():
        root = web / folder
        if not root.is_dir():
            warn("%s/ is declared but not present in %s - nothing to bundle yet. "
                 "Anything that depends on it falls back until it is generated."
                 % (folder, web))
            continue
        found = 0
        for src in sorted(root.rglob("*")):
            if not src.is_file():
                continue
            if src.suffix.lower() not in suffixes:
                warn("%s: skipped, %s/ only bundles %s"
                     % (src.relative_to(web).as_posix(), folder, "/".join(suffixes)))
                continue
            rel = src.relative_to(web).as_posix()
            produced.add(rel)
            found += 1
            if sync_bytes(src.read_bytes(), ASSETS.joinpath(*rel.split("/")), check):
                changed.append(rel)
        if not found:
            warn("%s/ exists but holds nothing this bundle accepts (%s)"
                 % (folder, "/".join(suffixes)))

    # The launch map has to name pages this script actually produces. It did not:
    # ascent was dropped from GAMES when it turned out to need a CDN copy of
    # three.js, and nobody removed it from X3FFILES - so Library -> Ascent has
    # navigated the TV to a missing file ever since, with no error page of our own.
    for target in LAUNCH_TARGETS:
        if target not in produced and target not in UNMANAGED:
            warn("the TV block's X3FFILES advertises %s, which this sync never "
                 "produces - that Play button is a dead link on the TV "
                 "(docs/audit/tooling.md D-1)" % target)

    # THE SHELL'S HOOKS MUST EXIST UNDER THE NAMES THE SHELL CALLS.
    #
    # MainActivity talks to a page by evaluating `window.__x3fSomething(...)`. If
    # the page publishes the same function under a different name, the call
    # short-circuits on the && and nothing happens - no error, no log, no symptom
    # except a feature that quietly does not work on the television and works
    # perfectly in a browser. That has now happened twice in this file's lifetime:
    #
    #   __x3fCloseOverlay  app.html published it as X3FCloseOverlay, so BACK never
    #                      closed a dialog and the second press left the home screen.
    #   __x3fSetBar        app.html published it as X3FBarStatus, so the bar chip
    #                      never changed - not on scan, connect, or disconnect.
    #
    # Neither was findable by reading either side alone; both are obvious the
    # moment the two are put next to each other, which is all this does. A page
    # needs the overlay hook if it has a scrim to close, and the status hook if it
    # has a bar chip to update - and the games get the latter from the bootstrap's
    # fallback, which installs only when a global setStatus exists.
    java_src = ""
    try:
        java_src = (REPO / "app" / "src" / "main" / "java" / "com" / "goob" /
                    "x3ftv" / "MainActivity.java").read_text(encoding="utf-8")
    except Exception:
        pass
    if java_src:
        called = set(re.findall(r"window\.(__x3f[A-Za-z]+)\s*&&", java_src))
        for rel in sorted(produced):
            if not rel.endswith(".html") or rel not in set(MENUS.values()):
                continue
            try:
                txt = (ASSETS / rel).read_text(encoding="utf-8")
            except Exception:
                continue
            defines = set(re.findall(r"window\.(__x3f[A-Za-z]+)\s*=", txt))
            has_setstatus = re.search(r"function\s+setStatus\s*\(", txt) is not None
            if "__x3fCloseOverlay" in called and ".scrim" in txt and                "__x3fCloseOverlay" not in defines:
                fail("%s has an overlay but never defines window.__x3fCloseOverlay, "
                     "which is the name MainActivity calls on BACK. The dialog will "
                     "not close and the next BACK leaves the page." % rel)
            # has_setstatus IS the bootstrap-fallback test: that fallback reads
            # `if (!window.__x3fSetBar && typeof setStatus === 'function')`, so a
            # page with a global setStatus is covered and a page without one is not.
            if "__x3fSetBar" in called and "barChip" in txt and                "__x3fSetBar" not in defines and not has_setstatus:
                fail("%s shows a bar status chip but defines neither "
                     "window.__x3fSetBar nor a global setStatus() for the "
                     "bootstrap's fallback to find, so the chip never updates on "
                     "the TV." % rel)

    # EVERY KEY file() ASKS FOR MUST BE IN X3FFILES.
    #
    # This is the check that would actually have caught the bug, and the static
    # href sweep below would not have: app.html builds its links at RUNTIME with
    # file(key, webName), so the emitted HTML contains no anchor to inspect. What
    # it contains is the CALL, and the call names the key.
    #
    # file() returns X3FFILES[key] or falls back to webName - and webName is the
    # WEB filename, which by construction never exists in a bundle that renames
    # every menu page. So a key missing here is not a soft failure, it is a link
    # that navigates to nothing. With only the game keys present, the TV home's
    # Start button and its whole Train rail were dead while the browser build was
    # perfect, which is the worst possible shape for a bug: invisible everywhere
    # it is convenient to test.
    file_call = re.compile(r"file\(\s*['\"](\w+)['\"]")
    for rel in sorted(produced):
        if not rel.endswith(".html"):
            continue
        try:
            txt = (ASSETS / rel).read_text(encoding="utf-8")
        except Exception:
            continue
        if "X3FFILES" not in txt:
            continue
        mm = re.search(r"window\.X3FFILES\s*=\s*\{(.*?)\};", txt, re.S)
        known = set(re.findall(r"(\w+)\s*:", mm.group(1))) if mm else set()
        for key in sorted(set(file_call.findall(txt))):
            if key not in known:
                fail("%s calls file('%s') but X3FFILES has no such key, so it "
                     "falls back to the WEB filename - which is not in the bundle. "
                     "That link is dead on the TV. Add it to TV_FILES." % (rel, key))

    # EVERY LINK IN THE BUNDLE MUST POINT AT SOMETHING IN THE BUNDLE.
    #
    # The check above only covers X3FFILES. It cannot see a link the page builds
    # at RUNTIME, and that is precisely how the worst dead-link bug in this
    # project's history shipped: app.html composes its targets with
    # file(key, webName), which falls back to the WEB filename when the key is
    # missing from X3FFILES - and the web filename never exists in the APK,
    # because the bundle renames every menu page. With only game keys in the map,
    # the home screen's Start button and its whole Train rail navigated to nothing
    # on the television while working perfectly in a browser. The LINKS rewrite
    # could not help: it replaces literal href="..." TEXT, and a link assembled in
    # JavaScript has none to replace.
    #
    # So check the artefact rather than the intention. Walk the emitted HTML, take
    # every static href, and require the file to be there. It costs milliseconds
    # and it is the only thing standing between a renamed page and a home screen
    # whose buttons all bounce to the launcher.
    # ANCHORS ONLY, and that restriction is load-bearing in both directions.
    # A bare href= scan matches <link rel="apple-touch-icon"> (an iOS icon hint
    # the television never requests, and which is deliberately absent from the
    # bundle) and it matches href= appearing inside a JavaScript template literal,
    # which is a string being built rather than a link that exists. Both are noise,
    # and a check that cries wolf stops being read. Only <a> navigates.
    Q, A = chr(34), chr(39)
    href_pats = [re.compile("<a" + chr(92) + "s[^>]*?href=" + Q + "([^" + Q + ">]+)" + Q, re.I),
                 re.compile("<a" + chr(92) + "s[^>]*?href=" + A + "([^" + A + ">]+)" + A, re.I)]
    for rel in sorted(produced):
        if not rel.endswith(".html"):
            continue
        try:
            txt = (ASSETS / rel).read_text(encoding="utf-8")
        except Exception:
            continue
        seen_href = set()
        for pat in href_pats:
            seen_href.update(pat.findall(txt))
        for href in sorted(seen_href):
            href = href.split("#")[0].split("?")[0].strip()
            if not href or href.startswith(("http:", "https:", "data:", "mailto:",
                                            "javascript:", "//", "tel:")):
                continue
            # A link the page ASSEMBLES cannot be resolved from here, and saying so
            # every run would be noise rather than a finding. Library builds its
            # Play links as "<a href='" + gameUrl(...) + "'", and gameUrl reads
            # X3FFILES, so those are already covered by the launch-target check
            # above. None of these characters can appear in a real static path.
            if any(c in href for c in "'+${}" + chr(10) + chr(13)):
                continue
            if not (ASSETS / href).exists():
                fail("%s links to %s, which is not in the bundle - on the TV that "
                     "navigation fails and MainActivity bounces to the launcher"
                     % (rel, href))

    # Orphans: nothing is deleted, because some bundle files are legitimately
    # hand-maintained. But a file left behind by a rename used to ship forever
    # AND be staged, audited and syntax-checked by both suites, so it is named.
    if ASSETS.is_dir():
        for f in sorted(ASSETS.rglob("*")):
            if not f.is_file():
                continue
            rel = f.relative_to(ASSETS).as_posix()
            if rel in produced or rel in UNMANAGED:
                continue
            warn("%s is in the bundle but nothing in web/ produces it "
                 "(hand-maintained, or stale from a rename)" % rel)

    print(("would change: " if check else "synced: ") + (", ".join(changed) if changed else "nothing"))
    for w in warnings:
        print("  warning: " + w)
    for f in fatal:
        print("  BROKEN ON TV: " + f)
    if fatal:
        print("The bundle would ship a control that does nothing on the television and "
              "everything in a browser - a link to a file the APK does not contain, or a "
              "shell hook under a name the shell never calls. Nothing else in this "
              "pipeline can see either one.")
        return 2
    if missing:
        # Registered, and gone. Something was renamed or deleted without updating
        # the list above, and the bundle now holds a stale copy of it.
        print("MISSING IN %s: %s" % (web, ", ".join(missing)))
        print("Those are registered in this script but not in the web folder. The bundle "
              "still holds the old copies, so the TV would keep running deleted code.")
        return 2
    return 1 if (check and changed) else 0


if __name__ == "__main__":
    raise SystemExit(main())
