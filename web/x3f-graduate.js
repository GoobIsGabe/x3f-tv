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
   THIS FILE NO LONGER DECIDES ANYTHING
   ─────────────────────────────────────────────────────────────────────────

   It used to, and so did x3f-progress.js, and they disagreed. This file read
   whole SESSIONS off the log, took the band from X3FBand.forMovement, went down
   on the first sub-15 session and up on the first 40. X3FProg.bandAdvice() read
   the last five SETS, took the band from what you had last actually trained,
   went down only under 10 reps or on a second bad set, and up only after two
   sets over 40. Neither could see the other's state. On one movement on one day
   the home screen said "go lighter on the chest press" while the Progress page
   said "move Chest Press up to Black", and both looked authoritative.

   X3FProg.bandVerdict(slug) is now the only place that decision is made. This
   file is the home screen's VOICE: prompt copy, the confidence label the copy
   has to carry, the actions, and the record of what you answered. It cannot
   reach a different conclusion from the Progress page because it does not reach
   a conclusion at all.

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
   THE ELITE BAND IS NOT A STEP
   ─────────────────────────────────────────────────────────────────────────

   It used to be offered as the ordinary next rung above Black, and accepting
   applied it - which silently assumed the user owns a band that does not come
   with the bar. band-progression.md §11.6 is explicit: the Elite page gates it
   on completing the 15-40 protocol with the black band ACROSS your exercises,
   it is a separate purchase, and the page itself calls it extremely
   challenging. So it is framed as a purchase and never switched to, however the
   ownership question was answered. Same for any band onboarding was told is not
   in the room: being ready for it is real news, but it is news about a purchase.

   ─────────────────────────────────────────────────────────────────────────
   PROMPTS CAN BE PUT AWAY, AND EACH ONE HAS ITS OWN MEMORY
   ─────────────────────────────────────────────────────────────────────────

   Two bugs, one cause. There was a single `declined` counter and a single
   `offeredAt` per movement+band, shared by both directions: pressing "Stay on
   Black" on a go-lighter prompt suppressed the go-heavier prompt too, and two
   of those declines turned the next up-prompt into the band-shortening
   suggestion. Declining to go DOWN says nothing whatever about wanting to go
   UP. The two sides now have separate counters (X3FProg.gradState).

   And the go-lighter prompt could not be put away at all: it was returned on
   every render regardless of what you pressed, so the dashboard carried it
   until you either changed band or logged a better session. Answering a prompt
   - accept, decline, "later", or a bare acknowledgement - now silences that
   prompt until the movement has something NEW to say, meaning a session newer
   than the one you answered about. A safety prompt still comes back the next
   time you fall short, which is the point of it.

   ─────────────────────────────────────────────────────────────────────────
   WHAT COUNTS
   ─────────────────────────────────────────────────────────────────────────

   FULL-RANGE REPS ONLY. The support centre is explicit: "40 slow and controlled
   reps with a band, NOT COUNTING PARTIAL REPS", and three band pages say "40
   FULL reps". X3FProg.bandSessions() reads `full` and never `reps`, and marks a
   day written before the three-tier set existed as legacy so it cannot trigger
   an upgrade on its own. Getting that wrong would push people up a band one or
   two sessions early, every time.

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
     X3FGraduate.decline(slug[,kind]) keep the band, and put the prompt away
     X3FGraduate.dismiss(slug[,kind]) put the prompt away, deciding nothing
     X3FGraduate.later(slug)          ask me again after the next session
     X3FGraduate.status(slug)         -> {band, qualifying, lastFull, onBandDays}
     X3FGraduate.all()                -> every movement with something to say
*/
(function () {
  "use strict";

  function P() { return window.X3FProg || null; }
  function EX() { return window.X3FEX || null; }

  /* Which band this movement is on. One answer, X3FProg's - an explicit choice
     first, then the band you last actually trained, then the calibrated or
     global default. Asking X3FBand.forMovement directly, as this file used to,
     skipped the middle step: a user who had trained Black for a month but never
     pressed a band button was judged against whatever the global default said,
     which is how two advisers ended up looking at two different bands. */
  function bandOf(slug) {
    var p = P();
    if (p && p.trainingBand) {
      var b = p.trainingBand(slug);
      if (b) return b;
    }
    try { if (window.X3FBand) return window.X3FBand.forMovement(slug); } catch (e) {}
    return 'White';
  }
  function nameOf(slug) {
    try { var e = EX() && EX().get(slug); if (e) return e.name; } catch (err) {}
    var p = P();
    if (p && p.bandVerdict) { var v = p.bandVerdict(slug); if (v && v.name) return v.name; }
    return slug;
  }
  function protocol() {
    var p = P();
    if (p && p.protocol) return p.protocol();
    var e = EX();
    return (e && e.protocol) || { repsMin: 15, repsMax: 40 };
  }

  function sessions(slug, band) {
    var p = P();
    if (!p || !p.bandSessions) return [];
    return p.bandSessions(slug, band || bandOf(slug));
  }
  function qualifying(slug, band) {
    var cap = protocol().repsMax;
    return sessions(slug, band).filter(function (s) { return !s.legacy && s.full >= cap; });
  }

  function days(ms) { return Math.floor((Date.now() - ms) / 86400000); }

  /* Which counter a prompt belongs to. Everything about going heavier shares
     one memory and everything about the band being too heavy shares the other;
     they never touch. `grace` sits on the down side because it is an answer to
     "should I go back down", not to "should I go up again". */
  var SIDE = {
    revert: 'down', down: 'down', grace: 'down',
    up: 'up', 'up-offer': 'up', 'up-soft': 'up', shorten: 'up', elite: 'up', buy: 'up'
  };
  function sideOf(kind) { return SIDE[kind] || 'up'; }

  /* Has this prompt already been answered, with nothing new since? A session
     newer than the answer is new evidence and re-opens the question; the same
     session that was already answered is not. */
  function answered(v, side) {
    var s = v.state[side];
    if (!s) return false;
    return v.last.t <= Math.max(s.dismissedT || 0, s.offeredAt || 0);
  }

  /* ── the decision, turned into something a person can read ────────────── */

  function check(slug) {
    var p = P();
    if (!slug || !p || !p.bandVerdict) return null;
    var v = p.bandVerdict(slug);
    if (!v || !v.last) return null;
    var band = v.band, P_ = { repsMin: v.repsMin, repsMax: v.repsMax };
    var name = v.name || nameOf(slug);

    /* ---- the grace session, after a deliberate move up ------------------
       This is the app's own rule and is labelled as such wherever it speaks.
       The program's own instructions collide here: the 40-rep trigger sends you
       up, the 15-rep floor sends you straight back down, and the first session
       on a heavier band is EXPECTED to land near 15. Without a grace session the
       app produces a visible up-down loop, which reads as a bug and costs it
       credibility on everything else it says. Nothing official arbitrates. */
    if (v.grace) {
      if (answered(v, 'down')) return null;
      return {
        kind: 'grace', slug: slug, band: band, to: null, canSwitch: false,
        confidence: 'ours',
        title: 'That is normal after a band change',
        message: v.message,
        actions: [{ id: 'ok', label: 'Understood' }]
      };
    }

    /* ---- down, on the first occurrence ---------------------------------
       Unconditional in the source, and its stated reason is losing control of a
       loaded bar. The costs are asymmetric, so this fires immediately rather
       than waiting for a pattern. It can be put away, but only until the next
       time you fall short. */
    if (v.dir === 'down') {
      if (answered(v, 'down')) return null;
      var revert = (v.reason === 'revert');
      return {
        kind: revert ? 'revert' : 'down', slug: slug, band: band, to: v.to,
        canSwitch: !!v.switchable, confidence: 'safety',
        title: revert ? 'That band may be too heavy' : ('Go lighter on the ' + name.toLowerCase()),
        message: v.message,
        actions: v.switchable
          ? [{ id: 'accept', label: 'Drop to ' + v.to }, { id: 'decline', label: 'Stay on ' + band }]
          : [{ id: 'ok', label: 'Understood' }]
      };
    }

    if (v.dir !== 'up') return null;
    if (answered(v, 'up')) return null;

    /* ---- the Elite band, and anything else you would have to buy --------
       Never a switch. §11.6: a purchase decision gated on the black band, not a
       routine progression - and the app has no business assuming a band it has
       never seen evidence of. The only action is acknowledgement, because the
       only next step belongs to the user and their wallet. */
    if (!v.to || v.elite || v.purchase) {
      return {
        kind: v.elite ? 'elite' : (v.to ? 'buy' : 'top'), slug: slug, band: band,
        to: null, canSwitch: false, confidence: 'sourced',
        title: v.elite ? 'The Elite band is a purchase, not a step'
             : v.to ? ('Ready for ' + v.to + ', which you would have to buy')
                    : (P_.repsMax + ' full reps on the heaviest band there is'),
        message: v.message,
        actions: [{ id: 'ok', label: 'Got it' }]
      };
    }

    /* ---- the calf raise -------------------------------------------------
       NO SOURCE EXEMPTS IT - an earlier version of this app invented an
       exemption, which was wrong and had to be removed. But the program does
       say, of this one movement, "it's much better to do it with a lighter band
       and higher repetitions", partly because the deadlift has already spent
       your grip. So the trigger is identical and only the COPY changes: staying
       put is presented as legitimate, the acknowledgement comes first so that
       the default answer is the one that changes nothing, and it is never
       re-prompted for that movement on that band. */
    if (v.soft) {
      /* ONCE, EVER - not the usual "until there is something new to say". Every
         other prompt re-opens on a fresh session because fresh evidence is a
         fresh question; here the question is one the program never answered, so
         asking it a second time would just be nagging about a tension X3 left
         unresolved. §11.7. */
      var st = v.state.up;
      if (st.dismissedT || st.offeredAt || st.declined) return null;
      return {
        kind: 'up-soft', slug: slug, band: band, to: v.to, canSwitch: true,
        confidence: 'mixed',
        title: P_.repsMax + ' full reps on calf raises',
        message: v.message,
        actions: [{ id: 'ok', label: 'Stay light' },
                  { id: 'accept', label: 'Move up anyway' }]
      };
    }

    /* Declined the move up twice means the jump feels too big. Band shortening
       is a real, documented mechanic - but X3 documents it as a FIT adjustment,
       not as a half-step of resistance, so that framing is ours and is
       labelled. Gated on the UP counter alone: declining a go-lighter prompt is
       not evidence about anything on this side of the ladder. */
    if (v.state.up.declined >= 2) {
      return {
        kind: 'shorten', slug: slug, band: band, to: null, canSwitch: false,
        confidence: 'mixed',
        title: 'There is a smaller step',
        message: 'X3 documents wrapping the band around the hook once or twice to take up slack. ' +
                 'That makes your current band harder without changing colour. They describe it as ' +
                 'a fit adjustment — treating it as a half-step up is this app’s suggestion, ' +
                 'not theirs.',
        /* Neither button is a decision about the band, so neither is recorded
           as one - see ACK_ONLY. Both just put the suggestion away. */
        actions: [{ id: 'ok', label: 'I’ll try that' }, { id: 'dismiss', label: 'No thanks' }]
      };
    }

    if (v.firm) {
      return {
        kind: 'up', slug: slug, band: band, to: v.to, canSwitch: true, confidence: 'sourced',
        title: 'Second time at ' + P_.repsMax + ' on the ' + name.toLowerCase(),
        message: v.message + ' Move the ' + name.toLowerCase() + ' to ' + v.to + '.',
        actions: [{ id: 'accept', label: 'Move up to ' + v.to },
                  { id: 'decline', label: 'Stay on ' + band }]
      };
    }

    /* One qualifying session: offer, and attribute. */
    return {
      kind: 'up-offer', slug: slug, band: band, to: v.to, canSwitch: true, confidence: 'sourced',
      title: P_.repsMax + ' full reps. That is the number.',
      message: v.message + ' Move the ' + name.toLowerCase() + ' up to ' + v.to + ' next session?',
      actions: [{ id: 'accept', label: 'Move up to ' + v.to },
                { id: 'later', label: 'Do it once more first' },
                { id: 'decline', label: 'Stay on ' + band }]
    };
  }

  /* ── answering ────────────────────────────────────────────────────────── */

  /* Every answer is recorded against the session it was an answer TO, so the
     prompt comes back when there is something new and not before. Taking a
     wall-clock stamp instead would silence the prompt for exactly as long as it
     took the clock to pass it, which is no time at all. */
  function note(slug, band, side, patch) {
    var p = P();
    if (!p || !p.gradNote) return;
    var o = {};
    o[side] = patch;
    p.gradNote(slug, band, o);
  }
  function current(slug) {
    var pr = check(slug);
    return pr || null;
  }
  function lastT(slug, band) {
    var ses = sessions(slug, band);
    return ses.length ? ses[0].t : Date.now();
  }

  function accept(slug) {
    var pr = current(slug);
    if (!pr) return null;
    var band = pr.band;
    /* A prompt with nothing to switch to is a claim, not an adjustment: the
       Elite band, a band the user does not own, the top of the ladder, the
       shortening suggestion. Accepting one records that it was seen and changes
       no setting. Applying it anyway is the bug this replaced - it moved people
       onto an Elite band the app had no reason to think they owned. */
    if (!pr.canSwitch || !pr.to) {
      note(slug, band, sideOf(pr.kind), { dismissedT: lastT(slug, band) });
      return null;
    }
    var target = pr.to;
    try { if (window.X3FBand) window.X3FBand.set(slug, target); } catch (e) {}
    var p = P();
    if (p && p.gradNote) {
      /* The grace window opens on the band you have just moved TO, and its
         counters start clean: what you declined on the old band says nothing
         about the new one. */
      p.gradNote(slug, target, {
        upgradedAt: Date.now(),
        up: { declined: 0, offeredAt: 0, dismissedT: 0 },
        down: { declined: 0, offeredAt: 0, dismissedT: 0 }
      });
    }
    return target;
  }

  /* Keep the band. Counts as a decline on THAT side of the ladder only, and
     puts the prompt away until the movement has something new to say.

     The kind argument is optional because the dashboard does not pass one: it
     calls decline(slug) for every button it does not recognise, including the
     bare acknowledgements. Re-deriving the live prompt is what makes that
     correct - the answer lands on the side of the ladder the user was actually
     looking at, instead of on a single shared counter. */
  function decline(slug, kind) {
    var pr = kind ? { kind: kind, band: bandOf(slug) } : current(slug);
    if (!pr) return;
    var side = sideOf(pr.kind);
    var only = onlyAcknowledges(pr);
    var s = (P() && P().gradState) ? P().gradState(slug, pr.band) : null;
    var prev = (s && s[side]) ? (s[side].declined || 0) : 0;
    note(slug, pr.band, side, {
      /* An acknowledgement is not a decision. "Understood" on a grace note or
         "Got it" on the Elite band must not count toward the two declines that
         escalate to the shortening suggestion. */
      declined: only ? prev : prev + 1,
      dismissedT: lastT(slug, pr.band)
    });
  }

  /* Put the prompt away without deciding anything. Same silence, no counter. */
  function dismiss(slug, kind) {
    var pr = kind ? { kind: kind, band: bandOf(slug) } : current(slug);
    if (!pr) return;
    note(slug, pr.band, sideOf(pr.kind), { dismissedT: lastT(slug, pr.band) });
  }

  /* Prompts that only TELL you something. The dashboard routes every button it
     does not recognise - "Understood", "Got it", "I'll try that" - through
     decline(), so without this an acknowledgement would be recorded as a
     decision about the band and two of them would escalate the next offer to
     the band-shortening suggestion. Nobody declined anything. */
  var ACK_ONLY = { grace: 1, elite: 1, buy: 1, top: 1, shorten: 1 };
  function onlyAcknowledges(pr) {
    if (ACK_ONLY[pr.kind]) return true;
    /* decline(slug, kind) with no live prompt is a caller saying outright that
       this was a decline; take them at their word. */
    if (!pr.actions) return false;
    for (var i = 0; i < pr.actions.length; i++) {
      var id = pr.actions[i].id;
      if (id === 'accept' || id === 'decline') return false;
    }
    return true;
  }

  /* "Do it once more first" is not a decline - it should ask again as soon as
     there is another session to ask about. */
  function later(slug) {
    var pr = current(slug);
    if (!pr) return;
    note(slug, pr.band, sideOf(pr.kind), { offeredAt: lastT(slug, pr.band) });
  }

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
    /* Safety first, then the firm recommendation, then the offer. The dashboard
       shows one of these at a time, so this order decides which. */
    var rank = { revert: 0, down: 1, up: 2, 'up-offer': 3, 'up-soft': 4, shorten: 5, grace: 6, buy: 7, elite: 8, top: 9 };
    out.sort(function (a, b) { return (rank[a.kind] == null ? 10 : rank[a.kind]) - (rank[b.kind] == null ? 10 : rank[b.kind]); });
    return out;
  }

  window.X3FGraduate = {
    check: check, accept: accept, decline: decline, dismiss: dismiss, later: later,
    status: status, all: all, sessions: sessions, qualifying: qualifying
  };
})();
