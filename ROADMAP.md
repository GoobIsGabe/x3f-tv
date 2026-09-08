# X3F — Roadmap

Living document. Supersedes the v0.4 PDF.

## The thing to keep straight

X3 is **one all-out set per movement**, four or five movements, roughly twenty
minutes, six days a week, for twelve weeks. That single fact decides every feature
here, and it kills a lot of otherwise-obvious ideas:

- There is no "3 sets of 10" to pace, so pacing features are pointless.
- The set is short and brutal, and **the last five reps are the entire workout**.
- Progression is not "add weight". It is **change bands**, and knowing *when* is
  the hardest judgement call in the program.
- Adherence over twelve weeks is the whole game. Six days a week is a lot of
  Tuesdays.

So: make the **last five reps** feel enormous, make the **twelve-week arc**
visible, and make **tomorrow** easy to start.

---

## Shipped

**v1.0** — guided workout mode, live form demonstrator, milestone moments
(escalating countdown into the majors, PB callouts), generated soundtrack, one set
per lift.

**v1.1** — the program brain and everything reading from it:

- **`x3f-progress.js`** — 12-week program derived from what you have *done* (a
  missed Tuesday shifts the plan instead of breaking it), streak with **one rest
  day allowed per rolling week**, PBs per movement *and* band, daily challenges,
  ~130 generated achievements, band-progression coaching. 40 engine tests.
- **Daily challenges** — deterministic for the date, aimed at a **percentage** of
  your own best (70–90%), so it is "match this" not "beat this"; you cannot PR
  daily and should not be asked to. Reps, partials or peak force, whichever your
  history supports. No history yet → "set your first benchmark".
- **Achievements** — generated from 16 templates × parameters rather than written
  by hand: lifetime reps, per-movement mastery, band mileage, burnout depth,
  streaks, program weeks, challenges completed, session counts, guided sessions,
  single-set feats, peak force, perfect weeks, days trained, day variety, coming
  back after time off, burnout specialisation.
- **Score the failure** — partials past full-range collapse get their own meter,
  their own milestones ("10 PAST FAILURE"), and the headline slot in the set
  summary. Total reps quietly rewards stopping at a round number; this rewards
  what the program actually asks for.
- **Dashboard** (`X3F_Progress.html`) — today's day and phase, the challenge, an
  84-day adherence grid, reps-per-week and peak-force-per-week, PB table, band
  coaching, achievements with filters, and export/import.
- **Music everywhere** — 10 moods across menus and every game, reacting to effort
  (or to your keypresses on a menu, so the app feels awake).
- **Phone access, free** — CI publishes `web/` to Firebase Hosting at
  <https://x3f-tv.web.app>, free on Spark. History moves between devices either by
  pairing the phone to the TV, or as an exported file with no account at all.
- Fixed: Bloom wrote **two** history entries per set (legacy + engine), inflating
  every total; the dashboard did not re-evaluate achievements after an import;
  `program()` reported Week 1 on an empty log and handed out a badge for it.

---

## Shipped in v1.2 — the whole suite feeds the program

- **`x3f-set.js`** — one way for any game to say "a set finished" (was roadmap #1,
  the highest-value item). Flow, Arena (max / boss / zone), Duel, Rhythm, Splash
  and Nova all report now, so personal bests, challenges and achievements finally
  see the whole suite instead of only Bloom. It resolves the movement from `?ex=`
  and the band from shared storage, measures **peak force and time under tension
  itself** so no game needs its own tracker, names what improved versus your last
  set of that movement, and announces unlocks through the hype layer (never a
  dialog).
- **History no longer truncates** (#2). Anything older than eight weeks folds into
  one rollup per day+movement+band — bests survive, `n` keeps session counts
  honest — so a 12-week cycle at five lifts a day cannot push real history off the
  front any more.
- **Challenges follow the day** (#3). Push day asks for push movements. Your edited
  Routines day list wins; otherwise the library's day tags decide, with legs
  counting for both.
- **Undo** (#4). "Undo last set" on the session summary, and a delete on every row
  of a new Recent Sets list on the dashboard. A mis-tap no longer poisons a PB.
- **Eccentric timing and time under tension** (#5). Bloom times each lowering
  phase and reports the average; the reporter tracks tension everywhere. Two new
  badge families (Slow Negative, Under Tension), a new challenge shape, and a
  negative-seconds column in the PB table.
- **Optimisation** — the nav audit went from 6–8 minutes to **30 seconds** (#6:
  a blocking `alert()` plus an unbounded BFS), `sets()`/`pbTable()`/`stats()` are
  memoised on a log revision key (#7, #10), and `x3f-nav.js` reuses its item list
  for 50ms, saving a style recalc per item per keypress.
- **What improved, said out loud** (#11) and **rest day earned** (#14) on both the
  launcher strip and the dashboard.
- **10-foot pass for game HUDs** (#16) — force numbers, chips, toasts and cards
  scale up at ≥1200px wide, injected from the shell so the phone build is
  untouched.
- Fixed along the way: the session summary was being counted as a *set*, inflating
  session and day counts and making undo remove the summary instead of your last
  set; the watcher missed sets shorter than one sample interval.

Tests now: 67 engine, 79 functional across 7 screens, 12 screens / 27 states of
navigation.

---

## Shipped in v1.7 — the visual pass

- **`x3f-fx.js`** — one ambient layer behind every menu: a generated aurora, drifting
  motes, vignette and film grain, with bursts when something lands. It obeys the
  two constraints this roadmap set: it does **not** run inside the games (they
  already own a loop, and the form rig and music scheduler are two more), and on
  the launcher it **replaced** the old bubble loop, so that page went from two
  loops to one. It also watches its own frame cost and sheds work in order —
  grain, then motes, then drift — degrading to a still backdrop rather than a
  stutter, and honours `prefers-reduced-motion`.
- **Generated art**, kept deliberately tiny: an aurora backdrop (26 KB) and five
  tier medallions (52 KB). 78 KB total against a 3.9 MB bundle.
- **The achievements wall** is now 117 medallions rather than 117 identical emoji:
  a forged badge per tier, a glyph per family, locked ones desaturated, unlocked
  ones catching a single sheen.
- **Focus that reads across a room** — the cursor ring breathes and a sheen sweeps
  whatever just took focus, and page changes fade instead of snapping.
- **Panels got their own ground.** Translucent cards over a moving backdrop are
  unreadable; every surface now sits on its own dark base with the ambience
  around it rather than through it.
- Fixed: eccentric seconds printed raw floats at the user (`2.6999999999999997s`).

---

## Next

### Correctness

**1. Calibrate does not report.** By design — it measures a band's true max rather
than training a movement — but that max is the input to every force percentage in
the app, and nothing records *when* it was last calibrated. A stale White-band max
silently skews every intensity reading. Log a calibration event and surface "last
calibrated 6 weeks ago".

**2. Score games log per run.** Splash and Nova report on every run end, so three
quick attempts read as three sets. Days and streaks are unaffected (same day) but
session counts inflate. Either debounce to one entry per movement per day, or mark
run entries so `sessions` counts them once.

**3. Legacy `logSession` is now dead code** in most games — still defined, still
called only as a fallback. Remove it once the reporter has a release of real use
behind it.

### Engagement

**4. Weekly review card.** Volume, new PBs, adherence, one sentence. Fires on the
last day of *your* week, not on Sunday.

**5. Household profiles.** A profile prefix on the storage keys, a picker on the
launcher, separate histories. Same-band head-to-head only.

**6. The form demonstrator only appears with `?ex=`.** Launch a game from the
launcher and there is nothing to mirror. Offer the last-trained movement as a
default so the guidance is there unless you turn it off.

### Optimisation

**7. Three animation loops on a TV SoC** — the game's rAF, the form rig's rAF and
the music scheduler. The rig already exposes `frame(dt)`; drive it from the game's
loop if the Hisense drops frames.

**8. The bundle is 4.7 MB and ~2.5 MB is PNG.** WebP roughly halves it.

### TV polish

**9. Music restarts on every navigation** because each page is a fresh document.
Either hand playback to the native side or keep the menu mood identical everywhere
so it reads as continuous.

**10a. The ambient layer is verified by screenshot, not on the TV.** Frame cost on
the Hisense is the open question — the auto-degrade should handle it, but nobody
has watched it decide yet. `X3FFX.stats()` reports the quality tier and average
frame time if it needs checking.

**10b. Only the menus got the visual pass.** The games still have their own
in-game look; the medallions, the ambient layer and the focus treatment stop at
the menu boundary on purpose, but the seam is visible if you go looking.

**10. The 10-foot pass is verified headlessly only.** Type scale is a judgement
call that needs eyes on the actual couch; expect one round of adjustment.

**11. Import on the TV is impractical** — no keyboard. The phone build
(<https://x3f-tv.web.app>) is the realistic device for that, and pairing removed
most of the need for it.

---

## Deliberately not doing

- **XP, levels, coins, unlockables.** They reward time spent, and the workout is
  twenty minutes. A currency would encourage padding sets.
- **Leaderboards against strangers.** Force numbers are not comparable across
  bands, body weight or bar setup, so the ranking would be noise dressed as
  competition. Household head-to-head on the same band is fine.
- **Streaks that punish rest.** One rest day per rolling week is built in.
- **Bundled video demos.** Tens to hundreds of MB, and the live demonstrator
  already mirrors you in real time.
- **A backend.** Local-first plus a file export covers it, costs nothing, and
  cannot interfere with anything else.

---

## Notes

- Everything must survive being offline and fit a sub-5MB APK. That is why the art
  is procedural-with-slots, the music is generated and there is no video.
- `web/` is the source of truth; `app/` is generated from it. See
  [DEPLOY.md](DEPLOY.md).
- Three test suites: `tools/nav-audit/run.py` (remote reachability, 12 screens),
  `tools/func-test/run.py` (features, 63 assertions), and the engine tests in
  `tools/func-test/engine.html`.
