/* X3F CAL - per-movement force calibration, and the force -> screen mapping.

   A movement+band is a RANGE, not a ceiling:

     lo   the force your START POSITION already carries
     hi   your all-out max

   Games subtract lo and scale the rest to (hi - lo), so the bottom of the
   movement reads as the bottom of the screen and the top reads as the top.

   WHY A FLOOR AT ALL. The overhead press starts at chin height with the band
   already stretched under the midfoot, so its start position is carrying real
   load before you have done anything. The program's own figure: "you might be
   holding 75 pounds here in an overhead press, and then as you're pushing over
   your head, it might go to 150." Half its peak force is present at rest. Every
   game used to treat 0 as "no effort", so the bottom of the range already read
   near the top of the screen.

   WHAT CHANGED IN THIS REWRITE

   1. The band is resolved by x3f-band.js, not by each caller. Calibrate and the
      games now ask the same question and get the same answer, which is what
      made a calibration land under one key and get looked up under another.

   2. Uncalibrated movements no longer start at lo:0, hi:<one number per band>.
      Both ends are now estimated per movement:

        lo = hi * ex.floorFrac      how much load the start position carries
        hi = bandCeiling * hiFrac   how much this movement can produce relative
                                    to the strongest movement on the same band

      Sanity check against the one real capture in the repo's history: a White
      band overhead press measured 52-78. This model predicts hi = 130 * 0.60 =
      78 and lo = 78 * 0.50 = 39. The ceiling is exact and the floor errs low,
      which is the safe direction - a floor that is too HIGH reads 0 for the
      whole set, which is the worst failure this file can produce.

   3. range() validates. It used to trust whatever was in storage, so an import
      carrying {lo:500, hi:100} produced a floor of 500 and a span of 10, and
      nothing in the app could detect or repair it.

   4. Calibrations are timestamped and age is exposed, because a stale band max
      silently skews every intensity reading in the app and nothing recorded
      when it was last measured.

   5. frac() is here rather than in each game. It applies the eased curve and
      the per-movement strength-curve shape, so all eight games get the same
      correct mapping and the bent row - whose strongest range is the MIDDLE -
      stops being drawn as though harder always means higher.

     X3FCal.slug()                    movement this page is running, or null
     X3FCal.band(slug)                the band it is on (via X3FBand)
     X3FCal.range(slug, band)         -> {lo, hi, auto, t}
     X3FCal.floor(slug, band)         -> lo
     X3FCal.span(slug, band)          -> hi - lo, never below MIN_SPAN
     X3FCal.frac(slug, band, force)   -> 0..1 for drawing. USE THIS.
     X3FCal.raw(slug, band, force)    -> 0..1 linear, for thresholds and logic
     X3FCal.save(slug, band, lo, hi)  -> true | {error, message}
     X3FCal.observe(slug, band, peak) feed a finished set's peak
     X3FCal.age(slug, band)           -> days since calibration, or null
     X3FCal.stale(slug, band)         -> bool
     X3FCal.bandAdvice(slug, band, fullReps) -> {dir, message} | null
     X3FCal.clear(slug, band)
     X3FCal.all()
*/
(function () {
  "use strict";

  var KEY = 'x3f_exCal';
  var BAND_DEF = { 'White': 130, 'Light Gray': 230, 'Dark Gray': 330, 'Black': 430, 'Elite Black': 600 };

  /* How much force a movement can produce relative to the strongest movement on
     the SAME band. One number per band was wrong because a deadlift and a pec
     crossover on a Black band are nowhere near each other, so a scale set by
     one leaves the other unusable. Ordered by the source's own guidance on
     which movements take the heaviest bands. */
  var HI_FRAC = {
    'deadlift': 1.00,
    'bent-row': 0.92,
    'chest-press': 0.86,
    'front-squat': 0.82,
    'split-squat': 0.72,
    'calf-raise': 0.68,
    'overhead-press': 0.60,
    'drag-curl': 0.58,
    'tricep-press': 0.55,
    'upright-row': 0.52,
    'pec-crossover': 0.50
  };

  /* The smallest range we will scale by. This started at 40 and was wrong: a
     White band overhead press genuinely spans only ~20-35 units between its
     start tension and an all-out press, so honest calibrations were refused as
     "too narrow to be real". 10 is low enough to accept a light band and still
     high enough that dividing by it is not noise amplification. */
  var MIN_SPAN = 10;

  /* A calibration older than this is worth re-checking - bands age, and your
     max moves. Surfaced, never enforced. */
  var STALE_DAYS = 42;

  function read(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k)); return (v === null || v === undefined) ? d : v; }
    catch (e) { return d; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* range() is called from inside draw loops - Bloom asks ~10x a frame - so the
     parsed map is cached and only re-read a couple of times a second. Writes
     drop the cache immediately, so a fresh calibration is never stale. */
  var cache = null, cacheAt = 0;
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function map() {
    var t = nowMs();
    if (cache && t - cacheAt < 500) return cache;
    var m = read(KEY, {});
    cache = (m && typeof m === 'object') ? m : {};
    cacheAt = t;
    return cache;
  }
  function flush(m) { write(KEY, m); cache = m; cacheAt = nowMs(); }
  function id(slug, band) { return String(slug || '') + '|' + String(band || ''); }

  function ex(slug) {
    try { return (window.X3FEX && window.X3FEX.get(slug)) || null; } catch (e) { return null; }
  }

  /* The band this page's movement is on. Delegated so there is exactly one
     answer in the app. Falls back gracefully if x3f-band.js is not loaded, so
     a page that forgets the script degrades instead of throwing. */
  function bandFor(slug) {
    try { if (window.X3FBand) return window.X3FBand.forMovement(slug); } catch (e) {}
    try {
      var v = JSON.parse(localStorage.getItem('x3f_band'));
      if (typeof v === 'string' && v) return v;
    } catch (e) {}
    return 'White';
  }

  /* The user's measured ceiling for a band if they have one, else the shipped
     default. Clamped so a corrupted or polluted value cannot make every
     movement unusable. */
  function bandCeiling(band) {
    var bm = read('x3f_bandMax', {});
    var v = (bm && bm[band]);
    var def = BAND_DEF[band] || 130;
    if (!(v > 0)) return def;
    /* A band max that is wildly off the shipped figure is far more likely to be
       pollution than a real measurement - Arena used to write a floored,
       unit-scaled number straight into this key, and a refused calibration used
       to raise it anyway. Trust it inside a sane window, ignore it outside. */
    if (v < def * 0.25 || v > def * 4) return def;
    return v;
  }

  /* Which movement is this page running? An explicit ?ex=, else the set the
     guided Routine is waiting on. Kept here so eight games do not each
     re-derive it. */
  function slug() {
    var s = null;
    try { s = (new URLSearchParams(location.search)).get('ex'); } catch (e) {}
    if (s) return s;
    try {
      var sess = JSON.parse(localStorage.getItem('x3f_session') || 'null');
      if (sess && sess.active && sess.pending && sess.pending.slug) return sess.pending.slug;
    } catch (e) {}
    return null;
  }

  /* The estimate used until a real calibration exists. Both ends move per
     movement, which is the whole point. */
  /* The movement's start-position load as a fraction of its top. Named because
     TWO callers need it and they must never disagree: estimate() builds a range
     from it, and observe() has to re-apply it when auto-learn establishes a new
     top. When only estimate() knew it, the first auto-learned set flattened the
     floor to zero. */
  function floorFrac(sl) {
    var e = ex(sl);
    return (e && typeof e.floorFrac === 'number') ? e.floorFrac : 0;
  }

  function estimate(sl, band) {
    var ceiling = bandCeiling(band);
    var hf = HI_FRAC[sl];
    var hi = (hf > 0) ? ceiling * hf : ceiling;
    return { lo: Math.round(hi * floorFrac(sl)), hi: Math.round(hi), auto: true, t: 0, est: true };
  }

  /* Validated read. A stored entry is only used if it is actually usable; a
     broken one falls back to the estimate rather than poisoning every frame.
     This is the check that was missing when an import could carry lo > hi. */
  function range(sl, band) {
    band = band || bandFor(sl);
    if (!sl) return { lo: 0, hi: bandCeiling(band), auto: true, t: 0, est: true };
    var e = map()[id(sl, band)];
    if (e && typeof e === 'object') {
      var lo = Math.max(0, +e.lo || 0), hi = +e.hi || 0;
      if (hi > 0 && hi - lo >= MIN_SPAN) {
        return { lo: lo, hi: hi, auto: !!e.auto, t: e.t || 0, est: false };
      }
    }
    return estimate(sl, band);
  }

  function floor(sl, band) { return range(sl, band).lo; }
  function span(sl, band) { var r = range(sl, band); return Math.max(MIN_SPAN, r.hi - r.lo); }

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  /* Linear 0..1 through the calibrated range. Use this for LOGIC - rep
     detection, thresholds, tier classification - because it is the honest
     proportion of your measured range. */
  function raw(sl, band, force) {
    var r = range(sl, band);
    var s = Math.max(MIN_SPAN, r.hi - r.lo);
    return clamp01(((+force || 0) - r.lo) / s);
  }

  /* 0..1 for DRAWING. Two corrections the linear value does not have:

     1. The strength curve is steeply non-linear - "in the middle of the range
        of motion... sort of a medium force. Lower than the high force, but not
        really half of what would be expected because there's actually a rather
        aggressive curve". Mapping force linearly to height squashes the strong
        range, where the entire program lives, into a thin band at the top of
        the screen and makes the middle look weaker than it feels. Easing it
        gives the top the room it deserves and makes 90% vs 100% readable from
        a sofa.

     2. The bent row's strongest position is the MIDDLE, not the top, because
        the lat and bicep curves cross. Drawing "more force = higher" for it is
        drawing the wrong picture, so its peak sits mid-range and comes back
        down. */
  function frac(sl, band, force) {
    var lin = raw(sl, band, force);
    var e = ex(sl);
    var expo = 0.65;
    try {
      if (window.X3FEX && window.X3FEX.protocol && window.X3FEX.protocol.curveExp) {
        expo = window.X3FEX.protocol.curveExp;
      }
    } catch (err) {}
    if (e && e.curve === 'mid') {
      /* Peaks at the middle of the movement and eases off either side, so the
         display matches where the power actually is. */
      var d = Math.abs(lin - 0.55) / 0.55;
      return clamp01(1 - Math.pow(clamp01(d), 1.6)) * Math.pow(clamp01(lin * 1.15), 0.35);
    }
    return Math.pow(lin, expo);
  }

  /* Returns true, or an object explaining what was wrong so the UI can say what
     it measured instead of just refusing. Nothing outside this function may
     write to x3f_exCal, and nothing writes at all unless the capture is good -
     Calibrate used to raise the global band ceiling even when the capture was
     refused, which permanently mis-scaled every other movement on that band
     with no UI anywhere to undo it. */
  function save(sl, band, lo, hi) {
    if (!sl) return { error: 'no-movement', message: 'No movement selected.' };
    band = band || bandFor(sl);
    lo = Math.max(0, +lo || 0);
    hi = +hi || 0;
    if (!(hi > 0)) {
      return { error: 'no-max', message: 'No force was measured during the max. Is the bar connected and zeroed?' };
    }
    if (hi <= lo) {
      return {
        error: 'max-below-hold',
        message: 'The max (' + Math.round(hi) + ') came out no higher than the hold (' + Math.round(lo) +
                 '). Re-zero with the band unloaded, hold your start position, then go all out.'
      };
    }
    if (hi - lo < MIN_SPAN) {
      return {
        error: 'too-narrow',
        message: 'Only ' + Math.round(hi - lo) + ' between hold and max; needs ' + MIN_SPAN +
                 '. Check the band is actually loaded at your start position, then run it again.'
      };
    }
    var m = map();
    m[id(sl, band)] = { lo: Math.round(lo), hi: Math.round(hi), auto: false, t: Date.now() };
    flush(m);
    return true;
  }

  /* Auto-learn, ceiling only. An explicit calibration outranks it and is never
     overwritten - otherwise one heroic set would quietly move a number you set
     on purpose.

     THE PEAK MUST BE ABSOLUTE - the real bar force, not the floored value a
     game draws with. x3f-set.js un-floors before calling this (see absForce
     there); anything else that calls it must do the same.

     This was safe by accident until now, because an uncalibrated movement had a
     floor of ZERO and the two numbers were identical. Every movement now starts
     from an estimated floor, because a start position genuinely carries load, so
     they are not identical any more. Feed a floored peak here and it learns a
     ceiling short by exactly the floor - after which merely holding the start
     position reads as a maximum effort. That is the v1.6 symptom arriving by a
     new route. tools/force-test case 8 guards it; do not weaken that test.

     The old fixed threshold of 25 blocked exactly the movements that needed
     this most: a White-band calf raise is a genuinely low-force movement, so
     every set was discarded and it kept a 130 ceiling forever - 17% of the
     screen at all-out effort, permanently. The threshold is now relative to
     what the movement is expected to produce. */
  function observe(sl, band, peak) {
    if (!sl) return;
    band = band || bandFor(sl);
    peak = +peak || 0;
    var est = estimate(sl, band);
    var floorPeak = Math.max(MIN_SPAN, est.hi * 0.15);
    if (peak <= floorPeak) return;
    var m = map(), k = id(sl, band), e = m[k];
    if (e && e.auto === false) return;
    if (e && e.hi >= peak) { e.n = (e.n || 1) + 1; flush(m); return; }
    /* SEED THE FLOOR FROM THE ESTIMATE, NEVER FROM ZERO.

       This wrote `lo: (e && e.lo) || 0`, and on the FIRST auto-learn there is no
       previous entry - so lo became 0 and range() then preferred that stored
       entry over estimate(), erasing the movement's start-position floor for
       good. Which is the exact defect the header of this file exists to describe:
       an overhead press begins at chin height with the band already loaded, and
       treating 0 as "no effort" puts the bottom of the range near the top of the
       screen. Measured: overhead press on White read 0% of screen height at the
       start position, and 63% after one logged set. Every movement was affected -
       deadlift 22%, bent row 21%, chest press 40%, tricep press 49%.

       It also crossed x3f-set.js's TUT_FRAC of 0.15, so on nine of eleven
       movements time-under-tension accrued while the user simply stood holding
       the bar, and the rep-amplitude threshold grew with the widened span, making
       the weak-range partials the program cares about harder to detect.

       force-test group 8 covers auto-learn's precedence and asserted nothing
       about lo, which is why it passed throughout.

       SCALED TO THE OBSERVED TOP, not copied from the estimate. The floor is a
       FRACTION of the top - estimate() is literally `hi * floorFrac` - so lifting
       the estimate's absolute lo produces lo > hi whenever the observed peak
       comes in under the estimated floor. range() then rejects the entry as
       broken and falls back to the estimate, which is how the first version of
       this fix put a calf raise back on 88 after learning 22. Same fraction,
       applied to the number actually measured. */
    var ff = floorFrac(sl);
    m[k] = { lo: Math.round(Math.round(peak) * ff), hi: Math.round(peak), auto: true, n: ((e && e.n) || 0) + 1, t: Date.now() };
    flush(m);
  }

  function age(sl, band) {
    var r = range(sl, band);
    if (!r.t || r.auto) return null;
    return Math.floor((Date.now() - r.t) / 86400000);
  }
  function stale(sl, band) {
    var a = age(sl, band);
    return a !== null && a >= STALE_DAYS;
  }

  /* The program's band rule, both halves of it:

       "Don't move up until you can perform 40 slow, controlled full range reps
        with good form. If you can't complete 15 full range reps, reduce the
        resistance."

     Only the first half was implemented. The second half matters more, because
     a band that is too heavy is the one that hurts you.

     THE CALF RAISE IS NOT EXEMPT, and an earlier version of this file said it
     was. That was invented. No X3 source exempts any movement: the Quick Start
     Guide says "start with the lightest band FOR ALL EXERCISES" and the trigger
     is stated without qualification. What the source DOES say about the calf
     raise is "it's much better to do it with a lighter band and higher
     repetitions" - which pulls the other way without ever overriding the rule.

     So the advice is the same and only the WORDING differs: for the calf raise
     it says both things and leaves the choice open, rather than pretending the
     program resolved a tension it did not. x3f-graduate.js does the same, and
     offers it only once. */
  function bandAdvice(sl, band, fullReps) {
    band = band || bandFor(sl);
    var P = (window.X3FEX && window.X3FEX.protocol) || { repsMin: 15, repsMax: 40 };
    var bands = (window.X3FEX && window.X3FEX.bands) || ['White', 'Light Gray', 'Dark Gray', 'Black', 'Elite Black'];
    var i = bands.indexOf(band);
    if (fullReps >= P.repsMax && sl === 'calf-raise') {
      return { dir: 'up', band: (i >= 0 && i < bands.length - 1) ? bands[i + 1] : null, soft: true,
               message: fullReps + ' full reps. You could move up — but X3 prescribes the calf raise ' +
                        'with a lighter band and higher reps, so staying here is a legitimate choice.' };
    }
    if (fullReps >= P.repsMax) {
      if (i < 0 || i >= bands.length - 1) {
        return { dir: 'up', band: null, message: fullReps + ' full reps on the heaviest band. Shorten the band instead — wrap it around the hook once or twice.' };
      }
      return { dir: 'up', band: bands[i + 1], message: fullReps + ' full reps means this band stopped being heavy. Move up to ' + bands[i + 1] + '.' };
    }
    if (fullReps > 0 && fullReps < P.repsMin) {
      var e = ex(sl);
      if (e && e.regression) {
        return { dir: 'down', band: (i > 0 ? bands[i - 1] : null),
                 message: 'Under ' + P.repsMin + ' full reps. Go lighter' + (i > 0 ? ' — try ' + bands[i - 1] : '') + ', or use the ' + e.regression.name.toLowerCase() + '.' };
      }
      if (i <= 0) {
        return { dir: 'down', band: null, message: 'Under ' + P.repsMin + ' full reps on the lightest band. Lengthen the band, or use a regression — form comes before force.' };
      }
      return { dir: 'down', band: bands[i - 1], message: 'Under ' + P.repsMin + ' full reps means this band is too heavy. Drop to ' + bands[i - 1] + '.' };
    }
    return null;
  }

  function clear(sl, band) {
    band = band || bandFor(sl);
    var m = map(); delete m[id(sl, band)]; flush(m);
  }

  window.X3FCal = {
    slug: slug, band: bandFor,
    range: range, floor: floor, span: span,
    raw: raw, frac: frac,
    save: save, observe: observe, clear: clear,
    age: age, stale: stale, bandAdvice: bandAdvice,
    estimate: estimate,
    all: map, bands: BAND_DEF, minSpan: MIN_SPAN, staleDays: STALE_DAYS
  };
})();
