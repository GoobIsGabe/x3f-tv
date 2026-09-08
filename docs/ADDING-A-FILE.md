# Adding a file — the registration checklist

Adding one page to this project can touch **eleven files**. Nothing in the build
discovers files: every page, every script, every image is named by hand in
several lists, and a file that is not in the right list does not fail — it 404s
inside a WebView with no console, which the TV renders as Chromium's "webpage not
available" with only the remote's Back key as a way out.

This is the checklist for not forgetting a step. It is the counterpart to
`docs/audit/tooling.md` §2, which explains why each list exists.

> **The one-line rule:** `web/` is the source of truth. `app/src/main/assets/` is
> **generated** from it by `tools/sync-from-web.py`. Never hand-edit a generated
> file — the next sync silently overwrites it. The three exceptions are
> `launcher.html`, `index.html` and `logo.png`, which are hand-maintained and
> listed in `UNMANAGED` so the sync leaves them alone.

Run this after **any** of the changes below:

```
python tools/sync-from-web.py          # regenerate the bundle
python tools/sync-from-web.py --check  # 0 = no drift  1 = drift  2 = broken registration
python tools/func-test/run.py          # 105 assertions across 8 scenarios
python tools/nav-audit/run.py          # 13 screens, 30 states
```

`--check` is also a gate in `.github/workflows/build.yml`, so an APK can no
longer be built and pushed to the TV from a stale bundle.

---

## 1. A new **game page** — `web/X3F_Ascent.html` → `ascent.html`

| # | File | What to add | If you forget |
|---|---|---|---|
| 1 | `web/X3F_<Name>.html` | the page | — |
| 2 | `tools/sync-from-web.py` → `GAMES` | `"X3F_<Name>.html": "<name>.html"` | **never copied into the bundle** |
| 3 | `tools/sync-from-web.py` → `TV_BLOCK`'s `window.X3FFILES` | `<key>:'<name>.html'` | Play navigates to the *web* filename, which is not in the APK |
| 4 | `web/sw.js` → `A` | the filename | not precached; the phone build misses it offline |
| 5 | `web/x3f-exercises.js` → `GAMES` | `<key>: {name, sub, file, mode?, tempo?}` | the game cannot be offered for a movement |
| 6 | `web/X3F_Routine.html` → `GAMEKEYS` | `'<key>'` | not in the per-lift game picker |
| 7 | `web/index.html` | an `<a class="card" href="X3F_<Name>.html" … data-nav>` | not linked from the phone hub |
| 8 | `app/src/main/assets/launcher.html` **and** `index.html` | a card, in **both** — they are hand-maintained twins | not on the TV launcher, or the two twins diverge |
| 9 | `tools/nav-audit/run.py` → `SCREENS` | `"<name>"` | never nav-audited; the remote may not reach a single control on it |
| 10 | `tools/func-test/run.py` → `SCREENS` | the scenario name | never feature-tested |
| 11 | `tools/func-test/cases.js` | a `if (page.indexOf('<name>') >= 0) { … }` branch | the scenario matches nothing and reports **`ok 0 passed`** — a green run with zero assertions |

**Steps 2 and 3 are cross-checked.** The sync now warns when `X3FFILES` names a
page it does not produce, because that combination shipped: Ascent needs a CDN
copy of three.js, so it was dropped from `GAMES` and left in the launch map, and
Library → Ascent has navigated the TV to a missing file ever since
(`docs/audit/tooling.md` D-1).

**On the `cases.js` branch order** (both suites): dispatch is a *substring* match
on the staged filename, so a more specific scenario has to be tested first —
`bloomtv` before `bloom`. A page called `flowchart.html` would match `flow` and
run the Flow game's scenario against a menu page.

---

## 2. A new **menu page** — e.g. `app.html`, the Phase 2.2 shell

Everything in §1, except:

| # | File | What to add | If you forget |
|---|---|---|---|
| 2 | `tools/sync-from-web.py` → **`MENUS`**, not `GAMES` | `"X3F_<Name>.html": "<name>.html"` | the page gets no TV block: no `window.X3FFILES`, no initial D-pad focus |
| 2b | `tools/sync-from-web.py` → `LINKS` | `"X3F_<Name>.html": "<name>.html"` | other pages' `href="X3F_<Name>.html"` still point at the web filename on the TV |
| 2c | `tools/sync-from-web.py` → `RESOLUTION_INVARIANT` | the web filename, **if the page is built on `x3f-ui.css`** | the page also receives `TV_TYPE`, a px-based `@media (min-width:1200px)` block that overrides the rem coordinate system the design depends on |

**The page must contain a literal `</head>`.** That is where the TV block is
injected. The sync now raises instead of shipping a menu page without one —
previously it printed `synced:` and produced a bundle where every Play button was
a dead link.

**`href="…"` with double quotes.** The `LINKS` rewrite is a plain string replace
on `href="X"`. `location.href='index.html'` in single quotes is *not* rewritten,
which is the only reason `app/src/main/assets/index.html` still has to exist as a
duplicate launcher (`docs/audit/tooling.md` D-6).

### The TV block is three pieces, not one

| Piece | Goes to | Why it might not |
|---|---|---|
| `TV_FILES` | every menu page | `window.X3FFILES` is the launch map; without it every Play button navigates to a web filename that is not in the APK |
| `TV_TYPE` | every menu page **except** `RESOLUTION_INVARIANT` | it is a px rescue written for three phone-shaped pages. On a page sized in `rem` against `:root{font-size:calc(100vw/120)}` it overrides the one thing that makes the layout identical at 960, 1280 and 1920 CSS px |
| `TV_FOCUS` | every menu page | the remote has nothing focused until the first D-pad press. Guarded by `X3FNav.current()`, so it is a no-op on a page that seats its own cursor |

### `app.html` — registered

The single-document menu shell (`OVERHAUL-PLAN.md` AD-1) is registered in
`MENUS` (keeping its own filename, since it is a new page rather than a renamed
one), in `RESOLUTION_INVARIANT`, in `sw.js`'s `A`, and in
`tools/nav-audit/run.py`'s `SCREENS` with its own branch in
`tools/nav-audit/cases.js`.

It is **not** in `tools/func-test/run.py`'s `SCREENS` — it has no feature
assertions yet.

Two things to do when it replaces the old launcher rather than sitting beside it:

* point `MainActivity`'s `LAUNCHER` at it, and add it to `isLauncher()`. Until
  then the shell injects the BOOTSTRAP into it exactly as it does the other menu
  pages, and both test suites reproduce that split — so `app` is audited *with*
  the bootstrap today, which is correct, and will need moving to the
  `("launcher", "index")` exemption in `tools/nav-audit/run.py` on the day the
  shell stops bootstrapping it.
* if it also replaces routine/library/progress, remove those from `MENUS`,
  `LINKS` and both `SCREENS` lists in the same commit, and delete the stale
  bundle copies by hand — the sync never deletes (see §6).

---

## 3. A new **shared script or stylesheet** — `web/x3f-foo.js`, `web/x3f-foo.css`

| # | File | What to add | If you forget |
|---|---|---|---|
| 1 | `tools/sync-from-web.py` → `SHARED` | `"x3f-foo.js"` | **the file never reaches the bundle and every page that `<script src>`s it 404s on the TV.** The page keeps running with the module simply undefined |
| 2 | `web/sw.js` → `A` | the filename | not precached on the phone |
| 3 | each `web/*.html` that needs it | `<script src="x3f-foo.js"></script>` or `<link rel="stylesheet" href="x3f-foo.css">` — the sync copies the tag through unchanged | the module is in the bundle and nothing loads it |
| 4 | `tools/func-test/func.js` → `seed()` | any `localStorage` key the module owns | scenarios become order-dependent on whatever a previous one left behind |
| 5 | `tools/func-test/engine.html` | a `<script src="../../app/src/main/assets/x3f-foo.js">` | only if the engine tests need it |

`SHARED` files are copied **byte for byte, with no transform**. That is the point
of them: one file serves the phone build and the TV bundle, so `x3f-exercises.js`
cannot say one thing on the web and another on the couch. `x3f-ui.css` is in this
list for the same reason — it is a shared module that happens not to be
JavaScript.

Currently registered: `x3f-exercises.js`, `x3f-form.js`, `x3f-nav.js`,
`x3f-hype.js`, `x3f-music.js`, `x3f-progress.js`, `x3f-set.js`, `x3f-cal.js`,
`x3f-fx.js`, **`x3f-band.js`**, **`x3f-calflow.js`**, **`x3f-sync.js`**,
**`x3f-firebase-config.js`**, **`x3f-ui.css`**.

`x3f-calflow.js` is registered although no page loads it yet. That is
deliberate: 15 KB against a 5 MB budget is cheaper than the Calibrate rewrite
landing, nobody remembering this list, and the page 404ing its own state machine
on a television with no console to say so.

### Storage keys, because step 4 keeps being missed

Every key a shared module owns must be reset in `seed()`. The full set today:
`x3f_history`, `x3f_ach`, `x3f_chal`, `x3f_prog`, `x3f_routineProg2`,
`x3f_session`, `x3f_exCal`, `x3f_routine2`, `x3f_bandMax`, `x3f_exBand`,
`x3f_libBand`, plus `x3f_band`, which is *set* rather than cleared.

`x3f_exBand` (x3f-band.js's explicit per-movement choice) and `x3f_libBand` (the
Library's old key it migrates from) both sit **above** the recommendation in the
band-resolution order, so a leftover entry silently changes which band a movement
resolves to — precisely the class of bug `x3f-band.js` exists to end.

---

## 4. A new **art asset** — `web/assets/ui/newthing.png`

| # | File | What to add |
|---|---|---|
| 1 | `tools/sync-from-web.py` → `ART[folder]` | the filename — **art is enumerated, not globbed** |
| 2 | `web/sw.js` → `A` | the path |

A brand-new folder needs a new `ART` key; the bundle-side directory is created
automatically.

Art is enumerated on purpose: that list is a *decision*. `assets/bloom/bg.png` is
deliberately absent because Bloom loads `bg.jpg` and the png is 1.7 MB, and the
whole APK has to stay under 5 MB.

---

## 5. A new **generated directory** — `web/fonts/`

Different rule. `TREES` copies a whole folder recursively, filtered by extension:

```python
TREES = { "fonts": (".woff2", ".css", ".txt") }
```

Use a tree, not `ART`, when the filenames are **produced by a build step** rather
than chosen by hand, and shipping only some of them is never right. The extension
filter is the safety rail — the natural mistake is to leave the unsubset `.ttf`
sources next to the `woff2` output, and an allow-list makes that free instead of
doubling the bundle. Anything skipped is named in the sync's output.

`.txt` is allowed for exactly one reason: the SIL Open Font License requires its
own text to travel with the fonts it covers, and `fonts/OFL.txt` is not the kind
of file anyone notices missing.

A declared tree that does not exist yet is a **warning**, not a failure — unlike a
missing enumerated file, which means somebody renamed something and forgot the
list. That difference matters because a generated artefact can legitimately not
exist yet, and blocking every other fix on it would be the wrong trade.

**Regenerating the fonts means editing `web/sw.js`.** The woff2 files are named
individually in the precache list, so a phone that installs the app and then
never goes online again still renders in the right face — a lazily-fetched font
is only cached if you happened to be online the first time you looked at a page.
A stale name there is not fatal (the entry is skipped with a console warning and
the real file is cached on first use), which is why it is a comment rather than a
check.

Currently bundled: `fonts.css`, `sora-var-latin.woff2`,
`space-grotesk-var-latin.woff2`, `fredoka-var-latin.woff2`, `OFL.txt`.

**Offline is a hard requirement** (`OVERHAUL-PLAN.md` AD-5). A font that loads
from `fonts.googleapis.com` is a render-blocking request that cannot complete on
the TV. Nothing may reference the network.

---

## 6. Renaming or **deleting** a file

The sync **never deletes**. Both halves of that matter:

* A source file that is still registered but gone from `web/` is now a **hard
  failure** (`exit 2`). It used to be printed and ignored — so renaming
  `web/x3f-nav.js` reported success, left the stale copy in the bundle, 404'd
  every page that loaded the new name, and `--check` said `would change: nothing`.
* A bundle file that nothing produces any more is **listed as a warning** and left
  in place, because `launcher.html`, `index.html` and `logo.png` are legitimately
  hand-maintained. Delete real orphans by hand. Left alone, an orphan keeps
  shipping in the APK, keeps being staged and audited by the nav audit, and keeps
  being syntax-checked by the func tests.

So a rename is: update the registration, run the sync, delete the old bundle file
by hand, and re-run `--check`.

---

## 7. Renaming a **DOM id, class or global**

There is no list to update — these are hard-coded in four places that cannot see
each other, and a rename is a silent behaviour change on the TV plus a hard crash
in the harness.

* `MainActivity.java`'s `BOOTSTRAP` hard-codes `#firstrun`, `#zeroBtn`, `#x3fCss`,
  `.app`, `.tvbtn`, `.scrim.show`, `.modal.show`, `.x3f-focus` and 12 typographic
  class names.
* `TV_BLOCK` in `tools/sync-from-web.py` hard-codes 15 more.
* `tools/nav-audit/audit.js` keys on `.x3f-nav-cur` / `.x3f-focus` / `.foc`,
  `.coach.show` / `.rest.show` / `.scrim.show` / `.modal.show`, and `[data-nav]`.
* `tools/func-test/cases.js` names roughly 35 ids and 20 class names.

`docs/audit/tooling.md` §5 lists the ones that are load-bearing, with the bug each
one encodes. The func-test lookups are guarded now — a renamed id costs one
`FAIL DOM: #foo exists` line instead of killing the whole report — but the
assertion still fails, which is correct: it means the contract moved.

---

## 8. Release plumbing

* `app/build.gradle` — bump **both** `versionCode` and `versionName`, or the TV
  updater keeps reporting "You're on the latest" and the new assets never reach
  the couch.
* Nothing else. `build.yml` derives `version.txt` from `versionCode`, and the
  first matching line's digits are the whole number — do not put a year or an
  issue number on that line.
* `web/sw.js`'s cache name is stamped with the commit SHA by `pages.yml` at
  publish time. Do not hand-edit `const C = 'x3f-dev';` — that exact literal is
  what the workflow rewrites, and it checks that it matched before publishing.

---

## 9. What is *not* covered, and should be

Being honest about the size of the net, so "all green" is not read as more than
it is:

* **CI runs the sync check only.** The func tests and the nav audit need a
  Chromium-family browser and are not wired into any workflow yet. Wiring them is
  `docs/audit/tooling.md` §4 item 1: a job with `setup-python`, `setup-node` and
  `browser-actions/setup-chrome`, then the three commands at the top of this file.
* **`tools/func-test/engine.html` has no runner, no exit code and no CI hook.** It
  is ~45 assertions on the most logic-dense module in the project and it is opened
  by hand. It also writes the real `x3f_history` and never restores it, so opening
  it from a server rooted at the repo destroys your training log.
* **`app`, `arena`, `duel`, `rhythm`, `nova`, `calibrate` and `index` have zero
  feature assertions.** They are nav-audited but not feature-tested — `app` in
  particular is the new home screen and has nothing checking that it renders the
  right day. `nav-audit/run.py` now prints a `NOT AUDITED BY ANY SCREEN:` line
  for bundled pages missing from `SCREENS`; `func-test` has no equivalent yet.
* **A non-ASCII control label used to destroy the nav audit's report.** One "⬇"
  in a button caption raised `UnicodeEncodeError` mid-print on a Windows console
  and left a traceback where the evidence should have been. `nav-audit/run.py`
  now reconfigures stdout with `errors="replace"`; `func-test/run.py` prints
  failure lines the same way and has not been given the same treatment.
* **Nothing tests `web/`.** `syntax_check()` parses `app/src/main/assets/*.html`
  only, and only their inline scripts — never `web/`, never any `.js` file. A
  stray brace in a shared module reaches the TV unchallenged.
