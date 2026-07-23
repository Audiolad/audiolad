#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getAuthorsSmtpConfigFromEnv,
  getSmtpConfigFromEnv,
} from "../src/lib/email/smtp-config.ts";
import {
  resolveAuthorsEmailDeliveryFromEnv,
  resolveAuthorsEmailTransport,
} from "../src/lib/email/authors-email-transport.ts";

const ENV_KEYS = [
  "AUDIOLAD_SMTP_HOST",
  "AUDIOLAD_SMTP_PORT",
  "AUDIOLAD_SMTP_SECURE",
  "AUDIOLAD_SMTP_USER",
  "AUDIOLAD_SMTP_PASS",
  "AUDIOLAD_SMTP_AUTHORS_HOST",
  "AUDIOLAD_SMTP_AUTHORS_PORT",
  "AUDIOLAD_SMTP_AUTHORS_SECURE",
  "AUDIOLAD_SMTP_AUTHORS_USER",
  "AUDIOLAD_SMTP_AUTHORS_PASS",
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(values) {
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
}

function withEnv(overrides, fn) {
  const saved = snapshotEnv();
  try {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    Object.assign(process.env, overrides);
    return fn();
  } finally {
    restoreEnv(saved);
  }
}

function testPrimarySmtpStillUsesInbox() {
  withEnv(
    {
      AUDIOLAD_SMTP_HOST: "smtp.timeweb.ru",
      AUDIOLAD_SMTP_PORT: "465",
      AUDIOLAD_SMTP_SECURE: "true",
      AUDIOLAD_SMTP_USER: "inbox@audiolad.ru",
      AUDIOLAD_SMTP_PASS: "inbox-secret",
      AUDIOLAD_SMTP_AUTHORS_USER: "authors@audiolad.ru",
      AUDIOLAD_SMTP_AUTHORS_PASS: "authors-secret",
    },
    () => {
      const primary = getSmtpConfigFromEnv();
      assert.ok(primary);
      assert.equal(primary.user, "inbox@audiolad.ru");
      assert.equal(primary.password, "inbox-secret");
    },
  );
}

function testAuthorsSmtpRequiresDedicatedCredentials() {
  withEnv(
    {
      AUDIOLAD_SMTP_HOST: "smtp.timeweb.ru",
      AUDIOLAD_SMTP_PORT: "465",
      AUDIOLAD_SMTP_USER: "inbox@audiolad.ru",
      AUDIOLAD_SMTP_PASS: "inbox-secret",
    },
    () => {
      assert.equal(getAuthorsSmtpConfigFromEnv(), null);
      assert.deepEqual(resolveAuthorsEmailDeliveryFromEnv(), {
        ok: false,
        code: "authors_smtp_not_configured",
      });
    },
  );
}

function testAuthorsSmtpInheritsHostPortSecure() {
  withEnv(
    {
      AUDIOLAD_SMTP_HOST: "smtp.timeweb.ru",
      AUDIOLAD_SMTP_PORT: "465",
      AUDIOLAD_SMTP_SECURE: "true",
      AUDIOLAD_SMTP_AUTHORS_USER: "authors@audiolad.ru",
      AUDIOLAD_SMTP_AUTHORS_PASS: "authors-secret",
    },
    () => {
      const authors = getAuthorsSmtpConfigFromEnv();
      assert.ok(authors);
      assert.equal(authors.host, "smtp.timeweb.ru");
      assert.equal(authors.port, 465);
      assert.equal(authors.secure, true);
      assert.equal(authors.user, "authors@audiolad.ru");
      assert.equal(authors.password, "authors-secret");
    },
  );
}

function testAuthorsTransportUsesAuthorsMailboxForEnvelope() {
  const transport = resolveAuthorsEmailTransport("authors@audiolad.ru");
  assert.match(transport.from, /authors@audiolad\.ru/);
  assert.equal(transport.envelopeFrom, "authors@audiolad.ru");
  assert.equal(transport.replyTo, "authors@audiolad.ru");
}

function testAuthorsDeliveryResolver() {
  withEnv(
    {
      AUDIOLAD_SMTP_HOST: "smtp.timeweb.ru",
      AUDIOLAD_SMTP_AUTHORS_USER: "authors@audiolad.ru",
      AUDIOLAD_SMTP_AUTHORS_PASS: "authors-secret",
    },
    () => {
      const resolved = resolveAuthorsEmailDeliveryFromEnv();
      assert.equal(resolved.ok, true);
      if (!resolved.ok) return;
      assert.equal(resolved.delivery.smtpConfig.user, "authors@audiolad.ru");
      assert.equal(resolved.delivery.transport.envelopeFrom, "authors@audiolad.ru");
      assert.match(resolved.delivery.transport.from, /authors@audiolad\.ru/);
    },
  );
}

function testAuthorSendersUseAuthorsDeliveryResolver() {
  for (const file of [
    "../src/lib/email/send-author-application-submitted-email.ts",
    "../src/lib/email/send-author-application-approved-email.ts",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /resolveAuthorsEmailDeliveryFromEnv\(/);
    assert.match(source, /authors_smtp_not_configured/);
    assert.doesNotMatch(source, /getSmtpConfigFromEnv\(/);
  }
}

function testWelcomeSenderStaysOnPrimarySmtp() {
  const welcome = readFileSync(
    new URL("../src/lib/email/send-welcome-email.ts", import.meta.url),
    "utf8",
  );
  assert.match(welcome, /getSmtpConfigFromEnv\(/);
  assert.doesNotMatch(welcome, /getAuthorsSmtpConfigFromEnv/);
  assert.doesNotMatch(welcome, /resolveAuthorsEmailDeliveryFromEnv/);
}

function testApproveFlowDoesNotRollbackOnEmailFailure() {
  const actions = readFileSync(
    new URL("../src/app/admin/author-applications/actions.ts", import.meta.url),
    "utf8",
  );
  const approveBlock = actions.match(
    /export async function approveAuthorApplication[\s\S]*?^}/m,
  )?.[0];
  assert.ok(approveBlock);
  const rpcIndex = approveBlock.indexOf('callAuthorApplicationRpc(supabase, "approve_author_application"');
  const emailIndex = approveBlock.indexOf("sendAuthorApplicationApprovedEmail(");
  const emailFailureIndex = approveBlock.indexOf("if (!emailResult.ok)");
  assert.ok(rpcIndex >= 0 && emailIndex > rpcIndex);
  assert.ok(emailFailureIndex > emailIndex);
  assert.match(approveBlock, /return \{[\s\S]*ok: true,/);
  assert.match(approveBlock, /warning/);
}

function testApprovedSenderPersistsConfigFailure() {
  const sender = readFileSync(
    new URL("../src/lib/email/send-author-application-approved-email.ts", import.meta.url),
    "utf8",
  );
  assert.match(sender, /markOperationalEmailDeliveryFailed\([\s\S]*authors_smtp_not_configured/);
}

function testLegacyAccessGrantedSenderUnreachable() {
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

async function main() {
  testPrimarySmtpStillUsesInbox();
  testAuthorsSmtpRequiresDedicatedCredentials();
  testAuthorsSmtpInheritsHostPortSecure();
  testAuthorsTransportUsesAuthorsMailboxForEnvelope();
  testAuthorsDeliveryResolver();
  testAuthorSendersUseAuthorsDeliveryResolver();
  testWelcomeSenderStaysOnPrimarySmtp();
  testApproveFlowDoesNotRollbackOnEmailFailure();
  testApprovedSenderPersistsConfigFailure();
  testLegacyAccessGrantedSenderUnreachable();
  console.log("authors-smtp-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
