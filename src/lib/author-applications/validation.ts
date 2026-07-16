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
  plannedContentMin: 20,
  plannedContentMax: 3000,
  linksMax: 2000,
  contactMax: 300,
} as const;

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
    plannedContent: trimValue(formData.get("plannedContent")),
    links: trimValue(formData.get("links")),
    contact: trimValue(formData.get("contact")),
    hasReadyMaterials: formData.get("hasReadyMaterials") === "on",
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
    values.plannedContent.length < AUTHOR_APPLICATION_LIMITS.plannedContentMin ||
    values.plannedContent.length > AUTHOR_APPLICATION_LIMITS.plannedContentMax
  ) {
    errors.plannedContent = `Опишите планируемые материалы (${AUTHOR_APPLICATION_LIMITS.plannedContentMin}–${AUTHOR_APPLICATION_LIMITS.plannedContentMax} символов).`;
  }

  if (values.links.length > AUTHOR_APPLICATION_LIMITS.linksMax) {
    errors.links = `Ссылки слишком длинные (до ${AUTHOR_APPLICATION_LIMITS.linksMax} символов).`;
  }

  if (values.contact.length > AUTHOR_APPLICATION_LIMITS.contactMax) {
    errors.contact = `Контакт слишком длинный (до ${AUTHOR_APPLICATION_LIMITS.contactMax} символов).`;
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
    | "planned_content"
    | "links"
    | "contact"
    | "has_ready_materials"
    | "consent_personal_data"
  >,
): AuthorApplicationFormValues {
  return {
    displayName: row.display_name,
    direction: row.direction,
    about: row.about,
    plannedContent: row.planned_content,
    links: row.links ?? "",
    contact: row.contact ?? "",
    hasReadyMaterials: row.has_ready_materials,
    consentPersonalData: row.consent_personal_data,
  };
}

