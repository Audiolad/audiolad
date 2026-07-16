import type { PromoSignupContext } from "./signup-context";

export function shouldRunPromoPostSignupHandler(
  isAuthenticated: boolean,
): boolean {
  return isAuthenticated;
}

export function isPromoSignupContextForPractice(
  context: PromoSignupContext | null,
  practiceId: string,
): boolean {
  return Boolean(context?.practiceId && context.practiceId === practiceId);
}
