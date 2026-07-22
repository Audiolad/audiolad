#!/usr/bin/env node
/**
 * Brand email template layout + welcome email checks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  WELCOME_EMAIL_SUBJECT,
  WELCOME_EMAIL_TEMPLATE_KEY,
  WELCOME_EMAIL_TEMPLATE_VERSION,
  renderWelcomeEmailHtml,
  renderWelcomeEmailText,
} from "../src/lib/email/templates/welcome";

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
  const html = renderWelcomeEmailHtml({ userName: "Анна", siteOrigin: "https://audiolad.ru" });
  const text = renderWelcomeEmailText({ userName: "Анна", siteOrigin: "https://audiolad.ru" });

  assert.match(html, /Добро пожаловать в АудиоЛад!/);
  assert.match(html, /Здравствуйте, <strong>Анна<\/strong>!/);
  assert.match(html, /Открыть АудиоЛад/);
  assert.match(html, /href="https:\/\/audiolad\.ru"/);
  assert.match(html, /href="https:\/\/audiolad\.ru\/catalog"/);
  assert.match(html, /href="https:\/\/audiolad\.ru\/my-practices"/);
  assert.match(html, /href="https:\/\/audiolad\.ru\/playlists"/);
  assert.match(html, /href="https:\/\/audiolad\.ru\/authors"/);
  assert.match(html, /Полезные ссылки/);
  assert.match(html, /Команда АудиоЛад/);
  assert.match(html, /зарегистрировались в АудиоЛад/);
  assert.doesNotMatch(html, /https:\/\/audiolad\.ru\/https:\/\//);

  assert.match(text, /Здравствуйте, Анна!/);
  assert.match(text, /Каталог: https:\/\/audiolad\.ru\/catalog/);

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: WELCOME_EMAIL_TEMPLATE_KEY,
    templateVersion: WELCOME_EMAIL_TEMPLATE_VERSION,
    payload: { userName: "Анна" },
  });

  assert.equal(rendered.ok, true);
  if (rendered.ok) {
    assert.equal(rendered.subject, WELCOME_EMAIL_SUBJECT);
    assert.match(rendered.html, /email-card-wrap/);
  }
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
