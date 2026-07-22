#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTHOR_ACCESS_GRANTED_MESSAGE_TYPE,
  buildAuthorAccessGrantedDedupKey,
} from "../src/lib/email/operational-deliveries.ts";

function testDedupKeyFormat() {
  const applicationId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  assert.equal(
    buildAuthorAccessGrantedDedupKey(applicationId),
    `author_access_granted:${applicationId}`,
  );
  assert.equal(
    buildAuthorAccessGrantedDedupKey(`  ${applicationId}  `),
    `author_access_granted:${applicationId}`,
  );
}

function testMigrationDefinesTable() {
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/20260722103000_operational_email_deliveries.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(sql, /operational_email_deliveries/);
  assert.match(sql, /dedup_key text NOT NULL/);
  assert.match(sql, /status IN \('pending', 'sent', 'failed'\)/);
  assert.match(sql, /operational_email_deliveries_dedup_key_unique/);
}

function testSenderUsesPersistentDelivery() {
  const sender = readFileSync(
    new URL("../src/lib/email/send-author-access-granted-email.ts", import.meta.url),
    "utf8",
  );

  assert.match(sender, /acquireOperationalEmailDelivery/);
  assert.match(sender, /markOperationalEmailDeliverySent/);
  assert.match(sender, /markOperationalEmailDeliveryFailed/);
  assert.doesNotMatch(sender, /new Set\(/);
}

function testMessageTypeConstant() {
  assert.equal(AUTHOR_ACCESS_GRANTED_MESSAGE_TYPE, "author_access_granted");
}

async function main() {
  testDedupKeyFormat();
  testMigrationDefinesTable();
  testSenderUsesPersistentDelivery();
  testMessageTypeConstant();
  console.log("operational-email-delivery-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
