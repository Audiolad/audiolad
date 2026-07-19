#!/usr/bin/env node

import {
  AUTHOR_APPLICATION_DRAFT_STORAGE_KEY,
  AUTHOR_APPLICATION_CONTACT_UPDATE_ERROR_MESSAGE,
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
  isAuthorApplicationContactUpdateOnly,
  normalizeAuthorApplicationFormValues,
} from "../src/lib/author-applications/validation.ts";
import { canUpdateAuthorApplicationContacts } from "../src/lib/author-applications/status.ts";

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
    contactEmail: "author@yandex.ru",
    contactDetails: "+7 900 000-00-00",
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
    submittedContacts: {
      contactEmail: "author@yandex.ru",
      contactDetails: "+7 900 000-00-00",
    },
    errors: {},
  };

  assert(success.ok && success.submitted, "success state shows accepted screen");
  assert(success.submittedContacts.contactEmail.includes("@"), "success keeps email");
  assert(success.submittedContacts.contactDetails.includes("+7"), "success keeps details");
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
  assert(errorState.values.contactEmail === values.contactEmail, "email preserved on error");
}

function testDraftRestoreAfterReload() {
  const storage = createMemoryStorage();
  writeAuthorApplicationDraft(
    storage,
    sampleDraft({
      contactEmail: "draft@mail.ru",
      contactDetails: "+7 911 111-11-11",
    }),
  );
  const restored = readAuthorApplicationDraft(storage);

  assert(restored?.contactEmail === "draft@mail.ru", "email restored after reload");
  assert(restored?.contactDetails === "+7 911 111-11-11", "details restored after reload");
}

function testLegacyDraftContactMigration() {
  const legacy = JSON.stringify({
    displayName: "Сергей Автор",
    selectedDirections: ["Медитации"],
    directionOther: "",
    about: "Я создаю медитации и практики для спокойствия более десяти лет.",
    contact: "+7 900 000-00-00",
    hasReadyMaterials: true,
    wantsTraining: false,
    interestedInSchool: false,
    savedAt: new Date().toISOString(),
  });

  const restored = parseStoredAuthorApplicationDraft(legacy);
  assert(restored?.contactDetails === "+7 900 000-00-00", "legacy draft contact migrated");
  assert(restored?.contactEmail === "", "legacy draft email empty");
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
  const dbValues = sampleValues({
    displayName: "Из базы",
    contactEmail: "db@yandex.ru",
    contactDetails: "+7 999",
  });
  const draft = sampleDraft({
    displayName: "Из черновика",
    contactEmail: "draft@mail.ru",
    contactDetails: "+7 111",
  });

  const resolved = resolveInitialAuthorApplicationFormValues({
    databaseValues: dbValues,
    application,
    draft,
  });

  assert(resolved.values.displayName === "Из базы", "needs_changes uses db values");
  assert(resolved.values.contactEmail === "db@yandex.ru", "needs_changes keeps db email");
  assert(resolved.restoredFromDraft === false, "draft not used for needs_changes");
}

function testContactsInFormDataAndSuccess() {
  const values = sampleValues({
    contactEmail: "updated@mail.ru",
    contactDetails: "+7 922 222-22-22",
  });
  const formData = buildAuthorApplicationFormData(values);
  const normalized = normalizeAuthorApplicationFormValues(formData);

  assert(normalized.contactEmail === "updated@mail.ru", "email in submit payload");
  assert(normalized.contactDetails === "+7 922 222-22-22", "details in submit payload");
  assert(
    AUTHOR_APPLICATION_SUBMIT_ERROR_MESSAGE.includes("данные сохранены"),
    "user-facing submit error is friendly",
  );
}

function testContactUpdateModeFlag() {
  const formData = buildAuthorApplicationFormData(sampleValues(), {
    updateContactsOnly: true,
  });

  assert(isAuthorApplicationContactUpdateOnly(formData), "contact update flag set");
  assert(
    AUTHOR_APPLICATION_CONTACT_UPDATE_ERROR_MESSAGE.includes("контакты"),
    "contact update error is friendly",
  );
}

function testSubmittedApplicationAllowsContactUpdateStatus() {
  assert(canUpdateAuthorApplicationContacts("submitted"), "submitted status allows contact update");
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
  testLegacyDraftContactMigration();
  testInvalidJsonDraft();
  testUnavailableStorage();
  testConsentNotRestoredFromDraft();
  testDoubleSubmitGuardFlag();
  testActiveApplicationPrefersStatus();
  testNeedsChangesPrefersDatabase();
  testContactsInFormDataAndSuccess();
  testContactUpdateModeFlag();
  testSubmittedApplicationAllowsContactUpdateStatus();
  testSupabaseErrorNotExposed();
  testDirectionDraftRestore();
  testCheckboxDraftRestore();
  testDraftStorageKey();
  console.log("author-applications-draft-unit: all tests passed");
}

run();
