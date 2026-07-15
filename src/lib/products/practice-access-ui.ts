import type { ProductAccessResult } from "@/lib/products/access";
import {
  isPracticeCatalogListed,
  isPracticePublished,
} from "@/lib/products/access";
import {
  buildListenPath,
  buildPracticeBuyerPreviewPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";
import { formatPracticePrice } from "@/lib/products/price-format";

type PracticePricing = {
  price: number | null;
  is_free: boolean | null;
  format: string | null;
  status: string | null;
  is_catalog_listed?: boolean | null;
};

export function isProgramFormat(format: string | null): boolean {
  const normalized = format?.trim().toLowerCase() ?? "";

  return (
    normalized.includes("программ") ||
    normalized.includes("курс") ||
    normalized === "цикл практик"
  );
}

export function getFreeStatusLabel(format: string | null): string {
  return isProgramFormat(format)
    ? "Бесплатная программа"
    : "Бесплатная практика";
}

export function getEntitlementStatusLabel(accessSource: string | null): string {
  switch (accessSource) {
    case "purchase":
      return "Куплено";
    case "gift":
      return "Подарок";
    case "starter":
    case "free_claim":
      return "Получено бесплатно";
    case "subscription":
      return "По подписке";
    case "program":
      return "В программе";
    case "admin":
      return "Доступ открыт";
    default:
      return "Доступ открыт";
  }
}

export function hasAudioReady(audioUrl: string | null | undefined): boolean {
  return typeof audioUrl === "string" && audioUrl.trim().length > 0;
}

export function getAudioPendingLabel(audioUrl: string | null | undefined): string {
  if (hasAudioReady(audioUrl)) {
    return "Аудио готовится к запуску";
  }

  return "Аудио скоро появится";
}

export type PracticePrimaryAction =
  | {
      kind: "listen";
      href: string;
      label: string;
    }
  | {
      kind: "buy";
      label: string;
      disabled: boolean;
      practiceSlug: string;
    }
  | {
      kind: "audio_pending";
      label: string;
    };

export type PracticeAuthorToolbarAction =
  | {
      kind: "buyer_preview";
      href: string;
      label: string;
    }
  | {
      kind: "author_listen";
      href: string;
      label: string;
      disabled?: boolean;
    }
  | {
      kind: "edit";
      href: string;
      label: string;
    };

export type PracticeLibraryAction =
  | "hidden"
  | "sign_in"
  | "add"
  | "in_library";

export type PracticeAccessPresentation = {
  statusBadge: string;
  statusDetail: string | null;
  showAuthorToolbar: boolean;
  showBuyerPreviewBanner: boolean;
  authorToolbarMessage: string | null;
  authorToolbarActions: PracticeAuthorToolbarAction[];
  showAdminPreview: boolean;
  primaryAction: PracticePrimaryAction;
  libraryAction: PracticeLibraryAction;
  showPaymentLegalNote: boolean;
};

export function resolveLibraryAction(input: {
  access: ProductAccessResult;
  practice: PracticePricing;
  isAuthenticated: boolean;
  buyerPreviewMode: boolean;
}): PracticeLibraryAction {
  const { access, practice, isAuthenticated, buyerPreviewMode } = input;

  if (buyerPreviewMode) {
    return "hidden";
  }

  if (access.reason === "admin" || access.reason === "author_owner") {
    return "hidden";
  }

  const isPublicFreeProduct =
    practice.is_free === true &&
    isPracticeCatalogListed(practice) &&
    isPracticePublished(practice.status);

  if (!isPublicFreeProduct) {
    return "hidden";
  }

  if (access.hasEntitlement) {
    return "in_library";
  }

  if (!isAuthenticated) {
    return "sign_in";
  }

  return "add";
}

export function mapLibraryClaimButtonError(
  status: number,
  errorCode: string | undefined,
): string {
  if (status === 404 || errorCode === "practice_not_found") {
    return "Материал сейчас недоступен";
  }

  if (status === 409 || errorCode === "practice_not_free") {
    return "Этот материал нельзя добавить бесплатно";
  }

  if (status === 400 || errorCode === "invalid_request") {
    return "Не удалось добавить. Проверьте данные и попробуйте ещё раз.";
  }

  return "Не удалось добавить. Попробуйте ещё раз.";
}

export function resolveLibraryActionAfterClaimSuccess(): "in_library" {
  return "in_library";
}

function resolveCommercialAccess(
  access: ProductAccessResult,
  practice: PracticePricing,
  buyerPreviewMode: boolean,
): ProductAccessResult {
  const canUseBuyerPreview =
    access.reason === "author_owner" || access.reason === "admin";

  if (buyerPreviewMode && canUseBuyerPreview) {
    if (practice.is_free === true && isPracticeCatalogListed(practice)) {
      return {
        canListen: true,
        canAcquire: false,
        isPubliclyListed: true,
        reason: "free",
        isAuthorMember: access.isAuthorMember,
        accessSource: null,
        hasEntitlement: false,
      };
    }

    return {
      canListen: false,
      canAcquire: false,
      isPubliclyListed: isPracticeCatalogListed(practice),
      reason: "not_authenticated",
      isAuthorMember: access.isAuthorMember,
      accessSource: null,
      hasEntitlement: false,
    };
  }

  if (access.reason === "author_owner") {
    if (practice.is_free === true) {
      return {
        canListen: true,
        canAcquire: practice.status === "published",
        isPubliclyListed: isPracticeCatalogListed(practice),
        reason: "free",
        isAuthorMember: true,
        accessSource: null,
        hasEntitlement: false,
      };
    }

    return {
      canListen: false,
      canAcquire: practice.status === "published",
      isPubliclyListed: isPracticeCatalogListed(practice),
      reason: "not_authenticated",
      isAuthorMember: true,
      accessSource: null,
      hasEntitlement: false,
    };
  }

  return access;
}

function buildCommercialPresentation(input: {
  access: ProductAccessResult;
  practice: PracticePricing & {
    slug: string;
    audio_url: string | null;
  };
  authorSlug: string;
  paymentsConfigured: boolean;
}): Pick<
  PracticeAccessPresentation,
  | "statusBadge"
  | "statusDetail"
  | "primaryAction"
  | "showPaymentLegalNote"
> {
  const { access, practice, authorSlug, paymentsConfigured } = input;
  const priceLabel = formatPracticePrice(practice.price);
  const listenHref = buildListenPath(authorSlug, practice.slug, {
    autoplay: true,
  });
  const audioReady = hasAudioReady(practice.audio_url);

  if (access.reason === "admin") {
    return {
      statusBadge: "Доступ открыт",
      statusDetail: "Технический просмотр",
      primaryAction: audioReady
        ? {
            kind: "listen",
            href: listenHref,
            label: "Слушать",
          }
        : {
            kind: "audio_pending",
            label: getAudioPendingLabel(practice.audio_url),
          },
      showPaymentLegalNote: false,
    };
  }

  if (access.canListen && access.reason === "free") {
    return {
      statusBadge: getFreeStatusLabel(practice.format),
      statusDetail: null,
      primaryAction: audioReady
        ? {
            kind: "listen",
            href: listenHref,
            label: "Слушать",
          }
        : {
            kind: "audio_pending",
            label: getAudioPendingLabel(practice.audio_url),
          },
      showPaymentLegalNote: false,
    };
  }

  if (
    access.canListen &&
    (access.reason === "purchased" || access.reason === "granted")
  ) {
    return {
      statusBadge: "Доступ открыт",
      statusDetail: getEntitlementStatusLabel(access.accessSource),
      primaryAction: audioReady
        ? {
            kind: "listen",
            href: listenHref,
            label: "Слушать",
          }
        : {
            kind: "audio_pending",
            label: getAudioPendingLabel(practice.audio_url),
          },
      showPaymentLegalNote: false,
    };
  }

  const buyLabel =
    priceLabel !== null ? `Купить за ${priceLabel}` : "Купить доступ";

  if (access.reason === "unavailable" || !access.canAcquire) {
    const unavailableDetail =
      practice.status === "archived"
        ? "Этот аудиопродукт больше не доступен для новых пользователей."
        : practice.status === "unpublished"
          ? "Этот аудиопродукт снят с публикации и недоступен для новых пользователей."
          : null;

    return {
      statusBadge: "Недоступно",
      statusDetail: unavailableDetail,
      primaryAction: {
        kind: "audio_pending",
        label: unavailableDetail ?? "Продукт недоступен",
      },
      showPaymentLegalNote: false,
    };
  }

  return {
    statusBadge: priceLabel ?? "Стоимость уточняется",
    statusDetail: null,
    primaryAction: {
      kind: "buy",
      label: paymentsConfigured ? buyLabel : "Продажи скоро откроются",
      disabled: !paymentsConfigured,
      practiceSlug: practice.slug,
    },
    showPaymentLegalNote: paymentsConfigured,
  };
}

function buildAuthorToolbarActions(input: {
  authorSlug: string;
  productSlug: string;
  practiceId: string;
  audioReady: boolean;
  listenHref: string;
  buyerPreviewMode: boolean;
}): PracticeAuthorToolbarAction[] {
  const {
    authorSlug,
    productSlug,
    practiceId,
    audioReady,
    listenHref,
    buyerPreviewMode,
  } = input;

  if (buyerPreviewMode) {
    return [
      {
        kind: "author_listen",
        href: listenHref,
        label: "Прослушать как автор",
        disabled: !audioReady,
      },
    ];
  }

  return [
    {
      kind: "buyer_preview",
      href: buildPracticeBuyerPreviewPath(authorSlug, productSlug),
      label: "Посмотреть глазами покупателя",
    },
    {
      kind: "author_listen",
      href: listenHref,
      label: "Прослушать как автор",
      disabled: !audioReady,
    },
    {
      kind: "edit",
      href: buildAuthorDashboardEditPath(practiceId),
      label: "Редактировать продукт",
    },
  ];
}

export function buildPracticeAccessPresentation(input: {
  access: ProductAccessResult;
  practice: PracticePricing & {
    id: string;
    slug: string;
    audio_url: string | null;
  };
  authorSlug: string;
  paymentsConfigured: boolean;
  isAuthenticated: boolean;
  buyerPreviewMode?: boolean;
}): PracticeAccessPresentation {
  const {
    access,
    practice,
    authorSlug,
    paymentsConfigured,
    isAuthenticated,
    buyerPreviewMode = false,
  } = input;
  const audioReady = hasAudioReady(practice.audio_url);
  const listenHref = buildListenPath(authorSlug, practice.slug, {
    autoplay: true,
  });
  const libraryAction = resolveLibraryAction({
    access,
    practice,
    isAuthenticated,
    buyerPreviewMode,
  });
  const commercialAccess = resolveCommercialAccess(
    access,
    practice,
    buyerPreviewMode,
  );
  const commercial = buildCommercialPresentation({
    access: commercialAccess,
    practice,
    authorSlug,
    paymentsConfigured,
  });

  const isAuthorOwner = access.reason === "author_owner";
  const isPrivilegedPreview =
    isAuthorOwner || access.reason === "admin";
  const effectiveBuyerPreview = buyerPreviewMode && isPrivilegedPreview;

  if (effectiveBuyerPreview) {
    return {
      ...commercial,
      libraryAction,
      showAuthorToolbar: false,
      showBuyerPreviewBanner: true,
      authorToolbarMessage: null,
      authorToolbarActions: buildAuthorToolbarActions({
        authorSlug,
        productSlug: practice.slug,
        practiceId: practice.id,
        audioReady,
        listenHref,
        buyerPreviewMode: true,
      }),
      showAdminPreview: false,
    };
  }

  if (isAuthorOwner) {
    return {
      ...commercial,
      libraryAction,
      showAuthorToolbar: true,
      showBuyerPreviewBanner: false,
      authorToolbarMessage: "Вы вошли как владелец этого продукта",
      authorToolbarActions: buildAuthorToolbarActions({
        authorSlug,
        productSlug: practice.slug,
        practiceId: practice.id,
        audioReady,
        listenHref,
        buyerPreviewMode: false,
      }),
      showAdminPreview: false,
    };
  }

  return {
    ...commercial,
    libraryAction,
    showAuthorToolbar: false,
    showBuyerPreviewBanner: false,
    authorToolbarMessage: null,
    authorToolbarActions: [],
    showAdminPreview: access.reason === "admin",
  };
}

export function buildAuthorDashboardEditPath(practiceId: string): string {
  return `/author-dashboard/products/${practiceId}`;
}

export function buildPracticePagePath(
  authorSlug: string,
  productSlug: string,
): string {
  return buildPracticePublicPath(authorSlug, productSlug);
}

export function canUseBuyerPreviewMode(access: ProductAccessResult): boolean {
  return access.reason === "author_owner" || access.reason === "admin";
}
