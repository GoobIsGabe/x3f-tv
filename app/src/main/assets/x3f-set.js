/* X3F SET - one way for a game to say "a set just finished".
   Before this, only Bloom and the guided Routines reported anything useful, so
   personal bests, daily challenges and achievements were blind to most of the
   suite: you could train hard in Nova or Arena and the program would not notice.

   A game calls this once when a set ends. Everything else - which movement, which
   band, whether a personal best fell, which achievements unlocked, how to show
   that - is handled here so no game has to care.

     X3FSet.report({ g:'flow', reps:22, full:15, part:7, peak:410, secs:96 });

   Fields are all optional. Report what your game actually measures:
     reps/full/part  rep counts, if the game counts reps at all
     peak            peak force this set - meaningful in every game
     tut             seconds of tension, if you track it
     ecc             average lowering-phase seconds, if you track it
     secs, score     duration and whatever the game calls a score

   The movement comes from ?ex= (Routines and Library pass it) and the band from
   the shared x3f_band, so a game launched straight from the launcher still logs
   usefully - just without a movement attached. */
(function () {
  "use strict";

  var styled = false;
  function css() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent =
      '.x3fs-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(14px);' +
      'z-index:80;display:flex;flex-direction:column;gap:2px;padding:12px 18px;border-radius:16px;' +
      'max-width:min(90vw,440px);background:rgba(8,12,22,.92);border:1px solid rgba(255,211,92,.45);' +
      "box-shadow:0 14px 40px rgba(0,0,0,.55);font-family:'Space Grotesk',system-ui,sans-serif;" +
      'opacity:0;pointer-events:none;transition:opacity .25s,transform .25s cubic-bezier(.2,.9,.25,1)}' +
      '.x3fs-toast.on{opacity:1;transform:translateX(-50%)}' +
      '.x3fs-toast b{font-size:15px;color:#ffd35c}' +
      '.x3fs-toast span{font-size:12px;color:#9fb0c8}';
    document.head.appendChild(s);
  }

  function param(name) {
    try { return (new URLSearchParams(location.search)).get(name); } catch (e) { return null; }
  }
  function band() {
    try {
      var b = JSON.parse(localStorage.getItem('x3f_band'));
      return (typeof b === 'string' && b) ? b : null;
    } catch (e) { return null; }
  }

  /* Say what actually improved, not just what happened. Needs the previous set for
     the same movement and band, which the engine can find. */
  function improvement(entry) {
    var P = window.X3FProg;
    if (!P || !entry.ex) return '';
    var prev = null;
    try { prev = P.previous(entry.ex, entry.band, entry.t); } catch (e) {}
    if (!prev) return 'first set of this movement on ' + (entry.band || 'this band');
    var bits = [];
    function delta(field, label) {
      var now = +entry[field] || 0, was = +prev[field] || 0;
      if (!now && !was) return;
      var d = now - was;
      if (d > 0) bits.push('+' + Math.round(d) + ' ' + label);
      else if (d < 0) bits.push(Math.round(d) + ' ' + label);
    }
    delta('reps', 'reps'); delta('part', 'partials'); delta('peak', 'peak');
    if (!bits.length) return 'level with last time';
    return bits.join(', ') + ' vs last time';
  }

  function toast(title, sub) {
    css();
    var el = document.querySelector('.x3fs-toast');
    if (!el) { el = document.createElement('div'); el.className = 'x3fs-toast'; document.body.appendChild(el); }
    el.innerHTML = '<b>' + title + '</b><span>' + (sub || '') + '</span>';
    el.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.classList.remove('on'); }, 3200);
  }

  /* Show unlocks the same way everywhere: the hype layer if the game has one (so it
     matches the milestone callouts), otherwise a toast. Never a dialog - a modal
     mid-workout on a TV has to be dismissed with the remote. */
  function announce(fresh, hype) {
    if (!fresh || !fresh.length) return;
    var i = 0;
    (function next() {
      if (i >= fresh.length || i >= 3) return;
      var a = fresh[i++];
      if (hype && hype.say) hype.say('🏅 ' + a.name, a.desc, a.tier >= 3);
      else toast('🏅 ' + a.name, a.desc);
      setTimeout(next, hype ? 2400 : 3400);
    })();
  }

  /* Peak force and time-under-tension are meaningful in every game, and no game
     should have to grow its own tracker for them. Hand over a force getter once
     and this samples both. Reset when a set starts. */
  var watch = { on: false, peak: 0, tut: 0, last: 0, getF: null, getR: null, timer: null };
  function sample() {
    if (!watch.getF) return;
    var f = 0, r = 0;
    try { f = +watch.getF() || 0; r = watch.getR ? (+watch.getR() || 0) : 0; } catch (e) { return; }
    var t = now(), dt = Math.min(0.5, (t - watch.last) / 1000);
    watch.last = t;
    if (f > watch.peak) watch.peak = f;
    if (r > 0 && f > r * 0.15) watch.tut += dt;
  }
  function startWatch(getForce, getRef) {
    watch.getF = getForce || null;
    watch.getR = getRef || null;
    watch.last = now();
    sample();                       // never miss a set shorter than one interval
    if (watch.timer) return;
    // "under tension" means holding a real fraction of the band, not touching it
    watch.timer = setInterval(sample, 40);
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function resetWatch() { watch.peak = 0; watch.tut = 0; watch.last = now(); }

  function report(o) {
    o = o || {};
    var P = window.X3FProg;
    var entry = {
      g: o.g || 'game',
      ex: o.ex || param('ex') || null,
      band: o.band || band() || null
    };
    ['reps', 'full', 'part', 'peak', 'secs', 'score', 'tut', 'ecc'].forEach(function (f) {
      if (o[f] != null && !isNaN(+o[f])) entry[f] = Math.round(+o[f] * 100) / 100;
    });
    // fill in whatever the watcher saw and the caller did not measure itself
    sample();                       // one last look, in case the set just ended
    if (entry.peak == null && watch.peak > 0) entry.peak = Math.round(watch.peak);
    if (entry.tut == null && watch.tut > 1) entry.tut = Math.round(watch.tut);
    resetWatch();
    if (!P) return { logged: false, entry: entry, fresh: [], improved: '' };

    var beforeBest = entry.ex ? P.pb(entry.ex, entry.band) : null;
    var improved = '';
    try { improved = improvement(Object.assign({ t: Date.now() + 1 }, entry)); } catch (e) {}

    var logged = P.logSet(entry);
    var fresh = [];
    try { fresh = P.checkAchievements(); } catch (e) {}

    // a personal best is worth saying out loud on its own
    var pbLine = '';
    if (beforeBest && entry.reps && entry.reps > beforeBest.reps && beforeBest.reps > 0) {
      pbLine = 'new best: ' + entry.reps + ' reps (was ' + beforeBest.reps + ')';
    } else if (beforeBest && entry.peak && entry.peak > beforeBest.peak && beforeBest.peak > 0) {
      pbLine = 'new peak: ' + Math.round(entry.peak) + ' (was ' + Math.round(beforeBest.peak) + ')';
    }

    if (o.announce !== false) {
      if (pbLine) toast('Personal best', pbLine);
      else if (o.quiet !== true && improved) toast('Set logged', improved);
      announce(fresh, o.hype);
    }
    return { logged: true, entry: logged, fresh: fresh, improved: improved, pb: pbLine };
  }

  window.X3FSet = { report: report, improvement: improvement, toast: toast, announce: announce,
                    watch: startWatch, reset: resetWatch,
                    seen: function () { return { peak: watch.peak, tut: watch.tut }; } };
})();
