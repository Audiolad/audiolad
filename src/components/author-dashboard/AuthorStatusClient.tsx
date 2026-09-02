import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import {
  AUTHOR_STATUS_COPY,
  type AuthorStatusCta,
  type AuthorStatusViewModel,
} from "@/lib/author-dashboard/author-status";

type Props = {
  authorId: string;
  authorSlug: string;
  view: AuthorStatusViewModel;
};

function AppreciationSettingsCard({
  authorId,
  view,
}: Pick<Props, "authorId" | "view">) {
  const [settings, setSettings] = useState(view.appreciationSettings);
  const [saving, setSaving] = useState(false);

  async function update(next: typeof settings) {
    if (!view.appreciationEligible) return;
    setSettings(next);
    setSaving(true);
    try {
      const response = await fetch("/api/author/appreciation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: authorId,
          listener_appreciation_enabled: next.enabled,
          listener_appreciation_profile_enabled: next.profileEnabled,
          listener_appreciation_free_products_default: next.freeProductsDefault,
        }),
      });
      if (!response.ok) setSettings(view.appreciationSettings);
    } catch {
      setSettings(view.appreciationSettings);
    } finally {
      setSaving(false);
    }
  }

  const rows = [
    {
      key: "enabled" as const,
      label: "Разрешить слушателям благодарить меня",
      description:
        "На бесплатных аудиоматериалах слушатели смогут самостоятельно выбрать сумму благодарности.",
    },
    {
      key: "profileEnabled" as const,
      label: "Показывать на моей странице автора",
    },
    {
      key: "freeProductsDefault" as const,
      label: "Показывать на бесплатных продуктах по умолчанию",
    },
  ];

  return (
    <StatusCard title="Поблагодарить автора" tone={view.appreciationEligible ? "default" : "muted"}>
      {!view.appreciationEligible ? (
        <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
          Доступно авторам с коммерческим статусом.
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <label key={row.key} className="flex items-start justify-between gap-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[#3f3560]">{row.label}</span>
              {row.description ? <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">{row.description}</span> : null}
            </span>
            <input
              type="checkbox"
              checked={settings[row.key]}
              disabled={!view.appreciationEligible || saving}
              onChange={(event) => void update({ ...settings, [row.key]: event.target.checked })}
              className="mt-1 h-5 w-5 shrink-0 rounded border-[#c6afe6] text-[#7042c5] focus:ring-[#9a74d8] disabled:opacity-50"
            />
          </label>
        ))}
      </div>
    </StatusCard>
  );
}

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

export default function AuthorStatusClient({ authorId, authorSlug, view }: Props) {
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

      <AppreciationSettingsCard authorId={authorId} view={view} />

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
