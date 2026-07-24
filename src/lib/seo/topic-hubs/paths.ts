export function buildTopicHubPath(slug: string): string {
  const normalized = slug.trim().toLowerCase();

  if (!normalized) {
    throw new Error("topic_hub_slug_required");
  }

  return `/topics/${normalized}`;
}

export function isValidTopicHubSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim().toLowerCase());
}
