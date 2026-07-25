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
- **Phone access, free** — CI publishes `web/` to `gh-pages`. No Firebase, no
  account, no server, nothing that can collide with another project. History moves
  between devices as an exported file.
- Fixed: Bloom wrote **two** history entries per set (legacy + engine), inflating
  every total; the dashboard did not re-evaluate achievements after an import;
  `program()` reported Week 1 on an empty log and handed out a badge for it.

---

## Next

### Correctness and data — do these first

**1. Only Bloom and guided sets report rich data.** Flow, Arena, Duel, Rhythm,
Splash and Nova still log a score, not reps/partials/peak against a movement. So
PBs, challenges and achievements are blind to most of the suite, and a challenge
can only ever name a movement you happened to train in Bloom. Fix: one shared
`X3FSet.report()` each game calls when a set ends. *Highest value item on this
list — everything else in v1.1 gets better the moment it lands.*

**2. History truncates.** `x3f_history` keeps 600 entries and drops the oldest. A
12-week cycle at five lifts, six days a week is ~360 entries; two cycles and real
history starts falling off the front. Fix: compact anything older than ~8 weeks
into per-day rollups (day, movement, band, best reps, partials, peak) so the grid
and PBs survive indefinitely at a fraction of the size.

**3. Challenges ignore Push vs Pull.** The engine knows today's day type but the
challenge picker does not use it, so it can ask for Bent Row on a push day. Bias
selection to today's movements, and fall back to anything if there is no history
for them.

**4. No undo.** A mis-tapped "Log set" is permanent and silently pollutes PBs.
Needs an undo on the summary and a delete on the dashboard's recent list.

**5. No time-under-tension or eccentric timing.** The bar can see both, and both
are central to the method — slow negatives especially. Nothing logs them, so
challenges cannot ask for holds and the eccentric-quality idea has no data. Log
per-rep down-phase duration and a smoothness score.

### Optimisation

**6. The nav audit takes 6–8 minutes** because it launches a browser per screen.
One browser driven over CDP, or screens in parallel, would make it a pre-commit
check instead of a coffee break.

**7. Recomputation.** `streak()` calls `bestStreak()` every time, and the
dashboard calls both repeatedly; achievements rebuild all ~130 closures on each
refresh. Cache a stats snapshot keyed on the log length and timestamp.

**8. Three animation loops on a TV SoC.** The game's own rAF, the form rig's rAF
and the music scheduler's interval all run at once. Measure it on the Hisense;
if it costs frames, drive the form rig from the game's existing loop via the
`frame(dt)` hook that already exists.

**9. The bundle is 4.68 MB and ~2.5 MB of that is PNG art.** WebP would roughly
halve it, with a PNG fallback for anything that cannot decode it.

**10. `pbTable()` walks the whole log per call** and the dashboard calls it three
times per refresh. One pass, shared.

### Engagement

**11. Post-set summary that names what improved.** "Chest press: 3 more full reps
than last Tuesday, and 2 more partials." The data is there now; nothing says it.

**12. Weekly review card.** Volume, new PBs, adherence, one sentence of praise or
a nudge. Fires on the last day of your week, not on Sunday.

**13. Unlocks should use the hype layer everywhere.** Bloom shows a proper
callout; Routine still uses `alert()`, which is jarring and blocks the page.

**14. Rest day earned.** The engine knows the weekly target. When you have hit it,
say so — "rest day earned, streak safe" — instead of leaving a gap that looks like
failure.

**15. Household profiles.** A profile prefix on the storage keys, a picker on the
launcher, separate histories. Same-band head-to-head only; no leaderboards.

### TV polish

**16. 10-foot pass for game HUDs.** The menus scale their type at ≥1200px; the
games do not. Force numbers and chips are still phone-sized across a room.

**17. Music restarts on every navigation** because each page is a fresh document
in the WebView. Either hand playback to the native side, or accept it and make the
menu mood identical everywhere so it reads as continuous.

**18. Import on the TV is impractical** — no keyboard. Export shows text to copy;
realistically the phone (gh-pages) is the device you import on. A pairing code
would need a server, which is the thing we are deliberately not building.

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
