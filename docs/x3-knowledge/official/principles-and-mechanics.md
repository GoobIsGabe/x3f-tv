# X3 principles and mechanics — from the official intro videos

Transcripts of the three videos on `/12-week`: "X3 Home Gym Workout Program: Intro and
Best Practices", "How is X3 different from free weights…", and "Variable Resistance
Training: What's the science behind X3 Bar?".

These contain the **hardest numbers available anywhere** about how X3 force behaves,
and they settle several design questions the app currently guesses at.

---

## 1. The rep model has THREE tiers, not two

Verbatim:

> "In any X3 movement, you move to full extension without lockout until you can no
> longer reach that stronger range. Then you perform partial repetitions **in the mid
> range**. When you've gone to an even higher level of fatigue, you won't be able to
> use the mid range anymore either, so then you just have very short **weak range**
> repetitions. This is absolute fatigue of the musculature, all in one set."

So a set is:

```
  FULL RANGE       15–40 reps, top of the range, no lockout
       ↓  (can no longer reach the strong range)
  MID-RANGE        partial reps in the middle
       ↓  (can no longer reach the middle)
  WEAK-RANGE       very short reps at the bottom
       ↓
  FAILURE          "you can no longer move the bar even an inch"
```

**The app models two tiers** (full reps → partials). Adding the third is the single
highest-value correctness change to the set engine, and it is directly measurable:
the *rep amplitude* falls through two thresholds, not one. It also gives the app three
genuinely different coaching moments and three separate things to celebrate instead of
one generic "partials" counter.

Detection, concretely: track each rep's peak as a fraction of the calibrated span.
- ≥ ~0.85 of the session's established full-rep top → **full range**
- ~0.45–0.85 → **mid range**
- < ~0.45 → **weak range**

(The bent-over row inverts the meaning of "mid range" because its strongest position
*is* the middle — see `exercises.md`. Its mid-range partials are the *powerful* ones,
which is why it yields 10–15 of them.)

---

## 2. Real force numbers, from the source

| Statement | Number |
|---|---|
| "When I do a chest press with this bar, I'm over 500 pounds at peak; 540, actually." | **Chest press peak ≈ 540 lb** |
| "when you might be holding 75 pounds here in an overhead press, and then as you're pushing over your head, it might go to 150" | **Overhead press: 75 lb at the start position → 150 lb at the top** |
| "you are seven times stronger here than here" | **Human strength curve ratio ≈ 7:1** weak → strong |
| "we have X here and just about 5X here" | **X3 band variance ≈ 5:1** bottom → top |
| A plain rehab band tops out around | 14.1 lb (the one study that found VRT didn't work used a TheraBand) |
| Competing "variable" products | "X here, and 1.2X here, and, you know, kind of meaningless" |

### What these numbers prove about the app's force scaling

The overhead press figure is the whole ball game: **the start position already carries
50% of the peak force.** `lo/hi = 75/150 = 0.5`. The app's per-movement floor
(`x3f-cal.js`) is exactly the right idea, and the reason the White-band overhead press
read "200% of the screen" before v1.6 is now quantified rather than guessed.

It also means a sane **default** floor exists per movement even before calibration —
far better than the current `lo: 0`:

| Movement | Suggested default `lo` as a fraction of `hi` | Why |
|---|---|---|
| Overhead press | **0.50** | stated outright by the source |
| Tricep press | 0.35 | same messenger-bag setup, bar starts at eyebrow height |
| Chest press | 0.25 | band doubled behind the back, bar at chest, real pre-tension |
| Upright row | 0.30 | overhead-press setup, arms down but band midfoot |
| Bicep curl | 0.20 | "slight bend at the bottom", singled band, never straight |
| Calf raise | 0.20 | heels hover off the plate, never rest |
| Pec crossover | 0.20 | explicitly pre-tensioned before rep one |
| Bent-over row | 0.15 | bar hangs below the knee, "keep a little bit of tension" |
| Front squat | 0.15 | bar on shoulders at the top, band stretched standing |
| Split squat | 0.15 | same |
| Deadlift | 0.10 | "you're not pulling the bar from the ground but from just below the knee" — least pre-tension of any lift |

Shipping these as **estimates** (flagged `auto: true`, replaced the moment a real
calibration lands) means a brand-new user gets a usable scale on movement one instead
of a screen pinned at the top or dead at the bottom.

### And it proves the force→screen mapping should not be linear

> "The curve is not linear in the middle."

> "you can see I'm holding very high forces at the top. In the middle of the range of
> motion… sort of a medium force. Lower than the high force, but not really half of
> what would be expected because there's actually a rather aggressive curve."

A linear `(force − lo) / (hi − lo)` mapping makes the middle of the movement look
lower than it feels, and squashes the top — where the entire program lives — into a
thin band at the edge of the screen. An **ease-out** mapping (roughly
`x^0.65`) matches the described curve, gives the strong range the visual room it
deserves, and makes the difference between a 90% rep and a 100% rep readable across a
room. This is the fix for "the top of the screen feels unreachable" that is *not* a
calibration bug.

---

## 3. Band setup — the definitive rule, verbatim

> "For **bicep curl, overhead press and squat**, the band is always **singled**. Band
> runs under the ground plate. To set up for the **deadlift, bent row and calf raise**,
> the bands are **doubled** up and also placed under the ground plate. For the **chest
> press and tricep press**, the band does not run under the ground plate, band actually
> goes behind your back and is doubled up also for shorter range of motion."

| Movement | Band | Plate |
|---|---|---|
| Bicep curl | singled | under plate, midfoot |
| Overhead press | singled | under plate, midfoot |
| Front squat | singled | under plate, midfoot |
| Upright row | singled | under plate, midfoot |
| Deadlift | doubled | under plate, midfoot |
| Bent-over row | doubled | under plate, midfoot |
| Calf raise | doubled | under plate, **balls of feet**, heels off the back |
| Chest press | doubled | **no plate** — behind the back |
| Tricep press | doubled | **no plate** — behind the back, held higher |
| Split squat | hooked both sides | **no plate** — under the front foot near the heel |
| Pec crossover | looped | **no plate, no bar** — behind the upper back |

---

## 4. Choosing a band

> "you wanna start with the lightest band, but you also wanna shoot for 15 to 40 slow
> and controlled repetitions."

> "If you feel like you're holding a weight that you cannot hang onto or might let go
> of, you're going way too heavy and you need to drop down a band or maybe even two."

**Height matters:** taller users stretch the band further, so the same band is heavier
for them. Professional basketball players over seven feet "all choose lighter bands
because the force becomes so high in the stronger range of motion". Users near or
under five feet are fine — they only lose tension in the weak range, "which really
doesn't do much for you anyway".

> **App idea:** ask for height once during onboarding and shift the *suggested* band
> down a step for tall users and up a step for short ones. Cheap, and it is the source's
> own advice. Never override a user's choice — suggest.

---

## 5. One set. Not two.

> "Can I do more than one set? **Don't do more than one set. You will do worse if you
> do more than one set.**"

The argument given: adaptation needs one sufficient stimulus, not repetition —
one exposure tans skin; one high-intensity loading cycle influences bone density.
Multiple sets exist in weightlifting because weightlifting is a weak stimulus, and
repeating a weak stimulus accumulates injury rather than growth.

Also: *"You won't be sore… muscle damage, contrary to what you've been told, is
inversely related to muscular growth."*

> **App consequence:** the "1 set · X3 standard" default is right. Going further — the
> app should make adding a second set *possible but explained*, and should never
> present a set count as a thing to increase. Volume is not the progress axis. **Band
> is.**

---

## 6. Trembling is good news

> "You'll notice that you see a bit of shivering going on. That is just the
> stabilization muscles trying to assist or take over while you're going through the
> movements. This up-regulates growth hormone, so a very positive thing is going on so
> don't worry if you start shivering, it's a great thing."

The form demonstrator already trembles near max. **It should be labelled as good.**
A detectable high-frequency wobble in the force signal near peak is a real, measurable
event the app can name and celebrate — and it is genuinely informative rather than
decorative.

Stabilisation is also the stated mechanism for the growth-hormone response, and the
reason there are no ab exercises:

> "How come there's no ab exercises? Actually, half of the exercises are ab exercises.
> They just don't look like it… the abdominals are to stabilize the body."

---

## 7. Safety rules to surface in the app

- **Never step off the ground plate while there is tension on the band.** Put the bar
  down first. (Otherwise the plate launches.)
- **Never do it on wet or slippery surfaces**, or on gravel — jagged surfaces cut bands.
- **No straps on the deadlift** (unless a hand is genuinely non-functional). Grip is
  meant to be the limit, and the deadlift builds it.
- **Never take the bar behind the head** on an overhead press.
- **Never pull an upright row to the chin** — mid-chest maximum.
- **Never pull a bent row into the chest** — to the beltline.
- Keep wrists **neutral**; the bar rotates (it is an Olympic bar) so the load runs down
  the radius and ulna. Exception: the front squat, where the bar rests on the shoulders.

---

## 8. Nutrition, in one line

> "to grow muscle as fast as you can, you should have one gram per pound of body
> weight, not lean body weight, body weight… Anything over that is of no benefit."

Fat loss position: strength training + intermittent fasting + a caloric deficit.
Cardio is argued against (chronic cortisol up, growth hormone down). *This is the
source's position; the app should attribute it rather than assert it, and should not
give medical or nutrition advice of its own.*

---

## 9. Lines worth using in the app, in the source's own spirit

These are **paraphrases for app copy**, written fresh — not quotes:

- "Two seconds up. Two seconds down. There is no rush here."
- "Never lock out. Locking out is resting."
- "Don't let it go slack. Slack is a rep you didn't do."
- "You couldn't reach the top. Good — now go halfway."
- "Halfway is gone. Go as far as you can."
- "The last five reps are the workout."
- "Shaking is your stabilisers joining in. Keep going."
- "One set. Make it count."
- "You're not chasing a number. You're emptying a muscle."

---

## 10. Full transcript — "Intro and Best Practices"

*(Captured verbatim for internal reference. Do not republish.)*

Welcome to the X3 12-Week Program. We're gonna talk about the next 12 weeks of your life and how you're going to be successful using the X3.

First, take note of my physique… So the question is "Why is X3 so vastly superior to the standard weightlifting or standard fitness programming in general?" The answer is variable resistance at a high ratio. An individual is seven times stronger here than here. So when you know that, and it was part of the discovery of developing the medical devices found at OsteoStrong… it became very obvious that because of our differences in power production positions, that lifting weights was just a bad stimulus and there was a better approach.

So we needed a weight that changes as we move so that we can exhaust every range of motion and 100% of the muscle tissue. This will never be possible with a standard weight.

One of the challenges of lifting standard weights and ultimately why I made the decision that I would never lift weights again is you overload joints and you underload muscle… you choose a weight that you can handle in the weak part of the range of motion… so we end up exhausting in the weakest range of motion, not really exhausting at all in the strongest range of motion, but also building cumulative joint damage.

When it comes to getting bigger… There's no accident if you're growing huge musculature. You have to eat big to get big, but it's not calories. In fact, calories are fairly irrelevant. It's protein. So to grow muscle as fast as you can, you should have one gram per pound of body weight, not lean body weight, body weight.

Before we go deeper into the key principles, I wanna go over some of the basics of how to set up the X3. So here is the bar and you can notice the hooks right here, and there's a gap so you can slot the bands in… some exercises call for the band to be doubled… But if we have the ground plate underneath us… There are two ways to set up each band depending on what exercise you are doing. For bicep curl, overhead press and squat, the band is always singled. Band runs under the ground plate. To set up for the deadlift, bent row and calf raise, the bands are doubled up and also placed under the ground plate. For the chest press and tricep press, the band does not run under the ground plate, band actually goes behind your back and is doubled up also for shorter range of motion and then meets the power demand that the chest and triceps can deliver.

So now, the question, "How do you pick the right band?" So you wanna start with the lightest band, but you also wanna shoot for 15 to 40 slow and controlled repetitions… If you feel like you're holding a weight that you cannot hang onto or might let go of, you're going way too heavy and you need to drop down a band or maybe even two. Now, of course, with all movements, you're gonna always aim for two to three seconds up and two to three seconds down.

Also keep in mind, these cells, these muscle cells, they are active through the entire range of motion. Just different ones are recruited or a higher proportion of them are recruited in the stronger ranges of motion. So when you make a muscle stronger in the stronger range of motion, it translates to all ranges of motion. A sprinter uses seven degrees of flexion behind their knee yet they have 180 degrees available. If they were only getting stronger in the range of motion they were using, they would never be able to get out of a chair.

Never step off the ground plate if there is still tension on the band… When you wanna step off the plate, put the bar down first.

X3 will expose your weaknesses… You need to strengthen your lower back and most importantly, your grip when doing the deadlift. So we don't want anyone to use a crutch like straps… The X3 deadlift will strengthen your grip.

Some of the small details, the nuances of positioning in these exercises is very important… you always want your hand neutral, which is why the X3, the bar, is an Olympic bar. It rotates so you can always get to neutral positioning of the wrist. The only place you're not gonna bother about that is when you do the squat.

Now, let's talk about surfaces. Remember there's a ground plate which is designed to protect your ankles and not have any lateral loading of the ankle joints… Don't do it on wet or slippery surfaces… You don't wanna do it on gravel either because jagged surfaces can cut into the bands.

One of the things that, first questions we get, "How come there's no ab exercises?" Actually, half of the exercises are ab exercises. They just don't look like it… A few years ago, Henry Alkire and myself did a meta analysis on stabilization firing of the body… all 23 studies that we analyzed showed that growth hormone goes up with stabilization type exercise… those who add loading to their stabilization exercise have the most dramatic increases in growth hormone. So like for example, with the X3, when you might be holding 75 pounds here in an overhead press, and then as you're pushing over your head, it might go to 150. That is where your core has to fire and stabilize you.

So height is a popular topic… Ultimately, the taller that a person is, the heavier the band will become just because they're stretching it further. We even have professional basketball players who use X3, some are over seven feet tall. They all choose lighter bands… If you're on the other side of the spectrum, if you're shorter… you're only missing out on some tension in the weaker range of motion, which really doesn't do much for you anyway.

Now, for repetition speed, this is very important and I need you to really pay attention to this. You'll notice that you see a bit of shivering going on. That is just the stabilization muscles trying to assist or take over… This up-regulates growth hormone, so a very positive thing is going on so don't worry if you start shivering, it's a great thing. You still wanna go two to three seconds up, two to three seconds down. You don't wanna pause at the bottom, at the top of any of these exercises.

Now, you may come across some foolish articles on the internet that talk about slow versus fast twitch muscle… X3 will stimulate everything and all muscle will grow.

So when people start out, very often, one of the first questions they ask is, "Can I do more than one set?" Don't do more than one set. You will do worse if you do more than one set… How many sets do you need to do in the sunlight to get a tan?… You need to stimulate one time. Now, my PhD dissertation was written about bone density. Guess how many loading cycles are required to influence bone density?… One, just one. One high intensity loading cycle.

In any X3 movement, you move to full extension without lockout until you can no longer reach that stronger range. Then you perform partial repetitions in the mid range. When you've gone to an even higher level of fatigue, you won't be able to use the mid range anymore either, so then, you just have very short weak range repetitions. This is absolute fatigue of the musculature, all in one set. You won't be sore, and coincidentally, muscle damage, contrary to what you've been told, is inversely related to muscular growth.

*(Section 10 continues with cardiovascular exercise; omitted here as it does not bear on the app.)*

---

## 11. Full transcript — "How is X3 different from free weights…"

The logic behind the creation of X3 has to do with the fact that you are seven times stronger than you know you are. That's based on biomechanics and variable resistance. Right here, you are seven times stronger than you are right here. **The curve is not linear in the middle.**

Therefore, we change the weight with X3 so that we hold the lighter weight back here where the joints are compromised and more likely to injure, and we hold a very powerful weight out here where you are capable of producing that force. This means that you get a much deeper level of fatigue, and with that deeper level of fatigue comes a more aggressive rate of growth.

The problem with lifting regular weights is we don't get that seven-fold stimulus… When you're in your strongest position, you're hardly using any muscle at all. That's when the most muscle is capable of firing.

There are some companies that are trying to draft off of our success by selling just bands by themselves. The problem is you have two choices. You have a very light-weight band, which is kinda like a rehab-type of weight, 20 pounds or something like that. That's not gonna stimulate any growth. **When I do a chest press with this bar, I'm over 500 pounds at peak; 540, actually.** When somebody trains with just bands, they're either going too light, or if they try and use a heavier set of bands, this happens, because the band wants to be a circle. It doesn't have the bar to conform to a straight line.

There's also a ground plate that you stand on with X3 that creates a ground, so if you're doing a dead lift or a squat, your ankles are not bending inward.

---

## 12. Full transcript — "What's the science behind X3 Bar?"

The science behind X3 — there's actually 16 studies. Those are all in the book… I think it's really important that we point to studies that we didn't do. These were all third parties.

So all of these 16 studies came to the same conclusion… It doesn't really matter if you're holding X weight here, and 1.5X weight here that is better than holding one static weight. **Now we have X here and just about 5X here.** So that's a more aggressive level of variable resistance. And you'll read in some of those studies that the degree of variance as it becomes higher, the growth rate becomes higher.

I also want to talk about one study that found that variable resistance doesn't work… it had a variable resistance group that was training with just bands. So no bar, no nothing, just bands… it turns out they used a TheraBand and that's a rehab type product… the highest possible resistance they could have gotten to at peak force was 14.1 pounds.

*(Fair-use note: these are internal working references. Claims here are the source's,
not independently verified, and the app should attribute rather than assert them.)*
