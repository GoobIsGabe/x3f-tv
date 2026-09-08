/* Functional scenarios for the CALIBRATE screen, browser and TV.

   Calibrate had no functional coverage at all (docs/audit/calibration.md D21):
   run.py's SCREENS list has never contained it, so the one page that WRITES the
   data every other page reads was the only page nothing checked. The nav audit
   proves the remote can reach its controls; nothing proved that what it captures
   is what the games later see. That is the exact gap the reported bug fell
   through.

   HOW TO REGISTER THIS FILE (tools/func-test/run.py belongs to someone else, so
   these are the four edits it needs rather than edits I made):

       SCREENS = ["launcher", ..., "bloomtv", "calibrate", "calibratetv"]
       AS_PAGE = {"bloomtv": "bloom", "calibratetv": "calibrate"}
       BOOTSTRAPPED = {"bloomtv", "calibratetv"}
       CASES = {"calibrate": "cases-cal.js", "calibratetv": "cases-cal.js"}   # new

   ...then stage this file too, and load it INSTEAD of cases.js for the
   scenarios named in CASES:

       for f in ("func.js", "cases.js", "cases-cal.js"):
           shutil.copy2(HERE / f, stage / f)
       ...
       '<script src="%s" data-scenario="%s"></script>' % (CASES.get(name, "cases.js"), name)

   Instead of, not alongside: both files call F.report(), and two reports in one
   document give run.py two "FUNC ..." markers to parse - it reads the first and
   the other scenario's results vanish silently.

   The `?ex=overhead-press` query run.py already passes to BOOTSTRAPPED
   scenarios is right for this one too: it is how a Routine or a Library card
   opens Calibrate, and it is what makes X3FCal.slug() resolve at all.

   AND ONE THING OUTSIDE run.py: these scenarios read the BUNDLE
   (app/src/main/assets), not web/, so anything the Calibrate rewrite adds has
   to reach the bundle before it can be asserted here. x3f-band.js is already in
   sync-from-web.py's SHARED list and already in the bundle; what is still
   missing is the <script src="x3f-band.js"> tag on the page itself, which is
   why the first failing assertion below fails.

   TWO SCENARIOS, because the two paths have diverged twice before:

     calibrate     the page as a browser runs it
     calibratetv   the same page with the LIVE BOOTSTRAP extracted from
                   MainActivity.java, exactly the way `bloomtv` works. Not a
                   copy of the bootstrap: a copy drifts, and then the test is
                   checking fiction.

   WHAT IS DELIBERATELY ASSERTED HERE RATHER THAN IN tools/force-test:

   The force model itself is tested headlessly and exhaustively in
   tools/force-test (band resolution, estimates, validation, curves, advice).
   This file only asserts things that are true of the PAGE: that it loads the
   band module at all, that it measures absolute force, that a refused capture
   leaves storage alone, and that the shell reaches it. Duplicating the model
   tests here would just make them slower and harder to read.

   THREE ASSERTIONS HERE FAIL AGAINST THE PAGE AS IT STANDS, on purpose. They
   are the three defects the Calibrate rewrite (OVERHAUL-PLAN.md 1.3) is for,
   and they are meant to go green when it lands rather than be deleted:

     "the band module is loaded"        the page does not load x3f-band.js, so
                                        it is still free to answer "which band?"
                                        differently from the games - D1
     "a REFUSED capture leaves the      X3F_Calibrate.html:199-202 raises
      band ceilings alone"              x3f_bandMax even when save() refused - D2
     "does not say Offline while the    setStatus() is never called on the TV, so
      bar is live"                      the pill reads Offline under live
                                        numbers and sends the user hunting for a
                                        connection problem that is not there - D12

   Measured on the pre-rewrite page: calibrate 12 passed / 2 failed,
   calibratetv 15 passed / 3 failed. If those counts go UP without the page
   changing, something here stopped asserting. */
(function () {
  var F = window.__func;
  var ok = F.ok;
  /* Detail that only means something when the assertion FAILS. func.js prints
     `extra` either way, and a passing line trailed by its own failure hint is
     the kind of noise that makes people stop reading the report. */
  function okf(name, cond, failExtra) { return ok(name, cond, cond ? null : failExtra); }

  var script = document.currentScript;
  var scenario = (script && script.getAttribute('data-scenario')) ||
                 (location.pathname.split('/').pop() || 'calibrate');
  var tv = /tv$/.test(scenario) || !!window.__x3fDrv;

  /* Uncaught errors are collected from here to the end of the run. D13: the
     page's music hook calls ref(), which exists in the eight games and NOT
     here, so a ReferenceError was being constructed and swallowed on every
     intensity poll. A thrown error inside the rAF loop is invisible in a dump
     otherwise - the page just quietly stops doing something. */
  var errs = [];
  window.addEventListener('error', function (e) { errs.push(e.message || String(e.error || e)); });

  /* The page's own top-level `let`s are not on window, but they ARE in the
     global lexical scope, so a later classic script can read and write them -
     which is how cases.js drives Bloom's `reps` and `endSet`. Wrapping the
     access means a rename downgrades one assertion to a failure instead of
     killing the whole run before it reports anything. */
  function gv(n) { try { return (0, eval)(n); } catch (e) { return undefined; } }
  function sv(n, v) {
    try { window.__caseVal = v; (0, eval)(n + ' = window.__caseVal'); return gv(n) === v; }
    catch (e) { return false; }
  }
  function store(k) { try { return JSON.parse(localStorage.getItem('x3f_' + k)); } catch (e) { return null; } }
  function raw(k) { return localStorage.getItem('x3f_' + k); }
  function wait(fn, ms) { setTimeout(fn, ms || 240); }

  F.seed();
  try { if (typeof showStored === 'function') showStored(); } catch (e) {}

  wait(function () {
    ok('the page under test is Calibrate', /calibrat/i.test(location.pathname), location.pathname);

    /* ---------------- the modules this page cannot work without ---------- */
    ok('the exercise library is loaded', !!window.X3FEX);
    ok('the calibration module is loaded', !!window.X3FCal);
    /* Without x3f-band.js this page is free to invent its own answer to "which
       band?" again, which is precisely how a capture came to be filed under one
       key and read back under another (D1). The script tag is the fix. */
    ok('the band module is loaded - its absence IS the reported bug (D1)', !!window.X3FBand);

    var slug = gv('slug') || (window.X3FCal && X3FCal.slug()) || 'overhead-press';
    var band = gv('band');

    /* --------- the page and the games must resolve the band together ----- */
    if (window.X3FBand) {
      var resolved = X3FBand.forMovement(slug);
      if (band !== undefined) {
        okf('the band Calibrate will save under is the band the games will read',
            band === resolved, 'page=' + band + ' games=' + resolved);
      } else {
        ok('the page exposes the band it is capturing against', false,
           'no `band` in scope - expose it, or window.__x3fCal.band, so this can be checked');
      }

      /* The reported bug, end to end, on the real page: a capture on White must
         still be the one the Library finds, even though chest-press RECOMMENDS
         Dark Gray and the old Library rule (libBand[slug] || ex.band) sent every
         game there. */
      ok('a chest-press capture is accepted', X3FCal.save('chest-press', 'White', 30, 150) === true);
      ok('...and the Library still recommends a different band, so this means something',
         X3FEX.get('chest-press').band === 'Dark Gray', X3FEX.get('chest-press').band);
      var b2 = X3FBand.forMovement('chest-press');
      ok('...yet the game now resolves the band it was calibrated on (D1)', b2 === 'White', b2);
      var r2 = X3FCal.range('chest-press', b2);
      ok('...and sees 30 as the bottom and 150 as the top, not 0 and 330',
         r2.lo === 30 && r2.hi === 150, r2.lo + '-' + r2.hi);
      X3FCal.clear('chest-press', 'White');
    }

    /* ------------------------- the TV signal path ------------------------ */
    if (tv) ok('the shell bootstrap is driving force', !!window.__x3fDrv);

    /* INVARIANT I7. Calibrate must measure ABSOLUTE force: it is the page that
       decides what the floor IS, so a floor cannot be subtracted from its
       input. The bootstrap only subtracts when the page defines calLo(), and
       this page deliberately does not.

       This is a trip-wire for a change the plan intends to make: the shell is
       to stop duplicating the conditioning and call one shared function instead
       (OVERHAUL-PLAN.md invariant 1). The moment that lands, Calibrate has to
       opt out of the floor, or every capture on a movement that already has one
       comes out short by that floor - and the capture after that comes out
       short by the first one's error. Asserted in both scenarios, because the
       browser build floors in onSample() and the TV build floors in the
       bootstrap, and those two have silently diverged twice. */
    ok('the page defines no calLo() (I7)', typeof gv('calLo') !== 'function');

    /* A calibration on every band this movement could resolve to, so the
       assertion below cannot pass merely because the page happened to be on a
       band with no floor stored. */
    if (window.X3FCal && window.X3FEX) {
      X3FEX.bands.forEach(function (b) { X3FCal.save(slug, b, 52, 78); });
    }
    if (tv) window.__x3fForce = 52;

    wait(function () {
      if (tv) {
        okf('the bar reaches this page on the TV', gv('force') === 52,
            'force=' + gv('force') + ' (52 expected)');
        okf('Calibrate measures absolute force, never a floored one (I7)',
            gv('force') === 52,
            'force=' + gv('force') + ' - 0 or 13 means a floor was subtracted from the capture');
      }
      if (window.X3FCal && window.X3FEX) {
        X3FEX.bands.forEach(function (b) { X3FCal.clear(slug, b); });
      }

      wait(function () {
        if (tv) {
          /* D12: on the TV none of connect() / startTare() / startDemo() ever
             run and onSample() never runs, so setStatus() is never called and
             the pill keeps its initial markup - a red dot reading "Offline"
             while live numbers move on the same screen, which sends the user
             hunting for a connection problem that does not exist.

             Read from the status region if the page has one it can be
             identified by, else from the whole page. Text, not an id, because
             the symptom IS the text and this must survive the rewrite. */
          var el = document.querySelector('#statusTxt,[data-status],.status') || document.body;
          var says = (el.innerText || el.textContent || '').replace(/\s+/g, ' ');
          okf('the page does not say "Offline" while the bar is live (D12)',
              !/\boffline\b/i.test(says), says.slice(0, 90));
        }

        /* ------------ a refused capture must write NOTHING (D2) ---------- */
        /* Module level first, because it needs no seam and it pins the half of
           the rule that x3f-cal.js owns. */
        if (window.X3FCal) {
          var beforeCal = raw('exCal'), beforeMax = raw('bandMax');
          var res = X3FCal.save('drag-curl', 'White', 495, 500);
          ok('the module refuses a too-narrow capture', res !== true, JSON.stringify(res));
          ok('...and files nothing for the movement', raw('exCal') === beforeCal);
          okf('...and does not touch the band ceiling', raw('bandMax') === beforeMax,
              String(raw('bandMax')));
        }

        /* Then the page's own commit path, which is where the shipped bug is:
           `loop.ok` records that save() refused and the very next statement
           raises bandMax[band] anyway, unconditionally and monotonically. The
           user held their start position too hard, the screen correctly says
           "Only 5 between hold and max", nothing is calibrated - and every one
           of the other ten movements on that band is now scaled to 500 instead
           of 130, permanently, with no control in the app to undo it.

           Driven by pushing the state machine straight to its commit frame
           rather than sitting through the real capture: the new flow is a 10 s
           lead-in plus a 4 s hold plus a countdown plus a 6 s max, which does
           not fit in the harness's virtual-time budget and would make this
           scenario a timing test instead of a correctness one. */
        var maxBefore = store('bandMax') || {};
        var drove = false, committed = false;

        if (window.__x3fCal && typeof window.__x3fCal.commit === 'function') {
          try { window.__x3fCal.commit(495, 500); drove = committed = true; } catch (e) {}
        }
        if (!drove && gv('phase') !== undefined) {
          drove = sv('capLo', 495) && sv('capMax', 500) && sv('pEnd', -1) && sv('phase', 'cap');
          if (drove) {
            window.__x3fForce = 0;
            sv('force', 0);
            /* Call the frame function directly instead of waiting for one.
               requestAnimationFrame does not fire in this headless dump - the
               scenario passed a nonsense green the first time it was run this
               way, because the commit branch simply never executed and nothing
               said so. A top-level `function loop()` is a property of the
               window, so it can be stepped by hand; one frame with `now` past
               pEnd is the whole commit. */
            var frame = window.loop || gv('loop');
            if (typeof frame === 'function') { try { frame(1e9); } catch (e) {} }
            committed = gv('phase') !== 'cap';
          }
        }
        okf('the capture flow can be driven headlessly',
            drove, 'expose window.__x3fCal.commit(lo,hi), or keep phase/capLo/capMax/pEnd ' +
                                 'in scope - without one of them the page\'s own commit path is untestable, ' +
                                 'which is how D2 shipped');
        if (drove) {
          okf('...and the capture actually reached its commit', committed,
              'phase=' + gv('phase') + ' - the frame function never ran, so everything after ' +
              'this would be a green that proves nothing');
        }

        wait(function () {
          if (drove && committed) {
            var maxAfter = store('bandMax') || {};
            var bandsChanged = [];
            Object.keys(maxAfter).forEach(function (k) {
              if (maxAfter[k] !== maxBefore[k]) bandsChanged.push(k + ': ' + maxBefore[k] + ' -> ' + maxAfter[k]);
            });
            okf('a REFUSED capture leaves the band ceilings alone (D2)',
                bandsChanged.length === 0, bandsChanged.join(', '));
            okf('...and files no calibration either',
                !(store('exCal') || {})[(gv('slug') || slug) + '|' + (gv('band') || band)],
                JSON.stringify(store('exCal')));
          }

          /* ------------------------- offline (AD-5) --------------------- */
          /* The bundle must work with no network at all, and this page is one
             of the ones that render-blocks on a Google Fonts request today.
             Cheap to assert, impossible to regress past. */
          var net = [];
          [].forEach.call(document.querySelectorAll('link[href],script[src],img[src]'), function (el) {
            var u = el.getAttribute('href') || el.getAttribute('src') || '';
            if (/^https?:|^\/\//i.test(u)) net.push(u.slice(0, 60));
          });
          okf('nothing on this page loads from the internet (AD-5)', net.length === 0, net.join(' '));

          /* ------------- OK during GET SET starts, it does not cancel ----
             REPORTED SHAPE OF THE BUG: the caption during GET SET tells you to
             press OK, and on the television OK never reaches this page's keydown
             listener - the shell consumes DPAD_CENTER and routes it to
             __x3fNav('enter'), which calls click() on the focused element. That
             element is #calBtn, which was labelled "Cancel" and wired to cancel.
             So obeying the instruction on screen threw the calibration away.

             Asserted through the BUTTON, deliberately, not through flow.press():
             the direct call always worked. What was broken is the only path a
             person on a sofa can actually take. */
          (function () {
            var btn = document.getElementById('calBtn');
            var cal = window.__x3fCal;
            if (!btn || !cal || typeof cal.phase !== 'function') {
              okf('OK during GET SET can be checked', false,
                  'expose window.__x3fCal.phase() so the button path can be asserted');
              return;
            }
            try { cal.cancel && cal.cancel(); } catch (e) {}
            btn.click();                                    /* start a capture */
            var started = cal.phase();
            okf('pressing the button starts a capture in GET SET',
                started === 'getset', 'phase=' + started);
            okf('...and the button then offers to start, not to cancel',
                /ready/i.test(btn.textContent), JSON.stringify(btn.textContent));
            btn.click();                                    /* the OK the caption asks for */
            var after = cal.phase();
            okf('OK during GET SET does not cancel the capture',
                after !== 'idle', 'phase after OK = ' + after);
            okf('...it moves the capture on instead',
                after === 'hold' || after === 'getset', 'phase after OK = ' + after);
            try { cal.cancel && cal.cancel(); } catch (e) {}
          })();

          /* --------------------- and it ran without throwing ------------ */
          okf('no uncaught error while the capture loop ran (D13)', errs.length === 0,
              errs.slice(0, 3).join(' | '));

          F.report(scenario);
        }, 320);
      }, 260);
    }, 260);
  }, 260);
})();
