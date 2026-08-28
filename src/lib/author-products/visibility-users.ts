export type PracticeVisibilityUser = {
  userId: string;
  displayName: string;
  createdAt?: string;
};

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
