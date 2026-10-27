#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_ONBOARDING_ATMOSPHERES,
  BUSINESS_ONBOARDING_STEPS,
  BUSINESS_ONBOARDING_TYPES,
  buildBusinessOnboardingPreviewSummary,
  businessOnboardingAtmosphereSound,
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
import { sourcesForSpace } from "../src/lib/business-workspace/catalog-sources.ts";
import {
  BUSINESS_PUBLIC_PATH_REWRITES,
  BUSINESS_SITE_PATH,
  resolveBusinessInternalPath,
} from "../src/lib/business-app/host.ts";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy.ts";
import { BUSINESS_HOSTNAME } from "../src/lib/business-app/host.ts";
import {
  authorizeOnboardingPreview,
  onboardingPreviewAudioPath,
  onboardingPreviewFragment,
} from "../src/lib/business-app/onboarding-preview-access.ts";
import { PREVIEW_DURATION_MAX_MS } from "../src/lib/listen/preview-window.ts";

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
assert.equal(preview.typeLabel, "Спа и отдых");
assert.match(preview.atmosphereLabel, /Современный/);
// Sergey 23.10.2026 21:21: the "no rights-confirmed tracks yet" box must not appear at all.
assert.equal("rightsSafeDisclaimer" in preview, false);
assert.equal("noAudioNote" in preview, false);
{
  const wizardSrc = readFileSync(
    join(repoRoot, "src/components/business-app/BusinessOnboardingWizardPage.tsx"),
    "utf8",
  );
  const wizardLib = readFileSync(
    join(repoRoot, "src/lib/business-app/onboarding-wizard.ts"),
    "utf8",
  );
  for (const src of [wizardSrc, wizardLib]) {
    assert.doesNotMatch(src, /Пока таких треков в подборке нет/);
    assert.doesNotMatch(src, /подтверждённые права на каждый трек/);
    assert.doesNotMatch(src, /Музыка появится, когда права на треки будут подтверждены/);
    assert.doesNotMatch(src, /Музыка здесь пока не играет/);
  }
  assert.match(wizardSrc, /OnboardingPreviewPlayer/);
  const previewPlayer = readFileSync(join(repoRoot, "src/components/business-app/OnboardingPreviewPlayer.tsx"), "utf8");
  assert.match(previewPlayer, /data-testid="onboarding-preview-player"/);
  assert.match(previewPlayer, /Слушать/);
  assert.doesNotMatch(previewPlayer, /Музыка здесь пока не играет/);
}
for (const id of ["calm_premium", "modern_soft", "warm_lively"]) {
  const sound = businessOnboardingAtmosphereSound(id);
  assert.ok(sound, id);
  assert.ok(sourcesForSpace("cafe").some((row) => row.sounds.includes(sound)), `${id} maps to a catalog source`);
}
assert.equal(
  resolveBusinessProxyAction(BUSINESS_HOSTNAME, "/api/business/onboarding/preview").action,
  "pass_through",
);
assert.equal(
  resolveBusinessProxyAction(BUSINESS_HOSTNAME, "/api/business/onboarding/preview/audio").action,
  "pass_through",
);

const plainListener = {
  signedIn: true,
  emailConfirmed: true,
  liveTrialOrPaid: false,
  hasActiveVenue: false,
};
assert.equal(authorizeOnboardingPreview(plainListener), "no_access", "a signed-in listener without business access is refused");
assert.equal(
  authorizeOnboardingPreview({ ...plainListener, hasActiveVenue: true }),
  "no_access",
  "a venue without a live trial or paid period is refused",
);
assert.equal(authorizeOnboardingPreview({ ...plainListener, signedIn: false, liveTrialOrPaid: true }), "no_access");
assert.equal(authorizeOnboardingPreview({ ...plainListener, emailConfirmed: false, liveTrialOrPaid: true }), "no_access");
assert.equal(authorizeOnboardingPreview({ ...plainListener, liveTrialOrPaid: true }), "allow", "live trial before a venue exists");
assert.equal(authorizeOnboardingPreview({ ...plainListener, liveTrialOrPaid: true, hasActiveVenue: true }), "allow");

const hour = onboardingPreviewFragment({ duration_seconds: 3600 });
assert.equal(hour.startMs, 0);
assert.equal(hour.endMs, 60_000, "a one-hour file is clipped to the first minute");
assert.ok(hour.endMs - hour.startMs <= PREVIEW_DURATION_MAX_MS);
const stretched = onboardingPreviewFragment({
  duration_seconds: 3600,
  preview_start_ms: 0,
  preview_end_ms: 3_600_000,
});
assert.equal(stretched.endMs - stretched.startMs, 60_000, "an over-long window is not served whole");
const configured = onboardingPreviewFragment({
  duration_seconds: 3600,
  preview_start_ms: 10_000,
  preview_end_ms: 55_000,
});
assert.equal(configured.endMs - configured.startMs, 45_000);
assert.ok(configured.endMs - configured.startMs <= PREVIEW_DURATION_MAX_MS);

const clipPath = onboardingPreviewAudioPath("calm_premium");
assert.equal(clipPath, "/api/business/onboarding/preview/audio?atmosphereId=calm_premium");
assert.doesNotMatch(clipPath, /sign|token|storage/i);

const previewRoute = readFileSync(join(repoRoot, "src/app/api/business/onboarding/preview/route.ts"), "utf8");
const previewAudio = readFileSync(join(repoRoot, "src/app/api/business/onboarding/preview/audio/route.ts"), "utf8");
const previewServer = readFileSync(join(repoRoot, "src/lib/business-app/onboarding-preview.server.ts"), "utf8");
assert.match(previewRoute, /loadOnboardingPreviewGate/);
assert.ok(previewRoute.indexOf("loadOnboardingPreviewGate") < previewRoute.indexOf("loadOnboardingPreviewTrack"));
assert.match(previewRoute, /onboardingPreviewAudioPath/);
assert.doesNotMatch(previewRoute, /signWorkspaceAudio|createSignedUrl|LISTEN_SIGNED_URL_TTL/);
assert.match(previewAudio, /loadOnboardingPreviewGate/);
assert.match(previewAudio, /loadOnboardingPreviewClip/);
assert.doesNotMatch(previewAudio, /signWorkspaceAudio|createSignedUrl|LISTEN_SIGNED_URL_TTL/);
assert.match(previewServer, /onboardingPreviewFragment/);
assert.match(previewServer, /buildPreviewClipFromStorageSource/);
assert.doesNotMatch(previewServer, /signWorkspaceAudio|LISTEN_SIGNED_URL_TTL/);
assert.doesNotMatch(previewServer, /activateBusinessTrial/);

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
assert.match(page, /Музыка для заведения за минуту/);
assert.match(
  page,
  /returnHref\s*\?\s*"Точка подключена\. Откройте кабинет и нажмите «Играть»\."\s*:\s*"Точка готова\. Откройте музыку и нажмите «Играть»\."/,
);
assert.doesNotMatch(page, /лицензирован[аоы]/i);
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
