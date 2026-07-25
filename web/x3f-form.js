/* X3F FORM - live form demonstrator.
   An animated figure performing the exact X3 movement, driven either by your
   LIVE force (in a game: pull harder and it rises, near max it strains) or by a
   tempo loop (on the Routines page, as a setup/coaching preview).

   It is a real rig, not a clip: poses are authored as hip/hand/foot targets and
   the knees and elbows are solved with two-bone IK, so the figure interpolates
   smoothly anywhere in the range - including the short partial reps of an X3
   burnout set.

   Public API
     X3FForm.create(canvas, {exercise, mode:'live'|'tempo', getN, tempo, theme, compact})
       -> {setExercise, setMode, setTempo, resize, destroy, state}
     X3FForm.mount({exercise, getN, host, toggleBtn, theme})
       -> floating panel inside a game stage (returns the instance)
*/
(function () {
  "use strict";

  /* ---------------- rig proportions (in figure units) ---------------- */
  var LT = 1.14, LS = 1.14, TORSO = 1.55, LU = 0.78, LF = 0.78, HEAD = 0.33;

  /* Pose fields:
       hx,hy    hip position (x from centre, y above ground)
       lean     torso angle from vertical, + = hinged forward
       hand     LEAD hand offset from the shoulder joint  [x, y(+down)]
       hand2    off hand offset (defaults to hand, nudged for depth)
       foot     front ankle [x, lift]      foot2  rear ankle [x, lift] (optional)
       head     head tilt      grip  bar length      ebow  elbow bend side (+1 back/down, -1 up/out)
     a = stretched / weak end of the range, b = contracted / strong end. */
  var P = function (o) { return o; };
  var EXR = {
    'deadlift': {
      anchor: 'foot', ebow: 1, strongAt: 'top', label: 'Deadlift', verb: 'PULL',
      a: P({ hx: -0.34, hy: 1.62, lean: 0.94, hand: [0.34, 1.44], foot: [0, 0], head: -0.18, grip: 0.95 }),
      b: P({ hx: 0.00, hy: 2.44, lean: 0.14, hand: [0.26, 1.46], foot: [0, 0], head: 0.00, grip: 0.95 }),
      tipA: 'Flat back · hinge the hips', tipB: 'Glutes · no knee lockout'
    },
    'bent-row': {
      anchor: 'foot', ebow: 1, strongAt: 'mid', label: 'Bent Row', verb: 'ROW',
      a: P({ hx: -0.30, hy: 2.08, lean: 0.84, hand: [0.24, 1.46], foot: [0, 0], head: -0.10, grip: 1.0 }),
      b: P({ hx: -0.30, hy: 2.08, lean: 0.80, hand: [-0.10, 0.62], foot: [0, 0], head: -0.06, grip: 1.0 }),
      tipA: 'Neutral spine, straight diagonal', tipB: 'Elbows back · squeeze the lats'
    },
    'drag-curl': {
      anchor: 'foot', ebow: 1, strongAt: 'top', label: 'Drag Curl', verb: 'CURL',
      a: P({ hx: 0, hy: 2.42, lean: 0.07, hand: [0.28, 1.40], foot: [0, 0], head: 0, grip: 0.85 }),
      b: P({ hx: 0, hy: 2.42, lean: 0.05, hand: [0.34, 0.52], foot: [0, 0], head: 0.04, grip: 0.85 }),
      tipA: 'Keep a slight bend - never rest', tipB: 'Drag it close · elbows back'
    },
    'chest-press': {
      anchor: 'shoulder', ebow: 1, strongAt: 'top', label: 'Chest Press', verb: 'PRESS',
      a: P({ hx: 0, hy: 2.40, lean: 0.18, hand: [0.26, 0.20], foot: [0.05, 0], head: 0, grip: 0.95 }),
      b: P({ hx: 0, hy: 2.40, lean: 0.20, hand: [1.40, 0.44], foot: [0.05, 0], head: 0.03, grip: 0.95 }),
      tipA: 'Elbows in toward the midline', tipB: 'Press slightly DOWN · no lockout'
    },
    'tricep-press': {
      anchor: 'shoulder', ebow: 1, strongAt: 'top', label: 'Tricep Press', verb: 'PRESS',
      a: P({ hx: -0.10, hy: 2.30, lean: 0.56, hand: [0.30, -0.34], foot: [0.05, 0], head: 0.06, grip: 0.8 }),
      b: P({ hx: -0.10, hy: 2.30, lean: 0.56, hand: [0.92, 0.72], foot: [0.05, 0], head: 0.06, grip: 0.8 }),
      tipA: 'Bar at eyebrow height', tipB: 'Only the elbow hinges'
    },
    'pec-crossover': {
      anchor: 'shoulder', ebow: -1, strongAt: 'top', label: 'Pec Crossover', verb: 'SQUEEZE',
      a: P({ hx: 0, hy: 2.40, lean: 0.12, hand: [-0.40, 0.30], hand2: [-0.30, 0.05], foot: [0.05, 0], head: 0, grip: 0 }),
      b: P({ hx: 0, hy: 2.40, lean: 0.16, hand: [1.22, 0.56], hand2: [1.10, 0.20], foot: [0.05, 0], head: 0.02, grip: 0 }),
      tipA: 'Wide - feel the stretch', tipB: 'Cross the body · squeeze'
    },
    'overhead-press': {
      anchor: 'foot', ebow: 1, strongAt: 'top', label: 'Overhead Press', verb: 'PRESS',
      a: P({ hx: 0, hy: 2.42, lean: 0.06, hand: [0.46, -0.10], foot: [0.02, 0], head: 0, grip: 1.05 }),
      b: P({ hx: 0, hy: 2.46, lean: 0.02, hand: [0.24, -1.38], foot: [0.02, 0], head: 0.12, grip: 1.05 }),
      tipA: 'Start at chin height', tipB: 'Head through the window'
    },
    'upright-row': {
      anchor: 'foot', ebow: -1, strongAt: 'mid', label: 'Upright Row', verb: 'ROW',
      a: P({ hx: 0, hy: 2.42, lean: 0.06, hand: [0.30, 1.34], foot: [0.02, 0], head: 0, grip: 0.6 }),
      b: P({ hx: 0, hy: 2.42, lean: 0.04, hand: [0.44, 0.34], foot: [0.02, 0], head: 0.02, grip: 0.6 }),
      tipA: 'Narrow grip, light band', tipB: 'Mid-chest ONLY - never the chin'
    },
    'front-squat': {
      /* bar rests on the front of the shoulders, so the hand sits almost on the
         shoulder joint - the elbow has to solve FORWARD (+1) or it swings up
         through the head */
      anchor: 'foot', ebow: 1, strongAt: 'top', label: 'Front Squat', verb: 'DRIVE',
      a: P({ hx: -0.22, hy: 1.16, lean: 0.44, hand: [0.40, -0.06], foot: [0.06, 0], head: 0, grip: 1.0 }),
      b: P({ hx: 0.00, hy: 2.42, lean: 0.10, hand: [0.40, -0.10], foot: [0.06, 0], head: 0, grip: 1.0 }),
      tipA: 'Hips straight down · knee over toe', tipB: 'Stand tall - no lockout'
    },
    'split-squat': {
      anchor: 'foot', ebow: 1, strongAt: 'top', label: 'Split Squat', verb: 'DRIVE',
      a: P({ hx: -0.08, hy: 1.24, lean: 0.20, hand: [0.40, -0.08], foot: [0.52, 0], foot2: [-0.86, 0.80], head: 0, grip: 1.0 }),
      b: P({ hx: 0.02, hy: 2.34, lean: 0.10, hand: [0.40, -0.12], foot: [0.52, 0], foot2: [-0.86, 0.74], head: 0, grip: 1.0 }),
      tipA: 'Rear knee nearly to the floor', tipB: 'All the weight on the FRONT leg'
    },
    'calf-raise': {
      /* balls of the feet on the band channel, heels off the back edge and never
         resting on the floor - so even the bottom of the range keeps a lift */
      anchor: 'foot', plate: 'ball', ebow: 1, strongAt: 'top', label: 'Calf Raise', verb: 'RAISE',
      a: P({ hx: 0, hy: 2.30, lean: 0.05, hand: [0.30, 1.42], foot: [0, 0.10], head: 0, grip: 0.95 }),
      b: P({ hx: 0, hy: 2.52, lean: 0.05, hand: [0.30, 1.42], foot: [0, 0.90], head: 0, grip: 0.95 }),
      tipA: 'Heels never touch down', tipB: 'All the way up on the balls'
    }
  };

  /* ---------------- maths ---------------- */
  function lerp(a, b, t) { return a + (b - a) * t; }
  /* mix two #rrggbb colours - used to flush the figure as the strain climbs */
  function hex(c) { c = c.replace('#', ''); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]; var n = parseInt(c, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) {
    if (a.charAt(0) !== '#' || b.charAt(0) !== '#') return a;
    var x = hex(a), y = hex(b);
    return 'rgb(' + Math.round(lerp(x[0], y[0], t)) + ',' + Math.round(lerp(x[1], y[1], t)) + ',' + Math.round(lerp(x[2], y[2], t)) + ')';
  }
  function lp2(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
  function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
  /* two-bone IK: joint between root and target, bent to one side */
  function ik(ax, ay, bx, by, l1, l2, side) {
    var dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1e-4;
    var ux = dx / d, uy = dy / d;
    var dd = cl(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    var a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
    var h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    return { x: ax + ux * a - uy * h * side, y: ay + uy * a + ux * h * side };
  }

  /* How tall this rig gets, in figure units, counting whichever is higher: the
     head or the bar overhead. Poses are measured across the whole range and the
     largest wins, so the scale is fixed for a movement and the figure never
     grows or shrinks mid-rep. */
  function reach(p) {
    var neck = p.hy + TORSO * Math.cos(p.lean);
    return 0.24 + Math.max(neck + HEAD * 2 + 0.24, neck - p.hand[1] + 0.6);
  }
  function span(ex) {
    if (ex.__span == null) ex.__span = Math.max(reach(ex.a), reach(ex.b));
    return ex.__span;
  }

  function blend(ex, t) {
    var a = ex.a, b = ex.b, o = {};
    o.hx = lerp(a.hx, b.hx, t); o.hy = lerp(a.hy, b.hy, t);
    o.lean = lerp(a.lean, b.lean, t); o.head = lerp(a.head || 0, b.head || 0, t);
    o.grip = lerp(a.grip == null ? 0.9 : a.grip, b.grip == null ? 0.9 : b.grip, t);
    o.hand = lp2(a.hand, b.hand, t);
    o.hand2 = lp2(a.hand2 || [a.hand[0] * 0.9, a.hand[1] + 0.05], b.hand2 || [b.hand[0] * 0.9, b.hand[1] + 0.05], t);
    o.foot = lp2(a.foot || [0, 0], b.foot || [0, 0], t);
    if (a.foot2 || b.foot2) o.foot2 = lp2(a.foot2 || a.foot, b.foot2 || b.foot, t);
    return o;
  }

  /* ---------------- the renderer ---------------- */
  var DEF_THEME = { accent: '#2ff0b0', band: '#ffd35c', skin: '#dfe9ff', deep: '#7b8ba8', dim: '#8593a9', bg: 'rgba(255,255,255,.03)', strain: '#ff5d78' };

  function create(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var theme = Object.assign({}, DEF_THEME, opts.theme || {});
    var ex = EXR[opts.exercise] || EXR['deadlift'];
    var mode = opts.mode || 'tempo';
    var getN = opts.getN || function () { return 0; };
    var tempo = opts.tempo || 3000;
    var compact = !!opts.compact;

    var W = 0, H = 0, DPR = 1;
    var t = 0, tgt = 0, phase = 0, vel = 0, dir = 0;
    var strain = 0, sweat = [], ghosts = [];
    var peak = 0, peakDecay = 0, repTop = 0, burnout = 0, reps = 0, wasLow = true;
    var last = performance.now(), acc = 0, alive = true, hidden = false;

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || canvas.width; H = canvas.clientHeight || canvas.height;
      if (!W || !H) return;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    /* ---- drawing helpers ---- */
    function limb(x1, y1, x2, y2, w1, w2, col) {
      var dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1e-4;
      var nx = -dy / d, ny = dx / d;
      ctx.beginPath();
      ctx.moveTo(x1 + nx * w1, y1 + ny * w1);
      ctx.lineTo(x2 + nx * w2, y2 + ny * w2);
      ctx.lineTo(x2 - nx * w2, y2 - ny * w2);
      ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
      ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.beginPath(); ctx.arc(x2, y2, w2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x1, y1, w1, 0, 7); ctx.fill();
    }
    function bandCurve(x1, y1, x2, y2, stretch, u) {
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      var sag = (1 - cl(stretch, 0, 1)) * u * 0.55;
      var lw = lerp(u * 0.17, u * 0.09, cl(stretch, 0, 1));
      ctx.lineCap = 'round';
      for (var s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.moveTo(x1 + s * u * 0.05, y1);
        ctx.quadraticCurveTo(mx + s * u * 0.07, my + sag, x2 + s * u * 0.05, y2);
        ctx.strokeStyle = theme.band; ctx.globalAlpha = 0.85; ctx.lineWidth = lw; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (stretch > 0.72) {   // taut band glows in the strong range
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my + sag, x2, y2);
        ctx.strokeStyle = 'rgba(255,235,150,' + ((stretch - 0.72) / 0.28 * 0.5) + ')';
        ctx.lineWidth = lw * 2.4; ctx.stroke(); ctx.restore();
      }
    }
    function barEndOn(x, y, u, len, glow) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.22);
      var h = Math.max(u * 0.42, u * len * 0.55), w = u * 0.17;
      var g = ctx.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, '#5d6b80'); g.addColorStop(0.4, '#e6eefc'); g.addColorStop(1, '#78879c');
      ctx.fillStyle = g;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-w, -h, w * 2, h * 2, w); ctx.fill(); }
      else ctx.fillRect(-w, -h, w * 2, h * 2);
      if (glow > 0.5) { ctx.shadowColor = theme.band; ctx.shadowBlur = u * 0.9 * glow; ctx.fill(); ctx.shadowBlur = 0; }
      ctx.restore();
    }

    function figure(p, u, gx, gy, alpha, col) {
      var hip = { x: gx + p.hx * u, y: gy - p.hy * u };
      var neck = { x: hip.x + Math.sin(p.lean) * TORSO * u, y: hip.y - Math.cos(p.lean) * TORSO * u };
      var sho = { x: neck.x - Math.sin(p.lean) * u * 0.1, y: neck.y + Math.cos(p.lean) * u * 0.06 };
      var hd = {
        x: neck.x + Math.sin(p.lean + p.head) * u * (HEAD + 0.24),
        y: neck.y - Math.cos(p.lean + p.head) * u * (HEAD + 0.24)
      };
      /* The foot is a rigid body hinged on its BALL, and that contact point is
         pinned to the floor. Given a heel-lift fraction we rotate the foot about
         the contact and read the ankle off the result - so rising onto the toes
         carries the ankle up and forward over the contact, exactly like a calf
         raise, and the toes never leave the plate. */
      function leg(f, w) {
        var th = footAngle(f[1]);
        var cx = gx + f[0] * u + BALL * u, cy = gy;      // ball contact on the plate
        var vx = -BALL * u, vy = -ANKH * u;              // contact -> ankle, at rest
        var ank = {
          x: cx + vx * Math.cos(th) - vy * Math.sin(th),
          y: cy + vx * Math.sin(th) + vy * Math.cos(th)
        };
        var kn = ik(hip.x, hip.y, ank.x, ank.y, LT * u, LS * u, -1);
        return { ank: ank, kn: kn, w: w, th: th, cx: cx, cy: cy };
      }
      function arm(hoff, w) {
        var hnd = { x: sho.x + hoff[0] * u, y: sho.y + hoff[1] * u };
        var el = ik(sho.x, sho.y, hnd.x, hnd.y, LU * u, LF * u, ex.ebow);
        return { hnd: hnd, el: el, w: w };
      }
      var deep = col ? col.deep : theme.deep, skin = col ? col.skin : theme.skin;
      if (!col && strain > 0.02) skin = mix(skin, theme.strain, strain * 0.26);
      var fl = leg(p.foot2 || [p.foot[0] - 0.16, p.foot[1]], u * 0.15);
      var fr = leg(p.foot, u * 0.17);
      var al = arm(p.hand2, u * 0.11), ar = arm(p.hand, u * 0.125);

      ctx.globalAlpha = alpha;
      // far limbs first, darker (cheap depth)
      limb(hip.x - u * 0.06, hip.y, fl.kn.x, fl.kn.y, u * 0.19, u * 0.13, deep);
      limb(fl.kn.x, fl.kn.y, fl.ank.x, fl.ank.y, u * 0.13, u * 0.09, deep);
      foot(fl, u, deep);
      limb(sho.x - u * 0.05, sho.y + u * 0.04, al.el.x, al.el.y, u * 0.12, u * 0.09, deep);
      limb(al.el.x, al.el.y, al.hnd.x, al.hnd.y, u * 0.09, u * 0.07, deep);

      // torso
      var tg = ctx.createLinearGradient(hip.x, hip.y, neck.x, neck.y);
      tg.addColorStop(0, deep); tg.addColorStop(1, skin);
      limb(hip.x, hip.y, neck.x, neck.y, u * 0.30, u * 0.25, tg);
      // near leg
      limb(hip.x + u * 0.05, hip.y, fr.kn.x, fr.kn.y, u * 0.21, u * 0.14, skin);
      limb(fr.kn.x, fr.kn.y, fr.ank.x, fr.ank.y, u * 0.14, u * 0.10, skin);
      foot(fr, u, skin);
      // head
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hd.x, hd.y, HEAD * u, 0, 7); ctx.fill();
      face(hd, p, u, skin);
      // near arm - outlined and nudged forward so it never melts into the torso
      if (!col) {
        ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(8,14,26,.45)'; ctx.lineWidth = u * 0.30;
        ctx.beginPath(); ctx.moveTo(sho.x, sho.y); ctx.lineTo(ar.el.x, ar.el.y); ctx.lineTo(ar.hnd.x, ar.hnd.y); ctx.stroke();
        ctx.restore();
      }
      limb(sho.x, sho.y, ar.el.x, ar.el.y, u * 0.13, u * 0.10, skin);
      limb(ar.el.x, ar.el.y, ar.hnd.x, ar.hnd.y, u * 0.10, u * 0.08, skin);
      ctx.globalAlpha = 1;
      return { hand: ar.hnd, hand2: al.hnd, sho: sho, ank: fr.ank, hip: hip, head: hd,
               contact: { x: fr.cx, y: fr.cy } };
    }
    /* The BALL of the foot is the pivot, not the ankle: as the ankle rises the
       heel swings up and the toes stay planted. That is a calf raise. Rotating
       about the ankle (or the other way) gives you a toe raise, which is wrong
       for every X3 movement. The angle is solved from how far the ankle has
       actually left the floor, so the toe never lifts off or sinks through it. */
    /* BALL = how far the ball of the foot sits ahead of the ankle,
       ANKH = ankle height off the floor, both in figure units. */
    var BALL = 0.38, ANKH = 0.20, HEELB = 0.22, TOEF = 0.16, THICK = 0.13;
    function footAngle(lift) { return cl(lift || 0, 0, 1) * 1.2; }   // up to ~69 degrees
    /* drawn in contact-local space: the origin IS the point touching the floor */
    function foot(lg, u, col) {
      ctx.save();
      ctx.translate(lg.cx, lg.cy); ctx.rotate(lg.th);
      ctx.fillStyle = col;
      var x0 = -(BALL + HEELB) * u, w = (BALL + HEELB + TOEF) * u;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x0, -THICK * u, w, THICK * u, u * 0.07); ctx.fill(); }
      else ctx.fillRect(x0, -THICK * u, w, THICK * u);
      // heel block up to the ankle, so a raised heel reads as a heel
      ctx.beginPath();
      ctx.moveTo(-(BALL + HEELB - 0.04) * u, -THICK * u);
      ctx.lineTo(-(BALL + 0.02) * u, -(ANKH + 0.03) * u);
      ctx.lineTo(-(BALL - 0.13) * u, -(ANKH + 0.02) * u);
      ctx.lineTo(-(BALL - 0.18) * u, -THICK * u);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    /* the X3 ground plate the band runs under */
    function plate(x, gy, u, ball) {
      var x0 = x + (ball ? 0.06 : -0.34) * u, x1 = x + (BALL + 0.24) * u, h = u * 0.12, y0 = gy - u * 0.015;
      var g = ctx.createLinearGradient(0, y0, 0, y0 + h);
      g.addColorStop(0, 'rgba(255,255,255,.20)'); g.addColorStop(1, 'rgba(130,150,180,.06)');
      ctx.fillStyle = g;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, h, h * 0.35); ctx.fill(); }
      else ctx.fillRect(x0, y0, x1 - x0, h);
    }
    function face(hd, p, u, skin) {
      var a = p.lean + p.head;
      var ex_ = Math.sin(a + 1.57), ey = -Math.cos(a + 1.57);   // "forward" on the head
      var eye = { x: hd.x + ex_ * u * 0.16, y: hd.y + ey * u * 0.16 - u * 0.04 };
      ctx.fillStyle = 'rgba(10,18,30,.85)';
      ctx.beginPath(); ctx.arc(eye.x, eye.y, u * 0.05, 0, 7); ctx.fill();
      // brow drops and the mouth grimaces as the strain climbs
      ctx.strokeStyle = 'rgba(10,18,30,' + (0.35 + strain * 0.5) + ')';
      ctx.lineWidth = u * 0.055; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(eye.x - u * 0.07, eye.y - u * 0.13 + strain * u * 0.05);
      ctx.lineTo(eye.x + u * 0.09, eye.y - u * 0.16 + strain * u * 0.09);
      ctx.stroke();
      var mo = { x: hd.x + ex_ * u * 0.19, y: hd.y + ey * u * 0.19 + u * 0.13 };
      ctx.beginPath();
      if (strain > 0.45) { ctx.moveTo(mo.x - u * 0.09, mo.y); ctx.lineTo(mo.x + u * 0.09, mo.y); }
      else { ctx.arc(mo.x, mo.y - u * 0.04, u * 0.09, 0.25, 2.9); }
      ctx.stroke();
    }

    /* ---- range gauge ---- */
    function gauge(x, y, h, w) {
      var zone = ex.strongAt === 'mid' ? [0.34, 0.72] : ex.strongAt === 'bottom' ? [0.02, 0.4] : [0.6, 0.97];
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, w / 2); ctx.fill(); } else ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(47,240,176,.28)';
      ctx.fillRect(x, y + h * (1 - zone[1]), w, h * (zone[1] - zone[0]));
      // "no lockout" ceiling + "keep tension" floor
      ctx.fillStyle = 'rgba(255,93,120,.55)'; ctx.fillRect(x - w * 0.35, y, w * 1.7, Math.max(1, h * 0.02));
      ctx.fillStyle = 'rgba(255,211,92,.45)'; ctx.fillRect(x - w * 0.35, y + h * 0.98, w * 1.7, Math.max(1, h * 0.02));
      var py = y + h * (1 - cl(t, 0, 1));
      ctx.fillStyle = theme.accent; ctx.beginPath(); ctx.arc(x + w / 2, py, w * 0.95, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x + w / 2, py, w * 0.34, 0, 7); ctx.fill();
    }

    /* ---- per-frame ---- */
    function step(dt) {
      if (mode === 'live') {
        var n = getN() || 0;
        tgt = cl((n - 0.04) / 0.86, 0, 1);
      } else {
        phase += dt * 1000 / Math.max(700, tempo);
        if (phase > 1) phase -= 1;
        // ease into the top, dwell briefly, ease back down - X3 tempo, no rest
        var s = phase < 0.5 ? phase / 0.5 : 1 - (phase - 0.5) / 0.5;
        tgt = 0.06 + 0.94 * (s * s * (3 - 2 * s));
      }
      var k = 1 - Math.exp(-dt * (mode === 'live' ? 11 : 14));
      var pt = t; t += (tgt - t) * k;
      vel = (t - pt) / Math.max(dt, 1e-3);
      dir = vel > 0.25 ? 1 : vel < -0.25 ? -1 : 0;

      var sTgt = cl((t - 0.66) / 0.34, 0, 1) * (mode === 'live' ? 1 : 0.65);
      strain += (sTgt - strain) * (1 - Math.exp(-dt * 6));

      // rep counting + diminishing-range (burnout) detection
      if (t > repTop) repTop = t;
      if (t < 0.18 && !wasLow) { wasLow = true; }
      if (t > 0.5 && wasLow) { wasLow = false; reps++; }
      if (wasLow && repTop > 0) {
        peak = Math.max(peak * 0.985, repTop); repTop = 0;
      }
      peakDecay = Math.max(peakDecay * (1 - dt * 0.05), t);
      burnout = (reps > 2 && peak > 0.55 && peakDecay < peak * 0.62) ? cl(burnout + dt * 1.5, 0, 1) : cl(burnout - dt * 0.8, 0, 1);

      if (strain > 0.55 && Math.random() < dt * 14) sweat.push({ x: (Math.random() - 0.5), y: 0, v: 0.4 + Math.random() * 0.7, l: 0 });
      for (var i = sweat.length - 1; i >= 0; i--) {
        var s2 = sweat[i]; s2.l += dt; s2.y += s2.v * dt; if (s2.l > 0.9) sweat.splice(i, 1);
      }
      ghosts.push(t); if (ghosts.length > 7) ghosts.shift();
    }

    function draw(now) {
      if (!W || !H) resize();
      if (!W || !H) return;
      var u = H * (compact ? 0.86 : 0.9) / span(ex);
      var gx = W * (compact ? 0.48 : 0.46), gy = H * 0.9;

      ctx.clearRect(0, 0, W, H);
      // floor + glow
      var fg = ctx.createRadialGradient(gx, gy, 0, gx, gy, u * 3.2);
      fg.addColorStop(0, 'rgba(255,255,255,.07)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(gx + u * 0.1, gy + u * 0.14, u * 0.9, u * 0.15, 0, 0, 7); ctx.fill();

      var p = blend(ex, t);
      // the plate the band runs under - it also shows WHERE on the foot it sits
      if (ex.anchor === 'foot') plate(gx + p.foot[0] * u, gy, u, ex.plate === 'ball');

      ctx.save();
      if (strain > 0.25) {           // the whole figure trembles under real load
        var j = (strain - 0.25) * u * 0.13;
        ctx.translate((Math.random() - 0.5) * j, (Math.random() - 0.5) * j);
      }

      // motion ghosts
      for (var g = 0; g < ghosts.length - 1; g++) {
        var a = (g / ghosts.length) * 0.16;
        if (Math.abs(ghosts[g] - t) < 0.02) continue;
        figure(blend(ex, ghosts[g]), u, gx, gy, a, { skin: theme.accent, deep: theme.accent });
      }

      var j2 = figure(p, u, gx, gy, 1, null);

      // band + bar
      var anchor = ex.anchor === 'shoulder'
        ? { x: j2.sho.x - u * 0.34, y: j2.sho.y + u * 0.1 }
        : { x: j2.contact.x - u * 0.06, y: gy - u * 0.05 };   // band channel, pinned to the plate
      var bar = { x: (j2.hand.x + j2.hand2.x) / 2, y: (j2.hand.y + j2.hand2.y) / 2 };
      var dist = Math.hypot(bar.x - anchor.x, bar.y - anchor.y);
      var stretch = cl((dist / u - 1.0) / 2.2, 0, 1);
      bandCurve(anchor.x, anchor.y, bar.x, bar.y, stretch, u);
      if (p.grip > 0.05) barEndOn(bar.x, bar.y, u, p.grip, strain);

      // strain halo - a hint of heat behind the torso, never a wash over it
      if (strain > 0.25) {
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        var sr = u * 1.5, hg = ctx.createRadialGradient(j2.hip.x, j2.hip.y - u * 0.6, u * 0.3, j2.hip.x, j2.hip.y - u * 0.6, sr);
        var sa = (strain - 0.25) * 0.22;
        hg.addColorStop(0, 'rgba(255,120,140,' + sa + ')'); hg.addColorStop(1, 'rgba(255,120,140,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(j2.hip.x, j2.hip.y - u * 0.6, sr, 0, 7); ctx.fill();
        ctx.restore();
      }
      // sweat
      ctx.fillStyle = 'rgba(200,235,255,.8)';
      sweat.forEach(function (s) {
        ctx.globalAlpha = 1 - s.l / 0.9;
        ctx.beginPath(); ctx.arc(j2.head.x + s.x * u * 0.4, j2.head.y + s.y * u * 2.2, u * 0.05, 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.restore();

      gauge(W - (compact ? 12 : 20), H * 0.16, H * 0.66, compact ? 4 : 6);

      // labels
      var f = compact ? 9 : 11;
      ctx.font = '700 ' + f + "px 'Space Grotesk',system-ui,sans-serif";
      ctx.textAlign = 'left';
      ctx.fillStyle = dir > 0 ? theme.accent : dir < 0 ? theme.band : theme.dim;
      /* Name the work phase after the movement. Every press on a push day used to
         read PULL, which is the opposite of what you are being asked to do. */
      var ph = burnout > 0.5 ? 'PARTIALS' : dir > 0 ? (ex.verb || 'PULL') : dir < 0 ? 'EASE' : (t > 0.5 ? 'HOLD' : 'TENSION');
      ctx.fillText(ph, 10, 16);
      if (!compact) {
        ctx.fillStyle = theme.dim;
        var tip = t > 0.55 ? ex.tipB : ex.tipA, fs = 11, room = W - 20;
        while (fs > 8) { ctx.font = '500 ' + fs + "px 'Space Grotesk',system-ui,sans-serif"; if (ctx.measureText(tip).width <= room) break; fs -= 0.5; }
        ctx.fillText(tip, 10, H - 10);
      }
      if (burnout > 0.5) {
        ctx.fillStyle = theme.band; ctx.font = '700 ' + f + "px 'Space Grotesk',system-ui,sans-serif";
        ctx.textAlign = 'right'; ctx.fillText('DIMINISHING RANGE', W - (compact ? 20 : 34), 16); ctx.textAlign = 'left';
      }
    }

    // Panels inside a game share the frame budget with the game itself, so they
    // simulate every frame but only repaint at ~34fps. Full-size (Routines) runs
    // at the display rate.
    var minFrame = compact ? 1 / 34 : 0;
    function loop(now) {
      if (!alive) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      step(dt);
      acc += dt;
      if (!hidden && acc >= minFrame) { acc = 0; draw(now); }
      requestAnimationFrame(loop);
    }
    document.addEventListener('visibilitychange', function () { hidden = document.visibilityState !== 'visible'; });

    resize();
    if (window.ResizeObserver) { try { new ResizeObserver(resize).observe(canvas); } catch (e) {} }
    else addEventListener('resize', resize);
    requestAnimationFrame(loop);

    return {
      setExercise: function (slug) { if (EXR[slug]) { ex = EXR[slug]; reps = 0; peak = 0; burnout = 0; ghosts.length = 0; } },
      setMode: function (m) { mode = m; },
      setTempo: function (ms) { tempo = +ms || 3000; },
      setTheme: function (o) { theme = Object.assign(theme, o || {}); },
      resize: resize,
      /* advance + repaint exactly one frame - for hosts that own the frame
         budget (or for stepping it deterministically in a test) */
      frame: function (dt) { step(Math.min(0.05, dt || 0.016)); draw(performance.now()); },
      destroy: function () { alive = false; },
      state: function () { return { t: t, reps: reps, strain: strain, burnout: burnout }; },
      has: function (slug) { return !!EXR[slug]; }
    };
  }

  /* ---------------- floating panel for the games ---------------- */
  var styled = false;
  function panelCss() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent =
      '.x3ff{position:absolute;left:10px;bottom:10px;width:clamp(104px,21vw,168px);' +
      'border-radius:14px;overflow:hidden;pointer-events:none;z-index:6;' +
      'background:rgba(6,12,22,.42);border:1px solid rgba(255,255,255,.16);' +
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
      'opacity:0;transform:translateY(8px) scale(.96);transition:opacity .28s ease,transform .28s cubic-bezier(.2,.9,.25,1)}' +
      '.x3ff.on{opacity:1;transform:none}' +
      '.x3ff .x3ff-h{display:flex;align-items:baseline;gap:5px;padding:6px 8px 2px;' +
      "font-family:'Space Grotesk',system-ui,sans-serif;font-size:9px;letter-spacing:1.4px;text-transform:uppercase;color:rgba(255,255,255,.5)}" +
      '.x3ff .x3ff-h b{font-size:10.5px;letter-spacing:.3px;text-transform:none;color:rgba(255,255,255,.92)}' +
      '.x3ff canvas{display:block;width:100%;height:auto;aspect-ratio:1/1.12}' +
      '@supports not (aspect-ratio:1/1){.x3ff canvas{height:170px}}' +
      '@media (max-height:430px){.x3ff{width:clamp(92px,16vw,124px)}}';
    document.head.appendChild(s);
  }

  function mount(o) {
    o = o || {};
    var host = o.host || document.getElementById('stage') || document.body;
    if (!EXR[o.exercise]) return null;
    panelCss();
    var wrap = document.createElement('div'); wrap.className = 'x3ff';
    var meta = (window.X3FEX && window.X3FEX.get(o.exercise)) || null;
    wrap.innerHTML = '<div class="x3ff-h"><span>Form</span><b>' + (meta ? meta.name : EXR[o.exercise].label) + '</b></div>';
    var cv = document.createElement('canvas'); wrap.appendChild(cv);
    host.appendChild(wrap);

    var inst = create(cv, {
      exercise: o.exercise, mode: 'live', getN: o.getN, theme: o.theme, compact: true
    });
    var on = true;
    function show(v) { on = v; wrap.classList.toggle('on', v); try { localStorage.setItem('x3f_formOn', JSON.stringify(v)); } catch (e) {} }
    try { var st = JSON.parse(localStorage.getItem('x3f_formOn')); if (st === false) on = false; } catch (e) {}
    // a timer, not rAF: a backgrounded tab must not leave the panel invisible
    setTimeout(function () { show(on); }, 40);
    if (o.toggleBtn) {
      o.toggleBtn.style.display = '';
      var sync = function () { o.toggleBtn.textContent = on ? 'Form on' : 'Form off'; };
      sync();
      o.toggleBtn.addEventListener('click', function () { show(!on); sync(); });
    }
    inst.panel = wrap; inst.show = show;
    return inst;
  }

  /* verb(slug) is for anything OUTSIDE the panel that has to name the effort -
     a game's "pull to fire" prompt, a calibration countdown. Same word the
     figure shows, so the whole screen agrees with the movement. */
  window.X3FForm = {
    create: create, mount: mount, rigs: EXR,
    has: function (s) { return !!EXR[s]; },
    verb: function (s) { return (EXR[s] && EXR[s].verb) || 'PULL'; }
  };
})();
