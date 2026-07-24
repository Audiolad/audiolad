export function buildArticlePath(slug: string): string {
  return `/articles/${slug.trim().toLowerCase()}`;
}

export function isValidArticleSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim());
}
