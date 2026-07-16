#!/usr/bin/env bash
# Playlists PR3.3 — production cover API + UI smoke (self-cleaning).
#
# Purpose:
#   Safe reusable check that playlist cover upload/replace/clear and detail UI
#   still work on production after deploy.
#
# Safety:
#   - Reads only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from the deploy shared
#     env file. Does NOT read service_role or passwords from disk into logs.
#   - Creates a disposable auth user + playlists, then deletes them on exit.
#   - Does not print tokens, keys, or passwords.
#   - Uses published free practice IDs only as membership fixtures (read-only
#     references; does not mutate those products).
#
# Env (optional):
#   PLAYWRIGHT_BROWSERS_PATH — Playwright browsers cache for UI smoke
#
# Usage (on the app server):
#   bash scripts/playlists-pr3-3-production-smoke.sh
#
# Exit: 0 on ALL_PR3_3_PRODUCTION_SMOKE_PASS, non-zero on failure.
set -euo pipefail

ENV_FILE=/var/www/audiolad-deploy/shared/.env.production
ANON=$(grep -E '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
EMAIL="playlists.pr33.smoke.$(openssl rand -hex 5)@example.com"
PASS="Smoke-$(openssl rand -hex 8)Aa1!"
API=https://audiolad.ru
AUTH=https://audiolad.ru/auth/v1
USER_ID=""
TOKEN=""
# Published free catalog practices used only as membership fixtures.
PRACTICE_A="41f31832-e9e2-4e22-bb05-729bbc57c815"
PRACTICE_B="9b30e602-d6ff-416e-b6a9-8f926bd0e8b7"
PRACTICE_C="c3d63131-3ef4-4dbb-8888-0a5085a456b5"
FIX=/var/www/audiolad/scripts/fixtures/playlist-covers
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/tmp/cursor-sandbox-cache/6559d68e646d1aa9e8d3677392a92d39/playwright}"

cleanup() {
  if [[ -n "${USER_ID:-}" ]]; then
    # Prefer API deletes so playlist cover Storage cleanup runs server-side.
    if [[ -n "${TOKEN:-}" ]]; then
      while read -r pid; do
        [[ -n "$pid" ]] || continue
        curl -sS -o /dev/null -X DELETE "$API/api/playlists/$pid" \
          -H "Authorization: Bearer $TOKEN" >/dev/null 2>&1 || true
      done < <(docker exec supabase-db psql -U postgres -d postgres -tAc \
        "SELECT id FROM public.playlists WHERE user_id='$USER_ID'" 2>/dev/null || true)
    fi
    docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
      "DELETE FROM public.playlists WHERE user_id = '$USER_ID'; DELETE FROM auth.users WHERE id = '$USER_ID';" \
      >/dev/null 2>&1 || true
  fi
  rm -f /tmp/pr33r.json /tmp/pr33page.html
}
trap cleanup EXIT

fail() { echo "FAIL: $1"; exit 1; }
pass() { echo "PASS: $1"; }

echo "Creating temp smoke user..."
SIGNUP=$(curl -sS -X POST "$AUTH/signup" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(printf '%s' "$SIGNUP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access_token") or "")')
USER_ID=$(printf '%s' "$SIGNUP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("user") or {}).get("id") or "")')
if [[ -z "$TOKEN" ]]; then
  LOGIN=$(curl -sS -X POST "$AUTH/token?grant_type=password" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
  TOKEN=$(printf '%s' "$LOGIN" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access_token") or "")')
  USER_ID=$(printf '%s' "$LOGIN" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("user") or {}).get("id") or "")')
fi
[[ -n "$TOKEN" && -n "$USER_ID" ]] || fail "auth"
echo "user_id=$USER_ID"
AUTHH=(-H "Authorization: Bearer $TOKEN")

# create empty + filled playlists
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists" "${AUTHH[@]}" -H 'Content-Type: application/json' \
  -d '{"title":"PR33 Empty","visibility":"private"}')
[[ "$CODE" == "201" ]] || fail "create empty $CODE"
EMPTY_ID=$(python3 -c 'import json; print(json.load(open("/tmp/pr33r.json"))["playlist"]["id"])')

CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists" "${AUTHH[@]}" -H 'Content-Type: application/json' \
  -d '{"title":"PR33 Covers","visibility":"private"}')
[[ "$CODE" == "201" ]] || fail "create covers $CODE"
PL_ID=$(python3 -c 'import json; print(json.load(open("/tmp/pr33r.json"))["playlist"]["id"])')
pass "playlists created"

for P in "$PRACTICE_A" "$PRACTICE_B" "$PRACTICE_C"; do
  CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X PUT "$API/api/playlists/membership" "${AUTHH[@]}" -H 'Content-Type: application/json' \
    -d "{\"practiceId\":\"$P\",\"playlistIds\":[\"$PL_ID\"]}")
  [[ "$CODE" == "200" ]] || fail "membership $P $CODE"
done
pass "3 items added"

# unauth
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists/$PL_ID/cover" -F "file=@$FIX/landscape.jpg")
[[ "$CODE" == "401" ]] || fail "unauth post expected 401 got $CODE"
pass "unauth POST 401"

CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X DELETE "$API/api/playlists/$PL_ID/cover")
[[ "$CODE" == "401" ]] || fail "unauth delete expected 401 got $CODE"
pass "unauth DELETE 401"

# invalid uuid
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists/not-a-uuid/cover" "${AUTHH[@]}" -F "file=@$FIX/landscape.jpg")
[[ "$CODE" == "404" ]] || fail "invalid uuid expected 404 got $CODE"
pass "invalid uuid 404"

FOREIGN=00000000-0000-4000-8000-000000000099
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists/$FOREIGN/cover" "${AUTHH[@]}" -F "file=@$FIX/landscape.jpg")
[[ "$CODE" == "404" ]] || fail "foreign expected 404 got $CODE"
pass "foreign 404"

# invalid types
for f in tiny.gif icon.svg fake-jpeg.jpg corrupt.webp; do
  CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists/$PL_ID/cover" "${AUTHH[@]}" -F "file=@$FIX/$f")
  [[ "$CODE" == "400" ]] || fail "reject $f expected 400 got $CODE $(cat /tmp/pr33r.json)"
  MSG=$(python3 -c 'import json; print(json.load(open("/tmp/pr33r.json")).get("message",""))')
  echo "$MSG" | grep -qiE 'JPG|PNG|WebP|обработ' || fail "safe message for $f: $MSG"
  echo "$MSG" | grep -qiE 'stack|service_role|storage\.|SQL' && fail "leak in $f message"
done
pass "invalid MIME/corrupt rejected safely"

# valid uploads
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists/$PL_ID/cover" "${AUTHH[@]}" -F "file=@$FIX/landscape.jpg")
[[ "$CODE" == "200" ]] || fail "jpeg upload $CODE $(cat /tmp/pr33r.json)"
COVER1=$(python3 -c 'import json; print(json.load(open("/tmp/pr33r.json")).get("coverUrl") or "")')
[[ -n "$COVER1" ]] || fail "missing signed url"
echo "$COVER1" | grep -q 'token=' || fail "signed url missing token"
pass "JPEG upload + signed URL"

PATH1=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT cover_path FROM public.playlists WHERE id='$PL_ID'")
[[ -n "$PATH1" ]] || fail "cover_path empty"
OBJS1=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT COUNT(*) FROM storage.objects WHERE bucket_id='playlist-covers' AND name='$PATH1'")
[[ "$OBJS1" == "1" ]] || fail "storage object missing"

# replace with PNG
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists/$PL_ID/cover" "${AUTHH[@]}" -F "file=@$FIX/portrait.png")
[[ "$CODE" == "200" ]] || fail "png replace $CODE"
PATH2=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT cover_path FROM public.playlists WHERE id='$PL_ID'")
[[ "$PATH2" != "$PATH1" ]] || fail "path should change on replace"
OLD=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT COUNT(*) FROM storage.objects WHERE bucket_id='playlist-covers' AND name='$PATH1'")
[[ "$OLD" == "0" ]] || fail "old object not cleaned"
pass "PNG replace cleans old object"

# webp replace
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists/$PL_ID/cover" "${AUTHH[@]}" -F "file=@$FIX/square.webp")
[[ "$CODE" == "200" ]] || fail "webp replace $CODE"
pass "WebP replace"

# delete none on empty playlist
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X DELETE "$API/api/playlists/$EMPTY_ID/cover" "${AUTHH[@]}")
[[ "$CODE" == "204" ]] || fail "delete none expected 204 got $CODE"
pass "delete none 204"

# return automatic
PATH3=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT cover_path FROM public.playlists WHERE id='$PL_ID'")
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X DELETE "$API/api/playlists/$PL_ID/cover" "${AUTHH[@]}")
[[ "$CODE" == "204" ]] || fail "clear cover $CODE"
CLR=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT cover_path IS NULL AND cover_updated_at IS NULL FROM public.playlists WHERE id='$PL_ID'")
[[ "$CLR" == "t" ]] || fail "fields not cleared"
GONE=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT COUNT(*) FROM storage.objects WHERE bucket_id='playlist-covers' AND name='$PATH3'")
[[ "$GONE" == "0" ]] || fail "cleared object remains"
pass "return automatic"

# re-upload then delete playlist cleanup
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists/$PL_ID/cover" "${AUTHH[@]}" -F "file=@$FIX/landscape.jpg")
[[ "$CODE" == "200" ]] || fail "reupload $CODE"
PATH4=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT cover_path FROM public.playlists WHERE id='$PL_ID'")
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X DELETE "$API/api/playlists/$PL_ID" "${AUTHH[@]}")
[[ "$CODE" == "204" ]] || fail "delete playlist $CODE"
GONE2=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT COUNT(*) FROM storage.objects WHERE bucket_id='playlist-covers' AND name='$PATH4'")
[[ "$GONE2" == "0" ]] || fail "playlist delete left cover object"
pass "playlist delete cleans cover"

# recreate for UI
CODE=$(curl -sS -o /tmp/pr33r.json -w '%{http_code}' -X POST "$API/api/playlists" "${AUTHH[@]}" -H 'Content-Type: application/json' \
  -d '{"title":"PR33 UI Mosaic","visibility":"private"}')
PL_ID=$(python3 -c 'import json; print(json.load(open("/tmp/pr33r.json"))["playlist"]["id"])')
for P in "$PRACTICE_A" "$PRACTICE_B" "$PRACTICE_C"; do
  curl -sS -o /tmp/pr33r.json -X PUT "$API/api/playlists/membership" "${AUTHH[@]}" -H 'Content-Type: application/json' \
    -d "{\"practiceId\":\"$P\",\"playlistIds\":[\"$PL_ID\"]}" >/dev/null
done

export SMOKE_EMAIL="$EMAIL" SMOKE_PASS="$PASS" SMOKE_PL_ID="$PL_ID" SMOKE_API="$API" SMOKE_EMPTY_ID="$EMPTY_ID"
cd /var/www/audiolad
node scripts/playlists-pr3-3-production-ui-smoke.mjs
pass "UI smoke"

echo "ALL_PR3_3_PRODUCTION_SMOKE_PASS"
