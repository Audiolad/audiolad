import assert from "node:assert/strict";
import test from "node:test";

import {
  formValuesToDraft,
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

test("locked SERGEY + local draft keeps inviteCode SERGEY", () => {
  const databaseValues = baseValues({
    displayName: "From DB",
    inviteCode: "SERGEY",
  });
  const draft = formValuesToDraft(
    baseValues({
      displayName: "From Draft",
      selectedDirections: ["music"],
      about: "draft about text",
      contactEmail: "a@example.com",
      contactDetails: "telegram",
      hasReadyMaterials: true,
      inviteCode: "",
    }),
  );

  const resolved = resolveInitialAuthorApplicationFormValues({
    databaseValues,
    application: null,
    draft,
  });

  assert.equal(resolved.restoredFromDraft, true);
  assert.equal(resolved.values.inviteCode, "SERGEY");
  assert.equal(resolved.values.displayName, "From Draft");
});

test("unlocked draft keeps manual inviteCode when DB has none", () => {
  const databaseValues = baseValues();
  const draft = formValuesToDraft(
    baseValues({
      displayName: "Manual",
      about: "about",
      inviteCode: "MARINA",
    }),
  );

  const resolved = resolveInitialAuthorApplicationFormValues({
    databaseValues,
    application: null,
    draft,
  });

  assert.equal(resolved.values.inviteCode, "MARINA");
});
