import {
  AUTHOR_CONTACT_PLATFORMS,
  MAX_AUTHOR_CONTACTS,
  MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH,
  MAX_AUTHOR_CONTACT_TITLE_LENGTH,
  MAX_AUTHOR_CONTACT_URL_LENGTH,
  type AuthorContactPlatform,
} from "./constants";
import {
  isAuthorContactId,
  isAuthorContactPlatform,
  toSafeAuthorContactHref,
} from "./contacts";

export type NormalizedAuthorContact = {
  id: string;
  platform: AuthorContactPlatform;
  title: string;
  description: string | null;
  url: string;
  iconUrl: string | null;
  iconPath: string | null;
  iconImage: unknown;
  isVisible: boolean;
};

const BLOCKED_URL_SCHEMES = [
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "http:",
] as const;

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

export function normalizeAuthorContactPlatform(
  value: unknown,
): AuthorContactPlatform | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return isAuthorContactPlatform(normalized) ? normalized : null;
}

export function normalizeAuthorContactTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > MAX_AUTHOR_CONTACT_TITLE_LENGTH) {
    return null;
  }

  return trimmed;
}

export function normalizeAuthorContactDescription(
  value: unknown,
): string | null {
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

  if (trimmed.length > MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH) {
    return null;
  }

  return trimmed;
}

export function normalizeAuthorContactUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > MAX_AUTHOR_CONTACT_URL_LENGTH) {
    return null;
  }

  if (hasControlCharacters(trimmed)) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  if (BLOCKED_URL_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    return null;
  }

  return toSafeAuthorContactHref(trimmed);
}

export function getAuthorContactTitleError(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return "Укажите название контакта.";
  }

  if (trimmed.length > MAX_AUTHOR_CONTACT_TITLE_LENGTH) {
    return `Название не должно превышать ${MAX_AUTHOR_CONTACT_TITLE_LENGTH} символов.`;
  }

  return null;
}

export function getAuthorContactDescriptionError(value: string): string | null {
  if (value.trim().length > MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH) {
    return `Короткий текст не должен превышать ${MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH} символов.`;
  }

  return null;
}

export function getAuthorContactUrlError(value: string): string | null {
  if (!value.trim()) {
    return "Укажите ссылку.";
  }

  if (normalizeAuthorContactUrl(value) === null) {
    return "Укажите обычную https-ссылку или email в формате mailto:.";
  }

  return null;
}

function normalizeOptionalStorageText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeAuthorContacts(
  value: unknown,
): NormalizedAuthorContact[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (value.length > MAX_AUTHOR_CONTACTS) {
    return null;
  }

  const contacts: NormalizedAuthorContact[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";

    if (!isAuthorContactId(id) || seenIds.has(id)) {
      return null;
    }

    const platform = normalizeAuthorContactPlatform(row.platform);
    const title = normalizeAuthorContactTitle(row.title);
    const description = normalizeAuthorContactDescription(row.description);
    const url = normalizeAuthorContactUrl(row.url);

    if (!platform || !title || !url) {
      return null;
    }

    if (
      row.description !== null &&
      row.description !== undefined &&
      typeof row.description === "string" &&
      row.description.trim().length > 0 &&
      description === null
    ) {
      return null;
    }

    seenIds.add(id);
    contacts.push({
      id,
      platform,
      title,
      description,
      url,
      iconUrl: normalizeOptionalStorageText(row.iconUrl ?? row.icon_url),
      iconPath: normalizeOptionalStorageText(row.iconPath ?? row.icon_path),
      iconImage: row.iconImage ?? row.icon_image ?? null,
      isVisible: row.isVisible === true || row.is_visible === true,
    });
  }

  return contacts;
}

export function listAuthorContactPlatforms(): readonly AuthorContactPlatform[] {
  return AUTHOR_CONTACT_PLATFORMS;
}
