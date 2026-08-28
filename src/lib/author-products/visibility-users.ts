export type PracticeVisibilityUser = {
  userId: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  maskedEmail?: string | null;
  createdAt?: string;
};

export type PracticeVisibilitySearchHit = {
  userId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  maskedEmail: string | null;
};

export type VisibilitySearchProfile = {
  userId: string;
  fullName?: string | null;
  email?: string | null;
};

export const VISIBILITY_SEARCH_MIN_QUERY_LENGTH = 2;
export const VISIBILITY_SEARCH_LIMIT = 10;
export const VISIBILITY_SEARCH_DEBOUNCE_MS = 300;
export const VISIBILITY_SEARCH_PUBLIC_KEYS = [
  "userId",
  "displayName",
  "firstName",
  "lastName",
  "maskedEmail",
] as const;

const PRIVATE_VISIBILITY_SEARCH_KEYS = [
  "email",
  "phone",
  "phone_number",
  "raw_user_meta_data",
  "user_metadata",
  "app_metadata",
  "role",
  "aud",
  "created_at",
  "last_sign_in_at",
  "confirmation_token",
  "encrypted_password",
  "identities",
] as const;

export function normalizeVisibilityLookupQuery(value: string): string {
  return value.trim();
}

export function isVisibilityLookupUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

export function isVisibilityLookupEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes("@") && !trimmed.includes(" ");
}

export function validateVisibilityLookupQuery(value: string): string | null {
  const query = normalizeVisibilityLookupQuery(value);

  if (!query) {
    return "Введите email или UUID пользователя";
  }

  if (isVisibilityLookupUuid(query) || isVisibilityLookupEmail(query)) {
    return null;
  }

  return "Введите точный email или UUID";
}

export function shouldSearchVisibilityUsers(value: string): boolean {
  const query = normalizeVisibilityLookupQuery(value);

  if (!query) {
    return false;
  }

  if (isVisibilityLookupUuid(query) || isVisibilityLookupEmail(query)) {
    return true;
  }

  return query.length >= VISIBILITY_SEARCH_MIN_QUERY_LENGTH;
}

export function validateVisibilitySearchQuery(value: string): string | null {
  if (shouldSearchVisibilityUsers(value)) {
    return null;
  }

  return "Введите имя, фамилию, email или UUID";
}

export function isVisibilityEmailQuery(value: string): boolean {
  return isVisibilityLookupEmail(value);
}

export function maskVisibilityEmail(
  email: string | null | undefined,
): string | null {
  const value = (email ?? "").trim();
  const at = value.indexOf("@");

  if (at <= 0 || at >= value.length - 1) {
    return null;
  }

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);

  if (!local || !domain || domain.includes("@")) {
    return null;
  }

  if (local.length <= 1) {
    return `***@${domain}`;
  }

  if (local.length === 2) {
    return `${local[0]}***@${domain}`;
  }

  if (local.length <= 4) {
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }

  return `${local.slice(0, 2)}***${local.slice(-2)}@${domain}`;
}

export function splitVisibilityDisplayName(fullName: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
} {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return {
      firstName: null,
      lastName: null,
      displayName: "Пользователь",
    };
  }

  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
    displayName: parts.join(" "),
  };
}

export function formatVisibilityUserPrimaryLabel(user: {
  userId: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const fromParts = [user.firstName, user.lastName]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fromParts && !isVisibilityLookupUuid(fromParts)) {
    return fromParts;
  }

  const display = user.displayName?.trim() ?? "";

  if (display && !isVisibilityLookupUuid(display)) {
    return display;
  }

  if (isVisibilityLookupUuid(display)) {
    return display;
  }

  if (isVisibilityLookupUuid(user.userId)) {
    return user.userId;
  }

  return "Пользователь";
}

export function isVisibilityUserAlreadySelected(
  users: Array<{ userId: string }>,
  userId: string,
): boolean {
  return users.some((user) => user.userId === userId);
}

export function profileMatchesVisibilitySearchQuery(
  profile: VisibilitySearchProfile,
  rawQuery: string,
): boolean {
  if (!shouldSearchVisibilityUsers(rawQuery)) {
    return false;
  }

  const query = normalizeVisibilityLookupQuery(rawQuery);

  if (isVisibilityLookupUuid(query)) {
    return profile.userId.toLowerCase() === query.toLowerCase();
  }

  const lowered = query.toLowerCase();

  if (isVisibilityEmailQuery(query)) {
    const email = (profile.email ?? "").trim().toLowerCase();
    return email.length > 0 && email === lowered;
  }

  const name = (profile.fullName ?? "").trim().toLowerCase();
  const tokens = lowered.split(/\s+/).filter(Boolean);

  return tokens.length > 0 && tokens.every((token) => name.includes(token));
}

export function searchVisibilityProfiles(
  profiles: VisibilitySearchProfile[],
  rawQuery: string,
  limit = VISIBILITY_SEARCH_LIMIT,
): PracticeVisibilitySearchHit[] {
  if (!shouldSearchVisibilityUsers(rawQuery)) {
    return [];
  }

  const hits: PracticeVisibilitySearchHit[] = [];

  for (const profile of profiles) {
    if (!profileMatchesVisibilitySearchQuery(profile, rawQuery)) {
      continue;
    }

    hits.push(toVisibilitySearchHitFromProfile(profile));

    if (hits.length >= limit) {
      break;
    }
  }

  return hits;
}

export function toVisibilitySearchHitFromProfile(
  profile: VisibilitySearchProfile,
): PracticeVisibilitySearchHit {
  const names = splitVisibilityDisplayName(profile.fullName);

  return {
    userId: profile.userId,
    displayName: names.displayName,
    firstName: names.firstName,
    lastName: names.lastName,
    maskedEmail: maskVisibilityEmail(profile.email),
  };
}

export function toVisibilitySearchHit(
  row: Record<string, unknown> | null | undefined,
): PracticeVisibilitySearchHit | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const userId =
    (typeof row.user_id === "string" && row.user_id) ||
    (typeof row.userId === "string" && row.userId) ||
    "";

  if (!userId) {
    return null;
  }

  const names = splitVisibilityDisplayName(
    typeof row.display_name === "string"
      ? row.display_name
      : typeof row.displayName === "string"
        ? row.displayName
        : typeof row.full_name === "string"
          ? row.full_name
          : null,
  );

  const firstName =
    typeof row.first_name === "string"
      ? row.first_name
      : typeof row.firstName === "string"
        ? row.firstName
        : names.firstName;
  const lastName =
    typeof row.last_name === "string"
      ? row.last_name
      : typeof row.lastName === "string"
        ? row.lastName
        : names.lastName;
  const displayName =
    typeof row.display_name === "string" && row.display_name.trim()
      ? row.display_name.trim()
      : typeof row.displayName === "string" && row.displayName.trim()
        ? row.displayName.trim()
        : [firstName, lastName].filter(Boolean).join(" ").trim() ||
          names.displayName;
  const rawEmail =
    typeof row.masked_email === "string"
      ? row.masked_email
      : typeof row.maskedEmail === "string"
        ? row.maskedEmail
        : typeof row.email === "string"
          ? maskVisibilityEmail(row.email)
          : null;

  return {
    userId,
    displayName: isVisibilityLookupUuid(displayName)
      ? "Пользователь"
      : displayName || "Пользователь",
    firstName: firstName || null,
    lastName: lastName || null,
    maskedEmail:
      rawEmail && rawEmail.includes("***")
        ? rawEmail
        : maskVisibilityEmail(
            typeof row.email === "string" ? row.email : rawEmail,
          ),
  };
}

export function sanitizeVisibilitySearchHit(
  row: Record<string, unknown> | null | undefined,
): PracticeVisibilitySearchHit | null {
  const hit = toVisibilitySearchHit(row);

  if (!hit) {
    return null;
  }

  const sanitized: PracticeVisibilitySearchHit = {
    userId: hit.userId,
    displayName: hit.displayName,
    firstName: hit.firstName,
    lastName: hit.lastName,
    maskedEmail: hit.maskedEmail,
  };

  for (const key of PRIVATE_VISIBILITY_SEARCH_KEYS) {
    if (key in sanitized) {
      delete (sanitized as Record<string, unknown>)[key];
    }
  }

  return sanitized;
}

export function visibilitySearchHitHasPrivateFields(
  value: Record<string, unknown>,
): boolean {
  return PRIVATE_VISIBILITY_SEARCH_KEYS.some((key) => key in value);
}

export function visibilityJsonHasRawEmail(payload: unknown): boolean {
  const serialized = JSON.stringify(payload ?? null);

  if (/"email"\s*:/.test(serialized)) {
    return true;
  }

  const candidates =
    serialized.match(/[A-Za-z0-9._%+*-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];

  return candidates.some((value) => !value.includes("***"));
}

export function toVisibilityListUser(row: {
  user_id?: string;
  display_name?: string;
  first_name?: string | null;
  last_name?: string | null;
  masked_email?: string | null;
  created_at?: string;
}): PracticeVisibilityUser {
  const hit = sanitizeVisibilitySearchHit({
    user_id: row.user_id,
    display_name: row.display_name,
    first_name: row.first_name,
    last_name: row.last_name,
    masked_email: row.masked_email,
  });

  return {
    userId: hit?.userId ?? row.user_id ?? "",
    displayName: hit?.displayName ?? row.display_name ?? "Пользователь",
    firstName: hit?.firstName ?? row.first_name ?? null,
    lastName: hit?.lastName ?? row.last_name ?? null,
    maskedEmail: hit?.maskedEmail ?? null,
    createdAt: row.created_at,
  };
}
