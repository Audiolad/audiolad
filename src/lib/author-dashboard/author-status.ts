import type { AuthorCommercialApplicationStatus } from "@/lib/author-commercial-applications/types";
import {
  getCommercialShareDisplayLines,
  PLATFORM_COMMISSION_SCOPE_TEXT,
  resolveDisplayCommercialShare,
  type CommercialShareBps,
} from "@/lib/author-commercial/economics";
import { STARTER_FREE_PRODUCT_BEFORE_COMMERCIAL_HINT } from "@/lib/author-dashboard/free-author-first-step";
import type { AuthorPayoutProfileStatus } from "@/lib/author-payout-profiles/types";
import {
  isAuthorCommercialActiveAccess,
  type AuthorAccessStatus,
} from "@/lib/authors/access";
import { resolveAuthorCommercialCapabilities } from "@/lib/authors/commercial-capabilities";

export const AUTHOR_STATUS_VIEW_KINDS = [
  "starter",
  "commercial_pending",
  "commercial_ready_for_terms",
  "commercial_ready_for_payout",
  "commercial_active",
  "commercial_suspended",
  "workspace_blocked",
] as const;

export type AuthorStatusViewKind = (typeof AUTHOR_STATUS_VIEW_KINDS)[number];

export type AuthorStatusCta = {
  label: string;
  href: string | null;
  disabled: boolean;
  hint: string | null;
};

export type AuthorStatusOptionalPayoutSection = {
  title: string;
  description: string;
  cta: AuthorStatusCta;
};

export type AuthorStatusViewModel = {
  kind: AuthorStatusViewKind;
  currentTierLabel: "Стартовый" | "Коммерческий" | "Приостановлен";
  currentTierDescription: string;
  accessStatus: AuthorAccessStatus;
  applicationStatus: AuthorCommercialApplicationStatus | "none";
  termsAccepted: boolean;
  payoutProfileStatus: AuthorPayoutProfileStatus | null;
  role: "owner" | "editor";
  share: CommercialShareBps & { isIndividual: boolean };
  shareLines: {
    authorLine: string;
    platformLine: string;
    authorPercentLabel: string;
    platformPercentLabel: string;
  };
  platformCommissionScopeText: string;
  showStandardCommercialOffer: boolean;
  applicationSubmittedAt: string | null;
  applicationReviewComment: string | null;
  payoutReviewComment: string | null;
  cta: AuthorStatusCta;
  secondaryCtas: AuthorStatusCta[];
  optionalPayout: AuthorStatusOptionalPayoutSection | null;
  starterCapabilities: string[];
  commercialCapabilities: string[];
  premiumCapabilities: string[];
  paidProductsLocked: boolean;
  capabilities: ReturnType<typeof resolveAuthorCommercialCapabilities>;
};

export type ResolveAuthorStatusViewInput = {
  accessStatus: AuthorAccessStatus;
  applicationStatus: AuthorCommercialApplicationStatus | null;
  applicationSubmittedAt?: string | null;
  applicationReviewComment?: string | null;
  termsAccepted: boolean;
  publishedTermsAvailable: boolean;
  payoutProfileStatus: AuthorPayoutProfileStatus | null;
  payoutReviewComment?: string | null;
  individualShare?: {
    authorShareBps: number;
    platformShareBps: number;
  } | null;
  role: "owner" | "editor";
  authorSlug: string;
  /**
   * Shared free-product gate from authorHasPublishedFreeProductForCommercialGate.
   * When false/omitted, first commercial submit CTA stays blocked.
   */
  hasPublishedFreeProduct?: boolean;
};

const STARTER_CAPABILITIES = [
  "Публичная страница автора",
  "Бесплатные аудиопродукты",
  "Каталог",
  "Промостраницы и ссылки продвижения",
  "Базовая статистика",
  "Личные материалы",
  "Стандартные инструменты кабинета",
] as const;

const COMMERCIAL_CAPABILITIES = [
  "Публикация платных продуктов",
  "Установка цены",
  "Приём оплаты",
  "Получение авторского вознаграждения",
  "Финансовая статистика",
  "Учёт продаж и выплат",
  "Управление одним авторским проектом",
] as const;

const PREMIUM_CAPABILITIES = [
  "Расширенная аналитика",
  "Дополнительные инструменты продвижения",
  "Рекламные возможности",
  "Приоритетное размещение",
  "Управление тремя авторскими проектами из одного кабинета",
  "Расширенные отчёты",
] as const;

const STARTER_DESCRIPTION =
  "Стартовый статус позволяет оформить страницу автора, публиковать бесплатные аудиопродукты и пользоваться основными возможностями платформы.";

const COMMERCIAL_DESCRIPTION =
  "Коммерческий статус позволяет продавать аудиопродукты на АудиоЛаде и получать авторское вознаграждение.";

function withAuthorQuery(path: string, authorSlug: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}author=${encodeURIComponent(authorSlug)}`;
}

function normalizeApplicationStatus(
  status: AuthorCommercialApplicationStatus | null,
): AuthorCommercialApplicationStatus | "none" {
  return status ?? "none";
}

export function resolveAuthorStatusView(
  input: ResolveAuthorStatusViewInput,
): AuthorStatusViewModel {
  const applicationStatus = normalizeApplicationStatus(input.applicationStatus);
  const accessStatus = input.accessStatus;
  const share = resolveDisplayCommercialShare(input.individualShare);
  const shareLines = getCommercialShareDisplayLines(share);
  const capabilities = resolveAuthorCommercialCapabilities({
    accessStatus,
    publishedTermsAvailable: input.publishedTermsAvailable,
  });

  const base = {
    accessStatus,
    applicationStatus,
    termsAccepted: input.termsAccepted,
    payoutProfileStatus: input.payoutProfileStatus,
    role: input.role,
    share,
    shareLines,
    platformCommissionScopeText: PLATFORM_COMMISSION_SCOPE_TEXT,
    applicationSubmittedAt: input.applicationSubmittedAt ?? null,
    applicationReviewComment: input.applicationReviewComment ?? null,
    payoutReviewComment: input.payoutReviewComment ?? null,
    secondaryCtas: [] as AuthorStatusCta[],
    optionalPayout: null as AuthorStatusOptionalPayoutSection | null,
    starterCapabilities: [...STARTER_CAPABILITIES],
    commercialCapabilities: [...COMMERCIAL_CAPABILITIES],
    premiumCapabilities: [...PREMIUM_CAPABILITIES],
    capabilities,
  };

  const applicationHref = withAuthorQuery(
    "/author-dashboard/commercial-application",
    input.authorSlug,
  );
  const termsHref = withAuthorQuery(
    "/author-dashboard/commercial/terms",
    input.authorSlug,
  );
  const payoutHref = withAuthorQuery(
    "/author-dashboard/commercial/payout-details",
    input.authorSlug,
  );
  const legalHref = withAuthorQuery("/author-dashboard/legal", input.authorSlug);
  const productsHref = withAuthorQuery(
    "/author-dashboard/products",
    input.authorSlug,
  );
  const newProductHref = withAuthorQuery(
    "/author-dashboard/products/new",
    input.authorSlug,
  );
  const financeHref = withAuthorQuery(
    "/author-dashboard/finance",
    input.authorSlug,
  );
  const hasPublishedFreeProduct = input.hasPublishedFreeProduct === true;
  const createFreeProductCta: AuthorStatusCta = {
    label: "Создать бесплатный продукт",
    href: newProductHref,
    disabled: false,
    hint: null,
  };

  function buildOptionalPayoutSection(): AuthorStatusOptionalPayoutSection {
    const hasProfile = input.payoutProfileStatus != null;
    const pending =
      input.payoutProfileStatus === "submitted" ||
      input.payoutProfileStatus === "in_review";
    const needsChanges =
      input.payoutProfileStatus === "needs_changes" ||
      input.payoutProfileStatus === "rejected";
    const verified = input.payoutProfileStatus === "verified";

    return {
      title: "Данные для выплат",
      description:
        "Заполните реквизиты, когда захотите получить первое авторское вознаграждение.",
      cta: {
        label: verified
          ? "Реквизиты заполнены"
          : pending
            ? "Реквизиты отправлены"
            : needsChanges
              ? "Уточнить реквизиты"
              : hasProfile
                ? "Продолжить заполнение реквизитов"
                : "Заполнить реквизиты",
        href:
          verified || pending || !capabilities.can_edit_payout_profile
            ? null
            : payoutHref,
        disabled:
          verified ||
          pending ||
          !capabilities.can_edit_payout_profile ||
          input.role === "editor",
        hint:
          input.payoutReviewComment?.trim() ||
          (input.role === "editor"
            ? "Заполнить реквизиты может владелец кабинета автора."
            : null),
      },
    };
  }

  if (accessStatus === "suspended" || accessStatus === "terminated") {
    return {
      ...base,
      kind: "workspace_blocked",
      currentTierLabel: "Приостановлен",
      currentTierDescription:
        accessStatus === "terminated"
          ? "Авторский доступ завершён. Изменение и публикация материалов недоступны."
          : "Авторский доступ приостановлен. Изменение и публикация материалов временно недоступны.",
      showStandardCommercialOffer: false,
      paidProductsLocked: true,
      cta: {
        label: "Доступ ограничен",
        href: null,
        disabled: true,
        hint: "Повторная заявка сейчас недоступна. Если нужна помощь, напишите в поддержку АудиоЛада.",
      },
    };
  }

  if (accessStatus === "commercial_suspended") {
    return {
      ...base,
      kind: "commercial_suspended",
      currentTierLabel: "Коммерческий",
      currentTierDescription:
        "Коммерческие возможности временно приостановлены. Бесплатные материалы по-прежнему доступны.",
      showStandardCommercialOffer: true,
      paidProductsLocked: true,
      cta: {
        label: "Коммерция приостановлена",
        href: null,
        disabled: true,
        hint:
          input.applicationReviewComment?.trim() ||
          "Продажи временно недоступны. Бесплатные продукты и страница автора остаются доступны.",
      },
    };
  }

  if (isAuthorCommercialActiveAccess(accessStatus)) {
    return {
      ...base,
      kind: "commercial_active",
      currentTierLabel: "Коммерческий",
      currentTierDescription: COMMERCIAL_DESCRIPTION,
      showStandardCommercialOffer: true,
      paidProductsLocked: false,
      cta: {
        label: "Создать платный продукт",
        href: productsHref,
        disabled: false,
        hint: "Коммерческий статус активен. Можно создавать и публиковать платные продукты.",
      },
      secondaryCtas: [
        {
          label: "Перейти к финансам",
          href: financeHref,
          disabled: false,
          hint: null,
        },
      ],
      optionalPayout: buildOptionalPayoutSection(),
    };
  }

  const approvedPath =
    accessStatus === "commercial_onboarding" ||
    applicationStatus === "approved";

  if (approvedPath) {
    if (!input.termsAccepted) {
      return {
        ...base,
        kind: "commercial_ready_for_terms",
        currentTierLabel: "Стартовый",
        currentTierDescription: STARTER_DESCRIPTION,
        showStandardCommercialOffer: true,
        paidProductsLocked: true,
        cta: {
          label: "Принять Авторские условия",
          href: input.role === "owner" ? termsHref : legalHref,
          disabled: false,
          hint:
            input.role === "editor"
              ? "Принять условия может только владелец кабинета автора."
              : "После принятия условий коммерческий статус станет активным.",
        },
      };
    }

    // Terms accepted but access not yet flipped (rare race / legacy).
    // Do not block on payout profile — paid unlock follows access_status.
    return {
      ...base,
      kind: "commercial_ready_for_terms",
      currentTierLabel: "Стартовый",
      currentTierDescription: STARTER_DESCRIPTION,
      showStandardCommercialOffer: true,
      paidProductsLocked: true,
      cta: {
        label: "Коммерческий статус активируется",
        href: null,
        disabled: true,
        hint:
          "Условия приняты. Обновите страницу через несколько секунд — коммерческий доступ откроется автоматически.",
      },
      optionalPayout: buildOptionalPayoutSection(),
    };
  }

  if (
    accessStatus === "commercial_pending" ||
    applicationStatus === "submitted" ||
    applicationStatus === "in_review"
  ) {
    return {
      ...base,
      kind: "commercial_pending",
      currentTierLabel: "Стартовый",
      currentTierDescription: STARTER_DESCRIPTION,
      showStandardCommercialOffer: true,
      paidProductsLocked: true,
      cta: {
        label: "Заявка рассматривается",
        href: null,
        disabled: true,
        hint: input.applicationSubmittedAt
          ? `Заявка отправлена ${formatSubmittedAt(input.applicationSubmittedAt)}.`
          : "Заявка отправлена и ожидает решения.",
      },
    };
  }

  if (applicationStatus === "needs_changes") {
    return {
      ...base,
      kind: "commercial_pending",
      currentTierLabel: "Стартовый",
      currentTierDescription: STARTER_DESCRIPTION,
      showStandardCommercialOffer: true,
      paidProductsLocked: true,
      cta: {
        label: "Доработать заявку",
        href: applicationHref,
        disabled: false,
        hint:
          input.applicationReviewComment?.trim() ||
          "Нужно внести правки в заявку и отправить её снова.",
      },
    };
  }

  if (applicationStatus === "rejected") {
    return {
      ...base,
      kind: "starter",
      currentTierLabel: "Стартовый",
      currentTierDescription: STARTER_DESCRIPTION,
      showStandardCommercialOffer: true,
      paidProductsLocked: true,
      cta: {
        label: "Заявка отклонена",
        href: applicationHref,
        disabled: true,
        hint:
          input.applicationReviewComment?.trim() ||
          "Новая заявка недоступна, пока текущая запись не закрыта. При необходимости напишите в поддержку.",
      },
    };
  }

  if (applicationStatus === "draft") {
    return {
      ...base,
      kind: "starter",
      currentTierLabel: "Стартовый",
      currentTierDescription: STARTER_DESCRIPTION,
      showStandardCommercialOffer: true,
      paidProductsLocked: true,
      cta: {
        label: "Продолжить заявку на коммерческий статус",
        href: applicationHref,
        disabled: false,
        hint: hasPublishedFreeProduct
          ? null
          : STARTER_FREE_PRODUCT_BEFORE_COMMERCIAL_HINT,
      },
      secondaryCtas: hasPublishedFreeProduct ? [] : [createFreeProductCta],
    };
  }

  if (!hasPublishedFreeProduct) {
    return {
      ...base,
      kind: "starter",
      currentTierLabel: "Стартовый",
      currentTierDescription: STARTER_DESCRIPTION,
      showStandardCommercialOffer: true,
      paidProductsLocked: true,
      cta: {
        label: "Подать заявку на коммерческий статус",
        href: null,
        disabled: true,
        hint: STARTER_FREE_PRODUCT_BEFORE_COMMERCIAL_HINT,
      },
      secondaryCtas: [createFreeProductCta],
    };
  }

  return {
    ...base,
    kind: "starter",
    currentTierLabel: "Стартовый",
    currentTierDescription: STARTER_DESCRIPTION,
    showStandardCommercialOffer: true,
    paidProductsLocked: true,
    cta: {
      label: "Подать заявку на коммерческий статус",
      href: applicationHref,
      disabled: false,
      hint: null,
    },
  };
}

function formatSubmittedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export const AUTHOR_STATUS_COPY = {
  starterTitle: "Ваш текущий статус – Стартовый",
  commercialCardTitle: "Коммерческий",
  commercialCardDescription: COMMERCIAL_DESCRIPTION,
  starterPaidLock:
    "Продажа платных продуктов и получение авторского вознаграждения недоступны.",
  premiumTitle: "Премиальный – скоро",
  premiumDescription:
    "Расширенные инструменты продвижения, аналитики и рекламы для авторов, которые хотят активнее развивать продажи на платформе.",
  premiumPricingNote: "Условия и стоимость будут объявлены позднее.",
} as const;
