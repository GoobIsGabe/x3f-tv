/* X3F FORCE-TEST - the environment the force model runs in, with the browser
   taken away.

   WHY THIS EXISTS SEPARATELY FROM tools/func-test

   func-test drives the real bundled pages in headless Chrome, because what it
   asserts is what a PAGE does: the guided session advances, the dashboard
   renders, a Bloom set logs. That is the right tool for a page and the wrong
   one for the force model, for three reasons:

     1. The force model is three modules over one localStorage key. Half of its
        defects are "what happens when storage holds something impossible", and
        the only way to test that honestly is to put the impossible thing in
        storage BEFORE the module ever reads it. A browser scenario seeds
        storage after the page has already booted.

     2. x3f-cal.js memoises the parsed map for 500 ms (a deliberate choice - it
        is called ten times a frame from inside Bloom's draw loop). Two tests in
        the same document therefore contaminate each other in ways that depend
        on wall-clock timing. Here every test gets a FRESH MODULE INSTANCE in a
        fresh vm context with a fresh store, so the cache starts empty and
        cannot carry anything between tests.

     3. The whole suite runs in well under a second with no browser, so it can
        gate a commit without anyone deciding to skip it.

   WHAT IT DELIBERATELY DOES NOT COVER: the pages. Nothing here proves that
   X3F_Calibrate.html writes what it captured, or that the TV shell's bootstrap
   feeds the model the right number. That is a page question, so it is asked in
   a page harness - tools/func-test/cases-cal.js, which loads Calibrate with the
   live BOOTSTRAP extracted from MainActivity.java the way `bloomtv` does.

   THE SHIM. The three modules are ES5 IIFEs that touch exactly four browser
   globals: `window` (which they assign their export onto), `localStorage`,
   `location.search` (the ?band= / ?ex= overrides) and `performance.now`. So the
   shim is those four things and nothing else - if a module ever grows a real
   DOM dependency, it will throw here rather than pass by accident, which is the
   behaviour we want from a fake environment.

   THE BASELINE MODE. `--baseline` loads the same three module names out of git
   rather than off disk, so the suite can be pointed at the code as it was
   BEFORE the overhaul and you can watch these tests go red. That is the
   mutation check this project already runs by hand (HANDOFF.md:98) made
   repeatable, and it is read from git on purpose: a vendored copy of the old
   module would drift and the demonstration would become fiction. x3f-band.js
   does not exist at that ref, so it simply does not load and everything that
   asks the band question fails with a ReferenceError - which is the honest
   answer, because before the overhaul nothing in the app could answer it.

   These files are tooling and run only on Node. They are never bundled, so
   unlike everything in web/ they are not held to the TV WebView's ES5 floor. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const WEB = path.join(REPO, 'web');

/* v1.7 - the last commit before the force-model overhaul began. Hardcoded
   rather than 'HEAD' because the moment the overhaul is committed HEAD becomes
   the NEW code, and `--baseline` would quietly start comparing the new code
   against itself and reporting a clean sweep. A fixed hash cannot rot that way.
   Override it with `--baseline=<ref>` if you need a different comparison. */
const BASELINE_REF = 'ef2470e';

/* Load order matters and is the same order every page uses: x3f-cal.js asks
   X3FEX for the movement's floorFrac and curve, and X3FBand for the band. */
const MODULES = ['x3f-exercises.js', 'x3f-band.js', 'x3f-cal.js'];

/* x3f-set.js is loaded only on request, because it installs an interval timer
   and a rep state machine that most of these tests do not want running. It is
   needed for one thing: proving that what the reporter hands X3FCal.observe()
   is an ABSOLUTE force. That contract cannot be checked from the cal module
   alone - it is the seam between two files, and seams are where this project's
   shipped bugs have all lived. */
const WITH_SET = MODULES.concat(['x3f-set.js']);

/* x3f-sync.js, likewise on request only. It is not part of the force model at
   all, and it is here for one narrow reason: the URL it builds for a write is
   assembled by string concatenation, gets it wrong for exactly one input, and
   fails in a way no other layer can see - fetch rejects with the bare words
   "Failed to fetch", which is also what being offline looks like. A pure
   builder plus one assertion is the cheapest place in the codebase to notice
   that, and the alternative is finding out on a television. */
const WITH_SYNC = MODULES.concat(['x3f-sync.js']);

function fromDisk(name) {
  const p = path.join(WEB, name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function fromGit(ref) {
  return function (name) {
    try {
      return execFileSync('git', ['show', ref + ':web/' + name],
                          { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
      return null;            // absent at that ref - which is itself the finding
    }
  };
}

/* localStorage stores STRINGS. Keeping that literal matters: every one of these
   modules round-trips through JSON.parse and several of the defects being
   pinned here are "what does the parse do with that". A Map of live objects
   would quietly fix bugs the real thing has.

   Seeds are therefore JSON-encoded exactly the way a page writes them, INCLUDING
   plain strings - `x3f_band` on a real install holds `"Black"` with the quotes,
   and seeding it as bare `Black` makes JSON.parse throw, so the module silently
   uses its default and the test passes or fails for a reason that has nothing
   to do with the code under test. (That happened while writing this file, which
   is why it is spelled out here.) To plant genuinely malformed text on purpose,
   pass {__raw: '...'} and it is stored byte for byte. */
function makeStorage(seed) {
  const data = Object.create(null);
  if (seed) {
    for (const k of Object.keys(seed)) {
      const v = seed[k];
      data[k] = (v && typeof v === 'object' && typeof v.__raw === 'string')
        ? v.__raw : JSON.stringify(v);
    }
  }
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
    clear() { for (const k of Object.keys(data)) delete data[k]; },
    key(i) { const ks = Object.keys(data); return i < ks.length ? ks[i] : null; },
    get length() { return Object.keys(data).length; },
    __data: data
  };
}

/* Where module source comes from, for every load() that does not say. The
   groups in cases.js call load() with no arguments on purpose: a test should
   assert what the model does, not know where the model was read from. The
   driver flips this once, up front, so `--baseline` reaches every group without
   a single test being aware of it. */
let defaultRead = fromDisk;
function setSource(read) { defaultRead = read || fromDisk; }

/* Build a world, load the modules into it, hand back the handles a test needs.

     opts.storage   {key: value}   seeded BEFORE the modules load, JSON-encoded
                                   the way a page writes it; {__raw:'...'} to
                                   plant malformed text on purpose.
     opts.search    '?band=Black'  the query string the page was opened with
     opts.read      fn(name)       where module source comes from (disk / git)

   The store can also be written after load with env.set(), but see the note on
   that method - x3f-cal.js will not see such a write for up to 500 ms. Seed it
   here whenever you can. */
function load(opts) {
  opts = opts || {};
  const storage = makeStorage(opts.storage);
  const read = opts.read || defaultRead;

  const sandbox = {
    localStorage: storage,
    location: { search: opts.search || '', pathname: '/x3f/test.html', href: 'file:///x3f/test.html' },
    performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
    URLSearchParams,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  /* window === the global object, exactly as in a browser, so `window.X3FCal =`
     inside a module and `X3FCal` at the top level of the next one are the same
     binding. Getting this wrong would let a module pass here while failing on
     a real page. */
  /* x3f-sync.js reads window.X3F_FIREBASE at load time and captures it in a
     closure, so it has to be present BEFORE the module runs, exactly as the
     real config script tag is. crypto is what randomCode()/randomId() use;
     nothing asserted here depends on the values, only on their shape. */
  if (opts.withSync) {
    sandbox.X3F_FIREBASE = opts.firebase || {
      apiKey: 'test-key',
      projectId: 'x3f-test',
      databaseURL: 'https://x3f-test-default-rtdb.firebaseio.com'
    };
    sandbox.crypto = { getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = i * 7 + 3; return a; } };
    sandbox.fetch = () => Promise.reject(new Error('no network in the force-test sandbox'));
    sandbox.document = { addEventListener() {} };
    sandbox.addEventListener = function () {};
  }

  sandbox.window = sandbox;

  vm.createContext(sandbox);

  const loaded = [], missing = [];
  for (const name of (opts.withSync ? WITH_SYNC : (opts.withSet ? WITH_SET : MODULES))) {
    const src = read(name);
    if (src == null) { missing.push(name); continue; }
    vm.runInContext(src, sandbox, { filename: name });
    loaded.push(name);
  }

  return {
    win: sandbox,
    storage,
    loaded,
    missing,
    get cal() { return sandbox.X3FCal; },
    get band() { return sandbox.X3FBand; },
    get reporter() { return sandbox.X3FSet; },   /* not `set` — the store helper below already owns that name */
    get ex() { return sandbox.X3FEX; },

    /* The parsed value of a key, the way every page reads it. */
    get(key) {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      try { return JSON.parse(raw); } catch (e) { return raw; }
    },

    /* Writes the way a page writes. CAUTION: x3f-cal.js holds its parsed map
       for 500 ms, so a write here is invisible to X3FCal until that lapses.
       Seed through load({storage}) instead unless you are testing what another
       page's write does to a module that has already read. */
    set(key, value) {
      storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    },

    /* A stable, whole-store fingerprint. The point of a byte-exact comparison
       rather than checking one key: "a refused calibration must write NOTHING"
       is a claim about the whole store, and the shipped bug it guards against
       wrote to a key nobody thought to look at. */
    snapshot() {
      const keys = Object.keys(storage.__data).sort();
      return JSON.stringify(keys.map(k => [k, storage.__data[k]]));
    },

    /* The band the Library used to resolve, kept here so the D1 regression can
       show the two answers side by side instead of just asserting the new one.
       X3F_Library.html:74-75, verbatim in shape:
         let libBand = xget('libBand', {});
         function bandFor(ex) { return libBand[ex.slug] || ex.band } */
    libraryBandRule(slug) {
      const libBand = this.get('x3f_libBand') || {};
      const e = sandbox.X3FEX ? sandbox.X3FEX.get(slug) : null;
      return libBand[slug] || (e && e.band) || null;
    }
  };
}

module.exports = { load, setSource, fromDisk, fromGit, BASELINE_REF, MODULES, REPO, WEB };
