/* X3F CALFLOW - the calibration capture, as a state machine.

   ─────────────────────────────────────────────────────────────────────────
   WHY THIS IS ITS OWN FILE
   ─────────────────────────────────────────────────────────────────────────

   The capture is the same on the Calibrate screen, in first-run onboarding, and
   in the "recalibrate this movement" prompt the app shows when a band max goes
   stale. It was previously inline in X3F_Calibrate.html, which is why the other
   two do not exist. It also had no test coverage at all, on the screen the user
   was complaining about.

   It knows nothing about the DOM. The page supplies getForce() and renders
   whatever onTick hands it.

   ─────────────────────────────────────────────────────────────────────────
   THE TIMING PROBLEM THIS EXISTS TO FIX
   ─────────────────────────────────────────────────────────────────────────

   Reported from the sofa: "I can't just press select on the TV remote and
   instantly exert all the force possible."

   Exactly right, and the old numbers were worse than they sound:

       press OK  →  3.0s  →  be holding a loaded start position
                 →  2.5s  →  be going all out

   Three seconds to put the remote down, step onto the plate, pick up the bar,
   set your feet, and be holding the exact start position of the movement. It
   is not enough time for a chest press, where the setup involves threading a
   doubled band over one shoulder and rotating the bar across your body.

   The new shape:

       PRESS OK
         │  GET SET      default 10s, adjustable 5-30s, remembered.
         │               Skippable by pressing OK again once you are ready,
         │               so it never gets in the way once you are quick at it.
         │               Ticks audibly, and speeds up near the end.
         ▼
       HOLD           4s. Averaged, not peaked - a wobble must not become the
         │            floor. Rejected if you are clearly still moving.
         ▼
       READY          3s. Three, two, one. Audible.
         ▼
       MAX            6s minimum, EXTENDING while your force is still climbing,
         │            hard cap 12s. A fixed window punishes a slow ramp, and a
         ▼            slow ramp is what the program actually asks for.
       RESULT         retryMax() re-runs only the max and keeps the hold, so a
                      bad max does not cost you the whole capture.

   ─────────────────────────────────────────────────────────────────────────
   EVERYTHING IS AUDIBLE
   ─────────────────────────────────────────────────────────────────────────

   During a capture the user is holding a loaded bar and is not looking at the
   screen - the same reason the in-set HUD is designed as a scoreboard rather
   than a UI. Every phase change makes a sound, and the sounds are pitched
   500 Hz - 4 kHz, where TV speakers actually reproduce. A satisfying low thump
   is inaudible on a TV.

   ─────────────────────────────────────────────────────────────────────────
   NOTHING IS WRITTEN UNTIL THE WHOLE CAPTURE SUCCEEDS
   ─────────────────────────────────────────────────────────────────────────

   The old code raised the global band ceiling even when it REFUSED the capture,
   which permanently mis-scaled all ten other movements on that band with no UI
   anywhere in the app to undo it. This one hands the result to X3FCal.save(),
   which is the only thing that writes, and it writes nothing on failure.

     var flow = X3FCalFlow.create({slug, band, getForce, onTick, onPhase, onDone});
     flow.start();  flow.press();  flow.cancel();  flow.retryMax();
     X3FCalFlow.getSetMs()  /  setGetSetMs(ms)
*/
(function () {
  "use strict";

  var K_GETSET = 'x3f_calGetSet';
  var DEFAULT_GETSET = 10000;
  var MIN_GETSET = 5000, MAX_GETSET = 30000;

  var HOLD_MS = 4000;
  var READY_MS = 3000;
  var MAX_MIN_MS = 6000;
  var MAX_CAP_MS = 12000;
  /* Once your force has stopped climbing for this long, the max is over. The
     program's tempo is 2-3 seconds each way, so a genuine ramp is slow; a
     second and a bit of no new peak means you are on the way down. */
  var MAX_SETTLE_MS = 1300;

  /* The hold is an average, so a big wobble means the number is not describing
     a position. Expressed as a fraction of the mean so it scales with the band. */
  var HOLD_MAX_WOBBLE = 0.35;

  function read(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k)); return (v === null || v === undefined) ? d : v; }
    catch (e) { return d; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function getSetMs() {
    var v = +read(K_GETSET, DEFAULT_GETSET);
    if (!(v >= MIN_GETSET && v <= MAX_GETSET)) return DEFAULT_GETSET;
    return v;
  }
  function setGetSetMs(ms) {
    ms = Math.round(Math.min(MAX_GETSET, Math.max(MIN_GETSET, +ms || DEFAULT_GETSET)));
    write(K_GETSET, ms);
    return ms;
  }

  /* ── audio ───────────────────────────────────────────────────────────────
     Deliberately plain oscillator tones rather than the generated soundtrack in
     x3f-music.js: these have to cut through whatever the music is doing, be
     unmistakable, and cost nothing per frame. Kept in the band a TV speaker
     reproduces. */
  var ac = null;
  function audio() {
    if (ac) return ac;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (C) ac = new C();
    } catch (e) { ac = null; }
    return ac;
  }
  function tone(freq, ms, gain) {
    var c = audio(); if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      var t = c.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain === undefined ? 0.22 : gain, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + ms / 1000 + 0.02);
    } catch (e) {}
  }
  var SOUND = {
    tick:   function () { tone(880, 70, 0.13); },
    tickHi: function () { tone(1320, 80, 0.18); },
    phase:  function () { tone(660, 160, 0.24); },
    go:     function () { tone(1760, 260, 0.30); },
    good:   function () { tone(1046, 140, 0.26); setTimeout(function () { tone(1568, 220, 0.26); }, 130); },
    bad:    function () { tone(392, 300, 0.24); }
  };

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function create(opts) {
    opts = opts || {};
    var getForce = opts.getForce || function () { return 0; };
    var onTick = opts.onTick || function () {};
    var onPhase = opts.onPhase || function () {};
    var onDone = opts.onDone || function () {};
    var sound = opts.sound !== false;

    var slug = opts.slug || null;
    var band = opts.band || null;

    var phase = 'idle';
    var phaseEnd = 0, phaseTotal = 0;
    var raf = 0;

    var holdSum = 0, holdN = 0, holdMin = Infinity, holdMax = 0;
    var capLo = 0, capHi = 0;
    var maxStart = 0, lastPeakAt = 0;
    var lastTickSec = -1;

    function say(p, info) {
      phase = p;
      try { onPhase(p, info || {}); } catch (e) {}
    }

    function stop() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    function finish(result) {
      stop();
      phase = result.ok ? 'done' : 'failed';
      if (sound) (result.ok ? SOUND.good : SOUND.bad)();
      try { onDone(result); } catch (e) {}
    }

    function beginGetSet() {
      holdSum = 0; holdN = 0; holdMin = Infinity; holdMax = 0;
      capLo = 0; capHi = 0; lastTickSec = -1;
      phaseTotal = getSetMs();
      phaseEnd = now() + phaseTotal;
      say('getset', { total: phaseTotal });
      if (sound) SOUND.phase();
      loop();
    }

    function beginHold() {
      holdSum = 0; holdN = 0; holdMin = Infinity; holdMax = 0;
      phaseTotal = HOLD_MS;
      phaseEnd = now() + phaseTotal;
      say('hold', { total: phaseTotal });
      if (sound) SOUND.phase();
    }

    function beginReady() {
      phaseTotal = READY_MS;
      phaseEnd = now() + phaseTotal;
      lastTickSec = -1;
      say('ready', { total: phaseTotal, lo: capLo });
      if (sound) SOUND.phase();
    }

    function beginMax() {
      capHi = 0;
      maxStart = now();
      lastPeakAt = maxStart;
      phaseTotal = MAX_MIN_MS;
      phaseEnd = maxStart + phaseTotal;
      say('max', { total: phaseTotal, lo: capLo });
      if (sound) SOUND.go();
    }

    /* Is the hold plausible? Two ways it is not:

         no-load   the number is zero or near it. For a deadlift that is
                   honest - it starts near slack. For an overhead press it
                   almost certainly means the bar was not picked up yet, and
                   banking a floor of zero for that movement recreates the exact
                   bug this whole system exists to fix.
         wobble    the four-second window moved a lot, so the average is not
                   describing a held position. Baking a wobble into the floor
                   would put it into every future rep of the movement.

       Neither REFUSES the capture - the user's own measurement outranks our
       model, and there are legitimate setups we have not thought of. But
       neither is allowed to pass silently either. */
    function judgeHold() {
      var q = { ok: true, reason: null };
      var e = null;
      try { e = window.X3FEX && window.X3FEX.get(slug); } catch (err) {}
      var expectFrac = (e && typeof e.floorFrac === 'number') ? e.floorFrac : 0;
      var expected = capHi * expectFrac;

      if (expectFrac >= 0.2 && capLo < expected * 0.4) {
        q.ok = false; q.reason = 'no-load'; q.expected = Math.round(expected);
        return q;
      }
      if (holdN) {
        var mean = holdSum / holdN;
        if (mean > 0 && (holdMax - holdMin) / mean > HOLD_MAX_WOBBLE) {
          q.ok = false; q.reason = 'wobble';
          q.spread = Math.round(100 * (holdMax - holdMin) / mean);
        }
      }
      return q;
    }

    function commit() {
      var hq = judgeHold();
      var res = window.X3FCal
        ? window.X3FCal.save(slug, band, capLo, capHi)
        : { error: 'no-cal', message: 'Calibration module not loaded.' };
      if (res === true) {
        finish({ ok: true, lo: capLo, hi: capHi, slug: slug, band: band, hold: hq });
      } else {
        finish({
          ok: false, lo: capLo, hi: capHi, slug: slug, band: band, hold: hq,
          error: res && res.error, message: (res && res.message) || 'Could not save that capture.'
        });
      }
    }

    function loop() {
      raf = requestAnimationFrame(loop);
      var t = now();
      var f = +getForce() || 0;
      var left = Math.max(0, phaseEnd - t);

      if (phase === 'getset') {
        /* Tick every second, and faster in the last three, so you can hear how
           long you have without looking up from the bar. */
        var s = Math.ceil(left / 1000);
        if (s !== lastTickSec) {
          lastTickSec = s;
          if (sound && s > 0) (s <= 3 ? SOUND.tickHi : SOUND.tick)();
        }
        if (left <= 0) beginHold();

      } else if (phase === 'hold') {
        holdSum += f; holdN++;
        if (f < holdMin) holdMin = f;
        if (f > holdMax) holdMax = f;
        if (left <= 0) {
          capLo = holdN ? holdSum / holdN : 0;
          beginReady();
        }

      } else if (phase === 'ready') {
        var r = Math.ceil(left / 1000);
        if (r !== lastTickSec) {
          lastTickSec = r;
          if (sound && r > 0) SOUND.tickHi();
        }
        if (left <= 0) beginMax();

      } else if (phase === 'max') {
        if (f > capHi) { capHi = f; lastPeakAt = t; }
        var elapsed = t - maxStart;
        /* Extend while the force is still climbing. A fixed window punishes a
           slow ramp, and a slow controlled ramp is what the program asks for. */
        var settled = (t - lastPeakAt) >= MAX_SETTLE_MS;
        if (elapsed >= MAX_CAP_MS || (elapsed >= MAX_MIN_MS && settled)) {
          stop();
          commit();
          return;
        }
        /* The window slides forward each time you set a new peak, so the bar
           on screen shows time remaining in the CURRENT window rather than a
           countdown that keeps resetting to full. */
        phaseTotal = Math.min(MAX_CAP_MS, Math.max(MAX_MIN_MS, (lastPeakAt - maxStart) + MAX_SETTLE_MS));
        phaseEnd = maxStart + phaseTotal;
      }

      try {
        onTick({
          phase: phase,
          force: f,
          left: Math.max(0, phaseEnd - t),
          total: phaseTotal,
          lo: capLo,
          hi: capHi,
          holdMean: holdN ? holdSum / holdN : 0
        });
      } catch (e) {}
    }

    return {
      start: function () {
        if (phase !== 'idle' && phase !== 'done' && phase !== 'failed') return;
        /* Unlock WebAudio from inside the user gesture that started this, or
           every cue after it is silent. */
        if (sound) { var c = audio(); if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} } }
        beginGetSet();
      },

      /* OK during GET SET means "I'm ready now" - it skips the rest of the
         countdown rather than restarting or cancelling. During any other phase
         it does nothing, so a stray press cannot ruin a capture. */
      press: function () {
        if (phase === 'getset') { phaseEnd = now(); return 'skip'; }
        return null;
      },

      cancel: function () {
        stop();
        var was = phase;
        phase = 'idle';
        say('idle', { cancelled: was });
        return was;
      },

      /* Re-run only the max, keeping the hold. A bad max - you lost your grip,
         the band slipped, someone walked in - should not cost you the setup. */
      retryMax: function () {
        if (!(capLo >= 0)) return false;
        stop();
        phaseTotal = getSetMs();
        phaseEnd = now() + phaseTotal;
        lastTickSec = -1;
        say('getset', { total: phaseTotal, retryingMax: true });
        if (sound) SOUND.phase();
        loop();
        return true;
      },

      /* The hold is an average over four seconds. If the signal moved a lot
         across that window it is not describing a held position, and using it
         as a floor would bake a wobble into every future rep of this movement. */
      holdQuality: function () {
        if (!holdN) return { ok: false, reason: 'no-samples' };
        var mean = holdSum / holdN;
        if (mean <= 0) return { ok: false, reason: 'no-load' };
        var spread = (holdMax - holdMin) / mean;
        return { ok: spread <= HOLD_MAX_WOBBLE, spread: spread, mean: mean };
      },

      phase: function () { return phase; },

      /* TEST SEAM. A real capture is twenty-odd seconds of wall clock, which no
         headless suite can afford to wait through - and the alternative,
         reimplementing the commit inside the test, is exactly how D2 shipped:
         the page's own write path was never once exercised, so nothing noticed
         that a REFUSED capture still raised the global band ceiling.

         This drives the real commit() with supplied numbers, so the code under
         test is the code that runs in production. It is deliberately not
         hidden behind a flag: a seam that only exists in a test build is a seam
         that stops matching the shipped one. */
      _commit: function (lo, hi) {
        capLo = Math.max(0, +lo || 0);
        capHi = +hi || 0;
        stop();
        commit();
      },

      setMovement: function (s, b) {
        if (phase !== 'idle' && phase !== 'done' && phase !== 'failed') return false;
        slug = s; band = b; return true;
      },
      destroy: stop
    };
  }

  window.X3FCalFlow = {
    create: create,
    getSetMs: getSetMs, setGetSetMs: setGetSetMs,
    MIN_GETSET: MIN_GETSET, MAX_GETSET: MAX_GETSET, DEFAULT_GETSET: DEFAULT_GETSET,
    HOLD_MS: HOLD_MS, READY_MS: READY_MS, MAX_MIN_MS: MAX_MIN_MS, MAX_CAP_MS: MAX_CAP_MS,
    sound: SOUND
  };
})();
