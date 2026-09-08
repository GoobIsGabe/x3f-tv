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

    /* The new single-document home (app.html). It is not the launcher as far as
       the shell is concerned - MainActivity.isLauncher() matches launcher.html
       and index.html only - so it DOES get the bootstrap, exactly like the other
       menu pages, and x3f-nav.js claims __x3fNav before the bootstrap's fallback
       can install. Checked here before 'routine', because this page links to
       X3F_Routine.html and a substring dispatch has no idea which is which.

       Two states worth walking: the home itself, where the whole design bet is
       that the cursor starts on Start and the rows are reachable across, and the
       settings dialog, which is the one overlay on the page and therefore the
       one place the cursor can escape from. */
    if (page.indexOf('app') >= 0) {
      /* DISMISS FIRST RUN, OR NONE OF THIS AUDITS WHAT IT SAYS IT DOES.

         Every audit run gets a fresh browser profile, so localStorage is empty,
         so X3FOnboard.needed() is TRUE and boot() mounts the four-step overlay
         over the home. Without this the five states below would all have walked
         the onboarding scrim and reported it clean five times, while the home and
         every pairing dialog went entirely unexamined - a suite that looks like
         coverage and is not. Onboarding gets audited properly under its own
         screen name ('onboard'), where it is mounted on purpose. */
      try { if (window.X3FOnboard && window.X3FOnboard.skip) window.X3FOnboard.skip(); } catch (e) {}
      try {
        var ob = document.getElementById('obScrim');
        if (ob) { ob.classList.remove('show'); ob.innerHTML = ''; }
      } catch (e) {}
      try { if (window.X3F && window.X3F.setOverlay) window.X3F.setOverlay(false); } catch (e) {}
      try { if (window.X3FNav) window.X3FNav.refresh(); } catch (e) {}

      A.audit('home: hero + rows');
      var gear = document.getElementById('settingsChip');
      if (!gear) return A.report();

      /* THE PAIRING DIALOGS, WITH THE NETWORK REPLACED BY A STUB.

         These three modals were the largest unaudited surface in the app: every
         one of them is a full-screen overlay that has to trap the cursor, and one
         of them ("a phone is asking to join") REPLACES the modal contents
         asynchronously while the user may be sitting on the previous modal's
         Close button. That is precisely the shape of bug this audit exists for,
         and it could not be reached before because pair() talks to Firebase.

         So X3FSync is swapped for a stub that resolves instantly. Nothing about
         the network is being tested here - the DOM these functions build, and
         what the remote can do with it, is. */
      window.X3FSync = {
        available: function () { return true; },
        configured: function () { return true; },
        status: function () { return { state: 'paired', household: 'h', uid: 'u', pending: 0, lastSync: 0, error: null }; },
        openNetwork: function () { return true; },
        auto: function () {},
        sync: function () { return Promise.resolve(); },
        push: function () { return Promise.resolve({ pushed: 0 }); },
        pull: function () { return Promise.resolve({ merged: 0 }); },
        startPairing: function () {
          return Promise.resolve({ code: 'ABC234', url: 'https://x3f-tv.web.app/#invite=ABC234', expiresInMs: 300000 });
        },
        /* Hand the claim back on the next tick, exactly as the real poll would:
           asynchronously, into a modal that is already on screen. */
        watchInvite: function (code, cb) { setTimeout(function () { cb('FyPp3MNQE8h1abcd'); }, 60); return function () {}; },
        confirm: function () { return Promise.resolve(); },
        forget: function () {}
      };

      gear.click();
      return later(function () {
        A.audit('home: settings dialog open');
        var pairBtn = document.getElementById('pairBtn');
        if (!pairBtn) { A.audit('home: NO pairBtn in settings'); return A.report(); }
        pairBtn.click();
        later(function () {
          A.audit('home: pairing code shown');
          /* watchInvite fired during that wait, so the modal has already become
             the confirm prompt. Audit it, then press Allow. */
          later(function () {
            A.audit('home: "a phone is asking to join"');
            var allow = document.getElementById('allowBtn');
            if (!allow) return A.report();
            allow.click();
            later(function () {
              A.audit('home: paired confirmation');
              A.report();
            }, 320);
          }, 260);
        }, 320);
      });
    }

    /* FIRST RUN. The four-step onboarding is the first thing a new install shows
       on the television and it had never been walked, because needed() is false
       on any machine that has run the app once. Mount it directly. */
    if (page.indexOf('onboard') >= 0) {
      var host = document.getElementById('obScrim');
      if (!host || !window.X3FOnboard) { A.audit('onboarding: NOT MOUNTABLE'); return A.report(); }
      window.X3FOnboard.start(host, { onDone: function () {} });
      var step = 0;
      return (function nextStep() {
        later(function () {
          A.audit('onboarding: step ' + (step + 1));
          if (++step >= 4) return A.report();
          /* Advance with the primary control, whatever it is called - the point
             is to reach the next step the way a remote would, not to know its id. */
          var next = host.querySelector('[data-nav-first]') ||
                     host.querySelector('button[data-nav]');
          if (!next) return A.report();
          next.click();
          nextStep();
        }, 300);
      })();
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

    if (page.indexOf('progress') >= 0) {
      A.audit('progress');
      /* THE DESTRUCTIVE CONFIRM. #wipeAsk is hidden until you ask to reset
         achievements, so the audit has never seen it - and it is the one dialog
         in the app where landing on the wrong control loses data. On the TV every
         native confirm() is auto-answered YES, which is the whole reason this
         in-page prompt exists (D5); if the remote can reach it but the cursor
         starts on the destructive option, the prompt is worse than none. */
      var wipe = document.getElementById('wipeBtn');
      if (!wipe) return A.report();
      wipe.click();
      return later(function () {
        A.audit('progress: reset-achievements confirm');
        A.report();
      }, 300);
    }

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
