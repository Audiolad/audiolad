#!/usr/bin/env node
/**
 * Brand email template layout + welcome email checks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCTION_APP_ORIGIN } from "../src/lib/seo/app-origin";
import {
  AUTHOR_ACCESS_GRANTED_EMAIL_SUBJECT,
  AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_KEY,
  AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_VERSION,
  renderAuthorAccessGrantedEmailHtml,
} from "../src/lib/email/templates/author-access-granted";
import {
  RECOVERY_EMAIL_TEMPLATE_KEY,
  RECOVERY_EMAIL_TEMPLATE_VERSION,
  renderRecoveryEmailHtml,
  renderRecoveryGoTrueTemplateHtml,
} from "../src/lib/email/templates/recovery";
import { brandEmailTemplateRenderer } from "../src/lib/email/templates/renderer";
import {
  WELCOME_EMAIL_PREHEADER,
  WELCOME_EMAIL_SUBJECT,
  WELCOME_EMAIL_TEMPLATE_KEY,
  WELCOME_EMAIL_TEMPLATE_VERSION,
  getWelcomeEmailLibraryUrl,
  renderWelcomeEmailHtml,
  renderWelcomeEmailText,
} from "../src/lib/email/templates/welcome";
import { escapeHtml } from "../src/lib/email/templates/escape-html";
import { encodeQuotedPrintable, maxLineLength } from "../src/lib/email/mime";
import { buildWelcomeCompatibleMime } from "../src/lib/email/providers/smtp";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function repoPath(...segments: string[]) {
  return path.join(REPO_ROOT, ...segments);
}

function readRepoFile(...segments: string[]) {
  return readFileSync(repoPath(...segments), "utf8");
}

function testSharedLayoutFiles() {
  for (const file of [
    "src/lib/email/templates/brand-layout.ts",
    "src/lib/email/templates/welcome.ts",
    "src/lib/email/templates/recovery.ts",
    "src/lib/email/templates/renderer.ts",
    "src/lib/email/send-welcome-email.ts",
    "src/lib/email/providers/smtp.ts",
    "scripts/build-gotrue-email-templates.ts",
  ]) {
    readRepoFile(...file.split("/"));
  }
}

async function testWelcomeTemplate() {
  const siteOrigin = "https://audiolad.ru";
  const libraryUrl = getWelcomeEmailLibraryUrl(siteOrigin);
  const html = renderWelcomeEmailHtml({ userName: "Анна", siteOrigin });
  const text = renderWelcomeEmailText({ userName: "Анна", siteOrigin });

  assert.equal(WELCOME_EMAIL_SUBJECT, "Ваш доступ к АудиоЛаду");
  assert.equal(libraryUrl, `${siteOrigin}/my-practices`);

  assert.match(html, /Здравствуйте, <strong>Анна<\/strong>!/);
  assert.match(html, /Добро пожаловать в <strong>АудиоЛад<\/strong>/);
  assert.match(html, /Сохраните это письмо/);
  assert.match(html, /Открыть мою Аудиотеку/);
  assert.match(html, /href="https:\/\/audiolad\.ru\/my-practices"/);
  assert.match(html, /добавьте его на главный экран телефона/);
  assert.match(html, /Все ваши практики хранятся в АудиоЛаде/);
  assert.match(html, /audiolad\.ru/);
  assert.match(html, /команда АудиоЛада/);
  assert.match(html, /зарегистрировались в АудиоЛад/);
  assert.doesNotMatch(html, /Открыть АудиоЛад/);
  assert.doesNotMatch(html, /href="https:\/\/audiolad\.ru"/);
  assert.doesNotMatch(html, /Полезные ссылки/);
  assert.doesNotMatch(html, /https:\/\/audiolad\.ru\/https:\/\//);

  assert.match(text, /Здравствуйте, Анна!/);
  assert.match(text, /Сохраните это письмо/);
  assert.match(text, /Открыть мою Аудиотеку:/);
  assert.match(text, new RegExp(`^${libraryUrl}$`, "m"));
  assert.match(text, /добавьте его на главный экран телефона/);
  assert.match(text, /Все ваши практики хранятся в АудиоЛаде/);
  assert.match(text, /audiolad\.ru/);
  assert.doesNotMatch(text, /Открыть АудиоЛад: https:\/\/audiolad\.ru$/m);

  const longName = "А".repeat(80);
  const escapedLongName = escapeHtml(longName);
  const longNameHtml = renderWelcomeEmailHtml({
    userName: longName,
    siteOrigin,
  });
  assert.match(longNameHtml, new RegExp(`<strong>${escapedLongName}<\\/strong>`));
  assert.doesNotMatch(longNameHtml, /<<strong>/);

  const maliciousName = '<script>alert("x")</script>';
  const safeHtml = renderWelcomeEmailHtml({
    userName: maliciousName,
    siteOrigin,
  });
  assert.doesNotMatch(safeHtml, /<script>/);
  assert.match(safeHtml, /&lt;script&gt;alert/);

  const defaultOriginHtml = renderWelcomeEmailHtml({ userName: "Анна" });
  assert.match(
    defaultOriginHtml,
    new RegExp(`href="${PRODUCTION_APP_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/my-practices"`),
  );

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: WELCOME_EMAIL_TEMPLATE_KEY,
    templateVersion: WELCOME_EMAIL_TEMPLATE_VERSION,
    payload: { userName: "Анна" },
  });

  assert.equal(rendered.ok, true);
  if (rendered.ok) {
    assert.equal(rendered.subject, WELCOME_EMAIL_SUBJECT);
    assert.match(rendered.html, /email-card-wrap/);
    assert.match(rendered.text ?? "", /https:\/\/audiolad\.ru\/my-practices/);
  }

  const qpBody = encodeQuotedPrintable(rendered.ok ? rendered.html : html);
  assert.ok(maxLineLength(qpBody) <= 76);

  const mime = buildWelcomeCompatibleMime({
    from: "test@audiolad.ru",
    to: "user@mail.ru",
    subject: WELCOME_EMAIL_SUBJECT,
    html: rendered.ok ? rendered.html : html,
  });
  assert.match(mime, /Content-Transfer-Encoding: quoted-printable/);
  assert.doesNotMatch(mime, /Content-Transfer-Encoding: base64/i);
  assert.match(html, new RegExp(WELCOME_EMAIL_PREHEADER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

async function testRecoveryTemplateStillWorks() {
  const html = renderRecoveryEmailHtml({
    confirmationUrl: "https://audiolad.ru/auth/reset-password?token=example",
    siteOrigin: "https://audiolad.ru",
  });

  assert.match(html, /Восстановление пароля/);
  assert.match(html, /Создать новый пароль/);
  assert.match(html, /token=example/);
  assert.match(html, /запросили восстановление пароля/);

  const gotrueHtml = renderRecoveryGoTrueTemplateHtml("https://audiolad.ru");
  assert.match(gotrueHtml, /\{\{ \.ConfirmationURL \}\}/);
  assert.match(gotrueHtml, /\{\{ if \.UnsubscribeURL \}\}/);

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: RECOVERY_EMAIL_TEMPLATE_KEY,
    templateVersion: RECOVERY_EMAIL_TEMPLATE_VERSION,
    payload: {
      confirmationUrl: "https://audiolad.ru/auth/reset-password?token=example",
    },
  });

  assert.equal(rendered.ok, true);
}

function testSignupSendsWelcome() {
  const signUpAction = readRepoFile("src", "app", "auth", "sign-up", "actions.ts");

  assert.match(signUpAction, /sendWelcomeEmail\(/);
  assert.match(signUpAction, /signup_welcome_email_failed/);
  assert.match(signUpAction, /userName: firstName/);
}

async function testAuthorAccessGrantedTemplate() {
  const html = renderAuthorAccessGrantedEmailHtml({
    userName: "Анна",
    siteOrigin: "https://audiolad.ru",
  });

  assert.match(html, /кабинет автора/i);
  assert.match(html, /author-dashboard/);

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_KEY,
    templateVersion: AUTHOR_ACCESS_GRANTED_EMAIL_TEMPLATE_VERSION,
    payload: { userName: "Анна" },
  });

  assert.equal(rendered.ok, true);
  if (rendered.ok) {
    assert.equal(rendered.subject, AUTHOR_ACCESS_GRANTED_EMAIL_SUBJECT);
  }
}

async function main() {
  testSharedLayoutFiles();
  await testWelcomeTemplate();
  await testAuthorAccessGrantedTemplate();
  await testRecoveryTemplateStillWorks();
  testSignupSendsWelcome();
  console.log("email-template-unit: ok");
}

main();
