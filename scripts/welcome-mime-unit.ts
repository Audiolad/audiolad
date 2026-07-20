#!/usr/bin/env node
/**
 * MIME unit checks for welcome email transport (recovery-aligned).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyDotStuffing,
  buildHtmlQuotedPrintableMime,
  encodeMimeWord,
  encodeQuotedPrintable,
  formatMimeFromAddress,
  maxLineLength,
} from "../src/lib/email/mime";
import { buildWelcomeCompatibleMime } from "../src/lib/email/providers/smtp";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepo(...segments: string[]) {
  return readFileSync(path.join(REPO_ROOT, ...segments), "utf8");
}

function testMimeEncoding() {
  const from = formatMimeFromAddress("АудиоЛад", "inbox@audiolad.ru");
  assert.match(from, /^=\?UTF-8\?q\?.*\?= <inbox@audiolad\.ru>$/);
  assert.doesNotMatch(from, /no-reply@/);
  assert.match(from, /inbox@audiolad\.ru/);

  const subject = encodeMimeWord("АудиоЛад — проверка welcome MIME 2026-07-20");
  assert.match(subject, /^=\?UTF-8\?q\?/);
  assert.doesNotMatch(subject, /АудиоЛад/);

  const html = `<p>${"А".repeat(120)}</p>\n<div>hello.</div>`;
  const qp = encodeQuotedPrintable(html);
  assert.ok(qp.includes("=\r\n") || maxLineLength(qp) <= 76);
  assert.ok(maxLineLength(qp) <= 76);
  assert.ok(qp.includes("=D0=90") || qp.includes("А") === false);
}

function testWelcomeMimeShape() {
  const mime = buildWelcomeCompatibleMime({
    from: formatMimeFromAddress("АудиоЛад", "inbox@audiolad.ru"),
    to: "petpovss@yandex.ru",
    subject: "АудиоЛад — проверка welcome MIME 2026-07-20",
    replyTo: "support@audiolad.ru",
    html: "<html><body><p>Добро пожаловать</p></body></html>",
  });

  assert.match(mime, /^From: =\?UTF-8\?q\?/m);
  assert.match(mime, /inbox@audiolad\.ru/);
  assert.doesNotMatch(mime, /no-reply@audiolad\.ru/);
  assert.match(mime, /^Reply-To: support@audiolad\.ru$/m);
  assert.match(mime, /^To: petpovss@yandex\.ru$/m);
  assert.match(mime, /^Subject: =\?UTF-8\?q\?/m);
  assert.match(mime, /^MIME-Version: 1\.0$/m);
  assert.match(mime, /^Date: /m);
  assert.match(mime, /^Content-Type: text\/html; charset=UTF-8$/m);
  assert.match(mime, /^Content-Transfer-Encoding: quoted-printable$/m);
  assert.doesNotMatch(mime, /Content-Transfer-Encoding: base64/i);
  assert.doesNotMatch(mime, /multipart\//i);
  assert.doesNotMatch(mime, /^Message-ID:/im);
  assert.ok(mime.includes("\r\n"));

  const body = mime.slice(mime.indexOf("\r\n\r\n") + 4);
  assert.ok(maxLineLength(body) <= 76);

  const stuffed = applyDotStuffing("line\r\n.hidden\r\nend");
  assert.equal(stuffed, "line\r\n..hidden\r\nend");
}

function testSourceGuarantees() {
  const smtp = readRepo("src", "lib", "email", "providers", "smtp.ts");
  const sendWelcome = readRepo("src", "lib", "email", "send-welcome-email.ts");
  const identities = readRepo("src", "lib", "email", "sender-identities.ts");

  assert.match(smtp, /session\.expect\(\[250\]\)/);
  assert.match(smtp, /applyDotStuffing/);
  assert.match(smtp, /quoted-printable|buildHtmlQuotedPrintableMime|buildWelcomeCompatibleMime/);
  assert.match(smtp, /MAIL FROM:<\$\{envelopeFrom\}>|MAIL FROM:<\$\{/);
  assert.doesNotMatch(smtp, /Content-Transfer-Encoding: base64/);
  assert.doesNotMatch(sendWelcome, /no-reply@audiolad\.ru/);
  assert.match(sendWelcome, /envelopeFrom: fromEmail/);
  assert.match(sendWelcome, /html: rendered\.html/);
  assert.doesNotMatch(sendWelcome, /text: rendered\.text/);
  assert.match(identities, /from: "inbox@audiolad\.ru"/);
  assert.doesNotMatch(identities, /from: "no-reply@audiolad\.ru"/);
  assert.doesNotMatch(smtp, /console\.log\(.*password/i);
  assert.doesNotMatch(sendWelcome, /AUDIOLAD_SMTP_PASS/);
}

function testBuildHtmlHelper() {
  const mime = buildHtmlQuotedPrintableMime({
    from: formatMimeFromAddress("АудиоЛад", "inbox@audiolad.ru"),
    to: "a@b.ru",
    subject: "Тема",
    html: "<p>x</p>",
  });
  assert.match(mime, /Content-Transfer-Encoding: quoted-printable/);
}

testMimeEncoding();
testWelcomeMimeShape();
testSourceGuarantees();
testBuildHtmlHelper();
console.log("welcome-mime-unit: ok");
