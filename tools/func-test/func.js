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
      var t = new Date(+p[0], +p[1] - 1, +p[2], 18, 0, 0).getTime();
      out.push({ t: t, k: 'set', g: 'bloom', ex: m[0], band: m[1], b: m[1],
                 reps: 18 + (d % 9) * 3, full: 12 + (d % 5), part: 4 + (d % 7),
                 peak: 300 + (d % 6) * 20 });
    }
    localStorage.setItem('x3f_history', JSON.stringify(out));
    ['x3f_ach', 'x3f_chal', 'x3f_prog', 'x3f_routineProg2', 'x3f_session'].forEach(function (k) {
      localStorage.removeItem(k);
    });
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

  window.__func = { ok: ok, has: has, txt: txt, click: click, seed: seed, report: report, L: L };
})();
