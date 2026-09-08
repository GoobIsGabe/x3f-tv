/* X3F HUD - the in-set scoreboard.

   ─────────────────────────────────────────────────────────────────────────
   AN IN-SET SCREEN IS NOT A UI
   ─────────────────────────────────────────────────────────────────────────

   Every other screen in this app is read from a sofa, with both hands free, at
   leisure. This one is not. During a set you are:

     standing on a ground plate, often side-on to the television
     four to eight feet away, not eight to twelve
     holding a loaded bar with both hands
     unable to press anything
     looking at the bar or the floor

   You glance at the screen for a fraction of a second between reps, in
   PERIPHERAL VISION. That is a completely different design problem, and the
   games all solved it as though it were the same one: a small chip in a corner,
   in the same size type as a menu.

   So the rules here are not the rules anywhere else:

   1. ONE NUMBER DOMINATES - the rep count, at 160-220 physical px. To be
      readable peripherally at eight feet you need roughly 60 arc-minutes of
      cap height, which on a 55" 1080p panel is about a 95px font, and on a 43"
      about 120px. This is not a typo and it is not decoration.

   2. TABULAR NUMERALS IN A FIXED-WIDTH SLOT, so 9 -> 10 never reflows and the
      number does not appear to twitch sideways as you work.

   3. NO ANIMATION DURING A SET. Motion in peripheral vision reads as an alert
      and pulls your eye off the bar. It also frees the entire frame budget for
      the game's own loop and the audio scheduler, which must not miss.

   4. STATE BY LUMINANCE AND POSITION FIRST, HUE THIRD. Full range, mid-range
      partials and weak-range partials change the BACKGROUND and the LABEL, not
      just a colour, so the tier is legible at an angle, in a bright room, to a
      colour-blind viewer, in a photograph.

   5. AUDIO CARRIES THE SET; THE SCREEN CONFIRMS IT. This inverts the usual
      relationship, because you are not looking at the screen. Every tier change
      is audible.

   6. NEVER REQUIRE A PRESS DURING A SET. Nothing here is interactive.

   ─────────────────────────────────────────────────────────────────────────
   WHAT IT DOES NOT DO
   ─────────────────────────────────────────────────────────────────────────

   It does not replace a game's art. Bloom's vine and Nova's starfield are the
   reason anyone switches the television on, and a full-screen scoreboard would
   delete them. This is one consistent, enormous, honest counter laid over
   whatever the game is drawing - so the thing you actually need to read is the
   same size and in the same place in all eight of them.

     var hud = X3FHUD.create({ host: document.body, slug: 'chest-press' });
     hud.set({ reps: 12, full: 12, mid: 0, weak: 0, tier: 'full', frac: 0.8 });
     hud.tier('mid');            // announces, audibly, once
     hud.done();                 // stops
     hud.destroy();
*/
(function () {
  "use strict";

  var TIERS = {
    full: { label: 'FULL RANGE', bg: 'transparent', color: 'var(--txt, #ECEEF2)' },
    mid:  { label: 'MID RANGE',  bg: 'rgba(255,158,74,.10)', color: 'var(--amber, #FF9E4A)' },
    weak: { label: 'WEAK RANGE', bg: 'rgba(255,99,118,.13)', color: 'var(--hot, #FF6376)' },
    done: { label: 'SET COMPLETE', bg: 'rgba(51,226,174,.12)', color: 'var(--mint, #33E2AE)' }
  };

  /* Cue tones sit in 500 Hz - 4 kHz. A television's speakers roll off hard
     below about 200 Hz, so the satisfying low thump that works on headphones is
     literally inaudible in the room where this app runs. */
  var ac = null;
  function audio() {
    if (ac) return ac;
    try { var C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); }
    catch (e) { ac = null; }
    return ac;
  }
  function tone(f, ms, gain) {
    var c = audio(); if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      var o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + ms / 1000 + 0.02);
    } catch (e) {}
  }

  var CSS_ID = 'x3f-hud-css';
  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      '.x3fhud{position:fixed;left:0;right:0;top:0;pointer-events:none;z-index:40;',
      '  display:flex;align-items:flex-start;justify-content:space-between;',
      /* THE SAFE AREA, NOT 4vh. A television crops the outer edge of the picture
         and 5% a side is the minimum that survives it - which is exactly what
         --safe-x / --safe-y mean in x3f-ui.css, and what the menus have always
         padded by. This strip used 4vh, so on a panel with real overscan the top
         of the one number the whole file exists to make readable was clipped.
         The tokens are read from the host page (every game defines them); the
         literals are the fallback for a page that has not, and they are the same
         5% the design system names. */
      '  padding:var(--safe-y,5vh) var(--safe-x,5vw) 0;',
      '  font-family:var(--font-display,system-ui,sans-serif);',
      '  transition:background-color 220ms linear}',
      /* The whole strip tints, not just the number: a tier change has to be
         visible when the number itself is outside your fovea. */
      '.x3fhud .box{display:flex;flex-direction:column;align-items:flex-start;line-height:1}',
      '.x3fhud .n{font-family:var(--font-num,ui-monospace,monospace);',
      '  font-variant-numeric:tabular-nums;font-weight:700;',
      '  font-size:min(13rem,17vh);letter-spacing:-.02em;min-width:2.4ch;',
      '  text-align:left;text-shadow:0 .3rem 1.4rem rgba(0,0,0,.75)}',
      '.x3fhud .lbl{font-size:min(2.4rem,3.4vh);font-weight:700;letter-spacing:.12em;',
      '  margin-top:.4rem;opacity:.9;text-shadow:0 .2rem .8rem rgba(0,0,0,.8)}',
      '.x3fhud .r{align-items:flex-end;text-align:right}',
      '.x3fhud .sub{font-size:min(2rem,2.8vh);font-weight:700;opacity:.7;',
      '  text-shadow:0 .2rem .8rem rgba(0,0,0,.8)}',
      '.x3fhud .tier{font-size:min(2.4rem,3.4vh);font-weight:700;letter-spacing:.12em}',
      /* A thin bar is the one piece of live feedback that is legible
         peripherally without being motion: it changes length, it does not move
         or flash. It sits ON the safe line rather than on the panel edge - a
         meter a television has cropped off the bottom of the picture is not
         feedback, it is a wasted composite. The games' control rows pad their
         bottom edge past this line (--safe-b) so a live bar never paints across
         the bottom of the Start button. */
      '.x3fhud .meter{position:fixed;height:.7vh;',
      '  left:var(--safe-x,5vw);right:var(--safe-x,5vw);bottom:var(--safe-y,5vh);',
      '  background:rgba(236,238,242,.10)}',
      /* scaleX, NOT width. This is the single most-animated element in the app:
         it is on screen for every rep of every set of every game, and set()
         re-drives it whenever the force fraction moves 1%, which during a
         concentric is most frames. `width` is a layout property, so each of
         those steps cost the WebView a layout of the fixed strip plus a repaint
         of the bar, on the same 1 GB SoC that has to keep a canvas game and the
         audio scheduler inside 16.6 ms. A transform is composited: the layer is
         painted once at full width and the compositor squashes it, which is
         free. Pinned to the left edge and applied to a flat fill, so it is
         pixel-for-pixel the bar that was here before. */
      '.x3fhud .meter i{display:block;height:100%;width:100%;',
      '  transform:scaleX(0);transform-origin:left center;',
      '  background:var(--accent,#7C6CFF);transition:transform 80ms linear}',
      '@media (prefers-reduced-motion:reduce){.x3fhud,.x3fhud .meter i{transition:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  function create(opts) {
    opts = opts || {};
    ensureCss();
    var host = opts.host || document.body;

    var root = document.createElement('div');
    root.className = 'x3fhud';
    root.innerHTML =
      '<div class="box"><div class="n" data-n>0</div><div class="lbl" data-lbl>REPS</div></div>' +
      '<div class="box r"><div class="tier" data-tier></div><div class="sub" data-sub></div></div>' +
      '<div class="meter"><i data-meter></i></div>';
    host.appendChild(root);

    var elN = root.querySelector('[data-n]');
    var elLbl = root.querySelector('[data-lbl]');
    var elTier = root.querySelector('[data-tier]');
    var elSub = root.querySelector('[data-sub]');
    var elMeter = root.querySelector('[data-meter]');

    var curTier = null, lastN = -1, lastFrac = -1, finished = false;

    function announce(t) {
      if (t === curTier) return;
      curTier = t;
      var d = TIERS[t] || TIERS.full;
      root.style.background = d.bg;
      elTier.textContent = d.label;
      elTier.style.color = d.color;
      elN.style.color = d.color;
      /* Each tier gets its own two-note figure, descending as the range
         collapses, so you can hear where you are in the set without looking. */
      if (t === 'mid') { tone(880, 130, .22); setTimeout(function () { tone(660, 200, .22); }, 120); }
      else if (t === 'weak') { tone(660, 130, .22); setTimeout(function () { tone(494, 240, .22); }, 120); }
      else if (t === 'done') { tone(1046, 130, .26); setTimeout(function () { tone(1568, 260, .26); }, 130); }
    }

    announce('full');

    return {
      /* Called from the game's own loop. Deliberately does nothing unless a
         value actually changed - a DOM write per frame across eight games is
         exactly the kind of cost the TV cannot afford, and the counter is
         supposed to be still. */
      set: function (s) {
        if (finished) return;
        s = s || {};
        var n = +s.reps || 0;
        if (n !== lastN) {
          lastN = n;
          elN.textContent = n;
        }
        if (s.tier && s.tier !== curTier) announce(s.tier);

        var sub = '';
        if ((+s.mid || 0) + (+s.weak || 0) > 0) {
          sub = (+s.full || 0) + ' full · ' + ((+s.mid || 0) + (+s.weak || 0)) + ' partial';
        } else if (opts.name) {
          sub = opts.name;
        }
        if (elSub.textContent !== sub) elSub.textContent = sub;

        var f = Math.max(0, Math.min(1, +s.frac || 0));
        if (Math.abs(f - lastFrac) > 0.01) {
          lastFrac = f;
          /* Three decimals because scaleX is a ratio, not a percentage: at
             1 dp the bar would step in 10% jumps of its own length. */
          elMeter.style.transform = 'scaleX(' + f.toFixed(3) + ')';
        }
      },

      tier: announce,

      /* The set ended. The counter stays exactly where it is - the last number
         is the one you want to read, and replacing it with a summary the moment
         you stop is how a rep count gets missed. */
      done: function () {
        finished = true;
        announce('done');
        elLbl.textContent = 'REPS';
        elMeter.style.transform = 'scaleX(0)';
      },

      el: root,
      destroy: function () {
        try { root.parentNode.removeChild(root); } catch (e) {}
      }
    };
  }

  window.X3FHUD = { create: create, tiers: TIERS };
})();
