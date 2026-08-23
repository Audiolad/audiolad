#!/usr/bin/env node
/**
 * Applies the three price-promotion migrations on an isolated local Postgres
 * (or Docker supabase-db if present). Verifies clean install, upgrade, bind
 * unique-conflict, one-shot start, and that existing prices/orders are not rewritten.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STUB = join(ROOT, "scripts/lib/price-promotions-sql-stub.sql");
const M180 = join(ROOT, "supabase/migrations/20260823180000_practice_price_promotions.sql");
const M181 = join(
  ROOT,
  "supabase/migrations/20260823181000_create_practice_order_price_promotions.sql",
);
const M183 = join(ROOT, "supabase/migrations/20260823183000_price_promotion_oneshot_bind.sql");

const CLEAN_DB = "audiolad_price_promo_clean";
const UPGRADE_DB = "audiolad_price_promo_upgrade";

const AUTHOR_ID = "a1111111-1111-4111-8111-111111111111";
const PRACTICE_ID = "c1111111-1111-4111-8111-111111111111";
const USER_ID = "d1111111-1111-4111-8111-111111111111";
const VISITOR = "11111111-1111-4111-8111-111111111111";
const VISITOR_B = "22222222-2222-4222-8222-222222222222";
const TOKEN = "0123456789abcdef0123456789abcdef";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function localPostgresAvailable() {
  try {
    execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-c", "SELECT 1"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function useDocker() {
  return dockerAvailable();
}

function psql(database, sql, { tuples = false } = {}) {
  if (useDocker()) {
    const args = [
      "exec",
      "-i",
      process.env.AUDIOLAD_SUPABASE_DB_CONTAINER || "supabase-db",
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ];
    if (tuples) args.push("-At");
    args.push("-c", sql);
    return execFileSync("docker", args, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  }

  const args = ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1"];
  if (tuples) args.push("-At");
  args.push("-c", sql);
  return execFileSync("sudo", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psqlFile(database, absolutePath) {
  const sql = readFileSync(absolutePath, "utf8");
  return psql(database, sql);
}

function dropCreateDb(name) {
  if (useDocker()) {
    psql("postgres", `DROP DATABASE IF EXISTS ${name} WITH (FORCE);`);
    psql("postgres", `CREATE DATABASE ${name};`);
    return;
  }

  execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${name} WITH (FORCE);`],
    { encoding: "utf8" },
  );
  execFileSync(
    "sudo",
    ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${name};`],
    { encoding: "utf8" },
  );
}

function scalar(database, sql) {
  return psql(database, sql, { tuples: true }).trim();
}

function lastTuple(database, sql) {
  const lines = psql(database, sql, { tuples: true })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

function applyPricingMigrations(database, { through } = {}) {
  psqlFile(database, STUB);
  psqlFile(database, M180);
  if (through === "180") return;
  psqlFile(database, M181);
  if (through === "181") return;
  psqlFile(database, M183);
}

function seedActorsAndProducts(database) {
  psql(
    database,
    `
INSERT INTO auth.users (id, email) VALUES
  ('${USER_ID}', 'buyer@example.com');
INSERT INTO public.authors (id, name, slug) VALUES
  ('${AUTHOR_ID}', 'Author', 'author');
INSERT INTO public.practices (id, author_id, title, slug, status, price, is_free)
VALUES
  ('${PRACTICE_ID}', '${AUTHOR_ID}', 'Paid', 'paid-practice', 'published', 4999, false),
  ('e1111111-1111-4111-8111-111111111111', '${AUTHOR_ID}', 'Legacy 990', 'legacy-990', 'published', 990, false),
  ('e2222222-2222-4222-8222-222222222222', '${AUTHOR_ID}', 'Legacy 1990', 'legacy-1990', 'published', 1990, false);
`,
  );
}

function seedHistoricalOrder(database) {
  psql(
    database,
    `
INSERT INTO public.orders (
  id, user_id, practice_id, status, amount_minor, currency,
  practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot
) VALUES (
  'f1111111-1111-4111-8111-111111111111',
  '${USER_ID}',
  'e1111111-1111-4111-8111-111111111111',
  'paid',
  99000,
  'RUB',
  'Legacy 990',
  'legacy-990',
  99000
);
`,
  );
}

function seedPersonalPromotion(database) {
  psql(
    database,
    `
INSERT INTO public.practice_price_promotions (
  id, practice_id, name, promotion_type, sale_price, duration_seconds, is_active, start_token
) VALUES (
  'b1111111-1111-4111-8111-111111111111',
  '${PRACTICE_ID}',
  'Funnel 499',
  'personal_countdown',
  499,
  1200,
  true,
  '${TOKEN}'
);
`,
  );
}

function assertLegacyPricesUntouched(database, label) {
  assertEqual(
    scalar(database, "SELECT price FROM public.practices WHERE slug = 'legacy-990'"),
    "990",
    `${label}: 990 untouched`,
  );
  assertEqual(
    scalar(database, "SELECT price FROM public.practices WHERE slug = 'legacy-1990'"),
    "1990",
    `${label}: 1990 untouched`,
  );
}

function testCleanInstallAndUpgrade() {
  dropCreateDb(CLEAN_DB);
  applyPricingMigrations(CLEAN_DB);
  assertEqual(
    scalar(CLEAN_DB, "SELECT count(*) FROM public.practice_price_promotions"),
    "0",
    "clean install empty promotions",
  );
  assertEqual(
    scalar(
      CLEAN_DB,
      "SELECT count(*) FROM pg_proc WHERE proname = 'bind_practice_price_promotion_starts'",
    ),
    "1",
    "bind function installed",
  );

  dropCreateDb(UPGRADE_DB);
  psqlFile(UPGRADE_DB, STUB);
  seedActorsAndProducts(UPGRADE_DB);
  seedHistoricalOrder(UPGRADE_DB);
  psqlFile(UPGRADE_DB, M180);
  assertLegacyPricesUntouched(UPGRADE_DB, "after 180");
  assertEqual(
    scalar(
      UPGRADE_DB,
      "SELECT price_minor_snapshot FROM public.orders WHERE id = 'f1111111-1111-4111-8111-111111111111'",
    ),
    "99000",
    "historical order snapshot kept",
  );
  assertEqual(
    scalar(
      UPGRADE_DB,
      "SELECT base_price_minor_snapshot FROM public.orders WHERE id = 'f1111111-1111-4111-8111-111111111111'",
    ),
    "99000",
    "order backfill from existing snapshot only",
  );
  psqlFile(UPGRADE_DB, M181);
  seedPersonalPromotion(UPGRADE_DB);
  psql(
    UPGRADE_DB,
    `
INSERT INTO public.practice_price_promotion_starts (
  id, promotion_id, visitor_id, user_id, started_at, expires_at
) VALUES
  (
    '11111111-aaaa-4aaa-8aaa-111111111111',
    'b1111111-1111-4111-8111-111111111111',
    '${VISITOR}',
    '${USER_ID}',
    '2026-08-23T10:00:00Z',
    '2026-08-23T10:20:00Z'
  ),
  (
    '22222222-aaaa-4aaa-8aaa-222222222222',
    'b1111111-1111-4111-8111-111111111111',
    '${VISITOR_B}',
    '${USER_ID}',
    '2026-08-23T10:21:00Z',
    '2026-08-23T10:41:00Z'
  );
`,
  );
  psqlFile(UPGRADE_DB, M183);
  assertEqual(
    scalar(
      UPGRADE_DB,
      `SELECT count(*) FROM public.practice_price_promotion_starts
       WHERE promotion_id = 'b1111111-1111-4111-8111-111111111111'
         AND user_id = '${USER_ID}'`,
    ),
    "1",
    "upgrade dedupes duplicate user starts",
  );
  assertLegacyPricesUntouched(UPGRADE_DB, "after 183");
  assertEqual(
    scalar(
      UPGRADE_DB,
      "SELECT promotion_id IS NULL AND promotion_type IS NULL AND promotion_price_minor_snapshot IS NULL FROM public.orders WHERE id = 'f1111111-1111-4111-8111-111111111111'",
    ),
    "t",
    "existing order not rewritten with a promotion",
  );
}

function testBindTwoRowConflict() {
  dropCreateDb(CLEAN_DB);
  applyPricingMigrations(CLEAN_DB);
  seedActorsAndProducts(CLEAN_DB);
  seedPersonalPromotion(CLEAN_DB);
  psql(
    CLEAN_DB,
    `
INSERT INTO public.practice_price_promotion_starts (
  id, promotion_id, visitor_id, user_id, started_at, expires_at
) VALUES
  (
    '11111111-bbbb-4bbb-8bbb-111111111111',
    'b1111111-1111-4111-8111-111111111111',
    '${VISITOR}',
    NULL,
    '2026-08-23T10:00:00Z',
    '2026-08-23T10:20:00Z'
  ),
  (
    '22222222-bbbb-4bbb-8bbb-222222222222',
    'b1111111-1111-4111-8111-111111111111',
    '${VISITOR_B}',
    '${USER_ID}',
    '2026-08-23T10:05:00Z',
    '2026-08-23T10:25:00Z'
  );

SELECT public.bind_practice_price_promotion_starts('${VISITOR}', '${USER_ID}');
`,
  );

  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT count(*) FROM public.practice_price_promotion_starts
       WHERE promotion_id = 'b1111111-1111-4111-8111-111111111111'`,
    ),
    "2",
    "bind does not insert a third row",
  );
  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT count(*) FROM public.practice_price_promotion_starts
       WHERE promotion_id = 'b1111111-1111-4111-8111-111111111111'
         AND user_id = '${USER_ID}'`,
    ),
    "1",
    "exactly one user-bound start",
  );
  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT id::text FROM public.practice_price_promotion_starts
       WHERE promotion_id = 'b1111111-1111-4111-8111-111111111111'
         AND user_id = '${USER_ID}'`,
    ),
    "11111111-bbbb-4bbb-8bbb-111111111111",
    "earliest window keeps user_id",
  );
  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT started_at = timestamptz '2026-08-23T10:00:00Z'
          AND expires_at = timestamptz '2026-08-23T10:20:00Z'
       FROM public.practice_price_promotion_starts
       WHERE id = '11111111-bbbb-4bbb-8bbb-111111111111'`,
    ),
    "t",
    "canonical times not reset",
  );
}

function testResolveAndStartBehavior() {
  const during = scalar(
    CLEAN_DB,
    `SELECT final_price::text FROM public.resolve_practice_effective_price(
      '${PRACTICE_ID}'::uuid,
      'product',
      '${VISITOR}',
      '${USER_ID}',
      timestamptz '2026-08-23T10:10:00Z'
    )`,
  );
  assertEqual(during, "499", "bound guest+user sees sale during window");

  const after = scalar(
    CLEAN_DB,
    `SELECT final_price::text FROM public.resolve_practice_effective_price(
      '${PRACTICE_ID}'::uuid,
      'checkout',
      '${VISITOR}',
      '${USER_ID}',
      timestamptz '2026-08-23T10:30:00Z'
    )`,
  );
  assertEqual(after, "4999", "expired original window is base");

  const catalog = scalar(
    CLEAN_DB,
    `SELECT final_price::text FROM public.resolve_practice_effective_price(
      '${PRACTICE_ID}'::uuid,
      'catalog',
      '${VISITOR}',
      NULL,
      timestamptz '2026-08-23T10:10:00Z'
    )`,
  );
  assertEqual(catalog, "4999", "catalog ignores personal");

  psql(
    CLEAN_DB,
    `
INSERT INTO public.practice_price_promotions (
  id, practice_id, name, promotion_type, sale_price, starts_at, ends_at, is_active, start_token
) VALUES (
  'b2222222-2222-4222-8222-222222222222',
  '${PRACTICE_ID}',
  'Weekend',
  'calendar',
  888,
  '2026-08-23T09:00:00Z',
  '2026-08-23T18:00:00Z',
  true,
  'fedcba9876543210fedcba9876543210'
);
`,
  );
  const calendar = scalar(
    CLEAN_DB,
    `SELECT final_price::text FROM public.resolve_practice_effective_price(
      '${PRACTICE_ID}'::uuid,
      'catalog',
      NULL,
      NULL,
      timestamptz '2026-08-23T12:00:00Z'
    )`,
  );
  assertEqual(calendar, "888", "calendar applies in window");

  const noPromo = scalar(
    CLEAN_DB,
    `SELECT final_price::text FROM public.resolve_practice_effective_price(
      'e1111111-1111-4111-8111-111111111111'::uuid,
      'product',
      NULL,
      NULL,
      timestamptz '2026-08-23T12:00:00Z'
    )`,
  );
  assertEqual(noPromo, "990", "product with no promo uses base price");

  const refresh = scalar(
    CLEAN_DB,
    `SELECT CASE
       WHEN started_at = timestamptz '2026-08-23T10:00:00Z'
        AND expires_at = timestamptz '2026-08-23T10:20:00Z'
        AND reused THEN 't'
       ELSE 'f'
     END
     FROM public.start_practice_price_promotion(
      '${TOKEN}',
      '${VISITOR}',
      '${USER_ID}'
    )`,
  );
  assertEqual(refresh, "t", "refresh before expiry keeps original window");

  const reused = scalar(
    CLEAN_DB,
    `SELECT CASE WHEN reused THEN 't' ELSE 'f' END
     FROM public.start_practice_price_promotion(
      '${TOKEN}',
      '${VISITOR}',
      '${USER_ID}'
    )`,
  );
  assertEqual(reused, "t", "start after expiry reuses original row");
  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT count(*) FROM public.practice_price_promotion_starts
       WHERE promotion_id = 'b1111111-1111-4111-8111-111111111111'
         AND visitor_id = '${VISITOR}'`,
    ),
    "1",
    "token after expiry does not insert",
  );
}

function testCreateOrderPriceChanged() {
  const during = lastTuple(
    CLEAN_DB,
    `
SELECT set_config('request.jwt.claim.sub', '${USER_ID}', false);
UPDATE public.practice_price_promotion_starts
SET
  started_at = now() - interval '2 minutes',
  expires_at = now() + interval '10 minutes'
WHERE id = '11111111-bbbb-4bbb-8bbb-111111111111';
SELECT amount_minor::text
FROM public.create_practice_order(
  'paid-practice',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  NULL, NULL, NULL, NULL,
  49900,
  '${VISITOR}'
);
`,
  );
  assertEqual(during, "49900", "guest→login checkout uses original sale window");

  let failed = false;
  try {
    psql(
      CLEAN_DB,
      `
SELECT set_config('request.jwt.claim.sub', '${USER_ID}', false);
UPDATE public.practice_price_promotion_starts
SET expires_at = now() - interval '1 second'
WHERE id = '11111111-bbbb-4bbb-8bbb-111111111111';
SELECT * FROM public.create_practice_order(
  'paid-practice',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  NULL, NULL, NULL, NULL,
  49900,
  '${VISITOR}'
);
`,
    );
  } catch (error) {
    const blob = [error.stdout, error.stderr, error.message, error]
      .filter(Boolean)
      .join("\n");
    failed = blob.includes("price_changed");
  }

  assert(failed, "expiry immediately before checkout raises price_changed");
}

function testMigrationContract() {
  const oneshot = readFileSync(M183, "utf8");
  assert(oneshot.includes("ON CONFLICT (promotion_id, visitor_id) DO NOTHING"), "conflict");
  assert(!oneshot.includes("started_at = v_now"), "no restart");
  assert(oneshot.includes("bind_practice_price_promotion_starts"), "bind");
  assert(oneshot.includes("WHEN unique_violation THEN"), "bind catches unique conflict");
  assert(oneshot.includes("row_number() OVER"), "upgrade dedupe");
  assert(existsSync(M180) && existsSync(M181) && existsSync(M183), "three migrations present");
}

function main() {
  testMigrationContract();

  if (!dockerAvailable() && !localPostgresAvailable()) {
    console.log("price-promotions-sql-unit: skipped (no Docker and no local Postgres)");
    return;
  }

  const backend = dockerAvailable() ? "docker" : "local-postgres";
  testCleanInstallAndUpgrade();
  testBindTwoRowConflict();
  testResolveAndStartBehavior();
  testCreateOrderPriceChanged();
  console.log(`price-promotions-sql-unit: ok (${backend})`);
}

main();
