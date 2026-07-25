/* X3F NAV - shared menu navigation for keyboard, TV remote D-pad and gamepad.
   Drop this on any page and mark the focusable things with data-nav.

   Why it exists: browsers (and TV Bro on Android TV) do their own guessy
   spatial focus, which happily jumps out of a card grid into the header bar.
   This walks the menu using the REAL on-screen geometry of the items, so
   Left/Right always land on the item visually beside the one you are on, and
   Up/Down move a row at a time. Hovering an item moves the cursor there too,
   so "hover a card, then press Left" continues from that card. */
(function () {
  "use strict";

  /* A page can set window.X3FNAV_CLASS before loading this file to use its own
     focus styling (the TV launcher does: it already has a .foc look). */
  var CUR = window.X3FNAV_CLASS || 'x3f-nav-cur';
  var OWN_RING = !window.X3FNAV_CLASS;
  var items = [], cursor = null, engaged = false, justScoped = false;

  /* ---------- styling (injected so every page gets the same focus ring) ---------- */
  var css = document.createElement('style');
  css.textContent =
    '[data-nav]{scroll-margin:26px}' +
    '[data-nav]:focus{outline:none}' +
    (OWN_RING ? '.' + CUR + '{position:relative;z-index:2;' +
      'box-shadow:0 0 0 2px var(--navring,#2ff0b0),0 12px 34px rgba(0,0,0,.45)!important;' +
      'border-color:var(--navring,#2ff0b0)!important}' : '') +
    '@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}';
  (document.head || document.documentElement).appendChild(css);

  /* ---------- item collection ---------- */
  function visible(el) {
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
    if (!el.offsetParent && el.tagName !== 'BODY') return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    /* Overlays here (the rest timer, the session summary) stay in the layout and
       fade with opacity, so they keep a box and an offsetParent while invisible.
       Without this the D-pad would happily focus - and OK would press - buttons
       nobody can see. */
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      if (parseFloat(cs.opacity) < 0.05) return false;
      if (cs.pointerEvents === 'none') return false;
      if (n === document.body) break;
    }
    return true;
  }
  /* ---------- modal scoping ----------
     A full-screen overlay must trap the cursor. Without this the remote happily
     walks the page UNDERNEATH an open overlay: nothing appears to move, and OK
     presses a control you cannot see. Topmost open overlay wins. */
  var SCOPES = '.coach.show,.rest.show,.scrim.show,.modal.show,[data-nav-scope]';
  var scope = null;
  function boxed(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) >= 0.05;
  }
  function scopeRoot() {
    var open = document.querySelectorAll(SCOPES);
    for (var i = open.length - 1; i >= 0; i--) if (boxed(open[i])) return open[i];
    return document;
  }

  /* visible() walks ancestors calling getComputedStyle, so a full rebuild costs
     one style recalc per item. That is fine once per keypress and wasteful when
     something asks repeatedly, so the item list is reused for a few tens of
     milliseconds. The SCOPE is still checked every time - if an overlay opened we
     rebuild immediately, because getting that wrong is a real bug and 50ms of
     staleness in a list of buttons is not. */
  var lastBuild = 0;
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  function refresh() {
    var root = scopeRoot();
    var t = nowMs();
    if (root === scope && items.length && t - lastBuild < 50) return items;
    lastBuild = t;
    items = [].slice.call(root.querySelectorAll('[data-nav]')).filter(visible);
    // The cursor left the scope (an overlay opened over it, or it was hidden).
    // Drop the ring with it, or it stays lit on something we no longer control -
    // two focus rings on screen, one of them a lie.
    if (cursor && items.indexOf(cursor) < 0) { cursor.classList.remove(CUR); cursor = null; }
    if (root !== scope) {
      scope = root;
      // An overlay just opened or closed. Land somewhere visible inside the new
      // scope, but only once the user is actually driving with keys/remote -
      // a mouse user should not get a focus ring thrown at them.
      if (!cursor && items.length && (engaged || window.__x3fNative)) {
        justScoped = true;
        setCursor(first());
      }
    }
    return items;
  }
  function mid(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  /* ---------- cursor ---------- */
  function setCursor(el, scroll) {
    if (!el) return;
    if (cursor && cursor !== el) cursor.classList.remove(CUR);
    cursor = el;
    el.classList.add(CUR);
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    if (scroll !== false) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }); }
      catch (e) { el.scrollIntoView(); }
    }
  }
  /* Preferred landing spot inside the CURRENT scope. Assumes items are fresh -
     it must not call refresh(), which calls this. */
  function first() {
    if (!items.length) return null;
    var pref = items.filter(function (i) { return i.hasAttribute('data-nav-first'); });
    return pref[0] || items[0];
  }

  /* ---------- geometric move ---------- */
  function move(dir) {
    justScoped = false;
    refresh();
    if (!items.length) return;
    // an overlay just took the cursor - that keypress was the landing, not a move
    if (justScoped) return;
    if (!cursor) { setCursor(first()); return; }

    var horiz = (dir === 'left' || dir === 'right');
    var cr = cursor.getBoundingClientRect(), c = mid(cr);
    var best = null, bestScore = Infinity;

    items.forEach(function (el) {
      if (el === cursor) return;
      var r = el.getBoundingClientRect(), m = mid(r);
      var fwd = dir === 'left' ? c.x - m.x : dir === 'right' ? m.x - c.x
              : dir === 'up' ? c.y - m.y : m.y - c.y;
      if (fwd < 4) return;                              // not in that direction
      // how much the two boxes share the perpendicular axis (same row / column)
      var overlap = horiz
        ? Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top)
        : Math.min(cr.right, r.right) - Math.max(cr.left, r.left);
      var cross = horiz ? Math.abs(m.y - c.y) : Math.abs(m.x - c.x);
      var score = fwd + cross * 2.2 + (overlap > 2 ? 0 : 4000);
      if (score < bestScore) { bestScore = score; best = el; }
    });

    // Nothing visually that way. On a remote there is no wheel and no
    // scrollbar, so if the page still has content below (or above) that way,
    // scroll it rather than teleporting the cursor - otherwise long pages like
    // Progress are unreachable.
    if (!best && (dir === 'up' || dir === 'down') && scrollPage(dir)) return;

    // Still nothing: fall back to reading order so the cursor wraps along the
    // grid instead of escaping into the page chrome.
    if (!best) {
      var i = items.indexOf(cursor);
      if (dir === 'right' || dir === 'down') best = items[i + 1] || items[0];
      else best = items[i - 1] || items[items.length - 1];
    }
    setCursor(best);
  }

  /* nearest scrollable ancestor of the cursor, else the document */
  function scrollHost(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2) return n;
    }
    var d = document.scrollingElement || document.documentElement;
    return (d.scrollHeight > d.clientHeight + 2) ? d : null;
  }
  function scrollPage(dir) {
    var h = scrollHost(cursor); if (!h) return false;
    var view = (h === document.scrollingElement || h === document.documentElement)
      ? innerHeight : h.clientHeight;
    var max = h.scrollHeight - h.clientHeight;
    var at = h.scrollTop;
    if ((dir === 'down' && at >= max - 2) || (dir === 'up' && at <= 2)) return false;
    var to = Math.max(0, Math.min(max, at + (dir === 'down' ? 1 : -1) * view * 0.75));
    try { h.scrollTo({ top: to, behavior: 'smooth' }); } catch (e) { h.scrollTop = to; }
    return true;
  }

  function activate() {
    if (!cursor) { setCursor(first()); return; }
    if (cursor.tagName === 'SELECT') { try { cursor.click(); } catch (e) {} return; }
    cursor.click();
  }
  function stepSelect(el, d, wrap) {
    var n = el.options.length; if (!n) return;
    var i = wrap ? (el.selectedIndex + d + n) % n
                 : Math.max(0, Math.min(n - 1, el.selectedIndex + d));
    if (i === el.selectedIndex) return;
    el.selectedIndex = i;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function back() {
    var b = document.querySelector('[data-nav-back]');
    if (b) { b.click(); return; }
    if (history.length > 1) history.back(); else location.href = 'index.html';
  }

  /* ---------- input ---------- */
  function typing(e) {
    var t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }
  function handle(dir) { engaged = true; move(dir); }

  addEventListener('keydown', function (e) {
    if (e.defaultPrevented || typing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key, d = null;
    if (k === 'ArrowLeft') d = 'left'; else if (k === 'ArrowRight') d = 'right';
    else if (k === 'ArrowUp') d = 'up'; else if (k === 'ArrowDown') d = 'down';

    if (d) {
      // On a <select> the vertical axis belongs to the option list, not the menu.
      if (cursor && cursor.tagName === 'SELECT' && (d === 'up' || d === 'down')) {
        stepSelect(cursor, d === 'down' ? 1 : -1); e.preventDefault(); return;
      }
      handle(d); e.preventDefault(); return;
    }
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      if (cursor && cursor.tagName === 'SELECT') return;   // let the browser open it
      if (cursor) { activate(); e.preventDefault(); }
      return;
    }
    if (k === 'Escape' || k === 'Backspace' || k === 'BrowserBack') { back(); e.preventDefault(); }
  });

  // Pointer hover owns the cursor, so keys continue from whatever you last touched.
  addEventListener('pointerover', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-nav]');
    if (el && el !== cursor && visible(el)) {
      if (cursor) cursor.classList.remove(CUR);
      cursor = el; el.classList.add(CUR);
    }
  }, { passive: true });
  addEventListener('focusin', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-nav]');
    if (el && el !== cursor) { if (cursor) cursor.classList.remove(CUR); cursor = el; el.classList.add(CUR); }
  });

  /* ---------- gamepad D-pad + left stick ---------- */
  var padOn = false, held = {}, nextAt = {};
  function pads() { try { return navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return []; } }
  function pump(now) {
    var list = pads(), any = false;
    for (var p = 0; p < list.length; p++) {
      var g = list[p]; if (!g) continue; any = true;
      var ax = g.axes[0] || 0, ay = g.axes[1] || 0, b = g.buttons;
      var dirs = {
        left: (b[14] && b[14].pressed) || ax < -0.55,
        right: (b[15] && b[15].pressed) || ax > 0.55,
        up: (b[12] && b[12].pressed) || ay < -0.55,
        down: (b[13] && b[13].pressed) || ay > 0.55
      };
      Object.keys(dirs).forEach(function (d) {
        if (!dirs[d]) { held[d] = false; return; }
        if (!held[d]) { held[d] = true; nextAt[d] = now + 380; handle(d); }
        else if (now >= nextAt[d]) { nextAt[d] = now + 130; handle(d); }
      });
      var ok = (b[0] && b[0].pressed), no = (b[1] && b[1].pressed);
      if (ok && !held.ok) { held.ok = true; activate(); } else if (!ok) held.ok = false;
      if (no && !held.no) { held.no = true; back(); } else if (!no) held.no = false;
    }
    if (any || padOn) requestAnimationFrame(pump);
  }
  addEventListener('gamepadconnected', function () { if (!padOn) { padOn = true; requestAnimationFrame(pump); } });
  if (pads().length) { padOn = true; requestAnimationFrame(pump); }

  addEventListener('resize', function () { refresh(); });

  /* ---------- Android TV shell bridge (x3f-tv) ----------
     In the TV app the native side swallows the D-pad and calls window.__x3fNav
     instead of dispatching key events, and its injected bootstrap installs a
     fallback nav ONLY if the page hasn't defined one. Claiming it here means the
     remote drives this nav - so the TV gets the same geometry-aware, same-row
     movement as the browser, with one focus ring instead of two.
     On a remote, opening a native <select> dropdown is a dead end, so OK cycles
     the value in place instead. */
  if (!window.__x3fNav) {
    window.__x3fPageNav = true;      // so tooling can tell whose nav is driving
    window.__x3fNav = function (dir) {
      engaged = true;
      var c = cursor;
      /* On a remote, OK cycles a <select> in place (opening the native dropdown
         is a dead end) and the arrows are left alone for moving and scrolling.
         Do NOT make Up/Down step the value here: on a page whose only focusable
         control is a select - Progress - that would trap the D-pad on the filter
         and the page could never be scrolled. The browser keydown path above
         still steps selects vertically, which is what a keyboard user expects. */
      if (dir === 'enter') {
        if (c && c.tagName === 'SELECT') stepSelect(c, 1, true); else activate();
        return;
      }
      move(dir);
    };
  }

  window.X3FNav = {
    refresh: refresh,
    focusFirst: function () { refresh(); setCursor(first()); },
    set: setCursor,
    current: function () { return cursor; },
    engaged: function () { return engaged; }
  };
})();
