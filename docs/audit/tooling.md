# Audit: build & test tooling

Scope: `tools/sync-from-web.py`, `tools/nav-audit/*`, `tools/func-test/*`, `.github/workflows/*`,
read completely, plus every cross-reference needed to say what they actually assert.

Everything below was verified against the working tree at commit `ef2470e` ("v1.7 — the visual
pass"). Where I ran something, the observed output is quoted.

**Measured baseline (this machine, Edge 
`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, node v22.15.1, Python 3.12.3):**

```
$ python tools/sync-from-web.py --check
would change: nothing                          EXIT=0

$ python tools/func-test/run.py
launcher    ok    14 passed      routine     ok    23 passed
library     ok     6 passed      progress    ok    22 passed
bloom       ok    22 passed      flow        ok     5 passed
splash      ok     5 passed      bloomtv     ok     7 passed
total: 104 passed, 0 failed

$ python tools/nav-audit/run.py
launcher ok (2 states)   routine ok (5)   library ok (1)   progress ok (1)
nova ok (4)   bloom ok (2)   splash ok (2)   arena ok (3)
duel ok (2)   flow ok (2)   rhythm ok (2)   calibrate ok (2)
all screens clean            (28 states total)
```

Note the docs are already stale about these numbers: `ROADMAP.md:211` and `HANDOFF.md:144` say
"63 assertions over 5 screens" — it is 104 over 8. `README.md:51` says "27 states"; it is 28.

---

## 1. Structural map

### 1.0 The two halves and the one direction of flow

```
web/                          source of truth (13 HTML pages + 9 shared .js + assets/ + sw.js + manifest.json)
  |
  |  tools/sync-from-web.py   ONE-WAY, web/ -> app/   (copy + 4 mechanical edits)
  v
app/src/main/assets/          the TV bundle (13 HTML + 9 .js + assets/ + logo.png)
  ^
  |  hand-maintained, NOT generated: launcher.html, index.html (byte-identical twins), logo.png
```

There is no reverse sync and no guard against hand-editing `app/src/main/assets/`. The next
`sync-from-web.py` run silently overwrites any hand edit to a *generated* file.

### 1.1 `tools/sync-from-web.py` (175 lines)

Constants (the entire registration surface of the sync):

| Name | Line | Shape | Meaning |
|---|---|---|---|
| `REPO` | 31 | `Path` | `parents[1]` of the script → repo root |
| `ASSETS` | 32 | `Path` | `app/src/main/assets` |
| `DEFAULT_WEB` | 33 | `Path` | `web/` |
| `GAMES` | 36–45 | `dict[str,str]` | 8 entries, web filename → bundle filename. **No TV block injected.** |
| `MENUS` | 47–51 | `dict[str,str]` | 3 entries (`X3F_Routine/Library/Progress.html`). **TV block injected.** |
| `SHARED` | 52–53 | `list[str]` | 9 filenames copied byte-for-byte, no transform |
| `ART` | 59–66 | `dict[str, list[str]]` | 3 folders → 18 binary files, copied byte-for-byte |
| `LINKS` | 69–75 | `dict[str,str]` | 5 entries, `href="X"` → `href="Y"` string replace |
| `SW_RE` | 77 | `re.Pattern` | `<script>if\('serviceWorker'in navigator\).*?</script>` (`re.S`) |
| `MANIFEST_RE` | 78 | `re.Pattern` | `<link rel="manifest"[^>]*>` |
| `TV_BLOCK` | 82–108 | `str` | injected before the **first** `</head>` on menu pages |

`GAMES` exactly:
```python
"X3F_Nova.html": "nova.html",      "X3F_Splash.html": "splash.html",
"X3F_Bloom.html": "bloom.html",    "X3F_Flow.html": "flow.html",
"X3F_Arena.html": "arena.html",    "X3F_Duel.html": "duel.html",
"X3F_Rhythm.html": "rhythm.html",  "X3F_Calibrate.html": "calibrate.html",
```
`SHARED` exactly: `x3f-exercises.js, x3f-form.js, x3f-nav.js, x3f-hype.js, x3f-music.js,
x3f-progress.js, x3f-set.js, x3f-cal.js, x3f-fx.js`.

`ART` exactly:
```python
"assets/ui":     ["aurora.jpg","badge-0.jpg","badge-1.jpg","badge-2.jpg","badge-3.jpg","badge-4.jpg"],
"assets/bloom":  ["bg.jpg","critter.png","critter_strain.png","critter_cheer.png","flower.png","bud.png","petal.png"],
"assets/splash": ["dolphin.png","star.png","pearl.png","bubble.png","fish.png"],
```

`LINKS` exactly:
```python
"index.html": "launcher.html",       "X3F_Routine.html": "routine.html",
"X3F_Library.html": "library.html",  "X3F_Progress.html": "progress.html",
"X3F_Calibrate.html": "calibrate.html",
```

**The complete transform (`convert()`, lines 111–118) — every rule:**

1. `SW_RE.sub("", text)` — delete the service-worker registration. Matches only the exact literal
   `<script>if('serviceWorker'in navigator)` … `</script>` shape. All 13 web pages currently carry
   exactly one copy of the identical one-liner:
   `<script>if('serviceWorker'in navigator){addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})}</script>`
2. `MANIFEST_RE.sub("", text)` — delete `<link rel="manifest" href="manifest.json">`. Attribute
   order is load-bearing (`rel` must come first).
3. For each `LINKS` pair: `text.replace('href="%s"' % web, 'href="%s"' % tv)`. **Double quotes
   only, `href=` only.** Applied to *every* occurrence, including inside JS strings and comments.
4. If `is_menu`: `text.replace("</head>", TV_BLOCK + "</head>", 1)`.

Nothing else is changed. Notably **not** stripped: `<link rel="apple-touch-icon"
href="apple-touch-icon.png">` (the file is not in the bundle), the Google-Fonts
`<link rel="preconnect">`/`<link href="https://fonts.googleapis.com/…">` pairs (13 of each,
dead on an offline TV), `<meta name="apple-mobile-web-app-*">`.

`TV_BLOCK` contains three things:

* **`window.X3FFILES`** — the launch map `x3f-exercises.js:127 fileFor()` reads:
  ```js
  window.X3FFILES={bloom:'bloom.html',splash:'splash.html',nova:'nova.html',flow:'flow.html',
   zone:'arena.html',max:'arena.html',boss:'arena.html',duel:'duel.html',rhythm:'rhythm.html',
   ascent:'ascent.html'};
  ```
  10 keys, matching `X3FEX.games` (`web/x3f-exercises.js:110–121`).
* **A 10-foot `<style>`** gated on `@media (min-width:1200px)`, overriding by class name:
  `.wrap,.cwrap` (max-width 1240), `body` 17px, `.exname,.cname`, `.detail,.exhint,.muscle,.note,.prog`,
  `.day`, `.mini,.set,.play,select`, `.cta`, `.go`.
* **An initial-focus shim**: `addEventListener('load', … setTimeout(… if(window.X3FNav && !X3FNav.current()) X3FNav.focusFirst() …, 180))`.

**`main()` (121–171) control flow**

```
args   = argv[1:] minus anything starting with "-"     # positional web-folder override
check  = "--check" in argv
web    = Path(args[0]) or DEFAULT_WEB
if not web.is_dir(): print(...); return 2

for (src,dst) in GAMES + MENUS:
    src missing -> missing.append; continue
    out = convert(read_text utf-8, src in MENUS)
    changed if dst absent or dst.read_text() != out ; write unless --check
for name in SHARED:  same, no transform
for folder,names in ART: same, read_bytes/write_bytes, dst.parent.mkdir(parents=True)

print("would change: "|"synced: " + ", ".join(changed) or "nothing")
if missing: print("missing in web folder: " + ...)
return 1 if (check and changed) else 0        # <-- `missing` never affects the exit code
```

Text is read and written with `Path.read_text/write_text(encoding="utf-8")` — universal-newline
mode. On Windows that writes CRLF; on Linux LF. The comparison is newline-normalised, so `--check`
is newline-agnostic, but the bytes on disk are platform-dependent and there is no `.gitattributes`.

### 1.2 `tools/nav-audit/` — three files

#### `run.py` (175 lines) — the driver

| Symbol | Line | Value |
|---|---|---|
| `REPO` | 39 | `parents[2]` |
| `ASSETS` | 40 | `app/src/main/assets` |
| `HERE` | 41 | `tools/nav-audit` |
| `SCREENS` | 43–44 | `launcher routine library progress nova bloom splash arena duel flow rhythm calibrate` (12) |
| `BROWSERS` | 46–52 | 4 absolute Windows paths (Edge ×2, Chrome ×2) then `google-chrome`, `chromium`, `chromium-browser` |

Pipeline:

1. `want = argv[1:] minus flags or SCREENS`.
2. `find_browser()` (55–62): first existing path, else first `shutil.which()` hit, else `None` → exit 2.
3. `stage = tempfile.mkdtemp(prefix="x3f-nav-")` (72). **Never deleted.**
4. **Extract the live BOOTSTRAP from Java** (77–79):
   `re.search(r'BOOTSTRAP\s*=\s*"""(.*?)""";', MainActivity.java, re.S)`. Missing → exit 2.
5. **Insert the focus seam** (88–93):
   ```python
   seam_anchor = "   setInterval(function(){ try{ var sc=scope();"
   if seam_anchor not in boot: print("BOOTSTRAP changed shape: …"); return 2
   boot = boot.replace(seam_anchor, "   window.__x3fSeat=setFocus;\n" + seam_anchor, 1)
   ```
   The anchor is whitespace-exact and currently matches `MainActivity.java:661` (three leading
   spaces). The seam is inside the bootstrap's `if(!window.__x3fNav){ … }` block, so
   `window.__x3fSeat` only exists on pages that do **not** load `x3f-nav.js` — i.e. the games.
6. Stage the whole bundle (`copy2` files, `copytree(dirs_exist_ok=True)` folders) plus `audit.js`
   and `cases.js` (96–102).
7. Per screen, build `audit_<name>.html` by replacing `</body>` with
   `boot_tag + '<script src="audit.js"></script><script src="cases.js"></script>' + '</body>'`,
   where `boot_tag = "" if name in ("launcher","index") else '<script src="bootstrap.js"></script>'`
   (111–115). This mirrors `MainActivity.isLauncher()` at `MainActivity.java:147`.
8. Run headless Chromium (118–141):
   `--headless --disable-gpu --no-sandbox --user-data-dir=<stage>/profile --window-size=1920,1080
   --virtual-time-budget=45000 --dump-dom <file-uri>`.
   On win32 it shells out to PowerShell `Start-Process … -RedirectStandardOutput` (comment at
   129–131 explains that a piped/inherited handle produces nothing on Windows); elsewhere it pipes
   stdout straight to the dump file. `timeout=240` on both.
9. Scrape the dump (144–159): find `"AUDIT "`, slice to the next `</div>`, unescape
   `&gt; &lt; &quot; &amp;` (note: **no `&#39;`**, unlike func-test), then
   ```python
   bad = [l for l in body.split("\n") if re.search(r"UNREACHABLE|FOCUSED INVISIBLE|ESCAPED|dead ends", l)]
   states = body.count("--- ")
   ```
   No `"AUDIT "` marker → `problems[name] = ["no report produced - the page probably threw"]`.
10. Exit 1 if any screen has problems, 0 otherwise. `missing` screens are printed but do **not**
    affect the exit code.

#### `audit.js` (253 lines) — the in-page walker

Module-level: `OUT = []`, `window.__x3fForce = 0`.

`bootstrap()` (14–126) — **a second, inlined copy of the shell** that runs *after* run.py's real
bootstrap. In order it:
* sets `window.__x3fNative = true`
* stubs `alert`/`confirm`/`prompt` (20–21) — mirrors `MainActivity`'s `onJsAlert → r.confirm()`
* injects `*{transition:none!important;animation:none!important}html{scroll-behavior:auto!important}` (26–28)
* monkey-patches `Element.prototype.scrollIntoView` and `.scrollTo` to `behavior:'instant'` (30–39)
* `baseline = 0` (41) — an assignment to an undeclared global if the page has none
* injects `#x3fCss` with `.app{max-width:none}` + `.x3f-focus{outline:4px solid #39f5c4}` (43–48)
* **replaces `window.__x3fDrv`** with `setInterval(() => { force = +window.__x3fForce || 0 }, 16)` (51–52)
* clears `#firstrun`'s `.show`, calls `startRun()` if it exists (54–55)
* `if (window.__x3fNav) { window.__usingFallback = !window.__x3fPageNav; return; }` (58)
* otherwise installs a third nav copy with `scope()/vis()/itemsOf()/setFocus()/ctr()` and
  `window.__fallbackSet` (59–124)

Helpers:
* `focused()` (129) → `document.querySelector('.x3f-nav-cur,.x3f-focus,.foc')` — the three focus
  class names in the codebase (x3f-nav default, bootstrap ring, launcher's `X3FNAV_CLASS='foc'`).
* `name(el)` (130–134) → `tag#id[first 16 chars of text]`.
* `seenVisible(el)` (135–147) — ancestor walk: not `disabled`, has `offsetParent`, box ≥ 4×4,
  and no ancestor with `display:none`, `visibility:hidden`, `opacity < 0.05`, or `pointer-events:none`.
* `SEL = 'button,select,a[href],input,[role=button]'` (148) and
  `controlsIn(root)` (149–151) → the **expected** control set.
* `openOverlay()` (152–159) → last of `.coach.show,.rest.show,.scrim.show,.modal.show` with
  width > 4 and opacity ≥ 0.05.
* `exhaustive()` (172) → `!!(window.X3FNav || window.__x3fSeat)`; `seat(el)` (173) →
  `X3FNav.set(el)` or `window.__x3fSeat(el)`.

`walkBFS()` (175–195) — used when `exhaustive()`. Presses `down` to seed, then BFS over
`['right','down','left','up']`, re-seating the cursor before each probe. Guard:
```js
var queue = [start], guard = 0, cap = Math.max(40, document.querySelectorAll('[data-nav]').length + 20);
while (queue.length && guard++ < cap) { … }
```
`cap` bounds **dequeues**, not visits.

`walkSweep()` (197–214) — used otherwise. Builds a fixed plan of 3 passes × (6 boustrophedon rows
of 8 rights / 8 lefts + 6 columns of 8 ups / 8 downs), truncated to 700 presses, and records
wherever the cursor lands.

`audit(label)` (218–240) — the four assertions per state:

| Emitted line | Condition | Treated as failure by |
|---|---|---|
| `UNREACHABLE (n): …` | a `controlsIn(root)` element the walk never focused, **and** `exhaustive()` | run.py:153, audit.js:243 |
| `not reached, sweep coverage is best-effort (n): …` | same, but sweep mode | neither (deliberate) |
| `FOCUSED INVISIBLE (n): …` | the walk focused something failing `seenVisible()` | run.py:153, audit.js:243 |
| `ESCAPED OVERLAY (n): …` | with an overlay open, the walk reached a node outside it | run.py:153, audit.js:243 |
| `dead ends: a \| b \| c` (first 3) | a direction that left `focused()` null | **run.py:153 only** |

Header line also records `overlay:`, `expected controls:`, `reached:` and the mode tag
`[x3f-nav, exhaustive]` / `[bootstrap nav, sweep]`.

`report()` (242–250) appends a fixed, full-screen `<div>` whose `textContent` starts
`AUDIT <filename>  <n> PROBLEM LINE(S)|ALL CLEAN` then `OUT.join("\n")`. `bad` here counts only
`UNREACHABLE|FOCUSED INVISIBLE|ESCAPED` — **not** `dead ends`.

Public surface: `window.__audit = { audit, report, bootstrap, name }`.

#### `cases.js` (83 lines) — the per-page state driver

Dispatch is by `location.pathname.split('/').pop()` substring (line 4), against the *staged*
filename `audit_<screen>.html`.

* `isLauncher = page.indexOf('launcher')>=0 || page.indexOf('index')>=0` (5).
  Non-launcher → `A.bootstrap()`; launcher → inject only the no-transition style (8–11).
* All work is scheduled at `+320 ms`, and `later(fn, ms=260)`.
* **launcher** (16–29): audit `launcher home`; then `window.__x3fDevices([{a:'AA:BB:CC:DD:EE:F1',n:'X3 FORCE'},{a:'…F2',n:''}])`,
  `document.getElementById('barChip').click()`, audit `launcher: bar picker open`. Bails to
  `A.report()` if `#barChip` is absent.
* **routine** (31–62): 5 states —
  `routine: day list` → `#startSession.click()` → `routine: guided coach open` →
  write `x3f_session.pending = {slug:'deadlift',game:'bloom',at:Date.now()}` and add `.show` to
  `#cPending` → `routine: coach + "did you finish that set?" prompt` → remove `.show`,
  `#cLog.click()` → `routine: rest timer` → `#restSkip.click()`, `#cClose.click()` →
  `routine: session summary`.
* **library** (64) / **progress** (65): one state each, no interaction.
* **games** (67–81): `game: playing (no overlay)`, then for each `.scrim` in DOM order, remove
  `.show` from all and add it to that one → `game: overlay #<id> open` (200 ms apart).

### 1.3 `tools/func-test/` — four files

#### `run.py` (194 lines)

| Symbol | Line | Value |
|---|---|---|
| `SCREENS` | 28–29 | `launcher routine library progress bloom flow splash bloomtv` (8) |
| `AS_PAGE` | 35 | `{"bloomtv": "bloom"}` — scenario → real bundle page |
| `BOOTSTRAPPED` | 36 | `{"bloomtv"}` — the only scenario that gets the shell bootstrap |
| `BROWSERS` | 38–44 | identical list to nav-audit |

`syntax_check()` (57–84) — runs **before** anything is staged or launched:
```python
if not shutil.which("node"): return []          # silently skipped
for page in sorted(ASSETS.glob("*.html")):      # bundle only; web/ is never checked
    blocks = re.findall(r"<script(?![^>]*\ssrc=)[^>]*>(.*?)</script>", page.read_text(), re.S)
    for i, src in enumerate(blocks):
        if len(src.strip()) < 80: continue      # skip tiny blocks (e.g. the TV_BLOCK focus shim)
        write to tmp/<stem>_<i>.js ; subprocess.run(["node","--check",f])
        on returncode: collect the first two stderr lines containing "Error" or "^"
```
Any failure prints and returns 1 before a browser is started.

`main()` (87–190):
1. `want`, `find_browser()` (exit 2 if none), `syntax_check()` (exit 1 if broken).
2. `stage = tempfile.mkdtemp(prefix="x3f-func-")` (102) — **never deleted** — copy the bundle plus
   `func.js` and `cases.js`.
3. Extract `BOOTSTRAP` from `MainActivity.java` (120–126) and write `bootstrap.js` **without** the
   nav-audit's seam. Missing → exit 2.
4. Per scenario: `src = stage/(AS_PAGE.get(name,name) + ".html")`; skip with
   `"%-11s ?  not in the bundle"` if absent. Build `func_<name>.html` by replacing `</body>` with
   ```
   <boot?><script src="func.js"></script><script src="cases.js" data-scenario="<name>"></script></body>
   ```
   (134–137). **`data-scenario` is never read by `cases.js`.**
5. Chromium flags (142–147): `--headless --disable-gpu --no-sandbox
   --user-data-dir=<stage>/profile_<name> --window-size=1600,1000 --virtual-time-budget=20000
   --dump-dom <uri>`, plus `?ex=overhead-press` appended when the scenario is in `BOOTSTRAPPED`.
   Per-scenario profile ⇒ per-scenario localStorage isolation. `timeout=300`.
6. Scrape (160–177): find `"FUNC "`, slice to `</div>`, unescape (**including `&#39;`**), parse the
   header with `re.search(r"(\d+) passed, (\d+) failed", head)`, collect lines starting `FAIL`.
7. Exit 1 if any failures.

#### `func.js` (60 lines) — the harness

* `L = []`, `pass`, `fail`; `ok(name, cond, extra)` pushes `PASS `/`FAIL ` + name + optional `  -> extra`.
* `has(id)`, `txt(id)` (whitespace-collapsed textContent), `click(id)`.
* **`seed()` (25–48)** — the shared fixture:
  * 14 days back to 0, skipping `d === 6` (one deliberate rest day) → 13 `k:'set'` entries.
  * movement cycle `moves[d % 5]` over
    `[['deadlift','Black'],['bent-row','Dark Gray'],['chest-press','Dark Gray'],['overhead-press','Light Gray'],['calf-raise','Light Gray']]`.
  * each entry: `{t, k:'set', g:'bloom', ex, band, b, reps: 18+(d%9)*3, full: 12+(d%5), part: 4+(d%7), peak: 300+(d%6)*20}`.
  * writes `x3f_history`; removes `x3f_ach, x3f_chal, x3f_prog, x3f_routineProg2, x3f_session,
    x3f_exCal, x3f_routine2`; sets `x3f_band = "White"`.
  * **Does not clear** `x3f_bandMax`, `x3f_music`, `x3f_formOn`, `x3f_cues`.
* `report(label)` appends the fixed full-screen div beginning
  `FUNC <label>  <pass> passed, <fail> failed`.
* Public: `window.__func = { ok, has, txt, click, seed, report, L }`.

#### `cases.js` (349 lines) — the scenarios

Dispatch: `page = location.pathname.split('/').pop()` (line 4) — again a substring match on the
staged filename. Order matters: `progress → routine → library → bloomtv → bloom → flow → splash →
launcher/index`. `bloomtv` **must** precede `bloom` (comment at 167–177).

Boot sequence: `F.seed()` at parse time (9), then `wait(200) → rerender() → wait(300) → dispatch`.
`rerender()` (10–13) calls the page globals `refresh()` and `render()` if they exist, inside
`try/catch`.

Every assertion, by scenario:

**progress (22 assertions, lines 22–79)**
| Assertion | Depends on |
|---|---|
| engine present | `window.X3FProg` |
| today strip renders a programme day | `#today` matches `/day\|Done\|Start/i` |
| streak shown and non-zero | `#today` has a digit **and** `P.streak().current > 0` |
| challenge card renders | `txt('chal').length > 20` |
| 12-week grid has 84 cells | `#grid .cell` **=== 84** |
| grid marks training days | `#grid .cell.done` ≥ 10 |
| reps-per-week chart drew 12 bars | `#vol div` **=== 12** |
| peak-force chart drew 12 bars | `#pk div` **=== 12** |
| personal bests table has rows | `#pbs .pbrow` ≥ 3 |
| achievements rendered | `#achs .ach` **> 50** |
| some unlocked | `#achs .ach.got` > 0 |
| unlocked count text | `#achCnt` matches `/of \d+ unlocked/` |
| three achievement filters | `#achFilters .chip` **=== 3** |
| locked filter shows only locked | `chips[2].click()` → no `.ach.got` |
| unlocked filter shows only unlocked | `chips[1].click()` → no `.ach:not(.got)` |
| cleared log empties the PB table | `x3f_history='[]'` + rerender → 0 `.pbrow` |
| import restored the history | `#impBox` value = `{v:1,history,ach:{},chal:{},bandMax:{}}`; `#impBtn` click |
| import re-populated the dashboard | `#pbs .pbrow` ≥ 3 |
| recent sets are listed | `#recent .pbrow` ≥ 3 |
| each recent row offers a delete | `#recent [data-del]` exists |
| deleting a set removes it | click `#recent [data-del]` (confirm stubbed true) → `P.sets().length - 1` |
| band coaching appears at 44 reps | `#advice` matches `/Move .* up to Black/i` |

**routine (23 assertions, 82–142)** — `#pstrip` (length > 20, matches `/Push|Pull|Done|Start/`,
`/day streak/`, `/Challenge|🎯/`), `#list select[data-k="sets"]`.value === `'1'`, every
`#list select[data-k="band"]`.value === `'White'`, `#list` text matches `/X3 suggests/`,
`#list .ex` ≥ 4; then `#startSession` → `#coach.show`, `#cName` non-empty, `#demoCv.width > 0`;
`#cLog` → `P.sets().length === before+1`, `last.ex` truthy, `last.band||last.b` truthy,
`#cName` changed, `#rest.show`; `#restSkip` → `#rest` not `.show`; `#cSkip` → `#coach` still
`.show`; `#cClose` → `#done.show`, `#dSets` has a digit, `#dUndo` exists, `#dUndo` →
`P.sets().length === afterLog - 1`.

**library (6 assertions, 145–165)** — `.ex` count **=== 11**; `#lib select` exists; set it to
`'Black'` + dispatch `change` → after re-render `#lib select`.value === `'Black'`;
`#lib .gm` href matches `/band=Black/` and `/ex=[a-z-]+/`; `.detail` count **≥ 22**.

**bloomtv (7 assertions, 178–203)** — the only scenario that runs the real shell bootstrap:
`window.__x3fDrv` truthy; global `EXSLUG === 'overhead-press'` (from `?ex=`); `window.X3FCal`
present; after `X3FCal.save('overhead-press','White',52,78)`, `ref() === 26`; then with
`window.__x3fForce = 52` → `force === 0`; `= 65` → `|force/ref() - 0.5| < 0.05`; `= 78` →
`|force/ref() - 1| < 0.02`. This is the regression test for the per-movement floor living in the
bootstrap's `calLo()` subtraction (`MainActivity.java:614–619`) rather than only in the games'
`onSample()`.

**bloom (22 assertions, 206–273)** — `X3FProg`, `X3FCal`, `X3FForm.verb('chest-press')==='PRESS'`,
`verb('deadlift')==='PULL'`; the whole `X3FCal` contract (`range().lo===0 && .auto` when cleared;
`save(…,96,214)` then `lo/hi/!auto`; `span()===118`; `observe()` never overwriting a real
calibration; `observe()` learning a ceiling on an uncalibrated movement; `save('drag-curl',
'White',100,120) === true` (MIN_SPAN 10); `save('upright-row','White',100,100) === false`);
`X3FHype`, `X3FMusic`, `#musicBtn`; then a driven set using the page globals `reps`, `hype`,
`burnoutReps`, `fullReps`, `setPeak`, `endSet(true)` and `#startBtn`, `.x3fh-burn.on`, `#toast`
matching `/partials past it/`, exactly one new `x3f_history` entry, `part === 7`, `peak === 355`,
and `x3f_ach` non-empty.

**flow (5, 276–294)** — `X3FSet`, `X3FProg`; `X3FSet.watch(()=>300, ()=>400)`; `#startBtn`;
global `reps = 17`; `endSet(true)` or `stop()`; then one more logged set, `last.g === 'flow'`,
`last.peak > 0`.

**splash (5, 297–311)** — `X3FSet`; `X3FSet.watch(()=>250, ()=>400)`; `startRun(); score = 640;
endRun();` then one more logged set, `score === 640`, `peak > 0`, `reps == null`.

**launcher (14, 314–343)** — `#prog` length > 15 and matches `/streak/` and `/Challenge|🎯|✅/`;
`.card` count **=== 11**; `.card[0]` has `.hero`; `#musicBtn`; `#finder` not `.show`;
`window.__x3fDevices([...])` + `#barChip.click()` → `#finder.show`, `#findList .dev` **=== 1**,
`#grid` height unchanged within 1 px; `#closeFind` → `#finder` not `.show`;
`window.__x3fSetBar('on','Bar: LIVE')`, `window.__x3fSetBattery(4020)` → `#battTxt` matches
`/80%/`; `(3350)` → `#battTxt` has `.low`; `(-1)` → `#battTxt` empty.

#### `engine.html` (217 lines) — the pure-logic tests

* Loads **the bundle copies** by relative path: `../../app/src/main/assets/x3f-exercises.js` and
  `…/x3f-progress.js` (lines 5–6). It does not test `web/`.
* No runner, no CLI, no exit code, no CI hook — `DEPLOY.md:67` says "open it in a browser".
* Local helpers: `ok/eq`, `key(minusDays)`, `seed(entries)` (writes `x3f_history`, removes
  `x3f_ach/x3f_chal/x3f_prog`), `at(minusDays, o)` (builds `{t, k:'set', …}` at 12:00 local).
* Sections and what each asserts:
  * **streak** (25–46): today-only = 1; three in a row = 3; today-not-yet-done is a grace day
    (= 2); one rest day allowed (= 4); two rest days inside a week ends the run (= 3); stale
    history = 0; a 13-day run with a weekly rest day ≥ 13.
  * **12-week program** (49–61): `week` 1 at the start; `perWeek` 4 in foundation; `nextType`
    alternation `Pull` → `Push`; 35 days in ⇒ week 6 with `perWeek` 6; `P.grid().length === 84`.
  * **personal bests** (64–72): `pb(slug,band).reps` per band; `pb().part`; `pbTable().length === 3`.
  * **band advice** (75–82): two ≥ 40-rep sets on Dark Gray ⇒ one suggestion `to === 'Black'`;
    12 reps ⇒ none; Elite Black ⇒ none.
  * **daily challenge** (85–104): empty history ⇒ `kind === 'baseline'`; deterministic per day
    (`id` and `target` stable); `slug` truthy; a reps challenge targets less than the PB;
    `done === false`, then satisfying it flips `done` and `challengesDone() === 1`.
  * **achievements** (107–122): `catalogue().length >= 100`; no duplicate ids; every badge has a
    `name` and a function `test`; nothing unlocked on an empty log; the first set unlocks some;
    unlocks are not handed out twice; `achievements()` reports mixed `got` flags; `set25` unlocked
    at 26 reps and `set40` still locked.
  * **logSet round trip** (125–132).
  * **history compaction** (136–157): 484 entries over 121 days; `compact()` shrinks; recent days
    stay `k:'set'`; older become `k:'roll'`; `stats().days` preserved; rollups keep best reps;
    `stats().sessions >= beforeLen*0.9`.
  * **undo** (160–167): `lastSet()`, `removeSet(t) === 1`, `removeSet(123) === 0`.
  * **previous()** (170–177): latest for movement+band, band-respecting, and skipping a given `t`.
  * **day-aware challenges** (180–197): `dayMovements('Push'/'Pull')` defaults, an edited
    `x3f_routine2` wins, and `challenge().slug` is a movement of `program().nextType`.
  * **tension + eccentric** (200–213): `tut`/`ecc` stored on the row, `stats().bestTut/bestEcc`,
    and the `Slow Negative` / `Under Tension` badges unlock.
* Writes the result into `#log` as `X3F-PROGRESS ENGINE  <pass> passed, <fail> failed`.

### 1.4 CI — `.github/workflows/`

#### `build.yml` (59 lines) — "Build APK"
* Triggers: `push` to `main` (**no path filter** — every push, including docs-only), `workflow_dispatch`.
* `permissions: contents: write`.
* `ubuntu-latest`; `actions/checkout@v4`; `actions/setup-java@v4` temurin 17;
  `gradle/actions/setup-gradle@v4` with `gradle-version: '8.7'`.
* `gradle assembleDebug --no-daemon --stacktrace` (30) — there is **no Gradle wrapper in the repo**
  (`gradlew`/`gradle/` absent).
* `cp app/build/outputs/apk/debug/app-debug.apk x3f-tv.apk` (33).
* `actions/upload-artifact@v4` name `x3f-tv-apk`.
* `softprops/action-gh-release@v2` with `tag_name: latest`, files `x3f-tv.apk`.
* Mirror step (50–59):
  ```bash
  grep -m1 versionCode app/build.gradle | grep -o '[0-9]\+' > version.txt
  git checkout -B dist
  git add -f x3f-tv.apk version.txt      # both are gitignored (*.apk), hence -f
  git commit -m "APK + version ${GITHUB_SHA}" || echo "no change"
  git push -f origin dist
  ```
  `app/build.gradle:22` is `    versionCode 17`, so `version.txt` = `17`. The in-app updater reads
  `https://raw.githubusercontent.com/GoobIsGabe/x3f-tv/dist/version.txt`
  (`MainActivity.java:70`) and downloads
  `https://github.com/GoobIsGabe/x3f-tv/releases/download/latest/x3f-tv.apk` (`MainActivity.java:71`).

**`build.yml` runs no test of any kind.** Not `sync-from-web.py --check`, not the nav audit, not
the func tests, not the engine tests, not even a lint (`app/build.gradle:45–48` sets
`abortOnError false`, `checkReleaseBuilds false`).

#### `pages.yml` (44 lines) — "Publish web games"
* Triggers: `push` to `main` filtered to `web/**` and `.github/workflows/pages.yml`, plus dispatch.
* One shell step:
  ```bash
  touch web/.nojekyll
  git checkout --orphan gh-pages-tmp
  git rm -rq --cached . || true
  find . -maxdepth 1 ! -name web ! -name .git ! -name . -exec rm -rf {} +
  mv web/* web/.nojekyll . 2>/dev/null || mv web/* .
  rmdir web 2>/dev/null || true
  git add -A ; git commit -m "web games ${GITHUB_SHA}" || echo "no change"
  git branch -M gh-pages ; git push -f origin gh-pages
  ```
* Publishes `web/` verbatim — **including** `web/Start Games.bat` and
  `web/X3_Force_BLE_Capture_Guide.md`. It does **not** touch `web/sw.js`.

### 1.5 The contract surface the tooling depends on

**Storage keys** (counted across `web/`, `app/src/main/assets/`, `tools/`):
`x3f_history` (49), `x3f_bandMax` (12), `x3f_session` (11), `x3f_ach` (11), `x3f_exCal` (9),
`x3f_band` (9), `x3f_routine2` (6), `x3f_music` (6), `x3f_chal` (6), `x3f_prog` (4),
`x3f_formOn` (4), `x3f_cues` (2), `x3f_routineProg2` (1 — written via
`xset('routineProg2', …)`, `X3F_Routine.html:265`).

**Shared-module globals** the tests assert on:
`X3FProg` (28 methods, `x3f-progress.js:604–615`), `X3FCal`
(`{slug,range,floor,span,save,observe,clear,all,bands,minSpan}`, `x3f-cal.js:131–135`),
`X3FSet` (`{report,improvement,toast,announce,watch,reset,seen}`, `x3f-set.js:174–176`),
`X3FForm` (`{create,mount,rigs,has,verb}`), `X3FHype` (`{create,DEFAULT_LADDER}`),
`X3FMusic` (`{create,attach,moods}`), `X3FFX` (`api`), `X3FEX`
(`{list,by,groups,days,bands,games,gameUrl,get}`), `X3FNav`
(`{refresh,focusFirst,set,current,engaged}`, `x3f-nav.js:302–308`).

**Shell/test bridge globals:** `window.__x3fNative`, `__x3fForce`, `__x3fDrv`, `__x3fNav`,
`__x3fPageNav` (`x3f-nav.js:284`), `__x3fSeat` (staging-only seam), `__fallbackSet`,
`__usingFallback`, `__x3fDevices`, `__x3fSetBar`, `__x3fSetBattery`, `__x3fVersion`,
`__x3fCloseOverlay` (`MainActivity.java:556`), and the Java bridge `X3F` (`X3F.reZero`).

**Page-level globals the tests reach into directly:** `force`, `baseline`, `calLo()`, `startRun()`,
`endSet()`, `endRun()`, `stop()`, `$()`, `refresh()`, `render()`, `reps`, `burnoutReps`,
`fullReps`, `setPeak`, `score`, `hype`, `band`, `ref()`, `EXSLUG`.

**CSS/DOM tokens the tooling keys on:** `.scrim`, `.show`, `.coach`, `.rest`, `.modal`,
`[data-nav]`, `[data-nav-first]`, `[data-nav-back]`, `[data-nav-scope]`, `.x3f-nav-cur`,
`.x3f-focus`, `.foc` (`window.X3FNAV_CLASS='foc'`, `launcher.html:88`), `--navring`,
`#x3fCss`, `#firstrun`, `#zeroBtn`, `.app`, `.tvbtn`, `.card`, `.hero`, `.ex`, `.detail`, `.cell`,
`.done`, `.pbrow`, `.ach`, `.got`, `.chip`, `.dev`, `.gm`, `.x3fh-burn.on`, `[data-del]`,
`select[data-k="sets"]`, `select[data-k="band"]`, and the 15 class names in `TV_BLOCK`'s
`@media (min-width:1200px)` block plus the 12 in `BOOTSTRAP`'s.

---

## 2. THE REGISTRATION CHECKLIST — every place a new page / script / asset must be declared

This is the part a refactor most easily misses. Adding one page can touch **eleven** files.

### 2.1 A new **game page** (e.g. `web/X3F_Ascent.html` → `ascent.html`)

| # | File | What to add | Consequence of missing it |
|---|---|---|---|
| 1 | `web/X3F_<Name>.html` | the page itself | — |
| 2 | `web/sw.js:2` (`const A=[…]`) | the filename | not precached; offline PWA misses it |
| 3 | `web/sw.js:1` (`const C='x3f-v8'`) | **bump the cache name** | returning phone users never see the change (cache-first, `sw.js:6`) |
| 4 | `web/index.html` | a `<a class="card" href="X3F_<Name>.html" … data-nav>` | not linked from the web hub |
| 5 | `tools/sync-from-web.py:36` `GAMES` | `"X3F_<Name>.html": "<name>.html"` | **never copied into the bundle** |
| 6 | `tools/sync-from-web.py:82` `TV_BLOCK` `X3FFILES` | `<key>:'<name>.html'` | Play navigates to the web filename, 404 on the TV |
| 7 | `web/x3f-exercises.js:110` `GAMES` | `<key>: {name, sub, file, mode?, tempo?}` | the game is not offerable per movement |
| 8 | `web/X3F_Routine.html:232` `GAMEKEYS` | `'<key>'` | not in the per-lift game picker |
| 9 | `app/src/main/assets/launcher.html` **and** `index.html` (hand-maintained twins) | a card | not on the TV launcher |
| 10 | `tools/nav-audit/run.py:43` `SCREENS` | `"<name>"` | never nav-audited |
| 11 | `tools/func-test/run.py:28` `SCREENS` (+ a branch in `cases.js`) | scenario | never feature-tested |

Plus, if the page is a **menu**, use `MENUS` (line 47) instead of `GAMES` so the TV block is
injected, and add a `LINKS` entry (line 69) so other pages' `href="X3F_<Name>.html"` are rewritten.

### 2.2 A new **shared script** (e.g. `web/x3f-foo.js`)

| # | File | What to add |
|---|---|---|
| 1 | `tools/sync-from-web.py:52` `SHARED` | `"x3f-foo.js"` — **without this the file never reaches the bundle and every page that `<script src>`s it 404s on the TV** |
| 2 | `web/sw.js:2` `A` | the filename (note: `x3f-progress.js`, `x3f-set.js`, `x3f-cal.js`, `x3f-fx.js`, `x3f-hype.js`, `x3f-music.js` are **already missing** from `A`) |
| 3 | `web/sw.js:1` `C` | bump |
| 4 | each `web/*.html` that needs it | `<script src="x3f-foo.js"></script>` (and the sync copies the tag through unchanged) |
| 5 | `tools/func-test/engine.html:5–6` | a `<script src="../../app/src/main/assets/x3f-foo.js">` if the engine tests need it |
| 6 | `tools/func-test/func.js:41` | the module's localStorage key, if it has one, so `seed()` resets it |

### 2.3 A new **art asset** (e.g. `web/assets/ui/newthing.png`)

| # | File | What to add |
|---|---|---|
| 1 | `tools/sync-from-web.py:59` `ART[folder]` | the filename — **binary assets are enumerated, not globbed** |
| 2 | `web/sw.js:2` `A` | the path (note: **no `assets/**` entry exists today at all**) |
| 3 | `web/sw.js:1` `C` | bump |

A brand-new folder needs a new `ART` key; `dst.parent.mkdir(parents=True, exist_ok=True)`
(`sync-from-web.py:165`) creates it on the bundle side.

### 2.4 A new **DOM id / class** the shell or tests touch
`MainActivity.java` BOOTSTRAP hard-codes `#firstrun`, `#zeroBtn`, `#x3fCss`, `.app`, `.tvbtn`,
`.scrim.show`, `.modal.show`, `.x3f-focus`, and 12 typographic class names. `TV_BLOCK` hard-codes
15 more. `tools/nav-audit/audit.js:148,153` and `tools/func-test/cases.js` hard-code ~35 ids and
~20 class names (listed in §1.5). Renaming any of them is a silent behaviour change on the TV and
usually a hard crash in the test harness (§3, D-13).

### 2.5 Release plumbing
* `app/build.gradle:22–23` — bump **both** `versionCode` and `versionName` or the TV updater keeps
  reporting "You're on the latest" (`DEPLOY.md:29–30`).
* Nothing else: `build.yml` derives `version.txt` from `versionCode` automatically.

---

## 3. Defects

Ranked roughly by blast radius. Each has file:line evidence and a concrete failure.

### D-1 — `TV_BLOCK` advertises a bundle page that does not exist (**shipping bug today**)

`tools/sync-from-web.py:86`
```python
 ascent:'ascent.html'};
```
`ascent` is **not** in `GAMES` (lines 36–45), `web/X3F_Ascent.html` is never synced, and
`app/src/main/assets/ascent.html` does not exist. But the game is offered on the TV:
`app/src/main/assets/routine.html:258` `const GAMEKEYS=[…,'ascent'];` and
`app/src/main/assets/library.html` renders an Ascent link via `EXD.gameUrl('ascent',…)`
(`x3f-exercises.js:134–143` → `fileFor('ascent','X3F_Ascent.html')` → `'ascent.html'`).

**Failure:** on the TV, Library → any movement → **Ascent**, or Routine → set a lift's game to
Ascent → **Play**, navigates to `file:///android_asset/ascent.html`. There is no
`onReceivedError` override in `MainActivity.java`, so the user gets Chromium's
"webpage not available" error page. Recovery is only via the remote's Back key
(`MainActivity.java:557` `web.loadUrl(LAUNCHER)`).

*Root cause:* `X3F_Ascent.html:1` loads `https://cdnjs.cloudflare.com/…/three.min.js` — it cannot
work offline in the bundle — so it was deliberately left out of `GAMES` but nobody removed it from
`X3FFILES`/`GAMEKEYS`. Neither test suite covers it (it is in neither `SCREENS` list).

### D-2 — CI runs **none** of the three test suites, nor the sync check

`.github/workflows/build.yml:11–59` has exactly six steps: checkout, JDK, Gradle, `assembleDebug`,
upload-artifact, release, mirror. There is no `python tools/…` anywhere in either workflow.

Yet `tools/nav-audit/run.py:30` says *"Exits non-zero if any screen reports a problem, so CI can
gate on it"*, `tools/func-test/run.py:15` says *"Exits non-zero if any assertion fails, so CI can
gate on it"*, and `DEPLOY.md:42–43` calls `--check` *"handy before a release"*.

**Failure:** push a change that breaks the guided coach's reachability, or that leaves the bundle
stale relative to `web/`. `build.yml` compiles it, publishes it to the `latest` release and
force-pushes it to `dist`, and the TV's in-app updater offers it. Nothing in the pipeline ever
noticed. Every one of the three shipped bugs the nav audit was written for
(`tools/nav-audit/run.py:9–14`) could ship again unchallenged.

### D-3 — `sw.js`'s cache name is never bumped, and the fetch handler is cache-first

`web/sw.js:1` `const C='x3f-v8';`
`web/sw.js:6`
```js
e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)…))
```
`activate` only deletes caches whose key `!== C` (line 4). A new SW is installed only when
`sw.js`'s **bytes** change. `pages.yml` copies `web/` verbatim and never touches `sw.js`.

**Failure:** ship a fixed `X3F_Bloom.html` to gh-pages. A phone that has visited before fetches
`sw.js`, sees identical bytes, keeps the old worker, and serves the *cached* Bloom from `x3f-v8`
forever. The user reports "the fix didn't ship". There is no way to force it short of clearing
site data. This is the single highest-impact registration item on the web half.

Compounding it: `sw.js:2` `A` omits `x3f-progress.js`, `x3f-set.js`, `x3f-cal.js`, `x3f-fx.js`,
`x3f-hype.js`, `x3f-music.js` and the whole of `assets/**` — six of the nine shared modules and
all 18 art files are only cached opportunistically on first fetch.

### D-4 — `sync-from-web.py` cannot fail on a missing source file

`tools/sync-from-web.py:171`
```python
return 1 if (check and changed) else 0
```
`missing` (populated at lines 133, 145, 159) is printed at line 170 and then ignored.

**Failure:** rename `web/x3f-nav.js` → `web/x3f-focus.js` as part of a refactor. Run
`python tools/sync-from-web.py`. It prints
`missing in web folder: x3f-nav.js` and **exits 0**. The stale `app/src/main/assets/x3f-nav.js`
stays in the bundle, every page's `<script src="x3f-focus.js">` 404s on the TV, and the D-pad
silently falls back to the shell's cruder nav. `--check` in a future CI gate would report
`would change: nothing` and pass.

### D-5 — `sync-from-web.py` never deletes; the bundle accumulates orphans

The three loops (130, 142, 154) only ever write. There is no reconciliation pass over
`ASSETS.iterdir()`.

**Failure:** delete `web/X3F_Duel.html` in the redesign. `app/src/main/assets/duel.html` survives
forever, is still staged and audited by `tools/nav-audit/run.py:96–100` (which copies *everything*
in `ASSETS`), still syntax-checked by `tools/func-test/run.py:70` (`ASSETS.glob("*.html")`), and
still shipped in the APK. Same for a renamed shared script or art file.

### D-6 — `LINKS` rewriting is `href="…"`-only, so `location.href='index.html'` survives untouched

`tools/sync-from-web.py:114–115`
```python
for web, tv in LINKS.items():
    text = text.replace('href="%s"' % web, 'href="%s"' % tv)
```
Nine bundled pages carry the single-quoted form, e.g. `app/src/main/assets/bloom.html:60`
`onclick="history.length>1?history.back():location.href='index.html'"`, plus
`app/src/main/assets/nova.html:103` `onclick="location.href='index.html'"` and
`app/src/main/assets/x3f-nav.js:201` `if (history.length > 1) history.back(); else location.href = 'index.html';`.

Today this "works" only because `app/src/main/assets/index.html` exists as a **byte-identical
17,905-byte duplicate of `launcher.html`** (verified: `diff` reports no differences), kept by hand.

**Failure:** a redesign that consolidates on `launcher.html` and deletes the duplicate
`index.html`. Every game's Back chevron, Nova's "Back to Games" button and `x3f-nav.js`'s
Escape/Backspace/gamepad-B fallback all navigate to a missing file. The nav audit will not catch
it (it never presses `enter`; `walkBFS`/`walkSweep` only move focus).

### D-7 — `launcher.html` and `index.html` are unmanaged twins

Neither is in `GAMES`, `MENUS` or `SHARED`; neither is derived from `web/index.html` (which is a
completely different 9,940-byte phone hub). `MainActivity.java:147` treats both as the launcher:
```java
private boolean isLauncher(String url) { return url != null && (url.contains("launcher.html") || url.endsWith("index.html")); }
```
`tools/nav-audit/run.py:43` audits only `launcher`; `tools/func-test/run.py:28` tests only
`launcher`. `index.html` is covered by nothing but `syntax_check()`.

**Failure:** edit `launcher.html` to add a card. `index.html` silently diverges. Any code path that
lands on `index.html` (D-6's nine back buttons, `x3f-nav.js:201`) shows the *old* launcher, with no
test able to notice.

### D-8 — `audit.js` carries a stale hand-copy of the shell and clobbers the real force driver

`tools/nav-audit/run.py:74–76` says *"Pull the LIVE BOOTSTRAP out of MainActivity rather than
keeping a copy here. A copy would drift, and the audit would then be testing fiction."* — and then
`tools/nav-audit/audit.js:14–126` is exactly that copy, and it runs **after** the real one
(`run.py:112` orders `bootstrap.js`, `audit.js`, `cases.js`).

The early-out is at `audit.js:58`, but three clobbering statements run before it:
```js
// audit.js:51-52
if (window.__x3fDrv) clearInterval(window.__x3fDrv);
window.__x3fDrv = setInterval(function () { try { force = +window.__x3fForce || 0; } catch (e) {} }, 16);
// audit.js:58
if (window.__x3fNav) { window.__usingFallback = !window.__x3fPageNav; return; }
```
The real driver is `MainActivity.java:614–619`:
```js
window.__x3fDrv=setInterval(function(){ try{
  var f=+window.__x3fForce||0;
  if(typeof calLo==='function'){ var lo=+calLo()||0; f=f>lo?f-lo:0; }
  force=f;
}catch(e){} },16);
```
So the nav audit runs the games with the **pre-v1.6 unfloored** force pipeline. The copy is also
missing the `.tvbtn{display:none}` rule, the entire 12-selector 10-foot game CSS
(`MainActivity.java:596–609`), the `#zeroBtn` capture handler (`MainActivity.java:621`), and
`setFocus`'s `scrollIntoView` (`MainActivity.java:634` vs `audit.js:91–95`).

**Failure:** a redesign moves an overlay's visibility onto a force threshold (e.g. "the rest card
appears once force drops below the floor"). Under the real shell that overlay opens; under the
audit's unfloored driver it never does, so the audit walks a state the TV never shows — and misses
the state the TV *does* show. The audit reports "ALL CLEAN" on a screen that is unreachable in the
app.

### D-9 — the nav audit shares **one** browser profile across all 12 screens

`tools/nav-audit/run.py:119`
```python
"--user-data-dir=" + str(stage / "profile"),
```
(compare `tools/func-test/run.py:145`, which correctly uses `"profile_" + name`). Chromium gives
every `file://` page the same origin for localStorage, so state written by one screen is visible to
the next.

`tools/nav-audit/cases.js:36–41` writes a pending set and never removes it:
```js
var S = JSON.parse(localStorage.getItem('x3f_session'));
S.pending = { slug: 'deadlift', game: 'bloom', at: Date.now() };
localStorage.setItem('x3f_session', JSON.stringify(S));
```

**Failure:** `SCREENS` order is `launcher routine library progress nova …`. The `routine` run leaves
`x3f_session.pending` set and a started session; `progress`, `nova`, `bloom` … then boot with it.
`x3f-cal.js:80–88` `slug()` resolves from `x3f_session.pending.slug`, so every subsequent game
audits as if it were mid-deadlift. Run `python tools/nav-audit/run.py nova` on its own and you get
a *different* set of states from the same command inside a full run — a class of bug that is
invisible until it bites, and that makes a "clean" full run non-reproducible.

### D-10 — `run.py` fails a screen on `dead ends`; `audit.js` calls the same screen ALL CLEAN

`tools/nav-audit/run.py:152–153`
```python
bad = [l.strip() for l in body.split("\n")
       if re.search(r"UNREACHABLE|FOCUSED INVISIBLE|ESCAPED|dead ends", l)]
```
`tools/nav-audit/audit.js:243`
```js
var bad = OUT.filter(function (l) { return /UNREACHABLE|FOCUSED INVISIBLE|ESCAPED/.test(l); }).length;
```
The audit's docstring (`run.py:23`) lists "dead ends" under the same heading as the hard failures,
but `audit.js:239` emits it as informational (`w.dead.slice(0,3)`).

**Failure:** a screen whose in-page report header literally reads `AUDIT nova.html  ALL CLEAN` is
reported by `run.py` as `nova FAIL (4 states, 1 problems)` with a "dead ends" line as the only
evidence. A developer reading the dumped report cannot reconcile the two.

### D-11 — `walkBFS`'s `cap` bounds dequeues, not visits, and is derived from the wrong count

`tools/nav-audit/audit.js:183`
```js
var queue = [start], guard = 0, cap = Math.max(40, document.querySelectorAll('[data-nav]').length + 20);
while (queue.length && guard++ < cap) { … for 4 dirs … queue.push(after) … }
```
Each dequeue can enqueue up to 4 new nodes, so the queue can outrun `cap`. And on a game page
`[data-nav]` count is **0** (verified: Arena, Bloom, Duel, Flow, Nova, Rhythm, Splash all have zero
`data-nav` attributes), so `cap` is 40 — while `exhaustive()` is nonetheless true on those pages
because `run.py`'s seam sets `window.__x3fSeat` (`run.py:93`).

**Failure:** the redesign adds a 55-control settings overlay to Nova. BFS dequeues 40 nodes, exits
with 15 still queued, and `audit()` (line 224) computes `missing = expect.filter(not reached)` and
prints `UNREACHABLE (15): …` for controls the remote can reach perfectly well. The screen fails CI
for a defect that does not exist, and the natural "fix" is to raise the number until it passes.

### D-12 — the audit's "expected controls" selector does not match either nav's item selector

`tools/nav-audit/audit.js:148`
```js
var SEL = 'button,select,a[href],input,[role=button]';
```
`x3f-nav.js:81` collects `[data-nav]`. The bootstrap navs collect
`'button,select,input,a[href],.cta,.buy,.mini,.iconbtn,[role=button],[onclick]'`
(`MainActivity.java:632`, `audit.js:87`). Three different sets.

**Failure (silent weakening — the worse direction):** the redesign uses
`<div class="tile" data-nav tabindex="0">…</div>` for launcher cards. `controlsIn()` returns them
in **no** case, so `expect` is empty, `missing` is empty, and the audit prints
`ok - every visible control is reachable` — even if the D-pad cannot land on a single tile. The
suite that exists to prove reachability would report a clean run on a completely unnavigable
launcher.

**Failure (false positive):** any visible `<a href>` in a menu page that is not marked `data-nav`
(e.g. a footer credit link) is reported `UNREACHABLE` forever.

### D-13 — both `cases.js` files crash on a renamed id, and a crash destroys the whole report

`tools/func-test/cases.js:68`
```js
document.querySelector('#recent [data-del]').click();
```
No null guard. Same shape at `cases.js:157` (`link.getAttribute('href')`), `cases.js:319`
(`document.querySelectorAll('.card')[0].classList`), `cases.js:321/325/326/328`
(`document.getElementById('finder'/'grid'/'barChip').classList`), and in the nav audit at
`tools/nav-audit/cases.js:34,43,47,48,51,53` (`document.getElementById('startSession').click()` etc.).

**Failure:** rename `data-del` to `data-remove` in the Progress redesign. `cases.js:65` correctly
records `FAIL each recent row offers a delete`, then line 68 throws `TypeError: Cannot read
properties of null`. The script dies, `F.report()` is never called, `--dump-dom` contains no
`FUNC ` marker, and `run.py:161–163` prints `progress    ?  no report`. All 21 other progress
assertions — including the 20 that still passed — are lost, and the operator is told the page
"threw before finishing" with no line number. This is precisely the diagnosis failure that
`syntax_check()` (`run.py:57–66`) was added to prevent, reproduced one layer up.

### D-14 — scenario dispatch is a filename substring match; `data-scenario` is written but never read

`tools/func-test/run.py:136–137` writes
```python
'<script src="cases.js" data-scenario="%s"></script></body>' % name
```
`tools/func-test/cases.js:4` ignores it:
```js
var page = (location.pathname.split('/').pop() || '');
```
and dispatches on `page.indexOf('progress')`, `'routine'`, `'library'`, `'bloomtv'`, `'bloom'`,
`'flow'`, `'splash'`, `'launcher'||'index'`. `tools/nav-audit/cases.js:4–5` is the same pattern.
The ordering constraint is load-bearing and documented only in a comment (`cases.js:168–169`).

**Failure:** the redesign renames Progress to `progression.html` and adds `flowchart.html`.
`func_progression.html` matches `indexOf('progress')` and runs the Progress scenario (fine by luck);
`func_flowchart.html` matches `indexOf('flow')` and runs the **Flow game** scenario against a menu
page — `X3FSet` is undefined, `#startBtn` is missing, and you get five nonsense failures pointing
at the wrong feature. Worse: a page named `rainbow.html` would match nothing and silently report
`FUNC rainbow.html  0 passed, 0 failed` — a **green run with zero assertions**
(`run.py:169–177` accepts `0 passed, 0 failed` as `ok`).

### D-15 — `run.py:176` reports a zero-assertion scenario as `ok`

```python
m = re.search(r"(\d+) passed, (\d+) failed", head)
p, f = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
…
else: print("%-11s ok    %d passed" % (name, p))
```
Nothing asserts `p > 0`. Combined with D-14, a scenario that silently stops matching prints
`ok    0 passed` and the suite exits 0.

### D-16 — `syntax_check()` covers the bundle only, and not the shared modules

`tools/func-test/run.py:70`
```python
for page in sorted(ASSETS.glob("*.html")):
```
It never looks at `web/*.html` (so `X3F_Ascent.html`, which is web-only, is checked by nothing) and
never at `*.js` — the nine shared modules that every page depends on are not parsed at all.
`run.py:71` also skips `<script src=…>` blocks by design and `run.py:74` skips any inline block
under 80 characters.

**Failure:** a stray `}` in `web/x3f-nav.js`. `sync` copies it. `syntax_check()` passes.
Every menu page's `X3FNav` is undefined; the TV_BLOCK focus shim
(`sync-from-web.py:105`) silently swallows it in `try{}catch(e){}`; the nav audit falls back to
`walkSweep` (because `window.X3FNav` is gone and menu pages get no bootstrap seam) and reports
`not reached, sweep coverage is best-effort` — **which is not a failure** (`audit.js:232`). The
suite goes green on a completely broken remote.

### D-17 — `node --check` is a CommonJS-script parse, so valid modern page code can false-fail

`tools/func-test/run.py:78` `subprocess.run(["node", "--check", str(f)])` on a `.js` file.
`import`/`export`, top-level `await`, and `#private` outside a class body all fail `--check` as
scripts. Also `run.py:71`'s regex terminates a block at the first literal `</script>`, so a page
whose inline JS contains that string in a template literal is fed a truncated, unparseable
fragment.

**Failure:** the redesign converts a page to `<script type="module">`. `run.py:71`'s negative
lookahead only excludes `src=`, so the module body is extracted and `node --check` reports
`SyntaxError: Cannot use import statement outside a module`. The whole suite aborts at
`run.py:96–100` with *"a page's inline script does not parse … Fix that first"* — for code that is
perfectly valid.

### D-18 — `engine.html` writes the real `x3f_history` and never restores it

`tools/func-test/engine.html:14–17`
```js
function seed(entries){
  localStorage.setItem('x3f_history', JSON.stringify(entries));
  localStorage.removeItem('x3f_ach'); localStorage.removeItem('x3f_chal'); localStorage.removeItem('x3f_prog');
}
```
called 15 times, plus `localStorage.setItem('x3f_history', …)` at lines 102, 146 and 150 and
`x3f_routine2` writes at 188. It ends with whatever the last section wrote. There is no
save/restore and no isolated storage.

**Failure:** the natural way to run the whole project locally is one server at the repo root. Open
`http://localhost:8000/tools/func-test/engine.html`, then `http://localhost:8000/web/index.html` —
same origin. **The user's entire training log is gone**, replaced by three synthetic deadlift sets
from the `previous()` section (lines 171–173). There is no undo; `x3f_history` is the only copy
(Progress's export at `X3F_Progress.html:303` is manual and opt-in).

### D-19 — `engine.html` has no runner, no exit code, and fails silently on a moved asset

`engine.html:5–6` hard-codes `../../app/src/main/assets/x3f-exercises.js` and `…/x3f-progress.js`;
`engine.html:12` is `var P=X3FProg;` at top level with no guard.

**Failure:** the refactor moves the bundle to `app/src/main/assets/js/`. The two `<script src>` tags
404, `X3FProg` is undefined, line 12 throws `ReferenceError`, and the page sits forever showing the
placeholder `running…` from `engine.html:4`. Nothing anywhere reports a failure, and because it is
opened by hand nobody may look for months. `ROADMAP.md:211–212` still counts these as one of the
"three test suites".

### D-20 — an uncaught `subprocess.TimeoutExpired` aborts the whole run mid-suite

`tools/nav-audit/run.py:137` (`timeout=240`) and `tools/func-test/run.py:154,157` (`timeout=300`)
are not wrapped. Neither runner checks the browser's return code either.

**Failure:** the redesign adds an overlay whose open animation the audit's transition-killer does
not cover, and one screen wedges. `subprocess.run` raises after 240 s, Python exits with a traceback
instead of a report, the remaining screens are never audited, and the tempdir with all the dumped
DOMs is left behind unnamed in `%TEMP%`.

### D-21 — stderr and console errors are captured and then discarded

`tools/nav-audit/run.py:136` redirects stderr to `stage / "stderr.txt"`; nothing ever reads it.
`tools/func-test/run.py:153` does the same. On POSIX, `run.py:141` sends it to `DEVNULL` outright.
No `--enable-logging`, no console capture.

**Failure:** any uncaught page exception produces exactly one line — `progress ? no report` — with
no stack, no line number, and no hint whether the browser even started. The only diagnosis path is
to re-run by hand with a visible browser.

### D-22 — both runners leak a full Chromium profile per run

`tools/nav-audit/run.py:72` and `tools/func-test/run.py:102` call `tempfile.mkdtemp(...)`; there is
no `shutil.rmtree`, no `try/finally`, no `TemporaryDirectory` context (contrast `run.py:69` in
func-test, which *does* use a context manager — but only for the syntax-check scratch).

**Failure:** the nav audit stages the whole bundle (13 HTML + 9 JS + 18 images) plus 12 dumped DOMs
plus a Chromium profile into `%TEMP%\x3f-nav-*`, ~40–60 MB per run, forever. Twenty debugging
iterations of a redesign leave a gigabyte behind.

### D-23 — `find_browser()` has no override and prefers Edge

`tools/nav-audit/run.py:46–62` and `tools/func-test/run.py:38–54` are byte-identical hard-coded
lists. No `X3F_BROWSER`/`CHROME_PATH` env var, no `--browser` flag.

**Failure:** on a machine with Chrome Canary, a Chromium snap (`/snap/bin/chromium` is on PATH as
`chromium`, so that one works), or Edge installed per-user under
`%LOCALAPPDATA%\Microsoft\Edge\Application\`, the suite prints
`no Chromium-family browser found; tried: …` and exits 2. Wiring these into CI (D-2) requires
editing both lists.

### D-24 — nav-audit's unescape is missing `&#39;`

`tools/nav-audit/run.py:150–151` unescapes `&gt; &lt; &quot; &amp;`.
`tools/func-test/run.py:166–167` unescapes those **plus** `&#39;`.

**Failure:** a control labelled `Don't stop` is reported as `button#x[Don&#39;t stop]` in the audit
problem list. Cosmetic, but it is a copy-paste divergence between two files that are otherwise
supposed to be the same routine.

### D-25 — `build.yml` has no `concurrency` group; two pushes race on `dist` and on the `latest` tag

`.github/workflows/build.yml:11–13` declares a single job with no `concurrency:` key. Steps 41–48
publish to a mutable tag `latest`, and steps 50–59 `git push -f origin dist`.

**Failure:** push commit A, then commit B twenty seconds later. Job B finishes first and publishes
B's APK + `version.txt`. Job A finishes second, force-pushes A's `version.txt` and overwrites the
`latest` release asset with A's APK. The TV updater compares against a `version.txt` that may name a
different build from the APK it downloads (`MainActivity.java:70–71`). Nothing detects it.

### D-26 — `build.yml` runs on every push to `main`, including docs-only changes

`.github/workflows/build.yml:4–6` has no `paths:` filter (contrast `pages.yml:14–16`).

**Failure:** editing `HANDOFF.md` re-runs a full Gradle build and force-pushes a new commit to
`dist`, moving the `latest` release. During a big refactor with frequent doc commits this is
constant churn on the branch the in-app updater reads.

### D-27 — no Gradle wrapper

`ls gradlew* gradle/` → nothing. `settings.gradle:14` names the project; `build.gradle:2` pins AGP
8.5.2; `build.yml:24–28` pins Gradle 8.7 via the action.

**Failure:** a contributor runs `./gradlew assembleDebug` locally as every Android README implies
and gets "no such file". With a system Gradle of a different major version, AGP 8.5.2 refuses to
load and the error names a Gradle version requirement rather than the missing wrapper. The pinned
version lives only in the workflow.

### D-28 — `pages.yml`'s `|| echo "no change"` masks a real commit failure

`.github/workflows/pages.yml:42–44`
```bash
git commit -m "web games ${GITHUB_SHA}" || echo "no change"
git branch -M gh-pages
git push -f origin gh-pages
```
If `git commit` fails for any reason other than "nothing to commit" (a hook, a bad identity, a
full disk), the workflow prints a reassuring line and then force-pushes whatever `gh-pages` resolves
to. Also `pages.yml:39` `mv web/* web/.nojekyll . 2>/dev/null || mv web/* .` will re-run the move
after a *partial* first move, which then fails on the already-moved entries.

### D-29 — the `TV_BLOCK` injection is unverified

`tools/sync-from-web.py:117` `text.replace("</head>", TV_BLOCK + "</head>", 1)` — if the menu page
has no literal `</head>` the replace is a no-op and the script reports success.

**Failure:** the redesign emits a menu page without an explicit closing head tag (perfectly valid
HTML). `sync` prints `synced: routine.html`. `window.X3FFILES` is never defined, so
`x3f-exercises.js:128` `fileFor()` falls through to the web filenames and every Play button on the
TV navigates to `X3F_Bloom.html` — which is not in the bundle. Twelve dead links, zero warnings.
The same applies to the three other rules: none of them verify that anything matched
(`SW_RE`, `MANIFEST_RE`, and the `LINKS` replaces all silently no-op on a reformat, e.g.
`<script defer>if('serviceWorker'…` or `<link href="manifest.json" rel="manifest">`).

### D-30 — `audit.js:41` assigns an undeclared global

```js
try { baseline = 0; } catch (e) {}
```
On a page with no `baseline` global this creates `window.baseline` (sloppy mode). It would throw —
and be swallowed — under `"use strict"`. `MainActivity.java:582` does the same thing, so the
behaviour matches the shell; but a redesign that moves game state into a module (strict by default)
makes both the shell and the audit silently stop zeroing the baseline.

### D-31 — `run.py:140`'s `flags and [browser] + flags`

`tools/nav-audit/run.py:140`
```python
subprocess.run(flags and [browser] + flags, stdout=fh, ...)
```
`flags` is a non-empty list literal three lines above, so `flags and X` is always `X`. Dead
defensive code that reads as if the flag list could be empty. Cosmetic, but it is the kind of thing
a refactor copies forward.

### D-32 — the func-test seed does not reset every key it depends on

`tools/func-test/func.js:41–44` removes `x3f_ach, x3f_chal, x3f_prog, x3f_routineProg2,
x3f_session, x3f_exCal, x3f_routine2` and sets `x3f_band`. It does **not** touch `x3f_bandMax`,
which `x3f-cal.js:73–78` reads as the fallback ceiling:
```js
function bandCeiling(band) {
  var bm = read('x3f_bandMax', {});
  var v = (bm && bm[band]) || BAND_DEF[band] || 130;
  return Math.max(MIN_SPAN, v);
}
```
Today this is masked by the per-scenario `--user-data-dir=profile_<name>`
(`tools/func-test/run.py:145`). **Failure:** if a refactor consolidates onto a shared profile (as
the nav audit already has, D-9), the bloom scenario's
`ok('an uncalibrated movement falls back to the band, floor 0', …)` (`cases.js:216–217`) becomes
order-dependent, because a preceding scenario's `x3f_bandMax` changes the fallback ceiling.

---

## 4. Design weaknesses and opportunities, ranked

**1. Wire the three suites into CI (fixes D-2, and makes every other finding enforceable).**
A second workflow on `pull_request` + `push`: `setup-python`, `setup-node`, install Chrome via
`browser-actions/setup-chrome`, then `python tools/sync-from-web.py --check`, `python
tools/func-test/run.py`, `python tools/nav-audit/run.py`. This is the single highest-leverage
change and it is blocked only by D-23 (no browser override) and D-27 (no wrapper — irrelevant on
the runner).

**2. Give `engine.html` a headless runner and an exit code.** It is 40+ assertions on the most
logic-dense module in the project (`x3f-progress.js`, 616 lines) and it is the one suite with no
automation at all. Either fold it into `func-test/run.py` as a synthetic scenario (it needs no page,
just `x3f-exercises.js` + `x3f-progress.js` + a report div, which the existing scrape already
parses), or run it under `node` with a `localStorage` shim. Fixes D-18 and D-19 at the same time.

**3. Make the sync declarative and self-verifying.** Replace `GAMES`/`MENUS`/`SHARED`/`ART` with a
manifest file (`tools/bundle.json`) that also drives `sw.js`'s precache list and the two `SCREENS`
lists, so a new page is registered **once** instead of eleven times (§2). Then: fail on `missing`
(D-4), prune orphans (D-5), and assert each transform matched (D-29) — e.g. `if is_menu and
TV_BLOCK not in out: raise`.

**4. Auto-derive `sw.js`'s cache name.** `pages.yml` should rewrite `const C='x3f-<sha>'` from
`${GITHUB_SHA}` before publishing, and generate `A` from the manifest. Fixes D-3 completely and
removes the most user-visible failure mode on the web half.

**5. Extract the shared runner.** `tools/nav-audit/run.py` and `tools/func-test/run.py` duplicate
`BROWSERS`, `find_browser()`, the bundle-staging loop, the BOOTSTRAP extraction, the PowerShell
`Start-Process` dance, and the dump-scrape — roughly 60 lines, already divergent in two places
(D-9 profiles, D-24 unescape). A `tools/_harness.py` with `stage_bundle()`, `extract_bootstrap()`,
`run_headless(page, budget) -> str`, `scrape(marker, dump)` collapses both runners to ~60 lines
each and makes D-20/D-21/D-22 one fix instead of two.

**6. Delete `audit.js`'s inlined shell copy (D-8).** Everything it does that the real BOOTSTRAP
does not — alert stubs, transition killing, `scrollIntoView` patching — belongs in a small,
clearly-labelled *test-environment* shim. Everything it duplicates should be deleted. The seam
mechanism (`run.py:88–93`) already proves that surgically patching the real string works.

**7. Make the audit's expected-control set match the nav under test (D-12).** On an `X3FNav` page,
`expect` should be `[data-nav]` filtered by `x3f-nav.js`'s own `visible()`. On a bootstrap page it
should be the bootstrap's `items()` selector. Deriving `expect` from the nav's own item collector
removes both the silent weakening and the false positives, and it means a redesign that changes the
markup convention cannot quietly turn the audit into a no-op.

**8. Guard every DOM lookup in both `cases.js` files (D-13).** A tiny `el(id)` helper that records a
FAIL and returns a null-object instead of throwing turns "no report" into "23 passed, 1 failed —
`#recent [data-del]` is missing". Also add an explicit `ok('scenario matched', true)` per branch and
a `p > 0` check in `run.py` (D-15).

**9. Replace filename-substring dispatch with the `data-scenario` attribute already being written
(D-14).** One line in each `cases.js`:
`var scen = document.currentScript.dataset.scenario;` and a `switch`. Removes the ordering
constraint, the `bloomtv`-before-`bloom` trap, and the silent-no-match failure.

**10. Report coverage, not just failures.** Both suites should print what they *did not* cover:
`nav-audit` should fail (or at minimum warn loudly) when a bundled `*.html` is absent from
`SCREENS`, and `func-test` likewise. Today `arena`, `duel`, `rhythm`, `nova`, `calibrate` and
`index` have **zero** feature assertions, and nothing says so. A refactor will read "104 passed" as
much stronger evidence than it is.

**11. Extend `syntax_check()` to `web/*.html` and to `*.js`, and to the sources rather than only
the bundle (D-16).** `node --check` on the nine shared modules costs milliseconds and closes the
largest silent-failure hole in the suite. Use `--input-type=module` detection, or `es-module-lexer`,
to avoid D-17.

**12. Fail the build on a stale bundle.** Even before full CI: a pre-commit hook or a `build.yml`
step running `python tools/sync-from-web.py --check` costs one second and prevents shipping an APK
whose assets do not match `web/`.

**13. Add `concurrency:` and a `paths:` filter to `build.yml` (D-25, D-26).**
```yaml
concurrency: { group: build-apk, cancel-in-progress: true }
```

**14. Commit a Gradle wrapper (D-27)** and delete the `gradle-version` pin from the workflow, so
local and CI builds are the same by construction.

**15. Add `.gitattributes`.** Every file in the tree is currently CRLF in the working copy; the sync
writes `os.linesep`. A `* text=auto eol=lf` (or explicit `*.html text`) makes the sync's output
platform-independent and prevents a whole-bundle whitespace diff the first time someone runs the
sync on Linux or in CI.

**16. Decide the fate of `index.html` and Ascent (D-1, D-6, D-7).** Either bundle Ascent (vendor
three.js locally and add it to `GAMES`) or remove `ascent` from `X3FFILES` (`sync-from-web.py:86`),
`GAMEKEYS` (`X3F_Routine.html:232`) and `X3FEX.games` (`x3f-exercises.js:120`) for the TV build.
Either make `index.html` a generated alias of `launcher.html` or rewrite the single-quoted
`location.href='index.html'` in the sync's transform.

**17. Snapshot/restore localStorage in any tool that writes it (D-18).** Cheap insurance:
`const backup = {...localStorage}` on entry, restore in a `finally`. Or serve the test pages from a
distinct origin.

---

## 5. Invariants a refactor MUST NOT break

Each is stated with the evidence that makes it load-bearing.

**I-1. `MainActivity.java` must keep `private static final String BOOTSTRAP = """…""";`** — a Java
text block assigned to a name matching `BOOTSTRAP\s*=\s*"""(.*?)""";`. Both suites extract it by
regex (`tools/nav-audit/run.py:79`, `tools/func-test/run.py:122`) and exit 2 with *"could not find
the BOOTSTRAP text block in MainActivity.java"* if it changes shape. Moving the JS to an asset file
or a resource string breaks both suites, not just the tests it feeds.

**I-2. The bootstrap's fallback-nav watchdog line must keep the exact text
`   setInterval(function(){ try{ var sc=scope();` (three leading spaces).**
`tools/nav-audit/run.py:88–92`:
```python
seam_anchor = "   setInterval(function(){ try{ var sc=scope();"
if seam_anchor not in boot:
    print("BOOTSTRAP changed shape: the audit's focus seam no longer applies.\n"
          "Fix the anchor in run.py, or reachability checking is silently weakened.")
    return 2
```
Reindenting `MainActivity.java:661` by one space is a hard audit failure. (This is deliberate and
correct — it fails loud — but it is a coupling a reformat will hit.)

**I-3. The force pipeline: the shell assigns the page global `force` directly and never calls
`onSample()`.** `MainActivity.java:614–619` is the *only* place the TV conditions the raw signal,
and it subtracts `calLo()` there. Any new conditioning added to a game's `onSample()` must be
duplicated in the bootstrap or it does not exist on the TV. The `bloomtv` scenario
(`tools/func-test/cases.js:178–202`) is the mutation-verified guard: restoring the old one-line
driver fails it with `force=52 / frac=3.00` (`HANDOFF.md:98`).

**I-4. `window.X3FFILES` must be set *before* `x3f-exercises.js` runs.** `fileFor()`
(`x3f-exercises.js:127–130`) reads it at call time, but `TV_BLOCK` is injected before `</head>` and
the script tags follow — the ordering is what makes the same `x3f-exercises.js` serve both builds.
`sync-from-web.py:80–81` documents it.

**I-5. Menu pages must contain a literal `</head>`** — `sync-from-web.py:117` injects `TV_BLOCK`
there and does not check that it matched (D-29).

**I-6. Web pages must keep the exact service-worker one-liner and the exact
`<link rel="manifest" href="…">` attribute order** for `SW_RE`/`MANIFEST_RE`
(`sync-from-web.py:77–78`) to strip them. A cached service worker inside a `file://` WebView is
what the strip exists to prevent (`sync-from-web.py:10–12`).

**I-7. Cross-page links must use `href="…"` with double quotes** for the `LINKS` rewrite
(`sync-from-web.py:114–115`) to reach them, **or** `app/src/main/assets/index.html` must continue to
exist as a launcher (D-6).

**I-8. `app/src/main/assets/index.html` and `launcher.html` must both be launchers.**
`MainActivity.java:147` `isLauncher()` matches both and suppresses BOOTSTRAP injection for them
(`MainActivity.java:135–141`), and Back on either backgrounds the app rather than navigating
(`MainActivity.java:557`).

**I-9. `x3f-nav.js` must set `window.__x3fPageNav = true` and claim `window.__x3fNav` only when
unclaimed.** `x3f-nav.js:283–300`. The bootstrap's `if(!window.__x3fNav)` guard
(`MainActivity.java:626`) is what gives menu pages the geometry-aware nav and one focus ring
instead of two; `audit.js:58` reads `__x3fPageNav` to label the mode.

**I-10. `X3FNav` must keep `{set, current, focusFirst, refresh, engaged}`.** `set` is how the audit
seats the cursor for exhaustive BFS (`audit.js:173`); `current`/`focusFirst` are what the injected
`TV_BLOCK` focus shim uses (`sync-from-web.py:105`). Losing `set` silently downgrades every menu
page from exhaustive to sweep, and sweep's misses are **not** failures (`audit.js:232`).

**I-11. Focus must be marked by one of `.x3f-nav-cur`, `.x3f-focus`, `.foc`.**
`audit.js:129` is the only way the walker observes the cursor. A fourth class name makes every
screen report `nothing focusable at all` (`audit.js:179`).

**I-12. Overlays must be `.coach.show / .rest.show / .scrim.show / .modal.show` (or carry
`[data-nav-scope]` for x3f-nav).** Three independent implementations key on this:
`x3f-nav.js:53` `SCOPES`, `MainActivity.java:629` `scope()`, `audit.js:153` `openOverlay()` and
`audit.js:69` (the games' overlay enumeration in `nav-audit/cases.js:69`). Rename `.scrim` and the
audit stops testing overlay trapping entirely — silently, because `openOverlay()` returning null
just skips the `ESCAPED OVERLAY` check (`audit.js:237`).

**I-13. Overlays that hide with `opacity`/`pointer-events` while keeping their layout box must keep
doing so consistently**, because all four visibility implementations
(`x3f-nav.js:31–48`, `MainActivity.java:630`, `audit.js:65–84`, `audit.js:135–147`) walk ancestors
checking `display`, `visibility`, `opacity < 0.05` and `pointer-events:none`. A new hiding technique
(e.g. `content-visibility`, `inert`, `hidden` attribute) is invisible to all four.

**I-14. The launcher must expose `__x3fDevices`, `__x3fSetBar`, `__x3fSetBattery`, `__x3fVersion`
and the ids `#barChip #finder #findList #closeFind #battTxt #grid #prog #musicBtn`.**
Asserted at `tools/func-test/cases.js:314–343` and driven at `tools/nav-audit/cases.js:22–27`.
The battery mapping is specified by test: 4020 mV → `80%`, 3350 mV → `.low`, −1 → empty string.

**I-15. The bar picker must be a modal that does not resize `#grid`.**
`tools/func-test/cases.js:325–331` measures `#grid`'s height before and after opening and requires
`Math.abs(gridH2 - gridH) < 1`. This encodes the v1.3 regression (an inline panel stealing height
from a `flex:1` grid).

**I-16. The guided-session state machine ids and semantics.**
`#startSession → #coach.show`; `#cName` names the current lift; `#demoCv.width > 0`;
`#cLog` logs exactly one `x3f_history` entry and advances the lift; `#rest.show` appears between
lifts; `#restSkip` closes it; `#cSkip` keeps `#coach` open; `#cClose → #done.show` with `#dSets` and
`#dUndo`; `#dUndo` removes exactly one set. `tools/func-test/cases.js:106–140` and
`tools/nav-audit/cases.js:31–61`.

**I-17. One set = exactly one `x3f_history` entry.**
`tools/func-test/cases.js:262–264`:
```js
ok('exactly one history entry per set', P.sets().length === before + 1, 'added ' + (P.sets().length - before));
```
This encodes the v1.2 double-count (legacy `logSession` plus the engine both writing).

**I-18. Every lift in a guided day starts on the band you are on, not the Library's suggestion.**
`tools/func-test/cases.js:96–101`: every `#list select[data-k="band"]` must equal the value in
`x3f_band` (`'White'` in the fixture), and the Library suggestion must still render as
`X3 suggests` text. This encodes the v1.4 regression where a Push day silently moved you up a band.

**I-19. `X3FCal`'s contract.** `range()` returns `{lo,hi,auto}` with `lo:0, auto:true` for an
uncalibrated movement (`x3f-cal.js:94–100`); `span()` is `max(MIN_SPAN, hi-lo)` — the **range**, not
the ceiling; `MIN_SPAN` is 10 so a 20-unit White-band range is accepted; `save()` returns `false`
when `hi-lo < MIN_SPAN`; `observe()` never overwrites `auto:false`. Nine assertions at
`tools/func-test/cases.js:214–240` plus `X3FCal.span('overhead-press','White') === 118`.

**I-20. `X3FForm.verb()` must return `'PRESS'` for pressing movements.**
`tools/func-test/cases.js:211–213`. Encodes the bug where every press read `PULL`.

**I-21. The `X3FSet` reporter is how non-Bloom games log.** `X3FSet.watch(loFn, hiFn)` supplies a
peak the game itself never measures; a Flow set must land with `g === 'flow'` and `peak > 0`; a
Splash run must record `score` and **no** `reps`. `tools/func-test/cases.js:276–311`.

**I-22. Progress page shapes.** `#grid .cell` is exactly 84 (12 weeks × 7); `#vol div` and `#pk div`
are exactly 12; `#achFilters .chip` is exactly 3 in the order All / Unlocked / Locked;
`#achs .ach` is > 50; `#achCnt` matches `/of \d+ unlocked/`; `#recent .pbrow` rows each carry
`[data-del]`; `#impBox`/`#impBtn` accept `{v:1,history,ach,chal,bandMax}`; `#advice` says
`Move … up to Black` at 44 reps. `tools/func-test/cases.js:27–77`.

**I-23. Exactly 11 movements and 11 launcher cards.** `tools/func-test/cases.js:146`
(`cards === 11` on Library, matching the 11 `slug:` entries in `x3f-exercises.js`) and
`cases.js:318` (`.card` count `=== 11` on the launcher), with `.card[0]` carrying `.hero`.
Adding a movement or a launcher tile fails both until the constants are updated.

**I-24. `X3FProg`'s 28-method surface** (`x3f-progress.js:604–615`) — `engine.html` calls
`keyMinus, today, history, sets, logSet, compact, removeSet, lastSet, previous, bust, pb, pbTable,
streak, program, grid, challenge, challengesDone, stats, achievements, checkAchievements,
dayMovements, catalogue, bandAdvice`. `func.js:26` also uses `keyMinus`/`today` to build the fixture.

**I-25. The `x3f_history` entry shape.** `{t, k:'set'|'roll', g, ex, band, b, reps, full, part,
peak, tut, ecc, score}`. Both `band` and `b` are written (`func.js:36`) and both are accepted
(`cases.js:118` `last.band || last.b`). `k:'roll'` is the compaction rollup
(`engine.html:151–156`). Changing this shape breaks the fixture, the engine tests, the import
payload (`cases.js:50`) and every existing user's log.

**I-26. `x3f_session.pending = {slug, game, at}` with `active` true is how a game learns which
movement it is running.** `x3f-cal.js:80–88` `slug()` resolves `?ex=` first, then this. Driven at
`tools/nav-audit/cases.js:36–41` and relied on by the `?ex=overhead-press` launch in
`tools/func-test/run.py:147`.

**I-27. The launcher gets **no** BOOTSTRAP.** `MainActivity.java:135–141` injects it only for
non-launcher `file:` URLs; both suites reproduce that split
(`tools/nav-audit/run.py:111`, `tools/func-test/run.py:134`). A redesign that needs shell services
on the launcher must change all three.

**I-28. `version.txt` on `dist` is the digits of `versionCode` from the first matching line of
`app/build.gradle`.** `build.yml:54` `grep -m1 versionCode app/build.gradle | grep -o '[0-9]\+'`.
Putting any other number on that line (a comment, a date) corrupts the updater's comparison.

**I-29. `web/` is published verbatim to `gh-pages`; nothing is rewritten.** `pages.yml:9,29–44`.
Any build step the web half acquires must be added to that workflow or the published site is the
unbuilt source.

**I-30. The report contract between page and runner.** The in-page harness appends a `<div>` whose
`textContent` begins with the literal marker `AUDIT ` / `FUNC ` and whose header matches
`(\d+) passed, (\d+) failed` (func) — scraped from `--dump-dom` at
`tools/nav-audit/run.py:144–153` and `tools/func-test/run.py:160–172`, sliced to the first
`</div>`. Problem lines must contain the literal tokens `UNREACHABLE`, `FOCUSED INVISIBLE`,
`ESCAPED`, `dead ends`, or begin with `FAIL`, and state headers must begin with `--- `.
