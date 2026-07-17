/** Stable slugs for the default guest welcome listen session. */
export const DEFAULT_WELCOME_PRACTICE = {
  authorSlug: "sergey-and-zoya",
  practiceSlug: "klyuch-k-izobiliyu",
} as const;

export type WelcomePracticeTarget = {
  authorSlug: string;
  productSlug: string;
};

export function getDefaultWelcomeListenTarget(): WelcomePracticeTarget {
  return {
    authorSlug: DEFAULT_WELCOME_PRACTICE.authorSlug,
    productSlug: DEFAULT_WELCOME_PRACTICE.practiceSlug,
  };
}
