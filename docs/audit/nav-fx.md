# Audit — `web/x3f-nav.js` and `web/x3f-fx.js`

Deep read for the planned overhaul. Both files were read in full, line by line. Every
claim below is either a direct quote from the source or an empirical measurement made
by driving the real pages in headless Edge (the same browser and the same technique the
project's own `tools/nav-audit/run.py` uses).

**Two copies of each file exist and are byte-identical** (verified with `diff`):

| path | notes |
| --- | --- |
| `E:/Fun/x3f-tv/web/x3f-nav.js` | 309 lines, source of truth |
| `E:/Fun/x3f-tv/app/src/main/assets/x3f-nav.js` | identical copy, produced by `tools/sync-from-web.py` (`SHARED` list, line 52) |
| `E:/Fun/x3f-tv/web/x3f-fx.js` | 253 lines, source of truth |
| `E:/Fun/x3f-tv/app/src/main/assets/x3f-fx.js` | identical copy |

All line numbers in this report refer to the `web/` copies. They apply unchanged to the
`app/src/main/assets/` copies.

---

## 0. Executive summary

Five things dominate everything else in this report.

1. **`x3f-fx.js:31` destroys every `position:fixed` modal in the app.** The rule
   `body>*:not(#x3ffx){position:relative;z-index:1}` has ID-level specificity because of
   the `:not(#x3ffx)`, so it beats `.coach{position:fixed}` and `.scrim{position:fixed}`.
   Measured on the real pages: the launcher's bar picker renders at `y=941` on a `941px`
   viewport with `body{overflow:hidden}` — completely off screen and unreachable — and
   `routine.html`'s guided coach, rest timer and session summary all become in-flow blocks
   stacked below the page. The nav still scopes and focuses into them, so the remote goes
   somewhere invisible. See **D-FX-1**.
2. **The auto-degrade ladder sheds the three cheapest layers and keeps the two most
   expensive ones.** Measured: motes cost `0.03 ms/frame`, grain `2.3 ms`, the aurora blit
   `4.05 ms`, the vignette gradient fill `5.2 ms` (1080p, software raster). The ladder
   removes grain, then motes, then aurora *drift* — it never removes the aurora blit or the
   vignette. At the lowest tier the loop still costs 80% of full price. See **D-FX-4**.
3. **Any list re-render throws the D-pad cursor to the top of the page.** `refresh()`
   drops the cursor when it leaves the item list but only re-seats it when the *scope*
   changed (`x3f-nav.js:85-95`), so the next arrow press falls through to
   `setCursor(first())` and jumps to `[data-nav-first]`. Live on `progress.html:315`
   (achievement filter chips) and `progress.html:303` (delete-a-set). See **D-NAV-3**.
4. **The "same row" rule is a soft +4000 penalty, not a constraint** (`x3f-nav.js:144`), so
   at every row boundary the cursor escapes diagonally into page chrome. Measured on the
   real launcher: `Right` from the Bloom card lands on the bar chip; `Left` from the Flow
   card lands on the update button at the bottom of the page. This is the exact bug
   `HANDOFF.md:41` claims was fixed. See **D-NAV-1**.
5. **A `position:fixed` element with `data-nav` can never be focused** —
   `x3f-nav.js:33` rejects it because `offsetParent` is `null` for fixed elements. Verified
   empirically. A leanback home with a fixed top bar or side rail will hit this on day one.
   The project's own audit harness shares the bug (`audit.js:137`), so it will not report it.
   See **D-NAV-2**.

---

## 1. Structural map

### 1.1 `web/x3f-nav.js` — shape

A single IIFE, `"use strict"`, ES5 only (`var`, no arrow functions, no `let`). No build
step, no module system, no dependencies. 309 lines.

#### Globals it reads

| global | line | meaning |
| --- | --- | --- |
| `window.X3FNAV_CLASS` | 15 | page-supplied focus class name. When set, the module does **not** inject its own ring CSS. Only `launcher.html:88` / `index.html:88` set it (`'foc'`). |
| `window.__x3fNative` | 91 | set by the Android shell's `BOOTSTRAP` (`MainActivity.java:582`). Used to decide whether an overlay opening may steal focus. **Never true on the launcher** — the shell deliberately does not inject `BOOTSTRAP` there (`MainActivity.java:135-141`, `isLauncher()`). |
| `window.__x3fNav` | 283 | claimed only if not already defined. |

#### Globals it writes

| global | line | meaning |
| --- | --- | --- |
| `window.__x3fPageNav` | 284 | marker so tooling can tell whose nav is driving. Read by `tools/nav-audit/audit.js:58`. |
| `window.__x3fNav` | 285 | `function(dir)` — `'left' \| 'right' \| 'up' \| 'down' \| 'enter'`. Called by the native shell from `MainActivity.java:541`. |
| `window.X3FNav` | 302-308 | public API. |

#### Public API (`x3f-nav.js:302-308`)

```js
window.X3FNav = {
  refresh: refresh,                                   // rebuild the item list (subject to the 50 ms cache)
  focusFirst: function () { refresh(); setCursor(first()); },
  set: setCursor,                                     // seat the cursor; NO visibility check, ALWAYS smooth-scrolls
  current: function () { return cursor; },
  engaged: function () { return engaged; }
};
```

#### Module state

```js
var CUR = window.X3FNAV_CLASS || 'x3f-nav-cur';   // 15
var OWN_RING = !window.X3FNAV_CLASS;              // 16
var items = [], cursor = null, engaged = false, justScoped = false;   // 17
var SCOPES = '.coach.show,.rest.show,.scrim.show,.modal.show,[data-nav-scope]';  // 53
var scope = null;                                 // 54
var lastBuild = 0;                                // 73
var padOn = false, held = {}, nextAt = {};        // 246
```

`items` is the module's only cache. `scope` is the element (or `document`) the item list
was built from. `lastBuild` is a `performance.now()` timestamp. `engaged` latches `true`
forever on the first key/remote input and never resets.

#### The DOM contract — four data attributes

| attribute | read at | meaning |
| --- | --- | --- |
| `data-nav` | 81, 234, 241 | this element is a focus target. Any tag; no `tabindex` required (but see **D-NAV-9**). |
| `data-nav-first` | 116 | preferred landing spot in the current scope. Flat `filter` over `items`, first match in DOM order wins. Not scope-qualified. |
| `data-nav-scope` | 53 | declares an element as a modal scope root, unconditionally (no `.show` requirement). |
| `data-nav-back` | 199 | element to `.click()` on Escape / Backspace / gamepad B. Looked up with `document.querySelector`, i.e. **globally, ignoring scope**. |

Current users of these attributes (from `grep`):

* `launcher.html` / `index.html`: 22 `[data-nav]` items at rest (measured) — `#barChip`,
  5 `.pill` band buttons, 11 `.card` game tiles, `#updBtn`, the music button injected by
  `x3f-music.js:251`, and 2 buttons inside `#finder`. `data-nav-first` appears **twice**:
  `#rescanBtn` (in the scrim) and card 0 (`launcher.html:167`).
* `routine.html`: ~55 items across 5 UI states. `data-nav-first` on `#startSession`
  (line 177) and `#cPlay` (line 221). `data-nav-back` on the "All games" anchor (line 172).
* `library.html`: `data-nav-back` on "Home" (line 84); per-exercise `<select data-nav>` and
  `<a class="gm" data-nav>` built at lines 109 / 114.
* `progress.html`: `data-nav-first` on the "Routines" link (line 133); `data-nav-back` on
  "All games" (line 135); dynamically-built `[data-del]` and `[data-f]` buttons
  (lines 300, 314).
* `web/index.html`: `data-nav` on all 12 hub cards, `data-nav-first` on card 0 (line 63).
  **No `data-nav-back`.**

#### Injected CSS (`x3f-nav.js:20-28`)

```js
'[data-nav]{scroll-margin:26px}' +
'[data-nav]:focus{outline:none}' +
(OWN_RING ? '.' + CUR + '{position:relative;z-index:2;' +
  'box-shadow:0 0 0 2px var(--navring,#2ff0b0),0 12px 34px rgba(0,0,0,.45)!important;' +
  'border-color:var(--navring,#2ff0b0)!important}' : '') +
'@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}'
```

Note that `[data-nav]:focus{outline:none}` is **unconditional** while the replacement ring
is **conditional** on `OWN_RING`.

#### Function-by-function

| function | lines | contract |
| --- | --- | --- |
| `visible(el)` | 31-48 | `false` if `disabled`, `aria-hidden="true"`, `!offsetParent`, rect ≤ 1px, or **any ancestor up to and including `<body>`** has `visibility:hidden`, `display:none`, `opacity < 0.05`, or `pointer-events:none`. This is the ancestor walk `HANDOFF.md:163` was written for. |
| `boxed(el)` | 55-60 | cheap "is this overlay actually open" test. Checks only the element itself: rect ≥ 4px, `display`, `visibility`, `opacity ≥ 0.05`. **Does not check `pointer-events` and does not walk ancestors** — deliberately asymmetric with `visible()`. |
| `scopeRoot()` | 61-65 | `document.querySelectorAll(SCOPES)`, iterate **backwards**, return the first `boxed()` match, else `document`. "Topmost" means *last in DOM order*, not by `z-index`. |
| `nowMs()` | 74 | `performance.now()` with a `Date.now()` fallback. |
| `refresh()` | 76-97 | the 50 ms cache + rebuild + cursor validation + scope-change landing. Returns the internal `items` array by reference. |
| `mid(r)` | 98 | rect centre. |
| `setCursor(el, scroll)` | 101-111 | swap the `CUR` class, `el.focus({preventScroll:true})` inside try/catch, then `scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'})` unless `scroll === false`. |
| `first()` | 114-118 | `items.filter(hasAttribute('data-nav-first'))[0] || items[0]`. Documented as "must not call `refresh()`". |
| `move(dir)` | 121-162 | the geometry engine. See §1.3. |
| `scrollHost(el)` | 165-172 | nearest ancestor with `overflowY` matching `/(auto\|scroll)/` **and** `scrollHeight > clientHeight + 2`; else the document scroller if it scrolls; else `null`. |
| `scrollPage(dir)` | 173-183 | scroll the host by `0.75 × viewport`, smooth. Returns `false` if already at the limit. |
| `activate()` | 185-189 | `cursor.click()`. The `SELECT` branch is functionally identical to the general branch (see **D-NAV-13**). |
| `stepSelect(el, d, wrap)` | 190-197 | change `selectedIndex`, dispatch a bubbling `change` event. **No `input` event.** |
| `back()` | 198-202 | `[data-nav-back]` click → `history.back()` → `location.href='index.html'`. |
| `typing(e)` | 205-208 | `INPUT`, `TEXTAREA`, `isContentEditable`. Nothing else. |
| `handle(dir)` | 209 | `engaged = true; move(dir);` |
| keydown listener | 211-230 | see §1.4. |
| `pointerover` listener | 233-239 | moves the cursor on hover. Checks `visible(el)` but **not scope**. Does **not** call `focus()` or scroll. |
| `focusin` listener | 240-243 | promotes any browser-driven focus to the cursor. Checks **neither** `visible()` **nor** scope. |
| `pads()` / `pump()` | 247-269 | gamepad polling loop. |
| `resize` listener | 273 | unthrottled `refresh()`. |

#### Storage

`x3f-nav.js` and `x3f-fx.js` touch **no** storage at all — verified:
`grep -n "localStorage\|sessionStorage\|indexedDB"` returns nothing in either file.
For context, the keys the surrounding pages use are
`x3f_ach`, `x3f_band`, `x3f_bandMax`, `x3f_chal`, `x3f_cues`, `x3f_exCal`, `x3f_formOn`,
`x3f_history`, `x3f_music`, `x3f_prog`, `x3f_routine2`, `x3f_session`
(all via the `xget`/`xset` `'x3f_'+k` helper, e.g. `launcher.html:135-136`).
**A refactor of nav or fx has no persistence surface to migrate.**

### 1.2 The scoring rule (`x3f-nav.js:129-146`)

```js
var horiz = (dir === 'left' || dir === 'right');
var cr = cursor.getBoundingClientRect(), c = mid(cr);
var best = null, bestScore = Infinity;

items.forEach(function (el) {
  if (el === cursor) return;
  var r = el.getBoundingClientRect(), m = mid(r);
  var fwd = dir === 'left' ? c.x - m.x : dir === 'right' ? m.x - c.x
          : dir === 'up' ? c.y - m.y : m.y - c.y;
  if (fwd < 4) return;                              // not in that direction
  var overlap = horiz
    ? Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top)
    : Math.min(cr.right, r.right) - Math.max(cr.left, r.left);
  var cross = horiz ? Math.abs(m.y - c.y) : Math.abs(m.x - c.x);
  var score = fwd + cross * 2.2 + (overlap > 2 ? 0 : 4000);
  if (score < bestScore) { bestScore = score; best = el; }
});
```

Three constants govern everything: the `4` px direction threshold, the `2.2` cross-axis
weight, and the `4000` non-overlap penalty. **All are unnamed magic numbers.** Geometry is
computed in **viewport space** (`getBoundingClientRect`), not page space.

Then, in order:

```js
if (!best && (dir === 'up' || dir === 'down') && scrollPage(dir)) return;   // 152
if (!best) {                                                                // 156-160
  var i = items.indexOf(cursor);
  if (dir === 'right' || dir === 'down') best = items[i + 1] || items[0];
  else best = items[i - 1] || items[items.length - 1];
}
setCursor(best);                                                            // 161
```

Note the ordering consequence: because the `4000` penalty is *soft*, `best` is almost
always non-`null`, so **`scrollPage()` and the reading-order fallback almost never run**.

### 1.3 Input paths

There are **three** independent entry points, and they do not agree.

**A. Browser keydown** (`x3f-nav.js:211-230`)

```js
if (e.defaultPrevented || typing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
...
if (d) {
  if (cursor && cursor.tagName === 'SELECT' && (d === 'up' || d === 'down')) {
    stepSelect(cursor, d === 'down' ? 1 : -1); e.preventDefault(); return;
  }
  handle(d); e.preventDefault(); return;
}
if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
  if (cursor && cursor.tagName === 'SELECT') return;   // let the browser open it
  if (cursor) { activate(); e.preventDefault(); }
  return;
}
if (k === 'Escape' || k === 'Backspace' || k === 'BrowserBack') { back(); e.preventDefault(); }
```

**B. Native remote** (`x3f-nav.js:283-300`), called from `MainActivity.java:541`:

```js
window.__x3fNav = function (dir) {
  engaged = true;
  var c = cursor;
  if (dir === 'enter') {
    if (c && c.tagName === 'SELECT') stepSelect(c, 1, true); else activate();
    return;
  }
  move(dir);
};
```

Deliberate divergence, documented at lines 286-293: on the remote, Up/Down **must not**
step a `<select>`; OK cycles it instead. (The stated reason — "a page whose only focusable
control is a select — Progress" — is now **stale**: `progress.html` contains zero
`<select>` elements. Verified with `grep -c "<select"` → `0`.)

**C. Gamepad** (`x3f-nav.js:246-271`)

```js
var dirs = {
  left:  (b[14] && b[14].pressed) || ax < -0.55,
  right: (b[15] && b[15].pressed) || ax >  0.55,
  up:    (b[12] && b[12].pressed) || ay < -0.55,
  down:  (b[13] && b[13].pressed) || ay >  0.55
};
Object.keys(dirs).forEach(function (d) {
  if (!dirs[d]) { held[d] = false; return; }
  if (!held[d]) { held[d] = true; nextAt[d] = now + 380; handle(d); }
  else if (now >= nextAt[d]) { nextAt[d] = now + 130; handle(d); }
});
var ok = (b[0] && b[0].pressed), no = (b[1] && b[1].pressed);
if (ok && !held.ok) { held.ok = true; activate(); } else if (!ok) held.ok = false;
if (no && !held.no) { held.no = true; back(); } else if (!no) held.no = false;
```

Repeat: `380 ms` initial delay, `130 ms` thereafter. Deadzone `0.55`. `held` and `nextAt`
are shared across **all** connected pads.

### 1.4 `web/x3f-fx.js` — shape

Single IIFE, `"use strict"`, ES5. 253 lines. One `<canvas id="x3ffx">`, one `rAF` loop.

#### Public API (`x3f-fx.js:247-252`)

```js
var api = {
  mount: mount,        // mount({ image, quality })  -> api ; idempotent via #x3ffx check
  burst: burst,        // burst(x, y, colour)        -> ring pulse; null x/y = screen centre
  pulse: pulse,        // pulse(amount)              -> brief global "lift" for 900*amount ms
  leave: leave,        // leave(href)                -> fade body out, navigate after 190 ms
  quality: function (q) { if (q != null) { quality = q; seed(); grain = null; } return quality; },
  stats: function () { return { quality: quality, frameMs: Math.round(avg), motes: motes.length }; }
};
window.X3FFX = api;
```

#### Module state (`x3f-fx.js:57-60`)

```js
var cv, ctx, W = 0, H = 0, DPR = 1, img = null, imgOk = false;
var motes = [], bursts = [], grain = null;
var quality = 3;              // 3 everything, 2 no grain, 1 no motes, 0 still
var slowFrames = 0, lastT = 0, avg = 16, pulseT = 0, running = false, hidden = false, t0 = 0;
```

`reduced` is captured once at line 25 and never re-read.

#### Injected CSS (`x3f-fx.js:27-55`) — the full list

| rule | line | purpose | note |
| --- | --- | --- | --- |
| `#x3ffx{position:fixed;inset:0;z-index:0;pointer-events:none;display:block}` | 30 | the canvas | |
| `body>*:not(#x3ffx){position:relative;z-index:1}` | 31 | push page content above the canvas | **breaks every fixed modal — see D-FX-1** |
| `body{opacity:0;transition:opacity .34s cubic-bezier(.2,.9,.25,1)}` | 33 | page entrance | see **D-FX-2**, **D-FX-3** |
| `body.x3f-in{opacity:1}` | 34 | entrance done | |
| `body.x3f-out{opacity:0;transform:scale(.994);transition:opacity .22s ease,transform .22s ease}` | 35 | page exit | 220 ms vs the 190 ms navigate timer |
| `@keyframes x3f-ring` + `.x3f-nav-cur{animation:x3f-ring 2.2s ease-in-out infinite}` | 37-39 | breathing focus ring | **never visible — see D-FX-8** |
| `.x3f-nav-cur::after{...}` + `@keyframes x3f-sheen` | 41-44 | one sheen sweep on focus | inert on the launcher (class-name mismatch) |
| `.card,.ex,.pbrow,.today,.chal,.pstrip,.ach,.demobox,.method,.cwrap,.sheet,.rest,.coach{background-color:rgba(8,11,19,.80)}` | 48-49 | opaque ground for readability | hardcoded page class list — see **W-8** |
| `.rest,.coach{backdrop-filter:blur(12px)}` | 50 | | duplicates the page's own blur; see **D-FX-11** |
| `@media (prefers-reduced-motion:reduce){...}` | 51-52 | | |

#### The draw pipeline (`x3f-fx.js:97-177`), in order

```
dt   = min(0.05, (now - lastT)/1000)                    // 98   dt is CLAMPED at 50 ms
avg  = avg*0.9 + dt*1000*0.1                            // 99   EMA; therefore avg <= 50 always
degrade check                                           // 102-105
clearRect(0,0,W,H)                                      // 107  full screen
fillRect '#06070f'                                      // 111-112 full screen, opaque
lift = pulseT > now ? (pulseT-now)/900 : 0              // 113
1. aurora   drawImage(img, ..., W*sc, H*sc) @ alpha .34 // 116-123  full screen, scaled
   else     createLinearGradient + fillRect             // 125-129  full screen  (per frame)
2. motes    up to 70 × { arc + fill }  (quality >= 2)   // 133-143
3. bursts   globalCompositeOperation='screen', strokes  // 146-158
4. vignette createRadialGradient + fillRect             // 162-167  full screen  (per frame)
5. grain    createPattern + translate + fillRect(W+128,H+128) @ alpha .5  (quality >= 3)  // 169-176
```

Four full-screen fills plus a scaled full-screen blit, every frame, at every quality tier
except that grain and motes drop out.

#### The degrade ladder (`x3f-fx.js:101-105`)

```js
if (avg > 26) {
  slowFrames++;
  if (slowFrames > 45 && quality > 0) { quality--; slowFrames = 0; seed(); grain = null; }
} else slowFrames = Math.max(0, slowFrames - 1);
```

Tiers: `3` → drop grain → `2` → drop motes → `1` → drop aurora *drift* → `0`. One-way by
design ("do not climb back mid-session", line 101).

### 1.5 The surrounding system

**Who loads what.**

| page | `x3f-nav.js` | `x3f-fx.js` | focus class | mount timing |
| --- | --- | --- | --- | --- |
| `app/.../launcher.html` + `index.html` (byte-identical, verified) | line 93 | line 92 | `'foc'` (line 88) | synchronous, end of body script (line 281) |
| `app/.../routine.html` | 562 | 559 | default | `addEventListener("load", …)` (561) |
| `app/.../library.html` | 128 | 125 | default | `load` (127) |
| `app/.../progress.html` | 388 | 385 | default | `load` (387) |
| `web/index.html` | 148 | **absent** | default | — |
| `web/X3F_Routine/Library/Progress.html` | yes | yes | default | `load` |
| the 8 games | **never** | **never** | — | — |

`HANDOFF.md:41`: *"Don't add `x3f-nav.js` to a game — its Enter/Space handling would fight
Space-to-pull in the browser build."*

**The native bridge** (`app/src/main/java/com/goob/x3ftv/MainActivity.java`).

* `dispatchKeyEvent` (543-570) swallows every D-pad key and calls
  `web.evaluateJavascript("window.__x3fNav&&window.__x3fNav('" + dir + "')")` (541).
  `ACTION_UP` for the same keycodes is also swallowed (562-567), so the WebView never sees
  a `keydown` on the TV — **path A above is dead on the TV**.
* `KEYCODE_BACK` (553-557): if `overlayOpen` then call `window.__x3fCloseOverlay()`, else if
  on the launcher `moveTaskToBack`, else `web.loadUrl(LAUNCHER)`. `overlayOpen` is set only
  by the `X3F.setOverlay(boolean)` bridge (446). **Only the launcher ever calls it**
  (`launcher.html:248`) — see **D-INT-1**.
* `BOOTSTRAP` (580-241 of the text block) is injected in `onPageFinished` for every
  `file:` URL **except** the launcher (135-141). It installs a fallback spatial nav only
  `if(!window.__x3fNav)` (line 626 of the file), so on pages that load `x3f-nav.js` the
  fallback never installs. It sets `window.__x3fNative = true`.

**The audit harness** (`tools/nav-audit/`) is the existing safety net. It extracts the live
`BOOTSTRAP` out of `MainActivity.java` at staging time (`run.py:79-93`), stages the whole
bundle, appends `audit.js` + `cases.js`, and runs headless Chromium with
`--virtual-time-budget=45000 --dump-dom`. It reports `UNREACHABLE`,
`FOCUSED INVISIBLE`, `ESCAPED OVERLAY` and `dead ends`. **It has no viewport-containment
check** — see **W-1**.

### 1.6 CSS tokens the two modules depend on

`x3f-nav.js` and `x3f-fx.js` consume exactly **one** custom property:

* `--navring` — with a hardcoded fallback `#2ff0b0` in three places
  (`x3f-nav.js:25`, `x3f-nav.js:26`, `x3f-fx.js:37-38`).

It is defined by `library.html:13`, `progress.html:14`, `routine.html:16`
(all `#2ff0b0`) and `web/index.html:11` (`#2ee6a6`). **`launcher.html` never defines
`--navring`**, so on the launcher the fallback would apply — except that the launcher sets
`X3FNAV_CLASS='foc'`, so none of the `--navring` rules match anything there at all.

Everything else in both modules is a literal: `#06070f`, `rgba(4,6,12,.55)`,
`rgba(8,11,19,.80)`, `#39f5c4`, `26px` scroll margin, and so on. **There is no shared token
layer between the nav ring, the fx palette and the pages' `:root` blocks.**

---

## 2. Measurements

All numbers were produced by driving the real pages, or exact transcriptions of the real
draw calls, in Edge headless (`--headless --disable-gpu --no-sandbox`), i.e. under
software rasterisation. **Caveat:** this is a desktop CPU, not the Hisense. Android TV
WebView usually has GPU-accelerated canvas, so absolute numbers will differ. The *relative*
costs and the *ratios* are the load-bearing part, and they are fill-rate-bound work that a
low-end TV GPU is bad at.

### 2.1 fx frame cost, layer by layer

Each layer added cumulatively; `getImageData(0,0,1,1)` after every frame to force real
rasterisation; 40 frames per row, first frame discarded.

**1920 × 1080 backing store (DPR 1):**

```
baseline: flush only              0.00 ms/frame
clearRect only                    0.07 ms/frame
+ opaque ground fillRect          0.12 ms/frame   (+0.05)
+ aurora drawImage scaled         4.17 ms/frame   (+4.05)   <-- shed LAST
+ 70 motes                        4.20 ms/frame   (+0.03)   <-- shed 2nd
+ vignette (fresh gradient)       9.52 ms/frame   (+5.32)   <-- NEVER shed
+ vignette (cached gradient)      9.40 ms/frame   (+5.20)
FULL q3 (+grain)                 11.70 ms/frame   (+2.30)   <-- shed 1st
```

**3840 × 2160 backing store (DPR 2 — what a 4K TV gets, `x3f-fx.js:64`):**

```
clearRect only                    0.88 ms/frame
+ opaque ground fillRect          1.48 ms/frame
+ aurora drawImage scaled        18.98 ms/frame
+ 70 motes                       19.50 ms/frame
+ vignette                       39.52 ms/frame
FULL q3 (+grain)                 72.59 ms/frame   -> 13.8 fps
```

Two conclusions fall straight out:

* **The ladder is inverted.** It sheds `2.30 + 0.03 + ~0` ms and keeps `9.40` ms
  (1080p) — it can only ever recover **20%** of the cost. At DPR 2 the floor is
  `39.6 ms/frame` = **25 fps for the background alone**, before the page's own paint and
  before the launcher's second rAF loop.
* **Caching the gradient object saves nothing** (`9.52` → `9.40` ms). The cost is the
  full-screen gradient *fill*, not `createRadialGradient` (measured separately at
  `0.003 ms`). The fix is to stop filling a gradient that never changes — see **O-2**.

### 2.2 nav cost vs. item count

Exact transcription of `visible()` + `querySelectorAll('[data-nav]')` + the `move()` scoring
loop, over a grid of cards nested 3 levels deep, with layout invalidated between iterations
so the style/layout work is real. Desktop CPU.

```
n=11    refresh 0.19 ms   move 0.10 ms   total/keypress  0.29 ms
n=24    refresh 0.27 ms   move 0.20 ms   total/keypress  0.47 ms
n=60    refresh 0.71 ms   move 0.47 ms   total/keypress  1.17 ms
n=120   refresh 1.26 ms   move 0.92 ms   total/keypress  2.17 ms
n=240   refresh 2.54 ms   move 2.09 ms   total/keypress  4.63 ms
n=480   refresh 6.90 ms   move 4.57 ms   total/keypress 11.47 ms
```

Clean linear scaling, ~`0.024 ms` per item per keypress on a desktop core. A budget TV SoC
is commonly 5–10× slower on this kind of forced style/layout work, which puts a
**120-card leanback home at roughly 10–20 ms per D-pad press** and a **480-card home at
60–115 ms** — i.e. visible input lag before anything is even painted. The current launcher
(22 items) is nowhere near this; the overhaul target is.

### 2.3 The audit passes while the picker is off screen

```
> python tools/nav-audit/run.py launcher routine library progress
launcher    ok    (2 states)
routine     ok    (5 states)
library     ok    (1 states)
progress    ok    (1 states)
all screens clean
```

…while the same launcher, probed in the same browser, reports the bar picker at
`y = 941` on a `941 px` viewport. See **D-FX-1** and **W-1**.

---

## 3. Defects

Severity: **S1** = user-visible breakage on the shipped TV build; **S2** = user-visible on
some path or build; **S3** = latent / correctness debt; **S4** = cosmetic.

---

### D-FX-1 — S1 — `body>*:not(#x3ffx)` overrides `position:fixed` on every modal

**File:** `web/x3f-fx.js:31`

```js
'body>*:not(#x3ffx){position:relative;z-index:1}',
```

`:not(#x3ffx)` contributes the specificity of its argument, so this selector is
`(1,0,1)` — ID-level. It beats `.coach{position:fixed}` and `.scrim{position:fixed}`, which
are `(0,1,0)`, **regardless of source order**.

**Verified twice.** Minimal repro, headless Edge:

```
{"coach":"relative","scrim":"relative","fx":"fixed"}
```

Real `app/src/main/assets/launcher.html`, headless Edge at 1920×1080, after
`document.getElementById('barChip').click()`:

```
#x3ffx  pos=fixed    rect=0,0     1896x941
.wrap   pos=relative rect=0,0     1896x941
#finder pos=relative rect=0,941   1896x249   disp=flex     <-- entirely below the fold
.sheet  pos=static   rect=488,941 920x249
#rescanBtn pos=static rect=547,1107 221x49                 <-- 166 px below the fold
innerH=941  scrollY=0  bodyScrollH=1190
```

Real `app/src/main/assets/routine.html`:

```
bodyChildren=CANVAS#x3ffx | DIV.wrap | DIV#coach.coach | DIV#rest.rest | DIV#done.rest | SCRIPT ...
#x3ffx pos=fixed    rect=0,0    1896x941
.wrap  pos=relative rect=321,16 1240x1114
#coach pos=relative rect=16,1210 1849x514
#rest  pos=relative rect=16,1724 1849x408
#done  pos=relative rect=16,2132 1849x457
bodyScrollH=2617  innerH=941
```

**Failure scenario (launcher, on the TV).** The bar chip says "Bar not found · OK to pick"
after 9 s (`launcher.html:258`). The user presses OK. `activate()` clicks the chip →
`showFinder(true)` → `#finder` gets `.show` → `x3f-nav.js` scopes to it (`SCOPES` matches
`.scrim.show`) and seats the cursor on `#rescanBtn` (it carries `data-nav-first`,
`launcher.html:126`). On screen: **nothing changes** — `#finder` is laid out at `y=941` on a
`941 px` viewport, and `launcher.html:16` is `html,body{height:100%;overflow:hidden}` so the
page cannot scroll to it. The focus ring has vanished from the visible page. Left/Right/
Up/Down are trapped inside the invisible modal (correctly, per `scopeRoot()`), and OK on
`#rescanBtn` silently triggers a Bluetooth rescan the user did not ask for. The only escape
is BACK, which `MainActivity.java:553` routes to `__x3fCloseOverlay`. **Manual bar picking
is unusable on the TV.**

**Failure scenario (routine, on the TV).** "Start guided session" opens `.coach`. It is no
longer an overlay: it is a 514 px block appended after the 1114 px day list. The day list
stays fully visible and the dark backdrop covers nothing. Focus scopes to the coach and
`setCursor` smooth-scrolls the page down to it, so it *works*, but it reads as "the page
grew a section", not "a session started". Same for the rest timer and the session summary.

**Root cause.** The rule exists because `#x3ffx` is `position:fixed; z-index:0`, which
creates a stacking context that paints above non-positioned in-flow content. The fix is to
stop needing the rule (`#x3ffx{z-index:-1}` and let normal stacking work), not to broaden it.

---

### D-NAV-1 — S1 — the "same row" rule is a soft penalty, so the cursor escapes diagonally at every row edge

**File:** `web/x3f-nav.js:144`

```js
var score = fwd + cross * 2.2 + (overlap > 2 ? 0 : 4000);
```

`4000` is a *tie-breaker*, not a constraint. When nothing in the current row lies in the
requested direction, every out-of-row candidate gets `+4000` and they are then ranked
against each other — so a move **always** happens, and it happens diagonally.

**Verified** by seating the cursor on each of the 22 real launcher items in turn
(`X3FNav.set`) and pressing each direction through the real `window.__x3fNav`. Selected
results (full map captured; these are the failures):

```
card[Bloom]      -right-> barChip          # end of card row 1 -> top-right chip
card[Rhythm]     -right-> musicBtn         # end of card row 2 -> bottom bar
card[Calibrate]  -right-> musicBtn         # end of card row 3 -> bottom bar
pill[Elite Black]-right-> card[Splash]     # end of band row  -> into the grid, one column over
card[Flow]       -left->  updBtn           # start of card row 2 -> bottom bar
card[Library]    -left->  updBtn           # start of card row 3 -> bottom bar
barChip          -left->  card[Bloom]      # top-right chip -> middle of the card grid
updBtn           -left->  pill[White]      # bottom bar -> top band row
barChip          -up->    musicBtn         # top -> bottom
musicBtn         -down->  barChip          # bottom -> top
card[Bloom]      -up->    barChip          # skips the band row entirely
card[Nova]       -up->    pill[Black]      # ... while its neighbours do reach the band row
```

**Failure scenario.** On the TV, the user is on the last card of the top row (Bloom) and
presses Right expecting either nothing or the next row. The ring jumps to the Bluetooth
status chip at the top-right of the screen. Pressing Right again jumps to the music button
at the bottom. Two presses have crossed the entire screen twice. This is verbatim the bug
`HANDOFF.md:41` says was fixed in v0.6 ("Right off Workout → a grey band, Left off Nova →
Black") — the mechanism was mitigated for the specific launcher layout of the time, not
removed.

**Consequence for the overhaul.** `Right` at the end of a leanback row must either stop or
scroll the row. Neither is possible with a soft penalty: there is no code path that says
"no candidate in this row" because a candidate always wins.

---

### D-NAV-2 — S1 — a `position:fixed` `[data-nav]` element can never be focused

**File:** `web/x3f-nav.js:33`

```js
if (!el.offsetParent && el.tagName !== 'BODY') return false;
```

`HTMLElement.offsetParent` is `null` when the element's computed `position` is `fixed`.

**Verified** on the real launcher: a `position:fixed` `[data-nav]` button was appended to
`<body>` and the full 4-direction map re-run over all 23 items.

```
fixed btn offsetParent=null  rect(width)=120
FIXEDBTN seatable? true                 # X3FNav.set() has no visibility check
```

…and in the resulting 92-move map, **no item in any direction ever lands on
`BUTTON[FIXEDBTN]`**. It can be *seated* programmatically but never *reached*.

**Failure scenario.** The overhaul adds a fixed top bar (`Search` / `Profile` / `Settings`)
or a fixed left rail, which is the standard leanback shape. Every control in it is marked
`data-nav`, looks focusable, has a hover state — and the remote can never get to it. The
project's own audit will report the screen `ok`, because `audit.js:137` uses the identical
`!el.offsetParent` test in `seenVisible()`, so the fixed controls are excluded from
`expect` as well as from `reached`. **Double blind spot.**

---

### D-NAV-3 — S1 — any in-place re-render throws the cursor to the top of the page

**File:** `web/x3f-nav.js:85-95`

```js
items = [].slice.call(root.querySelectorAll('[data-nav]')).filter(visible);
if (cursor && items.indexOf(cursor) < 0) { cursor.classList.remove(CUR); cursor = null; }
if (root !== scope) {
  scope = root;
  if (!cursor && items.length && (engaged || window.__x3fNative)) {
    justScoped = true;
    setCursor(first());
  }
}
```

The cursor is dropped whenever it leaves the item list, but it is only **re-seated inside
the `root !== scope` branch**. When the DOM changes without the scope changing — the
overwhelmingly common case — the cursor is set to `null` and nothing replaces it.
`move()` then falls to line 127, `if (!cursor) { setCursor(first()); return; }`, which lands
on `[data-nav-first]`.

**Live trigger 1 — `progress.html:315`:**

```js
$('achFilters').querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
  achFilter = b.dataset.f; renderAch(); if (window.X3FNav) X3FNav.refresh()
});
```

`renderAch()` (line 314) does `$('achFilters').innerHTML = …`, destroying the very chip the
cursor is on. The explicit `X3FNav.refresh()` correctly clears the cursor and then does not
replace it.

**Failure scenario.** The user has scrolled to the achievements wall at the bottom of a very
long Progress page and presses OK on "Unlocked". The wall re-filters correctly — and the
focus ring disappears. The next D-pad press lands on `[data-nav-first]`, which on
`progress.html:133` is the **"Routines" link in the header at the very top of the page**,
and `setCursor` smooth-scrolls the whole page back up. The user has lost their place.

**Live trigger 2 — `progress.html:303`:** deleting a logged set calls the page's own
`refresh()`, which re-renders `#recent` and destroys the focused `✕` button. It does not
even call `X3FNav.refresh()`, so the cursor is a *detached node* until the next arrow press.

**Live trigger 3 — `launcher.html:252`:** `window.__x3fDevices(list)` re-renders
`#findList` while the picker is open, destroying whichever `.dev` button is focused.

---

### D-NAV-4 — S2 — the 50 ms cache skips the cursor-validity check, so `move()` can measure a detached or hidden element

**File:** `web/x3f-nav.js:76-85`

```js
function refresh() {
  var root = scopeRoot();
  var t = nowMs();
  if (root === scope && items.length && t - lastBuild < 50) return items;   // <-- early out
  lastBuild = t;
  items = […].filter(visible);
  if (cursor && items.indexOf(cursor) < 0) { cursor.classList.remove(CUR); cursor = null; }   // <-- skipped
  …
}
```

The early return at line 79 happens **before** the cursor-validity test at line 85. For up
to 50 ms after a DOM mutation the cursor can be a node that is detached or hidden, and
`move()` will call `getBoundingClientRect()` on it — which returns all zeros — and score
every candidate against the viewport origin.

**Verified.** In the launcher map, the two buttons inside the closed (`display:none`)
`#finder` were seated via `X3FNav.set()` and moved:

```
rescanBtn -down->  pill[White]
closeFind -down->  pill[White]
rescanBtn -right-> pill[White]
closeFind -right-> pill[White]
```

`pill[White]` is the top-left-most item on the page. That is exactly the signature of
`c = {x:0, y:0}`: with `cr` all zeros the vertical `overlap` is negative for every
candidate, so all get `+4000` and the score collapses to `m.y + 2.2·m.x`, minimised by the
item nearest the viewport origin.

**Failure scenario.** A row re-renders (a lazy image resolves, a badge count updates, a
"continue watching" strip refreshes) and the page calls `X3FNav.refresh()` within 50 ms of
the last build. The refresh is a **no-op** (see **D-NAV-5**), the cursor stays on a detached
node, and the next D-pad press teleports to the top-left of the screen with no explanation.

---

### D-NAV-5 — S2 — `X3FNav.refresh()`, the documented invalidation hook, can silently do nothing

**File:** `web/x3f-nav.js:79`, `web/x3f-nav.js:303`

`X3FNav.refresh` is exported as the "the DOM changed" API and is called at five sites
(`launcher.html:241`, `launcher.html:249`, `library.html:118`, `progress.html:315`,
`progress.html:378`, `routine.html:377`, `routine.html:438`). It is subject to the same
50 ms cache as an internal call. There is no `refresh(true)`, no `invalidate()`, no
generation counter.

**Failure scenario — already in the code.** `launcher.html:245-250`:

```js
function showFinder(on){
  $('finder').classList.toggle('show',!!on);
  if(on)renderDevices();                       // -> calls X3FNav.refresh()  (rebuild: scope changed)
  try{ if(window.X3F&&X3F.setOverlay)X3F.setOverlay(!!on); }catch(e){}
  if(window.X3FNav)X3FNav.refresh();           // -> NO-OP, < 50 ms since the rebuild
}
```

The second call is dead. It happens to be harmless here only because the first one already
did the work. Any caller that relies on the *second* refresh seeing a change made between
the two will be wrong.

---

### D-NAV-6 — S2 — `pointerover` moves the ring without moving DOM focus, so arrow keys can go dead

**File:** `web/x3f-nav.js:233-239`

```js
addEventListener('pointerover', function (e) {
  var el = e.target && e.target.closest && e.target.closest('[data-nav]');
  if (el && el !== cursor && visible(el)) {
    if (cursor) cursor.classList.remove(CUR);
    cursor = el; el.classList.add(CUR);
  }
}, { passive: true });
```

No `focus()`, no `scrollIntoView`. `document.activeElement` stays wherever it was. But the
keydown guard is:

```js
function typing(e) {
  var t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
```

`e.target` for a keydown is the **focused** element, not the cursor.

**Failure scenario.** On `progress.html`, the user clicks into a text field (the import
flow), then moves the mouse over a card. The ring moves to the card. They press ArrowDown.
`typing(e)` is `true` because the focused element is still the input, so the handler
returns immediately. **The ring is on a card and the arrow keys do nothing at all.** The
only recovery is clicking elsewhere first.

**Second failure.** `pointerover` does not check `scopeRoot()`. With a modal open, hovering
a control *behind* it moves the ring onto that control. Combined with **D-FX-1** (the modal
no longer covers anything), the control behind is also genuinely clickable.

---

### D-NAV-7 — S2 — `focusin` promotes any focus to the cursor with no visibility and no scope check

**File:** `web/x3f-nav.js:240-243`

```js
addEventListener('focusin', function (e) {
  var el = e.target && e.target.closest && e.target.closest('[data-nav]');
  if (el && el !== cursor) { if (cursor) cursor.classList.remove(CUR); cursor = el; el.classList.add(CUR); }
});
```

Compare `pointerover` (line 235), which does call `visible(el)`. This handler does not.

**Failure scenario.** Page code calls `.focus()` on a control inside a collapsed panel — a
completely ordinary thing to do when restoring state, or when a browser restores scroll and
focus on back-navigation. The cursor is now on a control the user cannot see, and the very
next OK press activates it. This is precisely the class of failure the module's own comment
at lines 36-39 exists to prevent:

> *"Without this the D-pad would happily focus - and OK would press - buttons nobody can
> see."*

`X3FNav.set()` (= `setCursor`, line 305) has the same hole, confirmed empirically in
**D-NAV-2** (`FIXEDBTN seatable? true`).

---

### D-NAV-8 — S2 — `back()` ignores the current scope and can navigate away from an open overlay

**File:** `web/x3f-nav.js:198-202`

```js
function back() {
  var b = document.querySelector('[data-nav-back]');
  if (b) { b.click(); return; }
  if (history.length > 1) history.back(); else location.href = 'index.html';
}
```

`document.querySelector` — not `scopeRoot().querySelector`.

**Failure scenario (browser build, `web/X3F_Routine.html`).** The guided coach is open. The
user presses Escape or Backspace expecting to close it. `back()` finds
`<a class="home" href="launcher.html" data-nav data-nav-back>All games</a>`
(`routine.html:172`) — which is *behind* the overlay — clicks it, and navigates off the page
mid-session. It is masked on the TV only because `MainActivity.java:553` intercepts
`KEYCODE_BACK` before the WebView sees it.

---

### D-NAV-9 — S2 — Backspace is bound to `back()` and `typing()` does not cover enough

**File:** `web/x3f-nav.js:229`, `web/x3f-nav.js:205-208`

```js
if (k === 'Escape' || k === 'Backspace' || k === 'BrowserBack') { back(); e.preventDefault(); }
```

`typing()` excludes only `INPUT`, `TEXTAREA` and `isContentEditable`. It does not exclude
`SELECT`, `role="textbox"`, `role="searchbox"`, or a custom on-screen-keyboard widget.

**Failure scenario.** The cursor is on `routine.html:181`'s `<select id="restSel" data-nav>`
and the user presses Backspace. Instead of the browser's select behaviour they get
`back()` → the "All games" link → the whole page is abandoned.

---

### D-NAV-10 — S2 — the keyboard path traps the cursor on a `<select>` vertically

**File:** `web/x3f-nav.js:219-221`

```js
if (cursor && cursor.tagName === 'SELECT' && (d === 'up' || d === 'down')) {
  stepSelect(cursor, d === 'down' ? 1 : -1); e.preventDefault(); return;
}
```

`stepSelect` is called without `wrap`, so it clamps at the ends — and it never falls through
to `move()`. The remote path deliberately avoids this (lines 286-293) but the keyboard path
still has it.

**Failure scenario.** `library.html:109` puts a `<select data-nav>` in each exercise header,
with the `<a class="gm" data-nav>` game links directly below (line 114). A keyboard user on
the select presses Down to reach the game links. Instead the band value changes. Down again:
changes again. At the last option it clamps and **nothing happens at all** — the key is
`preventDefault`ed and swallowed. The user must discover that Left or Right is the escape.

---

### D-NAV-11 — S2 — the gamepad polling loop never stops

**File:** `web/x3f-nav.js:246`, `268`, `270-271`

```js
var padOn = false, held = {}, nextAt = {};
…
if (any || padOn) requestAnimationFrame(pump);
…
addEventListener('gamepadconnected', function () { if (!padOn) { padOn = true; requestAnimationFrame(pump); } });
if (pads().length) { padOn = true; requestAnimationFrame(pump); }
```

`padOn` is only ever assigned `true`. There is no `gamepaddisconnected` handler. Once a pad
has been seen even once, `pump()` re-schedules itself **forever**, calling
`navigator.getGamepads()` (which allocates a fresh `GamepadList` snapshot) 60 times per
second for the life of the page.

**Failure scenario.** The user pairs a controller, plays, and unplugs it. The launcher then
burns a full 60 fps rAF callback plus a `getGamepads()` snapshot per frame, **in addition
to** the fx loop and the launcher's own `meter()` loop, on a TV SoC that is already
struggling (see §2.1).

---

### D-NAV-12 — S3 — `resize` is unthrottled and can move the cursor as a side effect

**File:** `web/x3f-nav.js:273`

```js
addEventListener('resize', function () { refresh(); });
```

Every resize event forces a full rebuild — `querySelectorAll` plus one `getComputedStyle`
per ancestor per item (§2.2: `6.9 ms` at 480 items on a desktop). And because `refresh()`
contains the scope-change landing logic (lines 86-95), a resize that changes which overlay
is `boxed()` will silently **move the focus ring**.

---

### D-NAV-13 — S4 — the `SELECT` branch of `activate()` is dead code

**File:** `web/x3f-nav.js:185-189`

```js
function activate() {
  if (!cursor) { setCursor(first()); return; }
  if (cursor.tagName === 'SELECT') { try { cursor.click(); } catch (e) {} return; }
  cursor.click();
}
```

The two branches do the same thing. The only difference is a `try/catch`. It reads as if
selects are handled specially here; they are not — they are handled at line 225 (keyboard,
bail out) and line 295 (remote, `stepSelect`). A reader will trust the wrong line.

---

### D-NAV-14 — S3 — `scopeRoot()` means "last in DOM order", not "topmost"

**File:** `web/x3f-nav.js:61-65`, comment at 49-52

```js
/* … Topmost open overlay wins. */
function scopeRoot() {
  var open = document.querySelectorAll(SCOPES);
  for (var i = open.length - 1; i >= 0; i--) if (boxed(open[i])) return open[i];
  return document;
}
```

`querySelectorAll` returns document order. `z-index` is never consulted. It happens to be
correct today only because `routine.html` declares `#rest` (z-index 60) before `#done`
(also `.rest`, z-index 60) and the launcher has one scrim.

Worse for the overhaul: `[data-nav-scope]` is in the same flat selector list with **no
`.show` requirement**, so a permanently-present `data-nav-scope` container that happens to
sit later in the DOM than an open overlay would win the scope. Marking leanback rows with
`data-nav-scope` — the obvious thing to reach for — would break every modal on the page.

---

### D-NAV-15 — S3 — `boxed()` is weaker than `visible()`, which can strand the cursor

**File:** `web/x3f-nav.js:55-60`

```js
function boxed(el) {
  var r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  var cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) >= 0.05;
}
```

No ancestor walk, no `pointer-events` check — while `visible()` (line 40-46) does both.

**Failure scenario.** A `[data-nav-scope]` (or `.modal.show`) sits inside a wrapper that is
mid-fade at `opacity:0.3` on the wrapper and `opacity:1` on itself. `boxed()` accepts it as
the scope; `visible()` then rejects every one of its children because of the ancestor
opacity. `items` is `[]`, `refresh()` clears the cursor, `move()` returns at line 124 with
`!items.length`. **The remote is completely dead** with no ring on screen and no way out
except BACK.

---

### D-NAV-16 — S3 — `X3FNav.set()` always smooth-scrolls, and there is no non-scrolling seat

**File:** `web/x3f-nav.js:101-111`, `web/x3f-nav.js:305`

`setCursor(el, scroll)` scrolls unless `scroll === false`, and `X3FNav.set` is exported as
the bare function, so every external caller gets a queued smooth scroll. The project's own
audit had to monkey-patch this to survive (`tools/nav-audit/audit.js:26-39`):

```js
// headless has no compositor: let opacity transitions land instantly, and make
// scrolling instant too. Hundreds of queued smooth-scroll animations under
// --virtual-time-budget will eat the entire allowance and the walk never
// reaches its own report.
```

That is a test harness working around an API wart. A restore-focus-after-render helper
(the fix for **D-NAV-3**) needs exactly the missing "seat without scrolling" call.

---

### D-NAV-17 — S3 — `refresh()` returns the live internal array

**File:** `web/x3f-nav.js:79`, `96`

Both `return items;` statements hand out the module's own array by reference, and
`X3FNav.refresh` is public. A caller doing `X3FNav.refresh().sort(...)` would silently
reorder the nav's reading-order fallback (lines 156-160).

---

### D-NAV-18 — S3 — gamepad repeat state is shared across pads and collides with the button flags

**File:** `web/x3f-nav.js:246`, `259-266`

`held` and `nextAt` are module-level and the loop iterates every connected pad, so two
controllers fight over the same repeat timers. `held.ok` and `held.no` live in the same
object as `held.left/right/up/down`, so a direction key named `ok` would collide. With two
pads connected, holding Right on pad 1 and tapping Right on pad 2 produces one merged
repeat stream.

---

### D-NAV-19 — S4 — the remote's `stepSelect` fires `change` but not `input`

**File:** `web/x3f-nav.js:196`

```js
el.dispatchEvent(new Event('change', { bubbles: true }));
```

Any page listening on `input` (the modern default for live-updating UI) will not react to a
value the remote changed.

---

### D-NAV-20 — S4 — stale comment: "a page whose only focusable control is a select - Progress"

**File:** `web/x3f-nav.js:290-292`

`progress.html` contains **zero** `<select>` elements (`grep -c "<select"` → `0`); the filter
is now a row of `.chip` buttons (`progress.html:314`). The justification for the
remote/keyboard divergence is now unverifiable from the code it points at.

---

### D-FX-2 — S1 — a decorative module can leave the entire page at `opacity:0`

**File:** `web/x3f-fx.js:33` (injected first) vs `web/x3f-fx.js:212` (added last)

```js
function mount(o) {
  o = o || {};
  if (document.getElementById('x3ffx')) return api;
  css();                                                     // 189  injects body{opacity:0}
  cv = document.createElement('canvas');
  cv.id = 'x3ffx';
  ctx = cv.getContext('2d');                                 // 191  can return null
  (document.body || document.documentElement).insertBefore(cv, document.body.firstChild);
  …
  resize();                                                  // 204  ctx.setTransform -> throws if ctx is null
  …
  document.body.classList.add('x3f-in');                     // 212  the ONLY thing that restores opacity
```

Every call site is `try{ X3FFX.mount(...) }catch(e){}` (`launcher.html:281`,
`routine.html:561`, `library.html:127`, `progress.html:387`), so the exception is swallowed
and nothing is logged.

**Failure scenario.** On a WebView under memory pressure, or after a GPU-process restart,
`canvas.getContext('2d')` returns `null`. `resize()` throws at `ctx.setTransform(...)`
(line 67). `mount()` never reaches line 212. `body{opacity:0}` stands. **The entire app is a
black screen**, with a working D-pad the user cannot see. A background decoration must not
be able to hide the application.

---

### D-FX-3 — S2 — the page entrance fade never runs, anywhere

**File:** `web/x3f-fx.js:33-34`, `212`

`body{opacity:0}` is injected and `body.x3f-in{opacity:1}` is applied **in the same
synchronous task**. There is no style resolution between them, so the browser resolves
`opacity: 1` directly and no transition is generated.

**Verified** on the real `routine.html`:

```
body class=x3f-in opacity=1 transition=opacity
```

The class is on, the opacity is already 1, and there is no intermediate state. The
`ROADMAP.md:117` claim — *"page changes fade instead of snapping"* — is half true: only the
**exit** (`leave()`, line 218-223) works. Every menu page mounts inside
`addEventListener("load", …)`, and the launcher mounts synchronously at the end of its body
script; both are single-task.

---

### D-FX-4 — S1 — the degrade ladder sheds the cheapest layers and keeps the most expensive

**File:** `web/x3f-fx.js:59`, `101-105`, and the header comment at lines 12-14

```js
var quality = 3;              // 3 everything, 2 no grain, 1 no motes, 0 still
…
if (avg > 26) {
  slowFrames++;
  if (slowFrames > 45 && quality > 0) { quality--; slowFrames = 0; seed(); grain = null; }
} else slowFrames = Math.max(0, slowFrames - 1);
```

Header comment (lines 12-14):

> *"It gives frames back when it cannot afford them. The loop watches its own cost and sheds
> work in order - grain, then motes, then aurora drift - so a slow device degrades to a still
> backdrop instead of a stutter."*

Measured cost of each layer (§2.1, 1080p): grain `2.30 ms`, motes `0.03 ms`, aurora drift
`~0 ms` (the drift only perturbs the scale factor; the `drawImage` still happens at every
tier). The layers it **never** sheds: the aurora blit `4.05 ms` and the vignette gradient
fill `5.20 ms`.

**Failure scenario.** The Hisense drops to 15 fps. `avg` climbs. Nine seconds later (two
tiers × 45 slow frames at 15 fps ≈ 6 s, plus the third tier) the ladder bottoms out at
`quality = 0` — and the loop still costs `9.40 ms/frame` at 1080p, or `39.6 ms/frame` at
DPR 2. The device is still dropping frames, the ladder has nothing left to give, and the
`quality` floor of `0` still draws four full-screen passes. **There is no "stop" tier.**

Two secondary problems in the same block:

* `dt` is clamped at `0.05` (line 98), so `avg` can never exceed `50`. A device at 5 fps and
  a device at 20 fps report the same `avg`, so the ladder cannot skip tiers under severe
  load — it always steps one at a time.
* `slowFrames > 45` is a *frame* count, not a *time* budget. The slower the device, the
  longer each tier takes to trip. At 10 fps that is 4.5 s per tier — the worst case gets the
  slowest response.

---

### D-FX-5 — S2 — `bursts` are never shed by the ladder, and they change composite mode

**File:** `web/x3f-fx.js:236-244`, `146-158`

```js
function burst(x, y, colour) {
  if (quality < 1) return;
  …
  if (bursts.length > 6) bursts.shift();
}
```

`quality < 1` is only true at the very bottom tier. So bursts survive `quality = 2` and
`quality = 1`, i.e. the entire degrade ladder except the floor. Each frame with a live burst
does `ctx.save()`, `globalCompositeOperation = 'screen'`, N stroked arcs, `ctx.restore()`
(lines 147-157) — a composite-mode change is one of the more expensive canvas state changes
on a tile-based mobile GPU.

Also, the cap is applied after the push, so the array can hold 7, and `shift()` removes the
oldest — which is the one about to expire anyway, so the cap does nothing useful under
burst-spam.

---

### D-FX-6 — S2 — the achievement celebration never fires on page load

**File:** `app/src/main/assets/progress.html:373-380` vs `385-387`

```js
function refresh(){
  try{
    const fresh=P.checkAchievements();
    if(fresh.length){ try{ X3FFX.burst(null,null,'#ffd35c'); X3FFX.pulse(1); }catch(e){} }
  }catch(e){}
  …
}
refresh();                                        // line 380 — runs at parse time
</script>
…
<script src="x3f-fx.js"></script>                 // line 385 — loaded AFTER
<script>addEventListener("load",function(){try{X3FFX.mount({image:"assets/ui/aurora.jpg"});}catch(e){}});</script>
```

At line 380, `window.X3FFX` is `undefined`. The `try/catch` swallows the `ReferenceError`.

**Failure scenario.** The user finishes a session, opens Progress, and unlocks three
achievements. The badge wall updates, but the gold burst and the ambient lift — the entire
celebration — silently do not happen. Only *later* in-page refreshes (import, mark
challenge, delete a set, reset) get the effect. Note that even then, `mount()` runs on
`load`, so `W`/`H` are `0` until then and `r1 = Math.min(W,H)*0.42 = 0` (line 240) would
produce a zero-radius ring.

---

### D-FX-7 — S2 — `wireLinks()` breaks Ctrl-click / middle-click and hijacks non-http schemes

**File:** `web/x3f-fx.js:224-234`

```js
function wireLinks() {
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(https?:|mailto:)/.test(href) || a.target) return;
    e.preventDefault();
    pulse(0.5);
    leave(href);
  }, true);
}
```

Not checked: `e.metaKey`, `e.ctrlKey`, `e.shiftKey`, `e.button`, `e.defaultPrevented`,
`a.hasAttribute('download')`. Not excluded from the scheme test: `tel:`, `sms:`, `blob:`,
`data:`, `javascript:`.

**Failure scenario (browser build).** On `web/X3F_Library.html` the user Ctrl-clicks a game
card to open it in a new tab. `preventDefault()` fires, the current page fades out, and
190 ms later `location.href` replaces the page they were on. The new tab never opens and
they lose their place. Middle-click behaves the same.

**Second scenario.** Because the listener is in the **capture** phase on `document` but does
not `stopPropagation()`, a page handler that already handled the click still runs — and then
fx navigates anyway 190 ms later.

---

### D-FX-8 — S2 — the "focus that reads across a room" ring animation is inert on every page

**File:** `web/x3f-fx.js:37-39` vs `web/x3f-nav.js:24-26`

fx defines:

```js
'@keyframes x3f-ring{0%,100%{box-shadow:0 0 0 2px var(--navring,#2ff0b0),0 10px 30px rgba(0,0,0,.45)}',
'50%{box-shadow:0 0 0 3px var(--navring,#2ff0b0),0 0 26px -2px var(--navring,#2ff0b0),0 12px 34px rgba(0,0,0,.5)}}',
'.x3f-nav-cur{animation:x3f-ring 2.2s ease-in-out infinite}',
```

nav defines (when `OWN_RING`, i.e. everywhere except the launcher):

```js
'.' + CUR + '{position:relative;z-index:2;' +
  'box-shadow:0 0 0 2px var(--navring,#2ff0b0),0 12px 34px rgba(0,0,0,.45)!important;' +
```

Per the CSS cascade, `!important` author declarations **override CSS animations**. So on
`routine.html`, `library.html`, `progress.html` and `web/index.html` the animation runs but
its `box-shadow` output is discarded.

**Verified** on the real `routine.html`:

```
cursor=startSession
animationName=x3f-ring
boxShadow=rgb(47, 240, 176) 0px 0px 0px 2px, rgba(0, 0, 0, 0.45) 0px 12px 34px 0px
```

The reported blur/offset (`0 12px 34px`) is **nav's** value, not the keyframe's
(`0 10px 30px`). The animation is running and losing.

On the launcher the failure is different and total: `X3FNAV_CLASS = 'foc'`
(`launcher.html:88`), so the focused element gets class `foc`, and fx's selectors target
`.x3f-nav-cur`. **Neither the breathing ring nor the `::after` sheen ever matches anything
on the launcher.**

Net: the marquee visual of the v1.7 pass (`ROADMAP.md:115-117`) is dead on all four menu
pages, in two different ways.

---

### D-FX-9 — S3 — the `(document.body || document.documentElement)` fallback is unreachable

**File:** `web/x3f-fx.js:192`

```js
(document.body || document.documentElement).insertBefore(cv, document.body.firstChild);
```

If `document.body` is null, the *argument* `document.body.firstChild` throws before the
fallback parent is ever used. The guard cannot work. Combined with **D-FX-2**, an early
`mount()` produces a permanently invisible page.

---

### D-FX-10 — S3 — `resize` is unthrottled and reallocates the canvas backing store

**File:** `web/x3f-fx.js:62-69`, `205`

```js
function resize() {
  if (!cv) return;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  seed(); grain = null;
}
…
addEventListener('resize', resize);
```

Writing `cv.width` reallocates and clears the entire backing store — up to
`3840 × 2160 × 4 bytes ≈ 33 MB` at DPR 2. No debounce, no equality check
(`if (W === innerWidth && H === innerHeight) return;`).

**Failure scenario.** An Android TV soft keyboard or system bar animates in, firing a
resize per frame for ~250 ms. That is ~15 full 33 MB texture reallocations plus 15 mote
reseeds plus 15 grain regenerations, on the frame budget of a device that is already
degrading.

---

### D-FX-11 — S2 — a full-screen `backdrop-filter` is layered on top of a live canvas

**File:** `web/x3f-fx.js:50`

```js
'.rest,.coach{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}',
```

`routine.html:76` and `routine.html:113` already declare `backdrop-filter:blur(10px)` on the
same elements, so this only changes 10 px to 12 px — but it re-asserts that a **full-screen
blur of a continuously-repainting canvas** is required. Every frame the compositor must
re-snapshot the backdrop (which changed, because fx just redrew it) and re-run a 12 px
Gaussian over the whole screen. On a low-end TV GPU this is plausibly the single most
expensive line in the app, and it stacks directly on top of the §2.1 numbers.

The degrade ladder has no lever over it — it is CSS, and `quality` only controls canvas work.

---

### D-FX-12 — S3 — `hidden` is not initialised from the current visibility state

**File:** `web/x3f-fx.js:60`, `206-208`

```js
var … hidden = false, …
…
document.addEventListener('visibilitychange', function () {
  hidden = document.visibilityState !== 'visible';
});
```

If the page is mounted while hidden (a background tab, or a WebView created behind another
activity), `hidden` stays `false` until the first `visibilitychange`, and the loop draws
full frames into something nobody can see. Should be
`hidden = document.visibilityState !== 'visible';` at mount.

---

### D-FX-13 — S4 — returning from hidden injects a bogus frame-time sample and pops the animation

**File:** `web/x3f-fx.js:179-183`, `98-99`

```js
function loop(now) {
  if (!running) return;
  if (!hidden) draw(now);
  requestAnimationFrame(loop);
}
```

`lastT` is only updated inside `draw()`. After a hidden period, the first visible frame
computes `dt = min(0.05, huge)` = `0.05`, so `avg` takes a `50 ms` sample and nudges
`slowFrames` toward a spurious degrade. And `t = (now - t0)/1000` has advanced by the whole
hidden interval, so the aurora offset and the grain translation jump — a visible pop when
the user returns to the app.

---

### D-FX-14 — S4 — `leave()` navigates 30 ms before the exit transition finishes

**File:** `web/x3f-fx.js:35` (`transition:opacity .22s`) vs `web/x3f-fx.js:222`
(`setTimeout(..., 190)`).

---

### D-FX-15 — S4 — `reduced` is sampled once and `mount({quality})` silently defeats it

**File:** `web/x3f-fx.js:25`, `194-195`

```js
try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
…
if (reduced) quality = 1;
if (o.quality != null) quality = o.quality;
```

No `addEventListener('change', …)` on the media query, and an explicit `quality` overrides
the accessibility preference rather than being clamped by it.

---

### D-FX-16 — S4 — 70 motes allocate two strings per mote per frame

**File:** `web/x3f-fx.js:140`

```js
ctx.fillStyle = 'rgba(200,235,255,' + tw.toFixed(3) + ')';
```

`toFixed` allocates a string, the concatenation allocates another, and the canvas must
re-parse the colour — 140 allocations and 70 colour parses per frame. Measured cost of the
whole mote layer is only `0.03 ms/frame` of *rasterisation*, so the GC pressure is the real
story here, not the fill.

---

### D-INT-1 — S1 — `routine.html` never tells the shell an overlay is open, so BACK abandons the session

**Files:** `app/src/main/java/com/goob/x3ftv/MainActivity.java:446`, `553-557`;
`app/src/main/assets/routine.html:436`, `503`, `538`

```java
@JavascriptInterface public void setOverlay(boolean open) { overlayOpen = open; }
…
case KeyEvent.KEYCODE_BACK:
    if (overlayOpen) {
        overlayOpen = false;
        web.evaluateJavascript("window.__x3fCloseOverlay&&window.__x3fCloseOverlay()", null);
    } else if (isLauncher(currentUrl)) { moveTaskToBack(true); } else { web.loadUrl(LAUNCHER); }
    return true;
```

`grep -rn "setOverlay\|__x3fCloseOverlay" app/src/main/assets/*.html` returns hits **only in
`launcher.html` and `index.html`**. `routine.html` opens three overlays
(`$('coach').classList.add('show')` line 436, `$('done')` line 503, `$('rest')` line 538) and
declares neither `setOverlay` nor `__x3fCloseOverlay`.

**Failure scenario.** The user is three lifts into a guided session. The coach is open. They
press BACK intending to close the coach. `overlayOpen` is `false`, `isLauncher` is `false`,
so `web.loadUrl(LAUNCHER)` fires: **the whole page is destroyed and the app jumps to the
home screen mid-workout.** There is no way to dismiss the guided coach with the remote's
BACK button, and `x3f-nav.js`'s own `back()` never runs because `dispatchKeyEvent` consumed
the key.

---

### D-INT-2 — S3 — the launcher runs two rAF loops, contradicting the stated design

**File:** `app/src/main/assets/launcher.html:269-272`

```js
const mfill=$('mfill'),mval=$('mval');
function meter(){ let f=+window.__x3fForce||0; const pct=Math.max(0,Math.min(100,f/ref()*100));
  mfill.style.width=pct+'%'; mval.textContent=Math.round(f); requestAnimationFrame(meter); }
requestAnimationFrame(meter);
```

`launcher.html:278-280` and `ROADMAP.md:110-111` both claim the launcher "went from two
loops to one". It did not: `X3FFX`'s loop and `meter()`'s loop both run. `meter()` writes
`style.width` and `textContent` **every frame regardless of whether the value changed**,
invalidating layout for `.mfill` 60 times a second even when the bar is disconnected and
`__x3fForce` is a constant `0`. Add **D-NAV-11**'s zombie gamepad loop and a page that is
supposed to have one loop can be running three.

---

### D-INT-3 — S3 — `web/index.html` diverges from the TV launcher and is not covered by the sync tool

**Files:** `web/index.html:148`; `tools/sync-from-web.py:36-51`

`web/index.html` loads `x3f-nav.js` but **not** `x3f-fx.js` — so the web hub has no ambient
layer, no page transition, no card burst on select. Meanwhile
`app/src/main/assets/launcher.html` and `app/src/main/assets/index.html` are byte-identical
duplicates of each other (verified with `diff -q`) and appear in **neither** the `GAMES` nor
the `MENUS` map in `sync-from-web.py`, so they are hand-maintained. Three near-identical
launcher documents, one sync tool that manages none of them.

---

### D-INT-4 — S3 — the service worker precache list is missing every script added since v0.6

**File:** `web/sw.js:2`

```js
const A=['index.html', … ,'x3f-exercises.js','x3f-form.js','x3f-nav.js','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png'];
```

Missing: `x3f-fx.js`, `x3f-progress.js`, `x3f-music.js`, `x3f-hype.js`, `x3f-set.js`,
`x3f-cal.js`, and the whole `assets/` tree (including `assets/ui/aurora.jpg`, which does
exist in `web/assets/ui/` — verified). The runtime handler at line 5-6 does cache-on-fetch,
so a warm visitor is fine, but a **cold offline first-run of the installed PWA has no
ambient layer and no aurora**, and the `catch(() => caches.match('index.html'))` fallback
will serve HTML for a missing `.js` request.

---

## 4. Design weaknesses and opportunities, ranked

Ranked by (impact on the leanback overhaul) × (cost of fixing later).

---

### W-1 — the nav audit has no viewport-containment check, so it certifies invisible UI

`tools/nav-audit/audit.js` checks reachability (`missing`), invisible-focus (`strays`) and
overlay escape (`outside`). It never asks *"is this control inside the viewport, and can the
user scroll to it?"*. Proof: `run.py launcher routine library progress` prints
`all screens clean` while the bar picker sits 166 px below a viewport that cannot scroll
(**D-FX-1**).

The audit is the single most valuable asset in this codebase for the overhaul — it is the
only thing that will keep a 100-card leanback home honest. It needs three new assertions
before the overhaul starts:

1. every reached control's rect intersects `[0,0,innerWidth,innerHeight]` **after**
   `scrollIntoView` settles;
2. every open overlay's computed `position` is `fixed` (or its rect covers the viewport);
3. a **row-integrity** assertion: from item *i*, `Right` then `Left` returns to *i*, and
   `Left`/`Right` never change the vertical band.

Assertion 3 alone would have caught **D-NAV-1**.

---

### W-2 — there is no row concept, and the overhaul needs one

Everything in `x3f-nav.js` is a flat list of `[data-nav]` scored pairwise (§1.2). A leanback
home is not a flat list: it is *ordered rows*, each with its own horizontal scroll position,
its own "last focused column", and a rule that vertical movement preserves the column
while horizontal movement never leaves the row.

What a row model buys, in the language of the current defects:

* **D-NAV-1** disappears: `Left`/`Right` search only within the row element, so there is
  nothing out-of-row to escape to.
* **D-NAV-3** becomes tractable: after a row re-renders, restore focus to
  *(row id, remembered column index)* rather than falling back to `first()`.
* §2.2 collapses: `move()` scores only the ~8-20 items in the current row for horizontal
  moves, and only the row *headers* (one rect per row) for vertical moves — turning
  `O(N)` per keypress into `O(row size + row count)`.

The `[data-nav-scope]` attribute is *almost* the hook for this, but it is wired into the
modal `SCOPES` selector (line 53) and would break every overlay if reused (**D-NAV-14**).
Rows need their own attribute (`data-nav-row`) and their own code path.

---

### W-3 — the item scan is O(N × ancestor depth) with no invalidation signal

`visible()` walks every ancestor calling `getComputedStyle` (lines 40-46) for every item on
every rebuild. Measured: `6.9 ms` at 480 items on a desktop core (§2.2). The only
invalidation is a 50 ms wall clock, a `resize` listener, and manual `X3FNav.refresh()` —
all three of which have defects (**D-NAV-4**, **D-NAV-5**, **D-NAV-12**).

Opportunities, in order of payoff:

1. **Cache visibility per element, invalidated by a `MutationObserver`** on
   `attributes: ['class','style','hidden','disabled','aria-hidden']` plus `childList`, and by
   an `IntersectionObserver` for off-screen rows. Turn the 50 ms timer into a *generation
   counter* that a mutation bumps.
2. **Stop walking ancestors per item.** Walk each *container* once, cache the verdict, and
   let items inherit it. In a row layout every card in a row shares its ancestors.
3. **Only measure candidates.** For a horizontal move, only items in the same row need a
   `getBoundingClientRect()`; for a vertical move, only one representative per row.

---

### W-4 — the focus model has three sources of truth and they can disagree

The ring (`CUR` class), the DOM focus (`activeElement`), and the internal `cursor` variable
are set independently by `setCursor` (all three), `pointerover` (ring + cursor, **not**
focus — **D-NAV-6**) and `focusin` (ring + cursor, focus already moved — **D-NAV-7**).
`typing()` reads `activeElement`; `activate()` reads `cursor`; the audit reads the ring
(`audit.js:129`).

For the overhaul this should collapse to **one** source: `activeElement`, with every
`[data-nav]` item given a real `tabindex="-1"` (the launcher already does this at
`launcher.html:167`; `routine.html:341`'s `.day` divs do **not**, so `focus()` on them is a
no-op) and the ring driven by `:focus-visible` / a class applied in a single `focusin`
handler. That also gives screen readers and the TV's own accessibility service something
real to announce.

---

### W-5 — the ring styling is split across two modules that fight each other

`x3f-nav.js:24-26` and `x3f-fx.js:37-44` both style the focused item, one with `!important`
and one with an animation, producing **D-FX-8**. The `OWN_RING` flag exists precisely to let
a page opt out, but the opt-out is partial: `[data-nav]:focus{outline:none}` is injected
unconditionally (line 22) while the replacement ring is not, so a page that sets
`X3FNAV_CLASS` and forgets the CSS has **no focus indicator at all**.

Consolidate: one module owns the focus visual, exposed as tokens (`--navring`,
`--nav-ring-width`, `--nav-ring-glow`, `--nav-scroll-margin`) rather than as literals.
Today `--navring` is the only token, it is hardcoded with a `#2ff0b0` fallback in three
places, and the launcher — the one page with a different accent — never defines it.

---

### W-6 — `[data-nav]{scroll-margin:26px}` is a single global constant

`x3f-nav.js:21`. A leanback home has a fixed header and often a fixed row label; `26px` will
scroll the focused card underneath them. This needs to be `var(--nav-scroll-margin, 26px)`
at minimum, and realistically per-axis and per-row.

---

### W-7 — the ambient layer redraws content that is identical every frame

Measured (§2.1, 1080p): `9.40` of `11.70 ms/frame` is spent on the opaque ground fill, the
aurora blit and the vignette gradient — all three of which are *visually static* frame to
frame. The only genuinely animated elements are:

* the aurora drift: `Math.sin(t * 0.06) * 0.02` on scale and `±1%` translation
  (lines 117-122) — sub-pixel-per-frame motion at a 16.7 s period;
* the motes (`0.03 ms`);
* the bursts (only while one is alive);
* the grain translation (`2.30 ms` for noise at `alpha 12/255 × 0.5` — effectively invisible
  across a room).

**The single highest-leverage change in `x3f-fx.js`** is to move the static layers out of the
per-frame path:

* Ground + vignette → a **CSS** `background`/`radial-gradient` on a static element (or one
  offscreen canvas composited once). The compositor paints it once and never repaints it.
* Aurora → an `<img>`/CSS `background-image` with a long-period CSS `transform` animation.
  The compositor animates a transform on the GPU for free; the current implementation
  re-blits 8.3 M pixels per frame to move by a fraction of a pixel.
* That leaves motes + bursts as the only canvas work — `~0.03 ms/frame` plus bursts — which
  makes the whole degrade ladder nearly unnecessary, and makes "quality 0 = remove the
  canvas entirely" a real option.

This also removes the reason `body>*:not(#x3ffx)` exists (**D-FX-1**).

---

### W-8 — fx hardcodes a list of the pages' own class names

`x3f-fx.js:48-49`:

```js
'.card,.ex,.pbrow,.today,.chal,.pstrip,.ach,.demobox,.method,.cwrap,.sheet,',
'.rest,.coach{background-color:rgba(8,11,19,.80)}',
```

A generic ambient module reaching into twelve page-specific class names. Any new surface
introduced by the overhaul (`.row`, `.rowcard`, `.hero`, `.rail`) silently gets no dark
ground and becomes unreadable over the aurora — a *visual* regression with no test that
catches it. Note also that `.card.hero` (specificity `(0,2,0)`, e.g. `launcher.html:49`)
beats this rule `(0,1,0)`, so hero cards already opt out by accident.

Invert it: pages declare `class="x3f-surface"` (or fx sets `--x3f-ground` and pages consume
it). One direction of dependency, not twelve.

---

### W-9 — no observability on the device

`X3FFX.stats()` (line 250) returns `{quality, frameMs, motes}` and nothing surfaces it.
`ROADMAP.md:174-177` admits: *"nobody has watched it decide yet."* The nav has
`X3FNav.engaged()` and `X3FNav.current()` and no timing at all.

Cheap, high-value: a `?fxdebug=1` corner readout showing `quality`, `avg`, item count and
the last `move()` duration; and an `X3F.log(...)` bridge so the TV can print it to logcat.
Without this, every performance claim about the Hisense stays a guess.

---

### W-10 — three input paths, three behaviours, no shared test

Browser keydown (`211-230`), native remote (`285-299`) and gamepad (`248-269`) each
implement OK and each implement direction handling slightly differently — `<select>`
behaviour differs between keyboard and remote *by design* (lines 286-293), and the gamepad
path never handles `<select>` at all (it calls `activate()` directly at line 265, which is
the dead branch of **D-NAV-13**). The audit only exercises `window.__x3fNav`.

The overhaul should funnel all three into one `dispatch(action)` and test that one function.

---

### W-11 — no focus restoration across overlay open/close

`showFinder(false)` (`launcher.html:245`) closes the picker; `refresh()` then re-seats the
cursor via `first()` (line 93), which resolves to `[data-nav-first]` = card 0 (the Workout
card), **not** the bar chip the user opened the picker from. Same for the guided coach:
closing it lands on `#startSession`, not on the day the user was editing.

A leanback home with modal detail sheets makes this constant. The fix pairs with **W-2**:
push `(scope, element)` on open, pop and re-seat on close, using a **non-scrolling** seat
(**D-NAV-16**).

---

### W-12 — `data-nav-first` is global, not per-scope

`first()` (`x3f-nav.js:114-118`) filters the whole current item list. The launcher already
has two `data-nav-first` elements (`#rescanBtn` and card 0); it works only because they are
never in the same scope simultaneously. With many rows and many sheets this becomes a
guessing game. `data-nav-first` should be resolved relative to the scope root, and rows need
their own "remembered column" instead.

---

### W-13 — no keyboard-shortcut affordances for a large grid

At 11 cards, four-way movement is fine. At 100+ cards the D-pad needs page-jump
(`ChannelUp/Down`, `MediaFastForward`), a first/last row jump, and ideally a letter jump.
`MainActivity.dispatchKeyEvent` (543-570) currently maps only the four directions, CENTER,
ENTER, BUTTON_A and BACK; every other key falls through to `super`. The plumbing for extra
verbs (`nav("pageup")`) is one line.

---

### W-14 — `web/` and `app/src/main/assets/` are two hand-synced trees with different filenames

`tools/sync-from-web.py` handles 8 games, 3 menu pages and 9 shared scripts, but not the
launcher (three copies, §**D-INT-3**) and not `sw.js`. Every fix in this report must be
applied to `web/x3f-nav.js` and `web/x3f-fx.js` and then synced. `run.py --check` is the
guard and it is not wired into `.github/`. Worth confirming before the overhaul multiplies
the file count.

---

## 5. Invariants — things a refactor MUST NOT break

Each is stated with the evidence that makes it load-bearing.

---

**I-1. `x3f-nav.js` must claim `window.__x3fNav` before the shell's `BOOTSTRAP` runs.**

`MainActivity.java:139` injects `BOOTSTRAP` in `onPageFinished`, and the bootstrap installs
its own nav only `if(!window.__x3fNav)`. `x3f-nav.js:283` claims it at script-eval time.
`HANDOFF.md:41`: *"the bootstrap installs its fallback spatial nav only
`if(!window.__x3fNav)`. `x3f-nav.js` claims `window.__x3fNav` first."* If the module is ever
loaded lazily, deferred, or bundled behind an async import, the bootstrap wins and the user
gets **two focus rings** (`.x3f-focus` and `.x3f-nav-cur`) with the inferior nav driving.
Keep it a synchronous, parse-time `<script>`.

---

**I-2. `window.__x3fNav(dir)` must accept exactly `'left' | 'right' | 'up' | 'down' | 'enter'`
and must never throw.**

`MainActivity.java:541`:
`web.evaluateJavascript("window.__x3fNav&&window.__x3fNav('" + dir + "')", null)`.
The five strings come from `dispatchKeyEvent` (546-552). There is no error channel — a throw
is swallowed by `evaluateJavascript` and the remote simply stops working with no symptom.

---

**I-3. `window.__x3fPageNav = true` must keep being set.**

`tools/nav-audit/audit.js:58`:
`if (window.__x3fNav) { window.__usingFallback = !window.__x3fPageNav; return; }`
and `audit.js:172`, `exhaustive()`, decides between an exhaustive BFS and a best-effort
sweep on `!!(window.X3FNav || window.__x3fSeat)`. Drop either global and the audit silently
downgrades to "coverage is best-effort", which is how the guided coach's eight unfocusable
controls shipped in the first place (`run.py:9-11`).

---

**I-4. `X3FNav.set`, `X3FNav.current`, `X3FNav.refresh`, `X3FNav.focusFirst` must keep
working with the same signatures.**

`X3FNav.set` — `audit.js:173`. `X3FNav.current` — `audit.js` via `focused()` plus
`launcher.html:266`, `routine.html:164`, `library.html:76`, `progress.html:126`.
`X3FNav.refresh` — seven page call sites (§D-NAV-5). `X3FNav.focusFirst` — the four
"land the cursor on load" blocks, and `tools/sync-from-web.py:102-107` **injects that block
into every menu page at sync time**, so changing the name means changing the sync tool too.

---

**I-5. The focus ring must be discoverable by `.x3f-nav-cur, .x3f-focus, .foc`.**

`audit.js:129`: `function focused() { return document.querySelector('.x3f-nav-cur,.x3f-focus,.foc'); }`
Every reachability result in the audit is derived from this one selector. A new class name
without updating `audit.js` makes the audit report `nothing focusable at all` (line 179) for
every screen.

---

**I-6. The overlay scope selector must keep covering `.coach.show`, `.rest.show`,
`.scrim.show`, `.modal.show`.**

`x3f-nav.js:53`, mirrored in `audit.js:153` (`openOverlay()`) and in the shell's fallback
(`MainActivity.java` BOOTSTRAP: `document.querySelectorAll('.scrim.show,.modal.show')`).
Three independent copies of the same list. `HANDOFF.md:162`: *"the guided coach had 8
controls and none were focusable, and because the nav wasn't scoped to overlays the cursor
silently walked the day list underneath it."* Losing any of these class names re-opens that.

---

**I-7. `visible()` must keep walking ancestors, checking `opacity` and `pointer-events`.**

`x3f-nav.js:40-46`. `HANDOFF.md:163`: *"Arena let the D-pad focus `Fight` and
`Start Max Effort` on inactive mode tabs: `.view` panels hide with
`opacity:0;pointer-events:none` but keep their layout box."* Every overlay in the app
(`.coach` line 76, `.rest` line 113 of `routine.html`) hides exactly this way. An
element-only visibility check re-introduces "OK presses what you cannot see".

*(Do fix the `offsetParent` half of it — **D-NAV-2** — but do not weaken the ancestor walk.)*

---

**I-8. On the remote, Up/Down must never be bound to a `<select>`'s value.**

`x3f-nav.js:286-293`, verbatim:

> *"Do NOT make Up/Down step the value here: on a page whose only focusable control is a
> select - Progress - that would trap the D-pad on the filter and the page could never be
> scrolled."*

Restated in `HANDOFF.md:41`. The specific page cited is now select-free (**D-NAV-20**) but
the rule stands: a D-pad axis must never be fully consumed by a widget with no other exit.

---

**I-9. `x3f-nav.js` must not be loaded into a game.**

`HANDOFF.md:41`: *"Don't add `x3f-nav.js` to a game — its Enter/Space handling would fight
Space-to-pull in the browser build."* `x3f-nav.js:224-228` binds `' '` to `activate()`.
Confirmed: no game HTML references it.

---

**I-10. `x3f-fx.js` must not run inside a game.**

`x3f-fx.js:6-11` and `ROADMAP.md:106-110`: the games already own a render loop, plus the
form rig's rAF and the music scheduler; a fourth on a TV SoC costs frames.
`ROADMAP.md:148-150` (open item #7) says three loops is already the concern. §2.1 shows the
ambient layer alone is a `12–73 ms/frame` proposition. Confirmed: no game HTML loads it.

---

**I-11. Overlays must remain `position:fixed` and must actually cover the viewport.**

`routine.html:76` (`.coach`), `routine.html:113` (`.rest`), `launcher.html:72` (`.scrim`).
The whole modal-scoping design in `x3f-nav.js:49-65` assumes an overlay traps the cursor
*because it covers the screen*. **D-FX-1** has already broken this; any fix must restore it,
and the audit needs assertion 2 from **W-1** so it cannot break again.

---

**I-12. A `data-nav-scope` / `.scrim.show` overlay must trap the cursor.**

`audit.js:226`, `237-238`: `outside = reached.filter(r => !ov.contains(r))` → `ESCAPED
OVERLAY`, which `run.py:152-153` treats as a build failure. This is one of the three hard
gates the CI check enforces.

---

**I-13. Every visible control must remain reachable by the four directions alone.**

`audit.js:224`, `231-234` → `UNREACHABLE`. `run.py:2-7`: *"The TV has no mouse and no
scrollbar, so a control the D-pad cannot reach might as well not exist."* Any row model that
introduces "you can only reach this by scrolling the row with a shoulder button" violates
this and will fail the gate.

---

**I-14. The remote must never land on something invisible.**

`audit.js:225`, `235-236` → `FOCUSED INVISIBLE`. The third hard gate.

---

**I-15. `prefers-reduced-motion` must keep disabling the ring animation, the sheen, the page
fades and the ambient motion.**

`x3f-nav.js:27` and `x3f-fx.js:51-52`, `x3f-fx.js:194` (`if (reduced) quality = 1`), and
`x3f-fx.js:220` (`leave()` navigates immediately under reduced motion). Called out as
shipped behaviour in `ROADMAP.md:112`.

---

**I-16. `X3FFX.leave(href)` must always navigate.**

`launcher.html:172`: `if(window.X3FFX&&X3FFX.leave)X3FFX.leave(g.f); else location.href=g.f;`
Once `leave()` is called the page is already fading (`body.x3f-out`, `opacity:0`). If the
navigation does not happen, the user is left staring at an invisible page. Any early return
added to `leave()` must be paired with removing `x3f-out`.

---

**I-17. `X3FFX.burst` / `X3FFX.pulse` / `X3FFX.mount` must tolerate being called before
mount, after mount, and twice.**

Every call site is `try{...}catch(e){}` (`launcher.html:171`, `launcher.html:281`,
`progress.html:375`, `progress.html:387`, `routine.html:561`, `library.html:127`), so a throw
is invisible — as **D-FX-6** proves, where the whole celebration is silently missing.
`mount()`'s idempotence guard is `x3f-fx.js:187`.

---

**I-18. The canvas must stay `pointer-events:none` and behind all content.**

`x3f-fx.js:30`. It is inserted as `document.body.firstChild` (line 192) and is a
full-viewport fixed element. Without `pointer-events:none` it swallows every click on the
page.

---

**I-19. The two source trees must stay in sync.**

`tools/sync-from-web.py:52-53` lists `x3f-nav.js` and `x3f-fx.js` in `SHARED`; both copies
are currently byte-identical (verified). Edit `web/`, then run the sync, then run
`run.py --check`. Editing `app/src/main/assets/` directly will be silently overwritten.

---

**I-20. `x3f-nav.js` must not depend on `x3f-fx.js` being present, or vice versa.**

`web/index.html:148` loads nav with no fx (**D-INT-3**), and the module ordering differs
per page (`launcher.html` loads fx at 92 then nav at 93; `progress.html` loads fx at 385
then nav at 388). Neither module references the other by symbol today. Keep it that way, or
make the dependency explicit and one-directional.

---

## 6. What a row-based leanback home specifically requires

A checklist derived from the above, so the overhaul does not rediscover any of it.

**Must be fixed before the first row lands**

1. **D-FX-1** — remove `body>*:not(#x3ffx)`; give the canvas `z-index:-1` (or a wrapper) so
   `position:fixed` works again. Nothing else in the overhaul can be trusted until modals
   are modals.
2. **D-NAV-2** — replace `!el.offsetParent` with a rect-and-computed-style test, so fixed
   headers/rails are focusable. Fix `audit.js:137` the same way, or the audit will keep
   agreeing with the bug.
3. **W-1** assertion 3 (row integrity) + assertion 1 (viewport containment) in the audit,
   *before* the layout changes, so the row work has a regression net.

**Must be designed in, not retrofitted**

4. **W-2** — a real row model (`data-nav-row`, per-row remembered column, horizontal search
   confined to the row) replacing the soft `+4000` penalty (**D-NAV-1**). Horizontal
   `scrollPage` for rows that overflow — `x3f-nav.js:152` currently only offers vertical.
5. **W-3** — mutation-driven invalidation replacing the 50 ms clock (**D-NAV-4**,
   **D-NAV-5**), and per-row rather than per-item measurement. §2.2 says a flat scan costs
   `~0.024 ms/item/keypress` on a desktop; a 120-card home on a TV SoC will be visibly laggy
   without this.
6. **W-4** — one focus source of truth; give every focusable a real `tabindex="-1"`
   (`routine.html:341` still does not).
7. **W-11** + **W-12** — a focus stack for overlay open/close, and scope-relative
   `data-nav-first`.

**Must be fixed because more cards means more frames**

8. **D-FX-4** + **W-7** — move the ground, aurora and vignette off the per-frame path.
   At DPR 2 the current floor is `39.6 ms/frame` *before* the page paints a single card.
   A row-based home with poster art, lazy image decodes and scroll animation cannot afford
   the current ambient layer at any quality tier.
9. **D-FX-11** — a full-screen `backdrop-filter` over a live canvas is not affordable
   alongside scrolling rows. Either the canvas stops animating behind modals, or the blur
   goes.
10. **D-NAV-11** + **D-INT-2** — stop the zombie gamepad loop and idle the launcher's
    `meter()` loop. The overhaul should land with a stated, enforced budget of *one* rAF
    loop on a menu screen.

**Should be fixed because the overhaul will expose them**

11. **D-NAV-14** — do not reuse `data-nav-scope` for rows; it is wired into the modal
    scope selector.
12. **W-8** — invert the surface-styling dependency before new card classes exist.
13. **D-INT-1** — wire `X3F.setOverlay` / `__x3fCloseOverlay` into `routine.html` (and into
    any new sheet), or BACK keeps destroying the page.
14. **D-FX-8** / **W-5** — pick one owner for the focus visual; today it is dead in two
    different ways on four pages.
15. **D-INT-3** / **D-INT-4** / **W-14** — reconcile the three launcher documents and the
    stale `sw.js` precache list before the file count grows.

---

## 7. Appendix — verification commands used

```powershell
# CSS specificity of :not(#id)  ->  {"coach":"relative","scrim":"relative","fx":"fixed"}
msedge --headless --disable-gpu --dump-dom file:///.../spec.html

# real launcher, bar picker geometry after barChip.click()
# real routine.html, coach/rest/done geometry
# launcher 4-direction map over all [data-nav] via X3FNav.set + window.__x3fNav
msedge --headless --disable-gpu --window-size=1920,1080 --virtual-time-budget=25000 --dump-dom file:///.../probe_*.html

# fx per-layer frame cost, getImageData flush per frame, 40 frames/row, DPR 1 and DPR 2
msedge --headless --disable-gpu --window-size=1920,1080 --dump-dom file:///.../bench2.html

# nav refresh + move scaling, 11..480 items, layout invalidated between iterations
msedge --headless --disable-gpu --window-size=1920,1080 --dump-dom file:///.../scale.html

# the project's own gate, for the record
python tools/nav-audit/run.py launcher routine library progress
#   launcher ok (2 states) / routine ok (5) / library ok (1) / progress ok (1) / all screens clean
```

Probe scripts were written to a scratch directory outside the repo; the repository was not
modified apart from this report.
