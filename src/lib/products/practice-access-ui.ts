import type { ProductAccessResult } from "@/lib/products/access";
import {
  buildListenPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";

type PracticePricing = {
  price: number | null;
  is_free: boolean | null;
  format: string | null;
};

export function isProgramFormat(format: string | null): boolean {
  const normalized = format?.trim().toLowerCase() ?? "";

  return (
    normalized.includes("программ") ||
    normalized.includes("курс") ||
    normalized === "цикл практик"
  );
}

export function formatPracticePrice(price: number | null): string | null {
  if (typeof price === "number" && Number.isFinite(price) && price >= 0) {
    return `${price} ₽`;
  }

  return null;
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
      return "Стартовая практика";
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
      kind: "author_listen";
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

export type PracticeAccessPresentation = {
  statusBadge: string;
  statusDetail: string | null;
  showAuthorPreview: boolean;
  showAdminPreview: boolean;
  primaryAction: PracticePrimaryAction;
  showSecondaryLibraryHint: boolean;
};

export function buildPracticeAccessPresentation(input: {
  access: ProductAccessResult;
  practice: PracticePricing & {
    slug: string;
    audio_url: string | null;
  };
  authorSlug: string;
  paymentsConfigured: boolean;
}): PracticeAccessPresentation {
  const { access, practice, authorSlug, paymentsConfigured } = input;
  const priceLabel = formatPracticePrice(practice.price);
  const listenHref = buildListenPath(authorSlug, practice.slug);
  const audioReady = hasAudioReady(practice.audio_url);

  if (access.reason === "author_owner") {
    return {
      statusBadge: priceLabel ?? getFreeStatusLabel(practice.format),
      statusDetail: null,
      showAuthorPreview: true,
      showAdminPreview: false,
      primaryAction: audioReady
        ? {
            kind: "author_listen",
            href: listenHref,
            label: "Прослушать как автор",
          }
        : {
            kind: "audio_pending",
            label: getAudioPendingLabel(practice.audio_url),
          },
      showSecondaryLibraryHint: false,
    };
  }

  if (access.reason === "admin") {
    return {
      statusBadge: "Доступ открыт",
      statusDetail: "Технический просмотр",
      showAuthorPreview: false,
      showAdminPreview: true,
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
      showSecondaryLibraryHint: false,
    };
  }

  if (access.canListen && access.reason === "free") {
    return {
      statusBadge: getFreeStatusLabel(practice.format),
      statusDetail: null,
      showAuthorPreview: false,
      showAdminPreview: false,
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
      showSecondaryLibraryHint: true,
    };
  }

  if (
    access.canListen &&
    (access.reason === "purchased" || access.reason === "granted")
  ) {
    return {
      statusBadge: "Доступ открыт",
      statusDetail: getEntitlementStatusLabel(access.accessSource),
      showAuthorPreview: false,
      showAdminPreview: false,
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
      showSecondaryLibraryHint: false,
    };
  }

  const buyLabel =
    priceLabel !== null ? `Купить за ${priceLabel}` : "Купить доступ";

  return {
    statusBadge: priceLabel ?? "Стоимость уточняется",
    statusDetail: null,
    showAuthorPreview: false,
    showAdminPreview: false,
    primaryAction: {
      kind: "buy",
      label: paymentsConfigured ? buyLabel : "Продажи скоро откроются",
      disabled: !paymentsConfigured,
      practiceSlug: practice.slug,
    },
    showSecondaryLibraryHint: false,
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
