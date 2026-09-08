# Firebase — what you need to do

Everything that can be built without touching a console is built. This is the part that
needs your Google account, plus a straight answer on what would ever cost money.

**Short version: this will cost you nothing, and it is structurally impossible for it to
cost you anything as long as you never link a billing account.** Spark quotas shut a
product *off* rather than billing you. Your actual volume — a few hundred small records a
month — is three to four orders of magnitude below the first billable unit on every axis.

---

## The design, in four sentences

**Realtime Database, not Firestore.** The TV app has zero third-party dependencies and a
sub-5 MB APK budget, so there is no Firebase SDK on it — and **Firestore's realtime listen
is gRPC/WebChannel only, so over plain REST it could only ever be polled.** RTDB's REST API
speaks Server-Sent Events, so a live push channel is about 120 lines of
`HttpsURLConnection`. Everything else (JSON wire format instead of Firestore's typed value
wrappers, byte-based billing instead of per-operation, one small tree instead of a document
store) points the same way.

**Anonymous auth plus a QR code.** No password is ever typed on a TV remote. The TV mints a
6-character code, shows it as a QR that opens your phone build directly; the phone claims
it; **you press OK on the TV to let the device in.** That last step is not a limitation
worked around — with no server there is no way for rules to prove a code was minted *for a
particular person*, so joining is gated on a human on the couch who can see who they just
gave the code to. Claiming a code grants nothing on its own.

---

## Do this once (about 15 minutes)

Steps marked ⚠ are **permanent and cannot be changed afterwards.**

1. <https://console.firebase.google.com/> → **Create a project**.
2. Name it `x3f-tv`.
3. ⚠ **Check the project ID** under the name and edit it now if you care — it is permanent
   and appears in your database URL and every REST path.
4. **Gemini in Firebase — decline.** Not needed, adds surface area.
5. **Google Analytics — decline** (toggle off). You can add it later; declining keeps the
   project simple.
6. **Create project** → wait → **Continue**.
7. **Confirm you are on Spark.** Bottom-left of the console, or ⚙ **Project settings →
   Usage and billing**. **Do not click Upgrade.** With no Cloud Billing account linked, you
   cannot be charged.
8. ⚠ ⚙ **Project settings → General → Default GCP resource location** → `nam5`
   (US multi-region) or `us-central`. Permanent.
9. **Build → Realtime Database → Create Database.**
   ⚠ Location: pick **us-central1** — it is the only one that gives the short
   `https://<name>.firebaseio.com` URL. Choose **Start in locked mode** → **Enable**.
   **Copy the database URL** from the top of the Data tab.
10. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.**
    Nothing works until this is on.
11. **Realtime Database → Rules tab** → paste the whole of
    [`firebase/database.rules.json`](../firebase/database.rules.json) → **Publish**.
12. ⚙ **Project settings → General → Your apps** → the **Web** (`</>`) icon → nickname it →
    **do not** tick "Also set up Firebase Hosting" (we use GitHub Pages) → **Register app**
    → copy the `firebaseConfig` object.
13. Put three values from it — `apiKey`, `projectId`, `databaseURL` — into
    `web/x3f-firebase-config.js`. **The API key is not a secret**; it identifies the
    project, it does not authorise anything. The security rules do that. It is fine
    committed to a public repo.
14. **Do not enable Cloud Storage.** Since 3 Feb 2026 any use of it forces Blaze.

### Then check it actually worked

```bash
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=YOUR_API_KEY" -H 'Content-Type: application/json' -d '{"returnSecureToken":true}'
```

That should return an `idToken`. Then, using that token:

```bash
curl -s -X PUT "https://YOUR-DB.firebaseio.com/households/nope/x.json?auth=YOUR_ID_TOKEN" -d '{"a":1}'
```

**This one must FAIL with a permission error.** If it succeeds, your rules did not publish
— give it a minute and try again before assuming something is wrong.

### Optional, recommended

Google Cloud console → **APIs & Services → Credentials** → open the auto-created "Browser
key" → **API restrictions** → restrict to **Identity Toolkit API**, **Token Service API**,
and **Firebase Realtime Database API**.

**Do not add an HTTP-referrer restriction** unless you create a separate key for the
Android client — a referrer-restricted key rejects the TV app's requests, and the failure
looks like a mysterious auth bug.

---

## What would force you onto Blaze (pay-as-you-go)

None of these are in the design. This is the list so you can recognise one if it ever comes
up:

1. **Deploying any Cloud Function.** Emulating them locally is free; deploying is not. This
   is the big one, and it is why pairing is split into claim-then-confirm.
2. **Cloud Storage for Firebase — any use at all**, since 3 February 2026.
3. **Firebase App Hosting.**
4. **Phone / SMS authentication.** No free tier at all.
5. **More than one Realtime Database instance** in a project.
6. **Any Google Cloud product** — Cloud Run, Cloud Build, Cloud Tasks, Cloud Scheduler,
   Pub/Sub, Secret Manager, BigQuery export, Vertex AI / Gemini via Firebase AI Logic.
7. **Firebase Data Connect** after its 3-month trial.
8. **Firebase Extensions**, paid tier.
9. **Firestore Enterprise edition** (if you ever overrule the RTDB choice, pick
   **Standard**).
10. **Raising Spark's structural ceilings** — e.g. RTDB simultaneous connections
    (100 → 200,000), or the Auth email quotas.
11. **Firebase Test Lab** beyond 10 virtual / 5 physical tests per day.

Two things people wrongly believe force Blaze, but don't: **minting custom tokens** and
**setting custom claims** need a *service account key*, not a paid plan. There is simply no
always-on place to run the Admin SDK on Spark, which is the real reason the design avoids
them.

### And if you did upgrade

**It would still be $0.00/month.** Blaze includes the same free allowances and bills only
above them, and your volume is nowhere near. For reference, RTDB on Blaze is **$5/GB
stored per month** and **$1/GB downloaded**. Your entire history for a year is well under a
megabyte.

The one thing to know if you ever do link billing: **budget alerts do not cap spend** for
Firestore, RTDB, Auth or Hosting. They tell you, they don't stop you.

---

## Spark's real limits, against your actual usage

| | Spark allows | You will use |
|---|---|---|
| RTDB stored | 1 GB | well under 1 MB/year |
| RTDB downloaded | 10 GB/month | a few MB |
| RTDB simultaneous connections | 100 | 2–4 |
| Anonymous sign-ups | 100/hour **per IP** | 1, ever, per device |
| Auth users | unlimited on Spark | 2–5 |

The only one you can realistically hit is **100 anonymous sign-ups per hour per IP** — and
only by repeatedly reinstalling during testing. The refresh token is cached in app-private
storage precisely so a normal install signs up exactly once.

---

## Six things that will otherwise cost you an evening

1. **RTDB auth is a query parameter, not a header** — `?auth=<idToken>`. That is what makes
   browser `EventSource` work at all. It also means tokens end up in URLs, so keep them out
   of logs.
2. **The SSE stream's token cannot be refreshed in place.** You get `auth_revoked` roughly
   hourly. The client refreshes at ~55 minutes and reconnects deliberately.
3. **`securetoken.googleapis.com` returns snake_case** (`id_token`, `refresh_token`) while
   `identitytoolkit.googleapis.com` returns camelCase (`idToken`, `refreshToken`). Same
   payload, two parsers. This is a real, documented inconsistency, not a typo.
4. **`.read`/`.write` cascade to children; `.validate` does not.** Granting write at a
   parent cannot be narrowed at a child — which is why any household member can, in
   principle, delete the household. Accepted knowingly; see the notes in the rules file.
5. **Rules propagation is not instant** — up to 1 minute for new requests and up to
   **10 minutes** for active listeners. Do not conclude your rules are broken from a test
   five seconds after publishing.
6. **Losing the anonymous account loses household membership.** There is no password to
   reset. The re-invite path exists for exactly this; don't remove it.

---

## How the TV is allowed to reach Firebase at all

The shell blocks **all** network from the WebView by default — a `file://` page holding a
Java bridge has no business reaching the internet, and that block is what makes the
"works offline forever" claim true rather than aspirational.

Sync is the one exception, and it is opened deliberately:

1. Nothing happens unless `web/x3f-firebase-config.js` actually has your values in it.
2. The page then calls `X3F.enableSync(true)`.
3. The shell lifts the block and allows **four hosts, exactly**:
   `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `*.firebaseio.com`,
   `*.firebasedatabase.app`. No fonts, no analytics, no CDN, nothing else.

If you never set Firebase up, the app never opens a socket in its life.

**The honest trade-off:** the original plan was a full REST client in Java — anonymous
auth, an SSE reader, a callback bridge, roughly 150 lines. There is no Android SDK on this
machine, so none of that could be compiled, let alone run, and `web/x3f-sync.js` already
speaks the whole protocol correctly over `fetch()`. Twelve lines of allowlist that can be
read and reasoned about completely beat 150 lines that cannot be tested. The upgrade path
is kept open: `x3f-sync.js` still prefers an `X3F.rtdb()` bridge if the shell ever grows
one, and that version would also keep sync alive across page navigations instead of
restarting with every document.

---

## Seeing your progress on your phone

There are two ways, and they are both real. Pick by whether you want a network involved.

### Paired (automatic, both directions)

1. **Turn GitHub Pages on, once.** Repo → Settings → Pages → *Deploy from a branch* →
   `gh-pages` / `(root)`. The `Publish web games` workflow already pushes `web/` to that
   branch on every commit that touches it; Pages just has to be told to serve it. After
   that, <https://goobisgabe.github.io/x3f-tv/> is the phone app. HTTPS matters here for a
   second reason too: Web Bluetooth will not run on a phone over plain HTTP, so this is
   also what makes the games work with the bar.
2. **On the TV:** Settings → **Pair a phone**. It shows six characters and starts waiting.
3. **On the phone:** open the site → **Sync with TV** → type the code. (If you follow the
   link the TV prints, the code is already in it and the phone skips straight to claiming.)
4. **Back on the TV:** it asks *A phone is asking to join*. Press **Allow**.

From then on **Progress** on the phone pulls the moment you open it, and anything you log
on the phone goes back to the television. Sets you logged on either device *before* pairing
come across too — the first sync pushes your whole local history.

The middle step is the design, not an inconvenience. Claiming a code grants nothing at all;
membership is granted by someone pressing OK on the television, in front of a human who can
see who they just read the code out to. There are no Cloud Functions on Spark, so there is
nowhere to run trusted code, so there is no such thing as an unforgeable invite token —
physical presence is doing that job instead.

### Unpaired (manual, no account, no network)

Progress → **Export my history** on one device, **Import from text** on the other. It
merges and skips anything already present. This has always worked and still does; pairing
does not replace it, and nothing about it needs Firebase to exist.

## What I could not do for you

- **Create the project.** That needed your Google account. You had already made
  `x3f-tv` on Spark, and everything below it — Realtime Database in `us-east1`, anonymous
  auth, the published rules — was set up against that project.
- **Nothing else, as it turns out.** The rules are no longer "checked by reading". They are
  exercised against the live database by `bash firebase/verify.sh`: 23 assertions, every
  clause positive *and* negative, including the `"$other": {".validate": false}` key
  allowlist that this section used to flag as unconfirmed. It is confirmed — an unexpected
  key is rejected, and the test proves it every time it runs.

  That is not a footnote. The first version of these rules was carefully reasoned about and
  completely broken: creating a household — the very first thing anyone does — was denied,
  and no amount of re-reading found it. One `curl` did. Run `verify.sh` after any rules
  change, and do not trust a rules file you have only read.
