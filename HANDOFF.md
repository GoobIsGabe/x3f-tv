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

Current status: **v0.9**, working on the TV.

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

**v0.9 — the bar connects itself again, and the TV button stopped lying.**
- **Why "scanning forever" happens:** a BLE peripheral that is already connected — to this TV from a previous run, or to your phone — **stops advertising**, so a scan can never see it, no matter how long it runs. Same story if its advertisement carries neither the name nor the service UUID (a wiped name cache is enough to flip that). Reopening the app used to be the only way out. The BLE code itself had not changed since v0.5; the scan-only strategy was simply blind to those states.
- Now, before scanning, it goes straight at devices it can address without an advertisement: anything the system already reports connected on GATT, the address that worked last time (remembered in prefs), then any bonded bar. A 9s watchdog falls back to scanning if a direct attempt stalls, so it can no longer sit on "Reconnecting…" forever.
- Name matching is case-insensitive and also accepts FORCE / JAQUISH; the old check was `toUpperCase().contains("X3")` only.
- Escape hatch: if it is still not live after 9s the launcher shows **every device the scan saw**, remote-navigable — pick the bar by hand (`X3F.pickDevice`). **Scan again** (`X3F.rescan`) drops any half-open GATT, which is what a restart was really fixing.
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
