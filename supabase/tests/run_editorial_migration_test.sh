#!/usr/bin/env bash
# Apply editorial migration on an isolated PostgreSQL database twice.
# Requires: psql, docker access to supabase-db (or TEST_DATABASE_URL admin URL).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MIGRATION="$REPO_ROOT/supabase/migrations/20260716160000_editorial_playlists.sql"
PLAYLISTS_MIGRATION="$REPO_ROOT/supabase/migrations/20260715270000_create_playlists.sql"

DB_NAME="${EDITORIAL_MIGRATION_TEST_DB:-audiolad_editorial_mig_test}"
DOCKER_CONTAINER="${EDITORIAL_MIGRATION_TEST_CONTAINER:-supabase-db}"

apply_sql_file() {
  local file="$1"
  if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
    psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
  else
    docker exec -i "$DOCKER_CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 <"$file"
  fi
}

psql_cmd() {
  if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
    psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -i "$DOCKER_CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
  fi
}

admin_psql_cmd() {
  if [[ -n "${TEST_DATABASE_ADMIN_URL:-}" ]]; then
    psql "$TEST_DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -i "$DOCKER_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
  fi
}

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

pass() {
  echo "PASS: $1"
}

if [[ ! -f "$MIGRATION" ]]; then
  fail "missing migration: $MIGRATION"
fi

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  admin_psql_cmd -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null
  admin_psql_cmd -c "CREATE DATABASE ${DB_NAME};" >/dev/null
fi

# Minimal prerequisites: profiles + playlists schema (matches production major version).
psql_cmd <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$ SELECT 'service_role'::text $$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text NOT NULL DEFAULT 'listener',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES public.authors(id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text DEFAULT 'published',
  is_catalog_listed boolean DEFAULT true,
  price integer DEFAULT 0
);
SQL

apply_sql_file "$PLAYLISTS_MIGRATION"

# Seed owner account for role assignment block (no UUID output).
psql_cmd <<'SQL'
INSERT INTO auth.users (id, email)
VALUES ('11111111-1111-1111-1111-111111111111', '1@audiolad.ru')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, role)
VALUES ('11111111-1111-1111-1111-111111111111', '1@audiolad.ru', 'listener')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.playlists (user_id, title, visibility)
VALUES ('11111111-1111-1111-1111-111111111111', 'Migration test playlist', 'private');
SQL

counts_before="$(psql_cmd -At -c "SELECT count(*)::text || ',' || (SELECT count(*) FROM public.playlist_items)::text FROM public.playlists;")"
playlists_before="${counts_before%%,*}"
items_before="${counts_before##*,}"

echo "Applying editorial migration (first run)..."
apply_sql_file "$MIGRATION"

role_after_first="$(psql_cmd -At -c "SELECT role FROM public.profiles WHERE email = '1@audiolad.ru' LIMIT 1;")"
[[ "$role_after_first" == "platform_admin" ]] || fail "owner role not assigned on first run"

echo "Applying editorial migration (second run)..."
apply_sql_file "$MIGRATION"

counts_after="$(psql_cmd -At -c "SELECT count(*)::text || ',' || (SELECT count(*) FROM public.playlist_items)::text FROM public.playlists;")"
playlists_after="${counts_after%%,*}"
items_after="${counts_after##*,}"

[[ "$playlists_before" == "$playlists_after" ]] || fail "playlist count changed on re-run ($playlists_before -> $playlists_after)"
[[ "$items_before" == "$items_after" ]] || fail "playlist_items count changed on re-run"

trigger_count="$(psql_cmd -At -c "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='profiles' AND NOT t.tgisinternal AND t.tgname LIKE 'profiles_protect%';")"
[[ "$trigger_count" == "2" ]] || fail "expected 2 profile protect triggers, got $trigger_count"

role_after_second="$(psql_cmd -At -c "SELECT role FROM public.profiles WHERE email = '1@audiolad.ru' LIMIT 1;")"
[[ "$role_after_second" == "platform_admin" ]] || fail "owner role changed on second run"

psql_cmd -At -c "SELECT has_function_privilege('authenticated','public.add_editorial_playlist_practices(uuid,uuid[])','EXECUTE');" | grep -q '^t$' || fail "authenticated EXECUTE missing after second run"
psql_cmd -At -c "SELECT has_function_privilege('anon','public.add_editorial_playlist_practices(uuid,uuid[])','EXECUTE');" | grep -q '^f$' || fail "anon EXECUTE should remain denied"

pass "editorial migration first run"
pass "editorial migration second run (idempotent)"
pass "playlist counts unchanged"
pass "grants and triggers stable"

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  admin_psql_cmd -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null
fi
