/* X3F HYPE - milestone moments.
   A set is won or lost in the last few reps, and that is exactly when a counter
   ticking up by one stops meaning anything. This watches a number and gets loud
   at the right times instead of every time:

     approach   within a few of the next milestone -> "3 MORE", bigger and
                shakier each step, so the target pulls you toward it
     hit        the milestone itself -> full-screen callout, flash, confetti,
                fanfare, haptics
     best       your personal best gets its own approach and its own celebration,
                because beating yourself is the whole point of the program

   Deliberately NOT every rep: the ladder thins out as numbers grow, and there is
   a floor on how often anything can fire. Encouragement you can predict is noise.

     var hype = X3FHype.create({host: stage, theme: {...}, ladder: [...],
                                unit: 'reps', best: function(){return 42}});
     hype.set(reps);     // whenever the number changes
     hype.reset();       // new set / new run
*/
(function () {
  "use strict";

  /* Two tiers on purpose. The rungs are quick acknowledgements - a beat, then
     out of your way. Only MAJORS get the escalating countdown, because a
     countdown before every rung is the same nagging as a callout every rep. */
  var DEF_LADDER = [10, 15, 20, 25, 30, 35, 40, 45, 60, 70, 80, 90, 110, 125, 175];
  var DEF_MAJORS = [50, 75, 100, 150, 200, 250];
  var styled = false;

  function css() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent =
      '.x3fh{position:absolute;inset:0;pointer-events:none;z-index:7;overflow:hidden;' +
      "font-family:'Fredoka','Sora',system-ui,sans-serif}" +
      /* the approach counter: lives low so it never covers the action */
      '.x3fh-near{position:absolute;left:0;right:0;bottom:14%;text-align:center;' +
      'font-weight:700;letter-spacing:1px;opacity:0;transform:scale(.7);' +
      'transition:opacity .18s,transform .18s cubic-bezier(.2,1.6,.3,1);' +
      'text-shadow:0 4px 26px rgba(0,0,0,.75)}' +
      '.x3fh-near.on{opacity:1;transform:scale(1)}' +
      '.x3fh-near.shake{animation:x3fh-shake .38s cubic-bezier(.36,.07,.19,.97) both}' +
      '@keyframes x3fh-shake{10%,90%{transform:translateX(-2px) scale(1.02)}' +
      '20%,80%{transform:translateX(3px) scale(1.04)}30%,50%,70%{transform:translateX(-5px) scale(1.06)}' +
      '40%,60%{transform:translateX(5px) scale(1.06)}}' +
      /* the milestone callout */
      '.x3fh-big{position:absolute;left:0;right:0;top:34%;text-align:center;font-weight:700;' +
      'opacity:0;transform:scale(.5) rotate(-3deg);transition:opacity .2s,transform .32s cubic-bezier(.2,1.8,.3,1);' +
      'text-shadow:0 6px 34px rgba(0,0,0,.8)}' +
      '.x3fh-big.on{opacity:1;transform:none}' +
      '.x3fh-sub{display:block;font-family:"Space Grotesk",system-ui,sans-serif;font-weight:700;' +
      'letter-spacing:3px;text-transform:uppercase;opacity:.85;margin-top:.35em}' +
      '.x3fh-flash{position:absolute;inset:0;opacity:0;transition:opacity .45s;mix-blend-mode:screen}' +
      '.x3fh-bit{position:absolute;width:10px;height:10px;border-radius:2px;will-change:transform,opacity}' +
      /* the burnout meter: appears only after full-range failure, because that
         is the only time it means anything */
      '.x3fh-burn{position:absolute;left:50%;transform:translateX(-50%) translateY(10px);bottom:4%;' +
      'display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:100px;' +
      'background:rgba(10,6,20,.55);border:1px solid rgba(255,93,120,.45);opacity:0;' +
      "font-family:'Space Grotesk',system-ui,sans-serif;font-weight:700;transition:opacity .3s,transform .3s}" +
      '.x3fh-burn.on{opacity:1;transform:translateX(-50%)}' +
      '.x3fh-burn i{display:block;height:6px;border-radius:6px;background:linear-gradient(90deg,#ff5d78,#ffd23f);width:0;transition:width .3s}' +
      '.x3fh-burn u{text-decoration:none;letter-spacing:1.6px;text-transform:uppercase;opacity:.75}' +
      '@media (prefers-reduced-motion:reduce){.x3fh-near.shake{animation:none}}';
    document.head.appendChild(s);
  }

  function create(o) {
    o = o || {};
    css();
    var host = o.host || document.getElementById('stage') || document.body;
    var theme = Object.assign({ hot: '#ffd23f', cool: '#39f5c4', text: '#ffffff' }, o.theme || {});
    var ladder = (o.ladder || DEF_LADDER).slice().sort(function (a, b) { return a - b; });
    var majors = (o.majors || DEF_MAJORS).slice().sort(function (a, b) { return a - b; });
    var unit = o.unit || 'reps';
    var bestFn = o.best || function () { return 0; };
    var near = o.nearWindow || 5;

    var layer = document.createElement('div'); layer.className = 'x3fh';
    var flash = document.createElement('div'); flash.className = 'x3fh-flash';
    var nearEl = document.createElement('div'); nearEl.className = 'x3fh-near';
    var bigEl = document.createElement('div'); bigEl.className = 'x3fh-big';
    var burnEl = document.createElement('div'); burnEl.className = 'x3fh-burn';
    burnEl.innerHTML = '<u>past failure</u><b id="x3fhBurnN">0</b><span style="width:70px"><i></i></span>';
    layer.appendChild(flash); layer.appendChild(nearEl); layer.appendChild(bigEl); layer.appendChild(burnEl);
    host.appendChild(layer);

    var value = 0, lastNear = -1, done = {}, bigUntil = 0, nearUntil = 0, quietUntil = 0;
    var muted = false;
    try { muted = JSON.parse(localStorage.getItem('x3f_cues')) === false; } catch (e) {}

    /* ---- sound: a short rising fanfare, built not sampled ---- */
    var actx = null;
    function ac() {
      if (muted) return null;
      try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
      return actx;
    }
    function tone(f, at, dur, gain, type) {
      var a = ac(); if (!a) return;
      var osc = a.createOscillator(), g = a.createGain();
      osc.type = type || 'triangle'; osc.frequency.value = f;
      osc.connect(g); g.connect(a.destination);
      var t = a.currentTime + at;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.02);
    }
    function tick(step) {                       // approach blip, rises as you close in
      tone(520 + step * 90, 0, 0.07, 0.16, 'square');
    }
    function fanfare(big) {
      var root = big ? 523.25 : 440;
      [0, 0.09, 0.18, 0.30].forEach(function (t, i) {
        tone(root * [1, 1.26, 1.5, 2][i], t, i === 3 ? 0.5 : 0.16, i === 3 ? 0.22 : 0.18, 'triangle');
      });
      if (big) tone(root / 2, 0, 0.6, 0.12, 'sine');
    }
    function buzz(ms) { if (!muted && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }

    /* ---- confetti, cheap: a couple dozen divs on transforms ---- */
    function burst(n, colors) {
      var w = host.clientWidth || 320, h = host.clientHeight || 240;
      for (var i = 0; i < n; i++) {
        var b = document.createElement('div');
        b.className = 'x3fh-bit';
        b.style.background = colors[i % colors.length];
        b.style.left = (w * 0.5 + (Math.random() - 0.5) * w * 0.3) + 'px';
        b.style.top = (h * 0.42) + 'px';
        var dx = (Math.random() - 0.5) * w * 0.9, dy = -h * (0.18 + Math.random() * 0.42);
        var rot = (Math.random() * 720 - 360) + 'deg';
        b.style.transition = 'transform .95s cubic-bezier(.2,.7,.3,1), opacity .95s';
        layer.appendChild(b);
        (function (el, dx, dy, rot) {
          requestAnimationFrame(function () {
            el.style.transform = 'translate(' + dx + 'px,' + (dy + h * 0.55) + 'px) rotate(' + rot + ')';
            el.style.opacity = '0';
          });
          setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1100);
        })(b, dx, dy, rot);
      }
    }

    function px(frac) { return Math.round((host.clientHeight || 260) * frac); }

    function showNear(remaining, target) {
      var urgency = Math.max(0, near - remaining) / near;          // 0 far, ~1 next rep
      nearEl.textContent = remaining === 1 ? 'ONE MORE!' : remaining + ' MORE TO ' + target;
      nearEl.style.fontSize = px(0.075 + urgency * 0.07) + 'px';
      nearEl.style.color = remaining <= 2 ? theme.hot : theme.text;
      nearEl.classList.add('on');
      nearEl.classList.remove('shake');
      if (remaining <= 3) { void nearEl.offsetWidth; nearEl.classList.add('shake'); }
      nearUntil = performance.now() + 1500;
      tick(near - remaining);
    }
    function hideNear() { nearEl.classList.remove('on'); }

    function showBig(title, sub, huge) {
      bigEl.innerHTML = '';
      bigEl.appendChild(document.createTextNode(title));
      if (sub) {
        var s = document.createElement('span'); s.className = 'x3fh-sub'; s.textContent = sub;
        bigEl.appendChild(s);
      }
      bigEl.style.fontSize = px(huge ? 0.19 : 0.15) + 'px';
      bigEl.style.color = huge ? theme.hot : theme.cool;
      bigEl.classList.add('on');
      bigUntil = performance.now() + (huge ? 2100 : 1500);
      hideNear();
      flash.style.background = 'radial-gradient(circle at 50% 40%,' +
        (huge ? 'rgba(255,235,150,.5)' : 'rgba(255,255,255,.32)') + ',transparent 62%)';
      flash.style.opacity = '1';
      setTimeout(function () { flash.style.opacity = '0'; }, 90);
      burst(huge ? 34 : 18, [theme.hot, theme.cool, '#ffffff']);
      fanfare(huge);
      buzz(huge ? [0, 60, 40, 120] : 45);
      quietUntil = performance.now() + 900;     // no approach nagging right after
    }

    /* the next thing worth shouting about: a ladder rung, or your best */
    function nextTarget() {
      var best = +bestFn() || 0;
      var cands = [];
      for (var i = 0; i < majors.length; i++) if (majors[i] > value && !done['m' + majors[i]]) cands.push(majors[i]);
      if (best > 0 && best + 1 > value && !done['b']) cands.push(best + 1);
      if (!cands.length) return null;
      cands.sort(function (a, b) { return a - b; });
      return cands[0];
    }

    function set(v) {
      v = Math.max(0, Math.round(+v || 0));
      if (v === value) return;
      var rising = v > value;
      value = v;
      if (!rising) return;

      var best = +bestFn() || 0;
      // did we just land on something?
      if (best > 0 && value === best + 1 && !done['b']) {
        done['b'] = 1;
        showBig('NEW BEST', 'was ' + best + ' ' + unit, true);
        return;
      }
      for (var i = 0; i < majors.length; i++) {
        if (value === majors[i] && !done['m' + majors[i]]) {
          done['m' + majors[i]] = 1;
          showBig(String(majors[i]) + '!', unit + ' - outstanding', true);
          return;
        }
      }
      for (var j = 0; j < ladder.length; j++) {
        if (value === ladder[j] && !done['m' + ladder[j]]) {
          done['m' + ladder[j]] = 1;
          showBig(String(ladder[j]), unit, false);
          return;
        }
      }
      // otherwise: are we closing in on one?
      if (performance.now() < quietUntil) return;
      var t = nextTarget();
      if (t == null) return;
      var remaining = t - value;
      if (remaining > 0 && remaining <= near && remaining !== lastNear) {
        lastNear = remaining;
        showNear(remaining, t === (+bestFn() || 0) + 1 ? 'YOUR BEST' : t);
      }
    }

    function frame() {
      var now = performance.now();
      if (bigUntil && now > bigUntil) { bigEl.classList.remove('on'); bigUntil = 0; }
      if (nearUntil && now > nearUntil) { hideNear(); nearUntil = 0; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    /* Partials past failure. Their own meter and their own milestones, because
       total reps quietly rewards stopping at a round number and this rewards the
       thing the program is actually asking for. */
    var burn = 0;
    function setBurn(n) {
      n = Math.max(0, Math.round(+n || 0));
      if (n === burn) return;
      var was = burn; burn = n;
      burnEl.classList.add('on');
      var num = burnEl.querySelector('b'), fill = burnEl.querySelector('i');
      if (num) num.textContent = n;
      if (fill) fill.style.width = Math.min(100, n / 20 * 100) + '%';
      burnEl.style.fontSize = px(0.048) + 'px';
      if (n > was && (n === 5 || n === 10 || n === 20 || n === 35)) {
        showBig(n + ' PAST FAILURE', 'this is the part that grows you', n >= 20);
      } else if (n > was) { tick(Math.min(5, n)); }
    }

    return {
      set: set,
      setBurn: setBurn,
      bump: function () { set(value + 1); },
      reset: function () { value = 0; lastNear = -1; done = {}; burn = 0; hideNear(); bigEl.classList.remove('on'); burnEl.classList.remove('on'); },
      say: function (title, sub, huge) { showBig(title, sub, !!huge); },
      mute: function (m) { muted = !!m; },
      value: function () { return value; }
    };
  }

  window.X3FHype = { create: create, DEFAULT_LADDER: DEF_LADDER };
})();
