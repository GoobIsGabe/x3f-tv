# Shipping X3F — one repo, two halves

Everything lives in **this** repo, `github.com/GoobIsGabe/x3f-tv`:

```
web/    the browser games (Web Bluetooth) — the source of truth
app/    the Android TV app that wraps them; its assets are GENERATED from web/
tools/  sync-from-web.py, which does that generating
```

There is no second project and no second repo. If you are editing a game, you are
editing `web/`.

> An older `DEPLOY.md` in `E:\Fun\X3 Bar` claimed that folder was this repo and told
> you to `git push --force` to `main`. That would have overwritten the Android app.
> The folder is retired — see `RETIRED.txt` there.

---

## Change a game (or a menu page)

```bash
python tools/sync-from-web.py
```

1. Edit the file in `web/`.
2. Run the sync — it regenerates `app/src/main/assets/` (strips the service worker,
   rewrites links to the bundle's filenames, injects the TV block, carries the art).
3. **Bump `versionCode` and `versionName` in `app/build.gradle`.** Skip this and the
   TV will keep saying "You're on the latest" no matter what you push.
4. Commit and push to `main`.

CI builds the APK (~1-2 min) and publishes it to the `latest` release plus the
`dist` branch as `x3f-tv.apk` + `version.txt`. Then on the TV: **Check for updates**.

Fixed APK URL, for a manual sideload via the Downloader app:

```
https://github.com/GoobIsGabe/x3f-tv/releases/download/latest/x3f-tv.apk
```

`python tools/sync-from-web.py --check` reports drift without writing, and exits
non-zero if the bundle is stale — handy before a release.

## Check the remote can still drive everything

```bash
python tools/nav-audit/run.py
```

Walks every bundled screen with a simulated D-pad (real BOOTSTRAP injected, fake
native force) and fails if any visible control is unreachable, if the cursor can
land on something invisible, or if an open overlay doesn't trap it. Run it after
touching menus, overlays or `x3f-nav.js`. See `tools/nav-audit/run.py` for the
three shipped bugs that motivated it.

## Check the features still work

```bash
python tools/func-test/run.py
```

Drives the real pages headlessly with a seeded log and asserts the FEATURES do
what they claim: the guided session advances and logs one entry per set, the
dashboard computes from history, export/import round-trips, a Bloom set records
its partials and peak, the launcher shows today's programme. The engine itself
has its own tests — open `tools/func-test/engine.html` in a browser.

## Change only the Android side

Editing `MainActivity.java`, the manifest, gradle or resources needs no sync. Bump
the version, push, update on the TV.

## Play the web games without the TV

```bash
cd web && python -m http.server 8000
```

Then open `http://localhost:8000/` (or run `web/Start Games.bat`). Web Bluetooth needs
a secure context, so `localhost` works and a plain LAN IP does not. For phone use over
the network you need https — enabling **GitHub Pages** on this repo would do it, but
Pages serves the repo root or `/docs`, not `web/`, so it needs a `gh-pages` branch or a
`/docs` copy. Not set up today; the TV app is the primary target.

## What is NOT in this repo

- `logo.png` — the 22 MB full-resolution master. The sizes the app actually uses are
  committed (`app/src/main/res/drawable-nodpi/`, `app/src/main/assets/logo.png`).
- `web/assets/bloom/bg.png` — 1.7 MB and unreferenced; Bloom loads `bg.jpg`.
- `tv-poc/` — the superseded phone-as-relay proof of concept.

All three are still in `E:\Fun\X3 Bar` if you ever want them.
