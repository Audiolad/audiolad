"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AuthorPromoPageForm from "@/components/author-dashboard/AuthorPromoPageForm";
import PromoPagePreviewModal from "@/components/promo-pages/PromoPagePreviewModal";
import type { PromoPagePresentationProduct } from "@/components/promo-pages/PromoPagePresentation";
import { buildPromoPagePath } from "@/lib/promo-pages/paths";
import { mapPublicPromoPageCtaBlock } from "@/lib/promo-pages/public-page";
import {
  getPromoPageStatusClassName,
  getPromoPageStatusLabel,
} from "@/lib/promo-pages/status-labels";
import type {
  PromoPageAdminDto,
  PromoPageRecord,
  PublicPromoPageCtaBlock,
} from "@/lib/promo-pages/types";
import { getPromoPageUiErrorMessage } from "@/lib/promo-pages/errors";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import { copyTextToClipboard } from "@/lib/playlists/public-url";

type PromoPageListItem = PromoPageRecord & {
  product_count: number;
  author_slug: string;
};

type AuthorPromoPagesClientProps = {
  selectedAuthor: AuthorWorkspace;
};

export default function AuthorPromoPagesClient({
  selectedAuthor,
}: AuthorPromoPagesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const pageParam = searchParams.get("page");
  const isFormMode = Boolean(pageParam);

  const [pages, setPages] = useState<PromoPageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [copiedPageId, setCopiedPageId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewDescription, setPreviewDescription] = useState<string | null>(null);
  const [previewFooter, setPreviewFooter] = useState<string | null>(null);
  const [previewCta, setPreviewCta] = useState<PublicPromoPageCtaBlock | null>(null);
  const [previewProducts, setPreviewProducts] = useState<PromoPagePresentationProduct[]>([]);

  useEffect(() => {
    if (isFormMode) {
      return;
    }

    let cancelled = false;

    async function loadPagesEffect() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/author/promotion/pages?author_id=${encodeURIComponent(selectedAuthor.id)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          pages?: PromoPageListItem[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "load_failed");
        }

        if (!cancelled) {
          setPages(payload.pages ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить промостраницы.");
          setPages([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPagesEffect();

    return () => {
      cancelled = true;
    };
  }, [isFormMode, refreshToken, selectedAuthor.id]);

  function openCreateForm() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "new");
    router.push(`/author-dashboard/promotion?${params.toString()}`);
  }

  function openEditForm(pageId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", pageId);
    router.push(`/author-dashboard/promotion?${params.toString()}`);
  }

  function closeForm(refresh = false) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    router.replace(`/author-dashboard/promotion?${params.toString()}`);

    if (refresh) {
      setRefreshToken((value) => value + 1);
    }
  }

  async function handlePublish(pageId: string) {
    setActionLoadingId(pageId);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/author/promotion/pages/${encodeURIComponent(pageId)}/publish`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "publish_failed");
      }

      setRefreshToken((value) => value + 1);
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "publish_failed";
      setActionError(getPromoPageUiErrorMessage(code));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleUnpublish(pageId: string) {
    const confirmed = window.confirm(
      "Снять промостраницу с публикации? После этого её можно будет снова редактировать.",
    );

    if (!confirmed) {
      return;
    }

    setActionLoadingId(pageId);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/author/promotion/pages/${encodeURIComponent(pageId)}/unpublish`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "unpublish_failed");
      }

      setRefreshToken((value) => value + 1);
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "unpublish_failed";
      setActionError(getPromoPageUiErrorMessage(code));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handlePreview(pageId: string) {
    setPreviewLoadingId(pageId);
    setActionError(null);

    try {
      const [pageResponse, productsResponse] = await Promise.all([
        fetch(`/api/author/promotion/pages/${encodeURIComponent(pageId)}`, {
          cache: "no-store",
        }),
        fetch(
          `/api/author/promotion/pages/eligible-products?author_id=${encodeURIComponent(selectedAuthor.id)}`,
          { cache: "no-store" },
        ),
      ]);

      const pagePayload = (await pageResponse.json()) as {
        page?: PromoPageAdminDto;
        error?: string;
      };
      const productsPayload = (await productsResponse.json()) as {
        products?: Array<{
          id: string;
          slug: string;
          title: string;
          format: string | null;
          duration_minutes: number | null;
          audio_count: number;
          cover_url: string | null;
          cover_image: unknown;
          access_label: string;
        }>;
      };

      if (!pageResponse.ok || !pagePayload.page) {
        throw new Error(pagePayload.error ?? "load_failed");
      }

      const eligibleMap = new Map(
        (productsPayload.products ?? []).map((product) => [product.id, product]),
      );

      setPreviewTitle(pagePayload.page.public_title);
      setPreviewDescription(pagePayload.page.public_description);
      setPreviewFooter(pagePayload.page.footer_text);
      setPreviewCta(mapPublicPromoPageCtaBlock(pagePayload.page));
      setPreviewProducts(
        pagePayload.page.products.map((product) => {
          const eligible = eligibleMap.get(product.practice_id);

          return {
            practice_id: product.practice_id,
            slug: product.slug,
            title: product.title,
            format: product.format,
            duration_minutes: product.duration_minutes,
            audio_count: eligible?.audio_count ?? 1,
            cover_url: eligible?.cover_url ?? null,
            cover_image: eligible?.cover_image ?? null,
            access_label: eligible?.access_label ?? null,
          };
        }),
      );
      setPreviewOpen(true);
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "load_failed";
      setActionError(getPromoPageUiErrorMessage(code));
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function handleCopyLink(page: PromoPageListItem) {
    const path = buildPromoPagePath(page.author_slug, page.slug);
    const url = `${window.location.origin}${path}`;
    const ok = await copyTextToClipboard(url);

    if (ok) {
      setCopiedPageId(page.id);
      window.setTimeout(() => setCopiedPageId(null), 1800);
    }
  }

  const sortedPages = useMemo(
    () =>
      [...pages].sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      ),
    [pages],
  );

  if (isFormMode) {
    return (
      <AuthorPromoPageForm
        selectedAuthor={selectedAuthor}
        pageId={pageParam === "new" ? null : pageParam}
        onClose={() => closeForm(false)}
        onSaved={(page: PromoPageAdminDto) => {
          openEditForm(page.id);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-semibold">Промостраницы</h2>
          <p className="mt-1 text-sm text-[#7d70a2]">
            Создавайте посадочные страницы с одной, двумя или тремя практиками.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
        >
          Создать промостраницу
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[#7d70a2]">Загрузка промостраниц…</p>
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

      {!loading && !error && sortedPages.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[#d9c9ef] bg-[#fbf8ff] px-5 py-8 text-center">
          <p className="text-[18px] font-semibold">Промостраницы</p>
          <p className="mt-3 text-sm text-[#7d70a2]">
            Создавайте посадочные страницы с одной, двумя или тремя практиками.
          </p>
          <button
            type="button"
            onClick={openCreateForm}
            className="mt-6 rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
          >
            Создать промостраницу
          </button>
        </div>
      ) : null}

      {!loading && sortedPages.length > 0 ? (
        <div className="space-y-3">
          {sortedPages.map((page) => {
            const isBusy = actionLoadingId === page.id;
            const publicPath = buildPromoPagePath(page.author_slug, page.slug);
            const isDraftLike = page.status !== "published";
            const displayName = page.public_title.trim() || page.internal_name;

            return (
              <article
                key={page.id}
                className="rounded-[22px] border border-[#eadff8] bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-semibold">{displayName}</p>
                    {page.public_title.trim() &&
                    page.internal_name.trim() &&
                    page.public_title.trim() !== page.internal_name.trim() ? (
                      <p className="mt-1 truncate text-sm text-[#7d70a2]">
                        {page.internal_name}
                      </p>
                    ) : null}
                    <p className="mt-1 break-all text-sm text-[#7d70a2]">{publicPath}</p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${getPromoPageStatusClassName(page.status)}`}
                  >
                    {getPromoPageStatusLabel(page.status)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-sm text-[#5f5484]">
                  <span>Практики: {page.product_count}</span>
                  <span className="min-w-0 break-all">Slug: {page.slug}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={previewLoadingId === page.id}
                    onClick={() => void handlePreview(page.id)}
                    className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-60"
                  >
                    Предпросмотр
                  </button>
                  {isDraftLike ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditForm(page.id)}
                        className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5]"
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handlePublish(page.id)}
                        className="rounded-full bg-[#7042c5] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Опубликовать
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleUnpublish(page.id)}
                        className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-60"
                      >
                        Снять с публикации
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(page)}
                        className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5]"
                      >
                        {copiedPageId === page.id ? "Ссылка скопирована" : "Скопировать ссылку"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <PromoPagePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        publicTitle={previewTitle}
        publicDescription={previewDescription}
        footerText={previewFooter}
        cta={previewCta}
        products={previewProducts}
        authorName={selectedAuthor.name}
      />
    </div>
  );
}
