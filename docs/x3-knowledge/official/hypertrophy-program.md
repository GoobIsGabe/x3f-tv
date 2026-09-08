# X3 Hypertrophy Program — official reference

Scraped 2026-09-07 from `programs.jaquishbiomedical.com/x3-hypertrophy*` (member site).
This is the **second official program**, designed by Dr. Jaquish with Matt Wenning.
The app currently knows nothing about it. It is the natural "what's next after 12
weeks" content and a strong Expand candidate.

---

## Positioning

- For **experienced** X3 users who have already completed the 12-Week Program.
- Goal: **size**, not just strength. Higher volume, longer sessions.
- Explicitly **not for beginners**.
- Can be adopted whole (6-day rotation) or cherry-picked ("just do the calf volume").

## Structure

Three workouts, rotated:

1. **Chest & Back**
2. **Arms & Smaller Muscles**
3. **Legs & Lower Back**

Standard rotation is 6 days on, one rest day:

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| W1 | W2 | W3 | W1 | W2 | W3 | Rest |

A 3-day-per-week version is also allowed, as is swapping single workouts into
another routine.

## The mechanic that makes it different: PR set, then supersets

Every workout begins with a **PR set** — a maximum-effort single set to absolute
fatigue in the strongest range, then diminishing-range lengthened partials. That is
the only set that is *tracked*.

Then **4 supersets** of an agonist–antagonist pair, which are explicitly **not** PR
attempts — they target diminishing range and lengthened partials, and the source says
"Don't track supersets — just focus on reaching fatigue."

### Rest periods (exact)

- **20 seconds** between the two exercises inside a superset
- **2 minutes** between superset rounds
- **1 minute** between the accessory sets (band laterals, seated calf raise)
- **30 seconds** between wrist-curl sets
- **2 minutes** between program steps

Justification given on the page, with a citation: agonist–antagonist pairing achieves
the same volume in **36% less time**. Reference cited: Burke, R., Hermann, T., Piñero,
A., Mohan, A., Augustin, F., Sapuppo, M., … & Schoenfeld, B. (2024). *Less time, same
gains: Comparison of Superset vs traditional set training on muscular adaptations.*
PREPRINT, SportRxiv.

### Cadence and reps

- **2 seconds up / 2 seconds down** (note: tighter than the 12-week's "2–3 s")
- **15–40 rep range for PR sets**
- Band chosen so fatigue lands inside that range

---

## Workout 1 — Chest and Back

Movements: X3 Chest Press, X3 Bent-Over Row, X3 Overhead Press, X3 Band Laterals

1. **PR attempts:** max-effort Chest Press to absolute fatigue → wait 20 s → max-effort Bent Row. Then rest 2 min.
2. **Supersets:** 4 more rounds of Chest Press → 20 s → Bent Row, 2 min between rounds. (Totals 5 sets each.) Not PR attempts — diminishing range, lengthened partials.
3. **Overhead Press PR attempt**, starting 2 min after the last Bent Row.
4. **Band Laterals:** 4 sets, 1 min rest between, diminishing range at the end of each.

Practical note from the source: he sets up **two X3 bars** for the superset phase so
the 20-second rest is not spent reconfiguring the band.

## Workout 2 — Arms and Smaller Muscles

Movements: X3 Tricep Press, X3 Bicep Curl, X3 Overhead Tricep Extension, X3 Seated Calf Raise

1. **PR attempts:** max-effort Tricep Press (a.k.a. skull crusher) → 20 s → max-effort Bicep Curl. Rest 2 min.
2. **Supersets:** 4 rounds of Overhead Tricep Extension → 20 s → Bicep Curl, 2 min between rounds.
3. **Seated Calf Raise PR attempt**, 2 min after step 2. Rest 2 min.
4. **Seated Calf Raise:** 4 more sets, 1 min rest between.

## Workout 3 — Legs and Lower Back

Movements: X3 Single Leg Squats, X3 Deadlift, X3 Shallow Squat, X3 Stiff Leg Deadlift, X3 Seated Wrist Curl

1. **PR attempts:** Single Leg Belted Squat (X3 Squat Belt), leg one → rest 2 min → leg two → rest 2 min → Deadlift PR. Rest 2 min.
2. **Supersets:** 4 rounds of Shallow Squat → 20 s → Stiff Leg Deadlift, 2 min between rounds. Rest 2 min after.
3. **Seated Wrist Curl:** 3 sets, 30 s rest, diminishing range at the end of each.

---

## Seven movements the app does not have

`band-laterals`, `overhead-tricep-extension`, `seated-calf-raise`,
`single-leg-squat`, `shallow-squat`, `stiff-leg-deadlift`, `seated-wrist-curl`

Their exercise pages exist at `programs.jaquishbiomedical.com/x3-exercises/<slug>` and
should be captured before implementing this program.

---

## What this means for the app's architecture

The 12-Week program is **one movement = one set**. The Hypertrophy program is
**one movement = one tracked PR set + N untracked volume sets**, with precise rest
timers and pairing. That is a genuinely different session shape.

If the app's routine engine is built assuming "a day is a list of movements, each with
one set", it cannot express this. Building the routine engine around a **list of
timed steps** — `{kind: 'set'|'rest'|'superset-round', movement, tracked, seconds}` —
covers both programs and any future one. **Do this in the rewrite**; retrofitting it
later means rewriting Routine a second time.

The "don't track supersets" rule also matters: the set reporter needs a
`tracked: false` mode so volume sets do not pollute PBs and challenges.

---

## Intro transcript

Welcome to the X3 hypertrophy program.

The original X3 program was more focused on strength than it was necessarily on size, but also a larger muscle is always a stronger muscle. So the original program was meant to maximize your strength, give you a lot of muscle size, and also minimize your time commitment.

When it comes to building muscular size, we're required to do a lot more sets and there's gonna be a larger time commitment. So it's really a decision of how much time do you want to put in and how fast you want to grow muscle.

There are certain aspects of the program that you can select — let's say you just want to have big calves, so you might just wanna do the volume portion for the calves and not for the rest of it. I think a lot of ladies out there might want to work on glutes and hamstrings and quadriceps and do that part of the volume program where they might not wanna have the biggest deltoids possible. So you can sort of mix and match here.

But I'm gonna show you the three workouts that we worked very hard to put together. Myself and Matt Wenning, who is a world champion powerlifter. In fact, he holds the world record for the squat at a body weight of 300 pounds. He squatted 1200 pounds.
