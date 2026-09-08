# Calibration audit — `x3f-cal.js`, `X3F_Calibrate.html`, and every call site

Scope read completely, line by line:

- `web/x3f-cal.js` (136 lines) — the calibration store
- `web/X3F_Calibrate.html` (229 lines) — the capture UI
- `web/x3f-set.js` (177) — the only writer of auto-learn
- `web/x3f-nav.js` (309), `web/x3f-form.js` (relevant parts), `web/x3f-music.js` (attach), `web/sw.js`
- All eight consumers: `X3F_Arena.html`, `X3F_Bloom.html`, `X3F_Splash.html`, `X3F_Nova.html`, `X3F_Flow.html`, `X3F_Duel.html`, `X3F_Rhythm.html`, `X3F_Ascent.html`
- The three producers of `?ex=` / `?band=`: `X3F_Library.html`, `X3F_Routine.html`, `x3f-exercises.js`
- `X3F_Progress.html` (export/import of `x3f_exCal` + `x3f_bandMax`)
- `app/src/main/java/com/goob/x3ftv/MainActivity.java` — the whole file, with the `BOOTSTRAP` string (lines 580-668) read literally
- `tools/sync-from-web.py`, `tools/func-test/run.py`, `tools/func-test/cases.js`, `tools/nav-audit/run.py`
- `HANDOFF.md`, `ROADMAP.md` for the recorded history of the two shipped divergences

---

## 1. Structural map

### 1.1 Storage keys

| Key | Written by | Read by | Shape |
|---|---|---|---|
| `x3f_exCal` | `X3FCal.save` (x3f-cal.js:107), `X3FCal.observe` (:125), `X3FCal.clear` (:129), Progress import (X3F_Progress.html:332) | `X3FCal.range/floor/span/all` | `{ "<slug>\|<band>": {lo:int, hi:int, auto:bool, n?:int, t:ms} }` |
| `x3f_bandMax` | Calibrate.html:202, Arena.html:229 (`bandMaxInp.onchange`), Arena.html:230 (`bandCap`), Progress import :327 | `X3FCal.bandCeiling` (x3f-cal.js:74), every game's `ref()` fallback, Calibrate's `showStored()` fallback | `{ "<band>": number }` |
| `x3f_band` | Calibrate.html:85, every game's `bandSel.onchange` (Bloom:123, Duel:94, Flow:100, Nova:135, Rhythm:95, Splash:125, Arena:228, Ascent:105) | Calibrate.html:82, every game's init, `x3f-set.js:51`, `Routine per()` :261 | `"White" \| "Light Gray" \| "Dark Gray" \| "Black" \| "Elite Black"` |
| `x3f_libBand` | Library.html:91 only | Library.html:75 only | `{ "<slug>": band }` |
| `x3f_session` | Routine (`saveS`, :401/:405/:438/:452/:464/:467/:475) | `X3FCal.slug()` (x3f-cal.js:87-89), Bloom:260, Nova:561, Splash:416 | `{active, day, i, started, sets, pending:{slug,game,at}}` |
| `x3f_routine2` | Routine `setPer` :263 | Routine `per()` :261 → `launchUrl()` :268 | `{ "<day>": {list:[slug], per:{slug:{game,band,tempo,sets}}} }` |
| `x3f_scale`, `x3f_unit` | Arena `calibrate()` :210, `resetUnits()` :211 | Arena `onSample()` :200 (multiplies `force`) | number, string |
| `x3f_history` | `X3FProg.logSet` | `X3FProg.pb/previous/pbTable` | array of set entries with `peak` |

There is **no** stored record of which zero/baseline a calibration was captured against, and **no** stored "last calibrated" surface (the `t` field is written and never read).

### 1.2 `x3f-cal.js` — the module

```js
var KEY = 'x3f_exCal';                                                    // :39
var BAND_DEF = { 'White':130,'Light Gray':230,'Dark Gray':330,
                 'Black':430,'Elite Black':600 };                          // :40
var MIN_SPAN = 10;                                                         // :46
var MIN_PEAK = 25;                                                         // :47
```

| Function | Line | Behaviour |
|---|---|---|
| `read(k,d)` / `write(k,v)` | 49-53 | JSON localStorage, swallows every error |
| `map()` | 60-67 | Parses `x3f_exCal`, memoised for **500 ms** (`cache`, `cacheAt`) |
| `flush(m)` | 68 | Writes and refreshes the cache in one step |
| `id(slug,band)` | 69 | `String(slug)+'\|'+String(band)` — no escaping |
| `bandCeiling(band)` | 73-77 | `max(MIN_SPAN, x3f_bandMax[band] \|\| BAND_DEF[band] \|\| 130)` |
| `slug()` | 82-91 | `?ex=` → else `x3f_session.active && .pending.slug` → else `null` |
| `range(sl,band)` | 93-98 | `{lo,hi,auto}`. No slug → `{0, bandCeiling, auto:true}`. Entry with `hi>0` → `{max(0,lo\|\|0), hi, !!auto}`. Else band fallback |
| `floor(sl,band)` | 99 | `range().lo` |
| `span(sl,band)` | 100 | `max(MIN_SPAN, hi - lo)` |
| `save(sl,band,lo,hi)` | 102-110 | Rejects `!sl`, `!(hi>0)`, `hi-lo < 10`. Writes `{lo,hi,auto:false,t}`. Returns bool |
| `observe(sl,band,peak)` | 120-127 | Rejects `!sl` or `peak <= 25`. Returns early if `e && !e.auto`. If `e.hi >= peak` just bumps `n`. Else writes `{lo:e.lo\|\|0, hi:peak, auto:true, n, t}` |
| `clear(sl,band)` | 129 | `delete m[id]` — **only ever called from `tools/func-test/cases.js`** |
| `window.X3FCal` | 131-135 | `{slug, range, floor, span, save, observe, clear, all: map, bands: BAND_DEF, minSpan: MIN_SPAN}` |

The contract every game implements, in exactly two lines:

```js
function ref(){return window.X3FCal?X3FCal.span(EXSLUG,band):Math.max(60,bandMax[band]||130)}   // Bloom:116
function calLo(){return window.X3FCal?X3FCal.floor(EXSLUG,band):0}                              // Bloom:119
```

and one line in `onSample()`:

```js
force=Math.max(0,raw-baseline-calLo());                                                          // Bloom:159
```

so that `force / ref()` is `0.0` at the movement's start position and `1.0` at its all-out max.

### 1.3 `X3F_Calibrate.html` — DOM, CSS, capture state machine

**Scripts loaded** (lines 47-49, 222): `x3f-exercises.js`, `x3f-form.js`, `x3f-cal.js`, `x3f-music.js`.
**Not loaded:** `x3f-nav.js`, `x3f-set.js`, `x3f-progress.js`, `x3f-fx.js`, `x3f-hype.js`.

**DOM ids:** `dot`, `statusTxt`, `exSel`, `bandSel`, `formCv`, `eye`, `big`, `sub`, `stored`, `zeroBtn`, `calBtn`, `firstrun`, `frConnect`, `frDemo`.

**CSS tokens** (`:root`, line 11): `--bg:#06080e`, `--bg2:#0b0f18`, `--panel:rgba(255,255,255,.05)`, `--brd:rgba(255,255,255,.09)`, `--brd2:rgba(255,255,255,.14)`, `--txt:#eaf0fa`, `--dim:#8593a9`, `--accent:#2ff0b0`, `--accentD:#0fae82`, `--gold:#ffd35c`, `--hot:#ff5d78`, `--d:'Sora'`, `--n:'Space Grotesk'`, `--sat/--sab` safe-area insets. Classes: `.app .top .brand .spacer a.home .status .dot(.on/.wait) .mid .figure .readout .eyebrow .big(.hot/.accent) .sub .rowsel select .cta(.ghost) .stored .btnrow .scrim(.show) .card`. Single breakpoint at `max-width:430px` (line 29) stacks `.mid` vertically.

**Signal path:** `connect()` :129-141 → `characteristicvaluechanged` → `raw = getFloat64(0,true)` → `onSample()` :143-146.

```js
function startTare(){taring=true;tSamp=[];tStart=performance.now()+400;tEnd=performance.now()+1900;
                     setStatus('Zeroing - hold still','wait')}                                   // :142
function onSample(){
  if(taring){ /* collect from +400ms to +1900ms, then baseline = mean */ return; }
  if(baseline==null)baseline=raw;
  force=Math.max(0,raw-baseline);          // NO calLo() — this page must measure absolute force
}                                                                                                 // :143-146
```

**Capture state machine** — `phase ∈ {idle, count, hold, ready, cap, done}`, driven from the rAF `loop()` at :185-219:

| Phase | Entered at | Duration | On screen | Ends with |
|---|---|---|---|---|
| `idle` | :214 (3.2 s after `done`) | — | "Live Force", raw number (:215) | `calBtn` click :167 |
| `count` | :170 | **3000 ms** | "Get ready" 3-2-1-GO, sub = "Get into your START position for the *X* and hold it"; beeps 520 Hz/s, 760 Hz on GO (:188) | `phase='hold'`, `pEnd=now+3000`, `holdSum=0`, `holdN=0` (:189) |
| `hold` | :189 | **3000 ms** | "HOLD THE START", live force in accent, "Stay still — n.ns" (:190) | `capLo = holdSum/holdN`, `phase='ready'`, `pEnd=now+2500`, beep 660 (:192) |
| `ready` | :192 | **2500 ms** | "Now go all out" 3-2-1-GO, sub = "Start tension NN — press as hard as you can on GO" (:193) | `phase='cap'`, `pEnd=now+4000`, `capMax=0` (:195) |
| `cap` | :195 | **4000 ms** | "PRESS MAX" (verb from `X3FForm.verb`), live force in hot, "n.ns left" (:196) | see below (:198-203) |
| `done` | :198 | 3200 ms | Saved range, or the refusal reason (:204-213) | `phase='idle'` |

The commit block, verbatim (`X3F_Calibrate.html:198-203`):

```js
if(now>=pEnd){phase='done';beep(400,0.2);
  loop.ok=window.X3FCal?X3FCal.save(slug,band,capLo,capMax):false;
  // keep the band max fed too - it is still the fallback for movements you
  // have never calibrated, and the dashboard reads it
  if(capMax>10&&capMax>(bandMax[band]||0)){bandMax[band]=Math.round(capMax);xset('bandMax',bandMax);}
  showStored();} }
```

Total wall clock from SELECT to a stored range: **12.5 s**, of which the user gets **3 s** to put the remote down and be still in the start position.

### 1.4 The Android TV path (`MainActivity.java`)

Native force conditioning:

```java
private void handleForce(byte[] v) {
    if (v == null || v.length < 8) return;
    double rawd = ByteBuffer.wrap(v).order(ByteOrder.LITTLE_ENDIAN).getDouble();
    if (!haveBaseline) { baseline = rawd; haveBaseline = true; }   // :348  ONE SAMPLE
    injectForce(Math.max(0, rawd - baseline));                     // :349
}
private void injectForce(double force) {
    if (!webReady || web == null) return;
    long now = SystemClock.uptimeMillis();
    if (now - lastInject < 16) return; lastInject = now;           // :354  ~60 Hz cap
    final String js = "window.__x3fForce=" + (Math.round(force * 100) / 100.0) + ";";  // :355
    ...
}
```

`haveBaseline` is cleared only at `onServicesDiscovered` (:312) and by `Bridge.reZero()` (:427).

Injection gate (:130-141): `isLauncher(url)` (contains `launcher.html` or ends `index.html`) → push bar/battery/version. **Everything else on `file:` gets `BOOTSTRAP`**, and `calibrate.html` is in that "everything else".

The parts of `BOOTSTRAP` that touch the signal:

```js
try{ baseline=0; }catch(e){}                                                        // :583
/* This assignment REPLACES the browser build's onSample(), so anything that
   conditions the raw signal has to be repeated here or it silently does not
   exist on the TV. ... */                                                          // :609-615
try{ if(window.__x3fDrv)clearInterval(window.__x3fDrv);
  window.__x3fDrv=setInterval(function(){ try{
    var f=+window.__x3fForce||0;
    if(typeof calLo==='function'){ var lo=+calLo()||0; f=f>lo?f-lo:0; }             // :619
    force=f;                                                                        // :620
  }catch(e){} },16); }catch(e){}
try{ var fr=document.getElementById('firstrun'); if(fr)fr.classList.remove('show'); }catch(e){}  // :622
try{ if(typeof startRun==='function')startRun(); }catch(e){}                        // :623
try{ var z=document.getElementById('zeroBtn'); if(z){ z.addEventListener('click',function(ev){
      ev.preventDefault(); ev.stopPropagation();
      try{ if(window.X3F&&X3F.reZero)X3F.reZero(); }catch(e){} },true); } }catch(e){}// :624
```

**The exact browser/TV divergence table:**

| Concern | Browser `onSample()` | TV `__x3fDrv` |
|---|---|---|
| Tare | 1.5 s averaged window, `tStart=+400ms`, `tEnd=+1900ms` (Bloom:155-157) | **single first packet** (MainActivity:348) |
| Tare re-trigger | `startTare()` on Re-Zero, re-arms the averaging window | `X3F.reZero()` sets `haveBaseline=false`; next packet becomes the baseline |
| `calLo()` subtraction | yes (Bloom:159) | yes (:619) — added in v1.6 |
| `scale` multiplication (Arena only) | yes, `*scale` (Arena:200) | **no** |
| `sessionPeak` (Arena:201) | updated | **never updated** |
| `setPeak` (Bloom:160) | updated | **never updated** |
| `peak` / `forceRef` (Ascent:137-138) | updated | never updated (Ascent is not in the TV bundle at all) |
| `raw` | tracks the bar | **stays 0 forever** |
| `taring` | cleared by `onSample` | **stays `true` forever after Re-Zero** |
| status pill | `setStatus('Live','on')` | never called → shows "Offline" / red dot |
| clamping | one `Math.max(0, …)` | two (`max(0, raw-baseline)` natively, then `f>lo?f-lo:0`) |

`HANDOFF.md:97` states the rule this keeps breaking: *"anything that conditions the raw signal must exist in BOTH `onSample()` and the bootstrap, or it silently does not exist on the TV. This is the second divergence (v0.9's Arena `vis()` was the first)."* The table above shows **five more** live divergences past the one that was fixed.

### 1.5 Who produces `?ex=` and `?band=`

`x3f-exercises.js` `gameUrl(game, o)` builds `file?mode=&from=&band=&tempo=&ex=`.

- **Library** (`X3F_Library.html:88`): `EXD.gameUrl(g,{from:'lib',band:bd,tempo:'3000',ex:ex.slug})` where `bd = libBand[slug] || ex.band` (:75).
- **Routine** (`X3F_Routine.html:268`): `EXD.gameUrl(c.game,{from:'routine',band:c.band,tempo:c.tempo,ex:slug})` where `c.band = per(slug).band || xget('band','White')` (:261).
- **Nothing links to `X3F_Calibrate.html` with a query string at all.** The only inbound links are `index.html:75` (`href="X3F_Calibrate.html"`, no params) and the TV launcher (`launcher.html:155`, `f:'calibrate.html'`). The comment at `X3F_Calibrate.html:87-88` — *"Launching from the Library or a Routine passes `?ex=`"* — describes a path that does not exist.

### 1.6 Who calls `X3FCal.observe`

Exactly one site: `x3f-set.js:146`, inside `report()`.

```js
ex: o.ex || param('ex') || null,                                          // :132
band: o.band || band() || null,                                           // :133
...
try { if (window.X3FCal && entry.ex && entry.peak > 0)
        X3FCal.observe(entry.ex, entry.band, entry.peak); } catch (e) {}  // :146
```

`report()` callers: Arena (zone :247, max :252, boss :262), Duel (:133, :153), Flow (:153), Nova (:286), Rhythm (:139), Splash (:211).
**Non-callers: Bloom and Ascent.** Bloom logs straight to `X3FProg.logSet` (:282) and never touches `X3FSet.report`, and Bloom is `games[0]` for **all eleven** movements in `x3f-exercises.js` — i.e. the default game every Library card and every Routine lift launches.

---

## 2. Defects

Ordered by how directly they cause "different exercises still have trouble getting the minimums and the maximums".

### D1 — The Library launches games on a band the user never calibrated. **This is almost certainly the reported bug.**

**Evidence:** `X3F_Library.html:74-75`
```js
let libBand=xget('libBand',{});
function bandFor(ex){return libBand[ex.slug]||ex.band}
```
vs. `X3F_Calibrate.html:82`
```js
let band=xget('band','White'),bandMax=Object.assign({},BAND_DEF,xget('bandMax',{}));
```

Calibrate keys on the **global** `x3f_band`. The Library keys on **`x3f_libBand[slug]`, defaulting to the movement's recommended band** from `x3f-exercises.js` — which is different per movement: chest-press `Dark Gray`, overhead-press `Light Gray`, deadlift `Black`, front-squat `Dark Gray`, calf-raise `Light Gray`, upright-row `White`. There is no code path that makes these agree, and Calibrate has no band selector default tied to the movement and no `?band=` support.

**Failure scenario (fresh install, no localStorage):**
1. Open Calibrate. `slug` defaults to `EXL[0]` = `chest-press` (`:91`); `band` defaults to `'White'` (`:82`).
2. Capture: hold 30, max 150 → `x3f_exCal["chest-press|White"] = {lo:30,hi:150,auto:false}`. Screen says "Saved. Games now treat 30 as the bottom of this movement and 150 as the top."
3. Open Library, tap Bloom on Chest Press → `X3F_Bloom.html?mode=&from=lib&band=Dark%20Gray&tempo=3000&ex=chest-press`.
4. In Bloom, `band` is overridden to `Dark Gray` (`:254`). `ref()` = `X3FCal.span('chest-press','Dark Gray')` → no entry → `bandCeiling('Dark Gray')` → `BAND_DEF` **330**. `calLo()` = **0**.
5. The user's real range is 30..150. The vine sits at `30/330 = 9%` at rest and tops out at `150/330 = 45%`. Every threshold in Bloom is derived from `ref()` (`curHi=ref()*0.78` :268, `targetAt` :310, `mapY` :311, `tol=ref()*0.14` :435, `meaningful=repMax>=R2*0.17` :445), so **no rep is ever counted and the top of the screen is unreachable**. The calibration the user just performed is silently ignored.

### D2 — A failed calibration still permanently raises `x3f_bandMax`.

**Evidence:** `X3F_Calibrate.html:199-202`. `loop.ok` records that `save()` refused, and the very next statement writes `bandMax[band]` anyway, unconditionally and monotonically.

**Failure scenario:** the user misreads the prompt and holds their all-out position during HOLD. `capLo ≈ 480`, `capMax ≈ 500`. `save()` returns `false` (span 20 ≥ 10 — actually saves) — take the tighter case: `capLo = 495`, `capMax = 500`, span 5 < `MIN_SPAN`. Screen says *"Only 5 between hold and max; needs 10."* Nothing is stored in `x3f_exCal`. But `x3f_bandMax['White']` is now **500**, up from 130. Every uncalibrated movement on White — all ten others — now scales to 500 instead of 130, and there is no UI anywhere in the app to put it back except Arena's "Max units on this band" number field (`X3F_Arena.html:139/229`), which most users will never find.

### D3 — Arena's "Set from hardest pull" writes a floored, unit-scaled number into the absolute `x3f_bandMax`.

**Evidence:** `X3F_Arena.html:200-201, 230`
```js
force=Math.max(0,raw-baseline-calLo())*scale;
if(force>sessionPeak)sessionPeak=force;
...
$('bandCap').onclick=()=>{if(sessionPeak>10){bandMax[band]=Math.round(sessionPeak);store.set('bandMax',bandMax);…}};
```

`sessionPeak` is derived from `force`, which has already had `calLo()` subtracted and `scale` applied. `x3f_bandMax` is consumed by `bandCeiling()` (x3f-cal.js:74) as an **absolute** ceiling for uncalibrated movements.

**Failure scenario:** overhead-press on Light Gray is calibrated `lo=52, hi=78`. The user runs Arena, pulls 78 absolute, `force` peaks at 26, `sessionPeak = 26`, presses "Set from hardest pull". `x3f_bandMax['Light Gray'] = 26`. Now every *uncalibrated* Light Gray movement gets `ref() = max(10, 26) = 26` — a drag curl reads 400% of the screen from the first inch of the pull.

### D4 — `X3FCal.slug()` and `X3FSet.report()`'s `ex` disagree, so scaling and auto-learn can target different movements (or one of them nothing).

**Evidence:** `x3f-cal.js:82-91` resolves `?ex=` **then** `x3f_session.pending.slug`. `x3f-set.js:132` resolves `o.ex || param('ex') || null` — **no session fallback**.

**Failure scenario A (auto-learn silently dead):** a Routine `pending` is set (`X3F_Routine.html:438`) and the user navigates to a game by some path that loses the query string (browser back/forward into a cached URL, the TV launcher, a bookmark, `sw.js` serving `index.html` as the offline fallback at `sw.js:6`). `EXSLUG` resolves to `deadlift` from the session, so the game scales to deadlift. `X3FSet.report` gets `ex: null`, so `entry.ex` is null and `observe()` is skipped entirely (`x3f-set.js:146` requires `entry.ex`). The movement never learns anything.

**Failure scenario B (scaled by the wrong movement):** the user abandons a guided session mid-lift without pressing Log/Skip/Close (`S.pending` survives — it is cleared only at `:452/:464/:467/:475/:488`). Two hours later they open Splash from the hub with no query string. `X3FCal.slug()` returns the stale `pending.slug`, so Splash scales to a movement the user is not doing, and if `deadlift|Black` is calibrated `lo=90`, `force` reads **0 for the whole session**.

### D5 — On the TV, Bloom logs `peak: 0` for every set, forever.

**Evidence:** `X3F_Bloom.html:160` — `setPeak` is assigned **only inside `onSample()`**, which the TV never calls (`MainActivity.java:609-621` replaces the whole path). `X3F_Bloom.html:283` then logs `peak: Math.round(setPeak)`.

**Failure scenario:** every Bloom set on the TV writes `peak: 0` into `x3f_history`. `X3FProg.pb()` peak is 0, `pbTable` peak is 0, the Progress "peak force per week" chart is flat at 0, the peak-based achievements and the peak-based daily challenges (`x3f-progress.js:352`) can never fire, and `X3FSet.improvement`'s `delta('peak')` reports nothing. Bloom is the default game, so this is most of the user's logged training.

### D6 — On the TV, Arena's session peak, average and "Set from hardest pull" are dead.

**Evidence:** `X3F_Arena.html:201` (`sessionPeak` inside `onSample`) and `:230` (`if(sessionPeak>10)`). Same root cause as D5.

**Failure scenario:** `$('mPeak')` shows `0.00` for the whole session on a 55" screen while the user is pulling 300; "Set from hardest pull" is a button that does nothing when pressed, with no feedback.

### D7 — On the TV, Arena's unit calibration produces `scale = 250000` and persists it.

**Evidence:** `X3F_Arena.html:210`
```js
function calibrate(){const known=parseFloat($('calW').value);if(!known||baseline==null)return;
  const z=Math.max(0.0001,raw-baseline);scale=known/z;unit=$('calU').value;store.set('scale',scale);…}
```
On the TV, `raw` is never written (nothing assigns it — see the divergence table) and `baseline` is forced to `0` by `BOOTSTRAP:583`. So `z = max(0.0001, 0) = 0.0001`.

**Failure scenario:** the user opens the Arena gear sheet with the remote, D-pad focus lands on the `Capture` button (`#calBtn`, `:144`) — it is a plain `<button class="cta small">`, fully reachable by the bootstrap nav's selector at `MainActivity.java:640` — and presses OK. `scale = 25 / 0.0001 = 250000` is written to `x3f_scale`. Every subsequent Arena reading is `force * 250000`, the ring is pinned, and the only recovery is finding "Reset units" (`:144`). Note `ref()` is *not* scaled, so even in the browser this control breaks every `force`-vs-`ref()` comparison (see D14).

### D8 — Changing the movement or band dropdown mid-capture writes the capture to the wrong key.

**Evidence:** `X3F_Calibrate.html:85` and `:93` mutate `band` / `slug` with no phase guard; `:199` reads them at commit time.
```js
bandSel.onchange=()=>{band=bandSel.value;xset('band',band);showStored()};                       // :85
exSel.onchange=()=>{slug=exSel.value;showStored();if(fig&&X3FForm.has(slug))fig.setExercise(slug)}; // :93
...
loop.ok=window.X3FCal?X3FCal.save(slug,band,capLo,capMax):false;                                 // :199
```

**Failure scenario:** on the TV the bootstrap nav's `enter` handler steps a focused `<select>` in place and fires `change` (`MainActivity.java:647`). The two selects sit at the top of the page and are the first two items the fallback nav collects. The user starts a capture, then presses OK once to check something — `exSel` advances from Chest Press to Overhead Press. Twelve seconds later the chest-press hold/max is stored under `overhead-press|White`, and the on-screen confirmation names Overhead Press, so it looks correct.

### D9 — `range()` never validates `lo <= hi`; only `save()` does.

**Evidence:** `x3f-cal.js:93-100`
```js
var e = map()[id(sl, band)];
if (e && e.hi > 0) return { lo: Math.max(0, e.lo || 0), hi: e.hi, auto: !!e.auto };
...
function span(sl, band) { var r = range(sl, band); return Math.max(MIN_SPAN, r.hi - r.lo); }
```
`floor()` returns `lo` unclamped against `hi`, and `span()` collapses to `MIN_SPAN = 10`.

**Failure scenario:** `X3F_Progress.html:329-332` imports `d.exCal` and copies entries verbatim with **no shape validation**:
```js
Object.keys(d.exCal).forEach(k=>{const mine=cur[k],theirs=d.exCal[k];
  if(!mine||(mine.auto&&theirs&&!theirs.auto))cur[k]=theirs});
```
An export from a device where the bar was tared under load, or any hand-edited/corrupt JSON, can carry `{lo:500,hi:100,auto:false}`. After import, `calLo()` returns 500 and `ref()` returns 10. The game reads `force = max(0, raw-baseline-500)` — 0 for the entire set — and if the user does exceed 500, one unit of force is 10% of the screen. There is no UI to detect or repair this: `X3FCal.clear()` is never wired to anything (`x3f-cal.js:129`, called only from `tools/func-test/cases.js:197/215/229/240`).

### D10 — A stored `lo` is only valid against the baseline it was captured with, and nothing records or enforces that.

**Evidence:** `HANDOFF.md:99` documents the rule; no code implements it. On the TV the baseline is a **single packet** taken at `onServicesDiscovered` (`MainActivity.java:348`) — whatever the bar happens to read at the instant the app connects.

**Failure scenario:** Session 1, bar hanging free at connect → native `baseline` = true zero. The user calibrates overhead-press/White as `lo=52, hi=78` (the exact numbers `tools/func-test/cases.js:184` uses). Session 2, the user has left the bar standing in the band with ~30 units of residual tension when the TV app starts. Native `baseline` = 30, so `__x3fForce` at the same start position reads 22 and at all-out reads 48. The bootstrap computes `f = 22 > 52 ? … : 0` → **0**, and at maximum effort `48 > 52` is still false → **0**. The user pulls as hard as they can and nothing on screen moves. Pressing Re-Zero on the TV re-tares natively (`BOOTSTRAP:624` → `Bridge.reZero` :427) but leaves the page's status pill stuck (D12), so there is no signal that it worked.

The inverse also holds: connecting while the bar is *stretched* the other way, or normal load-cell thermal drift, silently shifts every stored floor.

### D11 — `MIN_PEAK = 25` blocks auto-learn for exactly the movements that need it most.

**Evidence:** `x3f-cal.js:47, 121` — `if (!sl || !(peak > MIN_PEAK)) return;`

**Failure scenario:** a calf raise on the White band is a genuinely low-force movement; `x3f-cal.js:41-45` already concedes that a White-band overhead press spans only ~20-35 units. A set whose peak is 22 is discarded, so `calf-raise|White` keeps `bandCeiling('White') = 130` forever. The user pulls 22 out of a 130 ceiling: **17% of the screen at all-out effort**, permanently, with no path out except a manual calibration whose own `MIN_SPAN` gate they may also fail.

### D12 — On the TV, Calibrate lies about its connection state, and Re-Zero wedges the status permanently.

**Evidence:** `X3F_Calibrate.html:128` `setStatus` is called only from `connect()`, `startTare()`, `startDemo()` and `onSample()`. On the TV none of the first three run (`BOOTSTRAP:622` removes the `#firstrun` scrim before the user can press Connect or Demo) and `onSample()` never runs. The initial markup is `<span class="dot" id="dot"></span><span id="statusTxt">Offline</span>` (`:54`) — red dot, "Offline".

**Failure scenario:** the user opens Calibrate on the TV. Live numbers move, the status pill says **Offline** with a red dot. They press "Re-Zero" to fix it. Two listeners fire: the page's own `onclick` (`:153`) calls `startTare()`, which sets `taring=true` and `setStatus('Zeroing - hold still','wait')`; and the native capture listener (`BOOTSTRAP:624`) calls `X3F.reZero()`. `taring` can only be cleared by `onSample()`, which never runs, so the pill now reads **"Zeroing - hold still"** with an amber dot for the rest of the session. (The native re-zero does actually happen — the UI just never says so.)

### D13 — `ref()` is undefined on the Calibrate page; the music hook throws on every frame.

**Evidence:** `X3F_Calibrate.html:225`
```js
var f=function(){ try{ return Math.min(1,(force/ref())*1.05); }catch(e){ return 0.25; } };
```
`ref()` exists in the eight games; Calibrate deliberately has no `ref()`/`calLo()`. This is a copy-paste of the games' snippet.

**Failure scenario:** the soundtrack never responds to effort on the only page where the user is asked for a maximal effort, and a `ReferenceError` is constructed and caught on every intensity poll. Also `buttonHost:document.querySelector(".topbar")||document.body` (`:227`) — Calibrate's header is `.top`, not `.topbar` — so the music button is appended to `<body>` with class `mini`, which has no rule in this page's stylesheet.

### D14 — Arena scales `force` but not `ref()`, so unit conversion breaks every threshold in the browser too.

**Evidence:** `X3F_Arena.html:200` (`… * scale`) vs `:170` (`X3FCal.span(EXSLUG,band)` — raw units) and `:244/:258/:236` (`R*0.55`, `ref()*0.35`, `ref()*(14+…)`).

**Failure scenario:** the user calibrates units to lb. `scale = 0.45`. `force` is now 45% of the raw number while `ref()` is unchanged. Hold-the-Zone's target band, Boss Fight's damage threshold and the ring fill are all off by 1/scale. Note `X3FCal.save` (from the Calibrate page) always stores **raw** units, and `X3FCal.observe` (from Arena) stores **scaled** units — `x3f_exCal` ends up holding two different units in the same map.

### D15 — Bloom and Ascent never feed auto-learn.

**Evidence:** `grep -c "X3FSet.report" X3F_Bloom.html` → 0; `X3F_Ascent.html` → 0. Bloom logs directly at `X3F_Bloom.html:282`. Ascent does not load `x3f-set.js` at all (`:47/:76` are its only script tags plus three.js).

**Failure scenario:** the whole "uncalibrated movements auto-learn the ceiling" promise (`x3f-cal.js:22-25`, `HANDOFF.md:107`) is inert for the default game. A user who only plays Bloom — the game every Library card and every Routine lift opens by default — will never see a single `auto` entry appear in `x3f_exCal`, and every uncalibrated movement stays on the crude `BAND_DEF` ceiling forever.

### D16 — Auto-learn ratchets up only, and there is no way to undo it.

**Evidence:** `x3f-cal.js:120-127`. `if (e && e.hi >= peak) { e.n++; flush; return; }` — the ceiling only ever rises. `clear()` has no caller outside the test harness.

**Failure scenario:** the bar is knocked or dropped and reports a 900-unit spike during a Splash run on `bent-row|Dark Gray`. `X3FSet.report` fills `entry.peak` from `watch.peak` (`x3f-set.js:112, 140`), `observe` writes `hi: 900`. Bent row now needs 900 units for full screen. Nothing in the app — not Progress, not Calibrate, not Arena — can reset it. The only escape is a manual calibration, which the user must know to do.

### D17 — Peaks logged before and after a calibration are in different units, and `pb()` compares them.

**Evidence:** `force` is `raw - baseline` while a movement is uncalibrated (`calLo()` = 0) and `raw - baseline - lo` afterwards (Bloom:159 etc.). `X3FProg.logSet` stores that number as `peak`; `X3FProg.pb(slug, band)` (`x3f-progress.js:148-158`) takes the max across the whole history.

**Failure scenario:** the user does five weeks of overhead presses uncalibrated, peaking at 78. Then they calibrate `lo=52`. Every subsequent set peaks at ~26. `pb().peak` stays 78 forever, `X3FSet.improvement`'s `delta('peak')` reports "-52 peak vs last time" on the very first set after calibrating, and the peak-based daily challenge (`x3f-progress.js:352`) targets a number that is now unreachable by construction.

### D18 — Progress import overwrites `x3f_bandMax` wholesale, with none of the care it takes over `x3f_exCal`.

**Evidence:** `X3F_Progress.html:327`
```js
if(d.bandMax)localStorage.setItem('x3f_bandMax',JSON.stringify(d.bandMax));
```
compared with the deliberate merge on the very next line for `exCal`. Importing a household member's history replaces your band ceilings with theirs, silently changing the scale of every uncalibrated movement.

### D19 — `x3f-cal.js` is not in the service worker precache, and the fetch strategy is cache-first with no versioning of the shared scripts.

**Evidence:** `sw.js:2` — the precache list `A` contains `x3f-exercises.js`, `x3f-form.js`, `x3f-nav.js` and **not** `x3f-cal.js`, `x3f-set.js`, `x3f-progress.js`, `x3f-hype.js`, `x3f-music.js`, `x3f-fx.js`. `sw.js:5-6` is `caches.match(...) || fetch(...)` with a catch-all fallback to `index.html`.

**Failure scenarios:**
- Install the PWA, go offline before ever opening a game → `x3f-cal.js` was never runtime-cached, the fetch fails, and the fallback returns **`index.html` as the body of a `<script>` tag**. `window.X3FCal` is undefined and every game silently falls back to `Math.max(60, bandMax[band]||130)` with `calLo()` = 0 — i.e. the pre-v1.4 behaviour, with no error surfaced.
- Ship a fix to `x3f-cal.js` without bumping `const C='x3f-v8'` (`sw.js:1`) → returning users keep the old module indefinitely, because cache-first never revalidates.

### D20 — `X3F_Calibrate.html` has no keyboard or D-pad navigation in the browser.

**Evidence:** the page never loads `x3f-nav.js` (script tags at `:47-49` and `:222`). Its `<a class="home" … data-nav data-nav-back>` (`:55`) is dead markup. `HANDOFF.md:41` gives the rationale for games ("its Enter/Space handling would fight Space-to-pull"), but Calibrate has both a Space-to-pull binding (`:151`) *and* two `<select>`s and three buttons that a keyboard or gamepad user cannot reach.

On the TV this is masked by the bootstrap's fallback nav (`MainActivity.java:626-665`), so it only bites in Chrome-on-a-TV-stick, a gamepad on a laptop, and any keyboard-only use.

### D21 — `X3F_Calibrate.html` has no func-test coverage.

**Evidence:** `tools/func-test/run.py:28-29` — `SCREENS = ["launcher","routine","library","progress","bloom","flow","splash","bloomtv"]`. `calibrate` is absent. `tools/nav-audit/run.py:43-44` does include it, so reachability is tested but **nothing tests that the capture produces a correct range**. The page that writes the data every other page reads is the only untested one.

### D22 — Minor but real, in `X3F_Calibrate.html`

- **:2** — file header still says *"guided per-band max-pull capture. Sets `x3f_bandMax[band]`."* That has been wrong since v1.4.
- **:214** — `setTimeout(()=>{if(phase==='done')phase='idle'},3200)` is inside the rAF loop, so it schedules a fresh timer on every frame of the `done` phase (~190 timers at 60 Hz). Only the first matters; the rest are garbage.
- **:167** — no cancel. Once `phase !== 'idle'` the button is inert (`if(phase!=='idle')return`) and there is no other way to abort. If the bar disconnects mid-capture, `force` freezes at its last value and the sequence commits that frozen number as both `capLo` and `capMax`.
- **:190-191** — `holdSum += force` accumulates **per animation frame**, so the "average" is frame-rate-weighted, not time-weighted. It is also unfiltered: there is no stability test, no outlier rejection, and the settling frames at the start of the window are included at full weight.
- **:99-112** — `fig` is created once, for whichever slug is selected at load. If that slug has no rig, `fig` stays `null` and `:93` (`if(fig&&…)`) can never create one, so the figure is dead for the rest of the session. All eleven current movements have rigs, so this is latent.
- **:147-149** — demo mode ramps `demoF` by 40 every 27 ms to a cap of 700, i.e. full scale in ~0.5 s. A user who follows the on-screen instruction ("hold your start position") during HOLD gets `capLo ≈ 700`, then `capMax ≈ 700`, and `save()` refuses. **The demo path cannot produce a valid calibration if you obey the prompt.**
- **:193** — the `ready` phase is 2500 ms but the countdown renders `ceil(remaining/1000)`, so it shows `3` for 0.5 s, `2` for 1 s, `1` for 1 s, and `GO` for a single frame before flipping to `cap`.
- **:155** — the `AudioContext` is created lazily inside `beep()`, which first runs from a rAF callback rather than the click handler. On iOS Safari / Bluefy (a documented target — see `X3F_Calibrate.html:130`) that context can start suspended, so the countdown beeps — the only cue a user looking at the bar rather than the screen has — are silent.

### D23 — Minor, in `x3f-cal.js`

- **:30** — docstring says `span()` is *"never below 40"*; `MIN_SPAN` is 10 (`:46`). Stale since v1.5.
- **:134** — `all: map` exports the internal memoised function. A caller mutating the returned object mutates the live cache without writing to localStorage; a subsequent `flush` from `save`/`observe` would then persist the mutation. No current caller, but it is a loaded gun.
- **:69** — `id()` joins on `|` with no escaping. Safe today (slugs are kebab-case, bands are a fixed set) but it is an unversioned, unnamespaced key format with no migration hook.
- **:120-127** — `observe(sl, band, peak)` will happily write `id(sl, null)` → `"deadlift|"` if `X3FSet.band()` returns null (`x3f-set.js:48-54` can return null when neither `__x3fBand` nor `x3f_band` exists). Such an entry is unreachable by any `range(sl, band)` lookup and just accumulates.
- **:60-67** — the 500 ms `map()` cache means a calibration saved in one tab is invisible to another for up to half a second. Harmless today; will not be if a refactor introduces a second writer.

---

## 3. Design weaknesses and opportunities, ranked

1. **There is one movement identity and three band identities.** `X3FCal.slug()`, `X3FSet.report`'s `ex`, and the three per-game copies of the slug lookup (Bloom:259-260, Nova:560-561, Splash:415-416) are four separate resolutions of "which movement". `x3f_band` (global), `x3f_libBand[slug]` (Library), and `cfg[day].per[slug].band` (Routine) are three separate resolutions of "which band". Calibration is keyed on `movement|band`, so every disagreement between any two of these silently orphans a calibration. **A single `X3FContext.current() → {slug, band, source}` resolved once and used by Calibrate, every game, `X3FSet`, the Library and the Routine is the highest-value change available.** Everything in section 2's top five collapses into it.

2. **Calibration is unreachable from where you need it.** Nothing links to `X3F_Calibrate.html` with `?ex=` or `?band=` (§1.5), even though the page is built to accept `?ex=`. The natural entry points — the Library card for a movement, the Routine coach panel before a lift, and a game that notices its scale is a guess — all have the slug and the band in hand. A "Calibrate this on this band" affordance in those three places, passing both parameters, would make the mismatch in D1 structurally impossible.

3. **The capture has no lead-in for someone holding a bar.** The user's own report: you cannot press SELECT and instantly exert maximum force. Current flow gives **3 s** between the click and the start of the HOLD averaging window (`:170` → `:189`), during which the user must set down the remote, step onto the band and be still. Then **2.5 s** between the end of the hold and the start of the max window. Concrete fixes, in order of value:
   - Make the lead-in configurable and default it to ~8 s, with the figure showing the target pose and a spoken/beeped cadence.
   - Gate the HOLD window on *stability* rather than the clock: start averaging only once the signal has been within ±X units for N consecutive samples, and show a "steady…" indicator. Reject the capture if the standard deviation over the window exceeds a threshold, and say so.
   - Gate the MAX window on *release*: end it when force has fallen below, say, 60% of `capMax` for 500 ms, rather than at a fixed 4 s. A user who hits max at 1.2 s currently has to keep straining for 2.8 more seconds.
   - Add an explicit Cancel, and make a second press of the main button abort rather than no-op (`:167`).
   - Add a re-do of just the MAX, keeping the hold.

4. **Every failure mode is a dead end.** `save()` returning false loses the whole 12.5 s capture. `MIN_SPAN` and `MIN_PEAK` are absolute constants applied to a signal whose natural magnitude varies 6× across bands (`BAND_DEF` 130..600) — see `x3f-cal.js:41-45`, which is a comment about exactly this constant having already been wrong once. Make the gates *relative* to the band, offer to save the max alone with `lo=0`, and keep the last capture around so "run it again" only re-does the phase that failed.

5. **No way to see, edit, trust or delete a calibration.** `X3FCal.clear` and `X3FCal.all` exist and are called by nothing but the test harness. The `t` timestamp is written by both `save` and `observe` and read by nothing — `ROADMAP.md:131-135` already flags "nothing records when it was last calibrated". A calibration panel on Progress (or an expanded `showStored()` on Calibrate) that lists every `movement|band` with its range, whether it is `est` or measured, how old it is, and a per-row Clear, would fix D9, D16 and D18 at once and make the whole subsystem legible.

6. **The browser and the TV are two implementations of one signal chain.** §1.4's table shows five live divergences beyond the one that was fixed in v1.6, and `HANDOFF.md:97` says this has already shipped as a user-visible bug twice. The structural fix is to stop having two: give the pages one `X3FSignal` module with `feedRaw(value)` / `setBaseline()` / `force()` that both the Web Bluetooth handler and the native driver call, so `BOOTSTRAP` shrinks to `X3FSignal.feedRaw(window.__x3fForce)` and there is exactly one place where `calLo`, `scale`, clamping and peak-tracking live. Everything in D5, D6, D7 and D12 is a symptom of the split.

7. **The native tare is a single sample.** `MainActivity.java:348` takes the first packet as the baseline; the browser averages 1.5 s (`:142`). Port the averaging window into the native side (or better, into the shared `X3FSignal` from item 6), and expose "re-zeroing…" state back to the page so D12's stuck pill becomes impossible.

8. **`x3f_bandMax` now has three incompatible meanings** — a raw absolute ceiling (Calibrate:202, Arena's number field :229), a floored+scaled peak (Arena's `bandCap` :230), and whatever an imported file said (Progress:327). It is read as an absolute ceiling by `bandCeiling` (x3f-cal.js:74). Either make it strictly derived (never user-written, computed as the max `hi` over all `movement|band` entries for that band) or delete it and give uncalibrated movements a per-movement heuristic seeded from `x3f-exercises.js`'s recommended band.

9. **Auto-learn only learns the ceiling, and only from games that report.** Two independent gaps: Bloom and Ascent do not call `X3FSet.report` (D15), and the floor is never learned at all. A cheap, honest floor estimate exists in the data the games already stream: the **modal resting force between reps** during a set. Feeding a low-percentile-of-the-set estimate into `observe` (behind a confidence counter, never overriding a manual calibration) would make an uncalibrated overhead press usable on the first set instead of after a manual capture — which is the original motivation in `x3f-cal.js:10-15`.

10. **Peak is recorded in two different units depending on calibration state** (D17). Log both an absolute peak and an above-floor peak, or log the `{lo,hi}` that was in force for the set, so history stays comparable across a recalibration.

11. **The Calibrate page is the only page in the suite without `x3f-nav.js`** (D20) and the only game-like page without a func-test scenario (D21). Both are cheap to fix; the second is the one that would have caught most of section 2.

12. **The demo path teaches the wrong thing** (D22). A demo that ramps to full scale in 0.5 s cannot demonstrate "hold your start position". Give demo mode a two-level model — a low "start tension" plateau on tap and a high plateau on hold — so the first-run experience matches the real one.

---

## 4. Invariants a refactor MUST NOT break

Each with the evidence that pins it.

**I1 — `force / ref()` is 0.0 at the movement's start position and 1.0 at its all-out max.**
This is the entire contract the eight games are built on. It is asserted in the test harness:
```js
X3FCal.save('overhead-press', 'White', 52, 78);
ok('the scale is the calibrated span', ref() === 26, String(ref()));
window.__x3fForce = 52;   → ok('resting at the start reads ZERO on the TV path', force === 0)
window.__x3fForce = 65;   → ok('halfway up reads halfway', |force/ref() - 0.5| < 0.05)
window.__x3fForce = 78;   → ok('an all-out press reads as the top', |force/ref() - 1| < 0.02)
```
(`tools/func-test/cases.js:184-196`.) The mutation test recorded in `HANDOFF.md:98` fails with `force=52 / frac=3.00` if the floor subtraction is removed from the TV path.

**I2 — `X3FCal.span()` returns `hi - lo`, never `hi`.**
`tools/func-test/cases.js:224` — `ok('the scale is the range, not the ceiling', X3FCal.span('overhead-press','White') === 118)` after `save(…, 96, 214)`.

**I3 — An explicit calibration outranks auto-learn and is never overwritten by it.**
`x3f-cal.js:123` (`if (e && !e.auto) return;`), asserted at `tools/func-test/cases.js:226-228` (`observe(…, 900)` leaves `hi === 214`). `X3F_Progress.html:331` depends on the same `auto` flag to decide import precedence.

**I4 — Auto-learn is only ever fed a force that is absolute, i.e. only while `lo === 0`.**
`x3f-cal.js:112-119` states it explicitly: *"The peak handed in is the force the GAME saw, which is already floored by `lo`. That is only sound because a movement auto-learns while `lo` is still 0 … Do not relax that check without also un-flooring the peak."* If I3 is relaxed, `observe` starts writing floored peaks as absolute ceilings and every calibrated movement's ceiling decays toward `hi - lo`.

**I5 — An uncalibrated movement has `lo === 0` and `auto === true`, and falls back to the band ceiling.**
`x3f-cal.js:94, 97`; asserted at `tools/func-test/cases.js:216-217`. This is what keeps existing installs working on day one (`HANDOFF.md:107`) and what makes I4 sound.

**I6 — `MIN_SPAN` is 10, not 40; and `save` refuses a span below it.**
`x3f-cal.js:41-46` records that 40 was the bug: *"a White band overhead press genuinely spans only ~20-35 units … so honest calibrations were refused as 'too narrow to be real'."* Asserted both ways at `tools/func-test/cases.js:236-239`: `save('drag-curl','White',100,120) === true` (span 20) and `save('upright-row','White',100,100) === false`. A refactor may loosen the gate; it must not tighten it back.

**I7 — `X3F_Calibrate.html` must NOT define `calLo()` or apply a floor.**
`MainActivity.java:615` — *"Calibrate deliberately has no `calLo()`: it must measure absolute force."* The bootstrap's `typeof calLo === 'function'` check (`:619`) is what keeps the TV from double-flooring the capture. If a shared signal module is introduced, Calibrate must opt out of the floor.

**I8 — `BOOTSTRAP` must remain extractable by `re.search(r'BOOTSTRAP\s*=\s*"""(.*?)""";', java, re.S)`.**
`tools/func-test/run.py:120-126` and the nav audit both parse the live Java text block rather than a copy, precisely so the test cannot drift from the shipped code (`run.py:111-119`). Renaming the constant, switching to string concatenation, or moving it to a resource file breaks the only test that covers the TV signal path.

**I9 — `x3f-nav.js` must claim `window.__x3fNav` before the bootstrap runs, and the bootstrap must only install its fallback `if(!window.__x3fNav)`.**
`x3f-nav.js:283` and `MainActivity.java:626`. `HANDOFF.md:41` also records the harder rule: **do not add `x3f-nav.js` to a game** — its Enter/Space handling fights Space-to-pull in the browser build. Any fix for D20 on the Calibrate page has to respect the Space-to-pull binding at `X3F_Calibrate.html:151`.

**I10 — `?band=` in a game must not write `x3f_band`.**
`X3F_Arena.html:165-167` — *"A `?band=` override no longer writes the global setting, so the set log has to ask the game, not localStorage"* — which is why `window.__x3fBand` exists and why `x3f-set.js:44-49` prefers it over storage. A Routine can run one lift on a band that is not your global default, and the set must be logged against the band you actually pulled.

**I11 — The Routine's per-movement band defaults to *your* band, not the library's suggestion.**
`X3F_Routine.html:256-261` — *"It used to default to `ex.band`, so starting a day on White and walking to the next lift silently moved you up to Dark Gray — a setting you never chose."* Any unification of the three band identities (opportunity 1) must not resolve this one back toward `ex.band`.

**I12 — Only one set entry per set.**
`X3F_Bloom.html:274-276` — *"`X3FProg.logSet` below writes to the same `x3f_history`, so also calling the legacy `logSession` would double-count every rep."* Fixing D15 by adding `X3FSet.report` to Bloom must therefore either replace the direct `X3FProg.logSet` call or pass through a path that does not log twice.

**I13 — The signal must stay clamped at zero.**
Every consumer assumes `force >= 0`: `mapY` (`Bloom:311`, `Flow:160`, `Rhythm:135`), the ring fill (`Arena:241`), `getN: () => force/ref()` handed to `X3FForm` (`Bloom:263`, `Nova:565`, `Splash:419`), and every `getIntensity` for the music. Both paths clamp today (`Bloom:159`; `MainActivity.java:349` and `:619`).

**I14 — `x3f_exCal` entries must survive an export/import round trip, with a real calibration beating an imported estimate.**
`X3F_Progress.html:304, 329-332`; documented at `HANDOFF.md:112`. Any change to the entry shape needs a migration, because exported files in the wild carry the current shape.

**I15 — The TV bundle is generated, not hand-edited.**
`tools/sync-from-web.py` is the only sanctioned way `app/src/main/assets/*` changes; `python tools/sync-from-web.py --check` currently reports "would change: nothing". A refactor that adds a new shared script must add it to `SHARED` (`sync-from-web.py:52-53`), and one that adds a page must add it to `GAMES`/`MENUS` and to `LINKS`. Note `X3F_Ascent.html` is in neither, yet the injected TV block maps `ascent:'ascent.html'` (`sync-from-web.py:86`) — a launch target with no file behind it.

**I16 — `x3f-cal.js` must keep loading in `<head>`, before each game's inline script.**
Every game reads `const EXSLUG = window.X3FCal ? X3FCal.slug() : null` at module top level (Arena:164, Bloom:110, Duel:81, Flow:87, Nova:120, Rhythm:82, Splash:112, Ascent:97). Moving the tag to the end of `<body>` silently reverts all eight to the `bandMax` fallback with no error.

**I17 — Every `X3FCal` call site is guarded by `window.X3FCal ? … : <fallback>`.**
This is what keeps the app working when the module fails to load (D19). If the guards are removed as part of a cleanup, D19 turns from a silent regression into eight broken pages.

---

## 5. Suggested order of attack

1. Unify movement + band identity (`opportunity 1`) — fixes D1, D4, D8's blast radius, and most of D17's confusion.
2. Unify the signal chain across browser and TV (`opportunity 6`) — fixes D5, D6, D7, D12, and closes the class of bug that has shipped twice.
3. Rewrite the capture flow: longer lead-in, stability-gated hold, release-gated max, cancel, partial re-do, relative gates, never write `bandMax` on failure (D2, D22, opportunities 3 and 4).
4. Add a calibration inspector with per-row clear and an age indicator (D9, D16, D18, opportunity 5).
5. Add `calibrate` to `tools/func-test/run.py:SCREENS` with assertions on the hold average, the span gate, the wrong-key-on-mid-capture-switch case, and the "failed save must not touch `bandMax`" case (D21).
6. Sweep the smaller ones: `ref()` in Calibrate's music hook (D13), Arena's `scale` vs `ref()` (D14), Bloom/Ascent reporting (D15), `MIN_PEAK` (D11), `sw.js` precache (D19), Calibrate nav (D20).
