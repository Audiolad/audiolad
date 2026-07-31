#!/usr/bin/env node
/**
 * API contract checks for practice sale-lock routes (source + domain helpers).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRODUCT_DELETE_LOCKED_AFTER_PAID_PURCHASE_MESSAGE,
  PRODUCT_PAID_PURCHASE_DELETE_LOCK,
} from "../src/lib/author-products/delete-lock.ts";
import {
  PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
  PRODUCT_CONTENT_LOCKED_AFTER_SALE,
  saleLockConflictResponse,
} from "../src/lib/author-products/sale-lock.ts";
import { getDeleteBlockerMessage } from "../src/lib/author-products/lifecycle.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function testConflictPayload() {
  const payload = saleLockConflictResponse(PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE);
  assert.equal(payload.error, PRODUCT_CONTENT_LOCKED_AFTER_SALE);
  assert.equal(payload.message, PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE);
}

function testDeleteMessage() {
  assert.equal(
    getDeleteBlockerMessage([PRODUCT_PAID_PURCHASE_DELETE_LOCK]),
    PRODUCT_DELETE_LOCKED_AFTER_PAID_PURCHASE_MESSAGE,
  );
}

function testRoutesGuardSaleLock() {
  // Content/sale-lock remains on destructive audio mutations.
  // Product PATCH uses moderation editability; DELETE uses paid delete-lock.
  const routes = [
    "src/app/api/author/products/[id]/audio/[audioId]/file/route.ts",
    "src/app/api/author/products/[id]/audio/[audioId]/upload/route.ts",
    "src/app/api/author/products/[id]/audio/[audioId]/route.ts",
  ];

  for (const relativePath of routes) {
    const source = read(relativePath);
    assert.match(
      source,
      /PRODUCT_CONTENT_LOCKED_AFTER_SALE|getPracticeSaleLock|assertPracticeContentMutable/,
      `${relativePath} must gate sale-lock`,
    );
    assert.match(source, /status: 409/);
  }

  const productRoute = read("src/app/api/author/products/[id]/route.ts");
  assert.match(
    productRoute,
    /PRODUCT_PAID_PURCHASE_DELETE_LOCK|getPracticeDeleteLock/,
    "product route must gate paid delete-lock",
  );
}

function testUnpublishArchiveRemainOpen() {
  for (const relativePath of [
    "src/app/api/author/products/[id]/unpublish/route.ts",
    "src/app/api/author/products/[id]/archive/route.ts",
    "src/app/api/author/products/[id]/restore-from-archive/route.ts",
  ]) {
    const source = read(relativePath);
    assert.doesNotMatch(
      source,
      /assertPracticeContentMutable|PRODUCT_CONTENT_LOCKED_AFTER_SALE/,
      `${relativePath} must remain available after sale`,
    );
  }
}

function main() {
  testConflictPayload();
  testDeleteMessage();
  testRoutesGuardSaleLock();
  testUnpublishArchiveRemainOpen();
  console.log("practice-sale-lock-api-unit: ok");
}

main();
