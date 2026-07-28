import type { AuthorOnboardingChecklistState } from "@/lib/author-dashboard/onboarding-checklist";
import {
  isAuthorCommercialActiveAccess,
  isAuthorCommercialApprovedAccess,
  type AuthorAccessStatus,
} from "@/lib/authors/access";
import { buildAuthorPublicPath } from "@/lib/products/paths";

export type OpportunitiesCta = {
  label: string;
  href: string | null;
  disabled?: boolean;
  external?: boolean;
};

export type OpportunitiesPrimaryCta = OpportunitiesCta & {
  id:
    | "profile"
    | "create_product"
    | "continue_draft"
    | "publish_product"
    | "start_promotion"
    | "create_promo_page"
    | "open_stats"
    | "commercial_status"
    | "create_paid_product"
    | "workspace_blocked";
  summary: string;
};

export type OpportunitiesProgressState = "done" | "next" | "later";

export type OpportunitiesProgressItem = {
  id: string;
  label: string;
  state: OpportunitiesProgressState;
};

export type OpportunitiesJourneyStep = {
  id: string;
  title: string;
  description: string;
  cta: OpportunitiesCta;
};

export type OpportunitiesScenario = {
  id: string;
  title: string;
  description: string;
  cta: OpportunitiesCta;
};

export type AuthorOpportunitiesViewModel = {
  authorId: string;
  authorSlug: string;
  accessStatus: AuthorAccessStatus;
  primaryCta: OpportunitiesPrimaryCta;
  publicAuthorHref: string | null;
  showPublicAuthorLink: boolean;
  journey: OpportunitiesJourneyStep[];
  scenarios: OpportunitiesScenario[];
  progress: OpportunitiesProgressItem[];
  hasPromoPage: boolean;
  hasPersonalMaterial: boolean;
  hasActiveCampaign: boolean;
  hasPublishedProduct: boolean;
  profileComplete: boolean;
  freeProductComplete: boolean;
};

export function withAuthorQuery(path: string, authorSlug: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}author=${encodeURIComponent(authorSlug)}`;
}

function dashboardPaths(authorSlug: string) {
  return {
    home: withAuthorQuery("/author-dashboard", authorSlug),
    profile: withAuthorQuery("/author-dashboard/profile", authorSlug),
    newProduct: withAuthorQuery("/author-dashboard/products/new", authorSlug),
    promotion: withAuthorQuery("/author-dashboard/promotion", authorSlug),
    stats: withAuthorQuery("/author-dashboard/stats", authorSlug),
    finance: withAuthorQuery("/author-dashboard/finance", authorSlug),
    status: withAuthorQuery("/author-dashboard/status", authorSlug),
    diagnosticsNew: withAuthorQuery(
      "/author-dashboard/diagnostics/new",
      authorSlug,
    ),
    publicAuthor: buildAuthorPublicPath(authorSlug),
  };
}

function productEditHref(authorSlug: string, productId: string | null): string {
  if (!productId) {
    return dashboardPaths(authorSlug).newProduct;
  }

  return `/author-dashboard/products/${productId}`;
}

function isWorkspaceBlocked(
  accessStatus: AuthorAccessStatus | string | null | undefined,
): boolean {
  return accessStatus === "suspended" || accessStatus === "terminated";
}

function hasActiveCampaign(checklist: AuthorOnboardingChecklistState): boolean {
  return checklist.steps.some(
    (step) => step.id === "promotion" && step.completed,
  );
}

/**
 * Resolve the single primary CTA for the opportunities hub.
 * Reuses free-tier onboarding active step; does not invent a second ladder.
 */
export function resolveAuthorOpportunitiesPrimaryCta(input: {
  authorSlug: string;
  accessStatus: AuthorAccessStatus;
  checklist: AuthorOnboardingChecklistState;
  hasPromoPage: boolean;
}): OpportunitiesPrimaryCta {
  const { authorSlug, accessStatus, checklist, hasPromoPage } = input;
  const paths = dashboardPaths(authorSlug);
  const focusEditHref = productEditHref(authorSlug, checklist.focusProductId);
  const campaignReady = hasActiveCampaign(checklist);
  const activeStep = checklist.steps.find((step) => step.active) ?? null;

  if (isWorkspaceBlocked(accessStatus)) {
    return {
      id: "workspace_blocked",
      label: "Доступ ограничен",
      href: null,
      disabled: true,
      summary:
        "Авторский доступ ограничен. Создание и публикация материалов сейчас недоступны.",
    };
  }

  if (activeStep?.id === "profile") {
    return {
      id: "profile",
      label: "Оформить страницу автора",
      href: paths.profile,
      summary:
        "Начните с оформления публичной страницы — так слушатели поймут, кто вы и чем можете помочь.",
    };
  }

  if (activeStep?.id === "free_product") {
    const hasAnyProduct = Boolean(checklist.focusProductId);
    return {
      id: "create_product",
      label: hasAnyProduct
        ? "Создать бесплатный продукт"
        : "Создать первый продукт",
      href: paths.newProduct,
      summary: checklist.hasNonArchivedPaidOnlyProducts
        ? "Для старта на АудиоЛаде создайте бесплатный продукт — так слушатели смогут познакомиться с вами без покупки."
        : "Создайте первый аудиопродукт: загрузите аудио, добавьте обложку и описание.",
    };
  }

  if (activeStep?.id === "prepare_product") {
    return {
      id: "continue_draft",
      label: "Продолжить оформление",
      href: focusEditHref,
      summary:
        "У вас уже есть черновик. Добавьте обложку, описание и аудио, чтобы подготовить продукт к публикации.",
    };
  }

  if (activeStep?.id === "publish_product") {
    return {
      id: "publish_product",
      label: "Опубликовать продукт",
      href: focusEditHref,
      summary:
        "Продукт готов к публикации. Опубликуйте его, чтобы он появился на вашей странице и стал доступен слушателям.",
    };
  }

  if (activeStep?.id === "promotion") {
    return {
      id: "start_promotion",
      label: "Начать продвижение",
      href: paths.promotion,
      summary:
        "Продукт уже опубликован. Создайте кампанию со ссылками для разных площадок и начните привлекать слушателей.",
    };
  }

  // Free starter ladder complete.
  if (!hasPromoPage) {
    return {
      id: "create_promo_page",
      label: "Создать промостраницу",
      href: paths.promotion,
      summary:
        "Соберите промостраницу с подборкой практик — удобная точка входа для новой аудитории.",
    };
  }

  if (
    isAuthorCommercialApprovedAccess(accessStatus) &&
    !isAuthorCommercialActiveAccess(accessStatus)
  ) {
    const commercialActive = checklist.commercial.steps.find(
      (step) => step.state === "active",
    );

    return {
      id: "commercial_status",
      label: commercialActive?.actionLabel ?? "Открыть статус автора",
      href: commercialActive?.href ?? paths.status,
      summary:
        "Базовый путь продвижения уже собран. Завершите коммерческое подключение, чтобы открыть продажи и вознаграждение.",
    };
  }

  if (
    isAuthorCommercialActiveAccess(accessStatus) &&
    checklist.commercial.steps.some(
      (step) =>
        (step.id === "paid_product" ||
          step.id === "prepare_paid_product" ||
          step.id === "publish_paid_product") &&
        step.state === "active",
    )
  ) {
    const paidStep = checklist.commercial.steps.find(
      (step) => step.state === "active",
    );

    return {
      id: "create_paid_product",
      label: paidStep?.actionLabel ?? "Создать платный продукт",
      href: paidStep?.href ?? paths.newProduct,
      summary:
        "Коммерческий статус активен. Создайте или опубликуйте платный продукт, чтобы начать продажи.",
    };
  }

  if (campaignReady || checklist.complete) {
    return {
      id: "open_stats",
      label: "Посмотреть статистику",
      href: paths.stats,
      summary:
        "Продвижение уже запущено. Следите за переходами, прослушиваниями и другими результатами в статистике.",
    };
  }

  return {
    id: "create_product",
    label: "Создать первый продукт",
    href: paths.newProduct,
    summary:
      "АудиоЛад помогает пройти путь от первого продукта до продвижения и продаж. Начните с создания аудиопродукта.",
  };
}

export function resolveAuthorOpportunitiesRewardCta(input: {
  authorSlug: string;
  accessStatus: AuthorAccessStatus;
  checklist: AuthorOnboardingChecklistState;
}): OpportunitiesCta {
  const { authorSlug, accessStatus, checklist } = input;
  const paths = dashboardPaths(authorSlug);

  if (isWorkspaceBlocked(accessStatus)) {
    return {
      label: "Узнать о коммерческом статусе",
      href: paths.status,
    };
  }

  if (isAuthorCommercialActiveAccess(accessStatus)) {
    return {
      label: "Открыть финансы",
      href: paths.finance,
    };
  }

  if (isAuthorCommercialApprovedAccess(accessStatus)) {
    const commercialActive = checklist.commercial.steps.find(
      (step) => step.state === "active",
    );

    return {
      label: commercialActive?.actionLabel ?? "Открыть статус автора",
      href: commercialActive?.href ?? paths.status,
    };
  }

  return {
    label: "Узнать о коммерческом статусе",
    href: paths.status,
  };
}

export function buildAuthorOpportunitiesJourney(input: {
  authorSlug: string;
  accessStatus: AuthorAccessStatus;
  checklist: AuthorOnboardingChecklistState;
  hasPromoPage: boolean;
  profileComplete: boolean;
}): OpportunitiesJourneyStep[] {
  const { authorSlug, accessStatus, checklist, profileComplete } = input;
  const paths = dashboardPaths(authorSlug);
  const focusEditHref = productEditHref(authorSlug, checklist.focusProductId);
  // Focus product that is not the published one ⇒ draft / unpublished work in progress.
  const showContinueProduct = Boolean(
    checklist.focusProductId &&
      checklist.focusProductId !== checklist.publishedProductId,
  );

  const rewardCta = resolveAuthorOpportunitiesRewardCta({
    authorSlug,
    accessStatus,
    checklist,
  });

  return [
    {
      id: "create_product",
      title: "Создайте продукт",
      description:
        "Загрузите аудио, добавьте обложку и описание, выберите бесплатный или платный доступ.",
      cta: {
        label: showContinueProduct ? "Продолжить продукт" : "Создать продукт",
        href: showContinueProduct ? focusEditHref : paths.newProduct,
      },
    },
    {
      id: "author_page",
      title: "Оформите страницу автора",
      description:
        "Расскажите о себе, своей специализации и соберите опубликованные продукты на одной публичной странице.",
      cta: profileComplete
        ? {
            label: "Открыть страницу",
            href: paths.publicAuthor,
            external: true,
          }
        : {
            label: "Оформить страницу",
            href: paths.profile,
          },
    },
    {
      id: "promo_page",
      title: "Соберите промостраницу",
      description:
        "Объедините несколько бесплатных практик в понятную подборку или мини-воронку для новой аудитории.",
      cta: {
        label: "Создать промостраницу",
        href: paths.promotion,
      },
    },
    {
      id: "share_link",
      title: "Поделитесь ссылкой",
      description:
        "Создавайте отдельные ссылки для Telegram, ВКонтакте, MAX и других площадок, чтобы сравнивать результаты.",
      cta: {
        label: "Создать кампанию",
        href: paths.promotion,
      },
    },
    {
      id: "results",
      title: "Следите за результатами",
      description:
        "Смотрите переходы, прослушивания, завершения, сохранения и другие доступные показатели.",
      cta: {
        label: "Открыть статистику",
        href: paths.stats,
      },
    },
    {
      id: "reward",
      title: "Получайте вознаграждение",
      description:
        "Публикуйте платные продукты и следите за начислениями и выплатами в финансовом разделе.",
      cta: rewardCta,
    },
  ];
}

export function buildAuthorOpportunitiesScenarios(authorSlug: string): OpportunitiesScenario[] {
  const paths = dashboardPaths(authorSlug);

  return [
    {
      id: "free_practice",
      title: "Бесплатная практика для знакомства",
      description:
        "Опубликуйте короткую бесплатную практику и поделитесь ссылкой. Слушатель сможет познакомиться с вашим подходом, сохранить практику и открыть другие ваши продукты.",
      cta: {
        label: "Создать бесплатный продукт",
        href: paths.newProduct,
      },
    },
    {
      id: "promo_to_paid",
      title: "Бесплатная подборка → платная программа",
      description:
        "Объедините несколько бесплатных практик на промостранице, а следующим шагом предложите полноценную платную программу.",
      cta: {
        label: "Создать промостраницу",
        href: paths.promotion,
      },
    },
    {
      id: "personal_material",
      title: "Материал после консультации",
      description:
        "Отправьте клиенту персональную медитацию, диагностику, аудиоразбор или PDF. После сохранения материал будет доступен в его личном кабинете.",
      cta: {
        label: "Создать личный материал",
        href: paths.diagnosticsNew,
      },
    },
    {
      id: "multi_channel",
      title: "Продвижение по разным каналам",
      description:
        "Создайте отдельные кампании для Telegram, ВКонтакте, MAX и других площадок, а затем сравните их эффективность.",
      cta: {
        label: "Создать кампанию",
        href: paths.promotion,
      },
    },
  ];
}

export function buildAuthorOpportunitiesProgress(input: {
  checklist: AuthorOnboardingChecklistState;
  hasPromoPage: boolean;
  accessStatus: AuthorAccessStatus;
}): OpportunitiesProgressItem[] {
  const { checklist, hasPromoPage, accessStatus } = input;
  const profileComplete = checklist.steps.find((s) => s.id === "profile")
    ?.completed;
  const freeProductComplete = checklist.steps.find(
    (s) => s.id === "free_product",
  )?.completed;
  const publishedComplete = checklist.steps.find(
    (s) => s.id === "publish_product",
  )?.completed;
  const campaignComplete = checklist.steps.find((s) => s.id === "promotion")
    ?.completed;
  const activeId = checklist.steps.find((s) => s.active)?.id ?? null;

  function stateFor(
    done: boolean | undefined,
    isNext: boolean,
  ): OpportunitiesProgressState {
    if (done) {
      return "done";
    }
    if (isNext) {
      return "next";
    }
    return "later";
  }

  const commercialDone = isAuthorCommercialActiveAccess(accessStatus);
  const commercialNext =
    !commercialDone &&
    (checklist.readyForCommercial ||
      isAuthorCommercialApprovedAccess(accessStatus) ||
      checklist.commercial.unlocked);

  return [
    {
      id: "profile",
      label: "Профиль автора",
      state: stateFor(profileComplete, activeId === "profile"),
    },
    {
      id: "free_product",
      label: "Бесплатный продукт",
      state: stateFor(freeProductComplete, activeId === "free_product"),
    },
    {
      id: "published",
      label: "Опубликованный продукт",
      state: stateFor(
        publishedComplete,
        activeId === "prepare_product" || activeId === "publish_product",
      ),
    },
    {
      id: "promo_page",
      label: "Промостраница",
      state: stateFor(
        hasPromoPage,
        Boolean(publishedComplete && campaignComplete && !hasPromoPage),
      ),
    },
    {
      id: "campaign",
      label: "Кампания продвижения",
      state: stateFor(campaignComplete, activeId === "promotion"),
    },
    {
      id: "commercial",
      label: "Коммерческие возможности",
      state: commercialDone ? "done" : commercialNext ? "next" : "later",
    },
  ];
}

export function buildAuthorOpportunitiesView(input: {
  authorId: string;
  authorSlug: string;
  accessStatus: AuthorAccessStatus;
  checklist: AuthorOnboardingChecklistState;
  hasPromoPage: boolean;
  hasPersonalMaterial: boolean;
}): AuthorOpportunitiesViewModel {
  const {
    authorId,
    authorSlug,
    accessStatus,
    checklist,
    hasPromoPage,
    hasPersonalMaterial,
  } = input;

  const profileComplete = Boolean(
    checklist.steps.find((step) => step.id === "profile")?.completed,
  );
  const freeProductComplete = Boolean(
    checklist.steps.find((step) => step.id === "free_product")?.completed,
  );
  const hasPublishedProduct = Boolean(checklist.publishedProductId);
  const campaignReady = hasActiveCampaign(checklist);
  const primaryCta = resolveAuthorOpportunitiesPrimaryCta({
    authorSlug,
    accessStatus,
    checklist,
    hasPromoPage,
  });

  return {
    authorId,
    authorSlug,
    accessStatus,
    primaryCta,
    publicAuthorHref: buildAuthorPublicPath(authorSlug),
    showPublicAuthorLink: profileComplete && hasPublishedProduct,
    journey: buildAuthorOpportunitiesJourney({
      authorSlug,
      accessStatus,
      checklist,
      hasPromoPage,
      profileComplete,
    }),
    scenarios: buildAuthorOpportunitiesScenarios(authorSlug),
    progress: buildAuthorOpportunitiesProgress({
      checklist,
      hasPromoPage,
      accessStatus,
    }),
    hasPromoPage,
    hasPersonalMaterial,
    hasActiveCampaign: campaignReady,
    hasPublishedProduct,
    profileComplete,
    freeProductComplete,
  };
}
