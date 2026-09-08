# X3 12-Week Program — official source of truth

Scraped 2026-09-07 from the logged-in member site `programs.jaquishbiomedical.com`.
This file is the **authoritative** description of the program. Where this file and any
other document in the repo disagree, **this file wins**.

Pages captured:

- `/12-week` — Introduction
- `/12-week/weeks-1-4` — Foundational Phase
- `/12-week/weeks-5-8` — Strength Phase
- `/12-week/weeks-9-12` — Optimization Phase
- `/12-week/after-12-weeks` — Next Steps

---

## The five Core X3 Training Principles (identical on every phase page, verbatim)

1. **Train to Complete Fatigue** — "Each exercise is performed for a single set of
   15–40 slow, full-range reps, followed by as many partial reps as possible.
   Continue until you can no longer move the bar even an inch."
2. **Maintain Constant Band Tension** — "Never let the band go slack at the bottom or
   lock out your joints at the top. Keep tension on the muscles throughout the set."
3. **Move Slowly, With Control** — "Use a controlled 2–3 second tempo up and down.
   Slower reps increase time under tension and drive better results."
4. **Start Light. Progress Slowly.** — "Begin with the lightest band. Don't move up
   until you can perform 40 slow, controlled full range reps with good form. If you
   can't complete 15 full range reps, reduce the resistance."
5. **Prioritize Form Over Force** — "Keep a secure grip and control the bar. For all
   exercises except squats, keep wrists straight and wrap your thumbs around the bar.
   When using the ground plate, center the band in and balance your weight over the
   middle band channel, except for calf raises."

### What this means for the app, concretely

| Rule | App consequence |
|---|---|
| 15–40 full reps then partials to "can't move it an inch" | The rep model is **full reps → diminishing-range partials → true failure**. A set is not "done" at a score. |
| Constant tension | Force must never return to zero mid-set. Slack at the bottom is a **form fault the app can detect** (force dropping below the movement's `lo`). Lockout at the top is the other one. |
| 2–3 s up **and** 2–3 s down | Target rep duration is **4–6 s**, ~5 s nominal. Anything under ~3 s total is too fast and the app should say so. Note this contradicts the "1 up / 4 down" figure that circulates in third-party X3 write-ups. |
| Move up at 40 full reps, move down under 15 | Band coaching is **two-sided**. The existing app only implements the "40+ → go heavier" half. It must also say "under 15 full reps → go lighter". |
| Wrists straight, thumbs wrapped, except squats | Usable as per-movement setup copy. |

---

## Schedule — CONFIRMED, per phase

### Weeks 1–4 — "Foundational Phase"

> Build a strong foundation with variable resistance training

| Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| | Push | Pull | **Rest** | Push | Pull | **Rest** | **Rest** |

**4 workouts per week.**

Training focus copy: introduces training to complete fatigue, constant band tension,
slow controlled reps. Master form and consistency with **lighter resistance than
you'll use later**. One set per exercise, full fatigue at all ranges of motion,
quality over quantity.

### Weeks 5–8 — "Strength Phase"

> Master the principles of variable resistance training

| Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| | Push | Pull | Push | Pull | Push | Pull | **Rest** |

**6 workouts per week.**

Training focus copy: heavier resistance and more refined technique. Three key
principles this phase: **constant tension, diminishing ranges, controlled movement**.
New variations introduced — **pec crossover and split squat**.

### Weeks 9–12 — "Optimization Phase"

> Refine your technique and lock in long-term results

| Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| | Push | Pull | Push | Pull | Push | Pull | **Rest** |

**6 workouts per week.**

Training focus copy: advanced principles — **breath control (partial Valsalva),
bracing, intentional range management**. Revisit split squat and pec crossover with
deeper focus and heavier resistance.

### After 12 weeks

Three offered paths: the **X3 Hypertrophy Program** (higher volume, full-body,
longer workouts), the **Westside Barbell X3 Training Academy** (separate paid
membership), or **repeat the 12-Week Program** with heavier bands and cleaner form —
"all in just 10–20 minutes a day".

---

## Workout composition — CONFIRMED

### Push Day

Core, all phases:

1. X3 Chest Press
2. X3 Tricep Press
3. X3 Overhead Press
4. X3 Front Squat

**Optional variations, weeks 1–4:** X3 Upright Row
**Optional variations, weeks 5–8 and 9–12:** X3 Pec Crossover, X3 Split Squat, X3 Upright Row

### Pull Day

Core, all phases:

1. X3 Deadlift
2. X3 Bent-Over Row
3. X3 Bicep Curl
4. X3 Calf Raise

No optional variations listed for Pull day in any phase.

### Things this corrects

- **Calf Raise is a PULL-day movement**, not a both-days movement.
- **Upright Row is a PUSH-day optional**, not a pull movement.
- **Pec Crossover and Split Squat unlock at week 5** — they are not week-1 movements.
- The day list is **4 core movements + optionals**, not a flat list of 11.

### Order

The intro page says: *"The order in which you do the exercises for a particular day
doesn't matter. What's important is grouping the exercises as suggested."*

But the Chest Press transcript qualifies it: **multi-joint before single-joint** — do
not pre-exhaust a small muscle that a multi-joint lift depends on ("you wouldn't want
to wear out your triceps before doing the chest press"). And: *"on push day as we are
prescribing it here, you want to start with chest press."*

So: the app should **default to the listed order**, allow reordering, and warn only
when a single-joint movement is placed before a multi-joint movement that uses it.

Multi-joint: chest press, overhead press, front squat, split squat, deadlift,
bent-over row, upright row.
Single-joint: tricep press, bicep curl, calf raise, pec crossover.

---

## Introduction page — key content

**Who it's for:** beginners and intermediate X3 users.

**Equipment:** Required — X3 Elite Home Gym *or* X3 Force Home Gym. Recommended —
X3 Squat Belt. Optional — X3 Ultra Light Band, X3 Elite Band.

**Why X3 works differently (verbatim structure):** traditional weightlifting applies
the same force through every part of the movement, forcing the weakest, most
vulnerable range to handle the same load as the strongest range. X3's foundation is
**Variable Resistance Training (VRT)**:

- Low force at the bottom (weak range of motion) to protect joints and tendons
- High force at the top (strong range of motion) to fully engage muscle in its strongest position
- Constant tension throughout to drive better muscle fatigue and growth

Claimed benefits: faster muscle fatigue, greater efficiency, safer/joint-friendly,
reduced injury risk, sustained progress.

Jaquish quote used on the page: *"You're seven times stronger than you think you are."*
(attributed, one short quote only)

---

## Transcript — "Weeks 1–4"

> Autogenerated transcript, captured verbatim from the member site for internal
> reference. Do not republish.

So for weeks one through four, we get started a little bit slower so that the beginners can really grab a hold. I know nobody wants to think they're a beginner. I know just from answering customer questions, everyone wants the most advanced programming, yet they hardly know how to grab the bar. I want you to humor me and go through weeks one through four.

We do a two-way split. So half the body one day, half the body the next day. So you're gonna have four workouts each week in week one through four. You can put those workouts on whatever days you want because everybody's schedule is different. So some people like to work out on the weekends because that's the only time, or those two days are really good 'cause they gotta open up schedule. Or if you got a bunch of little kids at home, your weekends do not belong to you. So you may wanna do your workouts on other days, that's totally up to you.

Now, just some things to keep in mind. After week four, we move to six workouts per week. These are 10 minute workouts. They're very quick, very efficient, and will stimulate the absolute maximum amount of growth. You just wanna make sure they fit into your schedule.

The fundamental principle of X3 is that we are applying variable resistance. So let's start by looking at why variable resistance is so powerful. Several years ago, I developed my first invention. It's a bone density treatment series of medical devices that are now found in OsteoStrong clinics around the world. In our research, we discovered that humans are seven times stronger in the impact-ready positions. These are also called the strongest range of motion versus the weaker range of motion. So with vastly different capabilities of producing power in different positions of biomechanics, we can see that what we need is a weight that changes as we move.

Unlike weights, X3 allows us to train with appropriate forces in different positions, using extremely heavy forces, driven by latex banding to deliver these high forces. And the variance for lower loads in the weaker ranges of motion. So, you can see I'm holding very high forces at the top. In the middle of the range of motion, you can see I'm holding sort of a medium force. Lower than the high force, but not really half of what would be expected because there's actually a rather aggressive curve to your strength. So it's very high at the top. Medium is closer to a lower level of force. And then when I'm in the weak range of motion, you can see I'm using a lesser force. And of course this is where joint injury happens, but because I've already fatigued the muscle on the strong and medium ranges of motion, this makes it very easy on the joints because I'm putting a very low level of force through them, but also taking the muscle to fatigue in that range of motion. So all ranges are taken to fatigue independently to trigger a much more powerful stimulus for growth.

So I can't stress this enough. You wanna start with a lighter resistance as opposed to a heavier. So make 15 repetitions, slow and controlled repetitions, your absolute minimum. And then you build from there. And of course, only one set per exercise. Keep watching the single exercise videos, very important. You don't need to always keep watching them as you continue through X3 for the rest of your life. But you wanna make sure that in the beginning, you're getting the form right, you're doing it right, so it can be repeatable in perpetuity.

### What this transcript establishes

- **"You can put those workouts on whatever days you want."** The program is
  **day-count based, not calendar based.** The app's existing "derived from what you
  have done, not the calendar" model is *correct and endorsed by the source*.
- **Weeks 5–12 workouts are ~10 minutes.** Weeks 1–4 are longer only because you are
  learning. Session length expectation: **10–20 min**.
- The strength curve is **aggressively non-linear** — "medium is closer to a lower
  level of force", i.e. at mid-range you are much closer to the weak end than half
  way. This is a direct instruction for how the app should map force to a rep
  position, and it means a **linear force→height mapping is wrong**.
- **All ranges are taken to fatigue independently.** Full-range failure is not the end
  of the set — it is the end of *one range's* fatigue. This is the justification for
  scoring partials as their own achievement, which the app already does.

---

## Transcript — "Weeks 5–8"

Welcome to week five, and more specifically, five through eight of the X3 program. Now, I want to emphasize something that we've already talked about in the individual exercise videos, but I want to explain what the importance is, and that is constant tension, meaning you don't want to lock out at the top or stand straight up like during a squat, and you also don't want to relax at the bottom and let the tension off. You always want to keep constant tension.

The principle of constant tension really has to do with the central nervous system. Now, the central nervous system is the control room for the whole body. And you cannot talk to the central nervous system. It sounds great to be able to look in the mirror and tell your central nervous system, we should probably lose 5 or 10 pounds. Not how it works. The central nervous system doesn't know what you want and doesn't care. It's going to optimize your body for the environment that you are in, or more specifically, for the X3 user, the environment you create.

So when your body exists in an environment with incredibly heavy loads, remember, X3 has you using more weight than you could ever get on your body in the gym, but it does so strategically, so it's safe, it stimulates more growth, and bypasses the chances of injuries. So again, constant tension. Want to make sure that the tension is always on the muscle, which, and here's some detail, doesn't let blood escape the muscle and allows for the central nervous system to see that some of your musculature is missing for a short period of time because there's no blood flow on the return. That's specifically the mechanism as to how it works. This is called hypoxia, and there are many articles written about it.

If you see people training with bands around their arms, like a tourniquet, that's what they're trying to do. The problem with a tourniquet is your body knows there's a tourniquet there so it's kind of self-defeating and doesn't work very well. People that work out like that have to train with very light weights. That's kind of nonsensical. All you have to do is keep constant tension. And only with variable resistance, you get an amplified benefit of the hypoxia and the additional loading from the variable resistance, which will ensure that you will grow on into the future.

So I want to be very specific when it comes to the stopping positions in these movements. And it's more important for you to understand the principle as opposed to memorizing every little nuance of every exercise, because if you understand the principle, you're gonna do everything right. You don't want to lock out. Now, some exercises you don't really lock out, like you don't lock out of a chest crossover. When you're doing this, there really isn't a locking of joints there. But the tricep is a good example. So I'm looking at my tricep here. So, I may start in this position, holding the bar, and I'm pushing down. Now, this is gonna be my stopping position. Now, you're gonna notice this isn't a straight arm. This is a straight arm. But as soon as my arm gets straight, this starts to shut off, because if it didn't, I'd be able to break my own joint. So the body is wired so that when you have linear alignment, the muscle's rapidly shutting down, and we don't want that ever. So the top portion is where you have some tension on the band. Of course, the band is wrapped around my body. And then, when I'm at extension, I'm not locked out. I stop right about here. And so that is where you're gonna get the most firing of muscle. That is where you want to live in the repetition until you cannot do repetitions anymore at that close to that full extension. And then, you start shortening the repetitions for diminishing range.

So keep all of these principles in mind. Set your calendars for week nine. There's another video to watch at week nine.

### What this transcript establishes

- **"That is where you want to LIVE in the repetition"** — near full extension, short
  of lockout. The app should reward *time spent near the top of the range*, not just
  peak force. This is a **real, teachable metric the app does not currently have**:
  time-in-strong-range.
- **Lockout shuts the muscle off.** So a force reading that spikes and then collapses
  at the very top is a form fault (locked out), distinguishable from a good rep.
- Slack at the bottom is the mirror-image fault.

---

## Transcript — "Weeks 9–12"

Welcome to week nine of the program. Now, one of the principles we want to talk about here as you're getting more advanced and you probably moved up a band and at least some of the exercises, you're starting to deal with heavier weight. And when you deal with heavier weight, I wanna talk about breath control. This is very important. And some of you are already doing this and don't even know you're doing it, but it's called a partial Valsalva maneuver. So, I know it sounds very complicated. It's really just a way to manage the stability of your upper body. And this comes to play in almost every exercise.

So what happens when we move weight around or resistance around with our arms, our legs, our whole body is moving typically? And the least structural integrity we have in the human body is right here where the lungs are, because the lungs are just a void unless you can fill these voids up and stop whatever you fill 'em up with from escaping. So for example, as you lift you'll notice people will take air in and then as they press away, they let the air out very slowly as we're pushing away. So, this void becomes strengthened by trapping air inside and slowly letting it out as you contract. So what you will be doing, and again I'm sure half of you are gonna go, I already do that. I didn't know it was called anything. Right, it is the natural thing to do but some people don't exactly get that timing right. And so, now I want you to be aware of it and try to apply this because you haven't applied it yet. It's gonna be very productive. So just slowly, let air out as you're moving in the strongest range of motion and this is gonna benefit you in all of your movements.

I want you to keep track of all the principles that we've applied, variable resistance. You now understand variable resistance perfectly and why it is superior. We learned about Valsalva maneuvers partial Valsalva maneuvers, and managing the void of air within your chest. We learned about diminishing range and we learned about constant tension. So you wanna keep all these principles in mind and actually to be perfectly proficient, you should try and explain these principles to your friends 'cause you don't truly understand something until you can teach it. So, keep that in mind and also watch the next video after you finish week 12 because that's gonna show you how you progress from then on.

### What this transcript establishes

- **"You probably moved up a band in at least some of the exercises"** — band changes
  are **per movement**, not global. The app's per-movement calibration model is right;
  its *band selection* must also be per movement, and it currently is not.
- A phase-9 coaching beat exists that the app can deliver: **breathe out slowly
  through the strongest range**.

---

## Phase-gated coaching, derived

The source deliberately teaches a new principle per phase. The app should mirror this
so a returning user is taught something new instead of the same three tips forever:

| Phase | The new idea to teach |
|---|---|
| Weeks 1–4 | Variable resistance; go lighter than you think; 15 reps is the floor; one set only |
| Weeks 5–8 | Constant tension; no lockout, no slack; live near full extension; then diminishing range |
| Weeks 9–12 | Partial Valsalva — exhale slowly through the strong range; bracing; range management |
| After 12 | Keep going; heavier bands, cleaner form; or move to Hypertrophy |
