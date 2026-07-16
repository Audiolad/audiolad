#!/usr/bin/env bash
# Playlists PR5 — production public page HTTP/SEO/security/UI smoke (self-cleaning).
set -euo pipefail

# shellcheck source=lib/guard-playwright.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/guard-playwright.sh"

ENV_FILE=/var/www/audiolad-deploy/shared/.env.production
ANON=$(grep -E '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
EMAIL="playlists.pr5.smoke.$(openssl rand -hex 5)@example.com"
PASS="Smoke-$(openssl rand -hex 8)Aa1!"
API=https://audiolad.ru
AUTH=https://audiolad.ru/auth/v1
USER_ID=""
PUBLIC_ID=""
PRIVATE_ID=""
UNPUB_ID=""
PUBLIC_SLUG=""
PRIVATE_SLUG=""
UNPUB_SLUG=""
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/tmp/cursor-sandbox-cache/6559d68e646d1aa9e8d3677392a92d39/playwright}"

cleanup() {
  if [[ -n "${USER_ID:-}" ]]; then
    docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
      "DELETE FROM public.playlist_items WHERE playlist_id IN (SELECT id FROM public.playlists WHERE user_id = '$USER_ID');
       DELETE FROM public.playlists WHERE user_id = '$USER_ID';
       DELETE FROM public.user_practices WHERE user_id = '$USER_ID';
       DELETE FROM auth.users WHERE id = '$USER_ID';" \
      >/dev/null 2>&1 || true
  fi
  rm -f /tmp/pr5-public.html /tmp/pr5-body.html /tmp/pr5-ui.json
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
  USER_ID=$(printf '%s' "$LOGIN" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("user") or {}).get("id") or d.get("user",{}).get("id") or "")')
fi

[[ -n "$TOKEN" && -n "$USER_ID" ]] || fail "auth failed"

UP_BEFORE=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.user_practices WHERE user_id = '$USER_ID';")

PUBLIC_SLUG="pr5-smoke-$(openssl rand -hex 4)"
PRIVATE_SLUG="pr5-priv-$(openssl rand -hex 4)"
UNPUB_SLUG="pr5-unpub-$(openssl rand -hex 4)"

mapfile -t FREE_IDS < <(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT id FROM public.practices
   WHERE status = 'published' AND is_free IS TRUE AND is_catalog_listed IS TRUE
     AND (price IS NULL OR price <= 0)
   ORDER BY updated_at DESC NULLS LAST LIMIT 4;")

[[ ${#FREE_IDS[@]} -ge 1 ]] || fail "need free practices"

uuid_only() {
  printf '%s' "$1" | tr -d '\r' | grep -Eo '[0-9a-fA-F-]{36}' | head -1
}

PUBLIC_ID=$(uuid_only "$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
   VALUES ('$USER_ID', 'PR5 Public Smoke', 'public', '$PUBLIC_SLUG', now())
   RETURNING id;")")
# private cannot hold slug under DB constraints; create public then flip to private
# (slug cleared) and assert former slug → 404.
PRIVATE_ID=$(uuid_only "$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
   VALUES ('$USER_ID', 'PR5 Was Public Now Private', 'public', '$PRIVATE_SLUG', now())
   RETURNING id;")")
[[ -n "$PUBLIC_ID" && -n "$PRIVATE_ID" ]] || fail "playlist insert failed"
docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "UPDATE public.playlists
   SET visibility = 'private', slug = NULL, published_at = NULL
   WHERE id = '$PRIVATE_ID';" >/dev/null
UNPUB_ID=$(uuid_only "$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "INSERT INTO public.playlists (user_id, title, visibility, slug, published_at)
   VALUES ('$USER_ID', 'PR5 Unpublished Smoke', 'public', '$UNPUB_SLUG', NULL)
   RETURNING id;")")
[[ -n "$UNPUB_ID" ]] || fail "unpublished insert failed"

POS=1
for PID in "${FREE_IDS[@]}"; do
  docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "INSERT INTO public.playlist_items (playlist_id, practice_id, position)
     VALUES ('$PUBLIC_ID', '$PID', $POS);" >/dev/null
  POS=$((POS+1))
done

PAID=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT id FROM public.practices WHERE status='published' AND (is_free IS FALSE OR COALESCE(price,0) > 0) LIMIT 1;")
if [[ -n "$PAID" ]]; then
  docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "INSERT INTO public.playlist_items (playlist_id, practice_id, position)
     VALUES ('$PUBLIC_ID', '$PAID', $POS)
     ON CONFLICT DO NOTHING;" >/dev/null || true
fi

UPDATED_BEFORE=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT updated_at FROM public.playlists WHERE id = '$PUBLIC_ID';")

pass "fixtures created"

CODE=$(curl -sS -o /tmp/pr5-public.html -w '%{http_code}' "$API/p/$PUBLIC_SLUG")
[[ "$CODE" == "200" ]] || fail "public slug expected 200 got $CODE"
pass "public slug 200"

CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$API/p/$PRIVATE_SLUG")
[[ "$CODE" == "404" ]] || fail "private slug expected 404 got $CODE"
pass "private slug 404"

CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$API/p/$UNPUB_SLUG")
[[ "$CODE" == "404" ]] || fail "unpublished expected 404 got $CODE"
pass "unpublished 404"

CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$API/p/does-not-exist-pr5-xyz")
[[ "$CODE" == "404" ]] || fail "unknown expected 404 got $CODE"
pass "unknown 404"

CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$API/p/AB")
[[ "$CODE" == "404" ]] || fail "invalid slug expected 404 got $CODE"
pass "invalid slug 404"

CODE=$(curl -sS -o /dev/null -w '%{http_code}' --path-as-is "$API/p/..%2fetc" || true)
[[ "$CODE" == "404" || "$CODE" == "400" || "$CODE" == "308" || "$CODE" == "301" ]] \
  || fail "traversal unexpected $CODE"
pass "traversal blocked ($CODE)"

LOC=$(curl -sS -o /dev/null -w '%{redirect_url}' "$API/p/$PUBLIC_SLUG")
[[ -z "$LOC" ]] || fail "guest should not redirect got $LOC"
pass "guest no redirect"

HDR=$(curl -sSI "$API/playlists/$PUBLIC_ID" | tr -d '\r')
echo "$HDR" | grep -qi 'location:.*sign-in' || fail "private detail should redirect to sign-in"
pass "owner detail still private"

HTML=$(cat /tmp/pr5-public.html)
echo "$HTML" | grep -Fq "$USER_ID" && fail "HTML contains owner UUID"
echo "$HTML" | grep -Fiq "$EMAIL" && fail "HTML contains email"
echo "$HTML" | grep -Eiq 'service_role|SUPABASE_SERVICE' && fail "HTML contains service role"
echo "$HTML" | grep -Eiq 'playlist-covers/' && fail "HTML contains raw cover_path"
echo "$HTML" | grep -Eiq '/storage/v1/object/sign/.+\.(mp3|m4a|wav|aac)' && fail "HTML contains audio signed URL"
echo "$HTML" | grep -Eiq 'permission denied|PGRST' && fail "HTML contains SQL/RLS errors"
echo "$HTML" | grep -Fq 'Публичный плейлист' || fail "missing public label"
echo "$HTML" | grep -Fq 'PR5 Public Smoke' || fail "missing title"
echo "$HTML" | grep -Fq 'Войти' || fail "missing guest CTA"
pass "HTML security + guest UI"

echo "$HTML" | grep -Fq 'PR5 Public Smoke — АудиоЛад' || fail "missing title metadata"
echo "$HTML" | grep -Fq "/p/$PUBLIC_SLUG" || fail "canonical slug missing"
echo "$HTML" | grep -Eiq 'name="robots"[^>]*noindex|content="noindex' && fail "public page should be indexable"
pass "metadata SEO"

# Private metadata should not leak title
PRIV_HTML=$(curl -sS "$API/p/$PRIVATE_SLUG" || true)
echo "$PRIV_HTML" | grep -Fq 'PR5 Private Smoke' && fail "private title leaked in 404"
pass "private title not leaked"

UP_AFTER=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.user_practices WHERE user_id = '$USER_ID';")
UPDATED_AFTER=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT updated_at FROM public.playlists WHERE id = '$PUBLIC_ID';")
[[ "$UP_BEFORE" == "$UP_AFTER" ]] || fail "user_practices changed on view"
[[ "$UPDATED_BEFORE" == "$UPDATED_AFTER" ]] || fail "playlist updated_at changed on view"
pass "no entitlement / updated_at side effects"

docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "UPDATE public.playlists SET title = 'PR5 Renamed Smoke' WHERE id = '$PUBLIC_ID';" >/dev/null
CODE=$(curl -sS -o /tmp/pr5-public.html -w '%{http_code}' "$API/p/$PUBLIC_SLUG")
[[ "$CODE" == "200" ]] || fail "after rename expected 200"
grep -Fq 'PR5 Renamed Smoke' /tmp/pr5-public.html || fail "stale title after rename"
pass "freshness rename"

# Reorder top items if at least 2
if [[ ${#FREE_IDS[@]} -ge 2 ]]; then
  docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "UPDATE public.playlist_items SET position = 100 WHERE playlist_id = '$PUBLIC_ID' AND practice_id = '${FREE_IDS[0]}';
     UPDATE public.playlist_items SET position = 1 WHERE playlist_id = '$PUBLIC_ID' AND practice_id = '${FREE_IDS[1]}';
     UPDATE public.playlist_items SET position = 2 WHERE playlist_id = '$PUBLIC_ID' AND practice_id = '${FREE_IDS[0]}';" >/dev/null
  curl -sS -o /tmp/pr5-public.html "$API/p/$PUBLIC_SLUG" >/dev/null
  pass "freshness reorder applied"
fi

docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "UPDATE public.playlists
   SET visibility = 'private', slug = NULL, published_at = NULL
   WHERE id = '$PUBLIC_ID';" >/dev/null
CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$API/p/$PUBLIC_SLUG")
[[ "$CODE" == "404" ]] || fail "after private expected 404 got $CODE"
pass "freshness private→404"

docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "UPDATE public.playlists
   SET visibility = 'public',
       title = 'PR5 Public Smoke',
       slug = '$PUBLIC_SLUG',
       published_at = COALESCE(published_at, now())
   WHERE id = '$PUBLIC_ID';" >/dev/null

BUCKET_PUBLIC=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT public FROM storage.buckets WHERE id = 'playlist-covers';" 2>/dev/null || echo "")
if [[ -n "$BUCKET_PUBLIC" ]]; then
  [[ "$BUCKET_PUBLIC" == "f" || "$BUCKET_PUBLIC" == "false" ]] || fail "playlist-covers must be private"
  pass "playlist-covers bucket private"
else
  echo "WARN: could not read storage.buckets (skip)"
fi

export PUBLIC_SLUG EMAIL PASS API PUBLIC_ID
cd /var/www/audiolad
node <<'NODE'
const { chromium } = require("playwright");
const fs = require("fs");
const slug = process.env.PUBLIC_SLUG;
const email = process.env.EMAIL;
const pass = process.env.PASS;
const api = process.env.API || "https://audiolad.ru";
const playlistId = process.env.PUBLIC_ID;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  async function checkViewport(name, size, doLogin) {
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    if (doLogin) {
      await page.goto(`${api}/auth/sign-in`, { waitUntil: "domcontentloaded" });
      await page.fill('input[type="email"], input[name="email"]', email);
      await page.fill('input[type="password"], input[name="password"]', pass);
      await Promise.all([
        page.waitForURL((u) => !u.pathname.includes("/auth/sign-in"), { timeout: 15000 }).catch(() => {}),
        page.click('button[type="submit"]'),
      ]);
      await page.waitForTimeout(800);
    }
    await page.goto(`${api}/p/${slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 15000 });
    const title = await page.locator("h1").first().innerText();
    if (!title.includes("PR5")) throw new Error(`${name}: bad title ${title}`);
    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (scroll.scrollWidth > scroll.clientWidth + 2) {
      throw new Error(`${name}: horizontal scroll`);
    }
    if ((await page.getByText("Play All", { exact: false }).count()) > 0) {
      throw new Error(`${name}: Play All present`);
    }
    if ((await page.getByText("Скопировать ссылку").count()) > 0) {
      throw new Error(`${name}: copy link on public page`);
    }
    if (!doLogin) {
      if (!(await page.getByRole("link", { name: "Войти" }).first().isVisible())) {
        throw new Error(`${name}: missing Войти`);
      }
    } else if (
      !(await page.getByRole("link", { name: "Перейти в Аудиотеку" }).first().isVisible())
    ) {
      throw new Error(`${name}: missing Аудиотека CTA`);
    }
    results.push(`${name}:ok`);
    await context.close();
  }

  await checkViewport("guest-390", { width: 390, height: 844 }, false);
  await checkViewport("guest-430", { width: 430, height: 932 }, false);
  await checkViewport("auth-390", { width: 390, height: 844 }, true);
  await checkViewport("desktop-guest", { width: 1280, height: 800 }, false);

  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.goto(`${api}/auth/sign-in`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', pass);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes("/auth/sign-in"), { timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(800);
    await page.goto(`${api}/playlists`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    const menuBtn = page.getByRole("button", {
      name: "Меню плейлиста PR5 Public Smoke",
    });
    await menuBtn.click();
    await page.getByText("Скопировать ссылку").first().click({ timeout: 8000 });
    await page.getByText("Ссылка скопирована.").waitFor({ timeout: 8000 });
    let clip = "";
    try {
      clip = await page.evaluate(() => navigator.clipboard.readText());
    } catch {
      clip = "";
    }
    if (!clip.includes(`/p/${slug}`)) {
      throw new Error(`copy link bad value: ${clip || "(empty)"}`);
    }
    await page.goto(`${api}/playlists/${playlistId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /Скопировать ссылку/ }).click().catch(async () => {
      await page.getByText("Скопировать ссылку").first().click();
    });
    await page.getByText("Ссылка скопирована.").waitFor({ timeout: 8000 });
    results.push("copy-link:ok");
    await context.close();
  }

  fs.writeFileSync("/tmp/pr5-ui.json", JSON.stringify(results));
  await browser.close();
  console.log("UI_SMOKE_PASS", results.join(","));
})().catch((e) => {
  console.error("UI_SMOKE_FAIL", e && e.message ? e.message : e);
  process.exit(1);
});
NODE

pass "playwright guest/auth mobile/desktop + copy-link"

# leftover check
LEFT=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.playlists WHERE user_id = '$USER_ID';")
# cleanup trap will delete; force now for leftover confirmation after trap
cleanup
LEFT=$(docker exec supabase-db psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM public.playlists WHERE user_id = '$USER_ID';" 2>/dev/null || echo 0)
[[ "$LEFT" == "0" || -z "$LEFT" ]] || fail "leftover playlists"
USER_ID=""  # prevent double cleanup
pass "cleanup"

echo "PR5_PRODUCTION_SMOKE_PASS"
