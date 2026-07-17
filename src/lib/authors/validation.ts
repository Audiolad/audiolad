import {
  AUTHOR_TYPES,
  MAX_FEATURED_PRODUCTS,
  MAX_SHORT_BIO_LENGTH,
  type AuthorType,
} from "./constants";

export function normalizeAuthorType(value: unknown): AuthorType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return (AUTHOR_TYPES as readonly string[]).includes(normalized)
    ? (normalized as AuthorType)
    : null;
}

export function normalizePublicName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 120) {
    return null;
  }

  return trimmed;
}

export function normalizeShortBio(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_SHORT_BIO_LENGTH) {
    return null;
  }

  return trimmed;
}

export function normalizeFullBio(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

export function normalizeTopicKeys(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const keys = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(keys)];
}

export function normalizeFeaturedProductIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (ids.length > MAX_FEATURED_PRODUCTS) {
    return null;
  }

  if (new Set(ids).size !== ids.length) {
    return null;
  }

  return ids;
}

export function getShortBioLengthError(length: number): string | null {
  if (length > MAX_SHORT_BIO_LENGTH) {
    return `Короткое описание не должно превышать ${MAX_SHORT_BIO_LENGTH} символов.`;
  }

  return null;
}
