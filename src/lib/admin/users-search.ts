const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Same slug shape as assert_practice_moderation_ready. */
const PRODUCT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isAdminExactUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function isAdminProductSlugQuery(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && PRODUCT_SLUG_RE.test(trimmed);
}

export function escapeAdminUsersIlike(value: string): string {
  return value.replace(/[%_,]/g, "");
}

/**
 * PostgREST `.or()` filter for /admin/users search.
 * Keeps name/email ILIKE. Adds exact profile UUID and any extra user IDs
 * resolved from a product UUID or product slug.
 */
export function buildAdminUsersProfileSearchOr(input: {
  search: string;
  extraUserIds?: string[];
}): string {
  const trimmed = input.search.trim();
  const escaped = escapeAdminUsersIlike(trimmed);
  const filters: string[] = [
    `full_name.ilike.%${escaped}%`,
    `email.ilike.%${escaped}%`,
  ];

  if (isAdminExactUuid(trimmed)) {
    filters.push(`id.eq.${trimmed}`);
  }

  const extra = [...new Set((input.extraUserIds ?? []).filter(isAdminExactUuid))];
  if (extra.length > 0) {
    filters.push(`id.in.(${extra.join(",")})`);
  }

  return filters.join(",");
}

export function shouldLookupUsersByProduct(search: string): boolean {
  const trimmed = search.trim();
  return isAdminExactUuid(trimmed) || isAdminProductSlugQuery(trimmed);
}
