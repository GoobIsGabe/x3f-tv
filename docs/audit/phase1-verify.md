# Phase 1 verification — the true state after six parallel agents

Verifier's report. Nothing in this file was fixed; everything here is reported so the
owner of the file can fix it. The one thing this pass wrote is this document.

---

## 0. READ THIS FIRST: the repo was still being written while it was being verified

This is the single most important fact about everything below, and it is the reason the
report carries timestamps instead of one clean answer.

Verification started at **00:21**. The last write to a source file landed at **00:39:37**.
In between, files changed **eighteen times** under the suites that were reading them.
Measured, not inferred:

| time | what changed | how it showed up |
|---|---|---|
| 00:21:04 | (first `sync --check`) | **7 files** drifted: `calibrate/routine/library/progress.html`, `x3f-form.js`, `x3f-fx.js`, `x3f-calflow.js` |
| 00:22:41 | somebody ran `sync-from-web.py` | drift went to zero; `func-test` went from **105 pass / 0 fail** to **103 / 2** — because the suite had been reading a *stale bundle* and the sync handed it the real one |
| 00:24:49 | `web/x3f-nav.js`, then the bundle | — |
| 00:29:12 | `X3F_Library.html` + bundle | `nav-audit library` went from **28 UNREACHABLE** to clean |
| 00:31:xx | `web/x3f-band.js` — resolution order flipped | `force-test` group 9 went from **27 pass / 0 fail** to **21 / 6** |
| 00:33:xx | `func-test/run.py` registered `cases-cal.js` | two new scenarios appeared, both failing |
| 00:34:42 | `X3F_Calibrate.html` + `x3f-calflow.js` | the two new scenarios went green |
| 00:35:xx | `force-test/cases.js` group 9 rewritten | `force-test` back to **138 / 0** |
| 00:36:25, 00:39:37 | `web/x3f-form.js` | leaves the bundle out of sync at the final reading |
| 00:40:37 | **`web/x3f-onboard.js` created** | unregistered; `app.html` loads it; **no suite notices** — see D-0 |
| 00:41:16 | `web/app.html` | drift again: `would change: app.html, x3f-form.js` |

**What this means for anyone reading a "green" line below:** the numbers are a photograph
of 00:37–00:39, not a guarantee. Two of the four suites were red at some point during this
hour and were fixed by another agent mid-run, without that agent knowing a verifier was
watching. If you need a verdict you can act on, **re-run the four commands yourself once
every agent has actually stopped.** They take about four minutes.

---

## 1. The four suites — verbatim, final reading (00:37:05 → 00:38:54)

```
$ python tools/func-test/run.py
launcher    ok    14 passed
routine     ok    23 passed
library     ok    6 passed
progress    ok    22 passed
bloom       ok    23 passed
flow        ok    5 passed
splash      ok    5 passed
bloomtv     ok    7 passed
calibrate   ok    19 passed
calibratetv ok    23 passed

total: 147 passed, 0 failed

$ python tools/nav-audit/run.py
launcher    ok    (2 states)
app         ok    (2 states)
routine     ok    (5 states)
library     ok    (1 states)
progress    ok    (1 states)
nova        ok    (4 states)
bloom       ok    (2 states)
splash      ok    (2 states)
arena       ok    (3 states)
duel        ok    (2 states)
flow        ok    (2 states)
rhythm      ok    (2 states)
calibrate   ok    (2 states)

all screens clean

$ python tools/sync-from-web.py --check
would change: x3f-form.js
  warning: the TV block's X3FFILES advertises ascent.html, which this sync never produces - that Play button is a dead link on the TV (docs/audit/tooling.md D-1)

$ node tools/force-test/run.js
X3F force-model regression suite
  modules: x3f-exercises.js, x3f-band.js, x3f-cal.js

 1  the reported bug: calibrate on White, launch from the L...  ok    13 passed
 2  per-movement estimates: an uncalibrated overhead press      ok    11 passed
 3  validation: an impossible stored range must not be trusted  ok    14 passed
 4  a refused calibration writes nothing (D2)                   ok    13 passed
 5  the eased display curve, for a top-curve movement           ok    11 passed
 6  the bent row peaks mid-range, not at the top                ok    9 passed
 7  two-sided band advice, and the calf-raise exemption         ok    24 passed
 8  auto-learn: never over a real calibration, never blocke...  ok    15 passed
 9  band resolution: all six levels, including the healing ...  ok    28 passed

total: 138 passed, 0 failed
```

### Against the stated baseline

| suite | baseline | now | verdict |
|---|---|---|---|
| `func-test` | 104 passed / 0 failed | **147 passed / 0 failed** | no regression; +43 assertions, two new scenarios (`calibrate`, `calibratetv`) |
| `nav-audit` | 12 screens, all clean | **13 screens, all clean** | no regression; `app` added |
| `sync --check` | "would change: nothing" | **"would change: x3f-form.js"** (00:38); **"app.html, x3f-form.js"** (00:42) | **DRIFT — see D-1** |
| `force-test` | did not exist | **138 passed / 0 failed** | new, and genuinely wired (see §3) |

---

## 2. Broken right now

### D-0 — `web/x3f-onboard.js` is loaded by `app.html`, is registered nowhere, and no suite notices

Found at 00:42, two minutes after the "final" reading above. A brand-new file landed at
00:40:37 and `web/app.html:239` loads it:

```
web/app.html:239:<script src="x3f-onboard.js"></script>
```

It is in **none** of the three registries:

```
$ grep -c "x3f-onboard" tools/sync-from-web.py web/sw.js
tools/sync-from-web.py:0
web/sw.js:0
$ ls app/src/main/assets/x3f-onboard.js
ls: cannot access ...: No such file or directory
```

I proved the consequence rather than asserting it. Running the real sync into a scratch copy:

```
synced: app.html, x3f-form.js
  warning: the TV block's X3FFILES advertises ascent.html, ...
--- is x3f-onboard.js in the bundle now? ---
No such file or directory
--- does the bundled app.html still ask for it? ---
1
```

So the sync copies `app.html` into the APK **with a `<script src>` pointing at a file that
is not there**, and says nothing. That is precisely the symptom `sync-from-web.py`'s own
header describes: *"the symptom is not an error — it is a 404 inside a WebView with no
console, which the shell renders as Chromium's 'webpage not available'."*

**And nothing in the safety net catches it.** On the synced copy:

```
$ python tools/nav-audit/run.py app     ->  app  ok  (2 states) / all screens clean
$ python tools/func-test/run.py         ->  total: 147 passed, 0 failed
```

Both suites are fully green over a bundle containing a page whose module 404s. The reason
is structural: the sync's orphan check only walks **`ASSETS` looking for files `web/` does
not produce**. There is no check in the other direction — a file in `web/` that nothing
registered is invisible to it, because from the sync's point of view it simply does not
exist.

The fix belongs in `tools/sync-from-web.py` (not mine to make): after `convert()`, scan the
produced HTML for `<script src="...">` and `<link ... href="...">` targets and hard-fail on
any local target not in `produced`. That is the same class of cross-check the script already
does for `LAUNCH_TARGETS`, applied to the other list of filenames it emits. It would have
caught this in the same run that created it.

Mitigating, slightly: `app.html` is currently unreachable from anywhere (D-4), so nobody can
open the broken page yet. That is luck, not design, and it stops being true the moment
`MainActivity.LAUNCHER` is repointed.

### D-1 — the bundle is out of sync with `web/` (`x3f-form.js`)

```
would change: x3f-form.js
```

`web/x3f-form.js` was written at 00:36:25 and again at 00:39:37; the bundle copy is from
00:36:45, i.e. behind the last write. This is a live drift, not a stale reading.

Why it matters more than it looks: **`.github/workflows/build.yml` runs
`python3 tools/sync-from-web.py --check` as its second step and fails the build on drift.**
So this is a red CI on the next push, and the APK does not get built at all. Fix is one
command — `python tools/sync-from-web.py` — but it has to be run *after* the last agent
stops touching `web/`, or it will be stale again.

This is also the only reason to be careful with the `func-test` and `nav-audit` numbers
above: **both suites read `app/src/main/assets/`, never `web/`.** They were, for the first
half of this hour, testing code that no longer existed in the source tree. When the bundle
drifts, those two suites go quietly out of date rather than going red.

### D-2 — the TV launcher still loads fonts from Google (`AD-5` violation, in the file the TV boots into)

`grep -rn "googleapis\|gstatic" web/ app/src/main/assets/` — 12 hits, of which **two files
are a real violation**:

```
app/src/main/assets/index.html:10:<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
app/src/main/assets/index.html:11:<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
app/src/main/assets/launcher.html:10:  (identical)
app/src/main/assets/launcher.html:11:  (identical)
```

Per-page audit of the whole bundle — these two are the only ones left:

```
app.html      google=0 bundled=1     library.html    google=0 bundled=2
arena.html    google=0 bundled=2     nova.html       google=0 bundled=2
bloom.html    google=0 bundled=2     progress.html   google=0 bundled=2
calibrate.html google=0 bundled=1    rhythm.html     google=0 bundled=2
duel.html     google=0 bundled=2     routine.html    google=0 bundled=2
flow.html     google=0 bundled=2     splash.html     google=0 bundled=2
index.html    google=2 bundled=0  <-- launcher twin
launcher.html google=2 bundled=0  <-- the page MainActivity boots
```

Every `web/*.html` is clean. The two that are not are the **hand-maintained launcher
twins**, which `tools/sync-from-web.py` deliberately excludes:

```python
UNMANAGED = {"launcher.html", "index.html", "logo.png"}
```

So the font fix, which went through `web/` and the sync, could not reach the one page the
TV actually starts on. `MainActivity.LAUNCHER = "file:///android_asset/launcher.html"`.

**Severity, honestly stated:** `MainActivity.java:238` sets `ws.setBlockNetworkLoads(true)`
and `:239` `setBlockNetworkImage(true)`, so on a real TV these requests fail instantly
rather than hanging. The launcher renders in `system-ui` instead of Fredoka. It is a
cosmetic bug on-device and a hard AD-5 violation on paper — "nothing loads from the
network" is not true of the bundle while those four lines exist.

The other 8 grep hits are not violations: 4 are `fonts.css`'s own comment explaining why
it greps for the bare word, and 4 are the Firebase REST hosts in `x3f-sync.js` (see S-3).

### D-3 — `X3F_Ascent.html` loads three.js from a CDN, and `sw.js` precaches the page

```
web/X3F_Ascent.html:  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js">
```

Not in the APK (`GAMES` in the sync omits it), so it does not break the no-network rule
for the TV. But it *is* in `web/sw.js`'s precache list `A`, so the phone build precaches a
page that cannot run offline. And the sync still warns, every run:

```
warning: the TV block's X3FFILES advertises ascent.html, which this sync never produces -
that Play button is a dead link on the TV (docs/audit/tooling.md D-1)
```

Pre-existing and already documented. Restated because it is the only warning the sync
emits and a warning that is always present is a warning nobody reads.

### D-4 — `app.html` ships in the APK and in the precache, and nothing links to it

`grep -rn "app\.html"` across `app/src/main/assets/`, `app/src/main/java/` and `web/*.html`
returns **nothing** outside `app.html` itself.

* `MainActivity.LAUNCHER` → `launcher.html`.
* `launcher.html`'s tile list (lines 145–155) names `routine, nova, splash, bloom, flow,
  arena, duel, rhythm, library, progress, calibrate` — eleven targets, no `app.html`.
* No web page links it either.

`nav-audit` reports `app  ok (2 states)` — it is auditing a page no user can open. This
may well be intentional staging for Phase 2.2 (the sync's own comment says "the shell's
LAUNCHER constant will eventually point straight at it"), but right now it is shipped,
precached, audited, and unreachable, and nothing in the bundle says so.

---

## 3. Verified working (checks that came back clean)

* **Inline-script syntax, both trees.** 125 inline `<script>` blocks across `web/*.html`
  **and** `app/src/main/assets/*.html`, extracted with the same regex `func-test/run.py`
  uses and run through `node --check`: **0 failures**. (`run.py`'s own `syntax_check()`
  covers the bundle only — `docs/ADDING-A-FILE.md` §9 already admits this.)
* **`node --check` on every `web/*.js`** — all 14 parse: `sw.js`, `x3f-band.js`,
  `x3f-cal.js`, `x3f-calflow.js`, `x3f-exercises.js`, `x3f-firebase-config.js`,
  `x3f-form.js`, `x3f-fx.js`, `x3f-hype.js`, `x3f-music.js`, `x3f-nav.js`,
  `x3f-progress.js`, `x3f-set.js`, `x3f-sync.js`.
* **BOOTSTRAP is still regex-extractable** (invariant 10). `BOOTSTRAP\s*=\s*"""(.*?)""";`
  matches, 13 770 characters. The nav audit's focus seam anchor
  `"   setInterval(function(){ try{ var sc=scope();"` is still present, so the audit is
  still doing an exhaustive walk rather than silently degrading to a best-effort sweep.
* **Every `X3FCal.*` and `X3FBand.*` call site resolves to a real export.**
  Called across `web/`: `X3FCal.{age, all, band, bandAdvice, clear, floor, frac, observe,
  range, raw, save, slug, span, stale}` and `X3FBand.{all, calibratedFor, current, explicit,
  forMovement, onChange, override, set, setCurrent}`. Both are proper subsets of the
  export objects at `x3f-cal.js:365` and `x3f-band.js` respectively. **No missing export.**
* **`x3f-progress.js` accepts everything `x3f-set.js` writes.** `logSet` replaced its fixed
  allow-list with a `copyable()` shape test (`x3f-progress.js:180–195`), so the twelve
  fields in `x3f-set.js`'s `EXTRA` (`x3f-set.js:816`) all land. `run` is in `OWNED` and is
  re-derived rather than copied, which is consistent, not a hole. The `persist()` patch-back
  shim at `x3f-set.js:835` should now be a no-op — which is exactly what its own comment
  predicts.
* **Every new file *except `x3f-onboard.js`* (D-0) is registered everywhere it needs to be.** `x3f-band.js`,
  `x3f-calflow.js`, `x3f-sync.js`, `x3f-firebase-config.js`, `x3f-ui.css`, `app.html`,
  `fonts/` are all in `sync-from-web.py` (`SHARED`/`MENUS`/`TREES`), all in `sw.js`'s
  precache `A`, and `app` is in `nav-audit`'s `SCREENS`. `pages.yml`'s sed anchor
  `const C = 'x3f-dev';` is still literally present at `web/sw.js:55`, so the cache-stamp
  step will not silently no-op.
* **`force-test` is real, not decorative.** It reads the live modules off disk
  (`env.js:71`, `MODULES = ['x3f-exercises.js', 'x3f-band.js', 'x3f-cal.js']`), and
  `node tools/force-test/run.js --baseline` — which pulls the same modules out of git at
  the pre-overhaul ref — gives **18 passed / 29 failed**, with `Cannot read properties of
  undefined (reading 'forMovement')` in group 9. A regression suite that has been watched
  failing. This is the strongest artefact produced this phase.
* **The WebView's own network posture is correct** (`MainActivity.java:233–262`):
  `setBlockNetworkLoads(true)`, `setBlockNetworkImage(true)`, `setSafeBrowsingEnabled(false)`,
  `setAllowFileAccessFromFileURLs(false)` and `setAllowUniversalAccessFromFileURLs(false)`
  — the last two are what invariant 6 (no page may `fetch()` a sibling file) rests on.

---

## 4. Integration seams the parallel agents could not see

### S-1 — the band-resolution order was contradicted by two suites at once, and the contradiction was live for ~4 minutes

This is the seam. It resolved itself before the final reading, but it is worth writing down
because it is the exact shape of failure six parallel agents produce, and because the
resolution is now recorded in *three* places that must be kept in agreement.

Three artefacts each asserted a different priority between "the recommendation for this
movement" (`ex.band`) and "the band on the bar" (`x3f_band`):

| artefact | asserts |
|---|---|
| `docs/OVERHAUL-PLAN.md` §3.1 | `?band=` → per-movement choice → **recommendation** → global |
| `tools/func-test/cases.js:102` (pre-existing, part of the 104 baseline) | *"every lift starts on the band you are on"* — **global** must win |
| `tools/force-test/cases.js` group 9 (new this phase) | *"the recommendation beats the global"* |

`X3F_Routine.html`'s `per()` was changed to call `X3FBand.forMovement(slug)`, which at that
moment ranked recommendation above global. Result, measured:

```
routine
  FAIL every lift starts on the band you are on  -> 4 of 4 moved off White
  FAIL the library suggestion is still shown as advice
```

Both assertions are **pre-existing** — `git show HEAD:tools/func-test/cases.js` has them at
lines 98 and 101. They are the v1.4 regression test for *"starting a day on White silently
moved you to Dark Gray, a setting you never chose"*. The second one fails as a direct
consequence of the first: `X3F_Routine.html:336` only renders the `X3 suggests` hint when
`ex.band !== c.band`, and once the default *is* `ex.band` the advice can never show.

I proved the two suites could not both be green: syncing the flipped `x3f-band.js` into a
scratch copy of the bundle turned `routine` green (`23 passed`) while `force-test` group 9
stayed red (`21 passed, 6 failed`).

**It has since been resolved** — `x3f-band.js` now ranks global above recommendation, with
a long comment explaining why, and `force-test` group 9 was rewritten to match (28 passed).
Both suites are green.

**What is still owed:** `docs/OVERHAUL-PLAN.md` §3.1 still states the *old* order —

> Resolution order, once, everywhere: explicit `?band=` (this run only) → per-movement
> choice → per-movement recommendation → global.

The plan is the contract for this whole effort and it now disagrees with the code, the
`x3f-band.js` header, `func-test` and `force-test`. One of the two must move, and the plan
is the one that is wrong. *(Reported, not edited — `OVERHAUL-PLAN.md` is not mine.)*

Also cosmetic in `x3f-band.js`: the numbered RESOLUTION ORDER list is now interrupted by a
prose block, leaving the orphaned line `6. 'White'   the program says to start with the
lightest band.` stranded after it.

### S-2 — the strict-overlap nav rule made all 28 Library game links unreachable (fixed mid-run; the mechanism is worth keeping)

At 00:23 the audit reported:

```
library
  UNREACHABLE (28): a[Bloomcontrolled ], a[Max Effortstreng], a[Hold the Zonetim], ... (28 total)
```

28 is **every** `.gm` link on the page — confirmed by counting from `x3f-exercises.js`:
11 exercise cards, 28 game links. The entire "launch a game" surface, gone from the remote.

I isolated it rather than guessing: in a scratch copy, restoring **only**
`app/src/main/assets/x3f-nav.js` to `HEAD` while keeping the new `library.html` gave
`library  ok (1 states)`. So it was the nav rewrite, not the page.

Mechanism, for whoever owns `x3f-nav.js`: `moveV` scores non-aligned candidates as `soft`
and aligned ones as `hard`, and `hard` wins unless `softScore * ALIGN_REACH < hardScore`
(`x3f-nav.js:551`, `ALIGN_REACH = 1.5`, `CROSS_W = 2.2`). On Library each card puts its
`<select>` at the far right and its game links at the far left of an 820 px column. From a
select, pressing Down finds the *next card's select* aligned and ~280 px away (`hard`), and
this card's game links offset by ~630 px of cross-axis distance (`soft`, score ≈ 1450).
`hard` wins every time, so the cursor walks the right-hand column of selects from top to
bottom and never once enters the left-hand column.

The file's own header already describes this exact failure — *"the nav audit caught it as 36
controls that had been reachable becoming unreachable: on the Library the cursor never left
the first link while all 28 game links scrolled past underneath it"* — and claims it was
fixed by reordering scroll-vs-soft. **That reorder was not sufficient**; the symptom was
still present four minutes later. It is now clean, but the audit is the only thing standing
between this layout and that failure, so treat invariant 8 plus Library's two-column card
as a permanently fragile pairing.

### S-3 — `x3f-sync.js` calls `X3F.rtdb()`, which `MainActivity` does not implement

`x3f-sync.js:85`:

```js
function nativeBridge() {
  return (window.X3F && typeof window.X3F.rtdb === 'function') ? window.X3F : null;
}
```

The full set of `@JavascriptInterface` methods in `MainActivity.java` is
`reZero, checkUpdate, pickDevice, setOverlay, setTextInput, showKeyboard, rescan`.
**There is no `rtdb`.** `X3F.rtdb(` is the only `X3F.*` call in the JS tree with no Java
counterpart.

It is guarded by a `typeof` check so nothing throws. And the fallback path is inert too:
`available()` needs `fetch` (which the WebView has) but `configured()` needs a non-empty
`apiKey`, and `web/x3f-firebase-config.js` ships with `apiKey: ''`. So sync reports
`unconfigured` and the app runs local-only, which is the documented default.

But the combination is worth naming: on the TV, `setBlockNetworkLoads(true)` means the
`fetch` path **can never work**, so the native `rtdb` bridge is the *only* possible route
for AD-6, and it does not exist. `app.html` loads `x3f-sync.js` today. Cloud sync on the
television is currently unreachable by construction, not by configuration.

### S-4 — `x3f-progress.js`'s rollup silently drops seven of the fields `x3f-set.js` measures

`rollOlderThan` (`x3f-progress.js:272`) builds a fixed-shape rollup:

```js
reps: 0, full: 0, mid: 0, weak: 0, part: 0, peak: 0, secs: 0, tut: 0, ecc: 0,
sum: { reps: 0, full: 0, mid: 0, weak: 0, part: 0 }, burn: 0, runs: 0
```

`x3f-set.js` writes `top`, `strong`, `con`, `pace`, `fault`, `faults`, `trem` in addition.
`logSet` stores them (S-verified above — the allow-list is gone), but **compaction throws
them away**: once history passes `ROLL_AT = 420` entries, or a day passes `KEEP_DAYS = 56`,
they are gone for good.

The inconsistency is the giveaway that this is an oversight rather than a decision: `mid`
and `weak` are preserved, `top` is not, and all three are the same three-tier record written
by the same three lines (`x3f-set.js:907–909`).

**Severity today: latent, not live.** I grepped for readers — `top`, `strong`, `con`, `pace`,
`fault`, `faults` and `trem` have **zero** reads in `x3f-progress.js`, and the `.top` /
`.strong` hits in `X3F_Progress.html`, `X3F_Routine.html` and `app.html` are all CSS class
selectors, not field accesses. So nothing loses a number a user can currently see. It will
become live the moment anything renders them, and the failure will look like "the fault
history is empty for anything older than two months", which is a nasty one to trace.

### S-5 — coverage gaps that survived this phase

* **CI runs the sync check only.** `.github/workflows/build.yml` runs
  `python3 tools/sync-from-web.py --check` and nothing else. `func-test` and `nav-audit`
  need a browser, which is the documented reason. **`force-test` does not** — it is pure
  Node, runs in 200 ms, is mutation-verified, and is not wired into any workflow. That is
  the cheapest CI win available right now.
* **`docs/ADDING-A-FILE.md` §9 is now partly stale.** It says *"`app`, `arena`, `duel`,
  `rhythm`, `nova`, `calibrate` and `index` have zero feature assertions."* `calibrate` now
  has 19 and `calibratetv` 23. `app` — the new home screen — still has none, and it is also
  the page nothing links to (D-4). §9 also does not mention `tools/force-test/` at all.
* `func-test/run.py` still has no `NOT AUDITED BY ANY SCREEN:` equivalent, so a bundled page
  outside `SCREENS` is invisible there in a way it is not in the nav audit.

---

## 5. What I could not do

* **I could not produce a stable verdict.** Six agents were still writing while I measured;
  §0 records every mutation with a timestamp instead of pretending otherwise. Every number
  in §1 needs re-running once the repo is quiet.
* **I did not verify anything on a television.** Everything here is headless Chromium,
  `node --check`, and reading the source. D-2's on-device severity (fonts fail fast rather
  than hang) is inferred from `setBlockNetworkLoads(true)`, not observed.
* **I did not run `tools/func-test/engine.html`.** It has no runner and no exit code, and
  `docs/ADDING-A-FILE.md` §9 warns that opening it destroys the real `x3f_history`.
* **I did not check invariants 1–7 and 11–13 exhaustively.** I confirmed 6, 8 and 10
  directly and 2/3 by call-site enumeration. The rest were out of scope for the four
  questions asked.
* **The `sync-from-web.py` line-ending quirk** is noted but not pursued: `sync_text` uses
  `Path.write_text`, which on Windows translates `\n` → `\r\n`, so every bundled file is
  CRLF while `web/` is LF. `--check` compares in text mode and correctly sees them as equal,
  but `diff web/x3f-nav.js app/src/main/assets/x3f-nav.js` reports all 905 lines as changed.
  Harmless; worth knowing before anyone uses `diff` to judge drift. Use `--check`.

---

## 6. If you do one thing

Wait until every agent has stopped, then:

```
python tools/sync-from-web.py            # clears D-1, and unblocks CI
python tools/func-test/run.py
python tools/nav-audit/run.py
node tools/force-test/run.js
python tools/sync-from-web.py --check    # must print "would change: nothing"
```

Before that, register `x3f-onboard.js` (D-0) in `tools/sync-from-web.py`'s `SHARED` and in
`web/sw.js`'s `A` — otherwise the sync above bakes a 404 into the APK and every suite still
reports green.

Then fix D-2 by hand in `app/src/main/assets/launcher.html` and
`app/src/main/assets/index.html` — they are the two files the sync will never touch, which
is precisely why the font fix missed them.
