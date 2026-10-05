"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import AuthorSeoDiscoveryPanel from "@/components/author-dashboard/AuthorSeoDiscoveryPanel";
import AuthorSeoPromptBuilder from "@/components/author-dashboard/AuthorSeoPromptBuilder";
import { getProductSeoQueryStepCopy } from "@/lib/seo-queries/product-seo-query-step-copy";
import {
  opportunitiesAfterOwnReservationRelease,
  releaseSeoQueryConfirmCopy,
  requestReleaseSeoReservation,
  selectOwnUnlinkedSeoOpportunities,
} from "@/lib/seo-queries/release-own-seo-reservation";
import { buildAuthorProductCreateHref } from "@/lib/seo-queries/reservation-product-create-href";
import { transferSeoReservationToWorkspace } from "@/lib/seo-queries/seo-reservation-product-context";
import type {
  SeoQueryOpportunity,
  SeoWorkspaceReservation,
} from "@/lib/seo-queries/types";
import { countActiveAuthorSeoReservations } from "@/lib/seo-queries/types";

type Props = {
  authorId: string;
  authorName: string;
  authorSlug: string;
  publicationClass: string;
  opportunities: SeoQueryOpportunity[];
  otherWorkspaceReservations: SeoWorkspaceReservation[];
};

function formatMonthlyFrequency(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
  return `Запросов в месяц: ${value.toLocaleString("ru-RU")}`;
}

/**
 * Pre-create SEO query selection for Aurafon and for any music release.
 * Not a wizard step — sits between type chooser and AuthorProductForm.
 */
export default function AuthorProductSeoQueryStep({
  authorId,
  authorName,
  authorSlug,
  publicationClass,
  opportunities,
  otherWorkspaceReservations,
}: Props) {
  const router = useRouter();
  const [releasedReservationIds, setReleasedReservationIds] = useState<string[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<SeoQueryOpportunity | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<{
    reservationId: string;
    message: string;
  } | null>(null);
  const [transferError, setTransferError] = useState<{
    reservationId: string;
    message: string;
  } | null>(null);

  const visibleOpportunities = useMemo(
    () => opportunitiesAfterOwnReservationRelease(opportunities, releasedReservationIds),
    [opportunities, releasedReservationIds],
  );
  const activeCount = countActiveAuthorSeoReservations(visibleOpportunities);
  const ownUnlinked = selectOwnUnlinkedSeoOpportunities(visibleOpportunities);
  const skipHref = buildAuthorProductCreateHref({
    authorSlug,
    publicationClass,
    seoQuerySkip: true,
  });
  const copy = getProductSeoQueryStepCopy(publicationClass);
  const confirmCopy = confirmTarget
    ? releaseSeoQueryConfirmCopy(confirmTarget.queryText)
    : null;
  const confirmError =
    confirmTarget?.reservationId &&
    releaseError?.reservationId === confirmTarget.reservationId
      ? releaseError.message
      : null;

  async function confirmRelease() {
    const reservationId = confirmTarget?.reservationId;
    if (!reservationId || pendingId) return;
    setPendingId(reservationId);
    setReleaseError(null);
    const result = await requestReleaseSeoReservation({
      authorId,
      reservationId,
      publicationClass,
    });
    setPendingId(null);
    if (!result.ok) {
      setReleaseError({ reservationId, message: result.message });
      return;
    }
    setReleasedReservationIds((current) =>
      current.includes(reservationId) ? current : [...current, reservationId],
    );
    setConfirmTarget(null);
    router.refresh();
  }

  async function transferAndContinue(item: SeoWorkspaceReservation) {
    if (pendingId) return;
    setPendingId(item.reservationId);
    setTransferError(null);

    const result = await transferSeoReservationToWorkspace({
      reservationId: item.reservationId,
      targetAuthorId: authorId,
    });

    setPendingId(null);
    if (!result.ok) {
      setTransferError({
        reservationId: item.reservationId,
        message: result.message,
      });
      return;
    }

    router.push(
      buildAuthorProductCreateHref({
        authorSlug,
        publicationClass,
        reservationId: result.reservation.id,
      }),
    );
  }

  return (
    <div className="space-y-5" data-testid="author-product-seo-query-step">
      <section className="rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-[0_8px_22px_rgba(91,62,145,0.05)]">
        <h2 className="text-lg font-semibold text-[#25135c]">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#4c3d78]">
          {copy.description}
        </p>
      </section>

      {ownUnlinked.length > 0 ? (
        <section className="rounded-[24px] border border-[#d7c4f5] bg-white p-5">
          <h3 className="text-base font-semibold text-[#25135c]">
            Ваши запросы в работе
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#4c3d78]">
            Эти запросы уже закреплены за вами и ещё не привязаны к продукту.
          </p>
          <div className="mt-3 grid gap-3">
            {ownUnlinked.map((item) => {
              const frequencyLabel = formatMonthlyFrequency(item.frequency);
              const releasing = pendingId === item.reservationId;
              return (
              <article
                key={item.reservationId ?? item.id}
                className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-[#25135c]">
                      {item.queryText}
                    </h4>
                    {frequencyLabel ? (
                      <p className="mt-1 text-sm text-[#5f5484]">
                        {frequencyLabel}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#7042c5]">
                    У вас в работе
                  </span>
                </div>
                {item.reservationId ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link
                      href={buildAuthorProductCreateHref({
                        authorSlug,
                        publicationClass,
                        reservationId: item.reservationId,
                      })}
                      className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
                    >
                      Выбрать и продолжить
                    </Link>
                    <button
                      type="button"
                      disabled={releasing}
                      onClick={() => setConfirmTarget(item)}
                      className="inline-flex min-h-10 items-center rounded-full border border-[#bda6e1] bg-white px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-50"
                      data-testid="author-product-seo-query-release"
                    >
                      {releasing ? "Освобождаем…" : "Освободить запрос"}
                    </button>
                  </div>
                ) : null}
                {releaseError?.reservationId === item.reservationId ? (
                  <p role="alert" className="mt-2 text-sm font-medium text-[#9b3d3d]">
                    {releaseError.message}
                  </p>
                ) : null}
                {item.reservationId ? (
                  <AuthorSeoPromptBuilder
                    primaryQueryText={item.queryText}
                    primaryQueryId={item.id}
                    analyzedOpportunities={visibleOpportunities}
                  />
                ) : null}
              </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {otherWorkspaceReservations.length > 0 ? (
        <section
          className="rounded-[24px] border border-[#d7c4f5] bg-[#faf6ff] p-5"
          data-testid="author-product-seo-other-workspaces"
        >
          <h3 className="text-base font-semibold text-[#25135c]">
            Забронировано в других авторских пространствах
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#4c3d78]">
            Эти запросы закреплены за другими вашими проектами. Если хотите
            создавать продукт от текущего проекта, перенесите бронь сюда.
          </p>
          <div className="mt-3 grid gap-3">
            {otherWorkspaceReservations.map((item) => {
              const frequencyLabel = formatMonthlyFrequency(item.frequency);
              return (
                <article
                  key={item.reservationId}
                  className="rounded-[18px] border border-[#eadff8] bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-[#25135c]">
                        {item.queryText}
                      </h4>
                      <p className="mt-1 text-sm font-medium text-[#7042c5]">
                        Авторское пространство: {item.authorName}
                      </p>
                      {frequencyLabel ? (
                        <p className="mt-1 text-sm text-[#5f5484]">
                          {frequencyLabel}
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-[#f7f2ff] px-3 py-1 text-xs font-semibold text-[#7042c5]">
                      У вас в работе
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={Boolean(pendingId)}
                      onClick={() => void transferAndContinue(item)}
                      className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {pendingId === item.reservationId
                        ? "Переносим…"
                        : `Перенести в «${authorName}» и продолжить`}
                    </button>
                    <Link
                      href={buildAuthorProductCreateHref({
                        authorSlug: item.authorSlug,
                        publicationClass,
                        reservationId: item.reservationId,
                      })}
                      className="text-sm font-semibold text-[#7042c5]"
                    >
                      Открыть «{item.authorName}»
                    </Link>
                  </div>
                  {transferError?.reservationId === item.reservationId ? (
                    <p role="alert" className="mt-2 text-sm font-medium text-[#9b3d3d]">
                      {transferError.message}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <AuthorSeoDiscoveryPanel
        authorId={authorId}
        authorSlug={authorSlug}
        variant="product-create"
        publicationClass={publicationClass}
        activeReservationCount={activeCount}
        releasedReservationIds={releasedReservationIds}
        analyzedOpportunities={visibleOpportunities}
      />

      <div className="flex justify-center pt-1">
        <Link
          href={skipHref}
          className="inline-flex min-h-10 items-center rounded-full border border-[#d7c4f5] bg-transparent px-4 text-sm font-medium text-[#5f5484] hover:border-[#bda6e1] hover:text-[#7042c5]"
          data-testid="author-product-seo-query-skip"
        >
          Продолжить без поискового запроса
        </Link>
      </div>

      {confirmTarget && confirmCopy ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(36,24,58,0.45)] p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            if (!pendingId) setConfirmTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-seo-query-title"
            aria-describedby="release-seo-query-description"
            className="w-full max-w-md rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-[0_18px_40px_rgba(91,62,145,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="release-seo-query-title" className="text-[18px] font-semibold text-[#25135c]">
              {confirmCopy.title}
            </h2>
            <p id="release-seo-query-description" className="mt-3 text-sm leading-6 text-[#5f5484]">
              {confirmCopy.description}
            </p>
            {confirmError ? (
              <p role="alert" className="mt-3 text-sm font-medium text-[#9b3d3d]">
                {confirmError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={Boolean(pendingId)}
                className="min-h-11 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void confirmRelease()}
                disabled={Boolean(pendingId)}
                className="min-h-11 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6237ad] disabled:opacity-60"
                data-testid="author-product-seo-query-release-confirm"
              >
                {pendingId ? "Освобождаем…" : "Освободить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
