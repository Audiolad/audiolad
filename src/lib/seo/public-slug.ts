/** Latin slug used in public product and author URLs. */
export function isValidPublicEntitySlug(
  value: string | null | undefined,
): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const slug = value.trim();

  if (slug.length < 1 || slug.length > 128) {
    return false;
  }

  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
