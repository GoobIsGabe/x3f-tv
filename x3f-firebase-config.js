/* X3F FIREBASE CONFIG — the live x3f-tv project.

   THIS FILE IS SAFE TO COMMIT TO A PUBLIC REPO. A Firebase web API key is not a
   secret and is not a credential: it identifies the project so requests can be
   routed and quota'd, and it authorises nothing at all. Every read and write is
   decided by the security rules in firebase/database.rules.json, which are
   published and which deny everything by default. Google's own guidance is that
   these values ship in client bundles; that is what they are for.

   What IS sensitive, and is deliberately not here: a service-account private
   key. There is none in this project, because the design never needs to mint a
   custom token (see docs/FIREBASE-SETUP.md).

   Project:   x3f-tv          (Spark plan, no billing account linked)
   Database:  us-central1     PERMANENT. Realtime Database offers exactly three
                              locations — us-central1, europe-west1,
                              asia-southeast1 — so there is no us-east option
                              for RTDB, and us-central1 is the only US one.
                              Round trip from the US east coast is a few tens of
                              milliseconds, against a workload of a few hundred
                              small records a month.
   Auth:      Anonymous, with auto clean-up deliberately OFF. Auto clean-up
              deletes anonymous accounts after 30 days, and in this design the
              anonymous account IS the household membership — there is no
              password to recover it with.

   Empty this out and the app simply runs local-only, which is a complete
   product on its own and is what it does before anyone pairs a phone. */
window.X3F_FIREBASE = {
  apiKey: 'AIzaSyC76ViNxjz6Yb_n7My4a9BBCY_czR_5GO4',
  projectId: 'x3f-tv',
  databaseURL: 'https://x3f-tv-default-rtdb.firebaseio.com',
  /* Where the phone build lives, used to build the pairing QR code. */
  phoneUrl: 'https://goobisgabe.github.io/x3f-tv/'
};
