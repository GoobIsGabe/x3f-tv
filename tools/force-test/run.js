#!/usr/bin/env node
/* Run the force-model regression suite.

   The force model is the part of this app that decides what a number from the
   bar means: which band a movement is on, what its start position and its
   all-out max are, and where on the screen a given force belongs. Every bug the
   user has actually reported out loud has been in that chain, and each of them
   was invisible until someone played a set and noticed nothing moved. This
   suite is the thing that notices instead.

   Usage:
       node tools/force-test/run.js                 every group
       node tools/force-test/run.js 1 8             just those groups
       node tools/force-test/run.js band curve      or by a word in the title
       node tools/force-test/run.js -v              print every assertion
       node tools/force-test/run.js --baseline      run against the PRE-overhaul
                                                    modules, read out of git

   --baseline exists so the suite can be shown to fail. A regression test that
   has never been watched failing is a regression test nobody knows is wired up;
   this project already does that check by hand for the TV bootstrap
   (HANDOFF.md:98) and this makes it one command. Expect a large number of
   failures and a pile of ReferenceErrors there - x3f-band.js did not exist yet,
   which is the whole point.

   Exits non-zero if anything fails, so CI can gate on it the way it gates on
   tools/func-test/run.py. */
'use strict';

const { load, setSource, fromDisk, fromGit, BASELINE_REF, MODULES } = require('./env');
const { groups } = require('./cases');

const argv = process.argv.slice(2);
const verbose = argv.includes('-v') || argv.includes('--verbose');
const baselineArg = argv.find(a => a.startsWith('--baseline'));
const baselineRef = baselineArg
  ? (baselineArg.includes('=') ? baselineArg.split('=')[1] : BASELINE_REF)
  : null;
const want = argv.filter(a => !a.startsWith('-'));

/* The assertion vocabulary. Deliberately small: `ok`, `eq`, `not` and `near`
   cover everything here, and every one of them takes a NAME first, because the
   line that shows up in a failing run is the only explanation most people will
   read. `extra` carries the actual value - "expected 78, got 39" is a
   diagnosis; "assertion failed" is a scavenger hunt. */
function collector() {
  const lines = [];
  let pass = 0, fail = 0;
  function record(name, cond, extra) {
    if (cond) pass++; else fail++;
    lines.push((cond ? 'PASS ' : 'FAIL ') + name + (extra != null ? '  -> ' + extra : ''));
    return cond;
  }
  const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
  return {
    lines,
    get pass() { return pass; },
    get fail() { return fail; },
    ok(name, cond, extra) { return record(name, !!cond, extra); },
    eq(name, actual, expected) {
      const same = Object.is(actual, expected) ||
        (actual !== null && expected !== null && typeof actual === 'object' &&
         JSON.stringify(actual) === JSON.stringify(expected));
      return record(name, same, same ? null : 'expected ' + show(expected) + ', got ' + show(actual));
    },
    not(name, actual, unexpected) {
      const same = Object.is(actual, unexpected);
      return record(name, !same, same ? 'got the value it must not be: ' + show(actual) : null);
    },
    near(name, actual, expected, tol) {
      const d = Math.abs(actual - expected);
      return record(name, d <= (tol == null ? 1e-6 : tol),
                    d <= (tol == null ? 1e-6 : tol) ? null
                      : 'expected ~' + show(expected) + ', got ' + show(actual));
    }
  };
}

function wanted(g) {
  if (!want.length) return true;
  return want.some(w => g.id === w || g.title.toLowerCase().includes(w.toLowerCase()));
}

function main() {
  const read = baselineRef ? fromGit(baselineRef) : fromDisk;
  setSource(read);

  /* Say what is actually under test before saying anything about it. A suite
     that silently tested nothing - because a module moved, or because a git ref
     no longer carries it - would print a clean sweep, which is worse than a
     failure. */
  const probe = load({ read });
  console.log('X3F force-model regression suite');
  console.log('  modules: ' + (probe.loaded.join(', ') || 'NONE') +
              (probe.missing.length ? '   MISSING: ' + probe.missing.join(', ') : ''));
  if (baselineRef) {
    console.log('  --baseline: reading web/ as of git ' + baselineRef +
                ' (the last commit before the overhaul)');
  }
  if (!probe.loaded.length) {
    console.log('\nNothing loaded. Expected ' + MODULES.join(', ') + ' under web/.');
    return 2;
  }
  console.log('');

  let totalPass = 0, totalFail = 0;
  const failed = [];
  let ran = 0;

  for (const g of groups) {
    if (!wanted(g)) continue;
    ran++;
    const t = collector();
    try {
      g.run(t);
    } catch (e) {
      /* A throw is a result, not a crash: against the pre-overhaul modules half
         of these groups throw ReferenceError on X3FBand, and that IS the
         finding. Record it and keep going, so one broken group cannot hide the
         other eight. */
      t.ok('the group ran to the end', false, e && e.message ? e.message : String(e));
    }
    totalPass += t.pass;
    totalFail += t.fail;
    /* One column, always in the same place: a status that moves with the length
       of the title is a status nobody scans. */
    const W = 62;
    let head = ' ' + g.id.padEnd(2) + ' ' + g.title;
    head = (head.length > W ? head.slice(0, W - 3) + '...' : head).padEnd(W) + '  ';
    if (t.fail) {
      console.log(head + 'FAIL  ' + t.pass + ' passed, ' + t.fail + ' failed');
      failed.push([g, t]);
    } else {
      console.log(head + 'ok    ' + t.pass + ' passed');
    }
    if (verbose) t.lines.forEach(l => console.log('      ' + l));
  }

  if (!ran) {
    console.log('no group matched ' + JSON.stringify(want));
    return 2;
  }

  if (failed.length) {
    console.log('\n===== failures =====');
    for (const [g, t] of failed) {
      console.log('\n' + g.id + '  ' + g.title);
      t.lines.filter(l => l.startsWith('FAIL')).forEach(l => console.log('  ' + l));
    }
  }
  console.log('\ntotal: ' + totalPass + ' passed, ' + totalFail + ' failed');
  return totalFail ? 1 : 0;
}

process.exit(main());
