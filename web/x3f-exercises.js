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
(function () {
  "use strict";

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
     bandRank      1..11                    1 = takes the heaviest band. Not a
                                            free ordering: it is the source's
                                            own ranking, transcribed below.
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
                                            the existing Library and Routine pages

     ─────────────────────────────────────────────────────────────────────────
     THE BAND RANKING IS THE SOURCE'S, NOT AN OPINION
     ─────────────────────────────────────────────────────────────────────────

     exercises.md's reconciliation checklist states it as one ordered line:

       "deadlift & bent-over row heaviest -> chest press, front squat ->
        split squat -> overhead press, bicep curl, tricep press -> upright row,
        pec crossover -> CALF RAISE LIGHTEST"

     bandRank is that line, numbered. Movements inside one arrow-separated tier
     are equal and their relative numbers carry no meaning.

     THE CALF RAISE WAS RANKED 6, MID-TABLE, AND IT IS THE LIGHTEST MOVEMENT IN
     THE PROGRAM. That mis-rank came with `band: 'Light Gray'`, and because the
     calf raise is one of the five movements the source prescribes DOUBLED, the
     Library, the Calibrate picker, the Routine coach and the home cards all
     printed "Light Gray · 160+ lb" on it - a heavier printed figure than the
     front squat (Dark Gray singled, 50-120 lb) or the overhead press (Light
     Gray singled, 25-80 lb). The app was recommending more load on the one
     movement whose own mechanics list says "use a lighter band and higher
     reps", and more than it recommended for a squat.

     The suggested `band` must stay monotone with bandRank, or the ranking is
     decoration. It is: Black, then four Dark Gray, then four Light Gray, then
     two White. band-progression.md 11.7 is explicit that the calf raise should
     "default its suggested starting band to the lightest the user owns", which
     is White here - the Ultra Light band has no published force range and so
     is deliberately absent from BAND_FORCE.

     A doubled White still prints 100+ lb, because doubling a band roughly
     doubles its force and the doubled setup is fixed by the source, not chosen.
     That is the honest floor for this movement, not a ranking artefact. */

  var EX = [
    /* ---------------------------------------------------------------- PUSH */
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
    },
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
    },
    {
      slug: 'overhead-press', officialSlug: 'overhead-press', name: 'Overhead Press',
      muscle: 'Deltoids',
      day: 'push', order: 3, joint: 'multi', optional: false, unlockWeek: null,
      substituteFor: null, perSide: false,
      band: 'Light Gray', bandRank: 6, floorFrac: 0.50, curve: 'top', partials: [4, 6],
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
    },
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
    },
    {
      slug: 'pec-crossover', officialSlug: 'pec-crossover', name: 'Pec Crossover',
      muscle: 'Chest — do it right after the chest press',
      day: 'push', order: 5, joint: 'single', optional: true, unlockWeek: 5,
      substituteFor: null, perSide: false,
      band: 'Light Gray', bandRank: 9, floorFrac: 0.20, curve: 'top', partials: [4, 6],
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
    },
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
    },
    {
      slug: 'upright-row', officialSlug: 'upright-row', name: 'Upright Row',
      /* NOT "shoulder-friendly", which is what this field used to say. The
         source says the reverse in as many words: "biomechanically the upright
         row is not the best exercise for a whole host of reasons", and it is
         "only, I repeat, only for people who lack shoulder mobility that cannot
         do the overhead press". A shoulder-friendly badge reads as an upgrade,
         and this field is the ONE thing the Routine page's add-movement <select>
         shows next to the name - a list that has no room to explain the
         substituteFor gate. So the gate goes in the words themselves. */
      muscle: 'Delts · traps — only if you can’t press overhead',
      day: 'push', order: 7, joint: 'multi', optional: true, unlockWeek: null,
      substituteFor: 'overhead-press', perSide: false,
      band: 'White', bandRank: 10, floorFrac: 0.30, curve: 'top', partials: [4, 6],
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
    },

    /* ---------------------------------------------------------------- PULL */
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
    },
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
    },
    {
      slug: 'drag-curl', officialSlug: 'bicep-curl', name: 'Bicep Curl',
      muscle: 'Biceps — a drag curl, which makes it multi-joint',
      day: 'pull', order: 3, joint: 'multi', optional: false, unlockWeek: null,
      substituteFor: null, perSide: false,
      band: 'Light Gray', bandRank: 7, floorFrac: 0.20, curve: 'top', partials: [4, 6],
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
    },
    {
      slug: 'calf-raise', officialSlug: 'calf-raise', name: 'Calf Raise',
      muscle: 'Calves',
      day: 'pull', order: 4, joint: 'single', optional: false, unlockWeek: null,
      substituteFor: null, perSide: false,
      /* LIGHTEST MOVEMENT IN THE PROGRAM - see the bandRank note at the top of
         this file. It was ranked 6 on Light Gray, which printed "160+ lb
         doubled" and made the calf raise the app's heaviest recommendation
         outside the deadlift and bent row. */
      band: 'White', bandRank: 11, floorFrac: 0.20, curve: 'top', partials: [4, 8],
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
  ];

  /* ── THE ONE EQUIPMENT-SAFETY RULE THE SOURCE STATES, AND THE APP DID NOT ──

     docs/x3-knowledge/official/principles-and-mechanics.md §7 lists it first,
     under the heading "Safety rules to surface in the app", and the transcript
     on the same page states it twice:

       "Never step off the ground plate while there is tension on the band. Put
        the bar down first. (Otherwise the plate launches.)"

     Every PER-MOVEMENT rule in that list was already in this file - no straps
     on the deadlift, never behind the head on an overhead press, never to the
     chin on an upright row - each sitting in a faults or mechanics array. This
     one, the only rule in the list whose failure mode is a loaded steel plate
     leaving the floor, was in none of them, and it is per-movement too. It went
     missing because it has no natural home in an Execution & Mechanics list:
     it is not part of any rep, it is what you do when the set ends, or when you
     stop mid-set to answer the door.

     (The list's remaining rule - never on wet, slippery or gravel surfaces - is
     session-wide rather than per-movement and is still absent from the app. It
     does not belong in this array; it belongs wherever the app talks about
     setting up a training space, which is not this file.)

     APPLIED FROM `plate`, NOT COPIED INTO SEVEN ENTRIES. The rule applies to
     exactly the movements that stand on the ground plate, and `plate` already
     records that. Hand-copying it would recreate the failure this block exists
     to fix - a rule that is true of seven movements and present on six. The
     chest press, tricep press, pec crossover and split squat are excluded
     because they genuinely do not use the plate: their bands run behind the
     back, behind the shoulders, or under the front foot.

     TWO PLACES, BECAUSE THEY REACH DIFFERENT PEOPLE. `faults` is the Library's
     "What goes wrong" list, read before you train; `setup` is the line the
     Routine coach shows in a guided session, read while you are standing on
     the plate. Neither `mechanics` nor `setupSteps` is touched, because both
     are documented as the verbatim official lists and this rule is from a
     different official page. */
  var PLATE_FAULT = 'Stepping off the plate with tension still on the band — ' +
                    'put the bar down first, or the plate launches';
  var PLATE_SETUP = ' <b>Put the bar down before you step off the plate</b> — ' +
                    'stepping off with tension still on the band launches it.';

  EX.forEach(function (e) {
    if (!e.plate || e.plate === 'none') return;
    /* First in the list: it is the only fault here that can hurt someone who is
       no longer even doing the movement. */
    e.faults = [PLATE_FAULT].concat(e.faults || []);
    e.setup = (e.setup || '') + PLATE_SETUP;
  });

  var BY = {};
  EX.forEach(function (e) { BY[e.slug] = e; });

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

  /* The default program days. Four movements each, which is what the official
     program prescribes - the optional variations are added by the user, and
     only offered once they have unlocked. Every day stays editable. */
  var DAYS = [
    ['Push Day', ['chest-press', 'tricep-press', 'overhead-press', 'front-squat']],
    ['Pull Day', ['deadlift', 'bent-row', 'drag-curl', 'calf-raise']]
  ];

  var BANDS = ['White', 'Light Gray', 'Dark Gray', 'Black', 'Elite Black'];

  /* X3's published resistance ranges, in POUNDS. A range rather than a number
     because a latex band's force rises with how far it is stretched - which is
     the entire point of the system.

     THE SECOND NUMBER IS THE ONE PEOPLE MISS. Doubling a band roughly doubles
     its force, and whether a movement uses a doubled or singled band is fixed
     by the setup, not chosen. So a WHITE band DOUBLED (100+ lb) is heavier than
     a DARK GRAY band SINGLED (50-120 lb at the top of its range). Any UI that
     shows band colour alone is telling the user something misleading; show the
     pounds for the configuration the movement actually uses.

     The Ultra Light band has no published range - X3 only says it is lighter
     than White at equivalent stretch - so it is deliberately absent. */
  var BAND_FORCE = {
    'White':       { singled: [10, 50],   doubled: [100, null] },
    'Light Gray':  { singled: [25, 80],   doubled: [160, null] },
    'Dark Gray':   { singled: [50, 120],  doubled: [240, null] },
    'Black':       { singled: [60, 150],  doubled: [300, null] },
    'Elite Black': { singled: [110, 600], doubled: [null, null] }
  };

  /* "Dark Gray · 240+ lb doubled" reads as a real number a person can reason
     about; "Dark Gray" alone does not. */
  function forceLabel(band, slug) {
    var f = BAND_FORCE[band];
    if (!f) return '';
    var e = BY[slug];
    var doubled = e && e.bandConfig === 'doubled';
    var r = doubled ? f.doubled : f.singled;

    /* FALL BACK TO THE SINGLED FIGURE RATHER THAN SAYING NOTHING.

       Reported from real use: the Elite Black band showed no weight range at all.
       Cause: its entry is { singled: [110, 600], doubled: [null, null] }, and
       this function used to return '' the moment the requested configuration had
       no published pair - so on the five DOUBLED movements (chest press, tricep
       press, deadlift, bent row, calf raise) Elite Black printed a blank in all
       eight places that call this: the Library card, the Calibrate picker, the
       Routine coach, two Progress tables, the home's movement cards and
       onboarding. Every other band showed a number; the heaviest one showed
       nothing.

       The null is honest - X3 publishes a separate doubled figure for the four
       lighter bands and does not for the Elite. But blank is the wrong way to
       say so. X3 publishes ONE range for that band, 110-600 lb, and that is a
       real manufacturer number rather than something derived here, so it is what
       gets shown. No figure is invented: if a band had no published range at all
       it would still return '' and the callers still handle that. */
    if (!r || r[0] === null) r = f.singled;
    if (!r || r[0] === null) return '';
    if (r[1] === null) return r[0] + '+ lb';
    return r[0] + '–' + r[1] + ' lb';
  }

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

  /* Phase-gated coaching. The source teaches a new principle per phase, so a
     user coming back for a second cycle is told something new instead of the
     same three tips forever. */
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

  var GAMES = {
    bloom: { name: 'Bloom', sub: 'controlled reps', file: 'X3F_Bloom.html', tempo: 1 },
    splash: { name: 'Splash', sub: 'arcade', file: 'X3F_Splash.html' },
    nova: { name: 'Nova', sub: 'space RPG', file: 'X3F_Nova.html' },
    flow: { name: 'Flow', sub: 'controlled reps', file: 'X3F_Flow.html', tempo: 1 },
    zone: { name: 'Hold the Zone', sub: 'under tension', file: 'X3F_Arena.html', mode: 'zone' },
    max: { name: 'Max Effort', sub: 'strength', file: 'X3F_Arena.html', mode: 'max' },
    boss: { name: 'Boss Fight', sub: 'endurance', file: 'X3F_Arena.html', mode: 'boss' },
    duel: { name: 'Duel', sub: 'vs CPU', file: 'X3F_Duel.html' },
    rhythm: { name: 'Rhythm', sub: 'on tempo', file: 'X3F_Rhythm.html' },
    ascent: { name: 'Ascent', sub: '3D flight', file: 'X3F_Ascent.html' }
  };

  /* The web build ships X3F_Bloom.html; the Android TV bundle ships bloom.html.
     A page can set window.X3FFILES = {bloom:'bloom.html', ...} BEFORE loading
     this file to remap the launch targets, so both builds share one copy of the
     movement data instead of forking it. */
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

  window.X3FEX = {
    list: EX, by: BY, groups: GROUPS, days: DAYS,
    bands: BANDS, games: GAMES, gameUrl: gameUrl,
    bandForce: BAND_FORCE, forceLabel: forceLabel,
    protocol: PROTOCOL, phases: PHASES,
    phaseForWeek: phaseForWeek, forDay: forDay, orderWarning: orderWarning,
    get: function (slug) { return BY[slug] || null; }
  };
})();
