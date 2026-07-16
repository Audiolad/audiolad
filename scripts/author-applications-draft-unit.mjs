#!/usr/bin/env node

import {
  AUTHOR_APPLICATION_DRAFT_STORAGE_KEY,
  AUTHOR_APPLICATION_SUBMIT_ERROR_MESSAGE,
  clearAuthorApplicationDraft,
  draftToFormValues,
  formValuesToDraft,
  parseStoredAuthorApplicationDraft,
  readAuthorApplicationDraft,
  resolveInitialAuthorApplicationFormValues,
  shouldPreferDatabaseApplication,
  writeAuthorApplicationDraft,
} from "../src/lib/author-applications/draft.ts";
import {
  buildAuthorApplicationFormData,
  normalizeAuthorApplicationFormValues,
} from "../src/lib/author-applications/validation.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createMemoryStorage() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function sampleValues(overrides = {}) {
  return {
    displayName: "Сергей Автор",
    selectedDirections: ["Медитации", "Другое"],
    directionOther: "Астрология",
    direction: "Медитации, Другое: Астрология",
    about: "Я создаю медитации и практики для спокойствия более десяти лет.",
    contact: "+7 900 000-00-00",
    hasReadyMaterials: true,
    wantsTraining: false,
    interestedInSchool: true,
    consentPersonalData: true,
    ...overrides,
  };
}

function sampleDraft(overrides = {}) {
  return formValuesToDraft(sampleValues(overrides));
}

function testSuccessStateShape() {
  const success = {
    ok: true,
    submitted: true,
    submittedContact: "+7 900 000-00-00",
    errors: {},
  };

  assert(success.ok && success.submitted, "success state shows accepted screen");
  assert(success.submittedContact.includes("+7"), "success keeps contact");
}

function testDraftRemovedAfterSuccess() {
  const storage = createMemoryStorage();
  writeAuthorApplicationDraft(storage, sampleDraft());
  clearAuthorApplicationDraft(storage);
  assert(readAuthorApplicationDraft(storage) === null, "draft cleared after success");
}

function testServerErrorKeepsValues() {
  const values = sampleValues();
  const errorState = {
    ok: false,
    errors: { submit: AUTHOR_APPLICATION_SUBMIT_ERROR_MESSAGE },
    values,
  };

  assert(errorState.ok === false, "error keeps form open");
  assert(errorState.values.displayName === values.displayName, "values preserved on error");
}

function testDraftRestoreAfterReload() {
  const storage = createMemoryStorage();
  writeAuthorApplicationDraft(storage, sampleDraft({ contact: "+7 911 111-11-11" }));
  const restored = readAuthorApplicationDraft(storage);

  assert(restored?.contact === "+7 911 111-11-11", "draft restored after reload");
}

function testInvalidJsonDraft() {
  assert(parseStoredAuthorApplicationDraft("{broken") === null, "invalid json ignored");
  assert(parseStoredAuthorApplicationDraft('{"displayName":1}') === null, "invalid shape ignored");
}

function testUnavailableStorage() {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };

  assert(readAuthorApplicationDraft(broken) === null, "read failure safe");
  writeAuthorApplicationDraft(broken, sampleDraft());
  clearAuthorApplicationDraft(broken);
}

function testConsentNotRestoredFromDraft() {
  const restored = draftToFormValues(sampleDraft());
  assert(restored.consentPersonalData === false, "consent not restored from draft");
}

function testDoubleSubmitGuardFlag() {
  let inFlight = false;

  function submitOnce() {
    if (inFlight) {
      return "ignored";
    }

    inFlight = true;
    return "accepted";
  }

  assert(submitOnce() === "accepted", "first submit accepted");
  assert(submitOnce() === "ignored", "double submit ignored");
}

function testActiveApplicationPrefersStatus() {
  const application = {
    status: "submitted",
  };

  assert(
    shouldPreferDatabaseApplication(application) === false,
    "submitted application hides editable form",
  );
}

function testNeedsChangesPrefersDatabase() {
  const application = {
    status: "needs_changes",
  };
  const dbValues = sampleValues({ displayName: "Из базы", contact: "+7 999" });
  const draft = sampleDraft({ displayName: "Из черновика", contact: "+7 111" });

  const resolved = resolveInitialAuthorApplicationFormValues({
    databaseValues: dbValues,
    application,
    draft,
  });

  assert(resolved.values.displayName === "Из базы", "needs_changes uses db values");
  assert(resolved.restoredFromDraft === false, "draft not used for needs_changes");
}

function testContactInFormDataAndSuccess() {
  const values = sampleValues({ contact: "+7 922 222-22-22" });
  const formData = buildAuthorApplicationFormData(values);
  const normalized = normalizeAuthorApplicationFormValues(formData);

  assert(normalized.contact === "+7 922 222-22-22", "contact in submit payload");
  assert(
    AUTHOR_APPLICATION_SUBMIT_ERROR_MESSAGE.includes("данные сохранены"),
    "user-facing submit error is friendly",
  );
}

function testSupabaseErrorNotExposed() {
  const userMessage = AUTHOR_APPLICATION_SUBMIT_ERROR_MESSAGE;
  assert(!userMessage.includes("permission denied"), "no raw supabase in user text");
  assert(!userMessage.includes("duplicate key"), "no raw supabase in user text");
}

function testDirectionDraftRestore() {
  const draft = sampleDraft({
    selectedDirections: ["Психология", "Другое"],
    directionOther: "Семейные практики",
  });
  const restored = draftToFormValues(draft);

  assert(restored.selectedDirections.includes("Другое"), "other direction restored");
  assert(restored.directionOther === "Семейные практики", "other text restored");
  assert(restored.direction.includes("Семейные практики"), "serialized direction restored");
}

function testCheckboxDraftRestore() {
  const draft = sampleDraft({
    hasReadyMaterials: false,
    wantsTraining: true,
    interestedInSchool: true,
  });
  const restored = draftToFormValues(draft);

  assert(restored.hasReadyMaterials === false, "hasReadyMaterials restored");
  assert(restored.wantsTraining === true, "wantsTraining restored");
  assert(restored.interestedInSchool === true, "interestedInSchool restored");
}

function testDraftStorageKey() {
  assert(
    AUTHOR_APPLICATION_DRAFT_STORAGE_KEY === "audiolad.authorApplication.draft",
    "draft storage key",
  );
}

function run() {
  testSuccessStateShape();
  testDraftRemovedAfterSuccess();
  testServerErrorKeepsValues();
  testDraftRestoreAfterReload();
  testInvalidJsonDraft();
  testUnavailableStorage();
  testConsentNotRestoredFromDraft();
  testDoubleSubmitGuardFlag();
  testActiveApplicationPrefersStatus();
  testNeedsChangesPrefersDatabase();
  testContactInFormDataAndSuccess();
  testSupabaseErrorNotExposed();
  testDirectionDraftRestore();
  testCheckboxDraftRestore();
  testDraftStorageKey();
  console.log("author-applications-draft-unit: all tests passed");
}

run();
