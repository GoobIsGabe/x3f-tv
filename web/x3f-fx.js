/* X3F FX - the ambient layer the menus sit on.
   One canvas, one loop, drawn behind everything: a slow aurora, drifting motes, a
   vignette and a little grain, plus bursts when something good happens.

   Two rules it lives by, both straight off the roadmap:

   1. It does NOT run inside the games. Each game already owns a render loop, and
      the form rig and the music scheduler are two more; a fourth on a TV SoC is
      how you lose frames. Menus have no loop of their own, so this is the only
      one there - and on the launcher it REPLACES the old bubble loop rather than
      joining it.
   2. It gives frames back when it cannot afford them. The loop watches its own
      cost and sheds work in order - grain, then motes, then aurora drift - so a
      slow device degrades to a still backdrop instead of a stutter.

     X3FFX.mount({ image:'assets/ui/aurora.jpg' });
     X3FFX.burst(x, y, '#39f5c4');   // something good happened
     X3FFX.pulse(0.6);               // brief lift, e.g. on select
     X3FFX.leave('routine.html');    // fade out, then navigate
*/
(function () {
  "use strict";

  var reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function css() {
    var s = document.createElement('style');
    s.textContent = [
      '#x3ffx{position:fixed;inset:0;z-index:0;pointer-events:none;display:block}',
      'body>*:not(#x3ffx){position:relative;z-index:1}',
      /* the page arrives and leaves, instead of snapping */
      'body{opacity:0;transition:opacity .34s cubic-bezier(.2,.9,.25,1)}',
      'body.x3f-in{opacity:1}',
      'body.x3f-out{opacity:0;transform:scale(.994);transition:opacity .22s ease,transform .22s ease}',
      /* focus: a ring that breathes, so the cursor is obvious across a room */
      '@keyframes x3f-ring{0%,100%{box-shadow:0 0 0 2px var(--navring,#2ff0b0),0 10px 30px rgba(0,0,0,.45)}',
      '50%{box-shadow:0 0 0 3px var(--navring,#2ff0b0),0 0 26px -2px var(--navring,#2ff0b0),0 12px 34px rgba(0,0,0,.5)}}',
      '.x3f-nav-cur{animation:x3f-ring 2.2s ease-in-out infinite}',
      /* one sheen sweep across whatever just took focus */
      '.x3f-nav-cur::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;',
      'background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.13) 50%,transparent 65%);',
      'transform:translateX(-120%);animation:x3f-sheen .75s ease-out 1}',
      '@keyframes x3f-sheen{to{transform:translateX(120%)}}',
      /* Panels were translucent over a flat page background; over a moving
         backdrop that turns into unreadable text on an aurora. Give every
         surface its own dark ground and let the ambience live around them. */
      '.card,.ex,.pbrow,.today,.chal,.pstrip,.ach,.demobox,.method,.cwrap,.sheet,',
      '.rest,.coach{background-color:rgba(8,11,19,.80)}',
      '.rest,.coach{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}',
      '@media (prefers-reduced-motion:reduce){.x3f-nav-cur{animation:none}.x3f-nav-cur::after{display:none}',
      'body,body.x3f-out{transition:none}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  var cv, ctx, W = 0, H = 0, DPR = 1, img = null, imgOk = false;
  var motes = [], bursts = [], grain = null;
  var quality = 3;              // 3 everything, 2 no grain, 1 no motes, 0 still
  var slowFrames = 0, lastT = 0, avg = 16, pulseT = 0, running = false, hidden = false, t0 = 0;

  function resize() {
    if (!cv) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed(); grain = null;
  }

  function seed() {
    var want = quality >= 2 ? Math.round(Math.min(70, (W * H) / 26000)) : 0;
    motes.length = 0;
    for (var i = 0; i < want; i++) {
      motes.push({
        x: Math.random() * W, y: Math.random() * H,
        r: 0.6 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 9,
        a: 0.05 + Math.random() * 0.30, ph: Math.random() * 7
      });
    }
  }

  function makeGrain() {
    var n = 128, c = document.createElement('canvas');
    c.width = c.height = n;
    var g = c.getContext('2d'), d = g.createImageData(n, n);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = 128 + (Math.random() - 0.5) * 46;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 12;
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  function draw(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    avg = avg * 0.9 + (dt * 1000) * 0.1;

    // shed work before the stutter is visible, and do not climb back mid-session
    if (avg > 26) {
      slowFrames++;
      if (slowFrames > 45 && quality > 0) { quality--; slowFrames = 0; seed(); grain = null; }
    } else slowFrames = Math.max(0, slowFrames - 1);

    ctx.clearRect(0, 0, W, H);
    var t = (now - t0) / 1000;
    // Content sits ON this, so it is a wash, not a wallpaper. The first pass is a
    // near-opaque dark ground; the aurora only tints it.
    ctx.fillStyle = '#06070f';
    ctx.fillRect(0, 0, W, H);
    var lift = pulseT > now ? (pulseT - now) / 900 : 0;

    // 1. the aurora, breathing slowly
    if (imgOk) {
      var drift = quality >= 1 ? Math.sin(t * 0.06) * 0.02 : 0;
      var sc = 1.08 + drift + lift * 0.02;
      var w = W * sc, h = H * sc;
      ctx.globalAlpha = 0.34 + lift * 0.06;
      ctx.drawImage(img, (W - w) / 2 + Math.sin(t * 0.05) * W * 0.01,
                         (H - h) / 2 + Math.cos(t * 0.04) * H * 0.01, w, h);
      ctx.globalAlpha = 1;
    } else {
      var g0 = ctx.createLinearGradient(W, 0, 0, H);
      g0.addColorStop(0, 'rgba(143,125,255,.13)');
      g0.addColorStop(0.5, 'rgba(55,230,255,.05)');
      g0.addColorStop(1, 'rgba(5,3,15,0)');
      ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
    }

    // 2. motes
    if (quality >= 2) {
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.x += m.vx * dt; m.y += m.vy * dt; m.ph += dt;
        if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
        if (m.x < -10) m.x = W + 10; else if (m.x > W + 10) m.x = -10;
        var tw = m.a * (0.6 + 0.4 * Math.sin(m.ph * 1.7)) * (1 + lift);
        ctx.fillStyle = 'rgba(200,235,255,' + tw.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 7); ctx.fill();
      }
    }

    // 3. bursts - short, additive, cheap
    if (bursts.length) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (var b = bursts.length - 1; b >= 0; b--) {
        var s = bursts[b]; s.life += dt;
        var k = s.life / s.max;
        if (k >= 1) { bursts.splice(b, 1); continue; }
        var rr = s.r0 + (s.r1 - s.r0) * (1 - Math.pow(1 - k, 3));
        ctx.strokeStyle = s.c; ctx.globalAlpha = (1 - k) * 0.5;
        ctx.lineWidth = 2 + (1 - k) * 3;
        ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, 7); ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }

    // 4. vignette, then grain
    // keep the light in the corners and off the reading column
    var vg = ctx.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.10,
                                      W * 0.5, H * 0.5, Math.max(W, H) * 0.70);
    vg.addColorStop(0, 'rgba(4,6,12,.55)');
    vg.addColorStop(0.55, 'rgba(4,6,12,.30)');
    vg.addColorStop(1, 'rgba(0,0,0,.72)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    if (quality >= 3) {
      if (!grain) grain = makeGrain();
      var p = ctx.createPattern(grain, 'repeat');
      ctx.save(); ctx.globalAlpha = 0.5;
      ctx.translate((t * 7) % 128 - 128, (t * 5) % 128 - 128);
      ctx.fillStyle = p; ctx.fillRect(0, 0, W + 128, H + 128);
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  function loop(now) {
    if (!running) return;
    if (!hidden) draw(now);
    requestAnimationFrame(loop);
  }

  function mount(o) {
    o = o || {};
    if (document.getElementById('x3ffx')) return api;
    css();
    cv = document.createElement('canvas');
    cv.id = 'x3ffx';
    ctx = cv.getContext('2d');
    (document.body || document.documentElement).insertBefore(cv, document.body.firstChild);

    if (reduced) quality = 1;
    if (o.quality != null) quality = o.quality;

    if (o.image) {
      img = new Image();
      img.onload = function () { imgOk = true; };
      img.onerror = function () { imgOk = false; };   // procedural gradient instead
      img.src = o.image;
    }
    lastT = t0 = performance.now();
    resize();
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      hidden = document.visibilityState !== 'visible';
    });
    running = true;
    requestAnimationFrame(loop);

    document.body.classList.add('x3f-in');
    wireLinks();
    return api;
  }

  /* Internal navigation should feel like a move, not a page load. */
  function leave(href) {
    if (!href) return;
    if (reduced) { location.href = href; return; }
    document.body.classList.add('x3f-out');
    setTimeout(function () { location.href = href; }, 190);
  }
  function wireLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(https?:|mailto:)/.test(href) || a.target) return;
      e.preventDefault();
      pulse(0.5);
      leave(href);
    }, true);
  }

  function burst(x, y, colour) {
    if (quality < 1) return;
    bursts.push({
      x: x == null ? W / 2 : x, y: y == null ? H / 2 : y,
      r0: 8, r1: Math.min(W, H) * 0.42, life: 0, max: 0.75,
      c: colour || '#39f5c4'
    });
    if (bursts.length > 6) bursts.shift();
  }
  function pulse(amount) { pulseT = performance.now() + 900 * (amount == null ? 1 : amount); }

  var api = {
    mount: mount, burst: burst, pulse: pulse, leave: leave,
    quality: function (q) { if (q != null) { quality = q; seed(); grain = null; } return quality; },
    stats: function () { return { quality: quality, frameMs: Math.round(avg), motes: motes.length }; }
  };
  window.X3FFX = api;
})();
