/* X3F NAV - one D-pad model for the TV remote, the keyboard and a gamepad.
   Drop this on any page and mark the focusable things with data-nav.

   Why it exists: browsers (and TV Bro on Android TV) do their own guessy
   spatial focus, which happily jumps out of a card grid into the header bar.
   This walks the menu using the REAL on-screen geometry of the items.

   ─────────────────────────────────────────────────────────────────────────
   THE ONE RULE THIS FILE EXISTS TO ENFORCE  (OVERHAUL-PLAN §5 invariant 8)
   ─────────────────────────────────────────────────────────────────────────

   Left/Right may only land on something that actually shares your ROW.
   Up/Down may only land on something that actually shares your COLUMN.

   That used to be a `+4000` term inside the score, which is a tie-breaker, not
   a rule: when the row ran out, every off-row item got the same penalty and was
   then ranked against the others, so a move ALWAYS happened and it happened
   diagonally. Measured on the shipped launcher: Right off the last card of the
   top row landed on the Bluetooth chip in the corner; Right again landed on the
   music button at the bottom of the screen. Two presses, two full crossings of
   a 55-inch panel, from one arrow key. The project believed this was fixed in
   v0.7; it was only weighted.

   Overlap is a GATE now. A candidate that does not overlap is not scored at
   all. When nothing in your row lies that way, the row has ended, and the
   correct answer on a remote is that the ring stays where it is. Pressing Right
   off the end of a row does nothing, loudly (an `x3f-nav-edge` event the page
   can bump on), instead of teleporting.

   The old reading-order wrap (`items[i+1] || items[0]`) is gone with it - it is
   what produced "top-right chip -> Up -> music button at the bottom". A grid
   that genuinely wants line-wrapping opts in with data-nav-wrap, so wrapping is
   something a layout declares rather than something the nav guesses.

   ─────────────────────────────────────────────────────────────────────────
   THE ROW MODEL, WHICH IS WHAT A LEANBACK HOME NEEDS
   ─────────────────────────────────────────────────────────────────────────

   Mark each horizontal rail with data-nav-row (put it on the scrolling element
   itself - the .x3f-rail - so this file can scroll it). Then:

     * Left/Right are CONFINED to the rail. There is nothing off-row to escape
       to, so the failure above is structurally impossible, not merely unlikely.
     * Up/Down treat each rail as ONE band, whatever it holds. Six rail rects
       plus one rail's cards is ~30 rect reads per press instead of 120; at the
       measured ~0.024 ms per item per press on a desktop core, and 5-10x that
       on a TV SoC, that is the difference between a responsive home screen and
       20 ms of input lag before anything paints.
     * Each rail remembers the card you left it on and lands you back there.
       This is the thing that makes a TV UI feel native rather than merely
       correct (tv-ux-research §5.6), and it costs one object per rail.

   Give the attribute a value - data-nav-row="today" - and the memory survives
   the rail being re-rendered from scratch.

   data-nav-row means ONE HORIZONTAL LINE. Do not put it on a card grid that
   wraps: Up/Down treat the whole row as a single band, so a wrapped grid marked
   as a row could never be traversed vertically. A wrapping grid needs no
   attribute at all - the overlap gate already confines Left/Right to the visual
   line - and it can add data-nav-wrap if it wants the end of a line to continue
   onto the next one.

   ─────────────────────────────────────────────────────────────────────────
   FOCUS SURVIVES RE-RENDERS
   ─────────────────────────────────────────────────────────────────────────

   Any in-place re-render used to throw the cursor to the top of the page: the
   old refresh() dropped the cursor when it left the item list but only re-
   seated it if the SCOPE had changed, so the next arrow press fell through to
   data-nav-first. That is why changing any <select> on Library sent the ring
   back to the header link, and why filtering the achievement wall at the bottom
   of Progress scrolled the whole page back to the top.

   The cursor is now restored by IDENTITY, in this order: data-nav-id (or id),
   then (row, remembered column), then whatever is now nearest to where it was
   in page space. Restores never scroll, so the page does not jump underneath
   someone whose place we just kept.

   ─────────────────────────────────────────────────────────────────────────
   CONTRACT WITH OTHER FILES  (audit §5 - each of these has broken once)
   ─────────────────────────────────────────────────────────────────────────

   I-1  This file must stay a synchronous, parse-time <script>. The shell's
        BOOTSTRAP installs its own inferior nav `if(!window.__x3fNav)`; we claim
        that global at eval time. Defer this file and the TV gets two focus
        rings with the wrong one driving.
   I-2  window.__x3fNav(dir) takes 'left'|'right'|'up'|'down'|'enter' and must
        never throw - evaluateJavascript swallows the error and the remote just
        silently stops working.
   I-3  window.__x3fPageNav must keep being set; the nav audit switches between
        an exhaustive walk and a best-effort sweep on it.
   I-4  X3FNav.refresh / focusFirst / set / current keep their signatures.
   I-5  The ring class must remain findable as .x3f-nav-cur, .x3f-focus or .foc.
   I-6  The overlay scope selector keeps covering .coach.show, .rest.show,
        .scrim.show, .modal.show.
   I-7  visible() keeps walking ancestors for opacity and pointer-events. Arena
        shipped with the D-pad pressing buttons on faded-out mode tabs.
   I-8  On the remote, Up/Down must never be consumed by a <select>'s value.
   I-9  Never load this into a game; its Space handling fights Space-to-pull.
*/
(function () {
  "use strict";

  /* ---------- tuning, all named (they used to be bare numerals in one line) ---------- */
  var MIN_ADVANCE = 4;     /* px a candidate's centre must lead by to count as "that way" */
  var MIN_OVERLAP = 2;     /* px of shared perpendicular extent that counts as the same row/column */
  var CROSS_W     = 2.2;   /* what perpendicular offset costs relative to distance travelled */
  /* How much further an ALIGNED band may be and still beat an offset one on
     Up/Down. Unbounded priority sounds right and is not: on the Library every
     band picker is a narrow control in the same right-hand column, so the
     pickers all overlap each other while the full-width game links below them
     overlap none of them. "Aligned wins at any distance" therefore walked the
     cursor down the column of pickers and skipped all 28 game links. Bounded,
     a much nearer offset band wins - which is what a person means by "down". */
  var ALIGN_REACH = 1.5;
  var CACHE_MS    = 50;    /* coalesce repeated refresh() inside one keypress */
  var FAST_MS     = 200;   /* two moves closer together than this means a held key */
  var PRESS_MS    = 120;   /* how long .x3f-press stays on after OK */
  var PAD_DELAY   = 380, PAD_REPEAT = 130, PAD_DEAD = 0.55;

  /* A page can set window.X3FNAV_CLASS before loading this file to use its own
     focus styling (x3f-ui.css owns the ring as .foc, so the new shell does). */
  var CUR = window.X3FNAV_CLASS || 'x3f-nav-cur';
  var OWN_RING = !window.X3FNAV_CLASS;
  var RM = window.matchMedia ? matchMedia('(prefers-reduced-motion:reduce)') : null;

  /* ---------- state ---------- */
  var items = [];        /* visible [data-nav] in the current scope, DOM order */
  var itemRow = [];      /* parallel: the [data-nav-row] each item belongs to, or null */
  var rows = [];         /* the distinct rows, DOM order */
  var rowLists = [];     /* parallel to rows: that row's items */
  var cursor = null, engaged = false, justScoped = false;
  var scope = null, lastBuild = 0, dirty = true, gen = 0;
  var lastSeat = null, docSeat = null, rowMem = {}, routeMem = {}, stack = [];
  var lastNavAt = 0, fastRepeat = false;

  /* ---------- styling (injected so every page gets the same focus ring) ---------- */
  var css = document.createElement('style');
  css.textContent =
    /* Was a hardcoded 26px. Every size in the new UI is relative so the design
       is identical at 960, 1280 or 1920 CSS px; a raw px here would be half the
       intended gap on a TV reporting a 960-wide viewport. */
    '[data-nav]{scroll-margin:var(--x3f-navmargin,1.5rem)}' +
    '[data-nav]:focus{outline:none}' +
    /* A rail scrolls the focused card to a lead margin rather than flush to the
       edge, so the next card peeks out and the row reads as "there is more".
       Set on the row because that is the scroll container. */
    '[data-nav-row]{scroll-padding:0 var(--x3f-railpad,4rem)}' +
    (OWN_RING ? '.' + CUR + '{position:relative;z-index:2;' +
      'box-shadow:0 0 0 2px var(--navring,#2ff0b0),0 12px 34px rgba(0,0,0,.45)!important;' +
      'border-color:var(--navring,#2ff0b0)!important}' : '') +
    '@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}';
  (document.head || document.documentElement).appendChild(css);

  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function mid(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  /* distance from a point to an interval, 0 when it is inside it. Using the
     interval instead of the centre stops a full-width rail from being "far away
     in x" just because its midpoint is. */
  function gapTo(v, lo, hi) { return v < lo ? lo - v : v > hi ? v - hi : 0; }

  /* ---------- visibility ---------- */

  /* The ancestor walk is the expensive half of a rebuild - one getComputedStyle
     per ancestor per item, measured at 6.9 ms for 480 items on a desktop core.
     In a row layout every card in a rail shares its ancestors, so cache each
     verdict for the current generation and the second card costs one lookup. */
  function ancestorsOk(el) {
    var chain = [], n, ok = true;
    for (n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.__x3fVisGen === gen) { ok = n.__x3fVis; break; }
      chain.push(n);
      var cs = getComputedStyle(n);
      /* Overlays here (the rest timer, the session summary) stay in the layout
         and fade with opacity, so they keep a box and an offsetParent while
         invisible. Without this the D-pad would happily focus - and OK would
         press - buttons nobody can see. */
      if (cs.visibility === 'hidden' || cs.display === 'none' ||
          parseFloat(cs.opacity) < 0.05 || cs.pointerEvents === 'none') { ok = false; break; }
      if (n === document.body) break;
    }
    for (var i = 0; i < chain.length; i++) { chain[i].__x3fVisGen = gen; chain[i].__x3fVis = ok; }
    return ok;
  }

  function visible(el) {
    if (el.disabled || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) return false;
    /* This test used to be `!el.offsetParent`, and offsetParent is null for
       EVERY position:fixed element - so a fixed top bar or side rail could be
       marked data-nav, look focusable, carry a hover state, and be permanently
       unreachable by the remote. getClientRects() asks the honest question:
       does this thing have boxes. */
    if (!el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    return ancestorsOk(el);
  }
  /* visible() reads the per-generation cache, so anything asking outside a
     rebuild has to invalidate it first. */
  function visibleNow(el) { gen++; return visible(el); }

  /* ---------- modal scoping ----------
     A full-screen overlay must trap the cursor. Without this the remote happily
     walks the page UNDERNEATH an open overlay: nothing appears to move, and OK
     presses a control you cannot see. */
  var SCOPES = '.coach.show,.rest.show,.scrim.show,.modal.show,[data-nav-scope]';

  function boxed(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    /* A leanback home wants to mark its rails as containers and data-nav-scope
       is the attribute people reach for - but it is wired into the modal scope
       list, so a permanently-present rail later in the DOM than an open sheet
       would win the scope and break every modal on the page. An overlay is
       always positioned (invariant I-11); a rail is static. Requiring a
       positioned box keeps "mark the rows" from swallowing the modals. Rows have
       their own attribute, data-nav-row. */
    if (cs.position === 'static') return false;
    /* boxed() used to be weaker than visible() - no ancestor walk - so a scope
       could be accepted whose every child visible() then rejected: empty item
       list, cleared cursor, no ring on screen and a completely dead remote. */
    return ancestorsOk(el);
  }

  function scopeRoot() {
    var open = document.querySelectorAll(SCOPES);
    var best = null, bestZ = -Infinity;
    for (var i = 0; i < open.length; i++) {
      var el = open[i];
      if (!boxed(el)) continue;
      /* "Topmost" used to mean "last in document order", which is not what
         paints on top. Consult z-index first; on a tie the later element wins,
         which is what stacking does when neither declares one. */
      var z = parseInt(getComputedStyle(el).zIndex, 10);
      if (isNaN(z)) z = 0;
      if (z >= bestZ) { bestZ = z; best = el; }
    }
    return best || document;
  }
  function inScope(el) { var r = scopeRoot(); return r === document || r.contains(el); }

  /* ---------- identity, so focus can survive a re-render ---------- */
  function seatKey(el) { return (el && (el.getAttribute('data-nav-id') || el.id)) || ''; }
  function rowKey(row) {
    if (!row) return '';
    var k = row.getAttribute('data-nav-row');
    if (k) return k;
    if (row.id) return '#' + row.id;
    var i = rows.indexOf(row);
    return i < 0 ? '' : '@' + i;      /* positional, so it does not survive a re-render */
  }
  function rowByKey(key) {
    for (var i = 0; i < rows.length; i++) if (rowKey(rows[i]) === key) return rows[i];
    return null;
  }
  function rowOf(el) {
    if (!el) return null;
    var i = items.indexOf(el);
    if (i >= 0) return itemRow[i];
    return el.closest ? el.closest('[data-nav-row]') : null;
  }
  function rowItems(row) { var i = rows.indexOf(row); return i < 0 ? [] : rowLists[i]; }

  function snapshot(el) {
    if (!el) return null;
    var row = rowOf(el), list = row ? rowItems(row) : [];
    var m = mid(el.getBoundingClientRect());
    return {
      key: seatKey(el),
      row: rowKey(row),
      idx: list.indexOf(el),
      /* page space, not viewport space: the page may have scrolled between the
         seat and the restore, and "where it was on the page" is the stable one. */
      x: m.x + (window.scrollX || window.pageXOffset || 0),
      y: m.y + (window.scrollY || window.pageYOffset || 0)
    };
  }

  function findSeat(s) {
    if (!s || !items.length) return null;
    var i;
    if (s.key) for (i = 0; i < items.length; i++) if (seatKey(items[i]) === s.key) return items[i];
    if (s.row) {
      var list = rowItems(rowByKey(s.row));
      if (list.length && s.idx >= 0) return list[Math.min(list.length - 1, s.idx)];
    }
    /* Last resort: whatever now sits closest to where the cursor was. Still the
       user's place on the page, which data-nav-first emphatically is not. */
    var sx = window.scrollX || window.pageXOffset || 0, sy = window.scrollY || window.pageYOffset || 0;
    var best = null, bestD = Infinity;
    for (i = 0; i < items.length; i++) {
      var m = mid(items[i].getBoundingClientRect());
      var d = Math.abs(m.x + sx - s.x) + Math.abs(m.y + sy - s.y);
      if (d < bestD) { bestD = d; best = items[i]; }
    }
    return best;
  }
  function rememberScope(root) {
    if (!root || !lastSeat) return;
    if (root === document) docSeat = lastSeat; else root.__x3fSeatMem = lastSeat;
  }
  function recallScope(root) {
    var s = (root === document) ? docSeat : root.__x3fSeatMem;
    return s ? findSeat(s) : null;
  }

  /* ---------- item collection ---------- */
  var NATIVE_FOCUS = /^(BUTTON|INPUT|SELECT|TEXTAREA)$/;
  function nativelyFocusable(el) {
    if (NATIVE_FOCUS.test(el.tagName)) return true;
    return (el.tagName === 'A' || el.tagName === 'AREA') && el.hasAttribute('href');
  }

  function build(root) {
    var nodes = root.querySelectorAll('[data-nav]');
    var next = [], nextRow = [], nextRows = [], nextLists = [], needTab = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var row = el.closest ? el.closest('[data-nav-row]') : null;
      if (row && root !== document && !root.contains(row)) row = null;
      next.push(el);
      nextRow.push(row);
      if (row) {
        var ri = nextRows.indexOf(row);
        if (ri < 0) { ri = nextRows.length; nextRows.push(row); nextLists.push([]); }
        nextLists[ri].push(el);
      }
      /* One source of truth for focus. An element with no tabindex cannot take
         DOM focus at all, so .focus() is a silent no-op and activeElement
         disagrees with the ring - routine.html's .day divs shipped exactly like
         that. Collected here and written after the loop so we never interleave a
         DOM write with the measuring reads. */
      if (!el.hasAttribute('tabindex') && !nativelyFocusable(el)) needTab.push(el);
    }
    for (var j = 0; j < needTab.length; j++) needTab[j].setAttribute('tabindex', '-1');
    items = next; itemRow = nextRow; rows = nextRows; rowLists = nextLists;
  }

  function refresh(force) {
    gen++;
    var root = scopeRoot();
    var t = nowMs();
    var scoped = (root !== scope);

    /* The old cache returned early BEFORE validating the cursor, so for up to
       50 ms after a re-render move() could measure a detached node -
       getBoundingClientRect() on one returns all zeros, every candidate is then
       scored against the viewport origin, and the ring teleports to the top-left
       of the screen. And because X3FNav.refresh() shared the same cache, the one
       hook a page has for "the DOM changed" could be a silent no-op: the
       launcher already contains a dead second call. The cache now survives only
       when genuinely nothing has changed. */
    if (!force && !dirty && !scoped && items.length && (t - lastBuild) < CACHE_MS &&
        (!cursor || (cursor.isConnected !== false && items.indexOf(cursor) >= 0))) return items;

    lastBuild = t; dirty = false;
    var had = cursor;
    build(root);

    /* The cursor left the item list (an overlay opened over it, it was hidden,
       or the node was replaced). Drop the ring with it, or it stays lit on
       something we no longer control - two rings on screen, one of them a lie. */
    if (cursor && items.indexOf(cursor) < 0) { cursor.classList.remove(CUR); cursor = null; }

    /* Note what deliberately does NOT happen here: an overlay whose every
       control is invisible leaves items empty, and we stay scoped to it anyway
       rather than falling back to the page. An overlay must trap the cursor
       (invariant I-12, and one of the audit's three hard gates), so escaping it
       would trade a reported failure for a silent one. BACK is the exit, and
       back() now genuinely closes the overlay instead of navigating off it. */
    if (scoped) {
      rememberScope(scope);
      scope = root;
      /* An overlay just opened or closed. Land somewhere visible inside the new
         scope, but only once the user is actually driving with keys or the
         remote - a mouse user should not get a focus ring thrown at them. */
      if (!cursor && items.length && (engaged || window.__x3fNative)) {
        justScoped = true;
        var back = recallScope(root);
        if (back) setCursor(back, false); else setCursor(first());
      }
    } else if (had && !cursor && items.length) {
      /* Same scope, but the node the ring was on is gone: a list re-rendered
         under us. Put the user back where they were instead of at
         data-nav-first, and do it without scrolling so the page does not jump. */
      var again = findSeat(lastSeat);
      if (again) setCursor(again, false);
    }
    return items;
  }

  /* ---------- cursor ---------- */
  function emit(target, name, detail) {
    if (!target || !target.dispatchEvent) return false;
    try {
      var ev = new CustomEvent(name, { bubbles: true, cancelable: true, detail: detail });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    } catch (e) { return false; }
  }

  function reveal(el) {
    /* Holding the D-pad down fires a move every 130 ms. Queueing a smooth scroll
       per press means the rail is animating towards a position three cards
       stale, on a SoC that cannot afford the animation in the first place. Under
       repeat we jump; on a single press we glide. */
    var fast = fastRepeat || (RM && RM.matches);
    fastRepeat = false;
    var how = { behavior: fast ? 'instant' : 'smooth', block: 'nearest', inline: 'nearest' };
    try { el.scrollIntoView(how); }
    catch (e) {
      try { el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' }); }
      catch (e2) { try { el.scrollIntoView(false); } catch (e3) {} }
    }
  }

  function setCursor(el, scroll) {
    if (!el) return;
    var prev = cursor;
    if (cursor && cursor !== el) cursor.classList.remove(CUR);
    /* assigned before focus() so the focusin listener below sees itself and
       does not recurse */
    cursor = el;
    el.classList.add(CUR);
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    lastSeat = snapshot(el);
    var row = rowOf(el);
    if (row) rowMem[rowKey(row)] = lastSeat;
    if (scroll !== false) reveal(el); else fastRepeat = false;
    if (prev !== el) emit(el, 'x3f-nav-move', { el: el, prev: prev, row: row });
  }

  /* Preferred landing spot inside the CURRENT scope. Assumes items are fresh -
     it must not call refresh(), which calls this. */
  function first() {
    if (!items.length) return null;
    for (var i = 0; i < items.length; i++) if (items[i].hasAttribute('data-nav-first')) return items[i];
    return items[0];
  }

  /* Coming back to a rail lands on the card you left it on, not on its first
     card. That single behaviour is most of what makes a TV UI feel native. */
  function enterRow(row, x) {
    var list = rowItems(row);
    if (!list.length) return null;
    var mem = rowMem[rowKey(row)], i;
    if (mem) {
      if (mem.key) for (i = 0; i < list.length; i++) if (seatKey(list[i]) === mem.key) return list[i];
      if (mem.idx >= 0 && mem.idx < list.length) return list[mem.idx];
    }
    var best = list[0], bestD = Infinity;
    for (i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      var d = gapTo(x, r.left, r.right);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    return best;
  }

  function edge(dir) {
    /* Nothing that way. Say so, so a rail can bump (transform only, please) and
       the page knows the user is pressing against a boundary. */
    emit(cursor, 'x3f-nav-edge', { el: cursor, dir: dir, row: rowOf(cursor) });
  }

  /* ---------- geometric move ---------- */

  function moveH(dir) {
    var cr = cursor.getBoundingClientRect(), c = mid(cr);
    var row = rowOf(cursor);
    /* Inside a rail the search never leaves the rail. Outside one the overlap
       gate below does the same job by geometry. */
    var pool = row ? rowItems(row) : items;
    var best = null, bestScore = Infinity;
    for (var k = 0; k < pool.length; k++) {
      var el = pool[k]; if (el === cursor) continue;
      var r = el.getBoundingClientRect(), m = mid(r);
      var fwd = (dir === 'left') ? c.x - m.x : m.x - c.x;
      if (fwd < MIN_ADVANCE) continue;
      /* THE GATE. Not a penalty, not a weight - a candidate that does not share
         your row is not a candidate. */
      if (Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top) <= MIN_OVERLAP) continue;
      var score = fwd + gapTo(c.y, r.top, r.bottom) * CROSS_W;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { setCursor(best); return; }
    /* A grid that genuinely wants line-wrapping declares it. Confined to the
       container, so the worst case is "the next card in this grid", never "the
       status chip in the far corner". */
    var wrap = cursor.closest ? cursor.closest('[data-nav-wrap]') : null;
    if (wrap) {
      var line = [];
      for (var w = 0; w < items.length; w++) if (wrap.contains(items[w])) line.push(items[w]);
      var at = line.indexOf(cursor);
      var nxt = (dir === 'right') ? line[at + 1] : line[at - 1];
      if (nxt) { setCursor(nxt); return; }
    }
    edge(dir);
  }

  function moveV(dir) {
    var cr = cursor.getBoundingClientRect(), c = mid(cr);
    var curRow = rowOf(cursor), k;

    /* A leanback screen is bands, not a soup of rectangles: each rail is ONE
       band whatever it holds, and anything outside a rail is a band of its own.
       Measuring bands is also what keeps a 120-card home responsive. */
    var bands = [];
    for (k = 0; k < rows.length; k++) if (rows[k] !== curRow) bands.push({ row: rows[k], el: rows[k] });
    for (k = 0; k < items.length; k++) if (!itemRow[k] && items[k] !== cursor) bands.push({ row: null, el: items[k] });

    var hard = null, hardScore = Infinity, soft = null, softScore = Infinity;
    for (k = 0; k < bands.length; k++) {
      var r = bands[k].el.getBoundingClientRect(), m = mid(r);
      var fwd = (dir === 'up') ? c.y - m.y : m.y - c.y;
      if (fwd < MIN_ADVANCE) continue;
      var score = fwd + gapTo(c.x, r.left, r.right) * CROSS_W;
      if (Math.min(cr.right, r.right) - Math.max(cr.left, r.left) > MIN_OVERLAP) {
        if (score < hardScore) { hardScore = score; hard = bands[k]; }
      } else if (score < softScore) { softScore = score; soft = bands[k]; }
    }

    /* Overlap DOMINATES: an overlapping band beats a non-overlapping one at any
       distance, which is the invariant. The asymmetry with Left/Right is
       deliberate. Horizontally, "nothing in this row that way" means the row
       ended and stopping is the right answer. Vertically it usually means the
       next band is merely offset - a two-button bar in the bottom-right corner -
       and stopping there would strand controls that the D-pad is required to be
       able to reach (audit I-13, Google's TV-DP). So the offset band is
       considered, but only after the aligned ones and only after scrolling. */
    /* ORDER MATTERS, and getting it wrong strands the whole page.

       An earlier version scrolled BEFORE considering the offset band, on the
       reasoning that a remote has no wheel so the page should move rather than
       the cursor jumping. That is right only when there is nothing left to
       focus. When there IS something - and on a real page the next control is
       almost always horizontally offset, so it is `soft` rather than `hard` -
       scrolling first means every Down scrolls the page while the cursor sits
       still, forever. The nav audit caught it as 36 controls that had been
       reachable becoming unreachable: on the Library the cursor never left the
       first link while all 28 game links scrolled past underneath it.

       So: move to an aligned band, else to an offset one, and only scroll when
       there is genuinely nothing further that way. setCursor() scrolls the
       target into view itself, so moving still brings the page with it. */
    var pick = hard;
    /* Aligned beats offset, but not from any distance away. */
    if (hard && soft && softScore * ALIGN_REACH < hardScore) pick = soft;
    if (!pick) pick = soft;
    if (!pick) {
      if (scrollPage(dir)) return;
      edge(dir); return;
    }
    var target = pick.row ? enterRow(pick.row, c.x) : pick.el;
    if (target) setCursor(target); else edge(dir);
  }

  function move(dir) {
    justScoped = false;
    refresh();
    if (!items.length) return;
    if (justScoped) return;                       /* the overlay landing WAS this keypress */
    if (!cursor) { setCursor(first()); return; }
    if (dir === 'left' || dir === 'right') moveH(dir); else moveV(dir);
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
    if (!cursor) return false;
    var h = scrollHost(cursor); if (!h) return false;
    var view = (h === document.scrollingElement || h === document.documentElement) ? innerHeight : h.clientHeight;
    var max = h.scrollHeight - h.clientHeight;
    var at = h.scrollTop;
    if ((dir === 'down' && at >= max - 2) || (dir === 'up' && at <= 2)) return false;
    var to = Math.max(0, Math.min(max, at + (dir === 'down' ? 1 : -1) * view * 0.75));
    try { h.scrollTo({ top: to, behavior: (RM && RM.matches) ? 'auto' : 'smooth' }); }
    catch (e) { h.scrollTop = to; }
    return true;
  }

  /* ---------- activation ---------- */
  function activate() {
    if (!cursor) { refresh(); setCursor(first()); return; }
    var el = cursor;
    /* Both Google TV and Fire TV require a momentary pressed state: the press is
       the only confirmation the user gets that the remote was heard at all. A
       class only, so the page owns the look and it costs nothing where there is
       none. (The old code had a SELECT branch here that did the same thing as
       the general one - selects are handled on the input paths, not here.) */
    el.classList.add('x3f-press');
    setTimeout(function () { el.classList.remove('x3f-press'); }, PRESS_MS);
    try { el.click(); } catch (e) {}
  }

  function fire(el, name) {
    try { el.dispatchEvent(new Event(name, { bubbles: true })); } catch (e) {}
  }
  /* returns false when the value could not move, so a caller can fall through */
  function stepSelect(el, d, wrap) {
    var n = el.options ? el.options.length : 0; if (!n) return false;
    var i = wrap ? (el.selectedIndex + d + n) % n
                 : Math.max(0, Math.min(n - 1, el.selectedIndex + d));
    if (i === el.selectedIndex) return false;
    el.selectedIndex = i;
    /* Pages that live-update listen on `input`, which is the modern default;
       firing only `change` left them silent when the remote moved a value. */
    fire(el, 'input');
    fire(el, 'change');
    return true;
  }

  function back() {
    var root = scopeRoot();
    var host = (root === document) ? document : root;
    /* This used to be document.querySelector, ignoring the scope entirely, so
       BACK inside the guided coach found the page's own "All games" link BEHIND
       the overlay, clicked it, and walked out of a session mid-set. Inside an
       overlay, BACK closes the overlay; leaving the page is not on the menu.
       The visibility filter matters just as much: document order puts a closed
       sheet's own Close button ahead of the page's, so an unfiltered query would
       fire the back button of an overlay that is not even open. */
    var cands = host.querySelectorAll('[data-nav-back]');
    gen++;
    for (var i = 0; i < cands.length; i++) {
      if (visible(cands[i])) { cands[i].click(); return; }
    }
    /* A page (the routed shell, above all) can own BACK by calling
       preventDefault on this. That is how "BACK goes up one route" works
       without every screen having to plant a hidden link. */
    var on = (root === document) ? (document.body || document.documentElement) : root;
    if (emit(on, 'x3f-nav-back', { scope: root })) return;
    if (root !== document) {
      if (typeof window.__x3fCloseOverlay === 'function') { try { window.__x3fCloseOverlay(); } catch (e) {} }
      return;
    }
    if (history.length > 1) history.back(); else location.href = 'index.html';
  }

  /* ---------- input ---------- */
  var TYPE_ROLES = /^(textbox|searchbox|combobox|spinbutton|slider)$/;
  function typing(e) {
    var t = e.target;
    if (!t) return false;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return true;
    var role = t.getAttribute && t.getAttribute('role');
    return !!(role && TYPE_ROLES.test(role));
  }
  function handle(dir) {
    var t = nowMs();
    fastRepeat = (t - lastNavAt) < FAST_MS;
    lastNavAt = t;
    engaged = true;
    move(dir);
  }

  addEventListener('keydown', function (e) {
    if (e.defaultPrevented || typing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key, d = null;
    if (k === 'ArrowLeft') d = 'left'; else if (k === 'ArrowRight') d = 'right';
    else if (k === 'ArrowUp') d = 'up'; else if (k === 'ArrowDown') d = 'down';

    if (d) {
      /* ARROWS ALWAYS MOVE. Never the value of a <select>.

         This is a project invariant, and it has now been broken twice. Binding
         Up/Down to the option list means a page whose only control is a filter
         traps the cursor completely (that was Progress), and it means that on
         the Library, pressing Down to get past a band picker SILENTLY CHANGES
         THE BAND YOU TRAIN THAT MOVEMENT ON. Changing a training setting as a
         side effect of trying to scroll past it is the same class of bug v1.4
         fixed, arriving from the other direction.

         An intermediate version stepped "only while there are options left,
         then fell through", which is worse than either: it moves after four
         silent changes, so the damage is invisible and the escape is
         unpredictable. */
      handle(d); e.preventDefault(); return;
    }
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      /* OK cycles a select IN PLACE. The native dropdown is unusable on a
         television - it opens a list the D-pad does not own and there is no way
         to dismiss it - so it must never be allowed to open. */
      if (cursor && cursor.tagName === 'SELECT') { stepSelect(cursor, 1, true); e.preventDefault(); return; }
      if (cursor) { engaged = true; activate(); e.preventDefault(); }
      return;
    }
    if (k === 'Escape' || k === 'BrowserBack') { back(); e.preventDefault(); return; }
    if (k === 'Backspace') {
      /* Backspace is bound to back(), and on a <select> Backspace is the
         browser's own key. Losing the page because you pressed it over the
         rest-length picker is not an acceptable trade. */
      if (cursor && cursor.tagName === 'SELECT') return;
      back(); e.preventDefault();
    }
  });

  /* Pointer hover owns the cursor, so keys continue from whatever you last
     touched. This used to move the RING without moving DOM focus, which left
     the two disagreeing - and because the keydown guard reads the focused
     element, hovering a card while a text field still held focus made every
     arrow key a silent no-op with a ring sitting on screen. */
  addEventListener('pointerover', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-nav]');
    if (!el || el === cursor) return;
    var a = document.activeElement;
    /* except while someone is actually typing, where stealing focus is worse
       than the disagreement */
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
    if (!visibleNow(el) || !inScope(el)) return;
    setCursor(el, false);
  }, { passive: true });

  /* This promoted ANY focus to the cursor with no checks at all, so page code
     restoring focus into a collapsed panel - or the browser restoring it on a
     back-navigation - put the ring on something nobody can see, and the very
     next OK pressed it. That is precisely what visible() exists to prevent. */
  addEventListener('focusin', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-nav]');
    if (!el || el === cursor) return;
    if (!visibleNow(el) || !inScope(el)) return;
    setCursor(el, false);
  });

  /* ---------- gamepad D-pad + left stick ---------- */
  var padOn = false, padRaf = 0, padState = {};
  function pads() { try { return navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return []; } }
  function padCount() { var l = pads(), n = 0; for (var i = 0; i < l.length; i++) if (l[i]) n++; return n; }

  function pump(now) {
    padRaf = 0;
    var list = pads(), live = 0;
    for (var p = 0; p < list.length; p++) {
      var g = list[p]; if (!g) continue; live++;
      var ax = g.axes[0] || 0, ay = g.axes[1] || 0, b = g.buttons;
      /* Repeat timers used to be module-level and shared across every connected
         pad, and ok/no lived in the same object as the four directions, so two
         controllers produced one merged repeat stream. One record per pad. */
      var st = padState[g.index] || (padState[g.index] = { held: {}, next: {} });
      var dirs = {
        left:  (b[14] && b[14].pressed) || ax < -PAD_DEAD,
        right: (b[15] && b[15].pressed) || ax >  PAD_DEAD,
        up:    (b[12] && b[12].pressed) || ay < -PAD_DEAD,
        down:  (b[13] && b[13].pressed) || ay >  PAD_DEAD
      };
      for (var d in dirs) {
        if (!dirs[d]) { st.held[d] = false; continue; }
        if (!st.held[d]) { st.held[d] = true; st.next[d] = now + PAD_DELAY; handle(d); }
        else if (now >= st.next[d]) { st.next[d] = now + PAD_REPEAT; handle(d); }
      }
      var ok = !!(b[0] && b[0].pressed), no = !!(b[1] && b[1].pressed);
      if (ok && !st.ok) { st.ok = true; engaged = true; activate(); } else if (!ok) st.ok = false;
      if (no && !st.no) { st.no = true; back(); } else if (!no) st.no = false;
    }
    /* padOn used to be assigned only `true`, with no gamepaddisconnected
       handler, so one controller ever seen meant a rAF callback plus a fresh
       GamepadList allocation sixty times a second for the life of the page - on
       top of the ambient layer's loop, on a SoC that is already short of
       frames. The loop now ends when the pads do, and while the app is hidden
       (Ambient Mode; a menu screen should be at zero rAF callbacks). */
    if (live && !document.hidden) padRaf = requestAnimationFrame(pump);
    else padOn = false;
  }
  function padStart() {
    if (padOn || document.hidden || !padCount()) return;
    padOn = true; padRaf = requestAnimationFrame(pump);
  }
  addEventListener('gamepadconnected', padStart);
  addEventListener('gamepaddisconnected', function (e) {
    if (e && e.gamepad) delete padState[e.gamepad.index];
  });
  addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (padRaf) { try { cancelAnimationFrame(padRaf); } catch (err) {} }
      padRaf = 0; padOn = false;
    } else padStart();
  });
  padStart();

  /* ---------- invalidation ----------
     The only invalidation used to be a 50 ms wall clock plus an unthrottled
     resize handler, which is both too eager (a full rebuild per keypress is one
     getComputedStyle per ancestor per item - measured at 6.9 ms for 480 items on
     a desktop core, several times that on a TV) and too lazy (a re-render inside
     the window was invisible). Nodes appearing and disappearing is the signal
     that actually matters, and the callback only sets a flag, so it costs
     nothing. Attributes are deliberately NOT observed: this file toggles the
     ring class on every move and would otherwise invalidate itself. */
  function touchesNav(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType !== 1) continue;                 /* text updates - a timer ticking - are not our business */
      if (n.hasAttribute('data-nav') || (n.querySelector && n.querySelector('[data-nav]'))) return true;
    }
    return false;
  }
  try {
    new MutationObserver(function (recs) {
      if (dirty) return;
      for (var i = 0; i < recs.length; i++) {
        if (touchesNav(recs[i].addedNodes) || touchesNav(recs[i].removedNodes)) { dirty = true; return; }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  /* A resize used to force a full rebuild synchronously - and because refresh()
     also contains the scope-change landing, a resize that changed which overlay
     was boxed() would silently move the focus ring. Mark it stale; let the next
     real navigation pay for it. */
  addEventListener('resize', function () { dirty = true; });

  /* ---------- Android TV shell bridge (x3f-tv) ----------
     In the TV app the native side swallows the D-pad and calls window.__x3fNav
     instead of dispatching key events, and its injected bootstrap installs a
     fallback nav ONLY if the page has not defined one. Claiming it here means
     the remote drives this nav - so the TV gets the same geometry-aware,
     same-row movement as the browser, with one focus ring instead of two. */
  if (!window.__x3fNav) {
    window.__x3fPageNav = true;      /* so tooling can tell whose nav is driving */
    window.__x3fNav = function (dir) {
      /* evaluateJavascript has no error channel: a throw here is swallowed and
         the remote simply stops working, with no symptom to debug. */
      try {
        engaged = true;
        /* On a remote, OK cycles a <select> in place, because opening the native
           dropdown with no pointer is a dead end. Up/Down must NOT be bound to
           the value: a D-pad axis may never be fully consumed by a widget the
           user cannot then leave, or the page becomes unscrollable from it. The
           keyboard path above does step selects vertically, because a keyboard
           user expects that and has Tab as an escape. */
        if (dir === 'enter') {
          if (cursor && cursor.tagName === 'SELECT') stepSelect(cursor, 1, true); else activate();
          return;
        }
        if (dir === 'back') { back(); return; }
        if (dir === 'left' || dir === 'right' || dir === 'up' || dir === 'down') { handle(dir); return; }
        /* Unknown verbs (a future pageup/pagedown from the shell) must be inert,
           not fatal. */
      } catch (e) {}
    };
  }

  window.X3FNav = {
    /* ---- the four other files already call, unchanged (audit invariant I-4) ----
       refresh() is the "the DOM changed" hook, so from outside it always
       rebuilds - it used to share the internal 50 ms cache and could be a
       silent no-op. The array is a copy; the internal one used to be handed out
       by reference, where a caller sorting it would have reordered the nav. */
    refresh: function () { return refresh(true).slice(); },
    focusFirst: function () { refresh(true); setCursor(first()); },
    set: setCursor,                       /* set(el, scroll) - pass false to seat without scrolling */
    current: function () { return cursor; },
    engaged: function () { return engaged; },

    /* ---- for the leanback home ---- */

    /* Seat without scrolling. The restore-after-render path needs exactly this,
       and so does anything that wants the ring somewhere without the page
       lurching under the user. */
    seat: function (el) { setCursor(el, false); },
    /* Mark the item list stale without paying for a rebuild now - for code that
       mutates the DOM in a loop. */
    invalidate: function () { dirty = true; },
    items: function () { return refresh(true).slice(); },
    scope: function () { return scope; },

    /* The [data-nav-row] the cursor is in, and the rows on screen. */
    row: function () { return rowOf(cursor); },
    rows: function () { refresh(true); return rows.slice(); },
    /* Move into a row by its data-nav-row value (or by element), landing on that
       row's remembered card. */
    focusRow: function (r) {
      refresh(true);
      var row = (typeof r === 'string') ? rowByKey(r) : r;
      if (!row) return null;
      var x = cursor ? mid(cursor.getBoundingClientRect()).x : innerWidth * 0.25;
      var el = enterRow(row, x);
      if (el) setCursor(el);
      return el || null;
    },

    /* Focus memory across route changes: remember('home') before routing away,
       recall('home') once the screen is rendered again. Survives the whole
       screen being rebuilt, because it restores by data-nav-id / id, then by
       (row, column), then by position. */
    remember: function (key) {
      var s = lastSeat || snapshot(cursor);
      if (s) routeMem[key || '*'] = s;
      return s;
    },
    recall: function (key) {
      var s = routeMem[key || '*'];
      if (!s) return null;
      refresh(true);
      var el = findSeat(s);
      if (el) setCursor(el, false);
      return el;
    },
    /* Same thing as a stack, for opening and closing a sheet by hand. Overlays
       that use the .show/scope convention get this automatically. */
    push: function () { var s = lastSeat || snapshot(cursor); if (s) stack.push(s); return s; },
    pop: function () {
      var s = stack.pop(); if (!s) return null;
      refresh(true);
      var el = findSeat(s);
      if (el) setCursor(el, false);
      return el;
    },

    /* The three verbs, so a page can drive the nav the way the remote does. */
    move: handle,
    activate: activate,
    back: back
  };
})();
