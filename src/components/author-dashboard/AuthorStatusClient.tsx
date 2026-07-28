import Link from "next/link";
import type { ReactNode } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import {
  AUTHOR_STATUS_COPY,
  type AuthorStatusCta,
  type AuthorStatusViewModel,
} from "@/lib/author-dashboard/author-status";

type Props = {
  authorSlug: string;
  view: AuthorStatusViewModel;
};

function CapabilityList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-6 text-[#4c3d78]">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function StatusCard({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: ReactNode;
  tone?: "default" | "accent" | "muted";
}) {
  const toneClass =
    tone === "accent"
      ? "border-[#d7c4f5] bg-[#faf6ff]"
      : tone === "muted"
        ? "border-[#eadff8] bg-[#fcfbfe]"
        : "border-[#eadff8] bg-white";

  return (
    <section
      className={`rounded-[24px] border px-5 py-6 shadow-[0_8px_22px_rgba(91,62,145,0.06)] ${toneClass}`}
    >
      <h2 className="text-[20px] font-semibold text-[#25135c]">{title}</h2>
      {children}
    </section>
  );
}

function CtaButton({ cta, primary }: { cta: AuthorStatusCta; primary?: boolean }) {
  const className = primary
    ? "mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-6 text-sm font-semibold text-white"
    : "mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#bda6e1] px-6 text-sm font-semibold text-[#7042c5]";

  if (cta.href && !cta.disabled) {
    return (
      <Link href={cta.href} className={className}>
        {cta.label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled
      className={`${className} cursor-not-allowed opacity-40`}
    >
      {cta.label}
    </button>
  );
}

export default function AuthorStatusClient({ authorSlug, view }: Props) {
  const showStarterAsCurrent =
    view.kind === "starter" ||
    view.kind === "commercial_pending" ||
    view.kind === "commercial_ready_for_terms" ||
    view.kind === "commercial_ready_for_payout";

  return (
    <div className="space-y-6">
      <AuthorDashboardNav authorSlug={authorSlug} />

      {showStarterAsCurrent ? (
        <StatusCard title={AUTHOR_STATUS_COPY.starterTitle} tone="accent">
          <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
            {view.currentTierDescription}
          </p>
          <CapabilityList items={view.starterCapabilities} />
          {view.paidProductsLocked ? (
            <p className="mt-4 text-sm leading-6 text-[#8c7dab]">
              {AUTHOR_STATUS_COPY.starterPaidLock}
            </p>
          ) : null}
        </StatusCard>
      ) : null}

      {view.kind === "commercial_active" ? (
        <StatusCard title="Коммерческий статус активен" tone="accent">
          <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
            {view.currentTierDescription}
          </p>
          <CapabilityList items={view.commercialCapabilities} />
        </StatusCard>
      ) : null}

      {view.kind === "commercial_suspended" ||
      view.kind === "workspace_blocked" ? (
        <StatusCard title={`Ваш текущий статус – ${view.currentTierLabel}`}>
          <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
            {view.currentTierDescription}
          </p>
        </StatusCard>
      ) : null}

      {view.kind !== "commercial_active" &&
      view.kind !== "workspace_blocked" ? (
        <StatusCard title={AUTHOR_STATUS_COPY.commercialCardTitle}>
          <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
            {AUTHOR_STATUS_COPY.commercialCardDescription}
          </p>
          <CapabilityList items={view.commercialCapabilities} />
        </StatusCard>
      ) : null}

      {view.showStandardCommercialOffer ? (
        <StatusCard title="Коммерческие условия">
          <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
            {view.shareLines.authorLine}
          </p>
          <p className="mt-2 text-[15px] leading-6 text-[#4c3d78]">
            {view.shareLines.platformLine}
          </p>
          {view.share.isIndividual ? (
            <p className="mt-3 text-sm leading-6 text-[#2f7a4b]">
              Для вашего кабинета назначены индивидуальные коммерческие
              параметры.
            </p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[#8c7dab]">
              Стандартные условия Платформы до назначения индивидуальных
              параметров.
            </p>
          )}
          <p className="mt-4 text-sm leading-6 text-[#8c7dab]">
            {view.platformCommissionScopeText}
          </p>
        </StatusCard>
      ) : null}

      <StatusCard title="Что дальше">
        <div className="flex flex-wrap gap-3">
          <CtaButton cta={view.cta} primary />
          {view.secondaryCtas.map((cta) => (
            <CtaButton key={cta.label} cta={cta} />
          ))}
        </div>
        {view.cta.hint ? (
          <p className="mt-3 text-sm leading-6 text-[#8c7dab]">{view.cta.hint}</p>
        ) : null}
      </StatusCard>

      {view.optionalPayout ? (
        <StatusCard title={view.optionalPayout.title} tone="muted">
          <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
            {view.optionalPayout.description}
          </p>
          <CtaButton cta={view.optionalPayout.cta} />
          {view.optionalPayout.cta.hint ? (
            <p className="mt-3 text-sm leading-6 text-[#8c7dab]">
              {view.optionalPayout.cta.hint}
            </p>
          ) : null}
        </StatusCard>
      ) : null}

      <StatusCard title={AUTHOR_STATUS_COPY.premiumTitle} tone="muted">
        <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">
          {AUTHOR_STATUS_COPY.premiumDescription}
        </p>
        <p className="mt-4 text-sm font-semibold text-[#7d70a2]">
          Предварительные возможности
        </p>
        <CapabilityList items={view.premiumCapabilities} />
        <p className="mt-4 text-sm leading-6 text-[#8c7dab]">
          {AUTHOR_STATUS_COPY.premiumPricingNote}
        </p>
      </StatusCard>
    </div>
  );
}
