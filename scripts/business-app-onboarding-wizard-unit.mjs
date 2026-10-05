#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_ONBOARDING_ATMOSPHERES,
  BUSINESS_ONBOARDING_PREVIEW_NO_AUDIO_NOTE,
  BUSINESS_ONBOARDING_RIGHTS_SAFE_DISCLAIMER,
  BUSINESS_ONBOARDING_STEPS,
  BUSINESS_ONBOARDING_TYPES,
  buildBusinessOnboardingPreviewSummary,
  businessOnboardingStepIndex,
  canAdvanceBusinessOnboardingStep,
  getBusinessOnboardingAtmosphere,
  getBusinessOnboardingType,
  isBusinessOnboardingStep,
  nextBusinessOnboardingStep,
  prevBusinessOnboardingStep,
  suggestBusinessOnboardingNames,
  validateBusinessOnboardingConfirm,
} from "../src/lib/business-app/onboarding-wizard.ts";
import {
  BUSINESS_PUBLIC_PATH_REWRITES,
  BUSINESS_SITE_PATH,
  resolveBusinessInternalPath,
} from "../src/lib/business-app/host.ts";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy.ts";
import { BUSINESS_HOSTNAME } from "../src/lib/business-app/host.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.deepEqual(
  [...BUSINESS_ONBOARDING_STEPS],
  ["type", "atmosphere", "preview", "confirm", "done"],
);
assert.equal(isBusinessOnboardingStep("preview"), true);
assert.equal(isBusinessOnboardingStep("billing"), false);
assert.equal(BUSINESS_ONBOARDING_TYPES.length >= 4, true);
assert.equal(BUSINESS_ONBOARDING_ATMOSPHERES.length >= 3, true);

assert.equal(nextBusinessOnboardingStep("type"), "atmosphere");
assert.equal(nextBusinessOnboardingStep("confirm"), "done");
assert.equal(nextBusinessOnboardingStep("done"), null);
assert.equal(prevBusinessOnboardingStep("atmosphere"), "type");
assert.equal(prevBusinessOnboardingStep("type"), null);
assert.equal(businessOnboardingStepIndex("type"), 1);
assert.equal(businessOnboardingStepIndex("done"), 5);

assert.equal(
  canAdvanceBusinessOnboardingStep("type", { typeId: null, atmosphereId: null }),
  false,
);
assert.equal(
  canAdvanceBusinessOnboardingStep("type", {
    typeId: "beauty",
    atmosphereId: null,
  }),
  true,
);
assert.equal(
  canAdvanceBusinessOnboardingStep("atmosphere", {
    typeId: "beauty",
    atmosphereId: null,
  }),
  false,
);
assert.equal(
  canAdvanceBusinessOnboardingStep("atmosphere", {
    typeId: "beauty",
    atmosphereId: "calm_premium",
  }),
  true,
);

const beauty = getBusinessOnboardingType("beauty");
assert.ok(beauty);
assert.equal(beauty.category, "Салон красоты");
assert.equal(getBusinessOnboardingAtmosphere("calm_premium")?.energyHint, "calm");

const names = suggestBusinessOnboardingNames("cafe");
assert.equal(names.businessCategory, "Кафе");
assert.ok(names.organizationName.length > 0);

const preview = buildBusinessOnboardingPreviewSummary({
  typeId: "spa",
  atmosphereId: "modern_soft",
});
assert.equal(preview.typeLabel, "SPA / wellness");
assert.match(preview.atmosphereLabel, /Современный/);
assert.equal(preview.rightsSafeDisclaimer, BUSINESS_ONBOARDING_RIGHTS_SAFE_DISCLAIMER);
assert.equal(preview.noAudioNote, BUSINESS_ONBOARDING_PREVIEW_NO_AUDIO_NOTE);
assert.match(preview.rightsSafeDisclaimer, /уточняется/i);
assert.match(preview.rightsSafeDisclaimer, /не утверждаем/i);
assert.match(preview.noAudioNote, /Case A/);

const ok = validateBusinessOnboardingConfirm({
  organizationName: " Пилот ",
  locationName: " Точка 1 ",
  businessCategory: "Салон красоты",
});
assert.equal(ok.ok, true);
if (ok.ok) {
  assert.equal(ok.value.organizationName, "Пилот");
  assert.equal(ok.value.countryCode, "RU");
  assert.equal(ok.value.timezone, "Europe/Moscow");
}

const bad = validateBusinessOnboardingConfirm({
  organizationName: "",
  locationName: "x",
  businessCategory: "y",
});
assert.equal(bad.ok, false);

assert.equal(
  resolveBusinessInternalPath("/onboarding"),
  `${BUSINESS_SITE_PATH}/onboarding`,
);
assert.equal(
  BUSINESS_PUBLIC_PATH_REWRITES["/onboarding"],
  `${BUSINESS_SITE_PATH}/onboarding`,
);
const rewrite = resolveBusinessProxyAction(BUSINESS_HOSTNAME, "/onboarding");
assert.equal(rewrite.action, "rewrite_business_app");
assert.equal(rewrite.pathname, `${BUSINESS_SITE_PATH}/onboarding`);

assert.equal(
  existsSync(join(repoRoot, "src/app/business-app/onboarding/page.tsx")),
  true,
);
assert.equal(
  existsSync(
    join(repoRoot, "src/components/business-app/BusinessOnboardingWizardPage.tsx"),
  ),
  true,
);

const page = readFileSync(
  join(repoRoot, "src/components/business-app/BusinessOnboardingWizardPage.tsx"),
  "utf8",
);
assert.match(page, /bootstrapBusinessOrganizationWithLocation/);
assert.match(page, /Zero-to-Music/);
assert.match(page, /rightsSafeDisclaimer/);
assert.match(page, /уточняется|статус прав/i);
assert.doesNotMatch(page, /Лицензия активн/i);
assert.doesNotMatch(page, /ELIGIBLE\s*=\s*true/);

const home = readFileSync(
  join(repoRoot, "src/components/business-app/BusinessHomePage.tsx"),
  "utf8",
);
assert.match(home, /href="\/onboarding"/);
assert.match(home, /Начать подключение/);

const actions = readFileSync(
  join(repoRoot, "src/app/business-app/actions.ts"),
  "utf8",
);
assert.match(actions, /create_business_organization_with_location/);

console.log("business-app-onboarding-wizard-unit: ok");
