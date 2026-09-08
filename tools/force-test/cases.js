/* X3F FORCE-TEST - the regression suite for the force model.

   Every group below is a bug that has actually shipped, or an invariant whose
   violation has actually shipped. Each one is written so that it FAILS against
   the code as it was before the overhaul and PASSES after, and each carries a
   comment saying what the old failure was in the user's terms - because a test
   whose only documentation is its own assertion tells the next person nothing
   about why it is allowed to be strict.

   Run `node tools/force-test/run.js --baseline` to watch them go red against
   the pre-overhaul modules. That is not decoration: a regression test nobody
   has ever seen fail is a regression test nobody knows is wired up.

   The evidence for each is in docs/audit/calibration.md (defects D1-D23,
   invariants I1-I17) and docs/OVERHAUL-PLAN.md section 3. */
'use strict';

const { load } = require('./env');

/* Numbers that appear more than once, named so a reader can see where they came
   from rather than wondering what 78 is.

   THE ONE REAL CAPTURE. v1.5 recorded an actual White-band overhead press at
   52-78 (HANDOFF.md:102, and tools/func-test/cases.js:184 asserts against it).
   It is the only measured movement+band range this repo has, so it is the only
   thing the estimate model can honestly be checked against. */
const REAL_OHP_WHITE = { lo: 52, hi: 78 };
const WHITE_CEILING = 130;                    // the shipped default for the White band

const groups = [];
function group(id, title, run) { groups.push({ id, title, run }); }

/* ------------------------------------------------------------------ 1. D1 */
/* THE REPORTED BUG, as a regression test.

   What the user said: "different exercises still have trouble getting the
   minimums and the maximums."

   What was happening (docs/audit/calibration.md D1): Calibrate saved against
   the GLOBAL band key `x3f_band`; the Library launched games against a
   PER-MOVEMENT band, `x3f_libBand[slug] || ex.band`. Nothing reconciled them.
   So the ordinary path through a fresh install was:

     - Calibrate opens on Chest Press / White, you capture hold 30 / max 150,
       and it is filed under "chest-press|White".
     - The Library launches Bloom on chest-press's RECOMMENDED band, Dark Gray.
     - The game looks up "chest-press|Dark Gray", finds nothing, and falls back
       to the hardcoded band ceiling: lo 0, hi 330.
     - Every threshold in the game derives from that number, so the rig sits at
       9% at rest, tops out at 45%, and no rep is ever counted.

   Calibrating again, harder, could not fix it - the calibration was correct and
   was simply looked up under a key it was never filed under.

   OLD BEHAVIOUR THIS FAILS AGAINST: X3FBand does not exist, so the resolution
   below throws; and the Library's own rule (kept in the harness as
   libraryBandRule, verbatim in shape from X3F_Library.html:74-75) still answers
   'Dark Gray' for a movement the user calibrated on White. */
group('1', 'the reported bug: calibrate on White, launch from the Library (D1)', (t) => {
  const env = load();

  /* If the recommendation ever changes to White this test stops meaning
     anything, so state the precondition rather than assuming it. */
  t.eq('the Library still recommends a DIFFERENT band for the chest press',
       env.ex.get('chest-press').band, 'Dark Gray');
  t.eq('and the old Library rule would still send the game there',
       env.libraryBandRule('chest-press'), 'Dark Gray');

  t.ok('the capture is accepted', env.cal.save('chest-press', 'White', 30, 150) === true);

  const band = env.band.forMovement('chest-press');
  t.eq('the band the Library now resolves is the one just calibrated', band, 'White');

  const r = env.cal.range('chest-press', band);
  t.eq('the game sees the measured hold as the floor', r.lo, 30);
  t.eq('the game sees the measured max as the ceiling', r.hi, 150);
  t.ok('and knows it is a real calibration, not a guess', r.auto === false && r.est === false,
       JSON.stringify(r));
  t.eq('the scale is the RANGE, not the ceiling (I2)', env.cal.span('chest-press', band), 120);

  /* The contract every game is built on (invariant I1): 0.0 at the start
     position, 1.0 at the all-out max. Under the old key mismatch these read
     0.09 and 0.45. */
  t.near('holding the start position reads ZERO', env.cal.raw('chest-press', band, 30), 0, 1e-9);
  t.near('an all-out press reads the TOP', env.cal.raw('chest-press', band, 150), 1, 1e-9);
  t.near('and halfway reads halfway', env.cal.raw('chest-press', band, 90), 0.5, 1e-9);

  /* The old fallback, stated so the failure mode is on the record: 30 of 330 is
     9% of the screen at rest, 150 of 330 is 45% at maximum effort. */
  t.ok('the wrong band would still be the old broken scale',
       30 / 330 < 0.1 && 150 / 330 < 0.5);

  /* Calibrate must ask the same question the games ask. This is the structural
     fix - not "both happen to agree today" but "there is only one answer". */
  t.eq('Calibrate and the games now resolve the band through one function',
       env.cal.band('chest-press'), env.band.forMovement('chest-press'));
});

/* ------------------------------------------------------------- 2. estimates */
/* PER-MOVEMENT ESTIMATES for a movement nobody has calibrated.

   The old model was one ceiling per band and a floor of zero for everything.
   Both halves were wrong:

     - A deadlift and a pec crossover on the same band are nowhere near each
       other, so a scale set by one leaves the other unusable.
     - Every movement's start position already carries load, and the overhead
       press carries HALF its peak before you have done anything: "you might be
       holding 75 pounds here in an overhead press, and then as you're pushing
       over your head, it might go to 150." A floor of zero is what put a
       resting overhead press near the top of the screen.

   The model is hi = bandCeiling * hiFrac, lo = hi * floorFrac. Checked against
   the only real capture this repo has: White-band overhead press, 52-78.

   OLD BEHAVIOUR THIS FAILS AGAINST: range() returned {lo:0, hi:130} for an
   uncalibrated White-band movement whatever the movement was, so the floor was
   zero (the assertion below fails) and an all-out 78 read 0.6 of the screen -
   the top was literally unreachable without calibrating. */
group('2', 'per-movement estimates: an uncalibrated overhead press', (t) => {
  const env = load();
  const r = env.cal.range('overhead-press', 'White');

  t.eq('the estimated ceiling matches the one real capture (130 * 0.60)',
       r.hi, REAL_OHP_WHITE.hi);
  t.ok('the floor is NOT zero', r.lo > 0, String(r.lo));
  t.eq('the start position is estimated at half the peak, as the source says', r.lo, 39);
  t.ok('and it is flagged as an estimate so a real capture can replace it',
       r.auto === true && r.est === true, JSON.stringify(r));

  /* Erring LOW on the floor is the safe direction and worth pinning: a floor
     that is too HIGH reads 0 for the entire set, which is the worst failure
     this module can produce. 39 is under the measured 52. */
  t.ok('the estimated floor errs low against the measured 52',
       r.lo < REAL_OHP_WHITE.lo, r.lo + ' vs ' + REAL_OHP_WHITE.lo);

  /* I1 again, on the estimate rather than a calibration. */
  t.near('holding the estimated start reads zero', env.cal.raw('overhead-press', 'White', r.lo), 0, 1e-9);
  t.near('an all-out press reaches the top without calibrating',
         env.cal.raw('overhead-press', 'White', REAL_OHP_WHITE.hi), 1, 1e-9);

  /* One number per band was the other half of the bug. */
  const dead = env.cal.range('deadlift', 'White');
  const pec = env.cal.range('pec-crossover', 'White');
  t.eq('the deadlift takes the whole band', dead.hi, WHITE_CEILING);
  t.ok('the pec crossover does not', pec.hi < dead.hi * 0.6, pec.hi + ' vs ' + dead.hi);
  t.ok('and their floors differ too, because their start positions do',
       env.cal.range('tricep-press', 'White').lo / env.cal.range('tricep-press', 'White').hi >
       env.cal.range('deadlift', 'White').lo / env.cal.range('deadlift', 'White').hi);

  /* Every movement must produce a usable scale on every band - a hole here is
     a movement that cannot be played until it is calibrated. */
  let bad = [];
  env.ex.list.forEach(e => env.ex.bands.forEach(b => {
    const x = env.cal.range(e.slug, b);
    if (!(x.hi > 0) || !(x.hi - x.lo >= 10) || x.lo < 0) bad.push(e.slug + '|' + b);
  }));
  t.eq('every movement on every band has a usable estimated range', bad.join(','), '');
});

/* ------------------------------------------------------------ 3. validation */
/* A STORED RANGE MUST BE VALIDATED BEFORE IT IS USED.

   docs/audit/calibration.md D9. save() checked lo < hi; range() did not, and
   range() is what every frame of every game calls. X3F_Progress.html:329-332
   imports x3f_exCal entries verbatim with no shape validation, so an export
   from a device where the bar was tared under load - or any hand-edited or
   truncated JSON - could carry {lo:500, hi:100}.

   OLD BEHAVIOUR THIS FAILS AGAINST: floor() returned 500 and span() collapsed
   to MIN_SPAN, i.e. 10. The game then computed force = max(0, raw - 500), which
   is 0 for the whole set; and if you did exceed 500, one single unit of force
   became 10% of the screen. Nothing in the app could detect it and nothing
   could repair it - X3FCal.clear() has no caller outside the test harness. */
group('3', 'validation: an impossible stored range must not be trusted', (t) => {
  /* Seeded BEFORE the modules load, because that is how it arrives in real
     life: the import happened on a previous page load. */
  const env = load({ storage: { x3f_exCal: { 'chest-press|White': { lo: 500, hi: 100, auto: false, t: 1 } } } });
  const r = env.cal.range('chest-press', 'White');

  t.not('the bogus floor is not handed to the games', r.lo, 500);
  t.not('and the span does not collapse to the minimum', env.cal.span('chest-press', 'White'), 10);
  t.ok('it falls back to the estimate', r.est === true && r.auto === true, JSON.stringify(r));
  t.eq('...which is this movement on this band', r.hi, 112);   // 130 * 0.86, rounded
  t.eq('...with its own floor', r.lo, 28);                     // 111.8 * 0.25, rounded

  /* The user-visible consequence, stated as an assertion: a real pull has to
     move the screen. Under the old code every force below 500 read exactly 0. */
  t.ok('a believable pull is no longer flattened to zero',
       env.cal.raw('chest-press', 'White', 100) > 0.5,
       String(env.cal.raw('chest-press', 'White', 100)));

  /* The other shapes an import or a truncated write can produce. */
  const shapes = {
    'chest-press|Black': { lo: 0, hi: 0 },                 // nothing was measured
    'deadlift|Black': { lo: 5, hi: 9 },                    // a span under MIN_SPAN
    'drag-curl|Black': null,                               // a null entry
    'calf-raise|Black': 'not an object'                    // a string where an object belongs
  };
  const env2 = load({ storage: { x3f_exCal: shapes } });
  Object.keys(shapes).forEach(k => {
    const p = k.split('|');
    t.ok('a broken entry (' + k + ') falls back to the estimate',
         env2.cal.range(p[0], p[1]).est === true, JSON.stringify(env2.cal.range(p[0], p[1])));
  });

  /* A negative floor is repaired rather than discarded, which is the right
     call - the ceiling in that entry may still be a real measurement, and a
     floor of zero is merely the old behaviour, not a broken one. What must
     never happen is the negative reaching a game: force = raw - lo with a
     negative lo ADDS resistance the user never applied and pins the display
     above the top of the screen. */
  const env2b = load({ storage: { x3f_exCal: { 'bent-row|Black': { lo: -40, hi: 200 } } } });
  t.eq('a negative floor is clamped to zero, never handed on',
       env2b.cal.floor('bent-row', 'Black'), 0);
  t.eq('...and the ceiling it came with survives', env2b.cal.range('bent-row', 'Black').hi, 200);
  t.near('so a resting bar still reads zero, not above the top',
         env2b.cal.raw('bent-row', 'Black', 0), 0, 1e-12);

  /* And the validation must not be so eager that it throws away good data. */
  const env3 = load({ storage: { x3f_exCal: { 'chest-press|White': { lo: 30, hi: 150, auto: false, t: 1 } } } });
  const good = env3.cal.range('chest-press', 'White');
  t.ok('a valid stored range still survives', good.lo === 30 && good.hi === 150 && good.est === false,
       JSON.stringify(good));
});

/* -------------------------------------------------------- 4. no write on no */
/* A REFUSED CAPTURE MUST WRITE NOTHING AT ALL.

   docs/audit/calibration.md D2, X3F_Calibrate.html:199-202. The page recorded
   that save() had refused the capture and then, in the very next statement,
   raised x3f_bandMax[band] anyway - unconditionally and monotonically.

   OLD FAILURE, in the user's terms: you misread the prompt and hold your
   all-out position during HOLD, so the capture is 495-500. The screen correctly
   says "Only 5 between hold and max; needs 10" and stores no calibration - but
   x3f_bandMax['White'] is now 500, up from 130. Every OTHER movement on White,
   all ten of them, is now scaled to 500 instead of 130, so all of them read at
   a quarter of their real height, permanently, and the only control in the
   whole app that can put it back is a number field buried in Arena's gear sheet.

   WHERE THIS TEST BITES: at the module boundary. x3f_bandMax is not
   x3f-cal.js's to write and never was, so the assertion is the strong one -
   a refused save leaves the store BYTE-IDENTICAL. The page-level half of D2
   (Calibrate itself must not write on refusal) is asserted on the real page in
   tools/func-test/cases-cal.js, because that is where the offending line lived.

   The old module returned a bare `false`, so `.error` and `.message` below did
   not exist and the caller had nothing to show the user. */
group('4', 'a refused calibration writes nothing (D2)', (t) => {
  const env = load({ storage: { x3f_bandMax: { White: WHITE_CEILING } } });
  const before = env.snapshot();

  const res = env.cal.save('chest-press', 'White', 495, 500);
  t.ok('the capture is refused', res !== true, JSON.stringify(res));
  t.eq('for the right reason', res.error, 'too-narrow');
  t.ok('and it says what it measured, not just "no"',
       /5/.test(res.message) && /10/.test(res.message), res.message);

  t.eq('the ENTIRE store is byte-identical after the refusal', env.snapshot(), before);
  t.eq('x3f_bandMax is untouched', env.get('x3f_bandMax').White, WHITE_CEILING);
  t.ok('and nothing was filed for the movement',
       env.cal.range('chest-press', 'White').est === true);

  /* The other two refusals, which the page must be able to explain separately -
     "the bar was not connected" and "you held harder than you pressed" are
     different mistakes with different fixes. */
  t.eq('no force at all is its own refusal', env.cal.save('chest-press', 'White', 0, 0).error, 'no-max');
  t.eq('a max below the hold is its own refusal',
       env.cal.save('chest-press', 'White', 100, 90).error, 'max-below-hold');
  t.ok('...and names both numbers', /100/.test(env.cal.save('chest-press', 'White', 100, 90).message));
  t.eq('still byte-identical after three refusals', env.snapshot(), before);

  /* The control: a good capture must of course write. */
  t.ok('a good capture is accepted', env.cal.save('overhead-press', 'White',
       REAL_OHP_WHITE.lo, REAL_OHP_WHITE.hi) === true);
  t.not('and the store changed this time', env.snapshot(), before);
  t.eq('x3f_bandMax is still not this module\'s to write',
       env.get('x3f_bandMax').White, WHITE_CEILING);
});

/* ------------------------------------------------------------- 5. the curve */
/* THE EASED DISPLAY CURVE.

   "In the middle of the range of motion... sort of a medium force. Lower than
   the high force, but not really half of what would be expected, because
   there's actually a rather aggressive curve."

   Games used force/ref() directly - a straight line - so a mid-range effort
   drew at exactly half height and looked like half the work it was. frac()
   applies X3FEX.protocol.curveExp (0.65) so the middle of your range reads
   above the middle of the screen.

   OLD BEHAVIOUR THIS FAILS AGAINST: there was no frac() at all - the module
   exposed only floor/span and every game divided by hand. The linear mapping
   put the midpoint at exactly 0.5, so `frac(midpoint) > 0.5` is false.

   NOTE FOR WHOEVER CHANGES curveExp: this test pins the DIRECTION of the ease,
   not just the presence of one. Flipping the exponent above 1 (which would
   spread the top of the range instead of the middle) is a deliberate change to
   what the screen means, and it should have to come here and say so. */
group('5', 'the eased display curve, for a top-curve movement', (t) => {
  const env = load();
  const S = 'chest-press', B = 'White';
  env.cal.save(S, B, 30, 150);

  t.eq('the exponent is program data, not a magic number in a game',
       env.ex.protocol.curveExp, 0.65);

  t.near('frac is 0 at the calibrated floor', env.cal.frac(S, B, 30), 0, 1e-12);
  t.near('frac is 1 at the calibrated max', env.cal.frac(S, B, 150), 1, 1e-12);
  t.eq('and clamps below the floor', env.cal.frac(S, B, 0), 0);
  t.eq('and clamps above the max', env.cal.frac(S, B, 400), 1);

  /* Strictly increasing: any flat spot is a stretch of the screen where pulling
     harder does nothing, and any dip is a rig that falls while you push. */
  let mono = true, worst = '';
  let prev = -1;
  for (let i = 0; i <= 240; i++) {
    const f = 30 + (120 * i) / 240;
    const v = env.cal.frac(S, B, f);
    if (!(v > prev)) { mono = false; worst = 'f=' + f.toFixed(2) + ' ' + prev + ' -> ' + v; break; }
    prev = v;
  }
  t.ok('strictly increasing across the whole range', mono, worst);

  const mid = env.cal.frac(S, B, 90);
  t.ok('the middle of the range reads ABOVE the middle of the screen', mid > 0.5, String(mid));
  t.near('...by exactly the documented ease', mid, Math.pow(0.5, 0.65), 1e-9);
  t.ok('which is a real difference on a 1080p screen, not a rounding one',
       (mid - 0.5) * 1080 > 100, Math.round((mid - 0.5) * 1080) + 'px');

  /* raw() must stay linear. Rep detection, the three-tier classifier and every
     threshold in every game use it, and easing those would silently move the
     boundary between a full-range rep and a mid-range one. */
  t.near('raw() is still linear, for logic', env.cal.raw(S, B, 90), 0.5, 1e-12);
  t.ok('frac and raw genuinely differ', Math.abs(mid - env.cal.raw(S, B, 90)) > 0.1);
});

/* --------------------------------------------------------- 6. the bent row */
/* THE BENT ROW'S MID-RANGE CURVE.

   Its lat and bicep strength curves cross, so its strongest position is the
   MIDDLE of the movement, not the top - which is why the source expects 10-15
   partials from it where every other movement yields 4-6.

   OLD BEHAVIOUR THIS FAILS AGAINST: every movement was drawn "more force =
   higher", so the bent row's display peaked at the top - the one place its
   power is NOT. The exercise data had no `curve` field at all, so there was
   nothing a game could have keyed on even if it wanted to. */
group('6', 'the bent row peaks mid-range, not at the top', (t) => {
  const env = load();
  const S = 'bent-row', B = 'Dark Gray';

  t.eq('the movement data says where its power is', env.ex.get(S).curve, 'mid');
  t.ok('and expects far more partials because of it', env.ex.get(S).partials[1] >= 10,
       JSON.stringify(env.ex.get(S).partials));
  t.eq('while a normal movement peaks at the top', env.ex.get('chest-press').curve, 'top');

  env.cal.save(S, B, 20, 120);
  const at = (lin) => env.cal.frac(S, B, 20 + lin * 100);

  let peakLin = 0, peakVal = -1;
  for (let i = 0; i <= 1000; i++) {
    const lin = i / 1000, v = at(lin);
    if (v > peakVal) { peakVal = v; peakLin = lin; }
  }
  t.ok('the display peaks in the middle of the range', peakLin > 0.35 && peakLin < 0.8,
       'peak at ' + peakLin.toFixed(3));
  t.ok('the top of the range is well below that peak', at(1) < peakVal * 0.6,
       'top=' + at(1).toFixed(3) + ' peak=' + peakVal.toFixed(3));
  t.ok('and so is the bottom', at(0) < peakVal * 0.6, 'bottom=' + at(0).toFixed(3));
  t.ok('it comes back DOWN after the peak, which a top curve never does',
       at(0.9) < at(peakLin), at(0.9).toFixed(3) + ' < ' + peakVal.toFixed(3));

  /* The control: the same call on a top-curve movement must still climb all the
     way, or this is not a per-movement curve, it is a global one. */
  env.cal.save('chest-press', B, 20, 120);
  const cp = (lin) => env.cal.frac('chest-press', B, 20 + lin * 100);
  t.ok('a top-curve movement still peaks at the top', cp(1) > cp(0.6) && cp(1) === 1,
       cp(0.6).toFixed(3) + ' -> ' + cp(1).toFixed(3));

  /* raw() must NOT follow the curve: the classifier needs the honest
     proportion of the measured range, whatever shape the picture is. */
  t.near('raw() ignores the curve', env.cal.raw(S, B, 70), 0.5, 1e-12);
});

/* ------------------------------------------------------------ 7. band advice */
/* THE BAND RULE IS TWO-SIDED.

   "Don't move up until you can perform 40 slow, controlled full range reps with
   good form. If you can't complete 15 full range reps, reduce the resistance."

   OLD BEHAVIOUR THIS FAILS AGAINST: X3FCal.bandAdvice did not exist. Only the
   first half of the rule was implemented anywhere, as a dashboard line in
   x3f-progress.js, and it had no calf-raise exemption. The half that matters
   more - a band that is too heavy is the one that hurts you - was absent, so
   the app's only coaching was to keep adding load.

   THE CALF RAISE IS NOT EXEMPT, and this suite previously asserted that it was.
   That exemption was invented by this app, and researching the question
   (docs/x3-knowledge/official/band-progression.md, Q7) found NO source that
   exempts any movement: the Quick Start Guide says to start with the lightest
   band "for all exercises" and states the 40-rep trigger without qualification.

   What the source DOES say about the calf raise is "it's much better to do it
   with a lighter band and higher repetitions" - which pulls the other way
   without ever overriding the rule. Those two statements genuinely conflict and
   nothing in X3's material resolves them.

   So the advice still fires, and only the WORDING changes: it carries the
   program's own lighter-band framing and marks itself `soft`, rather than the
   app pretending a tension was resolved when it was not. Asserting silence here
   was asserting a fact about the program that is not true. */
group('7', 'two-sided band advice, and the calf-raise exemption', (t) => {
  const env = load();
  const A = (s, b, r) => env.cal.bandAdvice(s, b, r);

  t.eq('the thresholds are program data', env.ex.protocol.repsMax, 40);
  t.eq('...both of them', env.ex.protocol.repsMin, 15);

  const up = A('chest-press', 'Dark Gray', 41);
  t.eq('40+ full reps says go up', up.dir, 'up');
  t.eq('...and names the next band', up.band, 'Black');
  t.ok('...in a sentence a user can act on', /Black/.test(up.message), up.message);
  t.eq('the threshold is inclusive', A('chest-press', 'Dark Gray', 40).dir, 'up');
  t.eq('one rep under it says nothing', A('chest-press', 'Dark Gray', 39), null);

  const down = A('chest-press', 'Dark Gray', 14);
  t.eq('under 15 full reps says go down', down.dir, 'down');
  t.eq('...and names the lighter band', down.band, 'Light Gray');
  t.eq('15 itself is fine', A('chest-press', 'Dark Gray', 15), null);
  t.eq('and the middle of the range says nothing at all', A('chest-press', 'Dark Gray', 25), null);

  /* A set with no full reps recorded is a set that has not happened yet, not a
     set that failed - advising on it would coach off an empty log. */
  t.eq('zero reps is not advice', A('chest-press', 'Dark Gray', 0), null);

  /* It fires - because no source exempts it - but it is marked soft and it
     carries the program's own counter-argument in the same sentence. */
  const cr = A('calf-raise', 'Light Gray', 60);
  t.eq('a big calf-raise count still says go up, because nothing exempts it', cr.dir, 'up');
  t.ok('...but marked soft, not a flat recommendation', cr.soft === true, JSON.stringify(cr));
  t.ok('...and it states the lighter-band guidance in the same breath',
       /lighter band/i.test(cr.message), cr.message);
  t.ok('...and says staying put is legitimate rather than wrong',
       /legitimate/i.test(cr.message), cr.message);
  t.ok('a normal movement is NOT marked soft', !A('chest-press', 'Dark Gray', 60).soft);
  t.eq('but a calf raise you cannot do 15 of still says go down',
       A('calf-raise', 'Light Gray', 9).dir, 'down');
  t.eq('...to the lighter band', A('calf-raise', 'Light Gray', 9).band, 'White');

  /* The ends of the ladder, where "the next band" does not exist. Both must
     still give an instruction rather than a dead end. */
  const top = A('chest-press', 'Elite Black', 45);
  t.eq('past the heaviest band it still advises', top.dir, 'up');
  t.eq('...with no band to name', top.band, null);
  t.ok('...so it says how to add load instead', /shorten|wrap/i.test(top.message), top.message);

  const bottom = A('chest-press', 'White', 10);
  t.eq('below the lightest band it still advises', bottom.dir, 'down');
  t.eq('...with no band to name', bottom.band, null);
  t.ok('...so it says lengthen the band or regress', /lengthen|regression/i.test(bottom.message),
       bottom.message);

  /* A movement with a documented regression names it, because "go lighter than
     the lightest band" is not otherwise actionable. */
  const ohp = A('overhead-press', 'White', 10);
  t.eq('the overhead press offers its regression', ohp.dir, 'down');
  t.ok('...by name', /kneeling/i.test(ohp.message), ohp.message);
});

/* -------------------------------------------------------------- 8. autolearn */
/* AUTO-LEARN.

   Movements you have never calibrated learn their ceiling from the peaks that
   x3f-set.js already measures, so nothing is broken on day one.

   TWO OLD FAILURES:

   (a) The guard that a real calibration outranks a learned one. This one was
       already right and is here so it stays right - relaxing it would let a
       single heroic set quietly move a number you set on purpose (I3).

   (b) MIN_PEAK = 25, a fixed threshold, blocked exactly the movements that
       needed learning most (D11). A White-band calf raise is a genuinely
       low-force movement, so every set was discarded as "not a real effort" and
       it kept the 130 band ceiling forever: 17% of the screen at all-out
       effort, permanently, with no way out but a manual calibration whose own
       span gate it might also fail. The threshold is now relative to what the
       movement is expected to produce.

   (c) is not an old failure - it is invariant I4, and it is the one thing in
       this suite that the NEW module does not currently satisfy. See the
       comment on it below. */
group('8', 'auto-learn: never over a real calibration, never blocked for weak movements', (t) => {
  /* (a) a real calibration is untouchable */
  const env = load();
  env.cal.save('overhead-press', 'White', REAL_OHP_WHITE.lo, REAL_OHP_WHITE.hi);
  env.cal.observe('overhead-press', 'White', 900);
  const r = env.cal.range('overhead-press', 'White');
  t.eq('a wild peak does not overwrite a real calibration (I3)', r.hi, REAL_OHP_WHITE.hi);
  t.eq('...and does not touch its floor either', r.lo, REAL_OHP_WHITE.lo);
  t.eq('...and it is still marked as yours, not learned', r.auto, false);

  /* (b) the low-force movement the old threshold silently starved */
  const env2 = load();
  t.eq('an unlearned calf raise starts from its own estimate, not the band',
       env2.cal.range('calf-raise', 'White').hi, 88);          // 130 * 0.68
  env2.cal.observe('calf-raise', 'White', 22);                 // under the OLD fixed threshold of 25
  const cr = env2.cal.range('calf-raise', 'White');
  t.eq('a 22-unit peak IS a real effort for a calf raise and is learned', cr.hi, 22);
  t.eq('...and is marked as learned, so a capture can still replace it', cr.auto, true);
  t.not('...instead of leaving it on the old band ceiling forever', cr.hi, WHITE_CEILING);

  /* The threshold is relative, not removed: the same number is noise for one
     movement and a real effort for another. This is the assertion that stops
     someone "fixing" D11 by deleting the guard. */
  const env3 = load();
  env3.cal.observe('deadlift', 'White', 15);
  t.ok('15 units is still noise for a deadlift', env3.cal.range('deadlift', 'White').est === true,
       JSON.stringify(env3.cal.range('deadlift', 'White')));
  const env4 = load();
  env4.cal.observe('calf-raise', 'White', 15);
  t.eq('but the same 15 is a real effort for a calf raise',
       env4.cal.range('calf-raise', 'White').hi, 15);

  /* Learned ceilings ratchet up only, and never below what they already hold. */
  const env5 = load();
  env5.cal.observe('bent-row', 'White', 120);
  env5.cal.observe('bent-row', 'White', 60);
  t.eq('a weaker set does not lower a learned ceiling',
       env5.cal.range('bent-row', 'White').hi, 120);
  env5.cal.observe('bent-row', 'White', 140);
  t.eq('a stronger one raises it', env5.cal.range('bent-row', 'White').hi, 140);

  /* (c) INVARIANT I4 - and where the fix went.

     "Auto-learn is only ever fed a force that is absolute, i.e. only while
     lo === 0" (docs/audit/calibration.md I4). That held while an uncalibrated
     movement had a floor of zero. It stopped holding the moment every movement
     got an ESTIMATED floor, because every game subtracts that floor before it
     draws, and x3f-set.js reports the peak of what the game saw.

     Left alone, an all-out uncalibrated overhead press of 78 absolute is seen
     by the game as 78 - 39 = 39, observe() banks 39 as an absolute ceiling, and
     merely holding the start position then reads as a maximum effort. The v1.6
     symptom, arriving by a new route.

     The audit named two possible fixes: observe() adds the floor back, or its
     caller hands it an absolute peak. THE SECOND WAS CHOSEN, because it also
     fixes a separate defect (D17: peaks logged either side of a calibration are
     in different units, and pb() compares them). A personal best has to be
     measured in a unit that survives recalibration, and only absolute force is.

     So observe()'s contract is now "absolute peak", and the un-flooring lives
     in x3f-set.js absForce(). These assertions pin BOTH halves - the contract,
     and the caller that has to honour it. */

  /* the contract: absolute in, absolute stored */
  const env6 = load();
  env6.cal.observe('overhead-press', 'White', REAL_OHP_WHITE.hi);
  const learned = env6.cal.range('overhead-press', 'White');
  t.eq('an absolute peak is banked as the ceiling unchanged', learned.hi, REAL_OHP_WHITE.hi);
  t.ok('so holding the start position still reads near zero, not full screen (I1)',
       env6.cal.raw('overhead-press', 'White', learned.lo) < 0.5,
       'raw(' + learned.lo + ')=' + env6.cal.raw('overhead-press', 'White', learned.lo).toFixed(2));

  /* the caller: x3f-set.js must un-floor before it reports.

     Driven through the real reporter rather than by re-implementing absForce
     here, because the whole point is the seam between the two files. The getter
     hands back a FLOORED signal, exactly as a game does. */
  /* ?band= pins BOTH modules to the same band for the duration of this run, so
     the assertion is about un-flooring and not about band resolution (which is
     group 9's job). Without it the reporter resolves overhead-press to its
     recommended Light Gray while the assertion talks about White, and the test
     fails for the wrong reason. */
  const env7 = load({ withSet: true, search: '?ex=overhead-press&band=White' });
  const est = env7.cal.range('overhead-press', 'White');       // 39 .. 78, estimated
  t.ok('the reporter loaded', !!env7.reporter, JSON.stringify(env7.missing));
  if (env7.reporter) {
    /* watch() takes its first sample synchronously, on purpose - it must never
       miss a set shorter than one sample interval. So the value is staged
       BEFORE the call rather than relying on a timer the shim does not run. */
    const shown = REAL_OHP_WHITE.hi - est.lo;                  // what the game draws with
    env7.reporter.watch(function () { return shown; });
    const seenPeak = env7.reporter.seen().peak;
    env7.reporter.stop();
    t.ok('x3f-set reports an ABSOLUTE peak, not the floored one it was handed (I4)',
         seenPeak >= REAL_OHP_WHITE.hi - 1,
         'reported ' + Math.round(seenPeak) + ' from a floored ' + Math.round(shown) +
         ' with a floor of ' + est.lo);
  }
});

/* --------------------------------------------------------------- 9. the band */
/* BAND RESOLUTION, ALL SIX LEVELS.

   The bug class that produced D1 is "several places each decide which band you
   are on". x3f-band.js owns the question now, and the order is:

     1. ?band=              an override for THIS RUN only, never persisted
     2. x3f_exBand[slug]    the user's explicit per-movement choice
     3. a real calibration  the healing step for installs already broken by D1
     4. x3f_band            the global - the band physically on the bar now,
                            which itself defaults to White
     5. 'White'             the program says start with the lightest band

   ex.band, the library's RECOMMENDATION, is deliberately not in that chain. It
   is shown as advice and never decides a value. v1.4 already made this call:
   "Routines defaulted every movement to the library's suggestion, so starting a
   day on White silently moved you to Dark Gray, a setting you never chose."
   tools/func-test's routine scenario ("every lift starts on the band you are
   on") pins it from the other side, and the two suites disagreeing is what
   caught an attempt to reverse it here.

   OLD BEHAVIOUR THIS FAILS AGAINST: there was no such function. The Library did
   `libBand[slug] || ex.band` - levels 2 and 4 only. Calibrate read the global.
   A game's ?band= overwrote the global (v1.4's "starting a day on White
   silently moved you to Dark Gray"). Nothing anywhere consulted a calibration,
   which is the level that repairs an install that is already in the D1 state. */
group('9', 'band resolution: all six levels, including the healing case', (t) => {
  /* 1. the run-only override, against a store that has an answer at every other
        level, so this really is testing precedence. */
  const env = load({
    search: '?ex=chest-press&band=Black',
    storage: { x3f_exBand: { 'chest-press': 'Light Gray' }, x3f_band: 'Dark Gray' }
  });
  env.cal.save('chest-press', 'White', 30, 150);
  t.eq('1. ?band= wins over everything', env.band.forMovement('chest-press'), 'Black');
  t.eq('   and is reported as an override', env.band.override(), 'Black');
  t.eq('   it does NOT rewrite the per-movement choice',
       env.get('x3f_exBand')['chest-press'], 'Light Gray');
  t.eq('   and it does NOT rewrite the global (I10)', env.get('x3f_band'), 'Dark Gray');

  /* 2. an explicit per-movement choice */
  const env2 = load({ storage: { x3f_band: 'Dark Gray' } });
  env2.cal.save('chest-press', 'White', 30, 150);
  env2.band.set('chest-press', 'Black');
  t.eq('2. an explicit choice beats a calibration', env2.band.forMovement('chest-press'), 'Black');
  t.eq('   and is reported as explicit', env2.band.explicit('chest-press'), 'Black');
  t.eq('   choosing for one movement does not move the global',
       env2.get('x3f_band'), 'Dark Gray');
  t.eq('   nor any other movement (I11)', env2.band.forMovement('overhead-press'), 'Dark Gray');

  /* 3. the healing step - this is the D1 repair for installs already broken */
  const env3 = load();
  env3.cal.save('chest-press', 'White', 30, 150);
  t.eq('3. a real calibration decides the band', env3.band.forMovement('chest-press'), 'White');
  t.eq('   and calibratedFor reports it', env3.band.calibratedFor('chest-press')[0].band, 'White');
  /* An auto-learned entry is "the biggest number we happened to see" and says
     nothing about which band you meant to be on, so it must NOT heal. */
  const env3b = load();
  env3b.cal.observe('chest-press', 'Black', 300);
  t.eq('   but a LEARNED entry is not a choice', env3b.band.forMovement('chest-press'), 'White');
  /* Two real calibrations: the newest wins, because it is what you did last.
     Both saves land inside the same millisecond here, so the older one is aged
     by hand afterwards - otherwise this would be testing the sort's tie-break
     rather than the rule. X3FBand re-reads storage on every call, so the edit
     is visible to it immediately. */
  const env3c = load();
  env3c.cal.save('chest-press', 'White', 30, 150);
  env3c.cal.save('chest-press', 'Black', 60, 300);
  const aged = env3c.get('x3f_exCal');
  aged['chest-press|White'].t -= 60000;
  env3c.set('x3f_exCal', aged);
  t.eq('   and the newest real calibration wins', env3c.band.forMovement('chest-press'), 'Black');
  t.eq('   with the older one still on record', env3c.band.calibratedFor('chest-press').length, 2);

  /* 4. the global. ADVICE MUST NOT SILENTLY OVERRIDE FACT: an untouched
        movement takes the band that is actually on the bar, not the one the
        library thinks that lift could handle. */
  const env4 = load({ storage: { x3f_band: 'Elite Black' } });
  t.eq('4. an untouched movement takes the global, not the recommendation',
       env4.band.forMovement('chest-press'), 'Elite Black');
  t.eq('   the same for every movement, however different their advice',
       env4.band.forMovement('overhead-press'), 'Elite Black');
  t.eq('   ...and again', env4.band.forMovement('deadlift'), 'Elite Black');
  /* The recommendation is still there, still per movement, still shown - it
     just is not what decides. */
  t.eq('   the recommendation is still readable as advice',
       env4.band.recommended('chest-press'), 'Dark Gray');
  t.eq('   and still differs per movement', env4.band.recommended('upright-row'), 'White');

  /* 5. the global, for a page with no movement in view */
  const env5 = load({ storage: { x3f_band: 'Black' } });
  t.eq('5. no movement in view falls back to the global', env5.band.current(), 'Black');
  t.eq('   forMovement(null) is the global', env5.band.forMovement(null), 'Black');
  t.eq('   and so is a movement the library has never heard of',
       env5.band.forMovement('not-a-movement'), 'Black');

  /* 6. and with nothing at all */
  const env6 = load();
  t.eq('6. a fresh install starts on the lightest band', env6.band.forMovement(null), 'White');
  t.eq('   for an unknown movement too', env6.band.forMovement('nope'), 'White');
  t.eq('   and current() agrees', env6.band.current(), 'White');

  /* The Library's old key is a choice the user really made, so it migrates
     rather than being discarded. */
  const env7 = load({ storage: { x3f_libBand: { deadlift: 'Dark Gray' } } });
  t.eq('a choice made in the old Library is preserved',
       env7.band.forMovement('deadlift'), 'Dark Gray');
  t.eq('...and moved to the key everything now reads',
       env7.get('x3f_exBand').deadlift, 'Dark Gray');

  /* The whole point, stated once: there is ONE answer, and Calibrate asks for
     it the same way a game does. */
  const env8 = load({ storage: { x3f_exBand: { 'bent-row': 'Elite Black' } } });
  t.eq('Calibrate and the games cannot disagree by construction',
       env8.cal.band('bent-row'), env8.band.forMovement('bent-row'));
  t.eq('...whatever the answer is', env8.cal.band('bent-row'), 'Elite Black');
});

/* ----------------------------------------------------------------- 10. */
/* THE ROOT PATCH URL.

   What it looked like: pairing a phone said "Failed to fetch" and nothing else.
   So did creating a household, and so did every upload of a set. The state
   machine was fine, the rules were fine (firebase/verify.sh proved all 23
   assertions green against the live database), auth was fine - a token came
   back with a real uid in it.

   What was happening: a multi-path update is a PATCH at the ROOT, so its path
   is the empty string, and

       databaseURL + '' + '.json'

   is not the root of the database. It is the hostname with '.json' stuck on the
   end - a DIFFERENT HOST, which does not resolve, which fetch reports as the
   same bare "Failed to fetch" it reports when the Wi-Fi is off. Three callers
   pass the empty path and they are the three that matter: create a household,
   confirm a phone, flush a batch of sets. Every write over the web transport
   had been failing since the transport was written.

   Why curl never caught it: firebase/verify.sh writes to "$DB/.json", so it
   hands the code the one character the bug consists of leaving out.

   This group asserts the SHAPE of the URL, with no network and no token, which
   is the only place the defect is actually visible. */
group('10', 'the root multi-path PATCH addresses the database, not a hostname', (t) => {
  const env = load({ withSync: true });
  const S = env.win.X3FSync;
  const DB = 'https://x3f-test-default-rtdb.firebaseio.com';

  t.ok('the sync module loaded', !!S);
  t.ok('and exposes the URL builder as a test seam', !!(S && S._url));
  if (!S || !S._url) return;

  /* The bug, stated as the thing that must never be true again. */
  const root = S._url('PATCH', '', 'TOK');
  t.ok('a root PATCH does not put .json on the hostname',
       root.indexOf('firebaseio.com.json') === -1, root);
  t.ok('a root PATCH targets /.json', root.indexOf(DB + '/.json?') === 0, root);

  /* Everything else must keep working exactly as before. */
  t.ok('a child path is unchanged',
       S._url('GET', '/invites/ABC123', 'TOK').indexOf(DB + '/invites/ABC123.json?') === 0,
       S._url('GET', '/invites/ABC123', 'TOK'));
  t.ok('a deep path is unchanged',
       S._url('GET', '/households/h1/sets/202609', 'TOK')
        .indexOf(DB + '/households/h1/sets/202609.json?') === 0);

  /* The two query parameters are not decoration. auth must be a QUERY param
     because that is the only way EventSource can ever carry it, and print=silent
     turns a write's response into 204-with-no-body on a database that bills
     downloaded bytes. */
  t.ok('auth travels as a query parameter', root.indexOf('auth=TOK') !== -1, root);
  t.ok('writes ask for no response body', root.indexOf('print=silent') !== -1, root);
  t.ok('reads do not', S._url('GET', '/x', 'TOK').indexOf('print=silent') === -1);
  t.ok('a token with URL-unsafe bytes is encoded',
       S._url('GET', '/x', 'a/b+c=').indexOf('auth=a%2Fb%2Bc%3D') !== -1,
       S._url('GET', '/x', 'a/b+c='));

  /* A databaseURL pasted out of the Firebase console with its trailing slash
     produced '//invites/...' before, which RTDB reads as an empty first path
     segment rather than as the root. */
  const env2 = load({ withSync: true, firebase: {
    apiKey: 'k', projectId: 'p', databaseURL: DB + '/' } });
  t.ok('a trailing slash on databaseURL is normalised away',
       env2.win.X3FSync._url('PATCH', '', 'T').indexOf(DB + '/.json?') === 0,
       env2.win.X3FSync._url('PATCH', '', 'T'));
  t.ok('...for child paths too',
       env2.win.X3FSync._url('GET', '/invites/A', 'T').indexOf(DB + '/invites/A.json?') === 0);
});

/* ----------------------------------------------------------------- 11. */
/* A PULLED SET IS NOT A PENDING SET.

   What it looked like: pair a phone, pull the TV's history onto it, and both
   screens said "1 set waiting to upload" - forever, about a set that had just
   come DOWN. Pressing Sync uploaded it again, which content-addressing turned
   into a harmless overwrite of identical bytes at an identical key, so nothing
   ever broke and nothing ever stopped either. Two devices meant every set was
   written twice on a database that bills bytes and has a daily free ceiling.

   Caught by watching status() immediately after a real pull against the live
   database during the pairing test, not by reading pull().

   This asserts the invariant rather than the symptom: everything in local
   history that came from the server must already be marked as sent, because
   setId() is content-addressed and the two sides therefore cannot disagree
   about what "sent" means. */
group('11', 'a set that arrived from the server is not queued to go back', (t) => {
  const env = load({ withSync: true });
  const S = env.win.X3FSync;
  t.ok('the sync module loaded', !!S);
  if (!S) return;

  /* status() computes `pending` by walking history and asking setId() of each
     entry, so the test can pin the whole contract with storage alone - no
     network, no household, no promise. */
  const entry = { t: 1757000000000, ex: 'bent-row', band: 'Dark Gray', reps: 27, peak: 171 };
  const id = S.setId(entry);
  t.ok('setId() is stable for the same content', id === S.setId(Object.assign({}, entry)));

  const seeded = load({
    withSync: true,
    storage: {
      x3f_sync: { hid: 'h', uid: 'u' },
      x3f_history: [entry],
      x3f_syncSent: []
    }
  });
  t.eq('an unsent local set counts as pending',
       seeded.win.X3FSync.status().pending, 1);

  const pulled = load({
    withSync: true,
    storage: {
      x3f_sync: { hid: 'h', uid: 'u' },
      x3f_history: [entry],
      /* what pull() must now write */
      x3f_syncSent: [id]
    }
  });
  t.eq('the same set, recorded as received, counts as nothing',
       pulled.win.X3FSync.status().pending, 0);

  /* And the guard that makes the fix legitimate: the id pull() records is the
     id push() would compute. If unwire() ever dropped or renamed one of the
     fields setId() hashes, the two would diverge silently and the duplicate
     writes would come back. */
  const roundTripped = {
    t: entry.t, ex: entry.ex, band: entry.band, reps: entry.reps, peak: entry.peak,
    _sid: id, _remote: 1
  };
  t.eq('a set survives the wire with its identity intact',
       S.setId(roundTripped), id);
});

/* ----------------------------------------------------------------- 12. */
/* EVERY BAND PRINTS A WEIGHT, ON EVERY MOVEMENT.

   Reported from real use: "the elite black didn't show any weight ranges."

   It did not, on five of eleven movements. BAND_FORCE stores a singled and a
   doubled figure per band, X3 publishes both for the four lighter bands and only
   one for the Elite, so its doubled entry is [null, null] - and forceLabel()
   returned '' the moment the movement's configuration had no published pair.
   Chest press, tricep press, deadlift, bent row and calf raise are all doubled,
   so the heaviest band in the system printed a blank where every lighter band
   printed a number, in all eight places that call forceLabel: the Library card,
   the Calibrate picker, the Routine coach, two Progress tables, the home's
   movement cards and onboarding.

   Nothing about the DATA was wrong, which is why reading the table would not have
   found it - the bug only exists at the crossing of a band with a movement, and
   that crossing is what this group walks. Exhaustively: every band against every
   movement, because "the heaviest band on half the movements" is exactly the kind
   of gap a spot check misses. */
group('12', 'every band shows a published weight on every movement', (t) => {
  const env = load();
  const EX = env.win.X3FEX;
  t.ok('the exercise module loaded', !!EX);
  if (!EX) return;

  const moves = EX.list.map(e => e.slug);   /* EX.list is an ARRAY, not a getter */
  t.ok('there are eleven movements', moves.length === 11, String(moves.length));

  let blanks = [];
  EX.bands.forEach(b => moves.forEach(m => {
    if (!EX.forceLabel(b, m)) blanks.push(b + '/' + m);
  }));
  t.ok('no band+movement pair prints a blank weight', blanks.length === 0, blanks.join(', '));

  /* The specific regression, named, so a future reader sees the bug and not just
     the invariant. */
  ['chest-press', 'tricep-press', 'deadlift', 'bent-row', 'calf-raise'].forEach(m => {
    t.eq('Elite Black shows its published range on ' + m,
         EX.forceLabel('Elite Black', m), '110–600 lb');
  });

  /* And the fallback must not leak into bands that DO publish both figures - a
     doubled movement on Dark Gray must still say 240+, not 50-120. */
  t.eq('a doubled movement still uses the doubled figure',
       EX.forceLabel('Dark Gray', 'deadlift'), '240+ lb');
  t.eq('a singled movement still uses the singled figure',
       EX.forceLabel('Dark Gray', 'overhead-press'), '50–120 lb');
  t.eq('...and the two genuinely differ', EX.forceLabel('Dark Gray', 'deadlift') !== EX.forceLabel('Dark Gray', 'overhead-press'), true);

  /* An unknown band still declines to invent anything. */
  t.eq('an unknown band prints nothing', EX.forceLabel('Chartreuse', 'deadlift'), '');
});

/* ----------------------------------------------------------------- 13. */
/* AUTO-LEARN MUST NOT ERASE THE START-POSITION FLOOR.

   The first set you ever log on an uncalibrated movement used to wipe its floor.
   observe() wrote `lo: (e && e.lo) || 0`, and on the first call there is no
   previous entry, so lo became 0 - and range() prefers a stored entry over an
   estimate, so the floor was gone permanently.

   That floor is not decoration. An overhead press starts at chin height with the
   band already loaded; x3f-cal.js's own header exists to explain why treating 0
   as "no effort" puts the bottom of the range near the top of the screen. It
   measured 0% of screen height at the start position before, and 63% after one
   logged set - and every movement was affected.

   Group 8 already covers auto-learn's precedence rules and passed throughout,
   because it asserts what observe() may OVERWRITE and never what it must
   PRESERVE. This is that half. */
group('13', 'auto-learn keeps the movement floor it was given', (t) => {
  const env = load();
  const C = env.cal;

  const MOVES = ['overhead-press', 'chest-press', 'tricep-press', 'deadlift',
                 'bent-row', 'front-squat', 'calf-raise'];

  MOVES.forEach(m => {
    const est = C.range(m, 'White');
    /* The invariant, stated where it is felt: at the start position the display
       reads zero. If the floor is lost, this is the number that moves. */
    t.near('at rest ' + m + ' draws at the bottom before any set',
           C.frac(m, 'White', est.lo), 0, 0.001);
    C.observe(m, 'White', 80);
    t.near('...and still does after one auto-learned set',
           C.frac(m, 'White', C.range(m, 'White').lo), 0, 0.001);
    t.ok('the floor itself is preserved, not zeroed',
         C.range(m, 'White').lo > 0, 'lo=' + C.range(m, 'White').lo);
  });

  /* And the thing group 8 does assert must still hold: a real calibration is
     never overwritten by an observation. */
  const env2 = load({ storage: { x3f_exCal: { 'deadlift|White': { lo: 30, hi: 120, auto: false } } } });
  env2.cal.observe('deadlift', 'White', 400);
  t.eq('a real calibration still wins over auto-learn',
       env2.cal.range('deadlift', 'White').hi, 120);
});

module.exports = { groups };
