#!/usr/bin/env bash
# Playlists PR2 — production API CRUD smoke (read-only credentials, self-cleaning).
#
# Purpose:
#   Safe reusable check that /api/playlists create/rename/visibility/delete
#   still work on production after deploy.
#
# Safety:
#   - Reads only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (anon/publishable) from
#     the deploy shared env file. Does NOT read service_role or passwords.
#   - Creates a disposable auth user + playlists, then deletes playlists and
#     the auth user before exit.
#   - Does not print tokens, keys, or passwords.
#
# Usage (on the app server):
#   bash scripts/playlists-pr2-production-api-smoke.sh
#
# Exit: 0 on ALL_API_CRUD_SMOKE_PASS, non-zero on failure.
set -euo pipefail

ENV_FILE=/var/www/audiolad-deploy/shared/.env.production
ANON=$(grep -E '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
EMAIL="playlists.pr2.smoke.$(openssl rand -hex 5)@example.com"
PASS="Smoke-$(openssl rand -hex 8)Aa1!"
API=https://audiolad.ru
AUTH=https://audiolad.ru/auth/v1
USER_ID=""

cleanup() {
  if [[ -n "${USER_ID:-}" ]]; then
    docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
      "DELETE FROM public.playlists WHERE user_id = '$USER_ID'; DELETE FROM auth.users WHERE id = '$USER_ID';" \
      >/dev/null 2>&1 || true
  fi
  rm -f /tmp/pr2r.json /tmp/playlists-pr2-smoke-userid.txt /tmp/playlists-pr2-smoke-email.txt
}
trap cleanup EXIT

echo "Creating temp smoke user..."
SIGNUP=$(curl -sS -X POST "$AUTH/signup" \
  -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

TOKEN=$(printf '%s' "$SIGNUP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access_token") or "")')
USER_ID=$(printf '%s' "$SIGNUP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("user") or {}).get("id") or "")')

if [[ -z "$TOKEN" ]]; then
  echo "Signup did not return token, trying password grant..."
  LOGIN=$(curl -sS -X POST "$AUTH/token?grant_type=password" \
    -H "apikey: $ANON" \
    -H "Authorization: Bearer $ANON" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
  TOKEN=$(printf '%s' "$LOGIN" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access_token") or "")')
  USER_ID=$(printf '%s' "$LOGIN" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("user") or {}).get("id") or "")')
fi

if [[ -z "$TOKEN" || -z "$USER_ID" ]]; then
  echo "FAILED to obtain smoke auth token"
  exit 1
fi

echo "user_id=$USER_ID"
AUTHH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

fail() { echo "FAIL: $1"; exit 1; }
pass() { echo "PASS: $1"; }

# empty title
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X POST "$API/api/playlists" "${AUTHH[@]}" -d '{"title":"   "}')
[[ "$CODE" == "400" ]] || fail "empty title expected 400 got $CODE"
pass "empty title rejected"

# title > 80
LONG=$(python3 -c 'print("x"*81)')
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X POST "$API/api/playlists" "${AUTHH[@]}" -d "{\"title\":\"$LONG\"}")
[[ "$CODE" == "400" ]] || fail "title>80 expected 400 got $CODE"
pass "title>80 rejected"

# create private
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X POST "$API/api/playlists" "${AUTHH[@]}" -d '{"title":"PR2 Smoke Private","visibility":"private"}')
[[ "$CODE" == "201" ]] || fail "create private expected 201 got $CODE $(cat /tmp/pr2r.json)"
PRIV_ID=$(python3 -c 'import json; print(json.load(open("/tmp/pr2r.json"))["playlist"]["id"])')
pass "create private $PRIV_ID"

# create public
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X POST "$API/api/playlists" "${AUTHH[@]}" -d '{"title":"PR2 Smoke Public","visibility":"public"}')
[[ "$CODE" == "201" ]] || fail "create public expected 201 got $CODE $(cat /tmp/pr2r.json)"
PUB_ID=$(python3 -c 'import json; d=json.load(open("/tmp/pr2r.json")); print(d["playlist"]["id"])')
PUB_SLUG=$(python3 -c 'import json; d=json.load(open("/tmp/pr2r.json")); print(d["playlist"]["slug"] or "")')
[[ -n "$PUB_SLUG" ]] || fail "public slug missing"
pass "create public $PUB_ID slug=$PUB_SLUG"

# rename private
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X PATCH "$API/api/playlists/$PRIV_ID" "${AUTHH[@]}" -d '{"title":"PR2 Smoke Private Renamed"}')
[[ "$CODE" == "200" ]] || fail "rename expected 200 got $CODE"
pass "rename private"

# private -> public
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X PATCH "$API/api/playlists/$PRIV_ID" "${AUTHH[@]}" -d '{"visibility":"public"}')
[[ "$CODE" == "200" ]] || fail "private->public expected 200 got $CODE"
pass "private->public"

# public -> private
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X PATCH "$API/api/playlists/$PRIV_ID" "${AUTHH[@]}" -d '{"visibility":"private"}')
[[ "$CODE" == "200" ]] || fail "public->private expected 200 got $CODE"
pass "public->private"

# unknown fields
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X POST "$API/api/playlists" "${AUTHH[@]}" -d '{"title":"x","extra":1}')
[[ "$CODE" == "400" ]] || fail "unknown fields expected 400 got $CODE"
pass "unknown fields rejected"

# foreign uuid 404
FOREIGN=00000000-0000-4000-8000-000000000099
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X PATCH "$API/api/playlists/$FOREIGN" "${AUTHH[@]}" -d '{"title":"nope"}')
[[ "$CODE" == "404" ]] || fail "foreign uuid expected 404 got $CODE"
pass "foreign uuid 404"

# delete both
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X DELETE "$API/api/playlists/$PRIV_ID" -H "Authorization: Bearer $TOKEN")
[[ "$CODE" == "204" ]] || fail "delete private expected 204 got $CODE"
CODE=$(curl -sS -o /tmp/pr2r.json -w '%{http_code}' -X DELETE "$API/api/playlists/$PUB_ID" -H "Authorization: Bearer $TOKEN")
[[ "$CODE" == "204" ]] || fail "delete public expected 204 got $CODE"
pass "deleted playlists"

# verify DB cleanup for this user
COUNT=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT COUNT(*) FROM public.playlists WHERE user_id='$USER_ID'")
[[ "$COUNT" == "0" ]] || fail "leftover playlists for smoke user: $COUNT"
pass "db cleaned for smoke user"

echo "ALL_API_CRUD_SMOKE_PASS"
