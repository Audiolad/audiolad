import {
  getEmailValidationMessage,
  validateEmailForRegistrationServer,
} from "@/lib/auth/email";

import type {
  AuthorApplicationFieldErrors,
  AuthorApplicationFormValues,
  AuthorApplicationRow,
} from "./types";

export const AUTHOR_DIRECTION_OTHER = "Другое";

export const AUTHOR_DIRECTION_PRESETS = [
  "Медитации",
  "Аудиопрактики",
  "Психология",
  "Коучинг",
  "Наставничество",
  "Телесные практики",
  "Энергопрактики",
  "Духовные практики",
  "Работа с детьми",
  "Здоровье",
  AUTHOR_DIRECTION_OTHER,
] as const;

const OTHER_PREFIX = `${AUTHOR_DIRECTION_OTHER}:`;

export function serializeDirection(
  selectedDirections: string[],
  directionOther: string,
): string {
  const presets = selectedDirections.filter(
    (item) => item !== AUTHOR_DIRECTION_OTHER,
  );
  const parts = [...presets];

  if (selectedDirections.includes(AUTHOR_DIRECTION_OTHER)) {
    const other = directionOther.trim();
    if (other) {
      parts.push(`${OTHER_PREFIX} ${other}`);
    }
  }

  return parts.join(", ");
}

export function parseStoredDirection(stored: string): {
  selectedDirections: string[];
  directionOther: string;
} {
  const trimmed = stored.trim();
  if (!trimmed) {
    return { selectedDirections: [], directionOther: "" };
  }

  const selectedDirections: string[] = [];
  let directionOther = "";
  const unmatched: string[] = [];

  for (const part of trimmed.split(",").map((item) => item.trim()).filter(Boolean)) {
    if (part.startsWith(OTHER_PREFIX)) {
      selectedDirections.push(AUTHOR_DIRECTION_OTHER);
      directionOther = part.slice(OTHER_PREFIX.length).trim();
      continue;
    }

    if ((AUTHOR_DIRECTION_PRESETS as readonly string[]).includes(part)) {
      selectedDirections.push(part);
      continue;
    }

    unmatched.push(part);
  }

  if (unmatched.length > 0) {
    if (!selectedDirections.includes(AUTHOR_DIRECTION_OTHER)) {
      selectedDirections.push(AUTHOR_DIRECTION_OTHER);
    }
    directionOther = [directionOther, ...unmatched].filter(Boolean).join(", ");
  }

  if (selectedDirections.length === 0) {
    return {
      selectedDirections: [AUTHOR_DIRECTION_OTHER],
      directionOther: trimmed,
    };
  }

  return {
    selectedDirections: [...new Set(selectedDirections)],
    directionOther,
  };
}

export const AUTHOR_APPLICATION_LIMITS = {
  displayNameMin: 2,
  displayNameMax: 100,
  directionMin: 3,
  directionMax: 200,
  directionOtherMin: 3,
  directionOtherMax: 120,
  aboutMin: 20,
  aboutMax: 3000,
  contactDetailsMin: 1,
  contactDetailsMax: 300,
} as const;

/** Used when the simplified form no longer collects planned content. */
export const AUTHOR_APPLICATION_DEFAULT_PLANNED_CONTENT =
  "Подробности о планируемых материалах будут уточнены при рассмотрении заявки.";

export const AUTHOR_APPLICATION_READINESS_ERROR =
  "Выберите один из вариантов о ваших аудиопрактиках или обучении.";

export const AUTHOR_APPLICATION_DIRECTION_ERROR =
  "Выберите хотя бы одно направление.";

function trimValue(value: FormDataEntryValue | null | undefined): string {
  return String(value ?? "").trim();
}

export function buildAuthorApplicationFormData(
  values: AuthorApplicationFormValues,
  options?: { updateContactsOnly?: boolean },
): FormData {
  const formData = new FormData();

  formData.set("displayName", values.displayName);

  for (const direction of values.selectedDirections) {
    formData.append("directionOptions", direction);
  }

  formData.set("directionOther", values.directionOther);
  formData.set("about", values.about);
  formData.set("contactEmail", values.contactEmail);
  formData.set("contactDetails", values.contactDetails);

  if (values.hasReadyMaterials) {
    formData.set("hasReadyMaterials", "on");
  }

  if (values.wantsTraining) {
    formData.set("wantsTraining", "on");
  }

  if (values.interestedInSchool) {
    formData.set("interestedInSchool", "on");
  }

  if (values.consentPersonalData) {
    formData.set("consentPersonalData", "on");
  }

  if (options?.updateContactsOnly) {
    formData.set("updateContactsOnly", "on");
  }

  return formData;
}

export function normalizeAuthorApplicationFormValues(
  formData: FormData,
): AuthorApplicationFormValues {
  const selectedDirections = formData
    .getAll("directionOptions")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const directionOther = trimValue(formData.get("directionOther"));
  const direction = serializeDirection(selectedDirections, directionOther);

  return {
    displayName: trimValue(formData.get("displayName")),
    selectedDirections,
    directionOther,
    direction,
    about: trimValue(formData.get("about")),
    contactEmail: trimValue(formData.get("contactEmail")),
    contactDetails: trimValue(formData.get("contactDetails")),
    hasReadyMaterials: formData.get("hasReadyMaterials") === "on",
    wantsTraining: formData.get("wantsTraining") === "on",
    interestedInSchool: formData.get("interestedInSchool") === "on",
    consentPersonalData: formData.get("consentPersonalData") === "on",
  };
}

export function isAuthorApplicationContactUpdateOnly(formData: FormData): boolean {
  return formData.get("updateContactsOnly") === "on";
}

export function validateAuthorApplicationContactFields(
  values: Pick<AuthorApplicationFormValues, "contactEmail" | "contactDetails">,
): AuthorApplicationFieldErrors {
  const errors: AuthorApplicationFieldErrors = {};

  const emailResult = validateEmailForRegistrationServer(values.contactEmail);

  if (!emailResult.ok) {
    errors.contactEmail = getEmailValidationMessage(emailResult.code);
  }

  if (
    values.contactDetails.length < AUTHOR_APPLICATION_LIMITS.contactDetailsMin ||
    values.contactDetails.length > AUTHOR_APPLICATION_LIMITS.contactDetailsMax
  ) {
    errors.contactDetails =
      values.contactDetails.length === 0
        ? "Укажите телефон, MAX или другой способ связи."
        : `Контакт слишком длинный (до ${AUTHOR_APPLICATION_LIMITS.contactDetailsMax} символов).`;
  }

  return errors;
}

export function validateAuthorApplicationFormValues(
  values: AuthorApplicationFormValues,
  options?: { requireConsent?: boolean },
): AuthorApplicationFieldErrors {
  const errors: AuthorApplicationFieldErrors = {};
  const requireConsent = options?.requireConsent ?? true;

  if (
    values.displayName.length < AUTHOR_APPLICATION_LIMITS.displayNameMin ||
    values.displayName.length > AUTHOR_APPLICATION_LIMITS.displayNameMax
  ) {
    errors.displayName = `Укажите имя или название проекта (${AUTHOR_APPLICATION_LIMITS.displayNameMin}–${AUTHOR_APPLICATION_LIMITS.displayNameMax} символов).`;
  }

  if (values.selectedDirections.length === 0) {
    errors.direction = AUTHOR_APPLICATION_DIRECTION_ERROR;
  } else if (
    values.selectedDirections.includes(AUTHOR_DIRECTION_OTHER) &&
    values.directionOther.length < AUTHOR_APPLICATION_LIMITS.directionOtherMin
  ) {
    errors.directionOther = `Укажите направление (минимум ${AUTHOR_APPLICATION_LIMITS.directionOtherMin} символа).`;
  } else if (
    values.direction.length < AUTHOR_APPLICATION_LIMITS.directionMin ||
    values.direction.length > AUTHOR_APPLICATION_LIMITS.directionMax
  ) {
    errors.direction = `Слишком длинный список направлений (до ${AUTHOR_APPLICATION_LIMITS.directionMax} символов).`;
  }

  if (
    values.about.length < AUTHOR_APPLICATION_LIMITS.aboutMin ||
    values.about.length > AUTHOR_APPLICATION_LIMITS.aboutMax
  ) {
    errors.about = `Расскажите о себе (${AUTHOR_APPLICATION_LIMITS.aboutMin}–${AUTHOR_APPLICATION_LIMITS.aboutMax} символов).`;
  }

  Object.assign(errors, validateAuthorApplicationContactFields(values));

  if (!values.hasReadyMaterials && !values.wantsTraining) {
    errors.readiness = AUTHOR_APPLICATION_READINESS_ERROR;
  }

  if (requireConsent && !values.consentPersonalData) {
    errors.consentPersonalData =
      "Необходимо согласие на обработку персональных данных.";
  }

  return errors;
}

export function hasAuthorApplicationFieldErrors(
  errors: AuthorApplicationFieldErrors,
): boolean {
  return Object.keys(errors).length > 0;
}

export function rowToFormValues(
  row: Pick<
    AuthorApplicationRow,
    | "display_name"
    | "direction"
    | "about"
    | "contact_email"
    | "contact_details"
    | "has_ready_materials"
    | "consent_personal_data"
  > & {
    wants_training?: boolean;
    interested_in_school?: boolean;
  },
  options?: { fallbackContactEmail?: string | null },
): AuthorApplicationFormValues {
  const parsedDirection = parseStoredDirection(row.direction);
  const storedEmail = row.contact_email?.trim() ?? "";
  const fallbackEmail = options?.fallbackContactEmail?.trim() ?? "";

  return {
    displayName: row.display_name,
    selectedDirections: parsedDirection.selectedDirections,
    directionOther: parsedDirection.directionOther,
    direction: row.direction,
    about: row.about,
    contactEmail: storedEmail || fallbackEmail,
    contactDetails: row.contact_details ?? "",
    hasReadyMaterials: row.has_ready_materials,
    wantsTraining: row.wants_training ?? false,
    interestedInSchool: row.interested_in_school ?? false,
    consentPersonalData: row.consent_personal_data,
  };
}

export function buildSubmittedContacts(
  values: Pick<AuthorApplicationFormValues, "contactEmail" | "contactDetails">,
): { contactEmail: string; contactDetails: string } {
  return {
    contactEmail: values.contactEmail.trim(),
    contactDetails: values.contactDetails.trim(),
  };
}
