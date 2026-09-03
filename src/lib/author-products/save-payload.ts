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

export function buildListenerAppreciationOverrideField(input: {
  canConfigureAppreciation: boolean;
  listenerAppreciationOverride: boolean | null;
}): { listener_appreciation_override?: boolean | null } {
  if (!input.canConfigureAppreciation) {
    return {};
  }

  return {
    listener_appreciation_override: input.listenerAppreciationOverride,
  };
}
