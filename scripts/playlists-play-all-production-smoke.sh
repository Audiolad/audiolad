#!/usr/bin/env bash
# Play All production smoke — disposable fixtures, self-cleaning.
set -euo pipefail

ENV_FILE=/var/www/audiolad-deploy/shared/.env.production
ANON=$(grep -E '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
EMAIL="playlists.playall.smoke.$(openssl rand -hex 5)@example.com"
PASS="Smoke-$(openssl rand -hex 8)Aa1!"
API=https://audiolad.ru
AUTH=https://audiolad.ru/auth/v1
USER_ID=""
OWNER_PL=""
PUBLIC_SLUG="playall-pub-$(openssl rand -hex 3)"
PUBLIC_PL=""
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/tmp/cursor-sandbox-cache/6559d68e646d1aa9e8d3677392a92d39/playwright}"

uuid_only() { printf '%s' "$1" | tr -d '\r' | grep -Eo '[0-9a-fA-F-]{36}' | head -1; }

cleanup() {
  if [[ -n "${USER_ID:-}" ]]; then
    docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
      "DELETE FROM public.playlist_items WHERE playlist_id IN (SELECT id FROM public.playlists WHERE user_id = '$USER_ID');
       DELETE FROM public.playlists WHERE user_id = '$USER_ID';
       DELETE FROM public.user_practices WHERE user_id = '$USER_ID';
       DELETE FROM auth.users WHERE id = '$USER_ID';" >/dev/null 2>&1 || true
  fi
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

mapfile -t FREE_IDS < <(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT id FROM public.practices
   WHERE status='published' AND is_free IS TRUE AND is_catalog_listed IS TRUE
     AND COALESCE(price,0) <= 0
   ORDER BY updated_at DESC NULLS LAST LIMIT 3;")
[[ ${#FREE_IDS[@]} -ge 2 ]] || fail "need >=2 free practices"

# Resolve author/product slugs for session API
resolve_slugs() {
  local pid="$1"
  docker exec supabase-db psql -U postgres -d postgres -tAc \
    "SELECT a.slug || '|' || p.slug
     FROM public.practices p
     JOIN public.authors a ON a.id = p.author_id
     WHERE p.id = '$pid' LIMIT 1;" | tr -d '[:space:]'
}

UP_BEFORE=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.user_practices WHERE user_id = '$USER_ID';")

OWNER_PL=$(uuid_only "$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
   VALUES ('$USER_ID', 'PlayAll Owner Smoke', 'public', 'playall-owner-$(openssl rand -hex 3)', now())
   RETURNING id;")")
PUBLIC_PL=$(uuid_only "$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
   VALUES ('$USER_ID', 'PlayAll Public Smoke', 'public', '$PUBLIC_SLUG', now())
   RETURNING id;")")

POS=1
for PID in "${FREE_IDS[@]}"; do
  PID=$(echo "$PID" | tr -d '[:space:]')
  docker exec supabase-db psql -U postgres -d postgres -c \
    "INSERT INTO public.playlist_items (playlist_id, practice_id, position)
     VALUES ('$OWNER_PL', '$PID', $POS), ('$PUBLIC_PL', '$PID', $POS);" >/dev/null
  POS=$((POS+1))
done

# Add paid unavailable if exists
PAID=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT id FROM public.practices WHERE status='published' AND (is_free IS FALSE OR COALESCE(price,0)>0) LIMIT 1;" | tr -d '[:space:]' | grep -Eo '[0-9a-f-]{36}' | head -1 || true)
if [[ -n "${PAID:-}" ]]; then
  docker exec supabase-db psql -U postgres -d postgres -c \
    "INSERT INTO public.playlist_items (playlist_id, practice_id, position)
     VALUES ('$OWNER_PL', '$PAID', $POS), ('$PUBLIC_PL', '$PAID', $POS)
     ON CONFLICT DO NOTHING;" >/dev/null || true
fi

pass "fixtures"

# Session API for first free product
SLUGS=$(resolve_slugs "$(echo "${FREE_IDS[0]}" | tr -d '[:space:]')")
AUTHOR=${SLUGS%%|*}
PRODUCT=${SLUGS##*|}
[[ -n "$AUTHOR" && -n "$PRODUCT" ]] || fail "resolve slugs"

CODE=$(curl -sS -o /tmp/playall-session.json -w '%{http_code}' \
  "$API/api/listen/product/$AUTHOR/$PRODUCT/session")
[[ "$CODE" == "200" ]] || fail "guest session expected 200 got $CODE"
python3 - <<'PY'
import json
d=json.load(open("/tmp/playall-session.json"))
assert d.get("ok") is True
s=d["session"]
assert "practiceId" in s and "tracks" in s and len(s["tracks"])>=1
blob=json.dumps(s)
assert "service_role" not in blob
assert "audio_path" not in blob
assert "/object/sign/" not in blob
print("session_payload_ok")
PY
pass "session API guest free"

# fromStart clears progress field presence (empty initialProgress)
CODE=$(curl -sS -o /tmp/playall-session2.json -w '%{http_code}' \
  "$API/api/listen/product/$AUTHOR/$PRODUCT/session?fromStart=1")
[[ "$CODE" == "200" ]] || fail "fromStart session"
python3 - <<'PY'
import json
d=json.load(open("/tmp/playall-session2.json"))
assert d["session"].get("forceStartAtBeginning") is True
assert d["session"].get("initialProgress") == []
print("fromStart_ok")
PY
pass "restart fromStart payload"

# Pages
CODE=$(curl -sS -o /tmp/playall-owner.html -w '%{http_code}' -L --max-redirs 0 \
  "$API/playlists/$OWNER_PL" || true)
# without cookie should redirect sign-in
HDR=$(curl -sSI "$API/playlists/$OWNER_PL" | tr -d '\r')
echo "$HDR" | grep -qi 'location:.*sign-in' || fail "owner detail still private"
pass "owner route private"

CODE=$(curl -sS -o /tmp/playall-public.html -w '%{http_code}' "$API/p/$PUBLIC_SLUG")
[[ "$CODE" == "200" ]] || fail "public page 200"
grep -Fq 'Слушать всё' /tmp/playall-public.html || fail "public Play All button missing"
grep -Fq 'PlayAll Public Smoke' /tmp/playall-public.html || fail "public title"
pass "public page Play All UI"

# Guest view must not create entitlements
UP_AFTER_VIEW=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.user_practices WHERE user_id = '$USER_ID';")
[[ "$UP_BEFORE" == "$UP_AFTER_VIEW" ]] || fail "user_practices changed on public view"
pass "no entitlement on public view"

# Dense UI playlist (20 rows) for compact list smoke — owner only
DENSE_PL=$(uuid_only "$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "INSERT INTO public.playlists (user_id, title, visibility)
   VALUES ('$USER_ID', 'PlayAll Dense Smoke', 'private')
   RETURNING id;")")
mapfile -t DENSE_IDS < <(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT id FROM public.practices WHERE status='published' ORDER BY updated_at DESC NULLS LAST LIMIT 20;")
DPOS=1
for PID in "${DENSE_IDS[@]}"; do
  PID=$(echo "$PID" | tr -d '[:space:]')
  [[ -n "$PID" ]] || continue
  docker exec supabase-db psql -U postgres -d postgres -c \
    "INSERT INTO public.playlist_items (playlist_id, practice_id, position)
     VALUES ('$DENSE_PL', '$PID', $DPOS) ON CONFLICT DO NOTHING;" >/dev/null 2>&1 || true
  DPOS=$((DPOS+1))
done
export DENSE_PL
pass "dense 20-row fixture"

# Playwright: real ended transitions + Next/Previous + compact rows
export EMAIL PASS API OWNER_PL PUBLIC_SLUG AUTHOR PRODUCT DENSE_PL
cd /var/www/audiolad
node scripts/playlists-play-all-queue-transition-smoke.mjs

# Dense list visual check (owner login)
node <<'NODE'
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${process.env.API}/auth/sign-in`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"], input[name="email"]', process.env.EMAIL);
  await page.fill('input[type="password"], input[name="password"]', process.env.PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/auth/sign-in"), { timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${process.env.API}/playlists/${process.env.DENSE_PL}`, { waitUntil: "domcontentloaded" });
  const stats = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".playlist-item-row")];
    const heights = rows.map((el) => el.getBoundingClientRect().height);
    return {
      count: rows.length,
      max: heights.length ? Math.max(...heights) : 0,
      min: heights.length ? Math.min(...heights) : 0,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    };
  });
  if (stats.count < 15) throw new Error(`dense rows expected >=15 got ${stats.count}`);
  if (stats.max > 92 || stats.min < 70) throw new Error(`dense height ${stats.min}-${stats.max}`);
  if (stats.sw > stats.cw + 2) throw new Error("dense horizontal scroll");
  console.log("DENSE_20_OK", stats.count, stats.min, stats.max);
  await browser.close();
})().catch((e) => {
  console.error("DENSE_FAIL", e.message || e);
  process.exit(1);
});
NODE

UP_AFTER_PLAY=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.user_practices WHERE user_id = '$USER_ID';")
[[ "$UP_BEFORE" == "$UP_AFTER_PLAY" ]] || fail "user_practices changed after guest play all"
pass "guest play all no entitlement writes"

cleanup
USER_ID=""
LEFT=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.playlists WHERE title LIKE 'PlayAll %Smoke';")
[[ "$LEFT" == "0" ]] || fail "leftover playlists"
pass "cleanup"

echo "PLAY_ALL_PRODUCTION_SMOKE_PASS"
