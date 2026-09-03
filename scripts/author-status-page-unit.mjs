#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_COMMERCIAL_SHARE_BPS,
  DEFAULT_COMMERCIAL_SHARE,
  PLATFORM_COMMERCIAL_SHARE_BPS,
  PLATFORM_COMMISSION_SCOPE_TEXT,
  formatShareBpsAsPercent,
  getAuthorRewardCabinetCopy,
  getCommercialShareDisplayLines,
  resolveDisplayCommercialShare,
} from "../src/lib/author-commercial/economics.ts";
import {
  AUTHOR_STATUS_COPY,
  resolveAuthorStatusView,
} from "../src/lib/author-dashboard/author-status.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// unified 70/30 source
assert.equal(AUTHOR_COMMERCIAL_SHARE_BPS, 7000);
assert.equal(PLATFORM_COMMERCIAL_SHARE_BPS, 3000);
assert.equal(DEFAULT_COMMERCIAL_SHARE.authorShareBps, 7000);
assert.equal(formatShareBpsAsPercent(7000), "70%");
assert.equal(formatShareBpsAsPercent(3000), "30%");

const defaultLines = getCommercialShareDisplayLines();
assert.equal(
  defaultLines.authorLine,
  "Вознаграждение автора – 70% от стоимости продажи.",
);
assert.equal(
  defaultLines.platformLine,
  "Вознаграждение Платформы – 30% от стоимости продажи.",
);
assert.ok(PLATFORM_COMMISSION_SCOPE_TEXT.includes("технической инфраструктуры"));

{
  const defaultReward = getAuthorRewardCabinetCopy();
  assert.equal(defaultReward.title, "Вознаграждение автора");
  assert.equal(
    defaultReward.authorLine,
    `${formatShareBpsAsPercent(AUTHOR_COMMERCIAL_SHARE_BPS)} – получает автор`,
  );
  assert.equal(
    defaultReward.platformLine,
    `${formatShareBpsAsPercent(PLATFORM_COMMERCIAL_SHARE_BPS)} – комиссия АудиоЛада`,
  );
  assert.equal(
    defaultReward.caption,
    "Комиссия платформы включает расходы на приём и обработку платежей, техническую инфраструктуру, размещение и хранение материалов, работу и развитие онлайн-студии, работу сервиса, развитие и продвижение платформы, учёт операций и организацию выплат.",
  );
  assert.doesNotMatch(defaultReward.authorLine + defaultReward.platformLine, /86[,.]5|13[,.]5|3[,.]5/);

  const individualReward = getAuthorRewardCabinetCopy({
    authorShareBps: 8000,
    platformShareBps: 2000,
  });
  assert.equal(
    individualReward.authorLine,
    `${formatShareBpsAsPercent(8000)} – получает автор`,
  );
  assert.equal(
    individualReward.platformLine,
    `${formatShareBpsAsPercent(2000)} – комиссия АудиоЛада`,
  );
}

const individual = resolveDisplayCommercialShare({
  authorShareBps: 8000,
  platformShareBps: 2000,
});
assert.equal(individual.isIndividual, true);
assert.equal(individual.authorShareBps, 8000);

const fallback = resolveDisplayCommercialShare({ authorShareBps: 10 });
assert.equal(fallback.authorShareBps, 7000);
assert.equal(fallback.isIndividual, false);

function baseInput(overrides = {}) {
  return {
    accessStatus: "free",
    applicationStatus: null,
    applicationSubmittedAt: null,
    applicationReviewComment: null,
    termsAccepted: false,
    publishedTermsAvailable: true,
    payoutProfileStatus: null,
    payoutReviewComment: null,
    individualShare: null,
    role: "owner",
    authorSlug: "demo-author",
    hasPublishedFreeProduct: true,
    ...overrides,
  };
}

// starter
{
  const view = resolveAuthorStatusView(baseInput());
  assert.equal(view.kind, "starter");
  assert.equal(view.currentTierLabel, "Стартовый");
  assert.ok(!view.currentTierDescription.includes("Бесплатный автор"));
  assert.equal(view.cta.label, "Подать заявку на коммерческий статус");
  assert.ok(view.cta.href?.includes("/author-dashboard/commercial-application"));
  assert.equal(view.cta.disabled, false);
  assert.equal(view.shareLines.authorLine.includes("70%"), true);
  assert.ok(view.starterCapabilities.includes("Публичная страница автора"));
  assert.ok(AUTHOR_STATUS_COPY.premiumPricingNote.includes("позднее"));
  assert.ok(!AUTHOR_STATUS_COPY.premiumPricingNote.includes("900"));
}

// starter without published free product — CTA blocked
{
  const view = resolveAuthorStatusView(
    baseInput({ hasPublishedFreeProduct: false }),
  );
  assert.equal(view.cta.disabled, true);
  assert.equal(view.cta.href, null);
  assert.match(view.cta.hint ?? "", /Сначала опубликуйте один бесплатный продукт/);
  assert.match(view.cta.hint ?? "", /продавать платные материалы/);
  assert.equal(view.secondaryCtas[0]?.label, "Создать бесплатный продукт");
}

// draft application
{
  const view = resolveAuthorStatusView(
    baseInput({ applicationStatus: "draft" }),
  );
  assert.equal(view.kind, "starter");
  assert.ok(view.cta.label.includes("Продолжить заявку"));
}

// submitted
{
  const view = resolveAuthorStatusView(
    baseInput({
      accessStatus: "commercial_pending",
      applicationStatus: "submitted",
      applicationSubmittedAt: "2026-07-20T10:00:00+03:00",
    }),
  );
  assert.equal(view.kind, "commercial_pending");
  assert.equal(view.cta.label, "Заявка рассматривается");
  assert.equal(view.cta.disabled, true);
  assert.ok(view.cta.hint?.includes("2026"));
}

// approved without terms
{
  const view = resolveAuthorStatusView(
    baseInput({
      accessStatus: "commercial_onboarding",
      applicationStatus: "approved",
      termsAccepted: false,
    }),
  );
  assert.equal(view.kind, "commercial_ready_for_terms");
  assert.equal(view.cta.label, "Принять Авторские условия");
  assert.ok(view.cta.href?.includes("/author-dashboard/commercial/terms"));
}

// terms accepted, access not yet flipped (legacy/race) — payout optional
{
  const view = resolveAuthorStatusView(
    baseInput({
      accessStatus: "commercial_onboarding",
      applicationStatus: "approved",
      termsAccepted: true,
      payoutProfileStatus: "draft",
    }),
  );
  assert.equal(view.kind, "commercial_ready_for_terms");
  assert.equal(view.cta.label, "Коммерческий статус активируется");
  assert.equal(view.cta.disabled, true);
  assert.ok(view.optionalPayout);
  assert.equal(view.optionalPayout?.cta.label, "Продолжить заполнение реквизитов");
  assert.equal(view.paidProductsLocked, true);
}

// commercial active without payout profile
{
  const view = resolveAuthorStatusView(
    baseInput({
      accessStatus: "commercial_active",
      applicationStatus: "approved",
      termsAccepted: true,
      payoutProfileStatus: null,
    }),
  );
  assert.equal(view.kind, "commercial_active");
  assert.equal(view.cta.label, "Создать платный продукт");
  assert.equal(view.cta.disabled, false);
  assert.equal(view.paidProductsLocked, false);
  assert.equal(view.secondaryCtas[0]?.label, "Перейти к финансам");
  assert.ok(view.optionalPayout);
  assert.equal(view.optionalPayout?.cta.label, "Заполнить реквизиты");
  assert.match(
    view.optionalPayout?.description ?? "",
    /когда захотите получить первое авторское вознаграждение/,
  );
}

// commercial active + individual share
{
  const view = resolveAuthorStatusView(
    baseInput({
      accessStatus: "commercial_active",
      applicationStatus: "approved",
      termsAccepted: true,
      payoutProfileStatus: "verified",
      individualShare: { authorShareBps: 7500, platformShareBps: 2500 },
    }),
  );
  assert.equal(view.kind, "commercial_active");
  assert.equal(view.cta.label, "Создать платный продукт");
  assert.equal(view.cta.disabled, false);
  assert.equal(view.share.isIndividual, true);
  assert.ok(view.shareLines.authorLine.includes("75%"));
  const reward = getAuthorRewardCabinetCopy(view.share);
  assert.equal(reward.authorLine, `${formatShareBpsAsPercent(7500)} – получает автор`);
  assert.equal(reward.platformLine, `${formatShareBpsAsPercent(2500)} – комиссия АудиоЛада`);
  assert.equal(view.paidProductsLocked, false);
}

// suspended
{
  const view = resolveAuthorStatusView(
    baseInput({ accessStatus: "commercial_suspended" }),
  );
  assert.equal(view.kind, "commercial_suspended");
  assert.equal(view.cta.disabled, true);
  assert.ok(!view.cta.label.includes("Подать заявку"));
}

// workspace blocked
{
  const view = resolveAuthorStatusView(
    baseInput({ accessStatus: "suspended" }),
  );
  assert.equal(view.kind, "workspace_blocked");
  assert.equal(view.cta.disabled, true);
}

// editor cannot accept (hint) but still gets terms CTA href to legal
{
  const view = resolveAuthorStatusView(
    baseInput({
      accessStatus: "commercial_onboarding",
      applicationStatus: "approved",
      role: "editor",
    }),
  );
  assert.equal(view.kind, "commercial_ready_for_terms");
  assert.ok(view.cta.href?.includes("/author-dashboard/legal"));
  assert.ok(view.cta.hint?.includes("владелец"));
}

// UI files / nav
const nav = readFileSync(
  path.join(root, "src/components/author-dashboard/AuthorDashboardNav.tsx"),
  "utf8",
);
assert.ok(nav.includes('label: "Статус"'));
assert.ok(nav.includes("/author-dashboard/status"));
assert.ok(nav.includes('label: "Документы"'));
assert.ok(nav.includes('label: "Продажи и финансы"'));

const page = readFileSync(
  path.join(root, "src/app/(platform)/author-dashboard/status/page.tsx"),
  "utf8",
);
assert.ok(page.includes("loadAuthorStatusView"));
assert.ok(page.includes("AuthorStatusClient"));

const client = readFileSync(
  path.join(root, "src/components/author-dashboard/AuthorStatusClient.tsx"),
  "utf8",
);
assert.ok(client.includes("getAuthorRewardCabinetCopy"));
assert.ok(client.includes("AuthorRewardCabinetCard"));
assert.doesNotMatch(client, /86[,.]5|13[,.]5|GetCourse 3[,.]5|3,5%/);
assert.doesNotMatch(client, /70% – получает автор|30% – комиссия АудиоЛада/);
assert.ok(client.includes("AUTHOR_STATUS_COPY.starterTitle"));
assert.ok(client.includes("AUTHOR_STATUS_COPY.premiumTitle"));
assert.equal(AUTHOR_STATUS_COPY.starterTitle, "Ваш текущий статус – Стартовый");
assert.equal(AUTHOR_STATUS_COPY.premiumTitle, "Премиальный – скоро");
assert.ok(!client.includes("900"));
assert.ok(!client.includes("Бесплатный автор"));
assert.ok(!AUTHOR_STATUS_COPY.starterTitle.includes("Бесплатный"));

const accept = readFileSync(
  path.join(
    root,
    "src/components/author-dashboard/AuthorTermsAcceptPanel.tsx",
  ),
  "utf8",
);
assert.ok(accept.includes("Актуальные коммерческие параметры"));
assert.ok(accept.includes("commercialShare"));

// approved current edition hash
const approved = readFileSync(
  path.join(root, "src/lib/author-terms/approved-content.ts"),
  "utf8",
);
assert.ok(
  approved.includes(
    'contentHash: "594f1f8db5c2e4e90d71adf158c7f54937d037938164143701c49ceb7d77e89d"',
  ),
);
assert.ok(approved.includes('version: "1.1"'));
assert.ok(
  approved.includes(
    "Коммерческие условия и индивидуальные параметры Автора применяются также к платежам слушателей со стоимостью, самостоятельно определяемой слушателем",
  ),
);
assert.ok(
  approved.includes(
    "«Поблагодарить автора» является пользовательским обозначением такой платёжной функции и не изменяет порядок расчёта авторского вознаграждения",
  ),
);

const economicsSrc = readFileSync(
  path.join(root, "src/lib/author-commercial/economics.ts"),
  "utf8",
);
assert.match(economicsSrc, /AUTHOR_COMMERCIAL_SHARE_BPS = 7000/);
assert.match(economicsSrc, /PLATFORM_COMMERCIAL_SHARE_BPS = 3000/);
assert.match(economicsSrc, /getCommercialShareDisplayLines\(share\)/);
assert.doesNotMatch(
  economicsSrc.slice(economicsSrc.indexOf("export function getAuthorRewardCabinetCopy")),
  /70% – получает автор|30% – комиссия АудиоЛада/,
);

const payee = readFileSync(
  path.join(root, "src/lib/authors/ensure-commercial-payee-setup.ts"),
  "utf8",
);
assert.match(payee, /AUTHOR_COMMERCIAL_SHARE_BPS/);
assert.doesNotMatch(payee, /8650|1350|3\.5/);

const checkout = readFileSync(
  path.join(root, "src/app/api/author-appreciation/checkout/route.ts"),
  "utf8",
);
assert.match(checkout, /resolve_author_commercial_terms/);
assert.match(checkout, /canReceiveCanonicalAppreciationAccrual/);
assert.doesNotMatch(checkout, /86[,.]5|13[,.]5|0\.035/);

console.log("author-status-page-unit: ok");
