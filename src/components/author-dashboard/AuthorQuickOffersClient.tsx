"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AuthorQuickOfferForm from "@/components/author-dashboard/AuthorQuickOfferForm";
import QuickOfferPublicPage from "@/components/quick-offers/QuickOfferPublicPage";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import { getQuickOfferUiErrorMessage } from "@/lib/quick-offers/errors";
import { mapPublicQuickOfferDto } from "@/lib/quick-offers/mappers";
import { buildQuickOfferPath } from "@/lib/quick-offers/paths";
import {
  getQuickOfferStatusClassName,
  getQuickOfferStatusLabel,
} from "@/lib/quick-offers/status-labels";
import type {
  QuickOfferAdminDto,
  QuickOfferListItem,
} from "@/lib/quick-offers/types";
import { copyTextToClipboard } from "@/lib/playlists/public-url";
import { formatRubles } from "@/lib/products/price-format";

type AuthorQuickOffersClientProps = {
  selectedAuthor: AuthorWorkspace;
};

export default function AuthorQuickOffersClient({
  selectedAuthor,
}: AuthorQuickOffersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const offerParam = searchParams.get("offer");
  const isFormMode = Boolean(offerParam);

  const [offers, setOffers] = useState<QuickOfferListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewOffer, setPreviewOffer] = useState<QuickOfferAdminDto | null>(
    null,
  );

  useEffect(() => {
    if (isFormMode) {
      return;
    }

    let cancelled = false;

    async function loadOffers() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/author/promotion/offers?author_id=${encodeURIComponent(selectedAuthor.id)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          offers?: QuickOfferListItem[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "load_failed");
        }

        if (!cancelled) {
          setOffers(payload.offers ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить быстрые офферы.");
          setOffers([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOffers();

    return () => {
      cancelled = true;
    };
  }, [isFormMode, refreshToken, selectedAuthor.id]);

  function openCreateForm() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("offer", "new");
    router.push(`/author-dashboard/promotion?${params.toString()}`);
  }

  function openEditForm(offerId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("offer", offerId);
    router.push(`/author-dashboard/promotion?${params.toString()}`);
  }

  function closeForm(refresh = false) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("offer");
    router.replace(`/author-dashboard/promotion?${params.toString()}`);

    if (refresh) {
      setRefreshToken((value) => value + 1);
    }
  }

  async function handlePublish(offerId: string) {
    setActionLoadingId(offerId);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/author/promotion/offers/${encodeURIComponent(offerId)}/publish`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "publish_failed");
      }

      setRefreshToken((value) => value + 1);
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "publish_failed";
      setActionError(getQuickOfferUiErrorMessage(code));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleUnpublish(offerId: string) {
    const confirmed = window.confirm(
      "Снять оффер с публикации? Страница станет недоступна по публичной ссылке.",
    );

    if (!confirmed) {
      return;
    }

    setActionLoadingId(offerId);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/author/promotion/offers/${encodeURIComponent(offerId)}/unpublish`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "unpublish_failed");
      }

      setRefreshToken((value) => value + 1);
    } catch (failure) {
      const code =
        failure instanceof Error ? failure.message : "unpublish_failed";
      setActionError(getQuickOfferUiErrorMessage(code));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handlePreview(offerId: string) {
    setActionLoadingId(offerId);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/author/promotion/offers/${encodeURIComponent(offerId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        offer?: QuickOfferAdminDto;
        error?: string;
      };

      if (!response.ok || !payload.offer) {
        throw new Error(payload.error ?? "load_failed");
      }

      setPreviewOffer(payload.offer);
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "load_failed";
      setActionError(getQuickOfferUiErrorMessage(code));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleCopyLink(offer: QuickOfferListItem) {
    const url = `${window.location.origin}${buildQuickOfferPath(offer.slug)}`;
    const ok = await copyTextToClipboard(url);

    if (ok) {
      setCopiedId(offer.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    }
  }

  const sortedOffers = useMemo(
    () =>
      [...offers].sort(
        (left, right) =>
          new Date(right.updated_at).getTime() -
          new Date(left.updated_at).getTime(),
      ),
    [offers],
  );

  if (isFormMode) {
    return (
      <AuthorQuickOfferForm
        selectedAuthor={selectedAuthor}
        offerId={offerParam === "new" ? null : offerParam}
        onClose={() => closeForm(false)}
        onSaved={(offer) => {
          openEditForm(offer.id);
        }}
      />
    );
  }

  const previewPublic = previewOffer
    ? mapPublicQuickOfferDto(previewOffer)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-semibold">Быстрые офферы</h2>
          <p className="mt-1 text-sm text-[#7d70a2]">
            Продающая страница по шаблону «каталог»: обложка, цена, таймер и
            карточки материалов.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
        >
          Создать оффер
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[#7d70a2]">Загрузка офферов…</p>
      ) : null}

      {error ? (
        <div className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRefreshToken((value) => value + 1)}
            className="mt-3 rounded-full border border-[#e4a8a8] px-4 py-2 text-xs font-semibold text-[#9b3d3d]"
          >
            Повторить
          </button>
        </div>
      ) : null}

      {actionError ? (
        <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {actionError}
        </p>
      ) : null}

      {!loading && !error && sortedOffers.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[#d9c9ef] bg-[#fbf8ff] px-5 py-8 text-center">
          <p className="text-[18px] font-semibold">Создайте первый оффер</p>
          <p className="mt-3 text-sm text-[#7d70a2]">
            Привяжите свой продукт, загрузите карточки и опубликуйте страницу.
          </p>
          <button
            type="button"
            onClick={openCreateForm}
            className="mt-6 rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
          >
            Создать оффер
          </button>
        </div>
      ) : null}

      {!loading && sortedOffers.length > 0 ? (
        <div className="space-y-3">
          {sortedOffers.map((offer) => {
            const isBusy = actionLoadingId === offer.id;
            const publicPath = buildQuickOfferPath(offer.slug);
            const isPublished = offer.status === "published";

            return (
              <article
                key={offer.id}
                className="rounded-[22px] border border-[#eadff8] bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-semibold">
                      {offer.title}
                    </p>
                    <p className="mt-1 break-all text-sm text-[#7d70a2]">
                      {publicPath}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${getQuickOfferStatusClassName(offer.status)}`}
                  >
                    {getQuickOfferStatusLabel(offer.status)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-sm text-[#5f5484]">
                  <span>{offer.product_title ?? "Продукт не выбран"}</span>
                  <span>
                    Оплата:{" "}
                    {typeof offer.product_price === "number" &&
                    Number.isFinite(offer.product_price)
                      ? formatRubles(offer.product_price)
                      : "—"}
                  </span>
                  <span>Промо: {formatRubles(offer.promo_price)}</span>
                  <span>Карточки: {offer.material_count}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handlePreview(offer.id)}
                    className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-60"
                  >
                    Предпросмотр
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditForm(offer.id)}
                    className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5]"
                  >
                    Редактировать
                  </button>
                  {isPublished ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleUnpublish(offer.id)}
                        className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-60"
                      >
                        Снять с публикации
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(offer)}
                        className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5]"
                      >
                        {copiedId === offer.id
                          ? "Ссылка скопирована"
                          : "Скопировать ссылку"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handlePublish(offer.id)}
                      className="rounded-full bg-[#7042c5] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Опубликовать
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {previewPublic ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3">
          <div className="mx-auto max-w-[480px] overflow-hidden rounded-[28px] bg-[#fbf8ff] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#eadff8] px-4 py-3">
              <p className="text-sm font-semibold">Предпросмотр оффера</p>
              <button
                type="button"
                onClick={() => setPreviewOffer(null)}
                className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5]"
              >
                Закрыть
              </button>
            </div>
            <QuickOfferPublicPage offer={previewPublic} preview />
          </div>
        </div>
      ) : null}
    </div>
  );
}
