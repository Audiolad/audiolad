#!/usr/bin/env node
/**
 * Unit tests for practice sale-lock helpers and lifecycle wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getDeleteBlockerMessage,
  getDeleteBlockers,
  getProductLifecycleBlockers,
} from "../src/lib/author-products/lifecycle.ts";
import {
  PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
  PRODUCT_CONTENT_LOCKED_AFTER_SALE,
  PRODUCT_DELETE_LOCKED_AFTER_SALE_MESSAGE,
  assertPracticeContentMutable,
  getPracticeSaleLock,
} from "../src/lib/author-products/sale-lock.ts";
import { canEntitledUserAccessPracticeStatus } from "../src/lib/products/access.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function createSaleLockClient({
  entitlementCount = 0,
  paidOrderCount = 0,
  anyOrderCount = 0,
  status = "draft",
  starterActive = false,
} = {}) {
  return {
    from(table) {
      const state = {
        table,
        filters: {},
        countMode: false,
      };

      const builder = {
        select(_columns, options) {
          state.countMode = Boolean(options?.head && options?.count === "exact");
          return builder;
        },
        eq(column, value) {
          state.filters[column] = value;
          return builder;
        },
        maybeSingle: async () => {
          if (table === "practices") {
            return { data: { id: "practice-1", status }, error: null };
          }

          if (table === "starter_practices") {
            return {
              data: starterActive ? { is_active: true } : null,
              error: null,
            };
          }

          return { data: null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(async () => {
              if (!state.countMode) {
                return { count: null, error: null };
              }

              if (table === "user_practices") {
                return { count: entitlementCount, error: null };
              }

              if (table === "orders") {
                if (state.filters.status === "paid") {
                  return { count: paidOrderCount, error: null };
                }

                return { count: anyOrderCount, error: null };
              }

              return { count: 0, error: null };
            })
            .then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

async function testSaleLockFalseWithoutOrdersOrEntitlements() {
  const lock = await getPracticeSaleLock(createSaleLockClient(), "practice-1");
  assert.equal(lock.locked, false);
  assert.equal(lock.reason, null);
}

async function testSaleLockTrueWithEntitlement() {
  const lock = await getPracticeSaleLock(
    createSaleLockClient({ entitlementCount: 2 }),
    "practice-1",
  );
  assert.equal(lock.locked, true);
  assert.equal(lock.reason, "entitlement");
}

async function testSaleLockTrueWithPaidOrder() {
  const lock = await getPracticeSaleLock(
    createSaleLockClient({ paidOrderCount: 1 }),
    "practice-1",
  );
  assert.equal(lock.locked, true);
  assert.equal(lock.reason, "paid_order");
}

async function testAssertPracticeContentMutableThrows() {
  await assert.rejects(
    () =>
      assertPracticeContentMutable(
        createSaleLockClient({ entitlementCount: 1 }),
        "practice-1",
      ),
    (error) =>
      error?.code === PRODUCT_CONTENT_LOCKED_AFTER_SALE &&
      error?.userMessage === PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
  );
}

async function testLifecycleDeleteUsesSaleLock() {
  const blockers = getDeleteBlockers(
    await getProductLifecycleBlockers(
      createSaleLockClient({
        status: "unpublished",
        entitlementCount: 1,
        anyOrderCount: 1,
        paidOrderCount: 1,
      }),
      "practice-1",
    ),
  );

  assert.ok(blockers.includes(PRODUCT_CONTENT_LOCKED_AFTER_SALE));
  assert.equal(
    getDeleteBlockerMessage(blockers),
    PRODUCT_DELETE_LOCKED_AFTER_SALE_MESSAGE,
  );
}

async function testLifecyclePendingOrderStillBlocksDelete() {
  const blockers = getDeleteBlockers(
    await getProductLifecycleBlockers(
      createSaleLockClient({
        status: "draft",
        anyOrderCount: 1,
        paidOrderCount: 0,
        entitlementCount: 0,
      }),
      "practice-1",
    ),
  );

  assert.ok(blockers.includes("has_orders"));
  assert.ok(!blockers.includes(PRODUCT_CONTENT_LOCKED_AFTER_SALE));
}

function testEntitledAccessByStatus() {
  assert.equal(canEntitledUserAccessPracticeStatus("published"), true);
  assert.equal(canEntitledUserAccessPracticeStatus("unpublished"), true);
  assert.equal(canEntitledUserAccessPracticeStatus("archived"), true);
  assert.equal(canEntitledUserAccessPracticeStatus("draft"), false);
  assert.equal(canEntitledUserAccessPracticeStatus("unknown"), false);
}

function testSourceWiring() {
  const saleLockSource = read("src/lib/author-products/sale-lock.ts");
  const lifecycleSource = read("src/lib/author-products/lifecycle.ts");
  const fileRoute = read(
    "src/app/api/author/products/[id]/audio/[audioId]/file/route.ts",
  );
  const uploadRoute = read(
    "src/app/api/author/products/[id]/audio/[audioId]/upload/route.ts",
  );
  const audioRoute = read(
    "src/app/api/author/products/[id]/audio/[audioId]/route.ts",
  );
  const migration = read(
    "supabase/migrations/20260728120000_practice_content_sale_lock.sql",
  );
  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");

  assert.match(saleLockSource, /PRODUCT_CONTENT_LOCKED_AFTER_SALE/);
  assert.match(lifecycleSource, /getPracticeSaleLock/);
  assert.match(fileRoute, /assertPracticeContentMutable/);
  assert.match(uploadRoute, /getPracticeSaleLock/);
  assert.match(audioRoute, /assertPracticeContentMutable/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /guard_audio_items_content_sale_lock/);
  assert.match(migration, /practice_is_content_locked_after_sale/);
  assert.match(form, /contentLockedAfterSale/);
  assert.match(
    form,
    /Этот продукт уже приобретён слушателями/,
  );
}

async function main() {
  await testSaleLockFalseWithoutOrdersOrEntitlements();
  await testSaleLockTrueWithEntitlement();
  await testSaleLockTrueWithPaidOrder();
  await testAssertPracticeContentMutableThrows();
  await testLifecycleDeleteUsesSaleLock();
  await testLifecyclePendingOrderStillBlocksDelete();
  testEntitledAccessByStatus();
  testSourceWiring();
  console.log("practice-sale-lock-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
