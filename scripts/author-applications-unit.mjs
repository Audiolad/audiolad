#!/usr/bin/env node

import {
  blocksNewAuthorApplication,
  canSubmitAuthorApplicationStatus,
  canUpdateAuthorApplicationContacts,
  isEditableAuthorApplicationStatus,
  normalizeAuthorApplicationStatus,
  shouldShowAuthorApplicationForm,
} from "../src/lib/author-applications/status.ts";
import {
  AUTHOR_APPLICATION_DIRECTION_ERROR,
  AUTHOR_APPLICATION_READINESS_ERROR,
  buildSubmittedContacts,
  hasAuthorApplicationFieldErrors,
  normalizeAuthorApplicationFormValues,
  parseStoredDirection,
  rowToFormValues,
  serializeDirection,
  validateAuthorApplicationContactFields,
  validateAuthorApplicationFormValues,
} from "../src/lib/author-applications/validation.ts";
import { formatApplicationContactSummary } from "../src/lib/author-applications/queries.ts";
import { getEmailValidationMessage } from "../src/lib/auth/email/messages.ts";
import { validateEmailForRegistrationServer } from "../src/lib/auth/email/index.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validBaseFormData(overrides = {}) {
  const formData = new FormData();
  formData.set("displayName", "Аудио Автор");
  formData.append("directionOptions", "Медитации");
  formData.set(
    "about",
    "Я создаю медитации и практики для спокойствия более десяти лет.",
  );
  formData.set("contactEmail", "author@yandex.ru");
  formData.set("contactDetails", "+7 900 000-00-00");
  formData.set("consentPersonalData", "on");

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      formData.delete(key);
    } else if (key === "directionOptions") {
      formData.delete("directionOptions");
      for (const item of value) {
        formData.append("directionOptions", item);
      }
    } else {
      formData.set(key, value);
    }
  }

  return formData;
}

function testNormalizeStatus() {
  assert(normalizeAuthorApplicationStatus("submitted") === "submitted", "submitted");
}

function testDirectionSerialization() {
  assert(
    serializeDirection(["Медитации", "Психология"], "") === "Медитации, Психология",
    "serialize presets",
  );
  assert(
    serializeDirection(["Другое"], "Астрология") === "Другое: Астрология",
    "serialize other",
  );
}

function testDirectionParsingLegacy() {
  const parsed = parseStoredDirection("Медитации, Психология");
  assert(parsed.selectedDirections.includes("Медитации"), "legacy preset parsed");
  assert(parsed.selectedDirections.includes("Психология"), "legacy second preset parsed");
}

function testDirectionParsingOther() {
  const parsed = parseStoredDirection("Медитации, Другое: Астрология");
  assert(parsed.selectedDirections.includes("Другое"), "other flag parsed");
  assert(parsed.directionOther === "Астрология", "other text parsed");
}

function testReadyMaterialsOnly() {
  const formData = validBaseFormData({
    hasReadyMaterials: "on",
    wantsTraining: null,
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(!hasAuthorApplicationFieldErrors(errors), "ready materials only passes");
}

function testWantsTrainingOnly() {
  const formData = validBaseFormData({
    hasReadyMaterials: null,
    wantsTraining: "on",
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(!hasAuthorApplicationFieldErrors(errors), "wants training only passes");
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

function testInterestedInSchoolOptional() {
  const formData = validBaseFormData({
    hasReadyMaterials: "on",
    interestedInSchool: null,
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(!hasAuthorApplicationFieldErrors(errors), "school interest optional");
  assert(!values.interestedInSchool, "school unchecked");

  const withSchool = validBaseFormData({
    hasReadyMaterials: "on",
    interestedInSchool: "on",
  });
  const schoolValues = normalizeAuthorApplicationFormValues(withSchool);
  assert(schoolValues.interestedInSchool, "school can be checked");
}

function testMissingDirectionBlocked() {
  const formData = validBaseFormData({
    directionOptions: [],
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(errors.direction === AUTHOR_APPLICATION_DIRECTION_ERROR, "direction required");
}

function testOtherDirectionRequiresText() {
  const formData = validBaseFormData({
    directionOptions: ["Другое"],
    directionOther: "",
    hasReadyMaterials: "on",
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(Boolean(errors.directionOther), "other direction text required");
}

function testMultipleDirectionsSubmit() {
  const formData = validBaseFormData({
    directionOptions: ["Медитации", "Коучинг"],
    hasReadyMaterials: "on",
  });
  const values = normalizeAuthorApplicationFormValues(formData);
  const errors = validateAuthorApplicationFormValues(values);
  assert(!hasAuthorApplicationFieldErrors(errors), "multiple directions pass");
  assert(values.direction.includes("Медитации"), "direction serialized");
}

function testLegacyRowWithoutNewFlags() {
  const values = rowToFormValues({
    display_name: "Автор",
    direction: "Медитации",
    about: "Длинный рассказ об опыте автора для старой заявки.",
    contact_email: null,
    contact_details: "+7 900 000-00-00",
    has_ready_materials: true,
    consent_personal_data: true,
  }, {
    fallbackContactEmail: "legacy@mail.ru",
  });
  assert(values.wantsTraining === false, "legacy wantsTraining defaults false");
  assert(values.interestedInSchool === false, "legacy interestedInSchool defaults false");
  assert(values.selectedDirections.includes("Медитации"), "legacy direction parsed");
  assert(values.contactEmail === "legacy@mail.ru", "fallback email from profile");
  assert(values.contactDetails === "+7 900 000-00-00", "legacy contact details preserved");
}

function testEditableAndSubmitStatuses() {
  assert(isEditableAuthorApplicationStatus("draft"), "draft editable");
  assert(canSubmitAuthorApplicationStatus("needs_changes"), "needs_changes submittable");
  assert(canUpdateAuthorApplicationContacts("submitted"), "submitted contacts editable");
  assert(canUpdateAuthorApplicationContacts("in_review"), "in_review contacts editable");
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

function testEmailPrefillFromProfile() {
  const values = rowToFormValues({
    display_name: "Автор",
    direction: "Медитации",
    about: "Длинный рассказ об опыте автора для старой заявки.",
    contact_email: null,
    contact_details: "+7 900 000-00-00",
    has_ready_materials: true,
    consent_personal_data: true,
  }, {
    fallbackContactEmail: "listener@yandex.ru",
  });

  assert(values.contactEmail === "listener@yandex.ru", "email prefilled from profile");
}

function testStoredEmailPreferredOverProfile() {
  const values = rowToFormValues({
    display_name: "Автор",
    direction: "Медитации",
    about: "Длинный рассказ об опыте автора для старой заявки.",
    contact_email: "saved@mail.ru",
    contact_details: "+7 900 000-00-00",
    has_ready_materials: true,
    consent_personal_data: true,
  }, {
    fallbackContactEmail: "listener@yandex.ru",
  });

  assert(values.contactEmail === "saved@mail.ru", "stored application email preferred");
}

function testInvalidEmailRejected() {
  const errors = validateAuthorApplicationContactFields({
    contactEmail: "not-an-email",
    contactDetails: "+7 900 000-00-00",
  });

  assert(Boolean(errors.contactEmail), "invalid email rejected");
}

function testForbiddenDomainRejected() {
  const errors = validateAuthorApplicationContactFields({
    contactEmail: "user@gmail.com",
    contactDetails: "+7 900 000-00-00",
  });

  assert(Boolean(errors.contactEmail), "forbidden domain rejected");
  const domainResult = validateEmailForRegistrationServer("user@gmail.com");
  assert(!domainResult.ok && domainResult.code === "domain_not_allowed", "signup policy reused");
  assert(
    errors.contactEmail === getEmailValidationMessage("domain_not_allowed"),
    "domain message matches signup policy",
  );
}

function testValidEmailAccepted() {
  const errors = validateAuthorApplicationContactFields({
    contactEmail: "author@yandex.ru",
    contactDetails: "+7 900 000-00-00",
  });

  assert(!errors.contactEmail, "valid email accepted");
}

function testSubmittedContactsShape() {
  const contacts = buildSubmittedContacts({
    contactEmail: " author@yandex.ru ",
    contactDetails: " +7 900 000-00-00 ",
  });

  assert(contacts.contactEmail === "author@yandex.ru", "email trimmed in success payload");
  assert(contacts.contactDetails === "+7 900 000-00-00", "details trimmed in success payload");
}

function testContactSummaryFormatting() {
  assert(
    formatApplicationContactSummary({
      contact_email: "author@yandex.ru",
      contact_details: "+7 900 000-00-00",
    }) === "author@yandex.ru · +7 900 000-00-00",
    "admin contact summary",
  );
}

function testFirstSubmitPayloadKeepsSeparateContacts() {
  const values = normalizeAuthorApplicationFormValues(validBaseFormData());
  assert(values.contactEmail === "author@yandex.ru", "email in submit payload");
  assert(values.contactDetails === "+7 900 000-00-00", "details in submit payload");
}

function run() {
  testNormalizeStatus();
  testDirectionSerialization();
  testDirectionParsingLegacy();
  testDirectionParsingOther();
  testReadyMaterialsOnly();
  testWantsTrainingOnly();
  testBothReadinessOptions();
  testMissingReadinessBlocked();
  testInterestedInSchoolOptional();
  testMissingDirectionBlocked();
  testOtherDirectionRequiresText();
  testMultipleDirectionsSubmit();
  testLegacyRowWithoutNewFlags();
  testEditableAndSubmitStatuses();
  testFormVisibility();
  testDuplicateGuard();
  testEmailPrefillFromProfile();
  testStoredEmailPreferredOverProfile();
  testInvalidEmailRejected();
  testForbiddenDomainRejected();
  testValidEmailAccepted();
  testSubmittedContactsShape();
  testContactSummaryFormatting();
  testFirstSubmitPayloadKeepsSeparateContacts();
  console.log("author-applications-unit: all tests passed");
}

run();
