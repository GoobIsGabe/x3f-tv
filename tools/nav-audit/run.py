#!/usr/bin/env python3
"""Walk every bundled screen with a simulated TV remote and report nav problems.

The TV has no mouse and no scrollbar, so a control the D-pad cannot reach might
as well not exist -- and a control it CAN reach while invisible is worse, because
OK will press it. Eyeballing that across 12 screens and their overlays is how
things like these shipped:

  * the guided coach had 8 controls and none were focusable, while the cursor
    silently walked the day list underneath it (v0.7)
  * Arena let you focus "Fight" and "Start Max Effort" on inactive mode tabs,
    which hide with opacity and keep their layout box (v0.7)
  * the launcher's Right/Left jumped up to a band pill instead of the next card
    (v0.6)

So this drives the real thing instead. It injects the actual BOOTSTRAP from
MainActivity, fakes native force and the D-pad, then for each UI state does a
breadth-first walk of the whole menu using only the four directions, and reports:

  UNREACHABLE .......... a visible control the remote can never land on
  FOCUSED INVISIBLE .... the remote landed on something nobody can see
  ESCAPED OVERLAY ...... an open overlay failed to trap the cursor
  dead ends ............ a direction that leads nowhere

Usage:
    python tools/nav-audit/run.py              # every screen
    python tools/nav-audit/run.py routine nova # just these

Needs a Chromium-family browser for headless runs; it looks for Edge and Chrome.
Exits non-zero if any screen reports a problem, so CI can gate on it.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ASSETS = REPO / "app" / "src" / "main" / "assets"
HERE = Path(__file__).resolve().parent

SCREENS = ["launcher", "routine", "library", "progress", "nova", "bloom",
           "splash", "arena", "duel", "flow", "rhythm", "calibrate"]

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "google-chrome", "chromium", "chromium-browser",
]


def find_browser():
    for b in BROWSERS:
        if Path(b).exists():
            return b
        w = shutil.which(b)
        if w:
            return w
    return None


def main():
    want = [a for a in sys.argv[1:] if not a.startswith("-")] or SCREENS
    browser = find_browser()
    if not browser:
        print("no Chromium-family browser found; tried:\n  " + "\n  ".join(BROWSERS))
        return 2

    stage = Path(tempfile.mkdtemp(prefix="x3f-nav-"))

    # Pull the LIVE BOOTSTRAP out of MainActivity rather than keeping a copy here.
    # A copy would drift, and the audit would then be testing fiction. This also
    # means a syntax error in the injected JS shows up as an audit failure.
    java = (REPO / "app" / "src" / "main" / "java" / "com" / "goob" / "x3ftv" /
            "MainActivity.java").read_text(encoding="utf-8")
    m = re.search(r'BOOTSTRAP\s*=\s*"""(.*?)""";', java, re.S)
    if not m:
        print("could not find the BOOTSTRAP text block in MainActivity.java")
        return 2
    boot = m.group(1)
    # The bootstrap keeps its cursor private, so the walker cannot seat focus and
    # coverage collapses to whatever path the arrows happen to take. Add a test
    # seam at STAGING time only - the shipped string is untouched - so the audit
    # can walk the graph exhaustively while still running the real logic.
    seam_anchor = "   setInterval(function(){ try{ var sc=scope();"
    if seam_anchor not in boot:
        print("BOOTSTRAP changed shape: the audit's focus seam no longer applies.\n"
              "Fix the anchor in run.py, or reachability checking is silently weakened.")
        return 2
    boot = boot.replace(seam_anchor, "   window.__x3fSeat=setFocus;\n" + seam_anchor, 1)
    (stage / "bootstrap.js").write_text(boot, encoding="utf-8")
    # the pages load their siblings by relative path, so stage the whole bundle
    for f in ASSETS.iterdir():
        if f.is_file():
            shutil.copy2(f, stage / f.name)
        else:
            shutil.copytree(f, stage / f.name, dirs_exist_ok=True)
    for f in ("audit.js", "cases.js"):
        shutil.copy2(HERE / f, stage / f)

    problems, missing = {}, []
    for name in want:
        src = stage / (name + ".html")
        if not src.exists():
            missing.append(name)
            continue
        # the shell injects BOOTSTRAP into every page EXCEPT the launcher
        boot_tag = "" if name in ("launcher", "index") else '<script src="bootstrap.js"></script>'
        html = src.read_text(encoding="utf-8").replace(
            "</body>", boot_tag + '<script src="audit.js"></script><script src="cases.js"></script></body>')
        page = stage / ("audit_" + name + ".html")
        page.write_text(html, encoding="utf-8")

        dump = stage / ("dump_" + name + ".html")
        flags = ["--headless", "--disable-gpu", "--no-sandbox",
                 "--user-data-dir=" + str(stage / "profile"),
                 "--window-size=1920,1080",
                 # Under virtual time the browser runs timers as fast as it can, so
                 # this is a work allowance rather than a wall clock. The routine
                 # page - five overlay states, ~55 focusable controls - needs the
                 # headroom or it never reaches its own report() call.
                 "--virtual-time-budget=45000",
                 "--dump-dom", page.as_uri()]
        if sys.platform == "win32":
            # On Windows the browser's stdout survives neither a pipe nor an
            # inherited file handle from here - it silently produces nothing.
            # PowerShell's Start-Process -RedirectStandardOutput does work.
            args = ",".join("'" + f.replace("'", "''") + "'" for f in flags)
            subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "Start-Process -FilePath '%s' -ArgumentList %s -Wait -NoNewWindow "
                 "-RedirectStandardOutput '%s' -RedirectStandardError '%s'"
                 % (browser, args, dump, stage / "stderr.txt")],
                capture_output=True, text=True, timeout=240)
        else:
            with open(dump, "w", encoding="utf-8") as fh:
                subprocess.run(flags and [browser] + flags, stdout=fh,
                               stderr=subprocess.DEVNULL, timeout=240)
        out = dump.read_text(encoding="utf-8", errors="replace") if dump.exists() else ""

        i = out.find("AUDIT ")
        if i < 0:
            problems[name] = ["no report produced - the page probably threw"]
            print("%-11s ?  no report" % name)
            continue
        body = out[i:out.find("</div>", i)]
        body = (body.replace("&gt;", ">").replace("&lt;", "<")
                    .replace("&quot;", '"').replace("&amp;", "&"))
        bad = [l.strip() for l in body.split("\n")
               if re.search(r"UNREACHABLE|FOCUSED INVISIBLE|ESCAPED|dead ends", l)]
        states = body.count("--- ")
        if bad:
            problems[name] = bad
            print("%-11s FAIL  (%d states, %d problems)" % (name, states, len(bad)))
        else:
            print("%-11s ok    (%d states)" % (name, states))

    if missing:
        print("\nnot in the bundle: " + ", ".join(missing))
    if problems:
        print("\n===== problems =====")
        for name, lines in problems.items():
            print("\n" + name)
            for l in lines:
                print("  " + l[:300])
        return 1
    print("\nall screens clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
