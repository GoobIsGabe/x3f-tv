#!/usr/bin/env python3
"""Drive the bundled pages headlessly and check that the FEATURES work.

The nav audit proves the remote can reach everything. This proves the things it
reaches actually do something: the guided session advances and logs, the dashboard
computes from a seeded log, export/import round-trips, a Bloom set records its
partials and peak, the launcher shows today's programme.

Each page gets a fresh seeded localStorage, so results never depend on leftovers.

Usage:
    python tools/func-test/run.py                # every scenario
    python tools/func-test/run.py routine bloom  # just these

Exits non-zero if any assertion fails, so CI can gate on it.
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

SCREENS = ["launcher", "routine", "library", "progress", "bloom"]

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
        print("no Chromium-family browser found")
        return 2

    stage = Path(tempfile.mkdtemp(prefix="x3f-func-"))
    for f in ASSETS.iterdir():
        if f.is_file():
            shutil.copy2(f, stage / f.name)
        else:
            shutil.copytree(f, stage / f.name, dirs_exist_ok=True)
    for f in ("func.js", "cases.js"):
        shutil.copy2(HERE / f, stage / f)

    # No BOOTSTRAP here on purpose: it auto-starts a run and drives `force`, which
    # would fight the scenarios. Navigation is the nav-audit's job; this is about
    # whether the features do what they claim.
    failures, totals = {}, []
    for name in want:
        src = stage / (name + ".html")
        if not src.exists():
            print("%-11s ?  not in the bundle" % name)
            continue
        html = src.read_text(encoding="utf-8").replace(
            "</body>", '<script src="func.js"></script><script src="cases.js"></script></body>')
        page = stage / ("func_" + name + ".html")
        page.write_text(html, encoding="utf-8")

        dump = stage / ("dump_" + name + ".html")
        flags = ["--headless", "--disable-gpu", "--no-sandbox",
                 "--user-data-dir=" + str(stage / ("profile_" + name)),
                 "--window-size=1600,1000", "--virtual-time-budget=20000",
                 "--dump-dom", page.as_uri()]
        if sys.platform == "win32":
            args = ",".join("'" + f.replace("'", "''") + "'" for f in flags)
            subprocess.run(["powershell", "-NoProfile", "-Command",
                            "Start-Process -FilePath '%s' -ArgumentList %s -Wait -NoNewWindow "
                            "-RedirectStandardOutput '%s' -RedirectStandardError '%s'"
                            % (browser, args, dump, stage / "stderr.txt")],
                           capture_output=True, text=True, timeout=300)
        else:
            with open(dump, "w", encoding="utf-8") as fh:
                subprocess.run([browser] + flags, stdout=fh, stderr=subprocess.DEVNULL, timeout=300)
        out = dump.read_text(encoding="utf-8", errors="replace") if dump.exists() else ""

        i = out.find("FUNC ")
        if i < 0:
            failures[name] = ["no report - the page threw before finishing"]
            print("%-11s ?  no report" % name)
            continue
        body = out[i:out.find("</div>", i)]
        body = (body.replace("&gt;", ">").replace("&lt;", "<")
                    .replace("&quot;", '"').replace("&amp;", "&").replace("&#39;", "'"))
        head = body.split("\n")[0]
        m = re.search(r"(\d+) passed, (\d+) failed", head)
        p, f = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
        totals.append((name, p, f))
        bad = [l.strip() for l in body.split("\n") if l.strip().startswith("FAIL")]
        if bad:
            failures[name] = bad
            print("%-11s FAIL  %d passed, %d failed" % (name, p, f))
        else:
            print("%-11s ok    %d passed" % (name, p))

    tp = sum(p for _, p, _ in totals)
    tf = sum(f for _, _, f in totals)
    if failures:
        print("\n===== failures =====")
        for name, lines in failures.items():
            print("\n" + name)
            for l in lines:
                print("  " + l[:220])
        print("\ntotal: %d passed, %d failed" % (tp, tf))
        return 1
    print("\ntotal: %d passed, 0 failed" % tp)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
