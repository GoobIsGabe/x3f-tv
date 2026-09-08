/* X3F SYNC - household sync over Firebase Realtime Database.
   Optional. The app is local-first and works forever without it.

   ─────────────────────────────────────────────────────────────────────────
   WHY RTDB AND NOT FIRESTORE
   ─────────────────────────────────────────────────────────────────────────

   The TV app has zero third-party dependencies and a sub-5MB APK budget, so
   there is no Firebase SDK on it. Firestore's realtime Listen is bidirectional
   gRPC / WebChannel and is NOT available over REST, so from a plain HTTP client
   Firestore could only ever be polled. RTDB's REST API speaks Server-Sent
   Events - set Accept: text/event-stream and you get a live push channel out of
   HttpsURLConnection.

   Everything secondary points the same way: a JSON wire format instead of
   Firestore's typed value wrappers, byte-based billing instead of per-operation
   billing, and one small tree instead of a document store.

   ─────────────────────────────────────────────────────────────────────────
   TWO TRANSPORTS, ONE API
   ─────────────────────────────────────────────────────────────────────────

   web      fetch() and EventSource, directly. This is what BOTH builds use today.

            On the TV that needs permission: the shell blocks all network from
            the WebView by default, because a file:// page holding a Java bridge
            has no business reaching the internet. openNetwork() asks for it, and
            only when a Firebase config actually exists; the shell then opens
            exactly four hosts (MainActivity.isSyncHost) and nothing else.

   native   window.X3F.rtdb(), if the shell ever implements it. It does not yet,
            and the code path below is deliberately kept: moving the transport
            into Java is the upgrade if the narrowed network path above ever
            stops being acceptable, and it would also let sync survive a page
            navigation instead of restarting with each document.

   Detected at call time. Everything above the transport is identical.

   ─────────────────────────────────────────────────────────────────────────
   MERGE
   ─────────────────────────────────────────────────────────────────────────

   A set is immutable once logged, so there is no conflict to resolve - only a
   union. Each entry gets a STABLE ID DERIVED FROM ITS CONTENT rather than a
   random one, which means:

     - existing history, logged long before sync existed, gets an id for free
     - the same set pushed twice from two devices lands on one key
     - no id column has to be added to the local schema

   Deletes are the exception, and they are handled by NOT handling them: a set
   deleted locally is simply not re-pulled, tracked in a small tombstone list.
   Deleting from every device is not worth a server for.

     X3FSync.available()      is a transport present at all
     X3FSync.configured()     is there a firebase config
     X3FSync.status()         -> {state, household, pending, lastSync, error}
     X3FSync.startPairing()   TV: mint a code -> {code, url}
     X3FSync.claim(code)      phone: claim a code
     X3FSync.watchInvite(c,f) TV: poll until a phone claims c -> f(uid)
     X3FSync.confirm(code,uid) TV: let a claimed device in
     X3FSync.awaitJoin(f)     phone: poll until the TV confirms -> f(hid)
     X3FSync.push()           flush unsynced local sets
     X3FSync.pull()           fetch remote sets and merge into local history
     X3FSync.auto(on)         push on log, pull on focus, throttled
     X3FSync.onChange(fn)
     X3FSync.forget()         leave the household on this device
*/
(function () {
  "use strict";

  var K_STATE = 'x3f_sync';        // {hid, uid, lastSync, tombstones:[]}
  var K_SENT = 'x3f_syncSent';     // [id] already pushed
  var HISTORY = 'x3f_history';

  var CFG = window.X3F_FIREBASE || null;   // set by x3f-firebase-config.js

  function read(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k)); return (v === null || v === undefined) ? d : v; }
    catch (e) { return d; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var listeners = [];
  function fire() {
    var s = status();
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](s); } catch (e) {} }
  }

  /* ── transport ────────────────────────────────────────────────────────── */

  function nativeBridge() {
    return (window.X3F && typeof window.X3F.rtdb === 'function') ? window.X3F : null;
  }

  function available() { return !!nativeBridge() || (typeof fetch === 'function' && !!CFG); }
  function configured() { return !!(CFG && CFG.apiKey && CFG.databaseURL); }

  /* The TV shell blocks ALL network from the WebView by default - a file:// page
     holding a Java bridge has no business reaching the internet. Sync is the one
     exception, so the page asks for it explicitly, and only when it actually has
     somewhere to sync TO. The shell narrows that to four Firebase hosts
     (MainActivity.isSyncHost); nothing else opens, and it stays shut for anyone
     who never configures sync. */
  function openNetwork() {
    if (!configured()) return false;
    try {
      if (window.X3F && typeof window.X3F.enableSync === 'function') {
        window.X3F.enableSync(true);
        return true;
      }
    } catch (e) {}
    return typeof fetch === 'function';
  }

  /* Native returns through a callback registered on window, because the Android
     JavascriptInterface bridge is synchronous-return-only and cannot hand back a
     Promise. Wrapped here so callers never see the difference. */
  var reqSeq = 0, reqCbs = {};
  window.__x3fSyncReply = function (id, ok, body) {
    var cb = reqCbs[id];
    if (!cb) return;
    delete reqCbs[id];
    cb(ok ? null : (body || 'error'), ok ? body : null);
  };

  /* THE EMPTY PATH IS THE WHOLE REASON THIS IS A SEPARATE FUNCTION.

     A multi-path update is a PATCH at the ROOT - that is what makes creating a
     household, confirming a phone and flushing a batch of sets atomic instead of
     three or four writes that can half-succeed. Those three callers pass path
     ''. Concatenated naively that produced

         https://x3f-tv-default-rtdb.firebaseio.com  +  ''  +  '.json'
       = https://x3f-tv-default-rtdb.firebaseio.com.json

     which is not a path on the database, it is a DIFFERENT HOSTNAME. The browser
     cannot resolve it, so fetch rejects with the bare string "Failed to fetch" -
     no status, no body, nothing that names a URL. Every single write over the
     web transport had been failing that way since the transport was written, and
     firebase/verify.sh could not see it because curl was given the "/.json" the
     bug consists of omitting.

     So: normalise the path, and keep the builder pure so a test can assert the
     shape of the URL without a network, a token, or a database. */
  function urlFor(method, path, tok) {
    /* auth is a QUERY PARAMETER on RTDB, not a header. That is what makes
       EventSource work at all, and it means tokens end up in URLs - keep them
       out of any logging. print=silent returns 204 with no body, and RTDB bills
       downloaded bytes, so every write uses it. */
    return CFG.databaseURL.replace(/\/+$/, '') + (path || '/') + '.json?auth=' +
           encodeURIComponent(tok) + (method === 'GET' ? '' : '&print=silent');
  }

  function call(method, path, body) {
    return new Promise(function (resolve, reject) {
      var nb = nativeBridge();
      if (nb) {
        var id = ++reqSeq;
        reqCbs[id] = function (err, res) {
          if (err) reject(new Error(String(err)));
          else { try { resolve(res ? JSON.parse(res) : null); } catch (e) { resolve(null); } }
        };
        try { nb.rtdb(id, method, path, body ? JSON.stringify(body) : ''); }
        catch (e) { delete reqCbs[id]; reject(e); }
        /* The bridge cannot time out on its own; a dropped reply would leak a
           callback and hang a caller forever. */
        setTimeout(function () {
          if (reqCbs[id]) { delete reqCbs[id]; reject(new Error('sync timeout')); }
        }, 20000);
        return;
      }

      if (!configured()) { reject(new Error('not configured')); return; }
      tokenFor().then(function (tok) {
        var url = urlFor(method, path, tok);
        return fetch(url, {
          method: method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined
        }).then(function (r) {
          if (!r.ok) throw new Error('rtdb ' + r.status);
          return r.status === 204 ? null : r.json();
        });
      }).then(resolve, reject);
    });
  }

  /* ── auth (web transport only; native owns its own token) ─────────────── */

  var tok = null, tokExp = 0;
  function tokenFor() {
    if (tok && Date.now() < tokExp - 60000) return Promise.resolve(tok);
    var st = read(K_STATE, {});
    var body = st.refresh
      ? { grant_type: 'refresh_token', refresh_token: st.refresh }
      : { returnSecureToken: true };
    var url = st.refresh
      ? 'https://securetoken.googleapis.com/v1/token?key=' + CFG.apiKey
      : 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + CFG.apiKey;

    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('auth ' + r.status);
      return r.json();
    }).then(function (j) {
      /* securetoken returns snake_case (id_token, refresh_token, expires_in,
         user_id) while identitytoolkit returns camelCase (idToken,
         refreshToken, expiresIn, localId). Same payload, two shapes. This is
         documented Google behaviour, not a bug to work around. */
      var id = j.idToken || j.id_token;
      var rt = j.refreshToken || j.refresh_token;
      var exp = +(j.expiresIn || j.expires_in || 3600);
      var uid = j.localId || j.user_id || read(K_STATE, {}).uid;
      tok = id; tokExp = Date.now() + exp * 1000;
      var s = read(K_STATE, {});
      s.refresh = rt; s.uid = uid;
      write(K_STATE, s);
      return tok;
    });
  }

  /* ── identity of a set ────────────────────────────────────────────────── */

  /* Content-addressed, so history that predates sync still gets a stable key and
     the same set pushed from two devices collides onto one node instead of
     duplicating. FNV-1a: short, dependency-free, and collision risk is
     irrelevant at a few thousand records. */
  function setId(e) {
    var s = [e.t || e.ts || 0, e.ex || '', e.band || '', e.reps || 0, e.peak || 0].join('|');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 's' + h.toString(36) + (s.length).toString(36);
  }

  function bucketOf(e) {
    var d = new Date(e.t || e.ts || Date.now());
    return String(d.getFullYear()) + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  /* Only the fields the rules accept, and only the ones that carry meaning.
     Anything else is rejected by "$other": {".validate": false}, and a rejected
     write still costs downloaded bytes. */
  function wire(e, uid) {
    var o = {
      profileId: String(e.profile || 'default').slice(0, 32),
      exercise: String(e.ex || 'unknown').slice(0, 48),
      reps: Math.max(0, Math.min(500, +e.reps || 0)),
      ts: Math.max(1, Math.min(Date.now(), +(e.t || e.ts) || Date.now())),
      by: uid
    };
    if (e.band) o.band = String(e.band).slice(0, 16);
    if (e.full != null) o.full = Math.max(0, Math.min(500, +e.full || 0));
    if (e.mid != null) o.mid = Math.max(0, Math.min(500, +e.mid || 0));
    if (e.weak != null) o.weak = Math.max(0, Math.min(500, +e.weak || 0));
    if (e.peak) o.peak = Math.max(0, Math.min(100000, +e.peak || 0));
    if (e.tut) o.tut = Math.max(0, Math.min(36000, +e.tut || 0));
    if (e.strong) o.strong = Math.max(0, Math.min(36000, +e.strong || 0));
    if (e.ecc) o.ecc = Math.max(0, Math.min(600, +e.ecc || 0));
    if (e.game) o.game = String(e.game).slice(0, 24);
    return o;
  }

  function unwire(id, o) {
    return {
      t: +o.ts || 0, ex: o.exercise, band: o.band || '', reps: +o.reps || 0,
      full: o.full, mid: o.mid, weak: o.weak,
      peak: +o.peak || 0, tut: +o.tut || 0, strong: +o.strong || 0, ecc: +o.ecc || 0,
      game: o.game || '', profile: o.profileId || 'default', _sid: id, _remote: 1
    };
  }

  /* ── state ────────────────────────────────────────────────────────────── */

  function status() {
    var st = read(K_STATE, {});
    var sent = read(K_SENT, []);
    var hist = read(HISTORY, []);
    var pending = 0;
    if (st.hid && Array.isArray(hist)) {
      var seen = {}; sent.forEach(function (i) { seen[i] = 1; });
      for (var i = 0; i < hist.length; i++) {
        if (hist[i] && hist[i].ex && !seen[setId(hist[i])]) pending++;
      }
    }
    return {
      state: !available() ? 'unavailable' : (!configured() && !nativeBridge() ? 'unconfigured'
             : (st.hid ? 'paired' : (st.pendingHid ? 'waiting' : 'unpaired'))),
      household: st.hid || null,
      uid: st.uid || null,
      pending: pending,
      lastSync: st.lastSync || 0,
      error: st.error || null
    };
  }

  /* ── pairing ──────────────────────────────────────────────────────────── */

  /* No 0/O and no 1/I/L - this gets read off a television across a room and
     typed on a phone. 32^6 is about 1.07 billion, and a code lives 5 minutes. */
  var ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

  function randomCode(n) {
    var out = '', a = new Uint8Array(n);
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < n; i++) out += ALPHABET[a[i] % ALPHABET.length];
    return out;
  }
  function randomId(n) {
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var out = '', a = new Uint8Array(n);
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < n; i++) out += chars[a[i] % chars.length];
    return out;
  }

  function ensureHousehold() {
    var st = read(K_STATE, {});
    if (st.hid) return Promise.resolve(st.hid);
    return tokenFor().then(function () {
      var s = read(K_STATE, {});
      var hid = randomId(22);
      /* One multi-path PATCH at the root writes every path atomically, so a
         half-created household cannot exist. */
      var patch = {};
      patch['households/' + hid + '/meta/createdAt'] = { '.sv': 'timestamp' };
      patch['households/' + hid + '/members/' + s.uid] = { role: 'owner', addedAt: { '.sv': 'timestamp' } };
      patch['userIndex/' + s.uid] = hid;
      return call('PATCH', '', patch).then(function () {
        s.hid = hid; write(K_STATE, s); fire();
        return hid;
      });
    });
  }

  function startPairing() {
    return ensureHousehold().then(function (hid) {
      var st = read(K_STATE, {});
      var code = randomCode(6);
      return call('PUT', '/invites/' + code, {
        householdId: hid, invitedBy: st.uid, createdAt: { '.sv': 'timestamp' }
      }).then(function () {
        var base = (CFG && CFG.phoneUrl) || 'https://x3f-tv.web.app/';
        return { code: code, url: base + '#invite=' + code, expiresInMs: 300000 };
      });
    });
  }

  /* The phone writes BLIND rather than reading first - it has no read
     permission on an invite it has not claimed. A wrong code fails the rules,
     which the UI shows as "code not recognised". */
  function claim(code) {
    code = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (code.length !== 6) return Promise.reject(new Error('A code is 6 characters.'));
    return tokenFor().then(function () {
      var st = read(K_STATE, {});
      return call('PATCH', '/invites/' + code, { claimedBy: st.uid, claimedAt: { '.sv': 'timestamp' } })
        .then(function () { return call('GET', '/invites/' + code); })
        .then(function (inv) {
          if (!inv || !inv.householdId) throw new Error('That code is not recognised.');
          var s = read(K_STATE, {});
          s.pendingHid = inv.householdId;
          write(K_STATE, s);
          return call('PUT', '/userIndex/' + s.uid, inv.householdId).then(function () {
            return { householdId: inv.householdId, waiting: true };
          });
        });
    });
  }

  /* The TV side of the human step. Granting membership and consuming the invite
     happen in ONE atomic multi-path write, so a code can never outlive the join
     it authorised. */
  function confirm(code, joinerUid) {
    var st = read(K_STATE, {});
    if (!st.hid) return Promise.reject(new Error('Not paired.'));
    var patch = {};
    patch['households/' + st.hid + '/members/' + joinerUid] = { role: 'member', addedAt: { '.sv': 'timestamp' } };
    patch['invites/' + code] = null;
    return call('PATCH', '', patch);
  }

  /* ── the two halves of the human step ─────────────────────────────────── */

  /* TV SIDE. Nothing in the rules can tell the television that a phone has
     knocked, because there are no Cloud Functions on Spark and therefore no way
     to push. So the TV polls its own invite - a read it is explicitly granted
     ("invitedBy === auth.uid") and which returns one tiny object.

     Three seconds, not one: the code is only alive for five minutes, a human is
     typing six characters on a phone in that window, and RTDB bills downloaded
     bytes. 100 polls covers the full life of the code and then stops on its own,
     so a pairing dialog left open on a television does not poll until the set is
     unplugged. */
  function watchInvite(code, onClaim) {
    var stopped = false, tries = 0;
    function tick() {
      if (stopped) return;
      if (++tries > 100) return;
      call('GET', '/invites/' + code).then(function (inv) {
        if (stopped) return;
        if (inv && inv.claimedBy) { try { onClaim(inv.claimedBy); } catch (e) {} return; }
        setTimeout(tick, 3000);
      }, function () { if (!stopped) setTimeout(tick, 4000); });
    }
    setTimeout(tick, 2500);
    return function () { stopped = true; };
  }

  /* PHONE SIDE. After claim() the phone holds a household id it cannot yet read
     anything from, and it finds out that changed by BEING REFUSED UNTIL IT IS
     NOT. That reads like a hack and is actually the design: membership is the
     only thing the rules gate on, so "can I read one byte of this household"
     and "am I a member of it" are the same question, and there is no second
     source of truth to disagree with.

     Which is why a rejection is not an error here. Only running out of patience
     is - six minutes, comfortably longer than the code's five, so the failure a
     user sees is "the code expired" rather than two different clocks. */
  function awaitJoin(onJoined, onGiveUp) {
    var hid = read(K_STATE, {}).pendingHid;
    if (!hid) { if (onGiveUp) onGiveUp(new Error('Nothing to wait for.')); return function () {}; }
    var stopped = false, tries = 0;
    function tick() {
      if (stopped) return;
      if (++tries > 145) { if (onGiveUp) onGiveUp(new Error('The TV never confirmed.')); return; }
      var uid = read(K_STATE, {}).uid;
      call('GET', '/households/' + hid + '/members/' + uid + '/role').then(function (role) {
        if (stopped) return;
        if (role) {
          var s = read(K_STATE, {});
          s.hid = hid; delete s.pendingHid; s.error = null;
          write(K_STATE, s);
          fire();
          try { onJoined(hid); } catch (e) {}
          return;
        }
        setTimeout(tick, 2500);
      }, function () { if (!stopped) setTimeout(tick, 2500); });
    }
    tick();
    return function () { stopped = true; };
  }

  /* ── push / pull ──────────────────────────────────────────────────────── */

  function push() {
    var st = read(K_STATE, {});
    if (!st.hid) return Promise.resolve({ pushed: 0 });
    var hist = read(HISTORY, []);
    if (!Array.isArray(hist) || !hist.length) return Promise.resolve({ pushed: 0 });

    var sent = read(K_SENT, []);
    var seen = {}; sent.forEach(function (i) { seen[i] = 1; });

    var patch = {}, ids = [], n = 0;
    for (var i = 0; i < hist.length && n < 200; i++) {
      var e = hist[i];
      if (!e || !e.ex) continue;
      /* Untracked volume sets (the Hypertrophy program's supersets) are
         deliberately never synced - they are not PBs and not challenges, and
         syncing them would triple the traffic for no reader. */
      if (e.tracked === false) continue;
      var id = setId(e);
      if (seen[id]) continue;
      patch['households/' + st.hid + '/sets/' + bucketOf(e) + '/' + id] = wire(e, st.uid);
      ids.push(id); n++;
    }
    if (!n) return Promise.resolve({ pushed: 0 });

    return call('PATCH', '', patch).then(function () {
      var s2 = read(K_SENT, []);
      write(K_SENT, s2.concat(ids));
      var s = read(K_STATE, {}); s.lastSync = Date.now(); s.error = null; write(K_STATE, s);
      fire();
      return { pushed: n };
    }).catch(function (err) {
      var s = read(K_STATE, {}); s.error = String(err.message || err); write(K_STATE, s);
      fire();
      throw err;
    });
  }

  /* Pull only the buckets that can contain something new: this month, and last
     month for the first few days of a new one. RTDB bills downloaded bytes
     including protocol overhead, so pulling the whole tree every time is the
     expensive mistake here. */
  function buckets() {
    var d = new Date(), out = [];
    function b(dt) { return String(dt.getFullYear()) + ('0' + (dt.getMonth() + 1)).slice(-2); }
    out.push(b(d));
    var prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    if (d.getDate() <= 5) out.push(b(prev));
    return out;
  }

  function pull() {
    var st = read(K_STATE, {});
    if (!st.hid) return Promise.resolve({ merged: 0 });
    var bs = buckets();
    return Promise.all(bs.map(function (b) {
      return call('GET', '/households/' + st.hid + '/sets/' + b).catch(function () { return null; });
    })).then(function (chunks) {
      var hist = read(HISTORY, []);
      if (!Array.isArray(hist)) hist = [];
      var have = {};
      hist.forEach(function (e) { if (e && e.ex) have[setId(e)] = 1; });
      var tomb = {}; (st.tombstones || []).forEach(function (t) { tomb[t] = 1; });

      var merged = 0, arrived = [];
      chunks.forEach(function (c) {
        if (!c) return;
        Object.keys(c).forEach(function (id) {
          if (have[id] || tomb[id]) return;
          var e = unwire(id, c[id]);
          if (!e.ex || !e.t) return;
          hist.push(e); have[id] = 1; arrived.push(id); merged++;
        });
      });

      if (merged) {
        hist.sort(function (a, b2) { return (a.t || 0) - (b2.t || 0); });
        write(HISTORY, hist);

        /* A SET THAT ARRIVED FROM THE SERVER IS ALREADY ON THE SERVER.

           Without this, a pulled set sits in local history with no entry in
           K_SENT, so status() counts it as "waiting to upload" - and it stays
           counted, because nothing ever clears it except a push that uploads it
           again. On a two-device household that meant every set was written
           twice and every screen that reports the queue was wrong about it
           permanently. RTDB bills downloaded bytes and Spark has a daily
           ceiling, so a duplicate write is not free; and "3 sets waiting" on a
           panel where nothing is waiting is the kind of small lie that teaches
           someone to stop reading the panel.

           It is safe because setId() is content-addressed: the id recorded here
           is exactly the id push() would compute for the same entry, so the two
           halves cannot disagree about what has been sent. */
        var sent = read(K_SENT, []);
        write(K_SENT, sent.concat(arrived));
        /* The program brain memoises on a revision key, so it has to be told
           the log changed underneath it or the dashboard shows stale totals. */
        try { if (window.X3FProg && window.X3FProg.invalidate) window.X3FProg.invalidate(); } catch (e) {}
      }
      var s = read(K_STATE, {}); s.lastSync = Date.now(); s.error = null; write(K_STATE, s);
      fire();
      return { merged: merged };
    });
  }

  /* ── auto ─────────────────────────────────────────────────────────────── */

  var autoOn = false, lastAuto = 0;
  function sync() {
    if (!read(K_STATE, {}).hid) return Promise.resolve();
    if (Date.now() - lastAuto < 20000) return Promise.resolve();
    lastAuto = Date.now();
    return push().then(pull).catch(function () {});
  }
  function auto(on) {
    autoOn = on !== false;
    if (!autoOn) return;
    if (!openNetwork()) return;
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && autoOn) sync();
    });
    window.addEventListener('x3f-set-logged', function () { if (autoOn) sync(); });
    sync();
  }

  function forget() {
    write(K_STATE, {});
    write(K_SENT, []);
    tok = null; tokExp = 0;
    fire();
  }

  window.X3FSync = {
    available: available, configured: configured, status: status,
    startPairing: startPairing, claim: claim, confirm: confirm,
    watchInvite: watchInvite, awaitJoin: awaitJoin,
    push: push, pull: pull, sync: sync, auto: auto, forget: forget,
    openNetwork: openNetwork,
    setId: setId,
    /* Test seam. tools/force-test asserts the root-PATCH URL, because getting it
       wrong is silent, total, and indistinguishable from being offline. */
    _url: urlFor,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };
})();
