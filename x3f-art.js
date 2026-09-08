/* X3F ART - generated card art, as SVG data URIs.

   ─────────────────────────────────────────────────────────────────────────
   WHY GENERATE IT RATHER THAN SHIP IT
   ─────────────────────────────────────────────────────────────────────────

   The home screen wants a distinct image behind every card. Eleven of them, at
   a size that reads across a room, is somewhere between 400 KB and a megabyte
   of JPEG - against a sub-5 MB APK of which about half is already PNG. And a
   missing file degrades to an empty grey box, which looks like a broken screen
   rather than a plain one.

   This project already made the same call twice, for the same reasons: the
   soundtrack is synthesised in WebAudio rather than downloaded, and the ambient
   backdrop is drawn rather than shipped. So the art is too.

   Each piece is a few hundred bytes of SVG built once at load, handed to CSS as
   a data URI, and then it is an ordinary background image with no per-frame
   cost at all. Nothing here runs inside a game loop.

   THIS IS NOT A PLACEHOLDER. docs/ART-DIRECTION.md specifies 35 photographic
   assets to be generated with getimg, and they would be better. But they are
   also optional: if a real file exists at the path a card asks for, the card
   uses it and this never runs. What this guarantees is that the app never has
   an empty box in it, at any point, offline, on a fresh install, forever.

   ─────────────────────────────────────────────────────────────────────────
   THE HOUSE STYLE, IN CODE
   ─────────────────────────────────────────────────────────────────────────

   Deep graphite ground, one directional light, restrained violet-to-cyan
   accent, nothing bright in the middle where text goes. Every piece obeys the
   same three rules as the specified photography:

     1. Dark enough that white text over it stays legible - the brightest
        element in any card is about 45% luminance and it is never central.
     2. Nothing meaningful within 6% of an edge, because televisions crop.
     3. No text, ever. Text is HTML so it scales with the type system.

     X3FArt.card('bloom')    -> a data: URI for a 16:9 card
     X3FArt.plate('deadlift')-> a data: URI for a 4:3 movement plate
     X3FArt.css(el, uri)     -> set it as a background
*/
(function () {
  "use strict";

  /* Read from the design tokens so the art can never drift from the UI. Falls
     back to the literal values if the stylesheet has not applied yet. */
  function tok(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      if (v && v.trim()) return v.trim();
    } catch (e) {}
    return fallback;
  }

  function palette() {
    return {
      bg: tok('--bg', '#0F1114'),
      lift: tok('--bg-lift', '#14171E'),
      surface: tok('--surface-2', '#232936'),
      violet: tok('--accent', '#7C6CFF'),
      cyan: tok('--cyan', '#35D8F5'),
      mint: tok('--mint', '#33E2AE'),
      gold: tok('--gold', '#FFC94A'),
      hot: tok('--hot', '#FF6376'),
      amber: tok('--amber', '#FF9E4A')
    };
  }

  /* A tiny deterministic PRNG so a given key always produces the same picture.
     Art that reshuffles on every load reads as a glitch, not as variety. */
  function rng(seed) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return function () {
      h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
      return h / 4294967296;
    };
  }

  function uri(svg) {
    /* encodeURIComponent rather than base64: it is shorter for SVG, and it stays
       readable in devtools, which matters when a card looks wrong. */
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* Every card shares a ground and a vignette, so eleven different subjects
     still read as one set. */
  function ground(w, h, p, id) {
    return '' +
      '<defs>' +
        '<radialGradient id="g' + id + '" cx="28%" cy="18%" r="95%">' +
          '<stop offset="0" stop-color="' + p.surface + '"/>' +
          '<stop offset="1" stop-color="' + p.bg + '"/>' +
        '</radialGradient>' +
        '<linearGradient id="v' + id + '" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="' + p.violet + '" stop-opacity=".78"/>' +
          '<stop offset="1" stop-color="' + p.cyan + '" stop-opacity=".78"/>' +
        '</linearGradient>' +
        /* One soft light source, upper left, exactly as the photographic brief
           specifies. Small blur radius so it is cheap to rasterise once. */
        '<filter id="b' + id + '" x="-30%" y="-30%" width="160%" height="160%">' +
          '<feGaussianBlur stdDeviation="' + (w * 0.045).toFixed(1) + '"/>' +
        '</filter>' +
      '</defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#g' + id + ')"/>';
  }

  /* Darkens the lower third, which is where a card's title sits. */
  function scrim(w, h, p) {
    return '<rect x="0" y="' + (h * 0.45) + '" width="' + w + '" height="' + (h * 0.55) + '"' +
           ' fill="' + p.bg + '" opacity=".55"/>';
  }

  var W = 640, H = 360;   /* 16:9, rasterised by the browser to whatever size */

  /* ── the eight games ─────────────────────────────────────────────────────
     Each is one clear abstract subject in the upper-left two thirds, leaving
     the lower right dark for the title. They are deliberately not literal:
     a picture of a barbell tells you nothing a label does not. */
  var GAMES = {
    /* A vine unfurling - growth, slow, organic. */
    bloom: function (p, r) {
      var s = '';
      for (var i = 0; i < 5; i++) {
        var x = 90 + i * 34, y = 250 - i * 26, rr = 26 - i * 3;
        s += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rr + '" ry="' + (rr * 0.55) +
             '" fill="url(#vA)" opacity="' + (0.30 + i * 0.11).toFixed(2) +
             '" transform="rotate(' + (-38 + i * 9) + ' ' + x + ' ' + y + ')"/>';
      }
      return '<path d="M70 320 C 120 250, 150 190, 250 130" stroke="' + p.mint +
             '" stroke-width="5" fill="none" opacity=".55"/>' + s;
    },
    /* A column of water rising, droplets caught in rim light. */
    splash: function (p, r) {
      var s = '<path d="M150 330 C 150 230, 210 200, 210 120 C 210 200, 270 230, 270 330 Z" fill="url(#vA)" opacity=".40"/>';
      for (var i = 0; i < 9; i++) {
        s += '<circle cx="' + (120 + r() * 220).toFixed(0) + '" cy="' + (70 + r() * 200).toFixed(0) +
             '" r="' + (2 + r() * 6).toFixed(1) + '" fill="' + p.cyan + '" opacity="' + (0.25 + r() * 0.5).toFixed(2) + '"/>';
      }
      return s;
    },
    /* A collapsing core, ribbons spiralling in. Mostly empty black. */
    nova: function (p, r) {
      var s = '<circle cx="200" cy="150" r="34" fill="url(#vA)" opacity=".85" filter="url(#bA)"/>' +
              '<circle cx="200" cy="150" r="10" fill="' + p.cyan + '" opacity=".9"/>';
      for (var i = 0; i < 3; i++) {
        var rr = 60 + i * 42;
        s += '<ellipse cx="200" cy="150" rx="' + rr + '" ry="' + (rr * 0.34) + '" fill="none" stroke="' +
             p.violet + '" stroke-width="2" opacity="' + (0.4 - i * 0.1).toFixed(2) +
             '" transform="rotate(' + (i * 46 - 20) + ' 200 150)"/>';
      }
      for (var j = 0; j < 26; j++) {
        s += '<circle cx="' + (r() * W).toFixed(0) + '" cy="' + (r() * H * 0.8).toFixed(0) +
             '" r="' + (0.6 + r() * 1.5).toFixed(1) + '" fill="#ECEEF2" opacity="' + (0.15 + r() * 0.45).toFixed(2) + '"/>';
      }
      return s;
    },
    /* One continuous ribbon: a long-exposure of a single perfect repetition. */
    flow: function (p, r) {
      return '<path d="M60 250 C 150 60, 250 300, 340 130 C 400 30, 450 200, 520 120" ' +
             'stroke="url(#vA)" stroke-width="9" fill="none" stroke-linecap="round" opacity=".85"/>' +
             '<path d="M60 250 C 150 60, 250 300, 340 130 C 400 30, 450 200, 520 120" ' +
             'stroke="' + p.cyan + '" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>';
    },
    /* An empty lit platform. Anticipation, not combat. */
    max: function (p, r) {
      return '<ellipse cx="220" cy="270" rx="130" ry="34" fill="url(#vA)" opacity=".35"/>' +
             '<path d="M150 40 L290 40 L350 270 L90 270 Z" fill="' + p.violet + '" opacity=".10"/>' +
             '<ellipse cx="220" cy="270" rx="60" ry="16" fill="' + p.violet + '" opacity=".45" filter="url(#bA)"/>';
    },
    /* A held line: time under tension. */
    zone: function (p, r) {
      var s = '<rect x="80" y="150" width="330" height="8" rx="4" fill="url(#vA)" opacity=".75"/>';
      for (var i = 0; i < 7; i++) {
        s += '<rect x="' + (80 + i * 48) + '" y="' + (150 - 26 + (i % 2) * 6) + '" width="6" height="26" rx="3" fill="' +
             p.mint + '" opacity="' + (0.2 + i * 0.08).toFixed(2) + '"/>';
      }
      return s;
    },
    /* A large mass, and something small facing it. */
    boss: function (p, r) {
      return '<path d="M300 60 L400 130 L370 260 L230 260 L200 130 Z" fill="url(#vA)" opacity=".45"/>' +
             '<path d="M300 60 L400 130 L370 260 L230 260 L200 130 Z" fill="none" stroke="' + p.hot + '" stroke-width="2" opacity=".55"/>' +
             '<circle cx="110" cy="240" r="16" fill="' + p.cyan + '" opacity=".7"/>';
    },
    /* Two arcs pressing against each other, equal and straining. */
    duel: function (p, r) {
      return '<path d="M70 300 C 190 300, 190 90, 300 90" stroke="' + p.violet + '" stroke-width="8" fill="none" opacity=".75" stroke-linecap="round"/>' +
             '<path d="M570 90 C 450 90, 450 300, 340 300" stroke="' + p.cyan + '" stroke-width="8" fill="none" opacity=".75" stroke-linecap="round"/>' +
             '<circle cx="320" cy="195" r="26" fill="url(#vA)" opacity=".8" filter="url(#bA)"/>';
    },
    /* A standing waveform. */
    rhythm: function (p, r) {
      var s = '';
      for (var i = 0; i < 11; i++) {
        var hgt = 30 + Math.abs(Math.sin(i * 1.1)) * 150;
        s += '<rect x="' + (80 + i * 34) + '" y="' + (250 - hgt) + '" width="14" height="' + hgt +
             '" rx="7" fill="url(#vA)" opacity="' + (0.35 + (i % 3) * 0.2).toFixed(2) + '"/>';
      }
      return s;
    },
    /* The hero card: a bar with a band drawn taut. The one literal image, because
       it is the one card that is about the thing itself. */
    workout: function (p, r) {
      return '<rect x="150" y="120" width="300" height="12" rx="6" fill="#C9D1E0" opacity=".85"/>' +
             '<path d="M160 126 C 200 250, 400 250, 440 126" stroke="' + p.mint + '" stroke-width="6" fill="none" opacity=".9"/>' +
             '<path d="M160 126 C 200 250, 400 250, 440 126" stroke="' + p.mint + '" stroke-width="16" fill="none" opacity=".22" filter="url(#bA)"/>' +
             '<rect x="250" y="250" width="100" height="10" rx="5" fill="#8B93A5" opacity=".6"/>';
    },
    ascent: function (p, r) {
      return '<path d="M60 320 L200 120 L300 240 L420 60 L580 320 Z" fill="url(#vA)" opacity=".35"/>' +
             '<path d="M60 320 L200 120 L300 240 L420 60 L580 320" fill="none" stroke="' + p.cyan + '" stroke-width="2" opacity=".6"/>';
    }
  };

  function card(key) {
    var p = palette(), r = rng('card:' + key);
    var body = (GAMES[key] || GAMES.flow)(p, r);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
      ground(W, H, p, 'A') + body + scrim(W, H, p) + '</svg>';
    return uri(svg);
  }

  /* ── movement plates ────────────────────────────────────────────────────
     Deliberately abstract rather than a figure: the app already has a real
     animated figure (x3f-form.js) that mirrors your live force, and a static
     drawing next to it would be a worse version of the same idea. What a plate
     is FOR is telling movements apart at a glance in a list, so each is a
     simple diagram of the movement's own shape - where the band runs, which way
     the force goes. */
  var PW = 480, PH = 360;

  var PLATES = {
    'chest-press':    { arrow: [[120, 200], [370, 165]], anchor: 'back' },
    'tricep-press':   { arrow: [[200, 130], [330, 235]], anchor: 'back' },
    'overhead-press': { arrow: [[240, 250], [240, 80]],  anchor: 'plate' },
    'front-squat':    { arrow: [[240, 250], [240, 120]], anchor: 'plate' },
    'pec-crossover':  { arrow: [[110, 170], [370, 170]], anchor: 'loop' },
    'split-squat':    { arrow: [[190, 260], [280, 110]], anchor: 'foot' },
    'upright-row':    { arrow: [[240, 260], [240, 150]], anchor: 'plate' },
    'deadlift':       { arrow: [[240, 270], [240, 130]], anchor: 'plate' },
    'bent-row':       { arrow: [[300, 120], [180, 235]], anchor: 'plate' },
    'drag-curl':      { arrow: [[240, 265], [240, 155]], anchor: 'plate' },
    'calf-raise':     { arrow: [[240, 250], [240, 195]], anchor: 'balls' }
  };

  function plate(slug) {
    var p = palette(), r = rng('plate:' + slug);
    var d = PLATES[slug] || PLATES.deadlift;
    var a = d.arrow[0], b = d.arrow[1];

    var anchor = '';
    if (d.anchor === 'plate' || d.anchor === 'balls' || d.anchor === 'foot') {
      /* The ground plate, drawn where the band actually meets it. The calf raise
         is the one movement that is NOT midfoot - balls of the feet, heels off
         the back - so its plate is drawn offset, which is the whole difference
         between doing it right and doing it wrong. */
      var px = d.anchor === 'balls' ? 200 : 240;
      anchor = '<rect x="' + (px - 90) + '" y="292" width="180" height="14" rx="4" fill="#8B93A5" opacity=".55"/>' +
               (d.anchor === 'balls'
                 ? '<rect x="' + (px + 60) + '" y="292" width="40" height="14" rx="4" fill="' + p.gold + '" opacity=".4"/>'
                 : '');
    } else if (d.anchor === 'back') {
      anchor = '<path d="M150 210 C 200 260, 280 260, 330 210" stroke="#8B93A5" stroke-width="6" fill="none" opacity=".5"/>';
    } else if (d.anchor === 'loop') {
      anchor = '<ellipse cx="240" cy="210" rx="95" ry="30" fill="none" stroke="#8B93A5" stroke-width="5" opacity=".5"/>';
    }

    /* The band, bowing under load, and the direction the work goes. */
    var mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.16;
    var my = (a[1] + b[1]) / 2 + (a[0] - b[0]) * 0.16;

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PW + ' ' + PH + '" width="' + PW + '" height="' + PH + '">' +
      ground(PW, PH, p, 'B') +
      anchor +
      '<path d="M' + a[0] + ' ' + a[1] + ' Q ' + mx.toFixed(0) + ' ' + my.toFixed(0) + ' ' + b[0] + ' ' + b[1] + '" ' +
        'stroke="url(#vB)" stroke-width="10" fill="none" stroke-linecap="round" opacity=".9"/>' +
      '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="13" fill="' + p.mint + '" opacity=".9"/>' +
      '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="9" fill="#C9D1E0" opacity=".6"/>' +
      '</svg>';
    return uri(svg);
  }

  function css(el, u) { if (el) el.style.backgroundImage = 'url("' + u + '")'; }

  window.X3FArt = { card: card, plate: plate, css: css, games: Object.keys(GAMES), plates: Object.keys(PLATES) };
})();
