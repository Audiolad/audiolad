const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;

export function splitEmailAddress(
  email: string,
): { localPart: string; domain: string } | null {
  const atIndex = email.indexOf("@");

  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) {
    return null;
  }

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (!localPart || !domain) {
    return null;
  }

  return { localPart, domain };
}

export function normalizeEmailInput(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed) {
    return "";
  }

  const parts = splitEmailAddress(trimmed);

  if (!parts) {
    return trimmed;
  }

  return `${parts.localPart}@${parts.domain.toLowerCase()}`;
}

export function containsControlCharacters(value: string): boolean {
  return CONTROL_CHAR_RE.test(value);
}
