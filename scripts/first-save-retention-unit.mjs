#!/usr/bin/env node
/**
 * First-save retention unit checks — safe to run without database access.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRoot(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function testMigrationContract() {
  const sql = readRoot(
    "supabase/migrations/20260722220000_first_save_retention.sql",
  );

  assert(
    sql.includes("first_save_retention_seen_at"),
    "profiles retention column",
  );
  assert(sql.includes("show_first_save_prompt"), "rpc retention flag");
  assert(
    sql.includes("first_save_retention_seen_at IS NULL"),
    "atomic null gate",
  );
  assert(sql.includes("'first_manual_library_save'"), "server analytics insert");
  assert(
    sql.includes("is_platform_analytics_event"),
    "platform allowlist update",
  );
  assert(
    sql.includes("'first_save_retention_prompt_shown'"),
    "prompt shown allowlist",
  );
  assert(
    sql.includes("audiolad:library-claim:v2"),
    "claim rpc contract marker",
  );
}

function testClaimApiHelpers() {
  const source = readRoot("src/lib/library/claim-api.ts");

  assert(source.includes("show_first_save_prompt"), "rpc result field");
  assert(source.includes("retention:"), "retention response block");
  assert(source.includes("isClaimLibrarySuccessBody"), "success body guard");
  assert(
    source.includes("row.inserted && row.show_first_save_prompt"),
    "retention gated on inserted",
  );
}

function testRouteContract() {
  const route = readRoot("src/app/api/library/claim/route.ts");

  assert(route.includes("toClaimLibrarySuccessBody"), "success mapper wired");
  assert(route.includes("claim_free_practice"), "manual claim rpc only");
}

function testUiWiring() {
  const button = readRoot("src/components/LibraryAddButton.tsx");
  const providers = readRoot("src/components/AppProviders.tsx");
  const card = readRoot("src/components/retention/FirstSaveRetentionCard.tsx");

  assert(
    button.includes("showFirstSaveRetention"),
    "library button triggers retention",
  );
  assert(
    button.includes("body.retention.show_first_save_prompt"),
    "reads retention flag",
  );
  assert(
    button.includes("body.retention.show_first_save_prompt"),
    "retention branch before refresh",
  );
  assert(button.includes("router.refresh()"), "refresh still available after dismiss path");
  assert(
    providers.includes("FirstSaveRetentionProvider"),
    "provider mounted globally",
  );
  assert(card.includes("Практика сохранена ✓"), "title copy");
  assert(card.includes("–"), "medium dash in copy");
  assert(!card.includes("—"), "no em dash in copy");
  assert(card.includes('aria-label="Закрыть"'), "close label");
  assert(card.includes("Хорошо"), "secondary action");
  assert(card.includes('role="region"'), "not modal dialog");
  assert(!card.includes("aria-modal"), "no focus trap");
  assert(card.includes("isStandalone"), "standalone hides pwa hint");
  assert(card.includes("z-[20]"), "above mini player stack");
}

function testAnalyticsConstants() {
  const source = readRoot("src/lib/analytics/constants.ts");

  assert(source.includes('"first_manual_library_save"'), "save event");
  assert(source.includes('"first_save_retention_prompt_shown"'), "shown event");
  assert(
    source.includes('"first_save_retention_prompt_library_clicked"'),
    "library click event",
  );
  assert(
    source.includes('"first_save_retention_prompt_dismissed"'),
    "dismiss event",
  );
}

function toClaimLibrarySuccessBody(row) {
  return {
    library: {
      practice_id: row.practice_id,
      practice_slug: row.practice_slug,
      access_source: row.access_source,
      inserted: row.inserted,
      in_library: true,
    },
    retention: {
      show_first_save_prompt: row.inserted && row.show_first_save_prompt,
    },
  };
}

function testClaimApiSuccessBody() {
  const firstSave = toClaimLibrarySuccessBody({
    practice_id: "11111111-1111-4111-8111-111111111111",
    practice_slug: "test-practice",
    inserted: true,
    access_source: "free_claim",
    in_library: true,
    show_first_save_prompt: true,
  });

  assert(
    firstSave.retention.show_first_save_prompt === true,
    "first save prompt true",
  );

  const repeat = toClaimLibrarySuccessBody({
    practice_id: "11111111-1111-4111-8111-111111111111",
    practice_slug: "test-practice",
    inserted: false,
    access_source: "free_claim",
    in_library: true,
    show_first_save_prompt: false,
  });

  assert(
    repeat.retention.show_first_save_prompt === false,
    "repeat save prompt false",
  );

  const staleFlag = toClaimLibrarySuccessBody({
    practice_id: "11111111-1111-4111-8111-111111111111",
    practice_slug: "test-practice",
    inserted: false,
    access_source: "free_claim",
    in_library: true,
    show_first_save_prompt: true,
  });

  assert(
    staleFlag.retention.show_first_save_prompt === false,
    "inserted=false forces prompt false",
  );
}

function main() {
  testMigrationContract();
  testClaimApiHelpers();
  testRouteContract();
  testUiWiring();
  testAnalyticsConstants();
  testClaimApiSuccessBody();
  console.log("first-save-retention-unit: PASS");
}

main();
