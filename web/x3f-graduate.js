/* X3F GRADUATE - when to change band, per movement.

   ─────────────────────────────────────────────────────────────────────────
   THE RULE, AND WHERE IT COMES FROM
   ─────────────────────────────────────────────────────────────────────────

   X3's printed instruction, identical in the Quick Start Guide, the support
   centre and the member site:

     "Begin with the lightest band. Don't move up until you can perform 40 slow,
      controlled full range reps with good form. If you can't complete 15 full
      range reps, reduce the resistance."

   Everything below is either that sentence, or clearly labelled as this app's
   own reasoning. See docs/x3-knowledge/official/band-progression.md for the
   sourcing of every claim, quote by quote.

   ─────────────────────────────────────────────────────────────────────────
   THE THING THE SOURCES DISAGREE ABOUT
   ─────────────────────────────────────────────────────────────────────────

   Four instructional sources say ONE qualifying session is the trigger. Four
   band product pages say you move up "when you can CONSISTENTLY reach 40 full
   reps". Nothing reconciles them, and no source anywhere quantifies
   "consistently".

   So this does not pick a side and pretend. It has two stages:

     first 40-rep session   -> OFFER, quoting the Quick Start Guide
     second one             -> RECOMMEND, quoting the band pages

   Two is the smallest number that satisfies both wordings without inventing a
   third standard. Requiring three would be a number nobody published. The two
   sessions need not be consecutive, because no source says consecutive.

   ─────────────────────────────────────────────────────────────────────────
   WHAT COUNTS
   ─────────────────────────────────────────────────────────────────────────

   FULL-RANGE REPS ONLY. The support centre is explicit: "40 slow and controlled
   reps with a band, NOT COUNTING PARTIAL REPS", and three band pages say "40
   FULL reps". x3f-set.js already separates full-range reps from the mid-range
   and weak-range partials that come after failure, so this reads `full` and
   never `reps`. Getting that wrong would push people up a band one or two
   sessions early, every time.

   ─────────────────────────────────────────────────────────────────────────
   WHAT THIS WILL NOT DO
   ─────────────────────────────────────────────────────────────────────────

   It will not predict how many weeks a band should last. NO SUCH FIGURE EXISTS
   in any X3 source - the 12-week program never schedules a band change, and the
   published 7-year band lifespan is a durability claim, not a pacing one. It
   will not compare you to anyone. It will not imply you are ahead or behind.

   When you ask something the program does not answer - how long should this
   take, is once enough, should I move up on calf raises - it says the program
   does not answer it. That is worth more than a confident guess.

     X3FGraduate.check(slug)          -> a prompt, or null
     X3FGraduate.accept(slug)         take the suggestion
     X3FGraduate.decline(slug)        keep the band; do not ask again this session
     X3FGraduate.status(slug)         -> {band, qualifying, lastFull, sinceISO}
     X3FGraduate.all()                -> every movement with something to say
*/
(function () {
  "use strict";

  var K = 'x3f_grad';   // {"slug|band": {q, declined, upgradedAt, offeredAt}}

  function read(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k)); return (v === null || v === undefined) ? d : v; }
    catch (e) { return d; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function P() { return window.X3FProg || null; }
  function EX() { return window.X3FEX || null; }
  function protocol() {
    var e = EX();
    return (e && e.protocol) || { repsMin: 15, repsMax: 40 };
  }
  function bands() {
    var e = EX();
    return (e && e.bands) || ['White', 'Light Gray', 'Dark Gray', 'Black', 'Elite Black'];
  }
  function bandOf(slug) {
    try { if (window.X3FBand) return window.X3FBand.forMovement(slug); } catch (e) {}
    return 'White';
  }
  function nameOf(slug) {
    try { var e = EX() && EX().get(slug); if (e) return e.name; } catch (err) {}
    return slug;
  }
  function id(slug, band) { return slug + '|' + band; }
  function state(slug, band) {
    var m = read(K, {});
    return m[id(slug, band)] || { q: 0, declined: 0, upgradedAt: 0, offeredAt: 0 };
  }
  function save(slug, band, s) {
    var m = read(K, {});
    m[id(slug, band)] = s;
    write(K, m);
  }

  /* Full-range reps only, per session, newest first. A session is a day: two
     sets of the same movement on one day is one attempt at the number, and the
     best of them is what the number was. */
  function sessions(slug, band) {
    var p = P();
    if (!p || !p.sets) return [];
    var byDay = {};
    p.sets().forEach(function (e) {
      if (!e || e.ex !== slug) return;
      if (e.tracked === false) return;              // volume sets are not attempts
      var b = (window.X3FBand && e.band) ? e.band : (e.band || e.b);
      if (b !== band) return;
      var day = p.dayKey ? p.dayKey(e.t) : String(e.t);
      /* `full` is the count of FULL-RANGE reps. Entries logged before the three
         tier model existed only have `reps`, which included the partials - so
         they are read but are deliberately NOT allowed to trigger an upgrade on
         their own (see qualifying()). */
      var full = (e.full != null) ? +e.full : null;
      var rec = byDay[day] || (byDay[day] = { day: day, full: 0, legacy: false, t: e.t });
      if (full === null) { rec.legacy = true; full = +e.reps || 0; }
      if (full > rec.full) { rec.full = full; rec.t = e.t; }
    });
    return Object.keys(byDay).sort().reverse().map(function (d) { return byDay[d]; });
  }

  /* Sessions that hit the cap. A legacy entry cannot qualify by itself because
     its rep count included partials, and the rule is explicitly full-range
     only - counting them would move people up a band early. */
  function qualifying(slug, band) {
    var cap = protocol().repsMax;
    return sessions(slug, band).filter(function (s) { return !s.legacy && s.full >= cap; });
  }

  function nextBand(band) {
    var b = bands(), i = b.indexOf(band);
    return (i >= 0 && i < b.length - 1) ? b[i + 1] : null;
  }
  function prevBand(band) {
    var b = bands(), i = b.indexOf(band);
    return (i > 0) ? b[i - 1] : null;
  }

  function days(ms) { return Math.floor((Date.now() - ms) / 86400000); }

  /* ── the decision ─────────────────────────────────────────────────────── */

  function check(slug) {
    if (!slug || !P()) return null;
    var band = bandOf(slug);
    var s = state(slug, band);
    var P_ = protocol();
    var ses = sessions(slug, band);
    if (!ses.length) return null;
    var last = ses[0];
    var ex = EX() && EX().get(slug);
    var name = nameOf(slug);

    /* ---- the grace session, after a deliberate move up ------------------
       This is the app's own rule and is labelled as such wherever it speaks.
       The program's own instructions collide here: item 5 sends you up at 40,
       item 6 sends you straight back down under 15, and the first session on a
       heavier band is EXPECTED to land near 15. Without a grace session the app
       produces a visible up-down loop, which reads as a bug and costs it
       credibility on everything else it says. Nothing official arbitrates. */
    if (s.upgradedAt && last.t >= s.upgradedAt && ses.length <= 1) {
      if (last.full < 10) {
        return {
          kind: 'revert', slug: slug, band: band, to: prevBand(band),
          confidence: 'safety',
          title: 'That band may be too heavy',
          message: last.full + ' full reps on your first session with ' + band + '. X3’s rule is ' +
                   'to reduce the resistance if you cannot manage ' + P_.repsMin + ' — it is a safety ' +
                   'rule as much as a training one. Go back to ' + prevBand(band) + '?',
          actions: [{ id: 'accept', label: 'Go back to ' + prevBand(band) },
                    { id: 'decline', label: 'Stay on ' + band }]
        };
      }
      if (last.full < P_.repsMin) {
        return {
          kind: 'grace', slug: slug, band: band, confidence: 'ours',
          title: 'That is normal after a band change',
          message: last.full + ' full reps on your first session with ' + band + '. Landing near ' +
                   P_.repsMin + ' right after moving up is expected. This app suggests giving it one ' +
                   'more session before deciding — the program itself does not say.',
          actions: [{ id: 'ok', label: 'Understood' }]
        };
      }
    }

    /* ---- down, on the first occurrence ---------------------------------
       Unconditional in the source, and its stated reason is losing control of a
       loaded bar. The costs are asymmetric, so this fires immediately rather
       than waiting for a pattern. */
    if (last.full > 0 && last.full < P_.repsMin && !last.legacy) {
      var down = prevBand(band);
      return {
        kind: 'down', slug: slug, band: band, to: down, confidence: 'safety',
        title: 'Go lighter on the ' + name.toLowerCase(),
        message: 'You stopped at ' + last.full + ' full reps. X3’s rule is to reduce the ' +
                 'resistance if you cannot do ' + P_.repsMin + ' slow, controlled reps — it is a ' +
                 'safety rule as much as a training one.' +
                 (down ? '' : ' You are already on the lightest band, so lengthen the band or use a regression instead.'),
        actions: down
          ? [{ id: 'accept', label: 'Drop to ' + down }, { id: 'decline', label: 'Stay on ' + band }]
          : [{ id: 'ok', label: 'Understood' }]
      };
    }

    /* ---- up ------------------------------------------------------------- */
    var q = qualifying(slug, band).length;
    if (q < 1) return null;
    var up = nextBand(band);

    /* The Elite band is a purchase, not a progression step, and the source
       gates it on the Black band across your exercises. */
    if (!up) {
      if (s.offeredAt) return null;
      return {
        kind: 'top', slug: slug, band: band, confidence: 'sourced',
        title: P_.repsMax + ' full reps on the heaviest band you have',
        message: 'X3 sells an Elite band above ' + band + ', and says you should be able to do at ' +
                 'least ' + P_.repsMax + ' slow controlled reps with the black band first. It is a ' +
                 'separate purchase and they describe it as extremely challenging. You can also ' +
                 'shorten your current band by wrapping it around the hook.',
        actions: [{ id: 'ok', label: 'Got it' }]
      };
    }

    /* The calf raise. NO SOURCE EXEMPTS IT - an earlier version of this app
       invented an exemption, which was wrong. But the program does say, of this
       one movement, "it's much better to do it with a lighter band and higher
       repetitions", partly because the deadlift has already spent your grip. So
       the trigger is the same and only the COPY changes: it is offered once,
       staying put is presented as legitimate, and it is never re-prompted. */
    if (slug === 'calf-raise') {
      if (s.offeredAt) return null;
      return {
        kind: 'up-soft', slug: slug, band: band, to: up, confidence: 'mixed',
        title: P_.repsMax + ' full reps on calf raises',
        message: 'You could move up to ' + up + '. But X3’s calf raise guidance is specifically ' +
                 'a lighter band and higher repetitions, partly because your grip is already spent ' +
                 'from the deadlift. Their two statements pull different ways here, so staying on ' +
                 band + ' is a legitimate choice.',
        actions: [{ id: 'accept', label: 'Move up anyway' },
                  { id: 'decline', label: 'Stay light' }]
      };
    }

    /* Declined twice means the jump feels too big. Band shortening is a real,
       documented mechanic - but X3 documents it as a FIT adjustment, not as a
       half-step of resistance, so that framing is ours and is labelled. */
    if (s.declined >= 2) {
      return {
        kind: 'shorten', slug: slug, band: band, confidence: 'mixed',
        title: 'There is a smaller step',
        message: 'X3 documents wrapping the band around the hook once or twice to take up slack. ' +
                 'That makes your current band harder without changing colour. They describe it as ' +
                 'a fit adjustment — treating it as a half-step up is this app’s suggestion, ' +
                 'not theirs.',
        actions: [{ id: 'ok', label: 'I’ll try that' }, { id: 'decline', label: 'No thanks' }]
      };
    }

    if (q >= 2) {
      return {
        kind: 'up', slug: slug, band: band, to: up, confidence: 'sourced',
        title: 'Second time at ' + P_.repsMax + ' on the ' + name.toLowerCase(),
        message: 'X3’s own band guidance says to move up once you can consistently reach ' +
                 P_.repsMax + ' full reps. Move the ' + name.toLowerCase() + ' to ' + up + '.',
        actions: [{ id: 'accept', label: 'Move up to ' + up },
                  { id: 'decline', label: 'Stay on ' + band }]
      };
    }

    /* One qualifying session: offer, and attribute. Never change it for them -
       the user changes bands with their hands, so the app is making a claim,
       not an adjustment. */
    if (s.offeredAt && last.t <= s.offeredAt) return null;
    return {
      kind: 'up-offer', slug: slug, band: band, to: up, confidence: 'sourced',
      title: P_.repsMax + ' full reps. That is the number.',
      message: 'X3’s Quick Start Guide says to move to the next heavier band once you can ' +
               'complete ' + P_.repsMax + ' slow and controlled reps with good form. Move the ' +
               name.toLowerCase() + ' up to ' + up + ' next session?',
      actions: [{ id: 'accept', label: 'Move up to ' + up },
                { id: 'later', label: 'Do it once more first' },
                { id: 'decline', label: 'Stay on ' + band }]
    };
  }

  function accept(slug) {
    var band = bandOf(slug);
    var p = check(slug);
    if (!p) return null;
    var target = p.to;
    if (!target) { note(slug, band, { offeredAt: Date.now() }); return null; }
    try { if (window.X3FBand) window.X3FBand.set(slug, target); } catch (e) {}
    var s = state(slug, target);
    s.upgradedAt = Date.now();
    s.declined = 0;
    save(slug, target, s);
    return target;
  }

  function decline(slug) {
    var band = bandOf(slug);
    var s = state(slug, band);
    s.declined = (s.declined || 0) + 1;
    s.offeredAt = Date.now();
    save(slug, band, s);
  }
  function note(slug, band, patch) {
    var s = state(slug, band);
    for (var k in patch) if (patch.hasOwnProperty(k)) s[k] = patch[k];
    save(slug, band, s);
  }
  /* "Do it once more first" is not a decline - it should ask again next time. */
  function later(slug) { note(slug, bandOf(slug), { offeredAt: Date.now() }); }

  function status(slug) {
    var band = bandOf(slug);
    var ses = sessions(slug, band);
    var q = qualifying(slug, band);
    var oldest = ses.length ? ses[ses.length - 1] : null;
    return {
      slug: slug, name: nameOf(slug), band: band,
      sessions: ses.length,
      qualifying: q.length,
      lastFull: ses.length ? ses[0].full : null,
      onBandSince: oldest ? oldest.t : null,
      onBandDays: oldest ? days(oldest.t) : null,
      needed: protocol().repsMax
    };
  }

  function all() {
    var e = EX();
    if (!e) return [];
    var out = [];
    e.list.forEach(function (x) {
      var p = check(x.slug);
      if (p) out.push(p);
    });
    /* Safety first, then the firm recommendation, then the offer. */
    var rank = { revert: 0, down: 1, up: 2, 'up-offer': 3, 'up-soft': 4, shorten: 5, grace: 6, top: 7 };
    out.sort(function (a, b) { return (rank[a.kind] || 9) - (rank[b.kind] || 9); });
    return out;
  }

  window.X3FGraduate = {
    check: check, accept: accept, decline: decline, later: later,
    status: status, all: all, sessions: sessions, qualifying: qualifying
  };
})();
