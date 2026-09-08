# Audit — the program brain (`web/x3f-progress.js`) and the set reporter (`web/x3f-set.js`)

Read in full, line by line, on 2026-09-07. Every claim below is either quoted from
source with a `file:line` anchor or was reproduced by executing the real modules
under a Node `localStorage` shim (probe transcripts are inlined where they matter).

Files audited:

| File | Lines | Bytes | Notes |
|---|---|---|---|
| `E:/Fun/x3f-tv/web/x3f-progress.js` | 616 | 28,026 | IIFE, exports `window.X3FProg` |
| `E:/Fun/x3f-tv/web/x3f-set.js` | 177 | 8,344 | IIFE, exports `window.X3FSet` |

Both files are **byte-identical** to their generated twins
`E:/Fun/x3f-tv/app/src/main/assets/x3f-progress.js` and
`.../x3f-set.js` (verified with `diff`). `web/` is the source of truth;
`tools/sync-from-web.py` regenerates `app/` (`DEPLOY.md:6`, `DEPLOY.md:23`).
**Any change must be made in `web/` and synced, never edited in `app/`.**

---

## 1. Structural map

### 1.1 `x3f-progress.js` — module shape

Single IIFE, `"use strict"`, ES5 style throughout (`var`, `function`, no arrows,
no `let`/`const`, no template literals). The only post-ES5 APIs it uses are
`String.prototype.padStart` (`:34`), `Number.prototype.toLocaleString` (`:465`) and
`Array.prototype.forEach/filter/map/reduce`.

#### Constants

```js
var K_HIST = 'x3f_history', K_ACH = 'x3f_ach', K_CHAL = 'x3f_chal', K_PROG = 'x3f_prog';   // :25
var BANDS = ['White', 'Light Gray', 'Dark Gray', 'Black', 'Elite Black'];                   // :26
var KEEP_DAYS = 56, SOFT_CAP = 700;                                                         // :72
var TIER_WORDS = ['Initiate', 'Adept', 'Devotee', 'Master', 'Legend'];                       // :456
```

Plus two implicit thresholds inside `compact()`: the trigger `h.length <= 420`
(`:74`) and the trim `while (out.length > SOFT_CAP) out.shift()` (`:98`); and one
inside `bandAdvice()`: `row.reps >= 40 && row.count >= 2` (`:593`).

#### Complete function inventory (in file order)

| Line | Function | Exported | Purity | Notes |
|---|---|---|---|---|
| 28 | `get(k, d)` | no | read | `JSON.parse` + try/catch, `v == null ? d : v` |
| 29 | `set(k, v)` | no | **write** | returns `false` on throw — **return value never checked anywhere** |
| 32 | `dayKey(t)` | **yes** | pure | local Y-M-D; `t == null` ⇒ *today* |
| 36 | `keyMinus(key, n)` | **yes** | pure | negative `n` moves forward |
| 42 | `today()` | **yes** | pure | `dayKey()` |
| 45 | `history()` | **yes** | read | full `JSON.parse` of `x3f_history`, no validation |
| 52 | `logSet(o)` | **yes** | **write** | whitelists 13 fields; pushes; calls `compact`; `set(K_HIST)` |
| 73 | `compact(h)` | **yes** | pure fn, called for its result | rolls up >`KEEP_DAYS`; trims to `SOFT_CAP` |
| 103 | `removeSet(t)` | **yes** | **write** | filters by exact `t`; calls `bust()` |
| 109 | `lastSet()` | **yes** | read | `sets()[len-1]` — **array order, not time order** |
| 115 | `previous(slug, band, skipT)` | **yes** | read | last matching set, optionally skipping one `t` |
| 125 | `rev()` | no | read | `h.length + ':' + last.t` |
| 129 | `cached(name, fn)` | no | read | memo keyed on `rev()` |
| 135 | `bust()` | **yes** | mutates memo | |
| 137 | `sets()` | **yes** | read, cached | filters `k!=='session'` and (`k==='set'` \|\| `k==='roll'` \|\| `reps!=null` \|\| `g`) |
| 145 | `bandOf(e)` | no | pure | `e.band \|\| e.b \|\| null` |
| 148 | `pb(slug, band)` | **yes** | read | `{reps, peak, part, t}` |
| 159 | `pbTable()` | **yes** | read, cached | |
| 160 | `pbTableRaw()` | no | read | **skips entries with no `ex`** (`:163`) |
| 181 | `workoutDays()` | **yes** | read, **not cached** | `{ 'YYYY-MM-DD': count }` |
| 191 | `streak()` | **yes** | read | `{current, best, restUsed, today}` |
| 208 | `bestStreak(days)` | no | pure | 800-iteration cap |
| 228 | `program()` | **yes** | read | see §1.4 |
| 256 | `daysBetween(a, b)` | **yes** | pure | rounded ms/86400000 over local midnights |
| 262 | `grid()` | **yes** | read | 84 cells ending today |
| 273 | `seedFrom(str)` | no | pure | FNV-1a 32-bit |
| 278 | `rng(seed)` | no | pure | LCG (1664525 / 1013904223) |
| 286 | `challenge()` | **yes** | **WRITES** (`:367` → `markChallenge()`) | see §1.5 |
| 373 | `dayMovements(type)` | **yes** | read | `x3f_routine2` wins, else X3FEX day tags |
| 385 | `markChallenge()` | **yes** | **write** | `x3f_chal[today] = {done, at}`, trims to 200 |
| 392 | `challengesDone()` | **yes** | read | `Object.keys(x3f_chal).length` |
| 397 | `stats()` | **yes** | read, **not cached** | 24-field snapshot, two full passes over `sets()` |
| 458 | `catalogue()` | **yes** | pure-ish | rebuilds **117** badge objects + closures every call |
| 568 | `achievements()` | **yes** | read | catalogue × stats, adds `got`/`at`/`now` |
| 576 | `checkAchievements()` | **yes** | **write** | persists newly-passing ids into `x3f_ach` |
| 588 | `bandAdvice()` | **yes** | read | |
| 614 | `reset()` (inline) | **yes** | **write** | removes `K_ACH`, `K_CHAL`, `K_PROG` |

#### Export surface (`:604-615`) — 27 names

```js
window.X3FProg = {
  dayKey, today, keyMinus, daysBetween,
  history, sets, logSet, compact,
  removeSet, lastSet, previous, bust,
  pb, pbTable, workoutDays,
  streak, program, grid,
  challenge, markChallenge, challengesDone,
  stats, achievements, checkAchievements,
  dayMovements,
  catalogue, bandAdvice, BANDS,
  reset
};
```

### 1.2 Storage keys

| Key | Written by | Read by | Shape |
|---|---|---|---|
| `x3f_history` | `logSet` (`:63`), `removeSet` (`:106`); **also written raw** by every game's legacy `logSession` (e.g. `web/X3F_Arena.html:174`), by `web/X3F_Routine.html:474`, and by the importer `web/X3F_Progress.html:325` | everything | `Array<Entry>` (§1.3) |
| `x3f_ach` | `checkAchievements` (`:581`), importer (`X3F_Progress.html:326`) | `achievements` (`:569`) | `{ [badgeId]: unlockedAtMs }` |
| `x3f_chal` | `markChallenge` (`:390`) | `challenge` (`:288`), `challengesDone` (`:392`) | `{ 'YYYY-MM-DD': {done:true, at:ms} }`, ≤200 keys |
| `x3f_prog` | **nobody** — `set(K_PROG, …)` does not exist in the codebase | `program` (`:229`) | intended `{startedAt}`; always `{}` |
| `x3f_routine2` | `web/X3F_Routine.html:244,263,363,367,373` | `dayMovements` (`:376`) | `{ 'Push Day': {list:[slug], per:{}}, 'Pull Day': {...}, 'Custom Day': {...} }` |
| `x3f_band` | `web/X3F_Bloom.html:123` (`xset('band',…)`), `web/X3F_Ascent.html:105` | `x3f-set.js:51` | JSON string, e.g. `"White"` |
| `x3f_exCal` | `x3f-cal.js` | `x3f-cal.js` | fed by `x3f-set.js:146` |
| `x3f_session` | `web/X3F_Routine.html` (`xset('session',…)`) | `x3f-cal.js:87`, Bloom/Nova/Splash | `{active, i, sets, started, pending:{slug,game,at}}` |

### 1.3 History entry shapes

**`k:'set'` — written by `logSet` (`:52-65`):**

```js
var e = { t: o.t || Date.now(), k: 'set' };
['g','ex','band','reps','full','part','peak','secs','score','acc',
 'tut','ecc','n'].forEach(function (f) { if (o[f] != null) e[f] = o[f]; });
if (o.band) e.b = o.band;                 // keep the old field name too
```

| Field | Meaning | Written by |
|---|---|---|
| `t` | epoch ms, local-day-derived via `dayKey` | always |
| `k` | `'set'` \| `'roll'` \| `'session'` | `logSet`, `compact`, Routine |
| `g` | game slug (`bloom`, `flow`, `nova`, `splash`, `duel`, `rhythm`, `zone`, `max`, `boss`, `routine`) | callers |
| `ex` | movement slug from `x3f-exercises.js` | `?ex=` or explicit |
| `band` / `b` | band name; `b` is the legacy duplicate | both written when `o.band` truthy |
| `reps`, `full`, `part` | rep counts; `part` = partials past failure | rep games only |
| `peak` | peak force this set | games or the watcher |
| `secs`, `score`, `acc` | duration, game score, accuracy % | game-dependent |
| `tut` | seconds under tension | Arena zone, Bloom, the watcher |
| `ecc` | mean lowering seconds | Bloom only |
| `n` | number of underlying sets (rollups) | `compact`; **also accepted from callers** (`:57`) |

**`k:'roll'` — produced by `compact` (`:83-87`):**

```js
roll[k] = { t, k:'roll', n, g, ex, band, b, reps, full, part, peak, secs, tut, ecc };
```
`reps/full/part/peak/tut/ecc` are **maxima** across the day (`:91-93`); `secs` is a
**sum** (`:94`); `n` is a **count** (`:90`). `score` and `acc` are **dropped**.

**`k:'session'` — written only by `web/X3F_Routine.html:474`:**

```js
{ t: Date.now(), k:'session', g:'routine', day: day, sets: sets, mins: mins }
```
Deliberately excluded from `sets()` (`:140`).

**Legacy `logSession` entries** — every game still defines one, e.g.
`web/X3F_Arena.html:174`:

```js
h.push(Object.assign({t:Date.now(), b:band}, o)); while(h.length>250) h.shift();
```
These have no `k` but do have `g`, so `sets()` (`:141`) counts them.

### 1.4 How the 12-week program is derived (`:228-255`)

```js
var st = get(K_PROG, {});                       // :229  always {} — nothing writes K_PROG
var days = workoutDays();
var keys = Object.keys(days).sort();
var started = st.startedAt || (keys.length ? keys[0] : null);   // :232 first ever training day
var doneCount = keys.length;                    // :233 DISTINCT TRAINING DAYS, all time
var week = 0;
if (started) {
  var diff = Math.floor(daysBetween(started, today()) / 7);
  week = Math.min(12, Math.max(1, diff + 1));   // :238-239 pure calendar since day one
}
var phase   = week === 0 ? 'Not started' : (week <= 4 ? 'Foundation' : 'Growth');  // :241
var perWeek = week <= 4 ? 4 : 6;                                                   // :242
var nextType = (doneCount % 2 === 0) ? 'Push' : 'Pull';                            // :244
var thisWeekDone = keys.filter(k => daysBetween(k, today()) < 7).length;           // :245
```

Returned object: `{startedAt, active, week, phase, perWeek, workouts, thisWeek,
doneToday, todayType, nextType, weekProgress, complete}` (`:247-254`).

The header comment claims the week is "derived from what you have DONE, not from a
rigid calendar" (`:7-9`). **That is only true of `nextType`.** `week`, `phase` and
`perWeek` are pure wall-clock arithmetic from the first ever logged day, and are
never reset. See D1, D2, D3.

### 1.5 How the challenge is generated (`:286-370`)

1. `day = today()`; RNG seeded `seedFrom('x3f-challenge-' + day)` (`:299`).
2. `todaySlugs = dayMovements(program().nextType)` (`:294-295`).
3. `all = pbTable().filter(r => r.reps > 0 || r.peak > 0)` (`:296`).
4. `rows = all.filter(r => todaySlugs.indexOf(r.ex) >= 0)`; if empty, `rows = all` (`:297-298`).
5. If `rows` is still empty → `kind:'baseline'`, `metric:'sets'`, `target:1`, movement
   picked from `X3FEX.list` filtered to today's slugs, **band taken from the library's
   `m.band`** (`:314`).
6. Otherwise pick `row = rows[floor(r() * rows.length)]` (`:318`) and branch on a
   second `roll = r()` (`:320`):
   - `roll < 0.55` → **reps**, `target = max(3, round(row.reps × pct))`, `pct ∈ [.7,.75,.8,.85,.9]` (`:321-329`)
   - `roll < 0.8 && row.part > 0` → **partials**, `target = max(3, round(row.part × 0.75))` (`:330-337`)
   - `roll < 0.9 && row.tut > 20` → **tut**, `target = max(20, round(row.tut × 0.8))` (`:338-345`)
   - else → **peak**, `target = max(10, round(row.peak × fpct))`, `fpct ∈ [.8,.85,.9]` (`:346-354`)
7. `c.done` = the stored flag, **or** an auto-check over today's sets (`:360-368`),
   which calls `markChallenge()` as a side effect.

`c` shape: `{id, kind, title, detail, slug, band, target, metric, day, done}`.
`metric ∈ {'sets','reps','part','tut','peak'}`.

### 1.6 How streaks work (`:191-221`)

`streak()` walks backwards a day at a time from today (or yesterday when today is
unfinished — the "grace day", `:194`), maintaining a 7-slot sliding window of
examined days:

```js
if (has) count++; else gaps++;
win.push(has);
if (win.length > 7) { if (!win.shift()) gaps--; }
if (gaps > 1) break;                 // two rest days in a week: run is over   :202
```

Guard: if neither `cur` nor `cur-1` has training, the answer is `0` (`:196`).
Loop cap: **400 iterations** (`:197`). `best` = `max(count, bestStreak(days))`
(`:206`). `bestStreak` (`:208-221`) replays the same rule forward from the first
training day, resetting `run` on each double-gap, capped at **800 iterations**
(`:212`).

### 1.7 How achievements are generated (`:397-583`)

`stats()` (`:397-454`) builds a snapshot in two passes over `sets()`:

| Field | Derivation | Line |
|---|---|---|
| `totalReps` | `Σ reps × (k==='roll' ? n : 1)` | 404 |
| `totalPart` | `Σ part × (k==='roll' ? n : 1)` | 404 |
| `bestReps`, `bestPart`, `peak`, `bestTut`, `bestEcc` | maxima | 405-409 |
| `byEx[slug]` | `Σ reps` (**no `n` multiplier**) | 410 |
| `byBand[band]` | `Σ reps` (**no `n` multiplier**) | 411 |
| `guided` | count of entries with `g === 'routine'` | 412 |
| `bestDayVariety` | max distinct `ex` in one day | 424-428 |
| `burnSets` | count of entries with `part > 0` (**no `n`**) | 422 |
| `comeback` | any ≥7-day gap between consecutive training days | 430-432 |
| `fullWeeks` | 7-day blocks from the first training day meeting 4 (wk≤4) or 6 | 433-443 |
| `sessions` | `Σ (n ‖ 1)` | 447 |
| `days` | `Object.keys(workoutDays()).length` | 448 |
| `streak`, `bestStreak` | from `streak()` | 450 |
| `week` | from `program()` | 451 |
| `challenges` | `challengesDone()` | 451 |
| `bandsUsed`, `exUsed` | key counts | 452 |

`catalogue()` (`:458-566`) emits **117** badges from 21 `add(...)` sites (the header
comment says "10 templates … ~130 badges" (`:15`) and the ROADMAP says "16 templates"
— the real number is 117 across 21 groups). Composition:

| # | Group | Ids | Count |
|---|---|---|---|
| 1 | lifetime reps | `reps100…reps25000` | 6 |
| 2 | per-movement mastery | `ex-<slug>-{100,400,1000}` | 11×3 = 33 |
| 3 | band mileage | `band-<Band>-{200,1000}` | 10 |
| 3b | full spectrum | `band-all` | 1 |
| 4 | single-set partials | `part{5,10,20,35}` | 4 |
| 4b | lifetime partials | `partsum{200,1000,3000}` | 3 |
| 5 | streaks | `streak{3,7,14,30,60,90}` | 6 |
| 6 | program weeks | `week1…week12` | 12 |
| 7 | challenges | `chal{1,5,15,40,90}` | 5 |
| 8 | sets logged | `sess{1,10,25,50,100,200}` | 6 |
| 9 | guided | `guided{1,10,40}` | 3 |
| 10 | single-set reps | `set{25,40,60,80}` | 4 |
| 10b | breadth | `breadth` | 1 |
| 11 | peak force | `peak{150,250,350,450,600}` | 5 |
| 12 | full weeks | `fullweek{1,4,12}` | 3 |
| 13 | distinct days | `days{7,30,60,90}` | 4 |
| 14 | day variety | `fullday{3,5}` | 2 |
| 15 | comeback | `comeback` | 1 |
| 16a | slow negatives | `ecc{2,3,4}` | 3 |
| 16b | tension | `tut{60,120,240}` | 3 |
| 16c | burnout sets | `exburn{10,25}` | 2 |

Tier range is 0-4, matching the UI's
`['Bronze','Silver','Gold','Platinum','Legend'][a.tier]`
(`web/X3F_Progress.html:296`) and `assets/ui/badge-{0..4}.jpg` (all five files exist).

`achievements()` (`:568-574`) returns `{id, name, desc, tier, got, at, now}` per
badge. `checkAchievements()` (`:576-583`) persists everything newly passing and
returns the fresh list. **Unlocks are sticky** — once written to `x3f_ach` they are
never revoked, which is the only thing protecting the system from `stats()` moving
backwards.

### 1.8 `x3f-set.js` — module shape

Single IIFE, `"use strict"`. Uses `URLSearchParams` (`:42`) and `Object.assign`
(`:152`).

| Line | Function | Exported as | Purpose |
|---|---|---|---|
| 26 | `css()` | no | injects `<style>` once (`styled` guard `:25,27`) |
| 41 | `param(name)` | no | `?name=` from `location.search` |
| 48 | `band()` | no | `window.__x3fBand()` → `JSON.parse(localStorage['x3f_band'])` → `null` |
| 58 | `improvement(entry)` | `X3FSet.improvement` | "+5 reps, +20 peak vs last time" |
| 77 | `toast(title, sub)` | `X3FSet.toast` | one shared `.x3fs-toast` element, 3200 ms |
| 90 | `announce(fresh, hype)` | `X3FSet.announce` | at most 3 unlocks, hype or toast |
| 106 | `sample()` | no | 40 ms tick: `peak` max, `tut` accumulator |
| 115 | `startWatch(getForce, getRef)` | `X3FSet.watch` | starts a **never-cleared** `setInterval` |
| 124 | `now()` | no | `performance.now()` fallback `Date.now()` |
| 125 | `resetWatch()` | `X3FSet.reset` | zeroes `peak`/`tut` |
| 127 | `report(o)` | `X3FSet.report` | the whole log-a-set pipeline |
| 176 | `seen()` | `X3FSet.seen` | `{peak, tut}` live view |

Module state: `var watch = {on, peak, tut, last, getF, getR, timer}` (`:105`) —
`on` is declared and **never read or written**.

### 1.9 How a set gets logged, end to end

**Path A — the shared reporter (Arena, Duel, Flow, Nova, Rhythm, Splash):**

1. Page load: `X3FSet.watch(() => force, () => ref())`
   (`web/X3F_Flow.html:212`, `X3F_Arena.html:282`, `X3F_Duel.html:195`,
   `X3F_Nova.html:571`, `X3F_Rhythm.html:184`, `X3F_Splash.html:425`,
   `X3F_Bloom.html:478`). `force` is already floored by the movement's calibrated
   `lo` (`X3F_Bloom.html:159`: `force = Math.max(0, raw - baseline - calLo())`) and
   `ref()` is `X3FCal.span(slug, band)` (`X3F_Bloom.html:116`).
2. Set ends → `X3FSet.report({g, reps?, peak?, tut?, secs?, score?, hype?})`.
3. `report` (`:127-172`):
   - resolve `ex` = `o.ex ‖ ?ex= ‖ null` (`:132`); `band` = `__x3fBand() ‖ x3f_band` (`:133`)
   - copy + round numeric fields to 2 dp (`:135-137`)
   - `sample()` once more, backfill `peak`/`tut` from the watcher if the caller
     supplied none (`:139-141`)
   - `X3FCal.observe(ex, band, peak)` to auto-learn the ceiling (`:146`)
   - `resetWatch()` (`:147`)
   - snapshot `beforeBest = P.pb(ex, band)` (`:150`)
   - compute `improved = improvement({t: Date.now()+1, …entry})` **before** logging (`:152`)
   - `P.logSet(entry)` (`:154`) → §1.3 → `compact()` → `localStorage.setItem`
   - `P.checkAchievements()` (`:156`)
   - build `pbLine` from `beforeBest` (`:159-164`)
   - toast + `announce(fresh, o.hype)` unless `o.announce === false` (`:166-170`)
   - return `{logged, entry, fresh, improved, pb}` (`:171`)

**Path B — Bloom bypasses the reporter entirely.** `web/X3F_Bloom.html:280-294`
calls `X3FProg.logSet(...)` and `X3FProg.checkAchievements()` directly, then calls
`X3FSet.improvement(...)` afterwards for the toast (`:301-304`). It never calls
`X3FSet.report`, so `X3FCal.observe` is never fed from Bloom.

**Path C — guided Routine.** `web/X3F_Routine.html:447-451` calls
`X3FProg.logSet({g:'routine', ex:slug, band:per(slug).band})` — **no reps, no peak,
no partials**. `web/X3F_Routine.html:474` then appends a raw `k:'session'` entry and
truncates history with `while(h.length>250) h.shift()`.

**Path D — legacy fallback.** Every game keeps a `logSession()` that writes
`x3f_history` directly and truncates to 250 (`X3F_Arena.html:174` et al). It only
runs when `window.X3FSet` is falsy (`X3F_Arena.html:252`, `X3F_Rhythm.html:139`).

### 1.10 DOM and CSS produced by `x3f-set.js`

Only one element, created lazily and reused forever (`:79-80`):

```html
<div class="x3fs-toast on"><b>{title}</b><span>{sub}</span></div>
```

Injected CSS (`:29-37`), verbatim:

```css
.x3fs-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(14px);
z-index:80;display:flex;flex-direction:column;gap:2px;padding:12px 18px;border-radius:16px;
max-width:min(90vw,440px);background:rgba(8,12,22,.92);border:1px solid rgba(255,211,92,.45);
box-shadow:0 14px 40px rgba(0,0,0,.55);font-family:'Space Grotesk',system-ui,sans-serif;
opacity:0;pointer-events:none;transition:opacity .25s,transform .25s cubic-bezier(.2,.9,.25,1)}
.x3fs-toast.on{opacity:1;transform:translateX(-50%)}
.x3fs-toast b{font-size:15px;color:#ffd35c}
.x3fs-toast span{font-size:12px;color:#9fb0c8}
```

**None of it uses the design tokens the rest of the app defines.** The palette in
`web/X3F_Progress.html:14` is:

```css
:root{--bg:#06080e;--bg2:#0b0f18;--panel:rgba(255,255,255,.05);--brd:rgba(255,255,255,.09);
--brd2:rgba(255,255,255,.14);--txt:#eaf0fa;--dim:#8593a9;--accent:#2ff0b0;--accentD:#0fae82;
--gold:#ffd35c;--cyan:#37d6ff;--violet:#8f7dff;--hot:#ff5d78;--navring:#2ff0b0;
--d:'Sora',…;--n:'Space Grotesk',…;--sat:env(safe-area-inset-top);--sab:env(safe-area-inset-bottom);
--e:cubic-bezier(.2,.9,.25,1)}
```

`#ffd35c` is `--gold`; `cubic-bezier(.2,.9,.25,1)` is `--e`; `'Space Grotesk'` is
`--n`. `#9fb0c8` matches no token (`--dim` is `#8593a9`). `bottom:24px` ignores
`--sab` / `env(safe-area-inset-bottom)`, which every page respects
(`X3F_Progress.html:17`).

Observed `z-index` ceiling elsewhere: `x3f-hype.js:35` = 7, `x3f-form.js:523` = 6,
`X3F_Bloom.html:49` = 30, `x3f-nav.js:24` = 2. The toast sits at **80**.

---

## 2. Defects

Severity key — **S1** silent data loss or wrong persisted state · **S2** wrong
number shown / wrong behaviour · **S3** cosmetic, dead code, perf.

---

### D1 · S1 — `x3f_prog` is read but never written; the 12-week program can never restart

```js
var st = get(K_PROG, {});                                     // x3f-progress.js:229
var started = st.startedAt || (keys.length ? keys[0] : null); // :232
week = Math.min(12, Math.max(1, diff + 1));                   // :239
```

`grep -rn "K_PROG"` finds exactly three hits: the declaration (`:25`), this read
(`:229`) and `localStorage.removeItem` in `reset()` (`:614`). **Nothing ever calls
`set(K_PROG, …)`.** So `startedAt` is always the first ever training day and `week`
is a monotonically increasing clamp.

Failure scenario — reproduced:

```
=== C. program() has no restart; week pinned at 12 ===
{"startedAt":"2025-08-03","active":true,"week":12,"phase":"Growth","perWeek":6,
 "workouts":2,"thisWeek":1,"doneToday":true,"todayType":"Done","nextType":"Push",
 "weekProgress":0.166…,"complete":false}
```

A user who finishes cycle 1 and starts cycle 2 is told "Week 12 · Growth" forever.
`complete` (`:253`) is computed but **consumed nowhere** (`grep -rn "\.complete\b"`
over all HTML/JS returns nothing), so nothing even announces the end of the program.

---

### D2 · S2 — one ancient set jumps a returning user straight to Week 12

Same code path. Reproduced:

```
=== D. old single set -> instant week 12 ===
week from one set a year ago: 12 phase Growth
```

Failure scenario: someone tries the app once in 2025, comes back a year later, logs
their first real set. `program()` reports Week 12 / Growth / 6 workouts a week, and
`checkAchievements()` immediately awards **all twelve** `week1…week12` badges
(`:498-503`, `s.week >= w`) — permanently, because unlocks are sticky (`:579`).

---

### D3 · S2 — dropping the oldest history day flips Push/Pull and rewinds the week

```js
var doneCount = keys.length;                        // :233
var nextType = (doneCount % 2 === 0) ? 'Push' : 'Pull';   // :244
```

`keys` is *distinct training days present in the log*. `compact()` deletes days off
the front (`:98 while (out.length > SOFT_CAP) out.shift();`), and the importer
truncates to the last 600 (`X3F_Progress.html:325`). Reproduced:

```
=== E. nextType parity flips if an old day is dropped ===
3 days -> Pull
drop oldest -> Push
```

Failure scenario: you finish Push on Monday expecting Pull on Tuesday. Overnight a
compaction shifts one 2024 day off the front. Tuesday's card says **Push**, the
challenge switches to push movements, and you train the same half of your body twice.
The same `keys[0]` shift moves `startedAt` forward, so `week` can go **down**.

---

### D4 · S1 — compaction inflates `totalReps` and deflates `burnSets`

The rollup stores the day's **maximum** reps but `stats()` multiplies it by the
**count** of sets:

```js
['reps','full','part','peak','tut','ecc'].forEach(function (f) {
  if ((+e[f] || 0) > r[f]) r[f] = +e[f] || 0;      // bests survive   :91-93
});
…
totalReps += r * (e.k === 'roll' ? mult : 1);      // :404  max × n
```

while `byBand` / `byEx` on the very next lines do **not** multiply (`:410-411`), and
`burnSets` counts a rollup as one set (`:422`). Reproduced:

```
=== A. compaction inflates totalReps ===
before: totalReps 516 sessions 434 burnSets 4 days 51
after : totalReps 534 sessions 434 burnSets 1 days 51
deadlift roll: {"t":…,"k":"roll","n":4,"ex":"deadlift","band":"Black",
                "reps":26,"part":2,…}
```

Four sets of 20/20/20/26 became `{reps:26, n:4}` = 104 counted reps instead of 86,
while `burnSets` fell from 4 to 1.

Failure scenario: the `reps25000` "Rep Bank" badge (`:464-467`) unlocks early and
`byBand`-driven "Black Mileage 1000" (`:476-481`) does not — the two counters
disagree by construction after any compaction, and the dashboard's weekly volume
chart (`X3F_Progress.html:209-215`, which sums raw `e.reps` with no `n`) disagrees
with both.

---

### D5 · S1 — `SOFT_CAP` deletes *recent* history when nothing is old enough to roll up

```js
var KEEP_DAYS = 56, SOFT_CAP = 700;                  // :72
if (h.length <= 420) return h;                       // :74
if (day > cutoff) { keep.push(e); return; }          // :79  (never rolled)
while (out.length > SOFT_CAP) out.shift();           // :98  (oldest first)
```

If every entry is inside the 56-day window, `roll` is empty, `keep` is everything,
and the trim just deletes the oldest 140 entries outright. Reproduced with 60
Splash runs a day for 14 days:

```
=== N. SOFT_CAP drops RECENT history when all entries are inside KEEP_DAYS ===
entries: 840 days: 14 totalReps 4200
after compact: 700 rolls: 0
days after: 12 totalReps after: 3500 (lost 700 reps)
```

Two whole training days and 700 reps gone, permanently, with no rollup. This
directly contradicts the module's own promise: *"The grid, the PBs and the totals
all survive indefinitely"* (`:70-71`). It is also the interaction that makes ROADMAP
item #2 ("Score games log per run") a data-loss bug rather than an accounting one:
Splash, Nova, Duel, Rhythm and Arena all report per run/match/round
(`X3F_Splash.html:211`, `X3F_Nova.html:286`, `X3F_Duel.html:153`,
`X3F_Rhythm.html:139`, `X3F_Arena.html:247`).

---

### D6 · S1 — compaction turns a Routine `k:'session'` summary into a counted set

`compact()` (`:77-95`) has no filter on `e.k`, so a `k:'session'` entry older than
56 days becomes a `k:'roll'`, and `sets()` (`:141`) explicitly counts `k === 'roll'`.
Reproduced:

```
=== F. session summary becomes a counted set after compaction ===
sets() before compaction (session excluded): 0 sessions total 430
is the old session now a roll? true
{"t":…,"k":"roll","n":1,"g":"routine","band":null,"b":null,"reps":0,…}
```

Failure scenario: every guided workout adds a phantom set to `sessions`, a phantom
training day to `workoutDays()` (and therefore to the streak, the grid and
`doneCount`/`nextType` parity), and a `g:'routine'` entry to the `guided` counter —
all 56 days after the fact, so the numbers change on their own long after the
workout. The session's own `sets`/`mins`/`day` fields are discarded. Its rollup key
is `day + '|' + '' + '|' + ''` (`:80`), which **collides with** any Arena/Nova/Splash
set logged without `ex` or `band` on the same day, merging them into one entry.

---

### D7 · S1 — `logSet` cannot fail, but `set()` can

```js
function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; }
                     catch (e) { return false; } }      // :29
…
set(K_HIST, h);
return e;                                                // :63-64  return value ignored
```

`x3f-set.js:154` then reports success unconditionally: `return { logged: true, … }`
(`:171`). Reproduced:

```
=== W. logSet silently loses the set when storage is full ===
logSet returned: {"t":…,"k":"set","ex":"deadlift","band":"Black","reps":30,"b":"Black"}
but sets() is 0
```

Failure scenario: localStorage is full (the app also stores `x3f_exCal`,
`x3f_routine2`, music state, per-game bests). The user finishes a set, sees
"Set logged · +5 reps vs last time", and nothing was written. Every subsequent set
is lost the same way, silently, forever.

---

### D8 · S1 — an entry with no `t` is dated *today*, permanently

```js
function dayKey(t) {
  var d = t == null ? new Date() : (t instanceof Date ? t : new Date(t));   // :33
```

Reproduced:

```
=== K. entry with no t counts as today ===
workoutDays: {"2026-09-07":1} streak 1 week 1
```

Failure scenario: an imported or hand-edited history (the export/import path at
`X3F_Progress.html:299-337` does no validation at all) contains one entry without
`t`. It is counted as a workout **every day forever**, keeping the streak alive
indefinitely and marking today done. `rev()` (`:127`) also becomes
`"N:undefined"`, which is stable, so the memo never notices.

---

### D9 · S1 — `removeSet` deletes every entry sharing a timestamp

```js
h = h.filter(function (e) { return e.t !== t; });        // :105
```

Reproduced:

```
=== L. removeSet deletes every entry sharing a timestamp ===
removed: 2 left: 1
```

Failure scenarios:
- `web/X3F_Progress.html:277-280` renders one ✕ per recent row and calls
  `P.removeSet(+b.dataset.del)`. Clicking one row deletes every set that shares its
  millisecond.
- Rollups carry `n` sets under a single `t`. The recent list even prints
  `· {n} sets rolled up` (`X3F_Progress.html:271`) next to that ✕. **One click on a
  rollup silently erases an entire day of training.**
- `X3F_Routine.html:492-501` undo calls `removeSet(lastSet().t)` but only decrements
  `doneSets` by 1, so the per-lift progress and the log go out of sync.

---

### D10 · S2 — the daily challenge is *not* deterministic for the day

The header promises "deterministic for the date" (`:12`) and the engine test only
checks two back-to-back calls (`tools/func-test/engine.html:91-92`). The RNG seed is
per-day, but the *candidate pool* it indexes into changes as you train:
`rows` comes from `pbTable()` (`:296`) and from `program().nextType` (`:295`), both
of which move during the day. Reproduced:

```
=== H. challenge changes mid-day as you log ===
c1 reps-2026-09-07 deadlift    24  nextType Pull
c2 reps-2026-09-07 chest-press 22  nextType Push
SAME challenge same day? false
```

Two compounding causes:
1. `nextType` flips the moment today becomes a training day (`:244` counts today),
   so finishing your Push workout swaps the challenge to Pull movements for the rest
   of the day.
2. A new movement entering `pbTable()` changes `rows.length` and therefore
   `rows[floor(r() * rows.length)]` (`:318`).

Note the `id` stays `reps-2026-09-07` while the movement and target change, so
anything keyed on the id (nothing today, but it is the obvious key) would be wrong.

---

### D11 · S2 — a challenge for one movement is satisfied by an unrelated game

```js
if (c.slug && e.ex && e.ex !== c.slug) return false;   // :363
if (c.metric === 'sets') return true;                  // :364
```

The `e.ex &&` guard means **any entry without a movement passes the filter**.
Reproduced:

```
=== S. baseline challenge satisfied by an unrelated score game ===
challenge: baseline overhead-press
done after an unrelated Splash run? true
```

Failure scenario: today's challenge is "Set your first benchmark — Overhead Press".
The user opens Splash from the launcher (no `?ex=`), plays one 30-second run, and the
challenge auto-completes, `x3f_chal` is written, and the `chal*` badge family
advances. The same hole applies to reps/part/tut/peak challenges: a launcher-launched
Arena max-effort set with `peak: 500` completes a *Deadlift* peak challenge.

---

### D12 · S2 — `challenge()` is a getter that writes to localStorage

```js
if (hit) { markChallenge(); c.done = true; }            // :367
```

Reproduced:

```
=== R. challenge() writes to localStorage on read ===
x3f_chal before any call: null
x3f_chal after ONE challenge() read: {"2026-09-07":{"done":true,"at":1788837741040}}
```

`challenge()` is called from three render paths — `X3F_Progress.html:178`
(`renderChal`), `X3F_Routine.html:301` (`renderProgram`, which runs after every
logged set) and the Android launcher. Every repaint can mutate storage. It also
means the read is not idempotent across a `reset()`.

---

### D13 · S2 — `bestStreak` is capped at 800 days and `streak` at 400

```js
for (var i = 0; i < 400; i++) {                          // :197
for (var i = 0; i < 800 && cursor <= last; i++) {        // :212
```

Reproduced (1000 consecutive training days):

```
=== P. bestStreak 800-day cap ===
current streak (400 cap): 400 best: 800 (true answer 1000)
```

Failure scenario: a long-term user's real best streak is silently truncated. Because
`bestStreak` walks *forward from the first training day*, the cap also means a
90-day streak achieved in year 3 is never seen at all, so `streak90` never unlocks.

---

### D14 · S2 — `grid().future` is always `false`; the grid's week numbers are fiction

```js
var start = keyMinus(today(), 83);                                   // :264
for (var i = 0; i < 84; i++) {
  var k = keyMinus(start, -i);
  out.push({ day: k, done: !!days[k], future: daysBetween(k, today()) < 0 });   // :266-267
}
```

The window ends on today, so `daysBetween(k, today())` is never negative.
Reproduced: `any future cell? false`. The CSS rule
`.cell.future{background:rgba(255,255,255,.02)}` (`X3F_Progress.html:49`) is
therefore dead.

Worse, `X3F_Progress.html:192` labels the rows `1…12` as program weeks, but `grid()`
returns a **trailing 84-day window** anchored on today. Failure scenario: a user in
program week 3 sees a grid whose "Week 12" row is the current week and whose
"Week 1" row is 12 weeks ago — the opposite of what the label says.

---

### D15 · S2 — three incompatible definitions of "a week" in one engine

| Definition | Site | Anchor |
|---|---|---|
| rolling 7 days ending today | `program().thisWeek` (`:245`) | today |
| trailing 84-day window in rows of 7 | `grid()` (`:264-268`) | today − 83 |
| 7-day blocks from the first ever training day | `stats().fullWeeks` (`:435-442`) | first training day |

Failure scenario: the dashboard says "4 of 4 workouts this week" (rolling) while
`fullWeeks` — which drives the `fullweek1/4/12` "Perfect Week" badges (`:532-535`) —
counts a different, non-overlapping set of seven days and does not increment.

---

### D16 · S2 — `thisWeek`, `pb`, `week` and `nextType` all accept future-dated entries

```js
var thisWeekDone = keys.filter(function (k) { return daysBetween(k, today()) < 7; }).length;  // :245
```

A negative `daysBetween` satisfies `< 7`. Reproduced with an entry dated three days
from now:

```
=== Q. future-dated entry counts toward this week and today ===
program: {"week":1,"thisWeek":1,"workouts":1}  grid shows it? false
pb sees the future set: 99
```

Failure scenario: a device with a wrong clock (or an import from one) writes a set in
the future. It counts toward the weekly target and personal bests, unlocks badges,
and shifts Push/Pull parity — but it is invisible in the grid, so nothing explains
the mismatch. Nothing anywhere clamps `t` to `<= Date.now()`.

---

### D17 · S1 — `catalogue()` awards the top-tier "Whole Program" badge on the first set when `X3FEX` is missing

```js
var moves = window.X3FEX ? window.X3FEX.list : [];                         // :461
…
add('breadth', 'Whole Program', 'Log a set of every movement in the library', 4,
  function (s) { return s.exUsed >= Math.max(1, moves.length); });         // :524-525
```

**Four game pages load `x3f-progress.js` without `x3f-exercises.js`:**

```
X3F_Arena.html   x3f-cal.js  x3f-progress.js  x3f-set.js  x3f-music.js
X3F_Duel.html    x3f-cal.js  x3f-progress.js  x3f-set.js  x3f-music.js
X3F_Flow.html    x3f-cal.js  x3f-progress.js  x3f-set.js  x3f-music.js
X3F_Rhythm.html  x3f-cal.js  x3f-progress.js  x3f-set.js  x3f-music.js
```

Reproduced:

```
=== G. breadth badge with X3FEX missing ===
catalogue size without X3FEX: 84
breadth passes on one movement? true
catalogue size with X3FEX: 117 breadth now? false
```

Failure scenario: a user's very first set is in Flow. `checkAchievements()` runs with
a 84-badge catalogue, `Math.max(1, 0) === 1`, `exUsed` is 1, and the tier-4 "Legend"
badge **Whole Program** is written to `x3f_ach` permanently. The 33 `ex-*` mastery
badges also silently do not exist on those four pages, so the "N of M unlocked"
count and the achievement wall differ depending on which page last evaluated.

---

### D18 · S2 — Bloom compares each set against *itself*

`web/X3F_Bloom.html` logs first (`:282`) and *then* asks what improved (`:302`),
passing a fresh `t`:

```js
X3FProg.logSet({g:'bloom',ex:EXSLUG,band:band,reps:reps,…});          // :282
…
const line=X3FSet.improvement({ex:EXSLUG,band:band,reps:reps,part:burnoutReps,
                               peak:Math.round(setPeak),t:Date.now()});  // :302
```

`previous(slug, band, skipT)` skips only on exact timestamp equality (`:117`
`e.t !== skipT`), and `Date.now()` at `:302` is a different millisecond from the one
baked in at `:282`, so the just-logged set is returned as "previous". Reproduced:

```
=== BLOOM ORDER BUG ===
Bloom order  -> "first set of this movement on Black"
correct order-> "+5 reps, +2 partials, +20 peak vs last time"
```

Failure scenario: in Bloom — the flagship movement game — the "what improved" toast
either reads "first set of this movement on Black" (when the entry compares against
itself and no earlier one is found by the skip) or "level with last time", **never**
the real delta. `x3f-set.js:152` gets the order right; Bloom, which does not use
`report()`, does not.

---

### D19 · S2 — the personal-best toast is instantly overwritten by the achievement toast

```js
if (pbLine) toast('Personal best', pbLine);
else if (o.quiet !== true && improved) toast('Set logged', improved);
announce(fresh, o.hype);                                            // :167-169
…
function announce(fresh, hype) {
  …
  (function next() { … })();          // :93-99  runs SYNCHRONOUSLY
}
```

`toast()` reuses one shared element and replaces its `innerHTML` (`:79-81`). The
first achievement toast fires in the same tick.

Failure scenario: you set a rep PB *and* cross an achievement threshold in the same
set — the single most rewarding moment the app has — and the "Personal best: 30 reps
(was 22)" line is on screen for zero frames. A real `report()` return from the probe
shows both firing together: `"fresh":[…5 badges…], "pb":"new best: 30 reps (was 22)"`.

Secondary timing bug: the toast hides after 3200 ms (`:84`) but the next one is
scheduled at 3400 ms (`:98`), so consecutive achievement toasts flash off for 200 ms.

---

### D20 · S2 — the force watcher accumulates between sets, and only Bloom resets it

```js
watch.timer = setInterval(sample, 40);                        // :122  never cleared
…
if (f > watch.peak) watch.peak = f;
if (r > 0 && f > r * 0.15) watch.tut += dt;                   // :112-113
…
resetWatch();                                                 // :147  END of report()
```

`X3FSet.watch(...)` is installed at page load in every game
(`X3F_Flow.html:212` and siblings). `resetWatch()` runs only at the *end* of
`report()`, and `X3FSet.reset()` is called at set start by **Bloom only**
(`X3F_Bloom.html:269`) — and Bloom does not use `report()`.

Failure scenario: open Flow, tension the bar for 30 s while finding your position
pulling 380, then run a 10-rep set peaking at 200. `entry.peak == null` so the
watcher's 380 is used (`:140`), it is logged as the set's peak, it beats
`beforeBest.peak` so "new peak: 380" is announced, it becomes the movement's PB —
and `X3FCal.observe(ex, band, 380)` (`:146`) permanently raises the auto-learned
ceiling, which then rescales every game's display for that movement+band
(`x3f-cal.js:120-127`).

Related: the 40 ms interval never stops, so a paused game page keeps a 25 Hz timer
and a live closure over the game's `force` running for the life of the document.
There is no `stopWatch` in the export surface (`:174-176`).

---

### D21 · S1 — a set is silently discarded when `X3FProg` is absent

```js
if (!P) return { logged: false, entry: entry, fresh: [], improved: '' };   // :148
```

Reproduced: `{"logged":false,"entry":{"g":"rhythm","ex":null,"band":"Black","score":900},…}`
— nothing written, no toast, no fallback. The games' `logSession` fallback only
triggers on `!window.X3FSet` (`X3F_Arena.html:252`, `X3F_Rhythm.html:139`), not on
`!window.X3FProg`.

Failure scenario: `x3f-progress.js` 404s or throws on one page of the bundle. That
page's sets vanish with no user-visible symptom whatsoever. Note also the failure
branch returns a different object shape from the success branch (no `pb` key,
`entry` has no `t`).

---

### D22 · S2 — an explicit `peak: 0` discards a real watcher reading

```js
if (o[f] != null && !isNaN(+o[f])) entry[f] = Math.round(+o[f] * 100) / 100;  // :136
…
if (entry.peak == null && watch.peak > 0) entry.peak = Math.round(watch.peak); // :140
```

`0 != null`, so `entry.peak === 0`, so the backfill is skipped. Reproduced:
`logged peak: 0`.

Failure scenario: Arena max mode reports `peak: Math.round(xAttempt)`
(`X3F_Arena.html:252`). Any timing where `xAttempt` reads 0 (the round expired
mid-transition) discards the watcher's genuine peak and logs a zero-force set.

---

### D23 · S2 — challenges name numbers that do not exist

`all` admits a row on peak alone (`:296 r.reps > 0 || r.peak > 0`) but the reps
branch does not re-check (`:321-329`). Reproduced:

```
=== I. reps challenge on a peak-only row ===
{"kind":"reps","title":"Match 80% of your best",
 "detail":"3 reps of Deadlift on Black. Your best is 0.","target":3,"metric":"reps"}
```

The mirror case exists in the peak branch (`:347-353`, `Math.max(10, …)` on
`row.peak === 0` → "10 peak on X. Your best is 0.").

Failure scenario: a user whose only logged work is guided Routine sets
(`X3F_Routine.html:448` logs no reps and no peak) or Arena max sets (peak only) is
handed a challenge that reads "Your best is 0" — and the reps target of 3 is trivially
met by anything, so it auto-completes.

---

### D24 · S2 — the baseline challenge prescribes the library's band, not the user's

```js
band: seedMove ? seedMove.band : null,                    // :314
```

Reproduced with `x3f_band = "White"`:

```
=== J. baseline challenge band comes from the library ===
{"kind":"baseline","detail":"Run one all-out set of Overhead Press …",
 "slug":"overhead-press","band":"Light Gray",…}
```

This is precisely the bug that was already fixed on the Routines page — see
`X3F_Routine.html:256-261` ("It used to default to `ex.band`, so starting a day on
White and walking to the next lift silently moved you up to Dark Gray — a setting
you never chose") and its regression test at `tools/func-test/cases.js:92-99`. The
challenge generator still does it.

Failure scenario: a beginner on White is told to benchmark Chest Press on Dark Gray
(`x3f-exercises.js:12`) — a band they may not own and cannot lift.

---

### D25 · S2 — `challengesDone()` silently caps at 200 and the count can go *down*

```js
var keys = Object.keys(st).sort();
while (keys.length > 200) { delete st[keys.shift()]; }    // :388-389
set(K_CHAL, st);
…
function challengesDone() { return Object.keys(get(K_CHAL, {})).length; }   // :392
```

Reproduced:

```
=== T. markChallenge caps challengesDone at 200 ===
stored 205, challengesDone reports 205
after markChallenge: 200
```

Completing a challenge can make the completed-challenge count go *down* by five.
The `chal*` badges top out at 90 (`:505`) so nothing is currently un-earnable, but
`stats().challenges` is a lie past day 200 and any new tier above 200 is unreachable.

Separate weakness in the same area: `markChallenge()` is wired to a plain
"Mark done" button with no verification (`X3F_Progress.html:183-185`), so the whole
`chal` badge family is farmable with one tap a day.

---

### D26 · S2 — `guided` counts sets, the badge says "workouts"

```js
if (e.g === 'routine') guided++;                                        // :412
…
add('guided' + n, 'Coached ' + (i + 1), n + ' guided workout' + (n > 1 ? 's' : ''), …
  function (s) { return s.guided >= n; });                              // :515-518
```

Reproduced:

```
=== M. guided counts SETS not workouts ===
one guided workout of 5 lifts -> guided = 5
```

Failure scenario: "Coached 3 — 40 guided workouts" unlocks after 8 real workouts.
The default Push Day has five movements (`x3f-exercises.js:103`).

---

### D27 · S3 — `bandAdvice` never retires

```js
if (row.reps >= 40 && row.count >= 2) { …                             // :593
```

`pbTableRaw` already records `row.last` (`:175`) but `bandAdvice` ignores it.
Reproduced:

```
=== U. bandAdvice never retires ===
[{"ex":"chest-press","from":"White","to":"Light Gray","reps":45,
  "why":"45 full reps on White means it is no longer heavy in your strong range."}]
```

— produced from a log where the last three hundred days were all on **Black**.

Failure scenario: the dashboard permanently nags "Move Chest Press up to Light Gray"
for a user who moved past Light Gray a year ago. The advice card
(`X3F_Progress.html:229-234`) is the *only* place the app coaches progression, which
is described in the ROADMAP as "the hardest judgement call in the program"
(`ROADMAP.md:13-14`).

---

### D28 · S3 — `pbTable` shows a `?` band, and hides every set without a movement

```js
if (!e.ex) return;                                       // :163  entire entry dropped
var b = bandOf(e) || '?';                                // :164
```

Reproduced: `[{"ex":"deadlift","band":"?","reps":20,…}]`, which
`X3F_Progress.html:239` renders as **"? band · 1 set"**.

Failure scenario A: a user who plays only Nova/Splash/Arena from the launcher (no
`?ex=`) trains hard for a month and the Personal Bests table stays empty, and
`challenge()` can never leave the baseline state because `all` is built from
`pbTable()` (`:296`).
Failure scenario B: a game whose `__x3fBand()` returns falsy produces a literal
`? band` row.

---

### D29 · S3 — read-modify-write on `x3f_history` with no coordination

```js
var h = history(); … h.push(e); h = compact(h); set(K_HIST, h);       // :54-63
```

No storage-event listener, no versioning, no merge. In the browser build, opening
`X3F_Progress.html` in one tab while a game runs in another means the second writer
overwrites the first's set entirely. `bust()` is only called by `removeSet` (`:106`),
and the memo key is `length + ':' + lastT` (`:127`), so an external write of the same
length with the same trailing timestamp is invisible to the cache.

Also note `h.push(e)` with a caller-supplied `o.t` (`:55`) appends out of order, and
`lastSet()`/`previous()` both read **array order** (`:111`, `:119`), not time order.
Only `compact()` sorts (`:97`), and only above 420 entries.

---

### D30 · S3 — unescaped `innerHTML` in the toast

```js
el.innerHTML = '<b>' + title + '</b><span>' + (sub || '') + '</span>';   // x3f-set.js:81
```

`sub` is built from `improvement()`, which interpolates the band string returned by
`window.__x3fBand()` or `localStorage['x3f_band']` (`:63`). Low practical severity
(local-only storage), but it is a live HTML-injection sink in the one function every
game funnels its user-facing text through, and the same pattern recurs at
`X3F_Routine.html:284` and `X3F_Progress.html:292-296`.

---

### D31 · S3 — dead code, dead fields, dead parameters

| Item | Evidence |
|---|---|
| `var … best = 0` in `streak()` — assigned, never read | `x3f-progress.js:195` |
| `watch.on` — never read or written | `x3f-set.js:105` |
| `c.metric === 'reps' ? 'reps' : c.metric` — a no-op ternary | `x3f-progress.js:365` |
| `String(n).replace('.', '')` on `2.0/3.0/4.0` — always a no-op (`String(2.0) === "2"`) | `x3f-progress.js:551` |
| `(window.X3FEX ? window.X3FEX.list : []).map(function (e) { return e; })` — pointless copy | `x3f-progress.js:289` |
| `program().complete` — computed, consumed nowhere | `x3f-progress.js:253` |
| `achievements().now` — computed, consumed nowhere | `x3f-progress.js:572` |
| `o.announce` / `o.quiet` — no caller ever passes either | `x3f-set.js:166,168` |
| `.cell.future` CSS — unreachable (D14) | `X3F_Progress.html:49` |
| `'1 sets logged'` — the `sess1` badge description | `x3f-progress.js:511` |
| Header comment says "10 templates … ~130 badges"; the ROADMAP says 16 templates; the real count is 117 across 21 groups | `x3f-progress.js:15`, `ROADMAP.md:34` |

---

### D32 · S3 — `stats()` is O(days × weeks) and nothing above `sets()` is cached

```js
for (var off = 0; off <= daysBetween(first, last); off += 7) {
  var wkStart = keyMinus(first, -off);
  var inWeek = dayList.filter(function (d) { … }).length;      // :435-439
```

A full `dayList.filter` per week. For 1,000 training days that is ~143 × 1,000
comparisons *per `stats()` call*. `stats()` (`:397`), `workoutDays()` (`:181`),
`streak()` (`:191`), `program()` (`:228`), `grid()` (`:262`) and `catalogue()`
(`:458`) are all uncached, and `X3F_Progress.html:343-353` calls
`checkAchievements()` **and** `achievements()` in the same `refresh()` — that is two
full `stats()` builds and two 117-badge catalogue constructions per repaint, on a TV
SoC. `cached()` (`:129`) also calls `rev()` → `history()` → a full `JSON.parse` of the
log on **every** cache hit, so the memo saves the filter but not the parse.

---

### D33 · S3 — the toast ignores the app's design system and TV safe areas

Covered structurally in §1.10. Concretely: `bottom:24px` with no
`env(safe-area-inset-bottom)` while every page uses `--sab`
(`X3F_Progress.html:17`); hardcoded `#ffd35c`/`#9fb0c8`/`rgba(8,12,22,.92)` instead of
`--gold`/`--dim`/`--bg2`; `z-index:80` against a codebase ceiling of 30
(`X3F_Bloom.html:49`); `max-width:min(90vw,440px)` uses CSS `min()`, which an older
Android TV WebView will drop entirely, leaving the toast unconstrained.

---

### D34 · S1 (cross-file, but it defeats this engine's core design) — three writers still truncate `x3f_history` to 250

```js
while(h.length>250)h.shift();
```
- `web/X3F_Arena.html:174`, `X3F_Bloom.html:124`, `X3F_Duel.html:77`,
  `X3F_Flow.html:101`, `X3F_Nova.html:136`, `X3F_Rhythm.html:78`,
  `X3F_Splash.html:126` — legacy `logSession`, fallback-only today.
- **`web/X3F_Routine.html:474` — not a fallback. It runs unconditionally at the end
  of every guided session.**

Failure scenario: a user with 600 compacted entries finishes a guided workout.
`endSession()` reads the history, appends the session summary, and **shifts 351
entries off the front**, destroying months of rollups that `compact()` was built to
preserve. `KEEP_DAYS`/`SOFT_CAP` cannot defend against it because it writes the key
directly. The importer has the same shape: `mine.slice(-600)`
(`X3F_Progress.html:325`).

---

## 3. Design weaknesses and opportunities, ranked

**W1 — There is no program state, only a log.** `x3f_prog` is a phantom (D1). The
engine has no notion of "cycle 2", no deload, no explicit start/restart, and no
record of *when* the user chose to begin. Everything is re-derived from the log on
every read, which is why dropping one old entry can rewind the week (D3) and why a
year-old set makes you Week 12 (D2). *Opportunity:* write `x3f_prog` for real —
`{startedAt, cycle, restartedAt}` — and derive week from `startedAt` with an explicit
"start a new cycle" action when `week >= 12`.

**W2 — Compaction is the single largest correctness hazard.** D4, D5, D6 and D34 all
live in or around `compact()`. It is lossy in ways `stats()` does not model (max × n),
it can delete recent data, it promotes excluded entries into counted ones, and three
other files bypass it entirely. *Opportunity:* separate the **event log** (append-only,
capped, disposable) from a **derived ledger** (per-day/per-movement/per-band totals,
maintained incrementally, never lossy). PBs, streaks and totals read the ledger; the
grid and "recent sets" read the log. That removes the max-vs-sum ambiguity and makes
the 250-entry truncations harmless.

**W3 — `sets()`'s predicate is the real schema, and it is a heuristic.**
`e.k === 'set' || e.k === 'roll' || e.reps != null || e.g` (`:141`) is the only thing
deciding what counts as training. Adding one new entry kind means auditing every
consumer. *Opportunity:* an explicit `kind` enum plus a schema `v` on every entry, and
a one-time migration that stamps existing entries.

**W4 — "Deterministic per day" is the challenge system's core promise and it is
false** (D10). Compounded by the mid-day `nextType` flip and by challenges that
grade themselves against the wrong sets (D11). *Opportunity:* generate the challenge
**once per day**, persist `{id, slug, band, metric, target}` into `x3f_chal[day]`
alongside `done`, and grade only against sets whose `ex` matches exactly.

**W5 — Nothing validates or versions imported/stored data.** `history()` returns
whatever parses as an array (`:47`). The importer (`X3F_Progress.html:315-337`)
merges arbitrary JSON on a `t|ex|reps` dedupe key and truncates to 600. D8 (missing
`t`), D16 (future `t`) and D28 (`?` band) are all downstream of that.
*Opportunity:* a `normalise(entry)` gate on read and import — clamp `t` to
`[firstPlausible, Date.now()]`, drop entries with no `t`, coerce numerics, canonicalise
band names against `BANDS`.

**W6 — Three independent implementations of "which movement is this page for".**
`x3f-cal.js:82-91` (URL → `x3f_session.pending.slug`), `x3f-set.js:132` (URL only —
**no session fallback**), and hand-rolled copies in `X3F_Bloom.html:259-260`,
`X3F_Nova.html:561`, `X3F_Splash.html:416`. The reporter's is the weakest of the
three, and it is the one that decides what gets logged. *Opportunity:* `X3FSet`
should call `X3FCal.slug()` (or a shared `X3FCtx.slug()`), and the three inline
copies should be deleted.

**W7 — Bloom is a second, divergent logging path.** It calls `logSet` +
`checkAchievements` + `improvement` itself (`X3F_Bloom.html:280-304`), which is why
it has D18 and why it never feeds `X3FCal.observe`. It is also the only game that
records `ecc`. *Opportunity:* move Bloom onto `X3FSet.report({... , ecc, hype})` and
delete the duplicate. This alone fixes D18 and makes `ecc` available to every game.

**W8 — The reward moment is badly sequenced** (D19) and capped at 3 (`x3f-set.js:94`).
On a first import, dozens of badges unlock at once and 3 are shown. *Opportunity:* a
queue with a "+N more" summary, PB first, and unlock announcements ranked by tier.

**W9 — Nothing distinguishes a set from a run.** Splash/Nova/Duel/Rhythm/Arena log
one entry per attempt, which inflates `sessions`, `burnSets` and `days`-adjacent
counters and drives D5. ROADMAP item #2 already names this. *Opportunity:* a
`kind:'run'` entry class that `sessions` counts once per movement per day, or a
debounce in `report()`.

**W10 — Guided Routine sets carry no numbers.**
`logSet({g:'routine', ex, band})` (`X3F_Routine.html:448`) means a Routine-only user
has an empty `pbTable`, a permanently-baseline challenge (D23), no PBs, no band
advice, and no `improvement()` line. *Opportunity:* prompt for reps/partials on the
log-set button, or derive them from the game the lift was played in.

**W11 — `x3f-set.js` owns presentation it should not.** It injects CSS, owns a
singleton DOM node, hardcodes the palette (D33), and decides between hype and toast.
*Opportunity:* make the reporter return a structured result and let a single
`X3FToast`/`X3FFeedback` module (shared with `X3F_Routine.html:274-290`'s duplicate
`toastAch`) own the presentation, using the real tokens.

**W12 — Performance** (D32). Two `stats()` builds and two catalogue constructions per
dashboard repaint, a full `JSON.parse` per cache *hit*, an O(weeks × days)
`fullWeeks` loop, plus a permanent 25 Hz interval per game page (D20).
*Opportunity:* build `catalogue()` once at module scope; cache `stats()`, `program()`,
`streak()`, `grid()` and `workoutDays()` on the same `rev()`; cache the parsed history
itself; and precompute `fullWeeks` from a day-index map.

**W13 — `Custom Day` is invisible to the engine.** `dayMovements` builds the key as
`type + ' Day'` for `type ∈ {Push, Pull}` (`:374`), but `X3F_Routine.html:242` offers a
third day, `'Custom Day'`. A user who trains only from Custom Day gets challenges
drawn from Push/Pull lists they never use.

**W14 — `upright-row` is unreachable by design.** It is tagged `day:'alt'`
(`x3f-exercises.js:82`), and `dayMovements` matches only `push`/`pull`/`legs`
(`:381`). It is in no routine day and no challenge, yet the `breadth` badge requires
`exUsed >= 11` (`:525`) — i.e. a movement the program never asks for.

**W15 — The web and Android builds diverge at the launcher.**
`app/src/main/assets/launcher.html` loads `x3f-exercises.js` + `x3f-progress.js` and
renders a programme strip; `web/index.html` loads only `x3f-nav.js` and renders none.
`tools/func-test/cases.js:313-344` tests the launcher strip, so the web build's home
screen is functionally untested and has no program surface at all.

**W16 — Achievements are unrevokable but their inputs are not monotonic.** `stats()`
can move backwards (D3, D5, D25, D34). Stickiness (`:579`) is the only thing keeping
the wall from visibly un-earning badges, which means every counter bug is
permanently baked into a user's profile the first time it fires.

---

## 4. Invariants a refactor MUST NOT break

Each is load-bearing, with the evidence that pins it.

**I1 — `x3f_history` is the one and only source of truth, local-only, no server.**
`x3f-progress.js:1-4`, `ROADMAP.md:54`, `DEPLOY.md`. Five other files read or write it
directly (`X3F_Progress.html:300,320,325`; `X3F_Routine.html:474`; every game's
`logSession`). Changing the key or the top-level type (array) breaks all of them
silently — `history()` returns `[]` on anything non-array (`:47`).

**I2 — Both band field names must keep working.** `logSet` writes `band` *and* `b`
(`:56-60`), `bandOf` reads `band || b || null` (`:145`), the seed fixture writes both
(`tools/func-test/func.js:36`), and legacy `logSession` entries only have `b`
(`X3F_Arena.html:174`). Dropping `b` orphans every pre-v1.1 entry.

**I3 — Days are local calendar days, never UTC.** `dayKey` uses
`getFullYear/getMonth/getDate` (`:34`) with the explicit rationale "A workout at 11pm
belongs to that day" (`:31`). `keyMinus` and `daysBetween` both reconstruct local
midnights (`:38`, `:258`) so DST shifts round away. Any move to `toISOString()` moves
late-evening workouts to the wrong day and silently breaks streaks.

**I4 — Day keys are `YYYY-MM-DD` and are compared as strings.**
`compact()` does `if (day > cutoff)` (`:79`) and `bestStreak` does `cursor <= last`
(`:212`). Zero-padding (`:34`) is what makes that correct.

**I5 — One rest day per rolling week keeps a streak alive; today is a grace day.**
`:190-206`, restated in `ROADMAP.md:196` ("Streaks that punish rest" is on the
*deliberately not doing* list). Six engine assertions pin the exact numbers:
`tools/func-test/engine.html:26-46` — 1, 3, 2, 4, 3, 0, ≥13.

**I6 — `week === 0` on an empty log.** `:234-236` carries the explicit comment
"Reporting week 1 here would hand out the 'Week 1' badge to someone who has never
trained", and it is listed as a shipped fix (`ROADMAP.md:58`). Test:
`engine.html:114` — `checkAchievements().length === 0` on an empty log.

**I7 — Weeks 1-4 are 4×/week (Foundation); weeks 5-12 are 6×/week (Growth).**
`:241-242`. Tests: `engine.html:52-60`.

**I8 — Push/Pull alternate from the count of *training days*, not the calendar.**
`:244`, comment at `:225-227`. Tests: `engine.html:54-56`.

**I9 — The grid is exactly 84 cells.** `:265`. Tests: `engine.html:61`,
`tools/func-test/cases.js:27` (`#grid .cell` length === 84), and
`X3F_Progress.html:191-198` hard-codes a 12 × 7 loop that would throw on `undefined`
if the length changed.

**I10 — Personal bests are per movement *and* per band.** `:151-152`, `:165`.
Tests: `engine.html:69-72`. `x3f-set.js:150` depends on it for the PB callout.

**I11 — A challenge asks for *less* than your best.** `:283-285` ("a daily 'beat
your PB' is a daily failure"), percentages at `:322`, `:331`, `:339`, `:347`. Test:
`engine.html:94-97` asserts `c1.target < best`. `ROADMAP.md:35-38` states it as
product policy.

**I12 — With no history the challenge is `kind:'baseline'`.** `:302-316`. Test:
`engine.html:88`.

**I13 — Challenges must name movements from *today's* day.** `:294-298`, `:371-383`.
Tests: `engine.html:182-197`, including "deadlift is not a push movement" and "an
edited day list wins". `dayMovements` must keep preferring `x3f_routine2` over the
library tags (`:376-377`), and must keep treating `legs` as belonging to both days
(`:381`).

**I14 — Badge ids are stable and unique; unlocks are never revoked.** `x3f_ach` is
`{id: timestamp}` (`:579`), `achievements()` reads `got[a.id]` (`:571`). Tests:
`engine.html:111-112` (no duplicate ids), `:118` ("unlocks are not handed out
twice"). **Renaming any id orphans a user's unlocked badge and silently re-locks it.**
The ids are also parsed by prefix for glyphs in `X3F_Progress.html:250-257`, so the
prefix scheme (`streak`, `week`, `chal`, `sess`, `guided`, `part`, `exburn`, `band`,
`peak`, `ecc`, `tut`, `days`, `fullweek`, `fullday`, `comeback`, `breadth`, `set`,
`reps`, `ex-`) and its match **order** are load-bearing.

**I15 — Tiers are integers 0-4.** `X3F_Progress.html:296` indexes
`['Bronze','Silver','Gold','Platinum','Legend'][a.tier]` and `:293` builds
`assets/ui/badge-{tier}.jpg` (files `badge-0.jpg` … `badge-4.jpg` exist and no
others). A tier 5 renders `undefined` and a broken image.

**I16 — Achievements must be evaluated on dashboard refresh, not only at boot.**
`X3F_Progress.html:343-350` with the comment "a badge that only appears after a
reload looks broken"; listed as a shipped fix (`ROADMAP.md:57`).

**I17 — One set produces exactly ONE history entry.** `X3F_Bloom.html:274-276`
("also calling the legacy logSession would double-count every rep") and the
regression test `tools/func-test/cases.js:261-264` ("exactly one history entry per
set"). This is why `logSession` is in an `else` branch at `X3F_Bloom.html:295`.

**I18 — Rollups must preserve bests, distinct training days, and session counts.**
`:91-93` (`bests survive`), `:90` (`n` so "session counts stay honest"), header
`:67-71`. Tests: `engine.html:151-156` — shrinks, keeps recent, creates rolls,
`stats().days` unchanged, `pb().reps` preserved, `sessions >= 0.9 × before`.
`X3F_Progress.html:271` renders `r.n` as "· N sets rolled up".

**I19 — `previous()` must be able to skip the set being reported.** `:117`
`e.t !== skipT`. Test: `engine.html:177`. `x3f-set.js:152` relies on being called
*before* `logSet` for the same effect.

**I20 — `removeSet` returns the number removed and is a no-op on an unknown `t`.**
`:107`. Tests: `engine.html:165-167`. `X3F_Routine.html:492-501` and
`X3F_Progress.html:277-280` are both built on it.

**I21 — `reset()` clears badges and challenges but NEVER the training log.**
`:614`, and the user-facing promise at `X3F_Progress.html:339` — "Clear unlocked
achievements and challenge history? Your training log is kept."

**I22 — Every field a game reports must round-trip.** `logSet`'s whitelist
(`:56-57`) is the contract documented at `x3f-set.js:12-17`. Tests:
`engine.html:127-132` (`ex`, `part`, `pb`), `:202-208` (`tut`, `ecc`),
`cases.js:266-267` (`part`, `peak`), `cases.js:305-307` (`score`, watcher `peak`, and
that a score game logs **no** `reps`). Dropping `acc`, `score`, `secs` or `full` from
the whitelist would silently blank existing dashboard rows
(`X3F_Progress.html:264-269`).

**I23 — The band the game actually pulled wins over stored state.**
`x3f-set.js:44-54` — `window.__x3fBand()` first, then `x3f_band`. Every game defines
`__x3fBand` (`X3F_Arena.html:167`, `X3F_Ascent.html:102`, `X3F_Bloom.html:113`,
`X3F_Duel.html:84`, `X3F_Flow.html:90`, `X3F_Nova.html:123`, `X3F_Rhythm.html:85`,
`X3F_Splash.html:115`). Reversing the order re-introduces the "guided Routine
overrode your band for one run and it logged the wrong one" bug.

**I24 — `x3f_band` is JSON-encoded, not raw.** Written via
`xset('band', v)` → `JSON.stringify` (`X3F_Bloom.html:104,123`;
`X3F_Ascent.html:105`), read via `JSON.parse` (`x3f-set.js:51`).

**I25 — `X3FCal.observe` may only be fed a peak while the movement's floor is 0.**
`x3f-cal.js:112-119` spells out the reasoning; `x3f-set.js:146` is the only caller.
The peak handed over is the game's *floored* force (`X3F_Bloom.html:159`), so relaxing
`x3f-cal.js:123`'s `if (e && !e.auto) return;` without un-flooring the peak corrupts
every calibration.

**I26 — Achievement unlocks must never use a modal.**
`x3f-set.js:87-89` ("Never a dialog - a modal mid-workout on a TV has to be dismissed
with the remote") and the same rule restated at `X3F_Routine.html:271-273`. The
`hype`-if-present, toast-otherwise fallback (`:96-97`) and the `hype.say(title, sub,
huge)` signature (`x3f-hype.js:265`) are the contract.

**I27 — `X3FSet.watch(getForce, getRef)` may be called at page load, repeatedly, and
must never throw.** Every game wraps it in `try{}catch(e){}` at `load`
(`X3F_Flow.html:212` and siblings). `getRef` returns the calibrated **span**, not the
ceiling (`X3F_Bloom.html:116`), and the tension threshold is 15 % of it
(`x3f-set.js:113`).

**I28 — `X3FSet.seen()` must report live, un-reset values.** `X3F_Bloom.html:284`
reads `X3FSet.seen().tut` at the moment the set ends, having called `X3FSet.reset()`
at set start (`:269`).

**I29 — Every entry point degrades silently.** `logSession` fallbacks
(`X3F_Arena.html:252`), `if(window.X3FProg)` guards (`X3F_Bloom.html:280`,
`X3F_Routine.html:447,493`), `if (!P) return` (`x3f-set.js:60,148`), try/catch around
every storage touch. Nothing may start throwing at a caller — but D21 shows this has
gone too far and now hides real failures.

**I30 — `web/` is the source of truth; `app/src/main/assets/` is generated.**
`DEPLOY.md:6,23,42`, `ROADMAP.md` notes. The two copies of both files are currently
byte-identical; `python tools/sync-from-web.py --check` reports drift.

**I31 — The engine must run without a bundler and without `X3FEX` present.**
It is loaded as a bare `<script>` and four game pages omit `x3f-exercises.js`
(see D17). Every `window.X3FEX` access is already guarded (`:289`, `:319`, `:380`,
`:461`, `:594`); the *behaviour* when it is absent is what is wrong, not the guards.

---

## Appendix — reproduction harness

The probes quoted above were run with Node against the real, unmodified sources:

```js
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null),
                        setItem: (k, v) => { store[k] = String(v) },
                        removeItem: k => { delete store[k] } };
global.window = global;
eval(fs.readFileSync('E:/Fun/x3f-tv/web/x3f-exercises.js', 'utf8'));
eval(fs.readFileSync('E:/Fun/x3f-tv/web/x3f-progress.js', 'utf8'));
// x3f-set.js additionally needs stubs for document, location, URLSearchParams,
// setInterval (a no-op is enough — sample() is also called synchronously).
```

Existing coverage worth preserving: `tools/func-test/engine.html` (~60 assertions,
pure engine) and `tools/func-test/cases.js` (63 assertions, real pages). Neither
currently covers: compaction's effect on `totalReps`/`burnSets`, `SOFT_CAP` on recent
data, `k:'session'` promotion, quota failure, missing/future `t`, duplicate
timestamps, catalogue size without `X3FEX`, or challenge stability across a
same-day log.
