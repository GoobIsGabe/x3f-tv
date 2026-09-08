/* X3F ONBOARD - first run.

   Roadmap item 1, and the one the roadmap itself puts first: "Fast, and it
   makes force scaling correct per band - the foundation everything else sits
   on."

   WHAT IT IS FOR. Every force percentage in this app is a fraction of a
   calibrated range. Without one, a movement falls back to an estimate, and
   while the estimates are now per-movement and defensible, they are still
   guesses. One real capture on the movement you are about to train is worth
   more than all of them.

   WHAT IT DELIBERATELY DOES NOT DO:

     - It does not ask you to calibrate eleven movements. That is twenty
       minutes of setup before you have trained once, and it is how onboarding
       flows get abandoned. It asks for ONE, on the movement today's workout
       starts with, and then gets out of the way. The rest are learned as you
       train (x3f-cal.js auto-learns a ceiling from real sets) or captured when
       you choose to.
     - It does not ask for an account, an email, or a name. There is nothing to
       sign into.
     - It never blocks. Skip is always available and always visible, and
       skipping is remembered so it does not ask again.

   THE HEIGHT QUESTION is not vanity data. From the program's own material:
   "the taller that a person is, the heavier the band will become just because
   they're stretching it further... [seven-foot athletes] all choose lighter
   bands because the force becomes so high in the stronger range of motion."
   So height shifts the SUGGESTED band by one step. It never changes a band you
   picked, and it never changes a calibration.

     X3FOnboard.needed()        has this install been through it
     X3FOnboard.start(host, opts)  mount into a container element
     X3FOnboard.skip()          mark done without running it
     X3FOnboard.reset()         for testing, and for a "run setup again" button
*/
(function () {
  "use strict";

  var K_DONE = 'x3f_onboarded';
  var K_HEIGHT = 'x3f_heightIn';
  var K_OWNED = 'x3f_ownedBands';

  function read(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k)); return (v === null || v === undefined) ? d : v; }
    catch (e) { return d; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function needed() { return !read(K_DONE, false); }
  function skip() { write(K_DONE, true); }
  function reset() {
    try { localStorage.removeItem(K_DONE); } catch (e) {}
  }

  function bands() {
    return (window.X3FEX && window.X3FEX.bands) || ['White', 'Light Gray', 'Dark Gray', 'Black', 'Elite Black'];
  }

  /* Which bands the user actually owns. Everything else is filtered out of the
     pickers, because offering an Elite Black to someone who does not have one
     is offering a setting that cannot be acted on. Empty means "all", so this
     is additive and an install that never answers loses nothing. */
  function owned() {
    var v = read(K_OWNED, null);
    return (v && v.length) ? v : null;
  }

  /* The program's own guidance, applied. Taller stretches the band further, so
     the same band is heavier; shorter loses tension only in the weak range,
     "which really doesn't do much for you anyway". One step, never more, and
     only ever a SUGGESTION. */
  function heightShift() {
    var h = +read(K_HEIGHT, 0);
    if (!h) return 0;
    if (h >= 76) return -1;        /* 6'4" and up: go lighter */
    if (h <= 63) return +1;        /* 5'3" and under: can go heavier */
    return 0;
  }

  function suggestedBand(slug) {
    var list = bands();
    var rec = null;
    try { rec = window.X3FBand && window.X3FBand.recommended(slug); } catch (e) {}
    var i = list.indexOf(rec || 'White');
    if (i < 0) i = 0;
    i = Math.max(0, Math.min(list.length - 1, i + heightShift()));
    var own = owned();
    if (own) {
      /* Walk to the nearest band they actually have. */
      for (var d = 0; d < list.length; d++) {
        if (own.indexOf(list[Math.max(0, i - d)]) >= 0) return list[Math.max(0, i - d)];
        if (own.indexOf(list[Math.min(list.length - 1, i + d)]) >= 0) return list[Math.min(list.length - 1, i + d)];
      }
      return own[0];
    }
    return list[i];
  }

  /* ── the flow ────────────────────────────────────────────────────────── */

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function start(host, opts) {
    opts = opts || {};
    if (!host) return null;

    var step = 0;
    var chosenHeight = +read(K_HEIGHT, 0);
    var chosenBands = (read(K_OWNED, null) || []).slice();
    var flow = null;

    function done() {
      write(K_DONE, true);
      cleanup();
      if (opts.onDone) opts.onDone();
    }
    function cleanup() {
      if (flow) { try { flow.destroy(); } catch (e) {} flow = null; }
      host.innerHTML = '';
      host.classList.remove('show');
      try { if (window.X3F && window.X3F.setOverlay) window.X3F.setOverlay(false); } catch (e) {}
    }

    function frame(title, body, actions) {
      host.innerHTML = '';
      var card = el('div', 'ob-card');
      card.appendChild(el('div', 'ob-step', 'Step ' + (step + 1) + ' of 4'));
      card.appendChild(el('h2', 'ob-title', title));
      var b = el('div', 'ob-body');
      b.appendChild(body);
      card.appendChild(b);
      var row = el('div', 'ob-actions');
      actions.forEach(function (a) {
        var btn = el('button', 'ob-btn' + (a.primary ? ' primary' : ''), a.label);
        btn.setAttribute('data-nav', '');
        btn.onclick = a.go;
        row.appendChild(btn);
      });
      card.appendChild(row);
      host.appendChild(card);
      host.classList.add('show');
      try { if (window.X3F && window.X3F.setOverlay) window.X3F.setOverlay(true); } catch (e) {}
      try { if (window.X3FNav) { window.X3FNav.refresh(); window.X3FNav.focusFirst(); } } catch (e) {}
    }

    /* 1 — what this actually is */
    function stepIntro() {
      step = 0;
      var b = el('div', 'ob-prose',
        '<p>X3 is <b>one all-out set per movement</b>. Fifteen to forty slow reps, ' +
        'then as many shortened reps as you can manage, until the bar will not move an inch.</p>' +
        '<p>Two to three seconds up. Two to three seconds down. Never lock out, never let it go slack.</p>' +
        '<p>Four or five movements. About twenty minutes. That is the whole thing.</p>');
      frame('This is not three sets of ten', b, [
        { label: 'Set me up', primary: true, go: stepHeight },
        { label: 'Skip', go: done }
      ]);
    }

    /* 2 — height, because it genuinely changes which band to suggest */
    function stepHeight() {
      step = 1;
      var wrap = el('div', 'ob-choices');
      var opts2 = [
        { l: 'Under 5\'4"', v: 62 }, { l: '5\'4" – 5\'10"', v: 68 },
        { l: '5\'11" – 6\'3"', v: 73 }, { l: '6\'4" and up', v: 78 }
      ];
      opts2.forEach(function (o) {
        var btn = el('button', 'ob-choice' + (chosenHeight === o.v ? ' on' : ''), o.l);
        btn.setAttribute('data-nav', '');
        btn.onclick = function () { chosenHeight = o.v; write(K_HEIGHT, o.v); stepBands(); };
        wrap.appendChild(btn);
      });
      var note = el('p', 'ob-note',
        'Taller people stretch the band further, so the same band is heavier for them. ' +
        'This only shifts what we <i>suggest</i> — it never changes a band you pick.');
      var box = el('div', null); box.appendChild(wrap); box.appendChild(note);
      frame('How tall are you?', box, [
        { label: 'Rather not say', go: stepBands }
      ]);
    }

    /* 3 — which bands exist in the room */
    function stepBands() {
      step = 2;
      var wrap = el('div', 'ob-choices');
      bands().forEach(function (b) {
        var on = chosenBands.indexOf(b) >= 0;
        var btn = el('button', 'ob-choice' + (on ? ' on' : ''), '');
        btn.setAttribute('data-nav', '');
        var chip = el('span', 'x3f-band', '<span class="pip"></span>');
        chip.setAttribute('data-band', b);
        chip.appendChild(document.createTextNode(b));
        btn.appendChild(chip);
        var lbl = (window.X3FEX && window.X3FEX.forceLabel) ? window.X3FEX.forceLabel(b, 'deadlift') : '';
        if (lbl) btn.appendChild(el('span', 'ob-sub', lbl + ' doubled'));
        btn.onclick = function () {
          var i = chosenBands.indexOf(b);
          if (i >= 0) chosenBands.splice(i, 1); else chosenBands.push(b);
          write(K_OWNED, chosenBands);
          stepBands();
        };
        wrap.appendChild(btn);
      });
      var note = el('p', 'ob-note',
        'Pick the ones you have. Anything you do not own is left out of every picker in the app. ' +
        'Choose nothing and we will show all five.');
      var box = el('div', null); box.appendChild(wrap); box.appendChild(note);
      frame('Which bands do you have?', box, [
        { label: 'Next', primary: true, go: stepCal }
      ]);
    }

    /* 4 — one real calibration, on the movement today actually starts with */
    function stepCal() {
      step = 3;
      var slug = opts.slug || firstMovementToday();
      var name = movementName(slug);
      var band = suggestedBand(slug);

      var b = el('div', 'ob-prose',
        '<p>One capture, on the <b>' + name + '</b>, so the app knows what your range actually is. ' +
        'Everything on screen is a fraction of it.</p>' +
        '<p>You will get ten seconds to put the remote down and get set, then you hold the start ' +
        'position for four seconds, then you go all out. It counts you in out loud.</p>' +
        '<p class="ob-note">Suggested band: <b>' + band + '</b>. You can change it on the Calibrate screen.</p>');
      frame('Let us measure one movement', b, [
        { label: 'Calibrate ' + name, primary: true, go: function () {
            write(K_DONE, true);
            var url = (window.X3FFILES && window.X3FFILES.calibrate) || 'X3F_Calibrate.html';
            location.href = url + '?ex=' + encodeURIComponent(slug) + '&band=' + encodeURIComponent(band);
          } },
        { label: 'Later', go: done }
      ]);
    }

    function firstMovementToday() {
      try {
        var day = 'push';
        if (window.X3FProg && window.X3FProg.program) {
          var p = window.X3FProg.program();
          if (p && p.day) day = p.day;
        }
        var list = window.X3FEX && window.X3FEX.forDay ? window.X3FEX.forDay(day, 1) : [];
        if (list && list.length) return list[0].slug;
      } catch (e) {}
      return 'chest-press';
    }
    function movementName(slug) {
      try { var e = window.X3FEX && window.X3FEX.get(slug); if (e) return e.name; } catch (err) {}
      return 'first movement';
    }

    /* BACK HAS TO MEAN SOMETHING HERE.

       On the television Back is a hardware key that is always available, and
       nothing was listening for it: MainActivity.handleBack() lowered its
       overlay flag, called the page's close hook, and the onboarding card - which
       lives on a DIFFERENT scrim from the page's modals - stayed exactly where it
       was. The user's second Back then found no overlay open and navigated away
       from the home screen entirely, mid-setup, with the flow's answers lost.

       So: Back steps back through the flow, and on the first step there is
       nowhere to go, so it does nothing at all. Doing nothing is the correct
       answer there rather than exiting - this is a four-step first run with a
       Skip on screen, and dumping someone out of it by a keypress they meant as
       "undo" is how you lose the one calibration the app asks for.

       Returns true if it handled the press, so the caller knows whether to fall
       through to its own close. */
    var steps = [stepIntro, stepHeight, stepBands, stepCal];
    function back() {
      if (step <= 0) {
        /* Re-assert the flag the shell just lowered on its way in, or the NEXT
           Back walks off the home screen. */
        try { if (window.X3F && window.X3F.setOverlay) window.X3F.setOverlay(true); } catch (e) {}
        return true;
      }
      steps[step - 1]();
      return true;
    }

    stepIntro();
    return { close: cleanup, back: back, showing: function () { return host.classList.contains('show'); } };
  }

  window.X3FOnboard = {
    needed: needed, start: start, skip: skip, reset: reset,
    owned: owned, suggestedBand: suggestedBand, heightShift: heightShift
  };
})();
