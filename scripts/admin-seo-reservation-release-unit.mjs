#!/usr/bin/env node
/**
 * Admin SEO reservation release: linked rows must clear product_id,
 * and the admin UI must show the RPC diagnostic code.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { adminSeoReservationReleaseDiagnosticCode } from "../src/lib/seo-queries/admin-release-error.ts";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf8");

const core = read("supabase/migrations/20261006130000_seo_core_v1.sql");
const v2 = read("supabase/migrations/20261021120000_seo_reservation_product_primary_sync.sql");
const fix = read("supabase/migrations/20261217120100_admin_release_seo_reservation_clear_product.sql");
const route = read("src/app/api/admin/seo-queries/route.ts");
const ui = read("src/components/admin/AdminSeoQueriesClient.tsx");
const pkg = read("package.json");
const workflow = read(".github/workflows/pr-repository-validation.yml");

assert.match(core, /seo_query_reservations_product_active_check/);
assert.match(
  core,
  /product_id IS NULL OR status IN \('active', 'used'\)/,
);

function adminReleaseBody(sql) {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.admin_release_seo_query_reservation",
  );
  assert.ok(start >= 0, "admin release function missing");
  const rest = sql.slice(start);
  const end = rest.indexOf("$$;");
  assert.ok(end > 0, "admin release function terminator missing");
  return rest.slice(0, end);
}

const v2Body = adminReleaseBody(v2);
const v2Update = v2Body.slice(v2Body.lastIndexOf("UPDATE public.seo_query_reservations"));
assert.match(v2Update, /status = 'released'/);
assert.doesNotMatch(v2Update, /product_id = NULL/);

const fixBody = adminReleaseBody(fix);
const fixUpdate = fixBody.slice(fixBody.lastIndexOf("UPDATE public.seo_query_reservations"));
assert.match(fixUpdate, /status = 'released'/);
assert.match(fixUpdate, /product_id = NULL/);
assert.match(fixUpdate, /released_at = now\(\)/);
assert.match(fix, /audiolad:seo-reservation-admin-release:v3/);
assert.match(fixBody, /primary_seo_query_id = NULL/);
assert.match(fixBody, /seo_primary_query = NULL/);
assert.match(fixBody, /has_platform_permission\(auth\.uid\(\), 'seo\.manage'\)/);

assert.match(route, /adminSeoReservationReleaseDiagnosticCode/);
assert.match(route, /code: adminSeoReservationReleaseDiagnosticCode\(error\)/);
assert.match(route, /createClient\(\)/);
assert.doesNotMatch(
  route.slice(route.indexOf("export async function DELETE")),
  /createServiceRoleClient/,
);

assert.match(ui, /Не удалось снять бронь \(\$\{code\}\)\./);
assert.match(ui, /setNotice\("Бронь снята\."\)/);
assert.doesNotMatch(ui, /return setNotice\("Не удалось снять бронь\."\)/);

assert.equal(
  adminSeoReservationReleaseDiagnosticCode({
    message:
      'new row for relation "seo_query_reservations" violates check constraint "seo_query_reservations_product_active_check"',
    code: "23514",
  }),
  "seo_query_reservations_product_active_check",
);
assert.equal(
  adminSeoReservationReleaseDiagnosticCode({
    message: "permission_denied",
    code: "42501",
  }),
  "permission_denied",
);
assert.equal(
  adminSeoReservationReleaseDiagnosticCode({
    message: "seo_reservation_not_releasable",
    code: "P0001",
  }),
  "seo_reservation_not_releasable",
);
assert.equal(
  adminSeoReservationReleaseDiagnosticCode({ message: "", code: "23514" }),
  "23514",
);
assert.equal(
  adminSeoReservationReleaseDiagnosticCode({}),
  "seo_reservation_release_failed",
);

assert.match(pkg, /"test:admin-seo-reservation-release":/);
assert.match(workflow, /npm run test:admin-seo-reservation-release/);

console.log("admin-seo-reservation-release-unit: ok");
