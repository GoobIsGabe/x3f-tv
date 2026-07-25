/* Per-page functional scenarios. Loaded after func.js on a staged page. */
(function () {
  var F = window.__func, P = window.X3FProg;
  var page = (location.pathname.split('/').pop() || '');
  var ok = F.ok, txt = F.txt, has = F.has, click = F.click;

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
        var box = document.getElementById('impBox');
        box.style.display = 'block'; box.value = payload;
        var oldAlert = window.alert; window.alert = function () {};
        click('impBtn');
        window.alert = oldAlert;
        ok('import restored the history (' + P.sets().length + ' of ' + before + ')', P.sets().length === before);
        ok('import re-populated the dashboard', document.querySelectorAll('#pbs .pbrow').length >= 3);
        // band coaching
        localStorage.setItem('x3f_history', JSON.stringify([
          { t: Date.now() - 86400000, k: 'set', ex: 'chest-press', band: 'Dark Gray', reps: 44 },
          { t: Date.now() - 3600000, k: 'set', ex: 'chest-press', band: 'Dark Gray', reps: 42 }]));
        rerender();
        ok('band coaching appears at 44 reps', /Move .* up to Black/i.test(txt('advice')), txt('advice').slice(0, 70));
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
        var lifts = document.querySelectorAll('#list .ex').length;
        ok('the day lists movements (' + lifts + ')', lifts >= 4);

        var before = P.sets().length;
        click('startSession');
        wait(function () {
          ok('guided coach opens', document.getElementById('coach').classList.contains('show'));
          var lift1 = txt('cName');
          ok('coach names a lift', lift1.length > 2, lift1);
          ok('form canvas is sized', document.getElementById('demoCv').width > 0);
          var oldAlert = window.alert; window.alert = function () {};
          click('cLog');
          wait(function () {
            ok('logging a set writes it to history', P.sets().length === before + 1);
            var last = P.sets()[P.sets().length - 1];
            ok('the logged set names the movement', !!last.ex, last.ex);
            ok('the logged set names the band', !!(last.band || last.b), last.band || last.b);
            ok('with one set per lift, logging advances the lift', txt('cName') !== lift1,
               lift1 + ' -> ' + txt('cName'));
            ok('rest timer runs between lifts', document.getElementById('rest').classList.contains('show'));
            click('restSkip');
            ok('skipping rest closes it', !document.getElementById('rest').classList.contains('show'));
            click('cSkip');
            ok('skip lift keeps the coach open', document.getElementById('coach').classList.contains('show'));
            click('cClose');
            wait(function () {
              ok('ending the session shows the summary', document.getElementById('done').classList.contains('show'));
              ok('summary counts sets', /\d/.test(txt('dSets')), 'sets=' + txt('dSets'));
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
            var again = document.querySelector('#lib select');
            ok('band choice sticks after re-render', again.value === 'Black', again.value);
            var link = document.querySelector('#lib .gm');
            ok('launch links carry the band', /band=Black/.test(link.getAttribute('href')), link.getAttribute('href'));
            ok('launch links carry the movement', /ex=[a-z-]+/.test(link.getAttribute('href')));
            ok('setup and cue are shown', document.querySelectorAll('.detail').length >= 22);
            F.report(page);
          }, 220);
          return;
        }
        return F.report(page);
      }

      /* ================= bloom (a game) ================= */
      if (page.indexOf('bloom') >= 0) {
        ok('progress engine loaded in-game', !!P);
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

      /* ================= launcher ================= */
      if (page.indexOf('launcher') >= 0 || page.indexOf('index') >= 0) {
        ok('programme strip renders', txt('prog').length > 15, txt('prog').slice(0, 80));
        ok('strip shows a streak', /streak/.test(txt('prog')));
        ok('strip shows the challenge', /Challenge|🎯|✅/.test(txt('prog')));
        ok('11 cards', document.querySelectorAll('.card').length === 11);
        ok('workout is the hero card', document.querySelectorAll('.card')[0].classList.contains('hero'));
        ok('music toggle exists', !!document.getElementById('musicBtn'));
        ok('device picker is hidden while all is well', !document.getElementById('finder').classList.contains('on'));
        window.__x3fDevices([{ a: 'AA:BB:CC:DD:EE:01', n: 'X3 Force' }]);
        document.getElementById('finder').classList.add('on');
        window.__x3fDevices([{ a: 'AA:BB:CC:DD:EE:01', n: 'X3 Force' }]);
        ok('picker lists what the scan saw', document.querySelectorAll('#findList .dev').length === 1);
        return F.report(page);
      }

      F.report(page);
    }, 300);
  }, 200);
})();
