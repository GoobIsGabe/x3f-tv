/* X3F EXERCISES - single source of truth for the X3 movement library.
   Used by X3F_Library.html (browse), X3F_Routine.html (guided sessions) and
   x3f-form.js (which keys its pose rigs off the same slugs).
   Data reflects the standard X3 12-week program: variable resistance, constant
   tension, 15-40 full reps then diminishing range to true failure. */
(function () {
  "use strict";

  var EX = [
    {
      slug: 'chest-press', name: 'Chest Press', muscle: 'Chest · delts · triceps',
      band: 'Dark Gray', day: 'push', range: 'Strongest near lockout', mid: 0,
      setup: 'Band doubled; sling it over a shoulder like a messenger bag and rotate the bar across to your chest.',
      cue: 'Drive your upper arms toward your body’s midline, and press slightly <b>downward</b> (decline-style) to spare the shoulder.',
      games: ['bloom', 'max', 'zone']
    },
    {
      slug: 'overhead-press', name: 'Overhead Press', muscle: 'Deltoids',
      band: 'Light Gray', day: 'push', range: 'Strongest at the top', mid: 0,
      setup: 'Band midfoot under the plate, pronated grip, start at chin height.',
      cue: '“Head through the window” at the top — roll the shoulders back for the deepest delt squeeze. No lockout, no rest.',
      games: ['bloom', 'max', 'rhythm']
    },
    {
      slug: 'tricep-press', name: 'Tricep Press', muscle: 'Triceps (isolation)',
      band: 'Light Gray', day: 'push', range: 'Strongest at extension', mid: 0,
      setup: 'Like the chest press but hold the bar higher (eyebrow level) and lean ~45° forward.',
      cue: 'Freeze the upper arm — <b>only the elbow hinges</b>. Press down and isolate the triceps.',
      games: ['bloom', 'zone']
    },
    {
      slug: 'pec-crossover', name: 'Pec Crossover', muscle: 'Chest — do it right after chest press',
      band: 'Light Gray', day: 'push', range: 'Strongest fully crossed', mid: 0,
      setup: 'Bring the band over your head so it crosses behind you at the deltoids.',
      cue: 'Truly <b>cross the body</b> — one elbow over the other, alternating. Squeeze the pec hard in its shortest position.',
      games: ['bloom', 'zone']
    },
    {
      slug: 'deadlift', name: 'Deadlift', muscle: 'Back · glutes · hamstrings',
      band: 'Black', day: 'pull', range: 'Strongest standing — go slow through the weak bottom', mid: 0,
      setup: 'Band doubled under the plate midfoot, double-overhand grip (no straps), toes at the front edge.',
      cue: 'Flat back, hinge at the hips, drive with the <b>glutes</b>. Pull from below the knee, keep tension, never lock the knees.',
      games: ['bloom', 'max', 'boss']
    },
    {
      slug: 'bent-row', name: 'Bent Row', muscle: 'Lats · rear delts (some bicep)',
      band: 'Dark Gray', day: 'pull', range: 'Strongest in the MID-RANGE', mid: 1,
      setup: 'Band doubled midfoot, supinated grip, flat neutral spine (a straight diagonal line — not hunched, not arched).',
      cue: 'Feel it in the back. <b>Unique curve:</b> power is in the middle, so after full reps grind 10–15 <b>mid-range partials</b> — far more than any other lift.',
      games: ['bloom', 'zone', 'rhythm']
    },
    {
      slug: 'drag-curl', name: 'Drag Curl', muscle: 'Biceps',
      band: 'Light Gray', day: 'pull', range: 'Strongest at the top squeeze', mid: 0,
      setup: 'Band <b>singled</b> (not doubled), supinated grip, elbows slightly bent.',
      cue: 'Drag the bar up close to your body — elbows go back, stop at mid/lower chest (higher breaks the isolation). Slight bend at the bottom for constant tension.',
      games: ['bloom', 'zone', 'rhythm']
    },
    {
      slug: 'front-squat', name: 'Front Squat', muscle: 'Quads · glutes',
      band: 'Dark Gray', day: 'legs', range: 'Strongest standing', mid: 0,
      setup: 'Band midfoot, bar resting on the front of your shoulders, elbows forward and up.',
      cue: 'Drop your hips <b>straight down</b> like sitting into a chair; knee tracks over the big toe; don’t lock out at the top.',
      games: ['bloom', 'max']
    },
    {
      slug: 'split-squat', name: 'Split Squat', muscle: 'Single-leg quad · glute · core',
      band: 'Dark Gray', day: 'legs', range: 'Superior to the front squat — huge core work', mid: 0,
      setup: 'Band under the <b>front</b> foot near the heel, bar on the shoulders.',
      cue: 'Put all the weight over the front leg (rear leg is balance only); front knee nearly touches the floor. Take one leg to full fatigue, then the other.',
      games: ['bloom', 'max', 'duel']
    },
    {
      slug: 'calf-raise', name: 'Calf Raise', muscle: 'Calves',
      band: 'Light Gray', day: 'legs', range: 'Strongest at the top', mid: 0,
      setup: '<b>Balls</b> of the feet over the band channel (not midfoot), heels off the back edge — never touch down.',
      cue: 'Lighter band, higher reps, constant tension — no resting at the bottom. You can grow calves; this is how.',
      games: ['bloom', 'zone']
    },
    {
      slug: 'upright-row', name: 'Upright Row', muscle: 'Delts · traps (shoulder-friendly)',
      band: 'White', day: 'alt', range: 'Limited, careful range', mid: 0,
      setup: 'Set up like the overhead press — narrow grip, band midfoot, light band.',
      cue: 'Pull <b>only to mid-chest</b> — never to the chin (that’s hard on a compromised shoulder). Careful, controlled reps.',
      games: ['bloom', 'zone']
    }
  ];

  var BY = {};
  EX.forEach(function (e) { BY[e.slug] = e; });

  /* The library groups shown on X3F_Library.html, in program order. */
  var GROUPS = [
    ['Push Day', ['chest-press', 'overhead-press', 'tricep-press', 'pec-crossover']],
    ['Pull Day', ['deadlift', 'bent-row', 'drag-curl']],
    ['Leg Day', ['front-squat', 'split-squat', 'calf-raise']],
    ['Alternative — only if you can’t press overhead', ['upright-row']]
  ];

  /* Default routine days — the standard X3 push/pull split, legs folded in.
     Every day stays fully editable on the Routines page. */
  var DAYS = [
    ['Push Day', ['chest-press', 'tricep-press', 'overhead-press', 'front-squat', 'calf-raise']],
    ['Pull Day', ['deadlift', 'bent-row', 'drag-curl', 'split-squat', 'calf-raise']]
  ];

  var BANDS = ['White', 'Light Gray', 'Dark Gray', 'Black', 'Elite Black'];

  /* Every game an exercise can be trained in, and how to launch it. */
  var GAMES = {
    bloom: { name: 'Bloom', sub: 'controlled reps', file: 'X3F_Bloom.html', tempo: 1 },
    splash: { name: 'Splash', sub: 'arcade', file: 'X3F_Splash.html' },
    nova: { name: 'Nova', sub: 'space RPG', file: 'X3F_Nova.html' },
    flow: { name: 'Flow', sub: 'controlled reps', file: 'X3F_Flow.html', tempo: 1 },
    zone: { name: 'Hold the Zone', sub: 'time under tension', file: 'X3F_Arena.html', mode: 'zone' },
    max: { name: 'Max Effort', sub: 'strength', file: 'X3F_Arena.html', mode: 'max' },
    boss: { name: 'Boss Fight', sub: 'endurance', file: 'X3F_Arena.html', mode: 'boss' },
    duel: { name: 'Duel', sub: 'vs CPU', file: 'X3F_Duel.html' },
    rhythm: { name: 'Rhythm', sub: 'on beat', file: 'X3F_Rhythm.html' },
    ascent: { name: 'Ascent', sub: '3D flight', file: 'X3F_Ascent.html' }
  };

  /* The web build ships X3F_Bloom.html; the Android TV bundle ships bloom.html.
     A page can set window.X3FFILES = {bloom:'bloom.html', ...} BEFORE loading
     this file to remap the launch targets, so both builds share one copy of the
     movement data instead of forking it. */
  function fileFor(key, def) {
    var m = window.X3FFILES;
    return (m && m[key]) || def;
  }

  /* Build a launch URL. from = the page asking (lib / routine), so games can
     log the set back against the right exercise. */
  function gameUrl(game, o) {
    var g = GAMES[game] || GAMES.bloom, q = [];
    if (g.mode) q.push('mode=' + g.mode);
    q.push('from=' + encodeURIComponent((o && o.from) || 'lib'));
    if (o && o.band) q.push('band=' + encodeURIComponent(o.band));
    if (o && o.tempo && g.tempo) q.push('tempo=' + encodeURIComponent(o.tempo));
    if (o && o.ex) q.push('ex=' + encodeURIComponent(o.ex));
    return fileFor(game, g.file) + '?' + q.join('&');
  }

  window.X3FEX = {
    list: EX, by: BY, groups: GROUPS, days: DAYS,
    bands: BANDS, games: GAMES, gameUrl: gameUrl,
    get: function (slug) { return BY[slug] || null; }
  };
})();
