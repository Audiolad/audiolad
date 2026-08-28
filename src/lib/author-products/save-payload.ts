export function buildUnlockedProductIdentityFields(input: {
  slugLocked: boolean;
  authorId: string;
  slug: string;
}): { author_id?: string; slug?: string } {
  if (input.slugLocked) {
    return {};
  }

  return {
    author_id: input.authorId,
    slug: input.slug,
  };
}
