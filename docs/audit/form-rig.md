# Audit — `web/x3f-form.js` (the live animated form demonstrator)

**File audited:** `E:/Fun/x3f-tv/web/x3f-form.js` — 574 lines, 30,907 bytes, read in full.

**Byte-identical copy:** `E:/Fun/x3f-tv/app/src/main/assets/x3f-form.js` (`diff` reports no differences). `web/` is the source of truth; `tools/sync-from-web.py:52` lists `x3f-form.js` in `SHARED` and copies it verbatim into the Android TV bundle. **Any change must be made in `web/` and re-synced — never edited in `app/`.**

**Cross-referenced (read for contract, not audited):**
`web/x3f-exercises.js`, `web/x3f-cal.js`, `web/X3F_Routine.html`, `web/X3F_Calibrate.html`, `web/X3F_Bloom.html`, `web/X3F_Nova.html`, `web/X3F_Splash.html`, `web/x3f-fx.js`, `tools/func-test/cases.js`, `tools/sync-from-web.py`, `HANDOFF.md`, `ROADMAP.md`.

**Method.** Beyond reading the file, three harnesses were built and run so that every geometric and behavioural claim below is a measured number rather than an impression:

1. A faithful re-implementation of the rig's geometry (`ik`, `blend`, `reach`, and `figure()`'s joint solve) to compute every joint of every movement at `t = 0, 0.25, 0.5, 0.75, 1`.
2. The **real module** loaded into a Node VM against a `Proxy` 2D context that counts every canvas call, driven through `inst.frame(dt)` — giving true ops-per-frame.
3. The **real module** driven through realistic X3 sets (full reps → partials) at 24/30/60/120 fps, with `peak` / `peakDecay` exposed, to test the burnout detector.

Verbatim harness output is quoted throughout as evidence.

---

## 1. Structural map

### 1.1 Module shape

A single IIFE — `x3f-form.js:17` `(function () {` … `:574` `})();`. No module system, no build step, ES5 only (it has to run in an Android TV WebView). Everything is `var`. Public surface, `x3f-form.js:569-573`:

```js
  window.X3FForm = {
    create: create, mount: mount, rigs: EXR,
    has: function (s) { return !!EXR[s]; },
    verb: function (s) { return (EXR[s] && EXR[s].verb) || 'PULL'; }
  };
```

`X3FForm.rigs` hands out the **live, mutable** `EXR` object — including the `__span` memo the module writes onto it at `x3f-form.js:136`.

### 1.2 Instance API — actual vs documented

The header comment (`x3f-form.js:11-15`) promises:

```
     X3FForm.create(canvas, {exercise, mode:'live'|'tempo', getN, tempo, theme, compact})
       -> {setExercise, setMode, setTempo, resize, destroy, state}
     X3FForm.mount({exercise, getN, host, toggleBtn, theme})
       -> floating panel inside a game stage (returns the instance)
```

The actual returned object (`x3f-form.js:501-513`) is `{setExercise, setMode, setTempo, setTheme, resize, frame, destroy, state, has}` — three undocumented members. `mount()` additionally bolts `panel` and `show` onto the instance (`x3f-form.js:562`).

| member | line | behaviour |
|---|---|---|
| `setExercise(slug)` | 502 | `if (EXR[slug])` — **silently no-ops on an unknown slug**. Resets `reps, peak, burnout, ghosts` only. |
| `setMode(m)` | 503 | unvalidated; anything not `'live'` behaves as tempo |
| `setTempo(ms)` | 504 | `+ms \|\| 3000`; floored to 700 later at `:367` |
| `setTheme(o)` | 505 | mutates `theme` in place |
| `resize()` | 506 → 171 | re-reads `clientWidth/Height`, early-returns if either is 0 |
| `frame(dt)` | 509 | `step()` + `draw()` once — but the internal rAF loop is **always** running as well |
| `destroy()` | 510 | `alive = false` and nothing else |
| `state()` | 511 | `{t, reps, strain, burnout}` |
| `has(slug)` | 512 | duplicate of the module-level `X3FForm.has` |

### 1.3 Rig proportions (figure units)

`x3f-form.js:21`

```js
  var LT = 1.14, LS = 1.14, TORSO = 1.55, LU = 0.78, LF = 0.78, HEAD = 0.33;
```

Thigh, shank, torso, upper arm, forearm, head radius. Derived limits: leg reach `LT + LS = 2.28`, arm reach `LU + LF = 1.56`; `ik` clamps its solve distance at `(l1 + l2) * 0.999` — `2.2777` and `1.5584`.

The foot constants live 277 lines later, next to the code that uses them, `x3f-form.js:298-299`:

```js
    var BALL = 0.38, ANKH = 0.20, HEELB = 0.22, TOEF = 0.16, THICK = 0.13;
    function footAngle(lift) { return cl(lift || 0, 0, 1) * 1.2; }   // up to ~69 degrees
```

`BALL` and `ANKH` are declared **after** `figure()` (`:224`), which uses them. Legal only because `var` hoists and `figure` is not called until the first `draw()`.

### 1.4 Pose authoring format

Documented at `x3f-form.js:23-30`:

```
  /* Pose fields:
       hx,hy    hip position (x from centre, y above ground)
       lean     torso angle from vertical, + = hinged forward
       hand     LEAD hand offset from the shoulder joint  [x, y(+down)]
       hand2    off hand offset (defaults to hand, nudged for depth)
       foot     front ankle [x, lift]      foot2  rear ankle [x, lift] (optional)
       head     head tilt      grip  bar length      ebow  elbow bend side (+1 back/down, -1 up/out)
     a = stretched / weak end of the range, b = contracted / strong end. */
```

Per-movement (not per-pose) fields: `anchor` (`'foot' | 'shoulder'`), `plate` (`'ball'` or absent), `ebow` (`+1 | -1`), `strongAt` (`'top' | 'mid' | 'bottom'`), `label`, `verb`, `tipA`, `tipB`. Per-pose fields: `hx, hy, lean, hand, hand2?, foot, foot2?, head, grip`.

`var P = function (o) { return o; };` at `x3f-form.js:31` is an identity function used purely as a visual marker around every pose literal — dead abstraction that costs 22 call frames at module load and buys nothing.

**Critical semantics of `hand`.** The offset is applied in **world space, unrotated by `lean`** (`x3f-form.js:249`):

```js
      function arm(hoff, w) {
        var hnd = { x: sho.x + hoff[0] * u, y: sho.y + hoff[1] * u };
```

So `hand: [0, 1.4]` always means "1.4 units straight down the screen from the shoulder", however far the torso is hinged. This is the single most load-bearing convention in the pose format — it is what makes "arms hang vertically in a deadlift" expressible, and it is what makes "the bar stays on the shoulders" impossible to express robustly.

**`foot[0]` is the ankle x at rest**, not the contact point. `leg()` places the ball contact at `f[0] + BALL` and derives the ankle back from it (`:239-244`), so at `lift = 0` the ankle lands exactly at `gx + f[0]*u`, `ANKH` above the floor.

### 1.5 The 11 rigs (`x3f-form.js:32-104`)

| slug | anchor | ebow | strongAt | verb | grip | a (stretched / weak) | b (contracted / strong) |
|---|---|---|---|---|---|---|---|
| `deadlift` | foot | +1 | top | PULL | 0.95 | hx −0.34, hy 1.62, lean 0.94, hand [0.34, 1.44], foot [0,0], head −0.18 | hx 0, hy 2.44, lean 0.14, hand [0.26, 1.46], foot [0,0], head 0 |
| `bent-row` | foot | +1 | **mid** | ROW | 1.0 | hx −0.30, hy 2.08, lean 0.84, hand [0.24, 1.46], head −0.10 | hx −0.30, hy 2.08, lean 0.80, hand [−0.10, 0.62], head −0.06 |
| `drag-curl` | foot | +1 | top | CURL | 0.85 | hy 2.42, lean 0.07, hand [0.28, 1.40] | hy 2.42, lean 0.05, hand [0.34, 0.52], head 0.04 |
| `chest-press` | **shoulder** | +1 | top | PRESS | 0.95 | hy 2.40, lean 0.18, hand [0.26, 0.20], foot [0.05, 0] | hy 2.40, lean 0.20, hand [1.40, 0.44], head 0.03 |
| `tricep-press` | **shoulder** | +1 | top | PRESS | 0.8 | hx −0.10, hy 2.30, lean 0.56, hand [0.30, −0.34], head 0.06 | hand [0.92, 0.72] — every other field identical |
| `pec-crossover` | **shoulder** | **−1** | top | SQUEEZE | **0** | hy 2.40, lean 0.12, hand [−0.40, 0.30], hand2 [−0.30, 0.05] | hy 2.40, lean 0.16, hand [1.22, 0.56], hand2 [1.10, 0.20], head 0.02 |
| `overhead-press` | foot | +1 | top | PRESS | 1.05 | hy 2.42, lean 0.06, hand [0.46, −0.10], foot [0.02, 0] | hy 2.46, lean 0.02, hand [0.24, −1.38], head 0.12 |
| `upright-row` | foot | **−1** | **mid** | ROW | 0.6 | hy 2.42, lean 0.06, hand [0.30, 1.34] | hy 2.42, lean 0.04, hand [0.44, 0.34], head 0.02 |
| `front-squat` | foot | +1 | top | DRIVE | 1.0 | hx −0.22, hy **1.16**, lean 0.44, hand [0.40, −0.06], foot [0.06, 0] | hx 0, hy 2.42, lean 0.10, hand [0.40, −0.10] |
| `split-squat` | foot | +1 | top | DRIVE | 1.0 | hx −0.08, hy 1.24, lean 0.20, hand [0.40, −0.08], foot [0.52, 0], **foot2 [−0.86, 0.80]** | hx 0.02, hy 2.34, lean 0.10, hand [0.40, −0.12], foot2 [−0.86, 0.74] |
| `calf-raise` | foot, **plate: 'ball'** | +1 | top | RAISE | 0.95 | hy 2.30, lean 0.05, hand [0.30, 1.42], **foot [0, 0.10]** | hy 2.52, lean 0.05, hand [0.30, 1.42], **foot [0, 0.90]** |

The 11 slugs match `web/x3f-exercises.js:9-87` exactly. No rig is missing and none is orphaned. Two rigs carry two per-movement comments explaining a deliberate choice: `front-squat` at `:82-84` ("the elbow has to solve FORWARD (+1) or it swings up through the head") and `calf-raise` at `:97-98` ("heels off the back edge and never resting on the floor").

### 1.6 Maths layer (`x3f-form.js:106-150`)

```js
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hex(c) { c = c.replace('#',''); if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2]; var n = parseInt(c,16); return [n>>16&255, n>>8&255, n&255]; }
  function mix(a, b, t) {
    if (a.charAt(0) !== '#' || b.charAt(0) !== '#') return a;   // silent no-op on rgb()/named colours
    var x = hex(a), y = hex(b);
    return 'rgb(' + ... + ')';
  }
  function lp2(a, b, t) { return [lerp(a[0],b[0],t), lerp(a[1],b[1],t)]; }
  function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
```

**Two-bone IK** — the whole rig rests on this, `x3f-form.js:118-125`:

```js
  function ik(ax, ay, bx, by, l1, l2, side) {
    var dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1e-4;
    var ux = dx / d, uy = dy / d;
    var dd = cl(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    var a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
    var h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    return { x: ax + ux * a - uy * h * side, y: ay + uy * a + ux * h * side };
  }
```

Standard circle–circle intersection; `side` picks the branch. Because `l1 === l2` for both legs and both arms, `a` always reduces to `dd/2` and `h = sqrt(l² − dd²/4)`. Note `dd` clamps the **solve** distance, but the caller still draws the end effector at the **unclamped** target — so an over-reach detaches the second bone from the hand/ankle rather than straightening the limb.

**Scale** (`x3f-form.js:127-138`):

```js
  function reach(p) {
    var neck = p.hy + TORSO * Math.cos(p.lean);
    return 0.24 + Math.max(neck + HEAD * 2 + 0.24, neck - p.hand[1] + 0.6);
  }
  function span(ex) {
    if (ex.__span == null) ex.__span = Math.max(reach(ex.a), reach(ex.b));
    return ex.__span;
  }
```

Height only; no horizontal term; `p.head` ignored; the head-height term assumes `cos(lean + head) = 1`. Measured (harness 1):

```
deadlift        span=5.115  reach(a)=3.674  reach(b)=5.115  fill(a)=72%
bent-row        span=4.300  reach(a)=4.255  reach(b)=4.300  fill(a)=99%
drag-curl       span=5.108  reach(a)=5.106  reach(b)=5.108  fill(a)=100%
chest-press     span=5.065  reach(a)=5.065  reach(b)=5.059  fill(a)=100%
tricep-press    span=4.793  reach(a)=4.793  reach(b)=4.753  fill(a)=100%
pec-crossover   span=5.079  reach(a)=5.079  reach(b)=5.070  fill(a)=100%
overhead-press  span=6.230  reach(a)=5.107  reach(b)=6.230  fill(a)=82%
upright-row     span=5.109  reach(a)=5.107  reach(b)=5.109  fill(a)=100%
front-squat     span=5.102  reach(a)=3.702  reach(b)=5.102  fill(a)=73%
split-squat     span=5.022  reach(a)=3.899  reach(b)=5.022  fill(a)=78%
calf-raise      span=5.208  reach(a)=4.988  reach(b)=5.208  fill(a)=96%
```

**Pose blend** (`x3f-form.js:140-150`) — a plain per-field `lerp`, allocating one fresh object and three or four fresh arrays on every call:

```js
    o.hand2 = lp2(a.hand2 || [a.hand[0] * 0.9, a.hand[1] + 0.05], b.hand2 || [b.hand[0] * 0.9, b.hand[1] + 0.05], t);
```

The off-hand default is "90% of the lead hand's x, 0.05 lower".

### 1.7 Theme tokens (`x3f-form.js:153`)

```js
  var DEF_THEME = { accent: '#2ff0b0', band: '#ffd35c', skin: '#dfe9ff', deep: '#7b8ba8', dim: '#8593a9', bg: 'rgba(255,255,255,.03)', strain: '#ff5d78' };
```

Usage census across the whole file: `accent` ×4, `band` ×4, `dim` ×2, `deep` ×1, `skin` ×1, `strain` ×1, **`bg` ×0 — a dead token.**

Per-caller overrides: Bloom `accent #59f5c4 / band #ffd35c / dim #9aa8c4 / skin #eaf0fa / deep #6f6a9c` (`X3F_Bloom.html:263`); Nova `#8f7dff … #5b5c8f` (`X3F_Nova.html:565`); Splash `#31e8ff … #4f7f9c` (`X3F_Splash.html:419`); Calibrate `#2ff0b0 … #4b6b66` (`X3F_Calibrate.html:104`); Routine passes only `{accent, band, dim}` (`X3F_Routine.html:380`), so the Routines figure uses the default skin and deep. **No caller ever sets `strain` or `bg`.**

### 1.8 Closure state (`x3f-form.js:165-169`)

```js
    var W = 0, H = 0, DPR = 1;
    var t = 0, tgt = 0, phase = 0, vel = 0, dir = 0;
    var strain = 0, sweat = [], ghosts = [];
    var peak = 0, peakDecay = 0, repTop = 0, burnout = 0, reps = 0, wasLow = true;
    var last = performance.now(), acc = 0, alive = true, hidden = false;
```

`t` is the master pose parameter in `[0,1]`. `phase` is the tempo-loop cursor. `ghosts` is capped at 7 (`:395`); `sweat` self-expires at `l > 0.9` (`:393`).

### 1.9 Drawing helpers

- **`limb(x1,y1,x2,y2,w1,w2,col)`** — `:180-192`. A tapered quad plus a filled circle at each end: **3 fills per call**. Flat colour, no outline, no shading, no joint articulation.
- **`bandCurve(x1,y1,x2,y2,stretch,u)`** — `:193-211`. Two quadratic strands offset **±`u*0.05` in world X** at the ends and **±`u*0.07` in world X** at the control point; `sag = (1 − clamp(stretch,0,1)) * u * 0.55` added to the control point's **y**; line width lerps `0.17u → 0.09u` with stretch; a `'screen'`-blended glow stroke only when `stretch > 0.72`.
- **`barEndOn(x,y,u,len,glow)`** — `:212-222`. One rounded capsule, half-width `u*0.17`, half-height `max(u*0.42, u*len*0.55)`, rotated a **fixed** `-0.22` rad, gradient `#5d6b80 → #e6eefc → #78879c`; `theme.band` shadow when `glow > 0.5`. Exactly one is drawn, at the midpoint of the two hands.
- **`foot(lg,u,col)`** — `:301-316`. Drawn in contact-local space: `translate(lg.cx, lg.cy); rotate(lg.th)`. Sole rect from `-(BALL+HEELB)*u` to `+TOEF*u`, `THICK*u` tall, plus a 4-point heel wedge rising to ankle height.
- **`plate(x,gy,u,ball)`** — `:318-325`. `x0 = x + (ball ? 0.06 : -0.34)*u`, `x1 = x + (BALL + 0.24)*u`. Drawn before the figure so the feet sit on it.
- **`face(hd,p,u,skin)`** — `:326-344`. One eye, one brow that drops and darkens with `strain`, a mouth that is a smile arc below `strain 0.45` and a flat line above.
- **`gauge(x,y,h,w)`** — `:347-359`. Track, green strong-zone band, red "no lockout" bar at the very top, gold "keep tension" bar at 98%, marker dot at `y + h*(1 - clamp(t,0,1))`.

### 1.10 `figure(p, u, gx, gy, alpha, col)` — `:224-290`

```js
      var hip  = { x: gx + p.hx * u, y: gy - p.hy * u };
      var neck = { x: hip.x + Math.sin(p.lean) * TORSO * u, y: hip.y - Math.cos(p.lean) * TORSO * u };
      var sho  = { x: neck.x - Math.sin(p.lean) * u * 0.1, y: neck.y + Math.cos(p.lean) * u * 0.06 };
      var hd   = { x: neck.x + Math.sin(p.lean + p.head) * u * (HEAD + 0.24),
                   y: neck.y - Math.cos(p.lean + p.head) * u * (HEAD + 0.24) };
```

The foot pivot, `:237-247`:

```js
      function leg(f, w) {
        var th = footAngle(f[1]);
        var cx = gx + f[0] * u + BALL * u, cy = gy;      // ball contact on the plate
        var vx = -BALL * u, vy = -ANKH * u;              // contact -> ankle, at rest
        var ank = { x: cx + vx * Math.cos(th) - vy * Math.sin(th),
                    y: cy + vx * Math.sin(th) + vy * Math.cos(th) };
        var kn = ik(hip.x, hip.y, ank.x, ank.y, LT * u, LS * u, -1);
        return { ank: ank, kn: kn, w: w, th: th, cx: cx, cy: cy };
      }
```

The knee side is a **hard-coded `-1`** for both legs; the elbow side is `ex.ebow` for both arms.

Limb assignment, `:255-257`:

```js
      var fl = leg(p.foot2 || [p.foot[0] - 0.16, p.foot[1]], u * 0.15);   // FAR leg  = foot2
      var fr = leg(p.foot, u * 0.17);                                     // NEAR leg = foot
      var al = arm(p.hand2, u * 0.11), ar = arm(p.hand, u * 0.125);
```

Paint order (`:259-287`): far leg → far foot → far arm → torso (linear gradient `deep → skin`) → near leg → near foot → head → face → **a dark outline stroke around the near arm** (`:279-284`, `rgba(8,14,26,.45)` at `lineWidth = u*0.30`) → near arm. Strain flush is applied to `skin` only (`:254`), never to `deep`.

Returns `{hand, hand2, sho, ank, hip, head, contact}`. `contact` is the **near** foot's ball contact, and is what the band anchors to.

### 1.11 `step(dt)` — the drive and the state machine (`:362-396`)

```js
      if (mode === 'live') {
        var n = getN() || 0;
        tgt = cl((n - 0.04) / 0.86, 0, 1);
      } else {
        phase += dt * 1000 / Math.max(700, tempo);
        if (phase > 1) phase -= 1;
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
```

Then sweat spawn/advance (`:391-394`) and `ghosts.push(t)` capped at 7 (`:395`).

**There is no discrete phase enum.** "Phase" is derived at paint time from `dir`, `t` and `burnout` (`:466-469`):

```js
      /* Name the work phase after the movement. Every press on a push day used to
         read PULL, which is the opposite of what you are being asked to do. */
      var ph = burnout > 0.5 ? 'PARTIALS' : dir > 0 ? (ex.verb || 'PULL') : dir < 0 ? 'EASE' : (t > 0.5 ? 'HOLD' : 'TENSION');
```

Five labels: `PARTIALS`, `<verb>`, `EASE`, `HOLD`, `TENSION`. Colour at `:465`: `theme.accent` when rising, `theme.band` when easing, `theme.dim` when static. **"Strain" is not a phase** — it is a continuous `[0,1]` scalar that drives the skin flush (`:254`), the face grimace (`:333-342`), the whole-figure tremble (`:417-420`), the halo (`:442-449`), the sweat spawn (`:391`) and the bar-end glow (`:439`).

The per-movement verb is the fix documented in `HANDOFF.md:109` and is guarded by two tests in `tools/func-test/cases.js:211-213`.

### 1.12 `draw(now)` (`:398-480`)

```js
      var u = H * (compact ? 0.86 : 0.9) / span(ex);
      var gx = W * (compact ? 0.48 : 0.46), gy = H * 0.9;
```

Order: `clearRect` → full-canvas radial floor glow → ground-contact ellipse at a **fixed** `(gx + 0.1u, gy + 0.14u)` → plate (foot-anchored movements only) → `save` → strain tremble `translate` → up to 6 ghost figures → the real figure → band → bar end → strain halo → sweat → `restore` → gauge → labels.

Band wiring (`:432-439`):

```js
      var anchor = ex.anchor === 'shoulder'
        ? { x: j2.sho.x - u * 0.34, y: j2.sho.y + u * 0.1 }
        : { x: j2.contact.x - u * 0.06, y: gy - u * 0.05 };   // band channel, pinned to the plate
      var bar = { x: (j2.hand.x + j2.hand2.x) / 2, y: (j2.hand.y + j2.hand2.y) / 2 };
      var dist = Math.hypot(bar.x - anchor.x, bar.y - anchor.y);
      var stretch = cl((dist / u - 1.0) / 2.2, 0, 1);
      bandCurve(anchor.x, anchor.y, bar.x, bar.y, stretch, u);
      if (p.grip > 0.05) barEndOn(bar.x, bar.y, u, p.grip, strain);
```

One global normalisation — `stretch = 0` at 1.0 units of separation, `1` at 3.2 — for all 11 movements.

Ghost trail (`:422-427`):

```js
      for (var g = 0; g < ghosts.length - 1; g++) {
        var a = (g / ghosts.length) * 0.16;
        if (Math.abs(ghosts[g] - t) < 0.02) continue;
        figure(blend(ex, ghosts[g]), u, gx, gy, a, { skin: theme.accent, deep: theme.accent });
      }
```

Labels (`:461-479`): phase verb left-aligned at `(10, 16)`; the coaching tip at `(10, H - 10)` in a font shrunk from 11px down to 8.5px to fit; `DIMINISHING RANGE` right-aligned at `(W - (compact ? 20 : 34), 16)` when `burnout > 0.5`.

### 1.13 Loop and lifecycle (`:482-499`)

```js
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
```

### 1.14 `mount()` — DOM, CSS and storage (`:516-564`)

DOM produced:

```html
<div class="x3ff">                              <!-- appended to o.host / #stage / document.body -->
  <div class="x3ff-h"><span>Form</span><b>{name}</b></div>
  <canvas></canvas>
</div>
```

`x3f-form.js:544` injects the name with `innerHTML` and no escaping:

```js
    wrap.innerHTML = '<div class="x3ff-h"><span>Form</span><b>' + (meta ? meta.name : EXR[o.exercise].label) + '</b></div>';
```

CSS injected once, guarded by the module-level `styled` flag (`:517-535`):

| selector | declarations |
|---|---|
| `.x3ff` | `position:absolute; left:10px; bottom:10px; width:clamp(104px,21vw,168px); border-radius:14px; overflow:hidden; pointer-events:none; z-index:6; background:rgba(6,12,22,.42); border:1px solid rgba(255,255,255,.16); backdrop-filter:blur(6px); opacity:0; transform:translateY(8px) scale(.96); transition:opacity .28s ease, transform .28s cubic-bezier(.2,.9,.25,1)` |
| `.x3ff.on` | `opacity:1; transform:none` |
| `.x3ff .x3ff-h` | `display:flex; align-items:baseline; gap:5px; padding:6px 8px 2px; font-family:'Space Grotesk',system-ui,sans-serif; font-size:9px; letter-spacing:1.4px; text-transform:uppercase; color:rgba(255,255,255,.5)` |
| `.x3ff .x3ff-h b` | `font-size:10.5px; letter-spacing:.3px; text-transform:none; color:rgba(255,255,255,.92)` |
| `.x3ff canvas` | `display:block; width:100%; height:auto; aspect-ratio:1/1.12` |
| `@supports not (aspect-ratio:1/1)` | `.x3ff canvas{height:170px}` |
| `@media (max-height:430px)` | `.x3ff{width:clamp(92px,16vw,124px)}` |

Font family is hard-coded to `'Space Grotesk',system-ui,sans-serif` in the CSS (`:529`) and in all three canvas text calls (`:463`, `:473`, `:477`).

**Storage: exactly one key.**

| key | line | shape | semantics |
|---|---|---|---|
| `x3f_formOn` | 552 (write) / 553 (read) | `"true"` / `"false"` | Global panel visibility, shared by every game. Not namespaced per game, per movement or per profile. Only `=== false` is honoured on read, so a corrupt or foreign value means "on". |

Toggle wiring (`:551-561`) reveals `o.toggleBtn`, syncs its label between `'Form on'` and `'Form off'`, and adds a `click` listener that is never removed. `show()` is first called from a `setTimeout(…, 40)` rather than rAF — deliberate, per the comment at `:554`: "a timer, not rAF: a backgrounded tab must not leave the panel invisible".

### 1.15 Call sites and their contracts

| host | line | call |
|---|---|---|
| Bloom | `X3F_Bloom.html:262-263` | `mount({exercise, host:$('stage'), toggleBtn:$('formBtn'), getN:()=>force/ref(), theme})` |
| Nova | `X3F_Nova.html:563-565` | same, plus `EFFORT = X3FForm.verb(slug)` |
| Splash | `X3F_Splash.html:418-419` | same |
| Routine | `X3F_Routine.html:378-386` | `create($('demoCv'), {exercise, mode:'tempo', tempo:+tempo, theme:{accent,band,dim}})`; on later calls `setExercise` + `setTempo` + `resize` |
| Calibrate | `X3F_Calibrate.html:102-110` | `create($('formCv'), {exercise, mode:'tempo', tempo:3400, getN:()=>figN, theme})`, plus two extra `resize()` calls on `load` and at `+120ms` |
| func-test | `tools/func-test/cases.js:111, 211-213` | `demoCv.width > 0`; `verb('chest-press') === 'PRESS'`; `verb('deadlift') === 'PULL'` |

**`getN` contract.** Every game passes `force / ref()` where `force = Math.max(0, raw - baseline - calLo())` (`X3F_Bloom.html:159` and `:119`) and `ref() = X3FCal.span(EXSLUG, band)` (`X3F_Bloom.html:116`), i.e. `hi - lo` floored at `MIN_SPAN = 10` (`x3f-cal.js:100`, `:46`). So **`n = 1.0` means "at your calibrated all-out max for this movement and band"**, `n = 0` means "at your calibrated start tension", and `n` can legitimately exceed 1.

Calibrate drives `figN` per phase (`X3F_Calibrate.html:175-184`): `0` during `count` / `hold` / `ready`; `(force - capLo) / max(30, capMax - capLo)` during `cap`; `1` when `done`; and switches back to `mode:'tempo'` when idle. It changes mode **every frame** rather than on transitions.

`X3F_Routine.html:384-385` also tries to overlay an illustrated plate from `assets/form/<slug>.png`. **`web/assets/form/` does not exist** (only `assets/bloom`, `assets/splash`, `assets/ui`), so every movement change fires a 404 whose `onerror` silently hides the image.

---

## 2. Measured behaviour

### 2.1 Force → pose mapping saturates at 90% of your max

Harness 2, real module, held to convergence at each `n`:

```
=== live mapping n -> t (step: tgt = clamp((n-0.04)/0.86,0,1)) ===
  n=0     t=0.0000 strain=0.0000
  n=0.04  t=0.0000 strain=0.0000
  n=0.2   t=0.1860 strain=0.0000
  n=0.5   t=0.5349 strain=0.0000
  n=0.86  t=0.9535 strain=0.8632
  n=0.9   t=1.0000 strain=1.0000
  n=1     t=1.0000 strain=1.0000
  n=1.2   t=1.0000 strain=1.0000
  n=2     t=1.0000 strain=1.0000
```

### 2.2 Per-frame canvas cost (compact panel, 150×168 CSS px, DPR 2)

Harness 3, counting every method call on the real 2D context:

```
=== per-frame canvas cost (compact panel) ===
deadlift, moving (ghosts live)     ops/frame=1005.8  paint/frame=220.6  gradients/frame=9.0  beginPath/frame=215.6
split-squat, moving                ops/frame=1011.8  paint/frame=221.6  gradients/frame=9.0  beginPath/frame=216.6
deadlift, live held still          ops/frame=218.7  paint/frame= 49.6  gradients/frame=4.0  beginPath/frame= 44.6
```

Single-frame breakdown while moving:

```
{ clearRect:1, createRadialGradient:1, addColorStop:17, fillRect:4, beginPath:184,
  ellipse:1, fill:171, createLinearGradient:7, roundRect:13, save:13, moveTo:63,
  lineTo:172, closePath:55, arc:107, translate:11, rotate:11, restore:13,
  stroke:13, quadraticCurveTo:2, fillText:1 }
```

One figure ≈ 131 canvas calls. Six ghosts therefore cost **4.5× the real figure**. At the compact 30 fps effective rate that is ~30,000 canvas calls per second for a 150 px thumbnail, on top of the host game's own loop.

### 2.3 The burnout / DIMINISHING RANGE detector never fires

Harness 3, real module, five realistic X3 sets at 60 fps:

```
=== burnout / DIMINISHING RANGE detector, realistic X3 sets (60fps) ===
partials stay above the 0.18 floor (lo=0.30)         reps=7  burnout=0.00  peakBurnout=0.00  DIMINISHING shown at rep NEVER
partials DIP below the floor (lo=0.10) - normal X3   reps=16 burnout=0.00  peakBurnout=0.00  DIMINISHING shown at rep NEVER
long 1.5s pause at the bottom between full reps      reps=7  burnout=0.00  peakBurnout=0.00  DIMINISHING shown at rep NEVER
short 0.1s bottom, partials lo=0.30                  reps=7  burnout=0.00  peakBurnout=0.00  DIMINISHING shown at rep NEVER
no partials at all - just 20 clean full reps         reps=20 burnout=0.00  peakBurnout=0.00  DIMINISHING shown at rep NEVER

=== same set, different frame rates ===
    24fps -> burnout=0.00, DIMINISHING at partial rep NEVER
    30fps -> burnout=0.00, DIMINISHING at partial rep NEVER
    60fps -> burnout=0.00, DIMINISHING at partial rep NEVER
```

The `peak` / `peakDecay` trace that explains it:

```
  top of full rep 1     t=0.993 peak=0.497 peakDecay=0.993 reps=1 need peakDecay<0.308
  bottom of full rep 1  t=0.013 peak=0.673 peakDecay=0.937 reps=1 need peakDecay<0.417
  ... (identical every rep) ...
  partial 1             t=0.360 peak=0.494 peakDecay=0.882 reps=7 need peakDecay<0.307
  partial 10            t=0.360 peak=0.494 peakDecay=0.599 reps=7 need peakDecay<0.307
```

### 2.4 Phase label stability under a noisy force signal

```
=== phase label stability, live mode, noise around a steady hold ===
   noise +/-0.0%  -> label changed 0 times in 3s at 60fps,  0 times at 30fps
   noise +/-0.5%  -> label changed 0 times in 3s at 60fps,  0 times at 30fps
   noise +/-1.0%  -> label changed 0 times in 3s at 60fps,  0 times at 30fps
   noise +/-2.0%  -> label changed 8 times in 3s at 60fps,  8 times at 30fps
   noise +/-5.0%  -> label changed 125 times in 3s at 60fps, 62 times at 30fps
```

### 2.5 Other measured behaviours

```
=== rep counted on mount if you are already pulling (wasLow starts true) ===
   mounted mid-pull, after 1s: reps = 1 (never went to the bottom)

=== tempo mode: does the idle preview grimace/sweat? ===
   peak strain on a pure tempo loop = 0.588  (face grimaces at >0.45, tremble at >0.25, sweat at >0.55)

=== setExercise: what carries over ===
   before {"t":0.99999,"reps":1,"strain":0.99999,"burnout":0}
   after  {"t":0.99999,"reps":0,"strain":0.99999,"burnout":0}

=== peak decay while at the bottom (frame-rate dependence of peak *= 0.985 per frame) ===
    24fps, after 1.0s at the bottom peak retains 69.6%   (after 2s: 48.41%)
    30fps, after 1.0s at the bottom peak retains 63.5%   (after 2s: 40.38%)
    60fps, after 1.0s at the bottom peak retains 40.4%   (after 2s: 16.31%)
   120fps, after 1.0s at the bottom peak retains 16.3%   (after 2s:  2.66%)
```

### 2.6 Band stretch, measured per movement

`stretch` at `t = 0 / 0.5 / 1` (glow threshold is `0.72`, full sag at `0`):

| slug | t=0 | t=0.5 | t=1 | verdict |
|---|---|---|---|---|
| `chest-press` | **0.000** | 0.070 | 0.322 | pinned slack for the whole rep |
| `tricep-press` | **0.000** | **0.000** | 0.170 | pinned slack for the whole rep |
| `pec-crossover` | **0.000** (`dist = 0.076`) | **0.000** | 0.239 | band is essentially a dot at the start |
| `deadlift` | 0.132 | 0.392 | 0.629 | never glows |
| `bent-row` | 0.312 | 0.475 | 0.657 | never glows |
| `calf-raise` | 0.588 | 0.638 | 0.688 | never glows, barely changes |
| `drag-curl` | 0.651 | 0.851 | **1.000** | usable |
| `upright-row` | 0.678 | 0.907 | **1.000** | usable |
| `front-squat` | 0.693 | **1.000** | **1.000** | saturates half-way |
| `split-squat` | 0.780 | **1.000** | **1.000** | saturates half-way |
| `overhead-press` | **1.000** | **1.000** | **1.000** | pinned at full glow, zero range |

---

## 3. Defects

Ordered by severity. Every entry cites the line and a concrete failure scenario.

### D1 — `DIMINISHING RANGE` / `PARTIALS` is dead code. It can never fire.

**Where:** `x3f-form.js:385-389`

```js
      if (wasLow && repTop > 0) {
        peak = Math.max(peak * 0.985, repTop); repTop = 0;
      }
      peakDecay = Math.max(peakDecay * (1 - dt * 0.05), t);
      burnout = (reps > 2 && peak > 0.55 && peakDecay < peak * 0.62) ? ... : ...;
```

**Mechanism.** `repTop` is zeroed inside the same `if` that reads it, and `if (t > repTop) repTop = t` at `:382` re-seeds it from the current `t` on the very next frame. So while `wasLow` is true the block runs *every frame*: `peak = max(peak * 0.985, t)`. Two consequences:

1. `peak` decays **1.5% per frame**, not per rep — ~60% per second at 60 fps, and 4× faster at 120 fps than at 24 fps (§2.5).
2. During the rise, `wasLow` stays true until `t > 0.5`, so `peak` is dragged up by `max(…, t)` only as far as `0.5` and then frozen. Measured: `peak = 0.497` at the top of every full rep (§2.3). The gate `peak > 0.55` is therefore false for the entire steady state.
3. Even in the brief window where `peak` momentarily hits `1.0` (the frame `wasLow` flips true), `peakDecay ≈ 0.94`, and the test needs `peakDecay < 0.62`. `peakDecay` decays at ~5%/s while `peak` decays at ~60%/s, so `peak > 1.61 × peakDecay` is unreachable by construction.

**Failure scenario.** An athlete does 25 full deadlifts to failure and then grinds 12 diminishing-range partials — the exact X3 protocol the product is built around. The panel shows `PULL` / `EASE` / `HOLD` throughout and never once shows `PARTIALS` or `DIMINISHING RANGE`. Verified across five different set shapes and three frame rates (§2.3). `HANDOFF.md:91` advertises this as a shipped feature ("flips to 'diminishing range' when your rep tops start collapsing (the X3 burnout)"); it has never worked.

### D2 — The split-squat rear leg folds *forwards*, through the front leg.

**Where:** the hard-coded knee side at `x3f-form.js:245`

```js
        var kn = ik(hip.x, hip.y, ank.x, ank.y, LT * u, LS * u, -1);
```

combined with `foot2: [-0.86, 0.80]` at `:92`.

**Measured (harness 1):**

```
=== split-squat rear leg: is the rear knee ahead of the hip? ===
  t=0    hip.x=-0.080 rearKnee=( 0.602,-0.326) rearAnk.x=-0.534  knee ahead of hip by 0.682 | rearKnee vs frontAnkle dx= 0.082
  t=0.25 hip.x=-0.055 rearKnee=( 0.588,-0.574) rearAnk.x=-0.542  knee ahead of hip by 0.643 | dx= 0.068
  t=0.5  hip.x=-0.030 rearKnee=( 0.528,-0.796) rearAnk.x=-0.549  knee ahead of hip by 0.558 | dx= 0.008
  t=1    hip.x= 0.020 rearKnee=( 0.246,-1.223) rearAnk.x=-0.565  knee ahead of hip by 0.226 | dx=-0.274
```

**Failure scenario.** At the bottom of the split squat the hip is at `x = −0.08` and the rear ankle at `x = −0.53`, but the rear knee solves to `x = +0.60` — 0.68 units *in front of* the hip and 0.08 units in front of the near foot's ankle. The rear thigh therefore crosses forward through the torso and the near thigh, and the rear shin lies almost horizontally pointing backwards from a knee that is level with the front foot. The `-1` side is correct for a squat's front leg and anatomically impossible for a trailing rear leg. Both legs need independent bend sides (or a pole vector).

### D3 — The tricep press violates its own printed coaching cue.

**Where:** rig `:57-62`, tip `:61` `'Only the elbow hinges'`.

**Measured elbow travel (relative to the shoulder, over one rep):**

```
=== elbow travel per rep (a "fixed upper arm" movement should be ~0) ===
  tricep-press    elbow path length 0.932  max per-1%-step 0.0227
  calf-raise      elbow path length 0.000
  front-squat     elbow path length 0.079
  deadlift        elbow path length 0.038
```

Elbow positions relative to the shoulder: `t=0 → (+0.710, +0.324)`; `t=0.5 → (+0.093, +0.774)`; `t=1 → (+0.141, +0.767)`. The upper arm swings from ~25° below horizontal to ~80° (near vertical) — a 55° rotation, most of it in the first half of the rep.

**Failure scenario.** A user follows the figure on a push day. The caption under it says "Only the elbow hinges" while the figure's shoulder visibly rotates the upper arm through 55°, dropping the elbow half a body-width. The demonstration teaches the exact fault the cue is there to prevent.

### D4 — The front squat's knee shoots past the toe; its own tip says "knee over toe".

**Where:** rig `:81-89`, tip `:88` `'Hips straight down · knee over toe'`.

**Measured:**

```
=== knee vs toe ===
  front-squat t=0    nearKnee.x=0.904  toe.x=0.600  past toe by 0.304
  front-squat t=0.25 nearKnee.x=0.872  toe.x=0.600  past toe by 0.272
  front-squat t=0.5  nearKnee.x=0.783  toe.x=0.600  past toe by 0.183
```

**Failure scenario.** The bottom pose has `hy = 1.16` (hip 1.16 units up) with `foot = [0.06, 0]` and the ankle pinned at `x = 0.06`. The IK has to put the knee 0.30 units past the toe tip to close the 2.28-unit leg. Anyone copying the picture drives the knee well past the toe on every rep, which is the opposite of the cue printed underneath.

### D5 — The near elbow is buried inside the torso for large parts of five movements; for the calf raise, always.

**Where:** the world-space hand offsets at `:249` plus the paint order at `:279-286`.

**Measured (near elbow inside the torso capsule, sampled every 5% of the range):**

```
=== near elbow inside the torso silhouette? ===
  deadlift        buried at t = 0.55 .. 1.00
  bent-row        buried at t = 0.20 .. 0.85
  drag-curl       buried at t = 0.00 .. 0.20
  chest-press     buried at t = 0.00 .. 0.40
  calf-raise      buried at t = 0.00 .. 1.00   (the entire range)

=== FAR elbow inside torso? (drawn BEFORE the torso, so fully hidden) ===
  deadlift 0.65..1.00 | bent-row 0.25..0.85 | drag-curl 0.00..0.25
  chest-press 0.05..0.55 | pec-crossover 0.00..0.05 | calf-raise 0.00..1.00
```

**Failure scenario.** On the calf raise, `hand = [0.30, 1.42]` puts the elbow at `(−0.130, +0.769)` relative to the shoulder — behind it — for every value of `t`. The far arm is painted before the torso and vanishes entirely; the near arm is painted after, so all the viewer sees is the `rgba(8,14,26,.45)` outline stroke (`:281`) drawn as a dark scribble down the front of the chest. The figure appears to have no arms during a calf raise. The outline stroke at `:279-284` exists precisely to paper over this and is a symptom, not a fix.

### D6 — Band stretch is normalised by one global constant and is wrong for 9 of 11 movements.

**Where:** `x3f-form.js:437`

```js
      var stretch = cl((dist / u - 1.0) / 2.2, 0, 1);
```

**Measured:** see §2.6. Three shoulder-anchored movements sit at `stretch = 0` (maximum sag, `0.55u`) for most or all of the rep; the overhead press is pinned at `1.0` for the entire rep; five never reach the `0.72` glow threshold.

**Failure scenario A.** A user does an overhead press. The band is drawn identically taut and glowing at the bottom of the rep and at the top — the one visual that is supposed to say "the resistance is climbing" is constant.

**Failure scenario B.** A user does a chest press. `dist = 0.600u` at the start, below the `1.0u` zero point, so `stretch` clamps to `0` and `sag = 0.55u`. The band hangs slack across the chest at the bottom of every rep — a direct visual contradiction of X3's central doctrine of constant tension ("no resting at the bottom", `x3f-exercises.js:77`).

**Failure scenario C.** The deadlift — the movement with the largest genuine band stretch in the whole program — tops out at `0.629` and never triggers the taut glow, while the drag curl (a *singled* light band) hits `1.000`.

### D7 — `bandCurve` offsets its two strands along world X, so a horizontal band renders as one strand and never bows.

**Where:** `x3f-form.js:193-203`

```js
    function bandCurve(x1, y1, x2, y2, stretch, u) {
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      var sag = (1 - cl(stretch, 0, 1)) * u * 0.55;
      ...
      for (var s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.moveTo(x1 + s * u * 0.05, y1);
        ctx.quadraticCurveTo(mx + s * u * 0.07, my + sag, x2 + s * u * 0.05, y2);
```

The `±0.05u` / `±0.07u` separation is applied in world X regardless of the band's direction, and `sag` is applied in world Y regardless of the band's direction.

**Failure scenario A.** Chest press: the band runs from `(sho.x − 0.34u, sho.y + 0.1u)` to a hand `1.4u` forward — nearly horizontal. Both strands collapse onto the same line and the "doubled band" reads as a single wire.

**Failure scenario B.** Deadlift: the band runs nearly vertically (`dx = 0.13u`, `dy = −2.38u` at the top). Moving a quadratic's control point *along* the chord does not bow the curve — it only reparametrises it. So the deadlift band is drawn dead straight at every value of `stretch`, and the sag term does nothing at all. The sag is only visible on exactly the movements whose `stretch` value is broken (D6).

### D8 — The bar-end plate is painted over the face on three movements.

**Where:** paint order — `figure()` at `:429`, then `barEndOn()` at `:439`.

**Measured** (bar-capsule half-height `max(0.42, grip*0.55)`, head radius `0.33`):

```
=== bar-end vs head overlap ===
  OVERLAP tricep-press   t=0   bar<->headCentre=0.223  need>0.594
  OVERLAP overhead-press t=0.5 bar<->headCentre=0.285  need>0.677
  OVERLAP front-squat    t=0/0.5/1  0.543 / 0.588 / 0.634  need>0.660
  OVERLAP split-squat    t=0/0.5/1  0.614 / 0.615 / 0.617  need>0.660
```

**Failure scenario.** On the front squat and split squat the hands sit at `[0.40, −0.06]` — essentially on the shoulder joint — so the 1.1-unit-long metallic capsule is drawn straight through the head for the entire rep. The face, the strain grimace and the head tilt are all invisible on both leg movements, and on the tricep press at the start position.

### D9 — The calf raise never gets over the balls of the feet, and leans backwards as it rises.

**Where:** poses at `:100-101` (`hx: 0` at both ends) against the foot pivot at `:239-244`.

**Measured:**

```
=== calf-raise: hip stacked over the ball contact? ===
  t=0   hip.x=0.000  ball contact x=0.380  ankle=(0.027,-0.244)  hip is 0.380 behind the contact
  t=0.5 hip.x=0.000  ball contact x=0.380  ankle=(0.179,-0.380)  hip is 0.380 behind the contact
  t=1   hip.x=0.000  ball contact x=0.380  ankle=(0.377,-0.429)  hip is 0.380 behind the contact
```

**Failure scenario.** As the heel lifts, the ankle rotates forward from `x = 0.027` to `x = 0.377`, but `hx` stays pinned at `0`. So the body's centre of mass ends the rep 0.38 units behind the only point touching the floor. The figure visibly rocks backwards while rising onto its toes — physically impossible and the opposite of the "all the way up on the balls" cue at `:102`.

### D10 — The phase label flickers under a real force signal.

**Where:** `x3f-form.js:375-376`

```js
      vel = (t - pt) / Math.max(dt, 1e-3);
      dir = vel > 0.25 ? 1 : vel < -0.25 ? -1 : 0;
```

`vel` is a raw one-frame difference with no smoothing and no hysteresis, and `dir` also drives the label's colour (`:465`).

**Measured (§2.4):** ±5% noise flips the label **125 times in 3 seconds** at 60 fps; ±2% flips it 8 times.

**Failure scenario.** A BLE force bar reporting ±3–5% jitter while the athlete holds at the top makes the panel strobe between `PULL` (accent green), `EASE` (gold) and `HOLD` (dim grey) ~40 times a second, in a 150 px panel whose whole job is to be glanceable.

### D11 — `t` saturates at 90% of the user's calibrated max, and the gauge then parks the marker on the red "no lockout" line.

**Where:** `x3f-form.js:365` and `:356`

```js
        tgt = cl((n - 0.04) / 0.86, 0, 1);
      ...
      var py = y + h * (1 - cl(t, 0, 1));
```

and the red bar at `:354`:

```js
      ctx.fillStyle = 'rgba(255,93,120,.55)'; ctx.fillRect(x - w * 0.35, y, w * 1.7, Math.max(1, h * 0.02));
```

**Failure scenario.** Anything above `n = 0.90` maps to `t = 1` and `strain = 1` (§2.1). A user working at 95% and a user working at 130% of their calibrated max see an identical figure and an identical strain response, and both have the gauge marker sitting exactly on the red "no lockout" bar at the top of the track. The one gauge element that means *stop* is where the app puts you for pulling hard. This also conflicts with the pose data itself: the `b` pose is explicitly authored as the safe no-lockout top (`:37` "Glutes · no knee lockout", `:88` "Stand tall - no lockout").

### D12 — A rep is counted on mount if you are already pulling.

**Where:** `x3f-form.js:168` (`wasLow = true` initial) and `:384`.

**Measured:** mounting mid-pull at `n = 0.9` yields `reps = 1` after 1 s without the figure ever visiting the bottom (§2.5).

**Failure scenario.** The panel mounts mid-set (a game re-render, a movement switch in a guided routine) while the athlete is holding at the top; a phantom rep is credited immediately. Only consumed by the burnout gate today, which is itself dead (D1) — but the moment D1 is fixed this becomes a live off-by-one.

### D13 — `setExercise` leaks half the state.

**Where:** `x3f-form.js:502`

```js
      setExercise: function (slug) { if (EXR[slug]) { ex = EXR[slug]; reps = 0; peak = 0; burnout = 0; ghosts.length = 0; } },
```

Not reset: `t`, `tgt`, `strain`, `sweat`, `peakDecay`, `repTop`, `wasLow`, `phase`, `vel`, `dir`, `acc`.

**Measured (§2.5):** after a switch, `t = 0.99999` and `strain = 0.99999` survive.

**Failure scenario.** On the Routines page a user advances from the deadlift to the calf raise. The new figure appears mid-range at the top of the calf raise, skin flushed red, face grimacing, trembling, sweating, and immediately snaps down as the tempo loop catches up. The "coaching preview" for the next movement opens in an agony pose.

### D14 — `setExercise` silently no-ops on an unknown slug while the caller relabels the panel.

**Where:** `x3f-form.js:502` and `X3F_Routine.html:381-386`.

**Failure scenario.** Add a 12th movement to `x3f-exercises.js` without adding a rig. The Routines page calls `demo.setExercise('new-slug')`, the guard fails, the figure keeps performing the *previous* movement, and the caption underneath is updated to say the new one. `X3F_Routine.html:386` only downgrades the tag text (`X3FForm.has(slug) ? 'Live form guide · …' : 'Form guide'`), it never hides the canvas. Same trap in `create()` at `:159`, which falls back to `EXR['deadlift']` for an unknown slug rather than refusing.

### D15 — Leaked listeners and observers; `destroy()` is incomplete.

**Where:** `x3f-form.js:494`, `:497-498`, `:510`, `:560`.

```js
    document.addEventListener('visibilitychange', function () { hidden = document.visibilityState !== 'visible'; });
    if (window.ResizeObserver) { try { new ResizeObserver(resize).observe(canvas); } catch (e) {} }
    else addEventListener('resize', resize);
    ...
      destroy: function () { alive = false; },
```

None of the three is removed by `destroy()`, and `mount()`'s toggle-button `click` listener (`:560`) and the `wrap` element itself are never removed either. There is no `unmount`.

**Failure scenario.** A future host that re-creates the demonstrator on every routine step (an obvious refactor) accumulates one `visibilitychange` listener and one `ResizeObserver` per movement, for the life of the page.

### D16 — Turning the form panel "off" saves zero CPU.

**Where:** `x3f-form.js:552`

```js
    function show(v) { on = v; wrap.classList.toggle('on', v); try { localStorage.setItem('x3f_formOn', JSON.stringify(v)); } catch (e) {} }
```

`.x3ff` toggles `opacity` only (`:526-527`). The canvas keeps its layout box, `resize()` keeps returning a non-zero size, and the rAF loop keeps stepping and painting ~1000 canvas calls per frame.

**Failure scenario.** A user on a slow Android TV turns the form guide off to reclaim frames. Nothing changes — the panel is merely invisible. This directly undercuts `ROADMAP.md:160-162` ("Three animation loops on a TV SoC … drive it from the game's loop if the Hisense drops frames").

### D17 — One ghost figure is drawn at exactly `globalAlpha = 0` every frame.

**Where:** `x3f-form.js:423-426`

```js
      for (var g = 0; g < ghosts.length - 1; g++) {
        var a = (g / ghosts.length) * 0.16;
```

At `g = 0`, `a = 0`. The `continue` guard on the next line only skips ghosts within 0.02 of `t`, which the *oldest* ghost is not during motion.

**Failure scenario.** ~131 canvas calls per frame (§2.2) painting nothing at all, forever, in the tightest loop in the module.

### D18 — `frame(dt)` double-steps, because `create()` always starts its own rAF loop.

**Where:** `x3f-form.js:499` (`requestAnimationFrame(loop);` unconditional) and `:509`.

There is no `opts.manual` / `opts.autoStart:false`. The comment at `:507-508` says `frame()` is "for hosts that own the frame budget", but any host that calls it gets **two** `step()` calls per frame — doubling the effective tempo speed and the smoothing rate, and halving the effective `t` lag.

**Failure scenario.** Someone implements `ROADMAP.md:161` ("The rig already exposes `frame(dt)`; drive it from the game's loop") and the demonstrator immediately runs at double speed with a jittery, double-decayed `peak`.

### D19 — `DIMINISHING RANGE` overflows and collides in the compact panel.

**Where:** `x3f-form.js:476-479`

```js
        ctx.fillStyle = theme.band; ctx.font = '700 ' + f + "px 'Space Grotesk',system-ui,sans-serif";
        ctx.textAlign = 'right'; ctx.fillText('DIMINISHING RANGE', W - (compact ? 20 : 34), 16);
```

At the minimum panel width (`clamp(104px, 21vw, 168px)` → 104 px, and 92 px under `@media (max-height:430px)`) a 17-character 9 px bold string is ~92–95 px wide, right-aligned at `W − 20 = 84`. It starts at roughly `x = −11`, clipped at the left edge and overlapping the phase verb drawn at `x = 10`. No measure-and-shrink pass is applied to this string (unlike the tip at `:473`). Currently masked by D1.

### D20 — `peak` decays per frame, not per unit time.

**Where:** `x3f-form.js:386` — `peak = Math.max(peak * 0.985, repTop);`

Every other decay in the module is `dt`-scaled (`:379`, `:388`, `:389`). This one is not. Measured frame-rate spread in §2.5: 69.6% retained per second at 24 fps vs 16.3% at 120 fps — a 4× behavioural difference between an Android TV WebView and a 120 Hz phone.

### D21 — The band anchor ignores `plate` and sits at the ball of the foot for all 11 movements.

**Where:** `x3f-form.js:434` vs `:414`/`:318-319`

```js
        : { x: j2.contact.x - u * 0.06, y: gy - u * 0.05 };   // band channel, pinned to the plate
      ...
      if (ex.anchor === 'foot') plate(gx + p.foot[0] * u, gy, u, ex.plate === 'ball');
      ...
      var x0 = x + (ball ? 0.06 : -0.34) * u, x1 = x + (BALL + 0.24) * u, ...
```

`ex.plate` changes only the drawn plate's left edge. The anchor is always `contact.x − 0.06u = ankle + 0.32u`, i.e. at the ball, for every movement — including the ten whose setup text says **midfoot** (`x3f-exercises.js:20, 41, 48, 62, 83`) and the split squat, whose setup says "under the **front** foot near the **heel**" (`x3f-exercises.js:69`).

**Failure scenario.** The plate graphic shows the band running under the whole foot for a deadlift, but the band visibly emerges from the toes. The one movement that genuinely *is* ball-of-foot (the calf raise) looks identical to the ten that are not, so the `plate: 'ball'` distinction communicates nothing.

### D22 — `upright-row` is marked `strongAt: 'mid'` here and `mid: 0` in the exercise database.

**Where:** `x3f-form.js:76` (`strongAt: 'mid'`) vs `x3f-exercises.js:82` (`range: 'Limited, careful range', mid: 0`). Only `bent-row` carries `mid: 1` in the database (`x3f-exercises.js:47`).

The gauge therefore paints a green "strong zone" band at `[0.34, 0.72]` for the upright row (`x3f-form.js:348`), contradicting the Library page's own data for the same movement. Two sources of truth for the same fact, already diverged.

### D23 — `strongAt: 'bottom'` is a dead branch.

**Where:** `x3f-form.js:348` — `ex.strongAt === 'bottom' ? [0.02, 0.4] : [0.6, 0.97]`. No rig uses it.

### D24 — `theme.bg` is a dead token.

**Where:** declared `x3f-form.js:153`, referenced nowhere (verified by grep: `theme.accent` ×4, `theme.band` ×4, `theme.dim` ×2, `theme.deep` ×1, `theme.skin` ×1, `theme.strain` ×1, `theme.bg` ×0).

### D25 — `mix()` fails silently on non-hex theme colours.

**Where:** `x3f-form.js:111` — `if (a.charAt(0) !== '#' || b.charAt(0) !== '#') return a;`

**Failure scenario.** A host passes `theme: {skin: 'rgb(234,240,250)'}` or a CSS custom property value. The strain flush at `:254` silently stops working; nothing logs and nothing looks broken enough to notice. It also allocates a fresh `rgb(...)` string and two arrays every frame the flush is active.

### D26 — The `foot` comment describes an algorithm the code does not implement.

**Where:** `x3f-form.js:291-299`

```
    /* ... The angle is solved from how far the ankle has
       actually left the floor, so the toe never lifts off or sinks through it. */
```

but

```js
    function footAngle(lift) { return cl(lift || 0, 0, 1) * 1.2; }
```

`lift` is a raw authored fraction mapped linearly to an angle. Nothing is "solved from how far the ankle has left the floor". The invariant the comment claims (toe never leaves the plate) does happen to hold, but by construction of the pivot, not by the solve the comment describes.

### D27 — The ground shadow does not track the feet.

**Where:** `x3f-form.js:410`

```js
      ctx.beginPath(); ctx.ellipse(gx + u * 0.1, gy + u * 0.14, u * 0.9, u * 0.15, 0, 0, 7); ctx.fill();
```

Fixed at the origin and centred `0.14u` *below* the ground line. For the split squat, feet span `x ∈ [−1.08u, +1.06u]` while the shadow covers `[−0.8u, +1.0u]`, so the rear foot floats over bare floor; every figure's feet sit above their own shadow.

### D28 — `sho` is not a rigid offset from the neck.

**Where:** `x3f-form.js:227`

```js
      var sho = { x: neck.x - Math.sin(p.lean) * u * 0.1, y: neck.y + Math.cos(p.lean) * u * 0.06 };
```

The x term uses `0.1` and the y term uses `0.06`. This is not a rotation of a fixed vector, so the shoulder's distance from the neck varies with `lean` (0.06 at `lean = 0`, 0.10 at `lean = π/2`). Any refactor that "cleans this up" to a single constant will move every authored `hand` offset.

### D29 — Unescaped `innerHTML` in `mount()`.

**Where:** `x3f-form.js:544`. `meta.name` comes from `window.X3FEX`, which is static today, so this is not currently exploitable — but it is the only `innerHTML` in the file and it takes a value from a *different* module.

### D30 — `acc = 0` instead of `acc -= minFrame` drifts the compact frame rate.

**Where:** `x3f-form.js:491` — `if (!hidden && acc >= minFrame) { acc = 0; draw(now); }`

At 60 fps with `minFrame = 1/34`, `acc` reaches `2/60 = 0.0333 > 0.0294` on the second frame and resets to 0, so the panel draws every second frame — **30 fps, not the 34 the comment at `:483-484` claims.** On a 50 Hz TV it becomes 25 fps.

### D31 — No `prefers-reduced-motion` support, and no frame-cost adaptation.

`grep -c "reduced-motion" web/x3f-form.js` → `0`. The sibling module `web/x3f-fx.js` does both: it honours the media query at `x3f-fx.js:25` / `:194` and self-sheds quality at `x3f-fx.js:101-104` when frames run long. The form rig, which is the *more* expensive of the two per pixel and the only one that runs inside games, has neither. It trembles, jitters at frame rate (`:417-420` calls `Math.random()` per painted frame), sprays sweat and drags a ghost trail unconditionally.

### D32 — The Routines page 404s on a movement art asset that does not exist.

**Where:** `X3F_Routine.html:384-385` sets `art.src = 'assets/form/' + slug + '.png'`. `web/assets/` contains only `bloom/`, `splash/` and `ui/`. Every movement change fires a failed request; `onerror` hides the `<img>`. Harmless but noisy, and it means the "illustrated plate" path the rig was presumably meant to complement has never been populated.

---

## 4. Per-movement pose verdict

| slug | verdict | evidence |
|---|---|---|
| `deadlift` | **Acceptable, weakest at the bottom.** Hip hinge, lean 0.94→0.14 and knee bend all read correctly. But `hand: [0.34, 1.44]` puts the bar 1.17 units in front of the body at the bottom while the band anchors at 0.32 — the band pulls the bar *forward*, not down, and the near elbow is buried in the torso from `t=0.55` up. Occupies only 72% of its own frame at the bottom, so a third of the panel is empty during the weak half of the rep. | `:35-36`; §2.6; D5 |
| `bent-row` | **Best rig in the file.** Elbow drives back and up (path 0.902), hip and lean essentially static, hand travels up and back to the lower chest, `strongAt: 'mid'` matches `x3f-exercises.js:47`. Only flaw: elbow buried in the torso `t=0.20..0.85`, exactly the range the movement lives in. | `:41-42`; D5 |
| `drag-curl` | **Good.** Elbow travels 0.26 backwards ("elbows back", `:49`), hand rises 0.88 close to the body. Band `stretch` reaches 1.0. Bottom pose keeps a bend (`hand[1] = 1.40` vs an arm reach of 1.56), honouring "never rest". | `:47-48`; §2.6 |
| `chest-press` | **Wrong at the start; band is nonsense throughout.** At `t=0` the hand is only 0.328 from the shoulder, so the elbow solves 0.70 units out and lands *inside* the torso; the arm reads as a dark blob on the chest until `t=0.4`. The shoulder anchor is a 0.34-unit stub behind the shoulder, so `stretch` is 0.000 at the start and 0.322 at full extension — a permanently slack band. The X3 setup (band slung over one shoulder like a messenger bag, `x3f-exercises.js:13`) is not represented at all. | `:53-54`, `:433`; D5, D6 |
| `tricep-press` | **Wrong. Actively teaches the fault its cue forbids.** Upper arm rotates 55° (elbow path 0.932) under a caption that reads "Only the elbow hinges". Band `stretch` is 0.000 for two-thirds of the rep. Bar plate covers the face at the start. | `:59-61`; D3, D6, D8 |
| `pec-crossover` | **Unrepresentable in this projection, and the worst-behaved arm.** In a pure side elevation, "cross the body" is invisible: `hand` and `hand2` differ by only `[0.12, 0.36]` at the contracted end. `grip: 0` means no bar is drawn at all. The elbow snaps hardest of any movement (`max per-1%-step 0.0361`, path 1.536, and the elbow flips from `(+0.243, +0.741)` to `(+0.727, −0.283)` in the first half). At `t=0` the band's `dist` is 0.076 units — the band is a dot. | `:65-66`; §2.6; elbow-travel harness |
| `overhead-press` | **Pose good, band dead.** Elbow low-forward at the bottom, above the shoulder at the top; arm nearly extended overhead. But `span = 6.230` makes this the smallest-drawn figure of the eleven (45% smaller than `bent-row`), and `stretch` is pinned at 1.000 across the whole rep, so the band never changes. Bar plate crosses the head at mid-rep. | `:71-72`; §1.6, §2.6; D8 |
| `upright-row` | **Mostly good, with a chicken-wing bottom.** `ebow: -1` correctly lifts the elbow above the shoulder at the top ("elbows high"). At the bottom the elbow solves 0.511 *forward* of the shoulder while the hand hangs at 0.30 — the arm bows forward instead of hanging. `strongAt: 'mid'` contradicts `x3f-exercises.js:82`. | `:77-78`; D22 |
| `front-squat` | **Wrong at both ends.** Knee 0.304 past the toe at the bottom (D4). The `ebow: +1` choice documented at `:82-84` produces an elbow 0.715 *below* the shoulder, so the front rack reads as arms hanging with the hands hooked at the shoulders — there is no "elbows forward and up" (`x3f-exercises.js:62`). The bar capsule is drawn through the head for the entire rep (D8). | `:86-87`; D4, D8 |
| `split-squat` | **Broken.** Rear leg folds forwards past the front foot for the whole descent (D2). Same non-existent front rack and same bar-through-head as the front squat. Also the only movement whose horizontal extent (±1.1 units) is unaccounted for by `reach()`. | `:92-93`; D2, D8 |
| `calf-raise` | **Right idea, wrong execution.** The ball-pivot foot is genuinely correct and the best piece of geometry in the file. But: the hip stays at `hx = 0` while the ankle travels to `+0.377`, so the figure rocks backwards as it rises (D9); both arms are inside the torso for 100% of the range, so the figure appears armless (D5); the hand offsets and lean are byte-identical between `a` and `b`, so nothing above the hips moves except a 0.22-unit translation; `stretch` moves only 0.588→0.688 and never glows. | `:100-101`; D5, D6, D9 |

**Nothing is missing** — all 11 slugs in `x3f-exercises.js` have a rig. The problems are all quality-of-pose, not coverage.

---

## 5. Design weaknesses and opportunities, ranked

**1. There is no notion of a bone hierarchy or a pole vector.** Everything is a point solved by two `ik` calls with a hard-coded side. This is why D2 (rear leg), D3 (upper arm swings), D5 (elbows inside the torso) and the pec-crossover elbow flip all exist as a *class*, not as individual bugs. A refactor that introduces per-limb bend sides and a joint hint vector fixes all four at once.

**2. `hand` in world space is the wrong parameterisation for a rig whose torso hinges up to 54°.** Every movement that leans (deadlift 0.94, bent-row 0.84, tricep-press 0.56, front-squat 0.44) has to hand-compensate its hand offsets, and any change to `TORSO`, `sho` (D28) or the lean value silently invalidates all of them. Offer *both*: torso-local for "the bar stays with the body" (front squat, calf raise, chest press) and world-space for "the arms hang" (deadlift, bent row).

**3. Strain is derived from `t`, not from force.** `sTgt = cl((t - 0.66)/0.34, 0, 1)` at `:378`. Combined with the `n/0.86` saturation (D11), 90% and 130% of max are visually identical, and the *tempo* preview — where there is no athlete at all — grimaces to 0.588 and sweats on every rep (§2.5). Strain should be a separate channel: pose from ROM, effort from force-above-the-top-of-ROM. That is also the only way "hold at the top" reads differently from "grinding at the top".

**4. The 2D side elevation is the ceiling on realism.** Pec crossover cannot be shown at all; chest press and tricep press look nearly identical; "cross the body", "elbows in toward the midline", "narrow grip" and "head through the window" are all frontal or oblique cues. A three-quarter projection (a fixed camera yaw applied to a 3-coordinate rig, still solved in 2D after projection) would cost maybe 30 lines and unlock every one of those.

**5. Per-movement scale variance is 45%.** `span` ranges 4.300 (bent-row) to 6.230 (overhead-press) (§1.6). Switching movements on the Routines page visibly resizes the person. `reach()` also ignores horizontal extent entirely, so the split squat's ±1.1-unit stance and the chest press's 1.6-unit reach are unaccounted for. A proper AABB over both poses plus a fixed *human* height (not a fixed frame fill) would make the figure a consistent character.

**6. The frame cost is 4.5× what the figure itself needs.** 1006 canvas calls/frame while moving, of which ~790 are ghosts (§2.2), including one drawn at alpha 0 (D17). Ghosts render the *full* figure — feet, face, brow, mouth, torso gradient — when a 3-segment silhouette polyline would read better and cost ~5% as much. Nine gradient objects per frame is nine allocations plus 17 `addColorStop` calls.

**7. The panel is 150 px wide and draws a face with a single eye, a brow and a mouth.** At that size a 0.05u eye is roughly 1.5 device pixels. All of the per-frame face work (`:326-344`) is below the resolution of the thing it is drawn on. Meanwhile the *silhouette* — the thing that actually reads at 150 px — is a stack of flat trapezoids with no rim light, no ground occlusion and no colour separation between overlapping limbs beyond `deep` vs `skin`.

**8. Two sources of truth for movement metadata.** `label` (`x3f-form.js`) duplicates `name` (`x3f-exercises.js`); `strongAt` duplicates and contradicts `mid` (D22); `tipA`/`tipB` duplicate a compressed version of `cue`. `x3f-exercises.js` already declares itself "single source of truth for the X3 movement library" (`:1-2`). The rig should carry geometry and nothing else.

**9. No accessibility or performance posture at all.** No `prefers-reduced-motion`, no quality shedding, no way to disable the tremble or the ghosts, and the visibility toggle does not stop the work (D16, D31). `x3f-fx.js` has all of this and is the in-repo precedent to follow.

**10. Dead and misleading code.** `P()` (`:31`), `theme.bg` (D24), `strongAt:'bottom'` (D23), `inst.has` (`:512`), the `foot` comment (D26), the "~34fps" comment (D30), and the header's stale API list (§1.2).

**11. Unused authored signal.** `head` tilt exists on every pose but is ignored by `reach()`; `hand2` is authored on exactly one movement; `foot2` on exactly one; `plate` on exactly one and only affects a rectangle's left edge (D21). Three of the pose format's seven optional fields are effectively vestigial.

**12. Storage is global, not scoped.** `x3f_formOn` (`:552`) is one boolean for every game and every movement. The roadmap already anticipates household profiles (`ROADMAP.md:148-150`) with per-profile key prefixes; this key will need to move with them.

---

## 6. What it would take to make this genuinely beautiful

Ordered by ratio of visual gain to risk.

**Silhouette work (cheap, biggest win at 150 px).**
- Replace `limb()`'s flat trapezoid with a single closed path per limb *chain* (hip→knee→ankle as one shape) so joints do not read as beads on a string.
- Add a real pelvis (a wedge between the two hip attach points, currently `hip.x ± 0.05/0.06` at `:261`/`:272`) and a ribcage taper, so the torso stops being one capsule.
- Give the whole near-side figure a single rim light — one offset, lighter-coloured copy of the silhouette path — instead of the current one-off dark stroke on the near arm only (`:279-284`), which produces a visible dark stub 0.15u past the hand because `lineCap:'round'` overshoots the 0.08u hand cap.
- Draw a neck. The head currently attaches by a **0.010-unit overlap** (head bottom at 0.24 from the neck vs a 0.25 torso end cap) — see the invariant in §7.

**Anatomy (medium cost, fixes five defects at once).**
- Per-limb bend side + a pole-vector hint, replacing the hard-coded `-1` at `:245` and the single `ex.ebow` at `:250`. Fixes D2, D3, D5 and the pec-crossover flip.
- Torso-local hand offsets as an option (`handSpace: 'world' | 'torso'`), fixing D3 properly and making the front-squat rack expressible.
- Hands. There are none — the wrist is a `0.08u` circle. Two small shapes (a fist wrapping the bar, a flat palm) transform the read of every press and pull.
- Foot roll for the *far* foot on the calf raise and a proper heel/toe silhouette rather than a rect plus a wedge.

**Motion (cheap, high perceived quality).**
- Replace the per-frame `Math.random()` tremble at `:417-420` with a low-frequency noise sum (2–3 sine terms at ~7 Hz and ~11 Hz). Right now it buzzes at display rate, which reads as video noise rather than muscular effort.
- Add secondary motion: a 1–2 frame lag on the head and forearms behind the torso. Free-looking weight.
- Ghosts as a silhouette-only trail (one polyline through hip/knee/ankle/shoulder/hand) rather than 6 full figures. ~95% cheaper and cleaner.
- Ease the pose blend on a per-field basis. Everything currently lerps on one `t`, so nothing overlaps or overshoots — the hallmark of a rig rather than a performance.

**Staging (cheap).**
- A shadow that tracks the actual contact points (D27), softening and shrinking as the heel lifts.
- A real X3 bar: a short ellipse seen end-on for the true side view (the current fixed `-0.22` rotation on a 1.1-unit capsule at `:213-214` is a front-view bar drawn into a side-view scene), plus band ends that terminate *at* the bar rather than at a hand midpoint.
- Per-movement band anchor and stretch calibration (D6, D21), so tension reads honestly. Two numbers per rig — `bandZero` and `bandFull` — would do it.
- A three-quarter camera yaw, which is what actually separates "a stick rig" from "a person" for the four movements whose whole point is frontal (pec crossover, chest press, upright row, overhead press).

**Presentation.**
- Drop the face below a size threshold and spend the ops on the silhouette instead; keep the face for the full-size Routines/Calibrate canvases.
- One coherent light direction. There is currently a torso gradient `deep → skin` running hip-to-neck (`:268-270`) and nothing else shaded, so the light comes from below on the torso and from nowhere on the limbs.

---

## 7. Invariants a refactor must not break

**I1 — `web/` is the source of truth; `app/src/main/assets/x3f-form.js` is a verbatim copy.**
Evidence: `tools/sync-from-web.py:52` — `SHARED = ["x3f-exercises.js", "x3f-form.js", ...]`; `diff web/x3f-form.js app/src/main/assets/x3f-form.js` is empty. Editing only one half ships two different rigs.

**I2 — `X3FForm.verb(slug)` must keep returning the movement's verb, and `verb('chest-press') === 'PRESS'`, `verb('deadlift') === 'PULL'`.**
Evidence: `tools/func-test/cases.js:211-213` asserts both. `X3F_Nova.html:563` sets its whole idle prompt from it (`EFFORT = X3FForm.verb(slug)`), and `X3F_Calibrate.html:113`/`:193`/`:196` build "PULL MAX" and "…as hard as you can on GO" from it. `HANDOFF.md:109` records this as a deliberate fix. The default for an unknown slug must remain `'PULL'`.

**I3 — `getN()` returns force normalised so that `1.0` is the calibrated all-out max and `0` is the calibrated start tension, and it may exceed 1.**
Evidence: `X3F_Bloom.html:116` `ref() = X3FCal.span(EXSLUG, band)`; `:159` `force = Math.max(0, raw - baseline - calLo())`; `x3f-cal.js:17-20`. Any rescaling of `(n - 0.04)/0.86` changes the meaning of every game's force mapping, and Calibrate's `figN` (`X3F_Calibrate.html:181`) is built to the same contract.

**I4 — The scale is fixed per movement across the whole range; the figure must not grow or shrink mid-rep.**
Evidence: the comment at `x3f-form.js:127-130` states this as the design intent; `span()` at `:135-138` memoises `Math.max(reach(a), reach(b))` on the rig. Any per-frame scale would make the panel pump.

**I5 — The foot pivots on the BALL, and the ball contact stays pinned to the floor.**
Evidence: `x3f-form.js:232-236` and `:291-295` both state it in prose; the geometry at `:239-244` implements it; `HANDOFF.md:91` ships it as a feature ("The foot hinges on the ball with the contact pinned to the floor, so a calf raise really rises onto the toes"). Rotating about the ankle instead gives a toe raise, which is wrong for every X3 movement. **`foot[0]` must keep meaning "ankle x at rest".**

**I6 — `EXR` keys are the same slugs as `x3f-exercises.js`.**
Evidence: `x3f-exercises.js:3` ("x3f-form.js … keys its pose rigs off the same slugs"); `X3FForm.has(slug)` is the gate at `X3F_Bloom.html:261`, `X3F_Nova.html:562`, `X3F_Splash.html:417`, `X3F_Calibrate.html:93`/`:102`, `X3F_Routine.html:386`. Renaming a key breaks all five call sites silently (they just skip the panel).

**I7 — `mount()` must return `null` for an unknown slug and must not reveal `toggleBtn`.**
Evidence: `x3f-form.js:540` `if (!EXR[o.exercise]) return null;` before `o.toggleBtn.style.display = ''` at `:557`. The three games ship `<button id="formBtn" style="display:none">` (`X3F_Bloom.html:66`, `X3F_Nova.html:71`, `X3F_Splash.html:68`) and rely on `mount` to unhide it. Returning an instance for an unknown slug would put a dead "Form on" button in every game's topbar.

**I8 — The panel is `pointer-events:none` and never takes focus.**
Evidence: `x3f-form.js:523`. `HANDOFF.md:41` warns that the games have no `x3f-nav.js` and that in-game D-pad handling must not be disturbed. A focusable panel would enter the games' spatial-nav candidate set.

**I9 — `create()` must size its canvas synchronously and must survive being called before layout.**
Evidence: `x3f-form.js:171-177` early-returns when `clientWidth`/`clientHeight` is 0, and `draw()` re-calls `resize()` at `:399`. `X3F_Calibrate.html:105-110` documents exactly this case and adds two compensating `resize()` calls. `tools/func-test/cases.js:111` asserts `demoCv.width > 0` after the guided coach opens.

**I10 — Storage key `x3f_formOn`, JSON boolean, and only `=== false` hides the panel.**
Evidence: `x3f-form.js:552-553`. A user who has turned the guide off must stay off across every game and every launch; any other stored value (including a corrupted one) must fail *on*.

**I11 — `head` circle and torso end cap overlap by only 0.010 units.**
Head centre sits `HEAD + 0.24 = 0.57` from the neck (`:229-230`); head radius is `HEAD = 0.33`, so the head's near edge is `0.24` from the neck. The torso `limb()` end cap has radius `u * 0.25` (`:270`). The margin is `0.010` units, independent of pose (verified across all 11 rigs and all `t`). **Any change to `HEAD`, the `0.24` neck offset, or the torso's `0.25` end width detaches the head.** This is the most fragile constant in the file and it is not commented anywhere.

**I12 — `a` is the stretched/weak end and `b` is the contracted/strong end, and `t` maps monotonically `a → b`.**
Evidence: `x3f-form.js:30`; `blend()` at `:140`; the gauge's `strongAt` zones at `:348`; the tip switch at `:472` (`t > 0.55 ? ex.tipB : ex.tipA`); the phase label's `t > 0.5 ? 'HOLD' : 'TENSION'` at `:468`. Flipping the convention for any single rig would invert the gauge, the tips and the label together.

**I13 — Panels inside a game must repaint below the display rate.**
Evidence: `x3f-form.js:482-485` and `ROADMAP.md:160-162` ("Three animation loops on a TV SoC"). Whatever replaces `minFrame`, the compact panel must not paint every frame — and it must get *cheaper*, not more expensive (§2.2).

**I14 — `ex.ebow` and the pose fields are read from a shared, exported object.**
`X3FForm.rigs === EXR` (`:570`) and `span()` writes `__span` onto it (`:136`). Nothing external mutates it today, but any refactor that freezes `EXR` will break `span()`, and any refactor that clones rigs per instance will silently drop the memo.

**I15 — `frame(dt)` exists and is the documented hook for host-owned frame budgets.**
Evidence: `x3f-form.js:507-509` and `ROADMAP.md:161`. It must keep advancing exactly one simulation step and one repaint — and, per D18, must gain a way to suppress the internal rAF loop rather than being removed.

---

## 8. Appendix — full joint solve, all 11 movements

Coordinates are in figure units with the origin at the ground centre; **negative y is above the floor**. `elbowNear` is relative to the shoulder. Produced by harness 1.

```
deadlift       t=0   hip -0.340 -1.620 | sho  0.831 -2.499 | elbowNear -0.071  0.777 | hand  1.171 -1.059 | kneeNear  0.681 -1.114 | kneeFar  0.630 -1.022 | stretch 0.132
deadlift       t=0.5 hip -0.170 -2.030 | sho  0.575 -3.308 | elbowNear -0.090  0.775 | hand  0.875 -1.858 | kneeNear  0.587 -1.177 | kneeFar  0.515 -1.119 | stretch 0.392
deadlift       t=1   hip  0.000 -2.440 | sho  0.202 -3.915 | elbowNear -0.108  0.772 | hand  0.462 -2.455 | kneeNear  0.213 -1.320 | kneeFar  0.116 -1.306 | stretch 0.629

bent-row       t=0   hip -0.300 -2.080 | sho  0.780 -3.075 | elbowNear -0.124  0.770 | hand  1.020 -1.615 | kneeNear  0.469 -1.239 | stretch 0.312
bent-row       t=0.5 hip -0.300 -2.080 | sho  0.760 -3.097 | elbowNear -0.544  0.559 | hand  0.830 -2.057 | kneeNear  0.469 -1.239 | stretch 0.475
bent-row       t=1   hip -0.300 -2.080 | sho  0.740 -3.118 | elbowNear -0.755  0.196 | hand  0.640 -2.498 | kneeNear  0.469 -1.239 | stretch 0.657

drag-curl      t=0   hip  0.000 -2.420 | sho  0.101 -3.906 | elbowNear -0.168  0.762 | hand  0.381 -2.506 | stretch 0.651
drag-curl      t=0.5 hip  0.000 -2.420 | sho  0.087 -3.907 | elbowNear -0.411  0.663 | hand  0.397 -2.947 | stretch 0.851
drag-curl      t=1   hip  0.000 -2.420 | sho  0.072 -3.908 | elbowNear -0.429  0.652 | hand  0.412 -3.388 | stretch 1.000

chest-press    t=0   hip  0.000 -2.400 | sho  0.260 -3.866 | elbowNear -0.335  0.704 | hand  0.520 -3.666 | stretch 0.000  (dist 0.600)
chest-press    t=0.5 hip  0.000 -2.400 | sho  0.274 -3.863 | elbowNear  0.184  0.758 | hand  1.104 -3.543 | stretch 0.070
chest-press    t=1   hip  0.000 -2.400 | sho  0.288 -3.860 | elbowNear  0.621  0.472 | hand  1.688 -3.420 | stretch 0.322

tricep-press   t=0   hip -0.100 -2.300 | sho  0.670 -3.562 | elbowNear  0.710  0.324 | hand  0.970 -3.902 | stretch 0.000
tricep-press   t=0.5 hip -0.100 -2.300 | sho  0.670 -3.562 | elbowNear  0.093  0.774 | hand  1.280 -3.372 | stretch 0.000
tricep-press   t=1   hip -0.100 -2.300 | sho  0.670 -3.562 | elbowNear  0.141  0.767 | hand  1.590 -2.842 | stretch 0.170

pec-crossover  t=0   hip  0.000 -2.400 | sho  0.174 -3.879 | elbowNear  0.243  0.741 | hand -0.226 -3.579 | stretch 0.000  (dist 0.076)
pec-crossover  t=0.5 hip  0.000 -2.400 | sho  0.202 -3.875 | elbowNear  0.727 -0.283 | hand  0.612 -3.445 | stretch 0.000
pec-crossover  t=1   hip  0.000 -2.400 | sho  0.231 -3.871 | elbowNear  0.776 -0.081 | hand  1.451 -3.311 | stretch 0.239

overhead-press t=0   hip  0.000 -2.420 | sho  0.087 -3.907 | elbowNear  0.388  0.677 | hand  0.547 -4.007 | stretch 1.000
overhead-press t=0.5 hip  0.000 -2.440 | sho  0.058 -3.929 | elbowNear  0.775 -0.086 | hand  0.408 -4.669 | stretch 1.000
overhead-press t=1   hip  0.000 -2.460 | sho  0.029 -3.950 | elbowNear  0.458 -0.631 | hand  0.269 -5.330 | stretch 1.000

upright-row    t=0   hip  0.000 -2.420 | sho  0.087 -3.907 | elbowNear  0.511  0.589 | hand  0.387 -2.567 | stretch 0.678
upright-row    t=0.5 hip  0.000 -2.420 | sho  0.072 -3.908 | elbowNear  0.762  0.166 | hand  0.442 -3.068 | stretch 0.907
upright-row    t=1   hip  0.000 -2.420 | sho  0.058 -3.909 | elbowNear  0.666 -0.407 | hand  0.498 -3.569 | stretch 1.000

front-squat    t=0   hip -0.220 -1.160 | sho  0.398 -2.508 | elbowNear  0.312  0.715 | hand  0.798 -2.568 | kneeNear  0.904 -0.967 | kneeFar  0.864 -0.808 | stretch 0.693
front-squat    t=0.5 hip -0.110 -1.790 | sho  0.277 -3.226 | elbowNear  0.348  0.698 | hand  0.677 -3.306 | kneeNear  0.783 -1.081 | kneeFar  0.712 -1.000 | stretch 1.000
front-squat    t=1   hip  0.000 -2.420 | sho  0.145 -3.903 | elbowNear  0.382  0.680 | hand  0.545 -4.003 | kneeNear  0.288 -1.317 | kneeFar  0.205 -1.299 | stretch 1.000

split-squat    t=0   hip -0.080 -1.240 | sho  0.208 -2.700 | elbowNear  0.348  0.698 | hand  0.608 -2.780 | kneeNear  1.059 -1.204 | kneeFar  0.602 -0.326 | ankFar -0.534 -0.426 | stretch 0.780
split-squat    t=0.5 hip -0.030 -1.790 | sho  0.187 -3.263 | elbowNear  0.382  0.680 | hand  0.587 -3.363 | kneeNear  0.972 -1.247 | kneeFar  0.528 -0.796 | ankFar -0.549 -0.424 | stretch 1.000
split-squat    t=1   hip  0.020 -2.340 | sho  0.165 -3.823 | elbowNear  0.416  0.660 | hand  0.565 -3.943 | kneeNear  0.566 -1.339 | kneeFar  0.246 -1.223 | ankFar -0.565 -0.421 | stretch 1.000

calf-raise     t=0   hip  0.000 -2.300 | sho  0.072 -3.788 | elbowNear -0.130  0.769 | hand  0.372 -2.368 | kneeNear  0.506 -1.278 | ankFar -0.133 -0.244 | stretch 0.588
calf-raise     t=0.5 hip  0.000 -2.410 | sho  0.072 -3.898 | elbowNear -0.130  0.769 | hand  0.372 -2.478 | kneeNear  0.599 -1.440 | ankFar  0.019 -0.380 | stretch 0.638
calf-raise     t=1   hip  0.000 -2.520 | sho  0.072 -4.008 | elbowNear -0.130  0.769 | hand  0.372 -2.588 | kneeNear  0.596 -1.548 | ankFar  0.217 -0.429 | stretch 0.688
```

Off-arm (`hand2`) extension against the 1.560 arm reach / 1.558 IK clamp — the two closest to detaching:

```
  deadlift        max off-arm reach 1.5280 at t=1.00   (98% extended)
  bent-row        max off-arm reach 1.5254 at t=0.00   (98% extended)
  calf-raise      max off-arm reach 1.4946 at t=0.02
  upright-row     max off-arm reach 1.4160 at t=0.00
  drag-curl       max off-arm reach 1.4717 at t=0.00
  chest-press     max off-arm reach 1.3519 | overhead-press 1.3474 | tricep-press 1.1307
  pec-crossover   max off-arm reach 1.1180 | front-squat 0.3635 | split-squat 0.3667
```

A 0.03-unit tweak to the deadlift's or bent row's `hand` would push the *default-derived* off hand past the clamp, at which point `ik` solves for a shorter chain while `arm()` still draws the hand at the unclamped target — the forearm visibly detaches from the hand. That is the failure mode to watch for when re-authoring poses.
