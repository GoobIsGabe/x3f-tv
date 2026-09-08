/* X3F BAND - the single owner of "which band is this movement on?".

   WHY THIS FILE EXISTS

   Before it, three different places each answered that question and none of
   them agreed:

     x3f_band            a single global, written by every game's band <select>
                         AND by Calibrate
     x3f_libBand[slug]   per movement, written only by the Library
     ex.band             the library's recommendation, used as the Library's
                         default

   Calibrate keyed on the global. The Library launched games on the per-movement
   value, defaulting to the recommendation. Nothing reconciled them, so the
   normal path through the app was:

     1. Open Calibrate on a fresh install. It defaults to Chest Press / White.
     2. Capture hold 30, max 150. Saved as chest-press|White. The screen says
        "Games now treat 30 as the bottom of this movement and 150 as the top."
     3. Open the Library, tap Bloom on Chest Press. The Library launches it with
        band=Dark Gray, because that is chest-press's recommendation.
     4. The game asks for chest-press|Dark Gray, finds nothing, and falls back to
        a hardcoded ceiling of 330 with a floor of 0.
     5. Every threshold in the game derives from that ceiling, so the vine sits
        at 9% at rest, tops out at 45%, and NO REP IS EVER COUNTED.

   The calibration was correct. It was simply looked up under a different key
   than it was filed under. Calibrating again, harder, or on a different day,
   cannot fix it - which is exactly what "different exercises still have trouble
   getting the minimums and the maximums" feels like from the sofa.

   So: one resolution order, in one function, used by every page including
   Calibrate. It is then structurally impossible to calibrate one band and train
   another.

   RESOLUTION ORDER

     1. ?band=          an explicit override for THIS RUN only. Never persisted -
                        v1.4 fixed a bug where it rewrote the global setting.
     2. x3f_exBand[slug]  the user's explicit per-movement choice.
     3. a real calibration for this movement. If they have calibrated this
        movement on exactly one band, that is obviously the band they train it
        on. This is what heals existing installs that are already in the broken
        state above.
     4. x3f_band        the global - the band physically on your bar right now,
                        which defaults to White because the program's own
                        instruction to a new user is "begin with the lightest
                        band".

   ex.band - the library's RECOMMENDATION - is deliberately NOT in that chain.
   It is exported (X3FBand.recommended) and shown as advice, but it never
   decides a value, and that is a decision this project has already made once:

     v1.4 - "Routines defaulted every movement to the library's suggestion, so
     starting a day on White silently moved you to Dark Gray, a setting you
     never chose. Routines now default to the band you are on and show the
     suggestion as advice."

   The recommendation is advice about what a lift CAN take. The global is a
   statement of fact about what is on the bar. Advice must never silently
   override fact. tools/func-test's routine scenario pins this ("every lift
   starts on the band you are on") and it caught an attempt to reverse it while
   this file was being written.

   The global and the per-movement value are deliberately kept SEPARATE. Writing
   one from the other is what made "starting a day on White silently moved you
   to Dark Gray" in v1.4.

     X3FBand.forMovement(slug)     -> band name
     X3FBand.set(slug, band)       explicit per-movement choice
     X3FBand.current()             the global, for movement-less pages
     X3FBand.setCurrent(band)
     X3FBand.override()            the ?band= for this run, or null
     X3FBand.calibratedFor(slug)   -> [{band, lo, hi, auto, t}], newest first
     X3FBand.explicit(slug)        -> band|null, has the user actually chosen?
     X3FBand.onChange(fn)          notified on any change
     X3FBand.all()                 the whole per-movement map
*/
(function () {
  "use strict";

  var K_EX = 'x3f_exBand';       // {slug: band} - explicit per-movement choice
  var K_GLOBAL = 'x3f_band';     // string       - the movement-less fallback
  var K_LEGACY = 'x3f_libBand';  // {slug: band} - what the Library used to write
  var K_CAL = 'x3f_exCal';       // {"slug|band": {lo,hi,auto,t}} - owned by x3f-cal
  var DEFAULT = 'White';

  function read(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k)); return (v === null || v === undefined) ? d : v; }
    catch (e) { return d; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var listeners = [];
  function fire(slug, band) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](slug, band); } catch (e) {}
    }
  }

  /* One-time migration of the Library's old key. An explicit choice the user
     made in the Library is still an explicit choice, so it is preserved rather
     than discarded - it just moves to the key everything now reads. The legacy
     key is left in place so an older build reading it still works, and so a
     mistake here is recoverable. */
  function migrated() {
    var ex = read(K_EX, null);
    if (ex && typeof ex === 'object') return ex;
    var legacy = read(K_LEGACY, {});
    var out = {};
    if (legacy && typeof legacy === 'object') {
      Object.keys(legacy).forEach(function (k) {
        if (typeof legacy[k] === 'string' && legacy[k]) out[k] = legacy[k];
      });
    }
    write(K_EX, out);
    return out;
  }

  function exMap() { return migrated(); }

  function override() {
    try {
      var b = (new URLSearchParams(location.search)).get('band');
      return b || null;
    } catch (e) { return null; }
  }

  /* Every band this movement has a calibration for, newest first. A real
     (auto:false) calibration always outranks an auto-learned estimate, because
     an estimate is just "the biggest number we happened to see" and says
     nothing about which band you meant to be on. */
  function calibratedFor(slug) {
    if (!slug) return [];
    var m = read(K_CAL, {}), out = [];
    if (!m || typeof m !== 'object') return out;
    Object.keys(m).forEach(function (k) {
      var sep = k.lastIndexOf('|');
      if (sep < 0 || k.slice(0, sep) !== slug) return;
      var e = m[k];
      if (!e || !(e.hi > 0)) return;
      out.push({ band: k.slice(sep + 1), lo: e.lo || 0, hi: e.hi, auto: !!e.auto, t: e.t || 0 });
    });
    out.sort(function (a, b) {
      if (a.auto !== b.auto) return a.auto ? 1 : -1;   // real calibrations first
      return (b.t || 0) - (a.t || 0);                   // then newest
    });
    return out;
  }

  function recommended(slug) {
    try {
      var ex = window.X3FEX && window.X3FEX.get(slug);
      return (ex && ex.band) || null;
    } catch (e) { return null; }
  }

  function current() {
    var v = read(K_GLOBAL, DEFAULT);
    return (typeof v === 'string' && v) ? v : DEFAULT;
  }

  function setCurrent(band) {
    if (!band) return;
    write(K_GLOBAL, band);
    fire(null, band);
  }

  function explicit(slug) {
    if (!slug) return null;
    var v = exMap()[slug];
    return (typeof v === 'string' && v) ? v : null;
  }

  function forMovement(slug) {
    var o = override();
    if (o) return o;
    if (!slug) return current();

    var e = explicit(slug);
    if (e) return e;

    /* The healing step. A movement you have actually calibrated is a movement
       whose band you have already told us, more reliably than any default. */
    var cal = calibratedFor(slug);
    for (var i = 0; i < cal.length; i++) {
      if (!cal[i].auto) return cal[i].band;
    }

    /* No recommendation fallback here, on purpose - see the header. current()
       already defaults to White, which is what the program tells a new user to
       start on. */
    return current() || DEFAULT;
  }

  function set(slug, band) {
    if (!slug || !band) return;
    var m = exMap();
    if (m[slug] === band) return;
    m[slug] = band;
    write(K_EX, m);
    /* Deliberately does NOT touch x3f_band. Choosing a band for one movement
       must never silently move every other movement, which is the bug v1.4
       fixed and this file must not reintroduce. */
    fire(slug, band);
  }

  function clear(slug) {
    var m = exMap();
    if (!(slug in m)) return;
    delete m[slug];
    write(K_EX, m);
    fire(slug, forMovement(slug));
  }

  window.X3FBand = {
    forMovement: forMovement,
    set: set,
    clear: clear,
    current: current,
    setCurrent: setCurrent,
    override: override,
    explicit: explicit,
    calibratedFor: calibratedFor,
    recommended: recommended,
    all: exMap,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    DEFAULT: DEFAULT
  };
})();
