/* X3F PROGRESS - the program brain. Local only, no account, no server.
   Everything here is derived from localStorage['x3f_history'], the same log the
   games have always written, so nothing needs a backend and nothing can conflict
   with anyone else's project.

   WHAT IT KNOWS

     program()             which week, which PHASE, what today is, which cycle
     weekReview()          the end-of-week card, on the last day of YOUR week
     streak()              consecutive days, allowing one rest day per rolling week
     pb() / pbTable()      personal bests per movement and per band
     challenge()           today's challenge - generated once, then frozen for the day
     achievements()        badges generated from templates over a stats snapshot
     bandVerdict()         the ONE band decision - x3f-graduate.js reads it too
     bandAdvice()          BOTH halves of the program's band rule, as rows
     calibrationStatus()   how long ago a movement+band was actually measured

   WHAT CHANGED IN THIS REWRITE, and why each change matters

   1. THREE PHASES, NOT TWO. The official program is Foundational (weeks 1-4,
      four workouts a week), Strength (5-8, six) and Optimization (9-12, six).
      The app had 1-4 and 5-12, which is right on volume but loses the fact that
      9-12 is its own phase with its own teaching. The numbers now come from
      X3FEX.phases so they exist in exactly one place, and each phase's
      teaches line is surfaced - a user on their second cycle is taught
      something new instead of the same three tips forever.

   2. THE PROGRAM HAS STATE, so it can end and start again. x3f_prog was read
      and never written, so startedAt was always the first ever logged day and
      week was a clamp that only ever went up: finish twelve weeks and you are
      told "Week 12" forever; log one set in 2025, come back in 2026, and your
      first real set reports Week 12 and hands out all twelve week badges
      permanently. The anchor is now written when you train, a gap as long as
      the program itself (84 days) starts a new cycle, and startCycle() is there
      for the deliberate "go again" the source recommends after week 12.

      AND THE TWELVE WEEKS REPEAT. Writing the anchor fixed where a cycle
      BEGINS; it did nothing about where one ends. week was still
      min(12, floor(elapsed/7)+1) and weekStart was derived from that clamped
      number, so from day 84 onward "this week" was a seven-day window sitting
      further in the past every morning: "4 of 4 this week" fell to zero and
      never recovered, the week-12 review stayed due forever, the 84-day grid
      quietly gave up and drew a trailing window whose rows still said Week 1
      to Week 12, and nothing in any interface could start a second cycle.
      whereIn() now derives the cycle from elapsed days, so week 13 is cycle 2
      week 1 and the current week always contains today. That roll is
      ANNOUNCED rather than silent: the twelfth week's review is marked
      cycleEnd and says what just happened, and that review is already what the
      dashboard puts on screen.

   3. THERE IS NO LEG DAY. Day membership comes from X3FEX.forDay(day, week),
      which also means the week-5 variations are not offered in week 1. The old
      code folded a made-up 'legs' bucket into both days, so the calf raise was
      a push movement and the split squat a pull one.

   4. THE BAND RULE IS TWO-SIDED, AND THERE IS NOW EXACTLY ONE OF IT. "Don't
      move up until you can perform 40 slow, controlled full range reps. If you
      can't complete 15 full range reps, reduce the resistance." Only the first
      half existed, and then it existed twice: bandAdvice() judged the last five
      SETS on a band while x3f-graduate.js judged whole SESSIONS, off a
      different answer to "which band is this movement on", with different
      trigger counts and no knowledge of each other's state. On one movement on
      one day the home screen said go lighter while the Progress page said go
      heavier. bandVerdict() is now the only place that decision is made;
      bandAdvice() is the Progress page's voice and X3FGraduate is the home
      screen's, and neither can answer differently from the other.

   5. THE THREE-TIER SET. A set is full range -> mid-range partials ->
      weak-range partials -> failure, and the source is explicit that what you
      do AFTER full-range failure is the part that counts most. Where a headline
      number is needed this file now reads full/mid/weak when the entry has them
      and falls back gracefully when it does not, because a real user's existing
      history has neither.

   6. COMPACTION NO LONGER LIES OR DELETES. Rollups now carry honest SUMS
      alongside the maxima (the totals used to be max x count, inflating every
      lifetime rep counter), never promote a Routine session summary into a
      counted set, and never drop a day that is still inside the keep window -
      they roll it up instead. Recent history disappearing was a data-loss bug,
      not an accounting one.

   7. SCORE GAMES LOG PER RUN. Splash and Nova report at the end of every run,
      so three quick attempts read as three sets. Run entries are marked when
      logged and counted once per movement per day, retroactively as well as for
      new entries, so no migration is needed and nobody's history changes shape.

   Everything is pure over the log except three deliberate writes: the program
   anchor (on logSet), today's challenge (generated once so it cannot change
   under you mid-day), and unlocked achievements.
*/
(function () {
  "use strict";

  var K_HIST = 'x3f_history', K_ACH = 'x3f_ach', K_CHAL = 'x3f_chal', K_PROG = 'x3f_prog';
  /* Band-graduation prompt state, per movement+band. Written here rather than in
     x3f-graduate.js because the decision that reads it is here - see the
     graduation record section for why that had to move. */
  var K_GRAD = 'x3f_grad';
  var BANDS = ['White', 'Light Gray', 'Dark Gray', 'Black', 'Elite Black'];

  /* Twelve weeks at five lifts, six days a week is ~360 entries, so a hard cap
     quietly ate real history after two cycles. Instead, fold anything older than
     KEEP_DAYS into one rollup per day+game+movement+band and only then trim. */
  var KEEP_DAYS = 56, ROLL_AT = 420, SOFT_CAP = 700, CAL_CAP = 120;

  /* Away for longer than the whole program is not a missed Tuesday, it is a new
     start. Anything shorter is deliberately NOT a restart: the program is
     day-count based ("you can put those workouts on whatever days you want"),
     so a fortnight off should shift the plan, not reset it. */
  var RESTART_GAP = 84;

  /* Day-at-a-time walks are bounded so a corrupt date cannot spin forever. The
     old caps were 400 and 800 days, which silently truncated a long-term user's
     real best streak and made a 90-day run in year three invisible. */
  var WALK_CAP = 20000;

  /* A calibration older than this is worth re-checking. Matches x3f-cal.js,
     which owns the number when it is on the page; this is the answer for a
     calibration event read back out of the log on a page that is not. */
  var STALE_DAYS = 42;

  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* ---------- dates: local, not UTC. A workout at 11pm belongs to that day. ---------- */
  function dayKey(t) {
    var d = t == null ? new Date() : (t instanceof Date ? t : new Date(t));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function keyMinus(key, n) {
    var p = String(key).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() - n);
    return dayKey(d);
  }
  function today() { return dayKey(); }
  function daysBetween(a, b) {
    var pa = String(a).split('-'), pb2 = String(b).split('-');
    var da = new Date(+pa[0], +pa[1] - 1, +pa[2]), db = new Date(+pb2[0], +pb2[1] - 1, +pb2[2]);
    return Math.round((db - da) / 86400000);
  }
  function isDayKey(k) { return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k); }

  /* ---------- the log ----------
     history() is on the hot path of everything, and the old memo re-parsed the
     whole log on every cache HIT (its revision key called JSON.parse to find the
     last timestamp). It now parses only when the stored string actually changes,
     and that same change bumps a version counter which every other cache keys
     on - so a write from another tab, or a game writing x3f_history directly,
     invalidates the caches instead of being invisible to them. */
  /* The "nothing read yet" sentinel is false rather than null, because null is
     what getItem returns for a key that does not exist - and a bust() that then
     compared null to null would hand back the stale parse it was asked to drop. */
  var histRaw = false, histArr = [], histVer = 0;
  function history() {
    var raw = null;
    try { raw = localStorage.getItem(K_HIST); } catch (e) { raw = null; }
    if (raw === histRaw) return histArr;
    var v = null;
    try { v = JSON.parse(raw); } catch (e) { v = null; }
    histArr = Array.isArray(v) ? v : [];
    histRaw = raw;
    histVer++;
    return histArr;
  }
  var memo = {}, memoKey = -1;
  function rev() { history(); return histVer; }
  function cached(name, fn) {
    var r = rev();
    if (r !== memoKey) { memo = {}; memoKey = r; }
    if (!(name in memo)) memo[name] = fn();
    return memo[name];
  }
  function bust() { memo = {}; memoKey = -1; histRaw = false; }

  /* Write the log, and if storage is full make room rather than losing the set.
     logSet used to return the entry whether or not it was stored, and the set
     reporter then announced "Set logged" for a set that was never written -
     silently, forever, once the quota was reached. */
  function writeHistory(h) {
    if (set(K_HIST, h)) return h;
    var tight = compact(h, { force: true, keepDays: 14, cap: 300 });
    if (set(K_HIST, tight)) return tight;
    return null;
  }

  /* What a set entry carries. These are the named fields every consumer here
     reads:

       g ex band reps full mid weak part peak secs score acc tut ecc n tracked

     and anything else the caller measured is copied through as long as it is a
     small scalar, or a flat object of numbers (which is what a fault count is).

     It used to be a fixed allow-list, and everything outside it was silently
     dropped: a number the reporter measured, announced in the set summary and
     then threw away, which looks exactly like working. The three-tier rewrite
     of the set reporter adds a dozen such fields, and it should not have to
     read the log back and patch itself in afterwards to keep them.

     t, k, b and run belong to this function, so a caller cannot forge them. */
  var OWNED = { t: 1, k: 1, b: 1, run: 1 };
  function copyable(v) {
    var ty = typeof v;
    if (ty === 'number') return isFinite(v);
    if (ty === 'boolean') return true;
    if (ty === 'string') return v.length <= 64;
    if (v && ty === 'object' && !Array.isArray(v)) {
      var keys = Object.keys(v);
      if (keys.length > 12) return false;
      for (var i = 0; i < keys.length; i++) {
        var x = v[keys[i]];
        if (typeof x !== 'number' || !isFinite(x)) return false;
      }
      return true;
    }
    return false;
  }

  /* A set finished. Games call this; everything else is derived from it.
     {ex, band, reps, full, mid, weak, part, peak, secs, tut, ecc, g} - all
     optional but the more the better. Returns the stored entry, or NULL if the
     log could not be written. */
  function logSet(o) {
    o = o || {};
    var t = (o.t != null && isFinite(+o.t)) ? +o.t : Date.now();
    var e = { t: t, k: 'set' };
    Object.keys(o).forEach(function (f) {
      if (OWNED[f] || o[f] == null || !copyable(o[f])) return;
      e[f] = o[f];
    });
    if (o.band) e.b = o.band;                 // keep the old field name too
    /* Splash, Nova, Duel and Rhythm report at the end of every RUN, so three
       quick attempts used to read as three sets. Marking them here means a
       future reader can tell a run from a set without guessing; sessions counts
       them once per movement per day either way, so existing history that
       predates the mark is fixed too. */
    if (o.run === true || (e.score != null && e.reps == null)) e.run = 1;
    var h = history().slice();
    h.push(e);
    h = compact(h);
    var stored = writeHistory(h);
    bust();
    if (!stored) return null;
    touchAnchor(dayKey(t));
    return e;
  }

  /* A calibration happened. Not a set - it never counts as training - but the
     app could not say "White band, last calibrated six weeks ago" because
     nothing recorded WHEN, and that number is the input to every force
     percentage in the app. Kept in the same log so it exports with everything
     else. Excluded from sets() and never rolled up into one. */
  function logCalibration(o) {
    o = o || {};
    var e = { t: (o.t != null && isFinite(+o.t)) ? +o.t : Date.now(), k: 'cal' };
    ['ex', 'band', 'lo', 'hi'].forEach(function (f) { if (o[f] != null) e[f] = o[f]; });
    var h = history().slice();
    h.push(e);
    h = compact(h);
    var stored = writeHistory(h);
    bust();
    return stored ? e : null;
  }

  /* ---------- compaction ----------
     Three things this had to stop doing:

       - counting a rollup's MAXIMUM reps once per underlying set. Four sets of
         20/20/20/26 became {reps:26, n:4} and every lifetime total read 104
         instead of 86, while the per-band and per-movement counters (which do
         not multiply) disagreed with it by construction. Rollups now carry
         honest sums as well as the bests.
       - promoting a Routine k:'session' summary into a counted set 56 days
         after the workout, which added a phantom set, a phantom training day
         and a phantom guided workout long after the fact.
       - deleting the OLDEST entries when nothing was old enough to roll up. A
         fortnight of Splash runs is 840 entries all inside the keep window, so
         the trim silently destroyed two whole recent training days. Recent days
         are rolled up under pressure now; only rollups are ever discarded. */
  function compact(h, opts) {
    opts = opts || {};
    if (!opts.force && h.length <= ROLL_AT) return h;
    var keepDays = opts.keepDays || KEEP_DAYS;
    var cap = opts.cap || SOFT_CAP;
    var out = rollOlderThan(h, keyMinus(today(), keepDays));
    /* Still too big means the log is dense rather than long - every entry is
       recent. Roll the recent days too, which keeps every day, every best and
       every total, and only then give up on the oldest rollups. */
    if (out.length > cap) out = rollOlderThan(out, today());
    while (out.length > cap) out.shift();
    return out;
  }

  function rollOlderThan(h, cutoff) {
    var keep = [], roll = {}, sess = {}, cals = [];
    h.forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      if (!isFinite(+e.t)) { keep.push(e); return; }        // undated: never counted, never destroyed
      var day = dayKey(e.t);
      if (e.k === 'cal') { cals.push(e); return; }
      if (day > cutoff) { keep.push(e); return; }
      if (e.k === 'session') {                              // a summary, and it stays one
        var sk = day + '|' + (e.g || '');
        var s = sess[sk];
        if (!s) { sess[sk] = { t: e.t, k: 'session', g: e.g, day: e.day, sets: +e.sets || 0, mins: +e.mins || 0, n: (+e.n || 1) }; return; }
        s.sets += (+e.sets || 0); s.mins += (+e.mins || 0); s.n += (+e.n || 1);
        return;
      }
      /* An untracked volume set never merges with a tracked one: the flag is
         what keeps it out of the personal bests, and a rollup that lost it
         would quietly turn months-old volume work into records. */
      var untracked = (e.tracked === false);
      var k = day + '|' + (e.g || '') + '|' + (e.ex || '') + '|' + (bandOf(e) || '') + (untracked ? '|u' : '');
      var r = roll[k];
      if (!r) {
        roll[k] = r = {
          t: e.t, k: 'roll', n: 0, g: e.g, ex: e.ex, band: bandOf(e), b: bandOf(e),
          reps: 0, full: 0, mid: 0, weak: 0, part: 0, peak: 0, secs: 0, tut: 0, ecc: 0,
          /* `strong` is seconds spent at or above 0.85 of the calibrated range -
             the program's "that is where you want to LIVE in the repetition" -
             and `con` is the slowest controlled concentric. Both are measured by
             x3f-set.js and both were being dropped at the eight-week fold, so a
             personal best in either simply evaporated once it aged out. Bests
             survive a rollup; that is the whole point of one. */
          strong: 0, con: 0,
          sum: { reps: 0, full: 0, mid: 0, weak: 0, part: 0 },
          burn: 0, runs: 0
        };
        /* Rate-like fields describe HOW a set was done, not how much, so they
           cannot be summed or maxed. The rollup keeps the value from the best
           set in the group, which is the one a personal best would have come
           from anyway. */
        r.pace = e.pace; r.top = e.top; r.trem = e.trem;
        r.fault = e.fault; r.faults = e.faults;
        if (untracked) r.tracked = false;
      }
      r.n += (+e.n || 1);
      var wasBest = (+e.peak || 0) > (+r.peak || 0);
      ['reps', 'full', 'mid', 'weak', 'part', 'peak', 'tut', 'ecc', 'strong', 'con'].forEach(function (f) {
        if ((+e[f] || 0) > (+r[f] || 0)) r[f] = +e[f] || 0;   // bests survive
      });
      /* Carry the descriptive fields from whichever set in the group was the
         strongest, so "how that best set felt" is not attributed to a different
         set entirely. */
      if (wasBest) {
        r.pace = e.pace; r.top = e.top; r.trem = e.trem;
        r.fault = e.fault; r.faults = e.faults;
      }
      r.secs += (+e.secs || 0);
      var s2 = e.sum;
      ['reps', 'full', 'mid', 'weak', 'part'].forEach(function (f) {
        /* A rollup written before this fix cannot know its own total. Counting
           its maximum ONCE is an undercount; counting it n times is the bug
           that unlocked rep badges early. Lean low - badges are never revoked,
           so nothing a user has already earned is lost either way. */
        r.sum[f] += (s2 && s2[f] != null) ? (+s2[f] || 0) : (+e[f] || 0);
      });
      r.burn += (e.burn != null) ? (+e.burn || 0) : ((+e.part || 0) > 0 ? (+e.n || 1) : 0);
      r.runs += (e.runs != null) ? (+e.runs || 0) : (isRun(e) ? (+e.n || 1) : 0);
    });
    /* Calibrations are tiny and each one is a dated fact about a band, so they
       are kept whole rather than merged - but not without limit. */
    cals.sort(function (a, b) { return a.t - b.t; });
    while (cals.length > CAL_CAP) cals.shift();
    var out = keep.concat(cals);
    Object.keys(roll).forEach(function (k) { out.push(roll[k]); });
    Object.keys(sess).forEach(function (k) { out.push(sess[k]); });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  /* Remove ONE entry by timestamp - the undo path. It used to filter on
     e.t !== t, so clicking the ✕ on a row deleted every entry that shared its
     millisecond, and clicking it on a rollup erased an entire day of training. */
  function removeSet(t) {
    var h = history().slice(), cut = -1;
    for (var i = h.length - 1; i >= 0; i--) { if (h[i] && h[i].t === t) { cut = i; break; } }
    if (cut < 0) return 0;
    var gone = h[cut];
    h.splice(cut, 1);
    var stored = writeHistory(h);
    /* A DELETE THAT DOES NOT REACH SYNC IS NOT A DELETE.

       Sets are pushed to the household and pulled back by content-addressed id,
       so removing one here and nowhere else means the next pull re-adds it -
       silently, on every paired device. x3f-sync.js keeps the tombstone list
       that pull() consults; it just never had anything writing to it.

       Guarded and optional, like every other cross-module call in this codebase:
       this engine runs on pages that do not load sync at all, and a household
       that has never paired has nothing to tell. */
    if (stored) {
      try { if (window.X3FSync && window.X3FSync.tombstone) window.X3FSync.tombstone(gone); }
      catch (e) {}
    }
    bust();
    return stored ? 1 : 0;
  }

  function lastSet() {
    var s = sets();
    return s.length ? s[s.length - 1] : null;
  }
  /* The set before the most recent one for this movement+band, so a summary can
     say what actually improved. */
  function previous(slug, band, skipT) {
    var s = sets().filter(function (e) {
      return e.ex === slug && (!band || bandOf(e) === band) && e.t !== skipT;
    });
    return s.length ? s[s.length - 1] : null;
  }

  /* Everything that counts as training, oldest first.

     Two entries are now refused, both of which used to poison every number
     downstream: one with no usable timestamp (it was dated TODAY on every read,
     so it kept a streak alive forever), and one dated in the future (a device
     with a wrong clock counted toward this week, personal bests and badges
     while being invisible in the grid). A future entry is only hidden, never
     deleted - it appears on its own of its own accord when that day arrives. */
  function sets() {
    return cached('sets', function () {
      var t = today();
      return history().filter(function (e) {
        if (!e || e.k === 'session' || e.k === 'cal') return false;
        if (!isFinite(+e.t)) return false;
        if (dayKey(e.t) > t) return false;
        return e.k === 'set' || e.k === 'roll' || e.reps != null || e.g;
      }).sort(function (a, b) { return a.t - b.t; });
    });
  }
  function bandOf(e) { return e.band || e.b || null; }
  function isRun(e) { return !!(e && (e.run || (e.score != null && e.reps == null))); }
  function tracked(e) { return !e || e.tracked !== false; }

  /* ---------- the three-tier set ----------
     full range -> mid-range partials -> weak-range partials -> failure. The set
     reporter records the tiers when it can measure them; a history written
     before it could has only reps and part, so every reader here degrades
     one step at a time rather than reporting zero.

     fullOf() deliberately does NOT subtract partials from a total when full is
     missing. Some loggers count only full-range reps in reps and some count
     everything, and guessing wrong in the subtracting direction would tell a
     user to drop a band they are fine on. */
  function fullOf(e) { return e.full != null ? (+e.full || 0) : (+e.reps || 0); }
  function midOf(e) { return +e.mid || 0; }
  function weakOf(e) { return +e.weak || 0; }
  function partOf(e) {
    if (e.part != null) return +e.part || 0;
    return midOf(e) + weakOf(e);      // both tiers past full-range failure
  }
  function repsOf(e) {
    if (e.reps != null) return +e.reps || 0;
    return fullOf(e) + partOf(e);
  }
  function tiers(e) {
    e = e || {};
    return { full: fullOf(e), mid: midOf(e), weak: weakOf(e), part: partOf(e), reps: repsOf(e) };
  }
  function hasNumbers(e) {
    return repsOf(e) > 0 || (+e.peak || 0) > 0 || partOf(e) > 0 || (+e.tut || 0) > 0;
  }
  /* How many logged SETS an entry represents. A rollup knows; a run is folded in
     by the caller, which tracks the once-per-day key. */
  function setsIn(e) {
    var n = +e.n || 1;
    if (e.k === 'roll') {
      var runs = +e.runs || 0;
      return Math.max(1, n - runs + (runs > 0 ? 1 : 0));
    }
    return n;
  }

  /* ---------- personal bests ---------- */
  function pb(slug, band) {
    var best = { reps: 0, full: 0, part: 0, peak: 0, t: 0 };
    sets().forEach(function (e) {
      if (slug && e.ex !== slug) return;
      if (band && bandOf(e) !== band) return;
      if (!tracked(e)) return;                 // volume sets never set a record
      var r = repsOf(e);
      if (r > best.reps) { best.reps = r; best.t = e.t; }
      if (fullOf(e) > best.full) best.full = fullOf(e);
      if ((+e.peak || 0) > best.peak) best.peak = +e.peak || 0;
      if (partOf(e) > best.part) best.part = partOf(e);
    });
    return best;
  }
  function pbTable() { return cached('pbTable', pbTableRaw); }
  function pbTableRaw() {
    var out = {}, order = [];
    sets().forEach(function (e) {
      if (!e.ex || !tracked(e)) return;
      var b = bandOf(e) || '?';
      var key = e.ex + '|' + b;
      var row = out[key];
      if (!row) {
        row = out[key] = { ex: e.ex, band: b, bandKnown: b !== '?', reps: 0, full: 0, mid: 0, weak: 0,
                           part: 0, peak: 0, tut: 0, ecc: 0, count: 0, last: 0 };
        order.push(key);
      }
      row.count += setsIn(e);
      if (repsOf(e) > row.reps) row.reps = repsOf(e);
      if (fullOf(e) > row.full) row.full = fullOf(e);
      if (midOf(e) > row.mid) row.mid = midOf(e);
      if (weakOf(e) > row.weak) row.weak = weakOf(e);
      if (partOf(e) > row.part) row.part = partOf(e);
      if ((+e.peak || 0) > row.peak) row.peak = +e.peak || 0;
      if ((+e.tut || 0) > row.tut) row.tut = +e.tut || 0;
      if ((+e.ecc || 0) > row.ecc) row.ecc = +e.ecc || 0;
      if (e.t > row.last) row.last = e.t;
    });
    /* A guided set logged from the Routine screen carries a movement and a band
       and no numbers at all, and every one of them used to appear in the
       Personal Bests table as "0 reps · – partials · – peak". A row with
       nothing in it is not a personal best; the set still counts everywhere
       that counts sets. */
    return order.map(function (k) { return out[k]; })
                .filter(function (r) { return r.reps > 0 || r.peak > 0 || r.part > 0 || r.tut > 0; });
  }

  /* ---------- days worked ----------
     {day: number of sets}. Run entries collapse to one per movement per day, so
     three quick Splash attempts are one session, not three. */
  function workoutDays() {
    return cached('workoutDays', function () {
      var d = {}, seenRun = {};
      sets().forEach(function (e) {
        var k = dayKey(e.t);
        if (isRun(e)) {
          var rk = k + '|' + (e.g || '') + '|' + (e.ex || '') + '|' + (bandOf(e) || '');
          if (seenRun[rk]) { if (!(k in d)) d[k] = 0; return; }
          seenRun[rk] = 1;
          d[k] = (d[k] || 0) + 1;
          return;
        }
        d[k] = (d[k] || 0) + setsIn(e);
      });
      return d;
    });
  }
  function dayList() {
    return cached('dayList', function () { return Object.keys(workoutDays()).sort(); });
  }

  /* ---------- streak: one rest day allowed per rolling week ----------
     Walk back a day at a time. A gap is allowed, but a SECOND gap inside the last
     seven examined days ends the run. Today does not count against you until it
     is over, so an unfinished today is a grace day, not a break. */
  function streak() {
    return cached('streak', function () {
      var days = workoutDays();
      var t = today();
      var cur = days[t] ? t : keyMinus(t, 1);
      var count = 0, gaps = 0, win = [];
      if (!days[cur] && !days[keyMinus(cur, 1)]) return { current: 0, best: bestStreak(days), restUsed: 0, today: !!days[t] };
      for (var i = 0; i < WALK_CAP; i++) {
        var has = !!days[cur];
        if (has) count++; else gaps++;
        win.push(has);
        if (win.length > 7) { if (!win.shift()) gaps--; }
        if (gaps > 1) break;                 // two rest days in a week: run is over
        cur = keyMinus(cur, 1);
        if (!has && count === 0) break;      // nothing there to begin with
      }
      return { current: count, best: Math.max(count, bestStreak(days)), restUsed: gaps, today: !!days[t] };
    });
  }
  function bestStreak(days) {
    var keys = Object.keys(days).sort();
    if (!keys.length) return 0;
    var best = 0, run = 0, gaps = 0, cursor = keys[0], last = keys[keys.length - 1], win = [];
    for (var i = 0; i < WALK_CAP && cursor <= last; i++) {
      var has = !!days[cursor];
      if (has) run++; else gaps++;
      win.push(has);
      if (win.length > 7) { if (!win.shift()) gaps--; }
      if (gaps > 1) { best = Math.max(best, run); run = 0; gaps = 0; win = []; }
      cursor = keyMinus(cursor, -1);
    }
    return Math.max(best, run);
  }

  /* ---------- the phases ----------
     X3FEX.phases is the source: three phases, their week ranges, how many
     workouts a week, the day pattern, and the principle each one teaches. The
     fallback below exists only because four game pages load this engine WITHOUT
     x3f-exercises.js; it carries the shape so week badges and weekly targets
     stay honest there, and no coaching copy, because coaching without the
     library would just be a second copy of it to drift. */
  var PHASES_FALLBACK = [
    { weeks: [1, 4], name: 'Foundational', perWeek: 4, pattern: ['push', 'pull', 'rest', 'push', 'pull', 'rest', 'rest'], teaches: '' },
    { weeks: [5, 8], name: 'Strength', perWeek: 6, pattern: ['push', 'pull', 'push', 'pull', 'push', 'pull', 'rest'], teaches: '' },
    { weeks: [9, 12], name: 'Optimization', perWeek: 6, pattern: ['push', 'pull', 'push', 'pull', 'push', 'pull', 'rest'], teaches: '' }
  ];
  function phases() {
    try { if (window.X3FEX && window.X3FEX.phases && window.X3FEX.phases.length) return window.X3FEX.phases; } catch (e) {}
    return PHASES_FALLBACK;
  }
  function phaseFor(week) {
    var list = phases();
    if (!(week > 0)) return null;
    try { if (window.X3FEX && window.X3FEX.phaseForWeek) return window.X3FEX.phaseForWeek(week); } catch (e) {}
    for (var i = 0; i < list.length; i++) {
      if (week >= list[i].weeks[0] && week <= list[i].weeks[1]) return list[i];
    }
    return list[list.length - 1];
  }
  function lastWeek() {
    var list = phases();
    return list.length ? list[list.length - 1].weeks[1] : 12;
  }

  /* ---------- program state ----------
     x3f_prog was declared, read, and never written by anything. It now holds
     the only facts the log cannot supply: when this cycle started, which cycle
     it is, and which weekly review you have already seen. */
  function progState() {
    var st = get(K_PROG, {});
    if (!st || typeof st !== 'object' || Array.isArray(st)) st = {};
    return st;
  }
  function saveProg(patch) {
    var st = progState();
    Object.keys(patch).forEach(function (k) { st[k] = patch[k]; });
    st.v = 1;
    set(K_PROG, st);
    return st;
  }
  /* The start of the run of training you are currently in: walk back from your
     most recent training day and stop at a gap longer than the program itself.
     This is what makes a set logged a year after your last one report Week 1
     instead of Week 12. */
  function derivedStart() {
    return cached('derivedStart', function () {
      var keys = dayList();
      if (!keys.length) return null;
      var start = keys[keys.length - 1];
      for (var i = keys.length - 1; i > 0; i--) {
        if (daysBetween(keys[i - 1], keys[i]) >= RESTART_GAP) break;
        start = keys[i - 1];
      }
      return start;
    });
  }
  /* Which cycle the CURRENT run began in, read out of the log. Used only when
     nothing is stored - an install that predates the anchor, or an imported
     history - so that somebody coming back after a year is on a later cycle
     rather than being told this is their first ever week.

     It counts cycles, not restarts. Counting one per gap was right when twelve
     weeks was the end of the road; now that the weeks repeat, a run that lasted
     two hundred days was two and a bit passes through the program and saying it
     was one would make the cycle number go DOWN when the user came back. */
  function derivedCycle() {
    return cached('derivedCycle', function () {
      var keys = dayList();
      if (!keys.length) return 0;
      var n = 1, runStart = keys[0];
      for (var i = 1; i < keys.length; i++) {
        if (daysBetween(keys[i - 1], keys[i]) < RESTART_GAP) continue;
        n += whereIn(runStart, keys[i - 1]).laps + 1;   // a run is worth at least one
        runStart = keys[i];
      }
      return n;
    });
  }
  /* Called when a set is logged, never on a read. Anchoring on WRITE is what
     stops the week rewinding when compaction drops the oldest day off the front
     of the log, which used to move startedAt forward and flip Push/Pull.

     It deliberately does NOT roll the cycle. The stored anchor is the day the
     current RUN of training began and it stays there for as long as that run
     lasts; which cycle of the twelve weeks you are in is arithmetic over it
     (whereIn), so the roll happens on the day it is due whether or not you
     trained that day. A cycle that only advanced when you logged a set would
     be frozen for anybody looking at the dashboard between workouts. */
  function touchAnchor(day) {
    if (!isDayKey(day)) return;
    var st = progState();
    var prevDays = dayList();
    var lastBefore = null;
    for (var i = prevDays.length - 1; i >= 0; i--) { if (prevDays[i] < day) { lastBefore = prevDays[i]; break; } }
    if (!isDayKey(st.startedAt) || daysBetween(st.startedAt, day) < 0) {
      saveProg({ startedAt: derivedStart() || day, cycle: st.cycle || derivedCycle() || 1 });
      bust();
      return;
    }
    if (lastBefore && daysBetween(lastBefore, day) >= RESTART_GAP) {
      /* Coming back from a long absence starts a cycle AFTER the ones the
         calendar already ran through, not after the one you were on when you
         stopped. Storing (st.cycle||1)+1 told a user who had rolled through
         three cycles and then vanished for a year that they were on cycle 2. */
      saveProg({ startedAt: day, cycle: cycleNumber(st, lastBefore) + 1, restartedAt: Date.now() });
      bust();
    }
  }
  /* The deliberate "go again": start the twelve weeks over from today rather
     than waiting for the current cycle to run out. Nothing in the log is
     touched. reviewSeen is cleared because it holds a date key from the cycle
     that just ended and would otherwise suppress the first review of this one. */
  function startCycle(day) {
    var st = progState();
    saveProg({
      startedAt: isDayKey(day) ? day : today(),
      cycle: cycleNumber(st, today()) + 1,
      restartedAt: Date.now(), reviewSeen: null
    });
    bust();
    return program();
  }

  /* ---------- the 12-week program ----------
     WHERE YOU ARE, from an anchor and a date, with no reference to the log. The
     program is day-count based - "you can put those workouts on whatever days
     you want" - so this is pure arithmetic, and the twelve weeks REPEAT.

     absWeek is never clamped, which is the whole fix: week 13 is cycle 2 week 1
     rather than a second helping of week 12, and weekStart is derived from the
     unclamped count so the seven days it names always contain today. The
     source's own after-12-weeks page offers three onward paths and the only one
     this app can host is "repeat the 12-Week Program with heavier bands and
     cleaner form", so that is the one it rolls into. */
  function cycleDays() { return lastWeek() * 7; }
  function whereIn(anchor, day) {
    var per = lastWeek(), len = cycleDays();
    var elapsed = Math.max(0, daysBetween(anchor, day));
    var absWeek = Math.floor(elapsed / 7) + 1;      // 1, 2, 3 ... never clamped
    var laps = Math.floor((absWeek - 1) / per);     // whole cycles completed
    var week = absWeek - laps * per;                // 1..12, always
    var cycleStart = laps ? keyMinus(anchor, -(laps * len)) : anchor;
    return {
      elapsed: elapsed, absWeek: absWeek, laps: laps, week: week,
      cycleStart: cycleStart,
      weekStart: keyMinus(cycleStart, -((week - 1) * 7))
    };
  }
  /* Which cycle a given day falls in, for a given stored state. Used by the two
     writers, which both need the answer BEFORE they change the anchor and so
     cannot ask program(). */
  function cycleNumber(st, day) {
    var anchor = isDayKey(st.startedAt) ? st.startedAt : derivedStart();
    var base = st.cycle || derivedCycle() || 1;
    if (!anchor || !isDayKey(day)) return base;
    return base + whereIn(anchor, day).laps;
  }

  function program() {
    return cached('program', function () {
      var st = progState();
      var days = workoutDays();
      var keys = dayList();
      var derived = derivedStart();
      /* The origin of the current RUN. It is not the start of the current
         cycle: after twelve weeks the cycle moves and this does not, which is
         what keeps every week boundary in the run aligned to the same weekday
         (a roll is a whole number of weeks) and lets fullWeeks() count weeks
         from before the roll. */
      var origin = isDayKey(st.startedAt) ? st.startedAt : derived;
      /* A stored anchor that the log has long since left behind (an import, or
         a manual wipe of the history) heals itself on read without writing. */
      if (origin && derived && daysBetween(origin, derived) >= RESTART_GAP) origin = derived;
      /* A RUN THAT LAPSED STOPS COUNTING. The weeks roll off the calendar,
         not off your training, so an install last used eight months ago would
         otherwise report cycle 4 week 7 - a week nobody trained, climbing on
         its own forever, which is the same lie as the frozen week 12 in the
         opposite direction. Past the restart gap the run is over: report where
         they left off, say it is dormant, and let the next logged set open a
         new cycle (touchAnchor does that). */
      var lastDay = keys.length ? keys[keys.length - 1] : null;
      var ref = today(), dormant = false;
      if (origin && lastDay && daysBetween(lastDay, ref) >= RESTART_GAP) { ref = lastDay; dormant = true; }
      // Nothing logged means the program has not started. Reporting week 1 here
      // would hand out the "Week 1" badge to someone who has never trained.
      var at = origin ? whereIn(origin, ref) : null;
      var week = at ? at.week : 0;
      var ph = phaseFor(week);
      var perWeek = ph ? ph.perWeek : 4;
      var weekStart = at ? at.weekStart : null;
      /* "This week" is YOUR week - the seven days of the program week you are
         in - not a rolling window that ends today and not a calendar Sunday.
         Three different definitions of a week used to disagree inside this one
         file, which is why the dashboard could say "4 of 4 this week" while the
         Perfect Week badge refused to move. */
      var thisWeekDone = 0;
      if (weekStart) {
        thisWeekDone = keys.filter(function (k) {
          var g = daysBetween(weekStart, k);
          return g >= 0 && g < 7;
        }).length;
      }
      var doneToday = !!days[today()];
      var nextType = nextDayType(ph, thisWeekDone, keys);
      var base = st.cycle || (origin ? (derivedCycle() || 1) : 0);
      var lastW = lastWeek();
      return {
        /* startedAt is the CURRENT cycle's day one - which is what the 84-day
           grid draws and what "week 3 of twelve" is counted from. originAt is
           where the whole run began. They are the same thing until the first
           roll, and a consumer that wants "how long have you been at this"
           wants originAt. */
        startedAt: at ? at.cycleStart : null, originAt: origin,
        active: !!origin,
        cycle: at ? base + at.laps : 0, cycleBase: base, cyclesDone: at ? base + at.laps - 1 : 0,
        week: week, weekAbsolute: at ? at.absWeek : 0, dormant: dormant,
        weekStart: weekStart, dayOfWeek: weekStart ? daysBetween(weekStart, ref) : -1,
        phase: ph ? ph.name : 'Not started', phaseIndex: ph ? phases().indexOf(ph) : -1,
        teaches: ph ? (ph.teaches || '') : '', pattern: ph ? ph.pattern : null,
        perWeek: perWeek, workouts: keys.length, thisWeek: thisWeekDone, doneToday: doneToday,
        todayType: doneToday ? 'Done' : nextType,
        nextType: nextType,
        /* `day` IS PART OF THIS FUNCTION'S CONTRACT, and dropping it broke the
           screen most people look at.

           The rework replaced it with todayType/nextType, which are capitalised
           display strings ('Push' / 'Pull' / 'Rest' / 'Done'). Everything INSIDE
           this file moved with them, and the func-test for the Progress page went
           on passing - but app.html's hero reads `p.day || 'push'` and the phone
           hub now does too, so with the key gone both fell to the fallback and
           said PUSH DAY every single day, including on a pull day and a rest day.
           A silent wrong answer on the first line of the home screen.

           So the lowercase slug stays, derived from the same nextType rather than
           computed twice: it is what callers key movements off (X3FEX.forDay
           takes 'push'), and it is the shape they have always been given. */
        day: (nextType || '').toLowerCase() || null,
        weekProgress: Math.min(1, perWeek ? thisWeekDone / perWeek : 0),
        /* You have finished the twelve weeks once you have rolled out of them,
           or on the day you complete the twelfth week's target. This used to
           read week >= 12 && thisWeek >= perWeek, which stopped being true the
           moment the cycle rolled and so was false for every user who had
           actually finished. */
        complete: !!at && (at.laps > 0 || (week >= lastW && thisWeekDone >= perWeek)),
        finalWeek: week >= lastW,
        cycleReady: week >= lastW
      };
    });
  }

  /* Which half of the body is next. Two sources, in order:

       1. What you last trained. If the movements on your most recent training
          day were push movements, the next one is pull. This is the only source
          that cannot be knocked out of step by the log being trimmed.
       2. Where you are in this phase's own pattern this week.

     It used to be the parity of the count of distinct training days in the
     WHOLE log, so a compaction dropping one 2024 day off the front turned
     Tuesday into a second push day and you trained the same half twice. */
  function nextDayType(ph, thisWeekDone, keys) {
    var last = keys.length ? dayTypeOf(keys[keys.length - 1]) : null;
    if (last === 'push') return 'Pull';
    if (last === 'pull') return 'Push';
    var pattern = (ph && ph.pattern) ? ph.pattern : ['push', 'pull'];
    var work = pattern.filter(function (d) { return d !== 'rest'; });
    if (!work.length) work = ['push', 'pull'];
    return work[thisWeekDone % work.length] === 'pull' ? 'Pull' : 'Push';
  }
  function dayTypeOf(day) {
    var push = 0, pull = 0;
    sets().forEach(function (e) {
      if (!e.ex || dayKey(e.t) !== day) return;
      var m = exOf(e.ex);
      if (!m) return;
      if (m.day === 'push') push++;
      else if (m.day === 'pull') pull++;
    });
    if (push > pull) return 'push';
    if (pull > push) return 'pull';
    return null;
  }
  function exOf(slug) {
    try {
      var m = window.X3FEX && window.X3FEX.get(slug);
      if (m) return m;
    } catch (e) {}
    return fallbackBy()[slug] || null;
  }
  function nameOf(slug) {
    var m = exOf(slug);
    return m ? m.name : slug;
  }

  /* ---------- the adherence grid ----------
     84 cells, and the labels on them are now true. The old grid was always a
     trailing 84-day window ending today while the dashboard labelled its rows
     "Week 1" to "Week 12", so a user in week 3 was shown a grid whose "Week 12"
     row was the current week. It is anchored to the cycle - which also makes
     the future flag reachable, having been permanently false before.

     The `< 84` test used to be the thing that silently reverted the whole grid
     to a mislabelled trailing window on day 84 and left it there. Now that the
     cycle rolls, the anchor is the current cycle's first day and this window
     always contains today - or, for a dormant install, the last cycle actually
     trained, which is the honest picture and is still correctly labelled. The
     trailing fallback survives only for an anchor dated in the FUTURE, where
     drawing 84 boxes that cannot contain today would be worse. */
  function grid() {
    return cached('grid', function () {
      var days = workoutDays(), out = [];
      var pr = program(), t = today();
      var len = cycleDays();
      var off = pr.startedAt ? daysBetween(pr.startedAt, t) : -1;
      var start = (pr.startedAt && off >= 0) ? pr.startedAt : keyMinus(t, len - 1);
      for (var i = 0; i < len; i++) {
        var k = keyMinus(start, -i);
        out.push({
          day: k, done: !!days[k], future: daysBetween(k, t) < 0,
          today: k === t, week: Math.floor(i / 7) + 1
        });
      }
      return out;
    });
  }

  /* ---------- deterministic per-day randomness ---------- */
  function seedFrom(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ---------- the challenge store ----------
     Migrated forward from {day: {done, at}} to {v:2, days:{}, done:N}, and
     safe to run twice. Two reasons for the shape:

       - the day now holds the generated challenge itself, because "deterministic
         for the date" was false: the seed was per-day but the candidate pool it
         indexed into moved as you trained, so finishing your push workout swapped
         the afternoon's challenge to a different movement and a different target.
       - the completed count is a stored total rather than a count of keys, which
         used to be trimmed at 200 - so completing a challenge could make the
         number of challenges you had completed go DOWN. */
  function chalState() {
    var raw = get(K_CHAL, {});
    if (raw && raw.v === 2 && raw.days && typeof raw.days === 'object') return raw;
    var days = {}, done = 0;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      Object.keys(raw).forEach(function (k) {
        if (!isDayKey(k)) return;
        var v = raw[k];
        if (!v || typeof v !== 'object') return;
        days[k] = { done: !!v.done, at: v.at || 0, spec: v.spec || null };
        if (v.done) done++;
      });
    }
    return { v: 2, days: days, done: done };
  }
  function saveChal(st) {
    var keys = Object.keys(st.days).sort();
    while (keys.length > 200) { delete st.days[keys.shift()]; }
    set(K_CHAL, st);
  }
  function challengesDone() { return +chalState().done || 0; }

  /* ---------- today's challenge ----------
     Aimed at a percentage of your own best, because a daily "beat your PB" is a
     daily failure. If there is no best yet, the challenge is to set one.

     Generated ONCE per day and then stored: a challenge that changes while you
     are working on it is not a challenge. */
  function challenge() {
    var day = today();
    var st = chalState();
    var rec = st.days[day];
    var dirty = false;
    if (!rec || !rec.spec) {
      rec = st.days[day] = { done: !!(rec && rec.done), at: (rec && rec.at) || 0, spec: makeChallenge(day) };
      dirty = true;
    }
    var c = {}, spec = rec.spec;
    Object.keys(spec).forEach(function (k) { c[k] = spec[k]; });
    c.day = day;
    c.done = !!rec.done;
    if (!c.done && satisfied(c)) {
      rec.done = true; rec.at = Date.now();
      st.done = (+st.done || 0) + 1;
      dirty = true;
      c.done = true;
    }
    if (dirty) saveChal(st);
    return c;
  }

  /* Has anything logged today already satisfied it? The movement guard used to
     read if (c.slug && e.ex && e.ex !== c.slug) return false, and that
     e.ex && meant any entry WITHOUT a movement passed - so one 30-second
     Splash run from the launcher completed "Set your first benchmark: Overhead
     Press", and an Arena max set completed a deadlift peak challenge. */
  function satisfied(c) {
    var target = +c.target || 0;
    return sets().some(function (e) {
      if (dayKey(e.t) !== c.day) return false;
      if (c.slug && e.ex !== c.slug) return false;
      if (!tracked(e)) return false;
      if (c.metric === 'sets') return hasNumbers(e);
      return metricOf(e, c.metric) >= target;
    });
  }
  function metricOf(e, metric) {
    if (metric === 'reps') return repsOf(e);
    if (metric === 'full') return fullOf(e);
    if (metric === 'part') return partOf(e);
    return +e[metric] || 0;
  }

  function makeChallenge(day) {
    var pr = program();
    var todaySlugs = dayMovements(pr.nextType, pr.week || 1);
    var r = rng(seedFrom('x3f-challenge-' + day));
    var all = pbTable().filter(function (row) { return row.reps > 0 || row.peak > 0 || row.part > 0; });
    var rows = all.filter(function (row) { return todaySlugs.indexOf(row.ex) >= 0; });
    if (!rows.length) rows = all;                      // nothing logged for today's lifts yet

    if (!rows.length) {
      var moves = movesList().filter(function (m) { return todaySlugs.indexOf(m.slug) >= 0; });
      if (!moves.length) moves = movesList();
      var seedMove = moves.length ? moves[Math.floor(r() * moves.length)] : null;
      return {
        id: 'first-' + day, kind: 'baseline',
        title: 'Set your first benchmark',
        detail: seedMove
          ? 'Run one all-out set of ' + seedMove.name + ' so the app knows where you stand.'
          : 'Run one all-out set so the app knows where you stand.',
        slug: seedMove ? seedMove.slug : null,
        /* The band you are ON, never the library's suggestion. Telling a
           beginner on White to benchmark the chest press on Dark Gray asks for
           a band they may not own and cannot lift - the same bug the Routines
           page already had fixed. */
        band: seedMove ? trainingBand(seedMove.slug) : null,
        target: 1, metric: 'sets'
      };
    }

    var row = rows[Math.floor(r() * rows.length)];
    var name = nameOf(row.ex);
    /* Only offer a challenge the row can actually support. A row admitted on
       peak alone used to produce "3 reps of Deadlift. Your best is 0." - which
       is both nonsense and trivially auto-completed by anything. */
    var kinds = [];
    /* Partials get two tickets in the draw. "All ranges are taken to fatigue
       independently" - what you do after full-range failure is the part the
       source says counts most, so it should be what the app asks for most. */
    if (row.part > 0) { kinds.push('part'); kinds.push('part'); }
    if (row.reps >= 15) kinds.push('reps');
    if (row.tut > 20) kinds.push('tut');
    if (row.peak > 0) kinds.push('peak');
    if (!kinds.length) kinds.push('sets');
    var kind = kinds[Math.floor(r() * kinds.length)];

    if (kind === 'part') {
      var pt = Math.max(3, Math.round(row.part * 0.75));
      return {
        id: 'part-' + day, kind: 'partials',
        title: 'Live in the burnout',
        detail: pt + ' partial reps past failure on ' + name + '. Your best is ' + row.part + '.',
        slug: row.ex, band: row.band, target: pt, metric: 'part'
      };
    }
    if (kind === 'reps') {
      var pct = [0.7, 0.75, 0.8, 0.85, 0.9][Math.floor(r() * 5)];
      var target = Math.max(3, Math.round(row.reps * pct));
      return {
        id: 'reps-' + day, kind: 'reps',
        title: 'Match ' + Math.round(pct * 100) + '% of your best',
        detail: target + ' reps of ' + name + ' on ' + row.band + '. Your best is ' + row.reps + '.',
        slug: row.ex, band: row.band, target: target, metric: 'reps'
      };
    }
    if (kind === 'tut') {
      var tt = Math.max(20, Math.round(row.tut * 0.8));
      return {
        id: 'tut-' + day, kind: 'tut',
        title: 'Time under tension',
        detail: tt + ' seconds of tension on ' + name + ' (' + row.band + '). Your best is ' + Math.round(row.tut) + 's.',
        slug: row.ex, band: row.band, target: tt, metric: 'tut'
      };
    }
    if (kind === 'peak') {
      var fpct = [0.8, 0.85, 0.9][Math.floor(r() * 3)];
      var ft = Math.max(10, Math.round(row.peak * fpct));
      return {
        id: 'peak-' + day, kind: 'peak',
        title: 'Hit ' + Math.round(fpct * 100) + '% of peak force',
        detail: ft + ' peak on ' + name + ' (' + row.band + '). Your best is ' + Math.round(row.peak) + '.',
        slug: row.ex, band: row.band, target: ft, metric: 'peak'
      };
    }
    return {
      id: 'set-' + day, kind: 'baseline',
      title: 'One all-out set',
      detail: 'One set of ' + name + ' on ' + row.band + ', taken to failure and past it.',
      slug: row.ex, band: row.band, target: 1, metric: 'sets'
    };
  }

  function markChallenge(day) {
    day = isDayKey(day) ? day : today();
    var st = chalState();
    var rec = st.days[day];
    if (rec && rec.done) return;                        // idempotent: never double-counts
    if (!rec) rec = st.days[day] = { spec: null };
    rec.done = true; rec.at = Date.now();
    st.done = (+st.done || 0) + 1;
    saveChal(st);
  }

  /* Which movements belong to a Push or Pull day. Routines is authoritative if
     the user has edited their days; otherwise ask the library, which knows that
     there is no leg day, that the calf raise is a pull movement done after the
     deadlift has already exhausted your grip, that the pec crossover and split
     squat do not exist until week 5, and that the upright row is a substitute
     for the overhead press rather than an extra push movement. */
  function dayMovements(type, week) {
    var key = type + ' Day';
    try {
      var cfg = get('x3f_routine2', null);
      if (cfg && cfg[key] && cfg[key].list && cfg[key].list.length) return cfg[key].list.slice();
    } catch (e) {}
    var tag = (type === 'Pull') ? 'pull' : 'push';
    var w = (week == null) ? (program().week || 1) : week;
    try {
      if (window.X3FEX && window.X3FEX.forDay) {
        return window.X3FEX.forDay(tag, w).map(function (m) { return m.slug; });
      }
    } catch (e) {}
    return movesList().filter(function (m) { return m.day === tag; })
                      .map(function (m) { return m.slug; });
  }

  /* ---------- the movement list ----------
     Badge ids are permanent and must be identical on every page, because an
     unlock is written by whichever page happened to evaluate it and is never
     revoked. Four game pages load this engine WITHOUT x3f-exercises.js, and
     with an empty list the 33 per-movement badges silently did not exist while
     "Whole Program" - a tier-4 badge for training every movement in the library
     - unlocked on the user's FIRST set, because Math.max(1, 0) is 1. This
     fallback is used only when the library is absent, and exists purely to keep
     the ids stable; keep it in step with x3f-exercises.js. */
  var MOVES_FALLBACK = [
    { slug: 'chest-press', name: 'Chest Press', day: 'push' },
    { slug: 'tricep-press', name: 'Tricep Press', day: 'push' },
    { slug: 'overhead-press', name: 'Overhead Press', day: 'push' },
    { slug: 'front-squat', name: 'Front Squat', day: 'push' },
    { slug: 'pec-crossover', name: 'Pec Crossover', day: 'push' },
    { slug: 'split-squat', name: 'Split Squat', day: 'push' },
    { slug: 'upright-row', name: 'Upright Row', day: 'push' },
    { slug: 'deadlift', name: 'Deadlift', day: 'pull' },
    { slug: 'bent-row', name: 'Bent Row', day: 'pull' },
    { slug: 'drag-curl', name: 'Bicep Curl', day: 'pull' },
    { slug: 'calf-raise', name: 'Calf Raise', day: 'pull' }
  ];
  function movesList() {
    try { if (window.X3FEX && window.X3FEX.list && window.X3FEX.list.length) return window.X3FEX.list; } catch (e) {}
    return MOVES_FALLBACK;
  }
  var fbBy = null;
  function fallbackBy() {
    if (fbBy) return fbBy;
    fbBy = {};
    MOVES_FALLBACK.forEach(function (m) { fbBy[m.slug] = m; });
    return fbBy;
  }
  function bandList() {
    try { if (window.X3FEX && window.X3FEX.bands && window.X3FEX.bands.length) return window.X3FEX.bands; } catch (e) {}
    return BANDS;
  }

  /* ---------- achievements, generated ----------
     Templates crossed with parameters, which is how ~120 badges exist without
     120 hand-written entries. Each has a test() over a stats snapshot. */
  function stats() {
    return cached('stats', function () { return statsRaw(); });
  }
  function statsRaw() {
    var s = sets();
    var totalReps = 0, totalPart = 0, totalFull = 0, totalMid = 0, totalWeak = 0;
    var byEx = {}, byBand = {}, bestPart = 0, bestReps = 0, bestFull = 0, peak = 0;
    var bestTut = 0, bestEcc = 0, burnSets = 0, sessions = 0;
    var perDay = {}, guidedDays = {}, seenRun = {};
    s.forEach(function (e) {
      var mult = (e.k === 'roll') ? (+e.n || 1) : 1;
      var sum = e.sum;
      var r = repsOf(e), p = partOf(e), f = fullOf(e);
      /* Rollups carry honest sums; a set carries itself. Never max x count. */
      var repsForTotals = (sum && sum.reps != null) ? (+sum.reps || 0) : r;
      totalReps += repsForTotals;
      totalPart += sum && sum.part != null ? (+sum.part || 0) : p;
      totalFull += sum && sum.full != null ? (+sum.full || 0) : f;
      totalMid += sum && sum.mid != null ? (+sum.mid || 0) : midOf(e);
      totalWeak += sum && sum.weak != null ? (+sum.weak || 0) : weakOf(e);
      if (tracked(e)) {
        if (r > bestReps) bestReps = r;
        if (f > bestFull) bestFull = f;
        if (p > bestPart) bestPart = p;
        if ((+e.peak || 0) > peak) peak = +e.peak || 0;
        if ((+e.tut || 0) > bestTut) bestTut = +e.tut || 0;
        if ((+e.ecc || 0) > bestEcc) bestEcc = +e.ecc || 0;
      }
      if (e.ex) byEx[e.ex] = (byEx[e.ex] || 0) + repsForTotals;
      var b = bandOf(e); if (b) byBand[b] = (byBand[b] || 0) + repsForTotals;
      burnSets += (e.burn != null) ? (+e.burn || 0) : (p > 0 ? mult : 0);
      var k = dayKey(e.t);
      if (!perDay[k]) perDay[k] = {};
      if (e.ex) perDay[k][e.ex] = 1;
      /* A guided workout is a WORKOUT. It used to count one per logged set, so
         "40 guided workouts" unlocked after eight real ones - the default push
         day is four movements. */
      if (e.g === 'routine') guidedDays[k] = 1;
      if (isRun(e)) {
        var rk = k + '|' + (e.g || '') + '|' + (e.ex || '') + '|' + (b || '');
        if (!seenRun[rk]) { seenRun[rk] = 1; sessions += 1; }
      } else {
        sessions += setsIn(e);
      }
    });
    var st = streak(), pr = program();
    var bestDayVariety = 0;
    Object.keys(perDay).forEach(function (k) {
      var n = Object.keys(perDay[k]).length;
      if (n > bestDayVariety) bestDayVariety = n;
    });
    var keys = dayList(), comeback = false;
    for (var i = 1; i < keys.length; i++) {
      if (daysBetween(keys[i - 1], keys[i]) >= 7) comeback = true;
    }
    return {
      bestTut: bestTut, bestEcc: bestEcc,
      bestDayVariety: bestDayVariety, burnSets: burnSets, fullWeeks: fullWeeks(), comeback: comeback,
      sessions: sessions,
      days: keys.length, totalReps: totalReps, totalFull: totalFull,
      totalMid: totalMid, totalWeak: totalWeak,
      totalPart: totalPart, bestReps: bestReps, bestFull: bestFull, bestPart: bestPart, peak: peak,
      byEx: byEx, byBand: byBand, streak: st.current, bestStreak: st.best,
      /* The FURTHEST week reached, not the current one. The week badges read
         this and they are called "Reach week 9 of the 12-week program" - having
         rolled into cycle 2 you have reached all twelve, and reporting week 1
         would show every one of them as no-longer-met on the achievements
         screen the week after you earned them. */
      week: pr.cycle > 1 ? lastWeek() : pr.week, cycle: pr.cycle, phase: pr.phase,
      guided: Object.keys(guidedDays).length, challenges: challengesDone(),
      bandsUsed: Object.keys(byBand).length, exUsed: Object.keys(byEx).length
    };
  }

  /* Weeks in which the phase's own target was met, counted on the program's week
     grid so that "4 of 4 this week" and the Perfect Week badge are talking about
     the same seven days. The old version filtered the whole day list once per
     week - O(weeks x days) on every stats() build, twice per dashboard repaint. */
  function fullWeeks() {
    return cached('fullWeeks', function () {
      var pr = program();
      if (!pr.weekStart) return 0;
      var keys = dayList(), n = 0, per = lastWeek();
      if (!keys.length) return 0;
      /* Offsets are measured from THIS week's first day and are allowed to go
         NEGATIVE, which is the point. Bucketing from the cycle anchor would
         have thrown away every week before the current cycle the moment the
         first roll happened - so a user's Perfect Week count, and the badges
         that read it, would drop to zero at week 13. Every roll is a whole
         number of weeks, so the seven-day boundaries are the same ones the
         earlier cycles were counted on. */
      var counts = {};
      keys.forEach(function (d) {
        var w = Math.floor(daysBetween(pr.weekStart, d) / 7);
        counts[w] = (counts[w] || 0) + 1;
      });
      Object.keys(counts).forEach(function (k) {
        var w = +k;
        /* Which week of a cycle that bucket was, so it is judged against the
           target that week actually had: four workouts in the Foundational
           phase, six after it. */
        var abs = pr.weekAbsolute + w;
        var weekNo = ((((abs - 1) % per) + per) % per) + 1;
        var ph = phaseFor(weekNo);
        if (counts[k] >= (ph ? ph.perWeek : 4)) n++;
      });
      return n;
    });
  }

  var TIER_WORDS = ['Initiate', 'Adept', 'Devotee', 'Master', 'Legend'];
  var catCache = null, catCacheHas = null;

  /* Built once per page rather than 117 objects and 117 closures per repaint -
     the dashboard called this twice per refresh, on a TV SoC. */
  function catalogue() {
    var has = !!(window.X3FEX && window.X3FEX.list && window.X3FEX.list.length);
    if (catCache && catCacheHas === has) return catCache;
    catCacheHas = has;
    catCache = buildCatalogue();
    return catCache;
  }
  function buildCatalogue() {
    var list = [];
    function add(id, name, desc, tier, test) { list.push({ id: id, name: name, desc: desc, tier: tier, test: test }); }
    var moves = movesList();
    var bands = bandList();

    // 1. lifetime reps
    [100, 500, 1000, 5000, 10000, 25000].forEach(function (n, i) {
      add('reps' + n, 'Rep Bank: ' + n.toLocaleString(), n.toLocaleString() + ' reps logged, all time', Math.min(4, i),
        function (s) { return s.totalReps >= n; });
    });
    // 2. per-movement mastery
    moves.forEach(function (m) {
      [100, 400, 1000].forEach(function (n, i) {
        add('ex-' + m.slug + '-' + n, m.name + ' ' + TIER_WORDS[i + 1], n + ' reps of ' + m.name, i + 1,
          function (s) { return (s.byEx[m.slug] || 0) >= n; });
      });
    });
    // 3. band mileage
    bands.forEach(function (b, bi) {
      [200, 1000].forEach(function (n, i) {
        add('band-' + b.replace(/ /g, '') + '-' + n, b + ' Mileage' + (i ? ' II' : ''), n + ' reps on the ' + b + ' band', bi >= 3 ? 3 : 1 + i,
          function (s) { return (s.byBand[b] || 0) >= n; });
      });
    });
    add('band-all', 'Full Spectrum', 'Log a set on every band', 3, function (s) { return s.bandsUsed >= bands.length; });
    // 4. burnout - what happens after full-range failure, which is the point
    [5, 10, 20, 35].forEach(function (n, i) {
      add('part' + n, 'Past Failure ' + (i + 1), n + ' partial reps past failure in one set', Math.min(4, i + 1),
        function (s) { return s.bestPart >= n; });
    });
    [200, 1000, 3000].forEach(function (n, i) {
      add('partsum' + n, 'Burnout Bank ' + (i + 1), n + ' partials logged, all time', i + 1,
        function (s) { return s.totalPart >= n; });
    });
    // 5. streaks
    [3, 7, 14, 30, 60, 90].forEach(function (n, i) {
      add('streak' + n, n + '-Day Streak', 'Train ' + n + ' days running (one rest day a week allowed)', Math.min(4, i),
        function (s) { return s.bestStreak >= n; });
    });
    // 6. program weeks
    for (var w = 1; w <= 12; w++) {
      (function (w) {
        add('week' + w, 'Week ' + w, 'Reach week ' + w + ' of the 12-week program', w >= 9 ? 4 : w >= 5 ? 2 : 1,
          function (s) { return s.week >= w; });
      })(w);
    }
    // 7. daily challenges
    [1, 5, 15, 40, 90].forEach(function (n, i) {
      add('chal' + n, 'Challenger ' + (i + 1), 'Complete ' + n + ' daily challenge' + (n > 1 ? 's' : ''), Math.min(4, i),
        function (s) { return s.challenges >= n; });
    });
    // 8. sessions
    [1, 10, 25, 50, 100, 200].forEach(function (n, i) {
      add('sess' + n, n === 1 ? 'First Blood' : 'Committed ' + i, n + ' set' + (n > 1 ? 's' : '') + ' logged', Math.min(4, i),
        function (s) { return s.sessions >= n; });
    });
    // 9. guided workouts
    [1, 10, 40].forEach(function (n, i) {
      add('guided' + n, 'Coached ' + (i + 1), n + ' guided workout' + (n > 1 ? 's' : ''), i + 1,
        function (s) { return s.guided >= n; });
    });
    // 10. single-set feats + breadth
    [25, 40, 60, 80].forEach(function (n, i) {
      add('set' + n, 'One Set, ' + n + ' Reps', n + ' reps in a single set', Math.min(4, i + 1),
        function (s) { return s.bestReps >= n; });
    });
    add('breadth', 'Whole Program', 'Log a set of every movement in the library', 4,
      function (s) { return moves.length >= 5 && s.exUsed >= moves.length; });
    // 11. peak force tiers - the other axis the bar measures
    [150, 250, 350, 450, 600].forEach(function (n, i) {
      add('peak' + n, 'Force: ' + n, 'Reach a peak of ' + n + ' on any lift', Math.min(4, i),
        function (s) { return s.peak >= n; });
    });
    // 12. weeks hit in full (the weekly target, whatever phase you are in)
    [1, 4, 12].forEach(function (n, i) {
      add('fullweek' + n, 'Perfect Week' + (n > 1 ? ' x' + n : ''), 'Hit the weekly workout target ' + n + ' time' + (n > 1 ? 's' : ''), i + 2,
        function (s) { return s.fullWeeks >= n; });
    });
    // 13. distinct days trained
    [7, 30, 60, 90].forEach(function (n, i) {
      add('days' + n, n + ' Days In', 'Train on ' + n + ' separate days', Math.min(4, i + 1),
        function (s) { return s.days >= n; });
    });
    // 14. a full day's programme in one sitting
    [3, 5].forEach(function (n, i) {
      add('fullday' + n, i ? 'Whole Day, No Excuses' : 'Full Session', n + ' different movements in one day', i + 2,
        function (s) { return s.bestDayVariety >= n; });
    });
    // 15. coming back after time off, which matters more than never missing
    add('comeback', 'Back At It', 'Return to training after a week or more away', 2,
      function (s) { return s.comeback; });
    // 16a. slow negatives - the technique the bar can actually measure
    [2, 3, 4].forEach(function (n, i) {
      add('ecc' + n, 'Slow Negative ' + (i + 1),
        'Average a ' + n + '.0s lowering phase across a set', i + 1,
        function (s) { return s.bestEcc >= n; });
    });
    // 16b. time under tension
    [60, 120, 240].forEach(function (n, i) {
      add('tut' + n, 'Under Tension ' + (i + 1), n + ' seconds of tension in one set', i + 1,
        function (s) { return s.bestTut >= n; });
    });
    // 16c. movements taken deep into burnout
    [10, 25].forEach(function (n, i) {
      add('exburn' + n, 'Burnout Specialist' + (i ? ' II' : ''), n + ' sets that went past failure', i + 2,
        function (s) { return s.burnSets >= n; });
    });
    return list;
  }

  function achievements() {
    var got = get(K_ACH, {}), s = stats();
    return catalogue().map(function (a) {
      var have = !!got[a.id];
      return { id: a.id, name: a.name, desc: a.desc, tier: a.tier, got: have, at: have ? got[a.id] : 0, now: a.test(s) };
    });
  }
  /* Returns newly unlocked achievements and persists them. Call after logging. */
  function checkAchievements() {
    var got = get(K_ACH, {}), s = stats(), fresh = [];
    catalogue().forEach(function (a) {
      if (!got[a.id] && a.test(s)) { got[a.id] = Date.now(); fresh.push(a); }
    });
    if (fresh.length) set(K_ACH, got);
    return fresh;
  }

  /* ---------- band progression: ONE decision, two voices ----------
     "Start Light. Progress Slowly. Begin with the lightest band. Don't move up
     until you can perform 40 slow, controlled full range reps with good form.
     If you can't complete 15 full range reps, reduce the resistance."

     Both halves, and the second one matters more, because a band that is too
     heavy is the one that hurts you.

     WHY THIS IS ONE FUNCTION NOW. There were two advisers and they disagreed
     out loud. The home screen asked x3f-graduate.js, which grouped the log into
     SESSIONS (a day is one attempt at the number), read the band from
     X3FBand.forMovement, went down on the first sub-15 session and up on the
     first 40. This file asked bandCoach() over the last five SETS, read the
     band from trainingBand(), went down only under 10 or on a second bad set,
     and up only after two sets over 40. Log twelve full reps on the day after
     two big sets and the Progress page said "Move Chest Press up to Black"
     while the dashboard said "Go lighter on the chest press" - same movement,
     same day, opposite instructions, and each one looked authoritative.

     So bandVerdict() decides and nothing else does. bandAdvice() below is the
     Progress page's voice; X3FGraduate is the home screen's, with the prompt
     copy, the sourcing labels and the accept/decline actions. They can differ
     in register. They cannot differ in answer.

     What the decision stops doing: reading the ALL-TIME best on any band the
     movement was ever trained on. A user who moved to Black a year ago was
     still being told "move Chest Press up to Light Gray" forever, from a row
     whose last set was three hundred days old. */

  /* The bands the X3 bar ships with. The Elite is a separate purchase and so is
     the Ultra Light below White - band-progression.md §11.6 - which is why
     neither is ever the target of a routine "move up to". */
  var INCLUDED_BANDS = { 'White': 1, 'Light Gray': 1, 'Dark Gray': 1, 'Black': 1 };

  /* Which bands the user told onboarding they own. Absent or empty means they
     never answered, and an unanswered question is not a "no": for a band that
     comes in the box, assume it is there. For one that has to be BOUGHT,
     silence has to mean no, or the app is putting words in their mouth about a
     hundred-dollar purchase. */
  function ownedBands() {
    var v = get('x3f_ownedBands', null);
    return (Array.isArray(v) && v.length) ? v : null;
  }
  function ownsBand(band) {
    if (!band) return false;
    var own = ownedBands();
    if (own) return own.indexOf(band) >= 0;
    return !!INCLUDED_BANDS[band];
  }
  function protocolOf() {
    try {
      var p = window.X3FEX && window.X3FEX.protocol;
      if (p && p.repsMin > 0 && p.repsMax > 0) return p;
    } catch (e) {}
    return { repsMin: 15, repsMax: 40 };
  }

  /* The band each movement was last actually trained on, for every movement at
     once. Built in one pass and memoised, because this is now on the path of
     eleven verdicts per dashboard repaint and the per-movement version walked
     the whole log eleven times. Deliberately NOT memoising the explicit choice
     with it: that can change from the band picker at any moment, and the log
     revision this cache keys on would not notice. */
  function lastTrainedBands() {
    return cached('lastTrainedBands', function () {
      var m = {};
      sets().forEach(function (e) {
        if (!e.ex || !tracked(e) || !hasNumbers(e)) return;
        var b = bandOf(e);
        if (b) m[e.ex] = b;
      });
      return m;
    });
  }
  function trainingBand(slug) {
    /* An explicit per-movement choice is a decision the user has made and it
       outranks history. Otherwise the band you last actually trained is the
       truth, and only then a recommendation. */
    try {
      if (window.X3FBand) {
        var chosen = window.X3FBand.explicit(slug);
        if (chosen) return chosen;
      }
    } catch (e) {}
    var last = lastTrainedBands()[slug] || null;
    if (last) return last;
    try { if (window.X3FBand) return window.X3FBand.forMovement(slug); } catch (e) {}
    var m = exOf(slug);
    return (m && m.band) ? m.band : null;
  }

  /* ---------- the graduation record ----------
     x3f_grad, one entry per movement+band. It lives here rather than in
     x3f-graduate.js because the decision lives here and the decision needs it:
     the Progress page does not load x3f-graduate.js, so if the grace window
     after a band change were private to that file, the home screen would say
     "landing near 15 is normal right after moving up" while the Progress page
     said "move the chest press back down" - the same two-advisers bug in a
     different costume.

     THE SIDES ARE SEPARATE, and that is a bug fix, not a refactor. There used
     to be one `declined` counter and one `offeredAt` for both directions, so
     pressing "Stay on Black" on a go-lighter prompt silenced the go-heavier
     prompt as well, and two of those declines turned the next up-prompt into
     the band-shortening suggestion. Declining to go down says nothing whatever
     about wanting to go up.

     Migration: a record written by the old flat shape has its declined and
     offeredAt read as the UP side, which is where they were consumed. The worst
     that can happen is one suppressed up-offer on an install that had declined
     a go-lighter prompt, and it clears itself the next time that movement is
     trained. */
  function gradAll() {
    var m = get(K_GRAD, {});
    return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
  }
  function gradKey(slug, band) { return slug + '|' + band; }
  function gradSide(o, legacyDeclined, legacyOffered) {
    o = (o && typeof o === 'object') ? o : {};
    return {
      declined: +o.declined || legacyDeclined || 0,
      offeredAt: +o.offeredAt || legacyOffered || 0,
      /* The timestamp of the newest session at the moment the prompt was put
         away. A prompt comes back when there is something NEW to say, and not
         before - which is what makes it dismissable at all. */
      dismissedT: +o.dismissedT || 0
    };
  }
  function gradState(slug, band) {
    var raw = gradAll()[gradKey(slug, band)] || {};
    var isNew = !!(raw.up || raw.down);
    return {
      upgradedAt: +raw.upgradedAt || 0,
      up: gradSide(raw.up, isNew ? 0 : (+raw.declined || 0), isNew ? 0 : (+raw.offeredAt || 0)),
      down: gradSide(raw.down, 0, 0)
    };
  }
  /* Merge a patch of the shape {upgradedAt, up:{...}, down:{...}} and write it
     back in the current shape, so a record touched once stops being legacy. */
  function gradNote(slug, band, patch) {
    if (!slug || !band) return null;
    var st = gradState(slug, band);
    patch = patch || {};
    if (patch.upgradedAt != null) st.upgradedAt = +patch.upgradedAt || 0;
    ['up', 'down'].forEach(function (side) {
      var p = patch[side];
      if (!p) return;
      Object.keys(p).forEach(function (k) { st[side][k] = +p[k] || 0; });
    });
    var m = gradAll();
    m[gradKey(slug, band)] = st;
    set(K_GRAD, m);
    bust();
    return st;
  }

  /* ---------- the evidence ----------
     Full-range reps only, one record per DAY, newest first. A day is one
     attempt at the number: two sets of the same movement on the same day are
     not two chances to trigger a band change, and the best of them is what the
     number was.

     A run entry - Splash, Nova, Duel, Rhythm - reports a score and no reps, and
     it used to land here as a session with `full` missing, which marked the
     whole DAY legacy. So one thirty-second Splash run on the same day as a real
     set of 42 quietly disqualified that set from ever counting toward 40. An
     entry with no rep count at all says nothing about reps and is skipped. */
  function bandSessions(slug, band) {
    if (!slug || !band) return [];
    return cached('bandSes|' + slug + '|' + band, function () {
      var byDay = {}, order = [];
      sets().forEach(function (e) {
        if (!e || e.ex !== slug || !tracked(e)) return;
        if (bandOf(e) !== band) return;
        var hasFull = (e.full != null), hasReps = (e.reps != null);
        if (!hasFull && !hasReps) return;
        var day = dayKey(e.t);
        var rec = byDay[day];
        if (!rec) { rec = byDay[day] = { day: day, full: 0, legacy: false, t: e.t }; order.push(day); }
        /* An entry written before the three-tier set existed has only `reps`,
           and that number INCLUDED the partials that come after full-range
           failure. Reading it as a full-range count would move people up a band
           one or two sessions early, every time, so the day is marked legacy
           and cannot trigger an upgrade on its own. */
        var full;
        if (hasFull) full = +e.full || 0;
        else { rec.legacy = true; full = +e.reps || 0; }
        if (full > rec.full) rec.full = full;
        if (e.t > rec.t) rec.t = e.t;      // the LATEST set of the day, for "anything new since?"
      });
      order.sort();
      var out = [];
      for (var i = order.length - 1; i >= 0; i--) out.push(byDay[order[i]]);
      return out;
    });
  }

  /* ---------- the decision ----------
     The one place either voice is allowed to get an answer from. It reports
     what the evidence says and what the user owns; it never changes anything.

     The two triggers are the printed rule. The COUNTS are the reconciliation
     documented in band-progression.md §3: four instructional sources make one
     40-rep session the trigger and four product pages say "consistently", and
     nothing quantifies "consistently", so the first qualifying session offers
     and the second confirms. Going down is unconditional in the source and
     fires on the first occurrence, because the costs are asymmetric - a band
     that is too heavy is the one that hurts you. */
  var GRACE_FLOOR = 10;
  function bandVerdict(slug, band) {
    band = band || trainingBand(slug);
    if (!slug || !band) return null;
    var P = protocolOf();
    var ses = bandSessions(slug, band);
    if (!ses.length) return null;
    var last = ses[0];
    var st = gradState(slug, band);
    var bands = bandList(), i = bands.indexOf(band);
    var qual = 0, bestQual = 0;
    ses.forEach(function (s) {
      if (s.legacy || s.full < P.repsMax) return;
      qual++;
      if (s.full > bestQual) bestQual = s.full;
    });

    var v = {
      slug: slug, name: nameOf(slug), band: band, sessions: ses, last: last,
      qualifying: qual, repsMin: P.repsMin, repsMax: P.repsMax, state: st,
      dir: null, to: null, reps: last.full, reason: null,
      firm: false, grace: false, soft: false, message: '',
      /* switchable is "the app could set this band for you". purchase is "the
         target has to be bought first". elite is the one band that is never a
         routine step whoever owns it. Nothing may be switched unless
         switchable, which is what stops the app assuming an Elite band it has
         no evidence the user has ever held. */
      switchable: false, purchase: false, elite: false
    };
    var down = (i > 0) ? bands[i - 1] : null;
    var up = (i >= 0 && i < bands.length - 1) ? bands[i + 1] : null;

    /* THE GRACE SESSION, after a deliberate move up. This is the app's own rule
       and every voice that speaks it says so. The program's own instructions
       collide here: the 40-rep trigger sends you up and the 15-rep floor sends
       you straight back down, and the first session on a heavier band is
       EXPECTED to land near 15. Without it the app produces a visible up-down
       loop, which reads as a bug and costs it credibility on everything else it
       says. Nothing official arbitrates. Ten is ours too: far enough under the
       floor that it is not the adjustment settling in. */
    if (st.upgradedAt && last.t >= st.upgradedAt && ses.length <= 1 && !last.legacy) {
      if (last.full > 0 && last.full < GRACE_FLOOR) {
        v.dir = 'down'; v.to = down; v.reason = 'revert';
        v.message = last.full + ' full reps on your first session with ' + band + '. X3’s rule is to ' +
                    'reduce the resistance if you cannot manage ' + P.repsMin + ' — it is a safety rule ' +
                    'as much as a training one.';
        return lighter(v, down);
      }
      if (last.full < P.repsMin) {
        v.grace = true; v.reason = 'grace';
        v.message = last.full + ' full reps on your first session with ' + band + '. Landing near ' +
                    P.repsMin + ' right after moving up is expected. This app suggests one more session ' +
                    'before deciding — the program itself does not say.';
        return v;
      }
    }

    if (!last.legacy && last.full > 0 && last.full < P.repsMin) {
      v.dir = 'down'; v.to = down; v.reason = 'under-min';
      v.message = 'You stopped at ' + last.full + ' full reps. X3’s rule is to reduce the resistance ' +
                  'if you cannot do ' + P.repsMin + ' slow, controlled reps — it is a safety rule as ' +
                  'much as a training one.' +
                  (down ? '' : ' This is already the lightest band in the box, so lengthen the band or ' +
                               'use a regression; X3’s only lighter band is the Ultra Light, and that ' +
                               'is a separate purchase.');
      return lighter(v, down);
    }

    if (qual < 1) return v;
    v.dir = 'up';
    v.to = up;
    v.firm = qual >= 2;
    v.reason = v.firm ? 'second-40' : 'first-40';
    v.reps = bestQual || P.repsMax;    // what was actually done, not the threshold
    /* THE ELITE BAND IS NOT A RUNG ON THIS LADDER. band-progression.md §11.6:
       "treat it as a purchase decision, not a routine progression" - the Elite
       page gates it on completing the whole 15-40 protocol with Black ACROSS
       your exercises, it is sold separately, and the page itself calls it
       extremely challenging. This app used to offer it as the ordinary next
       step at Black and set it on accept, which assumed the user owned a band
       that does not come with the bar. It is never switchable, however the
       ownership question was answered: a user who has one changes to it with
       their hands, deliberately, like every other band.

       The same applies more mildly to any band onboarding was told they do not
       have. It is still reported - being ready for it is real news - but as
       something to buy rather than something to do tonight. */
    v.elite = !!up && !INCLUDED_BANDS[up];
    v.switchable = !!up && !v.elite && ownsBand(up);
    v.purchase = !!up && !v.switchable;
    /* The calf raise is NOT exempt - no source exempts any movement, and an
       earlier version of this app invented an exemption that had to be removed.
       What the source does say about this one movement is that it is "much
       better to do it with a lighter band and higher repetitions", partly
       because the deadlift has already spent your grip. Those two statements
       genuinely pull different ways, so the trigger is identical and only the
       framing softens: staying put is presented as a legitimate choice rather
       than as being wrong. */
    v.soft = (slug === 'calf-raise');
    if (!up) {
      v.message = P.repsMax + ' full reps on the heaviest band there is. Shorten the band instead — ' +
                  'wrap it around the hook once or twice.';
    } else if (v.elite) {
      v.message = P.repsMax + ' full reps on ' + band + '. X3 sells an Elite band above it, and says ' +
                  'you should be able to complete the ' + P.repsMin + '–' + P.repsMax + ' rep protocol ' +
                  'with the black band across your exercises first. It is a separate purchase and they ' +
                  'describe it as extremely challenging. Shortening the band you have — wrapping it ' +
                  'around the hook once or twice — adds load tonight without buying anything.';
    } else if (v.soft) {
      v.message = P.repsMax + ' full reps on calf raises. You could move up to ' + up + ' — but X3 ' +
                  'prescribes this movement with a lighter band and higher repetitions, partly because ' +
                  'your grip is already spent from the deadlift. Their two statements pull different ' +
                  'ways here, so staying on ' + band + ' is a legitimate choice.';
    } else if (v.firm) {
      v.message = 'Second session at ' + P.repsMax + ' full reps. X3’s own band pages say to move up ' +
                  'once you can consistently reach ' + P.repsMax + ' full reps.';
    } else {
      v.message = P.repsMax + ' full reps. X3’s Quick Start Guide says to move to the next heavier ' +
                  'band once you can complete ' + P.repsMax + ' slow and controlled reps with good form.';
    }
    if (v.purchase && !v.elite) {
      v.message += ' You told us you do not have a ' + up + ' band, so this is a purchase rather than ' +
                   'a switch. Until then, shorten the band you have by wrapping it around the hook.';
    }
    return v;
  }

  /* Going lighter is a safety instruction, so the lighter band is offered as a
     switch whenever there is one - but never one the user has said they do not
     own, because "drop to Dark Gray" is not an instruction somebody without a
     Dark Gray band can follow. They get the two things they can do instead. */
  function lighter(v, down) {
    v.switchable = !!down && ownsBand(down);
    if (down && !v.switchable) {
      v.message += ' You told us you do not have a ' + down + ' band — lengthen the one you are on so ' +
                   'there is less tension at the bottom, or use a regression.';
    }
    return v;
  }

  /* Every movement with something to say, worst first. Safety before ambition:
     a band that is too heavy is the one that hurts you. */
  function bandVerdicts() {
    var seen = {}, out = [];
    sets().forEach(function (e) {
      if (!e.ex || seen[e.ex] || !tracked(e)) return;
      seen[e.ex] = 1;
      var v = bandVerdict(e.ex);
      if (v) out.push(v);
    });
    out.sort(function (a, b) {
      var ra = (a.dir === 'down') ? 0 : (a.dir === 'up' ? 1 : 2);
      var rb = (b.dir === 'down') ? 0 : (b.dir === 'up' ? 1 : 2);
      return ra - rb;
    });
    return out;
  }

  /* What one set on its own says, for a caller that has a rep count and no
     history - the set reporter's line, and the engine test harness. Same
     thresholds, same ladder, and it deliberately no longer forwards to
     X3FCal.bandAdvice: that is a THIRD answer to the same question (one set,
     first occurrence, either direction) and forwarding to it is how this file
     ended up disagreeing with the home screen in the first place. */
  function bandCoach(slug, band, full) {
    var P = protocolOf();
    var bands = bandList(), i = bands.indexOf(band);
    if (full >= P.repsMax) {
      var up = (i >= 0 && i < bands.length - 1) ? bands[i + 1] : null;
      if (!up) return { dir: 'up', band: null, message: full + ' full reps on the heaviest band. Shorten the band instead.' };
      /* Same gate as bandVerdict: the Elite is a purchase whoever owns one, and
         so is any band onboarding was told is not in the room. */
      if (!INCLUDED_BANDS[up] || !ownsBand(up)) {
        return { dir: 'up', band: null, purchase: up,
                 message: full + ' full reps. The next band up is ' + up + ', which you would have to buy — ' +
                          'or shorten the band you have by wrapping it around the hook.' };
      }
      return { dir: 'up', band: up, message: full + ' full reps means this band stopped being heavy. Move up to ' + up + '.' };
    }
    if (full > 0 && full < P.repsMin) {
      if (i <= 0) return { dir: 'down', band: null, message: 'Under ' + P.repsMin + ' full reps on the lightest band. Lengthen the band, or use a regression.' };
      return { dir: 'down', band: bands[i - 1], message: 'Under ' + P.repsMin + ' full reps means this band is too heavy. Drop to ' + bands[i - 1] + '.' };
    }
    return null;
  }

  /* The Progress page's voice. One row per movement that has somewhere to go,
     in the shape that page renders: it prints "Move <name> up to <to>" as the
     heading, which is the one sentence that must never be said about a band the
     user may not own - so a purchase-gated step is not a row here. It is not
     lost: the home screen's graduate prompt frames it as the purchase it is,
     with the source's own wording. */
  function bandAdvice() {
    var out = [];
    bandVerdicts().forEach(function (v) {
      if (!v.dir || !v.to || !v.switchable) return;
      /* Put away means put away, on this side of the ladder only. A prompt the
         user answered - declined, dismissed, or "do it once more first" - stays
         gone until the movement has something new to say, which is a session
         newer than the one they answered about. */
      var s = v.state[v.dir];
      if (v.last.t <= Math.max(s.dismissedT, s.offeredAt)) return;
      out.push({
        ex: v.slug, name: v.name, from: v.band, to: v.to, dir: v.dir,
        reps: v.reps, message: v.message, why: v.message,
        firm: v.firm, soft: v.soft
      });
    });
    return out;
  }

  /* ---------- calibration age ----------
     Calibrate does not report a set, by design - it measures a band's true max
     rather than training a movement. But that max is the input to every force
     percentage in the app and nothing recorded WHEN it was taken, so a White
     band measured six weeks and two bands ago silently skewed every intensity
     reading with nothing to say so. */
  function calibrations(slug, band) {
    return history().filter(function (e) {
      return e && e.k === 'cal' && (!slug || e.ex === slug) && (!band || e.band === band);
    }).sort(function (a, b) { return b.t - a.t; });
  }
  function calibrationStatus(slug, band) {
    var t = 0, source = null;
    try {
      if (window.X3FCal && window.X3FCal.age) {
        var days = window.X3FCal.age(slug, band);
        if (days !== null && days !== undefined) {
          var r = window.X3FCal.range(slug, band);
          t = r && r.t ? r.t : 0;
          source = 'cal';
          return status(days, t, source, !!(window.X3FCal.stale && window.X3FCal.stale(slug, band)));
        }
      }
    } catch (e) {}
    var log = calibrations(slug, band);
    if (!log.length) return null;
    t = log[0].t;
    var age = Math.floor((Date.now() - t) / 86400000);
    return status(age, t, 'log', age >= STALE_DAYS);
  }
  function status(days, t, source, isStale) {
    var weeks = Math.floor(days / 7);
    var phrase = days <= 0 ? 'calibrated today'
      : days === 1 ? 'calibrated yesterday'
      : weeks < 2 ? ('calibrated ' + days + ' days ago')
      : ('last calibrated ' + weeks + ' weeks ago');
    return { t: t, days: days, weeks: weeks, stale: !!isStale, phrase: phrase, source: source };
  }
  /* The movements you actually train, whose numbers are old enough to be worth
     re-measuring. Ordered oldest first so a UI can show the worst one. */
  function staleCalibrations() {
    var out = [], seen = {};
    sets().forEach(function (e) {
      if (!e.ex || !hasNumbers(e)) return;
      var band = bandOf(e);
      if (!band) return;
      var k = e.ex + '|' + band;
      if (seen[k]) return;
      seen[k] = 1;
      var st = calibrationStatus(e.ex, band);
      if (st && st.stale) out.push({ ex: e.ex, name: nameOf(e.ex), band: band, days: st.days, phrase: st.phrase });
    });
    out.sort(function (a, b) { return b.days - a.days; });
    return out;
  }

  /* ---------- the weekly review ----------
     Volume, new personal bests, adherence, one sentence - on the last day of
     YOUR week, which is the seventh day of the program week you are in, not a
     calendar Sunday. Somebody who started on a Wednesday gets their review on a
     Tuesday, which is the only version of this that is not arbitrary.

     The headline is full-range reps and what you did AFTER full-range failure,
     not the total, because the total quietly rewards stopping at a round
     number and the program is explicit that the partials are the part that
     counts most. */
  function weekReview() {
    var pr = program();
    if (!pr.active || !pr.weekStart) return null;
    var idx = daysBetween(pr.weekStart, today());
    /* The week under review is the one ending today when today is its last day,
       and otherwise the one that just finished - so a review is never missed
       just because the TV was off on the seventh evening. */
    var back = (idx >= 6) ? 0 : 1;
    var reviewStart = back ? keyMinus(pr.weekStart, 7) : pr.weekStart;
    /* Counted in ABSOLUTE weeks and then mapped back onto the twelve, because
       the week before cycle 2 week 1 is cycle 1 week 12 - not week zero. The
       old pr.week - 1 returned null for the whole first week of every new
       cycle, which is exactly when the end-of-cycle review is due. */
    var per = lastWeek();
    var abs = pr.weekAbsolute - back;
    if (abs < 1) return null;
    var weekNo = ((abs - 1) % per) + 1;
    var cycleNo = pr.cycleBase + Math.floor((abs - 1) / per);
    var cycleEnd = (weekNo === per);
    var st = progState();
    var from = reviewStart, to = keyMinus(reviewStart, -6);
    var ph = phaseFor(weekNo);
    var target = ph ? ph.perWeek : 4;

    var days = {}, full = 0, part = 0, reps = 0, setCount = 0, peak = 0, movements = {};
    var seenRun = {};
    sets().forEach(function (e) {
      var k = dayKey(e.t);
      if (k < from || k > to) return;
      days[k] = 1;
      full += fullOf(e); part += partOf(e); reps += repsOf(e);
      if ((+e.peak || 0) > peak) peak = +e.peak || 0;
      if (e.ex) movements[e.ex] = 1;
      if (isRun(e)) {
        var rk = k + '|' + (e.g || '') + '|' + (e.ex || '') + '|' + (bandOf(e) || '');
        if (!seenRun[rk]) { seenRun[rk] = 1; setCount++; }
      } else setCount += setsIn(e);
    });
    var trained = Object.keys(days).length;
    var pbs = newPBs(from, to);
    var adherence = target ? Math.min(1, trained / target) : 0;

    var sentence;
    if (!trained) {
      sentence = 'Nothing logged this week. The next one is one set away — start with the movement you like most.';
    } else if (trained >= target && pbs.length) {
      sentence = 'Every session, and ' + pbs.length + ' new personal best' + (pbs.length > 1 ? 's' : '') + '. This is exactly what week ' + weekNo + ' is supposed to look like.';
    } else if (trained >= target) {
      sentence = 'All ' + target + ' sessions. Consistency is the whole program — six days a week is a lot of Tuesdays, and you did them.';
    } else if (part > 0) {
      sentence = trained + ' of ' + target + ' sessions, and ' + Math.round(part) + ' reps past full-range failure. The part after failure is the part that counts.';
    } else {
      sentence = trained + ' of ' + target + ' sessions. Short of the target, not short of the program — pick the next one up where you left it.';
    }

    /* THE END OF A CYCLE IS A THING THAT HAPPENS TO YOU, so it is said out
       loud. Before this, week twelve ended and the app simply stopped moving:
       no milestone, no next step, and a dashboard that reported the same stale
       week forever. The three onward paths are the source's own (member site,
       "After 12 weeks"); only the third is something this app can track, so it
       is the one the cycle rolls into and the other two are named without
       being described beyond what the page says. */
    var nextSteps = null;
    if (cycleEnd) {
      nextSteps = 'X3 names three ways on from here: their Hypertrophy program, the Westside ' +
                  'Barbell X3 Training Academy (a separate membership), or run the twelve weeks ' +
                  'again with heavier bands and cleaner form.';
      sentence += (trained ? ' That closes cycle ' + cycleNo + ' — twelve weeks.'
                           : ' The twelve weeks are up all the same.') +
                  ' Cycle ' + (cycleNo + 1) +
                  (back ? ' has started' : ' starts with your next week') +
                  ': the same program, heavier bands, cleaner form.';
    }

    return {
      week: weekNo, cycle: cycleNo, phase: ph ? ph.name : '', teaches: ph ? (ph.teaches || '') : '',
      /* The last week of a cycle, and what the source says comes next. */
      cycleEnd: cycleEnd, nextSteps: nextSteps,
      /* Due until it has been acknowledged for this exact week, not only on the
         seventh evening - the TV is often off that night, and a review nobody
         ever sees is not a feature. */
      from: from, to: to, due: st.reviewSeen !== from, seen: st.reviewSeen === from,
      days: trained, target: target, adherence: adherence,
      sets: setCount, reps: reps, fullReps: full, partials: part, peak: peak,
      movements: Object.keys(movements).length, newPBs: pbs, sentence: sentence
    };
  }
  /* A personal best set inside the window is one that beat everything logged for
     that movement+band BEFORE the window opened. */
  function newPBs(from, to) {
    var before = {}, inside = {}, order = [];
    sets().forEach(function (e) {
      if (!e.ex || !tracked(e)) return;
      var band = bandOf(e) || '?', key = e.ex + '|' + band, k = dayKey(e.t);
      var bucket = (k < from) ? before : ((k <= to) ? inside : null);
      if (!bucket) return;
      if (!bucket[key]) { bucket[key] = { reps: 0, full: 0, part: 0, peak: 0 }; if (bucket === inside) order.push(key); }
      var b = bucket[key];
      if (repsOf(e) > b.reps) b.reps = repsOf(e);
      if (fullOf(e) > b.full) b.full = fullOf(e);
      if (partOf(e) > b.part) b.part = partOf(e);
      if ((+e.peak || 0) > b.peak) b.peak = +e.peak || 0;
    });
    var out = [];
    order.forEach(function (key) {
      var now = inside[key], was = before[key] || { reps: 0, full: 0, part: 0, peak: 0 };
      var bits = key.split('|'), slug = bits[0], band = bits[1];
      [['part', 'partials past failure'], ['full', 'full-range reps'], ['reps', 'reps'], ['peak', 'peak force']].forEach(function (p) {
        var f = p[0];
        if (now[f] > 0 && now[f] > was[f]) {
          out.push({ ex: slug, name: nameOf(slug), band: band, metric: f, label: p[1],
                     value: Math.round(now[f]), was: Math.round(was[f]) });
        }
      });
    });
    return out;
  }
  function markReviewSeen() {
    var r = weekReview();
    if (!r) return null;
    saveProg({ reviewSeen: r.from });
    bust();
    return r;
  }

  /* ---------- phase coaching ----------
     The source deliberately teaches a new principle per phase, so a user on
     their second cycle is taught something new instead of the same three tips
     forever. This hands the UI the line for where they actually are. */
  function coach() {
    var pr = program();
    var ph = phaseFor(pr.week);
    return {
      week: pr.week, cycle: pr.cycle, cyclesDone: pr.cyclesDone,
      phase: ph ? ph.name : 'Not started',
      teaches: ph ? (ph.teaches || '') : '',
      perWeek: pr.perWeek,
      done: pr.thisWeek, target: pr.perWeek,
      next: pr.todayType,
      /* In the last week of a cycle. Not "stuck at the end of the program" -
         which is what this used to mean, because the week never moved past
         twelve. */
      cycleReady: pr.cycleReady, complete: pr.complete
    };
  }

  window.X3FProg = {
    dayKey: dayKey, today: today, keyMinus: keyMinus, daysBetween: daysBetween,
    history: history, sets: sets, logSet: logSet, compact: compact,
    removeSet: removeSet, lastSet: lastSet, previous: previous, bust: bust,
    pb: pb, pbTable: pbTable, workoutDays: workoutDays, tiers: tiers,
    streak: streak, program: program, grid: grid, phaseFor: phaseFor, coach: coach,
    startCycle: startCycle,
    challenge: challenge, markChallenge: markChallenge, challengesDone: challengesDone,
    stats: stats, achievements: achievements, checkAchievements: checkAchievements,
    dayMovements: dayMovements,
    catalogue: catalogue, bandAdvice: bandAdvice, bandCoach: bandCoach, BANDS: BANDS,
    /* The single band decision and the record it reads. x3f-graduate.js is the
       other voice for these; nothing else should be deciding. */
    bandVerdict: bandVerdict, bandVerdicts: bandVerdicts, bandSessions: bandSessions,
    trainingBand: trainingBand, gradState: gradState, gradNote: gradNote,
    ownedBands: ownedBands, ownsBand: ownsBand, protocol: protocolOf,
    logCalibration: logCalibration, calibrations: calibrations,
    calibrationStatus: calibrationStatus, staleCalibrations: staleCalibrations,
    weekReview: weekReview, markReviewSeen: markReviewSeen,
    /* Clears badges and challenges. NEVER the training log - the button that
       calls this promises "your training log is kept". The program anchor goes
       with them because it is re-derived from the log on the next read. */
    reset: function () {
      [K_ACH, K_CHAL, K_PROG].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
      bust();
    }
  };
})();
