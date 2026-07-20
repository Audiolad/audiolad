"use client";

import { useEffect, useMemo, useState } from "react";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import PromoPagePreviewModal from "@/components/promo-pages/PromoPagePreviewModal";
import type { PromoPagePresentationProduct } from "@/components/promo-pages/PromoPagePresentation";
import { getDisplayFormat } from "@/lib/author-products/format";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import type { PromoEligibleProductOption } from "@/lib/promo-pages/eligible-products";
import { getPromoPageUiErrorMessage } from "@/lib/promo-pages/errors";
import {
  buildAuthorPageCtaPreset,
  buildPromoPagePath,
} from "@/lib/promo-pages/paths";
import {
  getPromoPageStatusClassName,
  getPromoPageStatusLabel,
} from "@/lib/promo-pages/status-labels";
import type { PromoPageAdminDto } from "@/lib/promo-pages/types";
import {
  PROMO_PAGE_MAX_PRODUCTS,
  PROMO_PAGE_PUBLIC_DESCRIPTION_MAX_LENGTH,
  PROMO_PAGE_FOOTER_TEXT_MAX_LENGTH,
  buildPromoPageSlugFromInternalName,
  normalizePromoPageSlug,
} from "@/lib/promo-pages/validation";
import { copyTextToClipboard } from "@/lib/playlists/public-url";
import { formatProductMeta } from "@/lib/products/duration";

type AuthorPromoPageFormProps = {
  selectedAuthor: AuthorWorkspace;
  pageId: string | null;
  onClose: () => void;
  onSaved: (page: PromoPageAdminDto) => void;
};

export default function AuthorPromoPageForm({
  selectedAuthor,
  pageId,
  onClose,
  onSaved,
}: AuthorPromoPageFormProps) {
  const isCreate = !pageId;

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const [status, setStatus] = useState<PromoPageAdminDto["status"]>("draft");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [internalName, setInternalName] = useState("");
  const [publicTitle, setPublicTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [publicDescription, setPublicDescription] = useState("");
  const [footerText, setFooterText] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [eligibleProducts, setEligibleProducts] = useState<PromoEligibleProductOption[]>([]);

  const isPublished = status === "published";
  const isEditable = !isPublished;

  const ctaPreset = useMemo(
    () => buildAuthorPageCtaPreset(selectedAuthor.slug),
    [selectedAuthor.slug],
  );

  const publicPath = buildPromoPagePath(selectedAuthor.slug, slug || "slug");

  useEffect(() => {
    let cancelled = false;

    async function loadEligibleProducts() {
      try {
        const response = await fetch(
          `/api/author/promotion/pages/eligible-products?author_id=${encodeURIComponent(selectedAuthor.id)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          products?: PromoEligibleProductOption[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "load_failed");
        }

        if (!cancelled) {
          setEligibleProducts(payload.products ?? []);
        }
      } catch {
        if (!cancelled) {
          setEligibleProducts([]);
        }
      }
    }

    void loadEligibleProducts();

    return () => {
      cancelled = true;
    };
  }, [selectedAuthor.id]);

  useEffect(() => {
    if (isCreate || !pageId) {
      return;
    }

    if (!pageId) {
      return;
    }

    const currentPageId = pageId;
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/author/promotion/pages/${encodeURIComponent(currentPageId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          page?: PromoPageAdminDto;
          error?: string;
        };

        if (!response.ok || !payload.page) {
          throw new Error(payload.error ?? "load_failed");
        }

        if (cancelled) {
          return;
        }

        const page = payload.page;
        setStatus(page.status);
        setPublishedAt(page.published_at);
        setInternalName(page.internal_name);
        setPublicTitle(page.public_title);
        setSlug(page.slug);
        setSlugTouched(true);
        setPublicDescription(page.public_description ?? "");
        setFooterText(page.footer_text ?? "");
        setCtaLabel(page.cta_label ?? "");
        setCtaHref(page.cta_href ?? "");
        setSelectedProductIds(page.products.map((product) => product.practice_id));
      } catch (failure) {
        if (!cancelled) {
          const code = failure instanceof Error ? failure.message : "load_failed";
          setError(getPromoPageUiErrorMessage(code));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [isCreate, pageId]);

  function handleInternalNameChange(value: string) {
    setInternalName(value);

    if (!slugTouched) {
      setSlug(buildPromoPageSlugFromInternalName(value));
    }
  }

  function handlePublicTitleChange(value: string) {
    setPublicTitle(value);

    if (!slugTouched && !internalName.trim()) {
      setSlug(buildPromoPageSlugFromInternalName(value));
    }
  }

  const selectedProducts = useMemo(
    () =>
      selectedProductIds
        .map((productId) => eligibleProducts.find((product) => product.id === productId))
        .filter((product): product is PromoEligibleProductOption => Boolean(product)),
    [eligibleProducts, selectedProductIds],
  );

  const availableProducts = useMemo(
    () =>
      eligibleProducts.filter(
        (product) =>
          product.eligible && !selectedProductIds.includes(product.id),
      ),
    [eligibleProducts, selectedProductIds],
  );

  const previewProducts: PromoPagePresentationProduct[] = useMemo(
    () =>
      selectedProducts.map((product) => ({
        practice_id: product.id,
        slug: product.slug,
        title: product.title,
        format: product.format,
        duration_minutes: product.duration_minutes,
        audio_count: product.audio_count,
        cover_url: product.cover_url,
        cover_image: product.cover_image,
        access_label: product.access_label,
      })),
    [selectedProducts],
  );

  function moveProduct(index: number, direction: -1 | 1) {
    if (!isEditable) {
      return;
    }

    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= selectedProductIds.length) {
      return;
    }

    setSelectedProductIds((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function removeProduct(productId: string) {
    if (!isEditable) {
      return;
    }

    setSelectedProductIds((current) => current.filter((id) => id !== productId));
  }

  function addProduct(productId: string) {
    if (!isEditable) {
      return;
    }

    if (
      selectedProductIds.includes(productId) ||
      selectedProductIds.length >= PROMO_PAGE_MAX_PRODUCTS
    ) {
      return;
    }

    setSelectedProductIds((current) => [...current, productId]);
  }

  async function persistPage(options?: { stayOnForm?: boolean }) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      author_id: selectedAuthor.id,
      internal_name: internalName.trim(),
      slug: normalizePromoPageSlug(slug),
      public_title: publicTitle.trim(),
      public_description: publicDescription.trim() || null,
      footer_text: footerText.trim() || null,
      cta_label: ctaLabel.trim() || null,
      cta_href: ctaHref.trim() || null,
      practice_ids: selectedProductIds,
    };

    try {
      const response = await fetch(
        isCreate
          ? "/api/author/promotion/pages"
          : `/api/author/promotion/pages/${encodeURIComponent(pageId!)}`,
        {
          method: isCreate ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const body = (await response.json()) as {
        page?: PromoPageAdminDto;
        error?: string;
      };

      if (!response.ok || !body.page) {
        throw new Error(body.error ?? "save_failed");
      }

      const page = body.page;
      setStatus(page.status);
      setPublishedAt(page.published_at);
      setSelectedProductIds(page.products.map((product) => product.practice_id));
      setSuccess("Изменения сохранены.");

      if (isCreate) {
        onSaved(page);
        return page;
      }

      if (!options?.stayOnForm) {
        onSaved(page);
      }

      return page;
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "save_failed";
      setError(getPromoPageUiErrorMessage(code));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();

    if (!isEditable) {
      return;
    }

    await persistPage({ stayOnForm: true });
  }

  async function handlePublish() {
    if (!pageId || isPublished) {
      return;
    }

    setPublishing(true);
    setError(null);
    setSuccess(null);

    const saved = await persistPage({ stayOnForm: true });

    if (!saved) {
      setPublishing(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/author/promotion/pages/${encodeURIComponent(pageId)}/publish`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        page?: PromoPageAdminDto;
        error?: string;
      };

      if (!response.ok || !payload.page) {
        throw new Error(payload.error ?? "publish_failed");
      }

      setStatus(payload.page.status);
      setPublishedAt(payload.page.published_at);
      setSuccess("Промостраница опубликована.");
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "publish_failed";
      setError(getPromoPageUiErrorMessage(code));
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublishAndEdit() {
    if (!pageId || !isPublished) {
      return;
    }

    const confirmed = window.confirm(
      "Снять промостраницу с публикации и перейти к редактированию?",
    );

    if (!confirmed) {
      return;
    }

    setUnpublishing(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/author/promotion/pages/${encodeURIComponent(pageId)}/unpublish`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        page?: PromoPageAdminDto;
        error?: string;
      };

      if (!response.ok || !payload.page) {
        throw new Error(payload.error ?? "unpublish_failed");
      }

      setStatus(payload.page.status);
      setPublishedAt(payload.page.published_at);
      setSuccess("Страница снята с публикации. Теперь её можно редактировать.");
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "unpublish_failed";
      setError(getPromoPageUiErrorMessage(code));
    } finally {
      setUnpublishing(false);
    }
  }

  async function handleCopyPublicLink() {
    const url = `${window.location.origin}${buildPromoPagePath(selectedAuthor.slug, slug)}`;
    const ok = await copyTextToClipboard(url);

    if (ok) {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1800);
    }
  }

  function applyCtaPreset() {
    if (!isEditable) {
      return;
    }

    setCtaLabel(ctaPreset.label);
    setCtaHref(ctaPreset.href);
  }

  function clearCta() {
    if (!isEditable) {
      return;
    }

    setCtaLabel("");
    setCtaHref("");
  }

  if (loading) {
    return <p className="text-sm text-[#7d70a2]">Загрузка промостраницы…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-[#7042c5]"
          >
            ← К списку промостраниц
          </button>
          <h2 className="mt-3 text-[21px] font-semibold">
            {isCreate ? "Новая промостраница" : "Редактирование промостраницы"}
          </h2>
          {!isCreate ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getPromoPageStatusClassName(status)}`}
              >
                {getPromoPageStatusLabel(status)}
              </span>
              {publishedAt ? (
                <span className="text-xs text-[#7d70a2]">
                  Опубликована {new Intl.DateTimeFormat("ru-RU").format(new Date(publishedAt))}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="rounded-full border border-[#ddcfef] px-4 py-2 text-sm font-semibold text-[#7042c5]"
          >
            Предпросмотр
          </button>
          {isPublished ? (
            <>
              <button
                type="button"
                onClick={() => void handleCopyPublicLink()}
                className="rounded-full border border-[#ddcfef] px-4 py-2 text-sm font-semibold text-[#7042c5]"
              >
                {copiedLink ? "Ссылка скопирована" : "Копировать ссылку"}
              </button>
              <button
                type="button"
                disabled={unpublishing}
                onClick={() => void handleUnpublishAndEdit()}
                className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Снять с публикации и редактировать
              </button>
            </>
          ) : (
            <>
              {!isCreate ? (
                <button
                  type="button"
                  disabled={publishing || saving}
                  onClick={() => void handlePublish()}
                  className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {publishing ? "Публикация…" : "Опубликовать"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {isPublished ? (
        <p className="rounded-[18px] border border-[#dce8ff] bg-[#eef3ff] px-4 py-3 text-sm text-[#4f6db8]">
          Опубликованная страница доступна только для просмотра. Чтобы изменить текст или
          продукты, снимите её с публикации.
        </p>
      ) : (
        <p className="rounded-[18px] border border-[#eadff8] bg-[#fbf8ff] px-4 py-3 text-sm text-[#5f5484]">
          Перед публикацией нужны публичный заголовок, slug и от 1 до 3 доступных гостям
          продуктов.
        </p>
      )}

      <form onSubmit={(event) => void handleSave(event)} className="space-y-6">
        <section className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Внутреннее название</span>
            <input
              value={internalName}
              onChange={(event) => handleInternalNameChange(event.target.value)}
              disabled={!isEditable || saving}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#faf6ff]"
              placeholder="Только для кабинета автора"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Публичный заголовок</span>
            <input
              value={publicTitle}
              onChange={(event) => handlePublicTitleChange(event.target.value)}
              disabled={!isEditable || saving}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#faf6ff]"
              placeholder="Заголовок будущей страницы"
            />
          </label>

          <label className="block lg:col-span-2">
            <span className="mb-2 block text-sm font-medium">Slug</span>
            <input
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              disabled={!isEditable || saving}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#faf6ff]"
            />
            <p className="mt-2 break-all text-xs text-[#7d70a2]">
              Будущий адрес: {publicPath}
            </p>
          </label>

          <label className="block lg:col-span-2">
            <span className="mb-2 block text-sm font-medium">Короткое описание</span>
            <textarea
              value={publicDescription}
              onChange={(event) => setPublicDescription(event.target.value)}
              disabled={!isEditable || saving}
              rows={4}
              maxLength={PROMO_PAGE_PUBLIC_DESCRIPTION_MAX_LENGTH}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#faf6ff]"
            />
          </label>

          <label className="block lg:col-span-2">
            <span className="mb-2 block text-sm font-medium">Нижний текст</span>
            <textarea
              value={footerText}
              onChange={(event) => setFooterText(event.target.value)}
              disabled={!isEditable || saving}
              rows={3}
              maxLength={PROMO_PAGE_FOOTER_TEXT_MAX_LENGTH}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#faf6ff]"
            />
          </label>
        </section>

        <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[18px] font-semibold">Нижняя CTA</h3>
              <p className="mt-1 text-sm text-[#7d70a2]">
                Только безопасные внутренние ссылки платформы.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyCtaPreset}
                disabled={!isEditable || saving}
                className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-60"
              >
                {ctaPreset.label}
              </button>
              <button
                type="button"
                onClick={clearCta}
                disabled={!isEditable || saving}
                className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-60"
              >
                Очистить CTA
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Текст кнопки</span>
              <input
                value={ctaLabel}
                onChange={(event) => setCtaLabel(event.target.value)}
                disabled={!isEditable || saving}
                className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#faf6ff]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Ссылка</span>
              <input
                value={ctaHref}
                onChange={(event) => setCtaHref(event.target.value)}
                disabled={!isEditable || saving}
                className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#faf6ff]"
                placeholder="/authors/..."
              />
            </label>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[18px] font-semibold">Продукты</h3>
              <p className="mt-1 text-sm text-[#7d70a2]">
                Выбрано {selectedProductIds.length} из {PROMO_PAGE_MAX_PRODUCTS}
              </p>
            </div>
          </div>

          {selectedProducts.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {selectedProducts.map((product, index) => (
                <li
                  key={product.id}
                  className="flex items-center gap-3 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-3"
                >
                  <ProductCoverThumbnail
                    slug={product.slug}
                    title={product.title}
                    coverUrl={product.cover_url}
                    coverImage={product.cover_image}
                    format={product.format}
                    className="h-16 w-16 shrink-0 rounded-[16px]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
                      {getDisplayFormat(product.format) ?? "Аудиопрактика"}
                    </p>
                    <p className="mt-1 text-sm font-semibold">{product.title}</p>
                    <p className="mt-1 text-xs text-[#7d70a2]">
                      {formatProductMeta({
                        format: product.format,
                        audioCount: product.audio_count,
                        durationMinutesFallback: product.duration_minutes,
                      })}
                      {" · "}
                      {product.access_label}
                    </p>
                  </div>
                  {isEditable ? (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => moveProduct(index, -1)}
                        disabled={index === 0 || saving}
                        aria-label="Поднять выше"
                        className="rounded-full border border-[#ddcfef] px-2 py-1 text-xs"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveProduct(index, 1)}
                        disabled={
                          index === selectedProductIds.length - 1 || saving
                        }
                        aria-label="Опустить ниже"
                        className="rounded-full border border-[#ddcfef] px-2 py-1 text-xs"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeProduct(product.id)}
                        disabled={saving}
                        className="rounded-full border border-[#e4d7f4] px-2 py-1 text-xs text-[#7d70a2]"
                      >
                        ✕
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-[#7d70a2]">Пока ничего не выбрано.</p>
          )}

          {isEditable && availableProducts.length > 0 &&
          selectedProductIds.length < PROMO_PAGE_MAX_PRODUCTS ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-medium">Добавить продукт</span>
              <select
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) {
                    addProduct(event.target.value);
                    event.target.value = "";
                  }
                }}
                disabled={saving}
                className="w-full rounded-[18px] border border-[#ddcfef] bg-white px-4 py-3 text-sm"
              >
                <option value="">Выберите продукт…</option>
                {availableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {eligibleProducts.some((product) => !product.eligible) ? (
            <div className="mt-4 rounded-[18px] border border-[#f1e9fb] bg-[#fbf8ff] px-4 py-3 text-xs text-[#7d70a2]">
              Платные продукты без гостевого доступа не показываются в списке выбора.
            </div>
          ) : null}
        </section>

        {error ? (
          <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="rounded-[18px] border border-[#d7eadf] bg-[#f3fbf6] px-4 py-3 text-sm text-[#3d8d65]">
            {success}
          </p>
        ) : null}

        {isEditable ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Сохранение…" : isCreate ? "Создать черновик" : "Сохранить черновик"}
            </button>
            {!isCreate ? (
              <button
                type="button"
                disabled={publishing || saving}
                onClick={() => void handlePublish()}
                className="rounded-full border border-[#c6afe6] px-5 py-3 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
              >
                {publishing ? "Публикация…" : "Опубликовать"}
              </button>
            ) : null}
          </div>
        ) : null}
      </form>

      <PromoPagePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        publicTitle={publicTitle.trim() || "Публичный заголовок"}
        publicDescription={publicDescription.trim() || null}
        footerText={footerText.trim() || null}
        ctaLabel={ctaLabel.trim() || null}
        ctaHref={ctaHref.trim() || null}
        products={previewProducts}
        authorName={selectedAuthor.name}
      />
    </div>
  );
}
