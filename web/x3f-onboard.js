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

    /* The band the last OK was aimed at, or null before any press. Only
       stepBands() reads it; see the data-nav-first comment there for why a
       re-rendering step has to carry its own idea of where the ring belongs. */
    var focusBand = null;

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

      /* THE CARD NEEDS A PANEL, NOT JUST A SCRIM.

         .ob-card is appended straight onto #obScrim and declares no background
         of its own, so the home screen underneath - fully laid out and painted
         by the time onboarding mounts on top of it - read straight THROUGH the
         onboarding copy. Measured: 139,308 px2 of overlapping text, the rails'
         movement names crossing the step's prose, at three metres, on the one
         screen every install sees exactly once.

         The scrim's own rgba(8,10,14,.88) knocks the home screen back but does
         not hide it; every other dialog on this page sits inside .modal, which
         paints an opaque one. These are .modal's four declarations, token for
         token, from x3f-ui.css.

         They are set here rather than by borrowing the class: .modal also
         restyles descendant h2 and p, and `.modal p` outranks `.ob-note` on
         specificity, so `class="ob-card modal"` would silently blow the small
         dimmed treatment off every note in the flow.

         max-height/overflow come along for the reason .modal carries them:
         var(--s-5) of padding makes the card taller, the scrim centres it with
         no scrolling of its own, and a card taller than the screen would push
         its own buttons - including the only way out - off the bottom. */
      card.style.background = 'var(--surface)';
      card.style.border = '.125rem solid var(--line-2)';
      card.style.borderRadius = 'var(--r-3)';
      card.style.padding = 'var(--s-5)';
      card.style.maxHeight = '100%';
      card.style.overflow = 'auto';

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

    /* THE WAY OUT, ON EVERY STEP.

       This module's own header promises "Skip is always available and always
       visible", and two of the four steps did not have it. Step 2 offered
       "Rather not say" and step 3 offered "Next" - both of which walk you
       FORWARD. Once you were past the intro the only exit left was the hardware
       Back key, and back() deliberately refuses to leave on the first step, so a
       user who opened setup by accident and pressed Back three times ended up
       staring at step 1 with no visible way off it. On a television there is no
       Escape, no window chrome, and no tap-outside-to-dismiss.

       One control, one wording, last in the row on all three steps, so it is the
       same button in the same place every time. "Skip setup" rather than plain
       "Skip" because on the height step it sits beside "Rather not say", and two
       buttons that both read as skipping leave the user guessing which one
       skips the QUESTION and which one skips the FLOW.

       It is last so the ring never starts on it: first() takes items[0], which
       on every step is a choice or the primary action. A dialog must not open
       with the cursor already sitting on the way out. */
    function exitAction() { return { label: 'Skip setup', go: done }; }

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
        exitAction()
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
        { label: 'Rather not say', go: stepBands },
        exitAction()
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

        /* KEEP THE RING ON THE BAND THAT WAS JUST TOGGLED.

           This is the one step where OK does not advance, so it is the one step
           where the re-render is visible. Toggling rewrites the whole card,
           which destroys the button the cursor was standing on; frame() then
           calls X3FNav.focusFirst(), and first() with nothing to go on hands
           back items[0] - White, the top of the list. So every OK here
           teleported the ring back to the first band, and a user with three
           bands had to walk down from White again after each one.

           data-nav-first is how first() is told otherwise, and it is the cheap
           answer because the ring is placed by the same call that was throwing
           it away. Exactly one button per render carries it, and only once a
           press has happened, so arriving on this step for the first time still
           starts at the first band. Backing into the step from step 4 lands on
           the band last touched, which is also where the user left off. */
        if (focusBand === b) btn.setAttribute('data-nav-first', '');

        var chip = el('span', 'x3f-band', '<span class="pip"></span>');
        chip.setAttribute('data-band', b);
        chip.appendChild(document.createTextNode(b));
        btn.appendChild(chip);

        /* PRINT WHAT forceLabel() RETURNS. DO NOT ADD A WORD TO IT.

           This line used to append ' doubled', because it asked about a doubled
           movement and four of the five bands do publish a separate doubled
           figure. Elite Black does not. Its entry is
           { singled: [110, 600], doubled: [null, null] }, and forceLabel() falls
           back to the singled pair rather than printing a blank - so the label
           came out "110–600 lb doubled", taking X3's ONE published range for
           that band and hanging a claim on it that X3 never made. The app does
           not get to assert more than the source does.

           Asking about a SINGLED movement removes the need for the word at all:
           every band then shows the stand-alone range it is sold by, Elite
           Black's 110–600 lb included, as one ascending series a person can
           check against the bands actually in the room - which is the entire job
           of this step. The slug picks that column and nothing else; no claim is
           being made here about the overhead press. */
        var lbl = (window.X3FEX && window.X3FEX.forceLabel) ? window.X3FEX.forceLabel(b, 'overhead-press') : '';
        if (lbl) btn.appendChild(el('span', 'ob-sub', lbl));

        btn.onclick = function () {
          var i = chosenBands.indexOf(b);
          if (i >= 0) chosenBands.splice(i, 1); else chosenBands.push(b);
          write(K_OWNED, chosenBands);
          focusBand = b;
          stepBands();
        };
        wrap.appendChild(btn);
      });
      var note = el('p', 'ob-note',
        'Pick the ones you have. Anything you do not own is left out of every picker in the app. ' +
        'Choose nothing and we will show all five.');
      var box = el('div', null); box.appendChild(wrap); box.appendChild(note);
      frame('Which bands do you have?', box, [
        { label: 'Next', primary: true, go: stepCal },
        exitAction()
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
