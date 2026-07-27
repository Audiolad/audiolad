#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  decryptPayoutProfilePayload,
  encryptPayoutProfilePayload,
  parsePayoutProfileEncryptedEnvelope,
  PayoutProfileEncryptionError,
  resolvePayoutProfileEncryptionKeyFromEnv,
  serializePayoutProfileEncryptedEnvelope,
} from "../src/lib/author-payout-profiles/encryption.ts";
import {
  maskBankAccount,
  maskInn,
  maskPhone,
} from "../src/lib/author-payout-profiles/masking.ts";
import { isPayoutProfilesEnabled } from "../src/lib/author-payout-profiles/feature.ts";
import {
  canAuthorTransitionPayoutProfileStatus,
  canStaffTransitionPayoutProfileStatus,
  isAuthorEditablePayoutProfileStatus,
  mapPayoutProfileStatusToOnboardingVisual,
} from "../src/lib/author-payout-profiles/status.ts";
import {
  isPayoutProfileVerified,
  resolvePayoutStepCompleteForLegacyOnboarding,
} from "../src/lib/author-payout-profiles/onboarding-complete.ts";
import {
  isValidBankAccount,
  isValidBik,
  isValidOgrnip,
  isValidRussianPersonalInn,
  normalizeAuthorPayoutProfileFormValues,
  validateAuthorPayoutProfileFormValues,
} from "../src/lib/author-payout-profiles/validation.ts";
import { authorAccessAllowsPaidProducts } from "../src/lib/authors/access.ts";
import { PLATFORM_ROLE_PERMISSIONS } from "../src/lib/auth/platform-permissions.ts";
import {
  AUTHOR_COMMERCIAL_SHARE_BPS,
  PLATFORM_COMMERCIAL_SHARE_BPS,
} from "../src/lib/author-commercial/economics.ts";
import {
  buildPayoutProfileVerifiedDedupKey,
  PAYOUT_PROFILE_VERIFIED_MESSAGE_TYPE,
} from "../src/lib/email/operational-deliveries.ts";
import {
  PAYOUT_PROFILE_VERIFIED_EMAIL_SUBJECT,
  renderPayoutProfileVerifiedEmailHtml,
} from "../src/lib/email/templates/payout-profile-verified.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function makeKeyEnv(kid = "v1") {
  return {
    AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID: kid,
  };
}

/** Build a valid 12-digit personal INN. */
function makeValidInn() {
  const base = "5001007322"; // 10 digits
  const digits = base.split("").map(Number);
  const n11 =
    ((7 * digits[0] +
      2 * digits[1] +
      4 * digits[2] +
      10 * digits[3] +
      3 * digits[4] +
      5 * digits[5] +
      9 * digits[6] +
      4 * digits[7] +
      6 * digits[8] +
      8 * digits[9]) %
      11) %
    10;
  const with11 = [...digits, n11];
  const n12 =
    ((3 * with11[0] +
      7 * with11[1] +
      2 * with11[2] +
      4 * with11[3] +
      10 * with11[4] +
      3 * with11[5] +
      5 * with11[6] +
      9 * with11[7] +
      4 * with11[8] +
      6 * with11[9] +
      8 * with11[10]) %
      11) %
    10;
  return `${base}${n11}${n12}`;
}

function makeValidOgrnip() {
  const base = "3045001160001"; // 13 digits placeholder - need 14
  // Construct: 14 digit base + check
  const fourteen = "30450011600014";
  const check = Math.floor(Number(fourteen) % 13) % 10;
  return `${fourteen}${check}`;
}

function testEncryption() {
  const env = makeKeyEnv("kid-a");
  const key = resolvePayoutProfileEncryptionKeyFromEnv(env);
  const plaintext = JSON.stringify({ inn: "123", account: "456" });

  const e1 = encryptPayoutProfilePayload(plaintext, key);
  const e2 = encryptPayoutProfilePayload(plaintext, key);
  assert.notEqual(e1.iv, e2.iv);
  assert.notEqual(e1.ct, e2.ct);
  assert.equal(decryptPayoutProfilePayload(e1, key), plaintext);
  assert.equal(decryptPayoutProfilePayload(e2, key), plaintext);

  const other = resolvePayoutProfileEncryptionKeyFromEnv(makeKeyEnv("kid-a"));
  assert.throws(
    () => decryptPayoutProfilePayload(e1, other),
    (error) =>
      error instanceof PayoutProfileEncryptionError &&
      error.code === "encryption_decrypt_failed",
  );

  const brokenCt = { ...e1, ct: Buffer.from("ffff", "hex").toString("base64") };
  assert.throws(
    () => decryptPayoutProfilePayload(brokenCt, key),
    (error) => error instanceof PayoutProfileEncryptionError,
  );

  const brokenTag = {
    ...e1,
    tag: randomBytes(16).toString("base64"),
  };
  assert.throws(
    () => decryptPayoutProfilePayload(brokenTag, key),
    (error) => error instanceof PayoutProfileEncryptionError,
  );

  assert.throws(
    () =>
      decryptPayoutProfilePayload(
        { ...e1, kid: "unknown" },
        key,
      ),
    (error) =>
      error instanceof PayoutProfileEncryptionError &&
      error.code === "encryption_kid_unknown",
  );

  assert.throws(
    () =>
      decryptPayoutProfilePayload(
        { ...e1, v: 99 },
        key,
      ),
    (error) =>
      error instanceof PayoutProfileEncryptionError &&
      error.code === "encryption_version_unsupported",
  );

  assert.throws(
    () =>
      resolvePayoutProfileEncryptionKeyFromEnv({
        AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY: "not-32-bytes",
        AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID: "v1",
      }),
    (error) =>
      error instanceof PayoutProfileEncryptionError &&
      error.code === "encryption_key_invalid",
  );

  assert.throws(
    () => resolvePayoutProfileEncryptionKeyFromEnv({}),
    (error) =>
      error instanceof PayoutProfileEncryptionError &&
      error.code === "encryption_key_missing",
  );

  assert.throws(
    () =>
      resolvePayoutProfileEncryptionKeyFromEnv({
        AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY: env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY,
      }),
    (error) =>
      error instanceof PayoutProfileEncryptionError &&
      error.code === "encryption_key_id_missing",
  );

  try {
    decryptPayoutProfilePayload(brokenTag, key);
  } catch (error) {
    assert.equal(error.message.includes("123"), false);
    assert.equal(error.message.includes(plaintext), false);
    assert.equal(String(error.message), error.code);
  }

  const serialized = serializePayoutProfileEncryptedEnvelope(e1);
  assert.equal(
    decryptPayoutProfilePayload(
      parsePayoutProfileEncryptedEnvelope(serialized),
      key,
    ),
    plaintext,
  );
}

function testValidation() {
  const inn = makeValidInn();
  assert.equal(isValidRussianPersonalInn(inn), true);
  assert.equal(isValidRussianPersonalInn("123456789012"), false);
  assert.equal(isValidBik("044525225"), true);
  assert.equal(isValidBik("123"), false);
  assert.equal(isValidBankAccount("40817810099910004312"), true);
  assert.equal(isValidBankAccount("123"), false);

  const ogrnip = makeValidOgrnip();
  assert.equal(isValidOgrnip(ogrnip), true);
  assert.equal(isValidOgrnip("123"), false);

  const base = normalizeAuthorPayoutProfileFormValues({
    recipient_type: "self_employed",
    first_name: "Иван",
    last_name: "Иванов",
    inn,
    email: "a@example.com",
    phone: "89991234567",
    bank_account: "40817810099910004312",
    bank_bik: "044525225",
    bank_name: "Тест Банк",
    is_npd_declared: true,
  });

  const submitOk = validateAuthorPayoutProfileFormValues(base, {
    mode: "submit",
  });
  assert.equal(Object.keys(submitOk).length, 0);

  const noNpd = validateAuthorPayoutProfileFormValues(
    { ...base, is_npd_declared: false },
    { mode: "submit" },
  );
  assert.ok(noNpd.is_npd_declared);

  const ie = normalizeAuthorPayoutProfileFormValues({
    recipient_type: "individual_entrepreneur",
    legal_name: "ИП Иванов",
    first_name: "Иван",
    last_name: "Иванов",
    inn,
    ogrnip,
    email: "a@example.com",
    phone: "+79991234567",
    bank_account: "40817810099910004312",
    bank_bik: "044525225",
    bank_name: "Тест Банк",
    bank_correspondent_account: "30101810400000000225",
    registration_address: "г. Москва",
  });
  assert.equal(
    Object.keys(validateAuthorPayoutProfileFormValues(ie, { mode: "submit" }))
      .length,
    0,
  );

  const individual = normalizeAuthorPayoutProfileFormValues({
    recipient_type: "individual",
    first_name: "Иван",
    last_name: "Иванов",
    inn,
    email: "a@example.com",
    phone: "+79991234567",
    bank_account: "40817810099910004312",
    bank_bik: "044525225",
    bank_name: "Тест Банк",
    registration_address: "г. Москва",
  });
  assert.equal(
    Object.keys(
      validateAuthorPayoutProfileFormValues(individual, { mode: "submit" }),
    ).length,
    0,
  );
}

function testStatusMachine() {
  assert.equal(canAuthorTransitionPayoutProfileStatus("draft", "submitted"), true);
  assert.equal(canAuthorTransitionPayoutProfileStatus("draft", "verified"), false);
  assert.equal(canStaffTransitionPayoutProfileStatus("submitted", "verified"), true);
  assert.equal(canStaffTransitionPayoutProfileStatus("draft", "verified"), false);
  assert.equal(isAuthorEditablePayoutProfileStatus("submitted"), false);
  assert.equal(isAuthorEditablePayoutProfileStatus("needs_changes"), true);
  assert.equal(canAuthorTransitionPayoutProfileStatus("verified", "draft"), true);

  const verifiedVisual = mapPayoutProfileStatusToOnboardingVisual({
    status: "verified",
    available: true,
    applicationApproved: true,
  });
  assert.equal(verifiedVisual.state, "completed");

  const draftVisual = mapPayoutProfileStatusToOnboardingVisual({
    status: "draft",
    available: true,
    applicationApproved: true,
  });
  assert.equal(draftVisual.state, "active");
  assert.equal(draftVisual.statusLabel, "Черновик");
}

function testMasksAndGates() {
  assert.equal(maskInn("500100732259"), "********2259");
  assert.match(maskBankAccount("40817810099910004312"), /4312$/);
  assert.match(maskPhone("+79991234567"), /\+7 \*\*\*/);
  assert.equal(authorAccessAllowsPaidProducts("commercial_onboarding"), false);
  assert.equal(authorAccessAllowsPaidProducts("commercial_active"), true);
  assert.equal(
    PLATFORM_ROLE_PERMISSIONS.admin.includes("authors.payout_profiles.review"),
    false,
  );
  assert.equal(
    PLATFORM_ROLE_PERMISSIONS.owner.includes("authors.payout_profiles.review"),
    true,
  );
  assert.equal(AUTHOR_COMMERCIAL_SHARE_BPS, 7000);
  assert.equal(PLATFORM_COMMERCIAL_SHARE_BPS, 3000);

  assert.equal(isPayoutProfilesEnabled({}), false);
  assert.equal(isPayoutProfilesEnabled({ PAYOUT_PROFILES_ENABLED: "true" }), true);

  assert.equal(
    resolvePayoutStepCompleteForLegacyOnboarding({
      accessStatus: "commercial_active",
      payoutProfileStatus: "draft",
    }),
    true,
  );
  assert.equal(
    resolvePayoutStepCompleteForLegacyOnboarding({
      accessStatus: "commercial_onboarding",
      payoutProfileStatus: "draft",
    }),
    false,
  );
  assert.equal(isPayoutProfileVerified("verified"), true);
  assert.equal(isPayoutProfileVerified("draft"), false);

  const legacyVisual = mapPayoutProfileStatusToOnboardingVisual({
    status: "draft",
    available: true,
    applicationApproved: true,
    legacyCommercialActive: true,
  });
  assert.equal(legacyVisual.state, "completed");
}

function testEmailsAndSources() {
  assert.equal(
    PAYOUT_PROFILE_VERIFIED_EMAIL_SUBJECT,
    "Данные для выплат подтверждены",
  );
  const html = renderPayoutProfileVerifiedEmailHtml({
    authorName: "Иван",
    siteOrigin: "https://audiolad.ru",
  });
  assert.match(html, /Иван/);
  assert.doesNotMatch(html, /\d{20}/);
  assert.doesNotMatch(html, /ИНН/);
  assert.match(html, /https:\/\/audiolad\.ru\/author-dashboard/);
  assert.doesNotMatch(html, /платн/i);

  assert.equal(
    buildPayoutProfileVerifiedDedupKey("p1", 3),
    "payout_profile_verified:p1:3",
  );
  assert.equal(
    PAYOUT_PROFILE_VERIFIED_MESSAGE_TYPE,
    "payout_profile_verified",
  );

  const migration = read(
    "supabase/migrations/20260728120000_author_payout_profiles.sql",
  );
  assert.match(migration, /author_payout_profiles/);
  assert.match(migration, /authors\.payout_profiles\.review/);
  assert.match(migration, /role_code <> 'owner'/);
  assert.match(migration, /encrypted_payload/);
  assert.doesNotMatch(migration, /GRANT SELECT ON TABLE public\.author_payout_profiles TO authenticated/);

  const operational = read("src/lib/email/operational-deliveries.ts");
  assert.match(operational, /PAYOUT_PROFILE_MESSAGE_TYPES/);
  assert.match(operational, /application_id: linkedApplicationId/);

  const api = read("src/app/api/author/payout-profile/route.ts");
  assert.match(api, /private, no-store/);
  assert.match(api, /legal_entity/);
  assert.match(api, /feature_not_available/);
  assert.match(api, /isPayoutProfilesEnabled/);
  assert.match(api, /FORBIDDEN_CLIENT_FIELDS/);

  const form = read(
    "src/components/author-dashboard/AuthorPayoutProfileForm.tsx",
  );
  assert.match(form, /data-payout-profile-form/);
  assert.match(form, /ym-hide-content/);
  assert.match(form, /AUTHOR_COMMERCIAL_SHARE_BPS/);
  assert.match(form, /Скоро/);

  const privacy = read("src/lib/analytics/yandex-metrika-privacy.ts");
  assert.match(privacy, /data-payout-profile-form/);

  const encryption = read("src/lib/author-payout-profiles/encryption.ts");
  assert.match(encryption, /import \"server-only\"/);
  assert.match(encryption, /aes-256-gcm/);
}

function main() {
  testEncryption();
  testValidation();
  testStatusMachine();
  testMasksAndGates();
  testEmailsAndSources();
  console.log("author-payout-profiles-unit: ok");
}

main();
