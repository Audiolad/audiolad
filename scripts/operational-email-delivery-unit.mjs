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
  const sender = readFileSync(
    new URL("../src/lib/email/send-author-application-approved-email.ts", import.meta.url),
    "utf8",
  );

  assert.match(sender, /acquireOperationalEmailDelivery/);
  assert.match(sender, /markOperationalEmailDeliverySent/);
  assert.match(sender, /markOperationalEmailDeliveryFailed/);
  assert.doesNotMatch(sender, /new Set\(/);
}

function testLegacyAccessGrantedSenderRemoved() {
  const actions = readFileSync(
    new URL("../src/app/admin/author-applications/actions.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(actions, /\bsendAuthorAccessGrantedEmail\b/);
  assert.match(actions, /\bsendAuthorApplicationApprovedEmail\b\(/);

  try {
    readFileSync(
      new URL("../src/lib/email/send-author-access-granted-email.ts", import.meta.url),
      "utf8",
    );
    assert.fail("legacy send-author-access-granted-email.ts must be removed");
  } catch (error) {
    assert.match(String(error), /ENOENT|no such file/i);
  }
}

function testApprovedSenderUsesAuthorsSmtp() {
  const sender = readFileSync(
    new URL("../src/lib/email/send-author-application-approved-email.ts", import.meta.url),
    "utf8",
  );

  assert.match(sender, /resolveAuthorsEmailDeliveryFromEnv\(/);
  assert.match(sender, /authors_smtp_not_configured/);
  assert.match(sender, /markOperationalEmailDeliveryFailed\([\s\S]*authors_smtp_not_configured/);
  assert.doesNotMatch(sender, /getSmtpConfigFromEnv\(/);
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
  testLegacyAccessGrantedSenderRemoved();
  testApprovedSenderUsesAuthorsSmtp();
  testMessageTypeConstant();
  console.log("operational-email-delivery-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
