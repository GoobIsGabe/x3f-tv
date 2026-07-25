# X3F TV

A TV-native Android app that connects the **X3 Force bar** straight to the TV over Bluetooth — no phone in the loop — and (soon) runs the X3F game suite on the big screen.

This first version is the **bar probe**: it auto-connects to the bar and shows the live force, to confirm the TV's Bluetooth radio can read it. Once that's confirmed, the games get layered on (WebView + the same force feed).

## What's in here
```
web/    the browser games (Web Bluetooth) — the source of truth for game code
app/    the Android TV app; app/src/main/assets/ is GENERATED from web/
tools/  sync-from-web.py — regenerates the bundle after you edit web/
```
Edit a game in `web/`, run `python tools/sync-from-web.py`, bump `versionCode` in
`app/build.gradle`, push. See [DEPLOY.md](DEPLOY.md).

## How it gets built
This repo builds itself. Every push runs the **Build APK** GitHub Action, which compiles a debug APK on GitHub's runners and attaches it to the **[latest release](../../releases/tag/latest)** as `x3f-tv.apk`.

## Install on the Google TV
1. On the TV, enable Developer options (Settings → System → About → click **Build** 7×) if you haven't.
2. Install **Downloader** (or **Send Files to TV**) from the Play Store; allow it to install unknown apps.
3. In Downloader, open the direct APK URL:
   `https://github.com/GoobIsGabe/x3f-tv/releases/download/latest/x3f-tv.apk`
4. Install, open **X3F TV**, wake the bar (load a band). It auto-connects; the number is live force. Press **OK** on the remote to re-zero.

## The bar protocol
Same as the web games: BLE service `e3458900`, force characteristic `e3458901` (float64, little-endian), tared to a baseline.

## Roadmap
- v0.1 — probe: auto-connect + live force (this build)
- v0.2 — WebView + Nova, force injected natively, auto-reconnect
- v0.3 — D-pad game launcher, all games bundled for offline play
- v0.4 — logo (icon / banner / launcher), shop-scroll nav fix
- v0.5 — bubbly web launcher, in-app updater, stable signing
- v0.6 — **guided workout mode**: Push/Pull days that coach each X3 movement, plus a live
  form demonstrator — an animated figure that moves with your actual force — and the
  Library / Progress pages on the TV
- v0.7 — couch fixes: launcher D-pad stays in its row, illustrated Bloom/Splash art
  actually bundled, long pages scroll from the remote
- v1.0 — milestone moments (escalating countdown into 50, PB callouts), a generated
  WebAudio soundtrack that reacts to your effort, and one set per lift per the X3
  protocol. Roadmap: [ROADMAP.md](ROADMAP.md)
- v0.9 — bar connects itself when a scan can't see it (already-connected, bonded, or
  last-known device), manual device picker as a fallback, TV button hidden on TV
- v0.8 — a real navigation audit (`tools/nav-audit/run.py`, 12 screens / 27 states) and
  the bugs it found: the guided coach was unreachable by remote, overlays didn't trap the
  cursor, Arena could focus buttons on hidden tabs
