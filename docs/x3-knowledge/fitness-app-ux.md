# Fitness / Training App UX — Knowledge Base for the X3 Bar TV App

**Purpose.** A durable reference for anyone building the X3 Bar training app. It captures how the
best training products present today's workout, a live set, effort, progress and streaks — and
translates each pattern into a decision for *our* specific case: **one set to failure, ~20 minutes,
6 days a week, displayed on a TV across the room, with a force sensor in the bar.**

**Last researched:** 2026-09-07. Everything below is sourced. Sources are linked inline and
collected at the end.

## How to read the confidence tags

Every non-obvious claim carries a tag. Do not strip these when copying text out of this document.

| Tag | Meaning |
|---|---|
| `[SOURCED]` | Stated by a primary or reputable secondary source, linked inline. |
| `[REPORTED]` | A number or claim from a secondary blog/marketing source that I could **not** corroborate against a primary source. Treat as directional, not fact. |
| `[INFERENCE]` | My reasoning from the sourced material. Not stated anywhere. |
| `[RECOMMENDATION]` | A design call for this product. Opinion, argued from the evidence above it. |
| `[OPEN]` | Genuinely unknown; needs a test, a teardown, or a user. |

---

# 0. The constraints that shape every decision here

Before borrowing anything from Peloton or Tonal, be honest about how different this product is.

| Constraint | Consequence for UX |
|---|---|
| **One working set per exercise, taken to failure** | There is no "set 2 of 4" to redeem a bad set. The single set carries all the meaning. Everything on screen during that set matters enormously; there is no second chance to display it. |
| **~20 minutes total, ~4–7 exercises** | Very little idle time. The interstitial (band change, transition) is the *only* place to put reflection UI. |
| **6 days/week** | The daily-ritual muscle is strong, so streaks are natural — but the failure mode (guilt, padding) is also strong. See §10. |
| **Reps are not the goal; failure is** | Rep count is a *byproduct* metric, not a target. This inverts most lifting-app UX, which is built around hitting a prescribed rep target. |
| **Variable resistance (bands)** | Load is a non-linear function of position. "Weight" is not a single number. See §13. |
| **Force sensor in the bar** | We can do what Tonal does (sensor-derived quality) without doing what Tempo does (camera pose estimation) — a meaningful reliability advantage. See §7. |
| **TV, 6–10 ft away, no touch** | Legibility is the first-order constraint, not aesthetics. See §2. |
| **User's eyes are mostly *not* on the screen** | Mid-set, the user is straining, eyes closed or fixed on a point. Anything that requires reading during a rep is wasted. Audio and peripheral-vision shape do the work. |

### The X3 protocol, for reference

`[SOURCED]` Jaquish Biomedical's own support material describes the core protocol as **one set to
exhaustion per movement**, with a rep range of roughly **15 to 40** depending on band selection, on a
**push/pull split** that alternates so muscle groups don't overlap
([Jaquish support](https://support.jaquishbiomedical.com/en-US/articles/x3-12-week-program-173008)).

`[REPORTED]` BarBend's review describes the official 12-week program as **4 workouts/week in weeks
1–4**, moving to **6 workouts/week from week 5 through week 12**, alternating push and pull
([BarBend](https://barbend.com/x3-bar-review/)). This matches the "6 days a week" framing of our app
but note the ramp — a well-designed onboarding should respect the 4-day acclimation phase.

`[REPORTED]` Third-party summaries of the protocol emphasise: constant tension, **no full lockout**,
**slow eccentrics (2–3 s)**, and going past concentric failure into partials
([Alibaba Wellness X3 guide](https://wellness.alibaba.com/fitlife/x3-bar-guide-resistance-band-training-explained)).
Treat the exact tempo numbers as directional; get them from the official program before shipping copy
that prescribes them.

`[OPEN]` We should verify the official day-by-day 12-week schedule from the actual X3 workout card /
program PDF rather than from review sites, before hard-coding a calendar.

---

# 1. Executive summary — the 12 ideas that matter most

If you read nothing else:

1. **Make the live screen a *shape*, not a number.** Mid-rep the user cannot read text. A filling arc,
   a rising bar, a colour band — those are readable in peripheral vision at 8 feet with your eyes
   half-shut. Big numerals are for the moments *between* reps.
2. **Show force against the position it was produced at**, not force alone. Band load is non-linear;
   a plain "lbs" readout is a lie. See §13.
3. **Never let a rep-detection error cost the user anything.** Tempo's cascading failure — miscount →
   bad weight recommendation → wrong band next session — is the single most instructive failure in
   this space (§7).
4. **Under-claim precision.** Peloton Guide launched with a filling green spiral instead of a rep
   number, precisely because a vague-but-right visual beats a precise-but-wrong one (§7.3).
5. **Adopt "brace → countdown → measure"** from force-plate testing science. It is a real, validated
   protocol (3-second countdown, slack removed, external cue, ≥3 s effort) and it materially improves
   both the number *and* its reliability (§11).
6. **Live visual force feedback measurably increases force output.** +4.7–8.4% peak force, and
   test-retest CV dropped from 4.85% → 2.63% in a controlled IMTP study (§4.5). This is the strongest
   evidence-backed feature in the whole document.
7. **The end of the set is the product.** For a to-failure protocol, "how deep did you go" is the
   central question. Borrow velocity-loss framing: the *shape of decline across the set* is the
   quality signal (§6).
8. **Post-workout: one hero verdict, then evidence, then the trend.** Three tiers, three screens, not
   one dense dashboard — WHOOP's progressive disclosure architecture (§8, §9).
9. **Design the streak with a rest day built into its definition.** Count "weeks where you hit ≥5 of 6
   sessions", not consecutive days. Provide a grace mechanic *before* users need it (§10).
10. **Celebrate rarely and proportionally.** Confetti on every session devalues confetti. Reserve the
    big moment for genuine, hard-to-fake milestones (§12).
11. **Give the user an off switch for every comparative/gamified element**, the way Apple Fitness+
    lets you disable the Burn Bar. Autonomy is a documented driver of sustained motivation (§12.4).
12. **Ask one subjective question, once.** "Could you have done more?" (RIR) after the set. It is
    concrete, countable, one tap, and it makes the whole adaptive system honest without a camera
    (§6.2).

---

# 2. TV-specific UX — the 10-foot problem

This is the constraint that most fitness-app design writing ignores, because almost all of it is
phone-first. Our screen is 6–10 feet away and the user is often mid-strain.

## 2.1 Hard numbers from platform guidelines

`[SOURCED]` **Android TV / Google TV** ([Android developer TV layout guide](https://developer.android.com/design/ui/tv/guides/styles/layouts)):

- Design at **MDPI, 960 × 540**, where 1px = 1dp. Ship assets at 1080p.
- **Safe area / overscan margin: 5%** — the guidance states 58dp on the left and right, 28dp top and
  bottom. (An alternate figure of 48dp / 27dp appears in the same guidance family — derived from
  960 × 5% and 540 × 5%.) On a 1920 × 1080 surface that is roughly **96px horizontal, 54px vertical**.
- **12-column grid**, columns 52dp wide, **20dp gutters**, 4dp vertical rhythm.
- Card widths per row: 1-up 844dp, 2-up 412dp, 3-up 268dp, 4-up 196dp, 5-up 124dp.

`[SOURCED]` **tvOS / Apple TV** ([BPXL Craft summary of the Apple TV HIG](https://medium.com/bpxl-craft/getting-started-with-apple-tv-human-interface-guidelines-4d991737ddec)):

- The **focus model is the entire interaction model**. There is no cursor. Every interactive element
  needs an unmistakable focused state.
- Focus should be signalled by **scale (~1.05–1.1×), elevation/shadow, and brightness — never colour
  alone**, because colour separation collapses at distance and across TV panel calibrations.
- Parallax and large shadows exist specifically because subtle depth cues are invisible from a sofa.

`[SOURCED]` **General 10-foot UI practice**
([Wikipedia 10-foot UI](https://en.wikipedia.org/wiki/10-foot_user_interface),
[Spyro-soft TV UX](https://spyro-soft.com/blog/media-and-entertainment/8-ux-ui-best-practices-for-designing-user-friendly-tv-apps)):

- Elements are sized for a nominal **10-foot viewing distance**; everything is materially larger than
  a desktop equivalent.
- **Light text on dark background** is the recommended default for TV legibility.
- Avoid light-weight fonts and fonts with high stroke-width contrast; prefer simple sans-serifs with
  anti-aliasing.
- Colours that read as distinct on a calibrated monitor frequently read as identical at 10 feet on a
  living-room TV in daylight.

## 2.2 What this means for us

`[RECOMMENDATION]`

- **One idea per screen region, three regions maximum.** The live set screen should be parseable in a
  glance of under 500ms with sweat in your eyes.
- **Minimum type scale:** treat 24dp (≈48px at 1080p) as the *floor* for anything that must be read,
  and put the primary live figure at 120–200dp. Tonal-style hero numerals. WHOOP's recovery score
  renders at roughly **72pt for arm's-length reading**
  ([925 Studios WHOOP breakdown](https://www.925studios.co/blog/whoop-design-breakdown)) — a TV at 8
  feet needs proportionally more.
- **Dark canvas, saturated data.** Directly borrowed from WHOOP: the black background is functional,
  not stylistic — coloured data pops without competing with chrome, and it reduces glare in a dim
  room `[SOURCED]`.
- **Redundant encoding everywhere.** Every state that matters (in-range / below / above, good rep /
  short rep) must be encoded by **at least two of**: position, size, shape, motion, colour. Colour
  alone fails at distance and fails for colour-blind users.
- **Never require reading during a rep.** If information must arrive mid-rep, it arrives as *shape
  change* or *sound*.
- **Assume the remote is on the floor.** Design the mid-workout flow so the user needs **zero** input
  from "start workout" to "workout complete" in the happy path. Every required interaction is a
  failure of the design.

`[OPEN]` We have not verified our specific target platform's overscan behaviour. Android TV on cheap
panels still overscans in the wild; test on real hardware before trusting edge-anchored layout.

---

# 3. Today's workout — the home screen

## 3.1 What the best products do

**WHOOP — one hero number that answers one question.** `[SOURCED]`
([925 Studios](https://www.925studios.co/blog/whoop-design-breakdown)) WHOOP compresses many
biometric signals into a single 0–100 Recovery score whose entire job is to answer *"how should I
train today?"*. The design principle is compression toward a decision, not display of data.
Three deliberate tiers exist as **separate screens, not expandable sections**: (1) overview
(Recovery / Strain / Sleep), (2) weekly trend charts, (3) raw 30-day biometric graphs, described as
being for a small minority of users. The article's phrase for each tier: "a doorway, not a
destination."

**Tonal — the day's workout is a card with a coach and a duration.** `[SOURCED]` The Tonal home
screen surfaces a recommended workout directly (e.g. "Complete Your Weight Assessment," an 18-minute
session) rather than a library to browse
([Tonal support](https://knowledge.tonal.com/kb/guide/en/start-strong-with-tonal-weight-assessment-workout-qsdK4SsASW/Steps/4286289)).

**Strong / Hevy — pre-loaded state is the feature.** `[SOURCED]`
([RepReturn comparison](https://repreturn.com/strong-app-vs-hevy/)) The logging screen shows exercise
name, **previous session's performance**, and the input fields — nothing else. Previous weights are
pre-filled. The design assumption is explicit: the user is mid-session, resting between sets, and
every tap costs them.

**Zwift — status labels, not raw numbers.** `[SOURCED]`
([Zwift Insider fitness metrics](https://zwiftinsider.com/fitness-metrics/)) Rather than surfacing
raw Form/Freshness values, Zwift buckets users into five named Training Statuses (Overreaching,
Productive, Fresh, Detraining, Ready). Commenters criticise this as oversimplification for advanced
users — the accessibility/depth tension is real and unresolved.

## 3.2 Design for us

`[RECOMMENDATION]` The X3 home screen should be a **single card and a single button**.

```
┌─────────────────────────────────────────────────┐
│  WEEK 7 · DAY 4                                 │
│                                                 │
│  PUSH                                           │
│  Chest Press · Tricep Press · Overhead Press    │
│  · Front Squat                                  │
│                                                 │
│  ~18 min          Last push: 6 days ago         │
│                                                 │
│           ▶  START                              │  ← default focus
│                                                 │
│  ─────────────────────────────────────────────  │
│  This week  ● ● ● ● ○ ○      Not today? ›       │
└─────────────────────────────────────────────────┘
```

Rules:

- **The primary button is focused on load.** One remote click from cold start to warm-up. `[SOURCED
  rationale: tvOS focus model]`
- **Name the day, don't number it.** "PUSH" reads at 10 feet; "Workout 47" does not carry meaning.
- **Show what's coming, in order, in one line.** Peloton Guide puts the class plan in the upper left
  so users can anticipate the next movement; reviewers specifically called this out as useful
  `[SOURCED]` ([Peloton Buddy hands-on](https://www.pelobuddy.com/hands-on-impression-peloton-guide/)).
- **"Not today?" is a first-class escape hatch**, not buried in settings. Ian Gay's long-term Tempo
  review is blunt about the harm of not being able to skip or modify a movement — users end up doing
  inappropriate exercises while fatigued `[SOURCED]`
  ([ian.gay](https://ian.gay/my-non-sponsored-long-term-review-of-tempo-fit/)). Autonomy is not a
  nice-to-have; its absence produced a safety complaint.
- **Do not show a home dashboard of statistics.** Progress lives one level down. WHOOP's tier
  discipline is the model.

---

# 4. The live set — what the best products show *during* a rep

This is the heart of the document, and where a force sensor gives us an unusual opportunity.

## 4.1 Tonal — sensor-derived rep quality, 60 Hz

Tonal has cable-position sensing and load control, which is the closest analogue to our force-in-the-bar
situation.

`[SOURCED]` ([Tonal — Form Feedback](https://tonal.com/blogs/all/introducing-form-feedback))
Form Feedback measures, per rep:

- **Pace** (exercise-specific timing)
- **Range of motion** (personalised to the user's anatomy)
- **Positioning** (body alignment)
- **Balance** (weight distribution)
- **Symmetry** (bilateral consistency)
- **Smoothness** (movement quality)

Derived from **cable length data sampled 60 times a second** plus other sensors. Coverage: **111
strength exercises**, each with up to **six** distinct actionable cues. Feedback fires reactively
"when it detects imperfections," and Tonal's stated intent is that the user can **react to the
correction on the very next rep** — i.e. the feedback loop is designed to close inside a single set.
Example cue, for squats: drive the hips further back to get lower if possible.

`[SOURCED]` ([Breaking Muscle Tonal review](https://breakingmuscle.com/tonal-review/)) In practice
the on-screen furniture during a set is: a **weight dial** (adjustable live, in 1 lb increments), a
**rep counter to the right of the dial**, live stats, and heart rate. There is an **audible cue when
two reps remain**. If Coach AI detects poor quality from positioning, ROM and pacing it gives audible
and on-screen prompts — or **turns the weight off entirely** (e.g. resistance cuts if the bar tilts
during a bench press, because tilt implies instability).

`[SOURCED]` ([Tonal — Smart View](https://tonal.com/blogs/all/tonal-smart-view)) Smart View adds the
phone's camera as a **side view in picture-in-picture** on the Tonal screen, layered on top of the
existing sensor feedback. Post-workout it offers **video playback showing which reps triggered
corrections**. The PiP is toggleable — Tonal explicitly supports turning the mirror off so the user
can focus on feel.

**Why this matters to us:** Tonal proves that a load/position sensor alone (before any camera) can
support six named per-rep quality dimensions. We have position-and-force in a bar. `[INFERENCE]` The
directly transferable ones for X3 are **range of motion, pace/tempo, smoothness, and symmetry** (if
we can resolve left/right); *positioning* and *balance* likely require vision.

## 4.2 Tempo — vision-derived cues, deliberately intermittent

`[SOURCED]` ([Tempo support — 3D Tempo Vision & Form Feedback](https://support.tempo.fit/support/solutions/articles/151000154714-3d-tempo-vision-form-feedback))
Tempo uses time-of-flight 3D sensors. On screen during a set it shows a **range-of-motion meter**
indicating whether you're hitting ideal depth/extension. Cues are specific and named
("leaning backward," "barbell asymmetry," "knees over toes").

Two design decisions here are worth stealing outright:

1. **Feedback is intentionally intermittent.** Tempo states plainly that form feedback is **not
   designed to appear 100% of the time, as this would be demoralising**, and that a real trainer
   doesn't correct every rep either. Feedback density increases for new exercises and when fatigue
   signs appear.
2. **A green check mark appears when form is corrected in real time** `[SOURCED]`
   ([Garage Gym Reviews / Tom's Guide coverage](https://www.garagegymreviews.com/tempo-studio-review)) —
   i.e. the system closes the loop and *confirms the fix*, rather than only ever pointing out errors.

`[SOURCED]` Rep counting requires an "earnest attempt" at the movement; how badly you have to do it
before it stops counting is explicitly dependent on how incorrectly it's performed.

## 4.3 Peloton Guide — the confidence-appropriate visualisation

This is the single most useful precedent in the document for a system whose detection isn't perfect.

`[SOURCED]` ([Peloton Buddy](https://www.pelobuddy.com/hands-on-impression-peloton-guide/),
[Peloton newsroom](https://investor.onepeloton.com/news-releases/news-release-details/peloton-introduces-peloton-guide-first-connected-strength/))
At launch Peloton Guide had **no rep counting at all**. Instead it shipped the **Movement Tracker**:
a **green spiral that fills as you perform the current movement**, resetting for each new exercise.
At the end of class the user gets a **completion percentage** and can earn badges.

Rep counting was added later, alongside manual weight entry `[SOURCED]`
([TechRadar](https://www.techradar.com/features/pelotons-ai-rep-tracking-feature-feels-like-a-personal-trainer-is-pushing-me-all-the-way)).

Guide's layout options are also instructive for TV: **five modes** — Minimized (instructor dominant,
user PiP left), Maximized (user dominant), Stacked, Side-by-Side (stats unavailable in this mode),
and Hidden (no self view). Metrics like calories and time remaining are individually toggleable
`[SOURCED]`.

`[INFERENCE]` The Movement Tracker is a *precision-matched* visualisation: the system was confident it
could tell "activity is happening in this movement pattern" but not "that was rep 7." So it displayed
exactly the confidence it had. This is the correct instinct and it is rare.

## 4.4 Zwift — the zone bar and the de-emphasis of instantaneous numbers

`[SOURCED]` ([Zwift Insider HUD refresh](https://zwiftinsider.com/hud-refresh-closer-look/))
Zwift's Power Zone Bar is a **dynamic bar showing your current zone, where the width of each zone
grows as you spend more time in it** — so the bar doubles as a live histogram of intensity
distribution. The HUD refresh also **removed instantaneous speed from the centre** in favour of
accumulated data (elapsed time, distance, elevation, energy), a deliberate shift from twitchy to
cumulative.

`[SOURCED]` ([Zwift news](https://www.zwift.com/news/32990-boost-your-indoor-cycling-performance-with-new-on-screen-metrics-on-zwift))
Four **user-customisable metric slots**; the stated rationale is control over what you see so you can
stay focused.

`[INFERENCE]` The dual-purpose bar — live position *and* accumulated distribution in one object — is
directly applicable to a to-failure set: a bar that shows current force *and* the shape of the whole
set so far.

## 4.5 Velocity-based training — real-time feedback, evidence-backed

The VBT world has both the best live-feedback interaction design and the best evidence.

**The evidence.** `[SOURCED]`
([PMC12210026 — real-time visual feedback during IMTP](https://pmc.ncbi.nlm.nih.gov/articles/PMC12210026/))
A controlled study of resistance-trained men, isometric mid-thigh pull, with vs without a live
force-time curve and numeric readout on a 24-inch screen 1 m away at chest height:

| Test | With feedback | Effect size |
|---|---|---|
| Single 5 s MVC, peak & mean force | **+4.7% to +8.4%** | ES 0.49–0.92 |
| Repeated MVC, average peak force | **+8.4%** | ES 0.85 |
| Repeated MVC, mean force | **+8.4%** | ES 0.94 |
| 30 s all-out, overall mean force | **+8%** | ES 1.13 |

Reliability improved too: single-MVC peak force **ICC 0.898 → 0.972**, **CV 4.85% → 2.63%**.
Notably, the 30-second test showed **no meaningful reliability improvement** — feedback's benefit
attenuates for prolonged efforts. The display used a **fixed labelled vertical axis with auto-scaling**,
and for the 30 s test it showed a **rolling 10-second window** rather than the whole curve.

The authors' conclusion, paraphrased: an external reference point helps people maintain stable
execution rather than disrupting it, and they recommend feedback be built into standardised protocols.

`[INFERENCE — important caveat]` A 15–40 rep X3 set is a *prolonged* effort, closer to the 30-second
condition than the 5-second condition. So: expect the **force-boosting** benefit to hold, but do
**not** assume the reliability benefit transfers. Design the live display for motivation and pacing;
design the *measurement* to be robust without depending on the display.

**The interaction design.** `[SOURCED]`
([Metric VBT real-time feedback guide](https://www.metric.coach/user-guide/real-time-velocity-feedback))
Metric offers four live feedback modes, and the design of the third one is excellent:

- **Read** — announce a score every rep. Informational, no thresholds.
- **Target** — chime above target, buzzer below. Targets auto-suggested from the user's **6-week
  average** for that exercise and load.
- **Velocity Loss** — **stays completely silent until you're within 5% of the threshold**, then speaks
  up. Silence is the default state; the system only interrupts when interruption is decision-relevant.
- **Tempo** — a 1-second metronome, combinable with the others.

Metric also documents an honesty detail worth copying: **real-time values may differ slightly from
final post-processed values**, because tracking runs twice. They tell the user which one to trust.

## 4.6 Apple Fitness+ Burn Bar — coarse bands, and an off switch

`[SOURCED]` ([MakeUseOf](https://www.makeuseof.com/apple-fitness-burn-bar-enable-disable/),
[MacRumors](https://www.macrumors.com/how-to/apple-fitness-plus-burn-bar/),
[Apple Support](https://support.apple.com/en-bw/guide/fitness-plus/apdf8a229f34/ios))

- Appears **~2 minutes into** eligible workouts (HIIT, Treadmill, Cycling, Rowing).
- **Not live competition** — you're compared against people who did the same workout previously,
  weight-adjusted for fairness.
- Result is expressed in **five coarse bands**: Behind the Pack, In the Pack, Middle of the Pack,
  Front of the Pack, Ahead of the Pack. It updates on a rolling basis (reported as the previous ~2
  minutes) and the **final result is the average across the whole workout**, shown in the summary.
- **It can be turned off**, per-workout, from the Metrics control. Time display is likewise
  configurable to Off / Elapsed / Remaining.

`[INFERENCE]` Three transferable decisions: (a) express uncertain comparative measures in **coarse
named bands**, not a precise rank; (b) **delay** the comparative element until enough signal exists;
(c) **let people switch it off**.

## 4.7 Synthesis: the X3 live-set screen

`[RECOMMENDATION]` Three zones, no more. Sized so that the whole thing reads from 10 feet.

```
┌───────────────────────────────────────────────────────────────┐
│  CHEST PRESS                              exercise 2 of 4     │  ← quiet, small
├───────────────────────────────────────────────────────────────┤
│                                                               │
│      ╭──────────────────────────────────────────╮             │
│      │  ████████████████████░░░░░░░░░░░░░░░░░  │  FORCE       │  ← the shape
│      ╰──────────────────────────────────────────╯             │
│         ▲ this rep's peak      ▲ set's best                   │
│                                                               │
│                        1 4                                     │  ← huge numeral
│                        REPS                                    │     between reps
│                                                               │
│   ▁▂▃▅▆▇▇▇▆▆▅▅▄▄▃                                             │  ← per-rep peaks,
│   set so far                                                   │     the decline curve
└───────────────────────────────────────────────────────────────┘
```

**Zone 1 — the live force shape (dominant, ~50% of screen).**
A horizontal bar filling left→right with instantaneous force, with two persistent tick marks:
*this rep's peak* and *the set's best rep*. This is the piece the IMTP study says raises output
`[SOURCED]`. It is legible in peripheral vision, requires no reading, and gives the user something to
beat on every single rep.

- `[RECOMMENDATION]` **Auto-scale the axis once, at the start of the set, then lock it.** The IMTP
  study used a fixed labelled axis with auto-scaling; a continuously rescaling bar during a fatiguing
  set would make decline invisible, which destroys the signal we most care about.
- `[RECOMMENDATION]` Smooth the live value (a short rolling window, ~150–250 ms) so the bar is
  readable rather than jittery — but compute the recorded peak from raw samples. Be explicit in the
  code about which is which. Metric's documented "real-time vs post-processed" divergence is the
  precedent for saying so honestly.

**Zone 2 — the rep count (large, but secondary).**
A very large numeral, updated *between* reps, never mid-rep. Rep count is a byproduct here, not the
target, so it should not be the loudest thing on screen.

**Zone 3 — the set's history (a sparkline of per-rep peak force).**
This is the X3-specific innovation. In a to-failure set, the *decline curve* is the story: a healthy
set shows a plateau then a steepening drop. This is the Zwift power-zone-bar trick — the same object
shows both "now" and "the shape of the whole effort."

**Rules of engagement for the live screen:**

| Rule | Source of the idea |
|---|---|
| Silence is the default. Speak only when it changes a decision. | Metric's Velocity Loss mode `[SOURCED]` |
| Never show a correction more than once every N reps; increase density for new movements and under fatigue. | Tempo's explicit anti-demoralisation policy `[SOURCED]` |
| Confirm the fix, not just the fault (green check when corrected). | Tempo `[SOURCED]` |
| Audible cue as the set nears its likely end. | Tonal's "two reps left" chime `[SOURCED]` |
| Any comparative element is coarse-banded and switchable. | Apple Fitness+ Burn Bar `[SOURCED]` |
| The user can hide any metric. | Zwift HUD slots, Peloton Guide toggles, Fitness+ metrics panel `[SOURCED]` |

`[OPEN]` Whether a live **tempo/eccentric metronome** helps or hurts an X3 set. Evidence says people
unconsciously speed up as a set gets harder and a metronome keeps them honest `[REPORTED]`
([True Metronome](https://truemetronome.app/blog/metronome-for-exercise/)), and X3 prescribes slow
eccentrics — but a metronome plus a force bar plus a rep count may be too much. Test with real users.

---

# 5. Effort and intensity — how to represent "how hard"

## 5.1 The four families of intensity representation

| Family | Example | What it needs | Fits X3? |
|---|---|---|---|
| **Physiological load** | WHOOP Strain (0–21), Zwift Stress Points | Heart rate / power over time | Poorly — HR is a weak signal for short strength sets |
| **Mechanical work** | Tonal Volume (reps × load), Work (kJ) | Load measurement | **Yes** — we have force; see §5.4 |
| **Proximity to failure** | RIR / RPE, velocity loss % | Either a subjective ask or a velocity/force signal | **Yes — this is the natural fit** |
| **Social comparison** | Fitness+ Burn Bar, Peloton leaderboard | A population | Optional, and should default off |

## 5.2 RIR — the single best subjective question

`[SOURCED]` ([MacroFactor](https://macrofactor.com/reps-in-reserve/),
[NASM](https://www.nasm.org/resource-center/blog/training/reps-in-reserve-coaching-intensity-with-rir))
RIR asks one thing at the end of a set: *how many more reps could you honestly have done with the
same form?* The conversion is direct: **RPE = 10 − RIR**. The reason it works better than an abstract
1–10 scale is that it names something concrete and countable — reps, not vibes.

`[RECOMMENDATION]` After each set, exactly one question, four large focusable buttons:

> **Could you have done more?**
> `NONE — that was failure` · `MAYBE 1` · `2–3 MORE` · `PLENTY LEFT`

Map to RIR 0 / 1 / 2–3 / 4+. Four options, not eleven — this is a TV with a D-pad and a user who is
out of breath. Default focus on `NONE`, because in a to-failure protocol that's the expected answer
and one click should dismiss it.

`[SOURCED]` Freeletics uses exactly this class of one-question post-workout self-report — users rate
too easy / perfect / too hard, and the AI coach uses it to adjust the next week's programming
(harder progression, deload weeks, movement substitutions)
([Sensai review of AI fitness apps](https://www.sensai.fit/blog/best-ai-fitness-apps-2026-fitbod-freeletics-future-trainiac-alternatives)).
This is a proven pattern: subjective self-report is cheap, honest, and closes the adaptation loop
without any sensing at all.

## 5.3 Velocity loss — the objective proxy for proximity to failure

The most directly transferable framework from strength science.

`[SOURCED]` ([VBT Coach — velocity loss guidelines](https://vbtcoach.com/blog/velocity-loss-guidelines-for-fatigue-with-velocity-based-training))

| Velocity loss within the set | Approx. RPE | Interpretation |
|---|---|---|
| 0–10% | 6–7 | Minimal strain |
| 10–20% | 7–8 | Light fatigue |
| 20–30% | 7–8 | Moderate fatigue |
| 30–40% | 8.5–9 | High fatigue |
| 40%+ | 9.5+ | Maximal / failure |

Practice notes from the same source: **20% is the strength "sweet spot"** (15–25% yields better
strength gains than higher thresholds); **20–40%** for hypertrophy; **5–15%** for power/tapering.
The reference rep should be the **fastest rep in the set, not the first** — lifters often deliberately
slow rep one, so "best rep" gives a truer maximum. Requires **high intent on every rep** or the whole
method collapses. Unreliable for 1–2 rep sets due to rep-to-rep noise.

`[SOURCED]` ([Zelos Strength](https://www.zelosstrength.com/post/velocity-loss-autoregulation),
[Output Sports](https://www.outputsports.com/blog/autoregulation-with-velocity-based-training))
Common practice sets thresholds between 10–40%; systems terminate or warn on crossing, with
audio+visual notification in real time.

`[INFERENCE — the key adaptation for X3]` We measure **force**, not velocity, and X3 sets are
**deliberately taken past** the thresholds above. So invert the framing: rather than using decline as
a stop signal, use it as a **completeness signal**.

`[RECOMMENDATION]` Define an internal **"Depth" metric** for each set:

> Depth = (peak force of best rep − peak force of final rep) / peak force of best rep

A set that ends at 15% depth means the user racked it early. A set at 45–55% depth means they went to
genuine failure. This is directly analogous to velocity-loss autoregulation but points the opposite
way: for a to-failure protocol, **more decline is better evidence of a complete set.**

`[OPEN]` The right Depth thresholds for band training are unknown. They must be calibrated against
self-reported RIR from real users before being shown as a grade. **Do not ship a "set quality score"
until this correlation exists.** Shipping an invented threshold and calling it quality is exactly the
vanity-metric failure described in §12.

## 5.4 Mechanical work with a non-constant load

`[SOURCED]` ([Tonal — training goal metrics](https://tonal.com/blogs/all/training-goal-progress-key-metrics/))
Tonal's metric-per-goal mapping is a genuinely good model:

| Goal | Metric | Definition |
|---|---|---|
| Muscle growth | **Volume** (lb) | sets × reps × load |
| Strength | **Strength Sets** | sets above **72% of estimated 1RM** |
| Endurance | **Endurance Sets** | sets of **9+ reps** at suggested weight |
| Weight loss | **Work** (kJ) | cable distance travelled (in) × load (lb) |
| Performance | **Power Reps** | reps above **80% of Power PR** for that movement |
| Functional strength | **FS Score** | scored on full-ROM / unilateral / rotational content |
| Movement quality | **MQ Score** | scored on balance, stability, stretching content |

And: **every week Tonal assigns a new target range for each metric**, following progressive overload.

`[INFERENCE]` "Volume = reps × weight" is meaningless with bands, because load varies through the
range. The physically correct analogue is **impulse or work**: ∫ force × displacement over the set.
We have force and (if we track bar position) displacement, so we can compute real work in joules —
something a barbell app *cannot* do. That is a genuine differentiator, and it's honest.

`[RECOMMENDATION]` Compute **work (kJ)** per set as our volume analogue, and be transparent in a
"what is this?" panel about how it is derived. Never present a "weight lifted" number for band work;
it invites a false comparison to barbell numbers and will be wrong.

---

# 6. Rep detection UX — good, bad, and recovery

## 6.1 What good looks like

`[SOURCED]` ([LiftRight, NSF-hosted preprint](https://par.nsf.gov/servlets/purl/10189179), as
summarised in search results; the PDF itself did not parse) A wrist-sensor system reports **>96% rep
detection with <1% false positives**, with per-exercise figures like Lat Pulldown 96%/0.3%, Overhead
Press 97%/0.2%, Bench Press 98%/0.4%. `[REPORTED]` — I could not read the primary PDF; treat these
as indicative of the achievable range, not verified.

`[SOURCED]` ([arXiv 2512.11854, "Rep Smarter, Not Harder"](https://arxiv.org/html/2512.11854))
A wrist IMU pipeline: a ResNet segmentation model marks rep boundaries from 2.56 s windows, and a
second CNN+LSTM model classifies **near-failure (≤2 RIR)**. Reported: segmentation F1 0.83 /
accuracy 92.8% / recall 0.87; near-failure classification F1 0.82 / accuracy 86.6% / precision 0.86 /
recall 0.86. Predictions update **every 640 ms**; the user gets **haptic feedback on positive
near-failure predictions**. The authors frame the precision/recall tradeoff explicitly: high recall
so reps aren't missed, high precision so false alarms don't make users **stop sets too early**.

`[SOURCED]` ([Tonal — Counting Reps](https://knowledge.tonal.com/s/article/Counting-Reps))
Tonal's contract with the user is stated: the counter sits to the right of the weight dial, updates
automatically after each fully-performed movement, shows completed vs goal, and **the set ends when
you reach the rep goal or turn the weight off past the halfway point** (before halfway, the set
pauses and can resume; after halfway, it advances to the next set). Incomplete ROM or bad form "may
result in you not getting credit."

**Good rep-detection UX, distilled:**

1. The **rule is stated** ("a rep counts when you complete the full range"), so a miss is
   interpretable rather than arbitrary.
2. The counter updates at a **predictable moment** (end of rep), not continuously.
3. There's a **defined set-end condition** that isn't "we guessed."
4. The **precision/recall tradeoff is a conscious product decision**, not an accident of the model.

## 6.2 What bad looks like — the Tempo cascade

This is the most instructive failure case available, so it's worth spelling out.

`[SOURCED]` ([ian.gay long-term review](https://ian.gay/my-non-sponsored-long-term-review-of-tempo-fit/),
[Garage Gym Reviews](https://www.garagegymreviews.com/tempo-studio-review),
[Adam Preiser review, via search summary](https://adampreiser.com/tempo-studio-review/))

The chain:

```
3D sensor misses reps
      ↓
set is recorded as fewer reps than performed
      ↓
system infers the user struggled
      ↓
recommends a LOWER weight next session
      ↓
user is under-loaded, or over-loaded in the mirror case
      ↓
user stops trusting every number the machine shows
```

Reported symptoms: "some missed reps every once in a while"; extra reps counted at times; sometimes
**none** of the reps in an exercise counted; weight estimation "wrong almost as often as it's right,"
off by 10+ lb; form correction that fired accurately roughly once across many sessions; and — most
seriously — a commenter reporting injury from following weight recommendations. Compounding it:
**no ability to skip or modify a movement**, so a user with a bad recommendation had no escape.

`[INFERENCE]` The root failure isn't the model's accuracy. It's that **a low-confidence measurement
was fed into a high-consequence decision with no human in the loop and no way out.**

## 6.3 Design rules for our rep detection

`[RECOMMENDATION]` These are non-negotiable:

1. **Bias toward under-counting is wrong here; bias toward *visible uncertainty* is right.**
   A silently wrong count is worse than a count that admits doubt. When per-rep confidence is low,
   degrade the display: from a crisp number to a filling arc (Peloton Guide's Movement Tracker
   pattern) — same screen real estate, honest precision.
2. **Never let detected reps drive a consequential decision alone.** Band progression should be
   gated by the user's own RIR answer plus the force trace, not by the rep count. If those disagree,
   ask, don't guess.
3. **Correction must be possible, instantly, in one place.** After the set, on the same screen as the
   RIR question:
   `14 reps  [ − ]  [ + ]   "not right? adjust"` — two focusable buttons, no menu dive. Corrections
   must persist into the stored set, and should be logged as a training signal for the detector.
4. **State the rule in-product.** A one-line explanation reachable from the set summary: what counts
   as a rep, and what doesn't. Tonal does this; it converts "the machine is broken" into "I know why."
5. **Never take away credit retroactively.** If a rep was shown and counted mid-set, it stays counted
   unless the *user* removes it. Retroactive decrements are the fastest way to destroy trust.
6. **Log confidence with every set.** Store per-rep detection confidence alongside the data so that
   later analytics can exclude low-confidence sets from trend lines without the user having to care.
7. **When detection fails hard, fail into manual, loudly and gracefully.**
   `"I lost track — how many did you get?"` with a numeric stepper is a perfectly dignified recovery.
   Tempo's sin was pretending it knew.

`[RECOMMENDATION — the "grey rep"]` A concrete pattern for expressing per-rep confidence on the
sparkline (§4.7 Zone 3): render high-confidence reps as solid bars and low-confidence reps as
outlined/hatched bars. The user sees the machine's doubt without a single word of explanation.

---

# 7. Post-workout summary — what actually makes people come back

## 7.1 What the field does

`[SOURCED]` **Tonal** shows time under tension, range of motion, power output, and total volume
lifted ([Breaking Muscle](https://breakingmuscle.com/tonal-review/)), plus — with Smart View —
**video playback of the specific reps that triggered corrections**
([Tonal](https://tonal.com/blogs/all/tonal-smart-view)).

`[SOURCED]` **Apple Fitness+** ends with the Burn Bar's whole-workout average and animated ring
closure ([Apple Support](https://support.apple.com/en-bw/guide/fitness-plus/apdf8a229f34/ios)).
Ring closure triggers a celebration animation `[SOURCED]`
([Apple Newsroom](https://www.apple.com/newsroom/2020/09/apple-fitness-plus-a-personalized-fitness-experience-comes-to-life-with-apple-watch/)).

`[SOURCED]` **Strava** attaches an **achievement banner** to the activity for PRs and top-10 segment
efforts, and a Best Efforts section listing fastest times per benchmark distance, flagged as lifetime
top-three or annual top-three ([Strava help](https://support.strava.com/en-us/articles/15401646-best-efforts-overview)).
Notably: **you cannot customise which stats/achievements appear** — a control gap worth not copying.

`[SOURCED]` **Peloton Guide** gives a **completion percentage** and badges based on completion rates
([Peloton Buddy](https://www.pelobuddy.com/hands-on-impression-peloton-guide/)).

`[SOURCED]` **Strong** shows a brief PR animation when you beat a personal record — described as
"small but motivating" ([RepReturn](https://repreturn.com/strong-app-vs-hevy/)).

`[SOURCED]` **Freeletics** asks the difficulty question *at* the summary and uses it to adapt next
week — so the summary is also an input, not just an output
([Sensai](https://www.sensai.fit/blog/best-ai-fitness-apps-2026-fitbod-freeletics-future-trainiac-alternatives)).

## 7.2 What the evidence says about *why* people come back

`[SOURCED]` Self-Determination Theory is the best-supported frame: sustained motivation follows from
**autonomy** (volition, choice), **competence** (feeling effective), and **relatedness**
([Apps That Motivate — SDT taxonomy of app features](https://www.sciencedirect.com/science/article/pii/S1071581920300513)).
The same literature finds users **prefer autonomy-supporting features** (changing recommendations,
self-selecting rewards) and **competence-supporting features that combine encouragement with facts**.

`[INFERENCE]` A post-workout summary is primarily a **competence delivery vehicle**. Its job is to
make the user feel *effective*, with evidence. Which means: it must show something that changed, and
that something must be attributable to their effort.

## 7.3 Recommended structure

`[RECOMMENDATION]` Three screens, auto-advancing, each readable in 3 seconds from the sofa, each
skippable with one click.

**Screen 1 — The verdict (one sentence + one number).**

> **You went to failure on all 4 movements.**
> 14 · 11 · 18 · 22 reps

One hero fact. Not a dashboard. WHOOP's "single hero number that answers one question" discipline
`[SOURCED]`. For a to-failure protocol the question is *"did I actually do the work?"* — so the
verdict should speak to completeness, not to volume.

**Screen 2 — The evidence (per-exercise force curves).**

Four small sparklines of per-rep peak force, one per movement, each annotated with the Depth figure
(§5.3). This is the "encouragement with facts" that the SDT literature identifies as the effective
competence support. It's also the thing no barbell app can show, which makes it *ours*.

`[RECOMMENDATION]` Annotate with meaning, not just numbers: `"held 90% of peak for 11 reps, then
dropped fast — that's a clean set."` Language beats a raw percentage for a user who won't learn our
metric vocabulary.

**Screen 3 — The trend (this workout in context).**

One chart: this movement's best-set force over the last 8 sessions, with this session highlighted.
Nothing else. Progress-over-weeks belongs here (§8), not on the home screen.

**Then stop.** Do not add sharing, badges, a leaderboard and a nutrition upsell.

## 7.4 Summary anti-rules

`[RECOMMENDATION]`

- **Never report a number the user cannot influence next session.** If we can't say what to do
  differently, it's decoration.
- **No "calories burned" for strength work.** It's a vanity metric with poor validity, and it invites
  comparison to cardio that will always lose.
- **Do not celebrate every session.** See §12.2.
- **Show the last session's comparable number next to today's.** Strong/Hevy's pre-filled "previous"
  is the highest-value single element in a lifting UI, because it makes progression legible with zero
  cognition `[SOURCED]`.

---

# 8. Progress over weeks

## 8.1 Patterns worth borrowing

**Tonal Strength Score — a single composite, engineered against noise.** `[SOURCED]`
([Tonal](https://tonal.com/blogs/all/level-up-with-tonals-enhanced-strength-score),
[Tonal support](https://knowledge.tonal.com/s/article/Strength-Score))

- Range **0–1000**, described as strength on your best day.
- Built from estimated 1RMs across 100+ (later 150+) movements, **using your best set from each
  workout**, then a **weighted average with recency bias**.
- Aggregation: exercise → muscle group → region (upper / lower / core) → overall.
- Weightings: recency, exercise frequency, muscle-group size (compound > isolation). **Only strength
  PRs move the score** — volume and power PRs don't.
- Explicit design intent: monitor **long-term trends, not daily fluctuation**; a single lighter
  workout is unlikely to move it. Community comparison exists but is framed as optional.

`[INFERENCE]` The anti-noise engineering here is the actual lesson. A progress metric that wobbles
when you have a bad day teaches users that the metric is meaningless. **Recency-weighted, best-set-only,
slow-moving.**

**WHOOP — weekly cadence and tiered depth.** `[SOURCED]`
([WHOOP Medium — WPA](https://medium.com/@whoop/new-feature-the-weekly-performance-assessment-b3f7eb209241),
[925 Studios](https://www.925studios.co/blog/whoop-design-breakdown))
A **Weekly Performance Assessment delivered every Monday** with personalised analysis, actionable
feedback, and an optional community comparison; annual assessments add day-of-week clustering
analysis. Trend views are **tier 2**; raw 30-day biometric graphs are **tier 3**, explicitly for a
minority of users.

**Zwift — composite score plus named status.** `[SOURCED]`
([Zwift Insider](https://zwiftinsider.com/fitness-metrics/)) Training Score is a **42-day
exponentially-weighted moving average** of daily Stress Points; Training Status buckets you into
five labels by comparing it to a 7-day fatigue average. Critique from commenters: oversimplified for
serious users, and useless if your data lives elsewhere.

**Charting hygiene.** `[REPORTED]` (aggregated design writing, no single authoritative source)
Show one takeaway per chart; use rolling averages (this week vs last week) rather than
session-to-session comparisons; provide a trend line when values oscillate; and be careful with
truncated y-axes, which exaggerate small changes.

## 8.2 Recommendations for X3

`[RECOMMENDATION]`

- **Per-movement, not global, is the primary view.** "Your chest press is up 12% since week 1" is
  actionable; a global composite is not, especially with only ~8 movements.
- **Plot peak force of the best rep per session**, recency-weighted, with a rolling trend line over
  the raw points. Peak-of-best-rep is our analogue of Tonal's "best set from each workout."
- **Never plot rep count as the headline progress metric.** Reps in a to-failure protocol are
  confounded by band choice — a rep-count line will fall off a cliff the day someone moves up a band,
  which is the exact moment they should feel best. `[INFERENCE, but a strong one]`
- **Make band changes first-class annotations on the chart.** A vertical marker labelled
  `→ Dark Grey` turns a scary discontinuity into the proudest moment in the graph.
- **Weekly, not daily, cadence for reflection.** Monday summary, WHOOP-style. With 6 sessions a week,
  the week is the natural unit of progress.
- **Tier it.** Tier 1: one number per movement, up/down/flat. Tier 2: the 8-session chart. Tier 3:
  per-rep force traces for anyone who wants them. Separate screens.

---

# 9. Streaks that don't punish rest days

This is the section most likely to determine whether the app is loved or resented.

## 9.1 The evidence that streaks work

`[REPORTED]` Figures circulating in the design-writing literature, all traceable to secondary sources
rather than to Duolingo's own publications — **cite with care**:
Streak Freeze reduced churn by **21%** for at-risk users; users with 7+ day streaks retain at
**2.4×**; over **10M** users hold 365+ day streaks (~20% of DAU); Streak Wagers improved D7 retention
by **14%**; adding the Duo character to pushes raised DAU **~5%**; separating streak credit from the
daily goal increased 7+ day streaks by **over 40%**
([Digia](https://www.digia.tech/post/duolingo-habit-forming-reminders-retention-architecture/),
[UX Magazine](https://uxmag.com/articles/the-psychology-of-hot-streak-game-design-how-to-keep-players-coming-back-every-day-without-shame),
[Apptitude](https://apptitude.io/blog/how-duolingos-streak-mechanic-actually-works/)).

`[SOURCED]` The *mechanism* is well-established regardless of the exact numbers: **loss aversion
dominates**. Users protect a streak rather than pursue one; a 300-day streak becomes an identity
statement, so breaking it "feels like breaking the self"
([Yu-kai Chou](https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/)).

## 9.2 The evidence that streaks harm

`[SOURCED]` Documented harms from Apple Watch ring streaks specifically
([TechRadar](https://www.techradar.com/health-fitness/smartwatches/my-apple-watch-is-going-to-hate-this-our-wearables-are-making-us-anxious-and-obsessive-heres-what-we-can-all-do-about-it),
[Body Insights](https://bodyinsightsapp.com/blog/apple-watch-rest-day),
[Ash Furrow](https://ashfurrow.com/blog/2021-my-year-of-closed-rings/)):

- Users **fake activity** to protect a streak when ill or unmotivated. (One documented 2,000-day
  Move-ring streak maintained partly by logging fake exercises.)
- Motivation shifts from enjoyment to **fear of breaking the streak** — the textbook overjustification
  pattern.
- Rest becomes a source of **shame**, especially for people whose capacity varies day to day.
- Apple added ring pausing (up to 90 days without breaking awards), and users still report the
  emotional weight persisting.

`[SOURCED]` WHOOP has the same structural flaw from the other direction: high recovery scores generate
persistently high strain goals, **with no built-in rest days**, which a UX evaluation found
demotivating rather than coaching
([Everyday Industries UX evaluation](https://everydayindustries.com/whoop-wearable-health-fitness-user-experience-evaluation/)).

## 9.3 The design rules

`[SOURCED]` From the shame-free streak framework
([UX Magazine](https://uxmag.com/articles/the-psychology-of-hot-streak-game-design-how-to-keep-players-coming-back-every-day-without-shame)):

- **Define "a day" precisely and generously.** Time window (midnight vs rolling 24h), minimum
  qualifying action, and explicit handling of time zones, outages, and holidays.
- **Separate streak credit from the full goal.** Duolingo credits a streak for one short lesson while
  the daily goal remains larger — reported as the change that lifted 7+ day streaks by 40%+.
- **Build repair mechanics before users need them**, and prefer **earn-back over pay-to-skip**
  (complete extra work in a window to restore). Paying to protect a streak monetises the anxiety you
  created.
- **Ramp down rather than reset.** Yu-kai Chou's step 3: decrease rewards gradually on a break instead
  of zeroing, allowing recovery within a few days.
- **Reframe breaks around aggregate progress**, not failure: *"47 of the last 50 days"* rather than
  *"streak lost."*
- **No confirmshaming.** "Are you really going to give up now?" and "don't let your team down" are
  named anti-patterns.
- **Named anti-patterns to avoid**: the Perfectionism Trap (all-or-nothing), the Engagement Trap
  (optimising DAU without checking whether users reach their actual goals), the Complexity Trap, the
  Social Pressure Trap, the Monetization Trap.
- **Ethical floor**: explain the mechanics, expose the stats, allow pause/modify, no hidden penalties,
  and deliver value regardless of streak status.

`[SOURCED]` Escalation matters: motivation math means day 2→3 is 50% growth while day 200→201 is 0.5%,
so escalating rewards mostly compound pressure. The recommendation is **multiple success metrics,
partial credit, and long-term trend focus** instead.

`[SOURCED]` Notification discipline from the same family of research
([Digia](https://www.digia.tech/post/duolingo-habit-forming-reminders-retention-architecture/)):
cap at ~2 pushes/day; reserve urgency copy for genuine imminent loss; infer the user's actual practice
window from behaviour rather than a time they picked during onboarding; use persistent in-app state
(a visible counter) rather than modal reminders for things already on screen.

## 9.4 The X3-specific streak design

`[RECOMMENDATION]` **Do not build a consecutive-day streak.** The program itself prescribes rest —
4 days/week in weeks 1–4, and even the 6-day phase leaves a day. A consecutive-day counter is
structurally at war with the program.

Build **week consistency** instead:

```
  THIS WEEK          ● ● ● ● ○ ○ ·        4 of 6
  CONSISTENT WEEKS   ▮▮▮▮▮▮▮▮▮▮▮▮  12     (≥5 of 6 sessions)
```

- **The unit is the week, and the target is ≥5 of 6.** A rest day is *inside* the definition of
  success, so taking one cannot break anything. This is the single most important streak decision in
  this document.
- **A missed week ramps down, not resets.** Following Yu-kai Chou's step 3: a missed week costs one
  from the counter, not all of it. Two consecutive missed weeks and we stop counting and start
  inviting.
- **Grace exists and is visible from day one**, not sold. A "life happens" week is available and
  labelled as such. It is never purchased.
- **Reframe every gap toward the aggregate.** `"31 of your last 36 sessions."` Never
  `"you broke your streak."`
- **Rest is affirmed, not merely tolerated.** On the 7th day the home screen should say something
  like *"Rest day. Growth happens now."* — not a grey empty ring. Note that WHOOP's failure mode is
  precisely the absence of this `[SOURCED]`.
- **Never notify about a streak at risk late at night.** That is the mechanism that produced the
  documented airport-at-11:45pm behaviour `[SOURCED]`.
- **Do not make the streak the hero of the home screen.** It sits below the primary action, small.

---

# 10. Calibration and onboarding — the "brace → countdown → measure" pattern

Our product needs a strength baseline: which band, and what force to expect. This section is the
most directly transferable science in the document.

## 10.1 The IMTP protocol — a validated measurement ritual

The isometric mid-thigh pull is the field standard for measuring maximal force. Its protocol is
essentially a well-designed UX flow that sports science arrived at empirically.

`[SOURCED]` ([Hawkin Dynamics IMTP setup guide](https://learning.hawkindynamics.com/knowledge/isometric-mid-thigh-pull-setup-guide),
[PMC12210026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12210026/))

1. **Standardise the position.** Bar height and joint angles are set once and **kept identical across
   sessions** (knee 125–145°, hip 140–150° for IMTP). Grip width and foot position are recorded.
2. **Warm up submaximally.** Three pulls at perceived **50%, 75%, 90%** effort, ≥60 s apart.
3. **Remove slack — but do not pre-tense.** An explicit, separate step: take the slack out of the
   system *without* loading the muscles.
4. **Quiet period / zeroing.** The athlete stands still while the system records baseline (system
   weight). Movement here invalidates the trial.
5. **3-second countdown**, then go.
6. **An external cue, not an internal one.** "Push the ground away" / "push your feet into the ground
   as fast and as hard as possible" — *not* "pull the bar." External focus reliably produces more
   force than internal focus.
7. **Hold 2–4 seconds** (some protocols specify ≥3 s of maximal effort); the tester encourages
   throughout, and the study protocol counted down the **final 3 seconds** aloud.
8. **Multiple trials with defined rest.** Minimum 2 trials; keep going while each trial beats the
   last; stop when force declines. Rest 90 s between single-MVC trials.
9. **Reliability is high when done this way**: peak force test-retest **ICC 0.73–0.99** across the
   literature `[SOURCED]`; with live visual feedback, **ICC 0.898 → 0.972 and CV 4.85% → 2.63%** in
   the study above.

## 10.2 How hardware fitness products handle first-run calibration

**Tonal — a workout *is* the assessment.** `[SOURCED]`
([Tonal support](https://knowledge.tonal.com/kb/guide/en/start-strong-with-tonal-weight-assessment-workout-qsdK4SsASW/Steps/4286289),
[Tonal quick start](https://www.tonal.com/blog/tonal-quick-start-guide/))
An **18-minute Weight Assessment workout** with **four movements at gradually increasing weights**
(barbell seated lat pulldown, standing chop, bench press, neutral-grip deadlift). The output sets the
**Strength Score**, which in turn sets the starting weight for every exercise. Before the assessment,
onboarding asks experience level and one of three goals.

The framing is the important part: it's presented as a *workout*, not a *test*. The user's first
session produces both a calibration and a sense of having trained.

`[SOURCED]` Tonal's strength-calibration patent describes a different, more technical route:
**isokinetic seed movements** at 3–4 different constant speeds (20–60 in/s), collecting force-velocity
pairs, then fitting to a population-derived force-velocity profile and extrapolating to the
**zero-velocity intercept** as the 1RM estimate. Instruction is delivered by **video prompts the user
mimics**. Notably, **no failure detection is involved** — the estimate comes from extrapolation, not
from taking anyone to their limit
([US10874905B2](https://patents.google.com/patent/US10874905)).

`[INFERENCE]` That is a meaningfully safer and faster calibration philosophy than "lift until you
can't": measure submaximal points, fit a curve, extrapolate. Worth considering for X3, where a true
max attempt with bands is awkward and risky.

**WHOOP — withhold the number until it's trustworthy.** `[SOURCED]`
([WHOOP support, via search summary](https://support.whoop.com/hc/en-us/articles/360019622573-What-is-the-Recovery-calibration-period-);
the article itself is behind auth and I could not fetch it directly — `[REPORTED]` for exact days)
A ~**4-day calibration phase**. During it the **Recovery score renders grey** while baselines are
learned. **Strain Coach unlocks on day 5; Sleep Coach on day 7.** Onboarding itself is minimal —
pair over Bluetooth, answer goal questions.

`[INFERENCE]` The greyed-out score is the single best onboarding pattern in wearables: it makes
"I don't know yet" a *visible, designed state* rather than a wrong number. It buys enormous trust for
a small cost.

## 10.3 The X3 calibration flow

`[RECOMMENDATION]` A first-run flow that is a *session*, not a *test*, and that uses the measurement
ritual above.

**Stage 0 — Two questions, not twenty.** Experience level; goal. (Tonal's model.) Nothing else. Every
extra onboarding question is churn.

**Stage 1 — Per-position force capture, per movement.** For each of the core movements, capture peak
force at 2–3 standardised bar positions (e.g. bottom / mid / top of range), because band load and
human strength both vary through the range (§13).

For each capture, run the ritual **exactly**:

```
  ┌──────────────────────────────────────────┐
  │  CHEST PRESS · position 1 of 3           │
  │                                          │
  │  SET UP                                  │   ← position guidance, hold still
  │  Feet on the strap. Bar at chest.        │
  │                                          │
  │  ▸ TAKE THE SLACK OUT                    │   ← explicit slack-removal step,
  │    …hold still…                          │      then quiet period to zero
  │                                          │
  │            3 · 2 · 1 · PUSH              │   ← 3s countdown
  │                                          │
  │      ████████████████░░░░░  hold…        │   ← live force bar, 3s hold
  │            "PUSH THE FLOOR AWAY"         │   ← external cue
  │                                          │
  │  Best: 142 lb  ·  attempt 2 of 3         │   ← beat-the-last-trial framing
  └──────────────────────────────────────────┘
```

Every element there is lifted from the validated protocol: slack removal, quiet zeroing, 3-second
countdown, live force bar (worth +5–8% output and better reliability), external cue wording,
fixed hold duration, and repeated trials until force stops improving.

**Stage 2 — Band recommendation with visible uncertainty.**

> **Start with the light grey band.**
> Based on 3 measurements. We'll refine this over your first week.

Say the confidence out loud. WHOOP's grey score, applied to a recommendation.

**Stage 3 — Provisional mode for the first week.** `[RECOMMENDATION]` For the first ~4 sessions, show
force live but **do not show trends or a score**. Label the state explicitly:
`"Still learning your baseline — trends unlock after 4 sessions."` This is WHOOP's calibration
pattern and it prevents the user forming a first impression from noise.

**Recalibration cadence.** `[RECOMMENDATION]` Re-run the capture every 4 weeks, and always offer it
when the user changes bands. Frame it as a milestone event ("Week 4 check-in"), not a chore. And keep
the **position standardised** — the protocol's insistence on identical setup across sessions is what
makes comparison meaningful. Store the setup parameters and replay them on screen next time.

`[OPEN]` Whether users will tolerate a 3-position isometric capture per movement, or whether one
position is the practical limit. Time-box the whole calibration to under 6 minutes and test it.

---

# 11. Anti-patterns

## 11.1 Gamification that encourages padding

`[SOURCED]` The clearest documented case: Apple Watch users **entering fake exercises** to protect
streaks when ill or unmotivated, and one user walking an airport at 11:45pm to hit a move goal
([Ash Furrow](https://ashfurrow.com/blog/2021-my-year-of-closed-rings/),
[TechRadar](https://www.techradar.com/health-fitness/smartwatches/my-apple-watch-is-going-to-hate-this-our-wearables-are-making-us-anxious-and-obsessive-heres-what-we-can-all-do-about-it)).

`[INFERENCE]` **Any metric that can be inflated by doing more low-quality work will be.** For X3 this
is acute: reps are trivially inflatable by choosing a lighter band or shortening range of motion. If
"total reps" is a headline metric, we are directly incentivising the two things the protocol says not
to do.

`[RECOMMENDATION]` Rules against padding:

- **Do not make rep count, session count, or total volume the headline achievement.**
- **Reward quality, not quantity.** Depth of the force decline (§5.3), consistency of range of motion,
  and consistency across weeks are all hard to fake and directly aligned with the protocol.
- **Cap the credit.** A session gives you one unit of credit regardless of how long you spent. There
  is no way to grind more of it.
- **Never award anything for a session shorter than a plausible minimum**, and if we detect a
  suspiciously short/light session, credit it without fanfare rather than celebrating it.

## 11.2 Celebration fatigue

`[SOURCED]` ([Peter Ramsey, UX Planet, via search summary](https://uxplanet.org/why-confetti-celebrations-backfire-and-how-to-make-them-work-be838a6e7b8b))
Celebrations backfire when they are disproportionate to the moment; confetti for depositing a cheque
is overkill, confetti for buying a house is not. The animation should match the **gravity and the
frequency** of the moment. Celebrations should be layered on top of real progress, not substitute for
it, and should celebrate the *user's* milestone rather than the company's.

`[SOURCED]` Guilt and disappointment from missed targets are a documented pathway to disengagement in
gamified fitness apps
([Frontiers in Psychology — motivation crowding in gamified fitness apps](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1286463/full)).

`[RECOMMENDATION]` A celebration budget:

| Event | Response |
|---|---|
| Completed a set | Nothing. A tick. |
| Completed a session | A quiet, consistent completion state. No animation. |
| Consistent week (≥5 of 6) | A small, once-weekly moment. |
| Band graduation | **The big one.** Full-screen, unmistakable, once every several months. |
| Force PR on a movement | Medium — a marked point on the chart plus one line of copy. |

The scarcity is the point. If the band-graduation moment is the only confetti in the product, it will
mean something.

## 11.3 Vanity metrics

`[SOURCED]` "Badges for the sake of badges" is named as the persistent failure mode in gamified
fitness design ([StriveCloud](https://www.strivecloud.io/blog/what-is-gamification)); over-reliance
on extrinsic rewards produces the **overjustification effect**, where behaviour stops when the
rewards stop.

`[RECOMMENDATION]` The test for every metric we ship:

> **Can the user do something differently tomorrow because of this number? If not, cut it.**

Specific cuts for X3: estimated calories; "total pounds lifted" (meaningless with bands and
inflatable); global leaderboards; badge counts; anything that goes up merely because time passed.

## 11.4 Removing agency

`[SOURCED]` The WHOOP UX evaluation names a **Control & Flexibility heuristic violation**: users
cannot adjust their own targets or feed subjective state into the coaching, and consistently-missed
targets produce no adaptive response
([Everyday Industries](https://everydayindustries.com/whoop-wearable-health-fitness-user-experience-evaluation/)).
The 925 Studios breakdown lists inflexible thresholds and data lock-in as WHOOP's core weaknesses
([925 Studios](https://www.925studios.co/blog/whoop-design-breakdown)). Ian Gay's Tempo review names
the inability to skip or modify a movement as an escalating frustration and a safety issue
([ian.gay](https://ian.gay/my-non-sponsored-long-term-review-of-tempo-fit/)).

`[RECOMMENDATION]` Guaranteed agency:

- Skip a movement, always, in one click.
- Swap the day (do pull instead of push), always.
- Edit any recorded number after the fact.
- Turn off any comparison, any celebration, any coaching cue.
- Export the data.

## 11.5 Jargon as coaching

`[SOURCED]` Both WHOOP critiques land on the same point: the coaching language is technical and
robotic, and a message about missing strain targets left the evaluator unclear what to actually do
([Everyday Industries](https://everydayindustries.com/whoop-wearable-health-fitness-user-experience-evaluation/),
[925 Studios](https://www.925studios.co/blog/whoop-design-breakdown)).

`[RECOMMENDATION]` Every coaching string in the product must survive this test: *does it name an
action?* "Your force dropped 40% across the set" is an observation. "You went deep — that's a complete
set. Next time try the heavier band for the first 5 reps" is coaching.

---

# 12. Showing a non-linear thing: force vs range of motion

This is the hardest visualisation problem in the product and the most distinctive opportunity.

## 12.1 The underlying concept

`[SOURCED]` ([Booty Builder — Load Curves Explained](https://bootybuilder.com/anatomy/load-curves-explained/),
[RDL Fitness — Understanding Strength Curves](https://www.rdlfitness.com/blog/understanding-strength-curves))

Human strength varies through a range of motion, in three classic shapes:

- **Ascending** — strongest near the top/end. Squat, deadlift, most pressing.
- **Descending** — strongest near the start. Rows, pull-ups, most pulling.
- **Bell-shaped** — strongest in the middle. Single-joint work: curls, triceps extensions.

Bands produce **increasing resistance as they stretch**, which matches an **ascending** strength curve
well and a descending one poorly. That mismatch is the whole story of band training, and it is
exactly what a force sensor can make visible for the first time.

The Booty Builder page uses the right chart form: **range of motion on the x-axis, force/torque
capacity on the y-axis, with two curves overlaid** — what you can produce, and what the equipment
demands. Their one-line summary of the concept:

> "Weight is a number. Resistance profiles determine where the rep is hardest." — Booty Builder

`[SOURCED]` Their three techniques for making this legible to non-experts are worth copying verbatim
as a method: (1) plain-language categories (ascending / descending / bell) instead of maths;
(2) anchor to familiar equipment; (3) frame in terms of felt consequence — where the rep feels hard
and where it feels easy.

## 12.2 How the performance-science world visualises it

`[SOURCED]` Force-velocity profiling tools plot the athlete's measured points and fit a line, then
classify the athlete as force-deficient or velocity-deficient — i.e. **the chart's job is to produce a
label, not to be admired**
([Science for Sport](https://www.scienceforsport.com/force-velocity-profiling/),
[STATSports](https://statsports.com/article/introducing-force-velocity-profiling-unlocking-sprint-performance-insights)).
Coaching dashboards lean on **traffic-light visualisation** to flag athletes needing attention, and on
automated threshold alerts, rather than expecting coaches to read curves
([Vitruve](https://vitruve.fit/blog/athlete-dashboards-for-coaches-track-compare-and-optimize-performance/)).

`[SOURCED]` VBT apps show **per-rep bars** with peak/mean/propulsive/eccentric overlays and per-set
breakdown cards ([BarSpeed](https://www.bar-speed.com/),
[VBT Coach](https://www.vbtcoach.com/blog/analysing-velocity-data-from-a-single-rep)). Metric Lift
measures bar speed, range of motion, bar path and rep count and presents progress charts
([Metric](https://metric.coach/lift)).

`[SOURCED]` Tempo's answer for consumers is a **range-of-motion meter** — a single one-dimensional
gauge showing whether you hit the target depth, not a curve
([Tempo support](https://support.tempo.fit/support/solutions/articles/151000154714-3d-tempo-vision-form-feedback)).

## 12.3 Recommendations for X3

`[RECOMMENDATION]` **Three different representations for three different moments.** Do not try to make
one chart serve all of them.

**(a) During the rep — a shape, not a curve.**
A vertical bar or arc whose fill height is instantaneous force, with the **band's expected load curve
drawn behind it as a faint envelope**. The user isn't reading; they're seeing whether they're filling
the shape. Fast, pre-attentive, no numbers.

`[RECOMMENDATION]` Consider a **second envelope for the user's own best rep of this set**, so
"beat the ghost" is the mid-set game. That is the IMTP live-feedback effect, gamified honestly:
the thing being encouraged is more force, which is exactly the thing the protocol wants.

**(b) Immediately after the set — the two-curve chart, once, small.**
X = range of motion (bottom → top). Y = force. Two lines: **what the band demanded** and **what you
produced**. The teaching moment is the gap. Label the gap in words:
`"You're strongest in the middle third. The band is hardest at the top."`

Design rules for this chart:
- **Fix the x-axis to the movement's range**, always the same, so successive sessions are comparable.
- **Two lines maximum.** Never overlay every rep — overlay the *first* rep and the *last* rep of the
  set, which shows fatigue as the collapse of the second curve toward the floor. That single
  comparison carries more meaning than 20 traces.
- **Annotate the crossing point.** Where your capacity dips below the band's demand is where the rep
  failed. Put a marker there and name it.
- **Never render this chart on the live screen.** It requires reading.

**(c) Over weeks — collapse the curve to one number, and keep the shape available.**
Following the force-velocity convention of turning a curve into a label: reduce each session's curve
to **peak force** (headline) plus a **shape descriptor** ("strong through the top," "fading early").
Plot peak force over sessions. Keep the curve one level down for anyone who wants it (WHOOP tier 3).

**(d) Explain it in plain language, once, well.**
Borrow Booty Builder's method: name the three strength-curve shapes in ordinary words, anchor to the
user's own movements ("your chest press is ascending — you're stronger at lockout"), and frame it as
felt consequence ("that's why the last few inches burn"). One screen, reachable from the chart, never
forced.

`[OPEN]` Whether we can measure **bar position** accurately enough to render force-vs-ROM at all. If
we can only measure force vs *time*, the whole of (b) changes: we'd plot force over the rep's duration
instead, which is weaker but still shows the concentric/eccentric asymmetry and the fatigue collapse.
**Resolve this early — it is a fork in the product.**

---

# 13. Cross-cutting principles

Distilled from everything above.

1. **Match the precision of the display to the confidence of the measurement.** Peloton Guide's spiral,
   Apple's five Burn Bar bands, WHOOP's grey calibrating score. Three separate products independently
   arrived at "show less precision than you'd like when you're not sure." `[SOURCED]`
2. **Silence is the default; interruption must earn its place.** Metric's velocity-loss mode is silent
   until within 5% of threshold. Tempo deliberately withholds form feedback to avoid demoralising.
   `[SOURCED]`
3. **Reactive feedback beats prescriptive feedback**, if it closes the loop inside the same set.
   Tonal designs for "react on the very next rep." `[SOURCED]`
4. **Confirm the fix, not just the fault.** Tempo's green check. `[SOURCED]`
5. **Compress toward a decision.** WHOOP's Recovery score exists to answer one question. Ask of every
   number: what decision does this change? `[SOURCED]`
6. **Separate screens, not expandable sections**, for progressive disclosure. `[SOURCED]`
7. **Slow-moving progress metrics.** Recency-weighted, best-set-only, resistant to a single bad day.
   `[SOURCED, Tonal]`
8. **Autonomy is a retention feature, not a settings screen.** SDT evidence plus three separate
   documented failures (WHOOP targets, Tempo skipping, Strava's uncustomisable feed). `[SOURCED]`
9. **Design the recovery path before the happy path** — for broken streaks, miscounted reps, and
   missed weeks. `[SOURCED]`
10. **Words, not just numbers.** Every metric needs a one-line human reading that names an action.

---

# 14. Open questions to resolve before building

| # | Question | Why it matters |
|---|---|---|
| 1 | Can we measure **bar position**, or only force? | Determines whether force-vs-ROM (§13b) is possible at all. Product-defining fork. |
| 2 | What is the real **sampling rate and noise floor** of our sensor? | Tonal samples at 60 Hz for six quality dimensions. Our per-rep quality ceiling is set by this. |
| 3 | What Depth (§5.3) values actually correspond to self-reported RIR 0 in band training? | Without this, any "set quality" score is invented. Must be calibrated on real users. |
| 4 | What is the official X3 12-week day-by-day schedule, from the primary source? | Currently sourced from review sites. Needed before hard-coding a calendar. |
| 5 | Does a live force bar improve or distract during a 15–40 rep set? | The IMTP evidence is for 5 s and 30 s efforts, not 60–120 s sets. Extrapolation is not proof. |
| 6 | Can we resolve **left/right symmetry** from a single bar sensor? | Determines whether Tonal-style symmetry feedback is available to us. |
| 7 | Will users tolerate a 3-position isometric calibration per movement? | Time-box to 6 minutes and test; the flow is worthless if abandoned. |
| 8 | Does a tempo metronome help or add noise on top of the force bar? | X3 prescribes slow eccentrics but the live screen is already busy. |
| 9 | What is our TV platform's actual overscan behaviour on cheap panels? | Edge-anchored layouts break silently. |
| 10 | Do users understand "Depth" / decline as *good*? | It inverts the intuition every other lifting app has taught them. Needs comprehension testing. |

---

# 15. Sources

**Force / load-sensing hardware**
- Tonal — [Form Feedback](https://tonal.com/blogs/all/introducing-form-feedback) · [Smart View](https://tonal.com/blogs/all/tonal-smart-view) · [Strength Score](https://tonal.com/blogs/all/level-up-with-tonals-enhanced-strength-score) · [Training-goal metrics](https://tonal.com/blogs/all/training-goal-progress-key-metrics/) · [Burnout Mode](https://www.tonal.com/blog/burnout-mode-tonal/) · [Quick start guide](https://www.tonal.com/blog/tonal-quick-start-guide/)
- Tonal support — [Counting Reps](https://knowledge.tonal.com/s/article/Counting-Reps) · [Strength Score](https://knowledge.tonal.com/s/article/Strength-Score) · [Weight Assessment workout](https://knowledge.tonal.com/kb/guide/en/start-strong-with-tonal-weight-assessment-workout-qsdK4SsASW/Steps/4286289) · [Dynamic Weight Modes](https://knowledge.tonal.com/s/article/Intelligence-Dynamic-Weight-Modes)
- [US10874905B2 — Strength calibration (patent)](https://patents.google.com/patent/US10874905)
- Tempo — [3D Tempo Vision & Form Feedback](https://support.tempo.fit/support/solutions/articles/151000154714-3d-tempo-vision-form-feedback)
- Reviews — [Breaking Muscle: Tonal](https://breakingmuscle.com/tonal-review/) · [Garage Gym Reviews: Tempo Studio](https://www.garagegymreviews.com/tempo-studio-review) · [ian.gay: long-term Tempo review](https://ian.gay/my-non-sponsored-long-term-review-of-tempo-fit/) · [GearJunkie: Tonal](https://gearjunkie.com/health-fitness/tonal-strength-training-system-review)

**Class / cardio platforms**
- Peloton — [Guide announcement](https://investor.onepeloton.com/news-releases/news-release-details/peloton-introduces-peloton-guide-first-connected-strength/) · [Peloton Buddy hands-on](https://www.pelobuddy.com/hands-on-impression-peloton-guide/) · [Target metrics in the app](https://www.pelobuddy.com/app-target-metrics/) · [TechRadar on AI rep tracking](https://www.techradar.com/features/pelotons-ai-rep-tracking-feature-feels-like-a-personal-trainer-is-pushing-me-all-the-way)
- Zwift — [HUD refresh closer look](https://zwiftinsider.com/hud-refresh-closer-look/) · [Fitness trend metrics](https://zwiftinsider.com/fitness-metrics/) · [New on-screen metrics](https://www.zwift.com/news/32990-boost-your-indoor-cycling-performance-with-new-on-screen-metrics-on-zwift)
- Apple Fitness+ — [Newsroom launch](https://www.apple.com/newsroom/2020/09/apple-fitness-plus-a-personalized-fitness-experience-comes-to-life-with-apple-watch/) · [Change on-screen metrics](https://support.apple.com/en-bw/guide/fitness-plus/apdf8a229f34/ios) · [MacRumors: Burn Bar](https://www.macrumors.com/how-to/apple-fitness-plus-burn-bar/) · [MakeUseOf: enable/disable Burn Bar](https://www.makeuseof.com/apple-fitness-burn-bar-enable-disable/)

**Wearables and coaching**
- WHOOP — [Strain Target / Strain Coach](https://www.whoop.com/us/en/thelocker/strain-coach/) · [Weekly Performance Assessment](https://medium.com/@whoop/new-feature-the-weekly-performance-assessment-b3f7eb209241) · [Trend views](https://www.whoop.com/us/en/thelocker/track-progress-with-new-trend-views/) · [First 30 days (support)](https://support.whoop.com/hc/en-us/articles/360057137353-What-to-Expect-in-Your-First-30-Days) · [Recovery calibration period (support)](https://support.whoop.com/hc/en-us/articles/360019622573-What-is-the-Recovery-calibration-period-)
- [925 Studios — WHOOP design breakdown](https://www.925studios.co/blog/whoop-design-breakdown)
- [Everyday Industries — WHOOP UX evaluation](https://everydayindustries.com/whoop-wearable-health-fitness-user-experience-evaluation/)

**Logging apps**
- [RepReturn — Strong vs Hevy](https://repreturn.com/strong-app-vs-hevy/)
- [Sensai — best AI fitness apps (Freeletics feedback loop)](https://www.sensai.fit/blog/best-ai-fitness-apps-2026-fitbod-freeletics-future-trainiac-alternatives)
- [Strava — Best Efforts](https://support.strava.com/en-us/articles/15401646-best-efforts-overview) · [Activity stats in the feed](https://support.strava.com/en-us/articles/15401664-activity-stats-in-the-feed)

**Measurement science**
- [The Impact of Real-Time Visual Feedback on Maximal Force Output and Reliability During IMTP Testing (PMC12210026)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12210026/)
- [Hawkin Dynamics — IMTP setup guide](https://learning.hawkindynamics.com/knowledge/isometric-mid-thigh-pull-setup-guide) · [IMTP basics](https://www.hawkindynamics.com/blog/isometric-mid-thigh-pull-the-basics)
- [Test-retest reliability of a single IMTP protocol (PMC11348909)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11348909/)
- [VBT Coach — velocity loss guidelines](https://vbtcoach.com/blog/velocity-loss-guidelines-for-fatigue-with-velocity-based-training) · [Analysing velocity data from a single rep](https://www.vbtcoach.com/blog/analysing-velocity-data-from-a-single-rep)
- [Metric — real-time velocity feedback](https://www.metric.coach/user-guide/real-time-velocity-feedback) · [Metric Lift](https://metric.coach/lift)
- [Output Sports — autoregulation with VBT](https://www.outputsports.com/blog/autoregulation-with-velocity-based-training) · [Zelos Strength — velocity-loss autoregulation](https://www.zelosstrength.com/post/velocity-loss-autoregulation)
- [Science for Sport — force-velocity profiling](https://www.scienceforsport.com/force-velocity-profiling/) · [STATSports — FV profiling](https://statsports.com/article/introducing-force-velocity-profiling-unlocking-sprint-performance-insights) · [Vitruve — athlete dashboards](https://vitruve.fit/blog/athlete-dashboards-for-coaches-track-compare-and-optimize-performance/)
- [MacroFactor — reps in reserve](https://macrofactor.com/reps-in-reserve/) · [NASM — coaching intensity with RIR](https://www.nasm.org/resource-center/blog/training/reps-in-reserve-coaching-intensity-with-rir)
- [arXiv 2512.11854 — Rep Smarter, Not Harder](https://arxiv.org/html/2512.11854) · [LiftRight (NSF PAR)](https://par.nsf.gov/servlets/purl/10189179)

**Strength curves and band resistance**
- [Booty Builder — Load Curves Explained](https://bootybuilder.com/anatomy/load-curves-explained/)
- [RDL Fitness — Understanding Strength Curves](https://www.rdlfitness.com/blog/understanding-strength-curves)
- [NeuForm — strength curves & resistance profiles](https://www.neuform-fitness.com/blog-posts/strength-curves-matching-resistance-to-muscle-mechanics)
- [Vitruve — accommodating resistance: bands and chains](https://vitruve.fit/blog/accommodating-resistance-training-bands-and-chains-in-vbt/)

**X3 protocol**
- [Jaquish Biomedical — X3 12-week program FAQ](https://support.jaquishbiomedical.com/en-US/articles/x3-12-week-program-173008)
- [BarBend — X3 Bar review](https://barbend.com/x3-bar-review/)
- [Alibaba Wellness — X3 bar guide](https://wellness.alibaba.com/fitlife/x3-bar-guide-resistance-band-training-explained)

**Streaks, gamification, behaviour change**
- [UX Magazine — the psychology of hot streak game design](https://uxmag.com/articles/the-psychology-of-hot-streak-game-design-how-to-keep-players-coming-back-every-day-without-shame)
- [Yu-kai Chou — mastering streak design](https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/)
- [Digia — Duolingo's habit-forming reminders](https://www.digia.tech/post/duolingo-habit-forming-reminders-retention-architecture/)
- [Apptitude — how Duolingo's streak mechanic works](https://apptitude.io/blog/how-duolingos-streak-mechanic-actually-works/)
- [Frontiers in Psychology — motivation crowding in gamified fitness apps](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1286463/full)
- [Apps That Motivate: a taxonomy of app features based on SDT](https://www.sciencedirect.com/science/article/pii/S1071581920300513)
- [UX Planet — why confetti celebrations backfire](https://uxplanet.org/why-confetti-celebrations-backfire-and-how-to-make-them-work-be838a6e7b8b)
- [TechRadar — wearables, anxiety and obsession](https://www.techradar.com/health-fitness/smartwatches/my-apple-watch-is-going-to-hate-this-our-wearables-are-making-us-anxious-and-obsessive-heres-what-we-can-all-do-about-it)
- [Ash Furrow — 2021: my year of closed rings](https://ashfurrow.com/blog/2021-my-year-of-closed-rings/)
- [Body Insights — why Apple Watch rest days feel so hard](https://bodyinsightsapp.com/blog/apple-watch-rest-day)

**TV / 10-foot interface**
- [Android Developers — TV layouts](https://developer.android.com/design/ui/tv/guides/styles/layouts)
- [BPXL Craft — getting started with the Apple TV HIG](https://medium.com/bpxl-craft/getting-started-with-apple-tv-human-interface-guidelines-4d991737ddec)
- [Wikipedia — 10-foot user interface](https://en.wikipedia.org/wiki/10-foot_user_interface)
- [Spyro-soft — 8 UX/UI best practices for TV apps](https://spyro-soft.com/blog/media-and-entertainment/8-ux-ui-best-practices-for-designing-user-friendly-tv-apps)
- [UXmatters — designing a fitness platform](https://www.uxmatters.com/mt/archives/2025/07/designing-a-fitness-platform-ux-design-challenges-and-solutions.php)

---

## Fetch failures (for anyone re-running this research)

These returned 401/403/404 and their content is summarised only from search snippets, so claims
sourced to them carry `[REPORTED]`: WHOOP support articles (401, auth-gated), Peloton support metrics
article (401), Apple HIG workouts and activity-rings pages (returned title only), Medium-hosted UX
Planet and UX Collective articles (403), Wareable Apple Fitness+ review (403), Tom's Guide Tempo
review (truncated), Adam Preiser Tempo review (404), the LiftRight PDF (binary, did not parse).
