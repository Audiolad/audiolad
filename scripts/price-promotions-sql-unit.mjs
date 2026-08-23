#!/usr/bin/env node
/**
 * Applies the price-promotion migrations on an isolated local Postgres
 * (or Docker supabase-db if present). Verifies clean install, upgrade, bind
 * unique-conflict, one-shot start RPC (including the OUT-column clash),
 * and that existing prices/orders are not rewritten.
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
const M190 = join(
  ROOT,
  "supabase/migrations/20260823190000_start_practice_price_promotion_qualify_identifiers.sql",
);
const M191 = join(ROOT, "supabase/migrations/20260823191000_quick_offers.sql");
const M140_GONE = join(ROOT, "supabase/migrations/20260823140000_quick_offers.sql");

const CLEAN_DB = "audiolad_price_promo_clean";
const UPGRADE_DB = "audiolad_price_promo_upgrade";

const AUTHOR_ID = "a1111111-1111-4111-8111-111111111111";
const PRACTICE_ID = "c1111111-1111-4111-8111-111111111111";
const USER_ID = "d1111111-1111-4111-8111-111111111111";
const USER_LOGIN = "d2222222-2222-4222-8222-222222222222";
const USER_CONFLICT = "d3333333-3333-4333-8333-333333333333";
const VISITOR = "11111111-1111-4111-8111-111111111111";
const VISITOR_B = "22222222-2222-4222-8222-222222222222";
const VISITOR_C = "33333333-3333-4333-8333-333333333333";
const VISITOR_D = "44444444-4444-4444-8444-444444444444";
const VISITOR_E = "55555555-5555-4555-8555-555555555555";
const VISITOR_P = "66666666-6666-4666-8666-666666666666";
const TOKEN = "0123456789abcdef0123456789abcdef";
const PROMO_ID = "b1111111-1111-4111-8111-111111111111";
const CALENDAR_ID = "b2222222-2222-4222-8222-222222222222";

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

function dockerBackend() {
  return dockerAvailable();
}

function psql(database, sql, { tuples = false } = {}) {
  if (dockerBackend()) {
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
  if (dockerBackend()) {
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
  if (through === "183") return;
  psqlFile(database, M190);
  if (through === "190") return;
  psqlFile(database, M191);
}

function seedActorsAndProducts(database) {
  psql(
    database,
    `
INSERT INTO auth.users (id, email) VALUES
  ('${USER_ID}', 'buyer@example.com'),
  ('${USER_LOGIN}', 'login@example.com'),
  ('${USER_CONFLICT}', 'conflict@example.com');
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
  psqlFile(UPGRADE_DB, M190);
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

  const upgradeFirst = startRow(UPGRADE_DB, VISITOR_P, null);
  assertEqual(upgradeFirst.reused, "f", "upgrade path first start RPC inserts");
  assertEqual(upgradeFirst.promotionId, PROMO_ID, "upgrade path first start promotion_id");
  assertEqual(countStarts(UPGRADE_DB, VISITOR_P), "1", "upgrade path first start one row");

  psqlFile(UPGRADE_DB, M191);
  assertQuickOffersInstalled(UPGRADE_DB, "upgrade after 191");
  assertLegacyPricesUntouched(UPGRADE_DB, "after 191");
  testQuickOffersRpcs(UPGRADE_DB, "upgrade");
  const afterOffers = startRow(UPGRADE_DB, VISITOR_E, null);
  assertEqual(afterOffers.reused, "f", "personal start still inserts after Quick Offers");
  assertEqual(afterOffers.promotionId, PROMO_ID, "personal start promotion_id after Quick Offers");
  assertEqual(
    scalar(
      UPGRADE_DB,
      `SELECT final_price::text FROM public.resolve_practice_effective_price(
        'e1111111-1111-4111-8111-111111111111'::uuid,
        'product',
        NULL,
        NULL,
        timestamptz '2026-08-23T12:00:00Z'
      )`,
    ),
    "990",
    "upgrade base price unchanged after Quick Offers",
  );

  seedActorsAndProducts(CLEAN_DB);
  assertQuickOffersInstalled(CLEAN_DB, "clean install after 191");
  testQuickOffersRpcs(CLEAN_DB, "clean");
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

function sqlUuidOrNull(value) {
  return value == null ? "NULL::uuid" : `'${value}'::uuid`;
}

function startRow(database, visitor, userId = null) {
  const line = lastTuple(
    database,
    `SELECT format(
       '%s|%s|%s|%s|%s',
       promotion_id::text,
       to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       sale_price::text,
       CASE WHEN reused THEN 't' ELSE 'f' END
     )
     FROM public.start_practice_price_promotion(
       '${TOKEN}',
       '${visitor}',
       ${sqlUuidOrNull(userId)}
     )`,
  );
  const [promotionId, startedAt, expiresAt, salePrice, reused] = line.split("|");
  return { promotionId, startedAt, expiresAt, salePrice, reused };
}

function countStarts(database, visitor = null) {
  const visitorClause = visitor
    ? ` AND visitor_id = '${visitor}'`
    : "";
  return scalar(
    database,
    `SELECT count(*)::text
     FROM public.practice_price_promotion_starts
     WHERE promotion_id = '${PROMO_ID}'${visitorClause}`,
  );
}

function startErrorBlob(error) {
  return [error.stdout, error.stderr, error.message, error]
    .filter(Boolean)
    .join("\n");
}

function psqlArgv(database, sql, { tuples = false } = {}) {
  if (dockerBackend()) {
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
    return { command: "docker", args };
  }

  const args = ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1"];
  if (tuples) args.push("-At");
  args.push("-c", sql);
  return { command: "sudo", args };
}

function quoteShell(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parallelStart(database, visitor) {
  const sql = `SELECT format(
      '%s|%s|%s',
      promotion_id::text,
      to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
    FROM public.start_practice_price_promotion(
      '${TOKEN}',
      '${visitor}',
      NULL::uuid
    )`;
  const { command, args } = psqlArgv(database, sql, { tuples: true });
  const rendered = [command, ...args.map(quoteShell)].join(" ");
  execFileSync(
    "bash",
    [
      "-lc",
      `set -euo pipefail
      ${rendered} > /tmp/audiolad_promo_p1.out 2> /tmp/audiolad_promo_p1.err &
      p1=$!
      ${rendered} > /tmp/audiolad_promo_p2.out 2> /tmp/audiolad_promo_p2.err &
      p2=$!
      wait $p1
      wait $p2
      `,
    ],
    { encoding: "utf8" },
  );
  const one = readFileSync("/tmp/audiolad_promo_p1.out", "utf8").trim().split(/\r?\n/).filter(Boolean).pop();
  const two = readFileSync("/tmp/audiolad_promo_p2.out", "utf8").trim().split(/\r?\n/).filter(Boolean).pop();
  return [one, two];
}

function prepareStartDb(database) {
  dropCreateDb(database);
  applyPricingMigrations(database);
  seedActorsAndProducts(database);
  seedPersonalPromotion(database);
}

function testOneshotAmbiguousThenQualifyHotfix() {
  dropCreateDb(CLEAN_DB);
  applyPricingMigrations(CLEAN_DB, { through: "183" });
  seedActorsAndProducts(CLEAN_DB);
  seedPersonalPromotion(CLEAN_DB);

  let oneshotError = "";
  try {
    psql(
      CLEAN_DB,
      `SELECT * FROM public.start_practice_price_promotion(
        '${TOKEN}',
        '${VISITOR}',
        NULL::uuid
      )`,
    );
  } catch (error) {
    oneshotError = startErrorBlob(error);
  }

  assert(
    /ambiguous/i.test(oneshotError) && /promotion_id/i.test(oneshotError),
    `183 first start must fail with ambiguous promotion_id, got: ${oneshotError || "success"}`,
  );

  psqlFile(CLEAN_DB, M190);

  const first = startRow(CLEAN_DB, VISITOR, null);
  assertEqual(first.reused, "f", "hotfix first start inserts a window");
  assertEqual(first.promotionId, PROMO_ID, "hotfix first start returns promotion_id");
  assertEqual(first.salePrice, "499", "hotfix first start sale_price");
  assertEqual(countStarts(CLEAN_DB, VISITOR), "1", "hotfix first start writes one row");
}

function testStartRpcSemantics() {
  prepareStartDb(CLEAN_DB);

  const first = startRow(CLEAN_DB, VISITOR, null);
  assertEqual(first.reused, "f", "first start RPC creates a window");
  assertEqual(first.promotionId, PROMO_ID, "first start RPC promotion_id");
  assertEqual(first.salePrice, "499", "first start RPC sale_price");
  assertEqual(countStarts(CLEAN_DB, VISITOR), "1", "first start writes one visitor row");
  assert(Boolean(first.startedAt) && Boolean(first.expiresAt), "first start returns a window");

  const repeat = startRow(CLEAN_DB, VISITOR, null);
  assertEqual(repeat.reused, "t", "repeat before expiry reuses");
  assertEqual(repeat.startedAt, first.startedAt, "repeat keeps started_at");
  assertEqual(repeat.expiresAt, first.expiresAt, "repeat keeps expires_at");
  assertEqual(countStarts(CLEAN_DB, VISITOR), "1", "repeat before expiry does not insert");

  psql(
    CLEAN_DB,
    `UPDATE public.practice_price_promotion_starts AS starts
     SET
       started_at = timestamptz '2026-08-23T10:00:00Z',
       expires_at = timestamptz '2026-08-23T10:20:00Z'
     WHERE starts.promotion_id = '${PROMO_ID}'
       AND starts.visitor_id = '${VISITOR}'`,
  );

  const afterExpiry = startRow(CLEAN_DB, VISITOR, null);
  assertEqual(afterExpiry.reused, "t", "repeat after expiry reuses original row");
  assertEqual(afterExpiry.startedAt, "2026-08-23T10:00:00Z", "after expiry keeps original started_at");
  assertEqual(afterExpiry.expiresAt, "2026-08-23T10:20:00Z", "after expiry keeps original expires_at");
  assertEqual(countStarts(CLEAN_DB, VISITOR), "1", "after expiry does not insert");

  const other = startRow(CLEAN_DB, VISITOR_B, null);
  assertEqual(other.reused, "f", "other visitor gets own window");
  assertEqual(countStarts(CLEAN_DB, VISITOR_B), "1", "other visitor row");
  assertEqual(countStarts(CLEAN_DB), "2", "shared token starts two visitors");
  assert(
    other.startedAt !== "2026-08-23T10:00:00Z" || other.expiresAt !== "2026-08-23T10:20:00Z",
    "other visitor is not the first visitor stored window",
  );

  const [parallelA, parallelB] = parallelStart(CLEAN_DB, VISITOR_P);
  assert(Boolean(parallelA) && Boolean(parallelB), "parallel start both returned a row");
  assertEqual(parallelA, parallelB, "parallel start shares one window");
  assertEqual(countStarts(CLEAN_DB, VISITOR_P), "1", "parallel start does not create a second window");

  const guest = startRow(CLEAN_DB, VISITOR_C, null);
  assertEqual(guest.reused, "f", "guest start creates a window");
  const afterLogin = startRow(CLEAN_DB, VISITOR_C, USER_LOGIN);
  assertEqual(afterLogin.reused, "t", "guest→login reuses");
  assertEqual(afterLogin.startedAt, guest.startedAt, "guest→login keeps started_at");
  assertEqual(afterLogin.expiresAt, guest.expiresAt, "guest→login keeps expires_at");
  assertEqual(countStarts(CLEAN_DB, VISITOR_C), "1", "guest→login does not add a row");
  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT user_id::text
       FROM public.practice_price_promotion_starts
       WHERE promotion_id = '${PROMO_ID}'
         AND visitor_id = '${VISITOR_C}'`,
    ),
    USER_LOGIN,
    "guest→login binds user_id onto the original row",
  );

  psql(
    CLEAN_DB,
    `
INSERT INTO public.practice_price_promotion_starts (
  id, promotion_id, visitor_id, user_id, started_at, expires_at
) VALUES
  (
    '11111111-cccc-4ccc-8ccc-111111111111',
    '${PROMO_ID}',
    '${VISITOR_D}',
    NULL,
    '2026-08-23T11:00:00Z',
    '2026-08-23T11:20:00Z'
  ),
  (
    '22222222-cccc-4ccc-8ccc-222222222222',
    '${PROMO_ID}',
    '${VISITOR_E}',
    '${USER_CONFLICT}',
    '2026-08-23T11:05:00Z',
    '2026-08-23T11:25:00Z'
  );
`,
  );
  const collapsed = startRow(CLEAN_DB, VISITOR_D, USER_CONFLICT);
  assertEqual(collapsed.reused, "t", "visitor-row + user-row start reuses");
  assertEqual(collapsed.startedAt, "2026-08-23T11:00:00Z", "conflict keeps earlier started_at");
  assertEqual(collapsed.expiresAt, "2026-08-23T11:20:00Z", "conflict keeps earlier expires_at");
  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT count(*)::text
       FROM public.practice_price_promotion_starts
       WHERE promotion_id = '${PROMO_ID}'
         AND visitor_id IN ('${VISITOR_D}', '${VISITOR_E}')`,
    ),
    "2",
    "conflict does not insert a third start",
  );
  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT id::text
       FROM public.practice_price_promotion_starts
       WHERE promotion_id = '${PROMO_ID}'
         AND user_id = '${USER_CONFLICT}'`,
    ),
    "11111111-cccc-4ccc-8ccc-111111111111",
    "earliest window keeps user_id after start bind",
  );

  const expiredGuest = startRow(CLEAN_DB, "77777777-7777-4777-8777-777777777777", null);
  assertEqual(expiredGuest.reused, "f", "expiry-login guest start creates a window");
  psql(
    CLEAN_DB,
    `UPDATE public.practice_price_promotion_starts AS starts
     SET
       started_at = timestamptz '2026-08-23T09:00:00Z',
       expires_at = timestamptz '2026-08-23T09:20:00Z'
     WHERE starts.promotion_id = '${PROMO_ID}'
       AND starts.visitor_id = '77777777-7777-4777-8777-777777777777'`,
  );
  const expiredLogin = startRow(CLEAN_DB, "77777777-7777-4777-8777-777777777777", USER_ID);
  assertEqual(expiredLogin.reused, "t", "guest expiry → login does not create a new window");
  assertEqual(expiredLogin.startedAt, "2026-08-23T09:00:00Z", "expired guest started_at kept after login");
  assertEqual(expiredLogin.expiresAt, "2026-08-23T09:20:00Z", "expired guest expires_at kept after login");
  assertEqual(
    countStarts(CLEAN_DB, "77777777-7777-4777-8777-777777777777"),
    "1",
    "guest expiry → login does not insert",
  );
  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT final_price::text FROM public.resolve_practice_effective_price(
        '${PRACTICE_ID}'::uuid,
        'checkout',
        '77777777-7777-4777-8777-777777777777',
        '${USER_ID}',
        timestamptz '2026-08-23T10:00:00Z'
      )`,
    ),
    "4999",
    "expired guest offer does not revive after login",
  );

  psql(
    CLEAN_DB,
    `
INSERT INTO public.practice_price_promotions (
  id, practice_id, name, promotion_type, sale_price, starts_at, ends_at, is_active, start_token
) VALUES (
  '${CALENDAR_ID}',
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
  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT final_price::text FROM public.resolve_practice_effective_price(
        '${PRACTICE_ID}'::uuid,
        'catalog',
        NULL,
        NULL,
        timestamptz '2026-08-23T12:00:00Z'
      )`,
    ),
    "888",
    "existing calendar promotion still applies",
  );
  assertEqual(
    scalar(
      CLEAN_DB,
      `SELECT final_price::text FROM public.resolve_practice_effective_price(
        '${PRACTICE_ID}'::uuid,
        'product',
        '77777777-7777-4777-8777-777777777777',
        '${USER_ID}',
        timestamptz '2026-08-23T12:00:00Z'
      )`,
    ),
    "888",
    "calendar still wins when personal window is expired",
  );
}

const OFFER_ID = "e3333333-3333-4333-8333-333333333333";
const MATERIAL_ID = "e4444444-4444-4444-8444-444444444444";
const OFFER_ORDER_ID = "f2222222-2222-4222-8222-222222222222";

function assertQuickOffersInstalled(database, label) {
  assertEqual(
    scalar(database, "SELECT to_regclass('public.quick_offers') IS NOT NULL"),
    "t",
    `${label}: quick_offers exists`,
  );
  assertEqual(
    scalar(database, "SELECT to_regclass('public.quick_offer_materials') IS NOT NULL"),
    "t",
    `${label}: quick_offer_materials exists`,
  );
  assertEqual(
    scalar(
      database,
      `SELECT count(*)::text FROM pg_proc
       WHERE proname IN (
         'publish_quick_offer',
         'unpublish_quick_offer',
         'get_public_quick_offer',
         'apply_quick_offer_amount',
         'resolve_quick_offer_charge_rubles'
       )`,
    ),
    "5",
    `${label}: Quick Offers RPCs`,
  );
  assertEqual(
    scalar(
      database,
      `SELECT count(*)::text FROM pg_trigger
       WHERE tgrelid = 'public.quick_offers'::regclass
         AND NOT tgisinternal
         AND tgname IN (
           'quick_offers_set_updated_at',
           'quick_offers_product_owner',
           'quick_offers_status_change_guard'
         )`,
    ),
    "3",
    `${label}: Quick Offers triggers`,
  );
  assertEqual(
    scalar(
      database,
      `SELECT count(*)::text FROM pg_policy
       WHERE polrelid = 'public.quick_offers'::regclass`,
    ),
    "4",
    `${label}: Quick Offers policies`,
  );
  assertEqual(
    scalar(
      database,
      `SELECT count(*)::text FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'orders'
         AND column_name = 'quick_offer_id'`,
    ),
    "1",
    `${label}: orders.quick_offer_id`,
  );
}

function testQuickOffersRpcs(database, label) {
  psql(
    database,
    `
INSERT INTO public.author_members (author_id, user_id, role)
VALUES ('${AUTHOR_ID}', '${USER_ID}', 'owner')
ON CONFLICT DO NOTHING;
INSERT INTO public.quick_offers (
  id, author_id, practice_id, title, slug, hero_image_path, short_description,
  promo_price, cta_text, timer_duration_seconds, status, created_by
) VALUES (
  '${OFFER_ID}',
  '${AUTHOR_ID}',
  '${PRACTICE_ID}',
  'Quick Offer',
  'quick-offer-${label}',
  'offers/hero.jpg',
  'Short pitch',
  777,
  'Buy now',
  1200,
  'draft',
  '${USER_ID}'
);
INSERT INTO public.quick_offer_materials (
  id, offer_id, image_path, format_label, sort_order
) VALUES (
  '${MATERIAL_ID}',
  '${OFFER_ID}',
  'offers/card.jpg',
  'MP3',
  1
);
`,
  );

  let statusGuard = "";
  try {
    psql(database, `UPDATE public.quick_offers SET status = 'published' WHERE id = '${OFFER_ID}';`);
  } catch (error) {
    statusGuard = String(error.stdout || "") + String(error.stderr || "") + String(error.message || "");
  }
  assert(
    /quick_offer_status_change_requires_rpc/.test(statusGuard),
    `${label}: status change requires RPC, got: ${statusGuard || "success"}`,
  );

  psql(
    database,
    `
SELECT set_config('request.jwt.claim.sub', '${USER_ID}', false);
SELECT public.publish_quick_offer('${OFFER_ID}');
`,
  );
  assertEqual(
    scalar(database, `SELECT status FROM public.quick_offers WHERE id = '${OFFER_ID}'`),
    "published",
    `${label}: publish RPC`,
  );
  assertEqual(
    scalar(
      database,
      `SELECT (public.get_public_quick_offer('quick-offer-${label}') ->> 'slug')`,
    ),
    `quick-offer-${label}`,
    `${label}: public RPC`,
  );

  psql(
    database,
    `
INSERT INTO public.orders (
  id, user_id, practice_id, status, amount_minor, currency,
  practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot
) VALUES (
  '${OFFER_ORDER_ID}',
  '${USER_ID}',
  '${PRACTICE_ID}',
  'pending',
  499900,
  'RUB',
  'Paid',
  'paid-practice',
  499900
);
SELECT set_config('request.jwt.claim.sub', '${USER_ID}', false);
SELECT public.apply_quick_offer_amount(
  '${OFFER_ORDER_ID}',
  '${OFFER_ID}',
  timestamptz '2099-01-01T00:00:00Z'
);
`,
  );
  assertEqual(
    scalar(database, `SELECT amount_minor::text FROM public.orders WHERE id = '${OFFER_ORDER_ID}'`),
    "77700",
    `${label}: apply promo amount`,
  );

  psql(
    database,
    `
SELECT set_config('request.jwt.claim.sub', '${USER_ID}', false);
SELECT public.apply_quick_offer_amount(
  '${OFFER_ORDER_ID}',
  '${OFFER_ID}',
  NULL::timestamptz
);
`,
  );
  assertEqual(
    scalar(database, `SELECT amount_minor::text FROM public.orders WHERE id = '${OFFER_ORDER_ID}'`),
    "499900",
    `${label}: missing window is regular price`,
  );
}

function testMigrationContract() {
  const oneshot = readFileSync(M183, "utf8");
  assert(oneshot.includes("ON CONFLICT (promotion_id, visitor_id) DO NOTHING"), "conflict");
  assert(!oneshot.includes("started_at = v_now"), "no restart");
  assert(oneshot.includes("bind_practice_price_promotion_starts"), "bind");
  assert(oneshot.includes("WHEN unique_violation THEN"), "bind catches unique conflict");
  assert(oneshot.includes("row_number() OVER"), "upgrade dedupe");
  assert(existsSync(M180) && existsSync(M181) && existsSync(M183) && existsSync(M190) && existsSync(M191), "five migrations present");
  assert(!existsSync(M140_GONE), "140000 must not remain in active migrations");

  const qualify = readFileSync(M190, "utf8");
  assert(qualify.includes("CREATE OR REPLACE FUNCTION public.start_practice_price_promotion"), "hotfix replaces start");
  assert(qualify.includes("starts.promotion_id"), "hotfix qualifies promotion_id");
  assert(qualify.includes("starts.started_at"), "hotfix qualifies started_at");
  assert(qualify.includes("starts.expires_at"), "hotfix qualifies expires_at");
  assert(!qualify.includes("RETURNING *"), "hotfix does not RETURNING *");
  assert(qualify.includes("ON CONFLICT (promotion_id, visitor_id) DO NOTHING"), "hotfix keeps visitor upsert");
  assert(qualify.includes("EXECUTE"), "ON CONFLICT runs as SQL so OUT promotion_id is not substituted");
  assert(!qualify.includes("started_at = v_now"), "hotfix does not restart");
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
  testOneshotAmbiguousThenQualifyHotfix();
  testStartRpcSemantics();
  console.log(`price-promotions-sql-unit: ok (${backend})`);
}

main();
