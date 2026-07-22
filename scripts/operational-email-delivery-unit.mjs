#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTHOR_ACCESS_GRANTED_MESSAGE_TYPE,
  AUTHOR_APPLICATION_APPROVED_MESSAGE_TYPE,
  buildAuthorAccessGrantedDedupKey,
  buildAuthorApplicationApprovedDedupKey,
  resolveOperationalEmailDeliverySendIntent,
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

function testApprovedSenderUsesApprovedMessageType() {
  const sender = readFileSync(
    new URL("../src/lib/email/send-author-application-approved-email.ts", import.meta.url),
    "utf8",
  );

  assert.match(sender, /AUTHOR_APPLICATION_APPROVED_MESSAGE_TYPE/);
  assert.match(sender, /author_application_approved/);
  assert.match(sender, /AUTHOR_APPLICATION_APPROVED_EMAIL_TEMPLATE_KEY/);
  assert.doesNotMatch(sender, /AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_KEY/);
}

function testResendActionUsesApprovedSender() {
  const actions = readFileSync(
    new URL("../src/app/admin/author-applications/actions.ts", import.meta.url),
    "utf8",
  );
  const form = readFileSync(
    new URL("../src/components/admin/AuthorApplicationReviewForm.tsx", import.meta.url),
    "utf8",
  );

  assert.match(actions, /export async function resendAuthorApplicationApprovedEmail/);
  assert.match(actions, /sendAuthorApplicationApprovedEmail\(/);
  assert.doesNotMatch(actions, /resendAuthorAccessGrantedEmail/);
  assert.doesNotMatch(actions, /sendAuthorAccessGrantedEmail\(/);
  assert.match(form, /resendAuthorApplicationApprovedEmail/);
  assert.doesNotMatch(form, /resendAuthorAccessGrantedEmail/);
}

function testMessageTypeConstant() {
  assert.equal(AUTHOR_ACCESS_GRANTED_MESSAGE_TYPE, "author_access_granted");
  assert.equal(
    AUTHOR_APPLICATION_APPROVED_MESSAGE_TYPE,
    "author_application_approved",
  );
}

function testDeliverySendIntentDecisions() {
  assert.deepEqual(resolveOperationalEmailDeliverySendIntent(null, false), {
    kind: "send",
    mode: "insert",
  });

  assert.deepEqual(
    resolveOperationalEmailDeliverySendIntent({ status: "pending" }, false),
    { kind: "send", mode: "retry" },
  );

  assert.deepEqual(
    resolveOperationalEmailDeliverySendIntent({ status: "failed" }, false),
    { kind: "send", mode: "retry" },
  );

  assert.deepEqual(
    resolveOperationalEmailDeliverySendIntent({ status: "sent" }, false),
    { kind: "skip", reason: "already_sent" },
  );

  assert.deepEqual(
    resolveOperationalEmailDeliverySendIntent({ status: "sent" }, true),
    { kind: "send", mode: "force_resend" },
  );
}

function testFailedDeliveryMarkedInSender() {
  const deliveries = readFileSync(
    new URL("../src/lib/email/operational-deliveries.ts", import.meta.url),
    "utf8",
  );
  const sender = readFileSync(
    new URL("../src/lib/email/send-author-application-approved-email.ts", import.meta.url),
    "utf8",
  );

  assert.match(deliveries, /status: "failed"/);
  assert.match(sender, /markOperationalEmailDeliveryFailed/);
}

function testApproveFlowDoesNotFailOnEmailError() {
  const actions = readFileSync(
    new URL("../src/app/admin/author-applications/actions.ts", import.meta.url),
    "utf8",
  );

  const approveBlock = actions.match(
    /export async function approveAuthorApplication[\s\S]*?^}/m,
  )?.[0];

  assert.ok(approveBlock, "approveAuthorApplication block must exist");
  assert.match(approveBlock, /if \(!rpc\.result\.idempotent\)/);
  assert.match(approveBlock, /sendAuthorApplicationApprovedEmail\(/);
  assert.match(approveBlock, /author_application_approved_email_failed/);
  assert.match(approveBlock, /ok: true,/);
  assert.match(approveBlock, /warning/);
  assert.doesNotMatch(
    approveBlock,
    /if \(!emailResult\.ok\)[\s\S]*return \{ ok: false/,
  );
}

function testApprovedEmailFailureLoggingIsStructured() {
  const actions = readFileSync(
    new URL("../src/app/admin/author-applications/actions.ts", import.meta.url),
    "utf8",
  );
  const sender = readFileSync(
    new URL("../src/lib/email/send-author-application-approved-email.ts", import.meta.url),
    "utf8",
  );
  const smtp = readFileSync(
    new URL("../src/lib/email/providers/smtp.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    actions,
    /console\.error\(\s*[\n\r\s]*"author_application_approved_email_failed",[\s\S]*?applicationId,[\s\S]*?emailResult\.code/,
  );
  assert.doesNotMatch(actions, /author_application_approved_email_failed[\s\S]*result\.message/);
  assert.doesNotMatch(sender, /console\.error\([^)]*smtpConfig/);
  assert.doesNotMatch(sender, /AUDIOLAD_SMTP_PASS/);
  assert.match(sender, /console\.error\([\s\S]*result\.code/);
  assert.match(sender, /result\.message/);
  assert.doesNotMatch(sender, /console\.error\([\s\S]*\bresult\s*,\s*\)/);
  assert.doesNotMatch(smtp, /console\.log\([^)]*password/i);
}

async function main() {
  testDedupKeyFormat();
  testMigrationDefinesTable();
  testSenderUsesPersistentDelivery();
  testApprovedSenderUsesApprovedMessageType();
  testResendActionUsesApprovedSender();
  testMessageTypeConstant();
  testDeliverySendIntentDecisions();
  testFailedDeliveryMarkedInSender();
  testApproveFlowDoesNotFailOnEmailError();
  testApprovedEmailFailureLoggingIsStructured();
  console.log("operational-email-delivery-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
