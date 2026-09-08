/* X3F SET - one way for a game to say "a set just finished", and the engine that
   works out what actually happened during it.

   A game calls this once when a set ends. Everything else - which movement,
   which band, what the force trace says about the set, whether a personal best
   fell, which achievements unlocked, how to show that - is handled here so no
   game has to care.

     X3FSet.watch(function () { return force }, function () { return ref() });
     ...
     X3FSet.report({ g: 'flow', reps: 22, secs: 96, hype: hype });

   WHAT CHANGED IN THIS REWRITE, and why each one matters

   1. THE SET HAS THREE TIERS, NOT TWO. The app modelled "full reps, then
      partials". The program describes three, verbatim:

        "you move to full extension without lockout until you can no longer
         reach that stronger range. Then you perform partial repetitions in the
         mid range. When you've gone to an even higher level of fatigue, you
         won't be able to use the mid range anymore either, so then you just
         have very short weak range repetitions."

      So a set is FULL RANGE -> MID-RANGE partials -> WEAK-RANGE partials ->
      failure, and the rep amplitude falls through TWO thresholds on the way
      down, not one. That is directly measurable from the force trace, and it
      gives the app three genuinely different things to coach and to celebrate
      instead of one undifferentiated "partials" counter.

      Each rep is graded against the top THIS SESSION established, not against
      the calibrated max. Fatigue is relative to what you managed today: if you
      came in tired and never reached your best, the reps you did manage are
      still your full range, and the collapse away from them is still the point
      of the set.

   2. PER-MOVEMENT EXPECTATIONS. X3FEX.partials says what a movement should
      yield after full-range failure. Almost everything gives 4-6. The bent-over
      row gives 10-15, because its strongest position is the MIDDLE - the lat
      and bicep curves cross there - so its mid-range partials are the powerful
      ones. A generic "you did a lot of partials, well done" is wrong on a bent
      row and wrong on a chest press in opposite directions, so the verdict is
      always against that movement's own range.

   3. FORM FAULTS, FROM THE PROGRAM'S OWN CONSTANT-TENSION RULE. Slack at the
      bottom, lockout at the top and rushing are all real coaching, all stated
      by the source, and all visible in the force signal. Trembling near the top
      is ALSO visible and is the opposite of a fault - "that is just the
      stabilization muscles trying to assist... it's a great thing" - so it is
      detected and reported as praise. The reporter returns counts and the WORST
      offender, so a summary can say one useful sentence instead of a list.

   4. TIME IN THE STRONG RANGE. The whole method is about living near full
      extension, and the app had no number for it. It does now: seconds spent at
      or above 0.85 of the calibrated range.

   5. tracked:false. The Hypertrophy program is one tracked PR set plus four
      untracked volume sets. An untracked set is real training and is logged,
      but it must never move a personal best, grade a challenge, unlock an
      achievement or teach a calibration a new ceiling.

   6. ONE MOVEMENT RESOLUTION, ONE BAND RESOLUTION. This file used to read ?ex=
      and nothing else while x3f-cal.js also fell back to the guided session's
      pending movement - so on any path that lost the query string the game
      scaled to the Routine's movement and the reporter logged no movement at
      all, which silently killed auto-learn. It now asks X3FCal.slug() and
      X3FBand.forMovement(), the same two functions the scaling asks, so what
      gets logged and what got scaled can never disagree.

   REPORTED FIELDS. All optional - report what your game actually measures, and
   the watcher fills in the rest:

     reps/full/part  rep counts, if the game counts reps itself
     peak            peak force this set
     tut             seconds of tension
     ecc             average lowering-phase seconds
     secs, score     duration and whatever the game calls a score
     tracked         false for a volume set that must not touch PBs
     hype            the game's hype layer, for unlock callouts

   THE FORCE THE WATCHER IS GIVEN. Every game hands over its own `force`, which
   is already floored by the movement's calibrated lo, and `ref()`, which is
   X3FCal.span(). force/ref() is therefore exactly X3FCal.raw() of the unfloored
   signal - the LINEAR proportion of the measured range. Every threshold in this
   file is applied to that linear value and never to X3FCal.frac(), which is the
   eased DISPLAY curve: easing a threshold silently moves it (0.85 eased is 0.90
   linear), and a rep classifier that drifts with a drawing decision is a bug
   waiting to happen. */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Tunables.                                                          *
   *                                                                     *
   *  The ones the PROGRAM states live in X3FEX.protocol, so nothing     *
   *  re-invents them. The ones below are detector heuristics this file  *
   *  owns; each carries the reasoning for its value, because a number   *
   *  with no rationale is a number nobody dares change.                 *
   * ------------------------------------------------------------------ */

  /* Four game pages (Arena, Duel, Flow, Rhythm) load x3f-progress.js without
     x3f-exercises.js, so the protocol can genuinely be absent. These fallbacks
     are the same numbers X3FEX.protocol carries; they are a safety net, not a
     second source of truth. */
  var FALLBACK = {
    fullRangeFrac: 0.85, midRangeFrac: 0.45,
    repMinMs: 4000, repIdealMs: 5000, repsMin: 15, repsMax: 40
  };
  function proto() {
    try { return (window.X3FEX && window.X3FEX.protocol) || FALLBACK; } catch (e) { return FALLBACK; }
  }
  function ex(slug) {
    try { return (window.X3FEX && window.X3FEX.get(slug)) || null; } catch (e) { return null; }
  }

  var SAMPLE_MS = 40;      // 25 Hz. Unchanged from v1.2 - the tut numbers already
                           // in the user's history were accumulated at this rate,
                           // and changing it would make old and new sets
                           // incomparable for no gain.

  var TUT_FRAC = 0.15;     // "under tension" = holding a real fraction of the
                           // band, not merely touching it. Also unchanged from
                           // v1.2, for the same reason.

  var STRONG_FRAC = 0.85;  // Time in the strong range is measured against the
                           // CALIBRATED range, not the session top, so it is
                           // comparable week to week - the session top moves with
                           // fatigue and would make the metric grade itself.
                           // Same 0.85 as the full-range tier so the two numbers
                           // describe the same place on the bar.

  var REP_MIN_AMP = 0.06;  // The smallest excursion, as a fraction of the
                           // calibrated span, that counts as a rep at all. The
                           // last reps of a set are meant to be tiny - "until the
                           // last rep is an inch" - so this has to be small. On a
                           // White-band overhead press (a real capture: 52 hold,
                           // 78 max, span 26) 0.06 is 1.6 force units: far below
                           // any deliberate movement, and far above breathing,
                           // grip shuffle and load-cell jitter.

  var REP_END_FRAC = 0.50; // A rep closes once the force has retreated halfway
                           // back down from its peak. Requiring a return all the
                           // way to the bottom would drop the shallow reps at the
                           // end of a set, where the trough drifts upward with
                           // fatigue; a much higher fraction chatters on the
                           // wobble at the top. Half of the rep's own amplitude
                           // scales correctly for both a full rep and an inch.

  var REP_MAX_MS = 20000;  // Anything slower than this is a rest, not a rep, and
                           // is excluded from the tempo statistics so a pause
                           // between reps cannot flatter the average.

  /* SLACK AT THE BOTTOM. "Never let the band go slack at the bottom."

     The signal the games hand over is clamped at zero (force = max(0, raw -
     baseline - lo)), so a force that has fallen BELOW the calibrated lo and a
     force sitting exactly AT it both read as zero. What separates them is dwell:
     a correct turnaround touches the bottom and reverses immediately - the
     program also says not to pause at the bottom - while going slack parks
     there. A caller that can supply the unfloored force (watch's opts.abs) gets
     the literal test instead. */
  var SLACK_FRAC = 0.04;   // "at the floor" = within 4% of the calibrated span
                           // of lo. Wide enough to survive an estimated lo that
                           // is a little low (x3f-cal deliberately errs low) and
                           // narrow enough that a full or mid range rep only
                           // passes through it. A WEAK range rep does live inside
                           // it, which is why slack is not judged on those at all
                           // - see analyse().
  var SLACK_MS = 600;      // Dwell required. Derive it: at the prescribed 2-3 s
                           // each way, the bottom 4% of the span is crossed in
                           // about 100 ms going down and 100 ms coming back, so
                           // a correct turnaround spends roughly 200 ms there and
                           // a slow one 300 ms. 600 ms is three times a clean
                           // reversal and still well short of the second or so it
                           // takes to actually reset a grip - a stop, not a
                           // turnaround. Measured on a synthetic 30-rep trace the
                           // honest reps read 160-520 ms and two deliberate rests
                           // read 1520 and 1680 ms.
  var SLACK_MARGIN = 0.10; // Only for the unfloored path: slack means below
                           // 90% of lo, so an lo that is an estimate rather than
                           // a measurement cannot generate a fault on its own.

  /* LOCKOUT AT THE TOP. "as soon as my arm gets straight, this starts to shut
     off." At lockout the skeleton takes the load, the muscle disengages, and the
     trace shows a spike that collapses far faster than it was built. Both halves
     are required: a collapse that is merely fast is a fast rep (that is the
     rushing detector's business), and a slow arrival at a high peak with a slow
     departure is exactly the rep the program wants. */
  var LOCK_BAND = 0.85;    // Measure the top 15% of the rep's OWN amplitude.
  var LOCK_MS = 250;       // The fall through that band must take under 250 ms -
                           // roughly a tenth of a prescribed 2-3 s descent, which
                           // is a collapse rather than a lowering.
  var LOCK_RATIO = 3;      // ...and be at least 3x faster than the rise through
                           // the same band was. That ratio is what makes it
                           // "spiked, then dropped" rather than "moved quickly".
  var LOCK_MIN_TIER = 0.50;// Only reps that reached at least half of the session
                           // top can lock out. You cannot lock out an inch.

  /* TREMBLE. Praise, never a warning. */
  var TREM_ZONE = 0.80;    // Only near the peak of the rep, which is where the
                           // source describes it and where stabilisers are
                           // actually loaded.
  var TREM_AMP = 0.015;    // A direction reversal only counts if the swing into
                           // it exceeded 1.5% of the calibrated span, so sensor
                           // noise cannot manufacture praise.
  var TREM_HZ = 3;         // Three qualifying reversals per second - one and a
                           // half oscillations - is a visible shake. At a 25 Hz
                           // sample rate the detector can see wobbles up to about
                           // 12 Hz, which comfortably covers physiological
                           // tremor; it under-reports rather than over-reports.
  var TREM_MIN_MS = 300;   // ...measured over at least 300 ms and at least two
                           // reversals. A rate computed from a couple of samples
                           // is noise wearing a number, and this one is shown to
                           // the user as praise - it has to be true.
  var TREM_MIN_N = 2;

  var FAULT_MIN = 2;       // A fault is only reported once it has happened twice.
                           // Every detector here is a heuristic on a noisy
                           // signal, and this text is shown to the user as
                           // coaching - one detection is not enough to say it
                           // out loud.

  var BUF_MAX = 600;       // ~24 s of samples. One rep, not one set: the buffer
                           // is cleared every time a rep closes.

  var TOAST_MS = 3200;

  /* ------------------------------------------------------------------ *
   *  Context: which movement, which band, tracked or not.               *
   * ------------------------------------------------------------------ */

  function param(name) {
    try { return (new URLSearchParams(location.search)).get(name); } catch (e) { return null; }
  }
  function session() {
    try { return JSON.parse(localStorage.getItem('x3f_session') || 'null'); } catch (e) { return null; }
  }

  /* ONE resolution, shared with the scaling. This used to be `?ex=` only while
     x3f-cal.js also fell back to the guided session's pending movement, so on
     any path that lost the query string - the TV launcher, browser back into a
     cached URL, the service worker's offline fallback - the game scaled itself
     to the Routine's movement while the reporter logged `ex: null`, and
     X3FCal.observe() was skipped entirely. The movement never learned anything
     and nothing anywhere said so. The local fallback below exists only for a
     page that somehow loads this file without x3f-cal.js, and deliberately
     mirrors X3FCal.slug() step for step rather than inventing a fourth answer. */
  function slug() {
    try { if (window.X3FCal && X3FCal.slug) return X3FCal.slug(); } catch (e) {}
    var s = param('ex');
    if (s) return s;
    var sess = session();
    if (sess && sess.active && sess.pending && sess.pending.slug) return sess.pending.slug;
    return null;
  }

  /* slug() and band() both parse storage, and the sampler runs 25 times a
     second, so the pair is cached for a second at a time. Neither can change
     inside a rep; a band changed mid-page is picked up well before the set
     ends, and report() resolves both afresh anyway. */
  var ctx = { slug: null, band: null, at: -1e9 };
  function context() {
    var t = now();
    if (t - ctx.at < 1000) return ctx;
    ctx.slug = slug();
    ctx.band = band(ctx.slug);
    ctx.at = t;
    return ctx;
  }

  /* The band must be the band the SCALE used, or the numbers in the log mean
     nothing: a set logged against White whose thresholds came from a Dark Gray
     range is not a comparable set. The scale comes from X3FCal.span() ->
     X3FCal.band() -> X3FBand.forMovement(), so this asks the same question of
     the same owner. x3f_band is never read here - reading it directly is what
     made calibration and training disagree in the first place. */
  function band(sl) {
    try { if (window.X3FBand) return X3FBand.forMovement(sl); } catch (e) {}
    /* Only reached on a page that did not load x3f-band.js. The game's own
       selector is a better answer than nothing, because whatever the game is
       scaled to is what was actually pulled. */
    try { var g = window.__x3fBand && window.__x3fBand(); if (typeof g === 'string' && g) return g; } catch (e) {}
    return null;
  }

  /* A tracked set is the default, and every entry ever written before this
     rewrite is tracked - which is why the flag is only ever written when it is
     FALSE. Absent means tracked, so the whole existing history reads correctly
     without a migration. The guided Routine can also declare it on the step it
     is waiting on, so the Hypertrophy program's four volume supersets are
     content rather than a special case in every game. */
  function tracked(o) {
    if (o && typeof o.tracked === 'boolean') return o.tracked;
    var sess = session();
    if (sess && sess.active && sess.pending && typeof sess.pending.tracked === 'boolean') {
      return sess.pending.tracked;
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   *  Presentation. Unchanged in contract; retuned in sequencing.        *
   * ------------------------------------------------------------------ */

  var styled = false;
  function css() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    /* Tokens with literal fallbacks: the games still carry their own inline
       palettes and do not load x3f-ui.css yet, so var(--gold, #ffd35c) is
       correct in both worlds and becomes correct automatically as pages move
       over. The two max-width declarations are a deliberate pair - an older
       Android TV WebView drops the min() line and keeps the plain one, where a
       single min() would have left the toast unconstrained. */
    s.textContent =
      '.x3fs-toast{position:fixed;left:50%;z-index:80;' +
      'bottom:24px;bottom:calc(24px + env(safe-area-inset-bottom,0px));' +
      'transform:translateX(-50%) translateY(14px);' +
      'display:flex;flex-direction:column;gap:2px;padding:12px 18px;border-radius:16px;' +
      'max-width:440px;max-width:min(90vw,440px);' +
      'background:var(--bg-lift,rgba(8,12,22,.92));border:1px solid var(--line-2,rgba(255,211,92,.45));' +
      "box-shadow:0 14px 40px rgba(0,0,0,.55);font-family:var(--font-display,'Space Grotesk',system-ui,sans-serif);" +
      'opacity:0;pointer-events:none;transition:opacity .25s,transform .25s var(--ease,cubic-bezier(.2,.9,.25,1))}' +
      '.x3fs-toast.on{opacity:1;transform:translateX(-50%)}' +
      '.x3fs-toast b{font-size:15px;color:var(--gold,#ffd35c)}' +
      '.x3fs-toast span{font-size:12px;color:var(--dim,#8593a9)}';
    document.head.appendChild(s);
  }

  /* textContent, not innerHTML. The subtitle interpolates a band name that came
     out of storage, and this is the one function every game funnels its
     user-facing text through - it must not be an HTML sink. */
  function toast(title, sub) {
    css();
    var el = document.querySelector('.x3fs-toast');
    if (!el) {
      el = document.createElement('div'); el.className = 'x3fs-toast';
      el.appendChild(document.createElement('b'));
      el.appendChild(document.createElement('span'));
      document.body.appendChild(el);
    }
    el.firstChild.textContent = title || '';
    el.lastChild.textContent = sub || '';
    el.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.classList.remove('on'); }, TOAST_MS);
  }

  /* Show unlocks the same way everywhere: the hype layer if the game has one (so
     it matches the milestone callouts), otherwise a toast. Never a dialog - a
     modal mid-workout on a TV has to be dismissed with the remote.

     `delay` exists because a personal best and an achievement land in the same
     tick, both go through the one shared toast element, and the achievement used
     to replace the PB line before a single frame had drawn it - deleting the
     most rewarding moment the app has. The PB now gets its full time first.
     The 3000 ms spacing is deliberately shorter than the 3200 ms hide, so
     consecutive toasts hand over instead of flashing off between them. */
  function announce(fresh, hype, delay) {
    if (!fresh || !fresh.length) return;
    var i = 0;
    function next() {
      if (i >= fresh.length || i >= 3) return;
      var a = fresh[i++];
      if (hype && hype.say) hype.say('🏅 ' + a.name, a.desc, a.tier >= 3);
      else toast('🏅 ' + a.name, a.desc);
      setTimeout(next, hype ? 2400 : 3000);
    }
    setTimeout(next, delay || 0);
  }

  /* ------------------------------------------------------------------ *
   *  The rep engine.                                                    *
   * ------------------------------------------------------------------ */

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  var watch = {
    getF: null, getR: null, getAbs: null, timer: null, last: 0,

    peak: 0,        // peak FORCE, in the game's own units, for the log
    tut: 0,         // seconds above TUT_FRAC
    strong: 0,      // seconds at or above STRONG_FRAC of the calibrated range

    inRep: false,
    trough: 1, tTrough: 0, tLeave: 0,
    rp: 0, tPeak: 0, t0: 0,
    buf: [],        // [t, x] for the rep in progress only
    lowMs: 0,       // the run of time being spent on the floor right now
    lowLast: 0,     // ...and the last completed run, which is the dwell that
                    //    belongs to the rep about to start
    dwell: 0,       // frozen at the moment the current rep started
    reps: [],       // closed reps, unclassified until the set ends
    open: null,     // the rep whose bottom-after has not been seen yet

    sessTop: 0, sessSlug: null
  };

  /* The linear 0..1 position in the calibrated range.

     A game hands over force that is ALREADY floored by lo together with ref() =
     X3FCal.span(), so force/ref() is arithmetically identical to X3FCal.raw()
     applied to the unfloored signal. When no span getter is supplied the force
     must be absolute, and X3FCal.raw() is asked directly. Either way this is the
     LINEAR value; X3FCal.frac() is the eased display curve and must never reach
     a threshold. */
  function lin(f) {
    var r = 0;
    if (watch.getR) { try { r = +watch.getR() || 0; } catch (e) { r = 0; } }
    if (r > 0) return clamp01(f / r);
    try { var c = context(); if (window.X3FCal) return X3FCal.raw(c.slug, c.band, f); } catch (e) {}
    return 0;
  }

  /* Slack means force BELOW the movement's start tension. With the floored
     signal that is indistinguishable from sitting exactly on it, so dwell is the
     discriminator (see SLACK_MS). A caller that can supply the unfloored force
     gets the rule as literally written. */
  function atFloor(x) {
    if (watch.getAbs) {
      try {
        var a = +watch.getAbs() || 0, c = context();
        var lo = (window.X3FCal ? X3FCal.floor(c.slug, c.band) : 0) || 0;
        if (lo > 0) return a < lo * (1 - SLACK_MARGIN);
      } catch (e) {}
    }
    return x <= SLACK_FRAC;
  }

  /* THE PEAK IS RECORDED ABSOLUTE, NOT FLOORED, and that matters twice.

     1. A personal best has to survive recalibration. A floored peak is measured
        relative to whatever start-tension figure happened to be in force that
        day, so two identical efforts either side of a calibration are not
        comparable - and pb() compares them.

     2. X3FCal.observe() banks this number as the movement's CEILING. Hand it a
        floored value and it learns a ceiling short by exactly the floor; merely
        holding the start position then reads as a maximum effort and the whole
        screen is used up before the first rep. That is the v1.6 symptom
        arriving by a new route, and tools/force-test guards it.

     This used to be safe by accident: an uncalibrated movement had a floor of
     zero, so floored and absolute were the same number. They are not any more -
     every movement now starts from an estimated floor, because a start position
     genuinely carries load (an overhead press carries half its peak force
     before rep one). So the un-flooring has to be explicit.

     A caller that knows the raw signal passes opts.abs and this is exact.
     Otherwise the floor currently in effect is added back, which is exact too,
     because that is precisely what the game subtracted. */
  function absForce(f) {
    if (watch.getAbs) {
      try { var a = +watch.getAbs(); if (a > 0) return a; } catch (e) {}
    }
    try {
      var c = context();
      if (window.X3FCal) return f + (X3FCal.floor(c.slug, c.band) || 0);
    } catch (e) {}
    return f;
  }

  function sample() {
    if (!watch.getF) return;
    var f;
    try { f = +watch.getF() || 0; } catch (e) { return; }
    var t = now(), dt = Math.min(0.5, (t - watch.last) / 1000);
    watch.last = t;

    var fa = absForce(f);
    if (fa > watch.peak) watch.peak = fa;

    var x = lin(f);
    if (x > TUT_FRAC) watch.tut += dt;
    if (x >= STRONG_FRAC) watch.strong += dt;

    repTick(x, t, dt);
  }

  function repTick(x, t, dt) {
    if (!watch.inRep) {
      /* Between reps: follow the bottom down, and time how long we sit on it.
         tLeave is the last moment we were still at the bottom, which is the true
         start of the next concentric even after a long idle. */
      if (x < watch.trough) { watch.trough = x; watch.tTrough = t; }
      if (x <= watch.trough + REP_MIN_AMP * 0.5) watch.tLeave = t;
      /* lowMs is the run of time being spent on the floor right now; lowLast
         remembers the last completed run. Both are needed because by the sample
         on which the next rep starts, the force has already left the floor - so
         reading lowMs there would always read zero. */
      if (atFloor(x)) { watch.lowMs += dt * 1000; watch.lowLast = watch.lowMs; }
      else { watch.lowMs = 0; }

      if (x - watch.trough >= REP_MIN_AMP) {
        /* The previous rep's eccentric ends at the lowest point it reached, and
           we only know that point once the next rep starts pulling away from
           it. */
        if (watch.open) { watch.open.t1 = watch.tTrough; watch.reps.push(watch.open); watch.open = null; }
        watch.inRep = true;
        watch.rp = x; watch.tPeak = t;
        watch.t0 = watch.tLeave || watch.tTrough || t;
        watch.buf = [[t, x]];
        watch.dwell = watch.lowLast;
        watch.lowMs = watch.lowLast = 0;
      }
      return;
    }

    if (watch.buf.length < BUF_MAX) watch.buf.push([t, x]);
    if (x > watch.rp) { watch.rp = x; watch.tPeak = t; }

    if (x <= watch.trough + (watch.rp - watch.trough) * REP_END_FRAC) closeRep(t);
  }

  /* A rep is closed on the way down, but its timing is not final until the
     bottom after it is found - hence `open`. Everything that needs the shape of
     the rep (lockout, tremble) is computed here, while the samples still exist;
     everything that needs the whole set (which tier it was) is deferred to
     analyse(), because the top a rep is graded against is not known until the
     set has established it. */
  function closeRep(t) {
    var b = watch.buf, base = watch.trough, pk = watch.rp, amp = pk - base;
    var rep = {
      p: pk, amp: amp,
      t0: watch.t0, tp: watch.tPeak, t1: t,
      dwell: watch.dwell || 0,
      lock: false, trem: false
    };
    if (amp > 0 && b.length > 2) {
      var line = base + amp * LOCK_BAND, ip = 0, i;
      /* The FIRST sample at the peak, not the last. On a rep held at the top -
         which is the rep the program wants - taking the last one would measure
         the fall from the end of the plateau and the climb from before it, and
         report a lockout for doing it right. */
      for (i = 0; i < b.length; i++) if (b[i][1] > b[ip][1]) ip = i;
      /* Time spent climbing the top band, and time spent falling back through
         it. A lockout builds slowly and collapses. */
      var up = null, dn = null;
      for (i = ip; i >= 0; i--) if (b[i][1] < line) { up = b[ip][0] - b[i][0]; break; }
      for (i = ip; i < b.length; i++) if (b[i][1] < line) { dn = b[i][0] - b[ip][0]; break; }
      if (up !== null && dn !== null && dn <= LOCK_MS && dn * LOCK_RATIO <= up) rep.lock = true;

      /* Tremble: direction reversals near the peak whose swing clears the noise
         floor. Counted per second so a long hold and a short one are judged the
         same way. */
      var zone = base + amp * TREM_ZONE, dir = 0, mark = null, flips = 0, ms = 0, prev = null;
      for (i = 0; i < b.length; i++) {
        if (b[i][1] < zone) { prev = null; continue; }
        if (prev !== null) ms += b[i][0] - prev;
        prev = b[i][0];
        if (mark === null) { mark = b[i][1]; continue; }
        var d = b[i][1] - mark;
        if (Math.abs(d) < TREM_AMP) continue;
        var nd = d > 0 ? 1 : -1;
        if (dir !== 0 && nd !== dir) flips++;
        dir = nd; mark = b[i][1];
      }
      if (ms >= TREM_MIN_MS && flips >= TREM_MIN_N && flips / (ms / 1000) >= TREM_HZ) rep.trem = true;
    }
    watch.open = rep;
    watch.inRep = false;
    watch.buf = [];
    /* trough = 1 forces the next sample to re-seed the bottom from wherever the
       bar actually is, so the next rep's amplitude is measured from this
       turnaround rather than from the floor of the set. With fatigue the
       turnaround creeps upward, and measuring from a stale bottom would keep
       calling shrinking reps full-range. */
    watch.trough = 1;
    watch.tTrough = watch.tLeave = t;
    watch.lowMs = watch.lowLast = 0;
  }

  /* Everything the force trace said about the set. Called once, at report time,
     because the tiers cannot be assigned until the set has finished telling us
     where its top was. */
  function analyse() {
    if (watch.open) { watch.open.t1 = watch.tTrough || watch.open.t1; watch.reps.push(watch.open); watch.open = null; }
    var reps = watch.reps, P = proto();
    var out = {
      reps: 0, full: 0, mid: 0, weak: 0,
      top: 0, strong: Math.round(watch.strong * 10) / 10, tut: Math.round(watch.tut),
      pace: 0, con: 0, ecc: 0, secs: 0,
      faults: { slack: 0, lockout: 0, rush: 0 }, fault: null, tremble: 0,
      partials: 0, expect: null, verdict: null, tiers: []
    };
    if (!reps.length) return out;

    /* The top this SESSION established. Within a set it is simply the best rep;
       across two sets of the same movement on one page (an Arena round, a retry)
       it is the best of the day so far, which is what "no longer able to reach
       that stronger range" is relative to. Keyed by movement, so a different
       lift never inherits another one's top. */
    var sl = slug(), i, best = 0;
    for (i = 0; i < reps.length; i++) if (reps[i].p > best) best = reps[i].p;
    if (watch.sessSlug !== sl) { watch.sessSlug = sl; watch.sessTop = 0; }
    if (best > watch.sessTop) watch.sessTop = best;
    var top = watch.sessTop || best;
    out.top = Math.round(top * 100) / 100;

    var fullLine = top * (P.fullRangeFrac || FALLBACK.fullRangeFrac);
    var midLine = top * (P.midRangeFrac || FALLBACK.midRangeFrac);
    var minMs = P.repMinMs || FALLBACK.repMinMs;

    var durSum = 0, durN = 0, conSum = 0, eccSum = 0;
    for (i = 0; i < reps.length; i++) {
      var r = reps[i];
      var tier = r.p >= fullLine ? 'full' : (r.p >= midLine ? 'mid' : 'weak');
      r.tier = tier;
      out[tier]++;
      out.tiers.push(tier);

      var dur = r.t1 - r.t0;
      if (dur > 0 && dur < REP_MAX_MS) {
        durSum += dur; durN++;
        conSum += Math.max(0, r.tp - r.t0);
        eccSum += Math.max(0, r.t1 - r.tp);
        /* Tempo is only judged on full and mid range reps. The last weak-range
           reps of a set are SHORT IN RANGE by definition - "very short weak
           range repetitions" - and are inevitably quick; calling them rushing
           would be coaching against the exact thing the program asks for. */
        if (tier !== 'weak' && dur < minMs) out.faults.rush++;
      }
      /* Slack is only judged on full and mid range reps.

         Two reasons, both about what the signal can actually show. The first rep's
         bottom is the idle before the set, which is legitimately at the floor for
         as long as it takes to pick the bar up. And a weak-range rep lives near
         the floor for its whole length by definition - "very short weak range
         repetitions" - so on a signal clamped at lo there is nothing left to
         separate "resting on the floor" from "doing the last inch of the set",
         and guessing would accuse the user of slacking at the exact moment they
         are working hardest. */
      if (i > 0 && tier !== 'weak' && r.dwell >= SLACK_MS) out.faults.slack++;
      if (r.lock && r.p >= top * LOCK_MIN_TIER) out.faults.lockout++;
      if (r.trem) out.tremble++;
    }

    out.reps = reps.length;
    out.partials = out.mid + out.weak;
    if (durN) {
      out.pace = Math.round(durSum / durN) / 1000;
      out.con = Math.round(conSum / durN) / 1000;
      out.ecc = Math.round(eccSum / durN) / 1000;
    }
    out.secs = Math.round((reps[reps.length - 1].t1 - reps[0].t0) / 1000);

    /* One worst offender, not a list, and by SEVERITY rather than by count -
       three slack reps matter more than twelve slightly quick ones. The order:
       slack means the rep happened with no tension at all and is the
       constant-tension rule broken outright; lockout means you rested inside a
       rep; rushing degrades every rep but still trains the muscle.

       Two occurrences are required before anything is said. One detection on a
       noisy signal is within the tolerance of any of these heuristics; two is a
       pattern, and this text is shown to the user as coaching. */
    var order = ['slack', 'lockout', 'rush'];
    for (i = 0; i < order.length; i++) {
      if (out.faults[order[i]] >= FAULT_MIN) { out.fault = order[i]; break; }
    }

    /* Per-movement expectation. The bent-over row legitimately produces 10-15
       partials because its strongest range is the MIDDLE; everything else
       produces 4-6. Judging both against one number is wrong twice. */
    var e = ex(sl);
    if (e && e.partials && e.partials.length === 2) {
      out.expect = [e.partials[0], e.partials[1]];
      out.verdict = out.partials < e.partials[0] ? 'below'
                  : (out.partials > e.partials[1] ? 'above' : 'in');
    }
    return out;
  }

  /* One sentence about the shape of the set, and one about the worst fault -
     because a summary that lists four things says nothing. Callers are free to
     ignore both and render the counts themselves. */
  function describe(a, sl) {
    var e = ex(sl), name = (e && e.name) ? e.name.toLowerCase() : 'this movement';
    var note = '', fault = '', praise = '';
    if (a.reps) {
      note = a.full + ' full range';
      if (a.mid) note += ', ' + a.mid + ' mid range';
      if (a.weak) note += ', ' + a.weak + ' weak range';
      var art = /^[aeiou]/.test(name) ? 'an ' : 'a ';
      if (a.verdict === 'in') note += ' — right where ' + art + name + ' should land.';
      else if (a.verdict === 'above') note += ' — deeper into the burnout than ' + art + name + ' usually goes.';
      else if (a.verdict === 'below' && a.full) note += ' — there is more in there. Go until it will not move an inch.';
      else note += '.';
    }
    if (a.fault === 'slack') {
      fault = 'The band went slack at the bottom on ' + a.faults.slack +
              (a.faults.slack === 1 ? ' rep' : ' reps') + '. Slack is a rep you did not do.';
    } else if (a.fault === 'lockout') {
      fault = 'You locked out at the top on ' + a.faults.lockout +
              (a.faults.lockout === 1 ? ' rep' : ' reps') + '. Locking out is resting.';
    } else if (a.fault === 'rush') {
      fault = a.faults.rush + (a.faults.rush === 1 ? ' rep was' : ' reps were') +
              ' under ' + Math.round((proto().repMinMs || 4000) / 1000) +
              ' seconds. Two up, two down — you are emptying a muscle, not collecting reps.';
    }
    /* Never a warning. "That is just the stabilization muscles trying to assist
       or take over... it's a great thing." */
    if (a.tremble) {
      praise = 'You shook near the top on ' + a.tremble +
               (a.tremble === 1 ? ' rep' : ' reps') + ' — that is your stabilisers joining in. Good sign.';
    }
    return { note: note, fault: fault, praise: praise };
  }

  /* ------------------------------------------------------------------ *
   *  Watcher lifecycle.                                                 *
   * ------------------------------------------------------------------ */

  function resetRep() {
    watch.inRep = false;
    watch.trough = 1; watch.tTrough = watch.tLeave = now();
    watch.rp = 0; watch.tPeak = 0; watch.t0 = 0;
    watch.buf = []; watch.lowMs = watch.lowLast = watch.dwell = 0;
    watch.reps = []; watch.open = null;
  }

  /* Hand over a force getter once and this samples everything.

       watch(getForce, getSpan)              the shape every game already uses
       watch(getForce, getSpan, {abs: fn})   additionally supply the UNFLOORED
                                             force, which turns slack detection
                                             from a dwell heuristic into the
                                             literal "below lo" test

     Reset when a set starts. */
  function startWatch(getForce, getRef, opts) {
    watch.getF = getForce || null;
    watch.getR = getRef || null;
    watch.getAbs = (opts && typeof opts.abs === 'function') ? opts.abs : null;
    watch.last = now();
    resetWatch();
    sample();                       // never miss a set shorter than one interval
    if (watch.timer) return;
    watch.timer = setInterval(sample, SAMPLE_MS);
  }
  function stopWatch() {
    if (watch.timer) { clearInterval(watch.timer); watch.timer = null; }
  }
  function resetWatch() {
    watch.peak = 0; watch.tut = 0; watch.strong = 0; watch.last = now();
    resetRep();
  }

  /* A live view, for an in-set HUD: which tier the set is in right now, and the
     counts so far. Cheap enough to call every frame - it grades against the top
     established so far rather than the final one, so a rep that later turns out
     to have been the top can move between tiers by the end. The summary is
     authoritative; this is the scoreboard. */
  function live() {
    var P = proto(), reps = watch.reps, i, best = 0;
    for (i = 0; i < reps.length; i++) if (reps[i].p > best) best = reps[i].p;
    if (watch.open && watch.open.p > best) best = watch.open.p;
    var top = Math.max(best, watch.sessSlug === context().slug ? watch.sessTop : 0);
    var out = { reps: reps.length + (watch.open ? 1 : 0), full: 0, mid: 0, weak: 0,
                top: top, inRep: watch.inRep, tier: null };
    if (!top) return out;
    var fl = top * (P.fullRangeFrac || FALLBACK.fullRangeFrac);
    var ml = top * (P.midRangeFrac || FALLBACK.midRangeFrac);
    function bucket(p) { return p >= fl ? 'full' : (p >= ml ? 'mid' : 'weak'); }
    for (i = 0; i < reps.length; i++) out[bucket(reps[i].p)]++;
    if (watch.open) out[bucket(watch.open.p)]++;
    out.tier = out.weak ? 'weak' : (out.mid ? 'mid' : (out.full ? 'full' : null));
    return out;
  }

  /* ------------------------------------------------------------------ *
   *  Reporting.                                                         *
   * ------------------------------------------------------------------ */

  /* Say what actually improved, not just what happened. Needs the previous set
     for the same movement and band, which the engine can find. Must be called
     BEFORE the new set is logged, or it compares the set against itself. */
  function improvement(entry) {
    var P = window.X3FProg;
    if (!P || !entry.ex) return '';
    var prev = null;
    try { prev = P.previous(entry.ex, entry.band, entry.t); } catch (e) {}
    if (!prev) return 'first set of this movement on ' + (entry.band || 'this band');
    var bits = [];
    function delta(field, label) {
      var now = +entry[field] || 0, was = +prev[field] || 0;
      if (!now && !was) return;
      var d = now - was;
      if (d > 0) bits.push('+' + Math.round(d) + ' ' + label);
      else if (d < 0) bits.push(Math.round(d) + ' ' + label);
    }
    /* Compare tier for tier when BOTH sets know their tiers. Against a set
       logged before this rewrite there is no mid/weak breakdown to compare, so
       the old three-number line is still the honest one. */
    if ((entry.mid != null || entry.weak != null) && (prev.mid != null || prev.weak != null)) {
      delta('full', 'full range');
      delta('mid', 'mid range');
      delta('weak', 'weak range');
      delta('peak', 'peak');
    } else {
      delta('reps', 'reps');
      delta('part', 'partials');
      delta('peak', 'peak');
    }
    if (!bits.length) return 'level with last time';
    return bits.join(', ') + ' vs last time';
  }

  /* The fields this rewrite adds to a history entry. Every one is optional and
     every one is absent unless it was actually measured, so an entry written
     before today reads exactly as it always did.

     They matter here because x3f-progress.js's logSet copies a FIXED list of
     fields into the log - g, ex, band, reps, full, part, peak, secs, score, acc,
     tut, ecc, n - and drops everything else. A new number outside that list is
     computed, shown, and thrown away, which looks exactly like working. */
  var EXTRA = ['v', 'tracked', 'mid', 'weak', 'strong', 'con', 'pace', 'top', 'fault', 'faults', 'trem'];

  /* Confirm the set is actually in the log, and put back anything logSet's
     field allow-list dropped on the way in.

     The allow-list is the reason this exists. A field the engine has not been
     taught about is silently discarded, which looks exactly like working: the
     number is measured, shown in the summary, and gone by the next page load.
     Merging the missing ones back - matched by timestamp, never appending,
     never truncating, never touching another entry - makes the data land
     whichever version of the engine is loaded.

     Reading the log back also answers a question logSet cannot: whether the
     write survived. It is a shim with a clear end. Once the engine copies
     unknown fields through, `need` comes back empty and this does nothing but
     one read, and it can be deleted outright.

     No cache to invalidate: X3FProg.history() keys its parse cache on the raw
     stored string, so a direct write is picked up on the next read. */
  function persist(logged, entry) {
    var out = { logged: false, patched: false };
    if (!logged || !logged.t) return out;
    var h;
    try { h = JSON.parse(localStorage.getItem('x3f_history') || '[]'); } catch (e) { return out; }
    if (!Array.isArray(h)) return out;
    var i, row = null;
    for (i = h.length - 1; i >= 0; i--) {
      if (h[i] && h[i].t === logged.t && h[i].k !== 'session') { row = h[i]; break; }
    }
    if (!row) return out;                       // the write did not survive
    out.logged = true;
    var need = [];
    for (i = 0; i < EXTRA.length; i++) {
      var f = EXTRA[i];
      if (entry[f] != null && row[f] == null) need.push(f);
    }
    if (!need.length) return out;
    for (i = 0; i < need.length; i++) row[need[i]] = entry[need[i]];
    try { localStorage.setItem('x3f_history', JSON.stringify(h)); out.patched = true; } catch (e) { }
    return out;
  }

  function num(v) { return (v != null && !isNaN(+v)) ? Math.round(+v * 100) / 100 : null; }

  function report(o) {
    o = o || {};
    var P = window.X3FProg;
    var sl = o.ex || slug() || null;
    var isTracked = tracked(o);

    /* One last look, in case the set ended between ticks, then read everything
       the trace said before the state is thrown away. */
    sample();
    var a = analyse();

    var entry = {
      t: o.t || Date.now(),
      g: o.g || 'game',
      ex: sl,
      band: o.band || band(sl) || null,
      v: 2                               // three-tier entry. Absent = pre-rewrite.
    };
    if (!isTracked) entry.tracked = false;   // written only when false; absent
                                             // means tracked, so old entries and
                                             // old readers are both correct.

    /* Splash, Nova, Duel and Rhythm report at the end of every RUN, and the
       engine tells a run from a set by "has a score and no rep count". This
       reporter can now supply a rep count those games never had, which would
       silently reclassify every one of their runs as a set and inflate the
       session counts. So the classification is decided from what the GAME
       reported, before anything is filled in, and stated explicitly. */
    if (o.score != null && o.reps == null) entry.run = true;

    /* The caller always wins: a game that counts its own reps knows better than
       a detector watching the same signal from outside. */
    var f, i, given = ['reps', 'full', 'part', 'peak', 'secs', 'score', 'tut', 'ecc', 'acc'];
    for (i = 0; i < given.length; i++) {
      f = given[i];
      if (num(o[f]) != null) entry[f] = num(o[f]);
    }

    if (entry.peak == null && watch.peak > 0) entry.peak = Math.round(watch.peak);
    if (entry.tut == null && a.tut > 1) entry.tut = a.tut;

    if (a.reps) {
      /* The three tiers are always recorded, under their own names, so a summary
         can say what the set actually was. `full` and `part` keep their existing
         meanings - part = mid + weak, "partials past full-range collapse" - so
         every consumer written against the two-tier shape keeps working
         unchanged and every entry already in the log stays comparable. */
      entry.mid = a.mid;
      entry.weak = a.weak;
      entry.top = a.top;
      if (entry.reps == null) entry.reps = a.reps;
      if (entry.full == null) entry.full = a.full;
      if (entry.part == null) entry.part = a.partials;
      if (entry.secs == null && a.secs > 0) entry.secs = a.secs;
      if (entry.ecc == null && a.ecc > 0) entry.ecc = a.ecc;
      if (a.con > 0) entry.con = a.con;
      if (a.pace > 0) entry.pace = a.pace;
      if (a.fault) {
        entry.fault = a.fault;
        /* Only the non-zero counts. This log lives in localStorage and is read
           and re-written on every set; three zeroes per entry is bytes spent
           saying nothing. */
        entry.faults = {};
        if (a.faults.slack) entry.faults.slack = a.faults.slack;
        if (a.faults.lockout) entry.faults.lockout = a.faults.lockout;
        if (a.faults.rush) entry.faults.rush = a.faults.rush;
      }
      if (a.tremble) entry.trem = a.tremble;
    }
    if (a.strong > 0) entry.strong = a.strong;

    /* Teach an uncalibrated movement its own ceiling - but never from a set that
       is not being tracked. A volume set is deliberately not an all-out effort,
       and the ceiling is a personal best by another name. */
    if (isTracked) {
      try {
        if (window.X3FCal && entry.ex && entry.peak > 0) X3FCal.observe(entry.ex, entry.band, entry.peak);
      } catch (e) {}
    }
    resetWatch();

    var described = describe(a, sl);
    var advice = null;
    if (isTracked && entry.full != null) {
      try { if (window.X3FCal && X3FCal.bandAdvice) advice = X3FCal.bandAdvice(sl, entry.band, entry.full); } catch (e) {}
    }

    var result = { logged: false, entry: entry, set: a, coach: described,
                   advice: advice, tracked: isTracked, fresh: [], improved: '', pb: '' };
    if (!P) return result;

    var beforeBest = (isTracked && entry.ex) ? P.pb(entry.ex, entry.band) : null;
    try { result.improved = improvement(entry); } catch (e) {}

    var logged = null;
    try { logged = P.logSet(entry); } catch (e) {}
    var w = persist(logged, entry);
    result.logged = w.logged;
    result.entry = logged || entry;

    /* An untracked set is training, so it is logged - but nothing downstream of
       the log may treat it as an effort. No achievement pass, no personal best,
       no challenge credit, no calibration. */
    if (isTracked && w.logged) {
      try { result.fresh = P.checkAchievements() || []; } catch (e) {}
    }

    if (beforeBest) {
      if (entry.reps && entry.reps > beforeBest.reps && beforeBest.reps > 0) {
        result.pb = 'new best: ' + entry.reps + ' reps (was ' + beforeBest.reps + ')';
      } else if (entry.peak && entry.peak > beforeBest.peak && beforeBest.peak > 0) {
        result.pb = 'new peak: ' + Math.round(entry.peak) + ' (was ' + Math.round(beforeBest.peak) + ')';
      }
    }

    if (o.announce !== false) {
      var shown = true;
      if (!w.logged) {
        /* A set that vanished is the worst thing this file can do quietly. */
        toast('Set not saved', 'Storage is full — clear space or export your history.');
      } else if (!isTracked) {
        toast('Volume set logged', described.note || 'Not counted toward bests.');
      } else if (result.pb) {
        toast('Personal best', result.pb);
      } else if (o.quiet !== true && (described.fault || result.improved)) {
        toast('Set logged', described.fault || result.improved);
      } else { shown = false; }
      announce(result.fresh, o.hype, shown && !o.hype ? TOAST_MS + 200 : 0);
    }
    return result;
  }

  window.X3FSet = {
    report: report,
    improvement: improvement,
    describe: describe,
    toast: toast,
    announce: announce,
    watch: startWatch,
    stop: stopWatch,
    reset: resetWatch,
    live: live,
    slug: slug,
    band: band,
    seen: function () {
      return { peak: watch.peak, tut: watch.tut, strong: watch.strong, reps: watch.reps.length };
    }
  };
})();
