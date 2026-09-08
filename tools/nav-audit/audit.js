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
    /* The real shell auto-confirms dialogs (onJsAlert -> confirm), and a blocking
       alert in headless stalls the whole run - which is exactly how the routine
       page's achievement alert() wedged this audit for 500 seconds. Match what
       production does. */
    try { window.alert = function () {}; window.confirm = function () { return true; };
          window.prompt = function () { return null; }; } catch (e) {}
    // headless has no compositor: let opacity transitions land instantly, and make
    // scrolling instant too. Hundreds of queued smooth-scroll animations under
    // --virtual-time-budget will eat the entire allowance and the walk never
    // reaches its own report.
    try { var ns=document.createElement('style');
      ns.textContent='*{transition:none!important;animation:none!important}html{scroll-behavior:auto!important}';
      document.head.appendChild(ns); } catch (e) {}
    try {
      var rawInto = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (o) {
        if (o && typeof o === 'object') { o = Object.assign({}, o, { behavior: 'instant' }); }
        return rawInto.call(this, o);
      };
      var rawTo = Element.prototype.scrollTo;
      if (rawTo) Element.prototype.scrollTo = function (o) {
        if (o && typeof o === 'object') { o = Object.assign({}, o, { behavior: 'instant' }); }
        return rawTo.call(this, o);
      };
    } catch (e) {}
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
  /* THIS LIST MUST TRACK x3f-nav.js's SCOPES, INCLUDING [data-nav-scope].

     When it drifted, the audit was wrong in the most misleading direction. The
     Progress page's destructive confirm was given data-nav-scope so it would trap
     the cursor - which x3f-nav honoured and this function did not, so the audit
     believed no overlay was open, expected every control on the page to be
     reachable from inside a trap, and reported 13 UNREACHABLE. The page was
     RIGHT and the audit was wrong, which is worse than the reverse: a false
     alarm teaches people to stop reading the report.

     The positioned requirement mirrors x3f-nav's boxed() and invariant I-11 for
     the same reason it exists there - data-nav-scope is the attribute people
     reach for when marking rails, and a static rail must never be mistaken for a
     modal. */
  function openOverlay() {
    var o = document.querySelectorAll(
      '.coach.show,.rest.show,.scrim.show,.modal.show,[data-nav-scope]');
    var best = null;
    for (var i = 0; i < o.length; i++) {
      var el = o[i];
      var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (r.width <= 4 || r.height <= 4) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (parseFloat(cs.opacity) < 0.05) continue;
      if (el.hasAttribute('data-nav-scope') && cs.position === 'static') continue;
      best = el;                       /* later in document order wins, as before */
    }
    return best;
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
    // one visit per reachable item is enough; 300 was pure waste and pushed the
    // routine page past its virtual-time budget before it could report
    var queue = [start], guard = 0, cap = Math.max(40, document.querySelectorAll('[data-nav]').length + 20);
    while (queue.length && guard++ < cap) {
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

  /* ── does holding a direction actually GO that way? ────────────────────

     Reachability is not the whole of a good remote. A page can be perfectly
     reachable and still feel broken, and the way it feels broken is BOUNCING:
     you press Up, the cursor goes up one, then back down to something you have
     already passed, then up again. It is the single most common symptom of
     spatial navigation being computed in viewport coordinates while something on
     screen is not where the content thinks it is.

     That is not hypothetical. A `position:sticky` top bar sits at viewport y=0
     no matter how far the content beneath it has scrolled, which made it the
     nearest thing "above" the cursor from anywhere on the page: the Progress
     dashboard bounced to its top bar on six of twelve Up presses. Reachability
     alone called that page CLEAN, because every control could still be got to
     eventually - by an unpleasant path nobody would choose.

     So: seat the cursor at the far end, press one direction repeatedly, and
     assert the walk never returns to an element it has just left. A correct page
     visits each thing once on the way past and then stops. */
  function bounceWalk(dir, seatAt) {
    var order = [], seen = [];
    try { if (window.__x3fSeat) window.__x3fSeat(seatAt); else if (window.X3FNav) X3FNav.set(seatAt); }
    catch (e) { return null; }
    for (var i = 0; i < 30; i++) {
      var before = focused();
      try { window.__x3fNav(dir); } catch (e) { break; }
      var after = focused();
      if (!after || after === before) break;
      order.push(after);
      if (seen.indexOf(after) >= 0) {
        /* Returned to somewhere already visited: report the loop, not just the
           fact of it, because "A -> B -> A" names the two elements fighting. */
        var at = seen.indexOf(after);
        return { bounce: seen.slice(at).concat([after]).map(name) };
      }
      seen.push(after);
    }
    return { bounce: null, steps: order.length };
  }

  /* ── is the cursor actually VISIBLE? ───────────────────────────────────

     Reachability says the remote can get there. Bouncing says it gets there
     sensibly. Neither says the user can SEE where it landed, and on a television
     that is the whole game - a focus ring you cannot read from a sofa is the same
     as no focus at all.

     This is not theoretical. x3f-nav injected `[data-nav]:focus{outline:none}` to
     suppress the browser's own ring, and setCursor() both adds the cursor class
     AND calls el.focus() - so at (0,2,0) that rule outranked x3f-ui.css's `.foc`
     at (0,1,0) and cancelled the design system's 10px outline on precisely the
     element it marked. Every page built on x3f-ui.css shipped with no ring, and
     every existing check passed, because every control was still reachable.

     Two ways to draw a ring here and both are legitimate: the design-system pages
     use `outline`, the games use x3f-nav's own `box-shadow` (OWN_RING). Accept
     either, and require it to be big enough to see - the 10-foot guidance in
     x3f-ui.css asks for six pixels minimum. */
  function ringOf(el) {
    if (!el) return null;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return null; }
    if (!cs) return null;
    var w = parseFloat(cs.outlineWidth) || 0;
    if (cs.outlineStyle && cs.outlineStyle !== 'none' && w >= 3) {
      return { kind: 'outline', px: w };
    }
    /* A box-shadow spread reads as a ring too. Pull the widest number out of the
       first shadow rather than parsing the whole grammar. */
    var sh = cs.boxShadow || '';
    if (sh && sh !== 'none') {
      var nums = sh.match(/-?[0-9.]+px/g) || [];
      var widest = 0;
      for (var i = 0; i < nums.length; i++) widest = Math.max(widest, Math.abs(parseFloat(nums[i])));
      if (widest >= 2) return { kind: 'box-shadow', px: widest };
    }
    return null;
  }

  /* ── does the ring stay ON SCREEN while you hold a direction? ──────────

     seenVisible() asks whether an element is displayed - offsetParent, computed
     style, opacity. It never asks whether it is inside the VIEWPORT, and those
     are different questions the moment a page scrolls. A control 600px above the
     top of the screen is perfectly "visible" by every test this file had and
     completely invisible to a person.

     That gap hid a critical defect. x3f-nav's scrollPage() moves the page without
     moving the cursor, so on the Progress dashboard - ~10,000px of achievement
     wall below the last control - holding Down scrolled the ring to top=-614 and
     left it there as the live target: OK re-filtered the badge wall with no ring
     anywhere on screen, and the next Down jumped INTO the sticky header. The BFS
     could never see it either, because it only issues presses that change the
     cursor, and these presses only changed the scroll.

     So: hold a direction like a person does, and after every single press assert
     the ring is still somewhere a person could look at. */
  function ringOnScreenWalk(dir, seatAt) {
    try { if (window.__x3fSeat) window.__x3fSeat(seatAt); else if (window.X3FNav) X3FNav.set(seatAt); }
    catch (e) { return null; }
    for (var i = 0; i < 40; i++) {
      try { window.__x3fNav(dir); } catch (e) { break; }
      var el = focused();
      if (!el) continue;
      var r = el.getBoundingClientRect();
      var h = window.innerHeight || 0;
      if (r.bottom <= 1 || r.top >= h - 1) {
        return { el: name(el), press: i + 1, top: Math.round(r.top) };
      }
    }
    return null;
  }

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

    /* Can the user SEE the cursor? Sampled on the element the walk actually
       focused, not on a guess about which selector should apply. */
    if (exhaustive()) {
      var lit = focused();
      var ring = ringOf(lit);
      if (lit) {
        OUT.push('  ' + (ring
          ? 'ok - the cursor is drawn (' + ring.kind + ' ' + Math.round(ring.px) + 'px)'
          : 'NO FOCUS RING: ' + name(lit) + ' carries the cursor class but computes no '
            + 'visible outline or box-shadow'));
      }
    }

    /* Only meaningful with the real engine; the bootstrap fallback keeps its
       cursor private and sweeps rather than walks. */
    if (exhaustive() && expect.length > 2) {
      var vis = expect.filter(seenVisible);
      if (vis.length > 2) {
        var up = bounceWalk('up', vis[vis.length - 1]);
        var down = bounceWalk('down', vis[0]);
        var b = (up && up.bounce) || (down && down.bounce);
        OUT.push('  ' + (b ? 'BOUNCES (' + ((up && up.bounce) ? 'up' : 'down') + '): ' + b.join(' -> ')
                           : 'ok - Up and Down walk without doubling back'));

        var lost = ringOnScreenWalk('down', vis[0]) || ringOnScreenWalk('up', vis[vis.length - 1]);
        OUT.push('  ' + (lost
          ? 'RING OFF SCREEN: after ' + lost.press + ' presses the cursor is ' + lost.el
            + ' at top=' + lost.top + ', outside the viewport, and OK would still press it'
          : 'ok - the ring stays on screen while a direction is held'));
      }
    }
  }

  function report() {
    var bad = OUT.filter(function (l) { return /UNREACHABLE|FOCUSED INVISIBLE|ESCAPED|BOUNCES|NO FOCUS RING|RING OFF SCREEN/.test(l); }).length;
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b0f18;color:#eaf0fa;font:13px/1.5 Consolas,monospace;padding:18px;white-space:pre-wrap;overflow:auto';
    d.textContent = 'AUDIT ' + (location.pathname.split('/').pop()) + '  ' +
      (bad ? bad + ' PROBLEM LINE(S)' : 'ALL CLEAN') +
      String.fromCharCode(10, 10) + OUT.join(String.fromCharCode(10));
    document.body.appendChild(d);
  }

  window.__audit = { audit: audit, report: report, bootstrap: bootstrap, name: name };
})();
