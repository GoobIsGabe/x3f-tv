# X3F TV — Project Handoff / Shared Context

**Paste this whole file into any Claude conversation** (or point it at this file in the cloned repo) to bring it fully up to speed on the X3F TV app. It was built in a separate Claude Cowork session, so other sessions won't know about it unless you share this.

---

## TL;DR — ONE repo, two halves

As of v0.7.1 there is a single project: **`github.com/GoobIsGabe/x3f-tv`**.

```
web/    the browser games (Web Bluetooth) — the source of truth for game code
app/    the Android TV app that wraps them; its assets are GENERATED from web/
tools/  sync-from-web.py, which does the generating
```

- **The web games** — HTML games (Nova, Splash, Bloom, Flow, Arena, Duel, Rhythm, Routine, Library, Progress, Calibrate) that read the X3 Force bar over **Web Bluetooth** and run on phone / PC.
- **The native TV app** — wraps those same games so the bar drives them on the Hisense Google TV with **no phone**. Turn on TV → open app → bar auto-connects → play.

`E:\Fun\X3 Bar` was the old separate home of the web games. It is **retired** — it had a git remote pointing at this same repo and a DEPLOY.md telling you to force-push, which would have overwritten the Android app. Everything that matters was moved into `web/`. Don't develop there.

Current status: **v1.6**, working on the TV. Roadmap: [ROADMAP.md](ROADMAP.md).

---

## Get it locally (do this first)

```
git clone https://github.com/GoobIsGabe/x3f-tv.git
```

Clone it wherever you like (e.g. `E:\Fun\x3f-tv`). That's the complete source — develop there, commit, push. `git pull` any time to sync changes made from the cloud session. It's a **public** repo, so no auth needed to clone.

---

## How the TV app works

- Native **Android TV** app, **Java**, package `com.goob.x3ftv`, minSdk 24 / target 34, **no third-party dependencies** (framework only).
- **Architecture:** a single full-screen **WebView** + native **BLE**. On launch it loads a bubbly HTML home (`app/src/main/assets/launcher.html`); picking a game card navigates the WebView to that game's bundled HTML. Native connects to the bar over BLE and **injects force as `window.__x3fForce`**; the TV remote's D-pad is captured natively and drives `window.__x3fNav(dir)` (focus/select). **Back** returns to the launcher.
- **The bundled pages are copies** of the web pages in `app/src/main/assets/`, unchanged except the service-worker line stripped (see the sync tool below). As of v0.6 that is the 8 games (nova.html, splash.html, …) **plus three menu pages** — `routine.html` (guided workout), `library.html`, `progress.html` — and three shared scripts they load: `x3f-exercises.js` (the 11 X3 movements, one source of truth with the web build), `x3f-form.js` (live form demonstrator) and `x3f-nav.js` (menu D-pad nav).
- **Nav, and who owns it:** the bootstrap installs its fallback spatial nav **only `if(!window.__x3fNav)`**. `x3f-nav.js` claims `window.__x3fNav` first, so the launcher and the menu pages all drive *its* geometry-aware nav (same-row Left/Right, `data-nav` items, one focus ring); the games have no `x3f-nav.js` and keep the bootstrap's. **The rule that matters:** a candidate must actually overlap your row (or column) before a Left/Right (or Up/Down) will move there — v0.6 shipped without it in the launcher and the bootstrap, so a band pill one row above could out-score the card right beside you (Right off Workout → a grey band, Left off Nova → Black). On a remote, OK cycles a `<select>` in place and the arrows are left free to move and scroll; Up/Down must never be bound to a select's value, or a page whose only control is a filter (Progress) traps the D-pad. Long pages scroll when there is nothing further to focus that way. Don't add `x3f-nav.js` to a game — its Enter/Space handling would fight Space-to-pull in the browser build.
- **Live form demonstrator:** games launched with `?ex=<slug>` (from `routine.html` or `library.html`) mount an animated figure that mirrors your live force. It needs no TV-specific code: the bootstrap already assigns `force = window.__x3fForce`, and the panel reads `force/ref()`.
- A small **bootstrap** JS (the `BOOTSTRAP` constant in `MainActivity.java`) is injected into each game on load — it copies `window.__x3fForce` into the game's `force` variable each frame, overrides the mobile `max-width` to go full-screen, sets `baseline=0` (so Calibrate works in the WebView), and adds D-pad spatial navigation scoped to whatever menu is open.
- **In-app updater:** the launcher's "Check for updates" reads `version.txt` on the `dist` branch, compares to `BuildConfig.VERSION_CODE`, and if newer downloads the APK (DownloadManager) → system installer.
- **Signing:** a committed debug keystore (`app/x3f-debug.keystore`) + `signingConfigs.debug` gives every build the **same signature**, so updates install **in place** (no uninstall).

## Bar protocol
BLE service `e3458900-6ed5-40ff-aa3a-4e9a87ce1ad6`, force characteristic `e3458901-…` (NOTIFY, **float64 little-endian**), tared to a baseline. Bands (default max, in the bar's force units): White 130 / Light Gray 230 / Dark Gray 330 / Black 430 / Elite Black 600 — calibrate each to your real max (stored in `localStorage.x3f_bandMax`).

---

## How to build & ship a change

Two paths:

**A) Local (fastest dev loop):** open the project in **Android Studio** and hit Run — your machine can reach Google's SDK servers and build directly. Install the resulting APK on the TV.

> **Bump `versionCode` in `app/build.gradle` for anything you want the TV to pull.** The in-app updater compares `version.txt` on `dist` against `BuildConfig.VERSION_CODE`. Push new assets without bumping it and CI will happily rebuild while the TV still reports "You're on the latest" — the games would never update.

**B) GitHub Actions (what the cloud session uses):** push to `main` → CI builds the APK and publishes it to the repo's **`latest` release** and the **`dist` branch** (as `x3f-tv.apk` + `version.txt`) in ~1-2 min. Fixed APK URL:
```
https://github.com/GoobIsGabe/x3f-tv/releases/download/latest/x3f-tv.apk
```
> Note: the **Cowork cloud sandbox cannot build Android** (Google's SDK servers are firewalled there), which is why CI exists. Your **local machine can**, so Android Studio is the quick loop; CI is the "hands-off, produces a downloadable APK" loop.

**Install on the TV:** after v0.5 there's an in-app **Check for updates** button. Otherwise use the **Downloader** app (enter the release URL) or **Send Files to TV**. Stable signing means it updates in place.

---

## Relationship between the two projects (important)

The TV app's `app/src/main/assets/` is **generated** from `web/` in this same repo. Improve a game in `web/`, then re-sync the bundle:

```
python tools/sync-from-web.py            # or: ... "E:\Fun\X3 Bar"
python tools/sync-from-web.py --check    # report drift without writing
```

That copies every mapped page, strips the service worker and PWA manifest, rewrites cross-page links to the bundle's lowercase filenames (and "home" to `launcher.html`), and injects the TV block on the menu pages — the `window.X3FFILES` launch map that `x3f-exercises.js` reads, 10-foot type scaling, and initial D-pad focus. Doing it by hand is how a step gets forgotten. Nothing in the TV app changes the original web games. *(Future option: load the games from your Netlify site instead of bundling, so there's one copy.)*

Also: `tv-poc/` (left behind in the retired folder) was an **older, superseded** "phone-as-relay" approach. The native TV app replaced it; it is deliberately not in this repo.

---

## Status & roadmap

Shipped: v0.1 probe → v0.5 = all 8 games, bubbly game-style launcher, D-pad navigation, logo (icon/banner/home), Calibrate fix, in-app updater, stable signing.

**v0.6 — guided workout mode + live form demonstrator** (roadmap item 2):
- `routine.html` — pick Push / Pull / Custom, then run the day. Per movement it coaches the setup + strongest-range start, shows the form demonstrator, launches the chosen game pre-configured (`?from=routine&band=…&ex=…`), logs the set and runs a rest timer to the next lift. Days are editable (add / reorder / remove from the 11 movements); sets, bands, tempo and progress persist. Back → launcher → Workout resumes the session and asks whether the set counted.
- `x3f-form.js` — the animated figure. Poses are authored as hip/hand/foot targets with the knees and elbows solved by two-bone IK, driven by live force: it rises, holds, eases, flushes and trembles near max, and flips to "diminishing range" when your rep tops start collapsing (the X3 burnout). The foot hinges on the ball with the contact pinned to the floor, so a calf raise really rises onto the toes.
- `library.html` + `progress.html` bundled; launcher gained Workout (hero card), Library and Progress.

**v1.6 — the per-movement floor was never applied on the TV.**
- **The bug:** the shell's `BOOTSTRAP` assigns `force = window.__x3fForce` every 16ms, which **replaces the browser build's `onSample()` entirely**. v1.4 put the floor subtraction in `onSample()` and nowhere else, so on the TV `ref()` shrank to the calibrated span while the resting load stayed in the signal. A White-band overhead press calibrated 52-78 rested at 52/26 = **200% of the screen** — pinned at the top, and pressing drove it to 300%. Exactly as reported. The browser build was fine; only the TV was wrong, which is why it passed everything.
- The bootstrap now applies `calLo()` when the page defines one. Calibrate deliberately does not define it — it must measure absolute force.
- **The rule this keeps breaking:** anything that conditions the raw signal must exist in BOTH `onSample()` and the bootstrap, or it silently does not exist on the TV. This is the second divergence (v0.9's Arena `vis()` was the first).
- **`func-test` now has a `bloomtv` scenario**: Bloom with the **live** BOOTSTRAP extracted from `MainActivity.java` (not a copy — a copy drifts and then the test checks fiction), launched with `?ex=` the way a Routine launches a lift. It asserts resting-at-the-start reads 0, halfway reads 0.5, all-out reads 1.0. Mutation-verified: restoring the old one-line driver fails it with `force=52` / `frac=3.00`, the user's exact symptom.
- Note on zeroing: the floor is only meaningful against the same baseline the calibration used. Zero the bar **at rest, band unloaded** — the state native tares in on connect. Zeroing while already in the start position bakes that load into the baseline and the stored floor then double-counts.

**v1.5 — calibration you can actually complete, with the movement on screen.**
- **The "too narrow to be real" refusal was my bug, not a bad capture.** v1.4 required 40 force units between the hold and the max. A White band overhead press genuinely spans only ~20-35, so honest calibrations were rejected with no way to proceed. The floor is now 10, and the refusal *says what it measured* — "Only 6 between hold and max; needs 10" or "The max (70) came out no higher than the hold (90)" — instead of a dead end. Verified across all three cases: 52-78 on a White band saves, 90-96 is refused, max-below-hold is refused with the right reason.
- **Calibrate shows the animated figure**, the same rig the guided Routine uses. Idle it loops the movement as a reminder of what you are about to do; during **HOLD THE START** it is pinned to the start pose, which is the instruction rendered as a picture rather than a sentence; during the max it rides your live force. `create()` sizes its canvas on construction and this one has no layout yet at that moment, so it also asks for a resize once the page settles — otherwise the figure draws stretched from the 300x150 default.

**v1.4 — every movement gets its own scale, and its own name for the work.**
- **`x3f-cal.js` — per-movement calibration (`x3f_exCal`).** One number per band was wrong twice: the ceiling differs per movement, and so does the **floor**. An overhead press starts at chin height with the band already under the midfoot, so its start position is *already carrying real load* — and every game treated 0 as "no effort". Measured in Bloom: merely holding the overhead-press start position read **74% up the screen** before a rep had been done. A movement+band is now a **range** (`lo` = start tension, `hi` = all-out max); games subtract `lo` and scale to `hi - lo`, so start = 0%, midpoint = 50%, max = 100%. Wiring per game is two lines, because the signal handed to the game is already floored and spanned.
- Movements you have never calibrated **auto-learn the ceiling** from the peaks `x3f-set.js` already measures, so nothing is broken on day one. Auto-learn never overwrites a real calibration, and only runs while the floor is still 0 — which is what makes it safe to hand it the game's (floored) force.
- **Calibrate is per movement, two captures**: hold the start position (averaged, not peaked — a wobble must not become the floor), then go all out. `?ex=` preselects the movement. It shows every band's range for that movement and marks the estimates `est`.
- **The work phase is named after the movement.** The form demonstrator labelled every rep `PULL`, including all three presses on a push day — the opposite of the instruction. Each rig now carries a verb (PRESS / ROW / CURL / DRIVE / SQUEEZE / RAISE / PULL), exposed as `X3FForm.verb(slug)` for anything outside the panel: Nova's idle prompt and Calibrate's countdown use it too.
- **The band you pick stays picked.** Routines defaulted every movement to the *library's* suggestion (`ex.band`), and every game then did `xset('band', …)` on `?band=` — so starting a day on White silently moved you to Dark Gray, a setting you never chose. Routines now default to the band you are on and show the suggestion as advice; a `?band=` override applies to that run only and no longer rewrites your global choice. `x3f-set.js` asks the game (`window.__x3fBand`) so the set is still logged against the band you actually pulled.
- Ascent (phone-only, not in the TV bundle) got the same two fixes, so it stops clobbering the band setting there.
- Export/import carries `x3f_exCal`; a real calibration wins over an imported estimate.
- **`func-test/run.py` now parses each page's inline script first.** A duplicate top-level `const EXSLUG` in Bloom killed the entire script and surfaced as "endSet is not defined" across nine assertions, pointing at nothing. `node --check` names the line in milliseconds. Verified by mutation: reintroducing the duplicate fails the run, removing it passes.
- Suites: 96 functional (up from 85), 12 screens / 28 nav states.

**v1.3 — the bar chip: battery, and a picker that stops squashing the launcher.**
- **The manual bar picker is a modal, not an inline panel.** It lived in the launcher's flex column, so opening it stole height from `.grid` (`flex:1`) and squashed all 11 cards — and it opened *itself* after 9 seconds, unasked. It is now a `.scrim` modal opened from the **bar chip** in the top row; nothing else on the page moves. After 9s without a connection the chip just turns gold and says "· OK to pick", which is the prompt without the layout damage.
- **The status pill is now a control** (`#barChip`, `data-nav`), so the remote can reach it from the top row.
- **Battery.** The bar publishes cell millivolts on `e3458902-…` (uint16 LE) — the characteristic the web Arena already read and the TV build ignored. Native subscribes after the force CCCD write comes back (one GATT operation at a time, or the stack drops it), reads once so a notify-only bar doesn't stay blank until the level moves, and re-reads every 5 min. The chip shows `🔋 nn%` on the same 3.30–4.20 V map the games use, red at ≤20%. A bar without the characteristic simply shows no percentage — it must never block the force stream. `onCharacteristicChanged` now routes by UUID, since two characteristics notify on one connection.
- **Back closes the modal** instead of dropping the app to the TV home screen: `evaluateJavascript` is async, so the launcher tells native an overlay is up (`X3F.setOverlay`) before the key can arrive.
- **Music is ~2× louder** (master `0.16` → `0.34`). It was mixed for a phone at arm's length; across a room, over TV speakers, under a bar you're pulling on, it vanished.
- Suites: 85 functional (14 on the launcher, up from 8 — including a guard that the picker cannot change the card grid's height), 12 screens / 28 nav states.

**v1.2 — the whole suite feeds the program.** `x3f-set.js` is now the single way a game reports a finished set: Flow, Arena (max/boss/zone), Duel, Rhythm, Splash and Nova all call it, so PBs, challenges and achievements see everything instead of only Bloom. It resolves the movement from `?ex=` and the band from shared storage, **measures peak force and time-under-tension itself** (no per-game tracker), names what improved against your last set of that movement, and announces unlocks through the hype layer — never a dialog.
- History no longer truncates: entries older than 8 weeks fold into one rollup per day+movement+band, keeping bests and an `n` so session counts stay honest.
- Challenges follow the day — a push day asks for push movements (your edited Routines day list wins, else the library's day tags, legs counting for both).
- Undo: "Undo last set" on the summary, and a delete on every row of a new Recent Sets list on the dashboard.
- Bloom times each lowering phase (eccentric average) and reports tension; new Slow Negative and Under Tension badges, a tension challenge, and a negative column in the PB table.
- 10-foot pass for game HUDs, injected from the shell so the phone build is untouched.
- Perf: nav audit 6-8 min -> 30 s; `sets()`/`pbTable()`/`stats()` memoised on a log revision key; `x3f-nav.js` reuses its item list for 50 ms.
- Fixed: the session summary was counted as a SET (inflating session/day counts, and undo removed the summary instead of your last set); the peak watcher missed sets shorter than one sample interval.
- Suites: 67 engine, 79 functional across 7 screens, 12 screens / 27 nav states.

**v1.1 — the program brain.** `x3f-progress.js` is now the source of truth for everything about your training, derived entirely from `localStorage['x3f_history']`. Local only: no account, no server, nothing that can collide with another project.
- **12-week program** derived from what you have *done*, not the calendar, so a missed day shifts the plan instead of desyncing it. Weeks 1-4 are four workouts a week, 5-12 are six, Push/Pull alternating.
- **Streak with one rest day per rolling week** — a second gap inside seven days ends the run, and an unfinished today is a grace day, not a break.
- **Daily challenges**, deterministic per date, aimed at 70-90% of your own best for a movement+band: match it, do not beat it. Falls back to "set your first benchmark" with no history.
- **~130 generated achievements** from 16 templates x parameters (lifetime reps, per-movement mastery, band mileage, burnout depth, streaks, program weeks, challenges, sessions, guided sessions, single-set feats, peak force, perfect weeks, days trained, day variety, comebacks, burnout specialisation).
- **Band-progression coaching** — 40+ full reps on a band means it stopped being heavy; the dashboard says which band to move to.
- **Score the failure**: partials past full-range collapse get a meter, their own milestones and the headline slot in the set summary.
- **Dashboard rewrite** (`X3F_Progress.html`): today, challenge, 84-day adherence grid, reps/week, peak-force/week, PB table, band coaching, achievements with filters, export/import.
- **Music everywhere** — 10 moods across menus and all games; menus lift briefly on a keypress so the app feels awake.
- **Free phone access**: `.github/workflows/hosting.yml` publishes `web/` to Firebase Hosting at https://x3f-tv.web.app over https (which Web Bluetooth needs). Free on Spark; `firebase.json` holds the config, including the `no-store` header on `sw.js` that GitHub Pages could not express. Deploying by hand is `firebase deploy --only hosting`. This replaced a `gh-pages` workflow; that branch is now unused and can be deleted.
- Test suites: `tools/func-test/run.py` (63 feature assertions over 5 screens) and `tools/func-test/engine.html` (40 engine tests) join the nav audit.
- Fixed: Bloom wrote TWO history entries per set, inflating every total; the dashboard did not re-check achievements after an import; `program()` said Week 1 on an empty log.

**v1.0 — milestone moments, generated soundtrack, and one set per lift.**
- **One set is the X3 prescription**, not three. Routines defaulted to 3 sets; it now defaults to 1, the option is labelled "1 set · X3 standard", and the page says why.
- **`x3f-hype.js`** — milestone moments on a two-tier ladder. Rungs (10/15/20/…) get a quick nod; **majors** (50/75/100…) and **your personal best** get the escalating approach: "4 MORE", "2 MORE", "ONE MORE!", each bigger and shakier, then a full callout with flash, confetti, fanfare and haptics. Verified cadence over a 52-rep walk: 18 reps say something, 34 stay quiet — deliberately not per-rep.
- **`x3f-music.js`** — the soundtrack is *generated* in WebAudio, not downloaded (the whole APK is under 5MB and must work offline). Per-game moods (bloom / splash / nova), and the arrangement responds to `getIntensity()`: filter brightens, bass joins above a threshold, hats double, pads give way to arpeggios. Ducks under cues and fanfares; toggled from a **Music** button in each game's topbar, remembered in `x3f_music`.
- Wired into Bloom (reps), Splash (score + combo callouts) and Nova (score + "SECTOR n CLEAR").

**v0.9 — the bar connects itself again, and the TV button stopped lying.**
- **Why "scanning forever" happens:** a BLE peripheral that is already connected — to this TV from a previous run, or to your phone — **stops advertising**, so a scan can never see it, no matter how long it runs. Same story if its advertisement carries neither the name nor the service UUID (a wiped name cache is enough to flip that). Reopening the app used to be the only way out. The BLE code itself had not changed since v0.5; the scan-only strategy was simply blind to those states.
- Now, before scanning, it goes straight at devices it can address without an advertisement: anything the system already reports connected on GATT, the address that worked last time (remembered in prefs), then any bonded bar. A 9s watchdog falls back to scanning if a direct attempt stalls, so it can no longer sit on "Reconnecting…" forever.
- Name matching is case-insensitive and also accepts FORCE / JAQUISH; the old check was `toUpperCase().contains("X3")` only.
- Escape hatch: if it is still not live after 9s the launcher shows **every device the scan saw**, remote-navigable — pick the bar by hand (`X3F.pickDevice`). **Scan again** (`X3F.rescan`) drops any half-open GATT, which is what a restart was really fixing. *(v1.3 moved this out of the page flow into a modal off the bar chip — as an inline panel it squashed the card grid.)*
- The **TV** button in games is hidden in the TV build: it asks for fullscreen and an orientation lock, and this shell is already fullscreen and locked to landscape, so it did nothing. It still works in a phone browser.
- The audit now extracts the **live** BOOTSTRAP from MainActivity instead of keeping a copy (a copy would drift and the audit would be testing fiction), which also means a syntax error in the injected JS fails the audit. Verified with a mutation test: reintroducing the Arena bug makes it fail, restoring the fix makes it pass.

**v0.8 — navigation audit + the fixes it found.** `python tools/nav-audit/run.py` walks all 12 screens and 27 UI states with a simulated remote and fails on unreachable controls, focusable-but-invisible controls, or an overlay that doesn't trap the cursor. What it caught:
- The **guided coach had 8 controls and none were focusable**, and because the nav wasn't scoped to overlays the cursor silently walked the day list underneath it. Coach controls are now `data-nav`, and `x3f-nav.js` scopes to the topmost open overlay (`.coach.show`, `.rest.show`, `.scrim.show`, `.modal.show`, `[data-nav-scope]`) and lands the cursor inside when one opens.
- **Arena** let the D-pad focus `Fight` and `Start Max Effort` on *inactive* mode tabs: `.view` panels hide with `opacity:0;pointer-events:none` but keep their layout box, and the bootstrap's `vis()` only inspected the element itself. It now walks ancestors — the same rule `x3f-nav.js` uses.
- A cursor dropped for leaving scope kept its focus ring, so two rings could be lit at once, one of them a lie.
- The inline links inside the note text on Routine and Library were unreachable.
- Scrollable pages end with a hairline `.endcap` and 80px of breathing room, so hitting the bottom reads as the bottom.

> **Watch out:** the source of truth for game code is `web/`, NOT the retired `E:\Fun\X3 Bar`. Editing the old copy is exactly how v0.7's scoping fix got stranded and shipped broken — the audit is what caught it.

**v0.7 — TV fixes from the first real session on the couch:**
- Launcher nav: dropped its hand-rolled spatial nav for the shared `x3f-nav.js` (reusing its own `.foc` look via `window.X3FNAV_CLASS`), so Left/Right stay in the card row. Same row-overlap rule added to the bootstrap fallback that governs in-game menus.
- The illustrated Bloom/Splash art is now bundled under `assets/assets/{bloom,splash}/` — v0.6 shipped without it, so both games silently used their procedural fallback drawings. `bloom/bg.png` is excluded on purpose (Bloom loads `bg.jpg`; the png is 1.7MB).
- Long pages scroll from the remote, and Progress got nav at all (it had none).
- The D-pad can no longer focus buttons inside a faded-out overlay (the rest timer / session summary keep their layout box at `opacity:0`).
- Menu pages claim `window.__x3fNav`, so the remote drives the geometry-aware nav; `tools/sync-from-web.py` makes future web→TV syncs one command.

Next (Gabe's priorities):
1. Keep polishing the game-style UI (10-foot pass is only partial: the menu pages scale type at ≥1200px, the games don't yet).
2. **Firebase phone-sync + progress dashboard** — sets logged on the TV show up on your phone (PRs, volume, streaks). Firebase because you already run it for TMT; likely a new dedicated project.
3. Per-band calibration onboarding.
4. Authentic X3 set engine everywhere — make the full-reps → partials → failure model the spine of every game, not just Bloom.

(A full prioritized roadmap also exists as the Cowork artifact **"x3f-tv-roadmap"**.)

---

## Gotchas
- Pushing to the repo **from a cloud Cowork sandbox** needs a fine-grained **PAT** (Contents + Workflows read/write) because the sandbox's built-in tokens are placeholders and the GitHub REST API is blocked there. **From your local machine, normal git auth works** — no PAT needed.
- The workflow only builds on push to **`main`** (the `dist` push must not retrigger it).
- `BuildConfig` requires `buildFeatures { buildConfig true }` (already set).
