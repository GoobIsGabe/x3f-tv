# X3F menu pages — deep read for the visual overhaul

Audit of the four menu pages, read line by line, plus the shared modules they
depend on. Written so a redesign can be planned without re-opening the files.

**Files read in full**

| File | Lines | Role |
| --- | --- | --- |
| `E:/Fun/x3f-tv/web/index.html` | 152 | the launcher / hub (web build only) |
| `E:/Fun/x3f-tv/web/X3F_Routine.html` | 539 | guided workout mode |
| `E:/Fun/x3f-tv/web/X3F_Library.html` | 104 | movement reference |
| `E:/Fun/x3f-tv/web/X3F_Progress.html` | 365 | dashboard |

**Support files read in full, because the menus are unreadable without them**

| File | Lines | What it contributes to the menus |
| --- | --- | --- |
| `E:/Fun/x3f-tv/web/x3f-nav.js` | 309 | D-pad / keyboard / gamepad focus engine, injects the focus-ring CSS |
| `E:/Fun/x3f-tv/web/x3f-fx.js` | 253 | ambient canvas, page fade, breathing focus ring, **panel background colours** |
| `E:/Fun/x3f-tv/web/x3f-music.js` | 265 | generated menu music, injects the `#musicBtn` into `.top` |
| `E:/Fun/x3f-tv/web/x3f-exercises.js` | 149 | movement data + `gameUrl()` |
| `E:/Fun/x3f-tv/web/x3f-progress.js` | 616 | the program brain that Routine and Progress render |
| `E:/Fun/x3f-tv/web/x3f-form.js` | (API only) | the live form demonstrator in the Routine coach |
| `E:/Fun/x3f-tv/web/sw.js` | 6 | cache-first service worker |
| `E:/Fun/x3f-tv/web/manifest.json` | 16 | PWA manifest |
| `E:/Fun/x3f-tv/tools/sync-from-web.py` | 175 | generates the Android TV bundle from `web/` |
| `E:/Fun/x3f-tv/app/src/main/java/com/goob/x3ftv/MainActivity.java` | (relevant parts) | the TV shell: D-pad bridge, BACK handling, injected 10-foot CSS |
| `E:/Fun/x3f-tv/tools/nav-audit/*`, `tools/func-test/*` | — | the regression suites that encode most invariants |

---

# 1. Structural map

## 1.1 The four pages at a glance

| | index.html | X3F_Routine.html | X3F_Library.html | X3F_Progress.html |
| --- | --- | --- | --- | --- |
| `.wrap` max-width | **1000px** (:19) | **780px** (:19) | **820px** (:17) | **880px** (:18) |
| body padding-top | `calc(26px + --sat)` (:18) | `calc(16px + --sat)` (:18) | `calc(16px + --sat)` (:16) | `calc(16px + --sat)` (:17) |
| body side padding | **20px** | 16px | 16px | 16px |
| `min-height` | `100%` (:16) | `100dvh` (:18) | `100dvh` (:16) | `100dvh` (:17) |
| `html{scroll-behavior:smooth}` | yes (:15) | **no** | yes (:15) | yes (:16) |
| `.endcap` bottom rule | **no** | yes (:140) | yes (:52) | yes (:102) |
| loads `x3f-fx.js` | **no** | yes (:533) | yes (:99) | yes (:359) |
| loads `x3f-music.js` | **no** | yes (:530) | yes (:96) | yes (:356) |
| loads `x3f-nav.js` | yes (:148) | yes (:536) | yes (:102) | yes (:362) |
| loads `x3f-progress.js` | no | yes (:224) | **no** | yes (:155) |
| loads `x3f-exercises.js` | no | yes (:223) | yes (:67) | yes (:154) |
| wake lock IIFE | yes (:149) | yes (:537) | yes (:103) | yes (:363) |
| SW registration | yes (:150) | yes (:538) | yes (:104) | yes (:364) |
| `data-nav` count | 12 | 31 | 5 (+ runtime) | 10 (+ runtime) |
| `data-nav-first` | 1 (:63) | **2** (:151, :195) | **0** | 1 (:107) |
| `data-nav-back` | **none** | 1 (:146) | 1 (:58) | 1 (:109) |
| in the TV bundle | **no — forked** | yes → `routine.html` | yes → `library.html` | yes → `progress.html` |

All four share the identical head boilerplate (`index.html:5-9`,
`X3F_Routine.html:10-14`, `X3F_Library.html:7-11`, `X3F_Progress.html:8-12`):
`viewport-fit=cover`, manifest link, `theme-color #06080e`, apple-touch-icon,
`apple-mobile-web-app-*` metas, two `preconnect`s, and one Google Fonts
stylesheet:

```html
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
```

## 1.2 index.html — DOM structure

```
body
└ .wrap                                     (:55)  max-width 1000, flex column, gap 18
  ├ header                                  (:56)  centred flex column, gap 10
  │ ├ h1 "X3F <b>GAMES</b>"                 (:57)
  │ └ p.lede                                (:58)
  ├ .sect "Train the program"               (:61)
  ├ .cards                                  (:62)  grid auto-fill minmax(232px,1fr) gap 14
  │ ├ a.card [--i:0, border rgba(46,230,166,.4), data-nav-first] → X3F_Routine.html   (:63)
  │ ├ a.card [--i:1]  → X3F_Library.html    (:69)
  │ ├ a.card [--i:2]  → X3F_Calibrate.html  (:75)
  │ └ a.card [--i:3]  → X3F_Progress.html   (:81)
  ├ .sect "Showcase games"                  (:89)
  ├ .cards  (3× a.card.hero)                (:90)
  │ ├ Nova   [--i:0, border rgba(143,125,255,.5)]  (:91)
  │ ├ Splash [--i:1, border rgba(255,210,63,.45)]  (:97)
  │ └ Bloom  [--i:2, border rgba(89,245,196,.4)]   (:103)
  ├ .sect "Arcade &amp; drills"             (:111)
  ├ .cards  (5× a.card)                     (:112)  Arena, Flow, Duel, Rhythm, Ascent
  ├ p.note  (Chrome-on-Android tip)         (:145)
  └ p.hint  (remote instructions)           (:146)
```

Every card is `emoji → title → desc → badge`. Card inline `--i` is used only for
the entrance stagger (`animation-delay:calc(var(--i,0) * 22ms)`, :51) and
**restarts at 0 in every section**, so the three groups stagger simultaneously.

No JavaScript beyond three tags: `x3f-nav.js` (:148), the wake-lock IIFE (:149),
the SW registration (:150). There is no render function, no state, no storage.

## 1.3 X3F_Routine.html — DOM structure

```
body
├ .wrap                                                     (:143)
│ ├ .top  brand + .spacer + a.home[Library] + a.home[All games, data-nav-back]  (:144-146)
│ ├ #pstrip.pstrip           ← renderProgram()               (:148)
│ ├ #days.days               ← render()                      (:149)
│ ├ .gostrip > button#startSession.go [data-nav-first]       (:151)
│ ├ .bar                                                     (:153)
│ │ ├ #prog.prog             ← "N / M sets done · x/y lifts"
│ │ ├ select#restSel                                         (:155)
│ │ ├ button#editBtn.mini                                    (:156)
│ │ └ button#resetDay.mini                                   (:157)
│ ├ #adder.adder [display:none]  select#addSel + button#addBtn (:160-162)
│ ├ #list                    ← render()                      (:164)
│ ├ .note (the X3 prescription)                              (:165)
│ └ .endcap                                                  (:166)
├ #coach.coach   (z-index 50, fixed inset 0, opacity-toggled) (:170)
│ └ .cwrap
│   ├ .chead  [#cClose ✕End] [#cStep] [#cPrev ◀] [#cNext ▶]  (:171-176)
│   ├ .ctrack > i#cFill                                      (:177)
│   ├ #cPending.pending  [#cPendingTxt] [#cPendYes] [#cPendNo] (:178-179)
│   ├ .cbody
│   │ ├ .cdemo > .demobox (canvas#demoCv + img#demoArt) + #demoTag (:181-184)
│   │ └ .cinfo  #cName #cMuscle #cRange #cSetup #cCue #cChips (:185-192)
│   └ .cfoot  [#cPlay.cta.grow data-nav-first] [#cLog] [#cSkip] (:194-198)
├ #rest.rest   (z-index 60)  .lbl + svg.ring(#ringFg) + #restCd + #restNext + #restSkip (:202-208)
└ #done.rest   (z-index 60)  .sum: .lbl + h1 + .sumgrid(#dSets/#dLifts/#dMin)
                              + #dNote + #dClose + #dUndo + a[→ Progress]   (:211-221)
```

`#achToast.achtoast` (z-index 70) is created lazily by `toastAch()` (:274-290)
and appended to `document.body`.

### Routine JS — every function

| Line | Symbol | Contract |
| --- | --- | --- |
| 228 | `$(id)` | `document.getElementById` |
| 229 | `xget(k,d)` | `JSON.parse(localStorage['x3f_'+k])`, `null → d`, try/catch |
| 230 | `xset(k,v)` | `localStorage['x3f_'+k] = JSON.stringify(v)`, try/catch |
| 231 | `EXD`,`BANDS` | `window.X3FEX`, `X3FEX.bands` — **no null guard** |
| 232 | `GAMEKEYS` | `['bloom','splash','nova','flow','zone','max','boss','duel','rhythm','ascent']` |
| 233 | `GAMES` | `[key, name+' · '+sub]` pairs for the `<select>` |
| 234 | `TEMPOS` | `[['4000','Controlled 4s'],['3000','Standard 3s'],['2000','Brisk 2s']]` |
| 238 | `SETS` | `[['1','1 set · X3 standard'],…,['5','5 sets']]` |
| 239 | `RESTS` | `45 / 60 / 90 / 120 / 150` seconds |
| 242 | `DAYNAMES` | `['Push Day','Pull Day','Custom Day']` (from `X3FEX.days` + literal) |
| 243 | `freshCfg()` | `{[day]:{list:[…slugs], per:{}}}` |
| 244-247 | boot state | `cfg`, `prog`, `day`, `restSec`, `editing`, `S` |
| 252 | `per(slug)` | `{game, band, tempo, sets}` — **band defaults to the global `x3f_band`, not `ex.band`** (comment :256-260) |
| 263 | `setPer(slug,patch)` | merge + persist `routine2` |
| 264/265 | `doneSets` / `setDoneSets` | read/write `prog[day][slug]` |
| 266 | `isDone(slug)` | `doneSets >= +per().sets` |
| 267 | `listFor()` | `cfg[day].list` |
| 268 | `launchUrl(slug)` | `EXD.gameUrl(game,{from:'routine',band,tempo,ex:slug})` |
| 269 | `opts(list,sel)` | `<option>` string builder |
| 274 | `toastAch(list)` | max 3 toasts, 2.6 s apart, two beeps each |
| 294 | `beep(f,d,type)` | one-shot WebAudio oscillator, gain 0.28 |
| 295 | `buzz(ms)` | `navigator.vibrate` |
| 298 | `renderProgram()` | paints `#pstrip` from `X3FProg.program()/streak()/challenge()`; whole body in try/catch |
| 312 | `render()` | rebuilds `#days`, `#list`, `#prog`, `#addSel`, calls `renderProgram()`, `bind()`, `X3FNav.refresh()` |
| 353 | `bind()` | (re)attaches every `onclick`/`onchange` after each render |
| 377 | `demoFor(slug,tempo)` | creates/updates the `X3FForm` rig; sets `img#demoArt.src='assets/form/'+slug+'.png'` |
| 390 | `nextIncomplete(from)` | circular scan for the next lift with `!isDone` |
| 395 | `startSession()` | `alert()` if the day is empty; creates `S`; `openCoach()` |
| 405-414 | `saveS/curSlug/openCoach/closeCoach` | session plumbing |
| 415 | `paintCoach()` | fills every coach field, progress bar, chips, CTA labels |
| 437 | `play(slug)` | records `S.pending`, then `location.href = launchUrl(slug)` |
| 441 | `logSet()` | bumps `prog`, calls `X3FProg.logSet({g:'routine',ex,band})`, `checkAchievements()`, advances, `startRest()` |
| 461/466 | `skipLift/stepLift` | move `S.i` |
| 469 | `endSession()` | fills `#done`, **writes a `k:'session'` row straight into `x3f_history`**, clears `S`, closes overlays |
| 507/516 | `startRest/stopRest` | 1 s `setInterval`, SVG ring, beeps at ≤3 s and 0 |

### Routine data shapes

```js
// localStorage x3f_routine2
{ "Push Day": { list: ["chest-press", …],
                per: { "chest-press": {game:"bloom", band:"White", tempo:"3000", sets:"1"} } },
  "Pull Day": {…}, "Custom Day": {list:[], per:{}} }

// localStorage x3f_routineProg2
{ "Push Day": { "chest-press": 1, "front-squat": 0 } }        // sets completed

// localStorage x3f_session
{ active:true, day:"Push Day", i:2, started:1699999999999, sets:3,
  pending: { slug:"deadlift", game:"bloom", at:1699999999999 } | null }
// or { active:false }
```

## 1.4 X3F_Library.html — DOM structure

```
body > .wrap                                                     (:55)
├ .top  brand + .spacer + a.home[Routines] + a.home[Home, data-nav-back]  (:56-58)
├ .method  h3 + p  (the X3 method blurb)                         (:59-62)
├ #lib      ← render()                                           (:63)
├ .note  (with an inline link to Routines)                       (:64)
└ .endcap                                                        (:65)
```

`render()` (:77-93) emits, for each `X3FEX.groups` entry:

```
.cat  <group name>
  .ex                                        ×N
    .exhead
      .r      .exname / .muscle
      select[data-n=<slug>][data-nav]        ← band picker
    .strong[.mid]   "💪 " + ex.range
    .detail         "Setup" + ex.setup       (innerHTML, contains <b>)
    .detail.cue     "Cue" + ex.cue
    .games
      a.gm.<gamekey>  .gn=name  .gu=sub      ×2-3
```

State: `libBand` — `localStorage['x3f_libBand'] = { slug: bandName }` (:74).
`bandFor(ex)` falls back to `ex.band`, the library's *suggested* band (:75).

Launch URL (:88):
`EXD.gameUrl(g, {from:'lib', band:bd, tempo:'3000', ex:ex.slug})` — **tempo is
hard-coded**; the Library exposes no tempo control.

## 1.5 X3F_Progress.html — DOM structure

```
body > .wrap                                                     (:105)
├ .top  brand + a.home[Routines, data-nav-first] + a.home[Library] + a.home[All games, data-nav-back]  (:106-109)
├ #today.today                       ← renderToday()             (:111)
├ h2 "Today's challenge"  + .card.chal#chal   ← renderChal()     (:113-114)
├ h2 "The 12-week program" + .card > #grid.grid12 + #gridNote    (:116-118)
├ h2 "Reps per week"       + .card > #vol.vol.reps + #volLab     (:120-121)
├ h2 "Peak force per week" + .card > #pk.vol.force + #pkLab      (:123-124)
├ h2 "Band coaching"       + #advice          ← renderAdvice()   (:126-127)
├ h2 "Personal bests"      + #pbs.pbs         ← renderPBs()      (:129-130)
├ h2 "Recent sets"         + #recent.pbs      ← renderRecent()   (:132-133)
├ h2 "Achievements" + .achhead#achCnt + .filters#achFilters + .achs#achs  (:135-138)
├ h2 "Move your history…" + .card
│   └ .empty + .row[#expBtn #impBtn #wipeBtn] + textarea#impBox  (:140-149)
├ .note                                                          (:151)
└ .endcap                                                        (:152)
```

### Progress JS

| Line | Symbol | Notes |
| --- | --- | --- |
| 159 | `P = window.X3FProg`, `EX = window.X3FEX` | **no guard on `P`** |
| 160 | `nameOf(slug)` | guarded on `EX` |
| 162 | `renderToday()` | week/phase label, next day type, weekly bar, streak flame, "rest earned", "best N" |
| 177 | `renderChal()` | challenge card + conditional `#chalDone` button |
| 188 | `renderGrid()` | 12 rows × 7 `.cell`; classes `done` / `future` / `today`; `title` = date |
| 207 | `weekly(pick)` | 12 buckets over 84 days; `pick.max` switches sum→max |
| 217 | `bars(el,lab,vals,unit)` | percentage heights + a label row (`12w`, ``, `10w`, …, `now`) |
| 222 | `renderCharts()` | reps (sum) and peak (max) |
| 229 | `renderAdvice()` | `P.bandAdvice()` cards, or an empty-state |
| 236 | `renderPBs()` | rows sorted by reps desc; columns reps / partials / peak / negative |
| 250 | `achGlyph(id)` | prefix→emoji map, 19 entries, first-match-wins |
| 258 | `renderRecent()` | last 12 sets reversed; each row gets a `[data-del]` ✕ button |
| 283 | `renderAch()` | all ~117 badges, `all/got/locked` filter, medallion + glyph + tier word |
| 299 | `#expBtn` | Blob download; falls back to dumping JSON into `#impBox` |
| 315 | `#impBtn` | two-press: reveal textarea, then parse + merge |
| 338 | `#wipeBtn` | `confirm()` then `P.reset()` |
| 343 | `refresh()` | `checkAchievements()` → optional FX burst → all eight renderers → `X3FNav.refresh()` |

Export payload shape (:300-304):

```js
{ v:1, at:Date.now(),
  history: P.history(),                       // x3f_history
  ach:     x3f_ach, chal: x3f_chal,
  bandMax: x3f_bandMax, exCal: x3f_exCal }
```

Import dedupe key (:321): `e.t + '|' + (e.ex||'') + '|' + (e.reps||0)`, then
`mine.slice(-600)`.

## 1.6 Storage keys touched by the menus

| Key | Written by | Read by | Shape |
| --- | --- | --- | --- |
| `x3f_routine2` | Routine :244,263,363,367,373 | Routine, `x3f-progress.js:377` (`dayMovements`) | day config |
| `x3f_routineProg2` | Routine :265,371 | Routine | sets completed per day |
| `x3f_routineDay` | Routine :354,409,522 | Routine | current day name |
| `x3f_restSec` | Routine :370 | Routine | number |
| `x3f_session` | Routine :401,405,475,481 | Routine, nav-audit | guided session |
| `x3f_libBand` | Library :91 | Library only | `{slug: band}` |
| `x3f_band` | **games + Calibrate only** | Routine `per()` :261, `x3f-set.js:51` | the "current band" |
| `x3f_history` | `X3FProg.logSet`, Routine :474, Progress import :325 | everything | the log |
| `x3f_ach` | `X3FProg.checkAchievements`, Progress import :326 | Progress | `{id: unlockedAt}` |
| `x3f_chal` | `X3FProg.markChallenge` | Progress, Routine strip | `{dayKey:{done,at}}` |
| `x3f_prog` | (only cleared) | `program()` | `{startedAt}` |
| `x3f_bandMax` | Calibrate, Progress import | `x3f-cal.js` | `{band: max}` |
| `x3f_exCal` | `x3f-cal.js`, Progress import | games | per movement+band range |
| `x3f_music` | `x3f-music.js:193,200` | `x3f-music.js:83` | `'true'` / `'false'` |

## 1.7 The complete current design language

### 1.7.1 Token blocks — verbatim, all four

**`index.html:11-13`**

```css
:root{--bg:#06080e;--panel:#141824;--brd:#2a3346;--txt:#eaf2ff;--dim:#8b97ad;
      --accent:#2ee6a6;--gold:#ffd35c;--navring:#2ee6a6;
      --d:'Sora',system-ui,-apple-system,'Segoe UI',sans-serif;
      --n:'Space Grotesk',system-ui,-apple-system,'Segoe UI',sans-serif;
      --sat:env(safe-area-inset-top);--sab:env(safe-area-inset-bottom);
      --e:cubic-bezier(.2,.9,.25,1)}
```

**`X3F_Routine.html:16`**

```css
:root{--bg:#06080e;--bg2:#0b0f18;--panel:rgba(255,255,255,.05);
      --brd:rgba(255,255,255,.09);--brd2:rgba(255,255,255,.14);
      --txt:#eaf0fa;--dim:#8593a9;--accent:#2ff0b0;--accentD:#0fae82;
      --gold:#ffd35c;--cyan:#37d6ff;--hot:#ff5d78;--orange:#ff9a5c;
      --navring:#2ff0b0; …same fonts / --sat / --sab / --e… }
```

**`X3F_Library.html:13`** — as Routine, but **adds `--violet:#8f7dff`** and
**omits `--accentD`**.

**`X3F_Progress.html:14`** — as Routine, **adds `--violet:#8f7dff`**, **omits
`--orange`**, keeps `--accentD`.

### 1.7.2 Every colour value in the four pages

**Ground / structure**

| Value | Where |
| --- | --- |
| `#06080e` | `--bg` on all four; `theme-color`; `manifest.background_color` |
| `#080a10` | index body gradient outer stop (:17) |
| `#161d2e` | index body gradient inner stop (:17) |
| `#0b0f18` | `--bg2` on Routine/Library/Progress (select, `.gm`, `.exnum`, `.chip`, `.pbrow`, textarea) |
| `#141824` | `--panel` on index **only** (opaque) |
| `#2a3346` | `--brd` on index **only** (opaque) |
| `rgba(255,255,255,.05)` | `--panel` on the other three |
| `rgba(255,255,255,.09)` | `--brd` on the other three |
| `rgba(255,255,255,.14)` | `--brd2` on the other three |
| `rgba(255,255,255,.045)` / `.015` | index `a.card` gradient (:30); Progress `.ach` gradient (:69) |
| `rgba(255,255,255,.07)` / `.02` | index `.card.hero` gradient (:44) |
| `rgba(255,255,255,.03)` | second stop of every "tinted panel" gradient |
| `rgba(255,255,255,.13)` | `.pip` unfilled (Routine :58) |
| `rgba(255,255,255,.1)` / `.10` | `.ctrack`, `.ring .bg`, `.bar`, `.rest` track |
| `rgba(255,255,255,.06)` | `.cell` empty (Progress :46) |
| `rgba(255,255,255,.02)` | `.cell.future` (Progress :49) |
| `rgba(4,7,13,.94)` | `.coach` scrim (Routine :76) |
| `rgba(4,6,11,.92)` | `.rest` scrim (Routine :113) |
| `rgba(10,16,26,.92)` | `.achtoast` (Routine :135) |
| `rgba(8,11,19,.80)` | **injected by `x3f-fx.js:48-49`** onto `.card,.ex,.pbrow,.today,.chal,.pstrip,.ach,.demobox,.method,.cwrap,.sheet,.rest,.coach` |
| `#06070f` | FX canvas dark ground (`x3f-fx.js:111`) |
| `#05030F` | WebView background in the TV shell (`MainActivity.java:123`) |

**Text**

| Value | Role | Contrast on `#06080e` |
| --- | --- | --- |
| `#eaf2ff` | `--txt` (index) | 17.78 |
| `#eaf0fa` | `--txt` (other three) | 17.49 |
| `#8b97ad` | `--dim` (index) | 6.80 |
| `#8593a9` | `--dim` (other three) | 6.43 |
| `#6f7c92` | `.note` on index only (:46) | 4.74 |
| `#5d6a80` | `.hint` on index only (:48) | **3.66 — fails WCAG AA** |
| `#04120c` | text on every accent-filled button | 12.96 on `#2ff0b0`, 6.74 on `#0fae82` |

**Accent family**

| Value | Name | Used for |
| --- | --- | --- |
| `#2ee6a6` | index `--accent` / `--navring` | h1 `<b>`, `.badge`, card hover border |
| `#2ff0b0` | menu `--accent` / `--navring` | everything accent on the other three |
| `#0fae82` | `--accentD` | bottom stop of every accent gradient (Routine, Progress) |
| `#ffd35c` | `--gold` | streak, `.strong`, challenge tag, `.achtoast`, tier-4 glow |
| `#37d6ff` | `--cyan` | `.detail .lbl`, reps chart, progress bar right stop |
| `#8f7dff` | `--violet` | `.gm.rhythm`, `.gm.nova` left borders (Library); declared unused on Progress |
| `#ff5d78` | `--hot` | `.gm.boss` left border; declared unused on Progress |
| `#ff9a5c` | `--orange` | `.strong.mid` |
| `#ff9a6a` | one-off literal | `.gm.duel` left border (Library :47) — **not a token** |
| `rgba(143,125,255,.5)` | one-off | Nova card border (index :91) |
| `rgba(255,210,63,.45)` | one-off | Splash card border (index :97) — **not `--gold`** |
| `rgba(89,245,196,.4)` | one-off | Bloom card border (index :103) — **not `--accent`** |
| `rgba(46,230,166,.4)` / `.13` | Routines card border, card hover wash (index) |
| `#39f5c4` | FX default burst colour (`x3f-fx.js:241`); TV shell focus outline (`MainActivity.java`) |

**Accent tints (alpha variants) — the full set**

`rgba(47,240,176,.07 .08 .09 .1 .22 .32 .35 .4 .45)`,
`rgba(255,211,92,.1 .22 .28 .32 .35 .45 .55)`,
`rgba(255,154,92,.12 .35)`, `rgba(55,214,255,.25)`,
`rgba(0,0,0,.45 .5 .72 .8)`.

### 1.7.3 Type

Two families, both remote (`fonts.googleapis.com`), no local fallback file:

- `--d` = **Sora** 600/800 — display: `h1`, `.brand`, `.title`, `.exname`,
  `.cname`, `.go`, `.play`, `.cta`, `.tday`, `.nm`, `.an`, `.chal h3`, `body`
- `--n` = **Space Grotesk** 500/700 — everything numeric or secondary:
  `.lede`, `.desc`, `.badge`, `.sect`, `.cat`, `h2`, `.detail`, `.muscle`,
  `.chip`, `.mini`, `select`, `.note`, `.hint`, `.cd`, `.v`, `.k`

**Every font-size literal in the four pages**

| Size | Occurrences |
| --- | --- |
| `clamp(4rem,22vw,7.5rem)` | rest countdown (Routine :116) |
| `clamp(26px,7vw,36px)` | index `h1` (:21) |
| `clamp(20px,5.4vw,27px)` | coach `.cname` (Routine :92) |
| `clamp(20px,5vw,27px)` | `.tday` (Progress :28) |
| `34px` | index `.emoji` (:39); `.flame .n` (Progress :32) |
| `28px` | `.sum h1` (Routine :125) |
| `26px` | `.chal .ic`, `.medal span` (Progress :38, :76) |
| `24px` | `.sumgrid .v` (Routine :129) |
| `20px` | index `.title` (:40) |
| `19px` | `.brand` ×3 |
| `17px` | `.exname` (Library :32); `.chal h3` (Progress :39) |
| `16px` | `.pstrip .pd`, `.go`, `.exname` (Routine); `.pbrow .v` (Progress) |
| `15px` | `.pstrip .ps`, `.day`, `.cta`, `.achtoast b` (Routine); `.achhead .cnt` (Progress) |
| `14.5px` | `.pbrow .nm` (Progress :59) |
| `14px` | index `.lede`; `.exnum`, `.play` (Routine); `.gm .gn` (Library) |
| `13.5px` | `.ach .an` (Progress :87) |
| `13px` | index `.desc`; `.home`, `.prog`, `.set`, `.nx` (Routine); `.home` (Library); `.home`, `.chal p`, `.empty` (Progress) |
| `12.5px` | the single most common size — `.note`, `.detail`, `.exhint`, `.cmuscle`, `.muscle`, `.tmeta`, `.advice p`, `select`, `.pw`, `.pc`, `.method p` |
| `12px` | `.mini`, `.edit button`, `.cstep`, `.achtoast span`, `.cat`, `h2`, `.chip`, `textarea` |
| `11.5px` | index `.sect`, index `.hint`; `.strong`, `.muscle` (Library); `.strong` (Routine) |
| `11px` | `.chip` (Routine :101); `.pbrow .bd`, `.ach .ad` (Progress) |
| `10.5px` | index `.badge`; `.day small`, `.demotag` (Routine); `.gm .gu` (Library); `.flame .k`, `.chal .tag` (Progress) |
| `10px` | `.detail .lbl` ×2; `.sumgrid .k`; `.growrow .wk` |
| `9.5px` | `.vollab`, `.pbrow .v small` (Progress) |
| `9px` | `.ach .at` (Progress :89) |

Tracking values in use: `.4px, .5px, 1px, 1.2px, 1.4px, 1.5px, 1.6px, 2px,
2.5px, 2.6px, 3px`.

Line-heights: `1`, `1.1`, `1.15`, `1.25`, `1.4`, `1.5`, `1.55`, `1.6`.

### 1.7.4 Radius scale

`3px` (pip) · `4px` (grid cell, ctrack, vol bar top) · `7px` (Progress `.bar`) ·
`8px` (`.strong`) · `9px` (`.edit button`) · `10px` (`select`, `.mini`,
`.exnum`) · `11px` (`.play`, `.set`) · `12px` (`.gm`, `.pbrow`, `textarea`) ·
`13px` (`.cta`, `.pending`) · `14px` (`.day`, `.go`, `.sumgrid div`) · `16px`
(`.card`, `.ex`, `.method`, `.pstrip`, `.demobox`, `.ach`, `.achtoast`) · `18px`
(index `a.card`, `.today`) · `100px` (`.home`, `.chip`, `.tag`) · `999px`
(index `.badge`) · `inherit` (card `:before`, FX sheen).

**Two pill radii (`100px` vs `999px`) and no consistent card radius (16 vs 18).**

### 1.7.5 Shadows — the complete list

```css
index :36   box-shadow:0 16px 40px rgba(0,0,0,.45)                       /* card hover */
Rout  :47   box-shadow:0 8px 26px rgba(47,240,176,.22)                   /* .go */
Rout  :48   box-shadow:0 10px 32px rgba(47,240,176,.32)                  /* .go:hover */
Rout  :50   box-shadow:0 0 0 1px var(--accent) inset,0 10px 30px rgba(47,240,176,.1)  /* .ex.cur */
Rout  :104  box-shadow:0 6px 22px rgba(47,240,176,.22)                   /* .cta */
Rout  :106  box-shadow:none                                              /* .cta.ghost */
Rout  :135  box-shadow:0 14px 40px rgba(0,0,0,.5)                        /* .achtoast */
Prog  :48   box-shadow:0 0 10px rgba(47,240,176,.45)                     /* .cell.done */
Prog  :91   box-shadow:0 0 30px -12px var(--gold)                        /* .ach.t4.got */
Prog  :77   filter:drop-shadow(0 2px 6px rgba(0,0,0,.8))                 /* medal glyph */
nav   :25   box-shadow:0 0 0 2px var(--navring),0 12px 34px rgba(0,0,0,.45) !important
fx    :37-38 keyframes x3f-ring — 2px→3px ring + 0 0 26px -2px navring
Library     — no box-shadow at all
```

### 1.7.6 Motion

One shared easing token: `--e: cubic-bezier(.2,.9,.25,1)`, on all four.

| Duration | Property | Where |
| --- | --- | --- |
| `.1s` | transform | `.go:active`, `.cta:active`, `.play:active`, `.gm:active` |
| `.12s` | transform | `.day` |
| `.15s` | border-color | `.gm` |
| `.16s` | transform | `.ex` |
| `.18s` | transform / border-color / filter | index `a.card`, `.home`, `.mini`, `.set`, `.ach:hover` |
| `.2s` | background / colour / box-shadow | `.day`, `.ex:hover`, `.go` |
| `.22s` | border-color, opacity, box-shadow | `.ex` |
| `.24s` | box-shadow, background | index `a.card`, `.ex` (Library) |
| `.25s` | background/colour/opacity/border/transform | `.pip`, `.exnum`, `.set`, `.ach`, `.achtoast` |
| `.28s` | opacity | index card `:before`, `.rest` |
| `.3s` | opacity, colour | `.coach`, `.rest .cd` |
| `.35s` | filter, opacity | `.medal i`, `.medal span` |
| `.42s` | `@keyframes rise` | index card entrance, `22ms` stagger |
| `.45s` | width | `.ctrack i` |
| `.5s` | opacity, width | `#demoArt`, Progress `.bar i` |
| `1s linear` | stroke-dashoffset | rest ring |
| `3.4s ease-out .2s 1` | `@keyframes achSheen` | every unlocked badge |
| `.75s ease-out 1` | `@keyframes x3f-sheen` | `x3f-fx.js:43`, on focus |
| `2.2s ease-in-out infinite` | `@keyframes x3f-ring` | `x3f-fx.js:39`, focus ring breathing |
| `.34s` / `.22s` | body opacity in / out | `x3f-fx.js:33-35` |

Named keyframes in the pages: `rise` (index :50), `achSheen` (Progress :85).
From modules: `x3f-ring`, `x3f-sheen` (`x3f-fx.js`).

### 1.7.7 Layout & spacing

- Gaps in use: `2, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18` px — no scale.
- Paddings in use: `4/9, 4/10, 5/9, 6/11, 7/0, 8/9, 8/12, 8/14, 9, 9/11, 9/13,
  10, 10/12, 12/8, 12/14, 12/18, 13/10, 13/15, 14, 14/10/12, 14/18, 15, 16, 20,
  24` — no scale.
- Only one media query in the page CSS: `@media (max-width:620px)` on
  `X3F_Routine.html:130` (stacks the coach body). There is **no `min-width`
  breakpoint anywhere in `web/`** — the 10-foot pass at `min-width:1200px` lives
  only in `tools/sync-from-web.py:91-100` and is injected into the TV bundle.
- Two `@supports not (aspect-ratio:1/1)` fallbacks: Routine :87, Progress :47.
- Grid definitions: index `.cards` `repeat(auto-fill,minmax(232px,1fr))`;
  Progress `.achs` `repeat(auto-fill,minmax(184px,1fr))`; Progress `.today`
  `1fr auto`; Progress `.pbrow` `1fr auto auto auto auto`.

### 1.7.8 Component inventory (names a redesign must re-home)

| Component | index | Routine | Library | Progress |
| --- | --- | --- | --- | --- |
| `.wrap` | ✓ | ✓ | ✓ | ✓ |
| `.top` / `.brand` / `.spacer` / `a.home` | — | ✓ | ✓ | ✓ |
| section heading | `.sect` | — | `.cat` | `h2` |
| card grid | `.cards` + `a.card` (+`.hero`) | — | — | `.achs` + `.ach` |
| generic panel | — | `.pstrip` | `.method`, `.ex` | `.card`, `.today`, `.chal`, `.advice` |
| pill button | `.badge` (static) | `.mini`, `.chip` | `.home` | `.chip`, `.home` |
| primary CTA | — | `.go`, `.play`, `.cta` | — | — |
| tab / segmented | — | `.day` | — | `.filters .chip` |
| select | — | `select` ×4 per lift + `#restSel` + `#addSel` | `select` ×1 per lift | — |
| meter | — | `.pips`/`.pip`, `.ctrack`, `.ring` | — | `.bar`, `.vol`, `.grid12`/`.cell` |
| data row | — | `.sumgrid` | `.gm` | `.pbrow` |
| badge/tag | `.badge` | `.strong`, `.chip` | `.strong`, `.gm` | `.chal .tag`, `.ach .at` |
| overlay | — | `.coach`, `.rest`, `.achtoast` | — | — |
| end-of-list rule | — | `.endcap` | `.endcap` | `.endcap` |

## 1.8 Navigation wiring

**Focus engine.** `x3f-nav.js` collects `[data-nav]` inside the topmost open
"scope" (`SCOPES = '.coach.show,.rest.show,.scrim.show,.modal.show,[data-nav-scope]'`,
:53), filters by a full ancestor-walk visibility test (:31-48), and moves with a
geometry score `fwd + cross*2.2 + (overlap>2 ? 0 : 4000)` (:144). It falls back
to page scrolling when nothing lies that way (:152, `scrollPage`), then to
reading order (:156-160). It injects `[data-nav]{scroll-margin:26px}`, the
`.x3f-nav-cur` ring, and a global `prefers-reduced-motion` override (:21-27).

**Keys** (`x3f-nav.js:211-230`): arrows move (arrows on a focused `<select>`
step its value instead), Enter/Space activate, **Escape / Backspace /
BrowserBack** run `back()` → clicks `[data-nav-back]`, else `history.back()`,
else `index.html`.

**TV.** `MainActivity.dispatchKeyEvent` (:543) swallows the D-pad and calls
`window.__x3fNav(dir)`. `x3f-nav.js:283-300` claims that global (and sets
`window.__x3fPageNav = true`) so the page's own geometry nav drives the remote.
`'enter'` on a `<select>` cycles the value in place rather than opening a
dropdown. The shell's own fallback nav is injected in `BOOTSTRAP` and only
installs `if(!window.__x3fNav)` — i.e. never, on these pages.

**Link graph**

```
index.html ──► Routine, Library, Calibrate, Progress, 8 games
Routine    ──► Library, index (back)            [no link to Progress except the summary overlay]
Library    ──► Routine, index (back), ~28 game deep-links
Progress   ──► Routine (first), Library, index (back)
```

**Cross-build.** `tools/sync-from-web.py` copies the three menu pages to
`routine.html`, `library.html`, `progress.html`, strips the SW + manifest,
rewrites `index.html → launcher.html` and `X3F_* → lowercase`, and injects
`window.X3FFILES` + the 10-foot CSS + an initial-focus shim. `web/index.html` is
**not** in `GAMES` or `MENUS` — the TV launcher (`app/src/main/assets/launcher.html`,
17,905 bytes, Fredoka, `.foc` focus class, `X3FNAV_CLASS='foc'`) is a separate,
hand-maintained page that shares nothing but `x3f-nav.js` and `x3f-fx.js`.

---

# 2. Defects

Ranked roughly by severity. Every one has file:line evidence and a concrete
failure.

## D1 — Changing any `<select>` destroys D-pad focus and throws the cursor to the top of the page

**Evidence**
`X3F_Routine.html:355` — `$('list').querySelectorAll('select').forEach(s=>s.onchange=()=>{setPer(s.dataset.n,{[s.dataset.k]:s.value});render()})`
`X3F_Routine.html:319` — `render()` does `$('list').innerHTML = …` (destroys every select)
`X3F_Library.html:91` — same pattern on `#lib`
`x3f-nav.js:85` — `if (cursor && items.indexOf(cursor) < 0) { cursor.classList.remove(CUR); cursor = null; }`
`x3f-nav.js:122-127` — `move()` with a null cursor calls `setCursor(first())`
`x3f-nav.js:295` — on TV, `'enter'` on a select calls `stepSelect(c, 1, true)` which dispatches `change`

**Failure.** On the TV, focus the *band* select of the fifth lift on Pull Day and
press OK. `stepSelect` advances White→Light Gray and fires `change`; `render()`
replaces `#list`; `X3FNav.refresh()` finds the cursor is gone and nulls it. The
next D-pad press lands on `#startSession` at the top of the page. To move a lift
from White to Elite Black (4 steps) the user must scroll back down to that lift
four times. The same happens for the game select (10 options) and the sets
select. On Library it is worse: `render()` rebuilds all 11 movements, so one OK
on a band picker sends the cursor back to the "Routines" link in the header.

There is also a race: `render()` calls `X3FNav.refresh()` immediately, and
`refresh()` early-returns the stale list if `t - lastBuild < 50` (`x3f-nav.js:79`),
leaving `cursor` pointing at a **detached DOM node** until the next keypress.

## D2 — On the TV, BACK abandons a guided session with no confirmation

**Evidence**
`MainActivity.java:554-557` — `if (overlayOpen) { … __x3fCloseOverlay() } else if (isLauncher) moveTaskToBack else web.loadUrl(LAUNCHER)`
`MainActivity.java:446` — `overlayOpen` is only set by `X3F.setOverlay(boolean)`
grep: `__x3fCloseOverlay` appears **only** in `MainActivity.java:556`; no page defines it
grep: no menu page calls `X3F.setOverlay`

**Failure.** Mid-workout, coach open, three sets logged, the user presses BACK on
the remote to dismiss the rest timer. `overlayOpen` is false, so the shell loads
`launcher.html`. The guided session is left `active` in `x3f_session`, the
`#done` summary never appears, and `endSession()`'s history row is never written
— the session minutes and the `k:'session'` marker are lost.

## D3 — Escape during a guided session both stops the rest timer *and* leaves the page

**Evidence**
`X3F_Routine.html:525-528`

```js
addEventListener('keydown',e=>{
  if(!$('coach').classList.contains('show'))return;
  if(e.key==='Escape'){if($('rest').classList.contains('show'))stopRest();}
});
```

`x3f-nav.js:229` — `if (k === 'Escape' …) { back(); e.preventDefault(); }`
`x3f-nav.js:212` — the guard is `if (e.defaultPrevented …) return;`

**Failure.** The page handler is registered at :525 (parse time) and `x3f-nav.js`
loads at :536, so the page handler runs first — but it never calls
`preventDefault()`. `back()` then clicks `[data-nav-back]` = the "All games" link
(:146). Pressing Escape with the rest timer up closes the timer *and* navigates
to `index.html`. Same on a keyboard-driven TV browser (TV Bro maps BACK to
`Escape`/`BrowserBack`).

## D4 — `endSession()` re-introduces the hard history truncation the engine was fixed to remove

**Evidence**
`X3F_Routine.html:474`

```js
if(sets)try{const h=JSON.parse(localStorage.getItem('x3f_history')||'[]');
 h.push({t:Date.now(),k:'session',g:'routine',day:day,sets:sets,mins:mins});
 while(h.length>250)h.shift();
 localStorage.setItem('x3f_history',JSON.stringify(h))}catch(e){}
```

vs `x3f-progress.js:71-100` — `compact()` folds anything older than
`KEEP_DAYS = 56` into per-day rollups and only trims at `SOFT_CAP = 700`, with
the comment "a hard cap of 600 quietly ate real history after two cycles".
ROADMAP.md: "**History no longer truncates** (#2)".

**Failure.** A user 10 weeks into the program has ~300 entries (rollups plus
recent sets). Finishing a guided session shifts the oldest ~50 entries off the
front, permanently deleting week-1..3 rollups. The 12-week grid loses its early
squares, `program().startedAt` moves forward, `bestStreak` shrinks, and lifetime
rep badges can *un-earn* their basis. It also bypasses `X3FProg.logSet`/`compact`
entirely.

## D5 — On the TV every `confirm()` auto-answers "yes" and every `alert()` is invisible

**Evidence**
`MainActivity.java:126-127`

```java
@Override public boolean onJsAlert(WebView v, String u, String m, JsResult r) { r.confirm(); return true; }
@Override public boolean onJsConfirm(WebView v, String u, String m, JsResult r) { r.confirm(); return true; }
```

`X3F_Progress.html:278` — `if(!confirm('Remove this set from your history?'))return;`
`X3F_Progress.html:339` — `if(!confirm('Clear unlocked achievements and challenge history? …'))return;`
`X3F_Progress.html:334` / `:336` — `alert('Imported N new sets.')` / `alert('That did not look like an exported history.')`
`X3F_Routine.html:397` — `alert('Add some movements to this day first (Edit day).')`

**Failure.** On the TV, moving the cursor onto a Recent-Sets ✕ and pressing OK
deletes the set instantly — the confirmation is auto-accepted and never shown.
"Reset achievements" wipes `x3f_ach`, `x3f_chal` and `x3f_prog` on a single OK
press. Conversely, pressing "Start guided session" on an empty Custom Day does
nothing visible at all — the alert is swallowed. The codebase already knows this:
`X3F_Routine.html:271-273` says *"Never alert() for this … on a TV it is a system
dialog you have to dismiss with the remote"*, and `tools/nav-audit/audit.js:16-21`
mocks the dialogs for exactly this reason — yet four dialogs remain.

## D6 — If `x3f-fx.js` throws inside `mount()`, the page stays at `opacity:0` forever

**Evidence**
`x3f-fx.js:33-34` — `'body{opacity:0;transition:opacity .34s …}', 'body.x3f-in{opacity:1}'`
`x3f-fx.js:186-214` — `mount()` calls `css()` **first** (:188) and
`document.body.classList.add('x3f-in')` **last** (:212), with `ctx.setTransform`
(`resize()`, :67) in between
`X3F_Progress.html:361` — `try{X3FFX.mount({image:"assets/ui/aurora.jpg"});}catch(e){}`

**Failure.** On a WebView where `canvas.getContext('2d')` returns `null` (GPU
blacklisted, memory pressure, or a stripped WebView), `resize()` throws at
`ctx.setTransform`, the page-level `try/catch` swallows it, `x3f-in` is never
added, and Routine / Library / Progress render as a **completely blank black
screen** with no error. `index.html` is immune only because it does not load the
module.

## D7 — The D-pad teleports past the entire Progress dashboard

**Evidence**
`X3F_Progress.html:111-138` — between `#chalDone` (:183, conditional) and the
first `[data-del]` button (:274) there are six sections with **no `[data-nav]`
element**: the 12-week grid, both charts, band coaching and the PB table.
`x3f-nav.js:152` — `if (!best && (dir === 'up' || dir === 'down') && scrollPage(dir)) return;` — the page-scroll fallback only fires when *nothing* lies that way.

**Failure.** From the challenge card, one press of Down finds a `best` (the first
Recent-Sets ✕, several thousand pixels below) and `scrollIntoView({block:'nearest'})`
jumps straight there. The 84-cell adherence grid, the reps chart, the peak-force
chart, the band coaching and the whole PB table are scrolled past in one frame
and can never be *paused on*. On the TV the primary content of the dashboard is
effectively unviewable.

## D8 — The Routine day tabs count "done" against 3 sets while the list counts against 1

**Evidence**
`X3F_Routine.html:314`

```js
const l=cfg[dn].list, n=l.filter(s=>{const c=(cfg[dn].per||{})[s]||{};const tot=+(c.sets||3); …
```

vs `X3F_Routine.html:261` — `sets: c.sets || '1'` (with the comment at :235-237
explaining that **1 is the X3 answer**)

**Failure.** A fresh install has `per = {}` for every movement. The list shows
"Set 1/1" and marks a lift done after one set, but the day tab computes
`tot = 3`, so `Push Day 0/5` stays at `0/5` after you complete the whole day. The
tab counter only agrees with reality once every movement has been touched by a
`<select>` (which writes `sets:'1'` into `per`).

## D9 — Guided-only sets populate the PB table with 0-rep rows

**Evidence**
`X3F_Routine.html:448` — `X3FProg.logSet({g:'routine',ex:slug,band:per(slug).band})` — no `reps`, `peak`, `part`
`x3f-progress.js:161-177` — `pbTableRaw()` creates a row for **any** entry with `e.ex`
`X3F_Progress.html:237` — `P.pbTable().sort((a,b)=>b.reps-a.reps)` with no filter

**Failure.** Run a guided session without launching a game (tap "Log set ✓" for
each lift, which is a supported flow — `cLog` is a first-class button at :196).
The Personal Bests table then shows "Chest Press · White band · 1 set · **0**
reps · – partials · – peak · – negative" for every lift, sorted to the bottom.
`challenge()` filters these out (`x3f-progress.js:296`) but the dashboard does not.

## D10 — The form demonstrator keeps a 60 fps rAF loop running after the coach closes

**Evidence**
`X3F_Routine.html:414` — `function closeCoach(){$('coach').classList.remove('show');if(demo)demo.setMode('tempo')}`
`x3f-form.js:486-492` — `function loop(now){ if(!alive) return; … if(!hidden && acc>=minFrame){acc=0;draw(now);} requestAnimationFrame(loop); }`
`x3f-form.js:510` — `destroy: function(){ alive = false; }` — **never called**
`x3f-form.js:484` — `minFrame = compact ? 1/34 : 0` — the Routine rig is non-compact, i.e. every frame

**Failure.** Open the coach once, close it. The rig now repaints a canvas inside
an `opacity:0` overlay at the display rate, forever, alongside `x3f-fx.js`'s rAF
(:180) and `x3f-music.js`'s 120 ms `setInterval` (:192) — three loops on a menu
page, which ROADMAP #7 explicitly calls out as the TV frame-budget risk.

## D11 — Every declared `z-index` on the overlays is overridden to `1`

**Evidence**
`x3f-fx.js:31` — `'body>*:not(#x3ffx){position:relative;z-index:1}'`
`X3F_Routine.html:76` (`.coach{z-index:50}`), `:113` (`.rest{z-index:60}`),
`:133` (`.achtoast{z-index:70}`)

`:not(#x3ffx)` carries the specificity of its argument, so the FX selector scores
**(1,0,1)** against `.coach`'s **(0,1,0)**. All three overlays compute to
`z-index:1`. It currently *looks* right only because they are siblings in the
intended paint order (`#coach` → `#rest` → `#done` → `#achToast` appended last).
Any redesign that reorders the markup, wraps an overlay in a container, or moves
`#achToast` will silently invert the stacking with no CSS change to blame.

## D12 — The service worker caches 404s permanently, and serves HTML for missing scripts

**Evidence**
`sw.js:2` — the precache list `A` **omits** `x3f-progress.js`, `x3f-music.js`,
`x3f-fx.js`, `x3f-set.js`, `x3f-cal.js`, `sw.js` itself, and every file under `assets/`
`sw.js:6` — `caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(e.request,cp));return res}).catch(()=>caches.match('index.html')))`
`X3F_Routine.html:385` — `art.src='assets/form/'+slug+'.png'`; `find web/assets` shows **no `assets/form/` directory**

**Failures.**
1. `Cache.put` accepts a 404, so every miss on `assets/form/<slug>.png` is cached
   as a 404 under `x3f-v8`. Shipping the illustrated plates later will not fix the
   page until the cache name changes.
2. A first visit made offline (or an interrupted first load) hits the
   `.catch()` and returns **`index.html`** for a request to `x3f-progress.js` —
   the browser then throws `Uncaught SyntaxError: Unexpected token '<'`, `P` is
   `undefined`, and Progress renders as headings over empty divs.
3. `assets/ui/aurora.jpg` and the five `badge-*.jpg` are not precached, so the
   first offline load of Progress shows five blank medallion slots.

## D13 — `Progress` has no guard on `X3FProg`, so one script failure blanks the page

**Evidence**
`X3F_Progress.html:159` — `const P=window.X3FProg, EX=window.X3FEX;`
`X3F_Progress.html:163` — `const pr=P.program(), st=P.streak();` inside `renderToday()`
`X3F_Progress.html:354` — `refresh();` at top level, **not** in a try/catch

Compare `X3F_Routine.html:299` — `const P=window.X3FProg; if(!P)return;`

**Failure.** If `x3f-progress.js` fails to load (D12 case 2, a CDN-less offline
first run, or a syntax error from a future edit), `refresh()` throws on the first
line of `renderToday()`. Nothing after it runs: no challenge, no grid, no charts,
no achievements, and the three export buttons never get their handlers. The page
is a list of section headings with empty boxes.

## D14 — `Progress` fires its unlock celebration before `x3f-fx.js` exists

**Evidence**
`X3F_Progress.html:349` — `if(fresh.length){ try{ X3FFX.burst(null,null,'#ffd35c'); X3FFX.pulse(1); }catch(e){} }`
`X3F_Progress.html:354` — `refresh();`
`X3F_Progress.html:359` — `<script src="x3f-fx.js"></script>` — loaded **after**

**Failure.** The one moment the burst is for — opening the dashboard and seeing
new badges unlock from your last workout — is exactly the moment `X3FFX` is
`undefined`. The `catch` swallows it. The effect only ever fires on a *later*
`refresh()` (import, mark-challenge, delete-set).

## D15 — `X3F_Library.html` uses `??`, which is a hard syntax error on older WebViews

**Evidence**
`X3F_Library.html:71` — `function xget(k,d){try{return JSON.parse(localStorage.getItem('x3f_'+k))??d}catch(e){return d}}`

Nullish coalescing needs Chrome 80 (Feb 2020). A syntax error is thrown at
**parse** time, before the `try/catch` on line 71 exists.

**Failure.** On an Android TV WebView older than Chrome 80 the whole inline
script at :68-95 fails to parse. `#lib` stays empty; the page shows the header,
the method blurb, a note and an endcap, and nothing else — no movements at all.
`X3F_Routine.html:229` writes the same helper without `??`, so the risk is
Library-only and gratuitous. (Related, lower-impact: `min-height:100dvh` on
Library :16, Routine :18, Progress :17 requires Chrome 108; `index.html:16` uses
`min-height:100%`.)

## D16 — The charts and the 12-week grid are readable only via `title` tooltips

**Evidence**
`X3F_Progress.html:219` — `'<div style="height:…%" title="'+Math.round(v)+' '+unit+'"></div>'`
`X3F_Progress.html:195` — `'<div class="cell…" title="'+c.day+'"></div>'`

**Failure.** A TV remote has no hover. The reps-per-week chart, the peak-force
chart and the 84-day grid carry **no printed value anywhere** — the axis row
(`bars`, :220) only prints `12w … 2w now`. On the couch these three sections are
decorative shapes. (On touch the tooltip is equally unreachable.)

## D17 — Export silently does nothing on the TV

**Evidence**
`X3F_Progress.html:305-313`

```js
try{ const blob=…; const a=document.createElement('a');
     a.href=URL.createObjectURL(blob); a.download='x3f-history-'+P.today()+'.json';
     document.body.appendChild(a); a.click(); a.remove();
}catch(e){ /* fallback: dump JSON into #impBox */ }
```

**Failure.** The `try` guards *construction*, not the download. In the TV
WebView, `a.click()` on a `blob:` URL with `download` returns normally and no
`DownloadListener` is registered on the WebView, so nothing is saved and the
`catch` never runs — the copy-to-textarea fallback the comment promises (:311)
is dead code on the one platform that needs it.

## D18 — Sub-4.5:1 and sub-11px text throughout

**Evidence + measured contrast on `#06080e`**
`index.html:48` — `.hint{font-size:11.5px;color:#5d6a80}` → **3.66:1**, fails WCAG AA
`index.html:46` — `.note{font-size:12.5px;color:#6f7c92}` → 4.74:1, marginal
`X3F_Progress.html:89` — `.ach .at{font-size:9px}`
`X3F_Progress.html:55` — `.vollab{font-size:9.5px}`
`X3F_Progress.html:62` — `.pbrow .v small{font-size:9.5px}`
`X3F_Progress.html:45` — `.growrow .wk{font-size:10px}`
`X3F_Routine.html:97`, `X3F_Library.html:39` — `.detail .lbl{font-size:10px}`
`X3F_Routine.html:128` — `.sumgrid .k{font-size:10px}`

At 3 m on a 55" 1080p panel, 9px is ~1.5 arc-minutes of angular height — below
the acuity limit. The 10-foot override (`sync-from-web.py:91-100`) bumps
`.detail,.exhint,.muscle,.note,.prog` to 14px but leaves `.vollab`, `.ach .at`,
`.pbrow .v small`, `.growrow .wk`, `.day small`, `.gm .gu` and `.demotag`
untouched.

## D19 — Text sits directly on the animated aurora on the pages that load FX

**Evidence**
`x3f-fx.js:48-49` gives an opaque ground **only** to
`.card,.ex,.pbrow,.today,.chal,.pstrip,.ach,.demobox,.method,.cwrap,.sheet,.rest,.coach`.

Not in that list, but rendered over the moving canvas:
`X3F_Routine.html:35` `.day` (the Push/Pull/Custom tabs) ·
`X3F_Routine.html:40` `.prog` · `:42` `.mini` · `:45` `select` ·
`X3F_Library.html:27` `.cat` · `:43` `.gm` (all ~28 game buttons) ·
`X3F_Progress.html:24` `h2` (all nine section headings) · `:55` `.vollab` ·
`:66` `.achhead` · `:93` `.filters .chip` · `.note`, `.brand`, `a.home`.

**Failure.** The FX layer animates a `0.34`-alpha aurora plus drifting motes and
a 0.5-alpha grain pattern (`x3f-fx.js:120, 133-143, 169-176`). The *effective*
contrast of every one of those elements changes frame to frame, and the grain
sits directly under 9–12px type. The nine `h2` section labels — the entire
information architecture of Progress — are `#8593a9` at 12px on a moving image.

## D20 — The four pages carry four divergent copies of the design tokens

**Evidence**
`index.html:11-13` vs `X3F_Routine.html:16` vs `X3F_Library.html:13` vs `X3F_Progress.html:14`.

Concrete divergences:
- `--accent` / `--navring`: `#2ee6a6` on index, `#2ff0b0` on the other three.
- `--txt`: `#eaf2ff` vs `#eaf0fa`; `--dim`: `#8b97ad` vs `#8593a9`.
- `--panel`/`--brd`: **opaque** `#141824`/`#2a3346` on index, **translucent**
  `rgba(255,255,255,.05)`/`.09` on the other three; index has no `--brd2`.
- `--accentD` missing from Library; `--violet` missing from Routine; `--orange`
  missing from Progress; `--cyan` missing from index.
- `.gm.duel` uses the literal `#ff9a6a` (`X3F_Library.html:47`) which is in no
  token block, and differs from `--orange` `#ff9a5c` by 6 in one channel.
- The three showcase cards on index use `rgba(89,245,196,.4)`,
  `rgba(255,210,63,.45)` and `rgba(143,125,255,.5)` — none of which is
  `--accent`, `--gold` or `--violet`.

**Failure.** A palette change today requires four edits plus a hunt for
one-off literals, and the launcher already visibly disagrees with the pages it
links to (two different greens side by side once you navigate).

## D21 — Music and ambience stop at the launcher

**Evidence**
`X3F_Routine.html:530-535`, `X3F_Library.html:96-101`, `X3F_Progress.html:356-361`
all mount `X3FMusic.attach({mood:"menu", buttonHost:document.querySelector(".top")})`
and `X3FFX.mount({image:"assets/ui/aurora.jpg"})`.
`index.html` loads neither (only :148-150).

**Failure.** Navigate index → Library: the page fades in (FX), an aurora appears,
music starts, the focus ring starts breathing, and a `♪ Music on` button appears
in the header that was not on the previous page. Navigate back: all of it stops
and the page snaps rather than fades. The launcher is also the only page with no
`.top` bar, so there is nowhere for the music button to go.

## D22 — The header row overflows on a phone once the music button is injected

**Evidence**
`X3F_Routine.html:20` — `.top{display:flex;align-items:center;gap:8px;margin-bottom:14px}` (**no `flex-wrap`**)
`X3F_Library.html:18` — same, no wrap
`X3F_Progress.html:19` — `.top{…;flex-wrap:wrap}` ← the only one that wraps
`x3f-music.js:246-254` — appends `#musicBtn.home` into `.top`

**Failure.** At 360 px: Routine's header is `X3F ROUTINES` + spacer +
`Library` + `All games` + `♪ Music on` on one non-wrapping line. The flex items
shrink below their text or the row overflows the 16px gutter, depending on
`min-width` resolution. Library is the same. Progress wraps correctly — so the
three pages behave differently for no stated reason.

## D23 — Three parallel, non-communicating band stores

**Evidence**
`X3F_Library.html:74,91` — writes `x3f_libBand` only
`X3F_Routine.html:261` — reads the *global* `xget('band','White')` as the default,
writes into `x3f_routine2[day].per[slug].band` (:263)
grep for writers of `x3f_band`: only `X3F_Bloom.html:123`, `X3F_Flow.html:100`,
`X3F_Duel.html:94`, `X3F_Nova.html:135`, `X3F_Rhythm.html:95`,
`X3F_Splash.html:125`, `X3F_Ascent.html:105`, `X3F_Calibrate.html:85` — **no
menu page**

**Failure.** Set Deadlift to Black in the Library, launch Bloom from that row
(`?band=Black`), come back and open Routines: Deadlift is still on whatever
`x3f_band` was, because the Library never wrote it and Routine never reads
`x3f_libBand`. The user has told the app their band twice and it is wrong in the
place that matters.

## D24 — Routine's `.day` tabs are non-focusable `<div>`s

**Evidence**
`X3F_Routine.html:315` — `<div class="day…" data-d="${dn}" data-nav>…</div>` — no `tabindex`, no `role`
`x3f-nav.js:106` — `try { el.focus({preventScroll:true}) } catch(e) { … }` — a bare `<div>` silently refuses focus

**Failure.** The nav ring is applied by class so it *looks* focused, but DOM
focus stays wherever it was. `document.activeElement` is stale, `:focus-visible`
never matches, assistive tech announces nothing, and `x3f-nav.js:240`'s
`focusin` handler can never re-sync the cursor to these three tabs. The same
applies to `X3F_Progress.html:195` `.cell` (not `data-nav`, so no ring — but also
no way to read the date, see D16).

## D25 — `#demoArt` requests an image that does not exist, and never retries

**Evidence**
`X3F_Routine.html:384-385`

```js
const art=$('demoArt');art.style.opacity=0;art.onload=()=>{art.style.opacity=.9};art.onerror=()=>{art.style.opacity=0};
art.src='assets/form/'+slug+'.png';
```

`find web/assets -type f` → 18 files, none under `assets/form/`.
`sync-from-web.py:59-66` `ART` has no `assets/form` entry.

**Failure (today).** Every lift transition in the coach fires a 404 (cached by
the SW, see D12). **Failure (later).** Once plates ship, re-visiting a lift you
already saw sets `art.src` to the same string; the browser does not re-fire
`load` for an unchanged `src`, so `opacity` stays at the `0` set on the line
above and the plate never reappears.

## D26 — `challenge()` writes to storage from inside a read, on every render

**Evidence**
`x3f-progress.js:360-368` — `challenge()` ends with `if (hit) { markChallenge(); c.done = true; }`
`x3f-progress.js:385-391` — `markChallenge()` does `set(K_CHAL, …)`
Called from `X3F_Progress.html:178` (`renderChal`) and `X3F_Routine.html:301`
(`renderProgram`, which runs on **every** `render()` — i.e. on every select
change, every set tick, every day switch).

**Failure.** A pure-looking accessor performs a `localStorage` write on a hot
path. On Routine, ticking through five lifts issues ~15 redundant `x3f_chal`
writes plus the JSON round-trip, and the challenge can be marked done as a side
effect of a UI re-render rather than of an action.

## D27 — `renderProgram()` swallows every error, leaving a visibly empty panel

**Evidence**
`X3F_Routine.html:300-309` — the whole body is inside `try{ … }catch(e){}`
`X3F_Routine.html:148` — `<div class="pstrip" id="pstrip"></div>`
`X3F_Routine.html:26` — `.pstrip{…border:1px solid var(--brd);border-radius:16px;padding:12px 14px;margin-bottom:12px}`

**Failure.** Any throw inside (e.g. `X3FProg.challenge()` on a corrupt
`x3f_history`) leaves `#pstrip` as an empty 26px-tall bordered rectangle above
the day tabs — a visible empty box with no message and nothing in the console.

## D28 — Challenge tag prints raw metric names

**Evidence**
`X3F_Progress.html:182` — `(c.done?'Complete':(c.metric==='sets'?'One set':c.target+' '+c.metric))`
`x3f-progress.js:344,353` — metrics can be `'part'`, `'tut'`, `'peak'`, `'reps'`

**Failure.** The challenge tag renders "**9 part**" or "**48 tut**" — internal
field names shown to the user.

## D29 — Two competing tier vocabularies on the same badge

**Evidence**
`x3f-progress.js:456` — `TIER_WORDS = ['Initiate','Adept','Devotee','Master','Legend']`, used to *name* per-movement badges (:471)
`X3F_Progress.html:296` — `['Bronze','Silver','Gold','Platinum','Legend'][a.tier]`, used for the tier chip

**Failure.** A single card reads `Chest Press Adept` with the chip `SILVER`
beneath it, and `Deadlift Devotee` with `GOLD`. Two ladders, one object.

## D30 — 117 badges render at once, each starting a 3.4 s animation

**Evidence**
`X3F_Progress.html:292-296` — `$('achs').innerHTML = shown.map(…)` with no windowing
`X3F_Progress.html:82-85` — `.ach.got::after{…animation:achSheen 3.4s ease-out .2s 1}`
`X3F_Progress.html:289` — clicking a filter chip calls `renderAch()` again, replacing the whole grid

**Failure.** Every `renderAch()` inserts ~117 nodes (each with a background-image
and a positioned pseudo-element) and starts one composited animation per unlocked
badge. On the TV, tapping "Locked" then "All" restarts the whole wall twice while
`x3f-fx.js` and the music scheduler are also running. `refresh()` (:351) does
this on every import, every set delete and every challenge mark.

## D31 — index.html has no `[data-nav-back]`

**Evidence** grep on `index.html` returns `data-nav-first` only.
`x3f-nav.js:198-202` — `back()` → `if (history.length > 1) history.back(); else location.href='index.html'`

**Failure.** In a TV browser, Escape/BACK on the hub goes back to whatever the
user was on before (a search page, another site) rather than being a no-op or a
quit. In the PWA it exits the app.

## D32 — Routine renders twice on boot with an active session

**Evidence**
`X3F_Routine.html:520-524`

```js
render();
if(S&&S.active&&cfg[S.day]){ day=S.day;xset('routineDay',day);render(); openCoach(); }
```

`openCoach()` (:407) itself calls `render()` again when `S.day !== day` (:409) —
though that branch is dead here since `day` was just set.

**Failure.** Resuming a session rebuilds `#days`, `#list`, `#prog` and `#addSel`
twice, re-runs `renderProgram()` (and therefore `challenge()` and its write, D26)
twice, and re-binds every handler twice, before the coach opens.

## D33 — `data-nav-first` is declared twice on Routine

**Evidence** `X3F_Routine.html:151` (`#startSession`) and `:195` (`#cPlay`).
`x3f-nav.js:114-118` — `first()` returns `items.filter(hasAttribute('data-nav-first'))[0] || items[0]`.

This currently works because `visible()` (:31-48) rejects `#cPlay` while `.coach`
is at `opacity:0` — i.e. correctness depends on the overlay being hidden with
opacity rather than `display`. Any redesign that switches the overlay to
`display:none`/`hidden` or renders it into a portal changes which button the
remote lands on. Fragile, not yet broken.

## D34 — The empty-day message is styled as a footnote

**Evidence** `X3F_Routine.html:344` — `…join('')||'<div class="note">This day is empty — hit <b>Edit day</b> and add movements.</div>'`
`X3F_Routine.html:72` — `.note{color:var(--dim);font-size:12.5px;…;text-align:center}`

**Failure.** Selecting "Custom" shows a 12.5px grey centred sentence where the
whole workout list should be, with no visual weight and no button — while
"▶ Start guided session" sits above it in full accent-gradient, promising an
action that only produces a swallowed `alert()` on TV (D5).

---

# 3. Design weaknesses and opportunities, ranked

**1. There is no design system, only four sympathetic copies.**
Four token blocks (D20), four container widths (1000/780/820/880), three section
heading styles (`.sect` / `.cat` / `h2`) that are visually identical, two card
radii, two pill radii, gaps spanning eleven values and paddings spanning
twenty-two. The single highest-leverage move is one `x3f-ui.css` (or one
`:root` block included by all four) with a real ramp — space, radius, type,
elevation, motion — and zero literal hex in a page.

**2. Nothing is designed for 10 feet in the source.**
The only large-viewport rules in `web/` are absent; the 10-foot pass exists as a
`min-width:1200px` string inside `tools/sync-from-web.py:91-100` and reaches only
the three synced menu pages of the TV bundle. Consequences: `web/index.html`
gets no 10-foot treatment at all on any platform; the gh-pages build viewed on a
TV browser (TV Bro, the documented path) is phone-sized; and the type scale
cannot be reasoned about because half of it lives in a Python string. Move the
breakpoint into the shared CSS and delete the injection.

**3. The dashboard is a scroll of undifferentiated cards.**
Nine `h2` + `.card` pairs of equal weight (`X3F_Progress.html:113-149`). Nothing
signals what to look at, the two charts are visually identical apart from bar
colour, and the achievements wall (117 items) is 60% of the page height. There
is a hierarchy waiting to be built: *today* (streak, challenge, what to do next)
→ *the arc* (grid, week bars) → *the record* (PBs, recent) → *the collection*
(badges, behind a "see all"). This also fixes D7 and D30.

**4. The launcher is a different product.**
`web/index.html` (Sora, dark cards, `#2ee6a6`, no ambience, no music, 1000px)
versus `app/…/launcher.html` (Fredoka, bubbly, `.foc` ring, aurora, music,
`window.__x3fVersion`, a bar-picker modal). Two designs, two nav conventions,
zero shared CSS, and only one of them is generated from `web/`. Either fold the
launcher into the sync pipeline with a TV variant, or accept the fork explicitly
and give both the same tokens.

**5. `<select>` is the wrong control for a remote.**
Routine puts up to **four** selects per lift (`:331-334`) — game (10 options),
band (5), tempo (3), sets (5) — plus `#restSel` and `#addSel`. With D1 unfixed,
each is a focus trap; even fixed, changing a game means up to nine OK presses.
Segmented controls, a left/right stepper on a focused chip, or a full-screen
picker sheet are all better. Same for Library's per-movement band select.

**6. Two very different mental models of "a set" are on screen at once.**
The list shows pips + `Set 1/1` + a `.set` toggle; the coach shows a step
counter + a `.ctrack` progress bar + `Log set ✓`; the day tabs show `n/total`
(computed differently, D8); `#prog` shows `N / M sets done · x/y lifts`. Four
progress representations for one number. Pick one.

**7. Empty states are afterthoughts.**
`X3F_Routine.html:344` (empty day, D34), `X3F_Progress.html:203` (empty grid),
`:233` (no band advice), `:244` (no PBs), `:276` ("Nothing logged yet."). All are
grey 12.5–13px sentences. Meanwhile `renderCharts()` has **no** empty state — a
fresh install shows two rows of 12 two-pixel slivers with `max = Math.max(1,…)`
(`:218`). The first-run experience is the app's weakest screen.

**8. The colour system does not encode meaning consistently.**
Green means "accent", "done", "active tab", "primary CTA" and "unlocked" (five
jobs). Gold means "streak", "strongest range", "challenge pending", "tier 4",
"toast" and "warning". Cyan appears in `.detail .lbl`, the reps chart and one
gradient stop and nowhere else. Violet and hot are declared on two pages and used
on one. `.gm.duel` gets a colour with no token (D20). A redesign should assign
one job per hue and drop the unused ones.

**9. The information density is phone-first everywhere.**
`.desc` 13px / 1.5, `.detail` 12.5px / 1.5, `.exhint` 12.5px, `.muscle` 11.5px,
badge descriptions 11px. The Library shows 11 movements × (name + muscle + range
+ setup + cue + 2-3 buttons) in an 820px column — a wall of small grey text with
one 17px heading per block. There is no way to collapse a movement, no way to
filter to today's day, and no summary row.

**10. Focus feedback comes from two modules and one page never gets it.**
The base ring is in `x3f-nav.js:24-26`; the breathing + sheen is in
`x3f-fx.js:37-43`; index.html loads only the former. So the launcher — the page
a remote user lands on first — has the *least* legible cursor of the four. Focus
treatment should be part of the design system, not of the ambience module.

**11. Overlays are opacity-toggled, which is load-bearing in three places.**
`.coach`, `.rest` and `#done` all stay in the layout (`X3F_Routine.html:76,113`)
and rely on `opacity:0;pointer-events:none`. `x3f-nav.js:36-45` and
`:59` explicitly encode that (`parseFloat(cs.opacity) < 0.05`), `SCOPES` matches
`.coach.show,.rest.show` by class, and `first()` resolution depends on it (D33).
The redesign can change the visual treatment but must keep the class + opacity
contract, or update all three consumers together.

**12. No reduced-motion handling in the pages themselves.**
The global damper is `x3f-nav.js:27` (`@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms…}}`)
and `x3f-fx.js:25,51-52,194,219`. Only `X3F_Progress.html:86` has a page-level
guard (for `achSheen`). If the redesign drops or reorders those modules, the
`rise` stagger, the ring, the sheen and the page fades all become unguarded.

**13. Fonts are a hard network dependency with no fallback file.**
All four pages load Sora + Space Grotesk from `fonts.googleapis.com`
(index :9, Routine :14, Library :11, Progress :12). `sw.js:5` skips cross-origin
requests entirely, so an offline device — the stated target — falls back to
`system-ui`, and every `letter-spacing` and `clamp()` was tuned against the web
fonts. Self-host or design the fallback stack deliberately.

**14. Navigation between the three menu pages is asymmetric.**
Routine → Library, index. Library → Routine, index. Progress → Routine, Library,
index. **Neither Routine nor Library links to Progress** (except the post-session
`a.cta.ghost` at `X3F_Routine.html:220`). A shared, consistent header — same
order, same items, current page marked — is a cheap, large win.

**15. Small consistency items worth folding into the pass.**
`.endcap` exists on three pages and not on index (:52/:140/:102). `html{scroll-behavior:smooth}`
on three, missing on Routine. `min-height:100dvh` on three, `100%` on index.
`.filters .chip` (Progress :93) and `.chip` (Routine :101) are different
components with the same class name — a shared stylesheet would collide.
`.bar` means "the toolbar row" on Routine (:39) and "a progress bar" on Progress
(:34) — same collision. `.note` means a footnote on all four but also the empty
state on Routine (:344) and the grid caption on Progress (:118). `.strong` is a
badge, not an emphasis. Rename before sharing CSS.

**16. The `.gm` game buttons are the smallest touch/aim targets in the app.**
`X3F_Library.html:43` — `padding:9px 13px;min-width:86px`, 14px + 10.5px text,
~28 of them on one page, over the animated backdrop (D19).

---

# 4. Invariants — what a refactor must not break

Each has evidence. Most are enforced by the three suites in `tools/`.

## I1 — `[data-nav]` on every interactive element, `[data-nav-first]` and `[data-nav-back]` semantics

`x3f-nav.js:81` collects **only** `[data-nav]`. An element without it is
unreachable by remote, keyboard and gamepad. `data-nav-first` sets the landing
target per scope (`:114-118`); `data-nav-back` is what Escape/Backspace clicks
(`:198-201`). Any new control, and every control emitted from a template string,
must carry the attribute — note that `render()`/`renderAch()`/`renderRecent()`
all inject `data-nav` inside HTML strings (`X3F_Routine.html:331-342`,
`X3F_Progress.html:274,288`).

## I2 — Overlays must keep `.coach`/`.rest` class names and the opacity-toggle pattern

`x3f-nav.js:53` — `SCOPES = '.coach.show,.rest.show,.scrim.show,.modal.show,[data-nav-scope]'`
`x3f-nav.js:36-45,59` — visibility is decided by walking ancestors for
`display`, `visibility`, `opacity < .05`, `pointer-events:none`.
`tools/nav-audit/cases.js:43-53` drives `#cPending`, `#cLog`, `#restSkip`,
`#cClose` by id and asserts the cursor is trapped.
If the redesign renames these or switches to `display:none`, the modal trap
silently stops working and the remote walks the page underneath (the exact bug
`x3f-nav.js:49-52` was written to fix). A new overlay must either use these class
names or add `data-nav-scope`.

## I3 — `X3FNav.refresh()` after every DOM rebuild

`X3F_Routine.html:351`, `X3F_Library.html:92`, `X3F_Progress.html:289,352`.
Without it the cursor points at detached nodes and the ring is a lie
(`x3f-nav.js:85` comment).

## I4 — Element ids used by the test suites and the TV shell

Renaming any of these breaks a suite or the shell:

*Routine* — `startSession, restSel, editBtn, resetDay, addSel, addBtn, list,
days, prog, pstrip, adder, coach, cwrap, cClose, cStep, cPrev, cNext, cFill,
cPending, cPendingTxt, cPendYes, cPendNo, demoCv, demoArt, demoTag, cName,
cMuscle, cRange, cSetup, cCue, cChips, cPlay, cLog, cSkip, rest, ringFg, restCd,
restNext, restSkip, done, dSets, dLifts, dMin, dNote, dClose, dUndo, achToast`
(`tools/nav-audit/cases.js:34-53`, `tools/func-test/cases.js:106-135`)

*Library* — `lib`, and the structure `.ex` / `.gm` / `#lib select`
(`tools/func-test/cases.js:146-159` asserts **exactly 11 `.ex`**, `.detail >= 22`,
that the band choice sticks after re-render, and that launch hrefs carry
`band=` and `ex=`)

*Progress* — `today, chal, chalDone, grid, gridNote, vol, volLab, pk, pkLab,
advice, pbs, recent, achCnt, achFilters, achs, expBtn, impBtn, wipeBtn, impBox`
(`tools/func-test/cases.js:22-77`), plus the structural assertions:
**84 `#grid .cell`**, **12 `#vol div`**, **12 `#pk div`**, `.pbrow` rows,
`> 50` `.ach`, exactly **3** `#achFilters .chip`, `/of \d+ unlocked/` in `#achCnt`,
and a `[data-del]` on every recent row.

## I5 — Storage keys and their shapes

Every key in §1.6 is read by at least one other file. Specifically:
`x3f_routine2` is read by `x3f-progress.js:377` (`dayMovements`) to steer the
daily challenge; `x3f_history` is the sole source for the entire dashboard;
`x3f_session` is seeded directly by `tools/nav-audit/cases.js:39-41`;
`x3f_band` is read by `x3f-set.js:51` and by `X3F_Routine.html:261`;
`tools/func-test/func.js:41-46` seeds `x3f_ach, x3f_chal, x3f_prog,
x3f_routineProg2, x3f_session, x3f_exCal, x3f_routine2, x3f_band`.
The `x3f_` prefix is deliberate (`x3f-progress.js:2-4`: "nothing that can
conflict with anyone else's project").

## I6 — Launch URLs must keep `from`, `band`, `tempo`, `ex`

`x3f-exercises.js:135-142` builds them; `tools/func-test/cases.js:157-158`
asserts `band=Black` and `ex=[a-z-]+` survive a Library re-render;
`x3f-set.js` resolves the movement from `?ex=` to log the set against the right
exercise. `mode=` is added for the three Arena modes (`zone`/`max`/`boss`).
Also: `window.X3FFILES` must still be *readable by `x3f-exercises.js` before it
runs* (`sync-from-web.py:82-87` injects it before `</head>`), so no menu page may
move `<script src="x3f-exercises.js">` above the head injection point.

## I7 — Band defaults to the user's current band, never to `ex.band`

`X3F_Routine.html:256-261` (the comment explains the regression) and
`tools/func-test/cases.js:92-101`:

> `ok('every lift starts on the band you are on', bandSels.length > 0 && offBand.length === 0)`
> `ok('the library suggestion is still shown as advice', /X3 suggests/.test(...))`

The "X3 suggests …" string at `X3F_Routine.html:328` is asserted by name.

## I8 — One set per movement is the default and is labelled as such

`X3F_Routine.html:238` — `['1','1 set · X3 standard']` first, with the rationale
at :235-237. `tools/func-test/cases.js:90` asserts
`document.querySelector('#list select[data-k="sets"]').value === '1'`.
ROADMAP.md opens with the same rule.

## I9 — Never use a blocking dialog for a workout-flow message

`X3F_Routine.html:271-273` states the rule; `tools/nav-audit/audit.js:16-21`
documents that a blocking `alert()` once wedged the audit for 500 s; the shell
auto-confirms (D5). The toast (`toastAch`, :274-290) is the sanctioned pattern.
A redesign must keep a non-blocking notification channel — and should extend it
to the four remaining dialogs.

## I10 — Undo must remove both the logged set and the progress mark

`X3F_Routine.html:490-501` (with the comment "A mis-tapped Log set used to be
permanent, and it quietly poisons personal bests") and
`tools/func-test/cases.js:126-135` asserts `P.sets().length === afterLog - 1`
after `#dUndo`.

## I11 — Achievements must be re-evaluated on every dashboard refresh, not only at boot

`X3F_Progress.html:344-350` (the comment: "a badge that only appears after a
reload looks broken"). `refresh()` must keep calling `P.checkAchievements()`
before the renderers.

## I12 — Guided work must be logged against the movement even when no game ran

`X3F_Routine.html:445-451` (comment: "so the dashboard, challenges and
achievements all see guided work even when the game itself logged nothing") and
`tools/func-test/cases.js:115-118` asserts the logged set names both the
movement and the band.

## I13 — The `.endcap` end-of-list affordance

`X3F_Routine.html:131-132`, `X3F_Library.html:50-52`, `X3F_Progress.html:100-102`
carry the same comment: "so hitting the bottom reads as the bottom instead of
the page just refusing to move". Bottom margin is `calc(80px + var(--sab))` —
it is also the only thing giving a D-pad user room to scroll past the last item.

## I14 — Safe-area padding and `viewport-fit=cover`

All four: `padding:calc(Npx + var(--sat)) … calc(Mpx + var(--sab))` with
`--sat/--sab` from `env(safe-area-inset-*)`. Required for the notch/home-bar on
iOS standalone (`apple-mobile-web-app-status-bar-style: black-translucent`).

## I15 — `x3f-fx.js` owns the only animation loop on a menu page

`x3f-fx.js:5-14` — it must not run inside games, and on the launcher it
*replaced* the bubble loop. The counterpart obligation is that a menu page must
not add a second loop; `X3F_Routine.html` already violates the spirit via the
never-destroyed form rig (D10).

## I16 — `x3f-fx.js` supplies the panel backgrounds

`x3f-fx.js:46-50` hard-codes the selector list
`.card,.ex,.pbrow,.today,.chal,.pstrip,.ach,.demobox,.method,.cwrap,.sheet,.rest,.coach`.
Renaming a panel class without updating that string makes the panel translucent
over a moving aurora (the exact bug the comment at :45-47 describes fixing).
This is the single most brittle coupling in the whole menu layer.

## I17 — `sync-from-web.py` must keep working, unchanged if possible

`tools/sync-from-web.py` does purely textual transforms and will silently
half-apply if the pages change shape:

- `SW_RE = re.compile(r"<script>if\('serviceWorker'in navigator\).*?</script>")`
  matches the registration **byte-for-byte** (`:77`). Reformatting that line
  ships a service worker into a `file://` WebView.
- `MANIFEST_RE = r'<link rel="manifest"[^>]*>'` (`:78`).
- `LINKS` rewrites `href="index.html"` etc. — **only in double quotes with no
  query string** (`:69-75,114-115`). A link written as `href='index.html'` or
  `href="index.html#top"` is not rewritten and dead-ends on the TV.
- `TV_BLOCK` is inserted before the **first** `</head>` (`:117`).
- `MENUS` maps exactly the three menu files; `web/index.html` is deliberately
  absent.
- Run `python tools/sync-from-web.py --check` as part of the refactor; it exits 1
  when the bundle is out of date.

## I18 — Bump `sw.js`'s cache name with any visual change

`sw.js:1` — `const C='x3f-v8'`; `sw.js:6` is **cache-first with no revalidation**.
Existing PWA installs will keep serving the old HTML/CSS from `x3f-v8`
indefinitely. A redesign that does not change `C` ships to nobody who already
visited. (It should also add the newly-required files to `A` — see D12.)

## I19 — The TV 10-foot overrides target these exact selectors

`sync-from-web.py:91-100` scales `.wrap, .cwrap, .exname, .cname, .detail,
.exhint, .muscle, .note, .prog, .day, .mini, .set, .play, select, .cta, .go`
at `min-width:1200px`, all with `!important`. Renaming or restructuring these
silently removes the TV type scale. Preferred fix: move the rules into the shared
CSS and delete them from the sync script (one change, both builds).

## I20 — `X3FEX` is the single source of movement truth

`x3f-exercises.js:1-5` and the header comments on both Library and Routine.
11 movements, `groups` (4 library sections), `days` (2 default routine days),
5 bands, 10 game keys. `setup` and `cue` contain markup and are injected with
`innerHTML` (`X3F_Library.html:85-86`, `X3F_Routine.html:426-427`) — that is
intentional and must be preserved, and it means those fields must never accept
user input.

## I21 — Local-only, no network, no account

ROADMAP "Deliberately not doing: A backend", `x3f-progress.js:1-4`,
`X3F_Progress.html:2-5`. The only network requests in the menus are the two
Google Fonts links. Adding a CDN, an analytics call or a remote asset breaks the
stated product constraint and the offline requirement.

## I22 — `prefers-reduced-motion` must remain honoured

`x3f-nav.js:27`, `x3f-fx.js:25,51-52,194,219`, `X3F_Progress.html:86`.

## I23 — Wake lock and SW registration blocks are duplicated verbatim on all four pages

`index.html:149-150`, `X3F_Routine.html:537-538`, `X3F_Library.html:103-104`,
`X3F_Progress.html:363-364`. `sync-from-web.py` deletes the SW one by regex
(I17). Keeping the wake lock is functionally required — a workout page that
sleeps mid-set is useless — but this is four identical copies begging to become
`x3f-boot.js`, and if it moves, `SW_RE` must move with it.

---

# 5. Suggested order of work (informational)

1. Extract one shared token/base stylesheet + a `x3f-boot.js`; delete the four
   token blocks and the four wake-lock copies. Fix D20, D21, D22, D15, and most
   of §3.1/§3.15 at once. Update `x3f-fx.js:48` in lockstep (I16).
2. Fix the focus-destroying re-render (D1) before any visual work — it is the
   single worst thing about using these pages on a remote, and a redesign that
   adds controls makes it worse.
3. Move the 10-foot pass out of `sync-from-web.py` into the shared CSS (I19,
   §3.2), then re-run `--check`.
4. Restructure Progress (D7, D16, D30, §3.3) and add nav anchors to every
   section.
5. Fix the data-integrity defects: D4 (history truncation), D2/D3 (session
   abandonment), D5 (silent destructive confirms), D8, D9.
6. Bump `sw.js` `C` and complete the precache list (I18, D12).
