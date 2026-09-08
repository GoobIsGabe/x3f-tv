/* X3F HYPE - the celebration layer.

   ─────────────────────────────────────────────────────────────────────────
   WHAT THIS IS FOR, AND WHAT IT USED TO BE FOR
   ─────────────────────────────────────────────────────────────────────────

   A set is won or lost in its last few reps, and that is exactly when a
   counter ticking up by one stops meaning anything. This layer watches the
   numbers a set produces and gets loud at the right moments instead of every
   moment. The two-tier shape it has always had is kept, because it is right:

     rung       a nod. Text, a two-note blip, out of your way in a second.
     major      the escalating one. An approach counter that pulls you toward
                the target, then a callout, a flash, confetti and a fanfare.

   What changed is WHICH numbers earn which tier.

   The old file's loudest events were 50 / 75 / 100 / 150 / 200 / 250 total
   reps. The program this app exists to serve says, in as many words:

       "Sometimes individuals will start to increase the repetition speed so
        they can break a personal record. Don't do that... your objective is
        exhausting the muscle. It's not getting one more repetition."

   A rep ladder with a gold, sub-bass, thirty-four-confetti fanfare at rep 50
   is an instruction to go faster. So total reps are now RUNGS ONLY - a nod,
   never a fanfare - and the majors were re-pointed at what the source says
   the set is actually for:

     range('mid')      full-range failure. The moment the set starts counting.
     range('weak')     mid-range gone. Deeper than most people ever go.
     range('failure')  the bar will not move an inch. The stated end point.
     partials(...)     each tier of partials past full-range failure.
     hold(s)           seconds spent in the strong range - the range the whole
                       method exists to load, and the one a rep count hides.
     negative(s)       a slower negative, up to the prescribed window and NOT
                       past it ("you don't wanna pause at the bottom").
     peak(f)           a genuine personal best on peak force. Band is the
                       progress axis, so this is the one number where beating
                       yourself is unambiguously the point.

   Two rep counts still matter, because the program names them: 15 full reps
   (the floor that makes a band honest) and 40 (the ceiling that means go
   heavier). They stay rungs, but they carry the band-coaching line.

   ─────────────────────────────────────────────────────────────────────────
   MILESTONES ARE DETECTED BY CROSSING, NOT BY EQUALITY
   ─────────────────────────────────────────────────────────────────────────

   The old detector was `value === rung`. Reps advance by exactly one, so it
   worked in Bloom and was invisible everywhere else: a Nova score goes
   216 -> 248 -> 285 and never equals 250, so the callout never fired AND the
   rung was never marked done, which also killed the approach counter for the
   rest of the run. Every channel here fires for every rung in (previous,
   current] and announces the highest one crossed. That single change is what
   makes this file work in a points game at all.

   ─────────────────────────────────────────────────────────────────────────
   ONE CALLOUT AT A TIME, DECIDED BY WEIGHT
   ─────────────────────────────────────────────────────────────────────────

   A rep can be a rep milestone and a partials milestone in the same tick.
   The old code painted both - the second overwrote the first, so you saw one
   callout and heard two fanfares layered over each other. Callouts are now
   queued into a single slot and flushed once per frame: the heaviest wins,
   the others are dropped, and exactly one fanfare plays. Entering a new
   range outranks everything, which is also the correct priority.

   ─────────────────────────────────────────────────────────────────────────
   AUDIO IS MIXED FOR A TV, NOT FOR HEADPHONES
   ─────────────────────────────────────────────────────────────────────────

   Same constraint x3f-calflow.js is built around, for the same reason: a TV
   panel under 25 mm deep has small, unenclosed, downward- or rear-firing
   drivers with essentially no output below a few hundred Hz, and the user is
   three metres away and breathing hard.

     - every note here has its fundamental between 620 Hz and 2.1 kHz
     - the whole layer runs through a 200 Hz high-pass, so nothing can ever
       spend headroom on content the panel cannot reproduce
     - the old fanfare's identity came from a 261 Hz sine "weight" note. That
       note was inaudible on the target device. Majors are now distinguished
       by RHYTHM and PITCH - four rising notes vs five fast ones vs a falling
       three-note figure - because loudness is the one dimension you do not
       control on a TV
     - one master gain, so the fanfare no longer peaks three times louder
       than the entire soundtrack (x3f-music.js sums to ~0.17)

   ─────────────────────────────────────────────────────────────────────────
   FRAME BUDGET
   ─────────────────────────────────────────────────────────────────────────

   There is no rAF loop. The old one ran forever, once per create(), to do
   nothing but check two timestamps; timers do that for free. Everything that
   moves animates transform or opacity only. No backdrop-filter, no blur, no
   mix-blend-mode (a full-screen blend is a whole-framebuffer pass), no
   will-change. Confetti is majors-only and capped, and reduced-motion
   suppresses the confetti, the flash, the shake and the overshoot - not just
   the shake, which is all the old file honoured.

     var hype = X3FHype.create({host: stage, unit: 'reps', theme: {...},
                                ladder: [...], best: function(){return 42}});
     hype.set(reps);                 // the headline number, whenever it changes
     hype.range('mid');              // full-range failure reached
     hype.partials('mid', 6);        // partials, by tier
     hype.setBurn(9);                // or just the total, if that is all you have
     hype.hold(seconds);             // time in the strong range this set
     hype.negative(seconds);         // the last lowering phase
     hype.peak(force);               // live peak force this set
     hype.reset();                   // new set / new run
     hype.destroy();                 // releases the DOM, the timers, the audio
*/
(function () {
  "use strict";

  /* Total reps. Rungs only - there is deliberately no rep major. See the
     header. The two program-significant counts (15 and 40) are rungs that
     carry a different sub-line, not louder events. */
  var REP_RUNGS = [10, 15, 20, 25, 30, 35, 40, 50, 60, 75, 100, 125, 150, 200];

  /* Partials past full-range failure. This is the ladder that earns majors,
     because it is the one measuring what the source calls the point of the
     set. */
  var PARTIAL_RUNGS  = [3, 5, 8, 12, 16, 20, 25, 30, 40, 50];
  var PARTIAL_MAJORS = [10, 20, 30];

  /* Seconds under load in the strong range. No approach counter: you cannot
     consciously chase a second-count while pulling, and a number repainting
     once a second in peripheral vision reads as an alert. */
  var HOLD_RUNGS  = [15, 30, 45, 60, 90, 120, 180];
  var HOLD_MAJORS = [60, 120];

  var MIN_CALLOUT_GAP = 700;   // ms. Two fanfares closer than this is noise.

  var styled = false;

  /* The program's own numbers, from the one file that owns them. Falls back to
     the published figures if x3f-exercises.js has not loaded, so this module
     never hard-depends on load order. */
  function protocol() {
    var p = null;
    try { p = window.X3FEX && X3FEX.protocol; } catch (e) { p = null; }
    return {
      repsMin: (p && +p.repsMin) || 15,
      repsMax: (p && +p.repsMax) || 40,
      downS:  (((p && +p.tempoDownMs) || 2500) / 1000)
    };
  }

  function css() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent =
      /* Sized in em and % throughout, so the layer is identical whether the
         WebView hands the page 960 or 1920 CSS px. */
      '.x3fh{position:absolute;inset:0;pointer-events:none;z-index:7;overflow:hidden;' +
      "font-family:var(--font-display,system-ui,-apple-system,'Segoe UI',sans-serif)}" +

      /* The approach counter. Sticky - it stays lit for the whole approach and
         goes out when the target lands. The old one self-hid after 1500 ms,
         which at Bloom's 3 s rep tempo meant the thing meant to pull you toward
         the target was dark for half of every rep. */
      '.x3fh-near{position:absolute;left:0;right:0;bottom:14%;text-align:center;' +
      'font-weight:700;letter-spacing:.02em;opacity:0;transform:scale(.72);' +
      'transition:opacity .18s,transform .22s cubic-bezier(.2,1.6,.3,1);' +
      'text-shadow:0 .06em .5em rgba(0,0,0,.8)}' +
      '.x3fh-near.on{opacity:1}' +
      /* the shake lives on the inner span so it cannot fight the urgency scale
         the JS writes onto the parent */
      '.x3fh-nearI{display:inline-block}' +
      '.x3fh-nearI.shake{animation:x3fh-shake .34s cubic-bezier(.36,.07,.19,.97) both}' +
      '@keyframes x3fh-shake{10%,90%{transform:translateX(-.02em)}' +
      '20%,80%{transform:translateX(.03em)}30%,50%,70%{transform:translateX(-.05em)}' +
      '40%,60%{transform:translateX(.05em)}}' +

      /* The callout. */
      '.x3fh-big{position:absolute;left:0;right:0;top:32%;text-align:center;font-weight:700;' +
      'line-height:1.05;opacity:0;transform:scale(.55);' +
      'transition:opacity .2s,transform .34s cubic-bezier(.2,1.8,.3,1);' +
      'text-shadow:0 .08em .5em rgba(0,0,0,.85)}' +
      '.x3fh-big.on{opacity:1;transform:scale(1)}' +
      '.x3fh-sub{display:block;font-weight:700;letter-spacing:.16em;text-transform:uppercase;' +
      'opacity:.82;margin-top:.34em}' +
      /* plain alpha, no mix-blend-mode: a full-screen blended layer is a pass
         over the whole framebuffer every frame it is visible */
      '.x3fh-flash{position:absolute;inset:0;opacity:0;transition:opacity .42s}' +
      '.x3fh-bit{position:absolute;width:.9%;height:1.6%;border-radius:2px}' +

      /* The partials meter. Appears only after full-range failure, because that
         is the only time it means anything. */
      '.x3fh-burn{position:absolute;left:50%;bottom:4%;' +
      'transform:translateX(-50%) translateY(.6em);' +
      'display:flex;align-items:center;gap:.6em;padding:.4em .9em;border-radius:100px;' +
      'background:rgba(15,17,20,.92);border:1px solid rgba(255,158,74,.5);opacity:0;' +
      'font-weight:700;transition:opacity .3s,transform .3s cubic-bezier(.2,.9,.25,1)}' +
      '.x3fh-burn.on{opacity:1;transform:translateX(-50%)}' +
      '.x3fh-burn u{text-decoration:none;letter-spacing:.12em;text-transform:uppercase;opacity:.72}' +
      '.x3fh-burn b{font-variant-numeric:tabular-nums}' +
      '.x3fh-burn span{display:block;width:4.5em;height:.34em;border-radius:1em;' +
      'background:rgba(236,238,242,.14);overflow:hidden}' +
      /* scaleX, not width: width is layout, transform is the compositor */
      '.x3fh-burn i{display:block;height:100%;width:100%;border-radius:1em;' +
      'background:linear-gradient(90deg,#FF6376,#FFC94A);' +
      'transform:scaleX(0);transform-origin:left center;transition:transform .3s}' +

      /* All of it, not just the shake. */
      '@media (prefers-reduced-motion:reduce){' +
      '.x3fh-nearI.shake{animation:none}' +
      '.x3fh-near{transform:none;transition:opacity .12s}' +
      '.x3fh-big{transform:none;transition:opacity .12s}' +
      '.x3fh-big.on{transform:none}' +
      '.x3fh-flash{display:none}' +
      '.x3fh-burn{transform:translateX(-50%);transition:opacity .12s}' +
      '.x3fh-burn i{transition:none}}';
    document.head.appendChild(s);
  }

  function nowMs() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  /* A points ladder needs point-scale majors. The old file applied
     [50,75,100,150,200,250] to every caller, so a Splash score of 50 - eight
     seconds into a run whose top rung is 10 000 - got the full gold fanfare.
     Derive instead: the top rung is always a major, then roughly every third
     rung below it, and never anything under a fifth of the top. Two or three
     majors per run is the intended density; more and they stop meaning
     anything. */
  function deriveMajors(rungs) {
    if (!rungs || rungs.length < 4) return rungs ? rungs.slice(-1) : [];
    var top = rungs[rungs.length - 1], floor = top * 0.2, out = [];
    for (var i = rungs.length - 1; i >= 0 && out.length < 3; i -= 3) {
      if (rungs[i] >= floor) out.push(rungs[i]);
    }
    return out.reverse();
  }

  /* ── one channel of milestones ────────────────────────────────────────────
     Rungs and majors share ONE done-namespace per channel, which is how a
     caller's own rung at 250 stops being shadowed by a default major at 250.
     Crossing, not equality: everything in (previous, current] fires. */
  function Chan(spec) {
    var all = (spec.rungs || []).concat(spec.majors || []);
    var seen = {}, uniq = [];
    for (var i = 0; i < all.length; i++) {
      if (!seen[all[i]]) { seen[all[i]] = 1; uniq.push(+all[i]); }
    }
    this.key    = spec.key;
    this.rungs  = uniq.sort(function (a, b) { return a - b; });
    this.major  = {};
    (spec.majors || []).forEach(function (m) { this.major[m] = 1; }, this);
    this.near   = spec.near || 0;
    this.aim    = spec.aim || null;
    this.v = 0; this.done = {};
  }
  /* Returns the highest rung crossed by this update, or null. If any rung in
     the jump was a major the whole announcement is a major - a big jump that
     skips past a major should not be demoted just because it also cleared a
     plain rung above it. */
  Chan.prototype.to = function (v) {
    v = +v || 0;
    if (!(v > this.v)) return null;
    var prev = this.v; this.v = v;
    var hit = null, big = false;
    for (var i = 0; i < this.rungs.length; i++) {
      var t = this.rungs[i];
      if (t > prev && t <= v && !this.done[t]) {
        this.done[t] = 1;
        if (hit === null || t > hit) hit = t;
        if (this.major[t]) big = true;
      }
    }
    return hit === null ? null : { key: this.key, value: hit, major: big };
  };
  Chan.prototype.next = function () {
    for (var i = 0; i < this.rungs.length; i++) {
      if (this.rungs[i] > this.v && !this.done[this.rungs[i]]) return this.rungs[i];
    }
    return null;
  };
  /* The approach counter's candidate. The old nextTarget() looked at majors
     only, so once the last major was consumed the counter went dead for the
     rest of the run even though seven rungs were still ahead. */
  Chan.prototype.approach = function () {
    if (!this.near) return null;
    var t = this.next();
    if (t === null) return null;
    var rem = t - this.v;
    if (rem <= 0 || rem > this.near) return null;
    return { key: this.key, target: t, remaining: rem, near: this.near,
             major: !!this.major[t], label: this.aim ? this.aim(t) : String(t) };
  };
  Chan.prototype.reset = function () { this.v = 0; this.done = {}; };

  function create(o) {
    o = o || {};
    css();

    var host  = o.host || document.getElementById('stage') || document.body;
    /* TV-safe defaults: pure #ffffff is above the level a panel renders
       honestly and blooms. These match x3f-ui.css's --gold / --mint / --txt /
       --amber. Callers still pass their own. */
    var theme = Object.assign({ hot: '#FFC94A', cool: '#33E2AE', text: '#ECEEF2',
                                burn: '#FF9E4A' }, o.theme || {});
    var unit   = o.unit || 'reps';
    var isReps = /rep/i.test(unit);
    /* One master level for the whole layer. The old file connected every
       oscillator straight to destination at 0.18-0.22 each, so a four-note
       fanfare peaked around three times louder than the entire soundtrack
       (x3f-music.js sums to ~0.17). This lands a major at roughly the
       soundtrack's own peak - present, not blaring, and predictable across a
       TV whose volume knob and dynamic-range setting you do not control. */
    var vol    = (o.volume == null) ? 0.75 : Math.max(0, Math.min(1, +o.volume));
    var near   = o.nearWindow || 5;
    var bestFn = (typeof o.best === 'function') ? o.best
               : (o.best != null ? function () { return o.best; } : null);
    var bestPeakFn = (typeof o.bestPeak === 'function') ? o.bestPeak
               : (o.bestPeak != null ? function () { return o.bestPeak; } : null);

    var P = protocol();
    var dead = false;

    /* ── DOM ──────────────────────────────────────────────────────────────── */
    var layer  = document.createElement('div'); layer.className = 'x3fh';
    var flash  = document.createElement('div'); flash.className = 'x3fh-flash';
    var nearEl = document.createElement('div'); nearEl.className = 'x3fh-near';
    var nearIn = document.createElement('span'); nearIn.className = 'x3fh-nearI';
    nearEl.appendChild(nearIn);
    var bigEl  = document.createElement('div'); bigEl.className = 'x3fh-big';
    /* built by hand rather than with innerHTML because the old markup carried a
       document-global id out of a factory - two instances, two #x3fhBurnN */
    var burnEl = document.createElement('div'); burnEl.className = 'x3fh-burn';
    var burnLbl = document.createElement('u'); burnLbl.textContent = 'past failure';
    var burnNum = document.createElement('b'); burnNum.textContent = '0';
    var burnBar = document.createElement('span');
    var burnFil = document.createElement('i'); burnBar.appendChild(burnFil);
    burnEl.appendChild(burnLbl); burnEl.appendChild(burnNum); burnEl.appendChild(burnBar);
    layer.appendChild(flash); layer.appendChild(nearEl);
    layer.appendChild(bigEl); layer.appendChild(burnEl);
    host.appendChild(layer);

    /* Cached, because reading clientHeight inside a callout forces a synchronous
       layout in the middle of a set. */
    var hostH = 0, hostW = 0;
    function measure() { hostH = host.clientHeight || 260; hostW = host.clientWidth || 320; }
    measure();
    window.addEventListener('resize', measure);
    function sizePx(frac) { if (!hostH) measure(); return Math.round(hostH * frac); }
    /* A callout that overflows the panel is worse than a smaller one: TVs crop
       ~5% per edge before the user sees anything. */
    function fitPx(text, frac) {
      var s = sizePx(frac);
      var maxW = (hostW || 320) * 0.92, est = (text.length || 1) * s * 0.58;
      if (est > maxW) s = Math.max(sizePx(0.055), Math.floor(maxW / ((text.length || 1) * 0.58)));
      return s;
    }

    var reduced = false, rmq = null;
    function onRM(e) { reduced = !!(e && e.matches); }
    try {
      rmq = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
      if (rmq) {
        reduced = !!rmq.matches;
        if (rmq.addEventListener) rmq.addEventListener('change', onRM);
        else if (rmq.addListener) rmq.addListener(onRM);
      }
    } catch (e) { rmq = null; }

    /* ── sound ────────────────────────────────────────────────────────────────
       Read the cue setting at every sound, never once at construction. The old
       file cached it in create(), so turning Cues off mid-set silenced the
       page's own beeps and left this layer playing fanfares and buzzing the
       remote until a reload. mute(true) forces silence regardless of the
       setting; mute(false) hands control back to the setting. */
    var override = null;
    function cuesOn() {
      if (override !== null) return !override;
      try { return JSON.parse(localStorage.getItem('x3f_cues')) !== false; } catch (e) { return true; }
    }

    var actx = null, master = null;
    function ac() {
      if (dead || !cuesOn()) return null;
      try {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        actx = actx || new C();
      } catch (e) { return null; }
      if (!actx) return null;
      if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
      if (!master) {
        try {
          /* The high-pass is the rule made structural: anything below 200 Hz is
             not reproduced by a TV speaker, so it can only steal headroom. */
          var hp = actx.createBiquadFilter();
          hp.type = 'highpass'; hp.frequency.value = 200;
          master = actx.createGain(); master.gain.value = vol;
          master.connect(hp); hp.connect(actx.destination);
        } catch (e) { master = null; }
      }
      return actx;
    }
    function tone(f, at, dur, gain, type) {
      var a = ac(); if (!a || !master) return;
      try {
        var osc = a.createOscillator(), g = a.createGain();
        osc.type = type || 'triangle'; osc.frequency.value = f;
        osc.connect(g); g.connect(master);
        var t = a.currentTime + at;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.010);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.start(t); osc.stop(t + dur + 0.03);
      } catch (e) {}
    }
    function figure(notes, gain) {
      for (var i = 0; i < notes.length; i++) tone(notes[i][0], notes[i][1], notes[i][2], gain);
    }
    /* Every fundamental sits between 620 Hz and 2.1 kHz - inside the band a TV
       reproduces and clear of the range where bass masks speech. The four
       signatures differ by rhythm and contour, not by level. */
    var SOUND = {
      tick:  function (step) { tone(620 + step * 110, 0, 0.06, 0.09, 'square'); },
      nod:   function () { figure([[660, 0, 0.10], [880, 0.07, 0.16]], 0.09); },
      major: function () { figure([[880, 0, 0.11], [1108.7, 0.085, 0.11],
                                   [1318.5, 0.17, 0.13], [1760, 0.27, 0.34]], 0.12); },
      /* falling then resolving up: "the range dropped, keep going" */
      tier:  function () { figure([[1318.5, 0, 0.10], [1046.5, 0.09, 0.10],
                                   [880, 0.18, 0.12], [1760, 0.32, 0.42]], 0.12); },
      /* the only five-note figure in the file, reserved for a real PB */
      best:  function () { figure([[880, 0, 0.08], [1108.7, 0.06, 0.08], [1318.5, 0.12, 0.08],
                                   [1760, 0.18, 0.10], [2093, 0.26, 0.44]], 0.12); }
    };
    function buzz(pattern) {
      if (dead || !cuesOn() || !navigator.vibrate) return;
      try { navigator.vibrate(pattern); } catch (e) {}
    }

    /* ── confetti ─────────────────────────────────────────────────────────────
       Majors only, and capped. Transform and opacity only, no will-change: the
       browser promotes for the duration of the transition and drops the layer
       again, which is what we want for two dozen ten-pixel squares. */
    function burst(n, colors) {
      if (reduced || dead) return;
      var w = hostW || 320, h = hostH || 240;
      for (var i = 0; i < n; i++) {
        var b = document.createElement('div');
        b.className = 'x3fh-bit';
        b.style.background = colors[i % colors.length];
        b.style.left = (w * 0.5 + (Math.random() - 0.5) * w * 0.3) + 'px';
        b.style.top = (h * 0.42) + 'px';
        b.style.transition = 'transform .95s cubic-bezier(.2,.7,.3,1), opacity .95s';
        layer.appendChild(b);
        (function (el, dx, dy, rot) {
          requestAnimationFrame(function () {
            el.style.transform = 'translate(' + dx + 'px,' + (dy + h * 0.55) + 'px) rotate(' + rot + ')';
            el.style.opacity = '0';
          });
          setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1100);
        })(b, (Math.random() - 0.5) * w * 0.9, -h * (0.18 + Math.random() * 0.42),
           (Math.random() * 720 - 360) + 'deg');
      }
    }

    /* ── the callout, arbitrated ──────────────────────────────────────────────
       One slot. Whatever is heaviest this frame is what the user sees and
       hears; the rest are dropped rather than layered. */
    var pend = null, pendT = 0, hideT = 0, quietT = 0;
    var floorAt = 0, quietUntil = 0;

    function announce(c) {
      if (dead) return;
      if (!pend || c.weight > pend.weight) pend = c;
      if (!pendT) pendT = setTimeout(flush, 0);
    }
    function flush() {
      pendT = 0;
      if (dead || !pend) return;
      var t = nowMs();
      if (t < floorAt) { pendT = setTimeout(flush, floorAt - t + 5); return; }
      var c = pend; pend = null;
      floorAt = t + MIN_CALLOUT_GAP;
      paint(c);
    }
    function paint(c) {
      var huge = c.weight >= 2;
      var title = String(c.title == null ? '' : c.title);
      bigEl.textContent = title;
      if (c.sub) {
        var s = document.createElement('span');
        s.className = 'x3fh-sub'; s.textContent = c.sub;
        s.style.fontSize = '0.3em';
        bigEl.appendChild(s);
      }
      bigEl.style.fontSize = fitPx(title, huge ? 0.18 : 0.14) + 'px';
      bigEl.style.color = c.color || (huge ? theme.hot : theme.cool);
      bigEl.classList.add('on');
      clearTimeout(hideT);
      hideT = setTimeout(function () { bigEl.classList.remove('on'); }, huge ? 2100 : 1400);

      hideNear();
      if (huge && !reduced) {
        /* Rise instantly, fall over the transition. The old code set opacity to
           1 and back to 0 inside 90 ms while a .45s transition governed BOTH
           directions, so the flash never got more than a fifth of the way up. */
        flash.style.background = 'radial-gradient(circle at 50% 40%,rgba(255,235,150,.42),transparent 62%)';
        flash.style.transition = 'none';
        flash.style.opacity = '1';
        requestAnimationFrame(function () {
          flash.style.transition = '';
          flash.style.opacity = '0';
        });
        burst(20, [theme.hot, theme.cool, theme.text]);
      }
      (c.sound || (huge ? SOUND.major : SOUND.nod))();
      buzz(huge ? [0, 60, 40, 120] : 45);

      /* no approach nagging on top of a celebration */
      quietUntil = nowMs() + 900;
      clearTimeout(quietT);
      quietT = setTimeout(refreshNear, 950);
    }

    /* ── the approach counter ─────────────────────────────────────────────── */
    var nearKey = '';
    function hideNear() {
      nearEl.classList.remove('on');
      nearIn.classList.remove('shake');
      nearEl.style.transform = '';
      nearKey = '';
    }
    function showNear(a) {
      var urgency = Math.max(0, a.near - a.remaining) / a.near;    // 0 far, ~1 next
      /* "ONE MORE!" only where the unit is a thing you do one of. One pound
         from a peak-force best is not "one more". */
      nearIn.textContent = (a.remaining === 1 && (a.key === 'value' || a.key === 'burn' || a.key === 'best'))
                         ? 'ONE MORE!'
                         : a.remaining + ' MORE TO ' + a.label;
      nearEl.style.fontSize = sizePx(a.major ? 0.085 : 0.068) + 'px';
      nearEl.style.color = a.remaining <= 2 ? theme.hot : theme.text;
      nearEl.classList.add('on');
      /* Urgency as scale, not as a font-size change: font-size is layout, a
         transform is the compositor. Suppressed entirely under reduced motion,
         where the counter is simply legible and still. */
      if (!reduced) nearEl.style.transform = 'scale(' + (1 + urgency * 0.22).toFixed(3) + ')';
      nearIn.classList.remove('shake');
      /* At most one shake per major, on the very last step. Motion in
         peripheral vision reads as an alert and pulls the eye off the bar. */
      if (!reduced && a.major && a.remaining === 1) {
        void nearIn.offsetWidth; nearIn.classList.add('shake');
      }
      SOUND.tick(Math.round(urgency * 5));
    }
    /* Every channel that can be counted down offers a candidate; the heaviest
       wins, then the most imminent. Only one counter is ever on screen. */
    function bestApproach() {
      var cands = [], i;
      var list = [valCh, burnCh, holdCh];
      for (i = 0; i < list.length; i++) {
        var a = list[i] && list[i].approach();
        if (a) { a.weight = a.major ? 2 : 1; cands.push(a); }
      }
      var b = bestValueTarget();
      if (b !== null && b > valCh.v) {
        var rem = b - valCh.v;
        if (rem > 0 && rem <= near) {
          cands.push({ key: 'best', target: b, remaining: rem, near: near,
                       major: !isReps, label: 'YOUR BEST', weight: isReps ? 1 : 2 });
        }
      }
      var pk = peakApproach();
      if (pk) cands.push(pk);
      if (!cands.length) return null;
      cands.sort(function (x, y) {
        return (y.weight - x.weight) || (x.remaining / x.near - y.remaining / y.near);
      });
      return cands[0];
    }
    function refreshNear() {
      if (dead) return;
      if (nowMs() < quietUntil) return;
      var a = bestApproach();
      if (!a) { hideNear(); return; }
      var key = a.key + ':' + a.target + ':' + a.remaining;
      if (key === nearKey) return;
      nearKey = key;
      showNear(a);
    }

    /* ── channel: the headline number ─────────────────────────────────────────
       Reps get rungs and no majors, on purpose: the source is explicit that
       chasing one more repetition - and speeding up to get it - is the wrong
       objective. A points game's score IS its objective, so there the majors
       are derived from the caller's own ladder rather than inherited from a
       rep-scale default that had nothing to do with the numbers on screen. */
    var rungs  = (o.ladder || REP_RUNGS).slice().sort(function (a, b) { return a - b; });
    var majors = o.majors ? o.majors.slice().sort(function (a, b) { return a - b; })
               : (isReps ? [] : deriveMajors(rungs));
    var valCh = new Chan({ key: 'value', rungs: rungs, majors: majors, near: near });

    /* The band rule is two-sided - "shoot for 15 to 40" and "if you can do 40,
       go up a band" - and both sides are rep counts the program names outright.
       They stay nods; they just say something useful instead of "reps". Said
       once each: repeating "this band is light" at 40, 50, 60 and 75 is the
       nagging this file exists to avoid. */
    function firstRungAtLeast(n) {
      for (var i = 0; i < rungs.length; i++) if (rungs[i] >= n) return rungs[i];
      return null;
    }
    var floorRung  = isReps ? firstRungAtLeast(P.repsMin) : null;
    var bandUpRung = isReps ? firstRungAtLeast(P.repsMax) : null;
    function repSub(v) {
      if (!isReps) return unit;
      if (v === bandUpRung) return 'this band is getting light - try the next one up';
      if (v === floorRung)  return 'past the floor - this band is honest';
      return unit;
    }

    var value = 0, doneBest = false;
    function bestValueTarget() {
      if (!bestFn || doneBest) return null;
      var b = 0;
      try { b = +bestFn() || 0; } catch (e) { b = 0; }
      return b > 0 ? b + 1 : null;
    }

    function set(v) {
      if (dead) return;
      v = Math.max(0, Math.round(+v || 0));
      if (v === value) return;
      value = v;

      var hit = valCh.to(v), spoke = false;
      if (hit) {
        spoke = true;
        announce({
          weight: hit.major ? 2 : 1,
          title: String(hit.value) + (hit.major ? '!' : ''),
          sub: hit.major ? unit : repSub(hit.value)
        });
      }
      /* Crossing, not equality, here too: a score can jump straight past your
         best without ever equalling best + 1. */
      var bt = bestValueTarget();
      if (bt !== null && v >= bt) {
        doneBest = true; spoke = true;
        var was = bt - 1;
        announce({
          /* A rep PB is a nod. A rep count on a light band is not the axis the
             program progresses on, and the source warns in as many words about
             speeding up to break one. A score PB in a points game is that
             game's whole objective, so it keeps the fanfare. */
          weight: isReps ? 1 : 2,
          title: 'NEW BEST', sub: 'was ' + was + ' ' + unit,
          sound: isReps ? SOUND.nod : SOUND.best
        });
      }
      /* Only chase the NEXT target when this update did not itself land on one.
         Otherwise the approach blip fires a frame before the fanfare it was
         approaching, and paint() then wipes the counter it just drew. */
      if (!spoke) refreshNear();
    }

    /* ── channel: partials past full-range failure ────────────────────────── */
    var burnCh = new Chan({ key: 'burn', rungs: PARTIAL_RUNGS, majors: PARTIAL_MAJORS, near: 3 });
    var burnTotal = 0, tiers = { mid: 0, weak: 0 }, tierSplit = false;

    function paintBurnMeter(n) {
      burnEl.classList.add('on');
      burnNum.textContent = n;
      /* 20 partials is a strong set; the bar is a sense of scale, not a target
         to fill. */
      burnFil.style.transform = 'scaleX(' + Math.min(1, n / 20).toFixed(3) + ')';
      burnEl.style.fontSize = sizePx(0.042) + 'px';
    }
    function pushBurn(n) {
      n = Math.max(0, Math.round(+n || 0));
      if (n === burnTotal && n === 0) return;
      var rising = n > burnTotal;
      burnTotal = n;
      paintBurnMeter(n);
      if (!rising) return;
      var hit = burnCh.to(n);
      if (hit) {
        announce({
          weight: hit.major ? 2 : 1,
          title: hit.value + ' PAST FAILURE',
          sub: tierSplit ? (tiers.weak ? tiers.mid + ' mid · ' + tiers.weak + ' weak'
                                       : 'mid range, and still going')
                         : 'this is the part that grows you',
          color: hit.major ? theme.burn : theme.cool
        });
        return;                       // see the note in set()
      }
      SOUND.tick(Math.min(5, n));
      refreshNear();
    }
    /* Kept exactly as it was, for callers that only know a single total. */
    function setBurn(n) { if (!dead && !tierSplit) pushBurn(n); }
    /* The three-tier set model: mid-range partials and weak-range partials are
       different achievements, and the source treats the second as strictly
       deeper.

       Pick ONE of these two per instance. The first partials() call latches
       this instance into tiered mode and setBurn() becomes a no-op from then
       on, because a caller reporting both would double-count its own partials
       into the meter and fire every rung twice. */
    function partials(tier, n) {
      if (dead) return;
      tier = (tier === 'weak') ? 'weak' : 'mid';
      n = Math.max(0, Math.round(+n || 0));
      if (tiers[tier] === n) return;
      tierSplit = true;
      tiers[tier] = n;
      pushBurn(tiers.mid + tiers.weak);
    }

    /* ── channel: time in the strong range ────────────────────────────────────
       The number a rep count hides. Two people can log 30 reps and one of them
       spent three times as long loaded in the range the method exists to load.
       No approach counter - see the note on HOLD_RUNGS. */
    var holdCh = new Chan({ key: 'hold', rungs: HOLD_RUNGS, majors: HOLD_MAJORS, near: 0 });
    function hold(seconds) {
      if (dead) return;
      var hit = holdCh.to(Math.max(0, +seconds || 0));
      if (!hit) return;
      announce({
        weight: hit.major ? 2 : 1,
        title: hit.value + 's STRONG',
        sub: 'held in the range that counts'
      });
    }

    /* ── entering a range ─────────────────────────────────────────────────────
       The loudest moments in the file. Full-range failure is where the set the
       program describes actually begins, and nothing else here outranks it. */
    var RANGE = {
      mid:     { title: 'NOW IT COUNTS', sub: 'full range is gone - go halfway' },
      weak:    { title: 'DEEPER',        sub: 'halfway is gone - as far as you can' },
      failure: { title: 'EMPTY',         sub: 'that is a finished muscle' }
    };
    var rangeDone = {};
    function range(tier) {
      if (dead) return;
      var r = RANGE[tier];
      if (!r || rangeDone[tier]) return;
      rangeDone[tier] = 1;
      announce({ weight: 3, title: r.title, sub: r.sub,
                 color: tier === 'mid' ? theme.burn : theme.hot, sound: SOUND.tier });
    }

    /* ── a slower negative ────────────────────────────────────────────────────
       "Two to three seconds up, two to three seconds down." Slower than you
       were is progress right up to the prescribed window - and then it stops,
       because past it you are pausing at the bottom, which the source tells
       you not to do. So this ladder has a ceiling and deliberately does not
       escalate above it. */
    var negBest = 0, negMajor = false;
    function negative(seconds) {
      if (dead) return;
      var s = +seconds || 0;
      if (s < P.downS * 0.8 || s > P.downS * 1.8) return;
      if (s <= negBest + 0.25) return;
      var first = !negMajor && s >= P.downS;
      negBest = s;
      if (first) negMajor = true;
      announce({
        weight: first ? 2 : 1,
        title: s.toFixed(1) + 's DOWN',
        sub: first ? 'that is the tempo - hold it there' : 'slower than your last'
      });
    }

    /* ── peak force ───────────────────────────────────────────────────────────
       Band is the progress axis, so this is the one number where beating
       yourself is unambiguously the point - and unlike a rep count you cannot
       inflate it by going faster. Tracked as a monotone session max so a 60 Hz
       force signal cannot make the approach counter flicker. */
    var peakMax = 0, peakDone = false, peakShown = 0;
    function peakBest() {
      if (!bestPeakFn) return 0;
      try { return +bestPeakFn() || 0; } catch (e) { return 0; }
    }
    function peakApproach() {
      if (peakDone || !bestPeakFn) return null;
      var b = peakBest();
      if (!(b > 0) || peakMax <= 0) return null;
      var win = b * 0.12;                       // "close" is a fraction, not a count
      var rem = b - peakMax;
      if (rem <= 0 || rem > win) return null;
      return { key: 'peak', target: b, remaining: Math.max(1, Math.round(rem)),
               near: Math.max(1, Math.round(win)), major: true,
               label: 'YOUR PEAK', weight: 3 };
    }
    function peak(f) {
      if (dead) return;
      f = +f || 0;
      if (!(f > peakMax)) return;
      peakMax = f;
      var b = peakBest();
      if (!peakDone && b > 0 && f > b) {
        peakDone = true;
        announce({ weight: 3, title: 'NEW PEAK', sub: 'was ' + Math.round(b) + ' - that is a stronger you',
                   sound: SOUND.best });
        return;
      }
      /* Repaint the approach only when the number has moved enough to matter.
         3% of the target over a 12% window is four rising blips across the whole
         approach, not one per frame of a 60 Hz force signal. */
      if (b > 0 && Math.abs(f - peakShown) >= Math.max(1, b * 0.03)) {
        peakShown = f;
        refreshNear();
      }
    }

    function say(title, sub, huge) {
      if (dead) return;
      announce({ weight: huge ? 3 : 2, title: title, sub: sub });
    }

    function reset() {
      if (dead) return;
      value = 0; doneBest = false;
      burnTotal = 0; tiers = { mid: 0, weak: 0 }; tierSplit = false;
      negBest = 0; negMajor = false;
      peakMax = 0; peakDone = false; peakShown = 0;
      rangeDone = {};
      valCh.reset(); burnCh.reset(); holdCh.reset();
      pend = null;
      clearTimeout(pendT); pendT = 0;
      clearTimeout(hideT); hideT = 0;
      clearTimeout(quietT); quietT = 0;
      floorAt = 0; quietUntil = 0;
      hideNear();
      bigEl.classList.remove('on');
      burnEl.classList.remove('on');
      burnFil.style.transform = 'scaleX(0)';
      burnNum.textContent = '0';
    }

    /* Nothing recreated this layer when it was written, so nothing noticed that
       it could not be taken down. A guided routine that swaps movement between
       sets, or the single-document menu shell, would leak one DOM subtree and
       one live AudioContext per creation. */
    function destroy() {
      if (dead) return;
      dead = true;
      clearTimeout(pendT); clearTimeout(hideT); clearTimeout(quietT);
      pend = null;
      window.removeEventListener('resize', measure);
      if (rmq) {
        if (rmq.removeEventListener) rmq.removeEventListener('change', onRM);
        else if (rmq.removeListener) rmq.removeListener(onRM);
      }
      if (layer.parentNode) layer.parentNode.removeChild(layer);
      if (actx && actx.close) { try { actx.close(); } catch (e) {} }
      actx = null; master = null;
    }

    return {
      /* the original surface, unchanged */
      set: set,
      setBurn: setBurn,
      bump: function () { set(value + 1); },
      reset: reset,
      say: say,
      /* true forces silence; anything else hands control back to the x3f_cues
         setting, which is now read live rather than cached at construction */
      mute: function (m) { override = m ? true : null; },
      value: function () { return value; },
      /* the moments the program actually values */
      partials: partials,
      range: range,
      hold: hold,
      negative: negative,
      peak: peak,
      burn: function () { return burnTotal; },
      destroy: destroy
    };
  }

  window.X3FHype = { create: create, DEFAULT_LADDER: REP_RUNGS };
})();
