"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import TopicSelector, {
  type TopicSelectorOption,
} from "@/components/author-products/TopicSelector";
import {
  AUTHOR_TYPE_LABELS,
  MAX_FEATURED_PRODUCTS,
  MAX_SHORT_BIO_LENGTH,
  type AuthorType,
} from "@/lib/authors/constants";
import type { AuthorProfileDetail } from "@/lib/authors/profile";
import { getDisplayFormat } from "@/lib/author-products/format";
import { getProductPriceLabel } from "@/lib/products/price-format";
import { buildAuthorPublicPath } from "@/lib/products/paths";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import { getShortBioLengthError } from "@/lib/authors/validation";

import { useAuthorAssetUpload } from "./useAuthorAssetUpload";

type PublishedProductOption = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  cover_url: string | null;
  price: number | null;
  is_free: boolean | null;
};

type AuthorProfileClientProps = {
  authors: AuthorWorkspace[];
  topicOptions: TopicSelectorOption[];
};

function AuthorAvatarUploadBlock({
  authorId,
  avatarUrl,
  disabled,
  onUpdated,
}: {
  authorId: string;
  avatarUrl: string | null;
  disabled?: boolean;
  onUpdated: (url: string | null) => void;
}) {
  const {
    fileInputRef,
    uploading,
    deleting,
    error,
    displaySrc,
    showPreview,
    openPicker,
    deleteAsset,
    handleFileChange,
    isBusy,
    setPreviewFailed,
  } = useAuthorAssetUpload({
    assetUrl: avatarUrl,
    authorId,
    kind: "avatar",
    disabled,
    onUpdated: (result) => onUpdated(result.url),
  });

  return (
    <div>
      <span className="mb-2 block text-sm font-medium">Фотография или логотип</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || isBusy}
          className="group relative block h-28 w-28 overflow-hidden rounded-[18px] border border-[#d9c9ef] bg-[#f8f4fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
        >
          {showPreview && displaySrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displaySrc}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setPreviewFailed(true)}
              />
              <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-[#25135c]/0 pb-2 text-xs font-medium text-white opacity-0 transition group-hover:bg-[#25135c]/35 group-hover:opacity-100">
                Заменить
              </span>
            </>
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-[#8c79b6]">
              Загрузить
            </span>
          )}
        </button>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled || isBusy}
            className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
          >
            {uploading ? "Загрузка…" : showPreview ? "Изменить" : "Загрузить"}
          </button>
          {avatarUrl ? (
            <button
              type="button"
              onClick={() => void deleteAsset()}
              disabled={disabled || isBusy}
              className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7d70a2]"
            >
              {deleting ? "Удаление…" : "Удалить"}
            </button>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-sm leading-5 text-[#7d70a2]">
        Квадратное изображение JPG, PNG или WebP до 3 МБ.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFileChange}
      />

      {error ? (
        <p className="mt-3 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AuthorBannerUploadBlock({
  authorId,
  bannerUrl,
  disabled,
  onUpdated,
}: {
  authorId: string;
  bannerUrl: string | null;
  disabled?: boolean;
  onUpdated: (url: string | null) => void;
}) {
  const {
    fileInputRef,
    uploading,
    deleting,
    error,
    displaySrc,
    showPreview,
    openPicker,
    deleteAsset,
    handleFileChange,
    isBusy,
    setPreviewFailed,
  } = useAuthorAssetUpload({
    assetUrl: bannerUrl,
    authorId,
    kind: "banner",
    disabled,
    onUpdated: (result) => onUpdated(result.url),
  });

  return (
    <div>
      <span className="mb-2 block text-sm font-medium">Фоновый баннер</span>
      <div className="relative flex flex-col gap-4">
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || isBusy}
          className="group relative block h-32 w-full overflow-hidden rounded-[20px] border border-[#d9c9ef] bg-[#f8f4fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60 sm:h-40"
        >
          {showPreview && displaySrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displaySrc}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setPreviewFailed(true)}
              />
              <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-[#25135c]/0 pb-3 text-xs font-medium text-white opacity-0 transition group-hover:bg-[#25135c]/35 group-hover:opacity-100">
                Заменить баннер
              </span>
            </>
          ) : (
            <span className="flex h-full items-center justify-center text-sm text-[#8c79b6]">
              Загрузить баннер
            </span>
          )}
        </button>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled || isBusy}
            className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
          >
            {uploading ? "Загрузка…" : showPreview ? "Изменить" : "Загрузить"}
          </button>
          {bannerUrl ? (
            <button
              type="button"
              onClick={() => void deleteAsset()}
              disabled={disabled || isBusy}
              className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7d70a2]"
            >
              {deleting ? "Удаление…" : "Удалить"}
            </button>
          ) : null}
        </div>

        <p className="text-sm leading-5 text-[#7d70a2]">
          Широкое изображение с соотношением около 3:1. JPG, PNG или WebP до 3 МБ.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFileChange}
      />

      {error ? (
        <p className="mt-3 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function AuthorProfileClient({
  authors,
  topicOptions,
}: AuthorProfileClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedAuthor = useMemo(() => {
    const slug = searchParams.get("author");
    return authors.find((author) => author.slug === slug) ?? authors[0] ?? null;
  }, [authors, searchParams]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [authorType, setAuthorType] = useState<AuthorType>("person");
  const [shortBio, setShortBio] = useState("");
  const [fullBio, setFullBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [topicKeys, setTopicKeys] = useState<string[]>([]);
  const [featuredProductIds, setFeaturedProductIds] = useState<string[]>([]);
  const [publishedProducts, setPublishedProducts] = useState<
    PublishedProductOption[]
  >([]);
  const [profileSlug, setProfileSlug] = useState("");

  useEffect(() => {
    if (!selectedAuthor) {
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const response = await fetch(
          `/api/author/profile?author_id=${encodeURIComponent(selectedAuthor.id)}`,
        );

        if (!response.ok) {
          throw new Error("load_failed");
        }

        const payload = (await response.json()) as {
          profile: AuthorProfileDetail;
          publishedProducts: PublishedProductOption[];
        };

        if (cancelled) {
          return;
        }

        const profile = payload.profile;
        setName(profile.name);
        setAuthorType((profile.author_type as AuthorType) ?? "person");
        setShortBio(profile.short_bio?.trim() || profile.description?.trim() || "");
        setFullBio(profile.full_bio?.trim() || "");
        setAvatarUrl(profile.avatar_url);
        setBannerUrl(profile.banner_url);
        setTopicKeys(profile.topicKeys);
        setFeaturedProductIds(profile.featuredProducts.map((product) => product.id));
        setPublishedProducts(payload.publishedProducts ?? []);
        setProfileSlug(profile.slug);
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить профиль автора.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [selectedAuthor]);

  function handleWorkspaceChange(nextSlug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("author", nextSlug);
    router.replace(`/author-dashboard/profile?${params.toString()}`);
  }

  function moveFeaturedProduct(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= featuredProductIds.length) {
      return;
    }

    setFeaturedProductIds((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function removeFeaturedProduct(productId: string) {
    setFeaturedProductIds((current) =>
      current.filter((id) => id !== productId),
    );
  }

  function addFeaturedProduct(productId: string) {
    if (
      featuredProductIds.includes(productId) ||
      featuredProductIds.length >= MAX_FEATURED_PRODUCTS
    ) {
      return;
    }

    setFeaturedProductIds((current) => [...current, productId]);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();

    if (!selectedAuthor || saving) {
      return;
    }

    const shortBioError = getShortBioLengthError(shortBio.trim().length);

    if (shortBioError) {
      setError(shortBioError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/author/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: selectedAuthor.id,
          name: name.trim(),
          author_type: authorType,
          short_bio: shortBio.trim() || null,
          full_bio: fullBio.trim() || null,
          topic_keys: topicKeys,
          featured_product_ids: featuredProductIds,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "save_failed");
      }

      const payload = (await response.json()) as {
        profile: AuthorProfileDetail;
        publishedProducts: PublishedProductOption[];
      };

      setName(payload.profile.name);
      setTopicKeys(payload.profile.topicKeys);
      setFeaturedProductIds(
        payload.profile.featuredProducts.map((product) => product.id),
      );
      setPublishedProducts(payload.publishedProducts ?? []);
      setProfileSlug(payload.profile.slug);
      setSuccess("Изменения сохранены.");
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message === "featured_product_forbidden"
          ? "Можно добавлять только собственные опубликованные продукты."
          : "Не удалось сохранить профиль. Проверьте данные и попробуйте снова.",
      );
    } finally {
      setSaving(false);
    }
  }

  const availableProducts = publishedProducts.filter(
    (product) => !featuredProductIds.includes(product.id),
  );

  const shortBioLength = shortBio.trim().length;

  if (!selectedAuthor) {
    return null;
  }

  return (
    <div>
      <AuthorDashboardNav authorSlug={selectedAuthor.slug} />

      {authors.length > 1 ? (
        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-medium text-[#65577f]">
            Авторское пространство
          </span>
          <select
            value={selectedAuthor.slug}
            onChange={(event) => handleWorkspaceChange(event.target.value)}
            className="w-full rounded-[18px] border border-[#ddcfef] bg-white px-4 py-3 text-sm"
          >
            {authors.map((author) => (
              <option key={author.id} value={author.slug}>
                {author.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-[#7d70a2]">Загрузка профиля…</p>
      ) : (
        <form onSubmit={handleSave} className="mt-6 space-y-8">
          <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
            <h2 className="text-lg font-semibold">Основное</h2>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium">
                Имя автора или название проекта
              </span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
                className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm"
              />
            </label>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium">Тип страницы</span>
              <select
                value={authorType}
                onChange={(event) =>
                  setAuthorType(event.target.value as AuthorType)
                }
                className="w-full rounded-[18px] border border-[#ddcfef] bg-white px-4 py-3 text-sm"
              >
                {(Object.keys(AUTHOR_TYPE_LABELS) as AuthorType[]).map((type) => (
                  <option key={type} value={type}>
                    {AUTHOR_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-5">
              <AuthorAvatarUploadBlock
                authorId={selectedAuthor.id}
                avatarUrl={avatarUrl}
                disabled={saving}
                onUpdated={setAvatarUrl}
              />
            </div>

            <div className="mt-5">
              <AuthorBannerUploadBlock
                authorId={selectedAuthor.id}
                bannerUrl={bannerUrl}
                disabled={saving}
                onUpdated={setBannerUrl}
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
            <h2 className="text-lg font-semibold">Описание</h2>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium">Коротко об авторе</span>
              <textarea
                value={shortBio}
                onChange={(event) => setShortBio(event.target.value)}
                rows={3}
                maxLength={MAX_SHORT_BIO_LENGTH}
                className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm leading-6"
              />
              <span className="mt-1 block text-xs text-[#7d70a2]">
                {shortBioLength}/{MAX_SHORT_BIO_LENGTH}
              </span>
            </label>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium">Об авторе</span>
              <textarea
                value={fullBio}
                onChange={(event) => setFullBio(event.target.value)}
                rows={8}
                className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm leading-6"
                placeholder="Расскажите о себе или проекте. Абзацы разделяйте пустой строкой."
              />
            </label>

            <div className="mt-5">
              <TopicSelector
                options={topicOptions}
                value={topicKeys}
                limit={6}
                disabled={saving}
                onChange={setTopicKeys}
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
            <h2 className="text-lg font-semibold">Рекомендуем начать</h2>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              Выберите продукты, которые лучше всего подходят для первого знакомства с
              вами.
            </p>

            {featuredProductIds.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {featuredProductIds.map((productId, index) => {
                  const product = publishedProducts.find(
                    (item) => item.id === productId,
                  );

                  if (!product) {
                    return null;
                  }

                  return (
                    <li
                      key={productId}
                      className="flex items-center gap-3 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
                          {getDisplayFormat(product.format) ?? "Аудиопрактика"}
                        </p>
                        <p className="mt-1 text-sm font-semibold">{product.title}</p>
                        <p className="mt-1 text-xs text-[#7d70a2]">
                          {getProductPriceLabel(product.price, product.is_free)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => moveFeaturedProduct(index, -1)}
                          disabled={index === 0 || saving}
                          aria-label="Поднять выше"
                          className="rounded-full border border-[#ddcfef] px-2 py-1 text-xs"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveFeaturedProduct(index, 1)}
                          disabled={
                            index === featuredProductIds.length - 1 || saving
                          }
                          aria-label="Опустить ниже"
                          className="rounded-full border border-[#ddcfef] px-2 py-1 text-xs"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFeaturedProduct(productId)}
                          disabled={saving}
                          className="rounded-full border border-[#e4d7f4] px-2 py-1 text-xs text-[#7d70a2]"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[#7d70a2]">
                Пока ничего не выбрано.
              </p>
            )}

            {availableProducts.length > 0 &&
            featuredProductIds.length < MAX_FEATURED_PRODUCTS ? (
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium">Добавить продукт</span>
                <select
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) {
                      addFeaturedProduct(event.target.value);
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
          </section>

          {error ? (
            <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
              {error}
            </p>
          ) : null}

          {success ? (
            <p className="rounded-[18px] border border-[#c8ead8] bg-[#f3fbf7] px-4 py-3 text-sm text-[#2f7a55]">
              {success}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>

            {profileSlug ? (
              <Link
                href={buildAuthorPublicPath(profileSlug)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-full border border-[#c6afe6] px-6 py-3 text-sm font-semibold text-[#7042c5]"
              >
                Открыть публичную страницу
              </Link>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
