import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";

export const ADMIN_SALES_PAGE_SIZE = 20;
export const PLATFORM_OWNER_SALE_EMAIL = "1@audiolad.ru";

export type AdminSaleBuyerKind = "self_purchase" | "external";

export type AdminSaleListItem = {
  paymentId: string;
  orderId: string;
  paidAt: string | null;
  buyerUserId: string | null;
  buyerName: string;
  buyerEmail: string | null;
  productTitle: string;
  authorId: string | null;
  authorName: string;
  amountMinor: number;
  currency: string;
  paymentStatus: string;
  orderStatus: string | null;
  buyerKind: AdminSaleBuyerKind | null;
};

export type AdminSaleDetail = AdminSaleListItem & {
  practiceId: string | null;
  practiceSlug: string | null;
  provider: string | null;
  providerPaymentId: string | null;
  checkoutOriginPath: string | null;
  createdAt: string | null;
  confirmedAt: string | null;
  isTest: boolean;
};

export type AdminSalesPageData = {
  sales: AdminSaleListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export function formatAdminSaleAmount(
  amountMinor: number,
  currency = "RUB",
): string {
  if (currency && currency !== "RUB") {
    const major = (amountMinor / 100).toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${major} ${currency}`;
  }

  return formatRubFromMinor(amountMinor);
}

export function getAdminPaymentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "succeeded":
      return "Оплачено";
    case "pending":
      return "Ожидает оплаты";
    case "created":
      return "Создан";
    case "failed":
      return "Ошибка";
    case "cancelled":
      return "Отменён";
    default:
      return status?.trim() || "—";
  }
}

export function getAdminOrderStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "paid":
      return "Оплачен";
    case "pending":
      return "Ожидает оплаты";
    case "refunded":
      return "Возврат";
    case "cancelled":
      return "Отменён";
    case "failed":
      return "Ошибка";
    default:
      return status?.trim() || "—";
  }
}

export function getAdminSaleStatusLabel(input: {
  paymentStatus: string | null | undefined;
  orderStatus?: string | null;
}): string {
  if (input.orderStatus === "refunded") {
    return getAdminOrderStatusLabel("refunded");
  }

  return getAdminPaymentStatusLabel(input.paymentStatus);
}

export function normalizeComparableEmail(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * Reliable self-purchase only: same user id, or same confirmed account email.
 * Display names are never used. Missing author-account data → omit badge.
 */
export function detectAdminSaleBuyerKind(input: {
  buyerUserId?: string | null;
  buyerEmail?: string | null;
  authorMemberUserIds?: readonly string[] | null;
  authorMemberEmails?: readonly string[] | null;
}): AdminSaleBuyerKind | null {
  const memberUserIds = (input.authorMemberUserIds ?? []).filter(
    (id): id is string => Boolean(id?.trim()),
  );
  const memberEmails = (input.authorMemberEmails ?? [])
    .map((email) => normalizeComparableEmail(email))
    .filter((email): email is string => Boolean(email));

  if (memberUserIds.length === 0 && memberEmails.length === 0) {
    return null;
  }

  const buyerUserId = input.buyerUserId?.trim() || null;
  const buyerEmail = normalizeComparableEmail(input.buyerEmail);

  if (buyerUserId && memberUserIds.includes(buyerUserId)) {
    return "self_purchase";
  }

  if (buyerEmail && memberEmails.includes(buyerEmail)) {
    return "self_purchase";
  }

  if (!buyerUserId && !buyerEmail) {
    return null;
  }

  return "external";
}

export function getAdminSaleBuyerKindLabel(
  kind: AdminSaleBuyerKind | null,
): string | null {
  if (kind === "self_purchase") {
    return "Автор / самопокупка";
  }

  if (kind === "external") {
    return "Внешний покупатель";
  }

  return null;
}

export function buildAdminSaleBuyerName(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmed = fullName?.trim();
  if (trimmed) {
    return trimmed;
  }

  const localPart = email?.split("@")[0]?.trim();
  if (localPart) {
    return localPart;
  }

  return "Покупатель";
}

export function buildPlatformOwnerSaleSubject(input: {
  amountMinor: number;
  productTitle: string;
  currency?: string;
}): string {
  const amount = formatAdminSaleAmount(input.amountMinor, input.currency ?? "RUB");
  const title = input.productTitle.trim() || "Продукт";
  return `Новая продажа — ${amount} — ${title}`;
}

export function shouldNotifyPlatformOwnerOfSale(input: {
  ok: boolean;
  paymentStatus: string | null | undefined;
  isTest: boolean;
  paymentId: string | null | undefined;
  orderId: string | null | undefined;
}): boolean {
  return (
    input.ok === true &&
    input.paymentStatus === "succeeded" &&
    input.isTest !== true &&
    Boolean(input.paymentId?.trim()) &&
    Boolean(input.orderId?.trim())
  );
}

export function resolvePlatformOwnerSaleNotifyIntent(
  existingStatus: "pending" | "sent" | "failed" | null | undefined,
): "send" | "skip" {
  if (existingStatus === "sent") {
    return "skip";
  }

  return "send";
}
