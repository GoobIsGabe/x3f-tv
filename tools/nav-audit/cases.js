/* Per-page audit cases: set up each UI state, then audit it. */
(function () {
  var A = window.__audit;
  var page = (location.pathname.split('/').pop() || '');
  var isLauncher = page.indexOf('launcher') >= 0 || page.indexOf('index') >= 0;

  // the launcher is the one page the shell does NOT bootstrap
  if (!isLauncher) A.bootstrap();
  else { var ns=document.createElement('style');
         ns.textContent='*{transition:none!important;animation:none!important}';
         document.head.appendChild(ns); }

  function later(fn, ms) { setTimeout(fn, ms || 260); }

  later(function () {
    if (isLauncher) {
      A.audit('launcher home');
      // The bar picker is a modal off the bar chip now, not an inline panel that
      // squashed the card grid. As a modal it has to trap the cursor.
      var chip = document.getElementById('barChip');
      if (!chip) return A.report();
      try { window.__x3fDevices([{ a: 'AA:BB:CC:DD:EE:F1', n: 'X3 FORCE' },
                                 { a: 'AA:BB:CC:DD:EE:F2', n: '' }]); } catch (e) {}
      chip.click();
      return later(function () {
        A.audit('launcher: bar picker open');
        A.report();
      });
    }

    if (page.indexOf('routine') >= 0) {
      A.audit('routine: day list');
      // guided coach
      document.getElementById('startSession').click();
      later(function () {
        A.audit('routine: guided coach open');
        // pending-set prompt (the state you get coming back from a game)
        try {
          var S = JSON.parse(localStorage.getItem('x3f_session'));
          S.pending = { slug: 'deadlift', game: 'bloom', at: Date.now() };
          localStorage.setItem('x3f_session', JSON.stringify(S));
        } catch (e) {}
        document.getElementById('cPending').classList.add('show');
        later(function () {
          A.audit('routine: coach + "did you finish that set?" prompt');
          document.getElementById('cPending').classList.remove('show');
          // rest timer
          document.getElementById('cLog').click();
          later(function () {
            A.audit('routine: rest timer');
            document.getElementById('restSkip').click();
            // session summary
            document.getElementById('cClose').click();
            later(function () {
              A.audit('routine: session summary');
              A.report();
            });
          });
        });
      });
      return;
    }

    if (page.indexOf('library') >= 0) { A.audit('library'); return A.report(); }
    if (page.indexOf('progress') >= 0) { A.audit('progress'); return A.report(); }

    // ----- games -----
    A.audit('game: playing (no overlay)');
    var scrims = [].slice.call(document.querySelectorAll('.scrim'));
    if (!scrims.length) return A.report();
    var i = 0;
    (function next() {
      if (i >= scrims.length) return A.report();
      var s = scrims[i++];
      scrims.forEach(function (x) { x.classList.remove('show'); });
      s.classList.add('show');
      later(function () {
        A.audit('game: overlay #' + (s.id || 'scrim') + ' open');
        next();
      }, 200);
    })();
  }, 320);
})();
