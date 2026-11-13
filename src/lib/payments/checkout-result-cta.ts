import { getHostBrandName } from "@/lib/business-app/brand-icons";
import { BUSINESS_HOSTNAME, COFFEE_HOSTNAME } from "@/lib/business-app/host";
import { AUTHOR_PROJECT_CAPACITY_ORDER_KIND } from "@/lib/author-projects/capacity-catalog";
import { BUSINESS_CABINET_RETURN_PATH } from "@/lib/access-grants/paths";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { BUSINESS_ORIGIN, COFFEE_ORIGIN, coffeeHostEnabled } from "@/lib/business-app/host";
import { BUSINESS_SUBSCRIPTION_ORDER_KIND } from "@/lib/business/subscription-checkout";
import { STUDIO_MUSIC_ORDER_KIND } from "@/lib/studio-music/access";
import { buildPracticePublicPath } from "@/lib/products/paths";

export function buildLibraryPurchasedHref(practiceSlug: string | null): string {
  if (practiceSlug) {
    return `/my-practices?purchased=${encodeURIComponent(practiceSlug)}`;
  }

  return "/my-practices";
}

export function isStudioMusicLicenseCheckout(
  orderKind?: string | null,
): boolean {
  return orderKind === STUDIO_MUSIC_ORDER_KIND;
}

export function isAuthorProjectCapacityCheckout(
  orderKind?: string | null,
): boolean {
  return orderKind === AUTHOR_PROJECT_CAPACITY_ORDER_KIND;
}

/**
 * Site where the latest business subscription checkout was started in this browser.
 * Set by the checkout API on `.audiolad.ru`, so a reused pending payment link (which keeps
 * the return URL of its first start) still returns to the current cabinet. Only an exact
 * allowlisted value is honoured; anything else falls back to the URL marker.
 */
export const CHECKOUT_RETURN_SITE_COOKIE = "al_checkout_return_site";
export const CHECKOUT_RETURN_SITE_MAX_AGE_SECONDS = 24 * 60 * 60;

export function resolveCheckoutReturnSite(
  cookieValue: string | null | undefined,
  paramValue: string | null | undefined,
): "coffee" | undefined {
  if (cookieValue === "coffee") return "coffee";
  if (cookieValue === "business") return undefined;
  return paramValue === "coffee" ? "coffee" : undefined;
}

export function readCheckoutReturnSiteCookie(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CHECKOUT_RETURN_SITE_COOKIE) return rest.join("=");
  }
  return null;
}

export function isBusinessSubscriptionCheckout(orderKind?: string | null): boolean {
  return orderKind === BUSINESS_SUBSCRIPTION_ORDER_KIND;
}

export function buildBusinessSubscriptionPaidHref(site?: string): string {
  if (coffeeHostEnabled() && site === "coffee") return `${COFFEE_ORIGIN}/cabinet#dostup`;
  return `${BUSINESS_ORIGIN}/#dostup`;
}

/** Apex sign-in. After the session exists, /auth/business-cabinet opens the cabinet anchor. */
export function buildBusinessSubscriptionSignInHref(site?: string): string {
  if (coffeeHostEnabled() && site === "coffee") {
    return `${COFFEE_ORIGIN}${buildAuthRouteHref("/auth/sign-in", `${BUSINESS_CABINET_RETURN_PATH}?site=coffee`)}`;
  }
  return buildAuthRouteHref("/auth/sign-in", BUSINESS_CABINET_RETURN_PATH);
}

export type BusinessCheckoutResultView =
  | "paid_authenticated"
  | "paid_unauthenticated"
  | "processing"
  | "failed"
  | "cancelled"
  | "refunded";

export type BusinessCheckoutResultCard = {
  title: string;
  description: string;
  /** Null when the primary control retries the payment check. */
  actionHref: string | null;
  actionLabel: string;
  secondaryHref: string | null;
  secondaryLabel: string | null;
};

function businessCabinetReturn(authenticated: boolean, site?: string): { href: string; label: string } {
  if (authenticated) {
    return { href: buildBusinessSubscriptionPaidHref(site), label: "Вернуться в кабинет" };
  }
  return { href: buildBusinessSubscriptionSignInHref(site), label: "Войти и вернуться в кабинет" };
}

/** Wording for a business_subscription return. Catalogue orders do not use this. */
export function businessCheckoutResultCard(
  view: BusinessCheckoutResultView,
  authenticated: boolean,
  site?: string,
): BusinessCheckoutResultCard {
  const brand = getHostBrandName(site === "coffee" ? COFFEE_HOSTNAME : BUSINESS_HOSTNAME);
  const back = businessCabinetReturn(view === "paid_unauthenticated" ? false : authenticated, site);

  if (view === "paid_authenticated") {
    return {
      title: "Оплата прошла. Доступ открыт.",
      description: `30 дней кабинета ${brand}. Автосписания нет.`,
      actionHref: buildBusinessSubscriptionPaidHref(site),
      actionLabel: "Вернуться в кабинет",
      secondaryHref: null,
      secondaryLabel: null,
    };
  }

  if (view === "paid_unauthenticated") {
    return {
      title: "Оплата получена",
      description: `30 дней кабинета ${brand} открыты на вашем аккаунте. Войдите по почте, указанной при оплате. Автосписания нет.`,
      actionHref: back.href,
      actionLabel: back.label,
      secondaryHref: null,
      secondaryLabel: null,
    };
  }

  if (view === "processing") {
    return {
      title: "Платёж обрабатывается",
      description: "Банк уже принял платёж. Иногда подтверждение занимает немного больше времени. После подтверждения доступ откроется в кабинете. Автосписания нет.",
      actionHref: null,
      actionLabel: "Проверить ещё раз",
      secondaryHref: back.href,
      secondaryLabel: back.label,
    };
  }

  if (view === "refunded") {
    return {
      title: "Оплата возвращена",
      description: "По этому заказу оформлен возврат. Кабинет и настройки на месте. Если нужна помощь, напишите на 1@audiolad.ru.",
      actionHref: back.href,
      actionLabel: back.label,
      secondaryHref: null,
      secondaryLabel: null,
    };
  }

  return {
    title: view === "cancelled" ? "Оплата отменена" : "Оплата не завершена",
    description: "Платёж не был завершён. В кабинете можно нажать «Оплатить» ещё раз.",
    actionHref: back.href,
    actionLabel: back.label,
    secondaryHref: null,
    secondaryLabel: null,
  };
}

export function buildAuthorProjectCapacityPaidHref(): string {
  return "/author-dashboard/projects/new";
}

export function buildStudioMusicPaidHref(): string {
  return "/studio";
}

export function buildPaidAuthenticatedPrimaryHref(input: {
  authorSlug: string | null;
  practiceSlug: string | null;
  orderKind?: string | null;
}): string {
  if (isStudioMusicLicenseCheckout(input.orderKind)) {
    return buildStudioMusicPaidHref();
  }

  if (isAuthorProjectCapacityCheckout(input.orderKind)) {
    return buildAuthorProjectCapacityPaidHref();
  }

  if (isBusinessSubscriptionCheckout(input.orderKind)) {
    return buildBusinessSubscriptionPaidHref();
  }

  const authorSlug = input.authorSlug?.trim() ?? "";
  const practiceSlug = input.practiceSlug?.trim() ?? "";

  if (authorSlug && practiceSlug) {
    return buildPracticePublicPath(authorSlug, practiceSlug);
  }

  return buildLibraryPurchasedHref(input.practiceSlug);
}
