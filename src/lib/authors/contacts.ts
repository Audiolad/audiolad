import {
  AUTHOR_CONTACT_CUSTOM_ICON_SRC,
  AUTHOR_CONTACT_PLATFORM_PUBLIC_LABELS,
  AUTHOR_CONTACT_PLATFORMS,
  AUTHOR_CONTACT_STANDARD_ICON_SRC,
  type AuthorContactPlatform,
} from "./constants";

export type AuthorContactRow = {
  id: string;
  author_id: string;
  platform: AuthorContactPlatform;
  title: string;
  description: string | null;
  url: string;
  icon_url: string | null;
  icon_path: string | null;
  icon_image?: unknown;
  sort_order: number;
  is_visible: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AuthorProfileContact = {
  id: string;
  platform: AuthorContactPlatform;
  title: string;
  description: string | null;
  url: string;
  iconUrl: string | null;
  iconPath: string | null;
  iconImage?: unknown;
  sortOrder: number;
  isVisible: boolean;
};

export type AuthorPublicContact = {
  platform: AuthorContactPlatform;
  platformLabel: string;
  title: string;
  description: string | null;
  url: string;
  iconUrl: string;
  openInNewTab: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAuthorContactPlatform(
  value: unknown,
): value is AuthorContactPlatform {
  return (
    typeof value === "string" &&
    (AUTHOR_CONTACT_PLATFORMS as readonly string[]).includes(value)
  );
}

export function isAuthorContactId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isMailtoContactUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith("mailto:");
}

export function resolveAuthorContactIconUrl(
  platform: AuthorContactPlatform,
  iconUrl?: string | null,
): string {
  const uploaded = iconUrl?.trim();

  if (uploaded) {
    return uploaded;
  }

  if (platform === "telegram" || platform === "max") {
    return AUTHOR_CONTACT_STANDARD_ICON_SRC[platform];
  }

  return AUTHOR_CONTACT_CUSTOM_ICON_SRC;
}

export function mapAuthorContactRow(
  row: AuthorContactRow,
): AuthorProfileContact {
  return {
    id: row.id,
    platform: row.platform,
    title: row.title,
    description: row.description?.trim() || null,
    url: row.url,
    iconUrl: row.icon_url,
    iconPath: row.icon_path,
    iconImage: row.icon_image,
    sortOrder: row.sort_order,
    isVisible: row.is_visible,
  };
}

export function toAuthorPublicContact(
  contact: AuthorProfileContact,
): AuthorPublicContact {
  return {
    platform: contact.platform,
    platformLabel: AUTHOR_CONTACT_PLATFORM_PUBLIC_LABELS[contact.platform],
    title: contact.title,
    description: contact.description,
    url: contact.url,
    iconUrl: resolveAuthorContactIconUrl(contact.platform, contact.iconUrl),
    openInNewTab: !isMailtoContactUrl(contact.url),
  };
}

export function selectVisibleAuthorContacts(
  contacts: AuthorProfileContact[],
): AuthorPublicContact[] {
  return contacts
    .filter((contact) => contact.isVisible)
    .map(toAuthorPublicContact);
}

export function collectAuthorContactSameAs(
  contacts: AuthorPublicContact[],
): string[] {
  return contacts
    .map((contact) => contact.url.trim())
    .filter((url) => url.toLowerCase().startsWith("https://"));
}
