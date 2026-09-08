/* X3F functional tests. Drives the real bundled pages headlessly and checks that
   the FEATURES work, not just that the remote can reach them:

     routine    guided session state machine, program strip, per-movement logging
     progress   dashboard sections render from a seeded log, export/import round
                trip, achievement filters
     library    band choice persists and launch links carry movement + band
     bloom      set lifecycle, milestone hooks, burnout meter, rich logging
     launcher   programme strip, device picker, music toggle

   Every scenario seeds its own localStorage, so results do not depend on whatever
   was there before.
*/
(function () {
  var L = [], pass = 0, fail = 0;
  function ok(name, cond, extra) {
    if (cond) pass++; else fail++;
    L.push((cond ? 'PASS ' : 'FAIL ') + name + (extra != null ? '  -> ' + extra : ''));
  }
  function has(id) { return !!document.getElementById(id); }
  function txt(id) { var e = document.getElementById(id); return e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function click(id) { var e = document.getElementById(id); if (e) e.click(); return !!e; }

  /* ---- a DOM lookup that cannot take the whole run with it ----

     `document.querySelector('#recent [data-del]').click()` with no null guard is
     how renaming one attribute cost twenty-one PASSING assertions. The script
     throws, report() is never reached, --dump-dom carries no FUNC marker, and
     run.py can only say "no report - the page threw before finishing" with no
     line number and no clue which of the four hundred ids moved.

     That matters far more during a refactor that renames things ON PURPOSE.
     need() turns "the suite died" into "23 passed, 1 failed - #recent
     [data-del] is missing", which is a diagnosis.

     The stand-in absorbs everything the scenarios do to an element. It reports
     false / empty / zero for every query, so an assertion built on a missing
     element fails rather than accidentally passing on a truthy object. */
  var ABSENT = {
    x3fAbsent: true,
    value: '', textContent: '', width: 0, height: 0, href: '',
    style: {}, dataset: {},
    classList: { contains: function () { return false; }, add: function () {}, remove: function () {} },
    click: function () {},
    focus: function () {},
    getAttribute: function () { return ''; },
    setAttribute: function () {},
    dispatchEvent: function () { return false; },
    getBoundingClientRect: function () { return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }; }
  };
  function found(el, label) {
    if (el) return el;
    ok('DOM: ' + label + ' exists', false, 'missing - the assertions that use it cannot mean anything');
    return ABSENT;
  }
  function needId(id) { return found(document.getElementById(id), '#' + id); }
  function needSel(sel) { return found(document.querySelector(sel), sel); }
  function nth(sel, i) {
    var list = document.querySelectorAll(sel);
    return found(list[i || 0], sel + '[' + (i || 0) + ']');
  }
  /* Calling a shell bridge the page no longer exposes is the same failure by a
     different route - `window.__x3fDevices is not a function` kills the script. */
  function callShell(name) {
    var fn = window[name], args = [].slice.call(arguments, 1);
    if (typeof fn !== 'function') {
      ok('shell bridge ' + name + ' is exposed', false, 'missing');
      return false;
    }
    try { fn.apply(window, args); return true; }
    catch (e) { ok('shell bridge ' + name + ' ran', false, e.message); return false; }
  }

  /* ---- shared fixture: a fortnight of believable training ---- */
  function seed() {
    var P = window.X3FProg;
    var out = [];
    var moves = [['deadlift', 'Black'], ['bent-row', 'Dark Gray'], ['chest-press', 'Dark Gray'],
                 ['overhead-press', 'Light Gray'], ['calf-raise', 'Light Gray']];
    for (var d = 13; d >= 0; d--) {
      if (d === 6) continue;                       // one rest day, deliberately
      var m = moves[d % moves.length];
      var when = P ? P.keyMinus(P.today(), d) : null;
      var p = (when || '2026-01-01').split('-');
      /* Every seeded set has to be in the PAST, and today's most of all.

         X3FProg.sets() sorts ascending by `t`, and half the scenarios read the
         set they just drove as sets()[length - 1]. Pinning today's entry to
         18:00 local made it a set in the FUTURE at every hour before 6pm, so
         from midnight to six the newest entry in the log was the fixture rather
         than the set under test - and bloom read part=4/peak=300, flow read
         g='bloom', splash read reps=18. Five failures that appear and disappear
         with the wall clock, blaming the games for a bug in the fixture.

         Older days keep 18:00 because only their DATE matters (streak, grid,
         adherence) and 18:00 yesterday is unambiguously past. Today's is a
         second ago, which is both past and still today. */
      var t = (d === 0)
        ? Date.now() - 1000
        : new Date(+p[0], +p[1] - 1, +p[2], 18, 0, 0).getTime();
      out.push({ t: t, k: 'set', g: 'bloom', ex: m[0], band: m[1], b: m[1],
                 reps: 18 + (d % 9) * 3, full: 12 + (d % 5), part: 4 + (d % 7),
                 peak: 300 + (d % 6) * 20 });
    }
    localStorage.setItem('x3f_history', JSON.stringify(out));
    /* Every key a shared module owns. A key left behind is a scenario whose
       result depends on which scenario ran before it, and the isolation that
       hides that today (one browser profile per scenario) is exactly the kind
       of thing a refactor consolidates away.

       x3f_bandMax is the fallback ceiling every uncalibrated estimate is scaled
       from, so leaving it set makes "an uncalibrated overhead press reads 39-78"
       depend on whatever a previous run happened to measure.

       x3f_exBand is x3f-band.js's per-movement choice and x3f_libBand is the
       Library's old key it migrates from. Both sit ABOVE the recommendation in
       the resolution order, so a leftover entry silently changes which band a
       movement resolves to - which is the precise class of bug x3f-band.js
       exists to end, and the last place it should be allowed to survive. */
    ['x3f_ach', 'x3f_chal', 'x3f_prog', 'x3f_routineProg2', 'x3f_session',
     'x3f_exCal', 'x3f_routine2', 'x3f_bandMax', 'x3f_exBand',
     'x3f_libBand'].forEach(function (k) {
      localStorage.removeItem(k);
    });
    // the band you are "on" - the thing that must survive walking to the next lift
    localStorage.setItem('x3f_band', JSON.stringify('White'));
    return out;
  }

  function report(label) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b0f18;color:#eaf0fa;' +
      'font:13px/1.5 Consolas,monospace;padding:16px;white-space:pre-wrap;overflow:auto';
    d.textContent = 'FUNC ' + label + '  ' + pass + ' passed, ' + fail + ' failed' +
      String.fromCharCode(10, 10) + L.join(String.fromCharCode(10));
    document.body.appendChild(d);
  }

  window.__func = { ok: ok, has: has, txt: txt, click: click, seed: seed, report: report, L: L,
                    needId: needId, needSel: needSel, nth: nth, callShell: callShell };
})();
