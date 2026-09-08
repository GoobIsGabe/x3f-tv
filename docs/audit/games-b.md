# X3F games (B) — deep read for the overhaul

Line-by-line audit of the five remaining games. Written so the overhaul can be
planned and executed **without reopening these files**.

**Files read in full**

| File | Lines | Role |
| --- | --- | --- |
| `E:/Fun/x3f-tv/web/X3F_Arena.html` | 283 | 4-mode training suite (Meter / Hold / Max / Boss), DOM-only |
| `E:/Fun/x3f-tv/web/X3F_Flow.html` | 213 | controlled-rep ribbon tracer, canvas 2D |
| `E:/Fun/x3f-tv/web/X3F_Duel.html` | 196 | tug-of-war vs CPU, canvas 2D |
| `E:/Fun/x3f-tv/web/X3F_Rhythm.html` | 185 | falling-note beat game, canvas 2D |
| `E:/Fun/x3f-tv/web/X3F_Ascent.html` | 283 | 3D flight game, Three.js r128 from CDN |

**Support files read in full, because the games are unreadable without them**

| File | Lines | What it contributes |
| --- | --- | --- |
| `E:/Fun/x3f-tv/web/x3f-cal.js` | 136 | `X3FCal` — per-movement `{lo,hi}` calibration, auto-learned ceiling |
| `E:/Fun/x3f-tv/web/x3f-set.js` | 177 | `X3FSet` — the single "a set finished" reporter + peak/TUT watcher |
| `E:/Fun/x3f-tv/web/x3f-progress.js` | 616 | `X3FProg` — history, PBs, program, challenges, ~130 achievements |
| `E:/Fun/x3f-tv/web/x3f-exercises.js` | 149 | `X3FEX` — movement data, `GAMES` map, `gameUrl()` |
| `E:/Fun/x3f-tv/web/x3f-music.js` | 265 | `X3FMusic.attach()` — generated soundtrack |
| `E:/Fun/x3f-tv/web/X3F_Calibrate.html` | (:80–200) | what actually gets written into `x3f_exCal` — **raw, unscaled units** |
| `E:/Fun/x3f-tv/web/X3F_Bloom.html` | (:230–300, :420–470) | the reference implementation of an X3-correct set |
| `E:/Fun/x3f-tv/web/X3F_Library.html` | 104 | how the games are launched and with which query string |
| `E:/Fun/x3f-tv/web/X3F_Routine.html` | (:225–500) | guided session, `x3f_session.pending`, `launchUrl()` |
| `E:/Fun/x3f-tv/web/sw.js` | 6 | cache-first service worker (the offline contract) |
| `E:/Fun/x3f-tv/app/src/main/java/com/goob/x3ftv/MainActivity.java` | (:575–670) | the **TV shell BOOTSTRAP** that overwrites `force` directly |
| `E:/Fun/x3f-tv/tools/func-test/cases.js` | 400 | the only executable spec for Flow; nothing covers Arena/Duel/Rhythm/Ascent |
| `E:/Fun/x3f-tv/tools/sync-from-web.py` | (:30–90) | web → TV bundle filename map (`X3F_Ascent.html` is **absent**) |
| `E:/Fun/x3f-tv/docs/x3-knowledge/protocol.md` | 673 | the sourced statement of what the method actually asks for |

---

# 0. The verdict up front

Measured against `docs/x3-knowledge/protocol.md` §4 (three-phase set), §5 (15–40
reps), §6 (2–3 s each way), §4.4 (constant tension, no lockout):

| Game | Counts reps? | Diminishing range? | Partials logged? | Eccentric timed? | Ends at failure? | Reports a set? | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Arena · Meter** | no | n/a | no | no | n/a | **never** | a readout, not a game. Harmless. |
| **Arena · Hold** | no | no | no | no | no — fixed 30 s | yes | rewards *submaximal* holding. Actively anti-X3. |
| **Arena · Max** | no | no | no | no | no — fixed 5 s | yes | 5 s explosive singles. Legitimate as a benchmark, **not X3 training**. |
| **Arena · Boss** | no | no | no | no | no lose state | on **win only** | rewards a 15–46 s max isometric. Not X3. |
| **Flow** | yes | **no** | no | no | yes (2 missed reps) | yes | closest of the five; a strictly worse Bloom. |
| **Duel** | yes | no | no | no | no | on loss / next match | **rewards rep speed.** Unwinnable at protocol tempo. |
| **Rhythm** | no (notes) | no | no | no | no | yes | **rewards rhythm and punishes max effort.** The most anti-X3 thing in the repo. |
| **Ascent** | no | no | no | no | no | **never** | a submaximal isometric endurance test that the program cannot see at all. |

Blunt version: **Bloom is the only game in the suite that trains X3.** These five
train, in order: holding a submaximal window (Arena Hold), a 5-second peak
(Arena Max), a long isometric (Arena Boss, Ascent), metronome-paced reps that
cap out at a fixed amplitude (Flow), rep *speed* (Duel), and rep *timing with an
upper force bound* (Rhythm). Four of the seven modes punish pulling harder. Two
never tell the program anything happened. Only Flow ends a set on anything that
resembles failure, and even Flow's "failure" is "you missed the metronome twice",
not "the top of the range is gone".

The three things the protocol says are the whole point — **one all-out set**,
**slow negatives**, **partials past failure** — are represented in these five
files by: nothing, nothing, and nothing.

---

# 1. Structural map

## 1.1 The shared skeleton (four of five are the same file)

Arena, Flow, Duel and Rhythm are four copies of one program with different
draw code. Ascent is a fifth copy with the BLE block re-indented and everything
wrapped in an IIFE.

The duplicated block, in order, in each file:

| Concern | Arena | Flow | Duel | Rhythm | Ascent |
| --- | --- | --- | --- | --- | --- |
| `SERVICE` / `CH_FORCE` / `CH_BATT` consts | :150 | :80 | :73 (no BATT) | :74 (no BATT) | :82–84 |
| `$ = id => getElementById` | :151 | :81 | :74 | :75 | :88 |
| `xget`/`xset` (or `store`) over `x3f_` | :152 | :82–83 | :75–76 | :76–77 | :89–90 (`ascent_`!) + :92 |
| `logSession()` legacy writer | :174 | :101 | :77 | :78 | — |
| `BAND_DEF` / `BANDS` | :160–161 | :84–85 | :78–79 | :79–80 | :93–94 |
| `let band` / `bandMax` | :162–163 | :86 | :80 | :81 | :95–96 |
| `const EXSLUG = X3FCal.slug()` | :164 | :87 | :81 | :82 | :97 |
| `window.__x3fBand` | :167 | :90 | :84 | :85 | :102 |
| `ref()` — the scale | :170 | :93 | :87 | :100 (`bandRef`) | :100 |
| `calLo()` — the zero | :173 | :96 | :90 | :91 | :101 |
| band `<select>` build + onchange | :223–229 | :98–100 | :92–94 | :93–95 | :103–105 |
| `?band=` / `?mode=` / `?tempo=` / `?bpm=` parse | :227 | :147 | :95 | :96 | :106 |
| `async connect()` (Web Bluetooth) | :176–193 | :110–123 | :99–111 | :100–112 | :108–130 |
| `setStatus()` | :194 | :109 | :98 | :99 | :131 (`setConn`) |
| `startTare()` — 400 ms delay, 1500 ms average | :196 | :124 | :112 | :113 | :132 |
| `onSample()` — tare, then `force = max(0, raw−baseline−calLo())` | :197–202 | :125–129 | :113–116 | :114–117 | :133–139 (`sample`) |
| `startDemo()` + a 26–27 ms `setInterval` | :204–205 | :131–132 | :118–119 | :119–120 | :142–145 |
| pointer/Space input for demo | :206–209 | :133–136 | :120–121 | :121–122 | :146–149 |
| `#zeroBtn` handler | :219 | :138 | :123 | :124 | **none** |
| `beep()` WebAudio one-shot | — | :104 | :125 | :126 | — |
| `x3tv()` fullscreen + orientation lock | :270 | :200 | :182 | :171 | :280 |
| wake-lock IIFE | :271 | :201 | :183 | :172 | :281 |
| service-worker registration | :272 | :202 | :184 | :173 | :282 |

That is **~70 lines duplicated five ways** (nine ways across the whole suite,
counting Bloom / Splash / Nova / Calibrate). Every fix to the BLE path,
the tare, the demo driver or the band picker has to be applied nine times.
`HANDOFF.md:97` records this rule being broken twice already.

## 1.2 The force pipeline (the contract every game depends on)

```
BLE notify (e3458901, LE float64, ~37 Hz)
   └─> raw                                     [absolute, bar units]
        └─> onSample():  force = max(0, raw − baseline − calLo())
                                                [floored at the movement's start load]
             └─> ref() = X3FCal.span(EXSLUG, band)   [the movement's own hi − lo, min 10]
                  └─> every threshold in the game is a fraction of ref()
```

`X3FCal` (`x3f-cal.js:93–100`):

```js
function range(sl, band) {
  if (!sl) return { lo: 0, hi: bandCeiling(band), auto: true };
  var e = map()[id(sl, band)];
  if (e && e.hi > 0) return { lo: Math.max(0, e.lo || 0), hi: e.hi, auto: !!e.auto };
  return { lo: 0, hi: bandCeiling(band), auto: true };
}
function floor(sl, band) { return range(sl, band).lo; }
function span(sl, band)  { var r = range(sl, band); return Math.max(MIN_SPAN, r.hi - r.lo); }
```

`MIN_SPAN = 10` (`:46`), `MIN_PEAK = 25` (`:47`), map cached for 500 ms (`:62`),
key is `slug + '|' + band` (`:69`), stored under `x3f_exCal`.

**All five games honour per-movement calibration** — floor and span both — with
five caveats, each a defect below: Arena's `scale` multiplier (D-01), the TV
bootstrap not mirroring `scale` (D-02), Ascent hiding `calLo` inside an IIFE
(D-03), a mid-run band change desyncing cached thresholds (D-11), and the
auto-learn ceiling being fed a contaminated peak (D-05).

**The auto-learn loop:** `X3FSet.report()` → `X3FCal.observe(ex, band, peak)`
(`x3f-set.js:146`) → writes `{lo: existing||0, hi: peak, auto: true}`
(`x3f-cal.js:125`). An explicit calibration (`auto:false`) is never overwritten
(`:123`). This is why a garbage peak is not cosmetic — it becomes the divisor for
every game.

## 1.3 The set-report contract

`X3FSet.report(o)` — `x3f-set.js:127–172`. Accepted fields (`:135`):

```js
['reps','full','part','peak','secs','score','tut','ecc'].forEach(function (f) {
  if (o[f] != null && !isNaN(+o[f])) entry[f] = Math.round(+o[f] * 100) / 100;
});
```

`ex` from `o.ex || ?ex=` (`:132`), `band` from `window.__x3fBand()` then
`x3f_band` (`:48–54`). Then: `sample()` one last time, fill `peak`/`tut` from the
watcher if absent (`:139–141`), `X3FCal.observe(...)` (`:146`), `resetWatch()`
(`:147`), `X3FProg.logSet(entry)` (`:154`), `checkAchievements()` (`:156`), and a
toast (`:167–169`).

**Note `acc` is not in the accepted list.** Flow measures accuracy, displays it,
passes it (`X3F_Flow.html:153`) — and `x3f-set.js` silently drops it, even though
`X3FProg.logSet` would have stored it (`x3f-progress.js:56`).

The watcher (`x3f-set.js:105–125`) is a 40 ms `setInterval` started once at page
load:

```js
if (f > watch.peak) watch.peak = f;
if (r > 0 && f > r * 0.15) watch.tut += dt;
```

It is reset **only** by `report()` or an explicit `X3FSet.reset()`. Bloom calls
`X3FSet.reset()` at set start (`X3F_Bloom.html:269`). **None of these five do.**

What each game reports:

| Game / mode | Call site | Payload | Fires when |
| --- | --- | --- | --- |
| Arena Meter | — | — | **never** |
| Arena Hold | `X3F_Arena.html:247` | `{g:'zone', tut:round(zTime), secs:30}` | 30 s timer expiry, inside `tick()` |
| Arena Max | `X3F_Arena.html:252` | `{g:'max', peak:round(xAttempt)}` | 5 s window expiry, inside `tick()` |
| Arena Boss | `X3F_Arena.html:262` | `{g:'boss', score:bStage, secs:round(el)}` | **only on a kill** |
| Flow | `X3F_Flow.html:153` | `{g:'flow', reps, acc}` (`acc` dropped) | any `endSet()` — including a manual Stop |
| Duel | `X3F_Duel.html:133, :153` | `{g:'duel', score:duelRounds}` | on loss, and on the next New Match |
| Rhythm | `X3F_Rhythm.html:139` | `{g:'rhythm', score}` | any `stop()` |
| Ascent | — | — | **never** (no `x3f-set.js`, no `x3f-progress.js`) |

Nothing here ever reports `reps` except Flow. Nothing ever reports `full`,
`part` or `ecc`. So of the whole achievement catalogue
(`x3f-progress.js:458–566`), these five can only ever move: `sess*` (sets
logged), `peak*` (via the watcher), `streak*`, `week*`, `days*`, `fullweek*`,
`comeback`, `chal*`, `tut*` (Arena Hold only, and it is not really TUT), and
`set*`/`reps*`/`part*`/`ecc*` only through Flow's rep count. The five families
the roadmap calls "what the program actually asks for" — `part*`, `partsum*`,
`exburn*`, `ecc*` — are **unreachable from any of these five games**.

## 1.4 Per-game structure

### Arena (`X3F_Arena.html`, 283 lines) — DOM-only, four modes

**Purpose.** A four-in-one drill suite. It is the only game with a settings sheet
and the only one with a unit-conversion (`scale`) feature.

**Modes** — tabs at `:119–124`, views at `:95–117`, switching at `:222`:

```js
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  mode = t.dataset.m;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.v === mode));
});
```

`?mode=zone|max|boss` (`:227`) clicks the tab; `X3FEX.GAMES` maps three separate
library entries onto this one file (`x3f-exercises.js:115–117`).

**Game loop** — one `requestAnimationFrame` (`:237–268`). `dt = Math.min(0.05, …)`
(`:238`). The whole loop is gated by `mode`, so **only the visible mode's state
machine advances** (D-06).

State per mode:
- Meter: `sessionPeak`, `activeSum`/`activeCount`, `totalWork` (`:157`), none reset per set.
- Hold: `zRun`, `zTime`, `zEnd`, `zBest` (`:231`). Target `ref()*0.55`, window `[0.82×, 1.25×]` of target (`:244`).
- Max: `xPhase ∈ idle|count|go|done`, `xEnd`, `xAttempt`, `xPB`, `xCountEnd` (`:233`). 3 s count, 5 s window (`:234`, `:251`).
- Boss: `bFight`, `bHP`, `bMax = ref()*(14+(bStage−1)*7)`, `bStage`, `bStart`, `bDmg` (`:235–236`). Damage threshold `ref()*0.35`, damage `(force−thr)*dt*1.4`, heal `bMax*0.04*dt` (`:258–260`).

**Force mapping.** `force = Math.max(0, raw − baseline − calLo()) * scale` (`:200`)
— **the only game that multiplies by `scale`**, and the only one where `ref()` is
therefore in different units from `force`.

**HUD.** A `.status` pill (`:91`), a settings gear (`:92`), a conic `<svg>` ring
driven by `strokeDashoffset` (`:97`, `:241`), three `.chip`s per mode, a `.track`
band+marker for Hold (`:104`), an `.orb`+`.hpwrap` for Boss (`:113`), and a
bottom `.tabbar`.

**Frame cost.** Zero canvas. One `style.strokeDashoffset` write plus 3–8
`textContent` writes per frame. Cheapest in the suite. But `X3FSet.report()` is
called **inside the rAF loop** in all three reporting modes (`:247`, `:252`,
`:262`), and that call walks the entire history and evaluates ~130 achievement
predicates (D-19).

### Flow (`X3F_Flow.html`, 213 lines) — canvas ribbon tracer

**Purpose.** "Controlled reps, the X3 way. Trace the moving ribbon" (`:74`).

**Modes.** One. Tempo select: `4000 / 3000 / 2000` ms **per full up-down cycle**
(`:67`), i.e. 2 s / 1.5 s / 1 s per phase. Default and Library-supplied value is
`3000` (`X3F_Library.html:88`).

**Game loop.** `loop(now)` at `:161–197`. No `dt`. Target curve (`:159`):

```js
function targetAt(t){const R=ref(),lo=R*0.12,hi=R*0.78;const ph=((t)/period)%1;
  return lo+(hi-lo)*(0.5-0.5*Math.cos(2*Math.PI*ph));}
```

Rep boundary is **purely temporal** — `if (ph < phasePrev)` (`:185`), one per
`period`. A rep counts if `repMax >= ref()*0.78*0.72` = **0.5616 × ref** (`:186`).
Two consecutive misses end the set (`:188`).

**Force mapping.** `mapY(f)` (`:160`) maps `0 … ref()` onto `bot=H−70 … top=54`.
Tolerance `tol = ref()*0.14` (`:164`).

**HUD.** Four `.chip`s — Reps / Accuracy / Best Set / Force (`:58–61`) — a
`.toast`, a Re-Zero button, the tempo select, Start/Stop.

**Frame cost.** Full `clearRect`, 3 guide lines, a ribbon path of `W/6 + 1`
points (**138 at 820 px CSS, 321 at 1920 px**) stroked **twice** — once at
`lineWidth` up to **60 px** with `lineCap:'round'` (`:171–172`), once at 2.5 —
plus a `shadowBlur:18` arc (`:178–179`) and 4 DOM text writes. The wide
round-capped stroke is the single most expensive 2D operation in the suite.

### Duel (`X3F_Duel.html`, 196 lines) — canvas tug-of-war

**Purpose.** "Tug-of-war against the machine … The CPU pulls on a cadence that
gets faster each round" (`:67`).

**Modes.** One, with escalating rounds.

**Game loop.** `loop(now)` at `:138–178`. Rep detection is a two-state hysteresis
(`:140–149`):

```js
const R=ref(),hi=R*0.6,lo=R*0.2;
if(st==='down'&&force>hi){st='up'}
else if(st==='up'&&force<lo){             // rep complete
  const qual=Math.max(0,Math.min(1,(peakF-hi)/(R-hi)));
  flag+=0.07+0.07*qual;reps++; …
```

CPU (`:136–137`, `:150`):

```js
function aiPeriod(){return Math.max(820,1900-round*150)}
function aiPull(){return 0.055+round*0.008}
if(now>=aiNext){flag-=aiPull();aiNext=now+aiPeriod(); if(flag<=-1){ …lose… }}
```

**HUD.** Three `.chip`s — Round / Reps / Best Round (`:53–55`) — a rope+flag
canvas scene, and a bottom force gauge with a threshold tick (`:171–175`).

**Frame cost.** `clearRect` + **a fresh `createLinearGradient` and a full-canvas
`fillRect` every frame** (`:159–160`), a rope line, 3 tick lines, a
`shadowBlur:18` arc (`:168`), two `ctx.font` assignments (`:169`, `:175`), a
gauge. The full-screen gradient fill is pure overdraw.

### Rhythm (`X3F_Rhythm.html`, 185 lines) — canvas note-highway

**Purpose.** "Reps on the beat … hit the high notes by pulling to the target, the
low notes by releasing" (`:68`).

**Modes.** One. Tempo select `50 / 66 / 84` labelled Slow / Medium / Fast (`:61`),
consumed as `period = 60000 / value` (`:136`, `:138`) → **1200 / 909 / 714 ms per
note**. Notes alternate hi/lo (`:144`), so a full rep is two notes: **2.4 / 1.8 /
1.4 s**.

**Game loop.** `loop(now)` at `:140–168`.

```js
const R=ref(),hi=R*0.72,lo=R*0.14,tol=R*0.17;
while(nextBeat<now+TRAVEL){beats.push({time:nextBeat,level:(idx%2===0)?hi:lo,hi:idx%2===0,judged:false});
  idx++;nextBeat+=period;beep(idx%2?880:880,0.03)}
beats.forEach(b=>{if(!b.judged&&now>=b.time){b.judged=true;const good=Math.abs(force-b.level)<tol; …
```

`TRAVEL = 2100` ms (`:133`), hit line at `W*0.26` (`:134`).

**HUD.** Three `.chip`s — Score / Combo / Best Combo (`:53–55`) — plus a legend
string drawn on the canvas (`:165`).

**Frame cost.** `clearRect`, 2 guide lines, 1 hit line, ~4–5 note arcs each with
`shadowBlur:12`, a `shadowBlur:10` marker arc, one `ctx.font` + `fillText`, and
a **new array allocated every frame** by `beats.filter(...)` (`:149`).

### Ascent (`X3F_Ascent.html`, 283 lines) — Three.js flight

**Purpose.** "Force = thrust. Pull to climb against gravity, fly the core through
energy rings" (`:4`).

**Modes.** One endless run.

**Game loop.** `loop(now)` at `:226–274`. Physics (`:199`, `:237–239`):

```js
let shipY=0, vy=0, dist=0, speed=44, score=0, combo=1, spawnZ=0;
const GRAV=17, THR=44, YCLAMP=19;
…
vy += (norm*THR - GRAV)*dt; vy*=0.985; shipY+=vy*dt;
speed=Math.min(96, speed+dt*1.4); dist+=speed*dt; score+=speed*dt*0.12*combo;
```

Hover requires `norm = GRAV/THR = 0.386` — **38.6 % of your calibrated span, held
continuously.** Ring scoring `Math.abs(shipY−r.y) < 4.2` (`:245`). The only end
condition (`:252`):

```js
if(shipY<=-YCLAMP+0.2 && norm<0.05){ endRun.pin=(endRun.pin||0)+dt; if(endRun.pin>1.6){…endRun();} }
```

**HUD.** Four `.card`s — Score / Combo / Altitude / Best (`:53–56`) — a vertical
`.fbar` force meter with a `.fhover` target line (`:67`), and a `.center` overlay
(`:68–71`).

**Frame cost.** By far the heaviest. Per frame: 2 inline `style` writes + 3
`textContent` writes (`:230–231`, `:268–270`); **1400 × 3 Float32 writes plus a
full `BufferAttribute` re-upload** (`:264–266`); a `WebGLRenderer` with
`antialias:true` and `pixelRatio` up to 2 (`:155–156`) — on a 4K panel that is a
3840×2160 MSAA target; `FogExp2`; two `GridHelper(400, 40, …)` (`:170–171`, 164
line segments each); 10 `TorusGeometry(3.6, 0.42, 12, 40)` ring meshes (`:190`);
an octahedron, a torus halo, a cone flame, a `PointLight` and a
`DirectionalLight`.

## 1.5 Storage keys

| Key | Written by | Read by | Notes |
| --- | --- | --- | --- |
| `x3f_band` | all five (`select.onchange`) | all games, `x3f-set.js:51` | `?band=` deliberately does **not** write (HANDOFF:111) |
| `x3f_bandMax` | Arena only (`:229`, `:230`) | all five, `x3f-cal.js:74` | the pre-calibration fallback ceiling |
| `x3f_exCal` | Calibrate, `X3FCal.save/observe` | all five via `ref()`/`calLo()` | `{ "slug|Band": {lo,hi,auto,n,t} }` |
| `x3f_history` | `X3FProg.logSet`, and each game's dead `logSession` | Progress, Routine, challenges, achievements | **two writers with different caps** — see D-14 |
| `x3f_ach`, `x3f_chal`, `x3f_prog` | `x3f-progress.js` | dashboard | |
| `x3f_session` | Routine | `X3FCal.slug()` (`x3f-cal.js:87–89`) | `.pending.slug` is the fallback movement resolution |
| `x3f_music` | `x3f-music.js:193/200` | itself | |
| `x3f_scale`, `x3f_unit` | **Arena only** (`:210–211`) | Arena only | the unit-conversion feature, invisible to the rest of the suite |
| `x3f_zBest`, `x3f_xPB`, `x3f_bBest`, `x3f_bStage` | Arena (`:158`, `:221`, `:247`, `:252`, `:262`) | Arena only | |
| `x3f_flowBest` | Flow (`:97`, `:152`) | Flow only | |
| `x3f_duelBest` | Duel (`:91`, `:148`) | Duel only | |
| `x3f_rhythmBest` | Rhythm (`:92`, `:139`, `:146`) | Rhythm only | |
| `x3f_cues` | Flow only (`:102–103`) | Flow only | |
| `x3f_libBand` | Library | Library | |
| **`ascent_best`** | **Ascent (`X3F_Ascent.html:89–90`, `:209`)** | Ascent only | **wrong namespace** — outside the `x3f_` prefix, so export/import and any future profile-prefixing miss it |

Every game keeps a private "best" that no other page can see. The dashboard's PB
table (`x3f-progress.js:160`) is built from `x3f_history` only, so all seven of
these local bests are dead ends.

## 1.6 CSS tokens — four palettes and one file with none

| Token | Arena `:12` | Flow `:13` | Duel `:11` | Rhythm `:11` | Ascent |
| --- | --- | --- | --- | --- | --- |
| `--bg` | `#06080e` | `#06080e` | `#06080e` | `#06080e` | hard-coded `#05070d` |
| `--bg2` | `#0b0f18` | — | — | — | — |
| `--panel` | `rgba(255,255,255,.045)` | `rgba(255,255,255,.05)` | `.05` | `.05` | `rgba(14,20,34,.66)` |
| `--brd` / `--brd2` | `.09` / `.14` | same | same | same | `#263149` / `#2b3852` |
| `--txt` | `#eaf0fa` | same | same | same | `#eaf2ff` |
| `--dim` | `#8593a9` | same | same | same | `#8092ad` |
| `--accent` | `#2ff0b0` | same | same | same | **`#2ee6a6`** |
| `--accentD` | `#0fae82` | same | same | same | `#0f9c7a` |
| `--gold` | `#ffd35c` | same | same | same | `#ffd35c` |
| `--hot` | `#ff5d78` | same | same | same | **`#ff5470`** |
| `--cyan` | `#37d6ff` | `#37d6ff` | **absent** | `#37d6ff` | `#34d3ff` / `#7cf` |
| display font var | **`--display`** | `--d` | `--d` | `--d` | none (`'Segoe UI',system-ui`) |
| numeric font var | **`--num`** | `--n` | `--n` | `--n` | none |
| Google Fonts weights | `Sora 500;700;800` | `Sora 600;800` | `Sora 600;800` | `Sora 600;800` | **none loaded** |

Three real consequences: Arena's variable names differ from the other three, so
no stylesheet can be shared as written; Flow/Duel/Rhythm request Sora 600 and 800
but style `.cta`/`.gm` at `font-weight:700` (`X3F_Flow.html:35`), so every button
label is a synthesised bold; and Ascent is a different product visually — its
green, its red and its typography are all off-palette.

## 1.7 DOM structure

Arena is the outlier — a `.app` column with `.topbar` / `.stage` (four absolutely
positioned `.view`s) / `.tabbar`, plus two `.scrim` overlays (`#firstrun`,
`#sheetScrim` containing `#sheet`).

Flow / Duel / Rhythm share one shape exactly:

```
.app
 ├─ .topbar        back ‹  ·  TV  ·  .brand  ·  .spacer  ·  .status  ·  #bandSel  [· #cueBtn]
 ├─ .stage         <canvas id=cv>  ·  .hud (2–4 .chip)  ·  .toast
 └─ .ctrl          #zeroBtn  [· select]  ·  .grow  ·  #startBtn
.scrim#firstrun > .card    (h1 / p / Connect / Demo)
```

Ascent shares nothing: `<canvas id=c>` + a fixed `.hud` with `.top > .card`,
`.fbar`, `.center`, `.tag`, and a hidden `#err`.

Element ids the **TV shell** reaches into by name (`MainActivity.java:622–624`):
`#firstrun` (force-hidden) and `#zeroBtn` (click intercepted). Ascent has
neither.

## 1.8 Query-string contract

`x3f-exercises.js:134–142`:

```js
function gameUrl(game, o) {
  const g = GAMES[game] || GAMES.bloom, q = [];
  if (g.mode) q.push('mode=' + g.mode);
  q.push('from=' + encodeURIComponent((o && o.from) || 'lib'));
  if (o && o.band)  q.push('band=' + encodeURIComponent(o.band));
  if (o && o.tempo && g.tempo) q.push('tempo=' + encodeURIComponent(o.tempo));
  if (o && o.ex)    q.push('ex=' + encodeURIComponent(o.ex));
  return fileFor(game, g.file) + '?' + q.join('&');
}
```

- `?ex=` → `X3FCal.slug()` → the whole calibration path, **and** `X3FSet`'s `ex`.
- `?band=` → the run's band, non-persisting.
- `?tempo=` → Flow only (`g.tempo` is set for `bloom` and `flow` only).
- `?mode=` → Arena only.
- `?from=` → **parsed by nothing.** Dead parameter in all five.
- `?bpm=` → Rhythm reads it (`:96`) but `gameUrl` never emits it. Unreachable.

---

# 2. Every defect

Severity: **S1** corrupts data or makes the feature wrong; **S2** breaks a
user-visible behaviour; **S3** cosmetic, wasteful or latent.

---

### D-01 · S1 — Arena's unit calibration silently breaks every threshold in the file

`X3F_Arena.html:200`

```js
force=Math.max(0,raw-baseline-calLo())*scale;
```

`scale` comes from `store.get('scale',1)` (`:156`) and is set by `calibrate()`
(`:210`) as `known / (raw − baseline)`. **`ref()` (`:170`) and `calLo()` (`:173`)
are never multiplied by `scale`.** `X3F_Calibrate.html:112` proves the stored
range is absolute: `force=Math.max(0,raw-baseline)` — no `scale`, no `calLo`.

So the moment a user uses the Calibration card in the settings sheet, `force` is
in pounds and every threshold is still in bar units.

**Failure scenario.** User hangs a 25 lb weight that reads 150 raw; `scale` becomes
`25/150 = 0.167`. Their Dark Gray chest press is calibrated `lo 40, hi 370`, so
`ref() = 330`. An all-out press now produces `force = (370−40) × 0.167 = 55`.
Arena Hold's target is `330 × 0.55 = 181.5` — **unreachable at any effort**. The
Boss threshold `330 × 0.35 = 115.5` is unreachable, so the orb heals forever. The
ring never leaves zero. Max Effort logs `peak: 55`, and `X3FCal.observe` is then
called with 55 for a movement whose real ceiling is 370 — but only if it was
uncalibrated, in which case it *permanently* teaches every other game that this
movement tops out at 55. Nothing tells the user; the "Reset units" button
(`:220`) is the only escape and is not labelled as one.

---

### D-02 · S1 — a calibration at rest produces a 250 000× scale, persisted

`X3F_Arena.html:210`

```js
function calibrate(){const known=parseFloat($('calW').value);if(!known||baseline==null)return;
  const z=Math.max(0.0001,raw-baseline);scale=known/z;unit=$('calU').value;
  store.set('scale',scale);store.set('unit',unit);sessionPeak=0;closeSheet();}
```

The only guards are "a number was typed" and "we have a baseline". There is no
check that the bar is actually loaded, no countdown, no averaging window, and no
sanity band on the result.

**Failure scenario.** User opens the sheet to read the calibration instructions,
taps **Capture** before hanging the weight. `raw − baseline ≈ 0`, clamped to
`0.0001`, `scale = 25 / 0.0001 = 250000`. Written to `x3f_scale`. Every force
reading in Arena is now ~10⁷. The ring pins, `sessionPeak` is astronomical, and if
they then press **"Set from hardest pull"** (`:230`) that number is written into
`x3f_bandMax` — which is the shared fallback ceiling read by
`x3f-cal.js:74` in **all nine games**. One mis-tap poisons the whole suite.

Contrast `X3F_Calibrate.html:170–200`, which does this correctly: a 3 s countdown,
a 3 s averaged hold, a 2.5 s ready, a 4 s peak capture, and `X3FCal.save()`
refuses a range narrower than `MIN_SPAN` (`x3f-cal.js:105`).

---

### D-03 · S1 — the TV shell does not mirror `scale`, so Arena reads two different force values on two platforms

`MainActivity.java:616–621`

```js
window.__x3fDrv=setInterval(function(){ try{
  var f=+window.__x3fForce||0;
  if(typeof calLo==='function'){ var lo=+calLo()||0; f=f>lo?f-lo:0; }
  force=f;
}catch(e){} },16);
```

The comment immediately above it (`:608–615`) states the rule:

> This assignment REPLACES the browser build's onSample(), so anything that
> conditions the raw signal has to be repeated here or it silently does not
> exist on the TV.

`calLo()` was added. `* scale` was not. `HANDOFF.md:97` calls this "the rule this
keeps breaking … This is the second divergence."

**Failure scenario.** A user calibrates Arena to pounds on their phone. On the TV,
`force` is raw bar units while the HUD still prints `unit` = "lb" from
`x3f_unit` (`:242`). The same pull reads 55 on the phone and 330 on the TV, and
the TV labels the 330 as pounds.

---

### D-04 · S1 — Ascent is invisible to the TV shell *and* to the program

`X3F_Ascent.html:80` wraps everything: `else { (function(){ … })(); }` (closed at
`:278`). Therefore `force`, `calLo`, `baseline` and `startRun` are **not globals**.
The shell's bootstrap does `force=f` (`MainActivity.java:620`), which in
non-strict code creates a *new* `window.force` that Ascent's inner `force` never
reads; `typeof calLo==='function'` is false, so the movement floor is not applied
either.

Separately, `X3F_Ascent.html:282` loads only `x3tv`, the wake lock and the service
worker. There is **no `x3f-set.js` and no `x3f-progress.js`**. Ascent cannot
report a set, cannot contribute a peak, cannot advance a streak, cannot feed
`X3FCal.observe`.

**Failure scenario.** A user does a full workout in Ascent. `X3F_Progress.html`
shows zero sets, the streak breaks, the 12-week program does not advance
(`x3f-progress.js:232` derives everything from `workoutDays()`), the daily
challenge stays unmet, and no achievement moves. Ascent is a training game that
the training app cannot see.

---

### D-05 · S1 — the peak the games report is contaminated by everything since page load

`x3f-set.js:105–125` starts the watcher once and resets it **only in `report()`**.
Bloom guards this (`X3F_Bloom.html:269`: `if(window.X3FSet)X3FSet.reset();`).
Arena (`:282`), Flow (`:212`), Duel (`:195`) and Rhythm (`:184`) all call
`X3FSet.watch(...)` and **never** call `X3FSet.reset()`.

Consequences, in order of severity:

1. `report()` fills `entry.peak` from `watch.peak` when the game did not measure
   one (`x3f-set.js:140`) — true for **Flow, Duel and Rhythm**.
2. `entry.peak` is then handed to `X3FCal.observe(ex, band, peak)`
   (`x3f-set.js:146`), which for an uncalibrated movement **writes it as the
   ceiling** (`x3f-cal.js:125`).
3. `entry.tut` is likewise filled from `watch.tut` (`:141`), which counts every
   moment since page load where `force > ref()*0.15` — including setup, testing
   the bar, and the gap between attempts.

**Failure scenario.** User opens Flow for an uncalibrated Bent Row on Dark Gray.
Before starting, they yank the bar hard to check the connection: `watch.peak = 410`.
They then do a real 22-rep set, finishing exhausted at a peak of 260. The report
logs `peak: 410`; `X3FCal.observe` writes `hi: 410` for bent-row|Dark Gray. Every
game from now on divides by `410` instead of `260` — Rhythm's high note moves to
`0.72 × 410 = 295`, above their real max, so it becomes unhittable; Flow's rep
threshold moves to `230`; Duel's `hi` moves to `246`. The user's scale gets
*harder* because they tested the connection.

---

### D-06 · S2 — Arena's state machines freeze when you change tabs, then resolve wrong

`X3F_Arena.html:243`, `:250`, `:257` — every mode's logic lives inside
`if(mode==='…')`, but the timers were started in wall-clock terms.

**Failure scenario A (Hold).** Start a 30 s round, switch to the Max tab at t=5 s,
come back at t=60 s. `zTime` stopped accumulating at 5 s. On the first frame back,
`now >= zEnd` is true, so the round ends immediately and reports
`{g:'zone', tut: 5, secs: 30}` — a 55-second lie in `secs` and a set the user
never finished.

**Failure scenario B (Max).** Start Max Effort, switch tabs during the 5 s window.
`xAttempt` never updates. On return, `xPhase` flips to `done` and reports
`{g:'max', peak: 0}`. `report()` accepts it (`x3f-set.js:136` tests `!= null`, and
`0 != null`), so a 0-peak set is written to history and counts toward
`sess*`/`days*`/streak.

**Failure scenario C (Boss).** Start a fight, switch tabs for 40 s, come back and
kill it. `el = (now − bStart)/1000` (`:261`) includes the 40 s away, so the
reported `secs` and the `bBest` "Best Time" are both inflated.

---

### D-07 · S2 — the demo interval is never cleared, so Demo poisons a real connection

Every game: `if(!startDemo.l)startDemo.l=setInterval(…)` —
Arena `:205`, Flow `:132`, Duel `:119`, Rhythm `:120`, Ascent `:143`. Nothing
anywhere calls `clearInterval(startDemo.l)`. `connect()` sets `demo=false` but the
interval keeps writing to `raw` and calling `onSample()`.

**Failure scenario.** User taps **Try Demo** from the first-run card to see what
the game looks like, then opens the settings/Connect and pairs the bar. The demo
loop continues at 27 ms: `demoF = Math.max(0, demoF*0.86-4)` decays to 0 and then
`raw = 0 + noise`, so `force` collapses to 0 between BLE notifications (~37 Hz vs
the demo's 37 Hz — they interleave). The live force reading flickers violently
between the real value and near-zero, reps are double-counted or missed, and the
only fix is a page reload. Nothing in the UI suggests it.

---

### D-08 · S2 — Duel is unwinnable at the protocol's tempo, from round 1

`X3F_Duel.html:136–137`, `:147`, `:150`.

CPU drain, round 1: `aiPull() = 0.055 + 0.008 = 0.063` every
`aiPeriod() = max(820, 1900−150) = 1750 ms` → **0.036 flag/second**.

Player gain: `flag += 0.07 + 0.07*qual`, i.e. **0.07 to 0.14 per completed rep**.

Break-even rep time:

| Rep quality | Gain/rep | Max seconds per rep to break even |
| --- | --- | --- |
| `qual = 1.0` (peak at or above `ref()`) | 0.14 | **3.89 s** |
| `qual = 0.5` | 0.105 | **2.92 s** |
| `qual = 0` (peak just over `0.6×ref`) | 0.07 | **1.94 s** |

`protocol.md:231` prescribes **2–3 s up and 2–3 s down**, i.e. **4–6 s per rep**.
A user performing the movement exactly as the program prescribes loses ground on
round 1 at maximum quality, and loses the match. The only way to win is to move
faster than the protocol allows. By round 6 (`aiPeriod = 1000 ms`,
`aiPull = 0.103` → 0.103/s) break-even at perfect quality is **1.36 s per rep** —
a bounce, not a rep.

**Failure scenario.** A user follows the on-screen X3 coaching from
`X3F_Library.html:61` ("Slow & controlled, ~2–3s each way") inside Duel and loses
every match. The game teaches them that correct form is losing form.

---

### D-09 · S2 — Rhythm has no tempo setting that reaches the protocol, and it punishes maximum effort

Two independent problems in the same block.

**(a) Tempo.** `X3F_Rhythm.html:61` offers `50 / 66 / 84`; `:136` computes
`period = 60000/value` → 1200 / 909 / 714 ms **per note**. Notes alternate hi/lo
(`:144`), so one phase = one note.

| Label | ms per phase | Protocol (`protocol.md:231`) |
| --- | --- | --- |
| Slow | 1200 | 2000–3000 |
| Medium (default) | 909 | 2000–3000 |
| Fast | 714 | 2000–3000 |

To reach 2 s per phase the select would need a value of 30. **Every option is
faster than the protocol's fastest legal tempo**, and the game's own first-run
copy calls it "Controlled, musical time-under-tension" (`:68`).

**(b) An upper bound on force.** `:142`, `:145`:

```js
const R=ref(),hi=R*0.72,lo=R*0.14,tol=R*0.17;
… const good=Math.abs(force-b.level)<tol;
```

A "high note" is hit only when `force ∈ [0.55×ref, 0.89×ref]`. Pulling to 100 % of
your calibrated max **misses the note and zeroes your combo** (`:147`).

**Failure scenario.** A user is on their last few reps, grinding at 95 % of max —
exactly the part of the set `ROADMAP.md:16` calls "the entire workout". Every one
of those reps registers as a miss, the combo resets to 0, and the score stops
climbing. The game's feedback is maximally negative precisely when the training is
maximally correct.

Also note the "low note" window is `force < 0.31×ref`, which includes `force = 0`
— a fully slack band. `protocol.md:175` lists "never let the band go slack at the
bottom" as one of the two non-negotiable technique rules. Rhythm rewards
violating it, once per second, all set.

---

### D-10 · S2 — Duel's rep detector requires you to go slack

`X3F_Duel.html:140`, `:145`: `lo = R*0.2`, and a rep only completes on
`st==='up' && force < lo`. You must drop below 20 % of the movement's span to be
credited.

Combined with `hi = R*0.6`, the game's definition of a rep is "cross 60 %, then
fall below 20 %". `protocol.md:565` — "TENSION · Never slack at the bottom" —
and `X3F_Library.html:61` — "never rest at the bottom" — both say the opposite.

**Failure scenario.** A user maintaining correct constant tension bottoms out at
25 % of span. `st` never returns to `'down'`, no reps are ever counted, the flag
only drains, and they lose without a single rep registering. The gauge legend
(`:175`) tells them "pull past the line, then release = 1 rep" — the app is
instructing the user to break a safety-adjacent technique rule.

---

### D-11 · S2 — changing the band mid-run desyncs cached thresholds

`X3F_Arena.html:236` computes `bMax = ref()*(14+(bStage-1)*7)` **once**, at fight
start. `:258` recomputes `thr = ref()*0.35` **every frame**. The band `<select>`
(`:228`) changes `band` live, and `ref()` follows it.

**Failure scenario.** User starts a boss fight on White (`ref()` ≈ 130 →
`bMax = 1820`), realises they are on the wrong band, and switches the dropdown to
Black (`ref()` ≈ 430). `thr` jumps to 150.5 but `bMax` is still 1820, so the HP
bar (`:264`, `bHP/bMax`) is now scaled to a boss that is 3.3× too easy — the fight
ends in seconds and reports a bogus `secs` and a stage advance. Duel has the mirror
problem: `flag` is band-relative but never reset on a band change (`:94`).

---

### D-12 · S2 — Flow, Rhythm and Duel log a set when nothing happened

- Flow `:148`: `$('startBtn').onclick=()=>{ if(running){endSet(false);return;} …}` and
  `endSet` (`:151–155`) always reports.
- Rhythm `:137`: `if(running){stop();return;}` and `stop()` (`:139`) always reports.
- Duel `:153`: on a loss, `X3FSet.report({g:'duel',score:duelRounds})` runs
  unconditionally, even when `duelRounds === 0`.

**Failure scenario.** User taps **Start Set** in Flow, realises the bar is not
connected, taps **Stop Set**. `X3FSet.report({g:'flow', reps:0, acc:0})` writes an
entry to `x3f_history`. That entry:

- makes today a training day (`x3f-progress.js:183` `workoutDays()` counts any set),
- extends the streak (`:191`),
- advances the 12-week program's `doneCount`, which flips `nextType` between Push
  and Pull (`:244`) — **so a mis-tap swaps tomorrow's workout**,
- increments `sessions` toward `sess1/10/25/50/100/200` badges (`:510`),
- and pops a "Set logged · first set of this movement" toast (`x3f-set.js:168`).

There is no rep-count or duration floor anywhere in `report()`. `ROADMAP.md:135`
already flags a milder version of this for Splash/Nova ("Score games log per
run"); the Start/Stop path here is worse because it needs no gameplay at all.

---

### D-13 · S2 — Arena Boss only reports when you *win*, and the fight becomes unwinnable

`X3F_Arena.html:262` — the report is inside `if(bHP<=0){…}`. There is **no lose
condition anywhere in the boss mode**; if you stop pulling, the orb heals at
`bMax*0.04*dt` (4 %/s, `:260`) and the fight runs forever.

`bStage` escalates permanently: `bStageSaved = bStage+1` on every win (`:262`),
persisted to `x3f_bStage`, and `bMax = ref()*(14+(bStage−1)*7)` (`:236`).

Time to kill, holding at 100 % of `ref()` continuously
(`damage rate = (1 − 0.35) × 1.4 × ref = 0.91 × ref` per second):

| Stage | `bMax / ref()` | Seconds of unbroken maximal isometric |
| --- | --- | --- |
| 1 | 14 | 15.4 |
| 2 | 21 | 23.1 |
| 3 | 28 | 30.8 |
| 5 | 42 | 46.2 |
| 8 | 63 | 69.2 |

**Failure scenario.** A user wins four fights over a week and is now on stage 5. A
stage-5 kill requires 46 seconds at 100 % of their all-out max with no drop below
35 % — physiologically impossible. Every subsequent attempt ends in genuine
muscular failure and **reports nothing**, because the report is gated on the kill.
The only feedback is the "Best Time" chip (`:264`), which is frozen at the stage-1
time forever because `bBest` compares kill times **across different stages**
(`:262`: `if(bBest===0||el<bBest)`). The mode is permanently broken with no reset
except the "Reset personal bests" button buried in the settings sheet (`:221`).

---

### D-14 · S2 — two writers to `x3f_history` with different retention rules

Each game defines its own `logSession()` — Arena `:174`, Flow `:101`, Duel `:77`,
Rhythm `:78`:

```js
function logSession(o){try{const h=JSON.parse(localStorage.getItem('x3f_history')||'[]');
  h.push(Object.assign({t:Date.now(),b:band},o));
  while(h.length>250)h.shift();
  localStorage.setItem('x3f_history',JSON.stringify(h))}catch(e){}}
```

`while(h.length>250)h.shift()` **destroys history**. `x3f-progress.js:72` sets
`KEEP_DAYS = 56, SOFT_CAP = 700` and rolls older entries up rather than dropping
them, precisely so "a 12-week cycle at five lifts a day cannot push real history
off the front any more" (`ROADMAP.md:75`).

These are reached via `(window.X3FSet ? X3FSet.report(…) : logSession(…))` —
Arena `:252`, `:262`; Rhythm `:139`; Flow `:154`. `x3f-set.js` is loaded by a
plain `<script src>` in all four, so today the fallback never fires. But a
service-worker cache miss, a CSP change, or a syntax error in `x3f-set.js` makes
it fire, and the first such report **truncates the user's history to 250 entries,
permanently.** Duel's copy (`:77`) is never called at all — pure dead code that
references `band` before its `let` at `:80`.

`ROADMAP.md:137` already lists this as item 3. It is more dangerous than "dead
code": it is an armed data-loss path.

---

### D-15 · S2 — on Android TV the status pill in all four bundled games permanently reads "Offline"

`MainActivity.java:419–421` pushes connection state as
`window.__x3fSetBar('on','Bar: LIVE')` and battery as `window.__x3fSetBattery(mv)`.
Both functions are defined only in the launcher (`index.html` /
`app/.../launcher.html`). Grep confirms neither name appears in Arena, Flow, Duel
or Rhythm.

The games' own pill is driven exclusively by `setStatus()` inside `connect()` /
`onSample()` (Arena `:194`/`:198`, Flow `:109`/`:126`, Duel `:98`/`:114`, Rhythm
`:99`/`:115`) — and on TV **`onSample()` is never called**, because
`MainActivity.java:620` assigns `force` directly.

**Failure scenario.** On the Hisense, the bar is connected and streaming, the game
is responding to every pull, and the pill in the corner says **"Offline"** with a
red dot (`:21` `.dot{background:var(--hot)}`) for the entire session. The one
piece of state a user checks when something feels wrong is a permanent lie.

---

### D-16 · S2 — Re-Zero on Android TV leaves the status stuck on "Zeroing — hold still" forever

`MainActivity.java:624` intercepts `#zeroBtn`:

```js
var z=document.getElementById('zeroBtn');
if(z){ z.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation();
  try{ if(window.X3F&&X3F.reZero)X3F.reZero(); }catch(e){} },true); }
```

`stopPropagation()` does **not** stop other listeners on the same element, and the
page's own `.onclick` was registered first (Arena `:219`, Flow `:138`, Duel `:123`,
Rhythm `:124`), so it still runs:

```js
$('zeroBtn').onclick=()=>{if(demo){baseline=0}else startTare()};
```

`startTare()` sets `taring=true` and `setStatus('Zeroing - hold still','wait')`.
The only code that clears `taring` is inside `onSample()`, which the TV never
calls.

**Failure scenario.** On the TV, the user presses Re-Zero. The native zero works
(`MainActivity.java:427` `haveBaseline=false`), but the pill switches to
"Zeroing — hold still" with a pulsing gold dot **and stays there for the rest of
the session.** `stopImmediatePropagation()` would have been the correct call.

---

### D-17 · S3 — the "TV" button is visible and inert inside the TV shell

`MainActivity.java:590` hides it: `.tvbtn{display:none!important}`, with a comment
explaining that in the shell the WebView is already fullscreen and landscape-locked,
so the button "does nothing at all — a button that lies."

The class only exists in Bloom, Nova and Splash (`X3F_Bloom.html:29,:61` and
siblings). Arena `:89`, Flow `:49`, Duel `:45`, Rhythm `:45` and Ascent `:60` all
use an **inline-styled button with no class**:

```html
<button onclick="x3tv()" aria-label="TV mode" style="…">TV</button>
```

**Failure scenario.** On the Hisense, four of the six bundled games show a "TV"
button in the top bar. The D-pad can focus it (`items()` selects `button`,
`MainActivity.java:640`), pressing it calls `requestFullscreen` on an already
fullscreen WebView and `screen.orientation.lock` on a locked activity, and
nothing happens. The user presses it repeatedly, then concludes the app is broken.

---

### D-18 · S3 — the Routines game picker offers Ascent, which does not exist in the TV bundle

`X3F_Routine.html:232`:

```js
const GAMEKEYS=['bloom','splash','nova','flow','zone','max','boss','duel','rhythm','ascent'];
```

`tools/sync-from-web.py:84–86` maps `ascent:'ascent.html'`, but the file map at
`:37–50` never copies `X3F_Ascent.html`, and `app/src/main/assets/` contains no
`ascent.html`.

**Failure scenario.** On the TV, a user assigns Ascent to Deadlift in Routines.
`launchUrl()` (`X3F_Routine.html:268`) produces `ascent.html?...`, and pressing
"Play in Ascent →" navigates the WebView to a file that does not exist — a blank
or error page with no way back except the remote's BACK. The setting is persisted
in `x3f_routine2`, so it happens again every session.

Even in the web build the offer is misleading: `sw.js:2` caches
`X3F_Ascent.html` but not `https://cdnjs.cloudflare.com/.../three.min.js`, so
offline the page loads and shows only
`X3F_Ascent.html:74` — "Couldn't load the 3D engine".

---

### D-19 · S3 — `X3FSet.report()` runs inside the animation frame

Arena `:247`, `:252`, `:262` all call `report()` from inside `tick()`. Rhythm's
`stop()` and Duel's loss branch are effectively the same.

`report()` → `X3FProg.logSet()` (walks + rewrites the whole log, `x3f-progress.js:52`)
→ `compact()` over up to 700 entries (`:76`) → `checkAchievements()` (`:576`) →
`stats()` (`:398`, two full passes over every set) → `catalogue()` (`:458`, which
rebuilds ~130 closure objects **and iterates `X3FEX.list` and `BANDS` to do it**)
→ 130 predicate evaluations → a `localStorage` write. `stats()` also calls
`streak()` (up to 400 iterations) and `program()`.

**Failure scenario.** On the Hisense TV SoC, the frame in which a Hold round ends
does all of the above synchronously. The user sees a visible hitch at exactly the
moment they are looking for their result. It gets worse the longer they use the
app, because `catalogue()` grows with `moves.length` and `stats()` grows with
history length.

---

### D-20 · S3 — Arena's "Avg" and "Work" chips accumulate for the lifetime of the page

`X3F_Arena.html:157`, `:239`:

```js
let sessionPeak=0,activeSum=0,activeCount=0,totalWork=0,lastT=performance.now();
…
if(force>2){activeSum+=force;activeCount++;totalWork+=force*dt}
```

Nothing resets these. They are not per-set, per-mode or per-attempt.
`sessionPeak` is reset only on a band change (`:228`) and on `calibrate()` (`:210`).

The literal `2` is also a raw-unit constant. With `scale` set to pounds
(D-01) it becomes "2 lb", so almost every frame counts; on an Elite Black band it
is 0.3 % of span, so noise counts.

**Failure scenario.** A user leaves Arena open on the Meter tab through a whole
workout. "Avg" is the mean of every frame since load — including the boss fight
and the max-effort attempt — and "Work" is a monotonically increasing number with
no unit and no meaning. Neither is ever reported anywhere, so the user cannot
even check them later.

---

### D-21 · S3 — Arena's Hold round button restarts the round mid-round

`X3F_Arena.html:232`: `$('zStart').onclick=()=>{zRun=true;zTime=0;zEnd=performance.now()+30000};`

`:247` repurposes the same element as a countdown display:
`$('zStart').textContent = Math.max(0,(zEnd-now)/1000).toFixed(1)+'s left';`

**Failure scenario.** The control now reads "12.4s left" and looks like a timer,
but it is still a `<button>` with a live handler. A user taps it to see if it
does anything (or the D-pad's OK lands on it — it is the only focusable element in
the view), and 12 seconds of hold work is silently discarded and restarted.

---

### D-22 · S3 — Rhythm's metronome click fires 2.1 seconds before the beat it marks

`X3F_Rhythm.html:144`:

```js
while(nextBeat<now+TRAVEL){beats.push({…});idx++;nextBeat+=period;beep(idx%2?880:880,0.03)}
```

`beep()` is called at **spawn** time, and `TRAVEL = 2100` (`:133`). The audible
click therefore leads the visual hit line by 2.1 s — 2.3 beats at the Medium
tempo. There is no beep at the moment of judgement.

Two further bugs in that one line: `idx%2?880:880` yields 880 in both branches
(the hi/lo pitch distinction was intended and lost), and `idx++` runs *before* the
ternary, so even had the values differed the parity would be inverted relative to
the note that was just pushed.

**Failure scenario.** A user plays with the sound on — which the first-run copy
encourages ("Reps on the beat", `:68`) — and tries to pull on the click. They are
consistently 2.1 s early, miss every note, and the combo never leaves 0.

---

### D-23 · S3 — Rhythm judges every missed beat at once after a tab switch

`:145` judges on `!b.judged && now >= b.time`, and `:149` prunes with
`beats.filter(b=>b.time>now-600)`. When `requestAnimationFrame` is throttled
(background tab, TV overlay, screensaver), no frames run; on resume, one frame
evaluates every pending beat against the single current `force` value.

**Failure scenario.** The TV shows a system notification for four seconds. On
resume, ~5 beats are all judged in the same frame against whatever the user
happens to be doing — usually a wipeout, occasionally a free run of hits that
inflates `score` and `bestCombo` (written straight to `x3f_rhythmBest`, `:146`).

---

### D-24 · S3 — `dt` clamped to 50 ms makes Arena's Hold timer and Boss damage frame-rate dependent

`X3F_Arena.html:238`: `const dt=Math.min(0.05,(now-lastT)/1000);`

Below 20 fps, real elapsed time exceeds the clamp and is discarded. `zTime += dt`
(`:247`) and `bHP -= (force-thr)*dt*1.4` (`:260`) both undercount.

**Failure scenario.** On a TV running at 15 fps (real `dt` = 0.0667, clamped to
0.05), a user holds perfectly for the full 30 s wall-clock round. `zTime`
accumulates only ~22.5 s, the "In Zone" chip under-reports by 25 %, and the
reported `tut` is 22 while `secs` is hard-coded to 30 (`:247`). The same
distortion makes boss fights ~33 % longer on a slow device.

---

### D-25 · S3 — Flow's ribbon snaps at set start

`X3F_Flow.html:169`: `const tNow=running?now-setStart:now;`

While idle, `tNow` is `performance.now()` — seconds-to-minutes since page load.
On pressing Start it becomes `0`.

**Failure scenario.** The ribbon has been scrolling smoothly on the idle screen at
some arbitrary phase. The user presses Start and the entire curve teleports to a
new phase in one frame, mid-motion, exactly when they are trying to synchronise
with it. Rhythm avoids this by only spawning notes when `running` (`:143`).

---

### D-26 · S3 — Flow's `acc` is measured, displayed, passed, and thrown away

`X3F_Flow.html:153` sends `acc`; `x3f-set.js:135` does not list `acc` among the
copied fields; `x3f-progress.js:56` *does* list it. So the one metric Flow uniquely
measures never reaches the log, and the fallback path (`X3F_Flow.html:154`,
`logSession`) *would* have stored it — the two paths disagree about the schema.

---

### D-27 · S3 — Ascent starts a run on any click anywhere, including the Connect button

`X3F_Ascent.html:146–149`:

```js
addEventListener('keydown',e=>{if(e.code==='Space'){pull=true;e.preventDefault(); if(readyToStart)startRun();}});
addEventListener('pointerdown',()=>{pull=true; if(readyToStart)startRun();});
```

The listener is on `window`, not on the canvas.

**Failure scenario.** User presses Demo (`armReady()` runs, `readyToStart=true`),
then reaches for the band `<select>` to switch from White to Black. The
`pointerdown` on the select **starts the run**, the "READY" overlay disappears, and
the ship begins falling while the dropdown is still open. Same for the Connect
button, the TV button and the back arrow.

---

### D-28 · S3 — Ascent's only failure state is releasing the bar completely

`X3F_Ascent.html:252`: the run ends only when
`shipY <= -YCLAMP+0.2 && norm < 0.05` holds for 1.6 s — i.e. pinned to the floor
*and* producing under 5 % of your span.

**Failure scenario.** A user reaches genuine muscular failure but keeps hold of the
bar under tension (which `protocol.md:503` requires: "Never let go of the bar while
there is tension in the band"). `norm` sits at 0.1–0.2, the ship stays pinned, and
the run never ends. There is no Stop button and no `endRun()` trigger. The only way
out is to release the band under tension — the exact action the safety rules
prohibit — or to navigate away, which discards the run.

---

### D-29 · S3 — Ascent re-uploads a 1400-point buffer to the GPU every frame

`X3F_Ascent.html:264–266`:

```js
const pos=stars.geometry.attributes.position.array;
for(let i=0;i<N;i++){ pos[i*3+2]-=sc; if(pos[i*3+2]<-25){pos[i*3+2]+=270;} }
stars.geometry.attributes.position.needsUpdate=true;
```

1400 iterations of CPU work plus a full `bufferSubData` of 16.8 KB per frame, for
a parallax effect that a vertex shader with a single uniform, or simply translating
the `Points` object, would produce for free. Combined with `antialias:true` and
`pixelRatio` up to 2 (`:155–156`), two `GridHelper(400,40)` and 10 always-resident
torus meshes, this is the most expensive frame in the repo — on the one game that
also happens to be the only one loading a 600 KB library over the network.

---

### D-30 · S3 — Space is `preventDefault`ed unconditionally, breaking keyboard activation

Arena `:208`, Flow `:135`, Duel `:121`, Rhythm `:122`, Ascent `:146`:

```js
addEventListener('keydown',e=>{if(e.code==='Space'){pull=true;e.preventDefault()}});
```

No check for `demo`, and no check for the focused element.

**Failure scenario.** A user on a desktop or with a Bluetooth keyboard tabs to
"Start Set" and presses Space. `preventDefault()` swallows it and the button never
fires. The behaviour is silent and looks like a dead button. (Enter still works,
and the TV shell uses `.click()` directly, so this only bites keyboard users.)

---

### D-31 · S3 — Arena's demo pull fires when you press the mode buttons

`X3F_Arena.html:206`: `$('stage').addEventListener('pointerdown',()=>{if(demo)pull=true});`

`#stage` contains all four `.view`s, and every mode's start button lives inside one
(`:105`, `:110`, `:115`).

**Failure scenario.** In demo mode, tapping **Start Max Effort** also begins a
pull. Since `xPhase` goes to `count` for 3 s and the demo force decays at
`demoF*0.86-4` per 27 ms, this mostly self-corrects — but the ring jumps on every
button press, which reads as a bug to the user.

---

### D-32 · S3 — `?from=` and `?bpm=` are a broken contract

`x3f-exercises.js:137` always appends `from=lib` or `from=routine`. **No game
parses it** — Arena `:227`, Flow `:147`, Duel `:95`, Rhythm `:96`, Ascent `:106`
read only `band`, `mode`, `tempo`, `bpm`. Conversely Rhythm parses `?bpm=`
(`:96`) which `gameUrl()` never emits, so it is unreachable from any menu.

Additionally, `X3F_Rhythm.html:96` sets `$('bpmSel').value=bp` but never sets
`period`; only `startBtn` re-reads it (`:138`), so the state is consistent only by
accident. And `X3F_Flow.html:147` sets `period=+tp` without validating `tp` — a
hand-edited `?tempo=abc` yields `period = NaN`, which makes `targetAt()` return
`NaN`, `mapY(NaN)` → `NaN`, and the ribbon silently vanishes.

---

### D-33 · S3 — the games depend on Google Fonts that the service worker cannot cache

Arena `:9–10`, Flow `:10–11`, Duel `:8–9`, Rhythm `:8–9` load Sora + Space Grotesk
from `fonts.googleapis.com`. `sw.js:5` explicitly refuses cross-origin requests:

```js
const u=new URL(e.request.url); if(e.request.method!=='GET'||u.origin!==location.origin)return;
```

`ROADMAP.md:229` states "Everything must survive being offline". The games survive,
but with a different typeface and different metrics — `Sora` and `Space Grotesk`
are both wider than the `system-ui` fallbacks, so the `.chip` widths, the `.huge`
clamp and Arena's `.status` pill all reflow. Ascent is the only one that is
honestly offline-typed, because it loads no webfont at all.

Related: Flow, Duel and Rhythm request `Sora:wght@600;800` and then style `.cta`
at `font-weight:700` (`X3F_Flow.html:35`, `X3F_Duel.html:32`,
`X3F_Rhythm.html:32`) — a weight that was never fetched.

---

### D-34 · S3 — the HUD chip row overlaps the play area under the TV's 10-foot CSS

`MainActivity.java:596–598` injects, at `min-width:1200px`:

```css
.chip .v{font-size:30px!important}.chip .k{font-size:13px!important;letter-spacing:2px!important}
.chip{padding:10px 16px!important;border-radius:18px!important}
```

That takes a `.chip` from ~48 px tall to ~75 px. `.hud` is `position:absolute;
top:10px` (`X3F_Flow.html:27`), so it now occupies `10…85 px`. Flow's playfield
top is `const top=54` (`:160`) and Rhythm's is `top=58` (`:135`).

**Failure scenario.** On a 55" TV, the peak of Flow's ribbon and Rhythm's entire
"high note" lane are drawn underneath four opaque `.chip`s
(`background:rgba(10,14,22,.66)` + `backdrop-filter:blur(6px)`). The part of the
screen the user must watch to hit the top of the rep is covered by the score
readout. Flow has **four** chips (`:58–61`), so on a narrow viewport they also
`flex-wrap` (`:27`) into two rows and cover twice as much.

Ascent is the reverse problem: its HUD uses `.card`/`.val`/`.lbl`
(`X3F_Ascent.html:53–56`), none of which the shell's 10-foot CSS matches, so it
would stay phone-sized — if it were ever bundled.

---

### D-35 · S3 — dead and unreachable code

| Location | What |
| --- | --- |
| `X3F_Duel.html:77` | `logSession()` — never called from anywhere, and closes over `band` which is `let`-declared three lines later |
| `X3F_Duel.html:131` | `reason` — assigned `'lose'` at `:151`, read by nothing |
| `X3F_Flow.html:145`, `:183`, `:189` | `repHit` / `repFrames` — incremented every frame, read by nothing |
| `X3F_Flow.html:180` | `// trail of recent force to the left` — a comment for a feature that does not exist |
| `X3F_Arena.html:174` | `logSession()` — reachable only if `x3f-set.js` fails to load (see D-14) |
| `X3F_Rhythm.html:78` | same |
| `X3F_Ascent.html:87` | `let … peak` — written at `:137`, read by nothing |
| `X3F_Ascent.html:231` | `$('fhover').style.bottom = (GRAV/THR)/1.6*100+'%'` — a compile-time constant (24.1 %) recomputed and written every frame |
| `X3F_Ascent.html:257` | `flame.rotation.x=Math.PI` — already set once at `:185`, re-set every frame |
| `X3F_Duel.html:80`, `X3F_Rhythm.html:81` | `bandMax` — only ever read through `ref()`'s fallback branch |

---

### D-36 · S3 — accessibility

- `maximum-scale=1` on the viewport (Arena `:6`, Flow `:7`, Duel `:5`, Rhythm `:5`)
  blocks pinch-zoom outright.
- `user-select:none` on `body` in all four (Arena `:15`, Flow `:16`, Duel `:14`,
  Rhythm `:14`) — no readout can be selected or copied.
- All game state lives in `<canvas>` (Flow/Duel/Rhythm) or in unlabelled `<div>`s
  with no `aria-live` (all five), so a screen reader gets nothing during play.
- Hit/miss is signalled by colour alone: Flow `:178`
  (`ctx.fillStyle=onT?'#2ff0b0':'#ff5d78'`), Rhythm `:161`, Duel `:173`, Ascent
  `:246–247`.
- `.chip .k` is 10 px (Flow `:29`, Duel `:26`, Rhythm `:26`) — below the 11 px
  floor most guidance uses, and only fixed on TV.
- Only the back button and the TV button carry `aria-label`; `#bandSel`,
  `#tempoSel`, `#bpmSel`, `#zeroBtn`, `#startBtn` and Arena's `#gearBtn` rely on a
  `title` attribute or nothing.

---

# 3. Design weaknesses and opportunities, ranked

**W-1 — Four of the seven modes reward the opposite of the method.**
Rhythm caps force at `0.89×ref` (D-09), Duel requires sub-4-second reps and a
slack bottom (D-08, D-10), Arena Hold caps at `1.25 × 0.55 = 0.69×ref` (`:244`),
Ascent rewards a 38.6 % isometric held as long as possible (`:231`, `:237`).
`ROADMAP.md:16` — "the last five reps are the entire workout" — is not
representable in any of them. The single highest-value change in this whole audit
is: **make every game's reward function monotonically increasing in force, and
give every game a diminishing-range phase.** Bloom already proves it can be done
in ~25 lines (`X3F_Bloom.html:443–463`).

**W-2 — Nothing here can produce `part`, `full` or `ecc`.**
The three fields that describe an X3 set are produced by exactly one game. The
challenge generator has a "Live in the burnout" branch (`x3f-progress.js:330–337`)
and a "Slow negative" branch (`:338–345`) that can only ever fire off Bloom data.
Four achievement families are unreachable. Lift Bloom's diminishing-range
accounting (`curHi` decay, `fullReps` vs `burnoutReps`, `eccStart`/`eccSum`) into a
shared `x3f-rep.js` and have Flow, Duel and Rhythm consume it.

**W-3 — Two games are invisible to the program.**
Arena's Meter tab is the *default view* of the *only game linked three times from
the Library*, and it never reports. Ascent never reports at all (D-04). A user can
train for twenty minutes and have the app conclude they skipped the day.

**W-4 — Five copies of the BLE/tare/demo/band stack.**
§1.1 lists ~70 duplicated lines across five files (nine across the suite). Every
one of D-07, D-15, D-16, D-30 and D-33 is a bug that exists five times because the
code exists five times. Extract `x3f-bar.js` exposing
`{connect, demo, reZero, onSample, force, band, ref, calLo, status}` — but see
INV-1: the extraction must keep `force`, `calLo` and `baseline` as page globals.

**W-5 — Local "best" values that no other page can see.**
`x3f_flowBest`, `x3f_duelBest`, `x3f_rhythmBest`, `x3f_zBest`, `x3f_xPB`,
`x3f_bBest`, `ascent_best` are seven private high-score registers, while
`x3f-progress.js:148` already computes real PBs per movement *and* band from the
log. Every one of these should be replaced by a `X3FProg.pb()` lookup, so the
number on screen is the number the dashboard shows.

**W-6 — No game shows the two numbers the protocol needs.**
Not one of the five displays *elapsed set time* or *reps against the 15–40 window*
(`protocol.md:199–201`). Flow shows a rep count with no target; Arena shows a
30-second countdown that has nothing to do with a set. The band-progression
advice in `x3f-progress.js:588–602` fires at 40 reps — a threshold no user can
see while training.

**W-7 — Tempo labels lie in both games that have them.**
Flow's "Controlled 4s" is 2 s per phase; "Standard 3s" (the default, and the value
the Library hard-codes at `X3F_Library.html:88`) is 1.5 s per phase — below the
protocol's minimum. Rhythm's options are 1.2 / 0.909 / 0.714 s per phase. Relabel
to seconds *per phase*, and make the protocol range (2–3 s) the only default.

**W-8 — Reporting has no floor and no debounce.**
D-12 lets a Start/Stop mis-tap advance the twelve-week program. `ROADMAP.md:135`
proposes a debounce for score games; the correct fix is broader: `X3FSet.report()`
should reject entries with no `reps`, no meaningful `tut` and no `peak`, and games
should not report a set the user abandoned.

**W-9 — Ascent is a different product.**
No design tokens, no shared fonts, a different green and a different red (§1.6),
a different storage namespace (`ascent_`), a CDN dependency, an IIFE that hides it
from the TV shell, no re-zero, no music, no set report, and it is not in the TV
bundle. It is either worth bringing fully into the system or worth deleting; its
current state costs maintenance and pays nothing.

**W-10 — Arena is four games in one file, sharing one `tick()` and one `ref()`.**
The mode gating in `:243`/`:250`/`:257` is the direct cause of D-06, and the
Library presents Hold / Max / Boss as three separate products
(`x3f-exercises.js:115–117`). Splitting them, or giving each a real state machine
that runs regardless of the visible tab, removes a whole class of bug.

**W-11 — The frame budget is spent on the wrong things.**
Flow strokes a 138–321 point path twice per frame, once at 60 px width with round
caps (`:171–172`); Duel allocates a gradient and repaints the full canvas every
frame (`:159–160`); Rhythm allocates an array every frame (`:149`); Ascent
re-uploads 16.8 KB of star positions (`:264–266`). Meanwhile the thing that
actually stalls — `X3FSet.report()` in the rAF (D-19) — is never deferred.
`ROADMAP.md:172` already flags "three animation loops on a TV SoC"; on these
pages it is four (game rAF, the 40 ms watcher, the 120 ms music pump, the shell's
16 ms force driver) plus the shell's 350 ms nav poll.

**W-12 — Only Flow has a test.**
`tools/func-test/cases.js:283–304` covers Flow. Arena, Duel, Rhythm and Ascent
have zero functional assertions; `tools/func-test/run.py:32` lists
`SCREENS = ["launcher","routine","library","progress","bloom","flow","splash","bloomtv"]`.
Every defect above in Arena/Duel/Rhythm/Ascent could regress silently. Ascent
cannot be tested at all in its current shape because its IIFE exposes nothing.

**W-13 — Colour-only feedback and no haptic/audio fallback on TV.**
Flow's marker, Rhythm's notes and Duel's gauge all encode hit/miss purely in hue,
and `navigator.vibrate` (Flow `:105`, Duel `:147`, Rhythm `:146`) does not exist on
a TV. On a 55" panel three metres away the 22 px marker's colour is the only
feedback there is.

**W-14 — Six unexplained magic constants per game.**
`0.55`/`0.82`/`1.25`/`0.35`/`14`/`7` (Arena), `0.12`/`0.78`/`0.72`/`0.14`/`2`
(Flow), `0.6`/`0.2`/`0.07`/`0.055`/`0.008`/`150` (Duel), `0.72`/`0.14`/`0.17`/`2100`
(Rhythm), `17`/`44`/`19`/`4.2`/`1.6` (Ascent). None is named, none is documented,
and several are load-bearing on the protocol (§2). A shared, commented
`TUNING` object per game would make the next tuning pass reviewable.

---

# 4. Invariants a refactor MUST NOT break

**INV-1 · `force`, `baseline` and `calLo` must remain page globals.**
`MainActivity.java:617–621` does `var f=+window.__x3fForce||0; if(typeof calLo==='function'){…} force=f;`
and `:582` does `try{ baseline=0; }catch(e){}`. Moving the game script into a
module, an IIFE or a class breaks the entire Android TV build silently — no error,
just a permanently zero force. **Ascent already violates this** (D-04), which is
part of why it is not bundled. Evidence: `MainActivity.java:608–615` carries a
five-line comment explaining that this has already broken twice.

**INV-2 · Any conditioning applied to the raw signal must be duplicated in `MainActivity.BOOTSTRAP`.**
`MainActivity.java:608–615` and `HANDOFF.md:97` both state this rule. It is
currently satisfied for `calLo()` and violated for Arena's `scale` (D-03).
`tools/func-test/cases.js:174–204` (`bloomtv`) is the regression test, and it
extracts the **live** bootstrap from the Java file rather than keeping a copy
(`HANDOFF.md:159`) — so the test cannot drift, and a refactor that changes the
conditioning must update the Java or fail.

**INV-3 · `window.__x3fBand()` must keep returning the band the run is actually using.**
Arena `:167`, Flow `:90`, Duel `:84`, Rhythm `:85`, Ascent `:102`. `x3f-set.js:48–54`
prefers it over `localStorage`, and the comment at `:44–47` explains why: a guided
Routine can override the band for one run only, and the set must be logged against
the band that was pulled. Removing the hook silently mis-attributes every PB.

**INV-4 · `?band=` must not write `x3f_band`; the band `<select>` must.**
Arena `:227` / `:228`, Flow `:147` / `:100`, Duel `:95` / `:94`, Rhythm `:96` / `:95`,
Ascent `:106` / `:105`. `HANDOFF.md:111` records this being fixed. Reverting it means
launching one lift from the Library on a different band permanently changes the
user's global band.

**INV-5 · `force` must be floored by `calLo()` and scaled by `X3FCal.span()`, never by the band ceiling.**
`x3f-cal.js:1–35` documents why at length; `tools/func-test/cases.js:186–200`
asserts it numerically for the TV path:

```js
X3FCal.save('overhead-press', 'White', 52, 78);
ok('the scale is the calibrated span', ref() === 26, String(ref()));
window.__x3fForce = 52;
ok('resting at the start reads ZERO on the TV path', force === 0, 'force=' + force);
```

An overhead press starts at chin height with the band already loaded; without the
floor, the user is pinned at the top of the screen before doing anything.

**INV-6 · `X3FCal.observe()` may only be fed an absolute, unfloored-movement peak.**
`x3f-cal.js:111–119` spells out the conditional soundness: it is safe to hand it
the game's floored force *only because* a movement auto-learns while `lo` is still
0, and `:123` returns early once `auto` is false. Any change that lets a
calibrated movement auto-learn, or that scales the peak (Arena's `scale`), breaks
the invariant and corrupts the divisor for every other game.

**INV-7 · Exactly one history entry per set.**
`tools/func-test/cases.js:265–267`:

```js
ok('exactly one history entry per set', P.sets().length === before + 1,
   'added ' + (P.sets().length - before));
```

`ROADMAP.md:56` records the original bug ("Bloom wrote two history entries per
set, inflating every total"). The `(window.X3FSet ? report : logSession)` ternaries
must never become an `&&`, and `logSession` must never be called alongside a
report.

**INV-8 · `X3FSet.report()` must keep resolving `ex` from `?ex=` and must keep calling `X3FCal.observe`, `X3FProg.logSet` and `checkAchievements` in that order.**
`x3f-set.js:132`, `:146`, `:154`, `:156`. `X3FProg.logSet` is what makes the day
count, the streak, the program week, the PB table and the challenge check all
work; `checkAchievements` must run *after* the log write or the newly-logged set
is not visible to the predicates.

**INV-9 · `X3FProg.logSet` must keep writing both `band` and `b`.**
`x3f-progress.js:60`: `if (o.band) e.b = o.band; // keep the old field name too`,
and `bandOf(e)` (`:145`) reads `e.band || e.b`. Historical entries written by the
games' `logSession` only ever had `b` (`X3F_Flow.html:101`). Dropping either field
silently orphans older sets from the PB table.

**INV-10 · `x3f_history` must only ever be trimmed by `X3FProg.compact()`.**
`x3f-progress.js:72–100` (`KEEP_DAYS=56`, `SOFT_CAP=700`, rollups preserve maxima
and `n`). The `while(h.length>250)h.shift()` in every game's `logSession` is the
counter-example and must be deleted, not merely left unreachable (D-14).

**INV-11 · The five element ids and class names the TV shell reaches for.**
- `#firstrun` — force-hidden at `MainActivity.java:622`.
- `#zeroBtn` — click intercepted at `:624`.
- `.tvbtn` — hidden at `:590` (currently unused by these five, D-17).
- `.app`, `.chip .v`, `.chip .k`, `.chip`, `.status`, `.mini`, `select`, `.cta`,
  `.brand`, `.toast`, `.huge`, `.eyebrow`, `.card h1`, `.card p`, `.card .tag` —
  the entire 10-foot type pass at `:588–604` keys off these selectors. Renaming
  any of them in a visual overhaul makes the games unreadable across a room with
  no error anywhere.
- `.x3f-focus` — the D-pad focus ring class (`:586`).

**INV-12 · Hidden-but-laid-out panels must stay detectable by the shell's `vis()`.**
`MainActivity.java:632–644` walks **ancestors** checking `visibility`, `display`,
`opacity < 0.05` and `pointerEvents === 'none'`. `HANDOFF.md:163` records the bug
this fixed: Arena let the D-pad focus "Fight" and "Start Max Effort" on *inactive*
mode tabs, because `.view` hides with `opacity:0;pointer-events:none`
(`X3F_Arena.html:28–29`) while keeping its layout box. Any new hiding technique
(e.g. `visibility:hidden` on a child, `clip-path`, moving off-screen with
`transform`) must still trip one of those four checks, or the remote will press
invisible buttons.

**INV-13 · Flow's `reps`, `endSet` and `#startBtn` must stay reachable from global scope.**
`tools/func-test/cases.js:288–292`:

```js
click('startBtn');
try { reps = 17; } catch (e) {}
try { endSet ? endSet(true) : stop(); } catch (e) { … }
```

and it then asserts `last.g === 'flow'` and `(+last.peak||0) > 0`. The same suite
pokes `reps`, `burnoutReps`, `fullReps`, `setPeak`, `endSet`, `band`, `EXSLUG`,
`ref()` and `force` in Bloom (`:252–260`). Wrapping any of these in a scope breaks
the only executable spec the games have.

**INV-14 · `x3f-progress.js` must load before `x3f-set.js`.**
Arena `:272–273`, Flow `:202–203`, Duel `:185–186`, Rhythm `:174–175`.
`x3f-set.js:129` reads `window.X3FProg` at call time so the order is not strictly
required today, but `:148` silently returns `{logged:false}` when it is missing —
a reordering or a lazy load would make every set vanish with no error.

**INV-15 · `x3f-cal.js` must load in `<head>`, before the inline game script.**
Arena `:82`, Flow `:43`, Duel `:39`, Rhythm `:39`, Ascent `:47`. The inline script
evaluates `const EXSLUG = window.X3FCal ? X3FCal.slug() : null` at parse time
(Arena `:164` etc.). Deferring or module-ifying `x3f-cal.js` makes `EXSLUG` null
in every game, which silently drops the movement from every set report and reverts
every scale to the band-wide fallback.

**INV-16 · The games must not load `x3f-fx.js`.**
`ROADMAP.md:104–107` states this explicitly — the ambient layer "does **not** run
inside the games (they already own a loop, and the form rig and music scheduler
are two more)". Adding it during a visual overhaul would put a third rAF on the
TV SoC.

**INV-17 · No modal dialogs during a set.**
`x3f-set.js:88–89`: "Never a dialog — a modal mid-workout on a TV has to be
dismissed with the remote." Unlocks go through the hype layer or the `.x3fs-toast`
(`:90–100`). Note the four `alert()` calls in each game's `connect()` (Arena
`:177`, `:178`, `:190`, `:191`) already violate the spirit of this on TV —
`MainActivity.java:126` auto-confirms them (`onJsAlert … r.confirm(); return true`),
so on the TV they are invisible *and* the user gets no message at all.

**INV-18 · One set per exercise is the program's answer.**
`X3F_Routine.html:236–239` — `const SETS=[['1','1 set · X3 standard'], …]` with a
comment: "The X3 protocol is ONE all-out set per movement, taken to failure with
diminishing range — not a multi-set scheme." `tools/func-test/cases.js:152`
asserts the default is `'1'`. Any game redesign that assumes multiple sets, warm-up
sets, or per-set pacing contradicts both the code and `protocol.md:104`.

**INV-19 · `X3FEX.gameUrl()` is the only sanctioned way to build a launch URL,
and `window.X3FFILES` remaps the filenames for the TV bundle.**
`x3f-exercises.js:127–142`, `tools/sync-from-web.py:84–86`. Hard-coding
`X3F_Flow.html` anywhere breaks the Android build, where the file is `flow.html`.

**INV-20 · `x3f_exCal` keys are `slug|band`, and `MIN_SPAN` is 10, not 40.**
`x3f-cal.js:69`, `:41–46`. The comment records that 40 was wrong and rejected
honest White-band calibrations; `tools/func-test/cases.js:207–210` asserts both
that `save('drag-curl','White',100,120) === true` and that
`save('upright-row','White',100,100) === false`.

---

# 5. Suggested order of attack

1. **D-14, D-01/02/03** — the data-corruption set. Delete every `logSession`;
   delete Arena's `scale`/`unit` feature outright and point users at
   `X3F_Calibrate.html`, which already does it correctly.
2. **D-05** — add `X3FSet.reset()` to every set start, and add a report floor
   (W-8) so D-12 dies with it.
3. **D-04** — un-IIFE Ascent, add `x3f-progress.js` + `x3f-set.js`, move
   `ascent_best` under `x3f_`, or delete the game.
4. **Extract `x3f-bar.js`** (W-4) under INV-1/INV-2 — this is what makes D-07,
   D-15, D-16, D-30 and D-33 one fix each instead of five.
5. **W-1/W-2** — the actual overhaul: a shared `x3f-rep.js` carrying Bloom's
   diminishing-range model, and a reward function in every game that is
   monotonically increasing in force. Rhythm and Duel need their scoring rules
   replaced, not tuned.
6. **D-06, D-11, D-13, D-21** — Arena's mode machine.
7. **W-12** — add func-test coverage for Arena/Duel/Rhythm/Ascent before any of
   the above lands.
