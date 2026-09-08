/* Per-page functional scenarios. Loaded after func.js on a staged page. */
(function () {
  var F = window.__func, P = window.X3FProg;
  var page = (location.pathname.split('/').pop() || '');
  var ok = F.ok, txt = F.txt, has = F.has, click = F.click;
  /* needId/needSel/nth report a FAIL and hand back an inert stand-in instead of
     throwing, so one renamed id costs one assertion rather than the whole
     report. See the comment on them in func.js. */
  var needId = F.needId, needSel = F.needSel, nth = F.nth, callShell = F.callShell;

  // the pages under test were already parsed and ran their own boot with whatever
  // localStorage held, so seed and then force a re-render where one is exposed
  F.seed();
  function rerender() {
    try { if (typeof refresh === 'function') refresh(); } catch (e) {}
    try { if (typeof render === 'function') render(); } catch (e) {}
  }

  function wait(fn, ms) { setTimeout(fn, ms || 260); }

  wait(function () {
    rerender();
    wait(function () {

      /* ================= progress dashboard ================= */
      if (page.indexOf('progress') >= 0) {
        ok('engine present', !!P);
        ok('today strip renders a programme day', /day|Done|Start/i.test(txt('today')), txt('today').slice(0, 60));
        ok('streak is shown and non-zero on seeded data', /\d/.test(txt('today')) && P.streak().current > 0, 'streak=' + P.streak().current);
        ok('challenge card renders', txt('chal').length > 20, txt('chal').slice(0, 70));
        ok('12-week grid has 84 cells', document.querySelectorAll('#grid .cell').length === 84);
        ok('grid marks training days', document.querySelectorAll('#grid .cell.done').length >= 10,
           document.querySelectorAll('#grid .cell.done').length + ' done');
        ok('reps-per-week chart drew 12 bars', document.querySelectorAll('#vol div').length === 12);
        ok('peak-force chart drew 12 bars', document.querySelectorAll('#pk div').length === 12);
        ok('personal bests table has rows', document.querySelectorAll('#pbs .pbrow').length >= 3,
           document.querySelectorAll('#pbs .pbrow').length + ' rows');
        ok('achievements rendered', document.querySelectorAll('#achs .ach').length > 50,
           document.querySelectorAll('#achs .ach').length + ' badges');
        ok('some are unlocked by the seeded history', document.querySelectorAll('#achs .ach.got').length > 0,
           document.querySelectorAll('#achs .ach.got').length + ' unlocked');
        ok('unlocked count text renders', /of \d+ unlocked/.test(txt('achCnt')), txt('achCnt'));
        // filters
        var chips = document.querySelectorAll('#achFilters .chip');
        ok('three achievement filters', chips.length === 3);
        if (chips.length === 3) {
          chips[2].click();                       // "Locked"
          ok('locked filter shows only locked', document.querySelectorAll('#achs .ach.got').length === 0);
          chips[1].click();                       // "Unlocked"
          ok('unlocked filter shows only unlocked', document.querySelectorAll('#achs .ach:not(.got)').length === 0);
          chips[0].click();
        }
        // export / import round trip, without touching the filesystem
        var payload = JSON.stringify({ v: 1, history: P.history(), ach: {}, chal: {}, bandMax: {} });
        var before = P.sets().length;
        localStorage.setItem('x3f_history', '[]');
        rerender();
        ok('cleared log empties the PB table', document.querySelectorAll('#pbs .pbrow').length === 0);
        var box = needId('impBox');
        box.style.display = 'block'; box.value = payload;
        var oldAlert = window.alert; window.alert = function () {};
        click('impBtn');
        window.alert = oldAlert;
        ok('import restored the history (' + P.sets().length + ' of ' + before + ')', P.sets().length === before);
        ok('import re-populated the dashboard', document.querySelectorAll('#pbs .pbrow').length >= 3);
        // recent sets list, and its delete
        ok('recent sets are listed', document.querySelectorAll('#recent .pbrow').length >= 3,
           document.querySelectorAll('#recent .pbrow').length + ' rows');
        ok('each recent row offers a delete', !!document.querySelector('#recent [data-del]'));
        var setsBefore = P.sets().length;
        var oldConfirm = window.confirm; window.confirm = function () { return true; };
        needSel('#recent [data-del]').click();
        window.confirm = oldConfirm;
        ok('deleting a set removes it (' + P.sets().length + ' of ' + setsBefore + ')',
           P.sets().length === setsBefore - 1);
        /* band coaching — ON FULL-RANGE REPS, WHICH IS THE WHOLE RULE.

           This fixture used to carry `reps` alone, and the advice fired on it.
           That was the app progressing people off TOTAL reps, when the source is
           explicit and SOURCED: "40 slow and controlled reps with a band, NOT
           COUNTING PARTIAL REPS" (docs/x3-knowledge/official/band-progression.md).
           Since a set is 15-40 full reps and then partials to failure, total reps
           clears 40 on a set that has not earned anything, and the app was telling
           people to go heavier on the strength of their burnout partials.

           So the fixture now says what it means. A legacy entry with no `full`
           still must NOT qualify - that is deliberate, and the second fixture
           below pins it. */
        localStorage.setItem('x3f_history', JSON.stringify([
          { t: Date.now() - 86400000, k: 'set', ex: 'chest-press', band: 'Dark Gray', reps: 52, full: 44 },
          { t: Date.now() - 3600000, k: 'set', ex: 'chest-press', band: 'Dark Gray', reps: 49, full: 42 }]));
        rerender();
        ok('band coaching appears at 44 FULL reps', /Move .* up to Black/i.test(txt('advice')), txt('advice').slice(0, 70));

        localStorage.setItem('x3f_history', JSON.stringify([
          { t: Date.now() - 86400000, k: 'set', ex: 'chest-press', band: 'Dark Gray', reps: 52 },
          { t: Date.now() - 3600000, k: 'set', ex: 'chest-press', band: 'Dark Gray', reps: 49 }]));
        rerender();
        ok('...and NOT on total reps alone, however high',
           !/Move .* up to Black/i.test(txt('advice')), txt('advice').slice(0, 70));
        return F.report(page);
      }

      /* ================= routine ================= */
      if (page.indexOf('routine') >= 0) {
        ok('engine present', !!P);
        ok('programme strip renders', txt('pstrip').length > 20, txt('pstrip').slice(0, 80));
        // "Done today" is the right answer when the seed includes a set for today
        ok('strip names the day (Push / Pull / Done / Start)',
           /Push|Pull|Done|Start/.test(txt('pstrip')), txt('pstrip').slice(0, 40));
        ok('strip shows the streak', /day streak/.test(txt('pstrip')));
        ok('strip carries today\'s challenge', /Challenge|🎯/.test(txt('pstrip')));
        ok('one set is the default', (document.querySelector('#list select[data-k="sets"]') || {}).value === '1',
           (document.querySelector('#list select[data-k="sets"]') || {}).value);
        /* The band you are on must survive walking to the next lift. Every
           movement used to default to the LIBRARY's suggestion (chest press ->
           Dark Gray), so starting a day on White quietly moved you up a band you
           never chose. The suggestion is advice now, not an instruction. */
        var bandSels = document.querySelectorAll('#list select[data-k="band"]');
        var offBand = [].filter.call(bandSels, function (s) { return s.value !== 'White'; });
        ok('every lift starts on the band you are on', bandSels.length > 0 && offBand.length === 0,
           offBand.length + ' of ' + bandSels.length + ' moved off White');
        /* The WORDING changed and the assertion followed it, deliberately. This
           used to look for "X3 suggests", which put a sentence in the
           manufacturer's mouth: the source publishes a relative ORDER of
           movements, not a per-movement band, so the name was the app's own
           reading of that ranking. What this assertion is actually for is
           unchanged - the suggestion must be SHOWN and never APPLIED, which the
           line above it checks by confirming every lift is still on White. */
        ok('the library suggestion is shown in the app own words',
           /this app suggests/i.test(document.getElementById('list').textContent));
        var lifts = document.querySelectorAll('#list .ex').length;
        ok('the day lists movements (' + lifts + ')', lifts >= 4);

        var before = P.sets().length;
        click('startSession');
        wait(function () {
          ok('guided coach opens', needId('coach').classList.contains('show'));
          var lift1 = txt('cName');
          ok('coach names a lift', lift1.length > 2, lift1);
          ok('form canvas is sized', needId('demoCv').width > 0);
          var oldAlert = window.alert; window.alert = function () {};
          click('cLog');
          wait(function () {
            ok('logging a set writes it to history', P.sets().length === before + 1);
            var last = P.sets()[P.sets().length - 1];
            ok('the logged set names the movement', !!last.ex, last.ex);
            ok('the logged set names the band', !!(last.band || last.b), last.band || last.b);
            ok('with one set per lift, logging advances the lift', txt('cName') !== lift1,
               lift1 + ' -> ' + txt('cName'));
            ok('rest timer runs between lifts', needId('rest').classList.contains('show'));
            click('restSkip');
            ok('skipping rest closes it', !needId('rest').classList.contains('show'));
            click('cSkip');
            ok('skip lift keeps the coach open', needId('coach').classList.contains('show'));
            // undo must remove the set AND the progress mark
            var afterLog = P.sets().length;
            click('cClose');
            wait(function () {
              ok('ending the session shows the summary', needId('done').classList.contains('show'));
              ok('summary counts sets', /\d/.test(txt('dSets')), 'sets=' + txt('dSets'));
              ok('undo button exists', has('dUndo'));
              click('dUndo');
              ok('undo removes the logged set (' + P.sets().length + ' vs ' + afterLog + ')',
                 P.sets().length === afterLog - 1);
              window.alert = oldAlert;
              F.report(page);
            }, 200);
          }, 260);
        }, 260);
        return;
      }

      /* ================= library ================= */
      if (page.indexOf('library') >= 0) {
        var cards = document.querySelectorAll('.ex').length;
        ok('all movements listed (' + cards + ')', cards === 11);
        var sel = document.querySelector('#lib select');
        ok('each movement has a band picker', !!sel);
        if (sel) {
          sel.value = 'Black';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          wait(function () {
            var again = needSel('#lib select');
            ok('band choice sticks after re-render', again.value === 'Black', again.value);
            var link = needSel('#lib .gm');
            ok('launch links carry the band', /band=Black/.test(link.getAttribute('href')), link.getAttribute('href'));
            ok('launch links carry the movement', /ex=[a-z-]+/.test(link.getAttribute('href')));
            ok('setup and cue are shown', document.querySelectorAll('.detail').length >= 22);
            F.report(page);
          }, 220);
          return;
        }
        return F.report(page);
      }

      /* ============ bloom as the TV shell drives it ============
         Must be tested before the plain bloom branch - the staged filename
         contains "bloom" either way.

         The shell's bootstrap assigns `force` directly every 16ms and the
         games' onSample() never runs, so ANY conditioning of the raw signal has
         to exist in both places. It did not: the per-movement floor lived only
         in onSample(), so on the TV the scale shrank to the calibrated span
         while the resting load stayed in - an overhead press sat pinned at the
         top of the screen and climbed further from there. The bootstrap here is
         extracted from MainActivity, so a fix that misses it fails this. */
      if (page.indexOf('bloomtv') >= 0) {
        ok('the shell bootstrap is driving force', !!window.__x3fDrv);
        ok('the movement resolved from the launch url', EXSLUG === 'overhead-press', String(EXSLUG));
        ok('calibration module present under the shell', !!window.X3FCal);
        localStorage.setItem('x3f_band', JSON.stringify('White'));
        band = 'White';
        X3FCal.save('overhead-press', 'White', 52, 78);   // a real White-band range
        ok('the scale is the calibrated span', ref() === 26, String(ref()));
        window.__x3fForce = 52;                           // just holding the start position
        wait(function () {
          ok('resting at the start reads ZERO on the TV path', force === 0, 'force=' + force);
          window.__x3fForce = 65;
          wait(function () {
            ok('halfway up reads halfway', Math.abs(force / ref() - 0.5) < 0.05,
               'frac=' + (force / ref()).toFixed(2));
            window.__x3fForce = 78;
            wait(function () {
              ok('an all-out press reads as the top', Math.abs(force / ref() - 1) < 0.02,
                 'frac=' + (force / ref()).toFixed(2));
              X3FCal.clear('overhead-press', 'White');
              F.report(page);
            });
          });
        });
        return;
      }

      /* ================= bloom (a game) ================= */
      if (page.indexOf('bloom') >= 0) {
        ok('progress engine loaded in-game', !!P);
        ok('calibration module loaded in-game', !!window.X3FCal);
        /* The work phase is named after the movement. Every press on a push day
           used to read PULL - the opposite of the instruction. */
        ok('a press is called a press', window.X3FForm && X3FForm.verb('chest-press') === 'PRESS',
           window.X3FForm ? X3FForm.verb('chest-press') : 'no form module');
        ok('a pull is still called a pull', window.X3FForm && X3FForm.verb('deadlift') === 'PULL');
        if (window.X3FCal) {
          X3FCal.clear('overhead-press', 'White');
          /* An uncalibrated movement no longer starts at "floor 0, ceiling =
             whatever this band's number is". Both ends are estimated per
             movement, because lo:0 is wrong for every movement and worst for the
             overhead press: it starts at chin height with the band already under
             the midfoot, so it is carrying roughly HALF its peak force before a
             rep has been done ("holding 75 pounds here... then it might go to
             150"). With a floor of 0 the bottom of that movement drew near the
             top of the screen.

             The numbers are the spec, not the implementation: White band = 130,
             overhead press produces 0.60 of the strongest movement on a band and
             carries 0.50 of its peak at the start, so 130 x 0.60 = 78 and
             78 x 0.50 = 39. The one real capture in this project's history is a
             White-band overhead press measured 52-78 - the ceiling is exact and
             the floor errs low, which is the safe direction. A floor that is too
             HIGH reads zero for the whole set. */
          var est = X3FCal.range('overhead-press', 'White');
          ok('an uncalibrated overhead press is estimated per movement, not floored at 0',
             est.lo === 39 && est.hi === 78 && est.auto === true,
             est.lo + '-' + est.hi + (est.auto ? ' auto' : ' REAL'));
          X3FCal.save('overhead-press', 'White', 96, 214);
          var r = X3FCal.range('overhead-press', 'White');
          ok('a calibrated movement keeps its floor and ceiling', r.lo === 96 && r.hi === 214 && !r.auto,
             r.lo + '-' + r.hi);
          // the point of the whole change: games scale the RANGE, not the ceiling,
          // so an overhead press does not start pinned at the top
          ok('the scale is the range, not the ceiling', X3FCal.span('overhead-press', 'White') === 118,
             String(X3FCal.span('overhead-press', 'White')));
          X3FCal.observe('overhead-press', 'White', 900);
          ok('auto-learn never overwrites a real calibration',
             X3FCal.range('overhead-press', 'White').hi === 214);
          X3FCal.clear('bent-row', 'White');
          X3FCal.observe('bent-row', 'White', 260);
          ok('an uncalibrated movement learns its own ceiling',
             X3FCal.range('bent-row', 'White').hi === 260, String(X3FCal.range('bent-row', 'White').hi));
          /* A White band genuinely spans only ~20-35 units between its start
             tension and an all-out effort. The first threshold was 40 and
             refused honest calibrations as "too narrow to be real". */
          ok('a light band\'s narrow but real range is accepted',
             X3FCal.save('drag-curl', 'White', 100, 120) === true);
          /* A refusal has to say what it measured. "Too narrow to be real" with
             no numbers was a dead end on the sofa - you could not tell whether
             the capture was bad, the bar was unzeroed, or the app was wrong. So
             save() returns true, or {error, message} naming both figures, and
             the error code is what Calibrate branches on. */
          var refused = X3FCal.save('upright-row', 'White', 100, 100);
          ok('a max no higher than the hold is still refused',
             refused !== true && refused && refused.error === 'max-below-hold',
             refused === true ? 'accepted it' : (refused && refused.error));
          ok('and the refusal says what it measured',
             !!(refused && /100/.test(refused.message || '')),
             refused && refused.message);
          ['overhead-press', 'bent-row', 'drag-curl'].forEach(function (s) { X3FCal.clear(s, 'White'); });
        }
        ok('hype module loaded', !!window.X3FHype);
        ok('music module loaded', !!window.X3FMusic);
        ok('music toggle present', has('musicBtn'));
        var before = P.sets().length;
        // a set, driven by the same globals the native shell drives
        try { window.__x3fForce = 0; } catch (e) {}
        click('startBtn');
        ok('starting a set flips the button', /Stop|Fail|End|Surface|Finish/i.test(txt('startBtn')) || txt('startBtn') !== 'Start Set',
           txt('startBtn'));
        // fake some reps through the same path the game uses
        try {
          for (var i = 1; i <= 12; i++) { reps = i; if (typeof hype !== 'undefined' && hype) hype.set(i); }
          burnoutReps = 7; fullReps = 5; setPeak = 355;
          if (typeof hype !== 'undefined' && hype) hype.setBurn(7);
        } catch (e) { ok('could not drive the set: ' + e.message, false); }
        ok('burnout meter appears past failure', !!document.querySelector('.x3fh-burn.on'));
        try { endSet(true); } catch (e) { ok('endSet threw: ' + e.message, false); }
        wait(function () {
          ok('finishing the set logs it (' + P.sets().length + ' vs ' + before + ')', P.sets().length > before);
          // one set, ONE entry: the legacy logSession and the engine both write to
          // x3f_history, and calling both double-counted every rep
          ok('exactly one history entry per set', P.sets().length === before + 1,
             'added ' + (P.sets().length - before));
          var last = P.sets()[P.sets().length - 1];
          ok('partials are logged as a first-class number', (+last.part || 0) === 7, 'part=' + last.part);
          ok('peak force is logged', (+last.peak || 0) === 355, 'peak=' + last.peak);
          ok('the toast headlines the partials', /partials past it/.test(txt('toast')), txt('toast'));
          ok('achievements were evaluated', Object.keys(JSON.parse(localStorage.getItem('x3f_ach') || '{}')).length > 0);
          F.report(page);
        }, 400);
        return;
      }

      /* ================= flow: a rep game via the shared reporter ================= */
      if (page.indexOf('flow') >= 0) {
        ok('reporter loaded', !!window.X3FSet);
        ok('engine loaded', !!P);
        var before = P.sets().length;
        try { X3FSet.watch(function () { return 300; }, function () { return 400; }); } catch (e) {}
        click('startBtn');
        try { reps = 17; } catch (e) {}
        try { endSet ? endSet(true) : stop(); } catch (e) {
          try { $('startBtn').click(); } catch (e2) {}
        }
        wait(function () {
          ok('a Flow set reaches the log (' + P.sets().length + ' vs ' + before + ')', P.sets().length > before);
          var last = P.sets()[P.sets().length - 1];
          ok('it is attributed to the game', last.g === 'flow', last.g);
          ok('the watcher supplied a peak without Flow measuring one', (+last.peak || 0) > 0, 'peak=' + last.peak);
          F.report(page);
        }, 500);
        return;
      }

      /* ================= splash: a score game ================= */
      if (page.indexOf('splash') >= 0) {
        ok('reporter loaded', !!window.X3FSet);
        var before2 = P.sets().length;
        try { X3FSet.watch(function () { return 250; }, function () { return 400; }); } catch (e) {}
        try { startRun(); score = 640; endRun(); } catch (e) { ok('could not drive a run: ' + e.message, false); }
        wait(function () {
          ok('a Splash run reaches the log (' + P.sets().length + ' vs ' + before2 + ')', P.sets().length > before2);
          var last2 = P.sets()[P.sets().length - 1];
          ok('the score is recorded', (+last2.score || 0) === 640, 'score=' + last2.score);
          ok('peak came from the watcher', (+last2.peak || 0) > 0, 'peak=' + last2.peak);
          ok('a score game logs no rep count', last2.reps == null, 'reps=' + last2.reps);
          F.report(page);
        }, 500);
        return;
      }

      /* ================= launcher ================= */
      if (page.indexOf('launcher') >= 0 || page.indexOf('index') >= 0) {
        ok('programme strip renders', txt('prog').length > 15, txt('prog').slice(0, 80));
        ok('strip shows a streak', /streak/.test(txt('prog')));
        ok('strip shows the challenge', /Challenge|🎯|✅/.test(txt('prog')));
        ok('11 cards', document.querySelectorAll('.card').length === 11);
        ok('workout is the hero card', nth('.card', 0).classList.contains('hero'));
        ok('music toggle exists', has('musicBtn'));
        ok('device picker is closed while all is well', !needId('finder').classList.contains('show'));
        // It used to open itself after 9s as a block in this column, stealing
        // height from .grid (flex:1) and squashing every card. It is a modal off
        // the bar chip now, so nothing else may move when it opens.
        var gridH = needId('grid').getBoundingClientRect().height;
        callShell('__x3fDevices', [{ a: 'AA:BB:CC:DD:EE:01', n: 'X3 Force' }]);
        needId('barChip').click();
        ok('the bar chip opens the picker', needId('finder').classList.contains('show'));
        ok('picker lists what the scan saw', document.querySelectorAll('#findList .dev').length === 1);
        var gridH2 = needId('grid').getBoundingClientRect().height;
        ok('picker does not squash the card grid', Math.abs(gridH2 - gridH) < 1, gridH + ' -> ' + gridH2);
        needId('closeFind').click();
        ok('close puts the picker away', !needId('finder').classList.contains('show'));

        // battery: the bar reports cell millivolts, the chip shows a percentage
        callShell('__x3fSetBar', 'on', 'Bar: LIVE');
        callShell('__x3fSetBattery', 4020);
        ok('battery shows as a percentage', /80%/.test(txt('battTxt')), txt('battTxt'));
        callShell('__x3fSetBattery', 3350);
        ok('a flat cell reads low', needId('battTxt').classList.contains('low'), txt('battTxt'));
        callShell('__x3fSetBattery', -1);
        ok('no battery shown when the bar is not reporting one', txt('battTxt') === '');
        return F.report(page);
      }

      F.report(page);
    }, 300);
  }, 200);
})();
