#!/usr/bin/env bash
# X3F — prove the published security rules actually work, against the LIVE database.
#
# WHY THIS EXISTS. The first version of these rules was carefully reasoned about,
# reviewed, and completely broken: "you may write to a household if you are
# already a member of it" is correct for every write except the first one, so
# creating a household — the very first thing any user does — was denied and
# nobody could ever pair anything. No amount of reading found it. One curl did.
#
# So: every clause gets exercised, positive AND negative, against the real thing.
# Run it after any rules change. It creates a throwaway household and deletes it.
#
#   bash firebase/verify.sh
#
# The API key is not a secret (see web/x3f-firebase-config.js).

set -u
KEY="AIzaSyC76ViNxjz6Yb_n7My4a9BBCY_czR_5GO4"
DB="https://x3f-tv-default-rtdb.firebaseio.com"
pass=0; fail=0

say() { printf '%-58s %s\n' "$1" "$2"; }
ok()   { pass=$((pass+1)); say "$1" "PASS"; }
bad()  { fail=$((fail+1)); say "$1" "FAIL  <- $2"; }

# denied() asserts a request WAS refused; allowed() asserts it was not.
denied() { case "$2" in *"Permission denied"*) ok "$1";; *) bad "$1" "${2:0:90}";; esac; }
allowed(){ case "$2" in *"Permission denied"*|*'"error"'*) bad "$1" "${2:0:90}";; *) ok "$1";; esac; }
# allowed() only proves a request was not refused, and `null` is not refused.
# The two polling loops that pairing added READ A VALUE and branch on it, so for
# those the absence of an error is not the assertion worth making.
holds()  { case "$3" in *"$2"*) ok "$1";; *) bad "$1" "expected $2, got ${3:0:70}";; esac; }

echo "── auth ──"
A=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY" \
      -H 'Content-Type: application/json' -d '{"returnSecureToken":true}')
TOK=$(printf '%s' "$A" | python -c "import sys,json;print(json.load(sys.stdin).get('idToken',''))")
UID1=$(printf '%s' "$A" | python -c "import sys,json;print(json.load(sys.stdin).get('localId',''))")
[ -n "$TOK" ] && ok "anonymous sign-up returns a token" || bad "anonymous sign-up" "$A"

B=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY" \
      -H 'Content-Type: application/json' -d '{"returnSecureToken":true}')
TOK2=$(printf '%s' "$B" | python -c "import sys,json;print(json.load(sys.stdin).get('idToken',''))")
UID2=$(printf '%s' "$B" | python -c "import sys,json;print(json.load(sys.stdin).get('localId',''))")

HID=$(python -c "import random,string;print(''.join(random.choice(string.ascii_letters+string.digits) for _ in range(22)))")
CODE=$(python -c "
import random
A='23456789ABCDEFGHJKMNPQRSTUVWXYZ'
print(''.join(random.choice(A) for _ in range(6)))")

echo
echo "── the deny path ──"
denied "unauthenticated read of /households" "$(curl -s "$DB/households.json")"
denied "reading another user's userIndex"    "$(curl -s "$DB/userIndex/not-me.json?auth=$TOK")"
denied "writing into a household you are not in" \
       "$(curl -s -X PUT "$DB/households/someone-elses/x.json?auth=$TOK" -d '{"a":1}')"

echo
echo "── creating a household (the bootstrap that was broken) ──"
python - "$HID" "$UID1" > /tmp/x3f-create.json <<'PY'
import json,sys
hid,uid=sys.argv[1],sys.argv[2]
print(json.dumps({
  'households/%s/meta/createdAt'%hid: {'.sv':'timestamp'},
  'households/%s/members/%s'%(hid,uid): {'role':'owner','addedAt':{'.sv':'timestamp'}},
  'userIndex/%s'%uid: hid,
}))
PY
allowed "owner creates their own household" \
        "$(curl -s -X PATCH "$DB/.json?auth=$TOK&print=silent" -d @/tmp/x3f-create.json)"
allowed "and can read it back" "$(curl -s "$DB/households/$HID/members.json?auth=$TOK")"
denied  "a stranger cannot read it"  "$(curl -s "$DB/households/$HID/members.json?auth=$TOK2")"
denied  "a stranger cannot write to it" \
        "$(curl -s -X PUT "$DB/households/$HID/sets/202609/hack.json?auth=$TOK2" -d '{"a":1}')"

echo
echo "── writing a set ──"
python - "$UID1" > /tmp/x3f-set.json <<'PY'
import json,sys
print(json.dumps({'profileId':'default','exercise':'chest-press','band':'Dark Gray',
                  'reps':24,'full':18,'mid':4,'weak':2,'peak':142,'tut':96,'strong':22,
                  'ts':{'.sv':'timestamp'},'by':sys.argv[1]}))
PY
allowed "a member logs a set" \
        "$(curl -s -X PUT "$DB/households/$HID/sets/202609/s1.json?auth=$TOK&print=silent" -d @/tmp/x3f-set.json)"
denied  "a set cannot be stamped with someone else's uid" \
        "$(curl -s -X PUT "$DB/households/$HID/sets/202609/s2.json?auth=$TOK&print=silent" \
            -d "{\"profileId\":\"default\",\"exercise\":\"deadlift\",\"reps\":10,\"ts\":{\".sv\":\"timestamp\"},\"by\":\"$UID2\"}")"
denied  "an unknown field is rejected (the \$other allowlist)" \
        "$(curl -s -X PUT "$DB/households/$HID/sets/202609/s3.json?auth=$TOK&print=silent" \
            -d "{\"profileId\":\"default\",\"exercise\":\"deadlift\",\"reps\":10,\"ts\":{\".sv\":\"timestamp\"},\"by\":\"$UID1\",\"evil\":1}")"
denied  "a bad bucket name is rejected" \
        "$(curl -s -X PUT "$DB/households/$HID/sets/nope/s4.json?auth=$TOK&print=silent" -d @/tmp/x3f-set.json)"

echo
echo "── the pairing handshake ──"
allowed "the TV mints an invite" \
        "$(curl -s -X PUT "$DB/invites/$CODE.json?auth=$TOK&print=silent" \
            -d "{\"householdId\":\"$HID\",\"invitedBy\":\"$UID1\",\"createdAt\":{\".sv\":\"timestamp\"}}")"
denied  "the phone cannot READ an invite before claiming it" \
        "$(curl -s "$DB/invites/$CODE.json?auth=$TOK2")"
allowed "the phone claims it blind" \
        "$(curl -s -X PATCH "$DB/invites/$CODE.json?auth=$TOK2&print=silent" \
            -d "{\"claimedBy\":\"$UID2\",\"claimedAt\":{\".sv\":\"timestamp\"}}")"
allowed "and can now read it, learning the household id" \
        "$(curl -s "$DB/invites/$CODE.json?auth=$TOK2")"
denied  "claiming grants NOTHING on its own" \
        "$(curl -s "$DB/households/$HID/sets/202609.json?auth=$TOK2")"

# X3FSync.watchInvite() polls this exact path as the INVITER. There is no push
# on Spark - no Cloud Functions, so no way for the database to tell the
# television that somebody knocked - so the TV finding out at all rests on this
# one read being permitted AND on claimedBy being visible inside it.
holds   "the TV can poll its own invite and see the claim" "$UID2" \
        "$(curl -s "$DB/invites/$CODE.json?auth=$TOK")"

# X3FSync.awaitJoin() polls this path on the phone and reads REFUSAL as "not
# yet". That is only sound if refusal is genuinely what an unconfirmed phone
# gets. If it ever started returning null instead, the phone would sit on a
# spinner forever and nothing anywhere would say why.
denied  "the phone's membership poll is refused before confirmation" \
        "$(curl -s "$DB/households/$HID/members/$UID2/role.json?auth=$TOK2")"

python - "$HID" "$UID2" "$CODE" > /tmp/x3f-confirm.json <<'PY'
import json,sys
hid,uid,code=sys.argv[1],sys.argv[2],sys.argv[3]
print(json.dumps({
  'households/%s/members/%s'%(hid,uid): {'role':'member','addedAt':{'.sv':'timestamp'}},
  'invites/%s'%code: None,
}))
PY
allowed "the TV confirms, granting membership and burning the invite" \
        "$(curl -s -X PATCH "$DB/.json?auth=$TOK&print=silent" -d @/tmp/x3f-confirm.json)"
allowed "the phone can now read the household's sets" \
        "$(curl -s "$DB/households/$HID/sets/202609.json?auth=$TOK2")"
holds   "and its membership poll now returns a role" "member" \
        "$(curl -s "$DB/households/$HID/members/$UID2/role.json?auth=$TOK2")"
denied  "the burnt invite cannot be claimed a second time" \
        "$(curl -s -X PATCH "$DB/invites/$CODE.json?auth=$TOK2&print=silent" \
            -d '{"claimedBy":"x","claimedAt":{".sv":"timestamp"}}')"

echo
echo "── cleanup ──"
curl -s -X DELETE "$DB/households/$HID.json?auth=$TOK&print=silent" > /dev/null
curl -s -X DELETE "$DB/userIndex/$UID1.json?auth=$TOK&print=silent" > /dev/null
curl -s -X DELETE "$DB/userIndex/$UID2.json?auth=$TOK2&print=silent" > /dev/null
rm -f /tmp/x3f-create.json /tmp/x3f-set.json /tmp/x3f-confirm.json

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" -eq 0 ]
