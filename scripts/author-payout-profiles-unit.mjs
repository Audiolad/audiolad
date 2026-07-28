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
  buildAuthorPayoutProfileMasks,
  buildStoredRequisitesPresence,
  formatPayoutRequisitesSummary,
  maskBankAccount,
  maskCardNumber,
  maskInn,
  maskPhone,
  redactPaymentSecretsForBrowser,
  responseLooksLikeItContainsPaymentSecret,
} from "../src/lib/author-payout-profiles/masking.ts";
import { isPayoutProfilesEnabled } from "../src/lib/author-payout-profiles/feature.ts";
import {
  formValuesToSensitivePayload,
  mergeSensitivePayloadPreservingSecrets,
  parseSensitivePayload,
  sensitivePayloadToFormValues,
  serializeSensitivePayload,
} from "../src/lib/author-payout-profiles/payload.ts";
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
  isValidCardNumberLength,
  isValidOgrnip,
  isValidRussianPersonalInn,
  normalizeAuthorPayoutProfileFormValues,
  passesLuhnCheck,
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
import { resolveAuthorStatusView } from "../src/lib/author-dashboard/author-status.ts";

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

function makeValidInn() {
  const base = "5001007322";
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
  const fourteen = "30450011600014";
  const check = Math.floor(Number(fourteen) % 13) % 10;
  return `${fourteen}${check}`;
}

function testEncryption() {
  const env = makeKeyEnv("kid-a");
  const key = resolvePayoutProfileEncryptionKeyFromEnv(env);
  const plaintext = JSON.stringify({
    payout_method: "card",
    card_number: "4111111111111111",
    inn: "123",
  });

  const e1 = encryptPayoutProfilePayload(plaintext, key);
  assert.equal(decryptPayoutProfilePayload(e1, key), plaintext);

  assert.throws(
    () => resolvePayoutProfileEncryptionKeyFromEnv({}),
    (error) =>
      error instanceof PayoutProfileEncryptionError &&
      error.code === "encryption_key_missing",
  );

  try {
    decryptPayoutProfilePayload(
      { ...e1, tag: randomBytes(16).toString("base64") },
      key,
    );
  } catch (error) {
    assert.equal(error.message.includes("4111111111111111"), false);
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

function testValidationByRecipientAndMethod() {
  const inn = makeValidInn();
  assert.equal(isValidRussianPersonalInn(inn), true);
  assert.equal(isValidBik("044525225"), true);
  assert.equal(isValidBankAccount("40817810099910004312"), true);
  assert.equal(isValidCardNumberLength("4111111111111111"), true);
  assert.equal(passesLuhnCheck("4111111111111111"), true);
  assert.equal(isValidOgrnip(makeValidOgrnip()), true);

  const selfEmployedCard = normalizeAuthorPayoutProfileFormValues({
    recipient_type: "self_employed",
    payout_method: "card",
    first_name: "Иван",
    last_name: "Иванов",
    inn,
    email: "a@example.com",
    phone: "89991234567",
    bank_name: "Тест Банк",
    card_number: "4111 1111 1111 1111",
    is_npd_declared: true,
    details_confirmed: true,
  });
  assert.equal(
    Object.keys(
      validateAuthorPayoutProfileFormValues(selfEmployedCard, {
        mode: "submit",
      }),
    ).length,
    0,
  );

  const ieSbp = normalizeAuthorPayoutProfileFormValues({
    recipient_type: "individual_entrepreneur",
    payout_method: "sbp",
    first_name: "Иван",
    last_name: "Иванов",
    inn,
    email: "a@example.com",
    phone: "+79991234567",
    bank_name: "Тест Банк",
    details_confirmed: true,
  });
  assert.equal(
    Object.keys(validateAuthorPayoutProfileFormValues(ieSbp, { mode: "submit" }))
      .length,
    0,
  );

  const individualAccount = normalizeAuthorPayoutProfileFormValues({
    recipient_type: "individual",
    payout_method: "bank_account",
    first_name: "Иван",
    last_name: "Иванов",
    email: "a@example.com",
    phone: "+79991234567",
    bank_name: "Тест Банк",
    bank_bik: "044525225",
    bank_account: "40817810099910004312",
    details_confirmed: true,
  });
  assert.equal(
    Object.keys(
      validateAuthorPayoutProfileFormValues(individualAccount, {
        mode: "submit",
      }),
    ).length,
    0,
  );

  // Individual must NOT require INN.
  assert.equal(
    validateAuthorPayoutProfileFormValues(
      { ...individualAccount, inn: "" },
      { mode: "submit" },
    ).inn,
    undefined,
  );

  // Address / OGRNIP not required.
  const ieNoExtras = normalizeAuthorPayoutProfileFormValues({
    recipient_type: "individual_entrepreneur",
    payout_method: "bank_account",
    first_name: "Иван",
    last_name: "Иванов",
    inn,
    email: "a@example.com",
    phone: "+79991234567",
    bank_name: "Тест Банк",
    bank_bik: "044525225",
    bank_account: "40817810099910004312",
    details_confirmed: true,
  });
  assert.equal(
    Object.keys(
      validateAuthorPayoutProfileFormValues(ieNoExtras, { mode: "submit" }),
    ).length,
    0,
  );

  const noConfirm = validateAuthorPayoutProfileFormValues(
    { ...selfEmployedCard, details_confirmed: false },
    { mode: "submit" },
  );
  assert.ok(noConfirm.details_confirmed);

  const unknownMethod = validateAuthorPayoutProfileFormValues(
    normalizeAuthorPayoutProfileFormValues({
      ...selfEmployedCard,
      payout_method: "crypto",
    }),
    { mode: "submit" },
  );
  assert.ok(unknownMethod.payout_method);
}

function testPayloadAndMasks() {
  const values = normalizeAuthorPayoutProfileFormValues({
    recipient_type: "self_employed",
    payout_method: "card",
    first_name: "Иван",
    last_name: "Иванов",
    inn: makeValidInn(),
    email: "a@example.com",
    phone: "+79991234567",
    bank_name: "Тест Банк",
    card_number: "4111111111111111",
    is_npd_declared: true,
    details_confirmed: true,
  });
  const payload = formValuesToSensitivePayload(values, "self_employed");
  assert.equal(payload.card_number, "4111111111111111");
  assert.equal(payload.bank_account, null);
  assert.equal(payload.registration_address, null);

  const masks = buildAuthorPayoutProfileMasks(payload);
  assert.equal(masks.account_last4, "1111");
  assert.equal(masks.payout_method, "card");
  assert.equal(masks.bank_display_name, "Тест Банк");
  assert.match(maskCardNumber(payload.card_number), /1111/);
  assert.match(
    formatPayoutRequisitesSummary(masks),
    /Карта •••• 1111/,
  );

  const roundTrip = parseSensitivePayload(serializeSensitivePayload(payload));
  assert.equal(roundTrip.payout_method, "card");
  assert.equal(roundTrip.card_number, "4111111111111111");

  // Legacy bank-only envelope without payout_method.
  const legacy = parseSensitivePayload(
    JSON.stringify({
      first_name: "Иван",
      last_name: "Иванов",
      inn: makeValidInn(),
      email: "a@example.com",
      phone: "+79991234567",
      bank_account: "40817810099910004312",
      bank_bik: "044525225",
      bank_name: "Банк",
    }),
  );
  assert.equal(legacy.payout_method, "bank_account");
}

function testStatusMachine() {
  assert.equal(canAuthorTransitionPayoutProfileStatus("draft", "submitted"), true);
  assert.equal(canStaffTransitionPayoutProfileStatus("submitted", "verified"), true);
  assert.equal(isAuthorEditablePayoutProfileStatus("submitted"), false);

  const submittedVisual = mapPayoutProfileStatusToOnboardingVisual({
    status: "submitted",
    available: true,
    applicationApproved: true,
  });
  assert.equal(submittedVisual.state, "completed");
  assert.equal(submittedVisual.statusLabel, "Отправлено");

  const emptyDraftVisual = mapPayoutProfileStatusToOnboardingVisual({
    status: "draft",
    available: true,
    applicationApproved: true,
    hasStoredRequisites: false,
  });
  assert.equal(emptyDraftVisual.state, "active");
  assert.equal(emptyDraftVisual.statusLabel, "Не заполнено");

  const partialDraftVisual = mapPayoutProfileStatusToOnboardingVisual({
    status: "draft",
    available: true,
    applicationApproved: true,
    hasStoredRequisites: true,
  });
  assert.equal(partialDraftVisual.state, "active");
  assert.equal(partialDraftVisual.statusLabel, "Черновик");

  const missingVisual = mapPayoutProfileStatusToOnboardingVisual({
    status: null,
    available: true,
    applicationApproved: true,
    legacyCommercialActive: true,
  });
  assert.equal(missingVisual.state, "active");
  assert.equal(missingVisual.statusLabel, "Не заполнено");
  assert.notEqual(missingVisual.state, "completed");

  const verifiedVisual = mapPayoutProfileStatusToOnboardingVisual({
    status: "verified",
    available: true,
    applicationApproved: true,
  });
  assert.equal(verifiedVisual.state, "completed");
  assert.equal(verifiedVisual.statusLabel, "Заполнено");

  const needsChangesVisual = mapPayoutProfileStatusToOnboardingVisual({
    status: "needs_changes",
    available: true,
    applicationApproved: true,
  });
  assert.equal(needsChangesVisual.statusLabel, "Нужно исправить");

  assert.equal(
    resolvePayoutStepCompleteForLegacyOnboarding({
      accessStatus: "commercial_onboarding",
      payoutProfileStatus: "submitted",
    }),
    true,
  );
  assert.equal(
    resolvePayoutStepCompleteForLegacyOnboarding({
      accessStatus: "commercial_active",
      payoutProfileStatus: null,
    }),
    false,
  );
  assert.equal(
    resolvePayoutStepCompleteForLegacyOnboarding({
      accessStatus: "commercial_active",
      payoutProfileStatus: "draft",
    }),
    false,
  );
  assert.equal(isPayoutProfileVerified("submitted"), false);
  assert.equal(isPayoutProfileVerified("verified"), true);

  const statusView = resolveAuthorStatusView({
    accessStatus: "commercial_active",
    applicationStatus: "approved",
    termsAccepted: true,
    publishedTermsAvailable: true,
    payoutProfileStatus: "submitted",
    role: "owner",
    authorSlug: "demo",
  });
  assert.equal(statusView.kind, "commercial_active");
  assert.equal(statusView.cta.label, "Создать платный продукт");
  assert.equal(statusView.paidProductsLocked, false);
  assert.equal(statusView.optionalPayout?.cta.label, "Реквизиты отправлены");
  assert.equal(statusView.optionalPayout?.cta.disabled, true);

  const needsChangesView = resolveAuthorStatusView({
    accessStatus: "commercial_active",
    applicationStatus: "approved",
    termsAccepted: true,
    publishedTermsAvailable: true,
    payoutProfileStatus: "needs_changes",
    role: "owner",
    authorSlug: "demo",
  });
  assert.equal(needsChangesView.kind, "commercial_active");
  assert.equal(needsChangesView.paidProductsLocked, false);
  assert.equal(authorAccessAllowsPaidProducts("commercial_active"), true);
}

function testMasksAndGates() {
  assert.equal(maskInn("500100732259"), "********2259");
  assert.match(maskBankAccount("40817810099910004312"), /4312$/);
  assert.match(maskPhone("+79991234567"), /\+7 \*\*\*/);
  assert.equal(authorAccessAllowsPaidProducts("commercial_onboarding"), false);
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
}

function testBrowserHardening() {
  const syntheticCard = "4111111111111111";
  const syntheticAccount = "40817810099910004312";
  const syntheticCorr = "30101810400000000225";

  const payload = {
    payout_method: "card",
    legal_name: null,
    first_name: "Иван",
    last_name: "Иванов",
    middle_name: null,
    inn: makeValidInn(),
    ogrnip: null,
    email: "a@example.com",
    phone: "+79991234567",
    card_number: syntheticCard,
    bank_account: syntheticAccount,
    bank_bik: "044525225",
    bank_name: "Тест Банк",
    bank_correspondent_account: syntheticCorr,
    registration_address: null,
    tax_residency_note: null,
  };

  const draftRedacted = redactPaymentSecretsForBrowser(payload);
  assert.equal(draftRedacted.card_number, null);
  assert.equal(draftRedacted.bank_account, null);
  assert.equal(draftRedacted.bank_correspondent_account, null);
  assert.equal(draftRedacted.first_name, "Иван");
  assert.equal(draftRedacted.bank_bik, "044525225");

  const draftJson = JSON.stringify({
    status: "draft",
    fields: draftRedacted,
    requisites: buildStoredRequisitesPresence({
      payout_method: "card",
      account_last4: "1111",
    }),
  });
  assert.equal(
    responseLooksLikeItContainsPaymentSecret(draftJson, [
      syntheticCard,
      syntheticAccount,
      syntheticCorr,
    ]),
    false,
  );
  assert.match(draftJson, /•••• 1111|Карта •••• 1111/);

  const submittedJson = JSON.stringify({
    status: "submitted",
    fields: null,
    account_last4: "1111",
    requisites: buildStoredRequisitesPresence({
      payout_method: "card",
      account_last4: "1111",
    }),
  });
  assert.equal(
    responseLooksLikeItContainsPaymentSecret(submittedJson, [
      syntheticCard,
      syntheticAccount,
    ]),
    false,
  );

  const presence = buildStoredRequisitesPresence({
    payout_method: "bank_account",
    account_last4: "4312",
  });
  assert.equal(presence.account.present, true);
  assert.match(presence.account.masked, /4312/);
  assert.equal(presence.card.present, false);

  const formValues = sensitivePayloadToFormValues("self_employed", payload);
  assert.equal(formValues.card_number, "");
  assert.equal(formValues.bank_account, "");
  assert.equal(formValues.bank_correspondent_account, "");

  const emptyPatch = mergeSensitivePayloadPreservingSecrets(
    {
      ...payload,
      card_number: null,
      first_name: "Пётр",
    },
    payload,
  );
  assert.equal(emptyPatch.card_number, syntheticCard);
  assert.equal(emptyPatch.first_name, "Пётр");

  const replacePatch = mergeSensitivePayloadPreservingSecrets(
    {
      ...payload,
      card_number: "5555555555554444",
    },
    payload,
  );
  assert.equal(replacePatch.card_number, "5555555555554444");

  const key = makeKeyEnv("payout-v1");
  const resolved = resolvePayoutProfileEncryptionKeyFromEnv(key);
  const encrypted = encryptPayoutProfilePayload(
    serializeSensitivePayload(replacePatch),
    resolved,
  );
  const envelope = serializePayoutProfileEncryptedEnvelope(encrypted);
  assert.doesNotMatch(envelope, /5555555555554444/);
  assert.doesNotMatch(envelope, new RegExp(syntheticCard));
  const decrypted = parseSensitivePayload(
    decryptPayoutProfilePayload(
      parsePayoutProfileEncryptedEnvelope(envelope),
      resolved,
    ),
  );
  assert.equal(decrypted.card_number, "5555555555554444");

  const serviceSrc = read("src/lib/author-payout-profiles/service.ts");
  assert.match(serviceSrc, /redactPaymentSecretsForBrowser/);
  assert.match(serviceSrc, /buildStoredRequisitesPresence/);
  assert.doesNotMatch(
    serviceSrc,
    /fields,\s*\n\s*can_edit/,
  );

  const adminDetailHasRedact = /getAdminPayoutProfileDetail[\s\S]*redactPaymentSecretsForBrowser/.test(
    serviceSrc,
  );
  assert.equal(adminDetailHasRedact, true);

  const formSrc = read(
    "src/components/author-dashboard/AuthorPayoutProfileForm.tsx",
  );
  assert.match(formSrc, /autoComplete="new-password"/);
  assert.match(formSrc, /Изменить реквизиты/);

  const privacy = read("src/lib/analytics/yandex-metrika-privacy.ts");
  assert.match(privacy, /data-payout-profile-form/);
  assert.doesNotMatch(privacy, new RegExp(syntheticCard));
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
  assert.doesNotMatch(html, /\d{20}/);
  assert.doesNotMatch(html, /4111111111111111/);

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
  assert.match(migration, /encrypted_payload/);
  assert.doesNotMatch(
    migration,
    /GRANT SELECT ON TABLE public\.author_payout_profiles TO authenticated/,
  );

  const additive = read(
    "supabase/migrations/20260728150000_author_payout_profiles_method_display.sql",
  );
  assert.match(additive, /payout_method/);
  assert.match(additive, /bank_display_name/);
  assert.doesNotMatch(additive, /DROP TABLE/i);

  const api = read("src/app/api/author/payout-profile/route.ts");
  assert.match(api, /private, no-store/);
  assert.match(api, /feature_not_available/);
  assert.doesNotMatch(api, /sendPayoutProfileAdminSubmittedEmail/);

  const form = read(
    "src/components/author-dashboard/AuthorPayoutProfileForm.tsx",
  );
  assert.match(form, /data-payout-profile-form/);
  assert.match(form, /ym-hide-content/);
  assert.match(form, /Сохранить данные/);
  assert.match(form, /Банковская карта/);
  assert.match(form, /СБП/);
  assert.doesNotMatch(form, /ОГРНИП/);
  assert.doesNotMatch(form, /паспорт/i);
  assert.doesNotMatch(form, /СНИЛС/);
  assert.doesNotMatch(form, /Адрес регистрации/);

  const page = read(
    "src/app/author-dashboard/commercial/payout-details/page.tsx",
  );
  assert.match(
    page,
    /Заполнение данных для выплат временно недоступно/,
  );

  const privacy = read("src/lib/analytics/yandex-metrika-privacy.ts");
  assert.match(privacy, /data-payout-profile-form/);

  const encryption = read("src/lib/author-payout-profiles/encryption.ts");
  assert.match(encryption, /import \"server-only\"/);
  assert.match(encryption, /aes-256-gcm/);
}

function main() {
  testEncryption();
  testValidationByRecipientAndMethod();
  testPayloadAndMasks();
  testStatusMachine();
  testMasksAndGates();
  testBrowserHardening();
  testEmailsAndSources();
  console.log("author-payout-profiles-unit: ok");
}

main();
