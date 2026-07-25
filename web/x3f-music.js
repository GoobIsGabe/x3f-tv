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
*/
(function () {
  "use strict";

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

  function create(o) {
    o = o || {};
    var M = MOODS[o.mood] || MOODS.calm;
    var getI = o.getIntensity || function () { return 0; };
    var vol = (o.volume == null ? 0.5 : o.volume);

    var on = false, ctx = null, master = null, filter = null, noiseBuf = null;
    var step = 0, nextTime = 0, timer = null, duckUntil = 0, duckAmt = 1;
    var intensity = 0;
    try { var st = JSON.parse(localStorage.getItem('x3f_music')); if (st === false) on = false; else if (st === true) on = true; } catch (e) {}

    function build() {
      if (ctx) return true;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
      master = ctx.createGain(); master.gain.value = 0;
      filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = M.cutoff;
      filter.connect(master); master.connect(ctx.destination);
      // one short noise buffer, reused for every hat and snare
      var len = Math.floor(ctx.sampleRate * 0.25);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      return true;
    }

    function note(freq, at, dur, gain, wave, glide) {
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = wave; osc.frequency.setValueAtTime(freq, at);
      if (glide) osc.frequency.exponentialRampToValueAtTime(freq * 1.001, at + glide);
      osc.connect(g); g.connect(filter);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.06, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.start(at); osc.stop(at + dur + 0.03);
    }
    function drum(at, gain, tone, dur) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = tone; bp.Q.value = 0.9;
      var g = ctx.createGain();
      src.connect(bp); bp.connect(g); g.connect(master);
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.start(at); src.stop(at + dur + 0.02);
    }
    function kick(at, gain) {
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, at);
      osc.frequency.exponentialRampToValueAtTime(46, at + 0.11);
      osc.connect(g); g.connect(master);
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      osc.start(at); osc.stop(at + 0.2);
    }

    function degree(i) {
      var s = M.scale, oct = Math.floor(i / s.length), semis = s[((i % s.length) + s.length) % s.length];
      return M.root * Math.pow(2, (semis + 12 * oct) / 12);
    }

    /* One sixteenth of a bar per tick. Everything is a function of `intensity`,
       so the arrangement grows and shrinks with the player. */
    function tickStep(at) {
      var i = intensity;
      var beat = step % 4, bar16 = step % 16;

      if (bar16 === 0 || (i > 0.5 && bar16 === 8)) kick(at, M.kick * (0.7 + i * 0.5));
      if (beat === 2) drum(at, M.hat * (0.6 + i), 7200, 0.045);
      if (i > 0.55 && beat === 0 && bar16 !== 0) drum(at, M.hat * 0.7, 6200, 0.03);
      if (i > 0.75 && step % 2 === 1) drum(at, M.hat * 0.45, 9000, 0.022);

      // pad: a held chord that only shows up when things are calm
      if (bar16 === 0) {
        var padGain = 0.05 + (1 - i) * 0.06;
        note(degree(0) / 2, at, 2.1, padGain, M.padWave, M.glide);
        note(degree(2) / 2, at, 2.1, padGain * 0.8, M.padWave, M.glide);
      }
      // bass joins once you are working
      if (i > M.bassAt && bar16 % 4 === 0) {
        note(degree([0, 0, 3, 2][(step / 4 | 0) % 4]) / 2, at, 0.34, 0.10 + i * 0.05, 'sawtooth', 0);
      }
      // melody: sparse when easy, an arpeggio when hard
      var density = i > 0.7 ? 2 : i > 0.35 ? 4 : 8;
      if (step % density === 0) {
        var pat = [0, 2, 4, 2, 3, 5, 4, 2];
        var d = pat[(step / density | 0) % pat.length] + (i > 0.8 ? 2 : 0);
        note(degree(d), at + (M.swing && step % 2 ? 0.03 : 0), density >= 8 ? 0.5 : 0.19,
             0.055 + i * 0.05, M.wave, 0);
      }
      step++;
    }

    function pump() {
      if (!on || !ctx) return;
      var iTarget = Math.max(0, Math.min(1, +getI() || 0));
      intensity += (iTarget - intensity) * 0.18;
      // brighten with effort - the single most "alive" cue
      try { filter.frequency.value = M.cutoff * (0.75 + intensity * 1.9); } catch (e) {}
      // volume, with ducking while a cue or fanfare is playing
      var now = performance.now();
      duckAmt += ((now < duckUntil ? 0.28 : 1) - duckAmt) * 0.2;
      try { master.gain.value = 0.16 * vol * duckAmt; } catch (e) {}

      var spb = 60 / M.bpm / 4;                  // seconds per sixteenth
      var horizon = ctx.currentTime + 0.35;
      while (nextTime < horizon) {
        tickStep(Math.max(nextTime, ctx.currentTime + 0.02));
        nextTime += spb;
      }
    }

    function start() {
      if (!build()) return false;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      on = true;
      step = 0; nextTime = ctx.currentTime + 0.08;
      if (!timer) timer = setInterval(pump, 120);
      try { localStorage.setItem('x3f_music', 'true'); } catch (e) {}
      return true;
    }
    function stop() {
      on = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (master) try { master.gain.value = 0; } catch (e) {}
      try { localStorage.setItem('x3f_music', 'false'); } catch (e) {}
    }

    // Browsers gate audio behind a gesture; the TV shell does not, but be ready
    // either way - if it was on last session, start at the first chance we get.
    function armAutostart() {
      var tryIt = function () {
        if (on && ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
        if (on && !ctx) start();
      };
      ['pointerdown', 'keydown'].forEach(function (e) {
        addEventListener(e, tryIt, { passive: true });
      });
    }
    armAutostart();
    if (on) setTimeout(start, 250);              // remembered preference

    return {
      start: start,
      stop: stop,
      toggle: function () { if (on) { stop(); return false; } return !!start(); },
      isOn: function () { return on; },
      duck: function (seconds) { duckUntil = performance.now() + (seconds || 0.4) * 1000; },
      setVolume: function (v) { vol = Math.max(0, Math.min(1, v)); },
      mood: function () { return o.mood || 'calm'; }
    };
  }

  /* One-liner for menus and any game without a force signal to feed it. Idles
     low and lifts briefly whenever you press something, so the app feels awake
     rather than looping at you. Creates its own toggle if the page has no
     #musicBtn to borrow. */
  function attach(o) {
    o = o || {};
    var lift = 0;
    var inst = create({
      mood: o.mood || 'menu',
      volume: o.volume,
      getIntensity: o.getIntensity || function () {
        lift *= 0.92;
        return Math.min(1, (o.idle == null ? 0.22 : o.idle) + lift);
      }
    });
    ['pointerdown', 'keydown'].forEach(function (ev) {
      addEventListener(ev, function () { lift = 0.5; }, { passive: true });
    });
    var btn = o.button || document.getElementById('musicBtn');
    if (!btn && o.makeButton !== false) {
      btn = document.createElement('button');
      btn.id = 'musicBtn';
      btn.className = o.buttonClass || 'home';
      btn.setAttribute('data-nav', '');
      var host = o.buttonHost || document.querySelector('.top') || document.querySelector('.topbar');
      if (host) host.appendChild(btn); else btn = null;
    }
    if (btn) {
      var sync = function () { btn.textContent = inst.isOn() ? '♪ Music on' : '♪ Music off'; };
      sync();
      btn.addEventListener('click', function () { inst.toggle(); sync(); });
      if (window.X3FNav) try { X3FNav.refresh(); } catch (e) {}
    }
    return inst;
  }

  window.X3FMusic = { create: create, attach: attach, moods: Object.keys(MOODS) };
})();
