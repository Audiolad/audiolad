/**
 * Where a signed-in registered account continues after the gift step. "/" would only reload the
 * same gift block for an account without its own venue (it has no guest start and no gift yet):
 * /auth/business-return issues the email gift once (activateBusinessTrial) and then opens the
 * venue onboarding or the workspace. The business host has no /auth routes, so it uses audiolad.ru.
 */
export const GUEST_START_REGISTERED_REDIRECT = {
  coffee: "/auth/business-return?site=coffee",
  business: "https://audiolad.ru/auth/business-return",
} as const;
/** Every redirect the start can answer with; the client follows only these. */
export const GUEST_START_REDIRECTS: readonly string[] = ["/", GUEST_START_REGISTERED_REDIRECT.coffee, GUEST_START_REGISTERED_REDIRECT.business];
