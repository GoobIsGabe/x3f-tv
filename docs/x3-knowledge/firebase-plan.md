# Firebase for X3F — Plan, Limits, and Wire Protocol Reference

**Researched:** 7 September 2026. All figures read off Google's own docs on that date unless marked otherwise.
**Scope:** Android TV app (Java, WebView UI, zero third-party deps, ~5 MB APK budget, must work fully offline) + a static web build on GitHub Pages. Both sync one household's workout history. 2–4 profiles, a few hundred set records a month.

---

## 0. Confidence markers used in this document

| Marker | Meaning |
|---|---|
| **[DOC]** | Read directly from an official Google/Firebase/GitHub doc page, cited at the point of use. |
| **[DERIVED]** | Arithmetic or logic applied to a **[DOC]** fact. The inputs are cited; the conclusion is mine. |
| **[UNVERIFIED]** | Plausible, widely repeated, or from a secondary source — **not** confirmed from a primary doc in this research pass. Do not build a decision on it without checking. |
| **[DESIGN]** | My proposal. Not a fact about Firebase. Verify against the Local Emulator Suite before shipping. |

There is a consolidated list of everything uncertain in §13. Read it before you rely on this file.

---

## 1. TL;DR — the recommendation

**Use Realtime Database, not Firestore. Use anonymous auth plus a QR-carried invite code, with a 6-character typed code as fallback. Stay on Spark. Talk to both from plain REST — no Firebase SDK on the TV; the CDN SDK on the phone is optional and probably worth it.**

The single fact that decides Firestore vs RTDB for this project:

> Firestore's `Listen` RPC is bidirectional-streaming and **"is only available via gRPC or WebChannel (not REST)"** — Google Cloud Firestore RPC reference. RTDB's REST API, by contrast, speaks Server-Sent Events: set `Accept: text/event-stream` and you get a live push stream from a plain HTTP client. **[DOC]**

With no Firebase SDK on the TV, Firestore can only ever be polled. RTDB gives you a real push channel out of `HttpsURLConnection` and about 120 lines of Java. Every secondary consideration (JSON-shaped wire format vs Firestore's typed `Value` wrapper, byte-based billing vs per-operation billing, one tiny JSON tree vs a document store) points the same way.

The counter-argument is real and worth stating: Firebase officially recommends Firestore for new projects, and at this volume Firestore polling would also fit inside the free quota with room to spare. If this project ever grows a real backend and a mobile SDK, revisit. Today it does not have one, and RTDB is a strictly smaller amount of code to write and maintain.

---

## 2. The Spark (no-cost) plan — current limits

Read from <https://firebase.google.com/pricing> and the per-product quota pages on 7 Sep 2026.

### 2.1 Cloud Firestore (Standard edition) **[DOC]**

| Metric | Spark limit |
|---|---|
| Document reads | 50,000 / day |
| Document writes | 20,000 / day |
| Document deletes | 20,000 / day |
| Stored data | 1 GiB total |
| Network egress | 10 GiB / month |

Daily quotas reset "around midnight Pacific time" — <https://firebase.google.com/docs/firestore/quotas>. **[DOC]**

Structural limits that apply on every plan:
- Max document size **1 MiB (1,048,576 bytes)** **[DOC]**
- Max index entries per document: 40,000 **[DOC]**
- Max indexed field value: 1,500 bytes (longer values are truncated for indexing) **[DOC]**
- Exactly one no-cost database per project; up to 100 databases total **[DOC]**
- Composite indexes: 1,000 — "for databases with billing enabled", so the Spark ceiling is not stated on that page **[DOC]** / **[UNVERIFIED]** for Spark specifically

### 2.2 Realtime Database **[DOC]**

| Metric | Spark limit |
|---|---|
| Simultaneous connections | **100** |
| GB stored | 1 GB |
| GB downloaded | 10 GB / month |
| Database instances per project | 1 (the default). Multiple instances require Blaze — <https://firebase.google.com/docs/database/locations> |

"A simultaneous connection is equivalent to one mobile device, browser tab, or server app connected to the database" — <https://firebase.google.com/docs/database/usage/limits>. **[DOC]** An open SSE stream is one connection. Blaze raises this to 200,000.

Structural limits, all plans **[DOC]**:

| Property | Limit |
|---|---|
| Child node depth | 32 levels |
| Key length | 768 bytes (UTF-8) |
| String value size | 10 MB |
| Single read response | 256 MB |
| Write rate | 1,000 writes/second |
| Single write request | 256 MB (REST) / 16 MB (SDKs) |
| Sustained byte throughput | 64 MB per minute |
| Query execution time | 15 min (5 s in the console) |
| Nodes in a queryable path | 75 million cumulative |

### 2.3 Authentication **[DOC]**

| Metric | Spark |
|---|---|
| Monthly active users | 50,000 MAU |
| Monthly active users, SAML/OIDC | 50 MAU |
| Phone auth / SMS | **No free tier — billed per SMS sent** (so effectively Blaze-only) |

Rate and volume limits from <https://firebase.google.com/docs/auth/limits> **[DOC]**:

| Limit | Value |
|---|---|
| New account creation (email/password **and anonymous**) | **100 accounts/hour per IP address** |
| Max anonymous accounts per project | 100 million |
| Registered (non-anonymous) accounts | unlimited |
| Account deletion | 10 accounts/second |
| Identity Toolkit API, per project | 1,000 req/s, 10 million req/day |
| Custom-token sign-ins | 45,000 sign-ins/minute |
| Secure-token exchange (refresh) | 18,000 exchanges/minute |

Email quotas differ by plan **[DOC]**:

| Email type | Spark | Blaze |
|---|---|---|
| Address verification | 1,000/day | 100,000/day |
| Password reset | 150/day | 10,000/day |
| Email-link sign-in | **5/day** | 25,000/day |

> The 100-accounts/hour-per-IP cap on **anonymous** sign-ups is the one that will bite you during development. A reinstall-and-test loop on one Wi-Fi network creates a fresh anonymous account each time. Cache the refresh token and reuse it (see §7.2), and use the Auth emulator for iteration.

### 2.4 Hosting **[DOC]** — with a documented contradiction

| Metric | Spark |
|---|---|
| Storage | 10 GB |
| Custom domain & SSL | included |
| Data transfer | **360 MB/day** per <https://firebase.google.com/pricing> — but <https://firebase.google.com/docs/hosting/usage-quotas-pricing> says "Data transfer from the CDN to your end users is at no cost up to 10 GB/month" |

360 MB/day × 30 = 10.8 GB/month, so the two figures are near-equivalent, but they are enforced differently (a daily cap fails differently from a monthly one). **[UNVERIFIED]** which is actually enforced. Irrelevant for us — we are hosting on GitHub Pages — but note the failure mode: on Spark, exceeding it means "we offer a short grace period but then your sites will be disabled" until the next month. **[DOC]**

### 2.5 Cloud Functions — **still Blaze-only in 2026** **[DOC]**

Yes, functions still require Blaze. The Cloud Functions get-started doc says, verbatim:

> "You can emulate functions in any Firebase project, but to deploy functions, your project must be on the Blaze pricing plan." — <https://firebase.google.com/docs/functions/get-started>

The Spark column on the pricing page shows the free-tier *allowances* (2M invocations/month, 400K GB-seconds, 200K CPU-seconds, 5 GB outbound networking) but those allowances only become reachable once you are on Blaze. The emulator runs on Spark; deployment does not.

**Consequence for this project: every design below assumes there is no server-side code of any kind.** No custom tokens, no custom claims, no server-side validation beyond security rules.

### 2.6 Cloud Storage — **now Blaze-only, as of 3 February 2026** **[DOC]**

This is a genuine 2026 change and the most likely thing to catch you out if you half-remember the old free tier.

From <https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024>: Cloud Storage for Firebase now requires a project on the pay-as-you-go Blaze plan. Projects that stay on Spark lose access entirely — API calls return **402 or 403**, buckets become inaccessible in both the Firebase and Google Cloud consoles, existing data stays stored but unreachable, and no new default buckets can be provisioned. "No-cost usage is still available even on the Blaze pricing plan." **[DOC]**

New default buckets are named `PROJECT_ID.firebasestorage.app`; pre-Sept-2024 buckets keep `PROJECT_ID.appspot.com` and their old no-cost limits (5 GB stored, 1 GB/day downloads, 20K upload ops/day, 50K download ops/day). **[DOC]**

**Do not use Cloud Storage in this project.** Workout records are small JSON. If you ever need to store an image, put it in the GitHub Pages repo or base64 it into a database value (respecting the 10 MB RTDB string limit).

### 2.7 Everything else on Spark **[DOC]**

| Product | Spark |
|---|---|
| App Hosting | **Not available** |
| SQL Connect (Data Connect) | 3-month no-cost trial, limit 1 per project |
| Test Lab | 10 virtual device tests/day, 5 physical/day |
| App Check | Available. But: on Spark only 4 of the 11 reCAPTCHA Enterprise score levels are exposed (0.1, 0.3, 0.7, 0.9) **[UNVERIFIED]** — from a secondary summary of the App Check docs, worth re-checking |
| Analytics, Crashlytics, FCM, Remote Config, Performance | Free on both plans **[UNVERIFIED]** — Remote Config changed, see §2.8 |
| Local Emulator Suite | Free, no billing required, runs offline. Emulates Firestore, RTDB, Cloud Storage, Auth, Functions, Pub/Sub, Extensions **[DOC]** |

### 2.8 2026 platform changes worth knowing **[DOC]**

From <https://firebase.google.com/support/releases>:

- **1 Sep 2026** — Remote Config moved to usage-based pricing on Blaze; no-cost tier is up to 100,000 daily fetch requests.
- **3 Feb 2026** — Cloud Storage requires Blaze (see §2.6).
- **20 Jul 2026** — Firebase Extensions announced as sunsetting **31 March 2027**. Deployed extensions keep running but become unmanageable after that date.
- **11 Jun 2026** — Firebase ML shutting down **15 June 2027**.
- **19 Mar 2026** — Firebase Studio sunsets **22 March 2027**; deployed apps keep running.
- **20 Apr 2026** — Firestore Pipeline operations went GA; Enterprise edition raised max document size to 16 MiB.
- **16 Jan 2026** — Cloud Shell is now available inside the Firebase console (browser terminal with the Firebase CLI, no local install).

None of these break the plan below. The Extensions and Studio sunsets are a reasonable signal to keep the dependency surface small, which this design already does.

### 2.9 What happens when you blow a Spark quota

> "If you exceed the no-cost quota limit in a calendar month for any product, your project's usage of that specific product will be shut off for the remainder of that month." — <https://firebase.google.com/docs/projects/billing/firebase-pricing-plans> **[DOC]**

The Firebase FAQ phrases it as "your app will be shut off for the remainder of that month." **[DOC]** Note the mismatch: quotas are mostly *daily* but the shutdown is described as *monthly*. **[UNVERIFIED]** which applies to Firestore/RTDB in practice. Either way: Spark fails closed, it never bills you. That is exactly the property we want.

---

## 3. Firestore vs Realtime Database for *this* use case

### 3.1 What the official comparison says **[DOC]**

From <https://firebase.google.com/docs/database/rtdb-vs-firestore>:

| Dimension | Firestore | Realtime Database |
|---|---|---|
| Data model | Collections of documents, subcollections | "one large JSON tree" |
| Queries | Indexed, compound sorting + filtering, shallow, cost proportional to result set | "Deep queries with limited sorting and filtering" — sort **or** filter, not both |
| Scaling | Automatic; no connection or write-rate ceiling | ~200,000 concurrent connections, 1,000 writes/s per database; shard beyond that |
| Billing | Per **operation** (read/write/delete), lower bandwidth rates | Per **bandwidth and storage**, at higher rates |
| Uptime | "Typical uptime performance of 99.999%", multi-region | "Typical uptime performance of 99.95%", regional |
| Recommendation | Firebase recommends Firestore for new customers | For "simple data models needing low-latency synchronization" |

On the merits of the general comparison, Firestore wins. For this specific project, three constraints invert the result.

### 3.2 Constraint 1 — no SDK on the TV means no Firestore realtime, at all

Confirmed from the RPC reference (<https://cloud.google.com/firestore/docs/reference/rpc/google.firestore.v1>): `Listen` and `Write` are bidirectional-streaming RPCs, and the docs state the method **"is only available via gRPC or WebChannel (not REST)."** **[DOC]**

`documents:listen` *does* appear in the REST discovery document with a POST flatPath **[DOC]**, which is misleading — the HTTP transcoding of a bidi-streaming RPC is not consumable by `HttpsURLConnection` or `fetch()`. Treat Firestore realtime as unavailable without the SDK. **[DERIVED]**

Unary/server-streaming Firestore RPCs that *are* usable over REST: `GetDocument`, `CreateDocument`, `UpdateDocument` (`patch`), `DeleteDocument`, `Commit`, `BatchWrite`, `BatchGetDocuments`, `BeginTransaction`, `Rollback`, `RunQuery`, `RunAggregationQuery`, `PartitionQuery`, `ListDocuments`, `ListCollectionIds`. **[DOC]**

RTDB's REST API, meanwhile, is documented to support Server-Sent Events (<https://firebase.google.com/docs/database/rest/retrieve-data>): set `Accept: text/event-stream`, honour HTTP 307 redirects, pass `auth` as a query parameter, and you receive named events `put`, `patch`, `keep-alive`, `cancel`, and `auth_revoked`. **[DOC]**

**Weigh this honestly.** The primary data direction here is TV → phone: sets are logged on the TV and read on the phone. The phone gets realtime for free from whichever web SDK it uses. So the TV strictly *needs* realtime for only two things: (a) seeing the invite code get claimed during pairing, and (b) picking up profile/program edits made on the phone. Both survive a 2–5 second poll. The argument for RTDB is therefore **less code and lower latency**, not "Firestore cannot work."

### 3.3 Constraint 2 — the wire format is code you have to write

RTDB REST is plain JSON in, plain JSON out. `PUT /households/h1/sets/s9.json` with `{"reps":18,"exercise":"Chest Press"}` and you are done.

Firestore REST requires the typed `Value` envelope on every field, in both directions. The same record becomes:

```json
{"fields":{"reps":{"integerValue":"18"},"exercise":{"stringValue":"Chest Press"}}}
```

Note `integerValue` is a **JSON string**, not a number. **[DOC]** Choosing Firestore means writing and maintaining a bidirectional `Value` ⟷ `JSONObject` marshaller in Java, plus a second one in JavaScript if you go SDK-less on the web. That is a real, permanent tax on a zero-dependency codebase. **[DERIVED]**

### 3.4 Constraint 3 — the billing model matches the traffic shape

Firestore bills operations. RTDB bills bytes. A hand-rolled client that polls, retries, and re-syncs generates *operations* cheaply but *bytes* barely at all.

Volume model (from the brief: "a few hundred set records a month", 2–4 profiles): **[DERIVED]**

| Quantity | Estimate |
|---|---|
| Set records | ~400/month ≈ 13/day |
| Bytes per record | ~200 B JSON |
| Monthly write volume | ~80 KB |
| A full year of history | ~1 MB |
| RTDB storage used | ~0.001 GB of a 1 GB limit |
| RTDB download, worst case (full 1 MB resync 30×/day) | ~900 MB/month of 10 GB |
| RTDB download, realistic (SSE deltas + one resync/day) | well under 100 MB/month |
| Simultaneous connections | 2–6 of 100 |

Firestore at the same volume, using polling: 2 devices polling every 30 s = 5,760 `runQuery` calls/day. Even charging 1 read per empty query (**[UNVERIFIED]** — the "empty query still costs one read" rule is widely reported but I did not confirm it from a primary doc in this pass), that is 5,760 of 50,000 reads/day. Also fine.

**Both fit. RTDB fits with 100× more headroom and no arithmetic anxiety.** **[DERIVED]**

### 3.5 Offline behaviour — read this carefully, it is the most misunderstood part

The brief says the TV app "must work fully offline." Here is the actual situation:

**With the Firebase SDK** (which we are not using on the TV):
- Firestore Android: offline persistence is **on by default**, 100 MB default cache threshold, minimum 1 MB, `CACHE_SIZE_UNLIMITED` available. You can write, read, query, and listen against the cache while offline. **[DOC]**
- Firestore Web: offline persistence is **off by default**; enable via `persistentLocalCache()` with `persistentSingleTabManager()` or `persistentMultipleTabManager()`. **[DOC]**
- RTDB Android: `setPersistenceEnabled(true)` persists the write queue to disk so queued writes survive an app restart. **[DOC]**

**Without any SDK — our actual situation on the TV — there is no offline layer of any kind.** Neither product gives you anything. Firestore's offline cache is a feature of the *SDK*, not of the service. **[DERIVED]**

So: **offline behaviour is not a Firestore-vs-RTDB discriminator for the TV app.** You are writing it yourself either way. The design is:

1. **Local store is the source of truth for the UI.** Sets are written to a local append-only log (a JSON file in `getFilesDir()`, or SQLite via the framework's `android.database.sqlite` — both are zero-dependency). The UI reads only local state and never blocks on the network.
2. **An outbox.** Each unsynced record carries a client-generated ID and a `pending` flag.
3. **A sync worker** drains the outbox when a network is available, using idempotent writes keyed by the client ID (RTDB `PUT /households/{h}/sets/{bucket}/{clientId}.json` is idempotent by construction — retry is free).
4. **Inbound merge** from the SSE stream (or a poll) applies remote records into the local store, last-write-wins on `ts`, keyed by ID.

Because the record ID is client-generated and the write is a `PUT` to a known path, the whole sync problem collapses to "retry until 200". No conflict resolution, no transactions, no server code. **[DESIGN]**

### 3.6 Where RTDB actually costs you something

Be honest about the downsides:

- **100 simultaneous connections on Spark.** Each browser tab counts. A household of 4 is nowhere near it, but a debugging session with 20 tabs open is closer than you think.
- **Sort OR filter, not both.** At a few hundred records a month you download the month and filter in memory. Not a constraint here, but it *is* a wall if the data model grows.
- **No TTL.** Firestore has TTL policies that auto-delete expired documents with no Functions and no cron (<https://firebase.google.com/docs/firestore/ttl>). RTDB has nothing equivalent — expired invite nodes must be deleted by a client. See §6.6.
- **One database instance on Spark.** No separate dev/prod database in the same project. Use a separate Firebase project for dev, or the emulator.
- **Regional, 99.95% typical uptime** vs Firestore's multi-region 99.999%. For a home gym app this is noise.
- **Cascading `.read`/`.write`.** Granting write at a parent node cannot be revoked at a child. Firestore's rules are per-path and do not cascade, which is safer. You must design the tree so the grant point is exactly right. See §9.1.

### 3.7 When to switch to Firestore

Revisit if any of these become true: you add a real backend or Cloud Functions (Blaze) and therefore get custom claims; you need compound queries over more than a few thousand records; you want built-in TTL for ephemeral state; you add a native mobile app that will use the SDK anyway; or you need multi-region durability.

---

## 4. Auth on a TV with only a D-pad — the four patterns assessed

The constraint: no on-screen keyboard typing of a password. A D-pad plus an on-screen grid keyboard makes an 8-character password roughly a 60-second ordeal with a high error rate, and the user has to *have* a password, which means an account-creation flow somewhere.

### 4.1 (a) Anonymous auth + a pairing code

**How it works:** The TV signs in anonymously (no user interaction at all), creates a household, mints a short random invite code, and displays it. The phone signs in anonymously, redeems the code, and both devices are then members of the same household document/node.

| | |
|---|---|
| Typing on the TV | **Zero.** The TV *generates* and *displays* the code. |
| Typing on the phone | 6 characters, on a real keyboard. Or zero, if the code arrives via QR (§4.3). |
| Works on Spark with no Functions | **Yes** — this is the only one of the four that fully does. See §6. |
| Account recovery | **This is the weak point.** An anonymous account lives in the app's local credential store. Wipe the app data and the identity is gone, taking household membership with it. Mitigated by making invites symmetric — any existing member can re-invite a device (§6.5). |
| Multi-user | Household membership is a set of anonymous UIDs. Profiles ("Gabe", "Sam") are *data*, not identities. That is the right model for a single household. |
| Security posture | Access is gated by a members list, so it is revocable. Code entropy + short TTL + human confirm on the TV is the whole defence (§6.4). |

**Verdict: this is the one.** It is the only pattern that needs no server, no OAuth client, no password, and no Google account.

### 4.2 (b) OAuth 2.0 device flow ("enter this code on your phone")

The standard TV flow, documented at <https://developers.google.com/identity/protocols/oauth2/limited-input-device>. **[DOC]**

- Device code request: `POST https://oauth2.googleapis.com/device/code` with `client_id` and space-delimited `scope`.
- Response: `device_code`, `user_code`, `verification_url`, `interval`, `expires_in`.
- Poll: `POST https://oauth2.googleapis.com/token` with `client_id`, `client_secret`, `device_code`, `grant_type=urn:ietf:params:oauth:grant-type:device_code`.
- Poll responses: **200** granted (returns `access_token`, `refresh_token`, `expires_in`, `scope`, `token_type`); **428** authorization pending; **403** denied or polling too fast; **400/401** bad parameters or client.
- Supported OpenID scopes: `email`, `openid`, `profile`. **[DOC]**

To turn that into a Firebase session you would exchange a Google ID token at `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=API_KEY` with `postBody: "id_token=<GOOGLE_ID_TOKEN>&providerId=google.com"` and `requestUri: "http://localhost"`. **[DOC]**

**Two problems:**

1. **The token response fields documented for the limited-input device flow do not include `id_token`** — only `access_token`, `refresh_token`, `scope`, `expires_in`, `token_type`. **[DOC]** The `openid` scope is listed as supported, so an `id_token` *may* be returned in practice. **[UNVERIFIED]** — if it is not, you would need an extra hop (userinfo endpoint → your own server → custom token), which needs a server, which needs Blaze.
2. **It requires a `client_secret` embedded in the APK.** Google's device flow is defined with a client secret even for TV clients. Anyone can extract it from the APK. Google's position is that TV/limited-input clients are effectively public clients, but it is still a value in your binary that you cannot rotate without shipping an update.

Plus: the user must own a Google account, visit a URL, sign in there, and consent. That is four screens on the phone to accomplish what §4.1 does in one tap.

**Verdict: over-engineered for a household app, and possibly blocked on the `id_token` question. Reject.**

### 4.3 (c) QR code linking the phone to the TV

Not really a separate auth pattern — it is a *transport* for pattern (a) or (b), and it is the best one.

**The design that requires no camera API at all:** the TV renders a QR encoding a plain URL:

```
https://<user>.github.io/x3f-tv/#invite=K7M4QP
```

The user opens their phone's normal camera app, points it at the TV, and taps the notification. The phone's browser opens the GitHub Pages build with the invite code already in the fragment. The web app signs in anonymously and redeems it. **Zero typing on either device.** **[DESIGN]**

The alternative — the web app asking for camera permission and using `BarcodeDetector` — is worse: it needs a permission prompt, only works on some browsers, and the user has to already be *in* the app, which defeats the point.

Notes:
- Use the URL **fragment** (`#invite=`), not a query string. Fragments are not sent to the server, so the code never appears in GitHub's logs or in a Referer header. **[DESIGN]**
- Generating a QR in Java with no dependencies means writing a QR encoder. For a fixed-format short ASCII URL you only need byte mode, one error-correction level, and a single version — a few hundred lines. Budget it. Alternatively, render it in the WebView with a small hand-written JS encoder, which keeps it out of the dex.
- Always show the 6-character code as text next to the QR. QR scanning fails on dirty screens, odd angles, and glare, and some users will not think to try it. **[DESIGN]**

**Verdict: adopt as the primary transport for pattern (a).**

### 4.4 (d) Google Sign-In on Android TV

`GoogleSignInClient` (from `play-services-auth`) was deprecated in 2025 in favour of Credential Manager. **[UNVERIFIED]** — from a secondary summary; Android's own docs at <https://developer.android.com/identity/sign-in/credential-manager-siwg> are the source to confirm against.

Two hard blockers for this project regardless:

1. **It is a third-party dependency and a large one.** `play-services-auth` plus `firebase-auth` plus their transitive `play-services-basement`/`tasks` deps against a ~5 MB APK budget. Exact size not confirmed — see §13.
2. **Credential Manager's Android TV support is unclear.** Google's guidance for Wear OS is to keep using legacy Google Sign-In "until Credential Manager support is available later" **[UNVERIFIED]**, which suggests non-phone form factors lag. Android TV specifically is not documented as supported in what I found.

Also: it forces every household member to have a Google account and to be signed in on the TV device, which is a heavier identity than "the person holding the remote."

**Verdict: reject on APK budget alone. The dependency question makes it moot.**

### 4.5 Summary table

| Pattern | TV typing | Phone typing | Needs server/Blaze | Needs Google account | APK cost | Verdict |
|---|---|---|---|---|---|---|
| (a) Anonymous + pairing code | none | 6 chars | **no** | no | ~0 | **Adopt** |
| (a)+(c) Anonymous + QR-carried code | none | **none** | **no** | no | QR encoder only | **Adopt — primary** |
| (b) OAuth device flow | none | URL + sign-in + consent | maybe (`id_token` uncertainty) | yes | HTTP only | Reject |
| (d) Google Sign-In on TV | account picker | none | no | yes | large | Reject |

---

## 5. What you cannot do without Cloud Functions — the constraint list

Before the flow design, the hard walls. All **[DERIVED]** from §2.5 plus the Firebase Auth admin docs:

1. **No custom tokens.** `accounts:signInWithCustomToken` requires a JWT signed with a service account private key. Shipping that key in a client is a total compromise of the project. So: no custom-token flows.
2. **No custom claims.** Custom claims are set only via the Admin SDK. Therefore **security rules must never depend on `request.auth.token.<claim>` / `auth.token.<claim>`** for authorization in this project. All authorization must be expressed against *documents/nodes* the rules can read.
3. **No server-side rate limiting.** You cannot throttle invite-code guessing beyond what Firebase's own infrastructure does.
4. **No server-side secret generation.** The TV generates the invite code itself, with `java.security.SecureRandom`.
5. **No atomic "validate code and grant membership" step.** It must be split into *claim* (by the joiner) and *confirm* (by an existing member). This turns out to be a feature — the human on the couch approves the join.
6. **No scheduled cleanup.** Expired invites must be deleted by a client, or by a Firestore TTL policy if you use Firestore.
7. **No server-side validation beyond rules.** Everything enforceable must be expressible in the rules language.

Note the one thing that is *not* on this list: minting a custom token does not require Blaze — it requires a service account key. You could run the Admin SDK on a laptop. You just cannot do it from a shipped client, and there is no always-on place to run it on Spark. **[DERIVED]**

---

## 6. The pairing flow, in full, on Spark with no Cloud Functions

### 6.1 Data model (RTDB)

```
/userIndex/{uid}                     -> "<householdId>"        (convenience pointer, self-written)
/households/{householdId}/
    meta/createdAt                   -> <server timestamp>
    members/{uid}/                   -> {role: "owner"|"member", addedAt, name?}
    profiles/{profileId}/            -> {name, color}
    sets/{yyyymm}/{setId}/           -> {profileId, exercise, band, reps, tut, ts, by}
/invites/{CODE}/                     -> {householdId, invitedBy, createdAt, claimedBy?, claimedAt?}
```

Three deliberate choices: **[DESIGN]**

- `householdId` is a client-generated 22-character base62 random string (~131 bits from `SecureRandom`). Not guessable, not derived from any UID, so it survives every device being replaced.
- `sets` is bucketed by `yyyymm` so a client can fetch one month with a single shallow GET instead of pulling the whole history. At 400 records/month a bucket is ~80 KB.
- `userIndex` is **unverified data by design** — a client can point its own `userIndex` entry at any household ID it likes. That is harmless, because authorization is gated by `/households/{hid}/members/{uid}`, never by `userIndex`. It exists only so a device can answer "which household am I in?" in one read instead of a scan. Document this so nobody later "hardens" it into a security boundary.

### 6.2 Step-by-step

**Phase 0 — TV first boot**

1. TV has no stored refresh token. `POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=API_KEY` with `{"returnSecureToken":true}` → `{idToken, refreshToken, expiresIn:"3600", localId}`. **[DOC]**
2. Persist `refreshToken` and `localId` in `getFilesDir()` (app-private). Never persist `idToken` — it expires in an hour and is re-derivable.
3. `GET /userIndex/<tvUid>.json?auth=<idToken>` → `null`. Not paired.
4. TV generates `householdId` and creates the household with a single atomic multi-path `PATCH` at the root:

```http
PATCH /.json?auth=<idToken>&print=silent HTTP/1.1
Host: <db>.firebaseio.com
Content-Type: application/json

{
  "households/<HID>/meta/createdAt": {".sv": "timestamp"},
  "households/<HID>/members/<TV_UID>": {"role": "owner", "addedAt": {".sv": "timestamp"}},
  "userIndex/<TV_UID>": "<HID>"
}
```

A multi-path `PATCH` at an ancestor writes all listed paths atomically. **[DOC]** `print=silent` returns 204 and no body, which saves download bytes — and RTDB bills download bytes. **[DOC]**

**Phase 1 — TV mints an invite**

5. `CODE` = 6 characters from the 32-character alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no `0`/`O`, `1`/`I`/`L`), drawn from `SecureRandom`. 32⁶ = 2³⁰ ≈ 1.07 × 10⁹. **[DERIVED]**
6. ```http
   PUT /invites/<CODE>.json?auth=<tvIdToken>&print=silent

   {"householdId":"<HID>","invitedBy":"<TV_UID>","createdAt":{".sv":"timestamp"}}
   ```
   Note: **no client-supplied expiry timestamp.** Expiry is `createdAt + 300000` evaluated against the rules' `now`, so a skewed device clock cannot break or extend it. **[DESIGN]**
7. TV displays the code as large text **and** as a QR encoding `https://<user>.github.io/x3f-tv/#invite=<CODE>`.
8. TV opens an SSE stream on the invite node and waits:
   ```http
   GET /invites/<CODE>.json?auth=<tvIdToken> HTTP/1.1
   Accept: text/event-stream
   ```

**Phase 2 — phone redeems**

9. Phone opens the URL (camera app → browser, or types the code into the web app). Web app signs in anonymously — reusing the existing anonymous session if one is in IndexedDB/localStorage — obtaining `PHONE_UID`.
10. Phone claims the invite. It does **not** read it first; it writes blind:
    ```http
    PATCH /invites/<CODE>.json?auth=<phoneIdToken>

    {"claimedBy":"<PHONE_UID>","claimedAt":{".sv":"timestamp"}}
    ```
    A wrong code returns a rules failure (the node does not exist), which the UI renders as "code not recognised."
11. Phone now reads the invite — permitted because `claimedBy == auth.uid` — and learns `householdId`:
    ```http
    GET /invites/<CODE>.json?auth=<phoneIdToken>
    ```
12. Phone writes its own pointer: `PUT /userIndex/<PHONE_UID>.json` → `"<HID>"`.
13. Phone polls (or streams) `/households/<HID>/members/<PHONE_UID>.json` waiting for the TV to confirm. Until then, every read of `/households/<HID>/...` is denied.

**Phase 3 — TV confirms (the human step)**

14. The TV's SSE stream delivers a `patch` event carrying `claimedBy`. The TV shows: *"A device wants to join. Press OK to allow."*
15. On OK, one atomic multi-path `PATCH`:
    ```http
    PATCH /.json?auth=<tvIdToken>&print=silent

    {
      "households/<HID>/members/<PHONE_UID>": {"role":"member","addedAt":{".sv":"timestamp"}},
      "invites/<CODE>": null
    }
    ```
    Setting a path to `null` deletes it — the invite is consumed in the same atomic write that grants membership.
16. The phone's listener fires. Both devices are now members. Done.

### 6.3 Why the claim/confirm split matters

Rules alone cannot express "this code was minted for *this* person." Anyone who guesses a live code can claim it. But claiming grants **nothing** — it only writes `claimedBy` onto an invite node. Membership is granted by an *existing member* pressing OK on the TV, in front of a human who can see whether they just handed out the code. That converts an unforgeable-token problem into a physical-presence problem, which is the right shape for a household. **[DESIGN]**

### 6.4 Security analysis of the code

Attack: brute-force live invite codes to get claimed, then hope someone presses OK. **[DERIVED]**

- Search space 2³⁰ ≈ 1.07 × 10⁹; window 5 minutes; single use.
- At a sustained 1,000 requests/second (which will also run into Firebase's own per-project Identity Toolkit ceiling of 1,000 req/s and the 100-anonymous-accounts-per-hour-per-IP cap **[DOC]**), an attacker gets ~300,000 attempts in the window — about a 0.03% chance of hitting a live code.
- Even on a hit, they get a "device wants to join" prompt on a TV in someone's house, which will be declined.
- If you want more margin: 8 characters gives 2⁴⁰ and is still tolerable to type; or make the QR carry a longer code and the typed fallback the short one, minting two invites.

This is adequate for a household fitness log. It would not be adequate for financial or health-regulated data. Say so in the product docs. **[DESIGN]**

### 6.5 Recovery and re-pairing — make invites symmetric

The failure mode of anonymous auth is losing the local credential (app data cleared, device replaced, TV factory reset). Design for it from day one:

- **Any existing member can mint an invite** (the rules in §9 enforce membership on create). So if the TV is wiped, the phone mints an invite, the TV redeems it, and the phone confirms. Same flow, roles reversed. Build both directions in the UI from the start; it costs almost nothing once the flow exists.
- **If every device is lost simultaneously, the household is unreachable.** There is no password to reset because there is no password. Mitigations, in increasing order of effort: (i) periodically export the history as JSON to the local filesystem / a share sheet; (ii) allow Android's auto-backup to include the refresh-token file (note the security trade-off — the token lands in Google's backup); (iii) let a user upgrade an anonymous account by linking a real credential via `accounts:update` — which reintroduces typing, so make it optional and phone-only. **[DESIGN]**
- **The `householdId` is the real recovery key.** Show it (or a QR of it) in a Settings → Advanced screen. It is not sufficient on its own — you still need a member to add you — but it lets a support conversation identify the data.

### 6.6 Cleaning up expired invites

RTDB has no TTL. Options, in order of preference: **[DESIGN]**

1. The confirm step deletes the invite atomically (step 15). Covers the happy path.
2. The TV stores the last code it minted locally and deletes it on next boot if it is still there.
3. Accept the orphans. An abandoned invite is ~120 bytes. Even 10,000 of them is 1.2 MB of a 1 GB allowance.

If you were on Firestore instead, a TTL policy on `invites.expiresAt` handles this automatically with no code — created via Google Cloud console → Firestore → Time-to-live → Create Policy, or `gcloud firestore fields ttls update expiresAt --collection-group=invites --enable-ttl`. Deletion happens "typically within 24 hours after its expiration date", counts against your delete quota, and configuration requires the `datastore.indexes.update` permission in the Google Cloud console (not the Firebase console). **[DOC]**

---

## 7. Talking to Firebase from Android with NO SDK — plain REST

Everything here uses only `javax.net.ssl.HttpsURLConnection` and `org.json`, both in the Android framework. Zero dependencies, and the dex cost is the code you write — on the order of tens of KB, not hundreds. **[DERIVED]**

### 7.1 What you need from the Firebase config

For a REST-only client you need exactly three values, and one of them only if you use RTDB:

| Field | Needed? | Used for |
|---|---|---|
| `apiKey` | **yes** | `?key=` on every Identity Toolkit / Secure Token call |
| `projectId` | for Firestore | the `projects/{projectId}` path segment |
| `databaseURL` | for RTDB | the host, e.g. `https://x3f-abc123-default-rtdb.firebaseio.com` |
| `authDomain`, `appId`, `messagingSenderId`, `storageBucket`, `measurementId` | no | SDK-only concerns |

The API key is not a secret. From <https://firebase.google.com/docs/projects/api-keys>: Firebase API keys "are *not* used to control *access* to backend resources"; they identify the project and associate requests with it for quota. The doc states that keys restricted to Firebase services **"do *not* need to be treated as secrets, and it's safe to include them in your code or configuration files."** With only the key, an attacker cannot read your data (Security Rules stop them) but can attempt brute-force auth and burn your quota. **[DOC]**

### 7.2 Auth token flow (Identity Toolkit REST)

**Anonymous sign-up** — once, on first run. **[DOC]**

```http
POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=API_KEY
Content-Type: application/json

{"returnSecureToken": true}
```
```json
{
  "idToken": "eyJhbGciOi...",
  "email": "",
  "refreshToken": "AMf-vBw...",
  "expiresIn": "3600",
  "localId": "kM1s0Kx7QeYb..."
}
```

`localId` is the Firebase UID. Persist `refreshToken` and `localId`. Requires the **Anonymous** provider to be enabled in the console (§11 step 12).

**Refresh** — every hour, and on any 401. **[DOC]** Note the different host, the form encoding, and the **snake_case** response — a classic source of bugs when you have just written camelCase parsing for the endpoint above.

```http
POST https://securetoken.googleapis.com/v1/token?key=API_KEY
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=AMf-vBw...
```
```json
{
  "expires_in": "3600",
  "token_type": "Bearer",
  "refresh_token": "AMf-vBw...",
  "id_token": "eyJhbGciOi...",
  "user_id": "kM1s0Kx7QeYb...",
  "project_id": "123456789012"
}
```

**Custom token exchange** — listed for completeness. **We cannot use this** (see §5.1). **[DOC]**

```http
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=API_KEY
{"token": "<JWT signed by a service account>", "returnSecureToken": true}
```

**Google ID token exchange** — for the device flow in §4.2, if you ever revisit it. **[DOC]**

```http
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=API_KEY
{"postBody": "id_token=<GOOGLE_ID_TOKEN>&providerId=google.com",
 "requestUri": "http://localhost", "returnSecureToken": true}
```

**Look up the account** **[DOC]**

```http
POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=API_KEY
{"idToken": "<ID_TOKEN>"}
```

**Token lifecycle rules for the Java client:** **[DESIGN]**
- ID token TTL is 3600 s. Refresh proactively at ~3000 s, never lazily on 401 alone.
- Serialise refreshes behind a single lock. Two concurrent 401s must not fire two refreshes.
- Refresh tokens do not expire on a timer; they die if the account is deleted or disabled. Treat a refresh failure with `TOKEN_EXPIRED` / `USER_DISABLED` / `USER_NOT_FOUND` as "identity lost" → drop into the re-pair flow (§6.5), do not silently create a new anonymous account and orphan the household.

### 7.3 Realtime Database REST **[DOC]**

Base URL: `https://<DATABASE_NAME>.firebaseio.com` for `us-central1`, or `https://<DATABASE_NAME>.<REGION>.firebasedatabase.app` for `europe-west1` / `asia-southeast1`. Only those three locations exist. **[DOC]**

Every path takes a `.json` suffix. Auth is the **`auth` query parameter**, not a header: `?auth=<ID_TOKEN>`. (Google OAuth2 access tokens may alternatively be sent as `Authorization: Bearer` or `access_token=`.) **[DOC]**

| Method | Effect |
|---|---|
| `GET` | Read the node. 200 + JSON. |
| `PUT` | Write/replace everything at the path, including children. |
| `PATCH` | Update the named children only; leaves others. At an ancestor path, a multi-key body is an **atomic multi-path update**. |
| `POST` | Append to a list with an auto-generated, time-ordered push key. Returns `{"name":"-JSOpn9ZC54A4P4RoqVa"}`. |
| `DELETE` | Remove the node. 200 + `null`. |

Query parameters: **[DOC]**

| Param | Notes |
|---|---|
| `auth` | ID token |
| `print=silent` | 204 No Content, no response body — **use this on every write**, it directly reduces the billed download bytes |
| `print=pretty` | human-readable, dev only |
| `shallow=true` | children become `true`, leaves keep values; cannot combine with filters |
| `orderBy` | a child key, or `"$key"` / `"$value"` / `"$priority"` |
| `limitToFirst` / `limitToLast` | result count cap |
| `startAt` / `endAt` / `equalTo` | inclusive range / exact match |
| `timeout` | e.g. `3s`, `3min`; max `15min`, over-limit gives HTTP 400 |
| `callback` | JSONP; not needed, we have CORS |

**Server timestamp:** write the sentinel `{".sv": "timestamp"}` and the server substitutes milliseconds since the UNIX epoch. **[DOC]** This is trivially expressible in a hand-built `JSONObject` — a real ergonomic win over Firestore's `updateTransforms`.

**Streaming (SSE)** — the reason we picked RTDB. **[DOC]**

```http
GET /households/<HID>/sets/202609.json?auth=<ID_TOKEN> HTTP/1.1
Host: <db>.firebaseio.com
Accept: text/event-stream
```

The response is an event stream of `event: <name>` / `data: <json>` pairs:

| Event | `data` | Handling |
|---|---|---|
| `put` | `{"path":"/","data":{...}}` | Replace everything at `path` with `data`. |
| `patch` | `{"path":"/x","data":{...}}` | Merge the named keys at `path`. |
| `keep-alive` | `null` | Ignore. Use it as a liveness signal. |
| `cancel` | `null` | Security rules no longer permit the read. Stop. |
| `auth_revoked` | a string | The ID token expired. Refresh and reconnect. |

**Java implementation notes** — these are the things that will cost you an evening if nobody wrote them down: **[DESIGN]**

1. **Honour the 307.** The docs require respecting HTTP redirects, specifically 307. **[DOC]** RTDB redirects the stream to a per-instance host. Set `setInstanceFollowRedirects(false)`, read the `Location` header, and reconnect yourself — `HttpURLConnection` will not follow a redirect that changes host in all cases, and you want to log it anyway.
2. **Read timeouts.** Set `setReadTimeout` to comfortably more than the keep-alive interval (e.g. 90 s), not 0. A hung socket with an infinite timeout is a zombie.
3. **The token is fixed for the life of the connection.** `auth` is a query parameter, so you cannot refresh it in place. Expect `auth_revoked` roughly hourly; refresh the token and open a new stream. Do this *proactively* at ~55 minutes so you never have a gap.
4. **Reconnect with backoff and jitter**, and re-fetch the node once on reconnect (a `put` at `/` arrives on connect, so you generally get this for free).
5. **One stream, not many.** Each is a simultaneous connection against the Spark cap of 100. Stream the narrowest node that covers what you need — the current month's `sets` bucket, plus `profiles`, plus (during pairing only) the invite node.
6. **Parse line-by-line, not with a JSON streaming parser.** SSE framing is `event:` / `data:` / blank line. `BufferedReader.readLine()` is enough.

### 7.4 Firestore REST — for reference, if you overrule §3

Base: `https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents` **[DOC]**

Auth: `Authorization: Bearer <FIREBASE_ID_TOKEN>`. With a Firebase ID token, **Security Rules apply**. With a service-account OAuth2 access token (scope `https://www.googleapis.com/auth/datastore`), IAM applies and **rules are ignored**. **[DOC]**

| Operation | Method + URL |
|---|---|
| Get one document | `GET .../documents/{collection}/{docId}` |
| Create with a chosen ID | `POST .../documents/{collection}?documentId={docId}` |
| Create with a generated ID | `POST .../documents/{collection}` |
| Update / upsert | `PATCH .../documents/{collection}/{docId}?updateMask.fieldPaths=a&updateMask.fieldPaths=b` |
| Delete | `DELETE .../documents/{collection}/{docId}` |
| List a collection | `GET .../documents/{collection}` |
| Query | `POST .../documents:runQuery` |
| Atomic multi-document write | `POST .../documents:commit` |
| Non-atomic bulk write | `POST .../documents:batchWrite` |
| Realtime | **not available over REST** (§3.2) |

**`updateMask` is not optional in practice.** "If the mask is not set for an `update` and the document exists, any existing data will be overwritten." Fields named in the mask but absent from the body are **deleted** from the stored document. **[DOC]**

**Value JSON shapes** — the marshaller you would have to write **[DOC]**:

| Type | JSON | Format note |
|---|---|---|
| `nullValue` | `null` | |
| `booleanValue` | `true` / `false` | |
| `integerValue` | `"18"` | **a JSON string** (int64) |
| `doubleValue` | `18.5` | a JSON number |
| `timestampValue` | `"2026-09-07T15:01:23.045123456Z"` | RFC 3339 UTC, nanosecond resolution |
| `stringValue` | `"text"` | UTF-8; max 1 MiB − 89 bytes; only the first 1,500 bytes are indexed |
| `bytesValue` | `"aGVsbG8="` | base64 |
| `referenceValue` | `"projects/{p}/databases/{d}/documents/{path}"` | |
| `geoPointValue` | `{"latitude":…,"longitude":…}` | `LatLng` |
| `arrayValue` | `{"values":[ …Value… ]}` | cannot directly contain another array |
| `mapValue` | `{"fields":{"k": …Value… }}` | keys ≤ 1,500 bytes, non-empty |

A document body:

```json
{
  "fields": {
    "exercise": {"stringValue": "Chest Press"},
    "reps":     {"integerValue": "18"},
    "ts":       {"timestampValue": "2026-09-07T15:01:23Z"},
    "tags":     {"arrayValue": {"values": [{"stringValue": "heavy"}]}}
  }
}
```

**`:commit` request** (atomic, all-or-nothing) **[DOC]**:

```json
{
  "writes": [
    {
      "update": {
        "name": "projects/P/databases/(default)/documents/households/H/sets/S1",
        "fields": {"reps": {"integerValue": "18"}}
      },
      "updateMask": {"fieldPaths": ["reps"]},
      "currentDocument": {"exists": false}
    },
    { "delete": "projects/P/databases/(default)/documents/invites/K7M4QP" }
  ]
}
```

Response: `{"writeResults":[…], "commitTime":"2026-09-07T15:01:24.1Z"}`.

Server timestamp on Firestore is a **transform**, not a sentinel value: a `Write` carries `updateTransforms: [{"fieldPath":"ts","setToServerValue":"REQUEST_TIME"}]`. **[DOC]**

**`:runQuery` request** **[DOC]**:

```json
{
  "structuredQuery": {
    "from": [{"collectionId": "sets", "allDescendants": false}],
    "where": {"fieldFilter": {
      "field": {"fieldPath": "ts"},
      "op": "GREATER_THAN",
      "value": {"timestampValue": "2026-09-01T00:00:00Z"}
    }},
    "orderBy": [{"field": {"fieldPath": "ts"}, "direction": "DESCENDING"}],
    "limit": 200
  }
}
```

The response is a JSON array of `{document, readTime, done}` frames (server-streaming, but consumable as a normal HTTP response body). **[DOC]**

### 7.5 APK budget

| Approach | Dex cost |
|---|---|
| Hand-rolled REST on `HttpsURLConnection` + `org.json` | tens of KB — only your own code |
| `firebase-auth` + `firebase-database` (+ transitive `play-services-basement`, `play-services-tasks`) | **[UNVERIFIED]** — no official figure found. A firebase-talk post puts the RTDB SDK "about 400 kB"; Firestore is explicitly called out in Firebase's own docs as class-heavy enough to push apps over the 64K method limit. Measure with `apkanalyzer` before you decide. |

Against a ~5 MB budget, the REST path is clearly right, and it is also the only path that keeps the "no third-party deps" property.

---

## 8. Talking to Firebase from the static web build (GitHub Pages)

### 8.1 The hosting constraints **[DOC]**

From <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>:
- Published sites: **no larger than 1 GB**
- **Soft** bandwidth limit: **100 GB/month**
- **Soft** build limit: **10 builds/hour** (does not apply to custom GitHub Actions workflows)
- Prohibited: commercial transactions, SaaS, "sensitive transactions involving passwords or credit card numbers"

That last clause is another quiet argument for the passwordless pairing design in §6 — there is no password anywhere in the flow. **[DERIVED]**

GitHub Pages is HTTPS-only and is a distinct origin from `*.firebaseio.com` / `firestore.googleapis.com`. Both Firebase REST surfaces are designed for browser use and send permissive CORS headers. **[UNVERIFIED]** — expected to work; confirm with one `fetch()` from the deployed origin before building on it.

### 8.2 Option A — modular JS SDK from the gstatic CDN (no build step)

Current version: **12.18.0** (npm `firebase`, latest as of ~Aug 2026). **[DOC]**

```html
<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
  import { getAuth, signInAnonymously, onAuthStateChanged }
    from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
  import { getDatabase, ref, onValue, update, serverTimestamp }
    from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';

  const app = initializeApp({
    apiKey: "…",
    authDomain: "PROJECT.firebaseapp.com",
    databaseURL: "https://PROJECT-default-rtdb.firebaseio.com",
    projectId: "PROJECT",
    appId: "…"
  });
</script>
```

URL pattern: `https://www.gstatic.com/firebasejs/<VERSION>/firebase-<SERVICE>.js`. **[DOC]** Firebase's own docs name `firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`, `firebase-analytics.js`; `firebase-database.js` and `firebase-firestore-lite.js` follow the same pattern and are widely used **[UNVERIFIED]** — verify the exact filenames resolve before shipping. Firebase recommends a bundler for production but the CDN form is explicitly supported. **[DOC]**

**Size** — the only official numbers I found are from Firebase's own 2023 Firestore Lite post (<https://firebase.blog/posts/2023/03/trim-javascript-bundles-firestore-lite>), and they are **bundled, tree-shaken** measurements, not gstatic CDN file sizes: **[DOC]**

| Bundle | Raw | Gzipped |
|---|---|---|
| Full Firestore, `getDoc()` only | 194 KB | **60.4 KB** |
| Full Firestore, with `onSnapshot()` | 196 KB | **61 KB** |
| `firebase/firestore/lite`, `getDoc` only | 54.3 KB | **16.9 KB** |

Two caveats you must apply before quoting these: (1) they are 2023-era, measured against a v9-family SDK, not 12.18.0; (2) the **gstatic CDN modules are per-product bundles and are not tree-shaken**, so the file you actually download is larger than a bundler would produce. **[DERIVED]** No official gzipped figure exists for `firebase-database.js`; expect it to be smaller than Firestore's (RTDB is the simpler product) but **measure it** rather than trusting that. **[UNVERIFIED]**

### 8.3 Option B — Firestore Lite

"A lightweight, standalone REST-only Firestore SDK that supports single document fetches, query execution, and document updates, at a fraction of the regular Web SDK size." It omits **real-time listeners** (`onSnapshot`), **offline persistence**, latency compensation, query resumption, and `loadBundle`. **[DOC]**

Wrong tool here — the phone build's whole job is to show live workout data. And it is a Firestore-only product, so it is moot if you take the RTDB recommendation.

### 8.4 Option C — zero-dependency REST from the browser

This is more attractive than it sounds, because **the browser already has an SSE client built in**, and RTDB takes auth as a query parameter (`EventSource` cannot set headers, which would kill this idea for any header-authenticated API):

```js
// Anonymous sign-in — same Identity Toolkit endpoints as the Android client (§7.2)
const r = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
  { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({returnSecureToken: true}) });
const { idToken, refreshToken, localId } = await r.json();

// Live updates with zero libraries
const es = new EventSource(
  `${DB}/households/${HID}/sets/202609.json?auth=${idToken}`);
es.addEventListener('put',   e => applyPut(JSON.parse(e.data)));
es.addEventListener('patch', e => applyPatch(JSON.parse(e.data)));
es.addEventListener('auth_revoked', async () => { es.close(); await refresh(); reconnect(); });

// Write
await fetch(`${DB}/households/${HID}/sets/202609/${id}.json?auth=${idToken}&print=silent`,
  { method: 'PUT', body: JSON.stringify({...set, ts: {".sv":"timestamp"}}) });
```

**What you give up** by not using the SDK on web: automatic token refresh, auth-state persistence across reloads, the offline write queue, reconnection/backoff, and `onDisconnect`. You would hand-roll refresh (§7.2) and persistence (`localStorage` for the refresh token, IndexedDB or `localStorage` for an outbox). **[DESIGN]**

### 8.5 Recommendation for the web build

**Use the CDN SDK on the phone.** Reasoning: **[DESIGN]**

- The phone has no APK budget. The size argument that decides the TV does not apply.
- Token refresh, session persistence, reconnection and the offline write queue are exactly the fiddly, easy-to-get-subtly-wrong parts, and the SDK does them for free.
- It is a CDN `<script type="module">` — no build step, no `node_modules`, no lockfile, nothing added to the repo. The "no third-party deps" property of the *codebase* is preserved; you are adding a runtime `<script>` tag, not a dependency.
- The gstatic files are aggressively cached and served from Google's CDN, so the transfer does not count against GitHub Pages' 100 GB soft limit.

**But** if cross-platform symmetry matters more to you than convenience — one Java implementation and one JS implementation of exactly the same protocol, both hand-written, both debuggable with `curl` — Option C is genuinely viable for RTDB and worth about 200 lines of JS. It is *not* viable for Firestore, because of the missing realtime channel.

---

## 9. Security rules

Two devices share one household and nothing else, with **no server**. Both versions below are **[DESIGN]** and must be validated in the Local Emulator Suite (`firebase emulators:start`, plus the rules unit-testing library) before deployment. Rules changes take up to a minute to affect new queries and up to **10 minutes** to fully propagate to active listeners. **[DOC]**

### 9.1 Realtime Database rules (the recommended path)

```json
{
  "rules": {
    ".read": false,
    ".write": false,

    "userIndex": {
      "$uid": {
        ".read":  "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid",
        ".validate": "newData.isString() && newData.val().length >= 16 && newData.val().length <= 64"
      }
    },

    "households": {
      "$hid": {
        ".read":  "auth != null && data.child('members').child(auth.uid).exists()",
        ".write": "auth != null && data.child('members').child(auth.uid).exists()",

        "meta": {
          "createdAt": { ".validate": "newData.val() === now" },
          "$other":    { ".validate": false }
        },

        "members": {
          "$uid": {
            ".validate": "newData.hasChildren(['role','addedAt'])",
            "role":    { ".validate": "newData.isString() && (newData.val() === 'owner' || newData.val() === 'member')" },
            "addedAt": { ".validate": "newData.val() === now" },
            "name":    { ".validate": "newData.isString() && newData.val().length <= 40" },
            "$other":  { ".validate": false }
          }
        },

        "profiles": {
          "$pid": {
            ".validate": "newData.hasChildren(['name'])",
            "name":   { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 40" },
            "color":  { ".validate": "newData.isString() && newData.val().length <= 16" },
            "$other": { ".validate": false }
          }
        },

        "sets": {
          "$bucket": {
            ".validate": "$bucket.matches(/^[0-9]{6}$/)",
            "$setId": {
              ".validate": "newData.hasChildren(['profileId','exercise','reps','ts','by'])",
              "profileId": { ".validate": "newData.isString() && newData.val().length <= 32" },
              "exercise":  { ".validate": "newData.isString() && newData.val().length <= 48" },
              "band":      { ".validate": "newData.isString() && newData.val().length <= 16" },
              "reps":      { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 500" },
              "tut":       { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 36000" },
              "note":      { ".validate": "newData.isString() && newData.val().length <= 240" },
              "ts":        { ".validate": "newData.val() === now || (newData.isNumber() && newData.val() > 0 && newData.val() <= now)" },
              "by":        { ".validate": "newData.val() === auth.uid" },
              "$other":    { ".validate": false }
            }
          }
        }
      }
    },

    "invites": {
      "$code": {
        ".read": "auth != null && (data.child('invitedBy').val() === auth.uid || data.child('claimedBy').val() === auth.uid)",

        ".write": "auth != null && (
            (!data.exists() && newData.exists()
              && newData.child('invitedBy').val() === auth.uid
              && !newData.hasChild('claimedBy')
              && root.child('households')
                     .child(newData.child('householdId').val())
                     .child('members').child(auth.uid).exists())
            ||
            (data.exists() && newData.exists()
              && !data.hasChild('claimedBy')
              && data.child('createdAt').val() + 300000 > now
              && newData.child('claimedBy').val() === auth.uid
              && newData.child('householdId').val() === data.child('householdId').val()
              && newData.child('invitedBy').val()   === data.child('invitedBy').val()
              && newData.child('createdAt').val()   === data.child('createdAt').val())
            ||
            (data.child('invitedBy').val() === auth.uid && !newData.exists())
          )",

        ".validate": "newData.hasChildren(['householdId','invitedBy','createdAt'])",
        "householdId": { ".validate": "newData.isString() && newData.val().length >= 16 && newData.val().length <= 64" },
        "invitedBy":   { ".validate": "newData.isString() && newData.val().length <= 128" },
        "claimedBy":   { ".validate": "newData.isString() && newData.val().length <= 128" },
        "createdAt":   { ".validate": "newData.val() === now" },
        "claimedAt":   { ".validate": "newData.val() === now" },
        "$other":      { ".validate": false }
      }
    }
  }
}
```

**What each clause is doing:**

- `".read": false` / `".write": false` at the root is documentation, not enforcement — rules default to deny. **[DOC]** It exists so a future reader cannot mistake absence for permission.
- `/households/$hid` grants read and write to anyone listed under `members`. Because **`.read`/`.write` cascade to children while `.validate` does not** **[DOC]**, this single grant covers every subtree, and the nested `.validate` rules still constrain the *shape* of what gets written.
- `newData.val() === now` on timestamp fields forces the client to send `{".sv":"timestamp"}` — a client cannot forge a timestamp. **[DESIGN]**
- `by: newData.val() === auth.uid` stamps every set with its true author. Not an access control (any member can write any set) but a reliable audit trail.
- The `invites` `.write` rule is a three-way disjunction: **mint** (creator must already be a member of the named household), **claim** (unclaimed, within 300 s of the server-stamped `createdAt`, and the claimer may not alter any other field), **delete** (creator only).
- Expiry compares `createdAt + 300000 > now` using the rules engine's `now` (server time in ms). **No client clock is trusted anywhere.** **[DESIGN]**

**Known limitations you should accept knowingly:** **[DESIGN]**

1. **Any member can delete the whole household.** The cascading write grant makes this unavoidable without restructuring so that `/households/$hid` itself is not writable and each subtree carries its own grant. For a household app, acceptable — an owner-only guard on `members` and `meta` would be the first thing to add if you disagree.
2. **`$other: {".validate": false}` as a key-allowlist.** RTDB has no `hasOnly()`. The idiom relies on literal child names taking precedence over the `$` wildcard at the same level. **[UNVERIFIED]** — I did not confirm this precedence rule from a primary doc. **Test it explicitly in the emulator**: write a document containing an unexpected key and assert rejection.
3. **No rate limiting.** Covered in §6.4.

### 9.2 Firestore rules (equivalent, if you overrule §3)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function isMember(hid) {
      return signedIn()
        && exists(/databases/$(database)/documents/households/$(hid)/members/$(request.auth.uid));
    }

    match /households/{hid} {
      allow get:    if isMember(hid);
      allow list:   if false;
      allow create: if signedIn()
                    && request.resource.data.keys().hasOnly(['createdAt'])
                    && request.resource.data.createdAt == request.time;
      allow update, delete: if false;

      match /members/{uid} {
        allow read:           if isMember(hid);
        allow create, delete: if isMember(hid) || uid == request.auth.uid;
        allow update:         if false;
      }

      match /profiles/{pid} {
        allow read, write: if isMember(hid);
      }

      match /sets/{setId} {
        allow read: if isMember(hid);
        allow create: if isMember(hid)
          && request.resource.data.keys().hasOnly(
               ['profileId','exercise','band','reps','tut','note','ts','by'])
          && request.resource.data.keys().hasAll(['profileId','exercise','reps','ts','by'])
          && request.resource.data.by == request.auth.uid
          && request.resource.data.ts == request.time
          && request.resource.data.reps is int
          && request.resource.data.reps >= 0
          && request.resource.data.reps <= 500;
        allow update: if isMember(hid) && resource.data.by == request.auth.uid;
        allow delete: if isMember(hid);
      }
    }

    match /invites/{code} {
      allow get: if signedIn()
                 && (resource.data.invitedBy == request.auth.uid
                     || resource.data.claimedBy == request.auth.uid);
      allow list: if false;

      allow create: if signedIn()
        && request.resource.data.invitedBy == request.auth.uid
        && !('claimedBy' in request.resource.data)
        && request.resource.data.createdAt == request.time
        && request.resource.data.expiresAt == request.time + duration.value(5, 'm')
        && isMember(request.resource.data.householdId);

      allow update: if signedIn()
        && !('claimedBy' in resource.data)
        && resource.data.expiresAt > request.time
        && request.resource.data.diff(resource.data)
             .affectedKeys().hasOnly(['claimedBy','claimedAt'])
        && request.resource.data.claimedBy == request.auth.uid
        && request.resource.data.claimedAt == request.time;

      allow delete: if signedIn() && resource.data.invitedBy == request.auth.uid;
    }

    match /userIndex/{uid} {
      allow read, write: if signedIn() && request.auth.uid == uid;
    }
  }
}
```

**Firestore-specific cautions:**

- **`get()` and `exists()` in rules cost you.** "Using these functions executes a read operation in your database, which means you will be billed for reading documents even if your rules reject the request." **[DOC]** Every `isMember()` call is a billed read.
- **Hard cap on document access calls:** 10 per single-document or query request, 20 for multi-document reads / transactions / batched writes with 10 per individual operation. Exceeding either gives permission-denied. Some calls are cached and cached calls do not count. **[DOC]** With one `isMember()` per rule you have plenty of headroom, but a batched write of 10 sets, each triggering an `isMember()`, uses 10 of the 20.
- **Rules are not filters.** A query fails entirely "if a query could potentially return documents that the client does not have permission to read". **[DOC]** Here `isMember(hid)` does not depend on the document contents, so a `list` over `/households/{hid}/sets` is provably safe and succeeds. Had we written `allow read: if resource.data.by == request.auth.uid`, an unfiltered list would fail. Keep membership checks document-independent.
- `expiresAt == request.time + duration.value(5, 'm')` is exact-match against server time and will be brittle. **[UNVERIFIED]** — confirm the semantics of comparing a client-sent value to `request.time` arithmetic in the emulator; you may need a bounded range (`> request.time` and `< request.time + duration.value(10,'m')`) instead. The RTDB version sidesteps this entirely by never sending an expiry.
- Add a **TTL policy** on `invites.expiresAt` (§6.6) so expired invites clean themselves up.
- `match /{document=**} { allow read, write: if false; }` is unnecessary — unmatched paths are denied by default, and `allow … if false` grants nothing. Add it only as a comment for human readers. **[DERIVED]**

### 9.3 Do NOT do this

The tempting shortcut is to skip auth entirely and rely on an unguessable path:

```json
{ "rules": { "households": { "$hid": { ".read": true, ".write": true } } } }
```

This is worse than it looks: no revocation (anyone who ever saw the URL, a screenshot, or a browser-history entry has permanent access), no audit trail, no way to remove a lost device, and Firebase will email you about world-writable rules. It is also world-*writable*, so any scanner that finds your database ID can delete everything. **Reject.** **[DESIGN]**

---

## 10. What forces Blaze, and what it would cost

### 10.1 The full list of Blaze triggers **[DOC]** except where noted

1. **Deploying any Cloud Function** (1st or 2nd gen). Emulation is free; deployment is not. — <https://firebase.google.com/docs/functions/get-started>
2. **Cloud Storage for Firebase — any use at all**, since 3 Feb 2026. Spark projects get 402/403 and lose console access to buckets.
3. **Firebase App Hosting** — "Not available on Spark plan" per the pricing page.
4. **Firebase Extensions** paid tier. (And Extensions sunsets 31 Mar 2027.)
5. **Phone Auth / SMS** — no free tier, billed per SMS sent.
6. **Firebase Data Connect / "SQL Connect"** after the 3-month trial (limit 1 per project).
7. **More than one Realtime Database instance** in a project. — <https://firebase.google.com/docs/database/locations>
8. **Any Google Cloud product**: Cloud Run, Cloud Build, Cloud Tasks, Cloud Scheduler, Pub/Sub, Secret Manager, BigQuery export, Vertex AI / Gemini via Firebase AI Logic. The FAQ states plainly that "Google Cloud features are not available when using the Spark pricing plan."
9. **Firebase Test Lab** beyond 10 virtual / 5 physical tests per day.
10. **Firestore Enterprise edition** — its pricing page says it "requires paid billing". **[UNVERIFIED]** for whether an Enterprise database can be created at all on Spark.
11. **Exceeding any Spark quota** — which shuts the product off rather than billing you, so strictly this forces an upgrade only if you want service restored before the period rolls over.
12. **Raising Spark's structural ceilings**: RTDB simultaneous connections (100 → 200,000), Hosting transfer, Auth email quotas (1,000 / 150 / 5 per day → 100,000 / 10,000 / 25,000).

**Not on the list, contrary to common belief:** minting custom tokens and setting custom claims need a *service account key*, not Blaze. You could run the Admin SDK from a laptop. There is simply no always-on place to run it on Spark, which is why §5 rules it out for this design. **[DERIVED]**

### 10.2 What Blaze would cost at this volume

**Blaze includes the same no-cost allowances**, and bills only above them. **[DOC]** So the honest answer is:

**$0.00/month.** **[DERIVED]** With ~400 writes/month against a 20,000/day (Firestore) or 10 GB/month-download (RTDB) allowance, you are three to four orders of magnitude below the first billable unit on every axis.

Unit prices, for when you want to sanity-check that claim:

**Firestore, North America multi-region `nam5`** — from <https://firebase.google.com/docs/firestore/billing-example> **[DOC]**:

| Item | Price |
|---|---|
| Reads | $0.06 / 100K |
| Writes | $0.18 / 100K |
| Deletes | $0.02 / 100K |
| Storage | $0.18 / GB / month |
| Network egress | $0.12 / GB |

**Firestore single-region (Iowa / `us-central1`)** — derived from the Standard-vs-Enterprise comparison on <https://firebase.google.com/docs/firestore/enterprise/pricing>, which lists Standard at **$0.30 per million reads** and **$0.90 per million writes** — i.e. $0.03/100K reads and $0.09/100K writes, half the `nam5` rate. **[DERIVED]**, and **[UNVERIFIED]** as an exact regional table entry; I could not load the Google Cloud Firestore pricing table itself.

**Realtime Database (Blaze)** **[DOC]**:

| Item | Price |
|---|---|
| GB stored | **$5.00 / GB / month**, evaluated daily |
| GB downloaded | **$1.00 / GB** |

Critically, RTDB's "downloaded" is **not just payload**: it includes protocol overhead (WebSocket/HTTP headers, the realtime protocol) and SSL overhead (~3.5 KB per handshake, tens of bytes per message). "All traffic to and from your database, including operations denied by security rules, leads to billable costs." **[DOC]** This is the argument for a long-lived SSE stream over repeated polling, and for `print=silent` on every write.

**Cloud Functions (Blaze)**: $0.40 per million invocations beyond the 2M/month allowance, plus Google Cloud rates for GB-seconds and CPU-seconds. **[DOC]** Deploying functions also creates Cloud Build and Artifact Registry artefacts which carry small storage charges — typically cents per month. **[UNVERIFIED]** — I did not confirm current Artifact Registry free-tier limits.

### 10.3 If you ever do upgrade, read this first

> "Budget alerts do *not* cap your usage or charges." — Firebase FAQ **[DOC]**

Only **Firebase AI Logic, Firebase App Hosting, Cloud Functions for Firebase, and Firebase Extensions** currently support budget *spend caps* that actually pause the service. **[DOC]** Firestore, RTDB, Auth, and Hosting have **alerts only**. On Blaze, a runaway client loop or a leaked API key can generate an unbounded bill on exactly the products this project uses.

**This is the strongest argument for staying on Spark.** Spark's hard shutdown is a feature: the worst case is a broken app, never a surprise invoice. **[DERIVED]**

---

## 11. Console checklist — creating the project in the 2026 console

Follow in order. Steps marked ⚠ are **permanent and cannot be changed later**.

1. Go to <https://console.firebase.google.com/> and sign in.
2. Click **Create a project** (labelled **Add project** if you already have projects).
3. Enter a **project name** (e.g. `x3f-tv`).
4. ⚠ Review the auto-generated **project ID** underneath the name and edit it now if you care. It is permanent and appears in your database URL and every REST path.
5. Accept the Firebase terms → **Continue**.
6. **Gemini in Firebase** — decline. Not needed; adds surface area.
7. **Google Analytics** — decline (toggle off). It creates a linked Google Analytics property you do not need, and declining keeps the project simpler. You can add it later.
8. Click **Create project**, wait for provisioning, then **Continue**.
9. Confirm the plan. Bottom-left of the console, or **⚙ Project settings → Usage and billing**, should read **Spark**. **Do not click Upgrade.** As long as no Cloud Billing account is linked to the project, it is structurally impossible to be charged.
10. ⚠ Set the **default Google Cloud resource location**: **⚙ Project settings → General → Default GCP resource location**. Choose `nam5` (US multi-region) or `us-central` for a US household. Permanent.
11. **Create the database.**
    - **Realtime Database (recommended):** left nav → **Build → Realtime Database** → **Create Database** → ⚠ choose the location. Pick **us-central1** if you want the shorter `https://<name>.firebaseio.com` URL; `europe-west1` and `asia-southeast1` give `https://<name>.<region>.firebasedatabase.app`. Those are the only three options. Choose **Start in locked mode** → **Enable**. Copy the database URL from the top of the Data tab.
    - **Firestore (if you overrule §3):** left nav → **Build → Firestore Database** (or **Databases & Storage → Firestore**) → **Create database** → select **Standard** edition (**not Enterprise**) → **Firestore in Native Mode** → ⚠ location → **Start in production mode** → **Create**.
12. **Enable Anonymous auth.** Left nav → **Build → Authentication** (may appear under **Security → Authentication**) → **Get started** → **Sign-in method** tab → **Anonymous** → toggle **Enable** → **Save**. Nothing in §6 works until this is on.
13. **Publish the security rules.** Database → **Rules** tab → paste §9.1 (RTDB) or §9.2 (Firestore) → **Publish**. Allow up to 1 minute for new requests and up to 10 minutes for active listeners to pick them up. **[DOC]**
14. **Register a web app and grab the config.** **⚙ Project settings → General → Your apps** → click the **Web** (`</>`) icon → give it a nickname → **do not** tick "Also set up Firebase Hosting" (we use GitHub Pages) → **Register app** → copy the `firebaseConfig` object.
15. **Record only what you need.** For the REST clients: `apiKey`, `projectId`, and `databaseURL`. Put them in a single config file checked into the repo — the API key is not a secret (§7.1).
16. **Optional but recommended — restrict the API key.** Google Cloud console → **APIs & Services → Credentials** → open the auto-created "Browser key (auto created by Firebase)" → under **API restrictions**, restrict it to **Identity Toolkit API**, **Token Service API**, and **Firebase Realtime Database API** (or **Cloud Firestore API**). Do **not** set an HTTP-referrer restriction unless you create a *separate* key for the Android client — a referrer-restricted key will reject the TV app's requests. **[UNVERIFIED]** — confirm the exact behaviour with a test request from each client before locking anything down.
17. **Optional — Firestore TTL only.** Google Cloud console → **Firestore → Time-to-live → Create Policy**; collection group `invites`, field `expiresAt`. Or `gcloud firestore fields ttls update expiresAt --collection-group=invites --enable-ttl`. Takes at least 10 minutes to take effect. **[DOC]** Not applicable to RTDB.
18. **Set up local development.** `npm i -g firebase-tools` → `firebase login` → `firebase init` (select Emulators; pick Auth + Database or Firestore) → `firebase emulators:start`. Free, no billing, runs fully offline, and it is the only sane way to test the rules in §9. **[DOC]**
19. **Do not enable Cloud Storage.** It would force Blaze (§2.6).
20. **Sanity check.** From a terminal:
    ```bash
    # 1. anonymous sign-in
    curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=API_KEY" \
      -H 'Content-Type: application/json' -d '{"returnSecureToken":true}'
    # 2. a write that the rules should REJECT (no household membership yet)
    curl -s -X PUT "https://DB.firebaseio.com/households/nope/x.json?auth=ID_TOKEN" -d '{"a":1}'
    ```
    Step 2 must return a permission error. If it succeeds, your rules did not publish.

---

## 12. Gotchas — the things that will actually cost you an evening

1. **`securetoken.googleapis.com` returns snake_case** (`id_token`, `refresh_token`, `expires_in`, `user_id`) while `identitytoolkit.googleapis.com` returns camelCase (`idToken`, `refreshToken`, `expiresIn`, `localId`). Same conceptual payload, different key names, two parsers. **[DOC]**
2. **Firestore `integerValue` is a JSON string.** `{"reps":{"integerValue":"18"}}`, not `18`. **[DOC]**
3. **Firestore `PATCH` without `updateMask` replaces the whole document**, and fields named in the mask but absent from the body are **deleted**. **[DOC]**
4. **RTDB auth is a query parameter, not a header.** `?auth=<idToken>`. This is what makes browser `EventSource` work (§8.4), and it means tokens end up in URLs — keep them out of logs. **[DOC]**
5. **The SSE stream's token cannot be refreshed in place.** You will get `auth_revoked` roughly hourly. Refresh proactively at ~55 min and reconnect. **[DOC]** + **[DESIGN]**
6. **Honour the 307 on the SSE stream.** Documented as a requirement. **[DOC]**
7. **RTDB `.validate` does not cascade; `.read`/`.write` do.** Granting write at a parent cannot be narrowed at a child. **[DOC]**
8. **Firestore rules are not filters** — an unconstrained query fails if the rules cannot prove every possible result is readable. **[DOC]**
9. **Firestore rules `get()`/`exists()` are billed reads**, capped at 10 (single-doc/query) or 20 (multi-doc/transaction/batch) per request. **[DOC]**
10. **Spark quota exhaustion shuts the product off**, it does not throttle and it does not bill. **[DOC]**
11. **100 anonymous sign-ups per hour per IP address.** A reinstall-test loop hits this. Cache the refresh token; use the Auth emulator. **[DOC]**
12. **Losing an anonymous account loses household membership.** There is no password to reset. Build the re-invite path (§6.5) before you ship, not after someone loses their history.
13. **Region and project ID are permanent.** So is the RTDB location and the default GCP resource location.
14. **Pick Firestore *Standard* edition**, not Enterprise. Different billing model (read/write *units*, not operations) and Enterprise indicates paid billing. **[DOC]**
15. **Each browser tab is a simultaneous RTDB connection** against the Spark cap of 100. **[DOC]**
16. **RTDB bills protocol and SSL overhead, not just payload**, and bills traffic for requests that security rules *reject*. **[DOC]**
17. **Do not use `firebase-firestore-lite`** for the phone build — no realtime listeners, which is the whole point of the phone build. **[DOC]**
18. **On Blaze, budget alerts do not cap spend** for Firestore/RTDB/Auth/Hosting. **[DOC]**
19. **Use `?print=silent` on every RTDB write.** 204, no body, fewer billed bytes. **[DOC]**
20. **Rules propagation is not instant** — up to 1 minute for new requests, up to 10 minutes for active listeners. Do not conclude your rules are wrong from a test run 5 seconds after publishing. **[DOC]**

---

## 13. Open questions — verify before relying on these

| # | Claim | Why it is uncertain | How to settle it |
|---|---|---|---|
| 1 | Firebase Hosting Spark transfer is 360 MB/day **or** 10 GB/month | Two Google pages give different figures | Irrelevant to us (GitHub Pages); check the console usage tab if it ever matters |
| 2 | APK size cost of `firebase-auth` + `firebase-database` | No official figure found; only a forum estimate of ~400 kB for RTDB | Build a trivial APK both ways and diff with `apkanalyzer` |
| 3 | Gzipped size of `firebase-database.js` from gstatic | Only Firestore figures published, and those are 2023-era bundled measurements | `curl -sH 'Accept-Encoding: gzip' <url> \| wc -c` |
| 4 | `firebase-database.js` / `firebase-firestore-lite.js` exist at those exact CDN paths | Firebase's own alt-setup page names only app/auth/firestore/analytics | Fetch the URL and check for 200 |
| 5 | Whether Firestore Enterprise edition can be created on Spark at all | Enterprise pricing page says "requires paid billing", ambiguous | Try it in a scratch project, or just use Standard |
| 6 | Whether a Firestore query returning zero documents bills 1 read | Widely repeated; not confirmed from a primary doc here | Firestore pricing page, or measure in the console usage graph |
| 7 | RTDB rules: literal child key vs `$wildcard` precedence, i.e. whether `"$other": {".validate": false}` works as a key-allowlist | Not confirmed from a primary doc | Emulator test: write an unexpected key, assert rejection |
| 8 | Firestore rules: comparing a client-sent `expiresAt` to `request.time + duration.value(5,'m')` by equality | Server-time arithmetic against a client value is likely brittle | Emulator; fall back to a bounded range, or use the RTDB design that sends no expiry |
| 9 | Whether `documents:listen` is truly unusable from a plain HTTP client | RPC ref says gRPC/WebChannel only; discovery doc still lists a POST flatPath | Try it once with `curl`; expect it not to work |
| 10 | Whether the auto-created Firebase browser API key can be referrer-restricted without breaking the Android REST client | Not documented for the mixed web+native-REST case | Restrict, then test both clients; keep a second unrestricted key ready to roll back |
| 11 | CORS on RTDB REST / Firestore REST from a `*.github.io` origin | Expected to work; not confirmed | One `fetch()` from the deployed page |
| 12 | App Check on Spark limited to 4 of 11 reCAPTCHA Enterprise score levels | From a secondary summary | App Check docs, if you ever add App Check |
| 13 | Whether `GoogleSignInClient` deprecation and Credential Manager's Android TV support status are as described | Secondary sources only | <https://developer.android.com/identity/sign-in/credential-manager-siwg> |
| 14 | Whether the OAuth device flow returns an `id_token` when `openid` scope is requested | Google's response-field list omits it while listing `openid` as supported | Only matters if you revisit pattern (b) |
| 15 | Exact `us-central1` Firestore per-operation prices | Derived from the Standard-vs-Enterprise comparison, not read off the pricing table | <https://cloud.google.com/firestore/pricing> (would not render for me) |
| 16 | Whether Spark shutdown on quota exhaustion is daily or monthly for Firestore/RTDB | Quotas are daily; the shutdown language says "for the remainder of that month" | Firebase support, or do not get near the quota |

---

## 14. Sources

Primary Firebase / Google docs, all read 7 Sep 2026:

- Pricing — <https://firebase.google.com/pricing>
- Pricing plans — <https://firebase.google.com/docs/projects/billing/firebase-pricing-plans>
- Firebase FAQ — <https://firebase.google.com/support/faq>
- Release notes index — <https://firebase.google.com/support/releases>
- Firestore quotas and limits — <https://firebase.google.com/docs/firestore/quotas>
- Firestore billing example (nam5 unit prices) — <https://firebase.google.com/docs/firestore/billing-example>
- Firestore Enterprise pricing — <https://firebase.google.com/docs/firestore/enterprise/pricing>
- Firestore REST API guide — <https://firebase.google.com/docs/firestore/use-rest-api>
- Firestore REST reference — <https://docs.cloud.google.com/firestore/docs/reference/rest>
- Firestore `Value` reference — <https://docs.cloud.google.com/firestore/docs/reference/rest/v1/Value>
- Firestore `Write` reference — <https://docs.cloud.google.com/firestore/docs/reference/rest/v1/Write>
- Firestore `commit` — <https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/commit>
- Firestore `runQuery` — <https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/runQuery>
- Firestore RPC reference (Listen/Write are gRPC-only) — <https://docs.cloud.google.com/firestore/docs/reference/rpc/google.firestore.v1>
- Firestore offline access — <https://firebase.google.com/docs/firestore/manage-data/enable-offline>
- Firestore TTL policies — <https://firebase.google.com/docs/firestore/ttl>
- Firestore quickstart (console path) — <https://firebase.google.com/docs/firestore/quickstart>
- Firestore rules conditions — <https://firebase.google.com/docs/firestore/security/rules-conditions>
- Firestore rules and queries — <https://firebase.google.com/docs/firestore/security/rules-query>
- Firestore rules getting started — <https://firebase.google.com/docs/firestore/security/get-started>
- Rules language — <https://firebase.google.com/docs/rules/rules-language>
- Firestore Lite — <https://firebase.google.com/docs/firestore/solutions/firestore-lite>
- Firestore Lite bundle sizes (blog, 2023) — <https://firebase.blog/posts/2023/03/trim-javascript-bundles-firestore-lite>
- RTDB vs Firestore — <https://firebase.google.com/docs/database/rtdb-vs-firestore>
- RTDB limits — <https://firebase.google.com/docs/database/usage/limits>
- RTDB billing — <https://firebase.google.com/docs/database/usage/billing>
- RTDB locations — <https://firebase.google.com/docs/database/locations>
- RTDB REST — retrieve data + SSE streaming — <https://firebase.google.com/docs/database/rest/retrieve-data>
- RTDB REST — save data — <https://firebase.google.com/docs/database/rest/save-data>
- RTDB REST — authenticate requests — <https://firebase.google.com/docs/database/rest/auth>
- RTDB rules conditions — <https://firebase.google.com/docs/database/security/rules-conditions>
- Auth limits — <https://firebase.google.com/docs/auth/limits>
- Auth REST (Identity Platform) — <https://docs.cloud.google.com/identity-platform/docs/use-rest-api>
- `accounts:signInWithCustomToken` — <https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signInWithCustomToken>
- Anonymous auth (web) — <https://firebase.google.com/docs/auth/web/anonymous-auth>
- API keys — <https://firebase.google.com/docs/projects/api-keys>
- Cloud Functions get started (Blaze requirement) — <https://firebase.google.com/docs/functions/get-started>
- Cloud Storage 2026 changes FAQ — <https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024>
- Hosting quotas and pricing — <https://firebase.google.com/docs/hosting/usage-quotas-pricing>
- Web setup — <https://firebase.google.com/docs/web/setup>
- Web alternative setup (CDN/ESM) — <https://firebase.google.com/docs/web/alt-setup>
- Local Emulator Suite — <https://firebase.google.com/docs/emulator-suite>
- OAuth 2.0 for TV and limited-input devices — <https://developers.google.com/identity/protocols/oauth2/limited-input-device>
- Sign in with Google / Credential Manager — <https://developer.android.com/identity/sign-in/credential-manager-siwg>
- GitHub Pages limits — <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>
- `firebase` on npm (version 12.18.0) — <https://www.npmjs.com/package/firebase>
