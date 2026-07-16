import type {
  AuthorApplicationFieldErrors,
  AuthorApplicationFormValues,
  AuthorApplicationRow,
} from "./types";

export const AUTHOR_APPLICATION_LIMITS = {
  displayNameMin: 2,
  displayNameMax: 100,
  directionMin: 3,
  directionMax: 200,
  aboutMin: 20,
  aboutMax: 3000,
  contactMin: 1,
  contactMax: 300,
} as const;

/** Used when the simplified form no longer collects planned content. */
export const AUTHOR_APPLICATION_DEFAULT_PLANNED_CONTENT =
  "Подробности о планируемых материалах будут уточнены при рассмотрении заявки.";

export const AUTHOR_APPLICATION_READINESS_ERROR =
  "Выберите, есть ли у вас готовые материалы или вы хотите обучиться их созданию.";

function trimValue(value: FormDataEntryValue | null | undefined): string {
  return String(value ?? "").trim();
}

export function normalizeAuthorApplicationFormValues(
  formData: FormData,
): AuthorApplicationFormValues {
  return {
    displayName: trimValue(formData.get("displayName")),
    direction: trimValue(formData.get("direction")),
    about: trimValue(formData.get("about")),
    contact: trimValue(formData.get("contact")),
    hasReadyMaterials: formData.get("hasReadyMaterials") === "on",
    wantsTraining: formData.get("wantsTraining") === "on",
    consentPersonalData: formData.get("consentPersonalData") === "on",
  };
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

  if (
    values.direction.length < AUTHOR_APPLICATION_LIMITS.directionMin ||
    values.direction.length > AUTHOR_APPLICATION_LIMITS.directionMax
  ) {
    errors.direction = `Опишите направление (${AUTHOR_APPLICATION_LIMITS.directionMin}–${AUTHOR_APPLICATION_LIMITS.directionMax} символов).`;
  }

  if (
    values.about.length < AUTHOR_APPLICATION_LIMITS.aboutMin ||
    values.about.length > AUTHOR_APPLICATION_LIMITS.aboutMax
  ) {
    errors.about = `Расскажите о себе и опыте (${AUTHOR_APPLICATION_LIMITS.aboutMin}–${AUTHOR_APPLICATION_LIMITS.aboutMax} символов).`;
  }

  if (
    values.contact.length < AUTHOR_APPLICATION_LIMITS.contactMin ||
    values.contact.length > AUTHOR_APPLICATION_LIMITS.contactMax
  ) {
    errors.contact =
      values.contact.length === 0
        ? "Укажите телефон, MAX или другой способ связи."
        : `Контакт слишком длинный (до ${AUTHOR_APPLICATION_LIMITS.contactMax} символов).`;
  }

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
    | "contact"
    | "has_ready_materials"
    | "consent_personal_data"
  > & {
    wants_training?: boolean;
  },
): AuthorApplicationFormValues {
  return {
    displayName: row.display_name,
    direction: row.direction,
    about: row.about,
    contact: row.contact ?? "",
    hasReadyMaterials: row.has_ready_materials,
    wantsTraining: row.wants_training ?? false,
    consentPersonalData: row.consent_personal_data,
  };
}
