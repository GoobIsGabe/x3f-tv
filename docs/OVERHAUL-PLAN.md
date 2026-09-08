# X3F — the overhaul plan

Written 2026-09-07 after a full recon: every exercise page and video transcript pulled
from the logged-in member site, nine research references, and ten deep code audits.
Backing documents live in `docs/x3-knowledge/` (what X3 actually is) and `docs/audit/`
(what the code actually does).

This document is the contract. Where it and any older doc disagree, this one wins.

---

## 0. What the recon changed

Three things turned out to be true that the project did not know:

1. **The reported "can't reach the minimums and maximums" bug is a key mismatch, not a
   maths bug.** Calibrate saves against the *global* band (`x3f_band`); the Library and
   Routine launch games against a *per-movement* band (`x3f_libBand[slug]`, defaulting
   to each movement's recommended band). Nothing reconciles them. Calibrate Chest Press
   on White, launch it on Dark Gray, and the app finds no entry, falls back to a
   hardcoded 330, and every rep threshold in the game is derived from that number — so
   no rep is ever counted and the top of the screen is unreachable. Calibrating harder
   cannot fix it. (`docs/audit/calibration.md` D1.)

2. **The set model is missing a tier.** The source describes **three**: full range →
   **mid-range** partials → **weak-range** partials → failure. The app models two.

3. **The app's movement data disagrees with the official program** on which day several
   movements belong to, on tempo, on the band rule, and on the shape of the bent-over
   row's strength curve.

Plus a class of things that were simply never noticed: **every page in the offline-first
TV bundle render-blocks on a Google Fonts request**; the background `#05030F` is darker
than a TV can render; Bloom logs `peak: 0` for every set on the TV; the first D-pad
press in a game lands on "Back".

---

## 1. Principles this rewrite is built on

Taken from the source, not invented here.

| Principle | Where it comes from | What it forces in the app |
|---|---|---|
| One all-out set per movement | *"Don't do more than one set. You will do worse."* | Volume is never the progress axis. **Band is.** |
| 15–40 full reps, then partials to "can't move it an inch" | Core principle #1 | The set has a defined ending, and the ending is the point |
| Three tiers of failure | Intro video | Full / mid / weak, each detected, each celebrated |
| 2–3 s up, 2–3 s down | Core principle #3 | ~4–6 s per rep. **Speed is never rewarded.** |
| Constant tension | Core principle #2 | Slack at the bottom and lockout at the top are detectable form faults |
| ≥40 full reps → heavier; <15 → lighter | Core principle #4 | Band coaching is **two-sided** |
| The strength curve is not linear | *"The curve is not linear in the middle"* | Force → screen mapping is eased, not linear |
| Start position already carries load | *"holding 75 pounds… then it might go to 150"* | Every movement gets a **default floor**, not zero |
| Trembling is stabilisation, and it is good | Intro video | The rig's tremble is praise, not a warning |

And one line that is effectively a design review of the current games:

> *"Sometimes individuals will start to increase the repetition speed so they can break
> a personal record. Don't do that… your objective is exhausting the muscle. It's not
> getting one more repetition."*

Rhythm, Splash and Nova currently reward exactly what that sentence forbids. They get
re-tuned, not deleted — the fun stays, but the thing being scored changes.

---

## 2. Architecture decisions

### AD-1 — A single-document **menu shell**, with games as separate documents

The app is 13 separate HTML documents today. Every navigation is a full document load:
the fonts refetch, the ambient layer restarts, the nav re-installs, the music restarts
from silence, and the screen goes blank in between. Thirteen inline `<style>` blocks are
thirteen copies of the design language, which is exactly why the roadmap notes a visible
seam at the menu boundary.

**Decision:** the menus — home, routine, library, progress, calibrate, onboarding,
settings — become **one document with client-side routing** (`app.html`). The eight
games stay **separate documents**.

Why not one document for everything:
- Each game owns a `rAF` loop, a canvas, and a pile of globals (`force`, `ref()`,
  `baseline`). Merging eight of those into one document is a large refactor with a real
  chance of subtle cross-game breakage, and it deletes the isolation that stops a
  leaking game from taking the home screen down with it.
- The 104 functional assertions and the 12-screen nav audit are written per page. Games
  keep their files, so those suites keep working and remain a regression net for
  everything else.
- Music restarting when you *enter a game* is a moment the mood is supposed to change
  anyway. Music restarting when you go Home → Library is just a bug.

What this buys: continuous music across the menus, one design system, instant
transitions, one nav owner, one ambient layer, one focus model, and a leanback home
that can actually hold rows without a page load per row.

### AD-2 — A resolution-invariant coordinate system

The single most likely cause of "why does everything look wrong" in a TV WebView: the
CSS pixel is not the panel pixel. A 1080p Android TV normally reports
`devicePixelRatio: 2` and a **960 × 540 CSS px** viewport, so a `28px` heading renders
56 physical px — double what a 1920-wide mock intended.

**Decision:** one line fixes it permanently.

```css
:root { font-size: calc(100vw / 120); }   /* 1rem === 16 design px on a 1920 canvas */
```

Every size in the new UI is expressed in `rem`, `vw` or `vh`. Nothing is a raw `px`.
The design is then identical at 960, 1280 or 1920 CSS px, on any panel, at any DPR.
A boot-time probe logs `innerWidth / devicePixelRatio / screen.width` so this can be
confirmed on the actual Hisense rather than assumed.

### AD-3 — Two design modes: **Browse** and **In-set**

These are not the same product.

| | Browse | In-set |
|---|---|---|
| Where you are | On the sofa, 8–12 ft | On the plate, 4–8 ft, often side-on |
| Attention | Full | **Peripheral, for a fraction of a second between reps** |
| Hands | On the remote | **On the bar** |
| Design | Rows, cards, focus, hierarchy | **A scoreboard, not a UI** |

In-set rules, which override everything else:

1. **One number dominates** — the rep count, at **160–220 physical px**, tabular
   numerals, in a fixed-width slot so 9 → 10 never reflows.
2. **No animation during a set.** Motion in peripheral vision reads as an alert and
   pulls the eye off the bar. It also frees the whole frame budget.
3. **State by luminance and position first, hue third** — readable at an angle, in a
   bright room, by a colour-blind user.
4. **Audio carries the set; the screen confirms it.** This inverts the usual
   relationship, because the user is not looking at the screen.
5. **Never require a press during a set.** Infer the end, let them correct it at the
   summary when their hands are free.
6. **Back during a set is pause, not exit.**

### AD-4 — Band identity is never a colour swatch

The band names are White / Light Gray / Dark Gray / Black / Elite Black. That is a
purely *luminance*-based palette sitting in exactly the near-white and near-black
regions a TV renders worst, and it is invisible to a portion of viewers. Band identity
is always **the name in text at ≥32 design px**, plus a distinct **shape/emblem**, plus
optionally a non-literal accent colour. Never the swatch alone.

### AD-5 — Offline is a hard requirement, so nothing loads from the network

Fonts get subset and bundled as woff2. `setBlockNetworkLoads(true)` then makes it
impossible to regress. This also closes the "any page in the WebView can reach the
internet while holding a Java bridge" hole.

### AD-6 — Firebase: **Realtime Database**, anonymous auth, QR-carried pairing, Spark only

The deciding fact: with no Firebase SDK on the TV (zero third-party deps, <5 MB APK),
**Firestore's realtime `Listen` is gRPC/WebChannel only and cannot be reached over
REST** — it could only ever be polled. RTDB's REST API speaks Server-Sent Events, so a
live push channel is ~120 lines of `HttpsURLConnection`. Every secondary consideration
(JSON wire format, byte-based billing, one small tree) points the same way.

Pairing without Cloud Functions (Blaze-only): the TV generates a code with
`SecureRandom`, shows it as a **QR code** (phone types nothing) with a 6-character
fallback; the phone *claims* it; an existing member *confirms* it on the TV. The
claim/confirm split is forced by the absence of a server — and it is better UX anyway,
because a human on the couch approves the join.

Full detail, security rules and the console click-path: `docs/x3-knowledge/firebase-plan.md`.

### AD-7 — The routine engine is a **list of timed steps**, not a list of movements

The 12-Week program is "a day is N movements, one set each". The Hypertrophy program is
"a tracked PR set, then four untracked supersets, with 20 s / 2 min rests". A routine
engine built on the first shape cannot express the second.

**Decision:** a day is `[{kind: 'set'|'rest'|'coach', movement, tracked, seconds}]`.
This costs almost nothing now and means the Hypertrophy program is content, not a
rewrite. The set reporter gains a `tracked: false` mode so volume sets never pollute PBs.

---

## 3. The force model — the heart of the fix

### 3.1 One band-resolution function, used by everything

The bug class that produced D1 is "several places each decide which band you are on".
That ends. A new `x3f-band.js` owns the question, and **every** page asks it:

```js
X3FBand.forMovement(slug)   // the band this movement is actually trained on
X3FBand.set(slug, band)     // change it, in one place, with one event
X3FBand.current()           // the global fallback, for pages with no movement
```

Resolution order, once, everywhere: explicit `?band=` (this run only) → per-movement
choice → per-movement recommendation → global. Calibrate uses the *same* function, so
it is structurally impossible to calibrate one band and train another.

### 3.2 Per-movement default floors

`lo: 0` is wrong for every movement and catastrophically wrong for the overhead press,
whose start position carries **half** its peak force (75 lb → 150 lb, stated by the
source). Uncalibrated movements now start from a defensible estimate rather than zero:

| Movement | default `lo` (fraction of `hi`) |
|---|---|
| Overhead press | 0.50 |
| Tricep press | 0.35 |
| Upright row | 0.30 |
| Chest press | 0.25 |
| Bicep curl / calf raise / pec crossover | 0.20 |
| Bent-over row / front squat / split squat | 0.15 |
| Deadlift | 0.10 |

Flagged `auto: true`, replaced the moment a real calibration lands, never overwriting one.

### 3.3 A non-linear force → screen mapping

> *"you can see I'm holding very high forces at the top. In the middle… sort of a medium
> force. Lower than the high force, but not really half of what would be expected
> because there's actually a rather aggressive curve."*

Linear mapping squashes the strong range — where the entire program lives — into a thin
band at the top of the screen, and makes the middle look weaker than it feels. The new
mapping is eased:

```js
frac = clamp01((force - lo) / (hi - lo)) ** 0.65
```

For the **bent-over row** the curve is inverted: its strongest position is the *middle*,
so its mapping peaks mid-range. This is per-movement data, not a global constant.

### 3.4 The three-tier set engine

```
FULL RANGE     rep peak ≥ 0.85 of the session's established top
MID RANGE      0.45 – 0.85          ← the bent row lives here, and produces 10–15
WEAK RANGE     < 0.45
FAILURE        the bar will not move
```

Each tier gets its own counter, its own coaching line, and its own celebration. Total
reps stops being the headline; **what you did after full-range failure** becomes it —
which is what the source says counts most.

Also newly detectable, and all of it real coaching rather than decoration:

- **Slack at the bottom** — force falls below `lo`. "Don't let it go slack."
- **Lockout at the top** — force spikes then collapses at peak. "Don't lock out."
- **Tempo** — rep duration vs the 4–6 s target. "Slower. Two up, two down."
- **Tremble** — high-frequency wobble near peak. **Praise it.** It is stabilisation.

### 3.5 Calibration you can actually complete on a sofa

Your note: *"when I click on calibrate give there a slight delay, since I can't just
press select on the TV remote and instantly exert all the force possible."*

Correct, and the current numbers are worse than they look: **3 s** from pressing OK to
being expected to hold a loaded start position, and **2.5 s** from there to all-out. You
have to put the remote down and pick the bar up inside three seconds.

The new flow:

```
  PRESS OK
    ↓  "Put the remote down. Get set."     ← 10 s, adjustable, skippable by pressing OK
  GET SET                                     (with an audible tick, because you are not looking)
    ↓  "Hold your start position."         ← 4 s hold, averaged
  HOLD                                        figure pinned to the start pose
    ↓  "Three… two… one…"                  ← 3 s, audible
  GO
    ↓  all out                             ← 6 s window, extends while force is still rising
  MAX
    ↓
  RESULT — with a retry that does not lose the hold
```

Every phase is audible, because during calibration the user is holding a bar and not
looking at the screen. Nothing is written until the whole capture succeeds — the current
code raises the global band ceiling **even when it refuses the capture**, which
permanently mis-scales all ten other movements on that band with no UI to undo it.

Calibration also records **when**, so the app can say "White band, last calibrated six
weeks ago" (roadmap item 1).

---

## 4. Work plan

### Phase 1 — Correctness (the roadmap's own "get this right first")

| # | Item | Fixes |
|---|---|---|
| 1.1 | `x3f-band.js` — one band-resolution owner | **D1**, the reported bug |
| 1.2 | `x3f-cal.js` rewrite — defaults, validation, timestamps, no write-on-failure | D2, D9, D11, D16 |
| 1.3 | `X3F_Calibrate.html` rewrite — get-set delay, audio, retry, per-band overview | your request; D8, D12, D13 |
| 1.4 | `x3f-exercises.js` rewrite — reconciled with the official source | day assignments, tempo, curves, setup |
| 1.5 | `x3f-set.js` — three-tier model, form faults, `tracked:false` | the missing tier |
| 1.6 | Shell: peak on TV, WebView settings, bundled fonts, first-focus bug | D5, D36, D41, §4.1 |

### Phase 2 — The interface

| # | Item |
|---|---|
| 2.1 | `x3f-ui.css` — the design system, resolution-invariant |
| 2.2 | `app.html` — the single menu shell with client-side routing |
| 2.3 | The leanback home: hero (today's workout, pre-focused on START) + rows |
| 2.4 | Onboarding — first run, per-band calibration, height, band picking |
| 2.5 | The in-set scoreboard HUD, applied across all eight games |
| 2.6 | Generated art: game cards, movement plates, band emblems, medallions, backdrops |

### Phase 3 — Track

| # | Item |
|---|---|
| 3.1 | `x3f-sync.js` — RTDB over REST, offline queue, last-write-wins per set |
| 3.2 | Java REST client — anonymous auth, SSE listen, no SDK |
| 3.3 | Pairing: QR + 6-char fallback, claim/confirm |
| 3.4 | Security rules |
| 3.5 | The phone dashboard on `gh-pages` |
| 3.6 | The console checklist for you, plus the exact Blaze triggers |

### Phase 4 — Polish, Expand & Delight

| # | Item |
|---|---|
| 4.1 | Re-tune every game against the method: never reward speed |
| 4.2 | Post-workout summary; weekly review card |
| 4.3 | Household profiles |
| 4.4 | Achievements/medallion art pass |
| 4.5 | Progressive-overload targets and the two-sided band coach |
| 4.6 | The form demonstrator: quality pass, default movement without `?ex=` |

---

## 5. Invariants — things this refactor must not break

Collected from the audits. Each has caused a shipped bug at least once.

1. **Anything conditioning the raw signal must exist in BOTH `onSample()` and the
   injected `BOOTSTRAP`**, or it silently does not exist on the TV. Two shipped bugs so
   far (v0.9 Arena `vis()`, v1.6 the per-movement floor). *The rewrite removes the
   duplication entirely by making the shell call one shared conditioning function.*
2. Native → JS global names and signatures (`window.__x3fForce`, `__x3fNav`, …).
3. The `X3F` bridge name and its five methods.
4. `setOverlay` must stay synchronous relative to the key event.
5. One shared `file://` localStorage origin for every bundled page.
6. No page may ever `fetch()` a sibling file — shared scripts load with `<script src>`.
7. Two nav owners, arbitrated by `if(!window.__x3fNav)`.
8. Same-row/column overlap dominates the spatial-nav score.
9. Ancestor-walking visibility, not element-only.
10. The BOOTSTRAP stays regex-extractable from `MainActivity.java` (the audit reads the
    live one on purpose — a copy drifts and then the test checks fiction).
11. Stable APK signature; `version.txt` is the `versionCode`.
12. Battery is optional and must never block the force path.
13. Landscape, fullscreen, screen-on.

---

## 6. Verification

Nothing ships without these staying green, and each phase adds to them:

- `python tools/func-test/run.py` — **104 passing** at baseline
- `python tools/nav-audit/run.py` — **12 screens, all clean** at baseline
- `python tools/sync-from-web.py --check` — **no drift** at baseline
- `tools/func-test/engine.html` — engine tests

New suites this work adds:

- **Force-model tests** — the three-tier classifier, the eased mapping, the per-movement
  curves, the form-fault detectors, against synthetic force traces including a real
  52→78 White-band overhead press.
- **Band-resolution tests** — the D1 scenario as a regression: calibrate on one band,
  launch from the Library, assert the game sees the calibration.
- **A `calibratetv` scenario** — Calibrate with the *live* BOOTSTRAP extracted from
  `MainActivity.java`, the way `bloomtv` already works.

Every fix that has a failure scenario in an audit gets a test that **fails before the
fix and passes after** — mutation-verified, the way v1.6's `bloomtv` was.
