/* X3F PROGRESS - the program brain. Local only, no account, no server.
   Everything here is derived from localStorage['x3f_history'], the same log the
   games have always written, so nothing needs a backend and nothing can conflict
   with anyone else's project.

   What it knows:
     program()     which week you are in, which phase, and whether today is Push,
                   Pull or rest - derived from what you have DONE, not from a rigid
                   calendar, so a missed Tuesday does not desync the plan
     streak()      consecutive days, allowing one rest day per rolling week
     pb()          personal bests per movement and band
     challenge()   today's challenge: deterministic for the date, aimed at a
                   PERCENTAGE of your best so it is a "match this", not a "beat
                   this" - you cannot PR every day and should not be asked to
     achievements()a generated set (10 templates x parameters ~ 130 badges) rather
                   than a hand-written list
     bandAdvice()  when your reps say it is time to move up a band

   Everything is pure over the log except markers it writes for challenges and
   unlocked achievements.
*/
(function () {
  "use strict";

  var K_HIST = 'x3f_history', K_ACH = 'x3f_ach', K_CHAL = 'x3f_chal', K_PROG = 'x3f_prog';
  var BANDS = ['White', 'Light Gray', 'Dark Gray', 'Black', 'Elite Black'];

  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* ---------- dates: local, not UTC. A workout at 11pm belongs to that day. ---------- */
  function dayKey(t) {
    var d = t == null ? new Date() : (t instanceof Date ? t : new Date(t));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function keyMinus(key, n) {
    var p = key.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() - n);
    return dayKey(d);
  }
  function today() { return dayKey(); }

  /* ---------- the log ---------- */
  function history() {
    var h = get(K_HIST, []);
    return Array.isArray(h) ? h : [];
  }
  /* A set finished. Games call this; everything else is derived from it.
     {ex, band, reps, full, part, peak, secs, g} - all optional but the more the
     better. */
  function logSet(o) {
    o = o || {};
    var h = history();
    var e = { t: o.t || Date.now(), k: 'set' };
    ['g', 'ex', 'band', 'reps', 'full', 'part', 'peak', 'secs', 'score', 'acc'].forEach(function (f) {
      if (o[f] != null) e[f] = o[f];
    });
    if (o.band) e.b = o.band;                 // keep the old field name too
    h.push(e);
    while (h.length > 600) h.shift();
    set(K_HIST, h);
    return e;
  }
  function sets() {
    return history().filter(function (e) { return e && (e.k === 'set' || e.reps != null || e.g); });
  }
  function bandOf(e) { return e.band || e.b || null; }

  /* ---------- personal bests ---------- */
  function pb(slug, band) {
    var best = { reps: 0, peak: 0, part: 0, t: 0 };
    sets().forEach(function (e) {
      if (slug && e.ex !== slug) return;
      if (band && bandOf(e) !== band) return;
      if ((+e.reps || 0) > best.reps) { best.reps = +e.reps || 0; best.t = e.t; }
      if ((+e.peak || 0) > best.peak) best.peak = +e.peak || 0;
      if ((+e.part || 0) > best.part) best.part = +e.part || 0;
    });
    return best;
  }
  function pbTable() {
    var out = {};
    sets().forEach(function (e) {
      if (!e.ex) return;
      var b = bandOf(e) || '?';
      var key = e.ex + '|' + b;
      var r = +e.reps || 0, p = +e.peak || 0, pa = +e.part || 0;
      if (!out[key]) out[key] = { ex: e.ex, band: b, reps: 0, peak: 0, part: 0, count: 0, last: 0 };
      var row = out[key];
      row.count++;
      if (r > row.reps) row.reps = r;
      if (p > row.peak) row.peak = p;
      if (pa > row.part) row.part = pa;
      if (e.t > row.last) row.last = e.t;
    });
    return Object.keys(out).map(function (k) { return out[k]; });
  }

  /* ---------- days worked ---------- */
  function workoutDays() {
    var d = {};
    sets().forEach(function (e) { d[dayKey(e.t)] = (d[dayKey(e.t)] || 0) + 1; });
    return d;
  }

  /* ---------- streak: one rest day allowed per rolling week ----------
     Walk back a day at a time. A gap is allowed, but a SECOND gap inside the last
     seven examined days ends the run. Today does not count against you until it
     is over, so an unfinished today is a grace day, not a break. */
  function streak() {
    var days = workoutDays();
    var t = today();
    var cur = days[t] ? t : keyMinus(t, 1);
    var count = 0, gaps = 0, win = [], best = 0;
    if (!days[cur] && !days[keyMinus(cur, 1)]) return { current: 0, best: bestStreak(days), restUsed: 0, today: !!days[t] };
    for (var i = 0; i < 400; i++) {
      var has = !!days[cur];
      if (has) count++; else gaps++;
      win.push(has);
      if (win.length > 7) { if (!win.shift()) gaps--; }
      if (gaps > 1) break;                 // two rest days in a week: run is over
      cur = keyMinus(cur, 1);
      if (!has && count === 0) break;      // nothing there to begin with
    }
    return { current: count, best: Math.max(count, bestStreak(days)), restUsed: gaps, today: !!days[t] };
  }
  function bestStreak(days) {
    var keys = Object.keys(days).sort();
    if (!keys.length) return 0;
    var best = 0, run = 0, gaps = 0, cursor = keys[0], last = keys[keys.length - 1], win = [];
    for (var i = 0; i < 800 && cursor <= last; i++) {
      var has = !!days[cursor];
      if (has) run++; else gaps++;
      win.push(has);
      if (win.length > 7) { if (!win.shift()) gaps--; }
      if (gaps > 1) { best = Math.max(best, run); run = 0; gaps = 0; win = []; }
      cursor = keyMinus(cursor, -1);
    }
    return Math.max(best, run);
  }

  /* ---------- the 12-week program ----------
     X3 as published: weeks 1-4 are four workouts a week, weeks 5-12 are six, and
     Push and Pull alternate. Deriving the NEXT day from the count of completed
     workouts (rather than from the calendar) means missing a day shifts the plan
     instead of breaking it. */
  function program() {
    var st = get(K_PROG, {});
    var days = workoutDays();
    var keys = Object.keys(days).sort();
    var started = st.startedAt || (keys.length ? keys[0] : null);
    var doneCount = keys.length;
    // Nothing logged means the program has not started. Reporting week 1 here
    // would hand out the "Week 1" badge to someone who has never trained.
    var week = 0;
    if (started) {
      var diff = Math.floor(daysBetween(started, today()) / 7);
      week = Math.min(12, Math.max(1, diff + 1));
    }
    var phase = week === 0 ? 'Not started' : (week <= 4 ? 'Foundation' : 'Growth');
    var perWeek = week <= 4 ? 4 : 6;   // published X3: 4x/week for a month, then 6x
    // alternate by how many workouts you have logged in total
    var nextType = (doneCount % 2 === 0) ? 'Push' : 'Pull';
    var thisWeekDone = keys.filter(function (k) { return daysBetween(k, today()) < 7; }).length;
    var doneToday = !!days[today()];
    return {
      startedAt: started, active: !!started, week: week, phase: phase, perWeek: perWeek,
      workouts: doneCount, thisWeek: thisWeekDone, doneToday: doneToday,
      todayType: doneToday ? 'Done' : nextType,
      nextType: nextType,
      weekProgress: Math.min(1, thisWeekDone / perWeek),
      complete: week >= 12 && thisWeekDone >= perWeek
    };
  }
  function daysBetween(a, b) {
    var pa = a.split('-'), pb2 = b.split('-');
    var da = new Date(+pa[0], +pa[1] - 1, +pa[2]), db = new Date(+pb2[0], +pb2[1] - 1, +pb2[2]);
    return Math.round((db - da) / 86400000);
  }
  /* 12 weeks x 7 days for the adherence grid, oldest first */
  function grid() {
    var days = workoutDays(), out = [];
    var start = keyMinus(today(), 83);
    for (var i = 0; i < 84; i++) {
      var k = keyMinus(start, -i);
      out.push({ day: k, done: !!days[k], future: daysBetween(k, today()) < 0 });
    }
    return out;
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

  /* ---------- today's challenge ----------
     Aimed at a percentage of your own best, because a daily "beat your PB" is a
     daily failure. If there is no best yet, the challenge is to set one. */
  function challenge() {
    var day = today();
    var st = get(K_CHAL, {});
    var moves = (window.X3FEX ? window.X3FEX.list : []).map(function (e) { return e; });
    var rows = pbTable().filter(function (r) { return r.reps > 0; });
    var r = rng(seedFrom('x3f-challenge-' + day));
    var c;

    if (!rows.length) {
      var seedMove = moves.length ? moves[Math.floor(r() * moves.length)] : null;
      c = {
        id: 'first-' + day,
        kind: 'baseline',
        title: 'Set your first benchmark',
        detail: seedMove
          ? 'Run one all-out set of ' + seedMove.name + ' so the app knows where you stand.'
          : 'Run one all-out set so the app knows where you stand.',
        slug: seedMove ? seedMove.slug : null,
        band: seedMove ? seedMove.band : null,
        target: 1, metric: 'sets'
      };
    } else {
      var row = rows[Math.floor(r() * rows.length)];
      var name = (window.X3FEX && window.X3FEX.get(row.ex)) ? window.X3FEX.get(row.ex).name : row.ex;
      var roll = r();
      if (roll < 0.55) {
        var pct = [0.7, 0.75, 0.8, 0.85, 0.9][Math.floor(r() * 5)];
        var target = Math.max(3, Math.round(row.reps * pct));
        c = {
          id: 'reps-' + day, kind: 'reps',
          title: 'Match ' + Math.round(pct * 100) + '% of your best',
          detail: target + ' reps of ' + name + ' on ' + row.band + '. Your best is ' + row.reps + '.',
          slug: row.ex, band: row.band, target: target, metric: 'reps'
        };
      } else if (roll < 0.8 && row.part > 0) {
        var pt = Math.max(3, Math.round(row.part * 0.75));
        c = {
          id: 'part-' + day, kind: 'partials',
          title: 'Live in the burnout',
          detail: pt + ' partial reps past failure on ' + name + '. Your best is ' + row.part + '.',
          slug: row.ex, band: row.band, target: pt, metric: 'part'
        };
      } else {
        var fpct = [0.8, 0.85, 0.9][Math.floor(r() * 3)];
        var ft = Math.max(10, Math.round(row.peak * fpct));
        c = {
          id: 'peak-' + day, kind: 'peak',
          title: 'Hit ' + Math.round(fpct * 100) + '% of peak force',
          detail: ft + ' peak on ' + name + ' (' + row.band + '). Your best is ' + Math.round(row.peak) + '.',
          slug: row.ex, band: row.band, target: ft, metric: 'peak'
        };
      }
    }
    c.day = day;
    c.done = !!(st[day] && st[day].done);
    // has anything logged today already satisfied it?
    if (!c.done) {
      var hit = sets().some(function (e) {
        if (dayKey(e.t) !== day) return false;
        if (c.slug && e.ex && e.ex !== c.slug) return false;
        if (c.metric === 'sets') return true;
        return (+e[c.metric === 'reps' ? 'reps' : c.metric] || 0) >= c.target;
      });
      if (hit) { markChallenge(); c.done = true; }
    }
    return c;
  }
  function markChallenge() {
    var st = get(K_CHAL, {});
    st[today()] = { done: true, at: Date.now() };
    var keys = Object.keys(st).sort();
    while (keys.length > 200) { delete st[keys.shift()]; }
    set(K_CHAL, st);
  }
  function challengesDone() { return Object.keys(get(K_CHAL, {})).length; }

  /* ---------- achievements, generated ----------
     Ten templates crossed with parameters, which is how ~130 badges exist without
     130 hand-written entries. Each has a test() over a stats snapshot. */
  function stats() {
    var s = sets(), days = workoutDays();
    var totalReps = 0, totalPart = 0, byEx = {}, byBand = {}, bestPart = 0, bestReps = 0, peak = 0, guided = 0;
    s.forEach(function (e) {
      var r = +e.reps || 0, p = +e.part || 0;
      totalReps += r; totalPart += p;
      if (r > bestReps) bestReps = r;
      if (p > bestPart) bestPart = p;
      if ((+e.peak || 0) > peak) peak = +e.peak || 0;
      if (e.ex) byEx[e.ex] = (byEx[e.ex] || 0) + r;
      var b = bandOf(e); if (b) byBand[b] = (byBand[b] || 0) + r;
      if (e.g === 'routine') guided++;
    });
    var st = streak(), pr = program();
    // variety within a day, sets that reached burnout, weeks where the target was
    // met, and whether there was ever a gap of a week you came back from
    var perDay = {}, burnSets = 0;
    s.forEach(function (e) {
      var k = dayKey(e.t);
      if (!perDay[k]) perDay[k] = {};
      if (e.ex) perDay[k][e.ex] = 1;
      if ((+e.part || 0) > 0) burnSets++;
    });
    var bestDayVariety = 0;
    Object.keys(perDay).forEach(function (k) {
      var n = Object.keys(perDay[k]).length;
      if (n > bestDayVariety) bestDayVariety = n;
    });
    var dayList = Object.keys(days).sort(), fullWeeks = 0, comeback = false;
    for (var i = 0; i < dayList.length; i++) {
      if (i && daysBetween(dayList[i - 1], dayList[i]) >= 7) comeback = true;
    }
    if (dayList.length) {
      var first = dayList[0], last = dayList[dayList.length - 1];
      for (var off = 0; off <= daysBetween(first, last); off += 7) {
        var wkStart = keyMinus(first, -off);
        var inWeek = dayList.filter(function (d) {
          var g = daysBetween(wkStart, d); return g >= 0 && g < 7;
        }).length;
        var wkNum = Math.floor(off / 7) + 1;
        if (inWeek >= (wkNum <= 4 ? 4 : 6)) fullWeeks++;
      }
    }
    return {
      bestDayVariety: bestDayVariety, burnSets: burnSets, fullWeeks: fullWeeks, comeback: comeback,
      sessions: s.length, days: Object.keys(days).length, totalReps: totalReps,
      totalPart: totalPart, bestReps: bestReps, bestPart: bestPart, peak: peak,
      byEx: byEx, byBand: byBand, streak: st.current, bestStreak: st.best,
      week: pr.week, guided: guided, challenges: challengesDone(),
      bandsUsed: Object.keys(byBand).length, exUsed: Object.keys(byEx).length
    };
  }

  var TIER_WORDS = ['Initiate', 'Adept', 'Devotee', 'Master', 'Legend'];

  function catalogue() {
    var list = [];
    function add(id, name, desc, tier, test) { list.push({ id: id, name: name, desc: desc, tier: tier, test: test }); }
    var moves = window.X3FEX ? window.X3FEX.list : [];

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
    BANDS.forEach(function (b, bi) {
      [200, 1000].forEach(function (n, i) {
        add('band-' + b.replace(/ /g, '') + '-' + n, b + ' Mileage' + (i ? ' II' : ''), n + ' reps on the ' + b + ' band', bi >= 3 ? 3 : 1 + i,
          function (s) { return (s.byBand[b] || 0) >= n; });
      });
    });
    add('band-all', 'Full Spectrum', 'Log a set on every band', 3, function (s) { return s.bandsUsed >= BANDS.length; });
    // 4. burnout / the part that matters
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
      add('sess' + n, n === 1 ? 'First Blood' : 'Committed ' + i, n + ' sets logged', Math.min(4, i),
        function (s) { return s.sessions >= n; });
    });
    // 9. guided sessions
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
      function (s) { return s.exUsed >= Math.max(1, moves.length); });
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
    // 16. movements taken deep into burnout
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

  /* ---------- band progression ----------
     The program's progression rule is "move up a band", and the log can advise it:
     lots of full-range reps on a band means it has become too easy. */
  function bandAdvice() {
    var out = [];
    pbTable().forEach(function (row) {
      var i = BANDS.indexOf(row.band);
      if (i < 0 || i >= BANDS.length - 1) return;
      if (row.reps >= 40 && row.count >= 2) {
        var name = (window.X3FEX && window.X3FEX.get(row.ex)) ? window.X3FEX.get(row.ex).name : row.ex;
        out.push({
          ex: row.ex, name: name, from: row.band, to: BANDS[i + 1], reps: row.reps,
          why: row.reps + ' full reps on ' + row.band + ' means it is no longer heavy in your strong range.'
        });
      }
    });
    return out;
  }

  window.X3FProg = {
    dayKey: dayKey, today: today, keyMinus: keyMinus, daysBetween: daysBetween,
    history: history, sets: sets, logSet: logSet,
    pb: pb, pbTable: pbTable, workoutDays: workoutDays,
    streak: streak, program: program, grid: grid,
    challenge: challenge, markChallenge: markChallenge, challengesDone: challengesDone,
    stats: stats, achievements: achievements, checkAchievements: checkAchievements,
    catalogue: catalogue, bandAdvice: bandAdvice, BANDS: BANDS,
    reset: function () { [K_ACH, K_CHAL, K_PROG].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} }); }
  };
})();
