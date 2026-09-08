# X3 Bands and the X3 Force Bar — Reference Knowledge Base

**Compiled:** 2026-09-07 from public sources.
**Purpose:** durable reference for building an X3 training app. Written so that another agent can
rely on it without re-researching, and can tell at a glance what is a manufacturer figure, what is a
third-party measurement, what is user anecdote, and what is inference.

---

## 0. How to read this document — evidence tiers

Every substantive claim below is tagged with one of these:

| Tag | Meaning |
|---|---|
| **[MFR]** | Published by Jaquish Biomedical (X3's maker) on their own site or support portal. Authoritative for what X3 *claims*, not necessarily physically verified. |
| **[3P-MEAS]** | Third-party *measurement* — peer-reviewed studies or vendors publishing load-cell data. Not X3 bands unless stated. |
| **[3P-REV]** | Third-party review/journalism. Secondhand; often repeats MFR figures imperfectly. |
| **[USER]** | User anecdote from forums, review comments, long-form user logs. Individual experience. |
| **[DERIVED]** | My own reasoning from the figures above. **Not measured. Must be validated before shipping numbers based on it.** |
| **[UNKNOWN]** | Explicitly not established by any source found. Do not fill these in by guessing. |

**Non-negotiable rule for anyone building on this file:** do not convert a `[DERIVED]` or
`[UNKNOWN]` item into a hard number in product code without measuring it. Several of the most
commercially tempting numbers in this space (force at a given bar height, percent-of-max within a
rep) fall into exactly those buckets.

---

## 1. Product family map

Understanding which product is which prevents a lot of confusion, because the bands are shared
across all of them and the force sensing is not.

| Product | What it is | Price (observed Sep 2026, USD) | Source |
|---|---|---|---|
| **X3 Elite Home Gym** | Bar + ground plate + 4 standard bands + programs. **No electronics.** | $549 | [MFR] |
| **X3 Force Bar** | Same form factor as the Elite bar, plus a built-in load sensor and Bluetooth. Sold as an upgrade for existing X3 owners; ships with the X3 Squat Belt and a 1-month Force Premium trial. | $499 | [MFR] |
| **X3 Force Smart Gym** | Full system built around the Force bar. | ~$949 | [3P-REV] (BarBend) |
| **Standard X3 bands** | Layered natural latex loops. White / Light Grey / Dark Grey / Black, plus Elite and Ultra Light sold separately. | see §2 | [MFR] |
| **X3 Performance Bands (ParaForce, Gen 2)** | Proprietary non-latex compound, "more aggressive" force curve, stackable. | $149.99 (4-band set) | [MFR] |
| **X3 Short Band Set** | Same widths/thicknesses, **34 in** loop instead of 41 in. | $109.99 | [MFR] |

**Distribution:** the X3 Force is **not certified for distribution outside the USA** [MFR]. The Force
Bar product page states availability within the USA only. This matters if the app has international
users — they may own an Elite bar and no sensor at all.

### 1.1 Bar and plate physical specs [MFR]

- **Bar:** 21.5 in long, 1.25 in diameter, 4 lb (≈55 cm × 3.2 cm, 1.8 kg). Anodised aluminium with a
  steel centre shaft on the Elite; the Force bar is described as American steel and aluminium,
  engineered and assembled in California.
- **Ground plate:** 10 × 19 × 1 in, 7 lb (≈25.4 × 48.3 × 2.5 cm, 3.2 kg). Has a band channel; users
  are told to centre their weight over the middle of the channel.
- **Bar length rationale [MFR]:** X3 says the short bar length is deliberate — a longer bar would
  make the exercises easier without improving stimulus. Relevant because bar length constrains the
  band's geometry.
- **Hooks:** the bands loop over hooks at each end of the bar. The Force bar's sensor sits in the
  load path of those hooks (see §6).

---

## 2. The band set — published resistance figures

### 2.1 The headline table [MFR]

Source: Jaquish Biomedical support, *"What are the weight equivalent of X3 resistance bands?"*

| Band | Single loop (lb) | Single loop (kg) | Doubled over (lb) | Doubled over (kg) |
|---|---|---|---|---|
| **White** | 10–50+ | 4.5–23+ | 100+ | 45+ |
| **Light Grey** | 25–80+ | 11–36+ | 160+ | 72+ |
| **Dark Grey** | 50–120+ | 23–54+ | 240+ | 109+ |
| **Black** | 60–150+ | 27–68+ | 300+ | 136+ |
| **Elite** (sold separately) | 110–300+ | 50–136+ | 600+ | 272+ |
| **Ultra Light** | [UNKNOWN] — X3 sells it as "one step below White" but publishes no numbers | — | — | — |

**Three things X3 itself says about these numbers, which the app must respect:**

1. **They are a range because the band is elastic.** The upper figure represents the maximum
   potential at the **end range of movement only** — not an average, not what you feel at the
   bottom. [MFR]
2. **They vary with the user.** X3 states resistance forces vary depending on your height and the
   exercise, because the band stretches more or less. [MFR] This is the single most important
   caveat in this document.
3. **Every top figure carries a "+".** The band can exceed the stated number if stretched further.
   The range is not bounded above by 50/80/120/150/300. [MFR]

X3's own framing, paraphrased: the weight-equivalent number is not the point; results matter more
than the number you can quote. [MFR]

### 2.2 Band dimensions [MFR]

Source: Jaquish Biomedical support, *"What are the dimensions of the standard X3 resistance bands?"*
Cross-checked against the metric figures on the X3 Australia specifications page — the two agree.

| Band | Width (in) | Width (cm) | Thickness | Loop length |
|---|---|---|---|---|
| White | 7/8 (0.875) | 2.2 | 7/32 in (0.56 cm) | 41 in (104 cm) |
| Light Grey | 1 1/8 (1.125) | 2.9 | 7/32 in | 41 in |
| Dark Grey | 1 13/16 (1.8125) | 4.6 | 7/32 in | 41 in |
| Black | 2 1/2 (2.500) | 6.4 | 7/32 in | 41 in |
| Elite | 3 3/8 (3.375) | 8.6 | 7/32 in | 41 in |

**This is the most useful engineering fact in the whole document:** *every band is the same length
and the same thickness. Only the width changes.* Resistance level is purely a function of
cross-sectional area. That means the *shape* of the force-vs-stretch curve should be nearly
identical across colours, and the colours should differ mostly by a scale factor.

**Construction [MFR]:** X3 describes the standard bands as built from 15 layers of natural latex,
which they credit for the ability to hold very high forces without snapping. The Elite band's colour
is listed as orange in the dimensions article and black on the current product page — cosmetic
variation across product generations, not a spec conflict worth resolving.

### 2.3 Derived: the published numbers are not internally consistent [DERIVED]

Cross-sectional area per strand = width × thickness:

| Band | Area (in²) | Area ratio vs White | Published *min* ratio | Published *max* ratio |
|---|---|---|---|---|
| White | 0.191 | 1.00× | 1.0× (10 lb) | 1.0× (50 lb) |
| Light Grey | 0.246 | 1.29× | 2.5× (25 lb) | 1.6× (80 lb) |
| Dark Grey | 0.396 | 2.07× | 5.0× (50 lb) | 2.4× (120 lb) |
| Black | 0.547 | 2.86× | 6.0× (60 lb) | 3.0× (150 lb) |
| Elite | 0.738 | 3.86× | 11.0× (110 lb) | 6.0× (300 lb) |

For a linear-elastic material at a fixed elongation, force should scale with cross-sectional area.
It doesn't here. The Elite band is 3.86× White's area but is published at 6× the max and 11× the
min.

**Interpretation [DERIVED]:** the published min and max are almost certainly *not* measurements
taken at two fixed elongations across all bands. They read more like marketing-rounded envelopes —
plausibly "force at a typical bottom position" and "force at a typical end range" for some assumed
user and some assumed exercise, with different assumptions per band. **Conclusion: do not build a
force model by interpolating between the published min and max.** They are not two points on a
single well-defined curve.

### 2.4 Conflicting figures in the wild — a warning list

Third-party sites repeat X3's numbers badly. Recorded here so the app team recognises bad data:

| Source | What it says | Problem |
|---|---|---|
| Garage Gym Reviews [3P-REV] | "White 10–100 lb, Light gray 25–160, Dark gray 50–240, Black 60–300, Elite 110–600" | Mixes the **single-loop minimum** with the **doubled-over maximum**. These are not one range. |
| Smart Fitness Geek [3P-REV] | lightest band "15–50 lb" | Contradicts X3's current 10–50+. Likely an older spec or a transcription error. |
| X3 Elite Band product page [MFR] | "110–600+ lbs of peak force" | Conflicts with X3's own support article (110–300+ single, 600+ doubled). The product page collapses two configurations into one range. |
| A syndicated "X3 resistance band levels" SEO article | describes a **yellow** band and a black band at "140 lb at 100% elongation" | **X3 has no yellow band.** This page is generic resistance-band content mislabelled as X3, and the URL 404s when fetched directly. **Do not use.** |

**Rule for the app:** treat the Jaquish Biomedical support portal as the only authority for band
numbers, and treat the single-loop and doubled-over figures as separate configurations that must
never be merged into one range.

### 2.5 Prices of individual bands [MFR], observed Sep 2026

White $21 · Light Grey $25 · Dark Grey $31 · Black $38 · 4-Band Set $115 · Elite $99.99 ·
Ultra Light $19.99 · Short Band Set (34 in) $109.99 · Performance Gen 2 set $149.99 ·
Performance Elite $99.99 · Short Performance Bands $139.99.

Replacement bands are sold to existing X3 customers only [MFR]. Expected lifespan is stated as about
7 years before tension loss warrants replacement, versus ~3 years for typical high-resistance bands
[MFR] — an unverified manufacturer claim. Surface cosmetic latex damage is described as normal.
[USER] reports of visible wear within weeks and of the ground plate fraying bands exist; X3 replaced
bands under warranty in those reports.

---

## 3. Force versus stretch — why it is not linear, and what that costs you

### 3.1 The physics, stated plainly

A latex band is not a spring. Hooke's law (F = kx, force proportional to extension) is a
*first approximation that fails* over the extension range X3 actually uses.

The genuine stress–strain curve of natural rubber is **S-shaped (sigmoidal)** [3P-MEAS]:

1. **Toe / initial region** — steep. Force climbs quickly off zero as slack is taken up and the
   polymer network first loads.
2. **Plateau / softening region** — the differential modulus *decreases*. The curve flattens: each
   additional inch of stretch adds *less* force than the inch before. This is the counter-intuitive
   part, and it dominates the middle of the range.
3. **Strain-stiffening upturn** — the differential modulus rises again past a knee point. In natural
   rubber this is attributed to **strain-induced crystallisation**, first observed by X-ray
   diffraction in 1925; reported onsets vary in the literature from roughly 200% to 400% strain at
   room temperature. Past this knee, force climbs steeply.

So the honest one-line answer to "does resistance rise with stretch?" is: **yes, monotonically, but
the *rate* at which it rises is not constant — it falls through the middle of the range and then
rises sharply near the top.**

Secondary effects that also matter in practice [3P-MEAS]:
- **Hysteresis.** The force on the way down (eccentric) is lower than the force at the same length
  on the way up. Rubber loses energy per cycle, largely explained by strain-induced crystallisation.
  A rep is therefore a *loop*, not a line — the app should not assume the eccentric mirrors the
  concentric.
- **Rate sensitivity / viscoelasticity.** Latex is not purely elastic; force depends somewhat on how
  fast you stretch it and on load duration. Faster reps read slightly higher.
- **Set / preconditioning (Mullins effect).** The first reps of a fresh band read differently from
  later ones. Bands also permanently lose tension over years.
- **Temperature.** Rubber modulus is temperature dependent. A cold garage band is not the same band
  as a warm one. Magnitude for X3 bands specifically: [UNKNOWN].

### 3.2 What the published measurement data actually shows — and a genuine conflict

There are two published pictures, and they do not agree. **Both are recorded here because resolving
them requires measuring X3 bands directly, which nobody appears to have published.**

**Picture A — sub-linear over the mid range.** A peer-reviewed study of Thera-Band elastic bands
(PMC4868225) [3P-MEAS] measured tension at 25% increments up to 250% elongation. The authors fit
linear regressions and report high r² (roughly 0.95–0.99), and the paper's own framing is that the
relationship is strongly linear. But the tabulated values are visibly **concave-down**. For example
their yellow band: ~0.48 kgf at 25% elongation, 0.83 at 50%, 1.17 at 100%, 1.69 at 200%, 1.98 at
250%. Force roughly quadruples over a 10× increase in elongation. Per unit of additional stretch,
force is *decelerating*, not accelerating, across that entire window.

**Picture B — accelerating at high stretch.** Band vendors and general rubber mechanics describe the
opposite at the top end. Serious Steel Fitness [3P-MEAS, vendor] states plainly that band force
increases disproportionately with length and that the curve often follows a quadratic or exponential
pattern rather than a straight line, warning that real resistance at high stretch can reach two to
three times the stated tension. The band-mechanics literature likewise notes that a linear model
overestimates tension below ~50% elongation and underestimates it above ~200%, where the curve
steepens markedly.

**Reconciliation [DERIVED]:** these are not necessarily contradictory — they are describing
different segments of the same S-curve. Thera-Band flat sheets tested to 250% may sit largely in the
plateau region; heavy loop bands driven past their knee point sit in the stiffening region. **X3's
usage spans both.** A deadlift stays low on the curve; an overhead press goes very high on it
(see §4).

**X3's own characterisation [MFR]:** X3 describes its standard bands as having an *exponential*
force curve, and describes the ParaForce/Performance bands as having a *steeper* force curve than
standard latex — lighter at the bottom of the movement and heavier at the top. Note this is a
marketing description, not published data, and it sits on the Picture-B side.

### 3.3 Band-to-band manufacturing variability [3P-MEAS]

A study of rubber-based bands across four distributors (PMC6358948) stretched bands from a 100 cm
resting length to 200 cm in 5 cm increments under a load cell. Findings relevant here:

- Statistically significant differences in mean resistance existed between distributors for
  nominally identical band thicknesses, with variability spanning roughly **−37% to +16%**.
- Representative values at 100% elongation: 0.635 cm-wide bands 3.8–4.6 kg; 6.35 cm-wide bands
  40.9–44.6 kg; 10.16 cm-wide bands 95.9–106.7 kg.

Two implications:
1. **Nominal band ratings are not precise instruments.** A ±20–35% spread between supposedly
   identical bands is normal in this product category. X3's Gen 2 Performance bands are marketed as
   using a new process that *reduces* variation between bands [MFR] — an implicit acknowledgement
   that variation exists.
2. **Rough cross-check on X3 [DERIVED]:** X3's Black band is 6.4 cm wide, matching the study's
   6.35 cm class, which measured ~41–45 kg (≈90–98 lb) at 100% elongation. X3 publishes Black at
   27–68+ kg single loop. Same order of magnitude, so X3's figures are not absurd — but the study's
   bands are thinner than X3's 5.6 mm and the loop-vs-strand geometry differs, so this is a sanity
   check only, **not a calibration**.

### 3.4 What this means for "percent of max" during a rep

This is the crux for any app that wants to show a live intensity bar.

**The naive approach is wrong.** Taking the published max (say 150 lb for Black), reading live force
from the sensor, and dividing, will produce a meaningless number:

- The published max is an end-range figure for *some* assumed geometry, not this user's. A 5'4" user
  and a 6'4" user reach completely different elongations at the same exercise. X3 says this
  explicitly. [MFR]
- The published max has a "+". It can be exceeded, so the "percentage" can exceed 100%.
- The published min/max pair is not two points on one curve (§2.3).
- Force at the bottom of some movements is effectively **zero**, not the published minimum, because
  the band is slack (§4.2). A percentage scale anchored at the published min will be wrong at the
  bottom of every rep.
- Hysteresis means the same bar position yields two different forces depending on direction, so
  "percent of max" is not a function of position alone.

**Approaches that actually work, in increasing order of quality:**

1. **Normalise to the observed peak within the current set.** `pct = F_now / F_peak_this_set`. Robust,
   requires no model, self-calibrates to the user's geometry and band. Weakness: the first rep has no
   reference — either back-fill after rep 1 or use the previous session's peak for that exercise.
2. **Normalise to a rolling per-exercise, per-band personal best.** Same as above but the reference
   is the user's recent history for that exercise/band pair. Gives cross-session comparability, which
   is what people actually want to see. Handles the "+"-above-max problem naturally.
3. **Per-user, per-exercise calibrated force-vs-position model.** Requires a position signal the
   Force bar does not provide (see §6.4). Only viable if you add your own motion sensing.

**Recommendation:** ship (1) and (2). Present the number as *"percent of your best on this
movement"*, never as *"percent of the band's rating"*. It is both more honest and more motivating.

**Note that X3 itself is doing something similar under the hood.** X3 states its calibration works by
comparing the raw load-sensor data against the force the white band is *estimated* to produce for a
user of that height [MFR]. So even X3's displayed force is a model-derived estimate anchored to a
height assumption — not an absolute, traceable measurement. Any app displaying X3 Force numbers
inherits that model's assumptions.

---

## 4. Force at a given bar height — geometry, and what is actually published

The task brief asked specifically for published guidance on how much force a given band produces at
a given bar height. **Direct answer: X3 publishes no such table.** [UNKNOWN]

What exists is described below.

### 4.1 What X3 does publish [MFR]

- Resistance varies with **your height** and **the exercise**, because the band stretches more or
  less.
- The published maximum figure is the value **at the end range of movement**.
- The app asks for your height precisely so it can calibrate the load sensor against an estimated
  band force for someone of that height.
- Short users are served by the **34-inch Short Band Set** (same widths and thicknesses as the 41-inch
  standard set), explicitly for smaller frames and shorter ranges of motion.
- The **Ultra Light band** is recommended for beginners and specifically for **overhead movements**,
  where a lighter starting point makes sense.

Those last two are, in effect, X3 admitting the geometry problem: for a fixed band, force at a given
bar height depends on the band's free length, so they sell a shorter band for shorter people and a
weaker band for the highest-reaching movement.

### 4.2 The nearest thing to published force-vs-bar-height data [3P-MEAS, not X3]

Serious Steel Fitness publishes an illustrative scale-measured example for a **32-inch loop band
(their "Red #2")** anchored under the feet, which is the same topology as an X3 deadlift:

| Bar position | Single layer | Doubled |
|---|---|---|
| Mid-shin | ~0 lb | ~15 lb |
| Knee height | ~8 lb | ~80 lb |
| Top / lockout | ~20 lb | ~143 lb |

**This is the shape of the thing, and it is dramatic.** Force at mid-shin is essentially zero — the
band is slack. Between knee and lockout, single-layer force more than doubles; doubled, it nearly
doubles again from an already high base. Serious Steel explicitly calls these baseline estimates
only and warns actual values can run 2–3× stated tension.

**This is a different band from a different manufacturer.** Use it for *shape and mechanism*, never
for X3 numbers.

### 4.3 The geometric model [DERIVED] — the thing to actually measure

The band is a closed loop threaded through the ground plate channel and hooked over both ends of the
bar. Idealised as two parallel strands:

- Loop circumference **L_loop = 41 in** (or 34 in for short bands).
- Some length is consumed wrapping the plate and the two hooks. Call it **L_wrap**.
- **Free span at zero tension: L₀ = (L_loop − L_wrap) / 2.** For a 41-inch loop, `L_wrap` is
  plausibly 5–7 in, giving **L₀ ≈ 17–18 in**. *This number is an estimate and must be measured on
  real hardware.*
- Elongation at bar height *h* above the plate: **ε = (h − L₀) / L₀**, and **force is zero whenever
  h ≤ L₀** — the band is slack.

Rough elongations this implies (taking L₀ = 18 in, a ~5'10" user, heights above the plate).
**Every figure in this table is `[DERIVED]` and unvalidated. It is here to explain a mechanism, not
to be shipped as data.**

| Movement / position | Approx. bar or hook height | Approx. elongation |
|---|---|---|
| Deadlift, bar at mid-shin | ~10 in | **slack — no force** |
| Deadlift, bar at knee | ~20 in | ~10% |
| Deadlift lockout, bar at hip | ~34 in | ~90% |
| Bicep curl, bottom | ~30 in | ~65% |
| Bicep curl, top | ~48 in | ~165% |
| Front/split squat, bottom | ~40 in | ~120% |
| Front/split squat, top | ~58 in | ~220% |
| Chest press, at chest | ~48 in | ~165% |
| Overhead press, at shoulders | ~57 in | ~215% |
| **Overhead press, lockout** | ~85 in | **~370%** |

### 4.4 Why this explains the band-selection pattern [DERIVED]

The brief asked why deadlift takes the heaviest band and overhead press a much lighter one. The
geometry gives a clean, self-consistent explanation, and **two effects compound in the same
direction**:

- **Deadlift** has the *shortest* band path in the whole program. Even at lockout it only reaches
  roughly 90% elongation — low on the force curve. It is also driven by the hips and legs, the
  body's strongest muscles. Weak band force + strong muscles → you need the heaviest band available.
- **Overhead press** has by far the *longest* band path — potentially 350%+ elongation at lockout,
  which is up in the strain-stiffening region where force climbs steeply. It is also driven by the
  deltoids, among the weakest prime movers trained. Enormous band force + weak muscles → you need a
  much lighter band, and X3 sells an Ultra Light band explicitly for overhead work.

This also predicts, correctly, that **shorter users get less force from the same band at the same
exercise**, and that is exactly what users report (§5.3).

**Caveats on the model:** it ignores the horizontal offset between the feet and the bar (real band
paths are diagonal, not vertical), ignores stance width, ignores extra wraps around the hooks, and
ignores the plate's band channel geometry. All of these change the effective L₀. Treat §4.3 as a
hypothesis to test with a load cell, not a lookup table.

---

## 5. Which bands are used for which movements

### 5.1 Manufacturer guidance [MFR]

X3 deliberately gives **no per-exercise band table**. Their protocol is rep-count driven:

- **Start with the lightest band for every exercise.**
- Perform **one set of 15–40 complete reps** to exhaustion, then as many partial reps as possible.
- **Move up a band** when you can complete 40 slow, controlled reps with good form.
- **Move down a band** if you cannot complete 15.
- **Tempo:** 2–3 seconds up, 2–3 seconds down.
- **Never let the band go slack** at the bottom of a movement — maintain constant tension.
- Move to the Elite band only after 40 controlled reps with the Black band.
- Rationale for the 15-rep floor: safety. X3's stated reasoning is that if you cannot do 15 reps you
  are under a load you cannot safely bail out of.
- Rationale for the 40-rep ceiling: X3 argues that using a heavier band for fewer reps is
  counterproductive and undermines the point of variable resistance.
- Band alignment: midfoot for most exercises, ball of the foot for calf raises.

The eight-to-ten standard movements are: chest press, pec crossover / crossover, overhead press,
upright row, tricep press, bicep curl, bent row, front squat (or split squat), calf raise, deadlift.

**Consequence for the app:** the correct band for a movement is *defined* as the one that lands the
user in 15–40 reps. An app should recommend bands by inverting the user's own rep history, not by a
static exercise→band map.

### 5.2 A documented 12-week user progression [USER]

The most concrete published per-exercise progression found — a reviewer's 12-week log
(exfatloss.com). Started on **White for every exercise**:

| Week | Exercise | Moved to |
|---|---|---|
| 2 | Chest press | Light Grey |
| 2 | Calf raises | Light Grey |
| 3 | Triceps press | Light Grey |
| 7 | Chest press | Dark Grey |
| 7 | Calf raises | Dark Grey |
| 9 | Triceps press | Dark Grey |
| 9 | Deadlift | Light Grey |

Notable: after 12 weeks this user had **not reached the Black band on any exercise**, and concluded
the four included bands would last a long while. They also explicitly noted that overhead press
demands an extreme range of motion compared with chest press — an independent observation matching
the geometry in §4.4.

**Do not over-generalise from n=1.** This is one person's log, and their deadlift progressed *slower*
than their pressing, which runs against the usual pattern.

### 5.3 Other user reports [USER]

- **Short users struggle on deadlift and squat.** Commenters on the Joe Cannon review in the roughly
  5'3"–5'8" range report difficulty getting full range of motion on deadlifts and squats, and resort
  to workarounds — spacers, or shorter third-party bands. This is the geometry problem in §4.4 made
  concrete. X3's own Short Band Set is the sanctioned fix.
- **Bicep curls are the weak point of the protocol.** A StrongFirst forum user called curls the least
  effective part of the program and worked around it by doubling bands and curling from a kneeling
  position to raise tension at the top of the movement.
- **Deadlift and split squat are the most systemically taxing.** A StrongFirst user described
  collapsing to the floor after sets of split squats and deadlifts, and taking a full five minutes'
  rest after deadlifts.
- **Advice to go heavy within the rep window.** Same user's heuristic: use the biggest band you can
  while still landing in roughly 20–50 reps / 30–90 seconds of work.
- **Band tension at the bottom is the recurring complaint.** Multiple users and reviewers converge on
  this: bands overload the top of an ascending-strength-curve movement well, and load the bottom
  poorly. One StrongFirst user noted people training only with bands struggled to transfer strength
  to bottom-position movements like push-up variations.
- **Force ramps regardless of speed.** A user observation worth noting for rep detection: with bands
  you can accelerate into the rep as hard as you like and the resistance still ramps steadily, so
  the usual force/velocity relationship does not apply the way it does with a barbell.
- **Jaquish's own anecdote [MFR/marketing]:** he states he uses the Elite band for chest press and
  produces about **540 lb of peak resistance**. Cited here as a manufacturer claim about an
  individual, not as a spec.

### 5.4 The critical view on X3's strength-curve argument [3P-REV]

Worth carrying in the knowledge base so the app does not parrot marketing.

- **X3's claim:** the body is far stronger at end range than in the stretched position, so band
  resistance that rises with stretch matches the natural strength curve. X3's support material puts
  it as people being seven times stronger than they think in the strong range.
- **Counter-argument (Outlift):** band resistance is *lowest* at long muscle lengths and *highest* at
  short muscle lengths — which is backwards for hypertrophy, since a systematic review of 26 studies
  found training at longer muscle lengths stimulates substantially more growth. They also note that
  a meta-analysis favouring accommodating resistance was retracted, and that the benefit disappeared
  once errors were corrected.
- **Counter-argument (StrongFirst):** bands suit ascending-strength-curve exercises because they
  overload the top, but are ineffective at loading the bottom of those same movements.
- **Counter-argument (Joe Cannon review comments):** muscles are arguably strongest in the elongated
  position, roughly the first 30–40% of the rep, due to actin–myosin filament overlap — the opposite
  of X3's premise.
- **Whether X3 outperforms free weights for hypertrophy: [UNKNOWN].** Multiple reviewers state no
  peer-reviewed evidence supports the superiority claim.

**Product implication:** an X3 app is on solid ground measuring and motivating. It is on shaky ground
if it repeats the "7× stronger" or "better than weights" claims as fact.

---

## 6. The X3 Force bar — hardware

### 6.1 What it measures [MFR]

- There is a **load sensor in the bar**.
- It measures **the direct downward force the bands apply to the hooks at the ends of the bar**.
- It therefore measures **band tension at the bar**, not muscle force, not joint torque, not work,
  not power. Everything else the app shows is derived from this one scalar over time.

### 6.2 Calibration and taring [MFR]

- **Calibration** must be done with the **original white band only** — not the white Performance /
  ParaForce band.
- **Your height is required** for calibration. X3's stated method: compare raw load-sensor data
  against the force the white band is *estimated* to produce for a person of that height.
- The app defaults calibration to **Split Squats**, specifically to keep the shoulders off the hooks.
- Calibrate **without** the GHAccelerator accessory attached, even if you use one.
- Calibrate once per device; the data saves automatically.
- **Custom exercises cannot be calibrated.**
- **Taring:** connect the bar, rest it on its hooks on a flat level surface, then select "trigger
  tare" from the settings menu. The app expects a correct tare at session start, and displays a
  resting force reading you can use to verify it.

**Engineering read [DERIVED]:** this is a single-point, height-parameterised calibration of a load
cell against a *modelled* band force. It anchors the scale factor; it does not make the readings
metrologically traceable. Absolute accuracy is [UNKNOWN] — no accuracy specification, tolerance, or
sample rate is published anywhere found.

### 6.3 Documented sources of bad readings [MFR]

X3 is unusually candid about this. The sensor responds to downward force on the hooks, so anything
loading the hooks laterally corrupts the reading:

| Cause | Effect | X3's stated fix |
|---|---|---|
| **Shoulders pressed against the hooks** (front squat, standard squat) | Erratic, potentially wildly inaccurate readings | Use **split squats with the X3 Squat Belt** instead |
| **Wrists pressed against the hooks** (overhead press) | Erratic, potentially wildly inaccurate readings | Adjust hand position |
| **Band shorteners** | Inward pressure on the hooks, perpendicular to the measurement axis — readings become wildly inaccurate | Wrap the band extra times around the hooks, or buy the 34-inch short bands |
| **Bad tare** | Whole-session offset | Re-tare on a flat surface |

**This is a major product-design input.** An app cannot assume all exercises are equally trustworthy.
Front squat in particular is effectively an unsupported measurement mode — X3 replaced it with split
squat rather than fix it.

### 6.4 What the bar does *not* have

- **No screen.** Force is displayed only in the phone/tablet app. The bar's only output is an LED.
  [MFR]
- **No position, displacement, or velocity sensing** documented anywhere. [UNKNOWN — but note the
  bar cannot report bar height, so any "percent of range of motion" feature must be inferred from the
  force signal itself or added by other means.]
- **No published maximum measurable force.** The bands go to 600+ lb doubled and X3 markets a
  "10–600 pound" capacity for the system, so the sensor presumably covers that, but no sensor range
  or overload rating is published. [UNKNOWN]

### 6.5 Bluetooth behaviour [MFR]

- Connects wirelessly to the X3 Force app. Bluetooth permission must be granted on the phone.
- **Pairing:** enable phone Bluetooth → power on the bar → press the connect button in the **top left
  corner** of the app screen.
- **Confirmation:** both the app's connect icon and the bar's LED turn **blue**.
- **Connection troubleshooting sequence:** toggle phone Bluetooth off/on → force-close and relaunch
  the app → restart the bar. If that fails: update the app, then remove and reset the app's Bluetooth
  permissions.
- **Hard reset:** hold the power button for **at least 15 seconds** while the bar is plugged into
  power. X3 says this resolves almost all won't-turn-on cases.
- **Firmware update:** plug the bar in, then choose "Update Firmware" from the app's settings page.
  App must be up to date first.
- **Bluetooth version, GATT services/characteristics, advertised name, packet format, sample rate:
  [UNKNOWN].** See §8.

### 6.6 Battery and LED [MFR]

- **Battery life:** several weeks, *if* the bar is powered on only during workouts and off between
  them. No mAh capacity or runtime-hours figure is published.
- **Chemistry:** Lithium Polymer, with an explicit fire/explosion safety warning — do not store near
  heat or open flame, do not charge unattended.
- **Charging:** via a port on the bar. **Cable/connector type, charge duration, and any auto
  power-off or sleep timer: [UNKNOWN]** — X3's own troubleshooting article declines to specify them.

**LED colour map (worth mirroring in any companion UI):**

| LED | Meaning |
|---|---|
| **White** | On, ready to connect |
| **Blue** | Successfully connected to the app |
| **Green** | Fully charged (safe to unplug) |
| **Yellow / orange, pulsing** | Plugged in and charging |
| **Yellow / orange** | Low battery |

Note the yellow/orange overload: pulsing means charging, steady means low battery. Easy to confuse.

### 6.7 Accessory compatibility [MFR]

- **GHAccelerator** — compatible; calibrate without it.
- **X3 Squat Belt** — required for split squats; bundled with the Force Bar.
- **Band shorteners** — incompatible with accurate measurement (§6.3).
- **Original X3 bands cannot be stacked.** ParaForce/Performance bands can.
- **Non-X3 bands cannot be added to tracking.**

---

## 7. The X3 Force app — what it shows, and how well

Platforms: iOS (App Store, id 1571190223, developer Jaquish Biomedical Corporation, requires iOS
15.0+, ~25 MB, age rating 9+) and Android (Google Play, `com.jbc.x3f`).

### 7.1 Metrics it presents [MFR]

| Metric | Notes |
|---|---|
| **Peak force** | Maximum force during a rep / for every exercise. The headline number. |
| **Average force** | Mean across reps. Added relatively recently in response to user requests. |
| **Real-time force curve** | Live force trace via Bluetooth, described as reacting to your reps live. |
| **Rep count** | Shown in the **top-right corner** of the exercise screen. |
| **Rep consistency** | How uniform reps are. |
| **Time under variable tension** | X3's phrasing for TUT. |
| **Workout duration** | Per session. |
| **Total Force** | The composite score. See below. |
| **Highest / average force over date ranges** | Week, month, year, all-time aggregates. |
| **Heart rate** | Via Apple Watch / HealthKit. |

**So: yes to peak, yes to average, yes to reps, yes to time under tension.** All four requested
metrics are present.

**Total Force [MFR]:** a single composite rating combining **rep cadence, rep count, total time under
tension, and the forces experienced** during the exercise. It is computed after both the eccentric
and concentric portions of each rep complete, which is why it lags slightly and keeps ticking up
briefly after a set ends. **The exact formula is proprietary and unpublished — [UNKNOWN].** Do not
attempt to reproduce it; if you need a composite score, define your own and name it something else.

**Units: [UNKNOWN].** No source found states whether the app displays lbf or kgf, or whether a unit
toggle exists. Given US-only distribution and pounds throughout X3's marketing, **pounds is the
likely default — but this is an assumption, not a confirmed fact.** Verify against the device before
relying on it.

### 7.2 Rep detection [MFR]

- The app **establishes a baseline over roughly the first six reps** of each exercise before it can
  display reliable counts. It is inferring rep boundaries from the force waveform alone (the bar has
  no position sensor).
- Partial reps are counted if they cover most of a full motion.
- Force scores appear with a slight delay after each rep completes.

**Implication [DERIVED]:** rep detection is a force-signal segmentation problem with a warm-up
period. Any competing implementation faces the same constraint, and the first few reps of every set
are inherently the least reliable.

### 7.3 Other features [MFR]

- **Metronome** for cadence consistency (added v2026.4.1) — sensible, given the 2–3s up / 2–3s down
  protocol.
- **Exercise countdown timer** (added v2026.6.2).
- **Apple Watch app, HealthKit, heart rate** (added v2026.5.3).
- **Demo mode** for demonstrating the app without hardware.
- **Virtual personal trainer** — rep-by-rep cadence cues and post-set feedback (Premium).
- Workout history, editing, notes, deletion.

**Release cadence observed:** 1.4.0 (Mar 2023, statistics screen overhaul) → 2026.4.1 → 2026.5.3 →
2026.6.2 → 2026.8.0. Actively maintained, roughly monthly.

### 7.4 Subscription model [MFR]

- **X3 Force Premium: $14.99/month or $164.99/year.** One month free with a Force Bar purchase.
- **Free tier keeps real-time force display** during workouts. That is genuinely the right thing to
  leave unpaywalled.
- **Premium gates:** saved workout history, the virtual trainer, personalised recommendations,
  performance comparison over time.
- **Internet required about monthly**; otherwise usable offline.

### 7.5 What the app does well

1. **Real-time force display is free.** The core sensor value is not held hostage.
2. **Total Force is a genuinely good idea in principle** — a single number that rewards cadence and
   time under tension rather than raw peak encourages the behaviour X3's protocol actually wants
   (slow controlled reps), instead of rewarding a jerky one-rep spike.
3. **The metronome pairs correctly with the protocol.** Cadence is prescribed; giving users a cadence
   tool closes the loop.
4. **Honest about its own failure modes.** The support docs openly document which exercises produce
   bad readings and why. Many hardware vendors would not.
5. **Editable history.** Users can correct rep counts and add notes after the fact.
6. **Platform integration** — HealthKit, Apple Watch, heart rate.
7. **Actively developed** with visible monthly releases.

### 7.6 What the app does badly

1. **Subscription on top of a $499–949 device.** History and trends — the things that make tracking
   worth doing — are behind $14.99/mo. [3P-REV / user sentiment] App Store reviewers have asked for a
   lifetime purchase option.
2. **No multi-user support on one account.** An App Store reviewer specifically asked for this for
   couples sharing a bar. A single bar in a household is the normal case; one profile is a real gap.
3. **Rep counting needs ~6 reps to warm up**, so early reps are unreliable and the count is not
   trustworthy for short sets.
4. **Reps get recorded before you pick an exercise.** A reviewer asked for an on-screen warning when
   the bar detects reps with no exercise selected. Data lands in the wrong place silently.
5. **Editing is coarse.** You can change rep counts and add notes, but **cannot edit individual
   exercise data**.
6. **Custom exercises cannot be calibrated** — so the app's extensibility path produces uncalibrated
   numbers.
7. **Front squat is effectively unsupported for measurement.** The workaround (split squat + squat
   belt) changes the exercise rather than fixing the reading.
8. **Overhead press readings are corrupted by wrist contact with the hooks** — and overhead press is
   a core program movement.
9. **Non-X3 bands and stacked original bands cannot be tracked**, so the data model is closed.
10. **Total Force is opaque.** Users cannot see how it is computed, cannot reproduce it, and cannot
    tell whether a change reflects real progress or a cadence artefact.
11. **The bar has no display**, so the phone must be visible and awake throughout the set — awkward
    for overhead and pressing movements where you are not looking at the floor.
12. **Thin review base.** iOS showed 4.1/5 from about 20 ratings; regional storefronts show "not
    enough ratings to display an overview." Weak quality signal either way — do not over-read it.

**Opportunity summary for a competing/companion app [DERIVED]:** the clearest gaps are multi-user
profiles on one bar, a transparent and reproducible composite score, a display surface that is not a
phone on the floor (a TV is an obvious fit), free/cheap history, and honest per-exercise confidence
indicators that reflect X3's own documented accuracy caveats.

---

## 8. Integration reality check for third-party software

**Findings, stated plainly so nobody re-does this search:**

- **No public API, SDK, developer documentation, or webhook** for X3 Force was found. [UNKNOWN]
- **No published BLE GATT specification** — no service UUIDs, characteristic UUIDs, advertisement
  name, packet layout, endianness, or notification rate. [UNKNOWN]
- **No public reverse-engineering project** (GitHub or otherwise) for the X3 Force bar was found.
  Searches surfaced only unrelated BLE reverse-engineering projects for other devices.
- **No FCC filing details** were located through search; the FCC ID database at fcc.gov would need to
  be queried directly, and the bar's FCC ID would need to be read off the physical device first.
- **No teardown** was found.

**Consequences for the product:**
1. Reading live force from the bar directly is an **unsolved reverse-engineering task**, not an
   integration task. Budget accordingly.
2. There is no documented export path out of the X3 Force app either — no CSV, no HealthKit *write*
   of force data confirmed (HealthKit support is documented, but what it writes is [UNKNOWN]).
3. The bar is **US-only**, so any hardware-dependent feature excludes international users.
4. A meaningful fraction of X3 owners have an **Elite bar with no sensor at all**. Any app should
   degrade gracefully to manual logging (band colour + reps + tempo), which is what X3's own protocol
   actually requires anyway.

**Legal/ethical note:** reverse-engineering a BLE protocol for interoperability is a separate
question from redistributing X3's assets or implying endorsement. Get that reviewed before shipping.

---

## 9. Consolidated open questions

Ranked by how much they block product decisions.

1. **What units does the X3 Force app display, and is there a toggle?** Likely pounds; unconfirmed.
2. **What is the BLE protocol?** Service/characteristic UUIDs, data format, sample rate.
3. **What is the sensor's accuracy, resolution, sample rate, and maximum rated force?**
4. **What is the actual force-vs-elongation curve for each X3 band colour?** Nobody has published a
   load-cell sweep of X3 bands. This is the single highest-value measurement anyone could make in
   this space, and it is cheap to do with a crane scale.
5. **What is L₀** — the real free span of a 41-inch loop once wrapped through the plate and hooks?
6. **Does the curve show the strain-stiffening upturn within X3's usable range**, and at what
   elongation? (Picture A vs Picture B, §3.2.)
7. **What is the Total Force formula?**
8. **What is the Ultra Light band's published resistance?**
9. **Charging connector type, charge time, auto-power-off behaviour.**
10. **What, exactly, does the app write to HealthKit?**
11. **How much do individual X3 bands vary unit-to-unit?** (The wider literature says ±20–35% is
    normal for the category.)
12. **Temperature sensitivity of X3 bands** — relevant for garage-gym users.

---

## 10. Quick-reference card

```
BANDS (single loop, [MFR])          BANDS (doubled, [MFR])
  White        10– 50+ lb             White        100+ lb
  Light Grey   25– 80+ lb             Light Grey   160+ lb
  Dark Grey    50–120+ lb             Dark Grey    240+ lb
  Black        60–150+ lb             Black        300+ lb
  Elite       110–300+ lb             Elite        600+ lb
  Ultra Light  [UNKNOWN]

GEOMETRY [MFR]                       BAR [MFR]
  All bands: 41 in loop, 7/32 in       21.5 in long, 1.25 in dia, 4 lb
  thick. Only WIDTH varies:            Plate: 10 x 19 x 1 in, 7 lb
  0.875 / 1.125 / 1.8125 /             Force bar: load sensor at the hooks,
  2.500 / 3.375 in                     LED only, no screen, LiPo battery
  Short set: 34 in loop

PROTOCOL [MFR]                       LED [MFR]
  1 set, 15-40 reps to failure         White  = ready to connect
  + partials. 2-3s up, 2-3s down.      Blue   = connected
  Up a band at 40 reps.                Green  = fully charged
  Down a band below 15 reps.           Yellow pulsing = charging
  Never let the band go slack.         Yellow steady  = low battery

THE THREE RULES
  1. Published max = END RANGE only, and carries a "+".
  2. Force depends on USER HEIGHT and EXERCISE. Same band != same force.
  3. Never show "% of band rating". Show "% of YOUR best on this movement".
```

---

## 11. Sources

**Manufacturer — Jaquish Biomedical [MFR]**
- Band weight equivalents: https://support.jaquishbiomedical.com/en-US/what-are-the-weight-equivalent-of-x3-resistance-bands-685138
- Band dimensions: https://support.jaquishbiomedical.com/en-US/what-are-the-dimensions-of-the-standard-x3-resistance-bands-685124
- X3 Resistance Band Questions: https://support.jaquishbiomedical.com/en-US/articles/x3-resistance-band-questions-173125
- X3 Force (hardware FAQ): https://support.jaquishbiomedical.com/en-US/articles/x3-force-173275
- X3 Force App FAQ: https://support.jaquishbiomedical.com/en-US/articles/x3-force-app-173351
- Connecting the X3 Force: https://support.jaquishbiomedical.com/en-US/how-do-i-connect-the-x3-force-to-my-phone-685834
- Force troubleshooting: https://support.jaquishbiomedical.com/en-US/what-should-i-do-if-my-x3-force-doesnt-turn-on-charge-or-connect-to-the-app-686356
- Band shorteners with X3 Force: https://support.jaquishbiomedical.com/en-US/can-i-use-band-shorteners-with-x3-force-686082
- Picking a band / rep counts: https://support.jaquishbiomedical.com/en-US/how-do-i-pick-the-right-x3-band-how-many-repetitions-should-i-do-685394
- How to use the X3 Bar Elite: https://support.jaquishbiomedical.com/en-US/how-do-i-use-the-x3-bar-elite-688479
- 12-week program: https://support.jaquishbiomedical.com/en-US/articles/x3-12-week-program-173008
- X3 Product Questions (bar/plate specs): https://support.jaquishbiomedical.com/en-US/articles/x3-product-questions-173006
- X3 bands vs other bands: https://support.jaquishbiomedical.com/en-US/what%E2%80%99s-the-difference-between-the-x3-bands-and-other-resistance-bands-685161
- ParaForce vs original bands: https://support.jaquishbiomedical.com/en-US/how-are-the-x3-performance-(paraforce)-bands-different-than-the-original-x3-bands-689753
- Elite / Force Smart Gym capacity: https://support.jaquishbiomedical.com/en-US/what-capacity-x3-elite-or-x3-force-smart-gym-do-i-need-720271
- X3 Force Bar product page: https://www.jaquishbiomedical.com/products/x3-force-bar
- X3 Force app product page: https://www.jaquishbiomedical.com/products/x3-force-app/
- X3 Elite Home Gym: https://www.jaquishbiomedical.com/products/x3-bar/
- Band collection & prices: https://www.jaquishbiomedical.com/collections/x3-resistance-bands
- Elite Band: https://www.jaquishbiomedical.com/products/x3-elite-band
- Ultra Light Band: https://www.jaquishbiomedical.com/products/x3-ultra-light-band
- Short Band Set (34 in): https://www.jaquishbiomedical.com/products/x3-short-band-set
- Performance Bands Gen 2: https://www.jaquishbiomedical.com/products/x3-4-performance-band-set
- X3 specifications (AU distributor, metric): https://x3bar.com.au/x3-specifications/
- X3 Force on the App Store: https://apps.apple.com/us/app/x3-force/id1571190223
- X3 Force on Google Play: https://play.google.com/store/apps/details?id=com.jbc.x3f

**Third-party measurement / peer-reviewed [3P-MEAS]**
- Thera-Band elastic band tension reference values (force vs % elongation, 25–250%): https://pmc.ncbi.nlm.nih.gov/articles/PMC4868225/
- Loading Patterns of Rubber-Based Resistance Bands across Distributors (load-cell sweep, 100→200 cm; inter-distributor variability): https://pmc.ncbi.nlm.nih.gov/articles/PMC6358948/
- Serious Steel Fitness — band tension by bar height, nonlinearity warning: https://www.serioussteel.com/pages/unlocking-the-power-of-resistance-bands
- Strain-induced crystallisation of natural rubber (real-time WAXD): https://www.sciencedirect.com/science/article/abs/pii/S0032386199007247
- New characteristic of tensile stress–strain properties in rubbers (S-curve, knee point): https://www.sciencedirect.com/science/article/abs/pii/S0142941802001137
- DoITPoMS — S-shaped stress–strain curves: https://www.doitpoms.ac.uk/tlplib/bioelasticity/s-shaped-curves.php
- AGUEDA equations for elastic band prescription (fetch returned 403; cited for completeness): https://onlinelibrary.wiley.com/doi/full/10.1002/pri.70010

**Third-party review [3P-REV]**
- Garage Gym Reviews: https://www.garagegymreviews.com/x3-bar-review
- BarBend: https://barbend.com/x3-bar-review/
- Outlift (critical, strength-curve analysis): https://outlift.com/x3-bar-review/
- Joe Cannon MS (critical, plus useful comment thread): https://joe-cannon.com/x3-bar-review/
- Smart Fitness Geek: https://smartfitnessgeek.com/x3-bar-reviews-x3-bar-results/

**User reports [USER]**
- 12-week X3 log with week-by-week band progression: https://www.exfatloss.com/p/review-12-weeks-of-strength-training
- StrongFirst — reflecting on my experience with the X3 bar: https://www.strongfirst.com/community/threads/reflecting-on-my-experience-with-the-x3-bar.26551/
- StrongFirst — X3 Bar thread: https://www.strongfirst.com/community/threads/x3-bar.22489/
- Comment threads on the Joe Cannon review (short-user range-of-motion reports)

**Sources checked and rejected**
- A syndicated "X3 resistance band levels explained" SEO article describing a *yellow* X3 band and
  per-elongation figures. X3 has no yellow band; the URL 404s on direct fetch. **Rejected as
  fabricated/mislabelled content.**
- reddit.com and old.reddit.com — not fetchable from this environment. r/X3Bar was not reviewed and
  remains an unexplored source of user anecdote.
- elitefts.com long band calibrations page — 404.
- gymless.org X3 review — 403.
