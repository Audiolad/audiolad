#!/usr/bin/env node
/**
 * Regression tests for sign-up form labels, hints, and sign-in password label.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EMAIL_FIELD_HINT,
  PASSWORD_MIN_LENGTH,
  SIGNUP_EMAIL_LABEL,
  SIGNUP_PASSWORD_HINT,
  SIGNUP_PASSWORD_LABEL,
} from "../src/lib/auth/email/messages.ts";
import { evaluateSignUpClientFormState } from "../src/lib/auth/sign-up-client-form.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments) {
  return readFileSync(path.join(REPO_ROOT, ...segments), "utf8");
}

function testCentralizedCopy() {
  assert.equal(SIGNUP_EMAIL_LABEL, "Email");
  assert.equal(SIGNUP_PASSWORD_LABEL, "Придумайте пароль");
  assert.equal(SIGNUP_PASSWORD_HINT, "Минимум 8 символов.");
  assert.equal(
    EMAIL_FIELD_HINT,
    "Для регистрации используйте Яндекс Почту или Mail.ru.",
  );
  assert.equal(PASSWORD_MIN_LENGTH, 8);
}

function testSignUpPageUsesCentralizedCopy() {
  const signUpPage = readRepoFile("src", "app", "auth", "sign-up", "page.tsx");

  assert.match(signUpPage, /SIGNUP_EMAIL_LABEL/);
  assert.match(signUpPage, /SIGNUP_PASSWORD_LABEL/);
  assert.match(signUpPage, /SIGNUP_PASSWORD_HINT/);
  assert.match(signUpPage, /EMAIL_FIELD_HINT/);
  assert.match(signUpPage, /id="sign-up-password-hint"/);
  assert.match(signUpPage, /id="sign-up-email-hint"/);
  assert.doesNotMatch(signUpPage, /<span[^>]*>Пароль<\/span>/);
  assert.doesNotMatch(signUpPage, /Электронная почта/);
}

function testSignInPageKeepsPasswordLabel() {
  const signInPage = readRepoFile("src", "app", "auth", "sign-in", "page.tsx");

  assert.match(signInPage, /<span className="text-sm font-medium">Пароль<\/span>/);
  assert.doesNotMatch(signInPage, /Придумайте пароль/);
}

function testPasswordValidationLength() {
  const base = {
    firstName: "Иван",
    lastName: "Петров",
    email: "new-user@yandex.ru",
    legalConsent: true,
  };

  const short = evaluateSignUpClientFormState({
    ...base,
    password: "1234567",
  });
  assert.equal(short.isSubmitReady, false, "password shorter than 8 is rejected");
  assert.equal(short.passwordFieldInvalid, true, "short password shows error");

  const valid = evaluateSignUpClientFormState({
    ...base,
    password: "12345678",
  });
  assert.equal(valid.isSubmitReady, true, "password with 8 chars is accepted");
  assert.equal(valid.passwordFieldInvalid, false, "valid password has no error");
}

function testPasswordToggleMarkupStillPresentOnSignUpPage() {
  const signUpPage = readRepoFile("src", "app", "auth", "sign-up", "page.tsx");

  assert.match(signUpPage, /PasswordInput/);
  assert.match(signUpPage, /autoComplete="new-password"/);
}

function testDiagnosticsInlineRegistrationForm() {
  const saveCta = readRepoFile(
    "src",
    "components",
    "personal-materials",
    "guest",
    "PersonalMaterialSaveCta.tsx",
  );

  assert.match(saveCta, /SIGNUP_PASSWORD_LABEL/);
  assert.match(saveCta, /SIGNUP_PASSWORD_HINT/);
  assert.match(saveCta, /EMAIL_FIELD_HINT/);
  assert.match(saveCta, /mode === "register"/);
  assert.match(saveCta, /autoComplete="new-password"/);
}

function testPromoUsesSharedSignUpRoute() {
  const promoPrompts = readRepoFile(
    "src",
    "components",
    "promo",
    "PromoPlaybackPrompts.tsx",
  );

  assert.match(promoPrompts, /buildPromoSignUpHref/);
}

function run() {
  testCentralizedCopy();
  testSignUpPageUsesCentralizedCopy();
  testSignInPageKeepsPasswordLabel();
  testPasswordValidationLength();
  testPasswordToggleMarkupStillPresentOnSignUpPage();
  testDiagnosticsInlineRegistrationForm();
  testPromoUsesSharedSignUpRoute();
  console.log("sign-up-form-copy-unit: ok");
}

run();
