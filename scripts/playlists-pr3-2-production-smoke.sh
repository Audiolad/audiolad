#!/usr/bin/env bash
# Playlists PR3.2 — production detail/delete + UI smoke (self-cleaning).
#
# Safety:
#   - Uses publishable key only from deploy shared env.
#   - Creates disposable auth user + playlist + items, then deletes all.
#   - Does not print tokens, keys, or passwords.
#
# Usage:
#   bash scripts/playlists-pr3-2-production-smoke.sh
set -euo pipefail

ENV_FILE=/var/www/audiolad-deploy/shared/.env.production
ANON=$(grep -E '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
EMAIL="playlists.pr32.smoke.$(openssl rand -hex 5)@example.com"
PASS="Smoke-$(openssl rand -hex 8)Aa1!"
API=https://audiolad.ru
AUTH=https://audiolad.ru/auth/v1
USER_ID=""
PRACTICE_A="41f31832-e9e2-4e22-bb05-729bbc57c815"
PRACTICE_B="9b30e602-d6ff-416e-b6a9-8f926bd0e8b7"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/tmp/cursor-sandbox-cache/6559d68e646d1aa9e8d3677392a92d39/playwright}"

cleanup() {
  if [[ -n "${USER_ID:-}" ]]; then
    docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
      "DELETE FROM public.playlists WHERE user_id = '$USER_ID'; DELETE FROM auth.users WHERE id = '$USER_ID';" \
      >/dev/null 2>&1 || true
  fi
  rm -f /tmp/pr32r.json /tmp/pr32page.html /tmp/pr32-ui-pass.txt
}
trap cleanup EXIT

fail() { echo "FAIL: $1"; exit 1; }
pass() { echo "PASS: $1"; }

echo "Creating temp smoke user..."
SIGNUP=$(curl -sS -X POST "$AUTH/signup" \
  -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

TOKEN=$(printf '%s' "$SIGNUP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access_token") or "")')
USER_ID=$(printf '%s' "$SIGNUP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("user") or {}).get("id") or "")')

if [[ -z "$TOKEN" ]]; then
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

CODE=$(curl -sS -o /tmp/pr32r.json -w '%{http_code}' -X POST "$API/api/playlists" "${AUTHH[@]}" \
  -d '{"title":"PR3.2 Smoke Detail","visibility":"private"}')
[[ "$CODE" == "201" ]] || fail "create playlist expected 201 got $CODE $(cat /tmp/pr32r.json)"
PL_ID=$(python3 -c 'import json; print(json.load(open("/tmp/pr32r.json"))["playlist"]["id"])')
pass "create playlist $PL_ID"

CODE=$(curl -sS -o /tmp/pr32r.json -w '%{http_code}' -X PUT "$API/api/playlists/membership" "${AUTHH[@]}" \
  -d "{\"practiceId\":\"$PRACTICE_A\",\"playlistIds\":[\"$PL_ID\"]}")
[[ "$CODE" == "200" ]] || fail "membership add A expected 200 got $CODE $(cat /tmp/pr32r.json)"
pass "add practice A"

CODE=$(curl -sS -o /tmp/pr32r.json -w '%{http_code}' -X PUT "$API/api/playlists/membership" "${AUTHH[@]}" \
  -d "{\"practiceId\":\"$PRACTICE_B\",\"playlistIds\":[\"$PL_ID\"]}")
[[ "$CODE" == "200" ]] || fail "membership add B expected 200 got $CODE $(cat /tmp/pr32r.json)"
pass "add practice B"

ITEM_COUNT=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.playlist_items WHERE playlist_id='$PL_ID'")
[[ "$ITEM_COUNT" == "2" ]] || fail "expected 2 items, got $ITEM_COUNT"
pass "two items stored"

CODE=$(curl -sS -o /tmp/pr32page.html -w '%{http_code}' -L "$API/playlists/not-a-uuid")
[[ "$CODE" == "404" || "$CODE" == "200" ]] || fail "invalid uuid page unexpected $CODE"
pass "invalid uuid page http $CODE"

FOREIGN=00000000-0000-4000-8000-000000000099
CODE=$(curl -sS -o /tmp/pr32page.html -w '%{http_code}' -L "$API/playlists/$FOREIGN")
[[ "$CODE" == "404" || "$CODE" == "200" ]] || fail "foreign uuid page unexpected $CODE"
pass "foreign/guest page http $CODE"

UPDATED_BEFORE=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT updated_at FROM public.playlists WHERE id='$PL_ID'")
UP_COUNT_BEFORE=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.user_practices WHERE user_id='$USER_ID'")

CODE=$(curl -sS -o /tmp/pr32r.json -w '%{http_code}' -X DELETE \
  "$API/api/playlists/$PL_ID/items/$PRACTICE_A" -H "Authorization: Bearer $TOKEN")
[[ "$CODE" == "204" ]] || fail "delete item A expected 204 got $CODE $(cat /tmp/pr32r.json)"
pass "delete item A"

COUNT=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.playlist_items WHERE playlist_id='$PL_ID'")
[[ "$COUNT" == "1" ]] || fail "expected 1 item after delete, got $COUNT"
pass "one item remains"

UPDATED_AFTER=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT updated_at FROM public.playlists WHERE id='$PL_ID'")
[[ "$UPDATED_AFTER" != "$UPDATED_BEFORE" ]] || fail "updated_at should change on delete"
pass "playlist updated_at changed"

UP_COUNT_AFTER=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.user_practices WHERE user_id='$USER_ID'")
[[ "$UP_COUNT_AFTER" == "$UP_COUNT_BEFORE" ]] || fail "user_practices must not change"
pass "user_practices unchanged"

CODE=$(curl -sS -o /tmp/pr32r.json -w '%{http_code}' -X DELETE \
  "$API/api/playlists/$PL_ID/items/$PRACTICE_A" -H "Authorization: Bearer $TOKEN")
[[ "$CODE" == "404" || "$CODE" == "204" ]] || fail "repeat delete expected 404/204 got $CODE"
[[ "$CODE" != "500" ]] || fail "repeat delete must not 500"
pass "repeat delete no 500 ($CODE)"

CODE=$(curl -sS -o /tmp/pr32r.json -w '%{http_code}' -X DELETE \
  "$API/api/playlists/$PL_ID/items/$PRACTICE_B" -H "Authorization: Bearer $TOKEN")
[[ "$CODE" == "204" ]] || fail "delete item B expected 204 got $CODE"
COUNT=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.playlist_items WHERE playlist_id='$PL_ID'")
[[ "$COUNT" == "0" ]] || fail "expected empty playlist, got $COUNT"
pass "empty playlist after last delete"

CODE=$(curl -sS -o /tmp/pr32r.json -w '%{http_code}' -X DELETE \
  "$API/api/playlists/$FOREIGN/items/$PRACTICE_A" -H "Authorization: Bearer $TOKEN")
[[ "$CODE" == "404" ]] || fail "foreign playlist delete item expected 404 got $CODE"
pass "foreign playlist item delete 404"

CODE=$(curl -sS -o /tmp/pr32r.json -w '%{http_code}' -X DELETE \
  "$API/api/playlists/$PL_ID/items/$PRACTICE_A")
[[ "$CODE" == "401" ]] || fail "unauth delete expected 401 got $CODE"
pass "unauthenticated delete 401"

# Restore items for UI smoke
curl -sS -o /tmp/pr32r.json -X PUT "$API/api/playlists/membership" "${AUTHH[@]}" \
  -d "{\"practiceId\":\"$PRACTICE_A\",\"playlistIds\":[\"$PL_ID\"]}" >/dev/null
curl -sS -o /tmp/pr32r.json -X PUT "$API/api/playlists/membership" "${AUTHH[@]}" \
  -d "{\"practiceId\":\"$PRACTICE_B\",\"playlistIds\":[\"$PL_ID\"]}" >/dev/null
pass "restored items for UI"

export SMOKE_EMAIL="$EMAIL"
export SMOKE_PASS="$PASS"
export SMOKE_PL_ID="$PL_ID"
export SMOKE_API="$API"

cd /var/www/audiolad
node scripts/playlists-pr3-2-production-ui-smoke.mjs
pass "playwright UI smoke"

LEFT=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.playlists WHERE user_id='$USER_ID'")
# cleanup trap will remove; just report
pass "pre-cleanup playlists count=$LEFT"

echo "ALL_PR3_2_PRODUCTION_SMOKE_PASS"
