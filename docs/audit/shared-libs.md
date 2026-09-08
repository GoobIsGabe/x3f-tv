# Audit — the remaining shared libraries

`web/x3f-exercises.js` · `web/x3f-hype.js` · `web/x3f-music.js` · `web/sw.js` ·
`web/manifest.json` · the service-worker registration in `web/index.html`

Read in full, line by line, plus every consumer found by cross-reference.

> **Timing note.** `web/x3f-exercises.js` was rewritten on disk *during* this
> audit — from 149 lines / 8.3 KB to **516 lines / 31.7 KB** — as part of a
> reconciliation against `docs/x3-knowledge/official/exercises.md`. Everything
> below describes the **new** file (mtime `Sep 7 23:41`). A new
> `web/x3f-band.js` (212 lines) also appeared and is discussed where it touches
> this scope. `x3f-hype.js`, `x3f-music.js`, `sw.js`, `manifest.json` and
> `index.html` are unchanged since `6466b42`.
>
> The rewrite **only changed `x3f-exercises.js`**. Every consumer still reads the
> old shape. Section 5 lists what that costs.

Companion audits in this folder: `menus.md`, `calibration.md`.

---

## 0. One-paragraph orientation

`x3f-exercises.js` is now a 516-line IIFE publishing `window.X3FEX`: eleven
movement records with 24 fields each, four grouping tables, a band list, a
`PROTOCOL` constants block, a three-entry `PHASES` table, three new helper
functions, a game-launch table and a URL builder. It is the only file that knows
what an X3 movement *is*, and six other files key off its slugs. **None of the
newly added data or functions is read by anything yet.**

`x3f-hype.js` publishes `window.X3FHype.create()` — a per-page overlay that
watches one integer and shouts at milestones. Three games use it and it works
correctly in exactly one of them.

`x3f-music.js` publishes `window.X3FMusic.create()` / `.attach()` — a WebAudio
step sequencer with ten mood presets, driven by a `getIntensity()` the caller
supplies. Nine of the twelve pages use it. Two of its ten mood parameters
(`swing`, `glide`) are provably dead code.

`sw.js` is a 6-line cache-first service worker with a hardcoded cache name
(`x3f-v8`) and a 20-entry precache list. It is missing **seven** of the ten
shared libraries and all eighteen art assets, it caches non-OK responses, and —
because every game is launched with a query string — **it never serves a game
from cache when the game is launched the way the app launches games**. It also
means the `x3f-exercises.js` rewrite that just landed will never reach a single
installed user. Section 4 has the detail; this is the most consequential finding
in the audit.

---

# 1. `web/x3f-exercises.js` — complete contents and structural map

## 1.1 Header (lines 1–37) — the reconciliation contract

```js
/* X3F EXERCISES - single source of truth for the X3 movement library.

   Reconciled 2026-09 against the official member site
   (programs.jaquishbiomedical.com: every exercise page and every video
   transcript). See docs/x3-knowledge/official/exercises.md, which is the
   authority. Where this file and that file disagree, that file wins.

   WHAT THE RECONCILIATION CHANGED, and why each one matters:

     - There is no leg day. Front squat and split squat are PUSH; calf raise is
       PULL. The app had invented a 'legs' bucket and folded it into both days,
       which put the calf raise on push day (it is done after the deadlift on
       purpose, because the deadlift has already exhausted your grip) and the
       split squat on pull day.
     - Pec crossover and split squat do not exist until week 5.
     - The upright row is a SUBSTITUTE for the overhead press, for people whose
       shoulders cannot press overhead - not a free extra push movement.
     - Tempo is 2-3 seconds EACH WAY, so a rep is 4-6 seconds. The "1 up, 4
       down" figure that circulates in third-party X3 write-ups is not what the
       program says.
     - The band rule is two-sided: 40 full reps means go heavier, and fewer than
       15 means go LIGHTER. Only the first half was implemented.
     - The bent row's strongest range is the MIDDLE, not the top, so it yields
       10-15 partials where other movements yield 4-5.
     - Every movement's start position already carries load. The overhead press
       carries HALF its peak force before you have done anything ("holding 75
       pounds here... then it might go to 150"). floorFrac captures that, so an
       uncalibrated movement starts from a defensible estimate instead of 0.

   SLUGS ARE FROZEN. 'bent-row' and 'drag-curl' do not match the official
   'bent-over-row' and 'bicep-curl', but they are written into every entry of
   x3f_history on every install, and into the pose rigs in x3f-form.js. Renaming
   them would silently orphan the user's training history. officialSlug records
   the real name for anything that needs it.

   Consumed by X3F_Library.html, X3F_Routine.html, x3f-form.js, x3f-cal.js,
   x3f-band.js, x3f-set.js and x3f-progress.js. */
```

The last paragraph is aspirational: `x3f-cal.js` and `x3f-set.js` contain **zero**
references to `X3FEX` (verified by grep). `x3f-band.js` reads exactly one field
(`ex.band`, at `x3f-band.js:138-139`) and **no HTML page loads `x3f-band.js`** —
it is orphaned.

## 1.2 The record shape (documented at lines 41–69)

```js
/* Per-movement fields, and what each one is for:

   day           'push' | 'pull'          which workout it belongs to
   order         number                   position within that day
   joint         'multi' | 'single'       multi-joint always goes first; never
                                          pre-exhaust a small muscle that a
                                          multi-joint lift depends on
   optional      bool                     a core-four movement or an extra
   unlockWeek    number|null              5 for the week-5 variations
   substituteFor slug|null                offered INSTEAD of that movement
   perSide       bool                     the split squat is two sets, one leg
                                          each, counted as one movement
   band          band name                a SUGGESTION, never applied silently
   bandRank      1..11                    1 = takes the heaviest band
   floorFrac     0..1                     start tension as a fraction of peak;
                                          the default lo for an uncalibrated
                                          movement
   curve         'top' | 'mid'            where the strongest range is
   partials      [min,max]                partials to expect after full-range
                                          failure - the bent row is the outlier
   verb          string                   names the work: PRESS / ROW / CURL...
   bandConfig    'doubled'|'singled'|'loop'|'front-foot'
   plate         'midfoot'|'balls'|'none'
   regression    {name, note} | null      what to do if you cannot manage 15
   setupSteps    [string]                 the official Initial Setup list
   mechanics     [string]                 the official Execution & Mechanics list
   faults        [string]                 what goes wrong, in the source's terms
   setup, cue, range, mid, muscle, games  kept for backwards compatibility with
                                          the existing Library and Routine pages */
```

Twenty-four keys per record (`slug` and `officialSlug` and `name` on top of the
21 above). **Consumption status, verified by grep across `web/` and `app/`:**

| field | read by |
|---|---|
| `slug` | everything (primary key) |
| `name` | `X3F_Library.html:82`, `X3F_Routine.html:298`, `x3f-progress.js:319,594`, `x3f-form.js:545` |
| `muscle` | `X3F_Library.html:82`, `X3F_Routine.html:299` |
| `band` | `X3F_Library.html:75`, `X3F_Routine.html:299`, `x3f-progress.js:307`, `x3f-band.js:139` |
| `day` | `x3f-progress.js:381` (with a now-dead `'legs'` clause) |
| `range` | `X3F_Library.html:84` |
| `mid` | `X3F_Library.html:84` (CSS class only) |
| `setup` | `X3F_Library.html:85` (innerHTML) |
| `cue` | `X3F_Library.html:86` (innerHTML) |
| `games` | `X3F_Library.html:87`, `X3F_Routine.html:258` |
| **`officialSlug`** | **nothing** |
| **`order`** | **nothing** (except `forDay()`'s own sort, line 456) |
| **`joint`** | **nothing** (except `orderWarning()`, line 468 — itself uncalled) |
| **`optional`** | **nothing** (except `forDay()`, line 454) |
| **`unlockWeek`** | **nothing** (except `forDay()`, line 454) |
| **`substituteFor`** | **nothing** (except `forDay()`, line 453) |
| **`perSide`** | **nothing** |
| **`bandRank`** | **nothing** |
| **`floorFrac`** | **nothing** — `x3f-cal.js` still floors at 0 for uncalibrated movements |
| **`curve`** | **nothing** — `x3f-form.js` still uses its own `strongAt` |
| **`partials`** | **nothing** |
| **`verb`** | **nothing** — `x3f-form.js` still uses its own `verb` |
| **`bandConfig`** | **nothing** |
| **`plate`** | **nothing** — `x3f-form.js` uses its own `plate:'ball'` on calf-raise |
| **`regression`** | **nothing** |
| **`setupSteps`** | **nothing** |
| **`mechanics`** | **nothing** |
| **`faults`** | **nothing** |

Eighteen of the twenty-four fields, comprising roughly 20 KB of the 31.7 KB
file, are currently dead weight shipped to every one of the six pages that load
this script.

## 1.3 `EX` — all eleven movements, verbatim (lines 71–379)

Order in the array is now **program order within day**, push block then pull
block.

---

### PUSH — 1. `chest-press` (lines 73–100)
```js
{
  slug: 'chest-press', officialSlug: 'chest-press', name: 'Chest Press',
  muscle: 'Chest · delts · triceps',
  day: 'push', order: 1, joint: 'multi', optional: false, unlockWeek: null,
  substituteFor: null, perSide: false,
  band: 'Dark Gray', bandRank: 3, floorFrac: 0.25, curve: 'top', partials: [4, 6],
  verb: 'PRESS', bandConfig: 'doubled', plate: 'none', regression: null,
  range: 'Strongest near extension — stop short of lockout', mid: 0,
  setup: 'Band doubled on both hooks; make a triangle, sling it over one shoulder like a messenger bag and rotate the bar across to your chest.',
  cue: 'Drive your upper arms toward your body’s midline, and press slightly <b>downward</b> (decline-style) to spare the shoulder.',
  setupSteps: [
    'Hook the band onto both bar hooks and double it. If there is slack, wrap the band around a hook once or twice.',
    'Form a triangle with the doubled band and the bar. Grab the band, not the bar.',
    'Bring the band over one shoulder like a messenger strap and rotate the bar across your body.',
    'Drop the upper strand under the rear deltoid, thread the other arm through, and bring the bar to chest height.',
    'Pronated grip, wrists neutral, thumbs wrapped.'
  ],
  mechanics: [
    'Press forward and slightly downward — think about bringing your upper arms toward your midline.',
    'Stop just short of lockout.',
    'If you feel it mostly in your triceps, keep your elbows back and slightly flared.',
    'Never let the band go slack at the bottom.',
    '2–3 seconds out, 2–3 seconds back.',
    'When full extension stops happening, keep going in diminishing range until the last rep is an inch.'
  ],
  faults: ['Letting it go slack at the bottom', 'Locking out at the top', 'Feeling it only in the triceps'],
  games: ['bloom', 'max', 'zone']
}
```

### PUSH — 2. `tricep-press` (lines 101–125)
```js
{
  slug: 'tricep-press', officialSlug: 'tricep-press', name: 'Tricep Press',
  muscle: 'Triceps (isolation)',
  day: 'push', order: 2, joint: 'single', optional: false, unlockWeek: null,
  substituteFor: null, perSide: false,
  band: 'Light Gray', bandRank: 8, floorFrac: 0.35, curve: 'top', partials: [4, 6],
  verb: 'PRESS', bandConfig: 'doubled', plate: 'none', regression: null,
  range: 'Strongest near extension — the muscle shuts off at lockout', mid: 0,
  setup: 'Like the chest press but the band sits higher, the bar starts at eyebrow level and you lean about 45° forward.',
  cue: 'Freeze the upper arm — <b>only the elbow hinges</b>. Press down and isolate the triceps.',
  setupSteps: [
    'Same messenger-bag setup as the chest press, but the band sits a little higher on your back.',
    'Feet about shoulder-width, lean slightly forward — roughly 45°.',
    'Start with the bar at eyebrow or forehead level, elbows tucked close, wrists neutral.'
  ],
  mechanics: [
    'Straighten your arms slowly, hinging only at the elbow. The upper arm does not move.',
    'Stop just shy of lockout — as soon as the arm is straight the tricep starts shutting off.',
    'Keep the elbows tucked; do not let them flare.',
    '2–3 seconds each direction, 15–40 reps.',
    'Then diminishing range through mid and weak range to complete fatigue.'
  ],
  faults: ['Moving the upper arm', 'Flaring the elbows', 'Locking out'],
  games: ['bloom', 'zone']
}
```
> **The only `joint: 'single'` movement placed before a `'multi'` one** in its own
> day (`order: 2`, ahead of `overhead-press` and `front-squat`). `orderWarning()`
> (line 463) exists specifically to flag that pattern and would fire on the
> shipped default push day. Nothing calls it. See D-EX-4.

### PUSH — 3. `overhead-press` (lines 126–155)
```js
{
  slug: 'overhead-press', officialSlug: 'overhead-press', name: 'Overhead Press',
  muscle: 'Deltoids',
  day: 'push', order: 3, joint: 'multi', optional: false, unlockWeek: null,
  substituteFor: null, perSide: false,
  band: 'Light Gray', bandRank: 7, floorFrac: 0.50, curve: 'top', partials: [4, 6],
  verb: 'PRESS', bandConfig: 'singled', plate: 'midfoot',
  regression: { name: 'Kneeling overhead press', note: 'If you cannot reach 15 slow reps standing, do it from a kneeling position — it puts less tension on everything involved. You will graduate to standing soon after.' },
  range: 'Strongest at the top — “head through the window”', mid: 0,
  setup: 'Band <b>singled</b> midfoot under the plate, pronated grip, bar starts at chin height.',
  cue: '“Head through the window” at the top — roll the shoulders back for the deepest delt squeeze. No lockout, no rest.',
  setupSteps: [
    'Route the singled band through the plate channel so it sits centred under your midfoot.',
    'Step onto the plate, feet about shoulder-width.',
    'Squat down, take a pronated grip, then rotate your wrists 180° — palms down at the start, up toward the ceiling at the top.',
    'Bring the bar to shoulder height and stand tall.'
  ],
  mechanics: [
    '2–3 seconds up, 2–3 seconds down.',
    'Press up and slightly back to the true top — “head through the window” — arms forming a rectangle as the shoulders roll back.',
    'Always keep the bar in front of you. Never behind the head — that damages the shoulder joint.',
    'No lockout at the top, no rest at the bottom.',
    'When you can no longer reach the fully contracted position, shorten the reps and keep going.'
  ],
  faults: ['Taking the bar behind the head', 'Stopping short of “head through the window”', 'Speeding up to add reps'],
  /* The one movement whose start position is documented: 75 lb held, 150 lb
     at the top. Half its peak force is present before rep one, which is why
     it broke every force scale in the app before per-movement floors. */
  games: ['bloom', 'max', 'rhythm']
}
```
> The **highest `floorFrac` (0.50)** and the only record with a `regression`.
> The explanatory comment (151–153) is misplaced — it sits between `faults` and
> `games` rather than beside `floorFrac`.

### PUSH — 4. `front-squat` (lines 156–181)
```js
{
  slug: 'front-squat', officialSlug: 'front-squat', name: 'Front Squat',
  muscle: 'Quads · glutes',
  day: 'push', order: 4, joint: 'multi', optional: false, unlockWeek: null,
  substituteFor: null, perSide: false,
  band: 'Dark Gray', bandRank: 4, floorFrac: 0.15, curve: 'top', partials: [4, 6],
  verb: 'DRIVE', bandConfig: 'singled', plate: 'midfoot', regression: null,
  range: 'Strongest standing — never lock the knees', mid: 0,
  setup: 'Band <b>singled</b> midfoot, both ends on the hooks, bar resting across the top of your shoulders, elbows forward and up.',
  cue: 'Drop your hips <b>straight down</b> like sitting into a chair; knee tracks over the big toe; don’t lock out at the top.',
  setupSteps: [
    'Centre the singled band in the plate’s channel and loop both ends over the bar hooks.',
    'Rest the bar across the top of your shoulders, elbows slightly forward and up, then stand tall.',
    'Feet hip- to shoulder-width, toes turned slightly out so the knees and toes track together.'
  ],
  mechanics: [
    'Fingertips or thumbs only — your trapezius holds the bar, not your hands.',
    'Torso upright, chest up.',
    'Sit straight down and straight up, like sitting into a chair.',
    'Knees track over the toes; never let them cave in.',
    'Never lock the knees at the top — locking out is resting, and only loads the bone.',
    'After 15–40 full reps, shorten the range to reach fatigue.'
  ],
  faults: ['Locking the knees at the top', 'Knees caving inward', 'Gripping the bar with the hands (means you are leaning)'],
  games: ['bloom', 'max']
}
```

### PUSH — 5. `pec-crossover` (lines 182–209) — optional, week 5
```js
{
  slug: 'pec-crossover', officialSlug: 'pec-crossover', name: 'Pec Crossover',
  muscle: 'Chest — do it right after the chest press',
  day: 'push', order: 5, joint: 'single', optional: true, unlockWeek: 5,
  substituteFor: null, perSide: false,
  band: 'Light Gray', bandRank: 10, floorFrac: 0.20, curve: 'top', partials: [4, 6],
  verb: 'SQUEEZE', bandConfig: 'loop', plate: 'none', regression: null,
  range: 'Strongest fully crossed at the sternum', mid: 0,
  setup: 'No bar and no plate. Band looped behind your upper back at mid-scapula, crossing over the rear delts, one side in each hand.',
  cue: 'Truly <b>cross the body</b> — one elbow over the other, alternating each rep. Squeeze the pec hard in its shortest position.',
  setupSteps: [
    'Wrap a looped band behind your upper back at mid-scapula level, strands crossing over the rear deltoids.',
    'Hold one side of the loop in each hand.',
    'Staggered stance, lean slightly forward, brace your core, neutral spine.',
    'Arms out to the sides at chest height with a soft elbow bend.',
    'Pre-tension the band before the first rep — step forward or adjust your hand spacing until there is no slack.'
  ],
  mechanics: [
    'Sweep your arms in a smooth arc across your body, meeting at the sternum.',
    'Alternate which arm crosses on top each rep.',
    'Shoulders down and back, no shrug. Soft elbow — this is a fly, not a press.',
    '2–3 seconds each way, no momentum.',
    'Do not lock out at the finish.',
    'Diminishing range until the band no longer moves forward.'
  ],
  faults: ['Just stretching the band instead of crossing the body', 'Straightening the elbow into a press', 'Shrugging'],
  games: ['bloom', 'zone']
}
```
> **The only movement with no bar and no plate** (`bandConfig:'loop'`,
> `plate:'none'`). Every game's force pipeline assumes the bar's load cell; a
> movement with no bar has no signal at all. Nothing in the data marks that.

### PUSH — 6. `split-squat` (lines 210–237) — optional, week 5, per-side
```js
{
  slug: 'split-squat', officialSlug: 'split-squat', name: 'Split Squat',
  muscle: 'Single-leg quad · glute · core',
  day: 'push', order: 6, joint: 'multi', optional: true, unlockWeek: 5,
  substituteFor: null, perSide: true,
  band: 'Dark Gray', bandRank: 5, floorFrac: 0.15, curve: 'top', partials: [4, 6],
  verb: 'DRIVE', bandConfig: 'front-foot', plate: 'none', regression: null,
  range: 'Superior to the front squat — and a huge amount of core work', mid: 0,
  setup: 'Band hooked both sides and run under the <b>front</b> foot near the heel; bar on the shoulders as in the front squat.',
  cue: 'All the weight over the front leg — the rear leg is balance only. Back knee nearly touches the floor. <b>One leg to full fatigue, then the other.</b>',
  setupSteps: [
    'Hook the band onto both sides of the bar.',
    'Step your front foot onto the band so it runs under the foot near the heel.',
    'Step the rear foot back into a stable split stance, rear heel high.',
    'Rest the bar across your shoulders, elbows forward and up — fingertips only.',
    'Square your hips forward and brace your core.'
  ],
  mechanics: [
    'Drive upward with your weight over the front leg. The rear leg is for balance, not power.',
    'Descend under control until the back knee nearly touches the floor — straight down, not forward.',
    'About two seconds up, two seconds down.',
    'Torso upright, hips level. Expect a lot of core stabilisation.',
    '15–40 full reps per leg, then shorten the range.',
    'Finish with very short reps near the bottom.'
  ],
  faults: ['Pushing off the back leg', 'Travelling forward instead of straight down', 'Hips rotating'],
  games: ['bloom', 'max', 'duel']
}
```
> **The only `perSide: true` record.** `X3F_Routine.html` counts sets with
> `doneSets(slug) >= +per(slug).sets` (`:262`) and has no concept of sides, so a
> two-set movement is logged as one.

### PUSH — 7. `upright-row` (lines 238–263) — substitute for the overhead press
```js
{
  slug: 'upright-row', officialSlug: 'upright-row', name: 'Upright Row',
  muscle: 'Delts · traps — shoulder-friendly alternative',
  day: 'push', order: 7, joint: 'multi', optional: true, unlockWeek: null,
  substituteFor: 'overhead-press', perSide: false,
  band: 'White', bandRank: 11, floorFrac: 0.30, curve: 'top', partials: [4, 6],
  verb: 'PULL', bandConfig: 'singled', plate: 'midfoot', regression: null,
  range: 'Deliberately limited — mid-chest is the top', mid: 0,
  setup: 'Set up like the overhead press — band singled midfoot, narrow grip, light band.',
  cue: 'Pull <b>only to mid-chest</b> — never to the chin. This movement exists because a shoulder is compromised, so be careful with it.',
  setupSteps: [
    'Loop the singled band under the centre of the ground plate and hook both ends onto the bar.',
    'Stand centred on the plate, feet hip- to shoulder-width, knees soft, core braced.',
    'Grip evenly just inside shoulder width, wrists neutral, thumbs around. Stand tall.'
  ],
  mechanics: [
    'Drive the elbows up and slightly out. Wrists stay below the elbows, bar stays close.',
    'Shoulders down and back — do not shrug early.',
    'Pull vertically to about mid-chest. No higher.',
    'Upright torso, no leaning, no momentum.',
    '2–3 seconds each direction, constant tension.',
    'Diminishing range as full range breaks down — the shortest reps may end around your abdomen.'
  ],
  faults: ['Pulling to the chin', 'Leaning back', 'Going too heavy — this movement wants a light band'],
  games: ['bloom', 'zone']
}
```
> **The only `substituteFor` record.** Its `verb: 'PULL'` and `curve: 'top'` both
> **contradict `x3f-form.js`** (`verb: 'ROW'`, `strongAt: 'mid'`, lines 76). See
> D-EX-3.

---

### PULL — 1. `deadlift` (lines 266–293)
```js
{
  slug: 'deadlift', officialSlug: 'deadlift', name: 'Deadlift',
  muscle: 'Back · glutes · hamstrings',
  day: 'pull', order: 1, joint: 'multi', optional: false, unlockWeek: null,
  substituteFor: null, perSide: false,
  band: 'Black', bandRank: 1, floorFrac: 0.10, curve: 'top', partials: [4, 6],
  verb: 'PULL', bandConfig: 'doubled', plate: 'midfoot', regression: null,
  range: 'Strongest standing — go slow through the weak bottom', mid: 0,
  setup: 'Band <b>doubled</b> under the plate midfoot, double-overhand grip (no straps, no switch grip), toes at the front edge.',
  cue: 'Flat back, hinge at the hips, drive with the <b>glutes</b>. You’re pulling from below the knee, not the floor. Keep tension, never lock the knees.',
  setupSteps: [
    'Double the band under the ground plate, centred in the middle channel.',
    'Overhand grip — both hands pronated. Not a switch grip, and no straps.',
    'Feet hip-width, toes at the front edge of the plate so your midfoot lines up with the band, knees slightly bent.',
    'Back straight from neck to pelvis before you move.'
  ],
  mechanics: [
    'Reverse just before the band would go slack. No bouncing, no momentum — with variable resistance there is no momentum at all.',
    'Head and eyes forward. Do not turn your head.',
    'Hinge at the hips and drive the bar up with your glutes, bar tracking close to your legs.',
    'Traps engaged so the shoulders do not slump forward and round your back.',
    'Never lock the knees at the top.',
    '2–3 seconds each way to stay in control through the weak range.',
    'Do not skip the diminishing range here — it is the easiest lift to put down early, and it is the part that counts most.'
  ],
  faults: ['Using straps', 'Rounding the back', 'Bouncing out of the bottom', 'Stopping at full-range failure'],
  games: ['bloom', 'max', 'boss']
}
```
> `bandRank: 1` (heaviest) and the lowest `floorFrac` (0.10).

### PULL — 2. `bent-row` (lines 294–326) — the strength-curve outlier
```js
{
  slug: 'bent-row', officialSlug: 'bent-over-row', name: 'Bent Row',
  muscle: 'Lats · rear delts (some bicep)',
  day: 'pull', order: 2, joint: 'multi', optional: false, unlockWeek: null,
  substituteFor: null, perSide: false,
  band: 'Dark Gray', bandRank: 2, floorFrac: 0.15,
  /* The outlier. The lat and bicep strength curves cross, so peak power is
     mid-rep rather than at the top — which is why this lift yields 10-15
     partials where everything else yields 4-6, and why mapping its force
     linearly to "higher is better" is wrong. */
  curve: 'mid', partials: [10, 15],
  verb: 'ROW', bandConfig: 'doubled', plate: 'midfoot', regression: null,
  range: 'Strongest in the MID-RANGE — unlike every other movement', mid: 1,
  setup: 'Band <b>doubled</b> midfoot, supinated grip, flat neutral spine (a straight diagonal line — not hunched, not arched).',
  cue: 'Feel it in the back, pull to the <b>beltline</b> — never into your chest. <b>Unique curve:</b> the power is in the middle, so after full reps grind 10–15 <b>mid-range partials</b>, far more than any other lift.',
  setupSteps: [
    'Double the band under the ground plate, centred in the channel.',
    'Supinated (underhand) grip; pronated is fine if it is more comfortable.',
    'Stand shoulder-width on the plate so your midfoot lines up with the band, knees slightly bent.',
    'Hinge at the hips to about 45° with a flat, neutral spine.',
    'Let the bar hang below the knees, arms long, elbows pointed back.'
  ],
  mechanics: [
    'Drive the elbows back to pull the bar toward your beltline, keeping it close to your body.',
    'Do not pull into your chest — the closer to the hip, the less stress on your back.',
    'Start the movement with the lats and upper back, not the arms.',
    'Do not straighten the arms at the bottom.',
    '2–3 seconds up and down.',
    'The strongest range is the middle, so expect a lot of mid-range partials before you drop to the weak range.'
  ],
  faults: ['Pulling into the chest', 'Rounding or hunching the back', 'Pulling with the arms instead of the back'],
  games: ['bloom', 'zone', 'rhythm']
}
```
> The only `curve: 'mid'` / `mid: 1` / `partials: [10,15]` record, and the only
> one whose `slug` ≠ `officialSlug` in a way that changes the *word*
> (`bent-row` vs `bent-over-row`).

### PULL — 3. `drag-curl` (lines 327–352) — displayed as "Bicep Curl"
```js
{
  slug: 'drag-curl', officialSlug: 'bicep-curl', name: 'Bicep Curl',
  muscle: 'Biceps — a drag curl, which makes it multi-joint',
  day: 'pull', order: 3, joint: 'multi', optional: false, unlockWeek: null,
  substituteFor: null, perSide: false,
  band: 'Light Gray', bandRank: 9, floorFrac: 0.20, curve: 'top', partials: [4, 6],
  verb: 'CURL', bandConfig: 'singled', plate: 'midfoot', regression: null,
  range: 'Strongest at the top squeeze, bar at mid-chest', mid: 0,
  setup: 'Band <b>singled</b> (not doubled) under the plate, supinated grip, elbows slightly bent.',
  cue: 'Drag the bar up close to your body — elbows go <b>back</b>, never forward. Stop at mid/lower chest; higher breaks the isolation. Slight bend at the bottom for constant tension.',
  setupSteps: [
    'Loop the band over both bar hooks and single it under the plate’s centre channel.',
    'Supinated (palms-up) grip, elbows slightly flexed, wrists neutral.',
    'Stand on the plate centred over the band, feet shoulder-width.'
  ],
  mechanics: [
    'Curl by flexing the elbows only. Keep the bar close and let your elbows travel backward as it rises.',
    'Drag-curl path — the bar slides up along your torso, straight up and straight down.',
    'Stop at mid-to-lower chest. Going higher shuts the bicep off and brings other muscles in.',
    '2–3 seconds each direction.',
    'Never lock out at the bottom — keep a slight bend.',
    'Diminishing range to complete fatigue.'
  ],
  faults: ['Elbows drifting forward', 'Curling to the chin', 'Straightening the arms at the bottom'],
  games: ['bloom', 'zone', 'rhythm']
}
```
> **`name` changed from "Drag Curl" to "Bicep Curl".** `x3f-form.js:46` still has
> `label: 'Drag Curl'`. Because `x3f-form.js:545` prefers `meta.name`, the panel
> header now reads "Bicep Curl" while the rig's own label says otherwise — and any
> path that falls back to `EXR[slug].label` (i.e. when `X3FEX` failed to load)
> disagrees with the rest of the UI.

### PULL — 4. `calf-raise` (lines 353–378)
```js
{
  slug: 'calf-raise', officialSlug: 'calf-raise', name: 'Calf Raise',
  muscle: 'Calves',
  day: 'pull', order: 4, joint: 'single', optional: false, unlockWeek: null,
  substituteFor: null, perSide: false,
  band: 'Light Gray', bandRank: 6, floorFrac: 0.20, curve: 'top', partials: [4, 8],
  verb: 'RAISE', bandConfig: 'doubled', plate: 'balls', regression: null,
  range: 'Strongest at the top — light band, high reps', mid: 0,
  setup: '<b>Balls</b> of the feet over the band channel (not midfoot), heels hanging off the back edge — they never touch down.',
  cue: 'Lighter band, higher reps, constant tension. The bar is held against your body by your <b>traps</b>, not your hands — your grip is already gone from the deadlift.',
  setupSteps: [
    'Double the band under the plate, centred in the channel, and loop it onto both bar hooks.',
    'Put the ball of each foot directly over the band, heels hanging off the back of the plate.',
    'Start in a deadlift stance, pull up on the bar and stand tall.',
    'Hold the bar firmly against your body using your trapezius, not your arms.',
    'Get your balance before you start — this one challenges stability.'
  ],
  mechanics: [
    'Keep the bar against the body and the traps contracted to stabilise the shoulder.',
    'Use a lighter band and higher reps. This is the one movement where a big rep count is the point, not a signal to add load.',
    'Hover the heels off the back of the plate at the bottom — they must never rest on it.',
    'As soon as you can no longer reach the peak contraction, shorten the range to complete fatigue.'
  ],
  faults: ['Letting the heels touch the plate', 'Going too heavy', 'Holding the bar with the hands'],
  games: ['bloom', 'zone']
}
```
> `partials: [4, 8]` — the only value that is neither `[4,6]` nor `[10,15]`, and
> the mechanics text explicitly says a high rep count here is **not** a signal to
> add load, which directly contradicts `x3f-progress.js:591-598`'s
> `bandAdvice()` (`row.reps >= 40` ⇒ "go up a band"). See D-EX-6.

## 1.4 Field tables at a glance

| slug | day | order | joint | opt | unlock | subFor | perSide | band | rank | floorFrac | curve | partials | verb | bandConfig | plate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chest-press | push | 1 | multi | – | – | – | – | Dark Gray | 3 | 0.25 | top | 4–6 | PRESS | doubled | none |
| tricep-press | push | 2 | **single** | – | – | – | – | Light Gray | 8 | 0.35 | top | 4–6 | PRESS | doubled | none |
| overhead-press | push | 3 | multi | – | – | – | – | Light Gray | 7 | **0.50** | top | 4–6 | PRESS | singled | midfoot |
| front-squat | push | 4 | multi | – | – | – | – | Dark Gray | 4 | 0.15 | top | 4–6 | DRIVE | singled | midfoot |
| pec-crossover | push | 5 | single | ✓ | **5** | – | – | Light Gray | 10 | 0.20 | top | 4–6 | SQUEEZE | **loop** | none |
| split-squat | push | 6 | multi | ✓ | **5** | – | **✓** | Dark Gray | 5 | 0.15 | top | 4–6 | DRIVE | **front-foot** | none |
| upright-row | push | 7 | multi | ✓ | – | **overhead-press** | – | White | 11 | 0.30 | top | 4–6 | PULL | singled | midfoot |
| deadlift | pull | 1 | multi | – | – | – | – | Black | **1** | **0.10** | top | 4–6 | PULL | doubled | midfoot |
| bent-row | pull | 2 | multi | – | – | – | – | Dark Gray | 2 | 0.15 | **mid** | **10–15** | ROW | doubled | midfoot |
| drag-curl | pull | 3 | multi | – | – | – | – | Light Gray | 9 | 0.20 | top | 4–6 | CURL | singled | midfoot |
| calf-raise | pull | 4 | **single** | – | – | – | – | Light Gray | 6 | 0.20 | top | **4–8** | RAISE | doubled | **balls** |

`bandRank` 1–11 is a total order with no gaps and no duplicates — verified.

## 1.5 Derived index (lines 381–382)

```js
var BY = {};
EX.forEach(function (e) { BY[e.slug] = e; });
```

Plain object, no prototype guard (see D-EX-8).

## 1.6 `GROUPS` — the Library's ordering (lines 384–393)

```js
/* Library grouping, in program order. Push and pull are the only days X3 has;
   the optional and substitute movements are called out rather than mixed in,
   because the source is emphatic that the upright row exists only for people
   who cannot press overhead. */
var GROUPS = [
  ['Push Day', ['chest-press', 'tricep-press', 'overhead-press', 'front-squat']],
  ['Pull Day', ['deadlift', 'bent-row', 'drag-curl', 'calf-raise']],
  ['Push Day — optional, from week 5', ['pec-crossover', 'split-squat']],
  ['Only if you can’t press overhead', ['upright-row']]
];
```

4 + 4 + 2 + 1 = 11, every slug exactly once. **Still hand-maintained** and now
redundant with `day` + `order` + `optional` + `unlockWeek` + `substituteFor`,
all of which encode the same grouping. `forDay()` (line 449) can already derive
the first two groups.

## 1.7 `DAYS` — the default routine seed (lines 395–401)

```js
/* The default program days. Four movements each, which is what the official
   program prescribes - the optional variations are added by the user, and
   only offered once they have unlocked. Every day stays editable. */
var DAYS = [
  ['Push Day', ['chest-press', 'tricep-press', 'overhead-press', 'front-squat']],
  ['Pull Day', ['deadlift', 'bent-row', 'drag-curl', 'calf-raise']]
];
```

Changed from the previous five-movement days. `calf-raise` moved from *both*
days to pull only; `split-squat` removed from pull; `front-squat` moved to push.
**This will not reach any existing user** — see D-EX-1.

## 1.8 `BANDS` (line 403)

```js
var BANDS = ['White', 'Light Gray', 'Dark Gray', 'Black', 'Elite Black'];
```

Weakest → strongest. Duplicated verbatim in `x3f-progress.js:26`, as keys in
`x3f-cal.js:40`, and as a literal in each game page (`X3F_Bloom.html:105`) — now
five copies counting `x3f-band.js`'s `DEFAULT`.

## 1.9 `PROTOCOL` — new (lines 405–422)

```js
/* The program's own numbers, in one place so nothing re-invents them. */
var PROTOCOL = {
  repsMin: 15,            // fewer than this in full range: go lighter
  repsMax: 40,            // this many in full range: go heavier
  tempoUpMs: 2500,        // "2-3 seconds up"
  tempoDownMs: 2500,      // "2-3 seconds down"
  repMinMs: 4000,         // a rep faster than this is being rushed
  repIdealMs: 5000,
  setsPerMovement: 1,     // "Don't do more than one set. You will do worse."
  /* Rep-amplitude thresholds that separate the three tiers of a set, as a
     fraction of the top this session has established. */
  fullRangeFrac: 0.85,
  midRangeFrac: 0.45,
  /* The strength curve is "not linear in the middle", and steeply so. Raising
     the normalised force to this power before drawing it gives the strong
     range - where the whole program lives - the visual room it deserves. */
  curveExp: 0.65
};
```

**Nothing reads it.** Every one of these numbers is currently hardcoded
somewhere else and *disagrees*:

| PROTOCOL | value | the number actually in force | where |
|---|---|---|---|
| `repsMax: 40` | 40 | `row.reps >= 40` | `x3f-progress.js:592` (agrees) |
| `repsMin: 15` | 15 | **no "go lighter" rule exists anywhere** | — |
| `tempoUpMs + tempoDownMs` | 5000 ms | `period = 3000` | `X3F_Bloom.html:229`, and the `<select>` offers 4000/3000/2000 (`:81`) — **every option is below `repMinMs: 4000`… except 4000, which equals it** |
| `repIdealMs: 5000` | 5000 | not offered by any tempo picker | `X3F_Routine.html:234` `TEMPOS=[['4000',…],['3000',…],['2000',…]]` |
| `setsPerMovement: 1` | 1 | `SETS=[['1','1 set · X3 standard'],…]` default `'1'` | `X3F_Routine.html:238,258` (agrees) |
| `fullRangeFrac: 0.85` | 0.85 | `reached = repMax >= curHi*0.78` | `X3F_Bloom.html:445` |
| `midRangeFrac: 0.45` | 0.45 | `curHi >= R2*0.60` for a full rep, `repMax >= R2*0.17` for a meaningful one | `X3F_Bloom.html:446,445` |
| `curveExp: 0.65` | 0.65 | linear (`mapY(force)`) | `X3F_Bloom.html` |

See D-EX-5.

## 1.10 `PHASES` and `phaseForWeek()` — new (lines 424–444)

```js
var PHASES = [
  { weeks: [1, 4], name: 'Foundational', perWeek: 4,
    pattern: ['push', 'pull', 'rest', 'push', 'pull', 'rest', 'rest'],
    teaches: 'Variable resistance. Start lighter than you think. Fifteen reps is the floor. One set.' },
  { weeks: [5, 8], name: 'Strength', perWeek: 6,
    pattern: ['push', 'pull', 'push', 'pull', 'push', 'pull', 'rest'],
    teaches: 'Constant tension. No lockout, no slack. Live near full extension — then diminishing range.' },
  { weeks: [9, 12], name: 'Optimization', perWeek: 6,
    pattern: ['push', 'pull', 'push', 'pull', 'push', 'pull', 'rest'],
    teaches: 'Breathe out slowly through the strong range. Brace. Manage the range deliberately.' }
];

function phaseForWeek(w) {
  for (var i = 0; i < PHASES.length; i++) {
    if (w >= PHASES[i].weeks[0] && w <= PHASES[i].weeks[1]) return PHASES[i];
  }
  return PHASES[PHASES.length - 1];
}
```

`phaseForWeek(0)` and `phaseForWeek(13)` both return the **Optimization** phase
(the loop falls through to the last element) — wrong for week 0, which
`x3f-progress.js:236,241` explicitly models as "Not started". Nothing calls it
yet, so this is latent.

`x3f-progress.js:241-242` already computes a phase and disagrees:

```js
var phase = week === 0 ? 'Not started' : (week <= 4 ? 'Foundation' : 'Growth');
var perWeek = week <= 4 ? 4 : 6;   // published X3: 4x/week for a month, then 6x
```

Two phases named `Foundation`/`Growth` versus three named
`Foundational`/`Strength`/`Optimization`. `perWeek` agrees numerically. The
Routine strip renders `pr.phase` (`X3F_Routine.html:319`), so the UI shows the
progress.js names and the new table is invisible.

## 1.11 `forDay()` and `orderWarning()` — new (lines 446–475)

```js
/* Movements available in a given program week: the core four for the day,
   plus any optional that has unlocked. Substitutes are never included
   automatically - they replace something, and only if the user says so. */
function forDay(day, week) {
  var w = week || 99;
  return EX.filter(function (e) {
    if (e.day !== day) return false;
    if (e.substituteFor) return false;
    if (e.optional && e.unlockWeek && w < e.unlockWeek) return false;
    return true;
  }).sort(function (a, b) { return a.order - b.order; });
}

/* Multi-joint before single-joint: never pre-exhaust a small muscle that a
   multi-joint lift depends on. The source says the order "doesn't matter"
   but then says to start push day with the chest press and not to wear the
   triceps out first - so this warns rather than forbids. */
function orderWarning(slugs) {
  var seenSingle = null;
  for (var i = 0; i < slugs.length; i++) {
    var e = BY[slugs[i]];
    if (!e) continue;
    if (e.joint === 'single') { if (!seenSingle) seenSingle = e; }
    else if (seenSingle) {
      return seenSingle.name + ' before ' + e.name + ' will pre-exhaust a small muscle the ' +
             e.name.toLowerCase() + ' needs. Multi-joint movements go first.';
    }
  }
  return null;
}
```

`forDay('push', 0)` → `w = 0 || 99` → **99**, so week 0 returns *everything*
including the week-5 movements. `forDay('push')` does the same by design. Zero
call sites for either function.

## 1.12 `GAMES` (lines 477–488)

Identical to before except `rhythm.sub` changed from `'on beat'` to `'on tempo'`.

```js
var GAMES = {
  bloom:  { name: 'Bloom',         sub: 'controlled reps',    file: 'X3F_Bloom.html',  tempo: 1 },
  splash: { name: 'Splash',        sub: 'arcade',             file: 'X3F_Splash.html' },
  nova:   { name: 'Nova',          sub: 'space RPG',          file: 'X3F_Nova.html' },
  flow:   { name: 'Flow',          sub: 'controlled reps',    file: 'X3F_Flow.html',   tempo: 1 },
  zone:   { name: 'Hold the Zone', sub: 'time under tension', file: 'X3F_Arena.html',  mode: 'zone' },
  max:    { name: 'Max Effort',    sub: 'strength',           file: 'X3F_Arena.html',  mode: 'max' },
  boss:   { name: 'Boss Fight',    sub: 'endurance',          file: 'X3F_Arena.html',  mode: 'boss' },
  duel:   { name: 'Duel',          sub: 'vs CPU',             file: 'X3F_Duel.html' },
  rhythm: { name: 'Rhythm',        sub: 'on tempo',           file: 'X3F_Rhythm.html' },
  ascent: { name: 'Ascent',        sub: '3D flight',          file: 'X3F_Ascent.html' }
};
```

Union of all `games` arrays is still `{bloom, max, zone, rhythm, boss, duel}`.
`splash`, `nova`, `flow`, `ascent` remain unreachable from the Library, and
`X3F_Library.html:47` still ships dead `.gm.splash` / `.gm.nova` CSS.

## 1.13 `fileFor()` / `gameUrl()` (lines 490–507) — unchanged

```js
function fileFor(key, def) {
  var m = window.X3FFILES;
  return (m && m[key]) || def;
}

function gameUrl(game, o) {
  var g = GAMES[game] || GAMES.bloom, q = [];
  if (g.mode) q.push('mode=' + g.mode);
  q.push('from=' + encodeURIComponent((o && o.from) || 'lib'));
  if (o && o.band) q.push('band=' + encodeURIComponent(o.band));
  if (o && o.tempo && g.tempo) q.push('tempo=' + encodeURIComponent(o.tempo));
  if (o && o.ex) q.push('ex=' + encodeURIComponent(o.ex));
  return fileFor(game, g.file) + '?' + q.join('&');
}
```

Parameter order fixed: `mode`, `from`, `band`, `tempo`, `ex`. The `'?'` is
unconditional — that one character is what breaks the offline cache (D-SW-1).
`mode` is the only unescaped value.

`X3FFILES` is injected by `tools/sync-from-web.py:82-86` into the three menu
pages of the TV bundle.

## 1.14 The export (lines 509–515)

```js
window.X3FEX = {
  list: EX, by: BY, groups: GROUPS, days: DAYS,
  bands: BANDS, games: GAMES, gameUrl: gameUrl,
  protocol: PROTOCOL, phases: PHASES,
  phaseForWeek: phaseForWeek, forDay: forDay, orderWarning: orderWarning,
  get: function (slug) { return BY[slug] || null; }
};
```

Twelve members; five are new; **all five are unconsumed**. Every field is a live
reference — no copies, no `Object.freeze`.

## 1.15 Who consumes `X3FEX`

| file:line | what it reads |
|---|---|
| `x3f-form.js:543` | `X3FEX.get(o.exercise).name` for the panel header; falls back to `EXR[slug].label` |
| `x3f-progress.js:289` | `X3FEX.list` — challenge seed pool |
| `x3f-progress.js:319` | `X3FEX.get(row.ex).name` |
| `x3f-progress.js:380-382` | `X3FEX.list` filtered `m.day === tag \|\| m.day === 'legs'` — **the `'legs'` clause is now dead** |
| `x3f-progress.js:461` | `X3FEX.list` — per-movement achievement catalogue |
| `x3f-progress.js:594` | `X3FEX.get(row.ex).name` — band advice |
| `x3f-band.js:138-139` | `X3FEX.get(slug).band` — recommended band |
| `X3F_Calibrate.html:89` | `(window.X3FEX && X3FEX.list) ? X3FEX.list : []` — guarded |
| `X3F_Library.html:73` | `const EXD=window.X3FEX, BANDS=EXD.bands;` — **unguarded** |
| `X3F_Progress.html:159` | `const P=window.X3FProg, EX=window.X3FEX;` |
| `X3F_Routine.html:231` | `const EXD=window.X3FEX, BANDS=EXD.bands;` — **unguarded** |

`x3f-form.js`'s `EXR` (lines 31–103) is an independent, parallel table keyed by
the same eleven slugs. Verified: identical key set, no extras, no gaps.

## 1.16 Storage keys

`x3f-exercises.js` reads and writes **no storage**. Its data flows into:

| key | writer | shape |
|---|---|---|
| `x3f_libBand` | `X3F_Library.html:72,91` | `{slug: bandName}` |
| `x3f_routine2` | `X3F_Routine.html:244` | `{dayName:{list:[slug], per:{slug:{game,band,tempo,sets}}}}` — seeded once from `X3FEX.days` |
| `x3f_routineProg2` | `X3F_Routine.html:246` | `{dayName:{slug: setsDone}}` |
| `x3f_exCal` | `x3f-cal.js:39` | `{"slug\|band": {lo,hi,auto,t}}` |
| `x3f_history` | `x3f-progress.js:25` | array of `{t,k,ex,band,reps,full,part,peak,secs,g,…}` — `ex` is a slug |

---

# 2. `web/x3f-hype.js` — milestone moments

*(unchanged since `6466b42`; 272 lines)*

## 2.1 Module shape

```
(function(){ "use strict";
  DEF_LADDER, DEF_MAJORS, styled            // module state
  css()                                     // injects one <style>, once per document
  create(o) -> { set, setBurn, bump, reset, say, mute, value }
  window.X3FHype = { create, DEFAULT_LADDER: DEF_LADDER }
})();
```

`DEFAULT_LADDER` is exported and used by nothing.

## 2.2 The ladder and the cadence (lines 24–28)

```js
/* Two tiers on purpose. The rungs are quick acknowledgements - a beat, then
   out of your way. Only MAJORS get the escalating countdown, because a
   countdown before every rung is the same nagging as a callout every rep. */
var DEF_LADDER = [10, 15, 20, 25, 30, 35, 40, 45, 60, 70, 80, 90, 110, 125, 175];
var DEF_MAJORS = [50, 75, 100, 150, 200, 250];
```

Rung spacing: 5 up to 45, then 10 to 90, then 15–20, then a 50-wide jump to 175.
Majors: 25 apart to 100, then 50.

**Cadence, as implemented:**

| moment | trigger | visual | audio | haptic | duration |
|---|---|---|---|---|---|
| approach | `remaining ∈ [1,near]` toward **the next major or `best+1` only** | `.x3fh-near` at `bottom:14%`, font `px(0.075 + urgency*0.07)`, `theme.hot` when `remaining ≤ 2`, `shake` when `remaining ≤ 3` | `tick(near-remaining)` → square, `520 + step*90` Hz, 70 ms, gain .16 | none | 1500 ms |
| ladder rung | `value === ladder[j]` | `.x3fh-big` at `top:34%`, `px(0.15)`, `theme.cool`, sub = `unit` | `fanfare(false)` — root 440, partials ×1/×1.26/×1.5/×2 at 0/.09/.18/.30 s | `vibrate(45)` | 1500 ms |
| major | `value === majors[i]` | `px(0.19)`, `theme.hot`, sub `"<unit> - outstanding"` | `fanfare(true)` — root 523.25 + a 261.6 Hz sine sub for 0.6 s | `vibrate([0,60,40,120])` | 2100 ms |
| new best | `value === bestFn()+1 && !done.b` | `"NEW BEST"` / `"was N <unit>"`, huge | `fanfare(true)` | `vibrate([0,60,40,120])` | 2100 ms |
| burn milestone | `setBurn(n)`, `n ∈ {5,10,20,35}`, rising | `"N PAST FAILURE"` / `"this is the part that grows you"`; huge at `n ≥ 20` | fanfare | vibrate | 1500/2100 ms |
| burn tick | any other rising `setBurn` | meter fills `min(100, n/20*100)%` | `tick(min(5,n))` | none | sticky until `reset()` |

**Rate limiting:** exactly one mechanism — `quietUntil = performance.now() + 900`
set in `showBig()` (line 181), checked at line 224 *after* the milestone branches.
A milestone can immediately follow a milestone; only the approach counter is
suppressed. The header's claim of "a floor on how often anything can fire"
(line 14) is not implemented.

## 2.3 `create(o)` options and callers

| option | default | overridden by |
|---|---|---|
| `host` | `#stage` → `document.body` | all three callers pass `$('stage')` |
| `theme` | `{hot:'#ffd23f',cool:'#39f5c4',text:'#ffffff'}` | all three |
| `ladder` | `DEF_LADDER` | Nova, Splash |
| `majors` | `DEF_MAJORS` | **nobody** |
| `unit` | `'reps'` | Nova/Splash → `'points'` |
| `best` | `() => 0` | all three |
| `nearWindow` | `5` | **nobody** |

```js
// X3F_Bloom.html:246
X3FHype.create({host:$('stage'),unit:'reps',
  theme:{hot:'#ffd35c',cool:'#59f5c4',text:'#eaf0fa'}, best:()=>bestSet})

// X3F_Nova.html:546
X3FHype.create({host:$('stage'),unit:'points',
  theme:{hot:'#ffd35c',cool:'#8f7dff',text:'#e7ecff'},
  ladder:[250,500,1000,2000,3500,5000,7500,10000,15000,25000],
  best:()=>(typeof bestScore!=='undefined'?bestScore:0)})

// X3F_Splash.html:401
X3FHype.create({host:$('stage'),unit:'points',
  theme:{hot:'#ffd23f',cool:'#31e8ff',text:'#eafcff'},
  ladder:[100,250,500,750,1000,1500,2000,3000,5000,7500,10000],
  best:()=>bestScore})
```

## 2.4 DOM structure (lines 80–87)

```
host                              (must be position:relative — .stage is, X3F_Bloom.html:36)
└── div.x3fh                      position:absolute; inset:0; z-index:7; pointer-events:none
    ├── div.x3fh-flash            inset:0; mix-blend-mode:screen; 0→1→0 over 90 ms
    ├── div.x3fh-near             left:0;right:0;bottom:14%
    ├── div.x3fh-big              left:0;right:0;top:34%; may contain span.x3fh-sub
    ├── div.x3fh-burn             left:50%;bottom:4%
    │   innerHTML = '<u>past failure</u><b id="x3fhBurnN">0</b><span style="width:70px"><i></i></span>'
    └── div.x3fh-bit × N          confetti, appended/removed per burst
```

`id="x3fhBurnN"` is dead — `setBurn` reads `burnEl.querySelector('b')` (line 251).

## 2.5 CSS tokens (lines 34–65)

One `<style>` per document, guarded by module-level `styled`.
Classes: `.x3fh`, `.x3fh-near{,.on,.shake}`, `.x3fh-big{,.on}`, `.x3fh-sub`,
`.x3fh-flash`, `.x3fh-bit`, `.x3fh-burn{,.on}`, `.x3fh-burn i`, `.x3fh-burn u`.
Keyframes: `x3fh-shake`.
Fonts: `'Fredoka','Sora',system-ui` for the layer, `"Space Grotesk"` for the sub.
Reduced motion: **only** `.x3fh-near.shake{animation:none}`.
Colours from JS: `theme.hot`, `theme.cool`, `theme.text`.
Hardcoded in CSS: `rgba(10,6,20,.55)` burn bg, `rgba(255,93,120,.45)` burn border,
`linear-gradient(90deg,#ff5d78,#ffd23f)` burn fill; hardcoded in JS: both flash
gradients (174–175) and `'#ffffff'` as the third confetti colour (178).

## 2.6 The algorithm (lines 184–232)

```js
function nextTarget() {
  var best = +bestFn() || 0;
  var cands = [];
  for (var i = 0; i < majors.length; i++) if (majors[i] > value && !done['m' + majors[i]]) cands.push(majors[i]);
  if (best > 0 && best + 1 > value && !done['b']) cands.push(best + 1);
  if (!cands.length) return null;
  cands.sort(function (a, b) { return a - b; });
  return cands[0];
}

function set(v) {
  v = Math.max(0, Math.round(+v || 0));
  if (v === value) return;
  var rising = v > value;
  value = v;
  if (!rising) return;
  var best = +bestFn() || 0;
  if (best > 0 && value === best + 1 && !done['b']) { done['b'] = 1; showBig('NEW BEST', 'was ' + best + ' ' + unit, true); return; }
  for (var i = 0; i < majors.length; i++)
    if (value === majors[i] && !done['m' + majors[i]]) { done['m' + majors[i]] = 1; showBig(String(majors[i]) + '!', unit + ' - outstanding', true); return; }
  for (var j = 0; j < ladder.length; j++)
    if (value === ladder[j] && !done['m' + ladder[j]]) { done['m' + ladder[j]] = 1; showBig(String(ladder[j]), unit, false); return; }
  if (performance.now() < quietUntil) return;
  var t = nextTarget();
  if (t == null) return;
  var remaining = t - value;
  if (remaining > 0 && remaining <= near && remaining !== lastNear) {
    lastNear = remaining;
    showNear(remaining, t === (+bestFn() || 0) + 1 ? 'YOUR BEST' : t);
  }
}
```

Three load-bearing facts:
1. **Detection is exact equality** — correct for a rep counter, wrong for anything else.
2. **`nextTarget()` never considers `ladder`** — once majors are exhausted the approach counter only fires for `best + 1`.
3. **`done` is one flat namespace** — rungs and majors both key `'m'+n`; a value in both fires once, as a major (majors loop runs first).

The expiry loop:
```js
function frame() {
  var now = performance.now();
  if (bigUntil && now > bigUntil) { bigEl.classList.remove('on'); bigUntil = 0; }
  if (nearUntil && now > nearUntil) { hideNear(); nearUntil = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```
Unconditional, uncancellable, one per `create()`.

## 2.7 Sound and muting

Its own `AudioContext` (line 97), separate from the music context and from each
game's `beep()` context — three per document on Bloom/Nova/Splash
(`X3F_Bloom.html:127`, `x3f-hype.js:97`, `x3f-music.js:87`).

```js
try { muted = JSON.parse(localStorage.getItem('x3f_cues')) === false; } catch (e) {}   // line 91
```

`x3f_cues` **is** written — by the games' Cues toggle
(`X3F_Bloom.html:126` `cueBtn.onclick=()=>{cues=!cues;xset('cues',cues);syncCue()}`,
where `xset` prefixes `'x3f_'` at `:104`). It is read **once**, at create time,
and `hype.mute()` has zero call sites.

## 2.8 Confetti cost

`burst(n, colors)` (125–145): `n` divs (34 huge / 18 normal), each with an inline
transition, a transform set inside `requestAnimationFrame`, and a
`setTimeout(…, 1100)` removal.

## 2.9 API surface

| method | line | call sites |
|---|---|---|
| `set(v)` | 195 | `X3F_Bloom.html:451,459`, `X3F_Nova.html:335`, `X3F_Splash.html:381` |
| `setBurn(n)` | 246 | `X3F_Bloom.html:449,455` |
| `bump()` | 263 | **none** |
| `reset()` | 264 | `X3F_Bloom.html:267`, `X3F_Splash.html:206` |
| `say(t,s,huge)` | 265 | `X3F_Nova.html:297`, `X3F_Splash.html:383`, `X3F_Bloom.html:290`, `x3f-set.js:96` |
| `mute(m)` | 266 | **none** |
| `value()` | 267 | **none** |

No `destroy()`.

---

# 3. `web/x3f-music.js` — the generated soundtrack

*(unchanged since `6466b42`; 265 lines)*

## 3.1 Module shape

```
(function(){ "use strict";
  MOODS                                     // 10 presets
  create(o) -> { start, stop, toggle, isOn, duck, setVolume, mood }
  attach(o) -> create(...) + a #musicBtn + a keypress "lift" intensity
  window.X3FMusic = { create, attach, moods: Object.keys(MOODS) }
})();
```

`X3FMusic.moods` is exported and used by nothing.

## 3.2 The ten moods, verbatim (lines 21–72)

| mood | bpm | root (Hz) | scale | wave | padWave | cutoff | glide | swing | kick | hat | bassAt |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `bloom` | 68 | 220.00 (A3) | `[0,3,5,7,10]` minor pent | triangle | sine | 620 | 0.09 | 0.0 | 0.20 | 0.05 | 0.45 |
| `splash` | 104 | 261.63 (C4) | `[0,2,4,7,9]` major pent | square | triangle | 1500 | 0.02 | 0.12 | 0.30 | 0.10 | 0.35 |
| `nova` | 124 | 174.61 (F3) | `[0,2,3,7,8]` | sawtooth | sawtooth | 900 | 0.03 | 0.0 | 0.34 | 0.09 | 0.25 |
| `menu` | 92 | 233.08 (A♯3) | `[0,3,5,7,10]` | triangle | sine | 900 | 0.05 | 0.06 | 0.16 | 0.06 | 0.40 |
| `flow` | 74 | 196.00 (G3) | `[0,2,4,7,9]` | triangle | sine | 700 | 0.08 | 0 | 0.20 | 0.05 | 0.45 |
| `arena` | 112 | 220.00 | `[0,2,3,5,7]` | square | triangle | 1100 | 0.02 | 0.08 | 0.32 | 0.09 | 0.30 |
| `duel` | 128 | 164.81 (E3) | `[0,1,5,7,8]` | sawtooth | sawtooth | 800 | 0.02 | 0 | 0.34 | 0.10 | 0.25 |
| `rhythm` | 120 | 261.63 | `[0,2,4,5,7]` | square | triangle | 1400 | 0.01 | 0.14 | 0.36 | 0.13 | 0.20 |
| `calibrate` | 60 | 174.61 | `[0,5,7]` (3-note) | sine | sine | 520 | 0.12 | 0 | 0.12 | 0.03 | 0.60 |
| `calm` | 76 | 196.00 | `[0,2,5,7,9]` | triangle | sine | 700 | 0.06 | 0 | 0.18 | 0.04 | 0.50 |

`calm` is the fallback (line 76); no page requests it.

| mood | page | call |
|---|---|---|
| bloom / nova / splash | `X3F_Bloom.html:249`, `X3F_Nova.html:550`, `X3F_Splash.html:405` | `create` |
| arena / calibrate / duel / flow / rhythm | `X3F_Arena.html:278`, `X3F_Calibrate.html:226`, `X3F_Duel.html:191`, `X3F_Flow.html:208`, `X3F_Rhythm.html:180` | `attach` |
| menu | `X3F_Library.html:98`, `X3F_Progress.html:358`, `X3F_Routine.html:532` | `attach` |
| — | `index.html`, `X3F_Ascent.html` | **no music at all** |

## 3.3 The synthesis graph

```
  note()  → Osc ── Gain ──┐
  (pad, bass, melody)     ├→ filter (lowpass @ M.cutoff × (0.75 + i·1.9)) ─┐
                          ┘                                                 ├→ master (Gain) → destination
  drum()  → BufferSource ─ Biquad(bandpass) ─ Gain ─────────────────────────┤
  kick()  → Osc(sine 120→46 Hz) ─ Gain ─────────────────────────────────────┘
```

**Percussion bypasses the filter** (`drum()` line 113, `kick()` line 124 both
`connect(master)`). Only melodic content brightens with intensity, despite the
comment at line 170 calling it "the single most 'alive' cue".

Noise buffer (92–95): one mono buffer, `sampleRate * 0.25` samples with a linear
decay baked in, reused for every hat/snare. ≈48 KB at 48 kHz, allocated once.

## 3.4 `tickStep(at)` — one sixteenth (lines 136–164)

```js
var i = intensity;
var beat = step % 4, bar16 = step % 16;

if (bar16 === 0 || (i > 0.5 && bar16 === 8)) kick(at, M.kick * (0.7 + i * 0.5));
if (beat === 2) drum(at, M.hat * (0.6 + i), 7200, 0.045);
if (i > 0.55 && beat === 0 && bar16 !== 0) drum(at, M.hat * 0.7, 6200, 0.03);
if (i > 0.75 && step % 2 === 1) drum(at, M.hat * 0.45, 9000, 0.022);

if (bar16 === 0) {                                   // pad
  var padGain = 0.05 + (1 - i) * 0.06;
  note(degree(0) / 2, at, 2.1, padGain, M.padWave, M.glide);
  note(degree(2) / 2, at, 2.1, padGain * 0.8, M.padWave, M.glide);
}
if (i > M.bassAt && bar16 % 4 === 0) {               // bass
  note(degree([0, 0, 3, 2][(step / 4 | 0) % 4]) / 2, at, 0.34, 0.10 + i * 0.05, 'sawtooth', 0);
}
var density = i > 0.7 ? 2 : i > 0.35 ? 4 : 8;        // melody
if (step % density === 0) {
  var pat = [0, 2, 4, 2, 3, 5, 4, 2];
  var d = pat[(step / density | 0) % pat.length] + (i > 0.8 ? 2 : 0);
  note(degree(d), at + (M.swing && step % 2 ? 0.03 : 0), density >= 8 ? 0.5 : 0.19,
       0.055 + i * 0.05, M.wave, 0);
}
step++;
```

```js
function degree(i) {          // line 129 — correct negative-index handling
  var s = M.scale, oct = Math.floor(i / s.length), semis = s[((i % s.length) + s.length) % s.length];
  return M.root * Math.pow(2, (semis + 12 * oct) / 12);
}
```

## 3.5 The intensity response — the full ladder

| `i` | what changes |
|---|---|
| any | kick on beat 1; open hat every 3rd sixteenth (4/bar); pad chord (degrees 0 and 2, one octave down) held 2.1 s at the top of each bar |
| pad gain | `0.05 + (1-i)*0.06` — the pad **fades out** as intensity climbs (0.11 → 0.05) |
| hat gain | `M.hat * (0.6 + i)` — 0.6× at rest, 1.6× at max |
| `> 0.35` | melody density 8 → 4 sixteenths, note length 0.5 s → 0.19 s |
| `> M.bassAt` (0.20–0.60) | sawtooth bass, 4/bar, root motion `[0,0,3,2]` |
| `> 0.5` | second kick at the half-bar |
| `> 0.55` | extra 6200 Hz hat on beats 2, 3, 4 |
| `> 0.7` | melody density 4 → 2 (eighth-note arpeggio) |
| `> 0.75` | 9000 Hz closed hat on every off-sixteenth (8/bar) |
| `> 0.8` | melody transposed up 2 scale degrees |
| all | cutoff `M.cutoff × (0.75 + i·1.9)` — bloom sweeps 465 → 1643 Hz |
| kick gain | `M.kick × (0.7 + i·0.5)` |

Smoothing (169): `intensity += (iTarget - intensity) * 0.18` at 120 ms ⇒ τ ≈ 600 ms.

**What callers feed it:**
```js
// Bloom  X3F_Bloom.html:250
getIntensity: () => Math.min(1, (force/ref()) * 1.1)
// Nova   X3F_Nova.html:551
getIntensity: () => Math.min(1, (force/ref()) * 1.05)
// Splash X3F_Splash.html:406
getIntensity: () => Math.min(1, Math.max(force/ref()*0.8, (combo-1)/12))
// Arena / Calibrate / Duel / Flow / Rhythm — the same five lines, copy-pasted
var f = function(){ try{ return Math.min(1,(force/ref())*1.05); }catch(e){ return 0.25; } };
// menus (attach default, x3f-music.js:238-241)
lift *= 0.92; return Math.min(1, (o.idle == null ? 0.22 : o.idle) + lift);
```

## 3.6 The scheduler (lines 166–201)

```js
function pump() {
  if (!on || !ctx) return;
  var iTarget = Math.max(0, Math.min(1, +getI() || 0));
  intensity += (iTarget - intensity) * 0.18;
  try { filter.frequency.value = M.cutoff * (0.75 + intensity * 1.9); } catch (e) {}
  var now = performance.now();
  duckAmt += ((now < duckUntil ? 0.28 : 1) - duckAmt) * 0.2;
  // 0.16 was mixed on a phone held at arm's length; across a room, over a TV's
  // speakers and under a bar you are pulling on, it disappeared. ~2x from here.
  try { master.gain.value = 0.34 * vol * duckAmt; } catch (e) {}

  var spb = 60 / M.bpm / 4;                  // seconds per sixteenth
  var horizon = ctx.currentTime + 0.35;
  while (nextTime < horizon) {
    tickStep(Math.max(nextTime, ctx.currentTime + 0.02));
    nextTime += spb;
  }
}
…
if (!timer) timer = setInterval(pump, 120);
```

- Tick rate 8.3 Hz, lookahead 350 ms, `while` loop **unbounded** (D-MU-1).
- Effective master gain `0.34 × vol × duckAmt`; `vol` defaults to `0.5` ⇒ **0.17**
  at rest, 0.048 while ducked. No caller passes `volume`; nothing calls `setVolume()`.
- `duck(seconds)` (222) called from `X3F_Bloom.html:451` (`.5`), `:459` (`.4`),
  `X3F_Splash.html:383` (`.7`).

## 3.7 Autostart and persistence

```js
try { var st = JSON.parse(localStorage.getItem('x3f_music')); if (st === false) on = false; else if (st === true) on = true; } catch (e) {}   // 83
…
function armAutostart() {                                              // 205
  var tryIt = function () {
    if (on && ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    if (on && !ctx) start();
  };
  ['pointerdown', 'keydown'].forEach(function (e) { addEventListener(e, tryIt, { passive: true }); });
}
armAutostart();
if (on) setTimeout(start, 250);
```

Key `x3f_music`, values `'true'` / `'false'` written at lines 193 and 200.
Absent ⇒ music **off**. Both listeners are on `window` and never removed.

## 3.8 `attach(o)` (lines 232–262)

```js
var btn = o.button || document.getElementById('musicBtn');
if (!btn && o.makeButton !== false) {
  btn = document.createElement('button');
  btn.id = 'musicBtn';
  btn.className = o.buttonClass || 'home';
  btn.setAttribute('data-nav', '');
  var host = o.buttonHost || document.querySelector('.top') || document.querySelector('.topbar');
  if (host) host.appendChild(btn); else btn = null;
}
if (btn) {
  var sync = function () { btn.textContent = inst.isOn() ? '♪ Music on' : '♪ Music off'; };
  sync();
  btn.addEventListener('click', function () { inst.toggle(); sync(); });
  if (window.X3FNav) try { X3FNav.refresh(); } catch (e) {}
}
```

Two more never-removed window listeners (243–245). `o.makeButton` is never passed.

**Where the button actually lands:**

| page | `buttonHost` passed | `.top`? | `.topbar`? | class | matching CSS | result |
|---|---|---|---|---|---|---|
| Library | `.top` | ✅ `:18` | ✗ | *(default `home`)* | `a.home{…}` **only** (`:21`) | **unstyled raw button** |
| Routine | `.top` | ✅ `:144` | ✗ | `home` | `a.home,button.home{…}` (`:23`) | ✅ |
| Progress | `.top` | ✅ `:106` | ✗ | `home` | `a.home,button.home{…}` (`:22`) | ✅ |
| Arena | `.topbar` | ✗ | ✅ `:87` | `mini` | **no `.mini` rule in the file** | unstyled, in the topbar |
| Duel/Flow/Rhythm | `.topbar` | ✗ | ✅ | `mini` | `select,.mini{…}` | ✅ |
| Calibrate | `.topbar` → **null** → `document.body` | ✅ `:53` | ✗ | `mini` | **no `.mini` rule** | **unstyled button at the end of `<body>`** |

Bloom/Nova/Splash bypass `attach()` and wire their own `#musicBtn`
(`X3F_Bloom.html:67,251`), labelled `Music on` / `Music off` — no `♪`.

---

# 4. `web/sw.js`, `web/manifest.json`, and the registration

## 4.1 `sw.js` in full (6 lines)

```js
const C='x3f-v8';
const A=['index.html','X3F_Arena.html','X3F_Flow.html','X3F_Bloom.html','X3F_Splash.html','X3F_Nova.html','X3F_Ascent.html','X3F_Routine.html','X3F_Progress.html','X3F_Duel.html','X3F_Rhythm.html','X3F_Library.html','X3F_Calibrate.html','x3f-exercises.js','x3f-form.js','x3f-nav.js','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>Promise.all(A.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(e.request,cp));return res}).catch(()=>caches.match('index.html'))))});
```

## 4.2 What is cached

**Precached (20 entries):** `index.html`, the twelve `X3F_*.html` pages,
`x3f-exercises.js`, `x3f-form.js`, `x3f-nav.js`, `manifest.json`, `icon-192.png`,
`icon-512.png`, `apple-touch-icon.png`.

**NOT precached, but loaded by pages that ARE:**

| file | loaded by |
|---|---|
| `x3f-cal.js` | Arena, Ascent, Bloom, Calibrate, Duel, Flow, Nova, Rhythm, Splash (9) |
| `x3f-progress.js` | Arena, Bloom, Duel, Flow, Nova, Progress, Rhythm, Routine, Splash (9) |
| `x3f-set.js` | Arena, Bloom, Duel, Flow, Nova, Rhythm, Splash (7) |
| `x3f-music.js` | 9 pages |
| `x3f-hype.js` | Bloom, Nova, Splash |
| `x3f-fx.js` | Library, Progress, Routine |
| **`x3f-band.js`** | **nothing yet — new, orphaned, and also uncached** |
| `assets/**` (18 files, 2.6 MB) | Bloom, Splash, and every menu page via `X3FFX.mount({image:'assets/ui/aurora.jpg'})` |

**Cross-origin ⇒ never cached** (line 5 returns early):
`fonts.googleapis.com` + `fonts.gstatic.com` on all 13 pages;
`cdnjs.cloudflare.com/…/three.min.js` on Ascent (that one is labelled "Needs
Internet", `index.html:141`).

## 4.3 Can it serve stale pages? — **Yes, permanently, for every file.**

The fetch handler is pure cache-first with no revalidation:
`caches.match(e.request).then(r => r || fetch(…))`. Once an entry exists it is
returned forever. Invalidation happens only when `C` changes, because `activate`
deletes caches whose key `!== C`. `C` is the literal `'x3f-v8'` and **nothing in
the repository bumps it**: `.github/workflows/pages.yml` publishes `web/`
verbatim to `gh-pages` on every push touching `web/**`, with no rewriting step,
and `DEPLOY.md` documents bumping only `app/build.gradle`'s `versionCode`.

Two flavours of staleness:
- **Whole-build staleness.** Returning PWA users keep the old `index.html`, the
  old game pages, the old `x3f-exercises.js` and `x3f-form.js` indefinitely.
- **Version skew.** Runtime-cached files (`x3f-hype.js`, `x3f-music.js`, …) are
  cached at whatever moment each user first fetched them, so any pairing of an
  old page with a newer library — or the reverse — is reachable.

## 4.4 `manifest.json` in full

```json
{
  "name": "X3F Games",
  "short_name": "X3F",
  "description": "Turn your X3 Force bar into a workout game controller.",
  "start_url": "index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#06080e",
  "theme_color": "#06080e",
  "icons": [
    {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
    {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
    {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
  ]
}
```

Missing: `id`, `display_override`, `lang`, `dir`, `categories`, `screenshots`,
`shortcuts`. `icon-512.png` is declared both `any` and `maskable` — same artwork,
so Android's circle mask will crop whatever sits in the outer ~20 %.

## 4.5 The registration

Byte-identical inline snippet in **all thirteen** HTML files (`index.html:150`,
`X3F_Arena.html:272`, `X3F_Ascent.html:282`, `X3F_Bloom.html:477`,
`X3F_Calibrate.html:222`, `X3F_Duel.html:184`, `X3F_Flow.html:202`,
`X3F_Library.html:104`, `X3F_Nova.html:570`, `X3F_Progress.html:364`,
`X3F_Rhythm.html:173`, `X3F_Routine.html:538`, `X3F_Splash.html:424`):

```html
<script>if('serviceWorker'in navigator){addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})}</script>
```

No `updatefound` handler, no `registration.update()`, no waiting-worker prompt,
no error reporting. `tools/sync-from-web.py:77` strips it from the TV bundle
with `SW_RE = re.compile(r"<script>if\('serviceWorker'in navigator\).*?</script>", re.S)`
— non-greedy, so it stops at the first `</script>` and does not swallow the
adjacent `<script src>` tags it is glued to on six pages.

`index.html` loads only `x3f-nav.js` (`:148`). It has no `x3f-fx.js` — despite
`x3f-fx.js:9-11` claiming "on the launcher it REPLACES the old bubble loop" — and
no `x3f-music.js`.

---

# 5. Defects

Ranked by blast radius. Each has file:line evidence and a reproducible scenario.

## D-SW-1 — Launching a game offline shows the home page instead of the game — **CRITICAL**

`sw.js:6` uses `caches.match(e.request)` with default options; `ignoreSearch`
defaults to `false`, so the cache key is the **full URL including the query
string**. The precache stored `new Request('X3F_Bloom.html', …)` — no query.

`x3f-exercises.js:506` returns `fileFor(game, g.file) + '?' + q.join('&')`. The
`'?'` is unconditional and `from=` is always pushed (`:502`), so **every URL the
Library and the Routine generate has a query string**:

```
X3F_Bloom.html?from=lib&band=Dark%20Gray&tempo=3000&ex=chest-press
X3F_Arena.html?mode=zone&from=routine&band=Light%20Gray&ex=calf-raise
```

**Failure scenario.** Install the PWA. Go offline. Open the Library, pick Dark
Gray on Chest Press, tap **Bloom**.
`caches.match('…/X3F_Bloom.html?from=lib&band=Dark%20Gray&tempo=3000&ex=chest-press')`
→ miss. `fetch()` rejects. `.catch(()=>caches.match('index.html'))` resolves and
the browser renders **the launcher** at the Bloom URL, with status 200. Every
guided routine launch (`X3F_Routine.html:268 launchUrl()`) fails identically.
`index.html:116` and `:122` advertise "Works fully offline".

Online it is merely wasteful: every launch is a full network fetch of a 17–42 KB
page, and each distinct `(game, band, tempo, exercise, from)` tuple is `put()`
into the cache as a separate entry. Bloom alone has 11 × 5 × 3 × 2 = 330
possible entries at ~35 KB.

## D-SW-2 — Seven of the ten shared libraries and all 2.6 MB of art are never precached — **CRITICAL**

`sw.js:2`'s `A` omits `x3f-cal.js`, `x3f-progress.js`, `x3f-set.js`,
`x3f-music.js`, `x3f-hype.js`, `x3f-fx.js`, the new `x3f-band.js`, and
`assets/**`.

**Failure scenario.** Install the PWA from the launcher (so `A` precaches), go
offline, and open Bloom from the launcher card (no query string, so the HTML
*is* served). Bloom requests `x3f-cal.js` (`X3F_Bloom.html:55`) — miss, network
fails, `.catch(()=>caches.match('index.html'))` returns **the launcher's HTML
with `Content-Type: text/html` and status 200**. The browser parses
`<!DOCTYPE html>` as JavaScript, throws `SyntaxError`, and `window.X3FCal` never
exists — Bloom's force scaling dies and the page is unusable. Same for
`x3f-progress.js` (no set logging) and `x3f-set.js` (no reporting); hype and
music fail silently behind the `window.X3FHype ? … : null` guards at
`X3F_Bloom.html:246,249`.

The same fallback turns every missing `assets/*.jpg` into an HTML document
served as an image, so `X3FFX.mount({image:'assets/ui/aurora.jpg'})`
(`X3F_Library.html:101`) gets a broken image with a 200.

## D-SW-3 — A stale build is served forever, and the exercises rewrite will never ship — **CRITICAL**

`sw.js:1` `const C='x3f-v8'`; `sw.js:4` deletes only caches `!== C`;
`.github/workflows/pages.yml` copies `web/` unmodified on every push.

**Failure scenario, live right now.** `web/x3f-exercises.js` was just rewritten
from 149 lines to 516 — the entire official reconciliation. `x3f-exercises.js`
**is** in the precache list (`sw.js:2`), so every installed PWA already holds the
149-line version and will keep serving it until `C` changes. The push/pull day
correction, the week-5 gating, the substitute flagging, the `PROTOCOL` block and
the `floorFrac` data all reach exactly zero existing users. The only user-visible
remedy is "clear site data", which also wipes `x3f_history` — their whole
training log.

## D-SW-4 — Non-OK responses are cached permanently

`sw.js:6` `fetch(e.request).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(e.request,cp));return res})` — no `res.ok`, no status, no `res.type` check.

**Failure scenario.** Deploy a build where `assets/ui/aurora.jpg` is missing.
GitHub Pages returns its 404 HTML with status 404. The SW caches that body under
`assets/ui/aurora.jpg` **forever**. Fixing the deploy an hour later changes
nothing for affected users until `C` changes.

## D-SW-5 — Google Fonts are excluded, so "offline" is untyped

`sw.js:5` returns early for cross-origin requests. Every page pulls Sora /
Fredoka / Space Grotesk (`index.html:8-9`, `X3F_Bloom.html:16`, …).

**Failure scenario.** Offline, the app renders entirely in `system-ui`. Every
`clamp()`-sized heading, the letter-spaced `.sect` labels, `x3f-hype.js`'s
`.x3fh-big` callouts and `x3f-form.js`'s panel header reflow to different
metrics. `X3F_Arena.html:82`'s landscape clamps were tuned against Sora.

## D-EX-1 — The reconciled default days will not reach any existing user — **HIGH**

`X3F_Routine.html:244`:
```js
let cfg=xget('routine2',null); if(!cfg){cfg=freshCfg();xset('routine2',cfg)}
```
`freshCfg()` (`:243`) copies `EXD.days` **only when `x3f_routine2` is absent**.
`:245` `DAYNAMES.forEach(n=>{if(!cfg[n])cfg[n]={list:[],per:{}}})` adds *missing
day names* but never reconciles an existing day's `list`.

**Failure scenario.** A user who has opened Routines even once still has
Push = `[chest-press, tricep-press, overhead-press, front-squat, calf-raise]`
and Pull = `[deadlift, bent-row, drag-curl, split-squat, calf-raise]`. The whole
point of the rewrite — the header's first bullet, "There is no leg day … which
put the calf raise on push day … and the split squat on pull day" — is exactly
the state that user is left in, permanently. There is no migration and no version
stamp on `x3f_routine2` to hang one off.

## D-EX-2 — `dayMovements()` now hands the challenge engine week-5 and substitute movements — **HIGH**

`x3f-progress.js:375-383`:
```js
var cfg = get('x3f_routine2', null);
if (cfg && cfg[key] && cfg[key].list && cfg[key].list.length) return cfg[key].list.slice();
var tag = (type === 'Pull') ? 'pull' : 'push';
var list = (window.X3FEX ? window.X3FEX.list : []);
return list.filter(function (m) { return m.day === tag || m.day === 'legs'; })
           .map(function (m) { return m.slug; });
```
The `'legs'` clause is now dead (no record has that tag). More importantly, the
`push` filter now returns **seven** movements including `pec-crossover`
(`unlockWeek: 5`), `split-squat` (`unlockWeek: 5`) and `upright-row`
(`substituteFor: 'overhead-press'`). `X3FEX.forDay()` exists precisely to filter
these and is not used.

**Failure scenario.** A fresh install in week 1 with no `x3f_routine2` yet.
`challenge()` (`x3f-progress.js:286-309`) picks a seed movement from that pool
and the Routine strip prints e.g. "Run one all-out set of Split Squat so the app
knows where you stand" (`:314`) — a movement the program says does not exist
until week 5, on a day the user has no entry for. Or it names the Upright Row,
which exists only for people who cannot press overhead.

## D-EX-3 — `verb` and `curve` contradict `x3f-form.js` on `upright-row` — **HIGH**

| slug | `X3FEX.verb` | `EXR.verb` | `X3FEX.curve` | `EXR.strongAt` |
|---|---|---|---|---|
| upright-row | `'PULL'` (`x3f-exercises.js:244`) | `'ROW'` (`x3f-form.js:76`) | `'top'` (`:243`) | `'mid'` (`:76`) |

Every other slug agrees on both. Two independent tables now encode the same two
facts and already disagree in one of eleven cases.

**Failure scenario.** Launch Nova for the Upright Row.
`X3F_Nova.html:562` `EFFORT=X3FForm.verb(slug)` renders "**ROW** TO FIRE THE
BEAM" while `X3FEX` says the verb is PULL. Meanwhile the Library's
`.strong` chip (`X3F_Library.html:84`) renders without the `.mid` class because
`ex.mid === 0`, so the page says "strongest at one end" while the animating
figure beside it in Bloom is driven by a mid-range curve
(`x3f-form.js:468` reads `ex.strongAt`).

Related: `drag-curl.name` changed to `'Bicep Curl'` (`x3f-exercises.js:328`) while
`x3f-form.js:46` still has `label: 'Drag Curl'`. `x3f-form.js:545` prefers
`meta.name`, so the two only diverge when `X3FEX` fails to load — but the fallback
then contradicts every other surface.

## D-EX-4 — The shipped default push day trips the app's own ordering rule

`orderWarning()` (`x3f-exercises.js:463-475`) warns when a `joint:'single'`
movement precedes a `joint:'multi'` one. The default push day is
`['chest-press','tricep-press','overhead-press','front-squat']`
(`:399`) and `tricep-press` is `joint: 'single'`, `order: 2`
(`:104`), ahead of two multi-joint lifts.

**Failure scenario.** `X3FEX.orderWarning(X3FEX.days[0][1])` returns
`"Tricep Press before Overhead Press will pre-exhaust a small muscle the overhead press needs. Multi-joint movements go first."` — the file's own default
data fails its own validator. Nothing calls it, so nothing surfaces the
contradiction, but any refactor that wires the warning into the Routine editor
will show it on a stock install.

## D-EX-5 — `PROTOCOL` contradicts the numbers actually in force

`x3f-exercises.js:406-422` declares constants "in one place so nothing re-invents
them". Nothing reads them, and the live values disagree:

- `tempoUpMs + tempoDownMs = 5000` and `repIdealMs = 5000`, but the only tempos
  the app offers are 4000 / 3000 / 2000 ms
  (`X3F_Routine.html:234`, `X3F_Bloom.html:81`) — **the ideal rep length is not
  selectable**, and two of the three options are below `repMinMs: 4000`, i.e. the
  file's own definition of "being rushed".
- `fullRangeFrac: 0.85` vs `X3F_Bloom.html:445` `reached = repMax >= curHi*0.78`.
- `midRangeFrac: 0.45` vs `X3F_Bloom.html:445-446` `meaningful = repMax >= R2*0.17`
  and `curHi >= R2*0.60`.
- `curveExp: 0.65` vs Bloom's linear `mapY(force)`.
- `repsMin: 15` — the "go lighter" half of the band rule that the header
  (lines 21–22) says was missing is **still** missing; `x3f-progress.js:591-598`
  only implements the `>= 40` half.

**Failure scenario.** Someone reads `PROTOCOL` and assumes it describes the app.
Every one of those five numbers is wrong about what the app does.

## D-EX-6 — `bandAdvice()` will tell users to go heavier on the calf raise

`x3f-progress.js:591-598` recommends the next band up whenever
`row.reps >= 40 && row.count >= 2`. `calf-raise`'s own mechanics text says the
opposite: *"Use a lighter band and higher reps. This is the one movement where a
big rep count is the point, not a signal to add load."* (`x3f-exercises.js:372`).

**Failure scenario.** Two logged calf-raise sets of 45 reps on Light Gray — which
is the prescribed way to do the movement — produce a dashboard card reading
"45 full reps on Light Gray means it is no longer heavy in your strong range",
recommending Dark Gray. The data to prevent this now exists (`partials`,
`mechanics`, and the fact that calf-raise is the only `[4,8]` record) and is
unused.

## D-EX-7 — Eighteen of twenty-four fields are dead weight on the wire

`x3f-exercises.js` grew 8.3 KB → 31.7 KB. `setupSteps`, `mechanics`, `faults`,
`regression` alone account for most of it, and **nothing renders them**
(verified by grep). Six pages load the file, including the three games where the
frame budget matters (`X3F_Bloom.html:93`, `X3F_Nova.html:105`,
`X3F_Splash.html:97`). On the TV bundle, `sync-from-web.py:50` copies it into
`app/src/main/assets/` where the whole APK is budgeted under 5 MB
(`x3f-music.js:2-3`).

## D-EX-8 — `get()` returns prototype members

`x3f-exercises.js:514` `return BY[slug] || null;` with `BY = {}` (`:381`).
`X3FEX.get('constructor')` returns `Object`.

**Failure scenario.** `x3f_routine2` is user-editable JSON and is round-tripped
through the Progress page's export/import (a feature `DEPLOY.md` calls out as
tested). An imported file whose day list contains `"constructor"` reaches
`X3F_Routine.html:296` `const ex=EXD.get(slug); if(!ex)return '';` — the guard
passes — and the row renders with `ex.name === undefined`.

## D-EX-9 — Four of the ten games are unreachable from the Library

The union of all `games` arrays is `{bloom, max, zone, rhythm, boss, duel}`.
`splash`, `nova`, `flow`, `ascent` appear in `GAMES`
(`x3f-exercises.js:479,480,481,487`) but in no record.
`X3F_Library.html:47` ships `.gm.splash` / `.gm.nova` styling for chips that are
never rendered. `X3F_Routine.html:232` lists all ten in `GAMEKEYS`, so they are
selectable there — the Library is the inconsistent one. Nova and Splash are the
two pages the launcher calls "Showcase games" (`index.html:91,97`).

## D-EX-10 — The band list exists in five places

| file:line | form |
|---|---|
| `x3f-exercises.js:403` | `['White','Light Gray','Dark Gray','Black','Elite Black']` |
| `x3f-progress.js:26` | the same array |
| `x3f-cal.js:40` | `BAND_DEF = {'White':130,'Light Gray':230,'Dark Gray':330,'Black':430,'Elite Black':600}` |
| `X3F_Bloom.html:105` | the same literal, repeated per game page |
| `x3f-band.js` | its own `DEFAULT` |

**Failure scenario.** X3 ships a sixth band. You add it to `x3f-exercises.js`, so
it appears in the Library and Routine `<select>`s (`X3F_Library.html:76`,
`X3F_Routine.html:332`). `x3f-progress.js:594` `BANDS.indexOf(row.band)` returns
`-1` and `bandAdvice()` silently drops every set logged on it.
`X3F_Bloom.html:254` `if(bd&&BAND_DEF[bd])` rejects the `band=` query parameter,
so the user picks the new band in the Library and Bloom scales to White.

## D-EX-11 — Two contradictory phase tables now ship together

`x3f-exercises.js:427-437` defines three phases (`Foundational` / `Strength` /
`Optimization`, `perWeek` 4/6/6). `x3f-progress.js:241` defines two
(`Foundation` / `Growth`, plus `Not started`). The Routine strip renders
`pr.phase` (`X3F_Routine.html:319`), so the progress.js names win and the new
table is invisible.

Additionally `phaseForWeek(0)` and `phaseForWeek(13)` both fall through to the
last element (`x3f-exercises.js:443`), returning **Optimization** for a program
that has not started.

## D-EX-12 — `forDay(day)` and `forDay(day, 0)` return the week-5 movements

`x3f-exercises.js:450` `var w = week || 99;` — `0` is falsy, so week 0 becomes
99 and the `w < e.unlockWeek` guard at `:454` never fires. Latent (zero call
sites) but it is the exact case `x3f-progress.js:236` models as "not started".

## D-EX-13 — Presentation is baked into the data

`setup` and `cue` carry raw `<b>` markup and are injected with `innerHTML`
(`X3F_Library.html:78,85,86,90`). `muscle` is a `·`-joined display string.
`range` is free prose used as if it were a strength-curve enum — `split-squat`'s
value is `'Superior to the front squat — and a huge amount of core work'`
(`x3f-exercises.js:217`), a comparison, rendered into a `💪` curve chip. The new
`curve` field is the enum this should have been, and the Library still reads
`mid` instead.

Not an XSS hole today (static file, no user input reaches it), but it means the
movement library cannot be rendered into a canvas, a native TV view, an `alt`
attribute or `textContent` without stripping markup.

## D-EX-14 — `mode` is the only unescaped query parameter

`x3f-exercises.js:501` `q.push('mode=' + g.mode);` versus `:502-505` which all
use `encodeURIComponent`. Safe today (`zone`/`max`/`boss`), asymmetric forever.

## D-HY-1 — Milestones are undetectable in Nova and Splash — **HIGH**

`x3f-hype.js:210,217` test `value === majors[i]` / `value === ladder[j]`. Both
point-scoring callers advance the score in jumps:

```js
// X3F_Nova.html:334
combo=Math.min(99,combo+1);const gained=Math.round(e.sc*combo);score+=gained;kills++;
if(hype)hype.set(score);
// X3F_Splash.html:376
combo=Math.min(99,combo+1);comboT=comboMaxT;const gained=c.val*combo;score+=gained;
```
Splash's `TYPES` vals are `{bubble:1, pearl:3, fish:2, star:5}`
(`X3F_Splash.html:192-195`) and combo is incremented *before* the multiply, so
the smallest possible gain is 2.

**Failure scenario.** Play Nova. Score goes … 216 → 248 → 285 …. The 250 major is
skipped: `value === 250` is never true, so no callout fires and `done['m250']` is
never set; `nextTarget()` (`:188`) then excludes it because `majors[i] > value`
is false, so the approach counter for it never runs either. An entire Nova run
leaves the hype layer blank except for the hand-rolled `hype.say()` at `:297`.
Splash is identical. Bloom is the only page where the system works, because reps
advance by exactly 1.

## D-HY-2 — Nova's `bestScore` does not exist, so "NEW BEST" can never fire — **HIGH**

`X3F_Nova.html:549` `best:()=>(typeof bestScore!=='undefined'?bestScore:0)`.
`bestScore` is **declared nowhere in the file** — grep returns only that line. So
`bestFn()` always returns 0, `x3f-hype.js:204` never fires, and
`x3f-hype.js:189` never pushes a best candidate.

**Failure scenario.** Nova has no personal-best milestone at all, and once the
score passes 250 (the last default major) `nextTarget()` returns `null` for the
rest of the run — the approach counter is permanently dead. Compare
`X3F_Splash.html:122`, which does declare and persist `bestScore` via
`xget('splashBest',0)`.

## D-HY-3 — Nova and Splash inherit rep-scale majors for a points scale — **HIGH**

Both override `ladder` but neither overrides `majors`
(`X3F_Nova.html:548`, `X3F_Splash.html:403`), so `DEF_MAJORS = [50,75,100,150,200,250]`
(`x3f-hype.js:28`) applies to a score.

**Failure scenario.** In Splash, if the score lands exactly on 50 the player gets
a **huge, gold, 34-confetti, sub-bass-fanfare `50! points - outstanding`** callout
eight seconds into a run whose top ladder rung is 10 000. Splash's own rung at
250 is shadowed by the default major at 250 — the flat `done['m'+n]` namespace
(`:211,218`) lets whichever loop reaches it first win, and majors runs first.

## D-HY-4 — Turning "Cues" off does not silence the hype layer — **HIGH**

`x3f-hype.js:91` reads `x3f_cues` once, inside `create()`. The toggle that writes
it (`X3F_Bloom.html:126`, `X3F_Flow.html:103`, `X3F_Nova.html:138`,
`X3F_Splash.html:128`) never calls `hype.mute()` — that method
(`x3f-hype.js:266`) has zero call sites.

**Failure scenario.** Start a Bloom set. At rep 8, tap **Cues off**. The page's
own `beep()` and `cue()` go quiet (`X3F_Bloom.html:127-128`, both open with
`if(!cues)return`). At rep 10 the hype layer still plays a four-note fanfare at
gain 0.18 and fires `navigator.vibrate(45)`. Only a reload fixes it, and nothing
says so.

## D-HY-5 — A rep that is both a burn milestone and a rep milestone shows one callout and plays two fanfares

`X3F_Bloom.html:455,459` call `hype.setBurn(burnoutReps)` then `hype.set(reps)` in
the same tick. Both reach `showBig()`, which is not idempotent — it overwrites
`bigEl.innerHTML` (`x3f-hype.js:163`), restamps `bigUntil`, refires `flash`,
`burst()` and `fanfare()`.

**Failure scenario.** A Bloom set reaching rep 20 with exactly 5 burnout partials.
`setBurn(5)` matches `n === 5` (`:255`) and paints "5 PAST FAILURE"; microseconds
later `set(20)` matches ladder rung 20 and overwrites it with "20". The user never
sees the burnout callout, hears both fanfares layered, and gets 36 confetti divs.

## D-HY-6 — `nextTarget()` ignores the ladder, so the approach counter goes dead mid-run

`x3f-hype.js:185-193` only pushes `majors` and `best + 1`.

**Failure scenario.** In Bloom past rep 250, all six default majors are `done` and
`done['b']` was consumed. `nextTarget()` returns `null` (`:190`) so `set()`
returns at `:227` for every remaining rep. The rungs at 60/70/80/90/110/125/175
still fire their instant callouts, but with no build-up to any of them.

## D-HY-7 — The approach counter blinks off between reps at every Bloom tempo

`x3f-hype.js:157` `nearUntil = performance.now() + 1500`; `frame()` (`:237`)
hides the element on expiry. Bloom's default rep period is 3000 ms
(`X3F_Bloom.html:229`, the `selected` option at `:81`; the Library always launches
with `tempo=3000`, `X3F_Library.html:88`). The "Gentle 4s" option is 4000 ms.

**Failure scenario.** Approaching rep 50 at 3 s tempo, "3 MORE TO 50" appears,
shakes, and vanishes 1.5 s later — absent for the whole second half of every rep
cycle. At 4 s it is absent 62 % of the time. The countdown meant to "pull you
toward" the target (`x3f-hype.js:6-7`) is dark more than it is lit.

## D-HY-8 — The rAF loop and DOM layer are never released

`x3f-hype.js:238-240` schedules `frame()` forever, once per `create()`. No
`destroy()`, no `cancelAnimationFrame`; `reset()` does not stop it. Any refactor
that recreates the hype layer (per exercise inside a guided routine, or a SPA
shell) leaks one rAF callback and one full DOM subtree per creation — precisely
the budget `x3f-fx.js:7-9` says the project cannot afford on a TV SoC.

## D-HY-9 — `id="x3fhBurnN"` is a document-global id emitted by a factory

`x3f-hype.js:85`. Two instances ⇒ duplicate ids. Also entirely unused
(`:251` reads `burnEl.querySelector('b')`).

## D-HY-10 — Reduced-motion is only half honoured

`x3f-hype.js:65` suppresses only `.x3fh-near.shake`. The 34-element confetti
burst, the `.x3fh-flash` screen-blend pulse and `.x3fh-big`'s
`scale(.5) rotate(-3deg)` overshoot all still run under
`prefers-reduced-motion: reduce`.

## D-MU-1 — A backgrounded tab schedules an unbounded burst of notes on return — **HIGH**

`x3f-music.js:181-184`:
```js
var horizon = ctx.currentTime + 0.35;
while (nextTime < horizon) {
  tickStep(Math.max(nextTime, ctx.currentTime + 0.02));
  nextTime += spb;
}
```
`setInterval(pump, 120)` (`:192`) is throttled to ~1 Hz in a hidden tab while
`ctx.currentTime` keeps advancing. `nextTime` falls behind and the catch-up loop
has **no iteration cap**; every over-due step is clamped to the *same* instant.

**Failure scenario.** Start Duel (128 bpm ⇒ `spb = 0.1172 s`), switch apps for
one second. The next `pump()` schedules ~8 sixteenths — hats, a kick, bass and
melody — **all at the same 20 ms offset**: an audible thud. Under heavier
throttling (Chrome intensive throttling after 5 min hidden, or an Android WebView
pausing timers) the gap is 60 s: for bloom that is `60/0.2206 ≈ 272` steps in one
loop, each creating 2–6 nodes, so ~1 000 oscillators/gains/filters starting within
20 ms. There is no `visibilitychange` handler anywhere in the file.

## D-MU-2 — `swing` never applies to the melody; it is dead code

`x3f-music.js:160`:
```js
note(degree(d), at + (M.swing && step % 2 ? 0.03 : 0), …)
```
This sits inside `if (step % density === 0)` (`:157`) where `density` is `2`, `4`
or `8` — always even. `step % density === 0` with an even `density` implies `step`
is even, so `step % 2 === 0` and the ternary is **always false**.

**Failure scenario.** `rhythm` declares `swing: 0.14` and `splash` `0.12`
(`:60,30`). Neither produces any swing. Rhythm — the game whose premise is "the
beat is the point" (`:57`) — is dead straight. Even if the branch were reachable,
the offset is the literal `0.03`; the numeric mood value is never used as a
magnitude.

## D-MU-3 — `glide` is a 0.1 % pitch ramp, i.e. inaudible

`x3f-music.js:102`:
```js
if (glide) osc.frequency.exponentialRampToValueAtTime(freq * 1.001, at + glide);
```
`freq * 1.001` is 1.7 cents — well under the ~5-cent just-noticeable difference.
`calibrate` sets `glide: 0.12`, `bloom` `0.09` (`:65,25`) intending a portamento
pad; nothing audible happens. Only the pad passes it (`:148-149`); bass and melody
pass `0`.

## D-MU-4 — Calibrate's music button lands at the bottom of `<body>`, unstyled

`X3F_Calibrate.html:226-227`:
```js
X3FMusic.attach({mood:"calibrate",getIntensity:f,
  buttonHost:document.querySelector(".topbar")||document.body,buttonClass:"mini"});
```
`X3F_Calibrate.html` has **no `.topbar`** — its header is `class="top"` (`:53`) —
and **no `.mini` CSS rule**.

**Failure scenario.** Open Calibrate. A default grey browser `<button>` reading
`♪ Music off` appears as the last element of the document, below the fold,
outside `.wrap`. It carries `data-nav` (`x3f-music.js:250`), so a TV D-pad user
can focus a control visually detached from every other control on screen.
`X3F_Arena.html:279` has the missing-`.mini` half of the same bug.

## D-MU-5 — The Library's music button is unstyled

`X3F_Library.html:98` passes no `buttonClass`, so `attach` uses `'home'`
(`x3f-music.js:249`). Library declares only `a.home{…}` (`:21`) — an
element-qualified selector that cannot match a `<button>`. Routine (`:23`) and
Progress (`:22`) both write `a.home,button.home{…}`; Library was missed.

**Failure scenario.** The Library top bar shows two rounded pill links
("Routines", "Home") and, between them, a default OS button reading `♪ Music off`.

## D-MU-6 — Three vocabularies for one control

`x3f-music.js:256` writes `'♪ Music on'` / `'♪ Music off'`.
`X3F_Bloom.html:252`, `X3F_Nova.html:553`, `X3F_Splash.html:408` write
`'Music on'` / `'Music off'`. The server-rendered text is `Music`
(`X3F_Bloom.html:67`).

## D-MU-7 — Window listeners are added per instance and never removed

`x3f-music.js:210-212` (`armAutostart`) and `:243-245` (`attach`) both add
`pointerdown` + `keydown` to `window` with no teardown — four for an `attach()`.
`tryIt` stays attached for the life of the document even once the context runs,
and `lift = 0.5` fires on every keypress even when music is off.

## D-MU-8 — Intensity and duck smoothing are timer-rate-dependent

`x3f-music.js:169` and `:174` both assume a fixed 120 ms tick. In a throttled tab
the same coefficients give an 8× faster wall-clock response. `attach()`'s default
`lift *= 0.92` (`:239`) has the same problem and is only decayed when `pump()`
gets past `if (!on || !ctx) return;` — so with music off, `lift` freezes.

## D-MU-9 — `stop()` leaves the AudioContext running

`x3f-music.js:196-201` clears the interval and zeroes `master.gain` but never
calls `ctx.suspend()` or `ctx.close()`. The audio thread, the noise buffer and
every decaying node stay resident. It also does not reset `duckUntil`, so a
`duck()` issued just before `stop()` is still in effect on the next `start()`.

## D-MU-10 — `mood()` can lie

`x3f-music.js:224` returns the *requested* mood while `:76`
`MOODS[o.mood] || MOODS.calm` may have silently fallen back.

## D-MISC-1 — `x3f-band.js` is loaded by nothing

New file, 212 lines, exporting `window.X3FBand` (`:198-211`) and reading
`X3FEX.get(slug).band` (`:138-139`). No `<script src="x3f-band.js">` exists in
any page, and it is absent from `sw.js`'s precache list. Dead on arrival until
something loads it — and it will hit D-SW-2 the moment something does.

## D-MISC-2 — Routine can launch `ascent` on the TV, where the file does not exist

`X3F_Routine.html:232` `GAMEKEYS` includes `'ascent'`. `tools/sync-from-web.py:84`
injects `ascent:'ascent.html'` into `X3FFILES`, but the script's `GAMES` map
(`:39-48`) does not include `X3F_Ascent.html`, and `app/src/main/assets/` has no
`ascent.html`.

**Failure scenario.** On the TV, set any movement's game to Ascent and press
Play → a `file://` 404 inside the WebView.

---

# 6. Design weaknesses and opportunities, ranked

**1 — The service worker needs replacing, not patching.**
Five of the top defects live in six lines. A rewrite should: match navigations
with `ignoreSearch: true` (or strip the query before matching); take a
build-stamped cache name (the `pages.yml` job can `sed` `GITHUB_SHA` into it);
guard on `res.ok`; generate the precache list rather than hand-typing it; adopt a
cross-origin font strategy (self-host, or cache-first in a separate cache); and
use a navigation-only offline fallback so a failed `.js` never returns HTML. Add
an `updatefound` → "new version, reload" affordance — today there is no path from
a shipped fix to an installed user, which is exactly why the exercises rewrite is
currently stranded.

**2 — Land the reconciliation on existing installs.**
The `x3f-exercises.js` rewrite is correct and reaches nobody: the SW pins the old
copy (D-SW-3), and even after that is fixed, `x3f_routine2` freezes the old day
lists (D-EX-1). Both need doing, and the second needs a version stamp on the
stored config plus a migration that reconciles day lists against `X3FEX.days`
while preserving user edits.

**3 — Wire up the data that was just added, or it is 20 KB of dead weight.**
`floorFrac` → `x3f-cal.js`'s uncalibrated floor. `curve`/`verb` → replace
`x3f-form.js`'s `strongAt`/`verb` so the two tables cannot diverge again
(D-EX-3). `partials` → Bloom's burnout expectations and `x3f-progress.js`'s
partial achievements. `forDay()` → `x3f-progress.js:380` so challenges stop
naming week-5 and substitute movements (D-EX-2). `PROTOCOL` → the tempo pickers,
Bloom's rep thresholds and `bandAdvice()` (D-EX-5, D-EX-6). `orderWarning()` →
the Routine editor. Until then, ship `setupSteps`/`mechanics`/`faults` from a
separate lazily-fetched JSON so the games do not pay for coaching prose.

**4 — Make milestone detection *crossing*-based, not equality-based.**
Track the previous value and fire for every target in `(prev, value]`. That one
change makes the hype system work for Nova and Splash — two thirds of its call
sites. While in there: let callers pass `majors`, derive a default from the
ladder's own magnitude instead of hardcoding rep-scale numbers, and have
`nextTarget()` consider the ladder so the approach never goes dead.

**5 — `x3f-exercises.js` should own the band table too.**
Five copies of the band list, plus `x3f-cal.js`'s force defaults and a literal in
each game page (D-EX-10). Fold `BAND_DEF`'s numbers in beside `BANDS`; the new
`bandRank` field is already the ordering primitive that would let `bandAdvice()`
reason per movement instead of globally.

**6 — Separate presentation from data.**
`setup`/`cue` are HTML strings, `range` is prose, `muscle` is a `·`-joined
display string (D-EX-13). Structured fields plus a formatter would unlock the
Library, the TV 10-foot layout, the form panel and any future voice output from
one table — and would remove the `innerHTML` sink.

**7 — Drive the music scheduler from the audio clock.**
Cap the catch-up loop (`if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05`),
add a `visibilitychange` handler that suspends and re-bases `nextTime`, and make
the smoothing coefficients time-based (`1 - Math.exp(-dt/tau)`). Kills D-MU-1 and
D-MU-8 together.

**8 — Three AudioContexts per game page is one too many.**
`X3F_Bloom.html:127` (cues), `x3f-hype.js:97` (fanfare) and `x3f-music.js:87`
(soundtrack) each own a context and connect to their own `destination`.
Consequences: `music.duck()` cannot duck a fanfare; the fanfare's gain
(0.18–0.22, `x3f-hype.js:118`) is louder than the entire soundtrack
(`0.34 × 0.5 = 0.17`, `x3f-music.js:177`); one global mute is impossible. A shared
context module with named buses (music / cues / hype) and one master fixes the
mix, halves the gesture plumbing, and gives `x3f_cues` a single place to be
honoured live (D-HY-4).

**9 — Fix `swing` and `glide` or delete them.**
Ten presets declare both; neither does anything (D-MU-2, D-MU-3). The table
promises variety it does not deliver, and Rhythm's straight sixteenths are the
most visible cost.

**10 — Unify the music button.**
Six pages roll it by hand or pass mismatched hosts and classes (D-MU-4, D-MU-5,
D-MU-6). One helper that finds-or-creates, uses one label and injects its own
style (the way `x3f-hype.js`'s `css()` does) removes three defects and the
class-name coupling between a library and eleven stylesheets.

**11 — Extend the exercise → game mapping.**
Four games are unreachable from the Library (D-EX-9), including the two the
launcher calls the showcase. `games` should probably be derived: every
rep-countable movement suits `bloom`/`flow`, every movement suits `zone`/`max`,
and only a few genuinely suit `duel`/`boss`. `pec-crossover` has no bar at all
(`bandConfig:'loop'`), which the data now knows and no game does.

**12 — The launcher is the odd page out.**
`index.html` has no `x3f-fx.js` (though `x3f-fx.js:9-11` says it replaces the
launcher's bubble loop), no `x3f-music.js`, and no `.top`/`.topbar` for a music
button. It is also the only page duplicating knowledge `X3FEX.games` already
holds — `index.html:91-142` hardcodes ten cards with names, subtitles and hrefs.

**13 — Deduplicate the thirteen copies of the SW registration snippet.**
Byte-identical in every page (§4.5), glued onto the same line as unrelated
`<script src>` tags in six of them, and `tools/sync-from-web.py` has to regex it
back out. An `x3f-boot.js` holding the registration + the equally-duplicated
wake-lock IIFE + `x3tv()` removes ~40 duplicated lines and one fragile regex.

**14 — Give the shared libraries a teardown story.**
Neither `X3FHype.create()` nor `X3FMusic.create()` returns a `destroy()`. Both
leak (a permanent rAF loop; four permanent window listeners; a live
AudioContext). Fine for one-page-per-game, load-bearing the moment anything is
created twice.

**15 — Test coverage is thin on exactly these files.**
`tools/func-test/cases.js` asserts only that the modules loaded (`:242-244`),
drives twelve `hype.set()` calls and one `hype.setBurn(7)` (`:253,255`), and
checks `#musicBtn` exists (`:244,320`). Nothing tests `gameUrl()`'s output, the
ladder, the mood table, or the service worker. Cheap wins: a table test asserting
`X3FEX` ↔ `x3f-form.js` slug/verb/curve parity; a test asserting every file a page
`<script src>`s appears in `sw.js`'s `A`; a test asserting `orderWarning(days[i])`
is null for the shipped defaults.

---

# 7. Invariants — what a refactor must not break

**INV-1 — The eleven slugs are a shared primary key across six files, and the file says so.**
`x3f-exercises.js:30-34`: *"SLUGS ARE FROZEN … Renaming them would silently
orphan the user's training history."* They are defined at `:71-379`, mirrored in
`x3f-form.js:31-103` (`EXR`, verified 1:1), used as `slug + '|' + band` keys in
`x3f-cal.js`, stored as `ex:` in every `x3f_history` entry
(`x3f-progress.js:52-56`), read by `x3f-band.js:138`, and round-tripped through
`?ex=` (`x3f-exercises.js:505` → `X3F_Bloom.html:259`, `X3F_Nova.html:560`,
`X3F_Splash.html:415`). `officialSlug` exists precisely so the real names can be
used without renaming. **Any rename needs a migration over `x3f_history`,
`x3f_exCal`, `x3f_routine2` and `x3f_libBand`.**

**INV-2 — `X3FEX.bands` must stay in its current order, weakest first.**
`x3f-progress.js:591-596` computes `BANDS.indexOf(row.band)` and recommends
`BANDS[i + 1]`. Reordering inverts the band-progression advice. `bandRank`
(1 = heaviest) runs the *opposite* direction — do not conflate them.

**INV-3 — The five band names are string-identical across five files.**
`x3f-exercises.js:403`, `x3f-progress.js:26`, `x3f-cal.js:40`, one literal per
game page (`X3F_Bloom.html:105`), and `x3f-band.js`. They are object keys *and*
`?band=` query values (`x3f-exercises.js:503` → `X3F_Bloom.html:254`
`if(bd&&BAND_DEF[bd])`). Changing `'Light Gray'` to `'Light gray'` anywhere
silently breaks the launch parameter and the calibration lookup.

**INV-4 — `X3FEX.days` is a *seed*, not live config.**
`X3F_Routine.html:243-247`. Existing users' day lists are already frozen in
`x3f_routine2`; `:245` adds missing day names but never reconciles an existing
day's `list`, and `:247` falls back to `DAYNAMES[0]` only when the stored `day`
is missing from `cfg`. This is the mechanism behind D-EX-1 — a refactor must
either migrate deliberately or leave it alone deliberately, not by accident.

**INV-5 — `GAMES` keys are persisted user data.**
`X3F_Routine.html:258` stores `per(slug).game` inside `x3f_routine2`;
`X3F_Library.html:88` emits them into hrefs. Removing or renaming a key leaves
stored routines pointing at nothing; `gameUrl` falls back to `GAMES.bloom`
(`x3f-exercises.js:500`) so it degrades rather than crashes, but the user's chosen
game silently becomes Bloom.

**INV-6 — `GAMES[k].tempo` is the flag that shows the tempo control.**
Set only on `bloom` and `flow` (`x3f-exercises.js:478,481`). Read by `gameUrl`
(`:504`, gating the `tempo=` param) **and** by `X3F_Routine.html:333`
`style="${EXD.games[c.game].tempo?'':'display:none'}"`. Removing it hides the
control and drops the parameter; adding it to a game that ignores `?tempo=` shows
a dead control.

**INV-7 — `window.X3FFILES` must be readable by `gameUrl` at call time.**
`x3f-exercises.js:494-497`. `tools/sync-from-web.py:82-86` injects it just before
`</head>` on the three menu pages. The TV bundle's navigation depends entirely on
this indirection.

**INV-8 — `X3FEX` must be defined before the page's own inline script runs.**
`X3F_Library.html:73` and `X3F_Routine.html:231` both do
`const EXD=window.X3FEX, BANDS=EXD.bands;` with **no guard** — a `TypeError`
blanks the whole page if the script fails to load. (`X3F_Calibrate.html:89`
guards; `x3f-band.js:138` guards.) Any move to `defer` / `type="module"` for
`x3f-exercises.js` breaks these two pages unless the consumers move too.

**INV-9 — The legacy compatibility fields must keep existing.**
`x3f-exercises.js:68-69` is explicit: *"setup, cue, range, mid, muscle, games
kept for backwards compatibility with the existing Library and Routine pages"*.
`X3F_Library.html:82-88` reads `name`, `muscle`, `mid`, `range`, `setup`, `cue`,
`games`, `slug`; `X3F_Routine.html:298-299` reads `name`, `muscle`, `band`.
Dropping any of them before those pages are rewritten blanks the Library.

**INV-10 — `x3f-hype.js`'s `host` must be a positioned element.**
`.x3fh{position:absolute;inset:0}` (`:35`). All three callers pass `$('stage')`
and `.stage{…;position:relative;…}` (`X3F_Bloom.html:36`). An unpositioned host
silently anchors the overlay to the viewport.

**INV-11 — `x3f-hype.js` sits at `z-index:7`.**
`:35`. Host games use `z-index:5` for HUD chrome and `z-index:30` for overlays
(`X3F_Bloom.html:27,45,49`). The layer must stay above 5 and below 30, or callouts
either hide behind the HUD or cover the end-of-set sheet. `x3f-form.js`'s `.x3ff`
panel (`:522`) has no `z-index`, so it currently paints below the hype layer
regardless of DOM order.

**INV-12 — `x3f_music` holds the string `'true'` / `'false'`, and absent means off.**
`x3f-music.js:83,193,200`. Written with a raw `localStorage.setItem`, not via the
pages' `xset` helper — compatible by luck (`JSON.stringify(true) === 'true'`),
not by design.

**INV-13 — `x3f_cues` is written as JSON by the games' `xset('cues', …)` helper.**
`X3F_Bloom.html:104,126`; read at `x3f-hype.js:91`. The helper prefixes `'x3f_'`.
Any settings refactor must keep the key name, the JSON boolean encoding, and the
`=== false` (not falsy) test — `null` must continue to mean "cues on".

**INV-14 — `getIntensity()` is called from a `setInterval`, not a rAF, and must be cheap and side-effect-tolerant.**
`x3f-music.js:168`, 8.3 Hz. Five pages wrap it in `try/catch` returning `0.25`
because `force`/`ref()` may not exist yet. `attach()`'s default *mutates* `lift`
inside it (`:239`), so the function is not pure and its call frequency is
load-bearing.

**INV-15 — `x3f-music.js` must keep starting from a user gesture.**
`armAutostart()` (`:205-214`) plus the deferred `setTimeout(start, 250)` is what
satisfies Chrome's autoplay policy and what makes "it was on last session" work.
Removing either listener means no music for anyone who had it on.

**INV-16 — `sw.js`'s entries must resolve relative to the worker's scope.**
`c.add(new Request('index.html', …))` (`:3`) and `caches.match('index.html')`
(`:6`) both resolve against the SW script URL. On GitHub Pages the site is served
at `/x3f-tv/`, so these become `/x3f-tv/index.html`; `manifest.json`'s
`start_url: "index.html"` resolves against the manifest URL to the same path.
Making any of these root-absolute (`/index.html`) breaks the Pages deployment.

**INV-17 — The TV bundle must not contain a service worker.**
`tools/sync-from-web.py:10-12,77` strips both the registration and the manifest
link, because a cached SW in a `file://` WebView is unrecoverable. Any change to
the snippet's exact text
(`<script>if('serviceWorker'in navigator)…</script>`) must be mirrored in
`SW_RE`, or the TV build silently ships a worker it cannot update.

**INV-18 — `x3f-exercises.js` must stay byte-identical (modulo CRLF) between `web/` and `app/src/main/assets/`.**
`sync-from-web.py:50`'s `SHARED` list copies all nine libraries verbatim and
`--check` exits non-zero on drift (`DEPLOY.md`). **The bundle is stale right now**
— `app/src/main/assets/x3f-exercises.js` is still the 149-line version. A refactor
that makes the web copy depend on something the bundle lacks (an ES module, a
fetch, a build step) breaks the TV app.

**INV-19 — `hype.say()` is the announcement channel for achievements.**
`x3f-set.js:90-98` `announce(fresh, hype)` calls `hype.say(…)` when a hype layer
was passed, and stretches its own timing to `2400 ms` to match `showBig`'s
`2100 ms` window (`x3f-set.js:98`). `X3F_Splash.html:211` and `X3F_Nova.html:286`
pass `hype:hype` into `X3FSet.report`. Changing `say`'s signature
`(title, sub, huge)` or its display duration desynchronises the achievement queue.
