export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");

  if (at <= 0 || at === trimmed.length - 1) {
    return "***";
  }

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  const head = local.slice(0, 1);

  return `${head}***@${domain}`;
}

const REDACTED_KEY = /password|passwd|secret|token|smtp/i;

export function redactMailingLogFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (REDACTED_KEY.test(key)) {
      continue;
    }

    if (typeof value === "string" && value.includes("@")) {
      safe[key] = maskEmail(value);
      continue;
    }

    safe[key] = value;
  }

  return safe;
}

export function logMailingEvent(
  event: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  const safe = redactMailingLogFields(fields);
  console.info(event, safe);
  return safe;
}
