#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTHOR_ACCESS_GRANTED_MESSAGE_TYPE,
  AUTHOR_APPLICATION_APPROVED_MESSAGE_TYPE,
  buildAuthorAccessGrantedDedupKey,
  buildAuthorApplicationApprovedDedupKey,
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
  assert.equal(
    buildAuthorApplicationApprovedDedupKey(applicationId),
    `author_application_approved:${applicationId}`,
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
  for (const file of [
    "../src/lib/email/send-author-access-granted-email.ts",
    "../src/lib/email/send-author-application-approved-email.ts",
  ]) {
    const sender = readFileSync(new URL(file, import.meta.url), "utf8");

    assert.match(sender, /acquireOperationalEmailDelivery/);
    assert.match(sender, /markOperationalEmailDeliverySent/);
    assert.match(sender, /markOperationalEmailDeliveryFailed/);
    assert.doesNotMatch(sender, /new Set\(/);
  }
}

function testMessageTypeConstant() {
  assert.equal(AUTHOR_ACCESS_GRANTED_MESSAGE_TYPE, "author_access_granted");
  assert.equal(
    AUTHOR_APPLICATION_APPROVED_MESSAGE_TYPE,
    "author_application_approved",
  );
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
