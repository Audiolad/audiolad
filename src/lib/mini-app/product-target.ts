/**
 * Platform-neutral product deep link: `p_<UUID without dashes>`.
 * MAX and VK both use this payload. Promo and messenger-specific links stay
 * in their own adapters.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPACT_UUID_RE = /^[0-9a-f]{32}$/i;

export function compactUuid(uuid: string): string | null {
  const normalized = uuid.trim().toLowerCase();
  if (!UUID_RE.test(normalized)) return null;
  return normalized.replaceAll("-", "");
}

export function expandCompactUuid(compact: string): string | null {
  const normalized = compact.trim().toLowerCase();
  if (!COMPACT_UUID_RE.test(normalized)) return null;
  const uuid = [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20),
  ].join("-");
  return UUID_RE.test(uuid) ? uuid : null;
}

export function buildProductStartPayload(practiceId: string): string | null {
  const compact = compactUuid(practiceId);
  return compact ? `p_${compact}` : null;
}

export function parseProductStartPayload(
  payload: string | null | undefined,
): { practiceId: string } | null {
  const normalized = payload?.trim();
  if (!normalized || normalized.length > 512) return null;

  const match = normalized.match(/^p_([0-9a-f]{32})$/i);
  if (!match) return null;

  const practiceId = expandCompactUuid(match[1] ?? "");
  if (!practiceId) return null;
  return { practiceId };
}
