import { AUTHOR_PROJECT_CAPACITY_ORDER_KIND } from "@/lib/author-projects/capacity-catalog";
import { BUSINESS_CABINET_RETURN_PATH } from "@/lib/access-grants/paths";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { BUSINESS_ORIGIN } from "@/lib/business-app/host";
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

export function isBusinessSubscriptionCheckout(orderKind?: string | null): boolean {
  return orderKind === BUSINESS_SUBSCRIPTION_ORDER_KIND;
}

export function buildBusinessSubscriptionPaidHref(): string {
  return `${BUSINESS_ORIGIN}/#dostup`;
}

/** Apex sign-in. After the session exists, /auth/business-cabinet opens the cabinet anchor. */
export function buildBusinessSubscriptionSignInHref(): string {
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

function businessCabinetReturn(authenticated: boolean): { href: string; label: string } {
  if (authenticated) {
    return { href: buildBusinessSubscriptionPaidHref(), label: "Вернуться в кабинет" };
  }
  return { href: buildBusinessSubscriptionSignInHref(), label: "Войти и вернуться в кабинет" };
}

/** Wording for a business_subscription return. Catalogue orders do not use this. */
export function businessCheckoutResultCard(
  view: BusinessCheckoutResultView,
  authenticated: boolean,
): BusinessCheckoutResultCard {
  const back = businessCabinetReturn(view === "paid_unauthenticated" ? false : authenticated);

  if (view === "paid_authenticated") {
    return {
      title: "Оплата прошла. Доступ открыт.",
      description: "30 дней кабинета АудиоЛад Бизнес. Автосписания нет.",
      actionHref: buildBusinessSubscriptionPaidHref(),
      actionLabel: "Вернуться в кабинет",
      secondaryHref: null,
      secondaryLabel: null,
    };
  }

  if (view === "paid_unauthenticated") {
    return {
      title: "Оплата получена",
      description: "30 дней кабинета АудиоЛад Бизнес открыты на вашем аккаунте. Войдите, чтобы открыть кабинет. Автосписания нет.",
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
