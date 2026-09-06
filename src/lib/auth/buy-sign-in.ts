import { buildAuthRouteHref, resolveValidatedNextPath } from "@/lib/auth/routes";

export const PRACTICE_BUY_SIGN_IN_INTRO =
  "Войдите, чтобы купить этот материал. После входа нажмите Купить ещё раз.";

export const ACCESS_LINK_SIGN_IN_INTRO =
  "Войдите, чтобы открыть доступ по ссылке. После входа вы вернётесь на ту же страницу.";

export const DEFAULT_SIGN_IN_INTRO =
  "Войдите в аккаунт, чтобы продолжить слушать практики и управлять своей коллекцией.";

export function resolveBuySignInReturnPath(
  signInReturnPath?: string | null,
  currentPath = "",
): string {
  const explicit = signInReturnPath?.trim() ?? "";
  const current = currentPath.trim();

  return explicit || current;
}

export function buildBuySignInHref(
  signInReturnPath?: string | null,
  currentPath = "",
): string | null {
  const returnPath = resolveBuySignInReturnPath(signInReturnPath, currentPath);
  const validated = resolveValidatedNextPath(returnPath);

  if (!validated) {
    return null;
  }

  return buildAuthRouteHref("/auth/sign-in", validated);
}

export function isPracticeProductSignInNext(
  next: string | null | undefined,
): boolean {
  return (next ?? "").trim().startsWith("/practice/");
}

export function isAccessLinkSignInNext(
  next: string | null | undefined,
): boolean {
  const trimmed = (next ?? "").trim();
  return trimmed === "/access" || trimmed.startsWith("/access/");
}

export function resolveSignInIntroCopy(next: string | null | undefined): string {
  if (isAccessLinkSignInNext(next)) {
    return ACCESS_LINK_SIGN_IN_INTRO;
  }

  return isPracticeProductSignInNext(next)
    ? PRACTICE_BUY_SIGN_IN_INTRO
    : DEFAULT_SIGN_IN_INTRO;
}
