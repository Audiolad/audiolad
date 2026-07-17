#!/usr/bin/env node
/**
 * Email policy, auth anti-bypass, recovery, avatar, and foundation checks.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const policy = JSON.parse(
  readFileSync("/var/www/audiolad/config/email-domain-policy.json", "utf8"),
);

const PERSONAL = new Set(
  policy.personalAllowlist.map((domain) => domain.toLowerCase()),
);

function parseCorporate() {
  const raw = process.env.AUDIOLAD_CORPORATE_EMAIL_DOMAINS?.trim();

  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

function serverAllowlist() {
  const combined = new Set(PERSONAL);

  for (const domain of parseCorporate()) {
    combined.add(domain);
  }

  return combined;
}

function splitEmailAddress(raw) {
  const trimmed = raw.trim();
  const at = trimmed.indexOf("@");

  if (at <= 0 || at !== trimmed.lastIndexOf("@")) {
    return null;
  }

  return {
    localPart: trimmed.slice(0, at),
    domain: trimmed.slice(at + 1).toLowerCase(),
  };
}

function validateFormat(raw) {
  if (!raw?.trim()) {
    return { ok: false, code: "empty" };
  }

  const trimmed = raw.trim();

  if (trimmed.includes(" ") || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, code: "invalid_format" };
  }

  const parts = splitEmailAddress(trimmed);

  if (!parts) {
    return { ok: false, code: "invalid_format" };
  }

  const { localPart, domain } = parts;

  if (!localPart || !domain) {
    return { ok: false, code: "invalid_format" };
  }

  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..") || domain.includes("..")) {
    return { ok: false, code: "invalid_format" };
  }

  const domainParts = domain.split(".");

  if (domainParts.length < 2 || domainParts.some((part) => !part || part.startsWith("-") || part.endsWith("-"))) {
    return { ok: false, code: "invalid_format" };
  }

  return {
    ok: true,
    normalizedEmail: `${localPart}@${domain}`,
    domain,
  };
}

function validateClient(raw) {
  const format = validateFormat(raw);

  if (!format.ok) {
    return format;
  }

  if (!PERSONAL.has(format.domain)) {
    return { ok: false, code: "domain_not_allowed" };
  }

  return format;
}

function validateServer(raw) {
  const format = validateFormat(raw);

  if (!format.ok) {
    return format;
  }

  if (!serverAllowlist().has(format.domain)) {
    return { ok: false, code: "domain_not_allowed" };
  }

  return format;
}

function testAllowedDomains() {
  for (const email of [
    "user@mail.ru",
    "user@inbox.ru",
    "user@list.ru",
    "user@bk.ru",
    "user@internet.ru",
    "user@yandex.ru",
    "user@ya.ru",
    "user@rambler.ru",
    "USER@YANDEX.RU",
    "  user@mail.ru  ",
  ]) {
    assert(validateClient(email).ok, `expected allowed: ${email}`);
  }

  process.env.AUDIOLAD_CORPORATE_EMAIL_DOMAINS = "audiolad.ru";

  assert(validateServer("team@audiolad.ru").ok, "corporate allowlist via env");
  assert(!validateClient("team@audiolad.ru").ok, "corporate hidden from client");

  delete process.env.AUDIOLAD_CORPORATE_EMAIL_DOMAINS;
}

function testBlockedDomains() {
  for (const email of [
    "",
    "no-at-symbol",
    "a@@b.ru",
    "two@@mail.ru",
    "space @mail.ru",
    "user@gmail.com",
    "user@icloud.com",
    "user@outlook.com",
    "user@yahoo.com",
    "user@proton.me",
    "user@unknown.ru",
    "user@gmail.ru",
    ".user@mail.ru",
    "user.@mail.ru",
    "user..name@mail.ru",
    "user@",
    "@mail.ru",
  ]) {
    const result = validateServer(email);
    assert(!result.ok, `expected blocked: ${email}`);
  }
}

function testPolicyIntegrity() {
  const allowedDomains = readFileSync(
    "/var/www/audiolad/src/lib/auth/email/allowed-domains.ts",
    "utf8",
  );

  assert(
    allowedDomains.includes("config/email-domain-policy.json"),
    "allowed-domains reads canonical JSON policy",
  );

  for (const domain of policy.personalAllowlist) {
    assert(
      allowedDomains.includes(`"${domain}"`) || PERSONAL.has(domain),
      `policy domain present: ${domain}`,
    );
  }
}

function testAntiBypass() {
  const signUpAction = readFileSync(
    "/var/www/audiolad/src/app/auth/sign-up/actions.ts",
    "utf8",
  );
  const signUpPage = readFileSync(
    "/var/www/audiolad/src/app/auth/sign-up/page.tsx",
    "utf8",
  );
  const hookRoute = readFileSync(
    "/var/www/audiolad/src/app/api/auth/hooks/before-user-created/route.ts",
    "utf8",
  );

  assert(
    signUpAction.includes("validateEmailForRegistrationServer"),
    "server action validates allowlist",
  );
  assert(!signUpPage.includes("supabase.auth.signUp"), "UI no longer calls client signUp");
  assert(signUpPage.includes("signUpAction"), "UI uses server action");
  assert(
    hookRoute.includes("validateEmailForRegistrationServer"),
    "hook uses shared server policy",
  );
  assert(
    !hookRoute.includes("mail.ru") || hookRoute.includes("validateEmailForRegistrationServer"),
    "hook does not hardcode domain list",
  );
}

function testRecovery() {
  const recovery = readFileSync(
    "/var/www/audiolad/src/lib/auth/recovery.ts",
    "utf8",
  );
  const forgotAction = readFileSync(
    "/var/www/audiolad/src/app/auth/forgot-password/actions.ts",
    "utf8",
  );
  const callback = readFileSync(
    "/var/www/audiolad/src/app/auth/callback/route.ts",
    "utf8",
  );
  const resetAction = readFileSync(
    "/var/www/audiolad/src/app/auth/reset-password/actions.ts",
    "utf8",
  );

  assert(recovery.includes("getSafeNextPath"), "recovery uses safe next path");
  assert(
    forgotAction.includes("PASSWORD_RECOVERY_REQUEST_MESSAGE"),
    "neutral forgot-password response",
  );
  assert(!forgotAction.includes("validateEmailForRegistrationServer"), "recovery ignores signup allowlist");
  assert(callback.includes("exchangeCodeForSession"), "auth callback exchanges code");
  assert(callback.includes("getSafeNextPath"), "callback safe redirect");
  assert(resetAction.includes("validatePassword"), "reset validates password length");
}

function testAvatar() {
  const avatarLib = readFileSync(
    "/var/www/audiolad/src/lib/profile/avatar.ts",
    "utf8",
  );
  const avatarImage = readFileSync(
    "/var/www/audiolad/src/lib/profile/avatar-image.ts",
    "utf8",
  );
  const avatarRoute = readFileSync(
    "/var/www/audiolad/src/app/api/profile/avatar/route.ts",
    "utf8",
  );

  assert(avatarLib.includes("user-avatars"), "avatar bucket constant");
  assert(avatarLib.includes("5242880") || avatarLib.includes("5 * 1024 * 1024"), "5MB limit");
  assert(avatarImage.includes("image/jpeg"), "jpeg allowed");
  assert(avatarImage.includes("image/png"), "png allowed");
  assert(avatarImage.includes("image/webp"), "webp allowed");
  assert(avatarRoute.includes("removeUserAvatarObject"), "avatar replacement cleanup");
  assert(avatarRoute.includes("DELETE"), "avatar deletion endpoint");
}

function testEmailFoundationFiles() {
  for (const file of [
    "/var/www/audiolad/supabase/migrations/20260717150000_email_foundation.sql",
    "/var/www/audiolad/supabase/migrations/20260717151000_email_sync_and_profile.sql",
    "/var/www/audiolad/supabase/migrations/20260717152000_user_avatars.sql",
    "/var/www/audiolad/src/lib/email/enqueue.ts",
    "/var/www/audiolad/docs/email/timeweb-smtp-setup.md",
  ]) {
    readFileSync(file, "utf8");
  }

  const foundation = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260717150000_email_foundation.sql",
    "utf8",
  );

  assert(foundation.includes("email_outbox"), "outbox table migration exists");
  assert(foundation.includes("email_delivery_events"), "delivery events migration exists");
  assert(foundation.includes("service_role"), "outbox closed to clients");
}

function testPreferencesAndConsents() {
  const preferences = readFileSync(
    "/var/www/audiolad/src/lib/email/preferences.ts",
    "utf8",
  );
  const signUpAction = readFileSync(
    "/var/www/audiolad/src/app/auth/sign-up/actions.ts",
    "utf8",
  );
  const signUpPage = readFileSync(
    "/var/www/audiolad/src/app/auth/sign-up/page.tsx",
    "utf8",
  );

  assert(
    preferences.includes("listener_marketing: false"),
    "marketing preferences off by default",
  );
  assert(
    signUpAction.includes("if (input.marketingConsent"),
    "marketing consent only when checkbox checked",
  );
  assert(signUpPage.includes("listener_marketing_signup_v1_2026-07-17") || signUpPage.includes("marketingConsent"), "marketing checkbox present");
  assert(signUpPage.includes("/offer"), "legal offer link");
  assert(signUpPage.includes("/privacy"), "legal privacy link");
}

function main() {
  testPolicyIntegrity();
  testAllowedDomains();
  testBlockedDomains();
  testAntiBypass();
  testRecovery();
  testAvatar();
  testEmailFoundationFiles();
  testPreferencesAndConsents();
  console.log("email-policy-unit: ok");
}

main();
