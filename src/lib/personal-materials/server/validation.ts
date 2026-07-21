import {
  PERSONAL_MATERIAL_LIMITS,
  PERSONAL_MATERIAL_TYPES,
} from "@/lib/personal-materials/types";
import {
  validateReturnButtonLabel,
  validateReturnUrl,
} from "@/lib/personal-materials/return-url";

import { PersonalMaterialApiError } from "./errors";
import { isValidMaterialType } from "./repository";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  return trimmed;
}

function normalizeOptionalClientName(value: unknown, maxLength: number): string | null {
  const normalized = normalizeOptionalText(value, maxLength);

  if (normalized && !/^[\p{L}\p{M}\s'.-]+$/u.test(normalized)) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  return normalized;
}

function parseMaterialDate(value: unknown): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  return value.trim();
}

function parseReturnUrlField(value: unknown): string | null {
  const parsed = validateReturnUrl(
    value === undefined ? null : (value as string | null),
  );

  if (!parsed.valid) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  return parsed.normalized;
}

function parseReturnButtonLabelField(value: unknown): string | null {
  const parsed = validateReturnButtonLabel(
    value === undefined ? null : (value as string | null),
  );

  if (!parsed.valid) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  return parsed.normalized;
}

export function parseCreatePersonalMaterialBody(body: unknown) {
  if (typeof body !== "object" || body === null) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const record = body as Record<string, unknown>;
  const authorId = typeof record.authorId === "string" ? record.authorId.trim() : "";

  if (!authorId) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const materialTypeRaw =
    typeof record.materialType === "string" ? record.materialType.trim() : "diagnostic";

  if (!isValidMaterialType(materialTypeRaw)) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  return {
    authorId,
    materialType: materialTypeRaw,
    title: normalizeOptionalText(record.title, PERSONAL_MATERIAL_LIMITS.titleMaxLength),
    clientFirstName: normalizeOptionalClientName(
      record.clientFirstName,
      PERSONAL_MATERIAL_LIMITS.clientNameMaxLength,
    ),
    clientLastName: normalizeOptionalClientName(
      record.clientLastName,
      PERSONAL_MATERIAL_LIMITS.clientNameMaxLength,
    ),
    materialDate: parseMaterialDate(record.materialDate),
    description: normalizeOptionalText(
      record.description,
      PERSONAL_MATERIAL_LIMITS.descriptionMaxLength,
    ),
    personalRecommendation: normalizeOptionalText(
      record.personalRecommendation,
      PERSONAL_MATERIAL_LIMITS.recommendationMaxLength,
    ),
    returnUrl: parseReturnUrlField(record.returnUrl),
    returnButtonLabel: parseReturnButtonLabelField(record.returnButtonLabel),
  };
}

export function parseUpdatePersonalMaterialBody(body: unknown) {
  if (typeof body !== "object" || body === null) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const record = body as Record<string, unknown>;

  const materialType =
    record.materialType === undefined
      ? undefined
      : typeof record.materialType === "string" &&
          isValidMaterialType(record.materialType.trim())
        ? record.materialType.trim()
        : (() => {
            throw new PersonalMaterialApiError("invalid_request", 400);
          })();

  return {
    materialType,
    title:
      record.title === undefined
        ? undefined
        : normalizeOptionalText(record.title, PERSONAL_MATERIAL_LIMITS.titleMaxLength),
    clientFirstName:
      record.clientFirstName === undefined
        ? undefined
        : normalizeOptionalClientName(
            record.clientFirstName,
            PERSONAL_MATERIAL_LIMITS.clientNameMaxLength,
          ),
    clientLastName:
      record.clientLastName === undefined
        ? undefined
        : normalizeOptionalClientName(
            record.clientLastName,
            PERSONAL_MATERIAL_LIMITS.clientNameMaxLength,
          ),
    materialDate:
      record.materialDate === undefined
        ? undefined
        : parseMaterialDate(record.materialDate),
    description:
      record.description === undefined
        ? undefined
        : normalizeOptionalText(
            record.description,
            PERSONAL_MATERIAL_LIMITS.descriptionMaxLength,
          ),
    personalRecommendation:
      record.personalRecommendation === undefined
        ? undefined
        : normalizeOptionalText(
            record.personalRecommendation,
            PERSONAL_MATERIAL_LIMITS.recommendationMaxLength,
          ),
    returnUrl:
      record.returnUrl === undefined ? undefined : parseReturnUrlField(record.returnUrl),
    returnButtonLabel:
      record.returnButtonLabel === undefined
        ? undefined
        : parseReturnButtonLabelField(record.returnButtonLabel),
  };
}

export function parseActivateBody(body: unknown): { expiresAt: string | null } {
  if (body === null || body === undefined) {
    return { expiresAt: null };
  }

  if (typeof body !== "object") {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const record = body as Record<string, unknown>;

  if (record.expiresAt === null || record.expiresAt === undefined) {
    return { expiresAt: null };
  }

  if (typeof record.expiresAt !== "string") {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  const parsed = new Date(record.expiresAt);

  if (Number.isNaN(parsed.getTime())) {
    throw new PersonalMaterialApiError("invalid_request", 400);
  }

  return { expiresAt: parsed.toISOString() };
}

export function assertKnownMaterialTypes() {
  return PERSONAL_MATERIAL_TYPES;
}
