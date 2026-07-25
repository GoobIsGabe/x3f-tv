# X3F TV — Project Handoff / Shared Context

**Paste this whole file into any Claude conversation** (or point it at this file in the cloned repo) to bring it fully up to speed on the X3F TV app. It was built in a separate Claude Cowork session, so other sessions won't know about it unless you share this.

---

## TL;DR — there are TWO related projects

1. **The web games** (original) — HTML games in `E:\Fun\X3 Bar` (Nova, Splash, Bloom, Flow, Arena, Duel, Rhythm, Calibrate, …). They read the X3 Force bar over **Web Bluetooth** and run on phone / PC / Netlify. This is what your other session has been living in.
2. **The native TV app** (new — this handoff) — a GitHub repo **`github.com/GoobIsGabe/x3f-tv`** that wraps those games into an **Android TV app** so the bar drives them on the Hisense Google TV with **no phone**. Turn on TV → open app → bar auto-connects → play. **This was NOT in your local filesystem**, which is what caused the confusion.

Current status: **v0.5**, working on the TV.

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
- **The 8 games are bundled copies** of the web games in `app/src/main/assets/` (nova.html, splash.html, …), unchanged except the service-worker line stripped. A small **bootstrap** JS (the `BOOTSTRAP` constant in `MainActivity.java`) is injected into each game on load — it copies `window.__x3fForce` into the game's `force` variable each frame, overrides the mobile `max-width` to go full-screen, sets `baseline=0` (so Calibrate works in the WebView), and adds D-pad spatial navigation scoped to whatever menu is open.
- **In-app updater:** the launcher's "Check for updates" reads `version.txt` on the `dist` branch, compares to `BuildConfig.VERSION_CODE`, and if newer downloads the APK (DownloadManager) → system installer.
- **Signing:** a committed debug keystore (`app/x3f-debug.keystore`) + `signingConfigs.debug` gives every build the **same signature**, so updates install **in place** (no uninstall).

## Bar protocol
BLE service `e3458900-6ed5-40ff-aa3a-4e9a87ce1ad6`, force characteristic `e3458901-…` (NOTIFY, **float64 little-endian**), tared to a baseline. Bands (default max, in the bar's force units): White 130 / Light Gray 230 / Dark Gray 330 / Black 430 / Elite Black 600 — calibrate each to your real max (stored in `localStorage.x3f_bandMax`).

---

## How to build & ship a change

Two paths:

**A) Local (fastest dev loop):** open the project in **Android Studio** and hit Run — your machine can reach Google's SDK servers and build directly. Install the resulting APK on the TV.

**B) GitHub Actions (what the cloud session uses):** push to `main` → CI builds the APK and publishes it to the repo's **`latest` release** and the **`dist` branch** (as `x3f-tv.apk` + `version.txt`) in ~1-2 min. Fixed APK URL:
```
https://github.com/GoobIsGabe/x3f-tv/releases/download/latest/x3f-tv.apk
```
> Note: the **Cowork cloud sandbox cannot build Android** (Google's SDK servers are firewalled there), which is why CI exists. Your **local machine can**, so Android Studio is the quick loop; CI is the "hands-off, produces a downloadable APK" loop.

**Install on the TV:** after v0.5 there's an in-app **Check for updates** button. Otherwise use the **Downloader** app (enter the release URL) or **Send Files to TV**. Stable signing means it updates in place.

---

## Relationship between the two projects (important)

The TV app **bundles copies** of the web games. If you improve a web game in `E:\Fun\X3 Bar`, copy the updated HTML into the TV repo's `app/src/main/assets/` (and delete its `<script>…serviceWorker…register('sw.js')…</script>` line) to get it on the TV. Nothing in the TV app changes the original web games. *(Future option: load the games from your Netlify site instead of bundling, so there's one copy.)*

Also: ignore `E:\Fun\X3 Bar\tv-poc\` — that was an **older, superseded** "phone-as-relay" approach. The native TV app replaced it.

---

## Status & roadmap

Shipped: v0.1 probe → **v0.5** = all 8 games, bubbly game-style launcher, D-pad navigation, logo (icon/banner/home), Calibrate fix, in-app updater, stable signing.

Next (Gabe's priorities):
1. Keep polishing the game-style UI.
2. **Guided workout mode + live form demonstrator** — an animated figure that moves *with your live force* (not a bundled video), doubling as real-time form feedback.
3. **Firebase phone-sync + progress dashboard** — sets logged on the TV show up on your phone (PRs, volume, streaks). Firebase because you already run it for TMT; likely a new dedicated project.
4. Per-band calibration onboarding.

(A full prioritized roadmap also exists as the Cowork artifact **"x3f-tv-roadmap"**.)

---

## Gotchas
- Pushing to the repo **from a cloud Cowork sandbox** needs a fine-grained **PAT** (Contents + Workflows read/write) because the sandbox's built-in tokens are placeholders and the GitHub REST API is blocked there. **From your local machine, normal git auth works** — no PAT needed.
- The workflow only builds on push to **`main`** (the `dist` push must not retrigger it).
- `BuildConfig` requires `buildFeatures { buildConfig true }` (already set).
