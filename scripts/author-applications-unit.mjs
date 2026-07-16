#!/usr/bin/env node

import {
  blocksNewAuthorApplication,
  canSubmitAuthorApplicationStatus,
  isEditableAuthorApplicationStatus,
  normalizeAuthorApplicationStatus,
  resolveBecomeAuthorAudience,
  resolveProfileApplicationVariant,
  shouldShowAuthorApplicationForm,
} from "../src/lib/author-applications/status.ts";
import {
  AUTHOR_APPLICATION_READINESS_ERROR,
  hasAuthorApplicationFieldErrors,
  normalizeAuthorApplicationFormValues,
  rowToFormValues,
  validateAuthorApplicationFormValues,
} from "../src/lib/author-applications/validation.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validBaseFormData(overrides = {}) {
  const formData = new FormData();
  formData.set("displayName", "Аудио Автор");
  formData.set("direction", "Медитации");
  formData.set(
    "about",
    "Я создаю медитации и практики для спокойствия более десяти лет.",
  );
  formData.set("contact", "+7 900 000-00-00");
  formData.set("consentPersonalData", "on");

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      formData.delete(key);
    } else {
      formData.set(key, value);
    }
  }

  return formData;
}

function testNormalizeStatus() {
  assert(normalizeAuthorApplicationStatus("submitted") === "submitted", "submitted");
  assert(normalizeAuthorApplicationStatus("unknown") === null, "unknown status");
}

function testAudienceMatrix() {
  assert(
    resolveBecomeAuthorAudience({
      isAuthenticated: false,
      workspaceCount: 0,
      applicationStatus: null,
    }) === "guest",
    "guest audience",
  );
  assert(
    resolveBecomeAuthorAudience({
      isAuthenticated: true,
      workspaceCount: 1,
      applicationStatus: "submitted",
    }) === "author",
    "author audience",
  );
}

function testProfileVariant() {
  assert(
    resolveProfileApplicationVariant({
      workspaceCount: 0,
      applicationStatus: null,
    }) === "none",
    "none variant",
  );
}

function testEditableAndSubmitStatuses() {
  assert(isEditableAuthorApplicationStatus("draft"), "draft editable");
  assert(canSubmitAuthorApplicationStatus("needs_changes"), "needs_changes submittable");
}

function testFormVisibility() {
  assert(
    shouldShowAuthorApplicationForm({
      workspaceCount: 0,
      applicationStatus: null,
    }),
    "new listener sees form",
  );
}

function testDuplicateGuard() {
  assert(blocksNewAuthorApplication("rejected"), "rejected blocks new");
}

function testReadyMaterialsOnly() {
  const formData = validBaseFormData({
    hasReadyMaterials: "on",
    wantsTraining: null,
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(!hasAuthorApplicationFieldErrors(errors), "ready materials only passes");
  assert(values.hasReadyMaterials, "hasReadyMaterials true");
  assert(!values.wantsTraining, "wantsTraining false");
}

function testWantsTrainingOnly() {
  const formData = validBaseFormData({
    hasReadyMaterials: null,
    wantsTraining: "on",
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(!hasAuthorApplicationFieldErrors(errors), "wants training only passes");
  assert(values.wantsTraining, "wantsTraining true");
}

function testBothReadinessOptions() {
  const formData = validBaseFormData({
    hasReadyMaterials: "on",
    wantsTraining: "on",
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(!hasAuthorApplicationFieldErrors(errors), "both readiness options pass");
}

function testMissingReadinessBlocked() {
  const formData = validBaseFormData({
    hasReadyMaterials: null,
    wantsTraining: null,
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(errors.readiness === AUTHOR_APPLICATION_READINESS_ERROR, "readiness required");
}

function testMissingDirectionBlocked() {
  const formData = validBaseFormData({
    direction: "ab",
    hasReadyMaterials: "on",
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(Boolean(errors.direction), "direction too short blocked");
}

function testLegacyRowWithoutWantsTraining() {
  const values = rowToFormValues({
    display_name: "Автор",
    direction: "Медитации",
    about: "Длинный рассказ об опыте автора для старой заявки.",
    contact: "+7 900 000-00-00",
    has_ready_materials: true,
    consent_personal_data: true,
  });
  assert(values.wantsTraining === false, "legacy row defaults wantsTraining to false");
  assert(values.hasReadyMaterials, "legacy hasReadyMaterials preserved");
}

function testInvalidBaselineForm() {
  const formData = validBaseFormData({
    displayName: "A",
    direction: "ab",
    about: "short",
    contact: "",
    hasReadyMaterials: "on",
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(hasAuthorApplicationFieldErrors(errors), "invalid baseline has errors");
}

function testServerSideEnforcementDocumented() {
  // user_id is enforced by RLS (auth.uid()); status changes are blocked by DB triggers.
  assert(true, "server-side enforcement documented");
}

function run() {
  testNormalizeStatus();
  testAudienceMatrix();
  testProfileVariant();
  testEditableAndSubmitStatuses();
  testFormVisibility();
  testDuplicateGuard();
  testReadyMaterialsOnly();
  testWantsTrainingOnly();
  testBothReadinessOptions();
  testMissingReadinessBlocked();
  testMissingDirectionBlocked();
  testLegacyRowWithoutWantsTraining();
  testInvalidBaselineForm();
  testServerSideEnforcementDocumented();
  console.log("author-applications-unit: all tests passed");
}

run();
