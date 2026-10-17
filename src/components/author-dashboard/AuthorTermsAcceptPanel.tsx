"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  SUPPORT_MODE_ACCEPTANCE_FORBIDDEN,
  SUPPORT_MODE_CONSENT_NOTICE,
} from "@/lib/author-support/consent-guard";
import type { AuthorTermsStatusView } from "@/lib/author-terms/types";
import {
  AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT,
  AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT_UPDATED,
} from "@/lib/author-terms/types";
import {
  UNIFIED_AGREEMENT_ACCEPTANCE_TEXT,
  UNIFIED_AGREEMENT_ACCEPTANCE_TEXT_UPDATED,
  UNIFIED_AGREEMENT_TITLE,
} from "@/lib/author-terms/unified-agreement-texts";

export type AuthorTermsCommercialShareSummary = {
  authorLine: string;
  platformLine: string;
  scopeText: string;
  isIndividual: boolean;
};

type Props = {
  authorId: string;
  authorSlug: string;
  status: AuthorTermsStatusView;
  mode: "first" | "updated";
  /** `card` — standalone block; `embedded` — controls only inside a parent card. */
  variant?: "card" | "embedded";
  /** Current commercial parameters shown before the acceptance checkbox. */
  commercialShare?: AuthorTermsCommercialShareSummary | null;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

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

export default function AuthorTermsAcceptPanel({
  authorId,
  authorSlug,
  status,
  mode,
  variant = "card",
  commercialShare = null,
}: Props) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const version = status.currentVersion;
  const embedded = variant === "embedded";
  // Unified agreement 2.0 (flag on and current edition covers Business): one document, one checkbox.
  const unified = status.coversBusiness === true;
  const checkboxLabel = unified
    ? mode === "updated"
      ? UNIFIED_AGREEMENT_ACCEPTANCE_TEXT_UPDATED
      : UNIFIED_AGREEMENT_ACCEPTANCE_TEXT
    : mode === "updated"
      ? AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT_UPDATED
      : AUTHOR_TERMS_ACCEPTANCE_CHECKBOX_TEXT;
  const title = unified
    ? UNIFIED_AGREEMENT_TITLE
    : mode === "updated"
      ? "Авторские условия обновлены"
      : "Авторские условия сотрудничества";
  const lead = unified
    ? "Одно соглашение на все способы монетизации на Платформе, включая «АудиоЛад Бизнес» и сублицензирование заведениям. Отдельные заявления и согласия по альбомам и трекам не нужны. Принять соглашение может только сам автор."
    : mode === "updated"
      ? "Для продолжения коммерческой деятельности необходимо ознакомиться с новой редакцией и принять её."
      : "Для публикации продуктов и получения авторского вознаграждения необходимо ознакомиться с Авторскими условиями сотрудничества платформы «АудиоЛад» и принять их.";
  const openLabel = embedded
    ? "Открыть документ"
    : unified
      ? "Открыть соглашение"
      : mode === "updated"
        ? "Посмотреть новую редакцию"
        : "Открыть Авторские условия";
  const submitLabel = embedded
    ? "Принять и продолжить"
    : mode === "updated"
      ? "Принять новую редакцию"
      : "Принять и продолжить";

  async function onSubmit() {
    if (!checked || pending || !status.canAccept || status.supportMode) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/author/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: authorId,
          acknowledged: true,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(
          data.error === SUPPORT_MODE_ACCEPTANCE_FORBIDDEN ||
            data.error === "support_mutation_blocked"
            ? SUPPORT_MODE_CONSENT_NOTICE
            : data.error === "forbidden"
              ? "Принять условия может только владелец кабинета автора."
              : "Не удалось сохранить принятие. Попробуйте ещё раз.",
        );
        return;
      }

      setSuccess(true);
      router.refresh();
    } catch {
      setError("Не удалось сохранить принятие. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  const controls = (
    <>
      <div className="mt-5">
        <Link
          href="/author-terms"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-full border border-[#7042c5] px-5 text-sm font-semibold text-[#7042c5]"
        >
          {openLabel}
        </Link>
      </div>

      {commercialShare ? (
        <div className="mt-5 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#4c3d78]">
          <p className="font-semibold text-[#25135c]">
            Актуальные коммерческие параметры
          </p>
          <p className="mt-2">{commercialShare.authorLine}</p>
          <p className="mt-1">{commercialShare.platformLine}</p>
          <p className="mt-2 text-[#8c7dab]">
            {commercialShare.isIndividual
              ? "Для вашего кабинета назначены индивидуальные параметры."
              : "Стандартные условия Платформы."}
          </p>
          <p className="mt-2 text-[#8c7dab]">{commercialShare.scopeText}</p>
        </div>
      ) : null}

      {status.supportMode ? (
        <p
          role="note"
          data-testid="support-mode-acceptance-blocked"
          className="mt-5 rounded-[18px] border border-[#f1d9a6] bg-[#fff8e8] px-4 py-3 text-sm leading-6 text-[#6b4a00]"
        >
          {SUPPORT_MODE_CONSENT_NOTICE}
        </p>
      ) : status.role === "editor" ? (
        <p className="mt-5 text-sm leading-6 text-[#8c7dab]">
          Принять условия может только владелец кабинета автора. Вы можете
          ознакомиться с документом по ссылке выше.
        </p>
      ) : (
        <>
          <label className="mt-6 flex cursor-pointer items-start gap-3 text-[15px] leading-6 text-[#2f2548]">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[#7042c5]"
              checked={checked}
              disabled={pending || success}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span>{checkboxLabel}</span>
          </label>

          <button
            type="button"
            disabled={!checked || pending || success || !status.canAccept}
            onClick={() => void onSubmit()}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Сохраняем…" : submitLabel}
          </button>
        </>
      )}

      {success ? (
        <p className="mt-4 text-sm font-semibold text-[#2f7a4b]">Условия приняты</p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-[#b42318]">{error}</p> : null}
    </>
  );

  if (embedded) {
    return <div>{controls}</div>;
  }

  return (
    <section className="rounded-[24px] border border-[#eadff8] bg-white px-5 py-6 shadow-[0_8px_22px_rgba(91,62,145,0.06)]">
      <h2 className="text-[22px] font-semibold text-[#25135c]">{title}</h2>
      <p className="mt-3 text-[15px] leading-6 text-[#4c3d78]">{lead}</p>

      {version ? (
        <p className="mt-3 text-sm leading-6 text-[#8c7dab]">
          Версия: {version.version}
          <br />
          Дата публикации: {formatDate(version.publishedAt)}
          <br />
          Дата вступления в силу: {formatDate(version.effectiveAt)}
        </p>
      ) : null}

      {controls}

      <p className="mt-6 text-sm text-[#8c7dab]">
        <Link
          href={`/author-dashboard/legal?author=${encodeURIComponent(authorSlug)}`}
          className="text-[#7042c5] underline-offset-2 hover:underline"
        >
          Юридические документы
        </Link>
      </p>
    </section>
  );
}
