import { PERSONAL_MATERIAL_LIMITS } from "@/lib/personal-materials/types";
import {
  validateReturnButtonLabel,
  validateReturnUrl,
} from "@/lib/personal-materials/return-url";

const CLIENT_NAME_PATTERN = /^[\p{L}\p{M}\s'.-]+$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type PersonalMaterialFormValues = {
  materialType: string;
  clientFirstName: string;
  clientLastName: string;
  materialDate: string;
  title: string;
  description: string;
  personalRecommendation: string;
  returnUrl: string;
  returnButtonLabel: string;
};

export type PersonalMaterialFormErrors = Partial<
  Record<keyof PersonalMaterialFormValues, string>
>;

export function validatePersonalMaterialForm(
  values: PersonalMaterialFormValues,
): PersonalMaterialFormErrors {
  const errors: PersonalMaterialFormErrors = {};

  const firstName = values.clientFirstName.trim();
  const lastName = values.clientLastName.trim();
  const materialDate = values.materialDate.trim();
  const title = values.title.trim();
  const description = values.description.trim();
  const recommendation = values.personalRecommendation.trim();
  const returnUrl = (values.returnUrl ?? "").trim();
  const returnButtonLabel = (values.returnButtonLabel ?? "").trim();

  if (!firstName || firstName.length > PERSONAL_MATERIAL_LIMITS.clientNameMaxLength) {
    errors.clientFirstName = "Укажите имя клиента.";
  } else if (!CLIENT_NAME_PATTERN.test(firstName)) {
    errors.clientFirstName = "Имя содержит недопустимые символы.";
  }

  if (!lastName || lastName.length > PERSONAL_MATERIAL_LIMITS.clientNameMaxLength) {
    errors.clientLastName = "Укажите фамилию клиента.";
  } else if (!CLIENT_NAME_PATTERN.test(lastName)) {
    errors.clientLastName = "Фамилия содержит недопустимые символы.";
  }

  if (!DATE_PATTERN.test(materialDate)) {
    errors.materialDate = "Укажите корректную дату.";
  }

  if (title.length > PERSONAL_MATERIAL_LIMITS.titleMaxLength) {
    errors.title = `Название не длиннее ${PERSONAL_MATERIAL_LIMITS.titleMaxLength} символов.`;
  }

  if (description.length > PERSONAL_MATERIAL_LIMITS.descriptionMaxLength) {
    errors.description = "Описание слишком длинное.";
  }

  if (recommendation.length > PERSONAL_MATERIAL_LIMITS.recommendationMaxLength) {
    errors.personalRecommendation = "Рекомендация слишком длинная.";
  }

  if (returnUrl) {
    const parsedReturnUrl = validateReturnUrl(returnUrl);

    if (!parsedReturnUrl.valid) {
      errors.returnUrl = "Укажите корректную HTTPS-ссылку на чат.";
    }
  }

  if (returnButtonLabel) {
    const parsedLabel = validateReturnButtonLabel(returnButtonLabel);

    if (!parsedLabel.valid) {
      errors.returnButtonLabel = "Текст кнопки не длиннее 120 символов.";
    }
  }

  return errors;
}

export function isAllowedClientMp3File(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (!name.endsWith(".mp3")) {
    return false;
  }

  if (type && type !== "audio/mpeg" && type !== "audio/mp3") {
    return false;
  }

  return true;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) {
    return "";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} КБ`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function formatMaterialDateLabel(value: string): string {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}.${month}.${year}`;
}

export function formatCreatedAtLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getDefaultMaterialDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
