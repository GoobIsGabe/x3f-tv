/* X3F TV navigation audit.
   Simulates the shell (the real BOOTSTRAP + native force + D-pad), then for each
   UI state walks the entire menu with the remote and reports:
     - visible controls the remote can never reach
     - controls the remote can reach that are invisible / behind an overlay
     - whether an open overlay actually traps the cursor
     - directions that lead nowhere
*/
(function () {
  var OUT = [];
  window.__x3fForce = 0;

  /* ---------- the real BOOTSTRAP from MainActivity ---------- */
  function bootstrap() {
    try { window.__x3fNative = true; } catch (e) {}
    // headless has no compositor: let opacity transitions land instantly
    try { var ns=document.createElement('style');
      ns.textContent='*{transition:none!important;animation:none!important}';
      document.head.appendChild(ns); } catch (e) {}
    try { baseline = 0; } catch (e) {}
    try {
      var st = document.getElementById('x3fCss');
      if (!st) {
        st = document.createElement('style'); st.id = 'x3fCss';
        st.textContent = '.app{max-width:none!important;width:100%!important}html,body{width:100%!important;height:100%!important}.x3f-focus{outline:4px solid #39f5c4!important;outline-offset:2px;border-radius:8px}';
        (document.head || document.documentElement).appendChild(st);
      }
    } catch (e) {}
    try {
      if (window.__x3fDrv) clearInterval(window.__x3fDrv);
      window.__x3fDrv = setInterval(function () { try { force = +window.__x3fForce || 0; } catch (e) {} }, 16);
    } catch (e) {}
    try { var fr = document.getElementById('firstrun'); if (fr) fr.classList.remove('show'); } catch (e) {}
    try { if (typeof startRun === 'function') startRun(); } catch (e) {}
    // run.py injects the real BOOTSTRAP ahead of us; if it already installed the
    // fallback nav, use that and do not shadow it with a stale copy.
    if (window.__x3fNav) { window.__usingFallback = !window.__x3fPageNav; return; }
    try {
      if (!window.__x3fNav) {
        window.__usingFallback = true;
        var cur = null;
        var scope = function () {
          var m = document.querySelectorAll('.scrim.show,.modal.show');
          if (m && m.length) return m[m.length - 1];
          return document;
        };
        var vis = function (el) {
          try {
            if (!el || el.disabled) return false;
            if (el.tagName !== 'BODY' && el.offsetParent === null) return false;
            var r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false;
            var sc = el.closest && el.closest('.scrim');
            if (sc && !sc.classList.contains('show')) return false;
            for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
              var cs = getComputedStyle(n); if (!cs) break;
              if (cs.visibility === 'hidden' || cs.display === 'none') return false;
              if (parseFloat(cs.opacity) < 0.05) return false;
              if (cs.pointerEvents === 'none') return false;
              if (n === document.body) break;
            }
            return true;
          } catch (e) { return false; }
        };
        var itemsOf = function () {
          var rootEl = scope();
          var q = rootEl.querySelectorAll('button,select,input,a[href],.cta,.buy,.mini,.iconbtn,[role=button],[onclick]');
          var a = []; for (var i = 0; i < q.length; i++) if (vis(q[i])) a.push(q[i]);
          return a;
        };
        var setFocus = function (el) {
          if (cur) cur.classList.remove('x3f-focus');
          cur = el;
          if (cur) { cur.classList.add('x3f-focus'); try { cur.focus({ preventScroll: true }); } catch (e) {} }
        };
        var ctr = function (el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
        window.__x3fNav = function (dir) {
          try {
            var list = itemsOf(); if (!list.length) { setFocus(null); return; }
            if (!cur || list.indexOf(cur) < 0) { setFocus(list[0]); return; }
            if (dir === 'enter') {
              if (cur.tagName === 'SELECT') { cur.selectedIndex = (cur.selectedIndex + 1) % cur.options.length; cur.dispatchEvent(new Event('change', { bubbles: true })); }
              else cur.click();
              return;
            }
            var c = ctr(cur), cr = cur.getBoundingClientRect(), best = null, bd = 1e12;
            for (var i = 0; i < list.length; i++) {
              var el = list[i]; if (el === cur) continue;
              var e = ctr(el), dx = e.x - c.x, dy = e.y - c.y;
              var ok = (dir === 'left' && dx < -4) || (dir === 'right' && dx > 4) || (dir === 'up' && dy < -4) || (dir === 'down' && dy > 4);
              if (!ok) continue;
              var horiz = (dir === 'left' || dir === 'right');
              var along = horiz ? Math.abs(dx) : Math.abs(dy), perp = horiz ? Math.abs(dy) : Math.abs(dx);
              var r = el.getBoundingClientRect();
              var ov = horiz ? (Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top))
                             : (Math.min(cr.right, r.right) - Math.max(cr.left, r.left));
              var d = along + perp * 2.5 + (ov > 2 ? 0 : 4000);
              if (d < bd) { bd = d; best = el; }
            }
            if (best) setFocus(best);
          } catch (e) {}
        };
        window.__fallbackSet = setFocus;
      }
    } catch (e) {}
  }

  /* ---------- helpers ---------- */
  function focused() { return document.querySelector('.x3f-nav-cur,.x3f-focus,.foc'); }
  function name(el) {
    if (!el) return 'NONE';
    var txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (txt ? '[' + txt + ']' : '');
  }
  function seenVisible(el) {
    if (!el || el.disabled) return false;
    if (!el.offsetParent && el.tagName !== 'BODY') return false;
    var r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity) < 0.05) return false;
      if (cs.pointerEvents === 'none') return false;
      if (n === document.body) break;
    }
    return true;
  }
  var SEL = 'button,select,a[href],input,[role=button]';
  function controlsIn(root) {
    return [].slice.call((root || document).querySelectorAll(SEL)).filter(seenVisible);
  }
  function openOverlay() {
    var o = document.querySelectorAll('.coach.show,.rest.show,.scrim.show,.modal.show');
    for (var i = o.length - 1; i >= 0; i--) {
      var r = o[i].getBoundingClientRect(), cs = getComputedStyle(o[i]);
      if (r.width > 4 && parseFloat(cs.opacity) >= 0.05) return o[i];
    }
    return null;
  }
  /* Two ways to explore, because the two navs give us different leverage.

     On pages driven by x3f-nav.js we can seat the cursor anywhere (X3FNav.set),
     so we do a proper breadth-first walk of the menu graph and reachability is
     EXHAUSTIVE - that is what caught the guided coach having no focusable
     controls at all.

     Game pages are driven by the injected bootstrap, whose cursor is private.
     There we can only press directions and see where we land, so coverage is
     best-effort and "not reached" is advisory, not a failure. Landing on an
     invisible control or escaping an overlay is still a hard failure either way,
     since neither claim depends on coverage. */
  function exhaustive() { return !!(window.X3FNav || window.__x3fSeat); }
  function seat(el) { if (window.X3FNav) X3FNav.set(el); else if (window.__x3fSeat) window.__x3fSeat(el); }

  function walkBFS() {
    var dirs = ['right', 'down', 'left', 'up'], seen = [], dead = [];
    window.__x3fNav('down');
    var start = focused();
    if (!start) return { reach: [], dead: ['nothing focusable at all'] };
    seen.push(start);
    var queue = [start], guard = 0;
    while (queue.length && guard++ < 300) {
      var from = queue.shift();
      for (var d = 0; d < dirs.length; d++) {
        seat(from);
        window.__x3fNav(dirs[d]);
        var after = focused();
        if (!after) { dead.push(name(from) + ' ' + dirs[d] + ' -> NOTHING'); continue; }
        if (seen.indexOf(after) < 0) { seen.push(after); queue.push(after); }
      }
    }
    return { reach: seen, dead: dead };
  }

  function walkSweep() {
    var seen = [], dead = [], plan = [];
    function note() { var f = focused(); if (f && seen.indexOf(f) < 0) seen.push(f); return f; }
    function run(dir, n) { for (var i = 0; i < n; i++) plan.push(dir); }
    for (var pass = 0; pass < 3; pass++) {
      for (var row = 0; row < 6; row++) { run('right', 8); run('down', 1); run('left', 8); run('down', 1); }
      for (var col = 0; col < 6; col++) { run('up', 8); run('right', 1); run('down', 8); run('right', 1); }
    }
    if (plan.length > 700) plan.length = 700;
    window.__x3fNav('down');
    if (!note()) return { reach: [], dead: ['nothing focusable at all'] };
    for (var k = 0; k < plan.length; k++) {
      var before = focused();
      window.__x3fNav(plan[k]);
      if (!note() && before) dead.push(name(before) + ' ' + plan[k] + ' -> NOTHING');
    }
    return { reach: seen, dead: dead };
  }

  function walk() { return exhaustive() ? walkBFS() : walkSweep(); }

  function audit(label) {
    var ov = openOverlay();
    var root = ov || document;
    var expect = controlsIn(root);
    var w = walk();
    var reached = w.reach;
    var missing = expect.filter(function (e) { return reached.indexOf(e) < 0; });
    var strays = reached.filter(function (r) { return !seenVisible(r); });
    var outside = ov ? reached.filter(function (r) { return !ov.contains(r); }) : [];
    OUT.push('--- ' + label + ' ---');
    OUT.push('  overlay: ' + (ov ? (ov.id || ov.className) : 'none') +
             '   expected controls: ' + expect.length + '   reached: ' + reached.length +
             (exhaustive() ? '   [x3f-nav, exhaustive]' : '   [bootstrap nav, sweep]'));
    OUT.push('  ' + (missing.length
      ? (exhaustive() ? 'UNREACHABLE (' : 'not reached, sweep coverage is best-effort (')
        + missing.length + '): ' + missing.map(name).join(', ')
      : 'ok - every visible control is reachable'));
    OUT.push('  ' + (strays.length ? 'FOCUSED INVISIBLE (' + strays.length + '): ' + strays.map(name).join(', ')
                                   : 'ok - nothing invisible is focusable'));
    if (ov) OUT.push('  ' + (outside.length ? 'ESCAPED OVERLAY (' + outside.length + '): ' + outside.map(name).join(', ')
                                            : 'ok - cursor trapped in the overlay'));
    if (w.dead.length) OUT.push('  dead ends: ' + w.dead.slice(0, 3).join(' | '));
  }

  function report() {
    var bad = OUT.filter(function (l) { return /UNREACHABLE|FOCUSED INVISIBLE|ESCAPED/.test(l); }).length;
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b0f18;color:#eaf0fa;font:13px/1.5 Consolas,monospace;padding:18px;white-space:pre-wrap;overflow:auto';
    d.textContent = 'AUDIT ' + (location.pathname.split('/').pop()) + '  ' +
      (bad ? bad + ' PROBLEM LINE(S)' : 'ALL CLEAN') +
      String.fromCharCode(10, 10) + OUT.join(String.fromCharCode(10));
    document.body.appendChild(d);
  }

  window.__audit = { audit: audit, report: report, bootstrap: bootstrap, name: name };
})();
