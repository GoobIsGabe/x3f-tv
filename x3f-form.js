/* X3F FORM - the live form demonstrator.

   A figure that performs the exact X3 movement you are training, driven either
   by your LIVE force (inside a game: pull harder and it rises, near your max it
   strains and trembles) or by a tempo loop (on the Routines and Calibrate
   pages, as a setup and coaching preview).

   It is a rig, not a clip. Poses are authored as hip / hand / foot targets and
   the knees and elbows are solved, so the figure interpolates smoothly anywhere
   in the range - including the short partial reps that end an X3 set, which is
   the whole reason it exists.

   ─────────────────────────────────────────────────────────────────────────
   WHAT THIS REWRITE CHANGED, AND WHY EACH ONE MATTERS
   ─────────────────────────────────────────────────────────────────────────

   1. THE SET HAS THREE TIERS AND THE FIGURE NOW SHOWS ALL THREE.
      "You move to full extension without lockout until you can no longer reach
      that stronger range. Then you perform partial repetitions in the MID
      range. When you've gone to an even higher level of fatigue... then you
      just have very short WEAK range repetitions."  The old detector could
      never fire at all - it decayed its own reference 1.5% per FRAME while the
      signal it compared against decayed 5% per second, so the test was
      unreachable by construction, and the single most important thing this
      figure could show had never once appeared on screen. The rep detector is
      rebuilt around reversals and per-rep amplitude, the reference is the
      session's established top and never decays, and the gauge draws where your
      range used to reach next to where it reaches now.

   2. FORCE DRIVES EFFORT; RANGE DRIVES THE POSE.  Strain used to be derived
      from the pose, so 90% and 130% of your max looked identical and the idle
      tempo preview - where there is no athlete at all - grimaced and sweated on
      every rep. They are separate channels now.

   3. THE POSES ARE ANATOMICALLY SOLVED, NOT APPROXIMATED.  The split squat's
      rear leg folded forwards through the front leg; the front squat drove the
      knee 0.30 units past the toe under a caption reading "knee over toe"; the
      tricep press swung its upper arm through 55 degrees under a caption
      reading "only the elbow hinges"; the calf raise rocked backwards as it
      rose. Every pose in this file is now checked against the movement's own
      official mechanics text.

   4. ONE SOURCE OF TRUTH.  Names, verbs, coaching lines, the strength-curve
      shape, the band configuration and where the band runs under the foot all
      come from x3f-exercises.js. This file used to carry a second copy that had
      already diverged: it called the upright row a mid-range movement while the
      database called it a top-range movement. That class of divergence is
      exactly what the overhaul is removing. The rig carries GEOMETRY and
      nothing else.

   5. IT COSTS ABOUT A SIXTH OF WHAT IT USED TO.  It runs alongside a game's own
      loop on a TV SoC with a ~10 ms frame budget, so: limb chains are one path
      each instead of three fills per bone, every gradient is built on resize
      rather than per frame, the ghost trail is a stroked spine instead of six
      complete figures (one of which was drawn at alpha 0, forever), the face is
      dropped below the size at which it is a single pixel, and turning the
      panel off actually stops the work instead of only hiding it.

   Public API - every one of these is called from somewhere else, all of them
   still behave the way their callers expect:

     X3FForm.create(canvas, {exercise, mode:'live'|'tempo', getN, tempo, theme,
                             compact, manual})
       -> {setExercise, setMode, setTempo, setTheme, resize, frame, resetSet,
           destroy, state, has}
     X3FForm.mount({exercise, getN, host, toggleBtn, theme})
       -> floating panel inside a game stage (the instance, plus .panel/.show/
          .unmount), or null if there is no rig for that movement
     X3FForm.has(slug)     is there a rig
     X3FForm.verb(slug)    the word for the work: PRESS / PULL / ROW / ...
     X3FForm.rigs          the live rig table
*/
(function () {
  "use strict";

  /* ═══════════════════════════════════════════ rig proportions ═══════════
     Figure units. A standing figure is about 5.0 tall, so one unit is roughly
     34 cm on a 1.75 m person - useful when sanity-checking a pose against a
     real measurement ("the hip drops 0.37 m into a deep squat" = 1.08 units).

     LT/LS are thigh and shank, LU/LF upper arm and forearm. The arms are
     deliberately unequal (0.80 / 0.76) because they are in a human; the two
     bone solver handles l1 != l2 fine. NECKL is drawn as its own segment, so
     the head is ATTACHED rather than resting on a 0.010-unit overlap between
     the head circle and the torso's end cap - which was the most fragile
     constant in the old file and was documented nowhere. */
  var LT = 1.10, LS = 1.14, TORSO = 1.52, LU = 0.80, LF = 0.76;
  var HEAD = 0.30, NECKL = 0.17;
  var ARM = LU + LF, LEG = LT + LS;

  /* The foot, in the same units. BALL is how far the ball of the foot sits
     ahead of the ankle; ANKH is the ankle's height off the floor. The foot is
     a rigid body that hinges on its BALL with that contact pinned to the
     floor: rising onto the toes carries the ankle up and FORWARD over the
     contact, which is a calf raise. Hinging about the ankle instead gives you
     a toe raise, which is wrong for every movement in the program. */
  var BALL = 0.36, ANKH = 0.20, HEELB = 0.22, TOEF = 0.16, THICK = 0.12;
  var MAX_HEEL = 1.16;                       // radians of heel lift at lift = 1

  /* ═══════════════════════════════════════════════ the rigs ══════════════

     A rig is GEOMETRY plus the two decisions a picture has to make that data
     cannot: which way a joint bends, and how far round the figure is turned.
     Everything else - the movement's name, its verb, its coaching lines, its
     strength curve, whether the band is singled or doubled, and where under
     the foot it runs - is read from x3f-exercises.js at draw time.

     Pose fields:
       hx, hy    hip position: x from centre, y above the floor
       lean      torso angle from vertical, + = hinged forward
       hand      LEAD hand target, offset from the shoulder joint, [x, y-down],
                 in WORLD space and deliberately not rotated by lean - that is
                 what makes "the arms hang vertically in a deadlift" a single
                 number instead of a trigonometric correction on every pose
       hand2     off hand (defaults to the lead hand, set back for depth)
       ebowAt    OPTIONAL elbow pin, offset from the shoulder. When present the
                 elbow is placed here and the forearm swings to the hand - i.e.
                 ONLY THE ELBOW HINGES. Identical at both ends of the range
                 means the upper arm genuinely does not move, which is the
                 printed cue for the tricep press and the front rack
       foot      near ankle [x at rest, heel lift 0..1]
       foot2     far ankle, when the stance is split
       head      head tilt relative to the spine (+ = chin down)
       grip      how much bar there is to draw; 0 = no bar at all

     Rig fields:
       ebow      elbow bend side, +1 = back/down, -1 = up/out
       armReach  OPTIONAL hand distance from the shoulder, overriding whatever
                 the hand offset's own length works out to. A fly authors the
                 arm's DIRECTION and lets this set the bend, instead of solving
                 a two-bone arm to a moving hand and snapping the elbow through
                 90 degrees mid-rep. Per POSE, because a crossover's elbow
                 closes as the hands come together
       depth     how far the far side is set back, faking a quarter turn. A
                 pure side elevation cannot show "cross the body" or "elbows out"
                 at all; a sixth of a unit of separation shows both arms
       cueA/cueB which official line to print at the stretched and contracted
                 ends: 'm3' = mechanics[3], 'f0' = faults[0], 's1' = setup[1]
       verb      fallback only, for when x3f-exercises.js has not loaded
       curve     fallback only, same reason

     a = stretched / weak end of the range.  b = contracted / strong end.
     t maps monotonically a -> b, and the gauge, the tips and the phase label
     all depend on that, so never author a rig the other way round. */
  var EXR = {
    /* ---------------------------------------------------------------- PULL */
    'deadlift': {
      ebow: -1, depth: 0.07, label: 'Deadlift', verb: 'PULL', curve: 'top',
      /* Hips well back and the shin near vertical: the knee ends up 0.16 ahead
         of the ankle and comfortably behind the toe, which is the hinge the
         source describes ("you're pulling from below the knee, not the floor"),
         not the squat the old pose was drawing. */
      a: { hx: -0.85, hy: 1.75, lean: 0.98, hand: [-0.08, 1.50], foot: [0, 0], head: -0.55, grip: 1.0 },
      b: { hx: 0.00, hy: 2.38, lean: 0.10, hand: [0.04, 1.50], foot: [0, 0], head: 0.00, grip: 1.0 },
      cueA: 'm0', cueB: 'm4'
    },
    'bent-row': {
      ebow: 1, depth: 0.07, label: 'Bent Row', verb: 'ROW', curve: 'mid',
      a: { hx: -0.55, hy: 2.00, lean: 0.80, hand: [-0.05, 1.44], foot: [0, 0], head: -0.42, grip: 1.0 },
      b: { hx: -0.55, hy: 2.00, lean: 0.76, hand: [-0.55, 0.94], foot: [0, 0], head: -0.38, grip: 1.0 },
      cueA: 'm3', cueB: 'm0'
    },
    'drag-curl': {
      ebow: 1, depth: 0.06, label: 'Bicep Curl', verb: 'CURL', curve: 'top',
      /* The contracted hand sits close to the torso and the elbow solves 0.62
         BEHIND the shoulder, which is the drag curl's whole point - the bar
         slides up the body and the elbows travel back, they never come forward. */
      a: { hx: 0, hy: 2.38, lean: 0.06, hand: [0.04, 1.42], foot: [0, 0], head: 0, grip: 0.9 },
      b: { hx: 0, hy: 2.38, lean: 0.05, hand: [0.10, 0.74], foot: [0, 0], head: 0.04, grip: 0.9 },
      cueA: 'm4', cueB: 'm2'
    },
    'calf-raise': {
      /* foot[0] = -0.36 puts the BALL contact on the origin, so the plate's
         band channel, the pivot and the shadow all agree. The hip travels
         forward 0.24 as the heel rises: your centre of mass has to arrive over
         the only part of you still touching the floor. The old rig left the hip
         pinned at 0 while the ankle travelled to +0.38, so the figure rocked
         backwards as it rose onto its toes. */
      ebow: -1, depth: 0.05, label: 'Calf Raise', verb: 'RAISE', curve: 'top',
      a: { hx: -0.24, hy: 2.42, lean: 0.05, hand: [0.27, 1.42], foot: [-0.36, 0.12], head: 0, grip: 0.95 },
      b: { hx: 0.00, hy: 2.60, lean: 0.05, hand: [0.27, 1.42], foot: [-0.36, 0.88], head: 0, grip: 0.95 },
      cueA: 'm2', cueB: 'm0'
    },

    /* ---------------------------------------------------------------- PUSH */
    'chest-press': {
      ebow: 1, depth: 0.11, label: 'Chest Press', verb: 'PRESS', curve: 'top',
      bandAt: [-0.42, 0.20],
      a: { hx: 0, hy: 2.38, lean: 0.16, hand: [0.34, 0.30], hand2: [0.30, 0.42], foot: [0.04, 0], head: 0, grip: 0.95 },
      b: { hx: 0, hy: 2.38, lean: 0.18, hand: [1.30, 0.50], hand2: [1.20, 0.60], foot: [0.04, 0], head: 0.02, grip: 0.95 },
      cueA: 'm3', cueB: 'm1'
    },
    'tricep-press': {
      /* ebowAt is identical in a and b. That is the entire fix: the printed cue
         is "the upper arm does not move", and the old rig rotated it through 55
         degrees while printing that sentence underneath. */
      ebow: 1, depth: 0.08, label: 'Tricep Press', verb: 'PRESS', curve: 'top',
      bandAt: [-0.40, 0.12],
      a: { hx: -0.10, hy: 2.34, lean: 0.50, hand: [0.55, -0.40], ebowAt: [0.78, 0.18], foot: [0.04, 0], head: -0.24, grip: 0.8 },
      b: { hx: -0.10, hy: 2.34, lean: 0.50, hand: [1.44, 0.29], ebowAt: [0.78, 0.18], foot: [0.04, 0], head: -0.24, grip: 0.8 },
      cueA: 'm0', cueB: 'm1'
    },
    'overhead-press': {
      ebow: 1, depth: 0.09, label: 'Overhead Press', verb: 'PRESS', curve: 'top',
      /* Bar at SHOULDER height and a little in front, which is what the setup
         says and, not by coincidence, the only start that solves the elbow
         where it belongs: 0.78 below the shoulder and barely forward. Putting
         the bar level with the chin instead left the hand almost on top of the
         shoulder joint, and a 0.80 upper arm with nowhere to go throws the
         elbow straight out in front like a wing. */
      a: { hx: 0, hy: 2.38, lean: 0.05, hand: [0.52, 0.10], foot: [0.02, 0], head: 0, grip: 1.0 },
      b: { hx: 0, hy: 2.42, lean: 0.02, hand: [-0.05, -1.45], foot: [0.02, 0], head: 0.14, grip: 1.0 },
      cueA: 'm2', cueB: 'm1'
    },
    'front-squat': {
      /* Hips 0.62 BEHIND the ankle at the bottom. That is what keeps the knee
         at 0.48 with the toe at 0.58 - the cue printed under the figure is
         "knee over toe", and the old pose put the knee 0.30 past it.
         ebowAt holds a real front rack: elbows forward and up, the bar carried
         on the shoulders by the traps with the fingers only along for the ride. */
      ebow: 1, depth: 0.08, label: 'Front Squat', verb: 'DRIVE', curve: 'top',
      a: { hx: -0.62, hy: 1.30, lean: 0.52, hand: [0.06, -0.08], ebowAt: [0.68, -0.28], foot: [0.06, 0], head: -0.30, grip: 1.0 },
      b: { hx: -0.08, hy: 2.34, lean: 0.12, hand: [0.05, -0.10], ebowAt: [0.66, -0.34], foot: [0.06, 0], head: 0, grip: 1.0 },
      cueA: 'm3', cueB: 'm4'
    },
    'split-squat': {
      /* The rear foot is 1.86 behind the front one, which is what a real split
         stance measures (0.64 m) and what makes the rear leg solvable: the old
         rig put it 1.38 forward of that, and no leg with a 1.10 thigh and a
         1.14 shank can fold into that gap without throwing the knee out in
         front of the FRONT foot, which is exactly what it did. At the bottom
         the rear knee sits 0.27 off the floor, just behind the hip. */
      ebow: 1, depth: 0.10, label: 'Split Squat', verb: 'DRIVE', curve: 'top',
      a: { hx: -0.22, hy: 1.36, lean: 0.22, hand: [0.05, -0.08], ebowAt: [0.66, -0.30], foot: [0.36, 0], foot2: [-1.50, 0.69], head: -0.10, grip: 1.0 },
      b: { hx: -0.02, hy: 2.06, lean: 0.14, hand: [0.05, -0.08], ebowAt: [0.66, -0.30], foot: [0.36, 0], foot2: [-1.50, 0.66], head: 0, grip: 1.0 },
      cueA: 'm1', cueB: 'm0'
    },
    'pec-crossover': {
      /* A fly holds one soft elbow through the whole arc, so the poses author
         the arm's DIRECTION and armReach holds the bend. Solving the elbow to a
         moving hand instead made this the worst-behaved arm in the file: it
         flipped from 0.74 below the shoulder to 0.28 above it inside the first
         half of a rep. depth is large because "cross the body" is invisible in
         a pure side elevation - it is the one movement in the program that has
         to be shown at an angle to be shown at all. */
      ebow: -1, depth: 0.22, label: 'Pec Crossover', verb: 'SQUEEZE', curve: 'top',
      bandAt: [-0.30, 0.16],
      /* armReach closes from 1.42 to 1.04 across the rep. That is the movement:
         a wide, nearly straight arm at the stretch, the elbow folding as the
         hands come together. Holding one reach the whole way turned the finish
         into a front raise with the hands a foot off the chest. The two hands
         also finish at different heights, because the source says to alternate
         which arm crosses on top. */
      a: { hx: 0, hy: 2.38, lean: 0.14, armReach: 1.42, hand: [-0.72, 0.62], hand2: [-0.80, 0.80], foot: [0.04, 0], head: 0, grip: 0 },
      b: { hx: 0, hy: 2.38, lean: 0.18, armReach: 1.04, hand: [1.00, 0.30], hand2: [0.96, 0.02], foot: [0.04, 0], head: 0.02, grip: 0 },
      cueA: 'm2', cueB: 'm0'
    },
    'upright-row': {
      /* ebowAt lifts the elbow 0.25 ABOVE the shoulder at the top. "Drive the
         elbows up and slightly out" is not expressible by solving a two-bone
         arm to a hand at mid-chest: every solution puts the elbow below the
         shoulder, which is the chicken-wing the old rig drew. */
      ebow: -1, depth: 0.10, label: 'Upright Row', verb: 'PULL', curve: 'top',
      a: { hx: 0, hy: 2.38, lean: 0.05, hand: [0.10, 1.40], ebowAt: [0.10, 0.79], foot: [0.02, 0], head: 0, grip: 0.6 },
      b: { hx: 0, hy: 2.38, lean: 0.03, hand: [0.25, 0.70], ebowAt: [0.76, -0.25], foot: [0.02, 0], head: 0.02, grip: 0.6 },
      cueA: 'm0', cueB: 'm2'
    }
  };

  /* ═══════════════════════════════════════════════════ maths ═════════════ */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
  function cl01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lp2(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }

  /* Colour. rgb() is parsed as well as #rrggbb because a host that hands us a
     computed CSS value or an rgb() literal used to silently lose every tint in
     the file - no error, nothing visibly broken enough to notice. */
  function parseCol(c) {
    if (!c) return null;
    c = ('' + c).trim();
    if (c.charAt(0) === '#') {
      var h = c.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      if (isNaN(n)) return null;
      return [n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    var m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      var p = m[1].split(',');
      return [+p[0] | 0, +p[1] | 0, +p[2] | 0];
    }
    return null;
  }
  function rgb(v) { return 'rgb(' + (v[0] | 0) + ',' + (v[1] | 0) + ',' + (v[2] | 0) + ')'; }
  function mixv(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function mix(a, b, t) {
    var x = parseCol(a), y = parseCol(b);
    if (!x || !y) return a;
    return rgb([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]);
  }
  var WHITE = [255, 255, 255], INK = [16, 22, 36];
  function tint(v, t) { return [lerp(v[0], WHITE[0], t), lerp(v[1], WHITE[1], t), lerp(v[2], WHITE[2], t)]; }
  function darken(v, t) { return [lerp(v[0], INK[0], t), lerp(v[1], INK[1], t), lerp(v[2], INK[2], t)]; }

  /* Two-bone IK: the joint between root and target, bent to one side. */
  function ik(ax, ay, bx, by, l1, l2, side) {
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
    var ux = dx / d, uy = dy / d;
    var dd = cl(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    var a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
    var h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    return { x: ax + ux * a - uy * h * side, y: ay + uy * a + ux * h * side };
  }
  /* Pull a target back inside a limb's reach BEFORE solving. Without this the
     solver clamps its own working distance but the caller still draws the hand
     or the ankle at the unclamped target, so an over-reach detaches the
     forearm from the hand instead of straightening the arm. Two rigs were
     within 0.03 units of that happening. */
  function within(ox, oy, px, py, len) {
    var dx = px - ox, dy = py - oy, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= len || d < 1e-6) return { x: px, y: py };
    return { x: ox + dx / d * len, y: oy + dy / d * len };
  }

  /* Pose blend. Writes into a scratch object rather than allocating one per
     frame - this runs up to four times a frame with the ghost trail. */
  function blend(ex, t, o) {
    var a = ex.a, b = ex.b;
    o = o || {};
    o.hx = lerp(a.hx, b.hx, t); o.hy = lerp(a.hy, b.hy, t);
    o.lean = lerp(a.lean, b.lean, t); o.head = lerp(a.head || 0, b.head || 0, t);
    o.grip = lerp(a.grip == null ? 0.9 : a.grip, b.grip == null ? 0.9 : b.grip, t);
    o.hand = lp2(a.hand, b.hand, t);
    /* The off hand defaults to the lead hand set back by the rig's depth and
       dropped slightly, which is what an off arm actually does in a two-handed
       lift. Only the pec crossover authors both hands independently, and it is
       the only movement where they genuinely differ. */
    var d = ex.depth || 0;
    o.hand2 = lp2(a.hand2 || [a.hand[0] - d, a.hand[1] + 0.04],
                  b.hand2 || [b.hand[0] - d, b.hand[1] + 0.04], t);
    if (a.ebowAt || b.ebowAt) o.ebowAt = lp2(a.ebowAt || b.ebowAt, b.ebowAt || a.ebowAt, t);
    else o.ebowAt = null;
    o.armReach = (a.armReach || b.armReach)
      ? lerp(a.armReach || b.armReach, b.armReach || a.armReach, t) : 0;
    o.foot = lp2(a.foot || [0, 0], b.foot || [0, 0], t);
    o.foot2 = (a.foot2 || b.foot2) ? lp2(a.foot2 || a.foot, b.foot2 || b.foot, t) : null;
    return o;
  }

  /* ═══════════════════════════════════════════ the joint solve ═══════════

     Pure: same pose in, same joints out, no drawing and no closure state. That
     is what lets the per-movement metrics below measure a rig at load time
     using the very same geometry the renderer will use, instead of a second
     copy that drifts. */
  function footAngle(lift) { return cl01(lift || 0) * MAX_HEEL; }

  function solveLeg(ex, f, hip, u, gx, gy) {
    var th = footAngle(f[1]);
    var cx = gx + (f[0] + BALL) * u, cy = gy;          // ball contact, on the floor
    var vx = -BALL * u, vy = -ANKH * u;                // contact -> ankle, at rest
    var ct = Math.cos(th), st = Math.sin(th);
    var ax = cx + vx * ct - vy * st, ay = cy + vx * st + vy * ct;
    var tgt = within(hip.x, hip.y, ax, ay, (LT + LS) * u * 0.999);
    /* The knee bows forward, which for every X3 movement is +x. The guard is
       for a TRAILING leg: when the foot is well behind the hip the forward
       branch throws the knee out in front of the body, which is how the split
       squat shipped a rear thigh that crossed through the front one. A knee
       never travels in front of the hip when the foot is behind it. */
    var side = -1;
    var kn = ik(hip.x, hip.y, tgt.x, tgt.y, LT * u, LS * u, side);
    if (ax < hip.x - 0.30 * u && kn.x > hip.x + 0.40 * u) {
      kn = ik(hip.x, hip.y, tgt.x, tgt.y, LT * u, LS * u, 1);
    }
    return { ank: { x: ax, y: ay }, kn: kn, th: th, cx: cx, cy: cy, lift: cl01(f[1] || 0) };
  }

  function solveArm(ex, hoff, sho, p, u, back) {
    var hx = sho.x + hoff[0] * u, hy = sho.y + hoff[1] * u;
    /* A fly holds one elbow angle through the whole arc: the pose says which
       way the arm points and armReach says how bent it is. */
    var reach = p.armReach || ex.armReach || 0;
    if (reach) {
      var dx = hx - sho.x, dy = hy - sho.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
      hx = sho.x + dx / d * reach * u;
      hy = sho.y + dy / d * reach * u;
    }
    if (p.ebowAt) {
      /* ONLY THE ELBOW HINGES. The elbow is pinned and the forearm swings to
         the hand at its true length, so the hand lands wherever a real forearm
         would put it rather than wherever the pose wished it were. */
      var ex_ = sho.x + p.ebowAt[0] * u, ey = sho.y + p.ebowAt[1] * u;
      var fx = hx - ex_, fy = hy - ey, fd = Math.sqrt(fx * fx + fy * fy) || 1e-4;
      return { el: { x: ex_, y: ey }, hnd: { x: ex_ + fx / fd * LF * u, y: ey + fy / fd * LF * u } };
    }
    var t2 = within(sho.x, sho.y, hx, hy, ARM * u * 0.998);
    return { el: ik(sho.x, sho.y, t2.x, t2.y, LU * u, LF * u, back ? -ex.ebow : ex.ebow),
             hnd: t2 };
  }

  /* Every joint the renderer and the metrics both need. */
  function solve(ex, p, u, gx, gy, out) {
    var o = out || {};
    var sl = Math.sin(p.lean), cs = Math.cos(p.lean);
    var hip = o.hip || (o.hip = {});
    hip.x = gx + p.hx * u; hip.y = gy - p.hy * u;
    var neck = o.neck || (o.neck = {});
    neck.x = hip.x + sl * TORSO * u; neck.y = hip.y - cs * TORSO * u;
    /* The shoulder is a rigid offset back down the spine, so it rotates WITH
       the torso. The old one used different constants on x and y, which meant
       the shoulder's distance from the neck changed with the lean and every
       authored hand offset was silently compensating for it. */
    var sho = o.sho || (o.sho = {});
    sho.x = neck.x - sl * 0.10 * u; sho.y = neck.y + cs * 0.10 * u;
    var ha = p.lean + p.head;
    var hd = o.head || (o.head = {});
    hd.x = neck.x + Math.sin(ha) * (NECKL + HEAD) * u;
    hd.y = neck.y - Math.cos(ha) * (NECKL + HEAD) * u;

    var dep = (ex.depth || 0) * u;
    var farHip = { x: hip.x - dep, y: hip.y };
    var farSho = { x: sho.x - dep, y: sho.y + 0.02 * u };

    o.far = solveLeg(ex, p.foot2 || [p.foot[0] - 0.10, p.foot[1]], farHip, u, gx - dep, gy);
    o.near = solveLeg(ex, p.foot, hip, u, gx, gy);
    o.armFar = solveArm(ex, p.hand2, farSho, p, u, true);
    o.armNear = solveArm(ex, p.hand, sho, p, u, false);
    o.farHip = farHip; o.farSho = farSho;
    /* The bar is where the hands are. On a two-handed lift that is their
       midpoint; on the crossover there is no bar at all. */
    o.bar = o.bar || {};
    o.bar.x = (o.armNear.hnd.x + o.armFar.hnd.x) / 2;
    o.bar.y = (o.armNear.hnd.y + o.armFar.hnd.y) / 2;
    return o;
  }

  /* ═════════════════════════════════ per-movement measurements ═══════════

     Measured once per rig, from the real solve, and memoised onto the rig -
     the same place span() has always cached, so nothing that already relied on
     the rig table being shared and mutable changes behaviour.

       h, w, cx     the figure's true extent across its whole range, so the
                    scale accounts for a split squat's stance and an overhead
                    press's bar instead of guessing from the hip height
       d0, d1       band length at both ends of the range, which is what makes
                    band tension honest PER MOVEMENT. One global constant left
                    three movements pinned slack for an entire rep and the
                    overhead press pinned at full glow with zero range - the
                    one visual that is supposed to say "the resistance is
                    climbing" was constant on the movement that climbs most. */
  var STANDING_H = 5.05;   // a standing figure, head to floor, plus a little air

  function metrics(ex) {
    if (ex.__m) return ex.__m;
    var lo = 1e9, hi = -1e9, left = 1e9, right = -1e9, d0 = 0, d1 = 0;
    var p = {}, j = {};
    for (var i = 0; i <= 8; i++) {
      var t = i / 8;
      blend(ex, t, p);
      solve(ex, p, 1, 0, 0, j);
      j.__p = p;
      var pts = [j.hip, j.neck, j.head, j.near.ank, j.far.ank, j.near.kn, j.far.kn,
                 j.armNear.hnd, j.armFar.hnd, j.armNear.el, j.armFar.el, j.bar];
      for (var k = 0; k < pts.length; k++) {
        var q = pts[k];
        if (q.y < lo) lo = q.y;
        if (q.y > hi) hi = q.y;
        if (q.x < left) left = q.x;
        if (q.x > right) right = q.x;
      }
      lo = Math.min(lo, j.head.y - HEAD);
      left = Math.min(left, j.near.cx - (BALL + HEELB), j.far.cx - (BALL + HEELB));
      right = Math.max(right, j.near.cx + TOEF, j.far.cx + TOEF);
      var dd = bandSpan(ex, j, 1, 0);
      if (i === 0) d0 = dd;
      if (i === 8) d1 = dd;
    }
    /* Frame on a fixed HUMAN height, not on whatever this pose happens to
       need. Filling the frame with each movement in turn made the person 45%
       bigger on the bent row than on the overhead press, so switching
       movements on the Routines page visibly resized the athlete. Only a bar
       that genuinely goes overhead is allowed to push the scale out. */
    var h = Math.max(hi - lo + 0.25, STANDING_H);
    var m = { h: h, w: (right - left) + 0.30, cx: (left + right) / 2,
              d0: d0, d1: d1, top: lo };
    /* Only cache once the database is actually loaded: d0/d1 depend on where
       this movement's band runs under the foot, and a page is free to load the
       two scripts in either order. Measuring against the fallback and then
       keeping it would give the deadlift the calf raise's band. */
    if (meta(ex)) ex.__m = m;
    return m;
  }

  /* How much band is out, in figure units. Two physically different cases:

       Under the plate  the band runs from the floor to the bar, so the
                        straight line between them IS its length.

       Round the body   the chest press slings it over one shoulder, the pec
                        crossover loops it behind the scapulae. The band then
                        wraps the torso, and a straight line from the anchor to
                        the hands measures nothing useful: on the crossover the
                        hands are 1.15 units behind the anchor at the stretch
                        and 0.91 in front at the finish, so the straight-line
                        distance is 1.17 at BOTH ends of a rep whose entire
                        point is that tension climbs. What is actually paying
                        out is how far forward of your own back the hands have
                        travelled, so that is what gets measured.

     This is per movement, from its own two end poses, which is what makes
     tension honest. One global constant left three movements pinned slack for
     a whole rep and the overhead press pinned at full glow with zero range -
     the one visual that says "the resistance is climbing" was constant on the
     movement that climbs most. */
  function bandSpan(ex, j, u, gy) {
    var an = anchorAt(ex, j, u, 0, gy || 0);
    var dx = j.bar.x - an.x, dy = j.bar.y - an.y;
    if (!ex.bandAt) return Math.sqrt(dx * dx + dy * dy) / u;
    var lean = j.__p.lean;
    return (dx * Math.cos(lean) + dy * Math.sin(lean)) / u + 1.6;
  }

  /* Where the band leaves the ground or the body, from the movement's OWN
     setup. The old anchor sat at the ball of the foot for all eleven
     movements, including the ten whose setup text says midfoot and the split
     squat, whose band runs under the FRONT foot near the heel - so the plate
     drawn under the whole foot had a band visibly emerging from the toes. */
  function anchorAt(ex, j, u, gx, gy) {
    var m = meta(ex);
    var plate = m ? m.plate : null;
    var cfg = m ? m.bandConfig : null;
    if (ex.bandAt) {
      /* Behind the back, in TORSO-local space, so the tricep press's 29-degree
         lean carries the anchor with it instead of leaving it floating. */
      var p = j.__p, sl = Math.sin(p.lean), cs = Math.cos(p.lean);
      return { x: j.sho.x + (ex.bandAt[0] * cs + ex.bandAt[1] * sl) * u,
               y: j.sho.y + (-ex.bandAt[0] * sl + ex.bandAt[1] * cs) * u };
    }
    if (cfg === 'front-foot') return { x: j.near.ank.x - HEELB * 0.5 * u, y: gy };
    if (plate === 'balls') return { x: j.near.cx, y: gy };
    return { x: j.near.ank.x + 0.02 * u, y: gy };   // midfoot: under the ankle
  }

  /* ═══════════════════════════════ the movement database ═════════════════

     x3f-exercises.js is the single source of truth. This file used to carry a
     private copy of the strength curve, the coaching prose and the movement's
     name; the copy had already diverged (upright row: 'mid' here, 'top'
     there), which is the exact bug class this overhaul exists to remove.
     Resolved lazily and memoised, because a page is free to load the two
     scripts in either order. */
  function meta(ex) {
    if (ex.__meta !== undefined) return ex.__meta;
    var m = null;
    try { if (window.X3FEX && window.X3FEX.get) m = window.X3FEX.get(ex.__slug); } catch (e) {}
    if (m) ex.__meta = m;                 // only cache a hit; a miss may be load order
    return m;
  }
  function protocol() {
    try { if (window.X3FEX && window.X3FEX.protocol) return window.X3FEX.protocol; } catch (e) {}
    return { fullRangeFrac: 0.85, midRangeFrac: 0.45, curveExp: 0.65 };
  }
  function curveOf(ex) { var m = meta(ex); return (m && m.curve) || ex.curve || 'top'; }
  function nameOf(ex) { var m = meta(ex); return (m && m.name) || ex.label; }
  function strandsOf(ex) {
    var m = meta(ex);
    return (m && m.bandConfig === 'singled') ? 1 : 2;
  }

  /* Print the movement's own words. 'm3' is mechanics[3], 'f0' faults[0], 's1'
     setupSteps[1]. The official sentences carry a lot of clause; take the first
     one, because a coaching line on a 150 px panel gets read in the half second
     between reps or not at all. */
  function officialLine(ex, ref) {
    var m = meta(ex);
    if (!m || !ref) return '';
    var arr = ref.charAt(0) === 'f' ? m.faults : ref.charAt(0) === 's' ? m.setupSteps : m.mechanics;
    var s = arr && arr[+ref.slice(1)];
    if (!s) return '';
    var marks = [' — ', '. ', '; ', ', ', ' and ', ' so '], cuts = [], i, k;
    for (i = 0; i < marks.length; i++) {
      k = s.indexOf(marks[i]);
      if (k > 20) cuts.push(k);
    }
    cuts.push(s.length);
    cuts.sort(function (a, b) { return a - b; });
    /* Take the longest clause that still fits two readable lines; if the whole
       sentence is one long clause, take the shortest honest cut instead. */
    var pick = cuts[0];
    for (i = 0; i < cuts.length; i++) if (cuts[i] <= 66) pick = cuts[i];
    return s.slice(0, pick).replace(/[.,;\s]+$/, '');
  }

  /* ═════════════════════════════════════════════════ theme ══════════════ */
  var DEF_THEME = {
    accent: '#33E2AE', band: '#FFC94A', skin: '#DDE6F6', deep: '#6C7A96',
    dim: '#8B93A5', strain: '#FF6376', amber: '#FF9E4A'
  };

  /* ═══════════════════════════════════════════════ instance ═════════════ */
  function create(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var theme = Object.assign({}, DEF_THEME, opts.theme || {});
    var slug = opts.exercise;
    var ex = EXR[slug] || null;
    var missing = !ex;
    var mode = opts.mode === 'live' ? 'live' : 'tempo';
    var getN = opts.getN || function () { return 0; };
    var tempo = +opts.tempo || 3000;
    var compact = !!opts.compact;
    var reduced = false;
    try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    var W = 0, H = 0, DPR = 1;
    /* Two channels, and mixing them up is a bug this whole overhaul exists to
       remove. `t` is the EASED value: it is the pose, it is what gets drawn.
       `tl` is the LINEAR proportion of your calibrated range: it is what the
       rep detector and the three-tier classifier reason about, because the
       program's own thresholds (">= 0.85 of the session's top") are stated
       against the calibrated span, not against a display curve. */
    var t = 0, tl = 0, tgt = 0, tgtL = 0, phase = 0, vel = 0, velS = 0, dir = 0, clock = 0;
    var strain = 0, effort = 0, over = 0, sweat = [], ghosts = [];
    var slackFor = 0, faultT = 0;
    var last = now(), acc = 0, alive = true, hidden = false, paused = false;
    var hostDriven = !!opts.manual, inResize = false;
    /* The shed order, worst thing first: sweat, then the motion trail, then
       the face and the heat halo. Reduced motion starts two rungs down and the
       tremble is off outright. x3f-fx.js sheds the same way; this module is the
       more expensive of the two per pixel and used to have no posture at all. */
    var quality = reduced ? 1 : 3;
    var slowFrames = 0, avgMs = 16;
    var rafId = 0;

    /* ---- the three-tier set model ----------------------------------------
       FULL RANGE  -> MID RANGE partials -> WEAK RANGE partials -> failure.
       The reference is the top this SESSION established and it never decays,
       which is the whole reason the old detector could not fire: it decayed
       its reference 1.5% per painted frame - four times faster on a 120 Hz
       phone than on a 24 fps TV - while the value it was compared against
       decayed 5% per second, so the test was unreachable by construction. */
    var reps = 0, fullReps = 0, midReps = 0, weakReps = 0;
    var repHi = 0, repLo = 1, rising = false, primed = false;
    var sessionTop = 0, recentTop = 0, lastRepAt = -99, lastAmp = 0;
    var tier = 0, tierCand = 0, tierRun = 0, tierMix = 0;

    function resetSet() {
      reps = fullReps = midReps = weakReps = 0;
      repHi = 0; repLo = 1; rising = false; primed = false;
      sessionTop = 0; recentTop = 0; lastRepAt = clock; lastAmp = 0;
      tier = tierCand = tierRun = 0; tierMix = 0;
      ghosts.length = 0; sweat.length = 0; slackFor = 0; faultT = 0;
    }

    function commitRep(peak, amp) {
      /* Under 3% of the range is signal noise or a re-grip, not a repetition.
         The set's last honest rep is "an inch", so the floor has to be low -
         but it also has to exist, or a trembling hold counts a hundred reps. */
      if (amp < 0.030) return;
      reps++; lastAmp = amp; lastRepAt = clock;
      if (peak > sessionTop) sessionTop = peak;
      recentTop = recentTop ? recentTop + (peak - recentTop) * 0.45 : peak;
      var P = protocol();
      var f = sessionTop > 0.15 ? peak / sessionTop : 1;
      var cand = f >= (P.fullRangeFrac || 0.85) ? 0 : f >= (P.midRangeFrac || 0.45) ? 1 : 2;
      /* Two reps have to agree before the set is relabelled. One short rep in
         the middle of full range is a re-grip, not a new tier, and a panel that
         re-labels itself every rep is a panel nobody can read at a glance. */
      if (cand === tierCand) tierRun++; else { tierCand = cand; tierRun = 1; }
      if (tierRun >= 2) tier = cand;
      if (tier === 0) fullReps++; else if (tier === 1) midReps++; else weakReps++;
    }

    function trackRange(dt) {
      if (tl > repHi) repHi = tl;
      if (tl < repLo) repLo = tl;
      var rev = Math.max(0.020, (repHi - repLo) * 0.28);
      if (rising) {
        if (repHi - tl > rev) { if (primed) commitRep(repHi, repHi - repLo); rising = false; repLo = tl; }
      } else if (tl - repLo > rev) {
        /* Only after a genuine bottom has been seen. Mounting mid-pull - a
           movement change in a guided routine, a game re-render - used to
           credit a phantom rep on the first frame. */
        rising = true; repHi = tl; primed = true;
      }
      tierMix += ((tier > 0 ? 1 : 0) - tierMix) * (1 - Math.exp(-dt * 3));
      /* A long pause with the bar down is the end of a set, not a very slow
         rep. Without this the next set inherits the last one's ceiling and
         opens in the weak range. */
      if (reps > 0 && clock - lastRepAt > 25 && tl < 0.15) resetSet();
    }

    /* ---- canvas ---------------------------------------------------------- */
    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    var gr = null;            // gradients, rebuilt on resize / tone change
    var toneBucket = -1;
    var fontFam = "'Space Grotesk',system-ui,sans-serif";
    function readFont() {
      try {
        var v = getComputedStyle(document.documentElement).getPropertyValue('--font-display');
        if (v && v.trim()) fontFam = v.trim();
      } catch (e) {}
    }

    function resize() {
      /* Never scale the backing store by devicePixelRatio beyond 2: a 1080p
         canvas at DPR 2 is 31.6 MiB, which is the TV's entire graphics budget
         spent on one panel. */
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      var w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
      if (!w || !h) return;
      W = w; H = h;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      gr = null; toneBucket = -1;
      /* Setting the backing store size wipes the canvas. The internal loop
         repaints on the next frame and never notices, but a host that owns the
         frame budget through frame(dt) - or a panel that has been paused - has
         no next frame, so the figure would simply vanish the first time a
         ResizeObserver fired. Repaint here instead of waiting for one. */
      if ((hostDriven || paused) && !inResize) {
        inResize = true;
        try { draw(); } finally { inResize = false; }
      }
    }

    /* Every gradient in the figure is built here, once per resize and once per
       strain step - not nine of them per frame. One light direction, from above
       and slightly in front, so the whole figure is lit by the same lamp
       instead of the torso being lit from below and the limbs from nowhere. */
    function buildGradients(gy, u) {
      var top = gy - u * 5.2, bot = gy + u * 0.1;
      var sk = parseCol(theme.skin) || [221, 230, 246];
      var dp = parseCol(theme.deep) || [108, 122, 150];
      var st = parseCol(theme.strain) || [255, 99, 118];
      var flush = toneBucket / 8 * 0.30;
      sk = mixv(sk, st, flush);
      dp = mixv(dp, st, flush * 0.5);
      /* Three values, far enough apart to read across a room: the near side
         catches the light, the body sits a step back, the far side is in
         shadow. Without that spread a near arm crossing the chest is the same
         value as the chest, and the figure flattens into a blob. */
      var mid = mixv(dp, sk, 0.46);
      function g(base, hiT, loT) {
        var lg = ctx.createLinearGradient(0, top, 0, bot);
        lg.addColorStop(0, rgb(tint(base, hiT)));
        lg.addColorStop(0.62, rgb(base));
        lg.addColorStop(1, rgb(darken(base, loT)));
        return lg;
      }
      gr = {
        near: g(sk, 0.26, 0.20),
        body: g(mid, 0.14, 0.32),
        far: g(dp, 0.04, 0.46),
        rim: 'rgba(255,255,255,' + (0.22 + flush * 0.2).toFixed(3) + ')',
        edge: 'rgba(8,13,22,.55)',
        floor: null
      };
      var fg = ctx.createRadialGradient(0, 0, 0, 0, 0, u * 3.4);
      fg.addColorStop(0, 'rgba(255,255,255,.075)');
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      gr.floor = fg;
      var pg = ctx.createLinearGradient(0, gy - u * 0.012, 0, gy + u * 0.088);
      pg.addColorStop(0, 'rgba(255,255,255,.22)');
      pg.addColorStop(1, 'rgba(130,150,180,.06)');
      gr.plate = pg;
    }

    /* ---- drawing helpers -------------------------------------------------
       A limb CHAIN is one closed path, not two tapered quads and six circles.
       It costs about half as much, and the knee and elbow stop reading as
       beads threaded on a string. */
    function chain(pts, ws, fill, rimW) {
      var n = pts.length, i, nx = [], ny = [], w = [];
      for (i = 0; i < n; i++) {
        var ax = 0, ay = 0, c = 0;
        if (i > 0) { var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, d = Math.sqrt(dx * dx + dy * dy) || 1e-4; ax += dy / d; ay += -dx / d; c++; }
        if (i < n - 1) { var ex2 = pts[i + 1].x - pts[i].x, ey = pts[i + 1].y - pts[i].y, e2 = Math.sqrt(ex2 * ex2 + ey * ey) || 1e-4; ax += ey / e2; ay += -ex2 / e2; c++; }
        var l = Math.sqrt(ax * ax + ay * ay) || 1e-4;
        nx.push(ax / l); ny.push(ay / l);
        /* Miter the joint. Averaging the two segment normals shortens the
           offset by cos(half the bend), so without this a hard elbow or a deep
           knee pinches the limb to a point and the arm reads as a folded
           ribbon rather than a limb. Clamped, or a fully folded joint spikes. */
        w.push(c === 2 ? ws[i] * Math.min(1.9, 2 / l) : ws[i]);
      }
      ws = w;
      var a0 = Math.atan2(ny[0], nx[0]), aN = Math.atan2(ny[n - 1], nx[n - 1]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x + nx[0] * ws[0], pts[0].y + ny[0] * ws[0]);
      for (i = 1; i < n; i++) ctx.lineTo(pts[i].x + nx[i] * ws[i], pts[i].y + ny[i] * ws[i]);
      ctx.arc(pts[n - 1].x, pts[n - 1].y, ws[n - 1], aN, aN + Math.PI, false);
      for (i = n - 2; i >= 0; i--) ctx.lineTo(pts[i].x - nx[i] * ws[i], pts[i].y - ny[i] * ws[i]);
      ctx.arc(pts[0].x, pts[0].y, ws[0], a0 + Math.PI, a0 + Math.PI * 2, false);
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      if (rimW) { ctx.strokeStyle = gr.rim; ctx.lineWidth = rimW; ctx.stroke(); }
    }

    /* The torso is a body, not a capsule: a pelvis wedge, a waist, a ribcage
       and a shoulder yoke. At 150 px the silhouette is the only thing that
       reads, so this is where the money goes. */
    function torso(hip, neck, u, fill) {
      var dx = neck.x - hip.x, dy = neck.y - hip.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
      var ux = dx / d, uy = dy / d, px = uy, py = -ux;   // spine and its normal
      var W0 = 0.30, W1 = 0.24, W2 = 0.30, W3 = 0.25;    // pelvis, waist, chest, yoke
      function at(f, w, s) { return { x: hip.x + ux * d * f + px * w * u * s, y: hip.y + uy * d * f + py * w * u * s }; }
      var f0 = at(0.02, W0, 1), f1 = at(0.30, W1, 1), f2 = at(0.68, W2, 1), f3 = at(1.0, W3, 1);
      var b3 = at(1.0, W3, -1), b2 = at(0.68, W2, -1), b1 = at(0.30, W1, -1), b0 = at(0.02, W0, -1);
      ctx.beginPath();
      ctx.moveTo(b0.x, b0.y);
      ctx.quadraticCurveTo(hip.x + px * W0 * u * 0.2 - ux * 0.20 * u, hip.y + py * W0 * u * 0.2 - uy * 0.20 * u, f0.x, f0.y);
      ctx.quadraticCurveTo(f1.x, f1.y, f2.x, f2.y);
      ctx.quadraticCurveTo(f3.x, f3.y, neck.x + px * W3 * u * 0.55, neck.y + py * W3 * u * 0.55);
      ctx.quadraticCurveTo(neck.x, neck.y - 0.02 * u, b3.x + px * u * 0.02, b3.y);
      ctx.quadraticCurveTo(b2.x, b2.y, b1.x, b1.y);
      ctx.quadraticCurveTo(b0.x, b0.y, b0.x, b0.y);
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = gr.rim; ctx.lineWidth = u * 0.025; ctx.stroke();
    }

    /* Built in contact-local space - the origin IS the point touching the
       floor, so the toe never leaves the plate and never sinks through it - but
       rotated into world coordinates by hand rather than with ctx.rotate.
       That is not a style choice: a canvas gradient lives in USER space, so a
       shape painted inside a transform samples the gradient somewhere else
       entirely. It cost the figure a black head and two black feet, and it is
       invisible until the movement happens to lean. */
    function foot(lg, u, fill) {
      var c = Math.cos(lg.th), sn = Math.sin(lg.th), cx = lg.cx, cy = lg.cy;
      function X(x, y) { return cx + x * c - y * sn; }
      function Y(x, y) { return cy + x * sn + y * c; }
      var toe = TOEF * u, heel = -(BALL + HEELB) * u, th = THICK * u, ah = ANKH * u;
      ctx.beginPath();
      ctx.moveTo(X(toe, -th * 0.55), Y(toe, -th * 0.55));
      ctx.quadraticCurveTo(X(toe * 1.25, 0), Y(toe * 1.25, 0), X(toe * 0.5, 0), Y(toe * 0.5, 0));
      ctx.lineTo(X(heel + u * 0.05, 0), Y(heel + u * 0.05, 0));
      ctx.quadraticCurveTo(X(heel, 0), Y(heel, 0), X(heel, -th * 0.7), Y(heel, -th * 0.7));
      ctx.lineTo(X(-(BALL + 0.02) * u, -(ah + 0.02 * u)), Y(-(BALL + 0.02) * u, -(ah + 0.02 * u)));
      ctx.lineTo(X(-(BALL - 0.16) * u, -(ah + 0.01 * u)), Y(-(BALL - 0.16) * u, -(ah + 0.01 * u)));
      ctx.quadraticCurveTo(X(-BALL * u * 0.1, -th * 1.3), Y(-BALL * u * 0.1, -th * 1.3),
                           X(toe, -th * 0.55), Y(toe, -th * 0.55));
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
    }

    /* A fist wrapped round the bar. Two of these change the read of every press
       and every pull more than anything else in the figure for four fills. */
    /* Rotated through ctx.ellipse's own angle rather than ctx.rotate, so the
       body gradient still lines up (see foot()). */
    function hand(h, el, u, fill) {
      var a = Math.atan2(h.y - el.y, h.x - el.x);
      ctx.beginPath();
      ctx.ellipse(h.x + Math.cos(a) * u * 0.02, h.y + Math.sin(a) * u * 0.02,
                  u * 0.115, u * 0.095, a, 0, 6.2832);
      ctx.fillStyle = fill; ctx.fill();
    }

    /* A head in profile: an ellipse a little longer along the way it is facing,
       plus a nose. Two shapes. The point is that the head has a DIRECTION at a
       glance - a bare circle gives the figure no gaze, and this rig's whole job
       is to show you where to look and which way to drive. */
    function headShape(hd, ang, u, fill) {
      var fx = Math.sin(ang + 1.5708), fy = -Math.cos(ang + 1.5708);   // facing
      var fa = Math.atan2(fy, fx), c = Math.cos(fa), sn = Math.sin(fa);
      function X(x, y) { return hd.x + x * c - y * sn; }
      function Y(x, y) { return hd.y + x * sn + y * c; }
      var r = HEAD * u;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(X(-u * 0.02, 0), Y(-u * 0.02, 0), r * 1.06, r * 0.94, fa, 0, 6.2832);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(X(r * 0.90, -r * 0.20), Y(r * 0.90, -r * 0.20));
      ctx.quadraticCurveTo(X(r * 1.26, -r * 0.02), Y(r * 1.26, -r * 0.02),
                           X(r * 0.86, r * 0.24), Y(r * 0.86, r * 0.24));
      ctx.closePath(); ctx.fill();
      return { fx: fx, fy: fy };
    }

    function face(hd, f, u) {
      var eye = { x: hd.x + f.fx * u * 0.13, y: hd.y + f.fy * u * 0.13 - u * 0.05 };
      /* The brow is the whole expression. It drops and darkens with the effort,
         and at a distance that single line does more than an eye and a mouth
         put together. */
      ctx.strokeStyle = 'rgba(10,18,30,' + (0.40 + strain * 0.42).toFixed(2) + ')';
      ctx.lineWidth = u * 0.042; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(eye.x - u * 0.055, eye.y - u * 0.10 + strain * u * 0.05);
      ctx.lineTo(eye.x + u * 0.075, eye.y - u * 0.13 + strain * u * 0.075);
      ctx.stroke();
      if (u < 34) return;                     // below this the eye is one pixel
      ctx.fillStyle = 'rgba(10,18,30,.78)';
      ctx.beginPath(); ctx.arc(eye.x, eye.y, u * 0.035, 0, 6.2832); ctx.fill();
      var mo = { x: hd.x + f.fx * u * 0.19, y: hd.y + f.fy * u * 0.19 + u * 0.15 };
      ctx.lineWidth = u * 0.035;
      ctx.beginPath();
      if (strain > 0.45) { ctx.moveTo(mo.x - u * 0.055, mo.y); ctx.lineTo(mo.x + u * 0.065, mo.y); }
      else ctx.arc(mo.x, mo.y - u * 0.035, u * 0.075, 0.35, 2.8);
      ctx.stroke();
    }

    /* Latex under load. It bows perpendicular to its OWN run, so a vertical
       band kinks sideways and a horizontal one sags downward - the old code
       offset both strands along world X and put the sag on world Y regardless
       of direction, which drew the deadlift's near-vertical band dead straight
       at every value of stretch and collapsed the chest press's near-horizontal
       one into a single wire. Loaded band narrows, straightens, and its strands
       pull together; slack band is fat, separated and hangs. */
    function bandRun(x1, y1, x2, y2, stretch, u, strands) {
      var dx = x2 - x1, dy = y2 - y1, d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
      var ux = dx / d, uy = dy / d;
      var px = -uy, py = ux;
      if (py < 0) { px = -px; py = -py; }              // bow with gravity
      var s = cl01(stretch);
      var sag = (1 - s) * (1 - s) * u * 0.50;
      /* Loaded latex: a slack band is fat and its strands lie apart; a taut one
         is thin and its strands pull together. The separation has to beat the
         strand width or a doubled band reads as one wire. */
      var sep = lerp(u * 0.16, u * 0.05, s);
      var lw = lerp(u * 0.075, u * 0.034, s);
      var mx = (x1 + x2) / 2 + px * sag, my = (y1 + y2) / 2 + py * sag;
      ctx.lineCap = 'round';
      ctx.strokeStyle = theme.band;
      ctx.lineWidth = lw;
      ctx.globalAlpha = 0.9;
      if (strands < 2) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
      } else {
        for (var k = -1; k <= 1; k += 2) {
          ctx.beginPath();
          ctx.moveTo(x1 + px * sep * k * 0.30, y1 + py * sep * k * 0.30);
          ctx.quadraticCurveTo(mx + px * sep * k, my + py * sep * k, x2 + px * sep * k * 0.30, y2 + py * sep * k * 0.30);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      if (s > 0.70) {                                   // taut latex catches light
        ctx.strokeStyle = 'rgba(255,240,180,' + ((s - 0.70) / 0.30 * 0.42).toFixed(3) + ')';
        ctx.lineWidth = lw * 0.42;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
      }
    }

    /* The bar, seen END-ON, because this is a side elevation. The old one drew
       a 1.1-unit capsule at a fixed rotation - a front view of a bar dropped
       into a side view of a person - and on the two squats and the tricep press
       it was painted straight through the face for the entire rep. */
    function barEnd(x, y, u, grip, glow) {
      var r = u * (0.13 + 0.045 * cl01(grip));
      var g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
      g.addColorStop(0, '#EEF3FC'); g.addColorStop(0.55, '#9FADC4'); g.addColorStop(1, '#59667C');
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = g; ctx.fill();
      /* A crescent of warm light on the loaded side, not a ring: a ring round
         a metal disc reads as a washer, and this is meant to say the bar is
         under tension. */
      if (glow > 0.55) {
        ctx.strokeStyle = 'rgba(255,201,74,' + ((glow - 0.55) * 0.85).toFixed(2) + ')';
        ctx.lineWidth = u * 0.03;
        ctx.beginPath(); ctx.arc(x, y, r * 1.12, 2.0, 4.9); ctx.stroke();
      }
    }

    /* ---- the figure ------------------------------------------------------ */
    var scratchP = {}, scratchJ = {}, ghostP = {}, ghostJ = {};

    function drawFigure(j, p, u, showFace, drawBar) {
      var nearW = [u * 0.20, u * 0.135, u * 0.095];
      var farW = [u * 0.175, u * 0.115, u * 0.082];
      var rim = u * 0.022;

      // far side first, in the shadow tone - cheap, honest depth
      chain([{ x: j.farHip.x, y: j.farHip.y }, j.far.kn, j.far.ank], farW, gr.far, 0);
      foot(j.far, u, gr.far);
      chain([{ x: j.farSho.x, y: j.farSho.y }, j.armFar.el, j.armFar.hnd],
            [u * 0.115, u * 0.088, u * 0.068], gr.far, 0);
      hand(j.armFar.hnd, j.armFar.el, u, gr.far);

      torso(j.hip, j.neck, u, gr.body);

      // near leg, lighter, with a rim so it separates from the torso above it
      chain([{ x: j.hip.x + u * 0.05, y: j.hip.y }, j.near.kn, j.near.ank], nearW, gr.near, rim);
      foot(j.near, u, gr.near);

      /* Band and bar go in HERE - in front of the legs and the torso, behind
         the head. Painting the bar last put an opaque plate across the face for
         whole reps of the two squats and the tricep press: the head tilt, the
         grimace and the head cue all invisible on exactly the movements that
         have head cues. The near hand still lands on top of it, so it reads as
         a grip either way.

         A bar that is genuinely IN FRONT of the face is the exception and gets
         drawn over the head instead - the overhead press passes the bar right
         past the nose at mid-rep, and letting the head occlude it there would
         draw the one thing the source forbids outright ("never behind the
         head"). */
      if (drawBar && !barInFront(j, u)) drawBar();

      // neck then head, so the head is attached rather than balanced on top
      var ha = p.lean + p.head;
      chain([{ x: j.neck.x, y: j.neck.y },
             { x: j.head.x - Math.sin(ha) * HEAD * u * 0.7, y: j.head.y + Math.cos(ha) * HEAD * u * 0.7 }],
            [u * 0.115, u * 0.10], gr.body, 0);
      var f = headShape(j.head, ha, u, gr.near);
      if (showFace) face(j.head, f, u);

      /* The near arm goes last. In a side elevation it genuinely crosses the
         torso on the rows and the presses - that is not a bug, that is what an
         arm does - so it gets three separations at once: a lighter tone than
         the body, a rim, and a soft dark contact edge underneath, but only
         while the elbow is actually inside the torso band. Without all three
         it reads as a scribble drawn on the chest. */
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (overTorso(j, u)) {
        ctx.strokeStyle = gr.edge; ctx.lineWidth = u * 0.30;
        ctx.beginPath();
        ctx.moveTo(j.sho.x, j.sho.y);
        ctx.lineTo(j.armNear.el.x, j.armNear.el.y);
        ctx.lineTo(j.armNear.hnd.x, j.armNear.hnd.y);
        ctx.stroke();
      }
      chain([{ x: j.sho.x, y: j.sho.y }, j.armNear.el, j.armNear.hnd],
            [u * 0.125, u * 0.096, u * 0.074], gr.near, rim);
      hand(j.armNear.hnd, j.armNear.el, u, gr.near);
      if (drawBar && barInFront(j, u)) { drawBar(); hand(j.armNear.hnd, j.armNear.el, u, gr.near); }
    }

    function barInFront(j, u) {
      return j.bar.x > j.head.x + HEAD * u * 0.15 &&
             Math.abs(j.bar.y - j.head.y) < HEAD * u * 2.2;
    }

    /* Is the near elbow inside the torso silhouette? Distance from the elbow to
       the hip-neck segment against the widest the body gets. */
    function overTorso(j, u) {
      var ax = j.hip.x, ay = j.hip.y, vx = j.neck.x - ax, vy = j.neck.y - ay;
      var L2 = vx * vx + vy * vy || 1e-4;
      var q = ((j.armNear.el.x - ax) * vx + (j.armNear.el.y - ay) * vy) / L2;
      q = q < 0 ? 0 : q > 1 ? 1 : q;
      var dx = j.armNear.el.x - (ax + vx * q), dy = j.armNear.el.y - (ay + vy * q);
      return dx * dx + dy * dy < (0.34 * u) * (0.34 * u);
    }

    /* The trail is the near-side spine, stroked. Six complete figures - feet,
       faces, brows, torso gradients - cost four and a half times the real
       athlete, and the oldest of them was drawn at exactly alpha 0 every frame
       of the module's life. */
    function ghostSpine(j, u, alpha, col) {
      ctx.strokeStyle = col; ctx.globalAlpha = alpha;
      ctx.lineWidth = u * 0.10; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(j.near.ank.x, j.near.ank.y);
      ctx.lineTo(j.near.kn.x, j.near.kn.y);
      ctx.lineTo(j.hip.x, j.hip.y);
      ctx.lineTo(j.neck.x, j.neck.y);
      ctx.moveTo(j.sho.x, j.sho.y);
      ctx.lineTo(j.armNear.el.x, j.armNear.el.y);
      ctx.lineTo(j.armNear.hnd.x, j.armNear.hnd.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* ---- the range gauge -------------------------------------------------
       The track IS the movement, top to bottom. The hazards live OUTSIDE it:
       lockout is past the top of the range, not at the top of the range, and
       the old gauge parked the marker on its own red "no lockout" bar whenever
       you pulled hard - the one element that means stop was where the app put
       you for doing it right. */
    /* A linear proportion of the range, expressed as a position in the drawn
       range. The gauge is a picture of the movement, so anything logged in
       linear terms has to come back through the same curve the pose does. */
    function poseOf(lin) { return Math.pow(cl01(lin), protocol().curveExp || 0.65); }

    function gauge(x, y, h, w) {
      var zone = curveOf(ex) === 'mid' ? [0.32, 0.74] : [0.58, 0.95];
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, w / 2); ctx.fill(); }
      else ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(51,226,174,.26)';
      ctx.fillRect(x, y + h * (1 - zone[1]), w, h * (zone[1] - zone[0]));
      // hazards, drawn clear of the track at both ends
      ctx.fillStyle = 'rgba(255,99,118,.7)';
      ctx.fillRect(x - w * 0.5, y - w * 1.6, w * 2, Math.max(1, w * 0.5));
      ctx.fillStyle = 'rgba(255,201,74,.55)';
      ctx.fillRect(x - w * 0.5, y + h + w * 1.1, w * 2, Math.max(1, w * 0.5));

      /* What the set is actually doing: where your range used to reach, and
         where it reaches now. This is the burnout, drawn. */
      if (sessionTop > 0.2 && reps > 1) {
        ctx.fillStyle = 'rgba(255,255,255,.30)';
        ctx.fillRect(x - w * 0.35, y + h * (1 - poseOf(sessionTop)), w * 1.7, Math.max(1, w * 0.32));
        if (recentTop > 0.02 && recentTop < sessionTop * 0.95) {
          ctx.fillStyle = tier === 2 ? theme.strain : theme.amber;
          ctx.fillRect(x - w * 0.35, y + h * (1 - poseOf(recentTop)), w * 1.7, Math.max(1, w * 0.42));
        }
      }
      var py = y + h * (1 - cl01(t));
      ctx.fillStyle = theme.accent;
      ctx.beginPath(); ctx.arc(x + w / 2, py, w * 0.95, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.beginPath(); ctx.arc(x + w / 2, py, w * 0.34, 0, 6.2832); ctx.fill();
    }

    /* ---- per-frame simulation -------------------------------------------- */
    function step(dt) {
      clock += dt;
      if (missing) return;
      var n = 0;
      if (mode === 'live') {
        n = +getN() || 0;
        /* n = 1.0 is your calibrated all-out max for this movement and band,
           and it may exceed 1. The pose reaches the authored top - which is
           the SAFE top, no lockout - exactly at your max, eased on the
           program's own curve exponent so the strong range gets the room it
           deserves. It used to saturate at 0.90, so 95% and 130% of max drew
           the identical figure. */
        tgtL = cl01(n);
        tgt = Math.pow(tgtL, protocol().curveExp || 0.65);
      } else {
        phase += dt * 1000 / Math.max(700, tempo);
        if (phase > 1) phase -= 1;
        var s = phase < 0.5 ? phase / 0.5 : 1 - (phase - 0.5) / 0.5;
        tgt = 0.05 + 0.95 * (s * s * (3 - 2 * s));
        tgtL = tgt;
        n = tgt;
      }
      var k = 1 - Math.exp(-dt * (mode === 'live' ? 11 : 14));
      var pt = t; t += (tgt - t) * k; tl += (tgtL - tl) * k;
      vel = (t - pt) / Math.max(dt, 1e-3);
      /* Smoothed, with hysteresis. A bar reporting +/-5% jitter while you hold
         at the top used to strobe the phase label 125 times in three seconds,
         in a panel whose entire job is to be readable at a glance. */
      velS += (vel - velS) * (1 - Math.exp(-dt * 9));
      if (velS > 0.30) dir = 1; else if (velS < -0.30) dir = -1;
      else if (Math.abs(velS) < 0.14) dir = 0;

      /* Effort is FORCE. Range is the pose. Keeping them separate is what lets
         a hold at the top read differently from a grind at the top, and stops
         the idle tempo preview - where there is no athlete at all - from
         grimacing and sweating on every rep. */
      var eTgt, oTgt = 0;
      if (mode === 'live') {
        eTgt = cl01((n - 0.50) / 0.50);
        oTgt = cl01((n - 0.95) / 0.30);
      } else {
        eTgt = cl01((t - 0.70) / 0.30) * 0.22;
      }
      effort += (eTgt - effort) * (1 - Math.exp(-dt * 5));
      over += (oTgt - over) * (1 - Math.exp(-dt * 4));
      strain = cl01(effort + over * 0.25);

      trackRange(dt);

      /* Slack at the bottom is a real, detectable form fault and the source is
         emphatic about it. Only in live mode, and only once a set is under way. */
      if (mode === 'live' && reps > 0 && n < 0.03) slackFor += dt; else slackFor = 0;
      if (slackFor > 0.6) faultT = 2.2;
      if (faultT > 0) faultT -= dt;

      if (quality >= 3 && strain > 0.58 && Math.random() < dt * 12) {
        sweat.push({ x: Math.random() - 0.5, y: 0, v: 0.4 + Math.random() * 0.7, l: 0 });
      }
      for (var i = sweat.length - 1; i >= 0; i--) {
        var s2 = sweat[i]; s2.l += dt; s2.y += s2.v * dt;
        if (s2.l > 0.9) sweat.splice(i, 1);
      }
      if (quality >= 2) { ghosts.push(t); if (ghosts.length > 4) ghosts.shift(); }
      else ghosts.length = 0;
    }

    /* ---- paint ------------------------------------------------------------ */
    function label(txt, x, y, size, col, align) {
      ctx.font = '700 ' + size.toFixed(1) + 'px ' + fontFam;
      ctx.textAlign = align || 'left';
      ctx.fillStyle = col;
      ctx.fillText(txt, x, y);
    }
    /* Fit a line of the movement's own coaching text into the width there is,
       wrapping to a second line rather than shrinking below legibility. */
    function wrapTip(txt, size, room, x, y, col) {
      ctx.fillStyle = col;
      ctx.textAlign = 'left';
      /* Shrink until it fits two lines, then wrap. Two lines is the budget: at
         a glance between reps nobody reads a third. Losing the tail of the
         sentence silently is worse than a smaller font, so the size comes down
         first and only a genuinely enormous line gets an ellipsis. */
      var lines = null;
      for (var fs = size; fs >= size * 0.72; fs -= size * 0.07) {
        ctx.font = '500 ' + fs.toFixed(1) + 'px ' + fontFam;
        lines = layout(txt, room);
        if (lines.length <= 2) { size = fs; break; }
      }
      if (!lines) lines = [txt];
      if (lines.length > 2) {
        lines = [lines[0], lines[1]];
        while (lines[1] && ctx.measureText(lines[1] + '...').width > room) {
          lines[1] = lines[1].replace(/\s*\S+$/, '');
          if (!lines[1]) break;
        }
        lines[1] += '...';
      }
      for (var k = 0; k < lines.length; k++) {
        ctx.fillText(lines[k], x, y - (lines.length - 1 - k) * size * 1.24);
      }
    }
    function layout(txt, room) {
      var words = txt.split(' '), line = '', out = [];
      for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > room && line) { out.push(line); line = words[i]; }
        else line = test;
      }
      if (line) out.push(line);
      return out;
    }

    function draw() {
      if (!W || !H) resize();
      if (!W || !H) return;
      /* Leave the top of the frame to the phase label and the bottom of a
         full-size canvas to the coaching line. Fitting the figure edge to edge
         put the head behind the label on every movement that finishes tall. */
      var pad = compact ? 0.86 : 0.79;
      if (missing) {
        ctx.clearRect(0, 0, W, H);
        var fz = Math.max(9, Math.min(H * 0.052, 15));
        label('No form guide', W / 2, H / 2 - fz * 0.2, fz, theme.dim, 'center');
        label('for this movement', W / 2, H / 2 + fz * 1.1, fz, theme.dim, 'center');
        return;
      }
      var m = metrics(ex);
      /* Fit vertically to a fixed human height, and shrink further only if the
         movement is genuinely wide - a split squat's stance would otherwise
         walk out of the frame. Fixed per movement, so the figure never grows
         or shrinks mid-rep. */
      var u = Math.min(H * pad / m.h, W * 0.94 / m.w);
      var gy = H * (compact ? 0.92 : 0.87), gx = W * 0.5 - m.cx * u;

      var tb = Math.round(strain * 8);
      if (!gr || tb !== toneBucket) { toneBucket = tb; buildGradients(gy, u); }

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(gx, gy);
      ctx.fillStyle = gr.floor;
      ctx.fillRect(-W, -H, W * 2, H * 2);
      ctx.restore();

      var p = blend(ex, t, scratchP);
      var j = solve(ex, p, u, gx, gy, scratchJ);
      j.__p = p;

      /* A shadow under each contact point, shrinking and softening as the heel
         leaves the floor. The old one was a single ellipse at a fixed offset
         from the origin, so every figure's feet sat above their own shadow and
         the split squat's rear foot floated over bare floor. */
      ctx.fillStyle = 'rgba(0,0,0,.34)';
      shadow(j.far, u, gy, 0.72); shadow(j.near, u, gy, 1);

      var mm = meta(ex);
      var footAnchored = !ex.bandAt;
      if (footAnchored && mm && mm.plate && mm.plate !== 'none') plate(j, u, gy, mm.plate === 'balls');

      ctx.save();
      if (strain > 0.28 && !reduced) {
        /* Trembling is stabilisation and the source praises it, so it should
           look like muscle, not like video noise. Two low frequencies summed,
           not a fresh Math.random() every painted frame. */
        var a = (strain - 0.28) * u * 0.11;
        ctx.translate(Math.sin(clock * 44.0) * a + Math.sin(clock * 71.3) * a * 0.6,
                      Math.cos(clock * 52.7) * a * 0.7);
      }

      if (quality >= 2 && ghosts.length > 1) {
        for (var g = 0; g < ghosts.length - 1; g++) {
          if (Math.abs(ghosts[g] - t) < 0.02) continue;
          blend(ex, ghosts[g], ghostP);
          solve(ex, ghostP, u, gx, gy, ghostJ);
          ghostSpine(ghostJ, u, ((g + 1) / ghosts.length) * 0.13, theme.accent);
        }
      }

      /* Where your range USED to reach. Once the set drops out of full range
         this is the whole story of an X3 set in one outline. */
      var topPose = poseOf(sessionTop);
      if (tierMix > 0.05 && topPose > t + 0.06) {
        blend(ex, topPose, ghostP);
        solve(ex, ghostP, u, gx, gy, ghostJ);
        ghostSpine(ghostJ, u, 0.10 + tierMix * 0.12, theme.dim);
      }

      var anchor = anchorAt(ex, j, u, gx, gy);
      /* Normalised against THIS movement's own travel, with a floor on the
         span so a movement whose band genuinely barely stretches - the calf
         raise pays out 0.19 units across a whole rep - is not drawn as though
         it went taut. And a floor of 0.15 on the result, because X3 never lets
         the band go slack and the figure should never say otherwise. */
      var travel = Math.max(m.d1 - m.d0, 0.45);
      var stretch = cl01(0.15 + 0.85 * ((bandSpan(ex, j, u, gy) - m.d0) / travel));
      var strands = strandsOf(ex);

      /* Below about 30 px per figure unit the eye is a single device pixel and
         the mouth is two, so the face is drawn as a brow only and the ops go
         into the silhouette, which is the thing that actually reads at 150 px. */
      var showFace = quality >= 1 && (u >= 30 || (!compact && u >= 22));
      var glow = stretch * (0.55 + strain * 0.6);
      drawFigure(j, p, u, showFace, function () {
        bandLimb(anchor, j, u, stretch, strands, p);
        if (p.grip > 0.05) barEnd(j.bar.x, j.bar.y, u, p.grip, glow);
      });

      if (strain > 0.30 && quality >= 1) {
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        var sr = u * 1.4, hx = j.hip.x, hy = j.hip.y - u * 0.55;
        var hg = ctx.createRadialGradient(hx, hy, u * 0.3, hx, hy, sr);
        var sa = (strain - 0.30) * 0.26;
        hg.addColorStop(0, 'rgba(255,120,140,' + sa.toFixed(3) + ')');
        hg.addColorStop(1, 'rgba(255,120,140,0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(hx, hy, sr, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
      if (sweat.length) {
        ctx.fillStyle = 'rgba(200,235,255,.8)';
        for (var s = 0; s < sweat.length; s++) {
          var sp = sweat[s];
          ctx.globalAlpha = 1 - sp.l / 0.9;
          ctx.beginPath();
          ctx.arc(j.head.x + sp.x * u * 0.4, j.head.y + sp.y * u * 2.2, u * 0.045, 0, 6.2832);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      gauge(W - (compact ? 11 : 18), H * 0.15, H * 0.66, compact ? 3.5 : 5.5);
      labels();
    }

    function shadow(lg, u, gy, w) {
      var soft = 1 - lg.lift * 0.55;
      ctx.beginPath();
      ctx.ellipse(lg.cx - u * 0.10, gy + u * 0.03, u * (0.42 * w) * soft, u * 0.062 * soft, 0, 0, 6.2832);
      ctx.fill();
    }

    /* The ground plate, drawn where the movement's own setup says the band
       runs under the foot. 'balls' really does put the heels off the back
       edge, so the plate is shorter behind the ankle. */
    function plate(j, u, gy, ball) {
      var x0 = j.near.ank.x - (ball ? 0.10 : 0.46) * u;
      var x1 = j.near.ank.x + (BALL + 0.26) * u;
      var h = u * 0.10, y0 = gy - u * 0.012;
      ctx.fillStyle = gr.plate;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, h, h * 0.35); ctx.fill(); }
      else ctx.fillRect(x0, y0, x1 - x0, h);
    }

    /* One band to the bar, or - on the crossover, which has no bar - one to
       each hand, because that is what a loop behind the back actually does. */
    function bandLimb(anchor, j, u, stretch, strands, p) {
      if (p.grip <= 0.05) {
        bandRun(anchor.x, anchor.y, j.armFar.hnd.x, j.armFar.hnd.y, stretch, u, 1);
        bandRun(anchor.x, anchor.y, j.armNear.hnd.x, j.armNear.hnd.y, stretch, u, 1);
      } else {
        bandRun(anchor.x, anchor.y, j.bar.x, j.bar.y, stretch, u, strands);
      }
    }

    /* Five states, and three of them are the program's three tiers. */
    function phaseLabel() {
      if (mode !== 'live' || reps < 2) return { s: dir > 0 ? verbOf() : dir < 0 ? 'EASE' : (t > 0.5 ? 'HOLD' : 'TENSION'), c: dir > 0 ? theme.accent : dir < 0 ? theme.band : theme.dim };
      if (tier === 2) return { s: 'WEAK RANGE', c: theme.strain };
      if (tier === 1) return { s: 'MID RANGE', c: theme.amber };
      if (dir > 0) return { s: verbOf(), c: theme.accent };
      if (dir < 0) return { s: 'EASE', c: theme.band };
      return { s: t > 0.5 ? 'HOLD' : 'TENSION', c: theme.dim };
    }
    function verbOf() { var mm = meta(ex); return (mm && mm.verb) || ex.verb || 'PULL'; }

    function labels() {
      var f = compact ? Math.max(9, H * 0.055) : Math.max(11, Math.min(H * 0.048, 22));
      var ph = phaseLabel();
      label(ph.s, compact ? 8 : 12, f * 1.5, f, ph.c, 'left');

      /* Once the set drops out of full range the phase label already names the
         tier, so the corner carries the thing worth counting: how many partials
         you have ground out since it did. Measured against the room actually
         left beside the phase label and stepped down until it fits - a 19
         character banner right-aligned in a 104 px panel used to start eleven
         pixels off the left edge, on top of the phase label. */
      if (mode === 'live' && tier > 0 && reps > 1) {
        var cnt = tier === 2 ? weakReps : midReps;
        ctx.font = '700 ' + f.toFixed(1) + 'px ' + fontFam;
        var room = W - (compact ? 26 : 44) - ctx.measureText(ph.s).width;
        var word = cnt === 1 ? ' PARTIAL' : ' PARTIALS';
        var opts2 = [cnt + (tier === 2 ? ' WEAK-RANGE' : ' MID-RANGE') + word,
                     cnt + word, String(cnt)];
        var banner = opts2[opts2.length - 1];
        ctx.font = '700 ' + (f * 0.92).toFixed(1) + 'px ' + fontFam;
        for (var q = 0; q < opts2.length; q++) {
          if (ctx.measureText(opts2[q]).width <= room) { banner = opts2[q]; break; }
        }
        label(banner, W - (compact ? 8 : 14), f * 1.5, f * 0.92,
              tier === 2 ? theme.strain : theme.amber, 'right');
      }

      if (compact) return;
      var tip;
      if (faultT > 0) {
        tip = officialLine(ex, 'f0') || 'Never let the band go slack';
        wrapTip(tip, Math.max(10, Math.min(H * 0.042, 18)), W - 24, 12, H - 12, theme.strain);
        return;
      }
      tip = officialLine(ex, t > 0.55 ? ex.cueB : ex.cueA);
      if (!tip) tip = t > 0.55 ? 'No lockout at the top' : 'Keep the tension at the bottom';
      wrapTip(tip, Math.max(10, Math.min(H * 0.042, 18)), W - 24, 12, H - 12, theme.dim);
    }

    /* ---- loop and lifecycle ---------------------------------------------- */
    /* A panel inside a game shares the frame budget with the game's own loop,
       so it simulates every frame and repaints at a fraction of the display
       rate. The old code reset its accumulator to zero instead of subtracting
       the interval, so the "34 fps" in its comment was really 30 on a 60 Hz
       panel and 25 on a 50 Hz one. */
    var minFrame = compact ? 1 / 30 : 0;

    function onVis() { hidden = document.visibilityState !== 'visible'; }
    function onResize() { resize(); }

    function loop(now2) {
      if (!alive || hostDriven) { rafId = 0; return; }
      rafId = requestAnimationFrame(loop);
      var dt = Math.min(0.05, (now2 - last) / 1000); last = now2;
      if (paused || hidden) return;             // "off" must actually cost nothing
      var t0 = now2;
      step(dt);
      acc += dt;
      if (acc >= minFrame) {
        acc = minFrame > 0 ? Math.min(acc - minFrame, minFrame) : 0;
        draw();
        /* Give frames back before the stutter is visible, and never climb back
           mid-session. Same posture as x3f-fx.js, which is the in-repo
           precedent - this module is the more expensive of the two per pixel
           and was the only one with no posture at all. */
        var cost = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;
        avgMs = avgMs * 0.9 + cost * 0.1;
        if (avgMs > 7) { if (++slowFrames > 40 && quality > 0) { quality--; slowFrames = 0; } }
        else slowFrames = Math.max(0, slowFrames - 1);
      }
    }

    readFont();
    resize();
    var ro = null;
    if (window.ResizeObserver) { try { ro = new ResizeObserver(onResize); ro.observe(canvas); } catch (e) { ro = null; } }
    if (!ro) addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    if (!hostDriven) rafId = requestAnimationFrame(loop);

    var inst = {
      setExercise: function (s) {
        var next = EXR[s];
        /* Returns whether it took. Silently keeping the previous figure while
           the caller relabels the panel is how you end up demonstrating the
           deadlift under a caption that says calf raise. */
        slug = s; ex = next || null; missing = !next;
        if (next) { next.__slug = s; next.__meta = undefined; }
        t = tl = 0; tgt = tgtL = 0; phase = 0; vel = velS = 0; dir = 0;
        strain = effort = over = 0; acc = 0;
        resetSet();
        gr = null; toneBucket = -1;
        return !!next;
      },
      setMode: function (m) { var n = m === 'live' ? 'live' : 'tempo'; if (n !== mode) { mode = n; resetSet(); } },
      setTempo: function (ms) { tempo = +ms || 3000; },
      setTheme: function (o) { theme = Object.assign(theme, o || {}); gr = null; toneBucket = -1; readFont(); },
      resize: resize,
      /* Advance and repaint exactly one frame, for a host that owns the frame
         budget. The first call takes ownership: the internal loop stops
         stepping, so a host that drives this never gets two simulation steps
         per frame - which used to double the tempo and halve the smoothing the
         moment anyone took the documented hook. */
      frame: function (dt) {
        if (!hostDriven) {
          hostDriven = true;
          if (rafId) { try { cancelAnimationFrame(rafId); } catch (e) {} rafId = 0; }
        }
        step(Math.min(0.05, dt || 0.016));
        draw();
      },
      resetSet: resetSet,
      /* Pausing stops the rAF outright rather than idling in it, because the
         point of turning the guide off on a slow TV is to get the frame back. */
      pause: function (v) {
        v = !!v;
        if (v === paused) return;
        paused = v;
        if (paused) { if (rafId) { try { cancelAnimationFrame(rafId); } catch (e) {} rafId = 0; } }
        else if (alive && !hostDriven && !rafId) { last = now(); rafId = requestAnimationFrame(loop); }
      },
      destroy: function () {
        alive = false;
        if (rafId) { try { cancelAnimationFrame(rafId); } catch (e) {} rafId = 0; }
        document.removeEventListener('visibilitychange', onVis);
        if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }
        else removeEventListener('resize', onResize);
      },
      state: function () {
        return { t: t, lin: tl, dir: dir, reps: reps, strain: strain,
                 burnout: tier > 0 ? tierMix : 0,
                 tier: ['full', 'mid', 'weak'][tier],
                 full: fullReps, mid: midReps, weak: weakReps,
                 top: sessionTop, recent: recentTop, amp: lastAmp,
                 effort: effort, over: over };
      },
      has: function (s) { return !!EXR[s]; }
    };
    if (ex) { ex.__slug = slug; }
    return inst;
  }

  /* ═══════════════════════════ floating panel for the games ═════════════ */
  var styled = false;
  function panelCss() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    /* No backdrop-filter. A blurred panel measured ~90 ms a frame on a TV SoC
       against a 10 ms budget, and this one sits on top of a running game. An
       opaque ground costs nothing and is more readable over a moving scene. */
    s.textContent =
      '.x3ff{position:absolute;left:10px;bottom:10px;width:clamp(104px,21vw,168px);' +
      'border-radius:14px;overflow:hidden;pointer-events:none;z-index:6;' +
      'background:rgba(15,17,20,.90);border:1px solid rgba(236,238,242,.16);' +
      'opacity:0;transform:translateY(8px) scale(.96);' +
      'transition:opacity .28s ease,transform .28s cubic-bezier(.2,.9,.25,1)}' +
      '.x3ff.on{opacity:1;transform:none}' +
      '.x3ff .x3ff-h{display:flex;align-items:baseline;gap:5px;padding:6px 8px 2px;' +
      "font-family:var(--font-display,'Space Grotesk',system-ui,sans-serif);font-size:9px;" +
      'letter-spacing:1.4px;text-transform:uppercase;color:rgba(236,238,242,.55)}' +
      '.x3ff .x3ff-h b{font-size:10.5px;letter-spacing:.3px;text-transform:none;color:rgba(236,238,242,.94)}' +
      '.x3ff canvas{display:block;width:100%;height:auto;aspect-ratio:1/1.12}' +
      '@supports not (aspect-ratio:1/1){.x3ff canvas{height:170px}}' +
      '@media (max-height:430px){.x3ff{width:clamp(92px,16vw,124px)}}' +
      '@media (prefers-reduced-motion:reduce){.x3ff{transition:none}}';
    document.head.appendChild(s);
  }

  function mount(o) {
    o = o || {};
    var host = o.host || document.getElementById('stage') || document.body;
    if (!EXR[o.exercise]) return null;
    panelCss();
    var wrap = document.createElement('div'); wrap.className = 'x3ff';
    var meta = null;
    try { meta = (window.X3FEX && window.X3FEX.get(o.exercise)) || null; } catch (e) {}
    /* textContent, not innerHTML: the name arrives from a different module and
       there is no reason for this to be the one injection point in the file. */
    var head = document.createElement('div'); head.className = 'x3ff-h';
    var tagEl = document.createElement('span'); tagEl.textContent = 'Form';
    var nameEl = document.createElement('b');
    nameEl.textContent = (meta && meta.name) || EXR[o.exercise].label;
    head.appendChild(tagEl); head.appendChild(nameEl);
    wrap.appendChild(head);
    var cv = document.createElement('canvas'); wrap.appendChild(cv);
    host.appendChild(wrap);

    var inst = create(cv, {
      exercise: o.exercise, mode: 'live', getN: o.getN, theme: o.theme, compact: true
    });
    var on = true;
    function show(v) {
      on = !!v;
      wrap.classList.toggle('on', on);
      /* Off has to STOP the work, not just hide it. Toggling opacity left the
         canvas laid out and the loop painting a thousand calls a frame, so a
         user turning the guide off to reclaim frames on a slow TV reclaimed
         nothing at all. */
      inst.pause(!on);
      try { localStorage.setItem('x3f_formOn', JSON.stringify(on)); } catch (e) {}
    }
    try { var st = JSON.parse(localStorage.getItem('x3f_formOn')); if (st === false) on = false; } catch (e) {}
    // a timer, not rAF: a backgrounded tab must not leave the panel invisible
    var revealT = setTimeout(function () { show(on); }, 40);
    var btn = o.toggleBtn, onClick = null;
    if (btn) {
      btn.style.display = '';
      var sync = function () { btn.textContent = on ? 'Form on' : 'Form off'; };
      sync();
      onClick = function () { show(!on); sync(); };
      btn.addEventListener('click', onClick);
    }
    inst.panel = wrap; inst.show = show;
    inst.unmount = function () {
      clearTimeout(revealT);
      inst.destroy();
      if (btn && onClick) btn.removeEventListener('click', onClick);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };
    return inst;
  }

  /* Tag each rig with its own slug so the database lookup has a key, and take
     the movement's real verb from the database when it is loaded. verb() is
     for anything OUTSIDE the panel that has to name the effort - a game's
     "pull to fire" prompt, a calibration countdown - so the whole screen
     agrees with the movement instead of telling you to PULL on a push day. */
  for (var k in EXR) if (EXR.hasOwnProperty(k)) EXR[k].__slug = k;

  window.X3FForm = {
    create: create, mount: mount, rigs: EXR,
    has: function (s) { return !!EXR[s]; },
    verb: function (s) {
      var r = EXR[s];
      if (!r) return 'PULL';
      var m = null;
      try { m = (window.X3FEX && window.X3FEX.get) ? window.X3FEX.get(s) : null; } catch (e) {}
      return (m && m.verb) || r.verb || 'PULL';
    }
  };
})();
