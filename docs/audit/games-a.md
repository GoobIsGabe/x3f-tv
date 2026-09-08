# Audit A — the illustrated / arcade games

**Files read in full:** `web/X3F_Bloom.html` (479 lines), `web/X3F_Splash.html` (426 lines),
`web/X3F_Nova.html` (572 lines).

**Files read for cross-reference:** `web/x3f-cal.js`, `web/x3f-set.js`, `web/x3f-progress.js`,
`web/x3f-hype.js`, `web/x3f-music.js`, `web/x3f-form.js` (API + render loop),
`web/x3f-exercises.js`, `web/sw.js`, `web/manifest.json`, `web/X3F_Flow.html` (scoring block only),
`web/X3F_Routine.html` (session handoff), `tools/sync-from-web.py`, `tools/func-test/cases.js`,
`app/src/main/java/com/goob/x3ftv/MainActivity.java` (the `BOOTSTRAP` string), `ROADMAP.md`,
`HANDOFF.md`, `docs/x3-knowledge/official/12-week-program.md`.

Date of audit: 2026-09-07. Branch `main` at `6466b42`, working tree clean.

---

## 0. Executive summary

Three games, ~1,480 lines of HTML/CSS/JS, of which **95 substantial lines are byte-identical
across all three files** (110 shared between Bloom and Splash, 107 between Splash and Nova,
95 between Bloom and Nova). That duplicated core is the BLE pipeline, the tare, `xget/xset`,
the band `<select>`, `beep()`, the TV-mode button, the wake lock, the SW registration, the
form-panel mount and the music button. Every one of those has been copy-edited independently
at least once, and they have already drifted (see D-31, D-32).

Only **Bloom** models an X3 set. Splash and Nova are score games with no rep, no set, no
failure and no partials; they call `X3FSet.report()` with a `score` and nothing else. Bloom's
model is genuinely the only spine available — but as documented in §2.4 it is a *time-driven*
model, not a *movement-driven* one, and three of its five decision rules are either
unreachable, self-cancelling, or measure something other than what their comment claims.

The single highest-value finding for the overhaul: **Bloom's "eccentric seconds" metric is
structurally incapable of measuring an eccentric** (D-06), and it feeds three shipped
achievement families. The single highest-value *design* finding: **Splash's first-run copy
instructs the player to do the one thing the official X3 program forbids** — let the band go
slack (§6, W-01).

---

## 1. The shared substrate

### 1.1 Module load graph

| File | `<head>` (blocking) | before inline script |
|---|---|---|
| Bloom | `x3f-cal.js` (L55) | exercises, form, **progress, set**, hype, music (L93–98) |
| Splash | `x3f-cal.js` (L57) | exercises, form, **hype, progress, set**, music (L97–102) |
| Nova | `x3f-cal.js` (L60) | exercises, form, **hype, progress, set**, music (L105–110) |

Load order differs between Bloom and the other two for no reason (all six are IIFEs with no
inter-dependency at load time). `x3f-cal.js` must stay in `<head>` because the inline script's
very first statements call `X3FCal.slug()` (Bloom L110, Splash L112, Nova L120).

`x3f-nav.js` is **not** loaded by any game — deliberate (HANDOFF.md:41: *"Don't add x3f-nav.js
to a game — its Enter/Space handling would fight Space-to-pull in the browser build"*). See
D-27 for the consequence.
`x3f-fx.js` is **not** loaded by any game — deliberate (ROADMAP: *"it does not run inside the
games"*).

### 1.2 The force pipeline (identical in all three, byte for byte)

```js
const SERVICE='e3458900-6ed5-40ff-aa3a-4e9a87ce1ad6',
      CH_FORCE='e3458901-6ed5-40ff-aa3a-4e9a87ce1ad6',
      CH_BATT ='e3458902-6ed5-40ff-aa3a-4e9a87ce1ad6';
let device=null,connected=false,demo=false;
let raw=0,baseline=null,taring=false,tSamp=[],tStart=0,tEnd=0,force=0;
```
(Bloom L101/L138-139, Splash L105/L140-141, Nova L113/L143-144)

- `connect()` — `acceptAllDevices:true` + `optionalServices:[SERVICE]`, `getFloat64(0,true)`
  on notify. Bloom L141–154, Splash L143–156, Nova L146–159.
- `startTare()` — collects samples from `now+400ms` to `now+1900ms`, mean = `baseline`.
  Bloom L155, Splash L157, Nova L160.
- `onSample()` — `force = Math.max(0, raw - baseline - calLo())`.
  Bloom L156–161, Splash L158–162, Nova L161–164.
- Demo driver — `setInterval(..., 27)` ramping `demoF`. Ramp constants **differ per game**:
  Bloom `min(ref()*1.05, demoF+ref()*0.06+2)` / decay `*0.9-2` (L164);
  Splash `min(ref()*1.12, demoF+ref()*0.05+2)` / decay `*0.92-2` (L165);
  Nova `min(ref()*1.15, demoF+ref()*0.05+2)` / decay `*0.9-3` (L167).
- Input: `#stage` pointerdown → `pull=true` (demo only), window pointerup / Space keyup.

`CH_BATT` is declared in all three and **never referenced** — there is no battery indicator
anywhere in the suite.
`connected` is written in three places in each file and **never read**.

### 1.3 Calibration adapter (identical in all three)

```js
const EXSLUG = window.X3FCal ? X3FCal.slug() : null;
window.__x3fBand = function(){ return band };
function ref()  { return window.X3FCal ? X3FCal.span(EXSLUG,band)  : Math.max(60, bandMax[band]||130) }
function calLo(){ return window.X3FCal ? X3FCal.floor(EXSLUG,band) : 0 }
```
(Bloom L110–119, Splash L112–121, Nova L120–129)

`ref()` is the *span* of the calibrated range (`hi - lo`, floored at `MIN_SPAN = 10`,
`x3f-cal.js:100`), not the band max. `calLo()` is the movement's start tension. Every screen
mapping in all three games divides by `ref()`.

`X3FCal.range()` **allocates a fresh object on every call** (`x3f-cal.js:93-98`), and `span()`
calls `range()`. This matters enormously in Bloom (see §2.8).

### 1.4 Storage keys

Shared, written or read by these three:

| Key | Written by | Read by |
|---|---|---|
| `x3f_band` | all three (`bandSel.onchange`) | all three, `x3f-set.js:51` |
| `x3f_bandMax` | none of the three | `ref()` fallback, `x3f-cal.js:74` |
| `x3f_cues` | all three (`cueBtn.onclick`) | all three; `x3f-hype.js:91` (**once, at create**) |
| `x3f_music` | `x3f-music.js:193/200` | `x3f-music.js:83` |
| `x3f_formOn` | `x3f-form.js:553` | `x3f-form.js:555` |
| `x3f_session` | `X3F_Routine.html` | `X3FCal.slug()`, each game's form-mount IIFE |
| `x3f_exCal` | `x3f-cal.js` | `ref()`, `calLo()` |
| `x3f_history` | Bloom (direct `X3FProg.logSet`), Splash/Nova (via `X3FSet.report`) | `x3f-progress.js` |
| `x3f_ach`, `x3f_chal`, `x3f_prog` | `x3f-progress.js` | dashboard |

Per-game:

| Key | Game | Line | Semantics |
|---|---|---|---|
| `x3f_bloomBest` | Bloom | L120, L272 | best **total** reps (full + partials), all movements, all bands, pooled |
| `x3f_splashBest` | Splash | L122, L209 | best score |
| `x3f_splashCombo` | Splash | L122, L210 | "best combo" — **never displayed anywhere**, and see D-14 |
| `x3f_novaHi` | Nova | L132, L285 | high score |
| `x3f_novaSector` | Nova | L132, L266 | deepest sector |
| `x3f_novaAch` | Nova | L132, L273 | 6 Nova-local achievements, parallel to and disconnected from `x3f_ach` |

`xget`/`xset` (the `x3f_` prefixer) are re-declared verbatim in all three files.

### 1.5 The Android-TV bootstrap contract (load-bearing, undocumented in the games themselves)

`MainActivity.java` injects `BOOTSTRAP` into every **game** page after load
(`MainActivity.java:139`, string at :580–669). What it touches:

| Line | What it does | What it assumes about the game |
|---|---|---|
| 582 | `window.__x3fNative=true` | (nothing reads it) |
| 583 | `try{ baseline=0 }` | a **global** `baseline` binding exists |
| 585 | injects `.app{max-width:none!important;width:100%!important}` | the root is `.app` |
| 590 | injects `.tvbtn{display:none!important}` | the TV button carries `.tvbtn` |
| 595–606 | `@media (min-width:1200px)` 10-foot type scale, keyed to `.chip .v`, `.chip .k`, `.chip`, `.status`, `.mini`, `select`, `.cta`, `.brand`, `.toast`, `.huge`, `.eyebrow`, `.card h1`, `.card p`, `.card .tag` | those exact class names exist |
| 616–621 | `setInterval(…,16)` writing `force = __x3fForce - calLo()` | a **global** `force` binding and a **global** `calLo` function exist; **`onSample()` is never called** |
| 622 | removes `.show` from `#firstrun` | that id exists |
| 623 | `if(typeof startRun==='function') startRun()` | a global named exactly `startRun` |
| 624 | capture-phase click on `#zeroBtn`, `stopPropagation()` | that id exists; the game's own handler is suppressed |
| 628–668 | fallback D-pad nav; scope = `.scrim.show,.modal.show`; candidates = `button,select,input,a[href],.cta,.buy,.mini,.iconbtn,[role=button],[onclick]` | modals use `.scrim`/`.show`; controls are real elements or carry those classes |

Consequences that the three games are unaware of:

- **Splash and Nova auto-start on the TV** (they have `startRun`). **Bloom does not** — it has
  no `startRun`; its start is an anonymous arrow on `startBtn.onclick` (L265). On a TV the
  player must D-pad to "Start Set".
- **Bloom's `setPeak` is dead on the TV.** It is only assigned inside `onSample()` (L160),
  which the shell never calls. See D-01.
- The 10-foot type scale reaches Bloom and Splash (they use `.chip`) and **completely misses
  Nova**, whose HUD is canvas-drawn.

`tools/sync-from-web.py` regenerates `app/src/main/assets/*.html` from `web/`. The three game
files differ from their bundled copies by exactly **2 hunks each** (manifest link, SW
registration). The script injects the TV block only into `MENUS` (`sync-from-web.py:47-51`),
never into `GAMES` (:36-45).

---

## 2. BLOOM — `web/X3F_Bloom.html`

### 2.1 DOM structure

```
body
└─ .app                                    (height:100dvh; max-width:900px; flex column)
   ├─ .topbar                              (z-index:5)
   │   ├─ button.iconbtn                   ‹  → history.back() || index.html
   │   ├─ button.iconbtn.tvbtn             TV → x3tv()
   │   ├─ .brand                           "X3F BLOOM"
   │   ├─ .spacer
   │   ├─ .status > span#dot + span#statusTxt
   │   ├─ select#bandSel                   5 options, built at L122
   │   ├─ button.mini#cueBtn               "Cues on/off"
   │   ├─ button.mini#formBtn              display:none until X3FForm.mount
   │   └─ button.mini#musicBtn             "Music on/off"
   ├─ .stage#stage                         (flex:1; overflow:hidden; position:relative)
   │   ├─ canvas#cv                        (inset:0; touch-action:none)
   │   ├─ .hud                             (top:10 left:10 right:10; flex; flex-wrap:wrap)
   │   │   ├─ .chip  Reps      → .v.accent#hReps
   │   │   ├─ .chip  Accuracy  → .v#hAcc
   │   │   ├─ .chip  Best Set  → .v.gold#hBest
   │   │   └─ .chip  Force     → .v.petal#hForce
   │   ├─ .toast#toast                     (top:34%)
   │   ├─ [injected] .x3fh                 hype layer, z-index:7
   │   │      .x3fh-flash / .x3fh-near (bottom:14%) / .x3fh-big (top:34%) / .x3fh-burn (bottom:4%)
   │   └─ [injected] .x3ff                 form panel, left:10 bottom:10, z-index:6
   ├─ .ctrl                                (border-top; z-index:5)
   │   ├─ button.cta.ghost#zeroBtn         "Re-Zero"
   │   ├─ select#tempoSel                  4000 / 3000(selected) / 2000
   │   ├─ .grow
   │   └─ button.cta#startBtn              "Start Set" ⇄ "Stop Set"
   └─ .scrim.show#firstrun > .card
       .tag / h1 / p / button.cta#frConnect / button.cta.ghost#frDemo
[body-level, injected by x3f-set.js] .x3fs-toast   position:fixed; bottom:24px
```

`.toast` (top:34%) and `.x3fh-big` (top:34%) occupy **the same rectangle**.
`.x3fh-burn` (bottom:4% of stage) and `.x3ff` (bottom:10px of stage) overlap on short stages.
`.x3fs-toast` is `position:fixed; bottom:24px` — it sits **on top of the `.ctrl` bar**.

### 2.2 CSS tokens (`:root`, L18–22)

```
--bg #120a26   --bg2 #1b1038 (UNUSED)   --panel rgba(255,255,255,.06)
--brd rgba(255,255,255,.12)   --brd2 rgba(255,255,255,.2)
--txt #f4ecff  --dim #b6a6d6  --accent #59f5c4  --accentD #17b98c
--gold #ffd86b --hot #ff7aa8  --petal #ff9ecf   --cyan #7fe9ff (UNUSED)
--d 'Fredoka'  --n 'Space Grotesk'   --sat/--sab safe-area insets
```
Two dead tokens. Both fonts come from `fonts.googleapis.com` (L15–16) — cross-origin, and
`sw.js:5` explicitly skips cross-origin requests, so **an offline first run has no Fredoka and
no Space Grotesk** and falls through to `system-ui`.

Per-band scene hue, canvas-only (L108):
```js
const BAND_HUE={'White':320,'Light Gray':285,'Dark Gray':200,'Black':45,'Elite Black':160};
```

### 2.3 Game state (L229–237)

```js
let running=false,setStart=0,period=3000,reps=0,hitF=0,totF=0;
let curHi=0,fullReps=0,burnoutReps=0,dead=0,burnout=false;   // diminishing-range
let setPeak=0;
let eccStart=0,eccSum=0,eccCount=0;
let phasePrev=0,repMax=0,repHit=0,repFrames=0,miss=0;
let critScale=1,critMood=0,critDroop=0;                       // ALL THREE DEAD
let prevForce=0,critVel=0,wobStart=-9999,wobDur=380,wobStr=1,
    lastOnT=null,cheerUntil=0,popT=0;
let hills=[],islands=[];                                      // hills DEAD (L179)
let lastRepFlash=0;                                           // DEAD (L418)
```

Dead bindings: `miss` (declared L237, zeroed L266, never read), `repHit` (incremented L442,
zeroed L463, never read), `repFrames` (same), `critScale`/`critMood`/`critDroop` (one
occurrence each), `hills`, `lastRepFlash`.

### 2.4 **The X3 set model — complete**

This is the only implementation of the program's rep model in the suite. `X3F_Flow.html`,
which Bloom's header comment claims to be a reskin of, has **no diminishing range at all** —
its whole scoring block is:

```js
// X3F_Flow.html:186-188
const R2=ref(),reached=repMax>=R2*0.78*0.72;
if(reached){reps++;miss=0;$('hReps').textContent=reps;cue(true);if(reps%5===0)toast(reps+' reps');}
else{miss++;if(miss>=2){endSet(true);}}
```

#### 2.4.1 The target curve

```js
// L309-311
const NOWX=()=>W*0.32;
function targetAt(t){ const R=ref(), lo=R*0.12, hi=(curHi||R*0.78);
  const ph=((t)/period)%1;
  return lo + (hi-lo)*(0.5 - 0.5*Math.cos(2*Math.PI*ph)); }
function mapY(f){ const top=64, bot=H-58, R=ref();
  const fr=Math.max(0,Math.min(1.02, f/(R*1.0)));
  return bot - (bot-top)*fr; }
```

- Phase `ph ∈ [0,1)` of the tempo clock. `ph = 0` → target = `lo` (**bud** = trough).
  `ph = 0.5` → target = `hi` (**bloom** = peak). Raised cosine, so the ease is symmetric.
- `lo = 0.12·R` — the "never to zero, tension stays on" floor. Fixed, never adapts.
- `hi = curHi`, initialised to `0.78·R` at set start (L268), and **monotonically decreasing**
  thereafter.
- `period` = the tempo select: 4000 / **3000 (default)** / 2000 ms **for a full up-and-down
  cycle**.
- `mapY` is a **linear** force→screen map, clamped at `1.02·R`.

#### 2.4.2 The rep boundary

```js
// L429
const tNow = running ? now-setStart : now;
// L441-465
if(running){
  totF++; if(onT)hitF++; repFrames++; if(onT)repHit++; if(force>repMax)repMax=force;
  const ph=(tNow/period)%1;
  if(ph<phasePrev){          // ← THE REP BOUNDARY
     … three branches …
     repMax=0;repHit=0;repFrames=0;
  }
  phasePrev=ph;
  $('hAcc').textContent = totF ? Math.round(hitF/totF*100)+'%' : '-';
}
```

**A rep is a tempo-clock wrap, not a movement.** The window is `[n·period, (n+1)·period)`,
i.e. trough → peak → trough, and the only thing carried across it is `repMax`, the maximum
force seen inside the window. Nothing about the athlete's *motion* is inspected — not the
minimum, not the direction, not the timing of the peak within the window.

#### 2.4.3 The three branches (L444–464), verbatim

```js
if(ph<phasePrev){ // one rep cycle -> diminishing-range scoring (the X3 way)
  const R2=ref(), reached = repMax>=curHi*0.78, meaningful = repMax>=R2*0.17;

  if(reached){                                                    // ---- BRANCH A
    reps++; dead=0;
    if(curHi>=R2*0.60) fullReps++; else burnoutReps++;
    if(eccStart){ const es=(now-eccStart)/1000; if(es>0.3&&es<12){ eccSum+=es; eccCount++; } }
    eccStart=now;
    if(hype&&burnoutReps>0) hype.setBurn(burnoutReps);
    $('hReps').textContent=reps; cue(true); popT=now+280; cheerUntil=now+650; triggerWobble(1.3);
    if(hype)hype.set(reps); if(music)music.duck(.5);
    spawnBurst(NOWX(),mapY(repMax),BAND_HUE[band]||320);
    if(reps%5===0) toast(reps+' reps');
  }
  else if(meaningful){                                            // ---- BRANCH B
    reps++; burnoutReps++; dead=0;
    if(hype)hype.setBurn(burnoutReps);
    curHi = Math.max(R2*0.22, curHi*0.85, Math.min(curHi, repMax*1.03));
    if(!burnout){ burnout=true; toast('🔥 BURNOUT'); }
    $('hReps').textContent=reps; cue(true); popT=now+220; triggerWobble(1);
    if(hype)hype.set(reps); if(music)music.duck(.4);
    spawnBurst(NOWX(),mapY(repMax),35);
  }
  else{                                                           // ---- BRANCH C
    dead++; curHi = Math.max(R2*0.22, curHi*0.9);
    if(!burnout){ burnout=true; toast('🔥 BURNOUT'); }
    if(dead>=2) endSet(true);
  }
  repMax=0; repHit=0; repFrames=0;
}
```

#### 2.4.4 The numbers, worked out

With `R = ref()` = the calibrated span:

| Quantity | Value |
|---|---|
| Bud (trough target) | `0.12·R` — fixed for the whole set |
| Bloom (peak target) at set start | `curHi = 0.78·R` |
| "Reached" threshold | `0.78·curHi` → **`0.6084·R` on rep 1** |
| "Full rep" classification | while `curHi ≥ 0.60·R` |
| "Meaningful" threshold | `0.17·R` — fixed |
| `curHi` floor | `0.22·R` |
| "Reached" threshold **at the floor** | `0.78 × 0.22 = 0.1716·R` |
| Failure | 2 **consecutive** branch-C cycles (`repMax < 0.17·R`) |
| Accuracy tolerance | `±0.14·R` around the live target (L435) |

**`curHi` trajectory.** Branch A never touches `curHi`. Branch B decays it; branch C decays it
by 10%. From `0.78·R`, successive branch-B events give:

```
0.780 → 0.663 → 0.5636 → 0.4791 → 0.4072 → 0.3461 → 0.2942 → 0.2501 → 0.2126→clamped 0.22
```

So **`fullReps` stops accruing after exactly two branch-B events** (0.5636 < 0.60), and the
floor is reached after eight.

**Invariant:** `reps === fullReps + burnoutReps`, always. Branch A does `reps++` and exactly
one of `fullReps++` / `burnoutReps++`; branch B does `reps++` and `burnoutReps++`; branch C
does neither. The logged `reps`, `full` and `part` therefore satisfy `full + part = reps`.

#### 2.4.5 What the model gets right

1. It is the only implementation anywhere in the suite of *full reps → diminishing partials →
   failure*, which the official source (`docs/x3-knowledge/official/12-week-program.md`,
   Principle 1) makes the defining shape of an X3 set.
2. The bud floor at `0.12·R` correctly encodes "never let the band go slack".
3. Partials are logged as a **first-class number** (`part:`), not folded into `reps`, so the
   dashboard, the challenge generator (`x3f-progress.js:330-337`) and the achievement
   catalogue (`:484-491`, `:561-564`) can all address them.
4. The visual target *moves down* as `curHi` decays, so the game literally shows the
   diminishing range.
5. `setPeak` and time-under-tension are captured per set.
6. The failure path (`dead>=2 → endSet(true)`) exists and ends the set without a dialog.

#### 2.4.6 What the model gets wrong (all of this must be fixed, not ported)

**(a) The trough is never validated.** The comment (L3–4) promises *"ease down into each bud
(trough, but never to zero = tension stays on)"*. Nothing in the scoring block reads a minimum.
The only per-window statistic is `repMax`. Therefore: pull to `0.62·R` once, hold there
motionless, and every cycle scores a full rep forever. There is no eccentric, no concentric,
no range. Official Principle 2 ("Maintain Constant Band Tension") is exactly the thing this
model claims to enforce and does not measure.

**(b) The set cannot end.** Failure requires `repMax < 0.17·R` in **two consecutive** tempo
cycles — 6 s at the default tempo. Because branch A resets `dead=0`, and because at the `curHi`
floor the branch-A threshold is `0.1716·R` while branch C fires below `0.17·R`, the entire
decision at the floor collapses to a **0.0016·R-wide window**. Anyone able to hold 18% of the
band's span farms reps indefinitely. The official instruction is *"continue until you can no
longer move the bar even an inch"*; the code's test is "until you let go for six seconds".

**(c) The third argument of the `curHi` update is unreachable.** In branch B the guard is
`repMax < curHi*0.78`, so `repMax*1.03 < 0.8034·curHi`, which is always **less** than
`curHi*0.85`. `Math.max(R2*0.22, curHi*0.85, Math.min(curHi, repMax*1.03))` is therefore
identical to `Math.max(R2*0.22, curHi*0.85)`. **The diminishing range does not track how far
you actually got — it is a fixed −15% geometric decay.** The one line that looks like it
measures the athlete is dead code.

**(d) `curHi` is a one-way ratchet.** It never recovers. Two slightly-short reps early in a
set permanently reclassify every subsequent rep — however perfect — as a partial, because the
`curHi >= 0.60·R` test is on the (already lowered) `curHi`, not on the rep. A set of 30
textbook full-range reps that began with two twitchy ones logs `full: 2, part: 28`.

**(e) The visual target and the scoring threshold disagree by 17 points of span.** The bloom
is drawn at `curHi`; credit is given at `0.78·curHi`. On rep 1 the flower is at 78% height and
the rep scores at 61%. Players learn, correctly, to under-pull.

**(f) "Eccentric seconds" measures the tempo clock.** See D-06. `eccStart` is set at the
*phase wrap* (the trough), not at the top of a rep, and the delta between two consecutive
successful wraps is `period` by construction. On the default 3 s tempo, `ecc` is 3.00 for
every set that reaches two reps; on Gentle it is 4.00; on Brisk, 2.00. The comment at L232-233
says *"Time each rep top to the next"* — the code times trough to trough, and there is no
"top" recorded anywhere.

**(g) The tempo menu contradicts the program.** Official Principle 3: *"a controlled 2–3
second tempo up and down"* → **4–6 s per rep**. Bloom offers 4 s / **3 s (default)** / 2 s for
a full cycle. The default trains a 1.5 s-up / 1.5 s-down rep — twice as fast as the program's
minimum — and "Brisk 2s" is three times too fast.

**(h) Backgrounding the tab is free.** `rAF` stops; `setStart` does not move. Return after
30 s and `tNow` has advanced 10 periods but the phase wraps at most once, so one rep window is
evaluated instead of ten and `dead` cannot reach 2. There is no pause and no visibility
handling in any of the three games.

**(i) `fail` is ignored.** `function endSet(fail)` (L271) never reads its parameter. A manual
"Stop Set" and a genuine failure produce byte-identical log entries and the same "Failure ·
N partials past it" toast.

### 2.5 Art assets and how they are drawn

```js
// L131-135
const ASSET_BASE='assets/bloom/';
[['bg','bg.jpg'],['critter','critter.png'],['critterStrain','critter_strain.png'],
 ['critterCheer','critter_cheer.png'],['flower','flower.png'],['bud','bud.png'],
 ['petal','petal.png']].forEach(([k,f])=>{
  IMG[k]={ok:false}; const im=new Image();
  im.onload=()=>{IMG[k].img=im;IMG[k].ok=true;if(k==='bg')buildBG()};
  im.onerror=()=>{IMG[k].ok=false}; im.src=ASSET_BASE+f;
});
```

| Slot | File | Source px | Bytes | Drawn at | Draw site |
|---|---|---|---|---|---|
| bg | `bg.jpg` | 804 × 1440 | 214 KB | cover-fit into offscreen `bgC`, + `rgba(18,10,38,.28)` tone | L184–190 |
| critter | `critter.png` | 376 × 512 | 212 KB | `ih = min(W,H)*0.28`, aspect-preserved | L391–394 |
| critterStrain | `critter_strain.png` | 327 × 512 | 166 KB | same | L392 |
| critterCheer | `critter_cheer.png` | 367 × 512 | 174 KB | same | L391 |
| flower | `flower.png` | 465 × 512 | 226 KB | `s = min(W,H)*0.09*sc`, sc ∈ [0.7,1.3] → **≈ 57–105 px** | L354 |
| bud | `bud.png` | 306 × 512 | 160 KB | `s = min(W,H)*0.05` → **≈ 45 px** | L348 |
| petal | `petal.png` | 409 × 512 | 213 KB | `s = p.size*1.6`, `p.size ∈ [5,11]` → **8–17 px** | L321 |

**1.35 MB of PNG/JPG for a game whose largest sprite renders at ~150 px and whose smallest
renders at 8 px.** `petal.png` alone is 213 KB and 838 KB of decoded VRAM, drawn at 14 px.

The procedural fallback is complete and independent: `buildBG` (L191–226) paints a twilight
gradient sky, a moon with a warm radial glow and two craters, 70 deterministic stars, two
`ridge()` hill layers hue-shifted from `BAND_HUE`, two floating islands with rock underside +
grass cap, and a foreground foliage silhouette — all into an **offscreen canvas** (`bgC`,
L174) rebuilt only on resize / band change / bg load. `drawBud` (L347–352), `drawBloom`
(L353–362) and `drawCritter`'s fallback (L395–413, including a two-state face: round eyes +
smile when on-target, angled brows + open mouth when straining) all draw procedurally.

`drawCritter` applies `ctx.scale(sx, sy)` **before** `drawImage` (L380/L394), so the
illustrated character is non-uniformly squashed and stretched by the velocity term. On a
hand-drawn sprite this reads as smearing, not as squash-and-stretch.

Sprite selection cascade (L391–393): `cheer → strain → happy → procedural`. `strain` shows
whenever `!onT`, which includes the entire idle screen (force ≈ 0, target oscillating), so
before the set starts the critter is permanently grimacing.

**None of `assets/bloom/*` is in the service-worker precache list** (`sw.js:2`).

### 2.6 HUD

Four DOM `.chip`s (Reps / Accuracy / Best Set / Force) in `.hud`, plus:

- `.toast` (top:34%) for "Grow!", "N reps" every 5, "🔥 BURNOUT", and the end-of-set line.
- A **canvas-drawn** burnout banner (L468), pulsing at `0.65+0.35·sin(now·0.008)`, text
  `'🔥 BURNOUT · partials to failure'`, positioned at `max(116, min(W,H)*0.17)`.
- Three guide lines on the canvas at `0.12 / 0.45 / 0.78` of `R` (L332). **The 0.78 line does
  not move with `curHi`** — during burnout it points at a height you are no longer being asked
  to reach. The `0.45` line has no meaning in the model at all.
- The `x3f-hype.js` layer: approach counter (`bottom:14%`), milestone callout (`top:34%`,
  colliding with `.toast`), and the burnout meter (`bottom:4%`).
- The `x3f-form.js` panel (`left:10px; bottom:10px`), when launched with `?ex=`.
- `x3f-set.js`'s `.x3fs-toast` (`position:fixed; bottom:24px`) for the improvement line.

Per-frame DOM writes: `$('hForce').textContent` **every frame** (L469), `$('hAcc').textContent`
every frame while running (L466).

### 2.7 Music

```js
// L249-250
const music = window.X3FMusic ? X3FMusic.create({ mood:'bloom',
  getIntensity: () => Math.min(1, (force/ref())*1.1) }) : null;
```

Mood `bloom` (`x3f-music.js:23-26`): **68 bpm**, root **220 Hz (A3)**, minor pentatonic
`[0,3,5,7,10]`, `triangle` lead over a `sine` pad, lowpass cutoff **620 Hz**, glide 0.09, no
swing, kick 0.20, hat 0.05, bass enters at intensity **0.45**. Described in-file as
*"twilight garden: warm, slow, pentatonic, nothing sharp"*.

Intensity is **raw force only**. Because the target curve returns to `0.12·R` every cycle, the
arrangement collapses and reopens once per rep — the filter sweeps, the bass drops out and
rejoins, the melody density flips between 8ths and 16ths, all at the tempo of the set. That is
either the best or the worst thing about it and nobody has decided which.

`music.duck(.5)` on every branch-A rep (L451) and `.duck(.4)` on branch B (L459). Duck holds
gain at 0.28 for the duration, so at the 3 s tempo the music is ducked **one sixth of the
time**, permanently.

### 2.8 Frame cost

Per frame, in `loop()` (L419–472):

| Work | Count |
|---|---|
| `clearRect` + full-canvas `drawImage(bgC)` | 1 blit at DPR resolution |
| Fireflies | 16 × 2 arcs = **32** |
| `drawVine` guide lines | 3 strokes |
| Vine path | `(W+16)/6` ≈ **153 `lineTo`**, stroked **twice** — once at `lineWidth` up to 64 for the glow, once at 3.5 px **with `shadowBlur=12`** |
| Buds + blooms | ≈ 4 + 4; each procedural bloom = 6 rotated ellipses + 2 arcs |
| Now-line beam | **a fresh `createLinearGradient` every frame** (L432) |
| Petals | steady state ≈ 3, spikes of 14 per burst |
| Critter | **a fresh `createRadialGradient` every frame** (L388) + 1 `drawImage` (or ~12 paths) |
| Burnout banner | `ctx.font` string built per frame + `shadowBlur=14` text |
| DOM | 2 `textContent` writes per frame |

**The dominant cost is `ref()`.** Counted exactly:

- `drawVine`: 1 (L329) + 3 (guide `mapY`) + 153 × 2 (`targetAt` + `mapY` per path step) + 2
  (lineWidth) + 8 (buds) + 8 (blooms) = **328**
- `loop`: 2 (L435) + 1 (L437) + 1 (`drawCritter` L366) = **4**

≈ **332 `ref()` calls per frame**. Each one is `X3FCal.span → X3FCal.range`, and
`x3f-cal.js:93-98` **returns a freshly allocated object literal every time**. At 60 fps that
is **~20,000 short-lived objects per second**, purely to read two numbers that change at most
once per set.

Concurrent loops on a Bloom page launched with `?ex=`: the game's `rAF`, `x3f-form.js`'s own
`rAF` (`x3f-form.js:492/499` — steps every frame, repaints at 34 fps), `x3f-hype.js`'s `rAF`
(`:234-240`), `x3f-music.js`'s 120 ms `setInterval`, `x3f-set.js`'s 40 ms `setInterval`.
**Three rAF loops and two intervals.** ROADMAP item 7 already flags this.

`endSet` runs `X3FProg.logSet` → `compact()` (a full re-bucket + sort when the log exceeds 420
entries) and `X3FProg.checkAchievements()` → `catalogue()` (rebuilds ~130 closures) ×
`stats()` (full log walk + `streak()` up to 400 iterations + `program()`) — **all synchronously
inside the `rAF` callback**, at the exact instant of the celebration.

---

## 3. SPLASH — `web/X3F_Splash.html`

### 3.1 DOM structure

Same shell as Bloom. Differences:

```
.stage#stage
 ├─ canvas#cv
 ├─ .vig                       inset box-shadow vignette
 ├─ #flash                     radial gold, mix-blend-mode:screen, opacity via JS
 ├─ .hud   → .chip Score(.v.accent#hScore) / Combo(.v.coral#hCombo)
 │                 / Best(.v.aqua#hBest) / Force(.v#hForce)
 ├─ .cbar#cbar > i#cbarFill    top:58px left:10px, 120×6px combo bar
 └─ .toast#toast               top:28%
.ctrl → #zeroBtn, .grow, #startBtn ("Dive In" ⇄ "Surface")   — NO tempo select
```

`.hud` is `flex-wrap:wrap`. At narrow widths the four chips wrap to a second row starting at
roughly `y=58px` — **exactly where `.cbar` is pinned**. They overlap.

### 3.2 CSS tokens (L15–19)

```
--bg #02243a  --panel rgba(3,34,54,.5)  --brd/.16 --brd2/.28
--txt #eafcff --dim #a9d8ec  --accent #ffd23f --accentD #f2a71b
--aqua #31e8ff --coral #ff7a9c --mint #39f5c4 --hot #ff5d78
```
All used.

### 3.3 Game state (L182–189)

```js
let running=false,runStart=0,score=0,combo=1,comboT=0,elapsed=0,comboMaxT=1.7;
let dolY=0,dolVY=0,inAir=false,wasAir=false,blinkT=0,tailPh=0;
let shake=0,flashT=0;                       // flashT is DEAD (assigned L383, never read)
const cols=[],parts=[],bubbles=[],fishBg=[],motes=[];
let spawnT=0;
```
Ambient sets: 28 `bubbles`, 7 `fishBg`, 40 `motes` (L187–189).

### 3.4 Force mapping and "physics"

```js
// L177-179
const WL   = () => H*0.46;          // waterline
const DOLX = () => W*0.3;
function forceY(n){ const top=H*0.08, bot=H*0.92;
  return bot - (bot-top)*Math.max(0, Math.min(1.12, n)); }
// L360-365
const targetY = forceY(n);                    // n = force/ref()
dolVY += (targetY - dolY)*10*dt; dolVY *= 0.86; dolY += dolVY*dt;
if(dolY<40)dolY=40; if(dolY>H-24)dolY=H-24;
inAir = dolY < WL();
```

A critically-damped spring toward the force height, so the dolphin lags and overshoots. Breach
in / out fire spray, a foam ring, a beep and `shake`. Clamps are **hard-coded pixels** (40 / 24)
rather than fractions of `H`.

Force → waterline: `dolY < 0.46H` ⟺ `n > 0.5476`. **Breaching requires ~55% of span.**

### 3.5 The rep / set model

**There is none.** No reps, no set, no failure, no partials, no `hReps`. The run ends only when
the player presses "Surface". Reporting:

```js
// L208-212
function endRun(){ running=false; $('startBtn').textContent='Dive In'; $('cbar').classList.remove('on');
  if(score>bestScore){bestScore=score;xset('splashBest',bestScore);$('hBest').textContent=bestScore;}
  if(combo>bestCombo){bestCombo=combo;xset('splashCombo',bestCombo);}
  if(window.X3FSet)X3FSet.report({g:'splash',score:Math.round(score),hype:hype});
  else logSession({g:'splash',score:Math.round(score),combo:combo});
  beep(430,0.16);toast('Nice run · '+Math.round(score));}
```

The reported entry carries `g`, `ex` (from `?ex=`), `band`, `score`, and whatever
`x3f-set.js`'s watcher supplies for `peak` and `tut`. `X3FProg.sets()` accepts it because it
has a `g` (`x3f-progress.js:141`), so **a 10-second Splash run marks the day as trained**,
counts toward `sessions`, and flips the Push/Pull alternation (`x3f-progress.js:244`).

### 3.6 Collectibles

```js
// L191-202
const TYPES={
  bubble:{r:13,val:1,col:'#7fe9ff',zone:[0.30,0.98]},
  pearl :{r:15,val:3,col:'#ffe3f1',zone:[0.35,0.9 ]},
  fish  :{r:17,val:2,col:'#ff9a4d',zone:[0.45,0.95]},
  star  :{r:20,val:5,col:'#ffd23f',zone:[-0.05,0.42]}
};
function spawnCol(now){
  const roll=Math.random();
  const t = roll<0.42?'bubble' : roll<0.66?'fish' : roll<0.84?'pearl' : 'star';
  const z=TYPES[t].zone, ny=z[0]+Math.random()*(z[1]-z[0]);
  cols.push({t,x:W+40,y:forceY(1-ny),r:…,val:…,col:…,ph:…,glint:…});
}
```

Spawn mix: bubble 42%, fish 24%, pearl 18%, star 16%.
Spawn interval `rate = max(0.4, 0.9 - elapsed*0.006)` s (L368); scroll speed
`W*0.16*(1 + elapsed*0.01)` px/s (L372). Collision: circle/circle, `dolR = min(W,H)*0.06`
(L372–375).

Scoring (L376): `combo = min(99, combo+1)` on **every** pickup; `score += val*combo`;
`comboT = 1.7 s`. Combo decays to 1 only if 1.7 s pass with no pickup **and only while
`running`** (L370).

**Zone arithmetic is wrong for two of four types.** `y = forceY(1-ny)` is above the waterline
when `1-ny < 0.5476`, i.e. `ny > 0.4524`:

| Type | `ny` range | Fraction of range spawned **in the sky** |
|---|---|---|
| bubble | 0.30 – 0.98 | `ny < 0.4524` → **22%** |
| pearl | 0.35 – 0.90 | **19%** |
| fish | 0.45 – 0.95 | 0.5% |
| star | −0.05 – 0.42 | 0% (always airborne — correct) |

So roughly one in five bubbles and pearls is drawn floating in mid-air above the sea.

### 3.7 Art assets

```js
// L133-137  ASSET_BASE='assets/splash/'
[['dolphin','dolphin.png'],['star','star.png'],['pearl','pearl.png'],
 ['bubble','bubble.png'],['fish','fish.png']]
```

| Slot | Source px | Bytes | Drawn at |
|---|---|---|---|
| dolphin | 482 × 512 | 195 KB | `ih = min(W,H)*0.17` ≈ **150 px** (L313) |
| star | 512 × 496 | 204 KB | `r*2.5` = **50 px** (L286) |
| pearl | 509 × 512 | 227 KB | `r*2.3` = **34.5 px** (L287) |
| fish | 512 × 396 | 212 KB | `r*2.7` = **45.9 px** (L288) |
| bubble | 512 × 511 | 286 KB | `r*2.2` = **28.6 px** (L289) |

**1.12 MB of PNG.** `bubble.png` is the single largest asset in the repo and renders at 29 px.
None of it is precached by `sw.js`.

The procedural fallback is far richer than Bloom's: `drawDolphin` (L301–345) has a wagging
tail on its own transform, a two-stop body gradient, a belly, a dorsal fin, a fluttering
pectoral, a beak, a **blinking** eye on a 2–5 s random timer, and a smile arc — plus velocity
tilt (`vy/850`), squash (`vy/1400`), and a `breathe` term. When the illustrated sprite loads,
**all of that animation is discarded** (early `return` at L319) and replaced by one static
`drawImage`; only the outer tilt/squash transform survives. `blinkT` never advances in the
image path.

### 3.8 HUD

Score / Combo / Best / Force chips; `#cbar` combo meter (`width = min(100, combo/12*100)%`,
L380) — it shows **combo size, not remaining time**, so it never drains and communicates
nothing the "x7" chip does not; `#flash` full-screen gold pulse on every 10th combo (L383);
`.vig` static vignette; `.toast` at 28%; plus the hype layer and (with `?ex=`) the form panel.

Hype ladder is overridden for score (L401–404):
`ladder:[100,250,500,750,1000,1500,2000,3000,5000,7500,10000]`, `best:()=>bestScore`.
`majors` is **not** overridden, so it stays `[50,75,100,150,200,250]` — see D-09.

### 3.9 Music

```js
// L405-406
X3FMusic.create({ mood:'splash',
  getIntensity: () => Math.min(1, Math.max(force/ref()*0.8, (combo-1)/12)) });
```

Mood `splash` (`x3f-music.js:28-31`): **104 bpm**, root **261.63 Hz (C4)**, major pentatonic
`[0,2,4,7,9]`, `square` lead over a `triangle` pad, cutoff **1500 Hz**, **swing 0.12**, kick
0.30, hat 0.10, bass at 0.35. *"sunlit reef: bright, bouncy, major, arcade"*.

The `Math.max` with `(combo-1)/12` means a maintained combo keeps the arrangement open even
while the player is resting at zero force — the soundtrack rewards not pulling.
`music.duck(.7)` on every 10th combo (L383). No duck on ordinary pickups.

### 3.10 Frame cost

**Nothing is cached.** `drawEnv(now)` (L237–277) rebuilds the entire scene every frame:

| Work | Ops per frame (at W ≈ 900) |
|---|---|
| `createLinearGradient` ×2 (sky, water) + `createRadialGradient` ×1 (sun) | **3 gradient allocations** |
| Sun disc + 3 glints under `globalCompositeOperation='screen'` | 4 arcs + 2 composite switches |
| 3 clouds × 3 arcs | 9 |
| `rect` + `clip` | 1 clip |
| 7 god-ray polygons under `'screen'` | 28 path ops |
| 4 caustic strokes, `for(x=-10;x<=W;x+=12)` | ≈ **308 `lineTo`** |
| 40 plankton motes | 40 arcs |
| 9 coral fronds (quadratics) + 16 polyps | 25 |
| 28 ambient bubbles (stroked arcs) | 28 |
| 7 background fish (ellipse + 3 lineTo) | 28 |
| Foam waterline `for(x+=8)` + `for(x+=26)` bubbles | ≈ **114 `lineTo` + 36 arcs** |
| **Subtotal `drawEnv`** | **≈ 620 canvas path operations, 3 gradient allocations, 1 clip, 4 composite-op switches — every frame** |
| Collectibles on screen | 7–16, each save/scale/translate + draw + glint + a ~6% chance to spawn a spark |
| Particles | capped at **320** (L216), each with `globalAlpha` churn; `plus` particles build a `ctx.font` string **per particle per frame** (L228) |
| Dolphin | full procedural rig, or 1 `drawImage`; ≥2 chances per frame to spawn a bubble-trail particle (L311, L317/L343) |
| DOM | `$('hForce').textContent` every frame (L391) |

`ctx.clearRect(-30,-30,W+60,H+60)` (L357) is redundant — `drawEnv` immediately fills the whole
canvas twice over.

Splash is comfortably the most expensive of the three, and almost all of it is static art that
Bloom already demonstrates how to cache (`bgC` / `buildBG`).

---

## 4. NOVA — `web/X3F_Nova.html`

### 4.1 DOM structure

```
.app
 ├─ .topbar        ‹ / TV / brand / status / #bandSel / #cueBtn / #formBtn / #musicBtn
 ├─ .stage#stage   → canvas#cv, #flash, #dmgvig       ← NO .hud, NO .toast
 └─ .ctrl          → #zeroBtn, .grow, #restartBtn ("Restart")   ← NO start button
.scrim.show#firstrun  → #frConnect / #frDemo
.scrim#shop           → .shopwrap: .shophead(h2#shopTitle, .dust>#shopDust),
                        .shopsub#shopSub, #shopList, .cta.gold#launchBtn
.scrim#gameover       → .card: #goTag, h1#goTitle, p#goStats, .cta#retryBtn,
                        .cta.ghost → index.html
```

**Nova's entire HUD lives on the canvas** (`drawHUD`, L503–532). It has no `.chip`, no
`.toast`, no `.hud`. Consequence: the TV shell's 10-foot type scaling
(`MainActivity.java:596-604`) targets `.chip .v` / `.chip .k` / `.toast` and **does not reach
Nova at all**.

### 4.2 CSS tokens (L15–19)

```
--bg #05030f  --panel rgba(20,14,44,.55)  --brd rgba(160,140,255,.22)  --brd2 …,.4
--txt #eee9ff --dim #a99fd6  --accent #8f7dff --accentD #5f49d6
--cyan #37e6ff --gold #ffd23f --hot #ff5d78 --mint #39f5c4
```
All used. Nova is the only one of the three with a `.cta.gold` variant and a shop stylesheet
(`.shopwrap`, `.shophead`, `.shopsub`, `.up`, `.buy`).

### 4.3 Game state

```js
// L186-191
let scene='menu';                                   // 'menu' | 'play' | 'shop' | 'over'
let enemies=[],parts=[],dust=[],pups=[];
const player={x:0,y:0,dmg:55,beamW:16,maxShield:60,shield:60,regen:10,
              magnet:0.13,odRate:1,health:3,invuln:0,hitDelay:0};
let stardust=0,score=0,combo=1,od=0,novaFlash=0,shake=0,slow=0;   // novaFlash is DEAD
let sectorIdx=0,waveIdx=0,waveDefs=[],spawnQ=[],spawnClock=0,
    bossActive=false,boss=null,phase='wave';        // phase: 'wave' | 'boss' | 'shop'
let aimX=0,aimY=0,beamOn=false,kills=0,noDmgSector=true,banner='',bannerT=0;
```

`player.magPull` is set only in `applyStats()` (L210) and is **absent from the object literal**.

### 4.4 Upgrades (L193–211)

```js
const UPGRADES=[
 {key:'dmg',   nm:'Beam Damage', ds:'+22% beam power',            ic:'⚡',  base:22, lvl:0},
 {key:'width', nm:'Beam Width',  ds:'wider beam, more targets',   ic:'🌊', base:24, lvl:0},
 {key:'shield',nm:'Shield Core', ds:'+25 max shield',             ic:'🛡️', base:20, lvl:0},
 {key:'regen', nm:'Shield Regen',ds:'+40% regen speed',           ic:'♻️', base:18, lvl:0},
 {key:'od',    nm:'Overdrive',   ds:'NOVA charges +30% faster',   ic:'💥', base:22, lvl:0},
 {key:'magnet',nm:'Tractor Beam',ds:'+50% stardust pull range',   ic:'🧲', base:16, lvl:0},
];
function upCost(u){ return Math.round(u.base*Math.pow(1.65,u.lvl)) }
function applyStats(){
  player.dmg      = 55  * (1+0.22*upLvl('dmg'));
  player.beamW    = 16  * (1+0.22*upLvl('width'));   // ds says +24% at base:24 — cosmetic mismatch
  player.maxShield= 60  + 25*upLvl('shield');
  player.regen    = 10  * (1+0.4 *upLvl('regen'));
  player.odRate   = 1   * (1+0.3 *upLvl('od'));
  player.magnet   = 0.13* (1+0.5 *upLvl('magnet')); // player.magnet is NEVER READ
  player.magPull  = 300 * (1+0.6 *upLvl('magnet')); // ds says +50%, code applies +60%
}
```

All levels are wiped on every new run (`applyStatsReset`, L282). There is no meta-progression;
stardust does not persist.

### 4.5 Enemies, waves, sectors

```js
// L214-227 — hp is in "beam-seconds"; base beam is 55 dmg/s
rock    {hp:34, r:0.045, sp:0.05, dmg:18, sc:10, du:3,  col:'#b98d63', straight}
comet   {hp:16, r:0.032, sp:0.17, dmg:12, sc:8,  du:2,  col:'#7fdcff', straight, trail}
drone   {hp:24, r:0.034, sp:0.09, dmg:14, sc:12, du:3,  col:'#ff7ad0', weave}
orb     {hp:64, r:0.05 , sp:0.04, dmg:22, sc:20, du:6,  col:'#8f7dff', straight, shielded}
splitter{hp:42, r:0.05 , sp:0.06, dmg:16, sc:14, du:4,  col:'#39f5c4', straight, split}
mini    {hp:12, r:0.026, sp:0.13, dmg:8,  sc:5,  du:1,  col:'#9dffe0', straight}
// scaling: hp × (1+0.28·sector), speed × (1+0.06·sector); r in min(W,H), sp in H/s
// boss (L234-240): hp 520+430·s, r 0.14·min(W,H), sp 0.02·H, dmg 40, sc 220+60·s, du 40+10·s,
//   sinusoidal sweep ±0.32·W, descends only until y < 0.2·H, fires 2 minis every 2.4 s
```

Pools (L243): `s=0 → [rock,comet]`, `s=1 → +drone`, `s<3 → +orb`, `s≥3 → +splitter`.
Waves (L244–252): **3 waves per sector**, budget `6+3s+3w`, cost 3 for orb, 2 for splitter,
1 otherwise. Spawn cadence 0.55 s, first at 0.3 s (L262).
Sector names (L259): `ASTEROID BELT / DRONE SWARM / THE ORBITAL / SPLITTER NEST`, then
`DEEP SPACE n`. Endless.

### 4.6 The beam — how force is read

```js
// L417-427
function updateBeam(dt,norm,now){
  beamOn=false; if(norm<0.06 || !enemies.length) return;
  let tgt=null,best=-1e9;
  for(const e of enemies){ const pr=e.y+(e.type==='boss'?-H*0.3:0); if(pr>best){best=pr;tgt=e;} }
  if(!tgt) return; beamOn=true;
  aimX+=(tgt.x-aimX)*Math.min(1,dt*14); aimY+=(tgt.y-aimY)*Math.min(1,dt*14);
  const px=player.x,py=player.y,dx=aimX-px,dy=aimY-py,len=Math.hypot(dx,dy)||1,
        ux=dx/len,uy=dy/len;
  const bw=player.beamW*(0.5+norm*0.85),
        reach=len+Math.min(W,H)*0.12,
        dps=player.dmg*norm*dt;
  for(let i=enemies.length-1;i>=0;i--){ const e=enemies[i];
    const ex=e.x-px, ey=e.y-py, proj=ex*ux+ey*uy;
    if(proj<0||proj>reach) continue;
    const perp=Math.abs(ex*uy-ey*ux);
    if(perp<bw+e.r){ let d=dps; if(e.shielded&&norm<0.7) d*=0.3; damageEnemy(e,d); … } }
}
```

`norm = min(1.2, force/ref())` (L363). Force controls, in order: **whether the beam fires at
all** (dead-band at 6% of span), **beam width** (`0.5 + 0.85·norm`), **damage per second**
(`player.dmg · norm`), and **whether shielded orbs take full damage** (a hard gate at 70% of
span). Aim is fully automatic; the target is the most advanced enemy, with the boss
de-prioritised by `0.3·H`.

This is a *sustained-tension* mapping — closest in spirit to X3's constant-tension rule of the
three games — but it is entirely open-loop: there is no rep, no range, no failure of the
athlete, only failure of the core.

### 4.7 Combat, economy, powerups

- `damageEnemy` (L325–328) also charges overdrive: `od = min(100, od + d·0.05·odRate)`, i.e.
  proportional to **total damage dealt**. At `od >= 100` a NOVA fires automatically (L390).
- `killEnemy` (L329–342): explode, `combo = min(99, combo+1)`, `score += round(sc·combo)`,
  spawn `du` stardust motes, 6% pup drop (100% from a boss), split into 2 minis, then the
  Nova-local achievement checks and a combo-pitched beep.
- **`combo` never decays with time** — it resets only in `breach()` (L410). Within a sector it
  ratchets to 99, so late-sector score is ~10× early-sector score for identical play.
- Stardust (L395–401): magnet acceleration toward the player, collected within `0.06·min(W,H)`,
  expires after 10 s.
- Powerups (L343–352): `shield +35`, `over +45 od`, `nova` (instant), `slow` (0.45× for 4 s),
  `dust` (`25 + 10·sector`).
- `triggerNova` (L353–358): 1.5 s invulnerability, 320 damage to everything (260 to a boss),
  full-screen flash + shockwave ring.
- `breach` (L409–416): `combo=1`, `noDmgSector=false`, then — **after** those two lines — an
  invulnerability early-return; otherwise `hitDelay=1.5`, damage vignette, shield absorbs
  `e.dmg` or a heart is lost and the shield refills.

### 4.8 Art

**Fully procedural — zero image assets.** Every visual is a canvas path:

- Starfield: 120 stars, `z ∈ [0.2,1.0]`, parallax drift, twinkle (L183, L438).
- Nebula: one vertical linear gradient + two radial gradients (L433–436) — **all three
  reallocated every frame**.
- Enemies (L454–471): `rock/orb/splitter/mini` as 7- or 12-gon with per-index radius jitter;
  `comet` as a circle plus a triangular tail; `drone` as a triangle with a white core; `boss`
  as a 14-gon with an animated radius, a dark inner disc and a gold eye. Every enemy sets
  `shadowColor` + `shadowBlur` (10, or 24 for the boss). Orb/splitter get a 4 px HP bar.
- Powerups (L472–473): a glowing disc with an **emoji** rendered as `fillText` under
  `shadowBlur=16`.
- Beam (L474–486): three stacked `fillRect`s in a rotated frame under
  `globalCompositeOperation='screen'` — a wide haze, a gradient core, and a white-hot centre
  whose alpha flickers at `sin(performance.now()*0.05)`; plus a muzzle disc.
- Player (L487–502): shield bubble, force-scaled radial core glow, a slowly rotating hexagonal
  hull, and a core with `shadowBlur = 14 + 20·norm`.

Nova is the only one of the three that would survive a `--strip-assets` build unchanged.

### 4.9 HUD (canvas, L503–532)

| Element | Position | Detail |
|---|---|---|
| Score | top-left, `fs = min(W,H)*0.032` | plain integer |
| Sector + name | under it at `0.62·fs` | `SECTOR n · ASTEROID BELT` |
| Combo | top-right | gold at ≥5, pink below |
| Stardust | under it | `✦ n` |
| Boss bar | full width at `pad·0.6 + fs·2.4` | only while `bossActive && boss` |
| Overdrive bar | bottom-left, `H - pad*0.6 - 14`, `min(W*0.44,240) × 7` | gold at 100 |
| Shield bar | 20 px above it, ×9 | cyan |
| Hearts | bottom-right | `♥` × health, `—` at 0 |
| Banner | centre, `H*0.34`, `min(W,H)*0.06` | fades over the last 400 ms |
| Idle hint | above the player | `EFFORT + ' TO FIRE THE BEAM'`, `EFFORT` from `X3FForm.verb(slug)` (L563) |

**There is no force readout and no band-relative gauge anywhere in Nova.** The only force
feedback is the core glow and the beam width. There is also no display of `hiScore` or
`bestSector` during play — only on the game-over card.

### 4.10 Music

```js
// L550-551
X3FMusic.create({ mood:'nova', getIntensity: () => Math.min(1, (force/ref())*1.05) });
```

Mood `nova` (`x3f-music.js:33-36`): **124 bpm**, root **174.61 Hz (F3)**, `[0,2,3,7,8]`
(minor with a ♭6), `sawtooth` lead **and** `sawtooth` pad, cutoff **900 Hz**, no swing, kick
0.34, hat 0.09, bass enters at **0.25** — the lowest threshold of any mood, so the bass is
present almost whenever the beam is on. *"deep space: driving, minor, synthwave"*.

`music.duck(1.2)` only on sector clear (L298) — a full 1.2 s duck under the "SECTOR n CLEAR"
callout. No duck on kills, bosses or NOVA.

### 4.11 Frame cost

| Work | Notes |
|---|---|
| 3 gradient allocations per frame (L433, 435, 436) | nebula + two glows, never cached |
| 120 star arcs | plus a `sin` per star |
| Stardust | `ctx.shadowColor` + `shadowBlur=6` **set inside the loop, per particle** (L442). A boss drop is `40+10·s` motes with a 10 s lifetime |
| Powerups | `shadowBlur=16` + emoji `fillText` each |
| Enemies (6–20) | `shadowBlur` 10–24 **each**, 7–14 `lineTo` each |
| Particles | capped at **420** (L311); `txt` particles rebuild `ctx.font` per particle per frame (L319) |
| Beam | 1 gradient + 3 `fillRect` + 2 composite-op switches |
| Player | 1 radial gradient + `shadowBlur` up to 34 |
| `drawHUD` | ~8 `ctx.font` string constructions + ~10 `fillText` + 6 `fillRect` per frame |

**`shadowBlur` is the defining cost.** A busy Nova frame issues 150–500 shadow-blurred draw
calls. On a TV SoC that is the first thing to profile. Unlike Bloom and Splash, Nova does no
per-frame DOM writes at all.

---

## 5. Defects

Severity: **BLOCKER** (wrong data shipped to the user's log) · **HIGH** · **MEDIUM** · **LOW** · **NIT**.

---

### D-01 — BLOCKER — Bloom logs `peak: 0` for every set on the Android TV

**`web/X3F_Bloom.html:160`**
```js
if(typeof running!=='undefined'&&running&&force>setPeak)setPeak=force;
```
`setPeak` is assigned **only** inside `onSample()`. The TV shell replaces the whole signal path
with its own interval and never calls `onSample`:
```java
// app/src/main/java/com/goob/x3ftv/MainActivity.java:616-621
window.__x3fDrv=setInterval(function(){ try{
  var f=+window.__x3fForce||0;
  if(typeof calLo==='function'){ var lo=+calLo()||0; f=f>lo?f-lo:0; }
  force=f;
}catch(e){} },16);
```
The comment immediately above it (`:609-615`) even warns that this is exactly how the
per-movement floor was lost once already.

**Failure scenario.** Train a full deadlift set on the TV. `endSet` (L282-283) writes
`peak: Math.round(setPeak)` = `peak: 0`. `x3f-progress.js:154-157` therefore never raises the
peak PB; the `peak150/250/350/450/600` achievement family (`x3f-progress.js:527-530`) can never
unlock from Bloom; a `kind:'peak'` daily challenge (`:346-355`) can never be satisfied by
Bloom; and the PB table's peak column stays at whatever Splash or Nova last reported. The
functional test does not catch it — `tools/func-test/cases.js:255` assigns `setPeak = 355` by
hand before calling `endSet`.

**Fix direction.** Read `X3FSet.seen().peak` (Bloom already reads `.tut` from the same object
at L284), or move the peak tracking out of `onSample` into the render loop.

---

### D-02 — BLOCKER — Bloom's "diminishing range" is a fixed decay; the term that would track the athlete is unreachable

**`web/X3F_Bloom.html:456`**
```js
curHi=Math.max(R2*0.22,curHi*0.85,Math.min(curHi,repMax*1.03));
```
The branch is guarded by `reached === false`, i.e. `repMax < curHi*0.78` (L445). Therefore
`repMax*1.03 < 0.8034·curHi`, and `Math.min(curHi, repMax*1.03) = repMax*1.03 < 0.8034·curHi`,
which is **always less than `curHi*0.85`**. The third argument can never win.

**Failure scenario.** Two athletes hit a partial: one reaches 77% of `curHi`, one reaches 20%.
Both get exactly the same new `curHi` (`0.85·curHi`). The bloom on screen drops by exactly 15%
regardless of how far the athlete actually got, so the "range" being shown is a geometric
sequence, not a measurement. The metric the whole overhaul is supposed to be built on is
decorative.

---

### D-03 — BLOCKER — Bloom never validates the trough, so an isometric hold farms unlimited "full reps"

**`web/X3F_Bloom.html:441-464`** — the only per-window statistic is `repMax`:
```js
totF++;…;if(force>repMax)repMax=force;
```
No minimum, no direction, no range. `reached` is `repMax >= curHi*0.78`.

**Failure scenario.** Pull to 65% of span and hold, motionless, for two minutes. Every 3 s
cycle: `repMax = 0.65·R ≥ 0.6084·R` → branch A → `reps++`, `fullReps++`, `dead=0`. The set
logs 40 "full reps" with zero eccentric, zero concentric and zero range. `x3f-progress.js:593`
then advises the athlete to move up a band. This directly contradicts the file's own header
comment (L3–4) and official Principle 1 and 2.

---

### D-04 — HIGH — Bloom's failure condition is effectively unreachable

**`web/X3F_Bloom.html:445, 454, 461-462`**
```js
const R2=ref(),reached=repMax>=curHi*0.78,meaningful=repMax>=R2*0.17;
…
else{dead++;curHi=Math.max(R2*0.22,curHi*0.9);…;if(dead>=2)endSet(true);}
```
`curHi` bottoms out at `0.22·R`, at which point `reached` requires only `0.1716·R` while
branch C requires `< 0.17·R`. The two thresholds are **0.16% of span apart**, so at the floor
branch B is dead and the athlete is either scoring reps or failing, with essentially no
tolerance band.

**Failure scenario.** An athlete at true failure who is still holding *any* meaningful tension
(the program explicitly requires this — you must not let the band go slack) sits at ~18–20% of
span and scores a "rep" every 3 s, indefinitely. The set never ends by itself. Every real
Bloom set therefore ends by the athlete pressing "Stop Set", which routes through
`endSet(false)` — and see D-05.

---

### D-05 — HIGH — `endSet(fail)` ignores its argument; a manual stop is logged and announced as a failure

**`web/X3F_Bloom.html:271`** `function endSet(fail){` — `fail` never appears again in the body
(L271–304). Both call sites pass a value: L265 `endSet(false)` (button), L462 `endSet(true)`
(2 dead reps).

**Failure scenario.** Player stops a set early to answer the door. Toast reads
`Failure · 7 partials past it (12 full)` (L297-299). The log entry is indistinguishable from a
true failure, so `x3f-progress.js` counts it toward `burnSets` (`:422`), the "Burnout
Specialist" badges (`:561-564`) and the partial-reps challenge (`:330-337`).

---

### D-06 — HIGH — Bloom's eccentric metric measures the tempo clock, not the lowering phase

**`web/X3F_Bloom.html:232-234, 447-448`**
```js
/* Eccentric quality: X3 leans hard on a slow, controlled lowering phase, and the
   bar can see it. Time each rep top to the next, average over the set. */
let eccStart=0,eccSum=0,eccCount=0;
…
if(eccStart){const es=(now-eccStart)/1000;if(es>0.3&&es<12){eccSum+=es;eccCount++;}}
eccStart=now;
```
`eccStart` is written at the **phase wrap**, which is the *trough* of the cosine
(`targetAt` at `ph=0` returns `lo`, L310), not the top. The delta between two consecutive
successful wraps is therefore exactly `period`.

**Failure scenario.** Any Bloom set of ≥2 consecutive scoring reps at the default tempo logs
`ecc: 3` (Gentle → 4, Brisk → 2). That value feeds `x3f-progress.js:550-554`:
```js
[2.0, 3.0, 4.0].forEach(function (n, i) {
  add('ecc'+…, 'Slow Negative '+(i+1), 'Average a '+n+'s lowering phase across a set', …,
      function (s) { return s.bestEcc >= n; });
});
```
So a first-ever Bloom set on the default tempo immediately unlocks **Slow Negative 1 and 2**,
and switching the dropdown to "Gentle 4s" unlocks **Slow Negative 3**, without the athlete
performing a single slow negative. It also populates the "negative seconds" column of the PB
table (ROADMAP v1.2 #5) with a constant.

---

### D-07 — HIGH — Bloom's `improvement()` always reports "level with last time"

**`web/X3F_Bloom.html:282, 302`**
```js
X3FProg.logSet({g:'bloom', …});           // L282 — stamps t = Date.now() internally
const fresh=X3FProg.checkAchievements();  // L286 — walks the whole log + 130 badge closures
…
const line=X3FSet.improvement({ex:EXSLUG,band:band,reps:reps,part:burnoutReps,
                               peak:Math.round(setPeak),t:Date.now()});   // L302
```
`x3f-set.js:58-75` → `x3f-progress.js:117-120`:
```js
function previous(slug, band, skipT) {
  var s = sets().filter(function (e) {
    return e.ex === slug && (!band || bandOf(e) === band) && e.t !== skipT; });
  return s.length ? s[s.length - 1] : null;
}
```
The `t` Bloom passes at L302 is a *new* `Date.now()`, taken after `logSet` and after a
full-catalogue achievement sweep — so it never equals the just-logged entry's `t`. `previous()`
therefore returns **the set that was just logged**, and every delta is zero.

Contrast the correct ordering in `x3f-set.js:152-154`, which computes `improvement` **before**
`P.logSet`:
```js
try { improved = improvement(Object.assign({ t: Date.now() + 1 }, entry)); } catch (e) {}
var logged = P.logSet(entry);
```

**Failure scenario.** Every Bloom set ends with the toast `Set logged — level with last time`,
even after a 10-rep improvement. ROADMAP v1.2 #11 ("What improved, said out loud") is silently
inert in the only game that models a set.

---

### D-08 — HIGH — Splash and Nova never reset the set watcher, so the first report's `tut` spans the whole page session

**`web/X3F_Splash.html:425` / `web/X3F_Nova.html:571`**
```js
addEventListener('load',function(){try{X3FSet.watch(function(){return force},
                                                    function(){return ref()});}catch(e){}});
```
`x3f-set.js:115-125` starts a 40 ms sampler and only clears `peak`/`tut` in `resetWatch()`,
which is called from `report()` (`:147`) — i.e. **after** the first run is reported. Neither
`startRun()` (Splash L205, Nova L276) calls `X3FSet.reset()`. Bloom does (L269).

**Failure scenario.** Open Nova, connect the bar, warm up and read the shop for four minutes at
40% of span, then die. The reported `tut` is ~240 s. `x3f-progress.js:556-558` unlocks
"Under Tension 1/2/3" (60/120/240 s) on the spot, and the `kind:'tut'` challenge (`:338-345`)
is satisfied by a run in which nothing was trained. On the TV, where the shell auto-starts the
run (`MainActivity.java:623`), the same applies from page load.

---

### D-09 — HIGH — the hype layer's milestones require exact numeric equality, so score games almost never fire one

**`web/x3f-hype.js:209-222`**
```js
for (var i = 0; i < majors.length; i++) {
  if (value === majors[i] && !done['m' + majors[i]]) { … showBig(…); return; } }
for (var j = 0; j < ladder.length; j++) {
  if (value === ladder[j] && !done['m' + ladder[j]]) { … showBig(…); return; } }
```
Bloom is fine — `hype.set(reps)` steps by exactly 1 (L451). But:

- **Splash** `hype.set(score)` (L381) where `score += c.val*combo`, `val ∈ {1,2,3,5}`,
  `combo ∈ [1,99]` — steps of 1 to 495. Hitting `100`, `250`, `500` … exactly is chance.
- **Nova** `hype.set(score)` (L335) where `score += round(e.sc*combo)`, `sc ∈ [5,220+60s]` —
  steps of 5 to thousands. The chance of landing exactly on 250 is negligible.

Splash overrides `ladder` (L403) but **not** `majors`, so Splash's majors are still the rep
defaults `[50,75,100,150,200,250]` (`x3f-hype.js:28`). Nova overrides `ladder` (L548) and not
`majors` either.

`nextTarget()`/`showNear()` are equally nonsensical for scores: `near = 5` means the "N MORE"
countdown appears when the player is within **5 points** of 10,000.

**Failure scenario.** A Splash player scores 8,400 points across a good run and sees no
milestone callout at all — the entire escalating-celebration system that ROADMAP v1.0 lists as
a headline feature is dark in two of the three games.

---

### D-10 — HIGH — Nova's "NEW BEST" can never fire: it reads an undeclared variable

**`web/X3F_Nova.html:549`**
```js
best:()=>(typeof bestScore!=='undefined'?bestScore:0)}):null;
```
Nova's high score is `hiScore` (L132, L285). `bestScore` is declared nowhere in the file
(that is Splash's variable name, `X3F_Splash.html:122`). `typeof` on an undeclared global
returns `'undefined'`, so the expression evaluates to `0` on every call, silently.

**Failure scenario.** `x3f-hype.js:204` requires `best > 0` before it will fire the NEW BEST
callout, and `nextTarget()` (`:188-192`) will never add `best+1` as a candidate. A Nova player
who beats a 12,000-point personal best gets no acknowledgement of any kind during the run; the
number only appears as text on the game-over card (L289).

---

### D-11 — HIGH — closing a Splash or Nova run any way other than the one button discards it entirely

- **Nova `#restartBtn` (L82, handler L174)** is permanently visible in the control bar and
  calls `startRun()` directly. No report, no `resetWatch`. Score, sector, kills, peak and TUT
  are gone.
- **Nova gameOver is the only reporting path** (L286). Nova has no "end run" control.
- **Splash**: pressing Back, closing the tab, or the TV's Back key at any point loses the run.
- **Bloom**: same — `endSet` is only reachable from the button and from `dead>=2`.

**Failure scenario.** Player clears three Nova sectors, gets bored in the shop, taps Restart.
Twelve minutes of genuine work under tension are never logged, never counted toward the day,
never counted toward the streak. On the TV the Back key returns to the launcher and does the
same.

There is no `visibilitychange` / `pagehide` handler in any of the three files.

---

### D-12 — MEDIUM — Splash keeps scoring after the run ends

**`web/X3F_Splash.html:366-388`.** The `if(running){…}` block (L366–371) covers only `elapsed`,
spawning and combo decay. The collision/scoring loop at L373–388 runs **unconditionally**:
```js
for(let i=cols.length-1;i>=0;i--){ const c=cols[i]; c.x-=spd*dt;
  … if(ddx*ddx+ddy*ddy<rr*rr){ combo=…; score+=gained; …
     $('hScore').textContent=Math.round(score); … } }
```
`endRun` (L208) does not clear `cols`.

**Failure scenario.** Player presses "Surface" at 1,200 points. `bestScore` is saved as 1,200
and the set is reported as 1,200. Six collectibles are still on screen; the dolphin drifts
through them and the HUD climbs to 1,340 — a number that was never recorded and that the
player will reasonably believe was. `combo` also keeps climbing past the value written to
`x3f_splashCombo` two lines earlier.

---

### D-13 — MEDIUM — Splash spawns "deep sea" collectibles in the sky

**`web/X3F_Splash.html:192-201`.** `y = forceY(1-ny)` is above the waterline `H*0.46` whenever
`ny > 0.4524`. Bubble's zone is `[0.30,0.98]` and pearl's is `[0.35,0.9]`, so **22% of bubbles
and 19% of pearls** spawn in the air.

**Failure scenario.** Air bubbles and pearls float in the clouds above the sea, and the player
must breach the surface to collect a *bubble* — inverting the game's own stated rule ("rest low
to cruise the deep for bubbles & pearls", L93).

---

### D-14 — MEDIUM — Splash's "best combo" records the combo at the moment of quitting, not the best combo

**`web/X3F_Splash.html:210`** `if(combo>bestCombo){bestCombo=combo;xset('splashCombo',bestCombo);}`

`combo` is reset to `1` by the decay timer (L370) 1.7 s after the last pickup. There is no
running maximum anywhere.

**Failure scenario.** Player chains a 40× combo mid-run, then coasts for two seconds before
pressing Surface. `combo` is 1. `x3f_splashCombo` is never updated, and since nothing reads it
back the value is inert anyway.

---

### D-15 — MEDIUM — the shared modules are not precached, so a cold offline first run silently loses calibration and all logging

**`web/sw.js:2`**
```js
const A=['index.html','X3F_Arena.html','X3F_Flow.html','X3F_Bloom.html','X3F_Splash.html',
 'X3F_Nova.html','X3F_Ascent.html','X3F_Routine.html','X3F_Progress.html','X3F_Duel.html',
 'X3F_Rhythm.html','X3F_Library.html','X3F_Calibrate.html','x3f-exercises.js','x3f-form.js',
 'x3f-nav.js','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png'];
```
Missing: **`x3f-cal.js`, `x3f-set.js`, `x3f-progress.js`, `x3f-hype.js`, `x3f-music.js`,
`x3f-fx.js`**, and **every file under `assets/`**.

The fetch handler's failure path (`sw.js:6`) is
`.catch(()=>caches.match('index.html'))` — so a missing script request is answered with the
launcher's **HTML**, which the browser then tries to execute as JavaScript.

**Failure scenario.** Install the PWA, go offline before ever opening Bloom, open Bloom. `<script
src="x3f-cal.js">` receives `index.html`, throws a SyntaxError, `window.X3FCal` is undefined.
`ref()` silently falls back to `bandMax[band]` (the raw band max, ignoring the per-movement
range that HANDOFF.md:106 says was measured at **74% up the screen** before the fix), `calLo()`
returns 0, `X3FProg`/`X3FSet`/`X3FHype`/`X3FMusic` are all undefined, `hype` and `music` are
`null`, and `endSet` falls through to the legacy `logSession` (L295) which writes `burnout:`
instead of `part:`. The game *runs*, and every number it produces is wrong.

Related: `const C='x3f-v8'` (`sw.js:1`) plus a cache-first strategy means **any edit to any of
these files is invisible to a returning user until the cache name changes.** A refactor that
does not bump `C` ships nothing.

---

### D-16 — MEDIUM — returning from a backgrounded tab dumps Nova's whole spawn queue in one frame

**`web/X3F_Nova.html:366-373`**
```js
if(phase==='wave'){
  const el=(now-spawnClock)/1000;
  while(spawnQ.length&&el>=spawnQ[0].t){spawnEnemy(spawnQ.shift().type);}
```
`spawnClock` is wall-clock (`performance.now()`, L262) and `rAF` stops when hidden.

**Failure scenario.** Switch apps for 30 s during a wave. On return, the `while` drains the
entire remaining queue in a single frame — up to 18 enemies at sector 4 — all at the same `y`,
all reaching the base together. Two hearts gone before a frame is drawn. Splash has the milder
version of the same bug (`elapsed` at L367 inflates spawn rate and scroll speed on return);
Bloom has the inverse (D-03 note (h): background time is *free*).

---

### D-17 — MEDIUM — the Cues toggle does not mute the hype layer

**`web/x3f-hype.js:91`**
```js
try { muted = JSON.parse(localStorage.getItem('x3f_cues')) === false; } catch (e) {}
```
Read **once**, at `create()` time — Bloom L246, Splash L401, Nova L546. The instance exposes
`mute(m)` (`x3f-hype.js:266`) and no game ever calls it.

**Failure scenario.** Player turns Cues off mid-set to stop waking the house. `beep()` goes
quiet (L127 in each game), but the hype fanfare (`x3f-hype.js:115-121`, four tones plus a
sub-octave) and the confetti haptics (`:122`) keep firing at full volume for the rest of the
session.

---

### D-18 — MEDIUM — three separate `AudioContext`s per page

Each game creates its own for `beep()` (Bloom L127, Splash L129, Nova L139), `x3f-hype.js`
creates a second (`:97`), `x3f-music.js` a third (`:87`). None is shared or closed.

**Failure scenario.** On iOS Safari / Bluefy, where contexts are scarce and each carries its
own hardware latency, a Bloom session holds three simultaneously. The cue beep, the fanfare and
the soundtrack are on three unsynchronised clocks, so nothing can ever be scheduled against the
music's beat.

---

### D-19 — MEDIUM — `X3FCal.range()` allocates on every call, and Bloom calls it ~332×/frame

**`web/x3f-cal.js:93-100`**
```js
function range(sl, band) {
  if (!sl) return { lo: 0, hi: bandCeiling(band), auto: true };
  var e = map()[id(sl, band)];
  if (e && e.hi > 0) return { lo: Math.max(0, e.lo || 0), hi: e.hi, auto: !!e.auto };
  return { lo: 0, hi: bandCeiling(band), auto: true };
}
function span(sl, band) { var r = range(sl, band); return Math.max(MIN_SPAN, r.hi - r.lo); }
```
Every `ref()` in Bloom (§2.8: 328 in `drawVine` alone, from `targetAt`/`mapY` inside the
153-step path loop at L334) allocates a fresh object.

**Failure scenario.** ~20,000 object allocations per second on the TV SoC, for two numbers that
change at most once per set. This is exactly the shape of allocation that produces periodic
GC hitches during the last five reps — the moment ROADMAP says must feel enormous.

---

### D-20 — MEDIUM — Splash rebuilds ~620 static path operations every frame while Bloom shows how not to

**`web/X3F_Splash.html:237-277`** — see the table in §3.10. The sky, sun, clouds, water
gradient, god rays, caustics, coral and foam line are redrawn from scratch at 60 fps.
`web/X3F_Bloom.html:174, 180-226` already implements the fix (an offscreen `bgC` rebuilt only
on resize / band change).

**Failure scenario.** Splash is the game most likely to be played on the weakest hardware (it
is the "fun" one), and it is 5–10× the draw cost of Nova's background.

---

### D-21 — MEDIUM — Nova sets shadow state per stardust particle

**`web/X3F_Nova.html:442`**
```js
for(const d of dust){ctx.fillStyle='#ffd23f';ctx.shadowColor='#ffe27a';ctx.shadowBlur=6;
  ctx.beginPath();ctx.arc(d.x,d.y,2.4,0,7);ctx.fill();}ctx.shadowBlur=0;
```
`shadowColor`/`shadowBlur` are set inside the loop although they are identical for every
particle. A boss drops `40 + 10·sector` motes with a 10 s lifetime (L337, L400), so 100+
shadow-blurred 2.4 px arcs is routine.

---

### D-22 — LOW — Nova's boss can be removed from play without clearing `bossActive`, soft-locking the sector

**`web/X3F_Nova.html:385`**
```js
if(e.y>=player.y-e.r*0.5){breach(e);enemies.splice(i,1);continue;}
```
Only `killEnemy` (L332) clears `bossActive` and `boss`. The breach path does not.
`update`'s boss phase (L374-375) is `if(!bossActive){sectorClear();}` — so a boss removed this
way leaves `phase==='boss'`, `bossActive===true`, no boss in `enemies`, no spawning and no
sector clear. Permanent stall; the only exit is `#restartBtn` (which discards the run, D-11).

**Currently latent**: the boss stops descending at `y < H*0.2` (L380) and `player.y` is
`H - 0.14·min(W,H)`, so the condition cannot be met today. Any change to boss movement, to
`player.y`, or to the boss radius makes it live, and it fails silently.

---

### D-23 — LOW — Nova's `#restartBtn` is always visible and is a trap

**`web/X3F_Nova.html:82`** `<button class="cta ghost" id="restartBtn">Restart</button>` sits in
the control bar during play, next to Re-Zero, with no confirmation. Its handler (L174) is
`startRun()`. Combined with the shell's D-pad nav, it is one of only three focusable targets on
a TV Nova screen.

---

### D-24 — LOW — Nova's shop and upgrade descriptions do not match the code

**`web/X3F_Nova.html:195, 199, 205, 210`**
- `Beam Width — 'wider beam, more targets', base:24` but `applyStats` uses `1+0.22*upLvl('width')`.
- `Tractor Beam — '+50% stardust pull range'` but the pull force is `300*(1+0.6*…)` (**+60%**),
  and `player.magnet` (`0.13*(1+0.5*…)`, the only field matching the copy) is **never read
  anywhere**.

---

### D-25 — LOW — Nova's Push/Pull idle prompt, its only movement-aware string, is the game's only concession to the program

**`web/X3F_Nova.html:531`** uses `EFFORT` (from `X3FForm.verb`, L563) for
`'PULL TO FIRE THE BEAM'`. Nothing else in Nova knows what movement is being trained: the log
entry has no reps, no partials, no range and no failure — only a score. Listed here because it
is the one place a refactor already has the hook it needs.

---

### D-26 — LOW — Bloom's static `0.78` guide line lies during burnout

**`web/X3F_Bloom.html:332`**
```js
[0.12,0.45,0.78].forEach(fr=>{const y=mapY(R*fr);…});
```
Fixed fractions of `R`, drawn every frame regardless of `curHi`. Once `curHi` has decayed to,
say, `0.35·R`, the guide line at `0.78·R` sits far above the bloom the athlete is being asked
to reach. The `0.45` line corresponds to nothing in the model at any point.

---

### D-27 — LOW — no D-pad navigation inside any of the three games in the web build

None of the three loads `x3f-nav.js` (verified: only `index.html`, `X3F_Library.html`,
`X3F_Progress.html`, `X3F_Routine.html` do) and none uses `data-nav` (0 occurrences in all
three). On the TV this is covered by `MainActivity.java:628-668`'s fallback nav. **In the web
build served from `gh-pages`** — the build HANDOFF.md:11 says is "the realistic device" for a
phone, and which is also what a TV browser or a cast session loads — there is no spatial nav
at all, so the band select, tempo select, Re-Zero, Cues, Form, Music and Nova's shop buttons
are reachable only by pointer.

---

### D-28 — LOW — the games are capped at 900 px wide in the browser build, and the TV button does not lift the cap

**`web/X3F_Bloom.html:26` / `Splash:23` / `Nova:23`** `.app{…max-width:900px;margin:0 auto;…}`.
The TV button (`x3tv()`, e.g. Bloom L475) requests fullscreen and a landscape orientation lock
but touches no layout. The shell fixes this by injecting
`.app{max-width:none!important;width:100%!important}` (`MainActivity.java:585`) — the **web**
build has no equivalent.

**Failure scenario.** Press TV in Chrome on a 1080p or 4K display: the page goes fullscreen and
the game becomes a 900 px column of phone-sized HUD centred in black. `sync-from-web.py:47-51`
confirms the 10-foot CSS block is injected only into `MENUS`, never into `GAMES`, so nothing in
`web/` scales the game HUD for distance either.

---

### D-29 — LOW — `.hud` chip wrap collides with Splash's combo bar

**`web/X3F_Splash.html:37, 42`**
```css
.hud {position:absolute;top:10px;left:10px;right:10px;display:flex;gap:8px;…;flex-wrap:wrap}
.cbar{position:absolute;top:58px;left:10px;height:6px;width:120px;…}
```
Four chips at `min-width:78px` + padding + gaps need ~400 px. Below that they wrap onto a
second row whose top edge lands at roughly `y = 58px` — exactly `.cbar`'s position. The same
class of collision exists in Bloom between `.toast` (`top:34%`, L43) and `x3f-hype.js`'s
`.x3fh-big` (`top:34%`, `:48`), and between `.x3fh-burn` (`bottom:4%`) and `.x3ff`
(`bottom:10px`).

---

### D-30 — LOW — `X3FProg.checkAchievements()` runs synchronously inside the rAF callback at set end

**`web/X3F_Bloom.html:286`** (and via `x3f-set.js:156` for Splash/Nova). `checkAchievements`
calls `catalogue()` — which rebuilds ~130 badge objects with closures on every invocation
(`x3f-progress.js:458-566`) — and `stats()`, which walks the whole (up to 700-entry) log twice
plus `streak()` (up to 400 iterations) plus `program()`. `logSet` may additionally run
`compact()` (a full re-bucket + sort, `:76-100`).

Bloom's call sits inside `loop()` (reached from L462 → `endSet` → L286). The freeze lands
exactly on the frame of the failure celebration.

---

### D-31 — NIT — the shared boilerplate has already drifted

The three demo drivers use three different ramp/decay constant sets (§1.2). Module load order
differs between Bloom and the other two (§1.1). Nova's `beep()` takes a fourth `vol` parameter
(L139) that Bloom's and Splash's do not (L127/L129). Nova's `connect()` alert text (L147) is
abridged relative to Bloom's and Splash's (L142/L144). Bloom's `bandSel.onchange` calls
`buildBG()` (L123); the others do not need to and do not (L125/L135). Splash's `IMG` guard is
`IMG.star.ok` (L286) while Bloom's is `IMG.petal&&IMG.petal.ok` (L321).

---

### D-32 — NIT — dead code inventory

| File | Dead | Evidence |
|---|---|---|
| all three | `CH_BATT` | declared once, never referenced — no battery UI exists |
| all three | `connected` | written 3×, read 0× |
| all three | `logSession` | only reachable if `X3FProg`/`X3FSet` are absent; ROADMAP "Next" #3 already flags it |
| all three | `bandMax` | only reachable if `X3FCal` is absent |
| Bloom | `miss` (L237/266), `repHit` (L237/442/463), `repFrames` (L237/442/463), `critScale`/`critMood`/`critDroop` (L236), `hills` (L179), `lastRepFlash` (L418), `--bg2`, `--cyan` | |
| Bloom | third arg of the `curHi` `Math.max` (L456) | mathematically unreachable — D-02 |
| Bloom | `endSet`'s `fail` param (L271) | D-05 |
| Splash | `flashT` (L184, assigned L383, never read), `bestCombo` (never displayed, D-14) | |
| Nova | `novaFlash` (L189, assigned L332/354, never read), `player.magnet` (set L209, never read) | |

---

### D-33 — NIT — `typeof running!=='undefined'` in Bloom is not the guard it looks like

**`web/X3F_Bloom.html:160`.** `running` is a top-level `let` (L229). `typeof` on a binding in
its temporal dead zone **throws a ReferenceError**; it does not return `'undefined'`. The guard
only protects against `running` being deleted entirely. It works today purely because
`onSample` is never invoked during script evaluation. A refactor that calls `onSample()` from
module top-level would throw.

---

## 6. Design weaknesses and opportunities, ranked

### W-01 — Splash's core loop instructs the player to break the program's second principle
**`web/X3F_Splash.html:93`** (first-run card) and **L4** (file header):
> "Rest low to cruise the deep for bubbles & pearls"

Official source, Principle 2 (`docs/x3-knowledge/official/12-week-program.md`):
> "Never let the band go slack at the bottom or lock out your joints at the top. Keep tension
> on the muscles throughout the set."

42% of Splash spawns are bubbles, whose zone reaches `1-ny = 0.02` — i.e. **2% of span, band
fully slack**. The most-rewarded behaviour in the game is the one behaviour the program forbids.
`getIntensity` (L406) reinforces it: `Math.max(force/ref()*0.8, (combo-1)/12)` keeps the music
energetic while the player rests.

**Opportunity.** Invert the depth economy: make the *deep* the punishing place. Treasure at
depth requires *sustained* low-but-nonzero tension (a hold), the surface requires a breach,
and letting force reach zero drains the combo. That is a one-page change to `TYPES.zone`,
`spawnCol` and the combo rule, and it turns Splash from anti-program into a
constant-tension trainer.

### W-02 — There is no set model to share; Bloom's has to be rebuilt, not extracted
Bloom is the only candidate spine, and §2.4.6 lists eight structural problems with it. A
straight extraction of `curHi` / `reached` / `meaningful` / `dead` into a shared module would
propagate D-02, D-03, D-04 and D-06 to seven more games.

**Opportunity — what the shared engine actually needs to track.** Per rep window it must
record `min`, `max`, the **time of the peak**, and the **time force crossed back below the
midpoint** — from those four numbers you get, for free: true range (`max-min`), a real
eccentric duration (peak → return), a real concentric duration, a slack fault
(`min < lo`), a lockout fault, and a range-based full/partial classification that does not
ratchet. All four are already available from the same sample stream that currently produces
only `repMax`.

**Opportunity — detect the rep, don't schedule it.** The tempo clock should become a *coach*
(a ghost target to follow, with a "too fast / too slow" readout against the official 4–6 s
window) rather than the *scorer*. A hysteresis rep detector on force (cross above `hi_thresh`,
then back below `lo_thresh`) removes D-03 outright, makes background time harmless (D-16 note),
and makes the model portable to Splash and Nova, which have no tempo clock at all.

### W-03 — Bloom's default tempo is twice as fast as the program prescribes
`tempoSel` (L81) offers 4000 / **3000 (default)** / 2000 ms for a **complete** up-and-down
cycle. The official prescription is 2–3 s **each way** — 4–6 s per rep. "Standard 3s" trains a
1.5 s eccentric. The repo's own knowledge base already spells this out and even flags the
contradiction with third-party sources.

**Opportunity.** Re-label the menu in *seconds per phase* (2s / 2.5s / 3s → 4/5/6 s cycles),
default to 5 s, and drop "Brisk". This is a two-line change that brings the flagship game into
compliance with the source of truth.

### W-04 — Splash and Nova reward time spent, which the ROADMAP explicitly forbids
> "**XP, levels, coins, unlockables.** They reward time spent, and the workout is twenty
> minutes. A currency would encourage padding sets." — ROADMAP, "Deliberately not doing"

Nova has stardust (a currency), an upgrade shop (unlockables), endless sectors and a combo that
never decays — so a long, weak run outscores a short, brutal one. Splash's spawn rate and
scroll speed both scale with `elapsed`, so score is a function of duration. Both are endless
runs whose only terminal condition is the player's patience.

**Opportunity.** Give both a **set-shaped** ending. Nova already has the perfect metaphor:
the shield is the athlete's remaining capacity. Bind sector length to *reps*, not waves; let
the beam's damage fall with accumulated fatigue rather than with a shop upgrade; end the run at
failure and report `full`/`part`. Splash's "Surface" becomes the failure moment rather than a
quit button.

### W-05 — Nova has no force readout at all
No `.chip`, no gauge, no number (§4.9). The player cannot see what fraction of the band they
are pulling, cannot see whether they crossed the 70% threshold that makes shielded orbs
vulnerable (L426), and gets no 10-foot type scaling because the shell's CSS targets `.chip`.

**Opportunity.** Nova should adopt the `.hud`/`.chip` structure from Bloom and Splash. That
single change gives it a force readout, a best-score display and the TV type scale in one move,
and removes a whole category of divergence.

### W-06 — 2.5 MB of illustrated art, none of it precached, most of it 10× oversized
`assets/bloom` = 1.38 MB, `assets/splash` = 1.12 MB. `petal.png` is 213 KB at 409×512 and
renders at **8–17 px**. `bubble.png` is 286 KB at 512×511 and renders at **29 px**. ROADMAP
already flags the bundle ("~2.5 MB is PNG. WebP roughly halves it") but the real win is
resolution, not codec: none of these needs to exceed 2× its maximum on-screen size.

**Opportunity.** Re-export at 2× the largest draw size (petal 64², bud 128², bubble 64²,
flower 256², dolphin 384²), then WebP. That is a ~90% reduction, not 50%. And add
`assets/**` to `sw.js`'s precache list, or the offline claim in both file headers is false on
a cold install.

### W-07 — The illustrated art discards the animation the procedural art already has
Splash's `drawDolphin` (L301–345) contains a wagging tail on its own transform, a fluttering
pectoral fin, a blinking eye on a random 2–5 s timer and a smile — and every one of those is
skipped the moment `dolphin.png` loads (early `return`, L319). Bloom's illustrated critter is
non-uniformly `scale()`d (L380/394), which smears a hand-drawn sprite rather than squashing a
shape.

**Opportunity.** Ship the illustrations as *parts* (body / tail / fin, head / eyes) on the
existing transforms rather than as one flat frame. The rigs are already written; they are just
being bypassed.

### W-08 — Three animation loops and two intervals per game page
Already ROADMAP item 7. `x3f-form.js` exposes `frame(dt)` (`:508-510`) explicitly so the host
can drive it; nobody does. `x3f-hype.js`'s `frame()` (`:234-240`) exists only to hide two
elements after a timeout and could be a `setTimeout`. `x3f-set.js`'s 40 ms interval could be a
call from the game's own loop.

**Opportunity.** One `rAF` per page, driving the game, the form rig and the hype timers. The
hook already exists for the expensive one.

### W-09 — Personal bests are pooled across every movement and band
`x3f_bloomBest` (L120) and `hype`'s `best:()=>bestSet` (L248) compare total reps regardless of
movement or band. `x3f-progress.js` already has a correct per-movement, per-band `pb(slug,
band)` (`:148-158`) that these games do not use.

**Failure shape.** A 40-rep White-band calf-raise set sets a "best" that a Black-band deadlift
can never approach, so the NEW BEST callout — the single loudest moment the hype layer has —
becomes unreachable for every heavy movement.

### W-10 — The linear force→screen mapping misrepresents X3's strength curve
`mapY` (Bloom L311) and `forceY` (Splash L179) are both linear in `force/ref()`. The official
transcript is explicit that the curve is aggressively non-linear:
> "In the middle of the range of motion … sort of a medium force. Lower than the high force,
> but not really half of what would be expected because there's actually a rather aggressive
> curve to your strength."

**Opportunity.** A single shared `norm()` with a per-movement curve exponent would make the
midpoint of the screen correspond to the midpoint of the *movement* rather than the midpoint of
the *force*, in all eight games at once.

### W-11 — The full/partial split is a proxy, not a measurement
`if(curHi>=R2*0.60) fullReps++; else burnoutReps++;` (L446). Whether a rep is "full" depends on
the state of the *game's* decaying target, not on the athlete's range. Combined with the
ratchet (D-02, note (d)), `full` and `part` are unreliable inputs to `bandAdvice()`
(`x3f-progress.js:588-602`, threshold `reps >= 40`), which is the app's answer to what
ROADMAP calls "the hardest judgement call in the program".

Related: `bandAdvice` implements only the "40+ full reps → go up" half. The official rule is
two-sided — *"If you can't complete 15 full range reps, reduce the resistance."*

### W-12 — 95 identical lines across three files, and eight files in total
§0. Every fix in this report has to be applied 3× (or 8× across the suite), and §D-31 shows the
copies have already diverged. The BLE pipeline, tare, `xget/xset`, band select, `beep`, TV
button, wake lock, SW registration, form mount and music button are all candidates for a single
`x3f-game.js`.

**Constraint.** Whatever shape that takes, it must keep `force`, `baseline`, `calLo`,
`startRun`, `ref`, `band`, `EXSLUG` and the game-specific set variables as **globals** — see
§7.

### W-13 — Nova has zero automated test coverage
`tools/func-test/cases.js` has branches for `bloomtv` (:178), `bloom` (:206), `flow` (:293),
`splash` (:297) and the launcher (:315) — and **none for Nova**, the largest and most stateful
of the three (572 lines, 4 scenes, a shop, a boss phase, 6 enemy types).

### W-14 — Score-game runs inflate the session count
ROADMAP "Next" #2 already names this. `X3FProg.sets()` (`x3f-progress.js:137-144`) accepts any
entry with a `g`, so three quick Splash attempts read as three sets in `stats().sessions`
(`:447`) and unlock the `sess1/10/25/50/100/200` badge family (`:510-513`). Days and streaks
are unaffected (same day). Once Splash and Nova gain a real set model (W-04) this resolves
itself; until then it is a live inflation.

### W-15 — The set summary is a toast the player has already looked away from
Bloom ends a set with a canvas toast (L297), then an `x3f-set.js` fixed-position toast 900 ms
later (L303), then up to three hype callouts starting 1800 ms later (L288-291). Four separate
overlay systems, three of them on timers, none of them a place the player can look back at.
The most important twenty seconds of the workout has no persistent surface.

---

## 7. Invariants — what a refactor must not break

Each with the evidence that makes it load-bearing.

### I-01 — `force` must remain a mutable global on `window`
`MainActivity.java:619` assigns it every 16 ms: `force=f;`. `tools/func-test/cases.js:249`
reads and drives it. An ES module, an IIFE, or a `const` binding breaks the entire TV build —
**silently**, because the assignment is inside `try{…}catch(e){}`.

### I-02 — `baseline` must remain a mutable global
`MainActivity.java:583`: `try{ baseline=0; }catch(e){}`. Also inside a swallowed try.

### I-03 — `calLo()` must remain a global function taking no arguments
`MainActivity.java:618`: `if(typeof calLo==='function'){ var lo=+calLo()||0; f=f>lo?f-lo:0; }`.
The comment at `:609-615` documents that losing this once already produced the "overhead press
pinned at the top of the screen" bug.

### I-04 — `ref()` must remain a global returning the calibrated **span**
`tools/func-test/cases.js:185` asserts `ref() === 26` after
`X3FCal.save('overhead-press','White',52,78)`. Everything on screen in all three games divides
by it.

### I-05 — `window.__x3fBand()` must keep returning the band this run is using
`x3f-set.js:49` prefers it over `localStorage.x3f_band`, precisely so a Routine-launched
`?band=` override is logged against the band actually pulled. Bloom L113, Splash L115,
Nova L123.

### I-06 — `EXSLUG` must resolve `?ex=` → `x3f_session.pending.slug` → `null`
`tools/func-test/cases.js:180` asserts `EXSLUG === 'overhead-press'` from the launch URL.
`X3F_Routine.html:438` writes `S.pending={slug,game,at}` immediately before navigating, and
`x3f-cal.js:83-91` is the shared resolver. Breaking this detaches every set from its movement.

### I-07 — `startRun` must stay a global function **in Splash and Nova**, and must stay absent in Bloom
`MainActivity.java:623`: `if(typeof startRun==='function')startRun();`. Adding a `startRun` to
Bloom would make the TV auto-start a set the moment the page loads, before the tare finishes.
Renaming Splash's or Nova's would leave the TV on a frozen menu with no reachable start.
`tools/func-test/cases.js:307` also calls `startRun()` and `endRun()` on Splash by name.

### I-08 — The ids `firstrun`, `zeroBtn`, `stage`, `bandSel`, `cueBtn`, `formBtn`, `musicBtn` must survive
`MainActivity.java:622` (`firstrun`), `:624` (`zeroBtn`, capture-phase, `stopPropagation`);
`x3f-form.js:539/558` needs a host and `toggleBtn`; `x3f-hype.js:72` defaults to
`document.getElementById('stage')`; `x3f-music.js:246` looks for `musicBtn`.

### I-09 — The class names `.app`, `.tvbtn`, `.chip`, `.chip .v`, `.chip .k`, `.status`, `.mini`, `.cta`, `.brand`, `.toast`, `.card`, `.card h1`, `.card p`, `.card .tag` are a public API of the Java shell
`MainActivity.java:585` (`.app` width override), `:590` (`.tvbtn` hide), `:596-604` (the entire
10-foot type scale). Renaming any of them removes TV legibility with no error anywhere.
This is also why Nova currently gets none of it (§4.1).

### I-10 — Modals must be `.scrim` + `.show`
`MainActivity.java:631`: `scope()` = `document.querySelectorAll('.scrim.show,.modal.show')`.
The D-pad is trapped inside the topmost match. Nova's `#shop` and `#gameover` depend on this
entirely — without it the remote can focus the Re-Zero button behind the shop.

### I-11 — Interactive controls must be real elements or carry a known class
`MainActivity.java:643`: candidates are
`button,select,input,a[href],.cta,.buy,.mini,.iconbtn,[role=button],[onclick]`.
Nova's shop rows are generated with `class="buy"` (L304) for exactly this reason.

### I-12 — `Space` must remain "pull" and must not be consumed by a nav layer
Bloom L167-168, Splash L168-169, Nova L170-171 all bind `keydown`/`keyup` on `Space` with
`preventDefault()`. HANDOFF.md:41: *"Don't add x3f-nav.js to a game — its Enter/Space handling
would fight Space-to-pull in the browser build."*

### I-13 — Exactly **one** history entry per set
ROADMAP records this as a shipped fix ("Bloom wrote **two** history entries per set, inflating
every total"). The invariant is enforced by the `if(window.X3FProg){…} else { logSession(…) }`
shape at Bloom L280-295, and asserted at `tools/func-test/cases.js:262`:
```js
ok('exactly one history entry per set', P.sets().length === before + 1, …);
```
Any refactor that routes Bloom through `X3FSet.report()` **must remove the direct
`X3FProg.logSet` call**, not add to it. Note `X3F_Routine.html:448` writes its *own*
`X3FProg.logSet({g:'routine',ex,band})` when the user taps "Log set ✓" — that is a second
entry by design and is outside this invariant.

### I-14 — `reps === full + part` in Bloom's log entries
§2.4.4. `tools/func-test/cases.js:265` asserts `part === 7` after the test sets
`burnoutReps=7; fullReps=5;` and drives `reps` to 12. Any new model must keep the reported
totals internally consistent or the dashboard's rep sums double-count.

### I-15 — `part` is the headline, not `reps`
ROADMAP v1.1: *"Score the failure — partials past full-range collapse get their own meter,
their own milestones, and the headline slot in the set summary."* Enforced by Bloom L297-299
and asserted at `tools/func-test/cases.js:266`:
```js
ok('the toast headlines the partials', /partials past it/.test(txt('toast')), txt('toast'));
```
and by `x3f-hype.js:246-258` (`setBurn`, the `.x3fh-burn` meter, milestones at 5/10/20/35).
`tools/func-test/cases.js:259` asserts `document.querySelector('.x3fh-burn.on')` exists after
`hype.setBurn(7)`.

### I-16 — Bloom's globals `reps`, `fullReps`, `burnoutReps`, `setPeak`, `hype`, `endSet` are driven by name from the test harness
`tools/func-test/cases.js:252-258`:
```js
for (var i = 1; i <= 12; i++) { reps = i; if (typeof hype !== 'undefined' && hype) hype.set(i); }
burnoutReps = 7; fullReps = 5; setPeak = 355;
…
try { endSet(true); } catch (e) { … }
```
Splash's `score`, `startRun`, `endRun` likewise (`:307`). Renaming or scoping any of them
breaks 79 functional assertions across 7 screens.

### I-17 — Achievement unlocks must never be a dialog
`x3f-set.js:87-100` (`announce`), comment verbatim: *"Never a dialog - a modal mid-workout on a
TV has to be dismissed with the remote."* Bloom hand-rolls the same behaviour at L287-292.

### I-18 — `X3FCal.observe()` must only ever be fed a peak from a movement whose floor is 0
`x3f-cal.js:113-119`, verbatim: *"The peak handed in is the force the GAME saw, which is
already floored by lo. That is only sound because a movement auto-learns while lo is still 0
… Do not relax that check without also un-flooring the peak."* Enforced by the early return at
`:123`. `tools/func-test/cases.js:229-231` asserts auto-learn never overwrites a real
calibration.

**Note for the overhaul:** Bloom currently bypasses `X3FSet.report()` entirely (L280-295) and
therefore **never calls `observe()`**. The only game that measures a real set is the only game
that never teaches calibration. Routing Bloom through the reporter fixes that — and must be
done in the same change as removing the direct `logSet` (I-13).

### I-19 — `x3f-cal.js` must stay a blocking `<head>` script
Bloom L55, Splash L57, Nova L60. The inline script's first statements call `X3FCal.slug()`
(Bloom L110). Moving it to the bottom with the others makes `EXSLUG` permanently `null`.

### I-20 — Music preference is global and shared, not per game
`x3f-music.js:83` reads `x3f_music` at `create()`, `:193/:200` write it. All three games share
one boolean. Making it per-game would surprise a player crossing from the launcher into a game.

### I-21 — The procedural fallback must remain complete and reachable
Both file headers state it (Bloom L7-9, Splash L5-6): *"Missing files fall back to procedural
art, so it stays fully playable + offline with zero assets."* `sync-from-web.py:57-58` records
that a release already shipped with the art missing and the games silently ran procedurally.
Every `IMG.<slot>.ok` branch has a working `else`.

### I-22 — `app/src/main/assets/*` is generated; re-run the sync tool
`tools/sync-from-web.py`. The three game files currently differ from their bundled copies by
exactly two hunks each (manifest link, SW registration). A refactor that edits `web/` and does
not re-run the tool leaves the TV on the old code, and HANDOFF.md:58 adds: **bump
`versionCode` in `app/build.gradle`** or the TV updater will report "You're on the latest" and
never pull the change.

### I-23 — `sw.js`'s cache name must be bumped
`sw.js:1` `const C='x3f-v8';` with a cache-first fetch handler (`:6`). Returning PWA users get
the cached copy of every file until `C` changes. Any refactor ships nothing to them otherwise.
(And per D-15, the precache list needs the five missing shared scripts and `assets/**` added at
the same time.)
