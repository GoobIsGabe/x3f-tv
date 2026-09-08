# Android TV / 10-Foot UI — Design & Performance Reference

**Subject:** How to design and build a fitness app that runs in a WebView on an Android TV / Google TV device, is read from a couch or a workout mat across a room, and is driven entirely by a 5-button D-pad remote.

**Compiled:** 2026-09-07 from primary platform documentation (Google, Apple, Amazon, W3C, EBU) plus named secondary sources.

**Status:** Engineering + design reference. Every number below is either quoted from a source, or arithmetic I performed on sourced inputs (marked `[DERIVED]`).

---

## 0. How to read this document

| Marker | Meaning |
|---|---|
| **[SPEC]** | Stated in a platform vendor's or standards body's own published documentation. Authoritative. |
| **[MEASURED]** | A specific measurement published by a named engineering source. |
| **[DERIVED]** | Arithmetic I performed on sourced inputs. The inputs are cited; the arithmetic is mine. Check it. |
| **[CONVENTION]** | Established practice across shipped TV UIs, not written down as a rule by a vendor. |
| **[UNVERIFIED]** | I believe this is true but could not confirm it from a primary source in this pass. Do not ship it as fact without checking. |
| **[CONFLICT]** | Sources disagree. Both figures given. |

Two structural warnings before anything else:

1. **Almost every published TV number is in `dp` or `sp`, not CSS pixels.** If you copy Google's numbers straight into CSS you will be wrong by a factor of 2 on a 1080p TV. Section 2 exists entirely to fix this. Read it before Section 4.
2. **Google's own TV docs quote two different safe-area figures** (48dp minimum vs 58dp for the content grid). Both are correct; they mean different things. Section 3 reconciles them.

---

## 1. The physical situation

### 1.1 Viewing distance

- Google: TV design assumes an **average viewing distance of 3 metres (10 feet)**. This is the origin of the term "10-foot UI." **[SPEC]** — Android TV design foundations.
- Amazon Fire TV assumes **10+ feet**. **[SPEC]**
- Smashing Magazine frames it as "roughly three or more metres." **[SPEC-adjacent, secondary]**

**For a fitness app, assume a distribution, not a point.** A user doing an X3 set is standing on a ground plate somewhere between the TV and the sofa. Realistic range is **6–12 ft (1.8–3.7 m)**. Design for the far end (12 ft) and you are safe everywhere; design for 6 ft and the app is unreadable from the sofa when the user is planning a workout. `[DERIVED]` from the use case, not from a source.

### 1.2 The input device

The Android TV remote vocabulary is **five buttons for navigation** plus two system buttons: **[SPEC]** — Android TV navigation docs.

| Button | Function |
|---|---|
| D-pad up / down / left / right | Move focus to the nearest focusable element in that direction |
| Select (centre) | Activate the focused element. Press-and-hold may reveal more options |
| Back | Return to the previous destination |
| Home | System launcher (you do not control this) |
| Microphone | Google Assistant (you do not control this) |

Smashing Magazine's framing is the one to internalise: this six-button pattern (four directions + OK + Back) has been essentially unchanged **since the NES controller in 1985**, and cannot be reduced further without breaking usability. **[SPEC-adjacent, secondary]**

**Every directional press costs one action.** There is no cursor, no passive hover, no "point at the thing you want." Reaching the 5th item in a row costs 4 presses. Smashing quantifies the text-entry consequence: typing "hey there" is **9 keystrokes on a phone keyboard and roughly 38 D-pad presses on a TV on-screen keyboard**. **[MEASURED, secondary]**

**Design consequence:** treat every focusable element as having a cost. A screen with 40 focusable things is not a rich screen, it is a maze. And **never require free text entry** unless there is no alternative — for a fitness app, that means no typed workout names, no typed weights, no search-by-typing as the only path.

### 1.3 Screen sizes and the pixel grid

Android TV maps every supported resolution onto **the same 960 × 540 dp design canvas**: **[SPEC]** — Android TV layouts docs.

| Panel resolution | Android density bucket | Scale factor | dp canvas |
|---|---|---|---|
| 1280 × 720 | `tvdpi` | 1.33× | 960 × 540 dp |
| 1920 × 1080 | `xhdpi` | **2.0×** | 960 × 540 dp |
| 3840 × 2160 (4K) | `xxxhdpi` | 4.0× | 960 × 540 dp |

Google recommends designing at **960 × 540 px MDPI (1 px = 1 dp)** and producing assets at **1080p**, which can be downscaled to 720p if needed. **[SPEC]**

Amazon Fire TV states the same thing differently: design at **1920 × 1080 px at 320 dpi (xhdpi)**, which yields a **960 × 540 dp** layout. **[SPEC]**

Both platforms agree. **The dp canvas is 960 × 540. Always. Regardless of panel resolution.**

---

## 2. The coordinate-system trap (critical for a WebView app)

This is the single most likely source of a "why does everything look wrong" bug in a TV web app, so it gets its own section.

### 2.1 Three different pixel units are in play

| Unit | What it is | On a 1080p Android TV |
|---|---|---|
| **Physical px** | Actual panel pixels | 1920 × 1080 |
| **dp / sp** | Android's density-independent unit | 960 × 540 dp; **1 dp = 2 physical px** `[DERIVED]` from the xhdpi 2.0× factor **[SPEC]** |
| **CSS px** | What your stylesheet says | **Depends entirely on your viewport meta tag and WebView settings** |

By default an Android WebView adopts the system density, so `window.devicePixelRatio` reports **2.0** on a 1080p TV and the CSS layout viewport is **960 × 540 CSS px**. `[UNVERIFIED — strongly expected from the density model, but you must measure it on your target device.]`

**Consequence if that default holds:** a CSS declaration of `font-size: 28px` renders **56 physical pixels tall** — roughly double what a designer working from a 1920-wide mock intended. Conversely, if the app forces `width=device-width` with a fixed `initial-scale` and gets a 1920 CSS px viewport, `28px` renders as `28` physical px, which is **below the legibility floor** (Section 4).

### 2.2 The fix: make the design resolution-invariant

Do not hard-code CSS pixel sizes. Anchor everything to the viewport so the design is identical whether the WebView reports 960 or 1920 CSS px.

```css
/* Design canvas: 1920 x 1080 "design px".
   1 design px = 100vw / 1920. 1rem = 16 design px. */
:root { font-size: calc(100vw / 120); }   /* 1rem === 16 design px */
```

Then express **every** size in `rem` or `vw`/`vh`. A `2rem` heading is 32 design px on every panel, at every devicePixelRatio, at every WebView viewport width.

**Verify on device before writing a line of layout CSS.** Log these four values on first paint and put them somewhere you can read from the couch:

```js
console.log({
  innerWidth: window.innerWidth,        // CSS px viewport width
  dpr: window.devicePixelRatio,         // density factor
  screenW: window.screen.width,         // reported screen width
  physical: window.innerWidth * window.devicePixelRatio  // should be 1920
});
```

Everything in Sections 3–5 below is quoted in **physical pixels at 1080p** with the dp/sp original alongside, so you can convert once and be done.

---

## 3. Overscan and the safe area

### 3.1 Why it still matters

Overscan is a CRT-era artefact: TVs cropped the outer edge of the picture because the raster position wasn't reliable. Modern digital displays do **1:1 pixel mapping** over HDMI and don't need it — but Wikipedia's overscan article notes that **many LCD TVs still ship with overscan enabled by default** and it must be turned off manually in the TV's menu. **[SPEC-adjacent]**

So: overscan is theoretically dead, practically alive on a meaningful fraction of installed panels. Budget for it.

### 3.2 The numbers

| Source | Safe-area rule | At 1920 × 1080 physical px |
|---|---|---|
| **Android TV** — minimum overscan-safe margin **[SPEC]** | **5% per edge**: 48 dp left/right, 27 dp top/bottom (of the 960 × 540 dp canvas) | **96 px** left/right, **54 px** top/bottom `[DERIVED, ×2]` |
| **Android TV** — content grid margin **[SPEC]** | **58 dp** sides, **28 dp** top/bottom | **116 px** sides, **56 px** top/bottom `[DERIVED, ×2]` |
| **Amazon Fire TV** **[SPEC]** | "Avoid placing any UI elements within the outer 5% of any edge" → inner 90% is safe | 96 px / 54 px |
| **Apple tvOS** **[SPEC-adjacent, multiple secondary sources]** | 60 pt top/bottom, 80 pt sides on a 1920 × 1080 pt canvas | 60 px / 80 px → **5.56% vertical, 4.17% horizontal** `[DERIVED]` |
| **BBC broadcast title-safe, 16:9** **[SPEC]** | 5.0% vertical, 10.0% horizontal | 54 px / 192 px |
| **BBC broadcast action-safe, 16:9** **[SPEC]** | 3.5% vertical and horizontal | 38 px / 67 px |
| **Xbox** **[SPEC-adjacent]** | Use 85% of screen width and height → 7.5% per side | 144 px / 81 px |

**[CONFLICT]** Google's older TV style guide says "minimum of 27 px from top and bottom and 48 px from left and right" on a 1920 × 1080 screen, and separately says to build a **10% margin** into designs. The 27/48 figures are the **dp** values; quoting them as px on a 1080p screen is a documentation error (27/1080 = 2.5%, not the stated 5%). **Trust the 5%-per-edge rule, i.e. 96 px / 54 px physical at 1080p.**

### 3.3 Reconciling 48 dp and 58 dp

Google's TV layout spec also publishes a grid: **12 columns × 52 dp with 20 dp gutters.**

`[DERIVED]` 12 × 52 + 11 × 20 = 624 + 220 = **844 dp content width**. Centred in the 960 dp canvas leaves (960 − 844) / 2 = **58 dp per side**. That is exactly the "58 dp" figure, and it cross-checks Google's published card widths:

| Cards across | Columns each | Width (dp) | Width @1080p (px) `[DERIVED ×2]` |
|---|---|---|---|
| 1 | 12 | 844 | 1688 |
| 2 | 6 | 412 | 824 |
| 3 | 4 | 268 | 536 |
| 4 | 3 | 196 | 392 |
| "5" | 2 | 124 | 248 |
| Gutter | — | 20 | 40 |

(6 × 124 + 5 × 20 = 844, so the 124 dp card actually tiles **six** across; Google labels it "5 card." `[DERIVED]` — treat 124 dp as "the 2-column card," not "one fifth of the row.")

### 3.4 Practical rule for the X3 app

```css
:root {
  --safe-x: 6.04vw;   /* 116 design px of 1920 — Google's content-grid margin */
  --safe-y: 5.19vh;   /* 56 design px of 1080 */
  --safe-x-min: 5vw;  /* 96 design px — absolute overscan floor */
  --safe-y-min: 5vh;  /* 54 design px */
}
```

- **Nothing legible or focusable outside the 5% band.** Google's TV app-quality requirement **TV-OV** is explicit: no text or functionality may be partially cut off at screen edges. **[SPEC]**
- **Backgrounds, gradients and scrims should bleed to 100%** of the screen — they are designed to be safely cropped.
- **The last card in a horizontal row should deliberately extend past the safe zone** so its clipped edge signals "there is more to the right." **[CONVENTION]**, noted by Smashing.
- **Add focus-scale headroom.** A card that scales 1.1× on focus grows by 5% of its width on each side. A card flush against the safe-area edge will scale *into* the overscan band. Reserve the extra. `[DERIVED]` from the 1.1× focus scale in Section 5.

---

## 4. Typography and legibility at distance

### 4.1 The physics: arc minutes, not pixels

Legibility at distance is governed by **visual angle** — how much of your retina the letter covers — not by pixel count. The relevant thresholds:

- **ISO 9241-303:2011** recommends a **cap height of 20–22 arc minutes** for electronically displayed text, with an **absolute minimum of 16 arc minutes**. **[SPEC]**
- Videowall practice puts **10 arc minutes** as the bare "can be resolved at all" floor. **[SPEC-adjacent]**

Formula: `required cap height = 2 × viewing_distance × tan(θ / 2)`

`[DERIVED]` at **10 ft (120 in)**:

| Threshold | Required cap height |
|---|---|
| 10 arc-min (bare legibility) | 0.349 in |
| **16 arc-min (ISO minimum)** | **0.559 in** |
| 20 arc-min (ISO comfortable) | 0.698 in |
| 22 arc-min (ISO comfortable, upper) | 0.768 in |

### 4.2 Converting to pixels on real TVs

`[DERIVED]` For a 16:9 panel, `panel height = diagonal × 0.4903`. At 1080p, `inches per pixel = panel_height / 1080`. Cap height for Roboto is **0.711 × font-size** (1456/2048 units per em), so `font-size = cap_height / 0.711`.

**Minimum body font size in physical pixels, 1080p panel, viewer at 10 ft:**

| Panel | in/px | 10 arc-min (floor) | **16 arc-min (ISO min)** | 20 arc-min (comfortable) |
|---|---|---|---|---|
| 43" | 0.01952 | 25 px | **40 px** | 50 px |
| 50" | 0.02270 | 22 px | **35 px** | 43 px |
| 55" | 0.02497 | 20 px | **31 px** | 39 px |
| 65" | 0.02951 | 17 px | **27 px** | 33 px |
| 75" | 0.03405 | 14 px | **23 px** | 29 px |

Two things fall out of this table:

1. **Smaller TVs are harder, not easier.** A 43" panel at 10 ft needs *larger* pixel text than a 75" panel, because each pixel subtends less angle. If you only test on a big TV you will ship something unreadable on a bedroom set.
2. **The ISO minimum across the common 43–65" range lands at roughly 27–40 physical px at 1080p.** Call it **32 px as a design floor for body text**, and 40 px if you want the small-panel case covered.

At **8 ft** the same 16 arc-min threshold on a 55" panel drops to **25 px** `[DERIVED]`, and at **12 ft** it rises to **38 px** `[DERIVED]`. The 32 px floor sits sensibly in the middle.

### 4.3 What the platforms actually say — and the convergence

| Source | Minimum | Default / body |
|---|---|---|
| Google Android TV style guide **[SPEC]** | **12 sp** = **24 physical px** @1080p `[DERIVED ×2]` | **18 sp** = **36 physical px** |
| Amazon Fire TV **[SPEC]** | **14 sp** body minimum; the doc itself gives "~28 px at 1080p" | — |
| Smashing Magazine **[secondary]** | **24 px** baseline "starting point" for TV (vs 16–18 px on web) | — |
| Spyro-Soft **[secondary]** | **22 px** minimum body | — |
| alicia.design **[secondary]** | **28 px minimum, "as a minimum rather than a target"** | Body **28–36 px**; menus **32–44 px**; titles **48–80 px**; captions **55–75 px** — all at 1080p |

**This is a genuine convergence and it is the strongest result in this document.** Three independent routes — the ISO arc-minute physics, Google's 12 sp × 2 density factor, and Amazon's explicit "~28 px at 1080p" — all land in the **24–36 physical px** band for the smallest text you are permitted to draw, with **32–36 px** as the sane body size and **28 px as an absolute floor**.

### 4.4 The type scale

Android TV's Material 3 type scale (`androidx.tv.material3`) is **numerically identical to the mobile M3 scale** — verified against `TypeScaleTokens.kt` in the AndroidX source. **[SPEC]** The TV-ness comes entirely from the 2× density factor, not from different tokens.

| Token | Size (sp) | Line height (sp) | Tracking (sp) | Weight | **Physical px @1080p** `[DERIVED ×2]` |
|---|---|---|---|---|---|
| displayLarge | 57 | 64 | −0.2 | Regular | **114 / 128** |
| displayMedium | 45 | 52 | 0.0 | Regular | **90 / 104** |
| displaySmall | 36 | 44 | 0.0 | Regular | **72 / 88** |
| headlineLarge | 32 | 40 | 0.0 | Regular | **64 / 80** |
| headlineMedium | 28 | 36 | 0.0 | Regular | **56 / 72** |
| headlineSmall | 24 | 32 | 0.0 | Regular | **48 / 64** |
| titleLarge | 22 | 28 | 0.0 | Regular | **44 / 56** |
| titleMedium | 16 | 24 | 0.2 | Medium | **32 / 48** |
| titleSmall | 14 | 20 | 0.1 | Medium | **28 / 40** |
| bodyLarge | 16 | 24 | 0.5 | Regular | **32 / 48** |
| bodyMedium | 14 | 20 | 0.2 | Regular | **28 / 40** |
| bodySmall | 12 | 16 | 0.2 | Regular | **24 / 32** |
| labelLarge | 14 | 20 | 0.1 | Medium | **28 / 40** |
| labelMedium | 12 | 16 | 0.5 | Medium | **24 / 32** |
| labelSmall | 11 | 16 | 0.5 | Medium | **22 / 32** |

**Read this table as a warning as much as a spec.** `bodySmall`, `labelMedium` and `labelSmall` land at 22–24 physical px — **below the 28 px floor from §4.3**. On TV, the bottom three rungs of the Material scale are effectively unusable for anything the user must read. Do not use them.

**Recommended X3 scale** (physical px at 1080p, expressed as rem against the `calc(100vw / 120)` root from §2.2):

| Role | Physical px | rem | Weight | Notes |
|---|---|---|---|---|
| Rep counter / set timer | **160–220** | 10–13.75 | 600–700 | See §13 |
| Screen title | **72** | 4.5 | 600 | |
| Row header | **44** | 2.75 | 600 | |
| Card title | **32** | 2.0 | 500 | |
| Body / description | **32** | 2.0 | 400 | |
| Card subtitle / meta | **28** | 1.75 | 400 | Absolute floor |
| — | *below 28* | — | — | **Do not use** |

Google recommends limiting the scale to what you actually need; Smashing suggests **5–6 sizes total**. **[secondary]** The table above is 6.

### 4.5 Weight, letterform and letter-spacing

- **Never use thin or light weights.** Google is explicit: avoid decorative and thin fonts because "thinner lines are not instantly recognisable," and the older style guide warns thin faces "appear jagged on TV." **[SPEC]** Physical cause: TV panels apply sharpening and edge-enhancement processing, and legacy TV GPUs anti-alias inconsistently, so hairline strokes either disappear or shimmer. `[SPEC-adjacent — alicia.design attributes white-text blooming to inconsistent anti-aliasing on legacy TV GPUs.]`
- **Floor at weight 400 for body, 500–600 for anything important.** `[DERIVED]` from the above.
- **Prefer sans-serif with large counters and open apertures.** Google names "large counters and apt optical sizing" as the selection criteria and calls for sans-serif for body text and labels. **[SPEC]** Roboto is the system TV face; Inter, Roboto Flex and SF Pro all qualify.
- **Letter-spacing:** Spyro-Soft recommends spacing "slightly wider than standard." **[secondary]** The M3 tracking values above are a sane baseline; add **+0.01em to +0.02em** on all-caps labels and on anything below 36 px. `[CONVENTION]`
- **Line spacing:** Amazon says line spacing should be **greater than desktop/tablet standards** without giving a number **[SPEC]**; Spyro-Soft says **+20–30% over defaults** **[secondary]**. The M3 line heights above sit at roughly **1.3–1.5×** the font size, which already satisfies this. Use **1.4× minimum for body**, 1.15–1.2× for display sizes.
- **Numerals: use tabular/lining figures** (`font-variant-numeric: tabular-nums`) on every counter, timer and weight readout, so digits don't jitter as they change. `[CONVENTION]` — this matters enormously for a rep counter.

### 4.6 Line length

- Practical Typography: **45–90 characters per line**, because as line length grows the eye has to travel further to find the next line start. **[SPEC-adjacent, authoritative typography source]**
- On TV, tighten this. The reading is glanced, not sustained; the user is at 10 ft; and there is no scroll-with-thumb to recover a lost place.
- **Target 45–60 characters per line, hard-cap at 70.** `[DERIVED]` At 32 px body text on a 1920-wide canvas, 60 characters ≈ 60 × 0.5em × 32 px = **960 px** — exactly half the screen. So: **body text columns should not exceed ~50% of screen width.**
- Google's blunter rule: "Use text in TV apps sparingly" and "limit text and reading content on TV screens." **[SPEC]** The best answer to a line-length problem on TV is usually less text.

---

## 5. Focus and D-pad conventions

### 5.1 Focus is the cursor

There is no pointer. Smashing puts it precisely: focus is the **anchor point** that replaces the mouse cursor or the touch point. **[secondary]** Google's foundations doc says TV navigation requires "instant feedback when buttons are pressed" and "distinct visual feedback for user actions." **[SPEC]**

**Hard requirements** from Google's TV navigation docs **[SPEC]**:

1. **Something must always have focus.** "App must always have an element in focus when started or idle." A screen with nothing focused is a dead remote.
2. **The D-pad must be able to reach every visible control.** Google's app-quality requirement **TV-DP** makes this a certification criterion: all functionality must be navigable with the five-way D-pad. **[SPEC]**
3. **Provide padding inside focusable controls** so the focus highlight is clearly visible and doesn't collide with neighbours.
4. **Switching between controls must be predictable.** Only override the default spatial order (`nextFocusUp/Down/Left/Right`, or `tabindex`/roving-tabindex in web terms) when the geometric default genuinely fails.
5. **Consider looping** — the last control in a group directing focus back to the first.

### 5.2 How focus should look

Google's TV focus-system doc enumerates six indication methods. **[SPEC]**

| Method | Spec | Cost on a low-end TV |
|---|---|---|
| **Scale** | Default multipliers **1.025×, 1.05×, 1.1×**; larger elements use smaller multipliers | **Cheap** — `transform: scale()` is compositor-only |
| **Glow** | Diffused glow/shadow, **2 dp – 32 dp** glow level, coloured from the image or brand | **Expensive** — blur convolution, see §9 |
| **Outline** | Outline outside the element, with a defined width and inset | **Cheap** if using `outline`/`box-shadow` with **zero blur** |
| **Colour** | Change background colour and/or content colour | **Cheap** |
| **Tonal elevation** | Surface colour shifts through elevation levels **+1 to +5**, tinted with the primary colour | **Cheap** |
| **Disabled** | Reduced background colour and opacity | **Cheap** |

Google's TV **button** spec confirms the scale figure concretely: the button container **scales 1.1× on focus while maintaining internal padding**. **[SPEC]** The **immersive list** spec says the focused card **scales 1.1×**. **[SPEC]**

Apple's tvOS practice matches: **1.05×–1.1× scaling**, plus elevation/shadow, brightness, or border highlight. **[SPEC-adjacent, secondary]**

Amazon Fire TV requires clear visual distinction of the focused element, and additionally that the focused element **momentarily changes to the selected/pressed state** when Select is pressed. **[SPEC]**

### 5.3 The states you must implement

Google's TV focus system defines **three primary states plus three modifiers**: **[SPEC]**

- **Default** — unfocused, inactive
- **Focused** — has focus
- **Pressed** — from Select-down until release
- plus **Enabled**, **Disabled** (lower prominence, not clickable), **Selected** (a *persistent* state, independent of focus)

The **Selected ≠ Focused** distinction matters for a fitness app. "This is the exercise I'm currently doing" is Selected. "This is the exercise the D-pad is pointing at" is Focused. Both can be visible at once, on different elements. They need visually different treatments.

### 5.4 Accessibility floor for the focus ring

WCAG 2.2 SC **2.4.13 Focus Appearance** **[SPEC]**:

- The focus indicator area must be **at least as large as the area of a 2 CSS px thick perimeter** of the unfocused component. For a 90 × 30 px button that is **480 px²** of indicator.
- The indicator must have a **contrast ratio of at least 3:1 between the same pixels in the focused and unfocused states**.

WCAG 2.2 SC **1.4.11 Non-text Contrast** **[SPEC]**: focus indicators must also meet **3:1 against the adjacent background** when focused. Note the spec's own warning: **do not round** — 2.999:1 fails.

**On TV, treat 2 px as a joke and scale it.** `[DERIVED]` A 2-physical-px ring on a 55" 1080p panel viewed at 10 ft subtends about **1.4 arc minutes** — far below the 10 arc-min resolution floor from §4.1, i.e. it is at the edge of being resolvable at all, let alone noticeable in peripheral vision. To reach **10 arc minutes** you need a **14 physical px** ring on a 55" panel, or **18 px** on a 43".

**Rule: focus outline ≥ 6 physical px, and preferably 8–12 px, at 1080p.** Combine it with scale and a background/colour change so focus is never carried by a single visual channel.

### 5.5 Back

Google's rules, all **[SPEC]**:

- Back **returns to the previous destination**. Repeated Back presses must eventually reach the Google TV home screen (app-quality requirement **TV-DB**).
- **Never gate exit with a confirmation dialog.** "Are you sure you want to quit?" is a certification failure.
- **Never create an infinite loop** between opening and closing a menu.
- **Never draw an on-screen virtual back button.** The remote has one.
- The **fixed start destination** rule: the first screen shown on launch is the last screen shown before the app exits. Splash screens are excluded from the back stack.
- Deep links must simulate the manual navigation path, so Back walks back through the hierarchy to the start destination.
- A **Cancel** button is acceptable, and expected, on confirming/destructive/purchase actions — that's different from gating exit.

**In-workout consequence:** Back during an active set is dangerous. The safest pattern is: Back during a set **pauses** and shows the pause overlay (which itself has an explicit Cancel/Resume and an explicit End Workout); Back from the pause overlay **resumes**; Back from the workout summary goes to the library. This satisfies "no confirmation gating exit" (you can still walk out with repeated Backs) while not throwing away a set on a stray press. `[DERIVED]`

### 5.6 Focus memory and regions

Smashing describes the pattern that makes TV navigation feel native: **regions with memory**. A sidebar, a poster row, or a grid each keeps focus inside itself first, and when you return to that region you **land on the item you left**, not on its first item. **[secondary]**

Google's own guidance is the axis rule: **vertical axis traverses categories, horizontal axis browses items within a category.** **[SPEC]**

`[DERIVED]` Implementation shape for a web app:

- Each row/region is a roving-tabindex group with a stored `lastFocusedIndex`.
- Vertical D-pad moves between regions and restores each region's remembered index.
- Horizontal D-pad moves within the region and updates the remembered index.
- **Store and restore focus across route changes too.** Coming back from a detail screen must return focus to the card you launched it from, or the user is lost.

### 5.7 Things that break D-pad navigation in a web app

`[DERIVED]` from the constraints above — this is the list to check in review:

- Overlapping or z-index-stacked clickables (Google explicitly says don't overlap clickable elements).
- Elements that are visually present but `display:none`/`visibility:hidden` while still in the tab order, or vice versa.
- Focus traps in modals with no Back handler.
- Native browser focus rings suppressed by `outline: none` with nothing put back.
- Scroll containers where focus moves but the container doesn't scroll the focused item into view. Always `scrollIntoView({block:'nearest', inline:'nearest'})` — but see §9, prefer `transform` translation of the row over native scroll on a low-end TV.
- Anything requiring hover to reveal. There is no hover.
- Anything requiring a long-press you haven't taught. Press-and-hold on Select is a legitimate Android TV affordance **[SPEC]** but must never be the only path to a function.

---

## 6. Browse patterns: rows, cards, heroes

### 6.1 Why horizontal rows

The honest answer, from the sources:

- **Geometry.** The TV canvas is wide and short. Long horizontal rows maximise the amount of content visible on a 16:9 landscape screen. This is the observed reason the "shelf" pattern dominates streaming UIs. **[secondary — Molly Lafferty / This Also, and Smashing]**
- **The axis rule.** Google prescribes vertical = categories, horizontal = items, precisely because it "enables fast navigation through large hierarchies" and "minimises hierarchy depth." **[SPEC]**
- **Cost.** `[DERIVED]` In a pure N×M grid, reaching an arbitrary item costs up to (N−1) + (M−1) presses, and the user has to build a 2D mental model. In rows-of-categories, the vertical axis is a short, semantically labelled list (typically 4–8 rows), so the user's *first* decision is cheap and meaningful ("Push day"), and only the second decision is a scan. The mental model is a list of lists, which is easier to hold than a matrix.
- **Honesty check:** none of the sources I read claims rows are *inherently* more efficient than grids in raw keypress count. The search-level summary of the pattern literature was explicit about this. What makes rows work is the **semantic labelling of the vertical axis plus focus memory per row.** A grid with no labels is worse; a grid with a labelled filter bar above it can be fine. **[CONFLICT-ish — treat "rows always beat grids" as convention, not law.]**

**Where a grid is the right answer:** a homogeneous set the user will scan visually rather than by category — e.g. "all 22 X3 exercises." Google's own doc supports both, and the card spec explicitly supports multi-card row layouts. Use a grid when the set is flat and bounded; use rows when the set has meaningful categories.

### 6.2 The row/shelf spec

Android TV's Compose browse sample structure **[SPEC]**:

```
Browse screen  (LazyColumn, 16.dp vertical spacing between sections)
├── Featured Carousel                        (item)
└── Section rows                             (items)
    ├── Section title (Text)
    └── LazyRow  (8.dp horizontal spacing between items)
        └── Card  (handles focus automatically)
```

`[DERIVED ×2]` At 1080p physical: **32 px between rows, 16 px between cards.** Note that Google's *card* spec gives a **20 dp / 40 px** gutter for the 12-column grid — the 8 dp figure is from a code sample, the 20 dp from the design spec. **Prefer 20 dp / 40 px.** **[CONFLICT]**

Card geometry **[SPEC]**:

- **Aspect ratios: 16:9** (video thumbnails, movie cards), **1:1** (people, logos, profiles), **2:3** (posters, vertical emphasis). Smashing lists the same three. **[secondary]**
- **Five variants:** Standard, Classic, Compact, Wide standard, Wide classic.
- **Content block width must match the image thumbnail width.** If you need more text, use a wide variant.
- **Compact cards** put text over the image and require a **semi-transparent black gradient scrim** for readability.
- **Avoid long descriptions on vertically stacked cards.**

**Row scroll behaviour [CONVENTION]:** in Leanback and most shipped TV UIs, the focused card is pinned at or near a fixed position (typically just inside the left safe margin) and the *row content slides underneath it*, rather than the focus indicator travelling rightward until it hits the edge. I could not find this stated as a rule in current Google docs, so treat it as convention — **but pick one behaviour and be rigidly consistent across every row in the app**, because the user is building a motor model, not reading.

### 6.3 The hero / immersive row

Google's **Immersive List** spec **[SPEC]**:

- Structure: a full-bleed **16:9 background image** + **cinematic scrim** + **content block (title, description)** + a **row of cards** below.
- The **background updates as focus moves** through the row, previewing the focused item.
- The focused card **scales 1.1×**.
- The component's viewport **expands when the list gains focus** to show more context, and collapses when it loses focus (progressive disclosure).
- Composition rule: **align the subject to the top right**; don't full-screen-crop so the subject sits under the content block; don't use blurry or distorted source images.
- Use it for **featured / promoted / high-visual-impact content**. Use a plain row when the content doesn't need a preview or space is tight.

Google's **Featured Carousel** spec **[SPEC]**: image background with cinematic scrim, content block (overline, title, description, CTA button), and a pagination indicator with background / active / inactive / total elements. The Compose implementation defaults to **`TimeToDisplayItemMillis = 5000`** (5 s per slide) with **100 ms** fade-in/fade-out transitions. **[SPEC — verified in the AndroidX `Carousel.kt` source]**

**For a fitness app** `[DERIVED]`: the hero slot is where "Continue where you left off" belongs — the single highest-value action on the screen, pre-focused on launch, reachable in zero D-pad presses. A carousel that auto-rotates every 5 s is a poor fit for a fitness app's home screen; auto-rotation moves the target while the user is aiming at it. Prefer a **static hero** showing today's workout, with the carousel pattern reserved for genuinely browsable promotional content, if at all.

### 6.4 Screen budget

- Google: "The amount of information displayed on a TV should be comparable to what you'd see on a **mobile phone**, rather than on a desktop." **[SPEC]**
- Spyro-Soft: limit simultaneous on-screen choices; **one explicit primary action per screen**; generous whitespace. **[secondary]**
- Google's button spec: **one primary action per screen**; don't place multiple buttons in a way that disrupts hierarchy. **[SPEC]**

---

## 7. Colour and contrast on a TV

### 7.1 Why pure white is a problem

Several distinct mechanisms, all real:

1. **Broadcast/video levels.** Rec. 709 defines the digital range as **black = 16, white = 235 in 8-bit** (64 and 940 in 10-bit); values 0 and 255 are reserved for timing marks and cannot appear in colour data. **[SPEC]** Content or UI pushed to 255 sits in "super-white," which many displays clip. `[DERIVED]` Anything you draw between 235 and 255 may be rendered as an undifferentiated flat white on a TV in a limited-range HDMI mode.
2. **Panel luminance and eye strain.** Smashing: avoid pure white `#ffffff` because "maximum luminance may be straining." **[secondary]** Google's older TV style guide: **avoid pure whites on large screen areas.** **[SPEC]**
3. **Blooming and processing.** alicia.design attributes white-text blooming on bright panels partly to inconsistent anti-aliasing on legacy TV GPUs. **[secondary]**
4. **Power.** Google: "Using darker colors saves power. Avoid using white background unless necessary." **[SPEC]**

### 7.2 Why pure black is a problem

- On **OLED**, `#000000` means the pixel is genuinely off, so the transition to any lit neighbour is abrupt and can look like a hard edge or reveal near-black banding.
- On **LCD/LED with local dimming**, `#000000` regions trigger backlight dimming zones, which causes visible **haloing** around bright elements (a bright white rep counter on a pure-black field gets a grey glow box around it).
- Google warns to **avoid very dark or muddy colours**, because "TV settings may display these colours with exaggerated contrast, causing them to be indistinguishable." **[SPEC]** In practice: your carefully chosen `#0a0a0a` vs `#141414` surface distinction survives on your monitor and vanishes on a TV in Vivid mode.

`[UNVERIFIED]` The OLED-transition and LCD-halo mechanisms above are display-engineering common knowledge, not statements I sourced in this pass. The *design consequence* — don't sit at either extreme — is directly supported by Google.

### 7.3 Safe ranges

`[DERIVED]` from the Rec. 709 16–235 range and the guidance above:

| Role | Recommendation | Rationale |
|---|---|---|
| Brightest text / highlight | **~#E8E8E8 to #F0F0F0** (≈232–240) | Just below the 235 video-white ceiling; avoids blooming and super-white clipping |
| Page background | **~#0F1114 to #16181C** (≈15–28) | Above the 16 video-black floor; avoids OLED hard-off and LCD halo |
| Elevated surface | Background + 6–10 levels of luminance | Google's tonal elevation model uses **+1 to +5** elevation levels tinted with the primary colour **[SPEC]** |
| Never | `#FFFFFF`, `#000000` | See §7.1, §7.2 |

### 7.4 Contrast targets

| Requirement | Ratio | Source |
|---|---|---|
| WCAG 2.1/2.2 AA, normal text | **4.5:1** | W3C **[SPEC]** |
| WCAG AA, "large" text — **≥18 pt (≈24 px) or ≥14 pt bold (≈18.5 px)** | **3:1** | W3C **[SPEC]**; conversion `1pt = 1.333px` |
| WCAG AAA, normal text | **7:1** | W3C **[SPEC]** — compensates for roughly 20/80 acuity |
| WCAG 1.4.11, UI components and graphical objects, incl. focus rings | **3:1** vs adjacent colours | W3C **[SPEC]** |
| WCAG 2.4.13, focus indicator, focused vs unfocused pixels | **3:1** | W3C **[SPEC]** |
| **TV-specific recommendation, text** | **7:1 or higher** | alicia.design **[secondary]** — argues WCAG 4.5:1 "often isn't enough" on TV due to image processing, dynamic backlighting and ambient light |
| **TV-specific recommendation, small UI elements** | **10:1 or higher** | alicia.design **[secondary]** |

**Recommendation for the X3 app** `[DERIVED]`: **target 7:1 for all text and 4.5:1 for all non-text UI**, i.e. one WCAG level above the legal floor, because the environment (10 ft, ambient light, aggressive TV picture processing, a sweating user without glasses) is materially worse than a desk.

Note the gap this closes: WCAG's "large text = 3:1" exemption is calibrated for reading at arm's length. At 10 ft, a 24 px glyph is *not* large — §4.2 shows 24 px is at or below the ISO minimum on most panels. **Do not take the 3:1 large-text exemption on TV.** `[DERIVED]`

### 7.5 Colour space, saturation, picture modes

- **Use sRGB.** Google: sRGB is compatible with the largest range of TV models and is recommended for basic UI; DCI-P3 is more vivid but only on advanced displays. **[SPEC]**
- **Design and test in "Standard" picture mode.** Google names the modes — Standard (balanced, default), Vivid (increased saturation), Dynamic (increased contrast), Game (reduced input lag), Movie (reduced motion blur), Sports (increased brightness), Custom — and explicitly recommends designing for **Standard**. **[SPEC]**
- **Avoid highly saturated reds, greens and blues for significant fills.** Google's older style guide says so directly **[SPEC]**; Amazon says TVs render colours "more saturated, brighter and vibrant" than monitors and recommends **less saturated colours**, with cool colours (blue, purple, grey) performing better than warm (red, orange). **[SPEC]**
- **Contrast ratio varies wildly by panel.** Google's colour-on-TV doc illustrates the range from **562:1 (low, washed out)** to **infinite (OLED)**. **[SPEC]** Your design must survive both ends.
- **Dark theme is the default expectation** for a cinematic TV experience. **[SPEC]**
- **No dynamic/wallpaper colour on TV.** Android TV does not support wallpaper, so user-generated Material You schemes are not available; the OS broadcasts base palettes only. **[SPEC]** Don't build a theming feature that depends on it.

### 7.6 Banding

Google's anti-banding guidance **[SPEC]**:

- Use **high-colour-depth gradients (10-bit or higher)** where possible.
- **Avoid extreme colour transitions.**
- Use **dithering**.
- Prefer **solid colours or subtle patterns** over big smooth gradients.
- **Test on multiple devices** to confirm gradients are smooth.

`[DERIVED]` A full-screen 1920-px-wide gradient across an 8-bit channel has at most 256 steps to spend over 1920 px — one step every 7.5 px. On a 65" panel that step is 0.22 inches wide, which is **~6 arc minutes at 10 ft** — comfortably within the eye's ability to see it as a band. **The bigger the screen and the subtler the gradient, the more visible the banding.** Practical mitigations for a web app: keep gradients short (under ~400 px of travel), overlay a low-opacity noise texture (a tiny tiled PNG data URI, not an SVG filter — see §9), or use a stepped/mesh treatment instead of a smooth linear ramp.

### 7.7 Never carry meaning by hue alone

`[DERIVED]` from §7.5 — panel colour rendering varies enormously, Vivid mode distorts hue, and colour-vision deficiency affects roughly 8% of men. For an exercise app, state ("resting", "working", "complete") must be decodable from **position + shape + luminance + text**, with hue as reinforcement only.

---

## 8. Motion on a TV

### 8.1 The frame budget

| Fact | Value | Source |
|---|---|---|
| Typical TV refresh rate | **60 Hz** (50 Hz in PAL regions) | web.dev **[SPEC]**; `[UNVERIFIED]` for the 50 Hz TV-specific case |
| Total time per frame at 60 fps | **16.66 ms** | web.dev **[SPEC]** |
| **Time actually available to your code** | **~10 ms** — the browser consumes ~6.66 ms of its own overhead per frame | web.dev **[SPEC]** |
| Android Vitals "slow frame" | **> 16.67 ms** | Google Play definitions **[SPEC-adjacent]** |
| Android Vitals "frozen frame" | **> 700 ms** | Google Play definitions **[SPEC-adjacent]** |
| Target compositing time during scroll | **4–5 ms** | web.dev **[SPEC]** |
| INP "good" threshold for discrete UI response | **≤ 200 ms** | web.dev **[SPEC]** |

**The 10 ms number is the one to design against.** On a desktop you have headroom; on a 1 GB Amlogic/Realtek TV SoC you do not. And per the Vitals framing, users don't feel average fps — they feel the bad frames. A row that scrolls at 60 fps but stutters for 200 ms on every D-pad press feels worse than a steady 30.

### 8.2 What is cheap and what is not

**Only two CSS properties can be animated by the compositor alone, with no layout and no paint: `transform` and `opacity`.** web.dev **[SPEC]**

Everything else — `width`, `height`, `top`, `left`, `margin`, `box-shadow`, `filter`, `background-position`, `border-radius` on an animating element — triggers Layout and/or Paint on the main thread, inside that 10 ms budget.

The pixel pipeline, in cost order: **JavaScript → Style → Layout → Paint → Composite.** web.dev **[SPEC]** The best-performing animation skips Layout and Paint entirely.

### 8.3 Blur is the single most expensive thing you can do

- Blur is a **convolution**: for every output pixel, many input pixels must be read. Cost scales with **blur radius × affected area**. Chrome's engineering blog **[SPEC]**
- **[MEASURED]** Chrome's own demo of a naively animated blur stretched the GPU to **~90 ms per frame** — roughly **5.4× over the 16.66 ms budget**, i.e. about 11 fps. The fix was to pre-render blurred layers at exponentially increasing radii (`blur(2^n)`: 1, 2, 4, 8 px) and **cross-fade them with opacity**, which restored "silky-smooth 60 fps with lots of headroom."
- **[MEASURED]** Airbnb found a **300 px blur-radius `box-shadow` cost ~2 full seconds of paint time per scroll click** on a Chromebook; reducing it to a **3 px blur with a 3 px offset** fixed it. `[secondary — reported via search summary of the Airbnb engineering post; I could not fetch the original directly. Treat the exact figures as approximate, the conclusion as solid.]`
- `box-shadow` is **painted on the CPU**, not GPU-accelerated like transform/opacity, and each shadow costs **at least three draw calls including a shader switch** — expensive on mobile-class GPUs. **[secondary]**
- `backdrop-filter: blur()` re-triggers compositing every frame it changes and "will tank performance on anything below a flagship device." **[secondary]**

### 8.4 The TV motion ban list

`[DERIVED]` from §8.2–8.3. On an Android TV WebView, **do not**:

| Forbidden | Use instead |
|---|---|
| `backdrop-filter` (any) | A flat semi-opaque colour, or a pre-blurred image asset. A black overlay at ~70% opacity reads similarly to a blur and costs nothing. **[secondary — the widely reported substitution]** |
| `filter: blur()` on anything that moves or changes | Pre-blurred image assets; or the cross-fade-between-pre-blurred-layers technique from Chrome's blog |
| Animating `box-shadow` | Animate the **`opacity` of a pseudo-element** that carries the shadow (the standard fix) |
| Large-radius `box-shadow` at all | Blur radius **≤ 8 px**, or an outline/border, or a background-colour lift |
| Animating `width`/`height`/`top`/`left` | `transform: translate3d()` / `scale()` |
| Animating `border-radius`, `background-position`, `background-size` | Pre-composed states, cross-faded with opacity |
| CSS/SVG `filter:` effects generally (drop-shadow, saturate, brightness) on animating content | Pre-rendered assets, or a colour overlay |
| Large smooth gradients that animate | Static gradients; see §7.6 |
| `will-change` sprinkled everywhere | See §9.2 |

### 8.5 Durations

- Material 3 exposes semantic duration and easing tokens and advises **adjusting each duration to the distance travelled, the element's velocity and the surface change** rather than using one global duration. **[SPEC]** I could not retrieve the exact token millisecond values in this pass. `[UNVERIFIED for the specific numbers.]`
- Concrete numbers I *did* verify from AndroidX TV source: the TV **Carousel** uses **5000 ms** per item and **100 ms** fade transitions. **[SPEC]**

`[DERIVED]` recommendation for TV focus motion:

| Motion | Duration | Easing |
|---|---|---|
| Focus scale + highlight | **120–180 ms** | `cubic-bezier(0.2, 0, 0, 1)` (decelerate) |
| Row translation on D-pad move | **200–250 ms** | decelerate |
| Screen/route transition | **250–350 ms** | standard ease-in-out |
| Hero background cross-fade | **300–400 ms** | linear or ease-out |
| Anything during an active set | **0 ms — don't** | see §13 |

Rationale for the fast focus figure: focus feedback must feel **instant** (Google's word) because it is the direct consequence of a physical button press. Anything over ~200 ms reads as lag. But it must not be so short that a user holding the D-pad down produces a strobing effect — which argues for a floor around 120 ms and for **cancelling, not queueing**, in-flight focus animations when a new press arrives.

### 8.6 Held-key repeat

`[DERIVED]` — not sourced, but essential and easy to get wrong. Users hold the D-pad down to traverse a long row. Android's key auto-repeat will fire many `keydown` events per second. If each one triggers a 250 ms animation plus a `scrollIntoView`, the app will fall over. Handle it by:

- Debouncing/coalescing the focus target while the key is held, and animating only to the final resting position.
- Or switching to a "fast scroll" mode after N repeats: skip the per-item animation, translate the row directly, and re-enable animation on key-up.
- Track `event.repeat` on `keydown` to distinguish held from tapped.

---

## 9. WebView-on-TV performance

### 9.1 What you are actually running on

- Android WebView is Chromium and **shares Chrome for Android's rendering engine**; hardware acceleration is on by default. **[SPEC]**
- But **WebView is limited to `SurfaceTexture` because of its compositing model** — the GPU is required to composite and display frames even in fullscreen, so it uses more processing than a native player. **[SPEC — Chromium dev list]**
- **TV WebViews are frequently old.** A named field report: TVs performed badly specifically because they ran **an older WebView version that lacked optimisations** newer Chromium had by default — notably GPU acceleration of 2D translations. **[secondary — Hao's engineering log, Cordova-on-Android-TV]**
- Google's TV app-quality baseline (**TV-PS**) targets **minSdk 31 or lower** for commonly-used TV devices. **[SPEC]** `[DERIVED]` That implies a real installed base on Android 12-era and older WebViews. Do not assume 2025 Chromium features.

**Practical consequence:** feature-detect, don't assume. `will-change`, `content-visibility`, `:has()`, container queries, `OffscreenCanvas`, `AudioWorklet` — all may be missing or buggy. The Hao report chose `transform: translateZ(0)` over `will-change` **specifically because `will-change` had limited support in older WebViews**. **[secondary]**

### 9.2 Layer promotion: the actual rules

**Promote deliberately, never broadly.**

- Only `transform` and `opacity` are compositor-only. **[SPEC]**
- Promotion methods: `will-change: transform` (modern) or `transform: translateZ(0)` (the compatible hack). **[SPEC]**
- **"Every layer you create requires memory and management, and that's not free."** Layer textures must be uploaded to the GPU across a bandwidth-constrained bus, and GPU texture storage is limited. **"Do not promote elements unnecessarily."** web.dev **[SPEC]**
- MDN: don't apply `will-change` to too many elements; overuse "end[s] up using a lot of a machine's resources" and slows the page down. **[SPEC]**
- **[MEASURED, secondary]** A reported real-world case: every pricing card, badge and animated element had been silently promoted, consuming **over 200 MB of GPU memory**; removing two `will-change` declarations fixed it.

**The TV-specific arithmetic that makes this urgent** `[DERIVED]`:

Google's memory targets for a 1 GB TV allot **30–40 MB total to graphics** (GPU textures and display buffers). **[SPEC]** A single full-screen composited layer at 1080p costs `1920 × 1080 × 4 bytes = 8,294,400 B = 7.9 MiB`.

> **You can afford roughly four to five full-screen composited layers on a 1 GB Android TV. Total. Including the base page.**

This is the hardest constraint in this document. It means:

- No "promote every card" strategy. A row of 8 promoted cards at 268 dp × 151 dp (536 × 302 physical px) costs `8 × 536 × 302 × 4 = 5.2 MB` — that alone is a sixth of the budget. `[DERIVED]`
- Add and remove `will-change` **around** the animation (set it on `animationstart`/before the transition, remove it on `transitionend`), not permanently in the stylesheet.
- Prefer promoting **one row container** and translating it, over promoting **every card** in it.
- Use Chrome DevTools' **Layers** panel via remote debugging (`chrome://inspect` against the TV) to count layers and read the promotion reason for each. web.dev **[SPEC]**

### 9.3 Canvas sizing

`[DERIVED]` from the same 30–40 MB graphics budget:

| Canvas backing store | Memory | Verdict on a 1 GB TV |
|---|---|---|
| 3840 × 2160 (1080p CSS × dpr 2) | **31.6 MiB** | **Consumes the entire graphics budget. Never.** |
| 1920 × 1080 | **7.9 MiB** | Acceptable for **one** full-screen canvas, nothing else |
| 960 × 540 | **1.98 MiB** | Comfortable |
| 640 × 360 | **0.88 MiB** | Ideal for a progress ring / meter / sparkline |

Rules:

- **Never multiply canvas dimensions by `devicePixelRatio` on a TV.** The standard high-DPI canvas recipe (`canvas.width = cssWidth * dpr`) is exactly wrong here: `dpr` is 2, the panel is only 1080p, and you have just allocated 4× the pixels for zero visual gain. Cap the effective ratio at 1.0, or at most `Math.min(dpr, 1.5)`.
- **Size the backing store to the element, not the screen.** A 300 × 300 CSS px progress ring needs a 300 × 300 (or 600 × 600 at most) backing store, not a full-screen canvas.
- **Explicitly set width/height on any offscreen canvas.** An unsized canvas defaults to **300 × 150** and will be upscaled, potentially falling back to CPU rendering. **[secondary]**
- **Check what you actually got.** WebGL contexts silently clamp: read `gl.drawingBufferWidth` / `drawingBufferHeight` after creation, because if the requested size can't be satisfied a smaller buffer is created instead. **[SPEC — WebGPU/luma.gl docs describe the same clamping behaviour]**
- **Draw static content once to an offscreen canvas and blit it**, rather than redrawing it every frame. **[SPEC — MDN canvas optimisation]**

**For the X3 app specifically:** a rest timer, a rep counter and a band-tension curve do not need canvas at all. A `<div>` with `transform: scaleX()` or an SVG `stroke-dasharray` ring costs a fraction of a canvas and is animated by the compositor. **Reach for canvas only when you genuinely need per-pixel drawing.** `[DERIVED]`

### 9.4 requestAnimationFrame discipline

- **One rAF loop for the whole app.** Multiple independent loops multiply the per-frame overhead and make the budget impossible to reason about. `[CONVENTION]`
- **Budget ~10 ms of work per frame**, per web.dev. **[SPEC]** For a 60 fps target with headroom on a weak SoC, budget **5 ms**.
- **Never write layout-reading and layout-writing in the same loop iteration.** Reading `offsetHeight`, `getBoundingClientRect()`, `scrollTop`, `getComputedStyle()` after a style write forces a synchronous layout; alternating reads and writes is **layout thrashing**. Batch all reads, then all writes. web.dev **[SPEC]** (Paul Irish's "What forces layout/reflow" gist is the canonical list of triggering properties.)
- **Slice long work across frames.** The documented pattern is to pause every ~4 ms inside a rAF callback and resume next frame. **[secondary]**
- **Stop the loop when nothing is moving.** A TV app sitting on a menu should be at 0 rAF callbacks per second, not 60. This matters for heat and for the shared SoC.
- **Cancel rAF on `visibilitychange`** — Android TV has Ambient Mode, and Google's quality rules (**TV-BU/TV-BY**) require apps *not* to prevent Ambient Mode when there is no active user-initiated playback. **[SPEC]**

### 9.5 Memory

Google's published targets for a **1 GB low-RAM Android TV**, foreground app: **[SPEC]**

| Category | Target |
|---|---|
| Anonymous + Swap (Java + native + stack) | **< 160 MB** |
| **Graphics (GPU textures + display buffers)** | **30–40 MB** |
| File (code pages, mapped files) | **60–80 MB** |
| **Total maximum** | **280 MB** |
| **Recommended peak (Anon+Swap + Graphics)** | **< 200 MB** |

Device tiering **[SPEC]**:

| Device RAM | Video res | **UI res** | Low-RAM? |
|---|---|---|---|
| 1 GB | 1080p | **720p** | Yes |
| 1.5 GB | 2160p | 1080p | Yes |
| ≥ 1.5 GB | 1080p | 720p or 1080p | No |
| ≥ 2 GB | 2160p | 1080p | No |

**Note the third column.** On a 1 GB device the *UI* renders at **720p** even though video plays at 1080p. Google's rule: **do not load images at a higher resolution than the device UI resolution.** **[SPEC]** Google's app-quality requirement **TV-ME** makes staying inside these limits a certification criterion.

`[DERIVED]` image-memory arithmetic for a browse screen:

- A 1920 × 1080 JPEG **decodes to ~7.9 MiB in RAM regardless of its file size**. Twenty preloaded hero backgrounds = **158 MB** — over half the entire 280 MB budget, on decoded bitmaps alone.
- A 536 × 302 card thumbnail decodes to **0.62 MiB**. Forty of them = **25 MB**. Survivable, but only if they are actually served at 536 × 302 and not downscaled 1920 px originals.

Rules for a TV web app:

- **Serve images at the exact rendered size.** Multiple asset sizes + `srcset`, or server-side resizing. Never ship one 1920 px asset and let CSS shrink it.
- **Cap the number of decoded images in memory.** Use `loading="lazy"`, and actively null out `src` for cards far outside the viewport in long rows.
- **Prefer one shared hero image that cross-fades** over N preloaded heroes.
- **Google recommends Baseline Profiles (TV-BP)** to improve startup and reduce jank **[SPEC]** — native-app advice, not applicable to a WebView page directly, but the equivalent for you is: **inline critical CSS, defer everything else, and get first meaningful paint before the WebView is even shown.**
- Google's own diagnosis for TV jank is worth repeating: jank is **a symptom**, and the causes are often **background service spikes, IO contention triggered by `kswapd`, or Low Memory Killer events interrupting the foreground process** — not the rendering pipeline. **[secondary — Consult Red]** Translation for a web app: if the app janks, check whether you are allocating, not whether your easing curve is right.

### 9.6 A concrete WebView checklist

`[DERIVED]` — the things to verify on the actual device, in order:

1. Log `innerWidth`, `devicePixelRatio`, `screen.width` on boot (§2.2). Pin the coordinate system.
2. Remote-debug via `chrome://inspect`. Confirm the WebView's Chromium version. Feature-detect anything newer than it.
3. Open the **Layers** panel. Count composited layers. Multiply by area × 4 bytes. Stay under 30 MB.
4. Enable **Paint flashing** (Rendering tab). Move focus across a row. If large regions flash green, you are repainting where you should be compositing.
5. Record a Performance trace during held-D-pad row traversal. Look for Layout and Paint entries inside the frame. There should be none.
6. Check the JS heap after 10 minutes of browsing. It should be flat, not a staircase.
7. Test on the **cheapest** TV device you can find, not a Shield/Chromecast 4K. Spyro-Soft's rule: test on budget models with limited processing power, and on real hardware — emulators don't replicate actual behaviour. **[secondary]**

---

## 10. Accessibility on TV

### 10.1 Why it matters more here

Google's TV accessibility page opens with the population data: **2.2 billion people globally have vision impairments (WHO)**; **32 million Americans 18+** have experienced significant vision loss; **30 million** blind and partially sighted people in Europe; and critically — **96% of blind/low-vision users watch TV regularly, 81% for more than an hour a day.** **[SPEC]**

TV is the medium where low-vision users are *most* present, and it is the medium designed to be viewed from the furthest distance. Those two facts point the same way.

### 10.2 Text scaling

- **Android 12+ lets users change text scaling from device settings.** **[SPEC]**
- Google's rules: use `wrap_content`-equivalent sizing, ensure layouts **rearrange** as text scale changes, verify components still fit at larger scales, and avoid fixed-size containers for scalable text. **[SPEC]**
- Read the scale at runtime via `resources.configuration.fontScale`; test with `adb shell settings put system font_scale 1.2f`. **[SPEC]**

`[DERIVED]` for a WebView app: the system `fontScale` is **not** automatically applied to CSS `px`. You must either (a) read it through a JS bridge and apply it to your root font size, or (b) at minimum, ensure your layout survives a **1.3× text increase** without clipping or overlap. Design every card, button and row with vertical slack; never set a fixed `height` on anything containing text — use `min-height`.

### 10.3 TalkBack

Google's TV TalkBack rules **[SPEC]**:

- **Make either the parent or the child focusable, never both** in nested views. Duplicated focusability is the #1 TV TalkBack bug.
- Override the default "Press select to activate" announcement with a **custom action label** where the default is wrong.
- Support **slider mode** for continuous controls (volume, progress) via `ACTION_SET_PROGRESS` and `RangeInfo`; the user enters slider mode by pressing the centre button, then uses arrows.
- Provide `ACTION_SCROLL_FORWARD` / `ACTION_SCROLL_BACKWARD` on scrollable regions.

`[DERIVED]` for a WebView app, the equivalents are: correct ARIA roles (`role="listbox"`/`option`, `role="tablist"`/`tab`), `aria-label` on every icon-only control, `aria-valuenow/min/max/text` on any progress or timer element, and — crucially — **one focusable element per card, not a focusable card containing a focusable link and a focusable button.**

### 10.4 Audio descriptions

**Android 13+ (API 33+)** exposes a **system-wide audio-description preference**. Read it with `AccessibilityManager.isAudioDescriptionRequested`, and subscribe to changes with `addAudioDescriptionRequestedChangeListener`. **[SPEC]**

For a fitness app this maps directly: if the user has requested audio descriptions, **every visual cue during a workout must also be spoken** — "rep eight", "ten seconds rest remaining", "switch to the second band" — not just the ones you thought were important.

### 10.5 Captions

Google requires apps to **adopt the system caption settings** rather than inventing their own. **[SPEC]** If the app plays coached video, respect the OS's caption font, size, colour and background settings.

### 10.6 Keyboard/remote variation

**Android 13+ (API 33+)**: use `InputDevice.getKeyCodeForKeyLocation()` to look up the keycode for an expected key *location*, which accommodates remapped or non-standard remotes. **[SPEC]** `[DERIVED]` For a web app: do not hard-code keyCodes beyond the five you actually need, and always handle **both** the standard arrow/Enter keys and Android TV's media keycodes. Never rely on a Menu button — Google's **TV-DM** requirement forbids depending on it. **[SPEC]**

### 10.7 Premium accessibility tier

Google's TV app-quality **TV-AX** (differentiated tier) asks for **audio descriptions, subtitle styles, high-contrast mode, and adjustable playback speed**. **[SPEC]** For a coached-workout app, **adjustable playback speed** is genuinely useful beyond accessibility — a user learning a movement wants 0.5×.

---

## 11. Audio design for TV

### 11.1 Why phone-mixed audio disappears on a TV

Four independent mechanisms, each sufficient on its own:

**1. Distance.** `[DERIVED]` A phone speaker is ~30 cm from the ear; a TV is ~3 m away. For a point source, SPL falls **6 dB per doubling of distance**: `20 × log10(300/30) = 20 dB` of loss. Even against a 1 m reference, moving to 3 m costs `20 × log10(3) = 9.5 dB`. A cue that is comfortably audible on a phone is **10–20 dB quieter** at the couch — and that's before the room.

**2. The drivers physically cannot reproduce the low end.** Modern TV panels are **under 25 mm deep**, forcing "tiny drivers that then get cramped and poorly sealed," and the speakers fire **downward along the bottom edge or straight back at the wall — neither direction points at the viewer.** **[secondary — How-To Geek]** `[UNVERIFIED for specific Hz figures]`, but the consequence is well established: a small, unenclosed, downward-firing driver has essentially no output below a few hundred Hz.

> **The practical rule: any sonic content below ~200 Hz effectively does not exist on TV speakers.** A cue whose identity comes from a low "thump" — the kind that feels great on a phone or in headphones — will be **silent** on a TV. `[DERIVED]` from the driver physics above.

**3. Downmixing destroys the middle.** Content mixed for 5.1/7.1/Atmos gets "collapsed... down to basic stereo, which quietly destroys the voices." **[secondary]** `[UNVERIFIED]` — stereo→mono downmix on some sets can additionally phase-cancel anything out of phase between channels.

**4. Bass masks speech.** Low frequencies mask the midrange where speech intelligibility lives; over-emphasised bass "make[s] it nearly impossible to decipher what someone is saying." **[secondary]** The classic telephony intelligibility band is **300 Hz – 3.4 kHz**. `[SPEC-adjacent — long-standing standard, not sourced in this pass]`

### 11.2 Loudness standards

| Standard | Region | Target | Tolerance | True peak |
|---|---|---|---|---|
| **EBU R 128** | Europe | **−23 LUFS** | **±0.5 LU** (±1 LU for live) | **−1 dBTP** |
| **ATSC A/85** (enforced by the **CALM Act**) | USA | **−24 LKFS** | **±2 LU** | — |

**[SPEC]** — EBU R 128 and the ATSC/CALM figures.

Measurement details from R 128 **[SPEC]**:

- Algorithm: **ITU-R BS.1770**. LKFS and LUFS are numerically the same thing.
- **Absolute gate: −70 LUFS** (below this counts as silence).
- **Relative gate: −10 LU** below the running integrated loudness.
- **Momentary (M): 400 ms** sliding window. **Short-term (S): 3 s** sliding window. **Integrated (I):** whole programme.
- Meter update rates: ≥10 Hz for short-term, ≥1 Hz for integrated.
- R 128 **does not prescribe a maximum loudness range (LRA)**.

ATSC A/85 anchors its measurement to the **Anchor Element** — the part of the mix a listener instinctively judges loudness by, which for television is **dialogue**. **[SPEC-adjacent]**

### 11.3 What this means for a fitness app's cues

`[DERIVED]` from §11.1–11.2:

1. **Master all UI and coaching audio to roughly −23 to −24 LUFS integrated, with true peaks at or below −1 dBTP.** If your cues are mastered louder than that, they will blast relative to everything else on the TV. If quieter, they vanish. Matching broadcast is the only way to be predictable across a device you don't control.
2. **Put every cue's energy in 500 Hz – 4 kHz.** High-pass everything at **200 Hz** — the content below that is not reproduced and only steals headroom. Verify each cue is still identifiable after a 200 Hz high-pass.
3. **Make every cue mono-safe.** Sum to mono and confirm nothing cancels or gets quieter. Never rely on stereo width, panning, or a stereo-spread effect to convey information.
4. **Use short, transient, distinctly-pitched cues** rather than long tonal ones. At 3 m in a room with a fan and the user breathing hard, a 150 ms bright click cuts through where a 1 s soft pad does not.
5. **Differentiate cues by pitch and rhythm, not by loudness.** You do not control the TV's volume knob, its EQ preset, or its dynamic-range-compression setting.
6. **Never make audio the only channel, and never make it optional-but-load-bearing.** Some users watch with the TV muted.
7. **Design cue redundancy against the visual.** A rest-period-ending cue should be a rising three-tone figure *and* a visible countdown *and* a colour/luminance change.

### 11.4 Playback mechanics

- **Autoplay:** Chromium always permits **muted** autoplay. Audio autoplay requires a user gesture on the domain (or a sufficient Media Engagement Index on desktop, or an installed PWA). **[SPEC]**
- **Android WebView:** `WebSettings.setMediaPlaybackRequiresUserGesture()` gates media playback on a user gesture. `[UNVERIFIED — I believe the default is `true`, meaning audio will not play until a gesture occurs; confirm against the WebSettings reference before relying on it.]`
- `[DERIVED]` **Unlock audio on the first Select press.** On the app's first user gesture, create/resume the `AudioContext` and play a silent buffer. Do it once, at launch, on the "Start" button — never mid-workout, when the user's hands are on the bar and there is no gesture coming.
- **Preload and decode every cue at launch** into `AudioBuffer`s. Do not `fetch` a cue at the moment you need it — a 300 ms network stall is a missed rep call. Cue files are tiny; a full set is a few hundred KB.
- Prefer the **Web Audio API** over `<audio>` elements for cues: `<audio>` element playback on old WebViews has unreliable low-latency start, and Web Audio lets you schedule against `audioContext.currentTime` with sample accuracy. `[UNVERIFIED for the specific WebView latency claim; the scheduling advantage is definitional.]`

### 11.5 Audio focus and coexistence

Android audio-focus behaviour that affects you **[SPEC]**:

- Four focus types: `AUDIOFOCUS_GAIN` (permanent), `AUDIOFOCUS_GAIN_TRANSIENT`, `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`, `AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE` (8.0+).
- **Android 8.0+ ducks automatically** for `MAY_DUCK` requests, with no callback — **except for `CONTENT_TYPE_SPEECH`**, which is deliberately not ducked so users don't miss information.
- **Android 12+ enforces a fade-out** on a media/game app that loses `AUDIOFOCUS_GAIN`, and keeps it muted until it re-requests focus.
- **Android 15+ (API 35+): apps cannot request audio focus unless they are the top app or running a foreground service.** Requests otherwise return `AUDIOFOCUS_REQUEST_FAILED`.

`[DERIVED]` For a fitness app where the user wants their own music playing from another app underneath: declare your coaching cues as **speech content** and request **transient may-duck** focus, so the music ducks for the cue and returns. Declaring cues as speech also protects them from being ducked by *other* apps.

---

## 12. Consolidated numbers table

Everything actionable, in one place. Physical px figures assume a **1080p panel**.

| Thing | Value | Source |
|---|---|---|
| Design canvas (dp) | 960 × 540 dp | [SPEC] |
| dp → physical px at 1080p | **× 2** | [DERIVED from xhdpi] |
| Overscan safe area, minimum | **5% per edge** = 96 px / 54 px | [SPEC] |
| Content grid margin | 58 dp / 28 dp = **116 px / 56 px** | [SPEC] |
| Grid | 12 cols × 52 dp, 20 dp gutter, 844 dp content | [SPEC] |
| Card gutter | 20 dp = **40 px** | [SPEC] |
| Row vertical spacing | 16 dp = **32 px** (code sample) | [SPEC] |
| Absolute minimum text | 12 sp = **24 px** | [SPEC] |
| **Practical text floor** | **28 px** | [secondary + DERIVED] |
| **Body text** | **32–36 px** | [DERIVED, converged] |
| Row header | 44 px | [DERIVED] |
| Screen title | 72 px | [DERIVED] |
| Minimum font weight | **400 body / 500–600 emphasis; never < 400** | [SPEC + DERIVED] |
| Line height, body | **≥ 1.4×** | [SPEC-adjacent] |
| Line length | **45–60 chars, hard cap 70** | [SPEC-adjacent + DERIVED] |
| Focus scale | **1.025× / 1.05× / 1.1×** (1.1× for cards and buttons) | [SPEC] |
| Focus glow elevation | 2–32 dp | [SPEC] |
| **Focus outline width** | **≥ 6 px, prefer 8–12 px** | [DERIVED] |
| Focus indicator contrast | **3:1** focused-vs-unfocused, and 3:1 vs adjacent | [SPEC] |
| Focus indicator area | ≥ area of a 2 CSS px perimeter | [SPEC] |
| Text contrast, legal floor | 4.5:1 (AA) | [SPEC] |
| **Text contrast, TV target** | **7:1** | [secondary + DERIVED] |
| Non-text contrast | 3:1 minimum, 4.5:1 target | [SPEC + DERIVED] |
| Brightest safe white | ≈ **#E8E8E8–#F0F0F0** | [DERIVED from Rec.709 235] |
| Darkest safe background | ≈ **#0F1114–#16181C** | [DERIVED from Rec.709 16] |
| Colour space | **sRGB** | [SPEC] |
| Test picture mode | **Standard** | [SPEC] |
| Frame budget, total | **16.66 ms** | [SPEC] |
| **Frame budget, yours** | **~10 ms** (target 5 ms on TV) | [SPEC] |
| Composite budget during scroll | **4–5 ms** | [SPEC] |
| Slow frame / frozen frame | > 16.67 ms / > 700 ms | [SPEC-adjacent] |
| Compositor-only properties | **`transform`, `opacity`. Nothing else.** | [SPEC] |
| Naive animated blur, measured | **~90 ms/frame** | [MEASURED] |
| Focus animation duration | **120–180 ms** | [DERIVED] |
| Carousel item dwell / fade | 5000 ms / 100 ms | [SPEC] |
| Total memory, 1 GB TV | **280 MB** | [SPEC] |
| **Graphics memory, 1 GB TV** | **30–40 MB** | [SPEC] |
| Anon + Swap | < 160 MB | [SPEC] |
| **Full-screen composited layer** | **7.9 MiB each → 4–5 max** | [DERIVED] |
| 1080p canvas @ dpr 2 | **31.6 MiB — never** | [DERIVED] |
| 1080p decoded image | **7.9 MiB each** | [DERIVED] |
| UI render resolution on 1 GB TV | **720p** | [SPEC] |
| Audio loudness target | **−23 LUFS (EU) / −24 LKFS (US)** | [SPEC] |
| Audio true peak | **≤ −1 dBTP** | [SPEC] |
| **Audio high-pass for TV speakers** | **200 Hz** | [DERIVED] |
| Cue energy band | **500 Hz – 4 kHz** | [DERIVED] |
| Text scale to survive | **1.3×** | [DERIVED] |

---

## 13. Applying this to an X3 Bar training app

The generic TV guidance above assumes a user sitting still, browsing. An X3 user is standing on a ground plate holding a loaded bar. That changes several things.

### 13.1 The two distinct modes

| Mode | Distance | Attention | Hands | Design rules |
|---|---|---|---|---|
| **Browse / plan** | Sofa, 8–12 ft | Full | Free, on remote | Standard TV rules apply. Rows, cards, focus, all of §3–§7. |
| **In-set** | Mat, 4–8 ft, often side-on to the screen | **Peripheral at best** | **On the bar** | A different design entirely. See below. |

**The in-set screen is not a UI. It is a scoreboard.** During a set the user cannot press anything, is looking at the bar or the floor, and is reading the screen out of the corner of one eye for a fraction of a second between reps.

### 13.2 In-set screen rules `[DERIVED]`

1. **One number dominates.** The rep count. `[DERIVED]` To be readable in **peripheral vision** at 8 ft you want far more than the 16 arc-min foveal threshold — target **60+ arc minutes**, which at 8 ft is a 1.68 in cap height, ≈ **67 px cap ≈ 95 px font on a 55" 1080p panel**, and ≈ **86 px cap ≈ 120 px font on a 43"**. **Set the rep counter at 160–220 physical px.** That is `displayLarge` × 2–4.
2. **Tabular numerals, fixed-width slot.** `font-variant-numeric: tabular-nums`, and reserve the width of the widest value so the counter never reflows from 9 to 10.
3. **No animation during a set.** Motion in peripheral vision reads as an alert and pulls attention off the movement. Also: the frame budget should be spent on nothing, so the audio scheduler never misses.
4. **State by luminance and position, not hue.** "Working" vs "rest" must be distinguishable in a glance, at an angle, in a bright room, by a colour-blind user. Change the *layout* (counter centred vs timer centred) and the *background luminance*, and use hue only as a third signal.
5. **Audio carries the set, the screen confirms it.** Per §11 the user is not looking at the screen. Every state change must be audible; the screen is the redundant channel here, not the primary one. This inverts the normal relationship.
6. **Never require a press during a set.** If the app needs to know when the set ended, infer it from a timer and let the user correct it afterwards, at the summary screen, when their hands are free.
7. **Back during a set = pause, not exit.** See §5.5.

### 13.3 Browse screen shape `[DERIVED]`

```
┌─ safe area (116 px / 56 px) ────────────────────────────┐
│                                                          │
│  HERO — today's workout, static, pre-focused             │
│  "Push Day · Week 6"        [ START ]  ← initial focus   │
│  Last: Chest Press, Dark Grey, 22/15                     │
│                                                          │
│  Workouts ──────────────────────────────────────────     │
│  [Push] [Pull] [Custom] [Rest day]                       │
│                                                          │
│  Exercises ─────────────────────────────────────────     │
│  [card] [card] [card] [card] [card] [ca…                 │
│                                                          │
│  History ───────────────────────────────────────────     │
│  [card] [card] [card] [card] [card] [ca…                 │
└──────────────────────────────────────────────────────────┘
```

- **Initial focus on START.** The single most likely action costs **zero** D-pad presses. This is the highest-leverage decision on the screen.
- **3–4 rows maximum.** Google: comparable information density to a phone, not a desktop. **[SPEC]**
- **Last card in each row bleeds past the safe edge** to signal scrollability.
- **Focus memory per row**, restored on return from any detail screen (§5.6).
- The exercise set is bounded and homogeneous — **a labelled grid is legitimate here** (§6.1). Rows are still preferable if you have meaningful categories (Push / Pull / Legs).

### 13.4 Things that will bite you specifically

`[DERIVED]` — the failure modes this combination of constraints produces:

- **A designer mocks at 1920 and it renders at 2× in the WebView.** Fix the coordinate system on day one (§2).
- **A "glassmorphic" workout card with `backdrop-filter`.** It will drop the app to single-digit fps on a 1 GB TV (§8.3). Ban it in review.
- **A canvas-based band-tension curve sized to `dpr`.** 31.6 MiB, the entire graphics budget, for a line chart (§9.3).
- **A rest-timer cue with a satisfying low thump.** Inaudible on TV speakers (§11.1).
- **A rep counter in a light font weight.** Jagged and shimmering on TV (§4.5).
- **`will-change: transform` on the card component.** Multiplied by 40 cards, that is the graphics budget gone (§9.2).
- **Colour-coded band selection (white / light grey / dark grey / black bands).** This is the worst possible palette for a TV: it is entirely luminance-based, in exactly the near-white and near-black regions TVs render worst (§7.1, §7.2). **Never render band identity as a colour swatch alone.** Use the name in text at ≥32 px, plus a distinct shape or position, plus optionally a non-literal accent colour per band.
- **A progress ring drawn per-frame on canvas.** Use SVG `stroke-dasharray` with a CSS transition, which the compositor handles (§9.3).

---

## 14. Review checklist

Print this. Run it on every screen.

**Layout**
- [ ] Nothing legible or focusable outside the 5% safe area (96 / 54 px at 1080p)
- [ ] Focus scale (1.1×) does not push any element into the overscan band
- [ ] Backgrounds and scrims bleed to 100%
- [ ] Last item in each row clips past the safe edge
- [ ] Layout survives 1.3× text scale without clipping or overlap

**Type**
- [ ] No text below **28 physical px** at 1080p
- [ ] Body text at **32–36 px**
- [ ] No font weight below 400; nothing important below 500
- [ ] Line length ≤ 60 characters
- [ ] `tabular-nums` on every counter and timer

**Focus**
- [ ] Something is focused on every screen, always, including on return
- [ ] D-pad reaches every visible control
- [ ] Focus indicator ≥ 6 px, ≥ 3:1 contrast, and carried by **two** channels (scale + outline, or outline + background)
- [ ] Focus memory per row, restored across route changes
- [ ] Held D-pad does not queue N animations
- [ ] Back never gates exit; Back during a set pauses

**Colour**
- [ ] No `#FFFFFF`, no `#000000`
- [ ] Text ≥ 7:1; non-text ≥ 3:1
- [ ] No meaning carried by hue alone
- [ ] Checked in the TV's **Standard** picture mode, and glanced at in Vivid
- [ ] No full-screen smooth gradient

**Motion**
- [ ] No `backdrop-filter`, no animated `filter: blur()`
- [ ] No animated `box-shadow`; no blur radius > 8 px
- [ ] Only `transform` and `opacity` are animated
- [ ] Nothing animates during an active set

**Performance**
- [ ] Composited layer count × area × 4 bytes < 30 MB
- [ ] `will-change` added and removed around animations, never permanent
- [ ] No canvas backing store multiplied by `devicePixelRatio`
- [ ] Images served at rendered size, not downscaled from 1920 px
- [ ] One rAF loop; it stops when nothing moves
- [ ] No layout read after a style write in the same frame
- [ ] Verified with Paint Flashing and the Layers panel on a **cheap** TV

**Audio**
- [ ] AudioContext unlocked on first Select press
- [ ] All cues preloaded and decoded at launch
- [ ] All cues high-passed at 200 Hz and still identifiable
- [ ] All cues mono-safe
- [ ] Integrated loudness ≈ −23 LUFS, true peak ≤ −1 dBTP
- [ ] Nothing is audio-only

**Accessibility**
- [ ] One focusable element per card
- [ ] `aria-label` on every icon-only control
- [ ] Every visual workout cue is also spoken when audio descriptions are requested
- [ ] Tested with TalkBack on a real TV

---

## 15. Sources

**Google / Android TV (primary)**
- [Design for TV — foundations](https://developer.android.com/design/ui/tv/guides/foundations/design-for-tv)
- [Navigation on TV](https://developer.android.com/design/ui/tv/guides/foundations/navigation-on-tv)
- [Color on TV](https://developer.android.com/design/ui/tv/guides/foundations/color-on-tv)
- [Color system — TV](https://developer.android.com/design/ui/tv/guides/styles/color-system)
- [Typography — TV](https://developer.android.com/design/ui/tv/guides/styles/typography)
- [Layouts — TV](https://developer.android.com/design/ui/tv/guides/styles/layouts)
- [Focus system — TV](https://developer.android.com/design/ui/tv/guides/styles/focus-system)
- [Cards — TV](https://developer.android.com/design/ui/tv/guides/components/cards)
- [Buttons — TV](https://developer.android.com/design/ui/tv/guides/components/buttons)
- [Immersive list — TV](https://developer.android.com/design/ui/tv/guides/components/immersive-list)
- [Featured carousel — TV](https://developer.android.com/design/ui/tv/guides/components/featured-carousel)
- [TV navigation (developer guide)](https://developer.android.com/training/tv/get-started/navigation)
- [Build TV layouts / Leanback layouts](https://developer.android.com/training/tv/playback/leanback/layouts)
- [Catalog browser with Compose for TV](https://developer.android.com/training/tv/playback/compose/browse)
- [Optimize memory usage — Android TV](https://developer.android.com/training/tv/playback/memory)
- [TV app quality guidelines](https://developer.android.com/docs/quality-guidelines/tv-app-quality)
- [Accessibility on Android TV](https://developer.android.com/training/tv/accessibility)
- [Support TalkBack in TV apps](https://developer.android.com/training/tv/accessibility/talkback-support)
- [Manage audio focus](https://developer.android.com/media/optimize/audio-focus)
- [Android TV style guide (legacy, archived mirror)](https://spot.pcc.edu/~mgoodman/developer.android.com/preview/tv/design/style.html) — source of the 12 sp / 18 sp figures
- [AndroidX `TypeScaleTokens.kt`](https://github.com/androidx/androidx/blob/androidx-main/tv/tv-material/src/main/java/androidx/tv/material3/tokens/TypeScaleTokens.kt) — verified TV type scale
- [AndroidX `Carousel.kt`](https://github.com/androidx/androidx/blob/androidx-main/tv/tv-material/src/main/java/androidx/tv/material3/Carousel.kt) — 5000 ms / 100 ms defaults
- [Material Components Android — Typography](https://github.com/material-components/material-components-android/blob/master/docs/theming/Typography.md)
- [Material 3 — Easing and duration](https://m3.material.io/styles/motion/easing-and-duration)

**Web performance (primary)**
- [Rendering performance — web.dev](https://web.dev/articles/rendering-performance) — the 16.66 ms / 10 ms budget
- [Stick to compositor-only properties and manage layer count — web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)
- [Simplify paint complexity and reduce paint areas — web.dev](https://web.dev/articles/simplify-paint-complexity-and-reduce-paint-areas)
- [Avoid large, complex layouts and layout thrashing — web.dev](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)
- [Accelerated rendering in Chrome — web.dev](https://web.dev/articles/speed-layers)
- [Animating a blur — Chrome for Developers](https://developer.chrome.com/blog/animated-blur) — the 90 ms/frame measurement
- [Avoid non-composited animations — Lighthouse](https://developer.chrome.com/docs/lighthouse/performance/non-composited-animations)
- [Autoplay policy in Chrome](https://developer.chrome.com/blog/autoplay)
- [`will-change` — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/will-change)
- [WebView overview — Chrome for Developers](https://developer.chrome.com/docs/webview)
- [What forces layout/reflow — Paul Irish](https://gist.github.com/paulirish/5d52fb081b3570c81e3a)

**Standards**
- [WCAG 2.2 — Contrast (Minimum) 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WCAG 2.2 — Non-text Contrast 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [WCAG 2.2 — Focus Appearance 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- [Rec. 709 — Wikipedia](https://en.wikipedia.org/wiki/Rec._709) — 16/235 and 64/940 video levels
- [Overscan — Wikipedia](https://en.wikipedia.org/wiki/Overscan) — BBC and Xbox safe-area percentages
- [EBU R 128 — Wikipedia](https://en.wikipedia.org/wiki/EBU_R_128) — loudness targets, gates, windows
- ISO 9241-303:2011 — cited via Extron for the 16 / 20–22 arc-minute cap-height recommendation (I could not fetch the ISO text or the Extron page directly; the figures come from the search-level summary of the Extron article and are consistent across secondary sources) `[UNVERIFIED at the primary-source level]`

**Other platforms**
- [Fire TV design and UX guidelines — Amazon](https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html) — 5% safe zone, 14 sp / ~28 px at 1080p
- [tvOS guidelines summary — BasThomas/tvOS-guidelines](https://github.com/BasThomas/tvOS-guidelines)
- Apple tvOS Human Interface Guidelines — the 60 pt / 80 pt safe-area figures come from secondary summaries; Apple's own pages are JS-rendered and could not be fetched in this pass `[UNVERIFIED at the primary-source level]`

**Secondary / industry**
- [Designing For TV, Part 1: The Evergreen Pattern — Smashing Magazine](https://www.smashingmagazine.com/2025/08/designing-tv-evergreen-pattern-shapes-tv-experiences/)
- [Designing For TV, Part 2: Principles, Patterns and Practical Guidance — Smashing Magazine](https://www.smashingmagazine.com/2025/09/designing-tv-principles-patterns-practical-guidance/)
- [Solving small text and contrast issues for large-screen readability — alicia.design](https://www.alicia.design/post/solving-small-text-and-contrast-issues-for-large-screen-readability) — 28 px floor, 7:1 / 10:1 TV contrast targets
- [8 UX/UI best practices for designing TV apps — Spyro-Soft](https://spyro-soft.com/blog/media-and-entertainment/8-ux-ui-best-practices-for-designing-user-friendly-tv-apps)
- [10 tips for UI/UX design on smart TV — Norigin Media](https://noriginmedia.com/10-tips-for-ui-ux-design-on-smart-tv/)
- [Improving CSS performance of Cordova apps on Android TVs — Hao's learning log](https://blog.hao.dev/improving-css-performance-of-cordova-apps-on-android-tvs/) — old-WebView / translateZ finding
- [Android TV optimisation for RAM-constrained devices — Consult Red](https://consult.red/insights/android-tv-optimisation/)
- [CSS box-shadow can slow down scrolling — Airbnb Engineering](https://medium.com/airbnb-engineering/css-box-shadow-can-slow-down-scrolling-d8ea47ec6867) `[figures via search summary; original not fetched]`
- [This is the real reason why TV audio has gotten so bad — How-To Geek](https://www.howtogeek.com/this-is-the-real-reason-why-tv-audio-has-gotten-so-bad/) — <25 mm panels, down/rear-firing drivers, downmix
- [Line length — Practical Typography](https://practicaltypography.com/line-length.html)
- [Loudness normalization: EBU R128, BS.1770, ATSC A/85 — Forasoft](https://www.forasoft.com/learn/audio-for-video/articles-audio/loudness-normalization-ebu-r128-bs1770-atsc-a85)

---

## 16. Open questions to resolve on hardware

These could not be settled from documentation. Answer them by measuring on the actual target device before locking the design.

1. **What does the WebView actually report** for `innerWidth` / `devicePixelRatio` on your target TV? (§2.1)
2. **What Chromium version** is the WebView on the cheapest device you intend to support? Which CSS/JS features are missing? (§9.1)
3. **Is `setMediaPlaybackRequiresUserGesture` defaulting to `true`** in your WebView configuration, and does your audio-unlock gesture actually satisfy it? (§11.4)
4. **What is the actual composited-layer count and GPU memory** of your browse screen? (§9.2)
5. **Does the TV have overscan enabled** in its factory default picture settings? Test at least one Samsung, one LG, one TCL/Hisense. (§3.1)
6. **What do the near-white and near-black surface colours actually look like** on a panel in Standard mode, and in Vivid? (§7.3)
7. **Are the audio cues audible** at a normal TV volume setting, from 8 ft, over the sound of a user breathing hard? (§11.3)
8. **Exact Material 3 duration token values in ms** — retrieve from `m3.material.io/styles/motion/easing-and-duration` or the Compose `MotionTokens` source. (§8.5)
