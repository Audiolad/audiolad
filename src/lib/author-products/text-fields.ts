/**
 * Normalizes optional text fields for product/audio PATCH payloads.
 * Empty and whitespace-only strings become null so the database clears the field.
 */
export function normalizeClearableTextField(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("invalid_text_field");
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function isClearableTextFieldProvided(body: object, key: string): boolean {
  return key in body;
}
