# X3F — Roadmap

Living document. Supersedes the v0.4 PDF roadmap.

## The thing to keep straight

X3 is **one all-out set per movement**, four or five movements, roughly twenty
minutes, six days a week, for twelve weeks. That single fact should decide every
feature here, and it kills a lot of otherwise-obvious ideas:

- There is no "3 sets of 10" to pace, so pacing features are pointless.
- The set is short and brutal, and **the last five reps are the entire workout**.
  Everything that happens before them is warm-up you have to get through.
- Progression is not "add weight". It is **change bands**, and knowing *when* is
  the hardest judgement call in the program. Nobody tracks it well.
- Adherence over twelve weeks is the whole game. Six days a week is a lot of
  Tuesdays.

So: engagement should make the **last five reps** feel enormous, make the
**twelve-week arc** visible, and make **tomorrow** easy to start. Anything that
rewards time-in-app rather than effort is working against the program.

---

## Shipped (v1.0)

- **Guided workout mode** — Push / Pull / Custom days, per-movement coaching
  (setup, cue, strongest-range note), the game launched pre-configured, set
  logging, rest timer. One set per movement is now the default, because that is
  the prescription.
- **Live form demonstrator** — an IK-rigged figure performing the actual movement,
  driven by your live force: rises, holds, eases, flushes and trembles near max,
  and calls out diminishing range when your rep tops start collapsing.
- **Milestone moments** — quiet through the early reps, quick nods at the rungs,
  then an escalating countdown into the majors ("4 MORE", "2 MORE", "ONE MORE!",
  bigger and shakier each step) and a full celebration on arrival. Your personal
  best gets its own countdown and its own callout.
- **Generated soundtrack** — synthesised in WebAudio, no download, per-game moods,
  and the arrangement opens up with your intensity: filter brightens, bass joins,
  hats double as you work. Ducks under cues and fanfares.
- **Navigation that holds up** — geometry-aware D-pad nav with overlay scoping,
  and a mutation-tested audit (`tools/nav-audit/run.py`) over 12 screens and 27
  UI states.

---

## Next, in the order I would actually do it

### 1. Score the failure, not the reps — HIGH impact, MED effort

X3's payoff is what happens *after* full-range failure: partial reps, shorter and
shorter, until nothing moves. Bloom already detects that collapse. Nothing rewards
it. Right now the headline number is total reps, which quietly encourages stopping
at a round number instead of grinding past it.

Make the partials the score. A burnout meter that only starts filling once your
range has visibly collapsed, "9 partials past failure" as the set's headline stat,
and a milestone ladder that lives entirely in that zone. This is the single change
that would align what the app celebrates with what the program asks for.

### 2. The twelve-week program as a first-class thing — HIGH impact, MED effort

The app has days. It has no *program*. There is no week number, no phase, no
"today is Push, day 3 of week 5", no adherence.

Give it the actual calendar: alternating Push/Pull, the 4-week and 8-week phases,
today's workout on the launcher as the hero card, and a visible twelve-week grid
that fills in. The grid is also the honest version of a streak — it shows the
gaps instead of hiding them behind a number that resets.

### 3. Band progression coaching — HIGH impact, LOW effort

The program's progression rule is *move up a band*, and the app already has
everything needed to advise it: reps per movement per band, in history. If you are
doing 40+ full-range reps on Dark Gray for chest press, it should say so, plainly,
and offer to switch the movement to Black.

Cheap to build, and it automates the judgement people most often get wrong.

### 4. Per-movement, per-you milestone ladders — MED impact, LOW effort

A calf raise set is 40+ reps; a deadlift set might be 15. One fixed ladder cannot
serve both, and a countdown to 50 on a lift where you will never see 50 is just
noise. Derive the ladder from your own history for that movement and band.

### 5. Eccentric quality — MED impact, MED effort

X3 leans hard on slow negatives, and force data can see them. Time the descent,
rate its smoothness, show it as a per-rep quality score. It is the one dimension
of technique the bar can actually measure, and nothing currently uses it.

### 6. Post-set and post-workout summary — MED impact, LOW effort

Name what improved. Not a stat dump: "Chest press: 3 more full reps than last
Tuesday, and you held the top 0.4s longer." Then the twelve-week grid gaining a
square. This is the moment that earns tomorrow.

### 7. Phone sync + dashboard (Firebase) — MED impact, MED effort

Was #2 on the old roadmap. Demoted deliberately: history only means something once
there is a program to measure against and a progression rule to check. Build 2 and
3 first, then sync becomes genuinely useful rather than a pile of numbers.

### 8. 10-foot pass for the games — MED impact, MED effort

The menus scale their type at ≥1200px. The games do not. HUD chips, force numbers
and toasts are all phone-sized on a television across a room.

### 9. Music with structure — LOW-MED impact, MED effort

The generator is a bed, not a composition. Bars with real sections, a build that
tracks the burnout phase, and a stinger when you break your best. If you would
rather have recorded tracks, an asset-slot loader is easy — say the word and I
will wire `assets/music/*.ogg` with the same graceful fallback the art uses.

### 10. Household profiles — LOW-MED impact, MED effort

Separate histories, and a head-to-head on the same movement and band. Only worth
it once 2 and 3 exist, because comparing without a program is comparing noise.

---

## Deliberately not doing

- **XP, levels, coins, unlockables.** They reward time spent, and X3 is twenty
  minutes. A currency would encourage padding sets, which is the opposite of one
  all-out set.
- **Daily challenges.** They fight the Push/Pull schedule. If a challenge asks for
  pull work on a push day, it is either ignored or it damages the program.
- **Leaderboards against strangers.** Force numbers are not comparable across
  bands, body weight or bar setup, so the ranking would be noise dressed as
  competition. Household head-to-head on the same band is fine.
- **Streak counters that punish rest.** Six days a week already includes a rest
  day; a streak that breaks on it is lying to you.
- **Bundled video demos.** Tens to hundreds of MB, and the live demonstrator
  already mirrors you in real time, which video cannot.

---

## Notes

- Everything here must survive being offline and fitting a sub-5MB APK; that is
  why the art is procedural-with-slots, the music is generated and there is no
  video.
- `web/` is the source of truth for game code, `app/` is generated from it. See
  [DEPLOY.md](DEPLOY.md).
