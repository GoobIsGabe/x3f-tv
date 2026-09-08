/* X3F FX - the ambient layer the menus sit on.

   A dark ground, a slow aurora wash, a vignette, a dither, a few drifting
   motes, and a ring burst when something good happens. It is decoration. It is
   the first thing that should be sacrificed and the last thing allowed to cost
   anything.

   ─────────────────────────────────────────────────────────────────────────
   WHY THIS WAS REWRITTEN
   ─────────────────────────────────────────────────────────────────────────

   v1.7 drew all of it into one full-screen canvas, every frame. Measured on
   the real pages (docs/audit/nav-fx.md §2.1, 1080p, software raster):

     opaque ground fill   0.05 ms      aurora blit    4.05 ms
     70 motes             0.03 ms      vignette fill  5.20 ms
     grain                2.30 ms      -------------------------
                                       full frame    11.70 ms

   against a ~10 ms budget (docs/x3-knowledge/tv-ux-research.md §8.1). And the
   degrade ladder shed grain, then motes, then the aurora *drift* - 2.33 ms of
   the 11.70 - while keeping the blit and the vignette forever. At the bottom
   tier it still cost 80% of full price. At devicePixelRatio 2, which is what a
   TV hands you, the same frame was 72.59 ms: 13.8 fps for a background.

   The three most expensive layers were also the three that look *identical*
   from frame to frame. So they are no longer drawn per frame at all:

     ground + vignette + dither   CSS on a static element. Painted once.
     aurora                       CSS gradients (and the optional photo) on one
                                  element, moved by a 48 s CSS transform
                                  animation. transform is compositor-only, so
                                  the drift costs the main thread nothing.
     motes + bursts               the only canvas work left, and the only thing
                                  a rAF callback is spent on.

   That inverts the ladder into something that actually hands frames back:

     quality 3   dither + motes + drift
     quality 2   motes + drift            (dither texture released)
     quality 1   drift only               (canvas DESTROYED, rAF loop stops;
                                            a burst lands as a backdrop lift)
     quality 0   a still backdrop         (drift animation stopped too)

   Tier 1 is the real win and the thing v1.7 never had: a stop tier. With no
   motes and no live burst there is no rAF callback at all, which is what
   tv-ux-research §9.4 asks for ("a TV app sitting on a menu should be at 0 rAF
   callbacks per second").

   Two rules it still lives by, both straight off the roadmap:

   1. It does NOT run inside the games. Each game already owns a render loop,
      and the form rig and the music scheduler are two more; a fourth on a TV
      SoC is how you lose frames. No game loads this file, and mount() also
      bails on window.__x3fGame so a shell that routes into a game view cannot
      start it by accident.
   2. Nothing it does may ever hide, move, or block the page. v1.7 could do all
      three: `body>*:not(#x3ffx){position:relative}` had ID-level specificity
      and killed position:fixed on every modal in the app, and a thrown mount()
      left `body{opacity:0}` standing forever. Both are gone; see the two
      "THE PAGE COMES FIRST" notes below.

     X3FFX.mount({ image:'assets/ui/aurora.jpg' });
     X3FFX.burst(x, y, '#39f5c4');   // something good happened
     X3FFX.pulse(0.6);               // brief lift, e.g. on select
     X3FFX.leave('routine.html');    // fade out, then navigate
     X3FFX.stats();                  // see the block above api, at the bottom
*/
(function () {
  "use strict";

  /* ══════════════════════════════════════════════════════ constants ═════ */

  /* One frame at 60 Hz is 16.66 ms and the browser keeps ~6.66 of it, so ~10 ms
     is the budget and 5 is the target (tv-ux-research §8.1). SLOW is the
     sustained frame interval that means we are costing somebody frames. */
  var SLOW_MS   = 26;      // sustained interval above this = shed something
  var SLOW_HOLD = 1500;    // ...for this long in WALL CLOCK ms, not frames
  var STALL_MS  = 250;     // an interval longer than this is a stall, not cadence
  var EXIT_MS   = 200;     // page exit fade, and the navigate timer. Same number.
  var BOOT_MS   = 400;     // entrance-fade watchdog. See THE PAGE COMES FIRST (1).
  var LIFT_MS   = 900;     // how long pulse() lifts for

  /* Rec.709 puts black at 16/255. Below that a TV crushes every subtle edge and
     renders the ground as flat black. --bg is #0F1114 (max channel 20) for that
     reason; a legacy page may still declare the old #06080e (max channel 14).
     Lift a too-dark ground to the floor rather than trusting the token. */
  var GROUND_FLOOR = 20;

  /* NEVER devicePixelRatio. A 1080p canvas at dpr 2 is 3840x2160x4 = 31.6 MiB,
     which is the ENTIRE 30-40 MB graphics budget of a 1 GB TV, spent on one
     decorative canvas (tv-ux-research §9.3). And on a 1 GB device the UI
     renders at 720p anyway, so 1280x720 is the honest ceiling for a
     full-screen decorative surface: 3.5 MiB. Motes are soft blobs and bursts
     are wide rings; neither loses anything to the upscale. */
  var MAX_PX = 1280 * 720;

  /* ══════════════════════════════════════════════════════════ state ═════ */

  var mq = null, reduced = false;
  try {
    mq = matchMedia('(prefers-reduced-motion: reduce)');
    reduced = !!(mq && mq.matches);
  } catch (e) {}

  var mounted = false, dead = false;
  var style = null, bg = null, au = null, vg = null, gr = null, cv = null, ctx = null;
  var imgURL = '';

  var W = 0, H = 0, ratio = 1;
  var motes = [], bursts = [], sprite = null, grainURL = '';
  var quality = 3;              // 3 dither, 2 motes, 1 drift, 0 still
  var sheds = 0;

  var rafId = 0, lastT = 0, settle = 0, hidden = false, probeUntil = 0;
  var frameMs = 16.7, drawMs = 0, slowFor = 0;
  var liftUntil = 0, liftTimer = 0, sizeTimer = 0, bootTimer = 0;
  var leaving = false, navigated = false;
  var pending = [];             // bursts asked for before mount; see I-17 below

  var P = null;                 // the palette, read from the design tokens

  function perfNow() {
    try { return performance.now(); } catch (e) { return Date.now(); }
  }

  /* ═══════════════════════════════════════════════════════ palette ══════ */

  /* The colours are NOT written down here. They are read from web/x3f-ui.css's
     token block at mount time, so the ambience follows the design system
     instead of drifting away from it - which is exactly how v1.7 ended up
     painting #06070f under a #0F1114 page. Fallbacks match the token file so a
     page that has not adopted it yet still gets the right answer. */

  function hx(s) { var n = parseInt(s, 16); return n === n ? n : 0; }

  function rgb(css, fb) {
    var s = (css || '').replace(/^\s+|\s+$/g, ''), m, p;
    if (s.charAt(0) === '#') {
      if (s.length === 4) return [hx(s.charAt(1) + s.charAt(1)), hx(s.charAt(2) + s.charAt(2)), hx(s.charAt(3) + s.charAt(3))];
      if (s.length >= 7) return [hx(s.substr(1, 2)), hx(s.substr(3, 2)), hx(s.substr(5, 2))];
    }
    m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      p = m[1].split(/[,\s\/]+/);
      return [parseInt(p[0], 10) || 0, parseInt(p[1], 10) || 0, parseInt(p[2], 10) || 0];
    }
    return fb;
  }

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function mix(a, b, k) {
    return [Math.round(a[0] + (b[0] - a[0]) * k),
            Math.round(a[1] + (b[1] - a[1]) * k),
            Math.round(a[2] + (b[2] - a[2]) * k)];
  }

  function floorGround(c) {
    var m = Math.max(c[0], c[1], c[2]);
    if (m >= GROUND_FLOOR) return c;
    if (m === 0) return [GROUND_FLOOR, GROUND_FLOOR, GROUND_FLOOR];
    var k = GROUND_FLOOR / m;
    return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
  }

  function readPalette() {
    var cs = null;
    try { cs = getComputedStyle(document.documentElement); } catch (e) {}
    function tok(name, fb) {
      if (!cs) return fb;
      var v = cs.getPropertyValue(name);
      v = v && v.replace(/^\s+|\s+$/g, '');
      return v || fb;
    }
    var txt = rgb(tok('--txt', '#ECEEF2'), [236, 238, 242]);
    var cyan = rgb(tok('--cyan', '#35D8F5'), [53, 216, 245]);
    P = {
      bg:     floorGround(rgb(tok('--bg', '#0F1114'), [15, 17, 20])),
      lift:   rgb(tok('--bg-lift', '#14171E'), [20, 23, 30]),
      accent: rgb(tok('--accent', '#7C6CFF'), [124, 108, 255]),
      cyan:   cyan,
      mint:   rgb(tok('--mint', '#33E2AE'), [51, 226, 174]),
      txt:    txt,
      /* motes read as light, not as a colour - a cool near-white carries
         better across a room than a saturated hue does. */
      mote:   mix(txt, cyan, 0.35),
      /* an empty --surface means the page has not adopted x3f-ui.css yet */
      hasTokens: !!tok('--surface', '')
    };
  }

  /* The aurora, as CSS. Four ellipses: brand violet high-left, cyan right,
     mint low, and a broad lift through the middle so the ground is not flat.
     Written as rgba() rather than colour-mix()/relative colour, because a TV
     WebView is commonly several Chromium releases behind (§9.1). */
  function auroraCSS(withPhoto) {
    var l = [
      'radial-gradient(ellipse 72% 62% at 16% 6%,'   + rgba(P.accent, 0.22) + ',' + rgba(P.accent, 0) + ' 70%)',
      'radial-gradient(ellipse 62% 56% at 90% 20%,'  + rgba(P.cyan,   0.13) + ',' + rgba(P.cyan,   0) + ' 70%)',
      'radial-gradient(ellipse 84% 60% at 48% 106%,' + rgba(P.mint,   0.10) + ',' + rgba(P.mint,   0) + ' 72%)',
      'radial-gradient(ellipse 120% 92% at 50% 42%,' + rgba(P.lift,   0.60) + ',' + rgba(P.lift,   0) + ' 72%)'
    ];
    /* The optional photo sits UNDER the gradients so the tokens still set the
       mood when the art changes. It is a background-image, not a per-frame
       drawImage: one decode (1280x720 -> 3.5 MiB), then the compositor moves
       it with the rest of the layer for free. */
    if (withPhoto && imgURL) l.push('url("' + imgURL.replace(/"/g, '%22') + '") center/cover no-repeat');
    return l.join(',');
  }

  function vignetteCSS() {
    /* Keeps the light in the corners and off the reading column. A large smooth
       gradient bands badly on a TV (§7.6) - that is what the dither is for. */
    return 'radial-gradient(ellipse 78% 74% at 50% 46%,rgba(0,0,0,0) 38%,rgba(0,0,0,.30) 74%,rgba(0,0,0,.52) 100%)';
  }

  /* ═════════════════════════════════════════════════════════ CSS ════════ */

  function cssText() {
    var s = [
      /* THE PAGE COMES FIRST (2).
         Both layers are z-index:-1/-2 and NOTHING is done to the page's own
         children. v1.7 pushed content up with `body>*:not(#x3ffx)`, whose
         :not(#id) argument gave it ID-level specificity, so it beat
         `.coach{position:fixed}` and `.scrim{position:fixed}` and turned every
         modal in the app into an in-flow block - the launcher's bar picker laid
         out 941px down a 941px viewport with the D-pad scoped into it.
         A negative z-index paints above the viewport background (body's
         background propagates to the canvas when <html> has none, which is true
         of x3f-ui.css and of every page in the app) and below every in-flow
         child, which is what was wanted in the first place. If some future page
         does put a background on <html>, propagation stops and the ambience is
         simply covered - a decorative layer disappearing is the correct way for
         this to fail. */
      '#x3ffx-bg,#x3ffx{position:fixed;inset:0;top:0;right:0;bottom:0;left:0;pointer-events:none;display:block}',
      '#x3ffx-bg{z-index:-2;overflow:hidden}',
      '#x3ffx{z-index:-1;width:100%;height:100%}',
      '#x3ffx-au,#x3ffx-vg,#x3ffx-gr{position:absolute;pointer-events:none}',
      /* The aurora layer is HALF SIZE and scaled back up. Its composited
         texture is allocated at its own size, so a half-size layer is a quarter
         of the memory: ~2 MiB instead of 7.9 (tv-ux-research §9.2). Nothing in
         it has an edge, so the 2x upscale is invisible. */
      '#x3ffx-au{left:0;top:0;width:50%;height:50%;transform-origin:0 0;',
      'transform:translate3d(0,0,0) scale(2.08);opacity:.72;transition:opacity 300ms linear}',
      '#x3ffx-vg{inset:0;top:0;right:0;bottom:0;left:0;z-index:2}',
      '#x3ffx-gr{inset:0;top:0;right:0;bottom:0;left:0;z-index:3;display:none}',
      '#x3ffx-bg.x3ffx-grain #x3ffx-gr{display:block}',
      /* 48 s, transform only, so the compositor owns it and the main thread
         never sees it. Scale stays >= 2.03 at every keyframe so the half-size
         layer can never expose an edge. */
      '@keyframes x3ffx-drift{',
      '0%{transform:translate3d(0,0,0) scale(2.08)}',
      '35%{transform:translate3d(-1.4%,-.8%,0) scale(2.14)}',
      '70%{transform:translate3d(-.4%,-1.4%,0) scale(2.10)}',
      '100%{transform:translate3d(0,0,0) scale(2.08)}}',
      '#x3ffx-bg.x3ffx-drift #x3ffx-au{animation:x3ffx-drift 48s ease-in-out infinite}',
      '#x3ffx-bg.x3ffx-still #x3ffx-au{animation-play-state:paused}',
      '#x3ffx-bg.x3ffx-lift #x3ffx-au{opacity:1}',
      /* Page entrance and exit. opacity only - a transform on <body> would make
         body the containing block for every position:fixed overlay in the page,
         which is the same class of damage as the rule this file just deleted. */
      /* transition:none on the suppressed state matters. With one transition on
         <body>, ADDING the class would animate 1 -> 0 and removing it would
         animate back, so the "entrance" was a dip and a recovery. Snapping to 0
         and transitioning only on the way out is the actual fade-in. */
      'body.x3f-boot{opacity:0;transition:none}',
      'body{transition:opacity .34s cubic-bezier(.2,.9,.25,1)}',
      'body.x3f-out{opacity:0;transition:opacity ' + EXIT_MS + 'ms ease}',
      /* A full-screen backdrop-filter over this layer is the single most
         expensive line in the app: the compositor re-snapshots the backdrop and
         re-runs a gaussian over the whole screen every frame the backdrop moves,
         and it moves because of us. Chrome's own measurement of a naively
         animated blur is ~90 ms/frame against a 16.6 ms budget
         (tv-ux-research §8.3), and x3f-ui.css bans it outright. These four
         legacy class names still declare one; neutralise it while we are
         mounted. Delete this rule once the pages drop theirs - see the report. */
      '.coach,.rest,.scrim,.status{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
      /* I-15: reduced motion stops the ambient motion and the page fades. */
      '@media (prefers-reduced-motion:reduce){#x3ffx-au{animation:none!important}',
      'body,body.x3f-out,body.x3f-boot{transition:none!important}}'
    ];

    /* Panels over a moving backdrop need their own ground or the text sits on
       an aurora. x3f-ui.css already gives every surface one, so on a page that
       has adopted the tokens this module only needs to offer the opt-in class
       and stay out of the way. On a page that has not, keep the v1.7
       compatibility list - it is the only thing holding those panels readable,
       and this file does not own those pages. The branch deletes itself when
       the last page adopts the design system. */
    s.push('.x3f-surface{background-color:var(--surface,#1A1E27)}');
    if (!P.hasTokens) {
      s.push('.card,.ex,.pbrow,.today,.chal,.pstrip,.ach,.demobox,.method,.cwrap,.sheet,');
      s.push('.rest,.coach{background-color:' + rgba(mix(P.bg, P.lift, 0.45), 0.86) + '}');
    }
    return s.join('');
  }

  /* ═══════════════════════════════════════════════════════ textures ═════ */

  /* One soft blob, drawn once, then blitted per mote with globalAlpha. v1.7
     built a new 'rgba(200,235,255,0.123)' string per mote per frame - 140
     allocations and 70 colour re-parses every frame - for a layer whose actual
     raster cost was 0.03 ms. The GC pressure was the whole story. */
  function makeSprite() {
    var n = 32, c, g, rg;
    try {
      c = document.createElement('canvas');
      c.width = c.height = n;
      g = c.getContext('2d');
      if (!g) return null;
      rg = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      rg.addColorStop(0, rgba(P.mote, 1));
      rg.addColorStop(0.4, rgba(P.mote, 0.45));
      rg.addColorStop(1, rgba(P.mote, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, n, n);
      return c;
    } catch (e) { return null; }
  }

  /* A dither, not a texture. Full-range value noise at 3% alpha over a 64px
     tile is the standard fix for the banding a TV puts through a large smooth
     gradient (§7.6). It is a static background-image, so unlike v1.7's
     translating grain pattern (2.30 ms EVERY frame, at an alpha nobody can see
     from a sofa) it is composited once and costs nothing after that. */
  function makeGrainURL() {
    var n = 64, c, g, d, i, v;
    try {
      c = document.createElement('canvas');
      c.width = c.height = n;
      g = c.getContext('2d');
      if (!g) return '';
      d = g.createImageData(n, n);
      for (i = 0; i < d.data.length; i += 4) {
        v = Math.random() * 255 | 0;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 8;
      }
      g.putImageData(d, 0, 0);
      return c.toDataURL('image/png');
    } catch (e) { return ''; }
  }

  /* ═══════════════════════════════════════════════════════ the canvas ═══ */

  function sizeCanvas() {
    if (!cv || !ctx) return false;
    var w = Math.max(1, window.innerWidth || 1);
    var h = Math.max(1, window.innerHeight || 1);
    if (w === W && h === H && cv.width) return false;
    W = w; H = h;
    /* Backing store in CSS pixels, capped at 720p. Explicitly NOT
       devicePixelRatio - see MAX_PX. */
    ratio = Math.min(1, Math.sqrt(MAX_PX / (W * H)));
    cv.width = Math.max(1, Math.round(W * ratio));
    cv.height = Math.max(1, Math.round(H * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);   // draw in CSS px regardless
    seed();
    return true;
  }

  function ensureCanvas() {
    if (cv || dead || !mounted) return;
    try {
      cv = document.createElement('canvas');
      cv.id = 'x3ffx';
      ctx = cv.getContext('2d');
      if (!ctx) { cv = null; return; }          // no context, no motes. Page is fine.
      if (!sprite) sprite = makeSprite();
      /* Motes are the whole reason for the canvas. Without the sprite the loop
         would run forever drawing nothing, which is the exact waste this
         rewrite exists to remove. */
      if (!sprite) { cv = null; ctx = null; return; }
      bg.parentNode.insertBefore(cv, bg.nextSibling);
      W = H = 0;
      sizeCanvas();
    } catch (e) { cv = null; ctx = null; }
  }

  /* Tier 1 and 0 do not just stop drawing - they give the memory back. A
     full-screen canvas is 3.5-7.9 MiB of a 30-40 MB graphics budget, and on a
     device that has already degraded twice that is the most useful thing this
     module owns. */
  function dropCanvas() {
    stop();
    if (cv && cv.parentNode) { try { cv.parentNode.removeChild(cv); } catch (e) {} }
    cv = null; ctx = null; motes.length = 0; bursts.length = 0; W = H = 0;
  }

  function seed() {
    motes.length = 0;
    if (quality < 2 || !W || !H) return;
    /* Fewer and larger than v1.7's 70 x 0.6-2.8px. At 10 feet a 1px dot at 20%
       alpha is not a thing anyone can see; it was cost with no product. */
    var want = Math.round(Math.min(28, (W * H) / 74000));
    for (var i = 0; i < want; i++) {
      motes.push({
        x: Math.random() * W, y: Math.random() * H,
        r: 2.2 + Math.random() * 4.4,
        vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 7,
        a: 0.06 + Math.random() * 0.20, ph: Math.random() * 7
      });
    }
  }

  /* ═══════════════════════════════════════════════════════ the loop ═════ */

  /* WHAT THE FRAME ACCOUNTING ACTUALLY MEASURES - read this before trusting it.

     frameMs is the interval between our own drawn frames. It is the only
     number here that can see GPU cost, because canvas draw calls are queued:
     wrapping them in performance.now() times the command submission, not the
     rasterisation. So the ladder degrades on frameMs and only on frameMs.

     drawMs is that submission cost, reported separately and labelled as such.
     It is useful (it catches JS/GC regressions in this file) and it is NOT a
     frame budget.

     v1.7 got three things wrong here and all three are fixed:
       - dt was clamped to 50 ms BEFORE feeding the average, so a device at
         5 fps and one at 20 fps reported the same number and the ladder could
         never skip a tier under severe load. The clamp now applies only to the
         motion integration, where it belongs.
       - the trip was `slowFrames > 45`, a frame count, so the slower the
         device the longer each tier took to fire. It is now wall-clock ms.
       - the first frame back from a hidden tab injected a 50 ms sample and
         nudged the ladder toward a degrade that nothing had earned. Frames
         after a resume are now settled out. */

  function judge(raw) {
    if (settle > 0) { settle--; return; }
    if (raw <= 0 || raw > STALL_MS) return;      // a stall is not a cadence sample
    frameMs += (raw - frameMs) * 0.1;
    if (frameMs > SLOW_MS) slowFor += raw; else slowFor = Math.max(0, slowFor - raw);
    if (slowFor > SLOW_HOLD && quality > 0) {
      /* Two tiers at once when it is not close - a device at 8 fps does not
         need to wait another 1.5 s to find out that one tier was not enough. */
      sheds++;
      slowFor = 0;
      setQuality(quality - (frameMs > SLOW_MS * 2 ? 2 : 1));
      settle = 6;
    }
  }

  function paint(now, raw) {
    var dt = Math.min(0.05, raw / 1000);   // clamped so a stall cannot teleport a mote
    var t0 = perfNow();
    var lift = liftUntil > now ? (liftUntil - now) / LIFT_MS : 0;
    var i, m, tw, b, s, k, rr;

    ctx.clearRect(0, 0, W, H);

    if (quality >= 2 && sprite) {
      for (i = 0; i < motes.length; i++) {
        m = motes[i];
        m.x += m.vx * dt; m.y += m.vy * dt; m.ph += dt;
        if (m.y < -12) { m.y = H + 12; m.x = Math.random() * W; }
        if (m.x < -12) m.x = W + 12; else if (m.x > W + 12) m.x = -12;
        tw = m.a * (0.6 + 0.4 * Math.sin(m.ph * 1.7)) * (1 + lift);
        ctx.globalAlpha = tw > 1 ? 1 : tw;
        ctx.drawImage(sprite, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
      }
      ctx.globalAlpha = 1;
    }

    /* Short, cheap, and no composite-mode change: 'screen' over a near-black
       ground looks the same as a plain stroke and a globalCompositeOperation
       switch is one of the more expensive canvas state changes on a tile-based
       mobile GPU. */
    for (b = bursts.length - 1; b >= 0; b--) {
      s = bursts[b];
      s.life += dt;
      k = s.life / s.max;
      if (k >= 1) { bursts.splice(b, 1); continue; }
      rr = s.r0 + (s.r1 - s.r0) * (1 - Math.pow(1 - k, 3));
      ctx.strokeStyle = s.c;
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.lineWidth = 2 + (1 - k) * 4;
      ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    drawMs += (perfNow() - t0 - drawMs) * 0.1;
  }

  /* The loop runs only while something is actually moving. On a settled menu at
     tier 1 or 0 that is zero rAF callbacks per second, which is the point.
     probeUntil is the one exception - see setQuality(). */
  function busy() {
    if (dead || !mounted || hidden) return false;
    if (probeUntil > perfNow()) return true;
    return !!(cv && ctx && ((quality >= 2 && motes.length) || bursts.length));
  }

  function loop(now) {
    rafId = 0;
    if (dead || !mounted || hidden) return;
    var raw = now - lastT;
    lastT = now;
    judge(raw);
    /* judge() can shed a tier, which can destroy the canvas mid-callback. */
    if (ctx) { try { paint(now, raw); } catch (e) { dropCanvas(); } }
    if (!rafId && busy()) rafId = requestAnimationFrame(loop);
  }

  function kick() {
    if (rafId || !busy()) return;
    lastT = perfNow();
    settle = 3;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (!rafId) return;
    try { cancelAnimationFrame(rafId); } catch (e) {}
    rafId = 0;
  }

  /* ═════════════════════════════════════════════════════ the ladder ═════ */

  function setQuality(q) {
    q = q < 0 ? 0 : q > 3 ? 3 : (q | 0);
    /* An explicit quality never defeats the accessibility setting. v1.7 read
       `if (reduced) quality = 1` and then let `mount({quality:3})` overwrite it
       one line later. */
    if (reduced) q = 0;
    quality = q;
    if (!mounted) return;

    if (quality >= 3) {
      if (!grainURL) grainURL = makeGrainURL();
      if (grainURL) gr.style.backgroundImage = 'url("' + grainURL + '")';
    } else {
      gr.style.backgroundImage = '';     // release the tile
    }
    /* Shedding the photo below tier 2 hands back its decoded bitmap (3.5 MiB
       for a 1280x720 source) on exactly the device that needs it. */
    au.style.backgroundImage = auroraCSS(quality >= 2);

    cls(bg, 'x3ffx-grain', quality >= 3 && !!grainURL);
    cls(bg, 'x3ffx-drift', quality >= 1);

    /* Motes are the only thing that needs a canvas - a burst at tier 1 lands as
       a backdrop lift instead - so tier 1 releases the backing store, not just
       the drawing. That is 3.5 MiB of a 30-40 MB graphics budget handed back on
       exactly the device that could not afford it. */
    if (quality >= 2) ensureCanvas(); else dropCanvas();
    if (cv) seed();

    /* Tier 1 has no canvas and therefore no loop, so nothing would ever measure
       whether the composited drift alone is still too much - the ladder would
       stop one rung short of its own bottom. Run the loop empty for a few
       seconds after landing here: it draws nothing, it only samples cadence,
       and if the device is STILL over budget with just a transform animation
       running, judge() drops it to a completely still backdrop and everything
       stops for good. */
    probeUntil = quality === 1 ? perfNow() + 2500 : 0;
    kick();
  }

  function cls(el, name, on) {
    if (!el) return;
    try { el.classList[on ? 'add' : 'remove'](name); } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════ lifecycle ════ */

  function make(tag, id) {
    var e = document.createElement(tag);
    e.id = id;
    return e;
  }

  /* THE PAGE COMES FIRST (1).
     v1.7 injected `body{opacity:0}` as a DEFAULT and restored it on the last
     line of mount(), so a null 2D context - a WebView under memory pressure,
     a GPU process restart - threw halfway through and left the whole app a
     black screen with a working D-pad the user could not see. Every call site
     is `try{...}catch(e){}`, so nothing was even logged.

     Now the suppression is a class that is ADDED, never a default, and it is
     only added when the page has not finished loading - adding opacity:0 to an
     already-painted page and fading it back in is a blink, not an entrance.
     Four independent things bring the page back, none of which depend on the
     one before it:
       1. the class is removed in the same synchronous task that added it;
       2. a timer removes it at BOOT_MS whatever else has happened;
       3. a check at +600 ms snaps the opacity if the fade never advanced;
       4. teardown() removes it on any failure at all. */
  function enter() {
    var b = document.body;
    /* Nothing to fade into if the page has already painted, and nothing to see
       if the WebView is behind another activity - in both cases the honest
       answer is to leave <body> alone. */
    if (!b || hidden || document.readyState === 'complete') return;
    /* Add, force one style resolution, remove - all in this task. The forced
       reflow is what makes the fade real: it pins opacity at 0 as the
       before-change style so removing the class transitions 0 -> 1 instead of
       resolving straight to 1, which is why v1.7's entrance never ran. Doing it
       synchronously also means there is no window in which a starved rAF, a
       throttled timer or a thrown callback can leave the page suppressed - the
       failure mode that made D-FX-2 able to black out the whole app.
       The watchdog below is insurance against nothing in particular. */
    cls(b, 'x3f-boot', true);
    bootTimer = setTimeout(clearBoot, BOOT_MS);
    try { void b.offsetHeight; } catch (e) {}
    clearBoot();
  }

  function clearBoot() {
    if (bootTimer) { clearTimeout(bootTimer); bootTimer = 0; }
    try { document.body.classList.remove('x3f-boot'); } catch (e) {}
    /* Removing the class starts a transition, and a transition that never
       advances leaves the page at whatever opacity it froze at. That is the
       same black screen by a different route, so check once - well after the
       fade should have landed - and snap it. */
    setTimeout(function () {
      if (leaving) return;                       // the exit fade is meant to be dark
      try {
        var b = document.body;
        if (parseFloat(getComputedStyle(b).opacity) >= 0.99) return;
        b.style.transition = 'none';
        b.style.opacity = '1';
        void b.offsetHeight;
        b.style.transition = '';
        b.style.opacity = '';
      } catch (e) {}
    }, 600);
  }

  function build(o) {
    var b = document.body;

    style = make('style', 'x3ffx-css');
    readPalette();
    style.textContent = cssText();
    (document.head || document.documentElement).appendChild(style);

    imgURL = o.image || '';

    bg = make('div', 'x3ffx-bg');
    au = make('div', 'x3ffx-au');
    vg = make('div', 'x3ffx-vg');
    gr = make('div', 'x3ffx-gr');
    bg.setAttribute('aria-hidden', 'true');
    bg.appendChild(au); bg.appendChild(vg); bg.appendChild(gr);

    bg.style.backgroundColor = rgba(P.bg, 1);
    vg.style.backgroundImage = vignetteCSS();
    /* the aurora itself is set by setQuality(), which decides whether the
       optional photo is affordable at this tier */

    b.insertBefore(bg, b.firstChild);
    mounted = true;

    /* D-FX-12: a page mounted while hidden - a background tab, a WebView
       created behind another activity - used to draw full frames into
       something nobody could see until the first visibilitychange. */
    hidden = false;
    try { hidden = !!document.visibilityState && document.visibilityState !== 'visible'; } catch (e) {}
    cls(bg, 'x3ffx-still', hidden);

    setQuality(o.quality != null ? o.quality : quality);

    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    if (mq) {
      try {
        if (mq.addEventListener) mq.addEventListener('change', onMotionPref);
        else if (mq.addListener) mq.addListener(onMotionPref);
      } catch (e) {}
    }

    enter();
    wireLinks();

    /* I-17: burst()/pulse() must tolerate being called before mount. They are
       - progress.html asks for the achievement burst at parse time, several
       script tags before fx is even loaded, so the whole celebration was
       silently swallowed by its own try/catch. Anything queued before the
       canvas existed replays here, now that W and H are real. */
    var q = pending; pending = [];
    for (var i = 0; i < q.length; i++) burst(q[i][0], q[i][1], q[i][2]);
  }

  /* Never leave the page worse than we found it. Called on any failure. */
  function teardown() {
    dead = true;
    mounted = false;
    stop();
    clearBoot();
    try { document.body.classList.remove('x3f-out'); } catch (e) {}
    dropCanvas();
    try {
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotionPref);
      else if (mq && mq.removeListener) mq.removeListener(onMotionPref);
    } catch (e) {}
    try { if (bg && bg.parentNode) bg.parentNode.removeChild(bg); } catch (e) {}
    try { if (style && style.parentNode) style.parentNode.removeChild(style); } catch (e) {}
    bg = au = vg = gr = style = null;
  }

  function mount(o) {
    o = o || {};
    if (dead || mounted) return api;
    /* Rule 1: never inside a game. No game loads this file today; this is the
       lock for the day a shell routes into one. */
    if (window.__x3fGame) return api;
    if (document.getElementById('x3ffx-bg')) return api;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { mount(o); });
      return api;
    }
    try { build(o); } catch (e) { try { teardown(); } catch (e2) {} }
    return api;
  }

  /* ══════════════════════════════════════════════════════════ events ════ */

  /* D-FX-10: writing cv.width reallocates and clears the backing store. An
     Android TV system bar or soft keyboard animating in fires a resize per
     frame for ~250 ms; v1.7 did fifteen reallocations, fifteen reseeds and
     fifteen grain regenerations on a device already degrading. Coalesce, and
     do nothing at all if the size did not actually change. */
  function onResize() {
    if (sizeTimer) clearTimeout(sizeTimer);
    sizeTimer = setTimeout(function () {
      sizeTimer = 0;
      if (sizeCanvas()) kick();
    }, 150);
  }

  function onVisibility() {
    var was = hidden;
    try { hidden = !!document.visibilityState && document.visibilityState !== 'visible'; } catch (e) { hidden = false; }
    if (hidden === was) return;
    cls(bg, 'x3ffx-still', hidden);
    if (hidden) { stop(); return; }
    /* D-FX-13: coming back, the clock has moved by the whole hidden interval.
       Re-base it so the first frame is not a bogus sample and the motes do not
       pop across the screen. */
    lastT = perfNow();
    settle = 6;
    kick();
  }

  function onMotionPref() {
    try { reduced = !!(mq && mq.matches); } catch (e) {}
    /* Turning the preference back off restores the ambience, but only as far as
       the device has already proved it can afford: the ladder is one-way for
       the life of the page and an accessibility toggle is not a reason to
       forget that this TV dropped two tiers ten minutes ago. */
    setQuality(reduced ? 0 : Math.max(0, 3 - sheds));
  }

  /* ═══════════════════════════════════════════════════════ navigation ═══ */

  /* I-16: once this is called the page is already fading, so the navigation
     must happen. Every exit path below ends in either a location change or the
     fade being removed. */
  function leave(href) {
    if (!href) return;
    if (leaving) return;
    leaving = true;

    function go() {
      if (navigated) return;
      navigated = true;
      try { location.href = href; }
      catch (e) { leaving = false; try { document.body.classList.remove('x3f-out'); } catch (e2) {} }
    }

    if (reduced || !mounted || !document.body) { go(); return; }
    try { document.body.classList.add('x3f-out'); } catch (e) { go(); return; }
    setTimeout(go, EXIT_MS);
    /* If the navigation is refused - the same URL, a blocked scheme, a
       beforeunload - the user would be left staring at an invisible page. */
    setTimeout(function () {
      leaving = false;
      try { document.body.classList.remove('x3f-out'); } catch (e) {}
    }, EXIT_MS + 1400);
  }

  /* D-FX-7: v1.7 hijacked every click in the capture phase with no modifier,
     button, download or scheme checks, so a ctrl-click or middle-click faded
     the current page out and then replaced it 190 ms later - the new tab never
     opened and the user lost their place. Bubble phase now, so a page handler
     that already handled the click is visible to us. */
  function wireLinks() {
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented) return;
      if (e.button != null && e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a || a.target || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      if (href.substr(0, 2) === '//') return;          // protocol-relative: off-origin
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return;   // any scheme is somebody else's job
      e.preventDefault();
      pulse(0.5);
      leave(href);
    }, false);
  }

  /* ══════════════════════════════════════════════════════════════ fx ════ */

  function burst(x, y, colour) {
    if (dead) return;
    if (!mounted) {
      /* Queue rather than drop. r1 derives from the viewport, so a burst fired
         before mount would have had radius 0 anyway - progress.html's
         achievement celebration was firing at parse time, several script tags
         before this file was even loaded, and going straight into its own
         try/catch. */
      if (pending.length < 4) pending.push([x, y, colour]);
      return;
    }
    if (quality < 1) return;
    if (!cv || !W || !H) {
      /* Tier 1 has no canvas and a struggling device is the last one that
         should be handed a 3.5 MiB allocation for a 750 ms ring. The moment
         still lands - as a brief lift of the whole backdrop, which is one
         compositor-only opacity transition. */
      pulse(0.7);
      return;
    }
    if (bursts.length >= 6) bursts.shift();   // cap BEFORE the push, not after
    bursts.push({
      x: x == null ? W / 2 : x, y: y == null ? H / 2 : y,
      r0: 8, r1: Math.min(W, H) * 0.42, life: 0, max: 0.75,
      c: colour || rgba(P ? P.mint : [51, 226, 174], 1)
    });
    kick();
  }

  function pulse(amount) {
    if (dead || !mounted) return;
    var a = amount == null ? 1 : amount;
    liftUntil = perfNow() + LIFT_MS * a;
    /* Compositor-only: one opacity transition on one already-composited layer.
       Works at every tier, including the ones with no canvas at all. */
    cls(bg, 'x3ffx-lift', true);
    if (liftTimer) clearTimeout(liftTimer);
    liftTimer = setTimeout(function () { liftTimer = 0; cls(bg, 'x3ffx-lift', false); }, LIFT_MS * a);
    kick();
  }

  /* ═════════════════════════════════════════════════════════ the API ════ */

  var TIERS = ['still', 'drift', 'motes', 'dither'];

  var api = {
    mount: mount,
    burst: burst,
    pulse: pulse,
    leave: leave,
    quality: function (q) { if (q != null) setQuality(q); return quality; },

    /* stats() - what the home screen can surface during TV testing.
       Every field is a plain number, string or boolean; it never throws and it
       works before mount (on:false, everything else at rest).

         on       boolean  mounted and alive. false after a failure, in a game,
                           or before mount()
         quality  0-3      the current tier
         tier     string   'dither' | 'motes' | 'drift' | 'still'
         sheds    number   tiers dropped this session. > 0 means the device
                           could not afford the ambience; that is the number to
                           read off the TV
         reduced  boolean  prefers-reduced-motion is set, so quality is pinned 0
         frameMs  number   EMA of the interval between our drawn frames, 1dp.
                           THE budget number - the only one that sees GPU cost.
                           Target <= 16.7. Meaningless when looping is false
         fps      number   1000/frameMs, rounded, for reading across a room
         drawMs   number   EMA of this file's own main-thread cost per frame,
                           2dp. Canvas calls are QUEUED, so this is command
                           submission, NOT rasterisation. Do not treat it as a
                           frame budget - it is a JS/GC regression detector
         looping  boolean  is a rAF callback scheduled right now. false on a
                           still menu is correct and is the goal
         motes    number   live motes
         bursts   number   live bursts
         canvas   string   backing store as 'WxH', or '' when there is none
         px       number   backing-store pixels
         mib      number   backing-store memory, MiB at 4 bytes/px, 1dp.
                           Budget for the whole app is 30-40 on a 1 GB TV
         ratio    number   backing-store scale. ALWAYS <= 1 and NEVER
                           devicePixelRatio - see MAX_PX
         dpr      number   what the device reports, for contrast with ratio
         w, h     number   viewport in CSS px
    */
    stats: function () {
      var px = cv ? cv.width * cv.height : 0;
      return {
        on: mounted && !dead,
        quality: quality,
        tier: TIERS[quality] || 'still',
        sheds: sheds,
        reduced: reduced,
        frameMs: Math.round(frameMs * 10) / 10,
        fps: frameMs > 0 ? Math.round(1000 / frameMs) : 0,
        drawMs: Math.round(drawMs * 100) / 100,
        looping: !!rafId,
        motes: motes.length,
        bursts: bursts.length,
        canvas: cv ? cv.width + 'x' + cv.height : '',
        px: px,
        mib: Math.round(px * 4 / 104857.6) / 10,
        ratio: Math.round(ratio * 100) / 100,
        dpr: window.devicePixelRatio || 1,
        w: W, h: H
      };
    }
  };

  window.X3FFX = api;
})();
