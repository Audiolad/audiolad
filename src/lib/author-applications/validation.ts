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
  contactMin: 1,
  contactMax: 300,
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
): FormData {
  const formData = new FormData();

  formData.set("displayName", values.displayName);

  for (const direction of values.selectedDirections) {
    formData.append("directionOptions", direction);
  }

  formData.set("directionOther", values.directionOther);
  formData.set("about", values.about);
  formData.set("contact", values.contact);

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
    contact: trimValue(formData.get("contact")),
    hasReadyMaterials: formData.get("hasReadyMaterials") === "on",
    wantsTraining: formData.get("wantsTraining") === "on",
    interestedInSchool: formData.get("interestedInSchool") === "on",
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
    interested_in_school?: boolean;
  },
): AuthorApplicationFormValues {
  const parsedDirection = parseStoredDirection(row.direction);

  return {
    displayName: row.display_name,
    selectedDirections: parsedDirection.selectedDirections,
    directionOther: parsedDirection.directionOther,
    direction: row.direction,
    about: row.about,
    contact: row.contact ?? "",
    hasReadyMaterials: row.has_ready_materials,
    wantsTraining: row.wants_training ?? false,
    interestedInSchool: row.interested_in_school ?? false,
    consentPersonalData: row.consent_personal_data,
  };
}
