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
  hasAuthorApplicationFieldErrors,
  normalizeAuthorApplicationFormValues,
  validateAuthorApplicationFormValues,
} from "../src/lib/author-applications/validation.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
  assert(
    resolveBecomeAuthorAudience({
      isAuthenticated: true,
      workspaceCount: 0,
      applicationStatus: "submitted",
    }) === "application",
    "application audience",
  );
  assert(
    resolveBecomeAuthorAudience({
      isAuthenticated: true,
      workspaceCount: 0,
      applicationStatus: null,
    }) === "listener",
    "listener audience",
  );
}

function testProfileVariant() {
  assert(
    resolveProfileApplicationVariant({
      workspaceCount: 1,
      applicationStatus: "submitted",
    }) === null,
    "member hides application variant",
  );
  assert(
    resolveProfileApplicationVariant({
      workspaceCount: 0,
      applicationStatus: null,
    }) === "none",
    "none variant",
  );
  assert(
    resolveProfileApplicationVariant({
      workspaceCount: 0,
      applicationStatus: "needs_changes",
    }) === "needs_changes",
    "needs_changes variant",
  );
}

function testEditableAndSubmitStatuses() {
  assert(isEditableAuthorApplicationStatus("draft"), "draft editable");
  assert(isEditableAuthorApplicationStatus("needs_changes"), "needs_changes editable");
  assert(!isEditableAuthorApplicationStatus("submitted"), "submitted locked");
  assert(canSubmitAuthorApplicationStatus("draft"), "draft submittable");
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
  assert(
    !shouldShowAuthorApplicationForm({
      workspaceCount: 1,
      applicationStatus: null,
    }),
    "author hides form",
  );
  assert(
    !shouldShowAuthorApplicationForm({
      workspaceCount: 0,
      applicationStatus: "submitted",
    }),
    "submitted hides form",
  );
}

function testDuplicateGuard() {
  assert(blocksNewAuthorApplication("rejected"), "rejected blocks new");
  assert(!blocksNewAuthorApplication("withdrawn"), "withdrawn allows new");
  assert(blocksNewAuthorApplication("draft"), "draft blocks parallel");
}

function testValidation() {
  const formData = new FormData();
  formData.set("displayName", "A");
  formData.set("direction", "ab");
  formData.set("about", "short");
  formData.set("plannedContent", "short");
  formData.set("links", "");
  formData.set("contact", "");
  formData.set("consentPersonalData", "on");

  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(hasAuthorApplicationFieldErrors(errors), "invalid form has errors");

  formData.set("displayName", "Аудио Автор");
  formData.set("direction", "Медитации");
  formData.set(
    "about",
    "Я создаю медитации и практики для спокойствия более десяти лет.",
  );
  formData.set(
    "plannedContent",
    "Планирую опубликовать серию коротких практик и одну программу.",
  );

  const validValues = normalizeAuthorApplicationFormValues(formData);
  const validErrors = validateAuthorApplicationFormValues(validValues);
  assert(!hasAuthorApplicationFieldErrors(validErrors), "valid form passes");
}

function run() {
  testNormalizeStatus();
  testAudienceMatrix();
  testProfileVariant();
  testEditableAndSubmitStatuses();
  testFormVisibility();
  testDuplicateGuard();
  testValidation();
  console.log("author-applications-unit: all tests passed");
}

run();
