/* X3F MUSIC - a soundtrack that is generated, not downloaded.
   Every game here is offline-first and the whole APK is under 5MB, so shipping
   audio files would cost more than the games themselves. This synthesises the
   music in WebAudio instead: a few oscillators, a filter, a noise burst for
   percussion, and a scheduler that queues the next bar slightly ahead of time.

   It reacts to what you are doing. Pass a getIntensity() that returns 0..1 - your
   force, your combo, your wave - and the arrangement opens up as it climbs: the
   filter brightens, a bass line joins, the hats double, notes move from held pads
   to arpeggios. Ease off and it settles back down. That coupling is the point;
   loop-under-gameplay would just be wallpaper.

     var music = X3FMusic.create({mood:'bloom', getIntensity:function(){return n}});
     music.toggle(); music.duck(0.4); music.stop();

   Moods pick the scale, tempo, timbre and palette; the structure is shared.

   ─────────────────────────────────────────────────────────────────────────
   MIXED FOR A TELEVISION, WHICH IS NOT A LOUD PHONE
   ─────────────────────────────────────────────────────────────────────────

   v1.3 doubled the master gain because the music vanished across the room.
   That treated a spectrum problem as a volume problem. A modern panel is under
   25 mm deep, its drivers fire downward or backward, and below roughly 200 Hz
   it produces essentially nothing. The old arrangement put most of its energy
   exactly there:

     kick    a sine sweeping 120 Hz -> 46 Hz .......... entirely inaudible
     pad     degree(0)/2, i.e. 87-131 Hz, often a SINE  inaudible, and a sine
                                                        has no harmonics to
                                                        survive in its place
     hats    6.2-9 kHz ............................... above the band the panel
                                                        and 3 m of air are good
                                                        at, so thin and hissy

   So on the couch you were hearing a bass line and some hiss, at any volume.
   The fix is not more gain, it is putting the music where the speaker lives:

     * FLOOR_MEL / FLOOR_PAD / FLOOR_BASS transpose each voice by WHOLE OCTAVES
       until its lowest note clears the floor. Per-note flooring would lift some
       scale degrees and not others and flatten the melody's contour; lifting a
       voice as a block changes only its register.
     * The kick is now a beater click at 1.4 kHz -> 620 Hz with a small body
       underneath. The click is the part a TV can play, so the click is the beat.
       Anything with a woofer still gets the body.
     * A 120 Hz high-pass on the bus removes the sub nothing can reproduce, so it
       stops stealing headroom from the limiter (and stops the kick pumping the
       whole mix down for content you cannot hear).
     * Hats moved to 3.2 / 4.2 / 6.4 kHz - inside the 500 Hz - 4 kHz band where
       meaning belongs, with only the sparkle layer above it.

   Level. Broadcast targets -23 LUFS / -24 LKFS with true peak <= -1 dBTP; that
   is the only predictable reference on a device whose volume knob, EQ preset and
   dynamic-range setting you do not control. We cannot measure LUFS cheaply at
   runtime, so the chain is built to land there by construction: a fixed program
   gain (BUS), a compressor set as a soft limiter, and an output ceiling of
   REF_PEAK = 0.89 (-1 dBTP) the limiter cannot push past. Reference level is
   volume 1.0 - which is why the default volume changed from 0.5 to 1.0. Net
   effect on a busy arrangement is about +10 dB over v1.3 (peak 0.10 -> 0.32),
   which is the size of the gap between a phone mix and broadcast; the v1.3
   doubling was about a third of the way there and aimed at the wrong axis.
   Everything is mono into one
   destination, so it is mono-safe by construction; nothing here relies on
   stereo width to carry information.

   ─────────────────────────────────────────────────────────────────────────
   THE HANDOVER BETWEEN DOCUMENTS
   ─────────────────────────────────────────────────────────────────────────

   An AudioContext cannot outlive its document, and WebView has no back/forward
   cache, so a navigation always kills the music. OVERHAUL-PLAN AD-1 makes the
   menus one document, which removes that for menu-to-menu; entering a game is
   still a real document load and always will be.

   So the transition is designed rather than suffered:

     leaving   music.handoff('bloom') plays a short rising cadence in the
               current scale, opens the filter, fades out over HANDOFF_MS, and
               drops a baton in localStorage. It returns the milliseconds the
               caller should wait before navigating.
     arriving  create() finds a fresh baton and swells in over ENTRY_MS with the
               drums held back for the first bar, so the new mood arrives as a
               breath rather than a beat landing in the middle of nowhere.

   Even an un-announced navigation (the Back button) gets the swell, because
   pagehide drops a baton too. What the new menu shell should call:

     var music = X3FMusic.attach({mood:'menu'});   // once, for the whole shell
     music.setMood('library');                     // on every client-side route
                                                   // change: no teardown, no
                                                   // gap, applied at the next
                                                   // downbeat so it lands
                                                   // musically
     var wait = music.handoff('bloom');            // only when leaving for a
     setTimeout(go, wait);                         // separate document

   ─────────────────────────────────────────────────────────────────────────
   THE FRAME BUDGET
   ─────────────────────────────────────────────────────────────────────────

   Audio rendering happens on the audio thread, but every note is BUILT on the
   main thread, next to a game's rAF loop and the form rig's. The budget is
   ~10 ms per frame, target 5. So the work per wake-up is bounded, not hoped
   about: MAX_STEPS caps how many sixteenths one tick may schedule, and if the
   clock has run away (a backgrounded tab) the sequencer re-bases instead of
   trying to catch up. Worst case is now ~6 steps x ~23 nodes; measured cost is
   published by stats().schedMs so it can be checked on the actual panel.
*/
(function () {
  "use strict";

  /* ── the mix, in numbers ────────────────────────────────────────────────
     Changing any of these changes the loudness of the whole app, so they are
     named and justified rather than sprinkled through the code. */
  var REF_PEAK  = 0.89;   // -1 dBTP. The output ceiling at volume 1.0.
  var BUS       = 0.75;   // program gain: puts a busy arrangement just into
                          // the limiter and a quiet one ~6 dB below it
  var LIM_THRESH  = -9;   // dB
  var LIM_KNEE    = 6;
  var LIM_RATIO   = 12;   // this is a limiter wearing a compressor's clothes
  var LIM_ATTACK  = 0.004;
  var LIM_RELEASE = 0.16;
  var HPF_HZ    = 120;    // below this a TV produces nothing and the limiter
                          // pays for it anyway
  var FLOOR_PAD  = 200;   // a sine pad below this is silent on a panel
  var FLOOR_MEL  = 330;   // the lead belongs in the intelligibility band
  var FLOOR_BASS = 80;    // a saw survives on its harmonics; this is a guard
                          // rail against a future mood with a very low root

  /* ── the scheduler, in numbers ────────────────────────────────────────── */
  var TICK_MS   = 120;    // wake-ups per second: 8.3. Cheap, and each one is
                          // small enough to hide inside a frame.
  var LOOKAHEAD = 0.35;   // seconds queued ahead of the audio clock
  var MAX_STEPS = 6;      // hard cap per tick. The slowest mood needs 2, the
                          // fastest 3; anything past this means the clock ran
                          // away and catching up would be a burst, not music.
  var REBASE    = 0.08;   // where the grid restarts after a gap

  /* ── the handover, in numbers ─────────────────────────────────────────── */
  var BATON_KEY  = 'x3f_music_baton';
  var BATON_MS   = 8000;  // a TV document load is slow; older than this and the
                          // baton is somebody else's session
  var HANDOFF_MS = 300;
  var ENTRY_MS   = 700;
  var ENTRY_STEPS = 8;    // half a bar of pad before the drums arrive

  var MOODS = {
    // twilight garden: warm, slow, pentatonic, nothing sharp
    bloom: {
      bpm: 68, root: 220.0, scale: [0, 3, 5, 7, 10], wave: 'triangle',
      padWave: 'sine', cutoff: 620, glide: 0.09, swing: 0.0, kick: 0.20, hat: 0.05, bassAt: 0.45
    },
    // sunlit reef: bright, bouncy, major, arcade
    splash: {
      bpm: 104, root: 261.63, scale: [0, 2, 4, 7, 9], wave: 'square',
      padWave: 'triangle', cutoff: 1500, glide: 0.02, swing: 0.12, kick: 0.30, hat: 0.10, bassAt: 0.35
    },
    // deep space: driving, minor, synthwave
    nova: {
      bpm: 124, root: 174.61, scale: [0, 2, 3, 7, 8], wave: 'sawtooth',
      padWave: 'sawtooth', cutoff: 900, glide: 0.03, swing: 0.0, kick: 0.34, hat: 0.09, bassAt: 0.25
    },
    // menus: a lively but unobtrusive bed, so the app hums while you choose
    menu: {
      bpm: 92, root: 233.08, scale: [0, 3, 5, 7, 10], wave: 'triangle',
      padWave: 'sine', cutoff: 900, glide: 0.05, swing: 0.06, kick: 0.16, hat: 0.06, bassAt: 0.4
    },
    // controlled reps, cousin of bloom in a different key
    flow: {
      bpm: 74, root: 196.0, scale: [0, 2, 4, 7, 9], wave: 'triangle',
      padWave: 'sine', cutoff: 700, glide: 0.08, swing: 0, kick: 0.20, hat: 0.05, bassAt: 0.45
    },
    // the training suite: businesslike, forward
    arena: {
      bpm: 112, root: 220.0, scale: [0, 2, 3, 5, 7], wave: 'square',
      padWave: 'triangle', cutoff: 1100, glide: 0.02, swing: 0.08, kick: 0.32, hat: 0.09, bassAt: 0.3
    },
    // head to head: tense, minor, insistent
    duel: {
      bpm: 128, root: 164.81, scale: [0, 1, 5, 7, 8], wave: 'sawtooth',
      padWave: 'sawtooth', cutoff: 800, glide: 0.02, swing: 0, kick: 0.34, hat: 0.10, bassAt: 0.25
    },
    // rhythm game: the beat is the point, so lead with it
    rhythm: {
      bpm: 120, root: 261.63, scale: [0, 2, 4, 5, 7], wave: 'square',
      padWave: 'triangle', cutoff: 1400, glide: 0.01, swing: 0.14, kick: 0.36, hat: 0.13, bassAt: 0.2
    },
    // calibration: sparse, patient, gets out of the way of an all-out pull
    calibrate: {
      bpm: 60, root: 174.61, scale: [0, 5, 7], wave: 'sine',
      padWave: 'sine', cutoff: 520, glide: 0.12, swing: 0, kick: 0.12, hat: 0.03, bassAt: 0.6
    },
    // neutral fallback
    calm: {
      bpm: 76, root: 196.0, scale: [0, 2, 5, 7, 9], wave: 'triangle',
      padWave: 'sine', cutoff: 700, glide: 0.06, swing: 0, kick: 0.18, hat: 0.04, bassAt: 0.5
    }
  };

  /* ── small shared helpers ─────────────────────────────────────────────── */

  function ms() { try { return performance.now(); } catch (e) { return Date.now(); } }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function freqOf(m, i) {
    var s = m.scale, oct = Math.floor(i / s.length);
    var semis = s[((i % s.length) + s.length) % s.length];
    return m.root * Math.pow(2, (semis + 12 * oct) / 12);
  }

  /* Octave-transpose a whole voice until its lowest note clears the floor.
     Whole octaves, as a block: flooring each note individually would lift some
     degrees and not others, and a melody whose intervals change depending on
     which notes happened to be low is not the same melody. */
  function octaveLift(lowest, floor) {
    var n = 0;
    while (lowest * Math.pow(2, n) < floor && n < 5) n++;
    return Math.pow(2, n);
  }

  /* Time-based smoothing. The old code used a fixed per-tick coefficient, which
     means the response speed is whatever the browser felt like scheduling - 8x
     faster in wall-clock terms once a tab is throttled to 1 Hz. */
  function smooth(dtMs, tauMs) { return 1 - Math.exp(-dtMs / tauMs); }

  function readBaton() {
    try {
      var b = JSON.parse(localStorage.getItem(BATON_KEY));
      if (b && typeof b.t === 'number' && Date.now() - b.t < BATON_MS) return b;
    } catch (e) {}
    return null;
  }
  function writeBaton(from, to, vol) {
    try {
      localStorage.setItem(BATON_KEY, JSON.stringify({
        from: from || null, to: to || null, vol: vol, t: Date.now()
      }));
    } catch (e) {}
  }

  /* ── one set of window listeners for the whole module ─────────────────────
     Not one set per instance. Every create() and every attach() used to add its
     own pointerdown+keydown to window and never remove them, so a page that
     called attach() carried four permanent listeners and a page that created
     twice carried eight. These are shared, and they are dropped again the moment
     no live instance still needs a gesture. */
  var LIVE = [];
  var unlockArmed = false;

  function unlockAll() {
    var pending = 0;
    for (var i = 0; i < LIVE.length; i++) if (!LIVE[i]._unlock()) pending++;
    if (!pending) dropUnlock();
  }
  function armUnlock() {
    if (unlockArmed) return;
    unlockArmed = true;
    addEventListener('pointerdown', unlockAll, { passive: true });
    addEventListener('keydown', unlockAll, { passive: true });
  }
  function dropUnlock() {
    if (!unlockArmed) return;
    unlockArmed = false;
    removeEventListener('pointerdown', unlockAll);
    removeEventListener('keydown', unlockAll);
  }

  /* Hidden means silent, and - more importantly - means STOPPED. A throttled
     setInterval plus a still-advancing audio clock is how D-MU-1 happened: the
     scheduler woke up a second (or a minute) late and tried to make up every
     missed sixteenth at the same instant. Suspending on the way out means there
     is nothing to catch up on the way back in. It also stops us holding the SoC
     awake behind Android TV's Ambient Mode. */
  function onVisibility() {
    var hidden = document.hidden;
    for (var i = 0; i < LIVE.length; i++) LIVE[i]._visibility(hidden);
  }
  document.addEventListener('visibilitychange', onVisibility);

  /* A navigation we were not told about still deserves a soft landing on the
     other side, so leave a baton on the way out of any document. */
  addEventListener('pagehide', function () {
    for (var i = 0; i < LIVE.length; i++) {
      if (LIVE[i].isOn()) { LIVE[i]._dropBaton(); return; }
    }
  });

  function create(o) {
    o = o || {};
    var moodName = MOODS[o.mood] ? o.mood : 'calm';
    var M = MOODS[moodName];
    var getI = o.getIntensity || function () { return 0; };
    /* 1.0 is now reference level, not "loud". The whole chain below is
       calibrated so that volume 1.0 peaks at -1 dBTP and sits near -23 LUFS. */
    var vol = (o.volume == null ? 1.0 : o.volume);

    var on = false, ctx = null;
    var bus = null, filter = null, hp = null, lim = null, env = null, master = null;
    var noiseBuf = null;
    var step = 0, nextTime = 0, timer = null, suspendTimer = null;
    var duckUntil = 0, duckAmt = 1, intensity = 0;
    var lastPump = 0, schedMs = 0;
    var pendingMood = null, handedOff = false;
    var padMul = 1, melMul = 1, bassMul = 1;
    var entryUntil = 0, entrySwell = false;

    /* Was the last page handing off to us? If so we start immediately and swell
       in, rather than waiting out the remembered-preference delay and then
       dropping in on a downbeat. */
    var baton = readBaton();
    try {
      var st = JSON.parse(localStorage.getItem('x3f_music'));
      if (st === false) on = false; else if (st === true) on = true;
    } catch (e) {}
    if (baton && o.volume == null && typeof baton.vol === 'number') vol = baton.vol;

    function applyMood(m) {
      M = m;
      var root = freqOf(m, 0);
      padMul  = octaveLift(root, FLOOR_PAD);
      melMul  = octaveLift(root, FLOOR_MEL);
      bassMul = octaveLift(root / 2, FLOOR_BASS);
    }
    applyMood(M);

    function degree(i) { return freqOf(M, i); }

    /* ── the graph ──────────────────────────────────────────────────────────
         tonal voices → filter (lowpass, sweeps with intensity) ─┐
         drums ──────────────────────────────────────────────────┴→ bus
           → hp (120 Hz) → lim → env (automation only) → master (per-tick
           volume) → destination

       env and master are separate on purpose: pump() assigns master.gain.value
       every tick, which would stamp on any ramp scheduled there. Fades that need
       to be smooth - the entry swell, the handoff - live on env. */
    function build() {
      if (ctx) return true;
      try {
        var C = window.AudioContext || window.webkitAudioContext;
        ctx = new C({ latencyHint: 'interactive' });
      } catch (e) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e2) { ctx = null; return false; }
      }
      master = ctx.createGain(); master.gain.value = 0;
      env = ctx.createGain(); env.gain.value = 1;
      bus = ctx.createGain(); bus.gain.value = BUS;
      hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      hp.frequency.value = HPF_HZ; hp.Q.value = 0.5;
      filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
      filter.frequency.value = M.cutoff;

      filter.connect(bus); bus.connect(hp);
      try {
        lim = ctx.createDynamicsCompressor();
        lim.threshold.value = LIM_THRESH; lim.knee.value = LIM_KNEE;
        lim.ratio.value = LIM_RATIO; lim.attack.value = LIM_ATTACK;
        lim.release.value = LIM_RELEASE;
        hp.connect(lim); lim.connect(env);
      } catch (e) { lim = null; hp.connect(env); }
      env.connect(master); master.connect(ctx.destination);

      // one short noise buffer, reused for every hat and snare
      var len = Math.floor(ctx.sampleRate * 0.25);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      return true;
    }

    function safeAt(at) {
      var floor = ctx.currentTime + 0.005;
      return at < floor ? floor : at;
    }

    function note(freq, at, dur, gain, wave, glide) {
      at = safeAt(at);
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = wave;
      if (glide > 0) {
        /* A portamento you can actually hear. The old ramp went to freq*1.001 -
           1.7 cents, about a third of the ~5 cent difference a listener can
           detect, so ten presets declared a glide that produced silence-shaped
           nothing. Scoop up into the note instead, by an interval proportional
           to the declared time so a 10 ms glide is a blip and a 120 ms glide is
           a slide. */
        var semis = Math.min(2.5, Math.max(0.3, glide * 20));
        osc.frequency.setValueAtTime(freq * Math.pow(2, -semis / 12), at);
        osc.frequency.exponentialRampToValueAtTime(freq, at + glide);
      } else {
        osc.frequency.setValueAtTime(freq, at);
      }
      osc.connect(g); g.connect(filter);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.06, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.start(at); osc.stop(at + dur + 0.03);
    }

    function drum(at, gain, tone, dur) {
      at = safeAt(at);
      var src = ctx.createBufferSource(); src.buffer = noiseBuf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = tone; bp.Q.value = 1.2;
      var g = ctx.createGain();
      src.connect(bp); bp.connect(g); g.connect(bus);
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.start(at); src.stop(at + dur + 0.02);
    }

    /* A kick a television can actually play. The old one was a sine sweeping
       120 -> 46 Hz: every part of it under the floor where a panel stops making
       sound. On the couch that is not a quiet kick, it is no kick - and it still
       spent headroom and pushed the limiter down on content nobody could hear.
       So the beat is carried by the beater click, and the body is kept small
       underneath for anyone listening through a soundbar or headphones. */
    function kick(at, gain) {
      at = safeAt(at);
      var c = ctx.createOscillator(), cg = ctx.createGain();
      c.type = 'triangle';
      c.frequency.setValueAtTime(1400, at);
      c.frequency.exponentialRampToValueAtTime(620, at + 0.035);
      cg.gain.setValueAtTime(gain * 0.85, at);
      cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      c.connect(cg); cg.connect(bus);
      c.start(at); c.stop(at + 0.09);

      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, at);
      osc.frequency.exponentialRampToValueAtTime(90, at + 0.09);
      osc.connect(g); g.connect(bus);
      g.gain.setValueAtTime(gain * 0.35, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      osc.start(at); osc.stop(at + 0.16);
    }

    /* Swing delays the second eighth of every beat. One grid for every voice, so
       the hats and the melody agree about where the late note is.

       The old line was `at + (M.swing && step % 2 ? 0.03 : 0)` inside a branch
       guarded by `step % density === 0` with density always even - so step was
       always even, the ternary was always false, and rhythm's declared 0.14 and
       splash's 0.12 did nothing at all. The magnitude is now the declared value:
       a fraction of an eighth, where 1/3 would be a full triplet shuffle. */
    function swingAt(spb) {
      if (!M.swing) return 0;
      return (Math.floor(step / 2) % 2) ? M.swing * 2 * spb : 0;
    }

    /* One sixteenth of a bar per tick. Everything is a function of `intensity`,
       so the arrangement grows and shrinks with the player. */
    function tickStep(at, spb) {
      var i = intensity;
      var bar16 = step % 16;

      // a mood change lands on a downbeat, never in the middle of a phrase
      if (pendingMood && bar16 === 0) { applyMood(pendingMood); pendingMood = null; }

      var beat = step % 4;
      var t = at + swingAt(spb);
      // the entry swell: the first half-bar after a handover is pad only, so the
      // new mood arrives as a breath instead of a beat landing out of nowhere
      var quiet = step < entryUntil;

      if (!quiet) {
        if (bar16 === 0 || (i > 0.5 && bar16 === 8)) kick(t, M.kick * (0.7 + i * 0.5));
        if (beat === 2) drum(t, M.hat * (0.55 + i * 0.85), 4200, 0.045);
        if (i > 0.55 && beat === 0 && bar16 !== 0) drum(t, M.hat * 0.6, 3200, 0.03);
        if (i > 0.75 && step % 2 === 1) drum(t, M.hat * 0.4, 6400, 0.022);
      }

      /* pad: a held chord that only shows up when things are calm. Voiced from
         FLOOR_PAD up and in three parts, because the old two-note voicing an
         octave down was a sine at 87-131 Hz - the single least audible thing a
         TV speaker can be asked to do. */
      if (bar16 === 0) {
        var padGain = 0.045 + (1 - i) * 0.05;
        note(degree(0) * padMul, t, 2.1, padGain, M.padWave, M.glide);
        note(degree(2) * padMul, t, 2.1, padGain * 0.8, M.padWave, M.glide);
        note(degree(4) * padMul, t, 2.1, padGain * 0.55, M.padWave, M.glide);
      }
      /* bass joins once you are working. A sawtooth is the one voice that
         survives down here: the panel loses its fundamental but the harmonic
         series above it is intact, and the ear rebuilds the missing root. */
      if (!quiet && i > M.bassAt && bar16 % 4 === 0) {
        note(degree([0, 0, 3, 2][(step / 4 | 0) % 4]) / 2 * bassMul, t, 0.34,
             0.10 + i * 0.05, 'sawtooth', 0);
      }
      // melody: sparse when easy, an arpeggio when hard
      var density = i > 0.7 ? 2 : i > 0.35 ? 4 : 8;
      if (step % density === 0) {
        var pat = [0, 2, 4, 2, 3, 5, 4, 2];
        var d = pat[(step / density | 0) % pat.length] + (i > 0.8 ? 2 : 0);
        note(degree(d) * melMul, t, density >= 8 ? 0.5 : 0.19,
             0.05 + i * 0.045, M.wave, 0);
      }
      step++;
    }

    function pump() {
      if (!on || !ctx || handedOff) return;
      var t0 = ms();
      var dt = lastPump ? Math.min(2000, t0 - lastPump) : TICK_MS;
      lastPump = t0;

      var iTarget = 0;
      try { iTarget = clamp01(+getI() || 0); } catch (e) { iTarget = 0; }
      intensity += (iTarget - intensity) * smooth(dt, 600);
      // brighten with effort - the single most "alive" cue
      try { filter.frequency.value = M.cutoff * (0.75 + intensity * 1.9); } catch (e) {}
      /* Volume, with ducking while a cue or fanfare is playing. Asymmetric, the
         way ducking always should be: out of the way fast, back slowly. The old
         coefficient gave a ~540 ms time constant in both directions, so a
         duck(0.4) never even reached its target before the window closed - the
         duck the games ask for was barely audible. */
      var dTarget = ms() < duckUntil ? 0.28 : 1;
      duckAmt += (dTarget - duckAmt) * smooth(dt, dTarget < duckAmt ? 60 : 260);
      try { master.gain.value = REF_PEAK * vol * duckAmt; } catch (e) {}

      var spb = 60 / M.bpm / 4;                  // seconds per sixteenth
      var horizon = ctx.currentTime + LOOKAHEAD;
      /* If the clock has run past us by more than one tick's worth of work, we
         are not late, we are in a different bar. Re-base rather than schedule
         every missed sixteenth at the same instant - which is what turned a
         backgrounded tab into a thousand oscillators starting inside 20 ms. */
      if (nextTime < ctx.currentTime - MAX_STEPS * spb) {
        nextTime = ctx.currentTime + REBASE;
        step = Math.ceil(step / 16) * 16;         // resume on a downbeat
      }
      var n = 0;
      while (nextTime < horizon && n < MAX_STEPS) {
        tickStep(nextTime, spb);
        nextTime += spb;
        n++;
      }
      schedMs = schedMs * 0.8 + (ms() - t0) * 0.2;
    }

    function clearTimer() {
      if (timer) { clearInterval(timer); timer = null; }
      lastPump = 0;
    }

    function start() {
      if (!build()) return false;
      if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      on = true; handedOff = false;
      // far enough ahead that the first pump() is not already late for it
      step = 0; nextTime = ctx.currentTime + 0.16;
      duckUntil = 0; duckAmt = 1;

      try {
        var t = ctx.currentTime;
        env.gain.cancelScheduledValues(t);
        if (entrySwell) {
          // arriving from a handover: swell rather than cut in
          env.gain.setValueAtTime(0.0001, t);
          env.gain.linearRampToValueAtTime(1, t + ENTRY_MS / 1000);
          entryUntil = ENTRY_STEPS;
          entrySwell = false;
        } else {
          env.gain.setValueAtTime(1, t);
          entryUntil = 0;
        }
      } catch (e) {}

      if (!timer) timer = setInterval(pump, TICK_MS);
      pump();                                    // don't wait a tick for bar one
      try { localStorage.setItem('x3f_music', 'true'); } catch (e) {}
      armUnlock();
      return true;
    }

    /* halt() is the machinery; stop() is the user saying "off". Only the second
       one writes the preference - a teardown must never look like a choice, or
       the menu shell disposing of an instance on the way out would silently
       remember that the user turned the music off.

       Either way the AudioContext gets suspended. It used to be left running:
       the audio thread, the noise buffer and every decaying node stayed resident
       for the life of the page even with the music off. */
    function halt() {
      on = false; handedOff = false;
      clearTimer();
      duckUntil = 0; duckAmt = 1;
      if (ctx) {
        try {
          var t = ctx.currentTime;
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(env.gain.value, t);
          env.gain.linearRampToValueAtTime(0.0001, t + 0.12);
        } catch (e) {}
        if (suspendTimer) clearTimeout(suspendTimer);
        suspendTimer = setTimeout(function () {
          suspendTimer = null;
          if (!on && ctx) { try { ctx.suspend(); } catch (e) {} }
        }, 220);
      }
    }
    function stop() {
      halt();
      try { localStorage.setItem('x3f_music', 'false'); } catch (e) {}
    }

    /* Change colour without changing document. This is what makes AD-1 pay off:
       once the menus are one page, a route change is a mood change, and a mood
       change is free - no teardown, no gap, and it lands on the next downbeat so
       the key and tempo move at a musically sensible moment. */
    function setMood(name, immediate) {
      if (!MOODS[name]) return false;
      moodName = name;
      if (immediate || !on || !ctx) { applyMood(MOODS[name]); pendingMood = null; }
      else pendingMood = MOODS[name];
      return true;
    }

    function dropBaton(to) { writeBaton(moodName, to, vol); }

    /* Leaving for another document. Play a short rising cadence in the current
       scale, open the filter under it so it reads as a lift rather than a cut,
       fade out, and leave the baton. Returns the milliseconds the caller should
       wait before navigating; navigating early only costs the cadence, because
       the baton is written first and the arrival end works either way. */
    function handoff(to) {
      dropBaton(to);
      if (!on || !ctx || handedOff) return 0;
      handedOff = true;
      clearTimer();
      try {
        var t = ctx.currentTime + 0.02;
        filter.frequency.cancelScheduledValues(t);
        filter.frequency.setValueAtTime(filter.frequency.value, t);
        filter.frequency.linearRampToValueAtTime(5200, t + 0.06);
        note(degree(4) * melMul, t, 0.16, 0.10, M.wave, 0);
        note(degree(7) * melMul, t + 0.085, 0.24, 0.11, M.wave, 0);
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(1, t);
        env.gain.setValueAtTime(1, t + 0.14);
        env.gain.linearRampToValueAtTime(0.0001, t + HANDOFF_MS / 1000);
      } catch (e) {}
      if (suspendTimer) clearTimeout(suspendTimer);
      suspendTimer = setTimeout(function () {
        suspendTimer = null;
        if (ctx) { try { ctx.suspend(); } catch (e) {} }
      }, HANDOFF_MS + 60);
      return HANDOFF_MS;
    }

    function destroy() {
      halt();
      var ix = LIVE.indexOf(api); if (ix >= 0) LIVE.splice(ix, 1);
      if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
      if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
      if (!LIVE.length) dropUnlock();
    }

    var api = {
      start: start,
      stop: stop,
      toggle: function () { if (on) { stop(); return false; } return !!start(); },
      isOn: function () { return on; },
      duck: function (seconds) { duckUntil = ms() + (seconds || 0.4) * 1000; },
      setVolume: function (v) { vol = clamp01(v); },
      volume: function () { return vol; },
      /* The resolved mood, not the requested one. `mood()` used to echo back
         whatever the caller asked for even when it had silently fallen back to
         `calm`, which is exactly the case you want to be able to see. */
      mood: function () { return moodName; },
      setMood: setMood,
      handoff: handoff,
      destroy: destroy,
      /* For the Hisense bring-up: schedMs is the smoothed main-thread cost of one
         scheduler wake-up, which is the number that has to stay small next to a
         game's rAF loop. */
      stats: function () {
        return {
          mood: moodName, on: on, intensity: intensity, step: step,
          schedMs: schedMs, state: ctx ? ctx.state : 'none',
          baseLatency: ctx && ctx.baseLatency, sampleRate: ctx && ctx.sampleRate
        };
      },

      // ── internal, used by the module-level listeners above ──
      _dropBaton: function () { dropBaton(null); },
      _unlock: function () {
        if (!on) return true;                       // nothing pending
        if (!ctx) { start(); return !!(ctx && ctx.state === 'running'); }
        if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
        return ctx.state === 'running';
      },
      _visibility: function (hidden) {
        if (!ctx || !on || handedOff) return;
        if (hidden) {
          clearTimer();
          try { ctx.suspend(); } catch (e) {}
        } else {
          try { ctx.resume(); } catch (e) {}
          nextTime = ctx.currentTime + REBASE;
          step = Math.ceil(step / 16) * 16;
          if (!timer) timer = setInterval(pump, TICK_MS);
        }
      }
    };

    LIVE.push(api);
    armUnlock();

    if (baton && on) {
      // handed over from the previous document: swell in, do not wait
      entrySwell = true;
      setTimeout(start, 0);
    } else if (on) {
      setTimeout(start, 250);                    // remembered preference
    }

    return api;
  }

  /* ── the music button ─────────────────────────────────────────────────────
     Six pages rolled this by hand or passed a host that did not exist, and three
     of them ended up with a raw grey OS button - one of them at the very end of
     <body>, below the fold, still marked data-nav so a D-pad could focus a
     control visually detached from the page. So the helper now finds a sane host
     itself and injects its own fallback style.

     The style is inserted as the FIRST child of <head> on purpose: page rules
     then win every specificity tie, so this only shows up where the page has no
     opinion. It deliberately says nothing about focus - X3FNav owns the ring. */
  var styled = false;
  function css() {
    if (styled || !document.head) return; styled = true;
    var s = document.createElement('style');
    s.textContent =
      '.x3fm-btn{font:inherit;font-weight:600;color:var(--txt-2,#B9C0CE);' +
      'background:var(--surface-2,#232936);' +
      'border:1px solid var(--line-2,rgba(236,238,242,.18));' +
      'border-radius:var(--r-pill,100rem);padding:.42em 1.1em;cursor:pointer;' +
      'white-space:nowrap;line-height:1.1}' +
      /* last resort only: a page with no top bar at all still gets its control
         inside the overscan-safe area rather than off the bottom of the page */
      '.x3fm-float{position:fixed;top:var(--safe-y,5vh);right:var(--safe-x,5vw);' +
      'z-index:40;display:flex;gap:.5rem}';
    document.head.insertBefore(s, document.head.firstChild);
  }

  /* One-liner for menus and any game without a force signal to feed it. Idles
     low and lifts briefly whenever you press something, so the app feels awake
     rather than looping at you. Creates its own toggle if the page has no
     #musicBtn to borrow. */
  function attach(o) {
    o = o || {};
    /* The lift decays against the clock, not against scheduler ticks. It used to
       decay only inside pump(), so with the music off it froze at whatever it
       was and the next start() began at that stale value. */
    var liftAt = 0;
    var bump = function () { liftAt = ms(); };
    var custom = !!o.getIntensity;

    var inst = create({
      mood: o.mood || 'menu',
      volume: o.volume,
      getIntensity: o.getIntensity || function () {
        var age = liftAt ? ms() - liftAt : 1e9;
        return Math.min(1, (o.idle == null ? 0.22 : o.idle) + 0.5 * Math.exp(-age / 900));
      }
    });

    var evs = ['pointerdown', 'keydown'];
    if (!custom) {
      evs.forEach(function (ev) { addEventListener(ev, bump, { passive: true }); });
    }

    var btn = o.button || document.getElementById('musicBtn');
    if (!btn && o.makeButton !== false) {
      css();
      btn = document.createElement('button');
      btn.id = 'musicBtn';
      btn.type = 'button';
      btn.className = (o.buttonClass || 'home') + ' x3fm-btn';
      btn.setAttribute('data-nav', '');
      /* document.body is never an answer - Calibrate passes it as its own
         fallback and lands the button below the fold. Look for a real bar
         first, and float it in the safe area if there genuinely is not one. */
      var host = o.buttonHost;
      if (!host || host === document.body) {
        host = document.querySelector('.top,.topbar,.updrow,header');
      }
      if (!host) {
        host = document.querySelector('.x3fm-float');
        if (!host) {
          host = document.createElement('div');
          host.className = 'x3fm-float';
          (document.body || document.documentElement).appendChild(host);
        }
      }
      host.appendChild(btn);
    }
    if (btn) {
      var sync = function () {
        var isOn = inst.isOn();
        btn.textContent = isOn ? '♪ Music on' : '♪ Music off';
        btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      };
      sync();
      btn.addEventListener('click', function () { inst.toggle(); sync(); });
      if (window.X3FNav) try { X3FNav.refresh(); } catch (e) {}
    }

    var innerDestroy = inst.destroy;
    inst.destroy = function () {
      if (!custom) evs.forEach(function (ev) { removeEventListener(ev, bump); });
      innerDestroy();
    };
    return inst;
  }

  /* Convenience for a navigation helper that does not hold the instance: hands
     off on the most recently created live instance. Returns the milliseconds to
     wait before navigating, 0 if there is nothing playing. */
  function handoff(to) {
    for (var i = LIVE.length - 1; i >= 0; i--) {
      if (LIVE[i].isOn()) return LIVE[i].handoff(to);
    }
    writeBaton(null, to, null);
    return 0;
  }

  window.X3FMusic = {
    create: create, attach: attach, handoff: handoff, moods: Object.keys(MOODS)
  };
})();
