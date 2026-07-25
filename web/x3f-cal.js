/* X3F CAL - per-movement force calibration.

   Before this there was ONE number per band (x3f_bandMax), shared by all 11
   movements. That is wrong twice over:

     1. The ceiling differs per movement. A chest press and an overhead press on
        the same band are nowhere near the same force, so a scale calibrated on
        the strong one leaves the weak one unable to reach the top, and vice
        versa.
     2. The FLOOR differs per movement, and that is the one that actually bit.
        An overhead press starts at chin height with the band already under the
        midfoot, so the movement's own starting position is already carrying
        real load. Every game treated 0 as "no effort", so the very bottom of
        the range already read near the top of the screen - you were pinned
        before you had done anything.

   So a movement+band is calibrated as a RANGE: lo = the force at your start
   position, hi = your all-out max. Games subtract lo from the live force and
   scale the rest to (hi - lo), which is why the wiring in each game is only two
   lines - the signal handed to the game is already floored and spanned.

   Uncalibrated movements auto-learn the CEILING from the peaks the bar actually
   reports, so a movement you have never calibrated still scales to you after a
   set or two. The floor stays 0 until you calibrate it, because there is no
   honest way to guess a start position from peak force alone.

     X3FCal.slug()                 movement this page was launched for, or null
     X3FCal.range(slug, band)      -> {lo, hi, auto}
     X3FCal.floor(slug, band)      -> lo
     X3FCal.span(slug, band)       -> hi - lo, never below 40
     X3FCal.save(slug, band, lo, hi)
     X3FCal.observe(slug, band, peak)   feed a finished set's peak
     X3FCal.clear(slug, band)
     X3FCal.all()                  -> the whole map, for the dashboard
*/
(function () {
  "use strict";

  var KEY = 'x3f_exCal';
  var BAND_DEF = { 'White': 130, 'Light Gray': 230, 'Dark Gray': 330, 'Black': 430, 'Elite Black': 600 };
  var MIN_SPAN = 40;                 // below this the meter is twitch, not signal

  function read(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k)); return (v === null || v === undefined) ? d : v; }
    catch (e) { return d; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* range() is called from inside draw loops - Bloom asks ~10x a frame - so the
     parsed map is cached and only re-read a couple of times a second. Writes
     drop the cache immediately, so a fresh calibration is never stale. */
  var cache = null, cacheAt = 0;
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function map() {
    var t = nowMs();
    if (cache && t - cacheAt < 500) return cache;
    var m = read(KEY, {});
    cache = (m && typeof m === 'object') ? m : {};
    cacheAt = t;
    return cache;
  }
  function flush(m) { write(KEY, m); cache = m; cacheAt = nowMs(); }
  function id(slug, band) { return String(slug || '') + '|' + String(band || ''); }

  /* The band max stays the fallback: it is what every existing install already
     has, and for an uncalibrated movement it is a better guess than nothing. */
  function bandCeiling(band) {
    var bm = read('x3f_bandMax', {});
    var v = (bm && bm[band]) || BAND_DEF[band] || 130;
    return Math.max(MIN_SPAN, v);
  }

  /* Which movement is this page running? Same resolution order the games use
     for the form panel: an explicit ?ex=, else the set the guided Routine is
     waiting on. Kept here so eight games do not each re-derive it. */
  function slug() {
    var s = null;
    try { s = (new URLSearchParams(location.search)).get('ex'); } catch (e) {}
    if (s) return s;
    try {
      var sess = JSON.parse(localStorage.getItem('x3f_session') || 'null');
      if (sess && sess.active && sess.pending && sess.pending.slug) return sess.pending.slug;
    } catch (e) {}
    return null;
  }

  function range(sl, band) {
    if (!sl) return { lo: 0, hi: bandCeiling(band), auto: true };
    var e = map()[id(sl, band)];
    if (e && e.hi > 0) return { lo: Math.max(0, e.lo || 0), hi: e.hi, auto: !!e.auto };
    return { lo: 0, hi: bandCeiling(band), auto: true };
  }
  function floor(sl, band) { return range(sl, band).lo; }
  function span(sl, band) { var r = range(sl, band); return Math.max(MIN_SPAN, r.hi - r.lo); }

  function save(sl, band, lo, hi) {
    if (!sl || !(hi > 0)) return false;
    lo = Math.max(0, lo || 0);
    if (hi - lo < MIN_SPAN) return false;          // a range this tight is a bad capture
    var m = map();
    m[id(sl, band)] = { lo: Math.round(lo), hi: Math.round(hi), auto: false, t: Date.now() };
    flush(m);
    return true;
  }

  /* Auto-learn, ceiling only. An explicit calibration outranks it and is never
     overwritten - otherwise one heroic set would quietly move a number you set
     on purpose.

     The peak handed in is the force the GAME saw, which is already floored by
     lo. That is only sound because a movement auto-learns while lo is still 0;
     the moment you calibrate one, auto is false and this returns early. Do not
     relax that check without also un-flooring the peak. */
  function observe(sl, band, peak) {
    if (!sl || !(peak > MIN_SPAN)) return;
    var m = map(), k = id(sl, band), e = m[k];
    if (e && !e.auto) return;
    if (e && e.hi >= peak) { e.n = (e.n || 1) + 1; flush(m); return; }
    m[k] = { lo: (e && e.lo) || 0, hi: Math.round(peak), auto: true, n: ((e && e.n) || 0) + 1, t: Date.now() };
    flush(m);
  }

  function clear(sl, band) { var m = map(); delete m[id(sl, band)]; flush(m); }

  window.X3FCal = {
    slug: slug, range: range, floor: floor, span: span,
    save: save, observe: observe, clear: clear,
    all: map, bands: BAND_DEF, minSpan: MIN_SPAN
  };
})();
