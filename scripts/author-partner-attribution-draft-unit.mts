import assert from "node:assert/strict";
import test from "node:test";

import {
  formValuesToDraft,
  parseStoredAuthorApplicationDraft,
  resolveInitialAuthorApplicationFormValues,
} from "../src/lib/author-applications/draft";
import type { AuthorApplicationFormValues } from "../src/lib/author-applications/types";

function baseValues(
  overrides: Partial<AuthorApplicationFormValues> = {},
): AuthorApplicationFormValues {
  return {
    displayName: "",
    selectedDirections: [],
    directionOther: "",
    direction: "",
    about: "",
    contactEmail: "",
    contactDetails: "",
    hasReadyMaterials: false,
    wantsTraining: false,
    interestedInSchool: false,
    consentPersonalData: false,
    inviteCode: "",
    ...overrides,
  };
}

function roundTripDraft(values: AuthorApplicationFormValues) {
  const draft = formValuesToDraft(values);
  const raw = JSON.stringify(draft);
  const parsed = parseStoredAuthorApplicationDraft(raw);
  assert.ok(parsed, "parsed draft must not be null");
  return parsed;
}

test("round-trip: manual MARINA survives localStorage reload when DB invite empty", () => {
  const databaseValues = baseValues();
  const parsed = roundTripDraft(
    baseValues({
      displayName: "Manual",
      about: "about text here",
      inviteCode: "MARINA",
    }),
  );

  assert.equal(parsed.inviteCode, "MARINA");

  const resolved = resolveInitialAuthorApplicationFormValues({
    databaseValues,
    application: null,
    draft: parsed,
  });

  assert.equal(resolved.restoredFromDraft, true);
  assert.equal(resolved.values.inviteCode, "MARINA");
});

test("round-trip: draft MARINA + canonical SERGEY → SERGEY after reload", () => {
  const databaseValues = baseValues({
    displayName: "From DB",
    inviteCode: "SERGEY",
  });
  const parsed = roundTripDraft(
    baseValues({
      displayName: "From Draft",
      selectedDirections: ["music"],
      about: "draft about text",
      contactEmail: "a@example.com",
      contactDetails: "telegram",
      hasReadyMaterials: true,
      inviteCode: "MARINA",
    }),
  );

  assert.equal(parsed.inviteCode, "MARINA");

  const resolved = resolveInitialAuthorApplicationFormValues({
    databaseValues,
    application: null,
    draft: parsed,
  });

  assert.equal(resolved.restoredFromDraft, true);
  assert.equal(resolved.values.inviteCode, "SERGEY");
  assert.equal(resolved.values.displayName, "From Draft");
});

test("legacy draft without inviteCode parses as empty invite", () => {
  const legacy = {
    displayName: "Legacy",
    selectedDirections: ["music"],
    directionOther: "",
    about: "about",
    contactEmail: "a@example.com",
    contactDetails: "",
    hasReadyMaterials: false,
    wantsTraining: false,
    interestedInSchool: false,
    savedAt: new Date(0).toISOString(),
  };
  const parsed = parseStoredAuthorApplicationDraft(JSON.stringify(legacy));
  assert.ok(parsed);
  assert.equal(parsed.inviteCode, "");
});
