export function buildListenPagePath(slug: string): string {
  return `/listens/${slug.trim().toLowerCase()}`;
}

export function isValidListenPageSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim());
}
