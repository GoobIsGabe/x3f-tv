/* X3F service worker - the phone build's offline cache.

   This file is stripped out of the TV bundle entirely (tools/sync-from-web.py
   deletes the registration line). It only ever runs on gh-pages.

   ─────────────────────────────────────────────────────────────────────────
   WHAT WENT WRONG BEFORE, AND WHY EACH RULE BELOW EXISTS
   ─────────────────────────────────────────────────────────────────────────

   1. IT CACHED 404s, PERMANENTLY.
      The old fetch handler cached whatever came back:

          fetch(e.request).then(res => { caches.open(C).then(c => c.put(...)) })

      `res` is a Response for a 404 just as much as for a 200, and `cache.put`
      stores it happily. Cache-first then serves that 404 forever. One typo in a
      <script src> - or one request that raced a deploy - and the install is
      permanently broken with no way back short of clearing site data. Now
      nothing but a same-origin 200 is ever written.

   2. IT SERVED HTML FOR A MISSING SCRIPT.
      The old catch handler was `.catch(() => caches.match('index.html'))`, for
      every request type. So a failed fetch of x3f-nav.js resolved with the
      HOME PAGE, and the browser tried to parse "<!doctype html>" as JavaScript.
      The console shows "Unexpected token '<'" and the actual problem - the file
      is missing - is nowhere in the message. The navigation fallback is what
      that line was for, so it now applies only to navigations. A script or a
      stylesheet that cannot be fetched fails as a fetch failure, which is the
      truth and is diagnosable.

   3. THE CACHE NAME NEVER CHANGED, SO A NEW BUILD NEVER SHIPPED.
      `activate` deletes every cache except C, and a new worker is only picked
      up when sw.js's BYTES change. The publish workflow copies web/ verbatim,
      so shipping a fixed page while C stayed 'x3f-v8' meant returning visitors
      kept the old worker and were served the old page out of the old cache,
      forever. "The fix didn't ship."

      .github/workflows/pages.yml now stamps the commit SHA into the line below
      on every publish, so the bytes of this file change whenever anything in
      web/ does, the worker updates, activate() drops the previous cache, and
      the new build is what people get. The literal here is the local-dev value
      and the fallback if that step is ever removed - bump it by hand if you are
      testing without the workflow.

   4. MOST OF THE APP WAS NEVER PRECACHED.
      Six of the shared modules and all of the art were missing from A, so they
      were only cached opportunistically after a first online visit. Anything
      the pages need to boot is listed now. See docs/ADDING-A-FILE.md - adding a
      page or a script means adding it here too, and that checklist says so.
*/

/* --- publish stamp: pages.yml rewrites this line with ${GITHUB_SHA} --- */
const C = 'x3f-27d8e0af3446b814022b466f4da57320e8ac6538';

/* Everything a page needs to boot. Precaching is best-effort per entry: one
   missing file must not abort the whole install and leave a visitor with no
   offline copy at all - but it is logged, so a stale entry here is findable
   instead of invisible. */
const A = [
  /* X3F_Ascent.html is deliberately ABSENT. It is the only page that loads a
     third-party library from a CDN (three.js), so precaching the page would
     cache a shell that cannot start - the HTML would come from the cache and
     the script it depends on would not. Better an honest network failure than a
     page that looks installed and is not. It is also phone-only and is not in
     the TV bundle at all. */
  'index.html', 'app.html', 'manifest.json',
  'X3F_Arena.html', 'X3F_Flow.html', 'X3F_Bloom.html', 'X3F_Splash.html',
  'X3F_Nova.html', 'X3F_Routine.html', 'X3F_Progress.html',
  'X3F_Duel.html', 'X3F_Rhythm.html', 'X3F_Library.html', 'X3F_Calibrate.html',
  /* X3F_Pair.html cannot do its job offline - it exists to talk to a network.
     It is precached anyway so the SHELL comes up instantly and can say what is
     wrong, instead of the browser's offline page saying nothing. */
  'X3F_Pair.html',
  /* the shared modules. x3f-band.js is the band-resolution owner and x3f-ui.css
     is the design system - a page that boots without either is not the app. */
  'x3f-band.js', 'x3f-cal.js', 'x3f-calflow.js', 'x3f-exercises.js', 'x3f-form.js',
  'x3f-firebase-config.js', 'x3f-fx.js', 'x3f-hype.js', 'x3f-music.js', 'x3f-nav.js',
  'x3f-progress.js', 'x3f-set.js', 'x3f-sync.js', 'x3f-ui.css',
  /* x3f-art.js generates every card image, so without it a cold offline first
     run is a grid of empty boxes; x3f-hud.js is the in-set scoreboard, which is
     the only thing on screen worth reading during a set; x3f-onboard.js is the
     first thing a new install shows. All three are load-bearing offline. */
  'x3f-art.js', 'x3f-hud.js', 'x3f-onboard.js', 'x3f-graduate.js',
  /* Fonts. Named individually so a phone that installs the app and then never
     goes online again still renders in the right face - a font fetched lazily is
     only cached if you were online the first time you looked at a page.
     These filenames come out of the subsetting step: REGENERATE THE FONTS AND
     THIS LIST HAS TO CHANGE WITH THEM. A stale name here is not fatal (the entry
     is skipped with a warning and the real file is cached on first use), which is
     why it is a comment rather than a check. */
  'fonts/fonts.css',
  'fonts/sora-var-latin.woff2',
  'fonts/space-grotesk-var-latin.woff2',
  'fonts/fredoka-var-latin.woff2',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  /* Generated art. WEBP only - the .jpg twin of each of these also exists in
     web/ as a fallback, and precaching both would double the art for a format
     nothing asks for first. */
  'assets/ui/aurora.jpg', 'assets/ui/backdrop.webp',
  'assets/ui/badge-0.webp', 'assets/ui/badge-1.webp', 'assets/ui/badge-2.webp',
  'assets/ui/badge-3.webp', 'assets/ui/badge-4.webp',
  'assets/cards/bloom.webp', 'assets/cards/boss.webp', 'assets/cards/duel.webp',
  'assets/cards/flow.webp', 'assets/cards/max.webp', 'assets/cards/nova.webp',
  'assets/cards/rhythm.webp', 'assets/cards/splash.webp', 'assets/cards/workout.webp',
  'assets/cards/zone.webp',
  'assets/moves/bent-row.webp', 'assets/moves/calf-raise.webp', 'assets/moves/chest-press.webp',
  'assets/moves/deadlift.webp', 'assets/moves/drag-curl.webp', 'assets/moves/front-squat.webp',
  'assets/moves/overhead-press.webp', 'assets/moves/pec-crossover.webp', 'assets/moves/split-squat.webp',
  'assets/moves/tricep-press.webp', 'assets/moves/upright-row.webp',
  'assets/phase/1.webp', 'assets/phase/2.webp', 'assets/phase/3.webp',
  'assets/bloom/bg.jpg', 'assets/bloom/critter.png', 'assets/bloom/critter_strain.png',
  'assets/bloom/critter_cheer.png', 'assets/bloom/flower.png', 'assets/bloom/bud.png',
  'assets/bloom/petal.png',
  'assets/splash/dolphin.png', 'assets/splash/star.png', 'assets/splash/pearl.png',
  'assets/splash/bubble.png', 'assets/splash/fish.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => Promise.all(A.map(u =>
    c.add(new Request(u, { cache: 'reload' }))
     .catch(err => console.warn('[sw] not precached: ' + u, err))
  ))));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

/* Only a same-origin 200 is worth keeping. `res.ok` alone is not enough: an
   opaque cross-origin response reports ok === false but status 0, and a
   redirect chain can land on a 30x that is useless to replay from cache. */
function cacheable(res) {
  return !!res && res.status === 200 && res.type === 'basic';
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (cacheable(res)) {
          const copy = res.clone();
          caches.open(C).then(c => c.put(req, copy));
        }
        /* A 404 is returned as the 404 it is. Handing back the home page here
           is what turned "this file is missing" into "Unexpected token '<'". */
        return res;
      }).catch(err => {
        /* Offline. A navigation can honestly be answered with the app shell -
           that is the whole point of an offline-capable site. A script, a
           stylesheet, an image or a font cannot: HTML in their place is worse
           than nothing, because it fails somewhere else with a message about
           the wrong thing. */
        if (req.mode === 'navigate') {
          return caches.match('index.html').then(shell => shell || Promise.reject(err));
        }
        return Promise.reject(err);
      });
    })
  );
});
