"use client";

import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { useEffect, useState } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorAccessStatusBanner from "@/components/author-dashboard/AuthorAccessStatusBanner";
import AuthorOnboardingChecklist from "@/components/author-dashboard/AuthorOnboardingChecklist";
import AuthorTermsRequiredBanner from "@/components/author-dashboard/AuthorTermsRequiredBanner";
import { useAuthorProjectSelection } from "@/components/author-dashboard/useAuthorProjectSelection";
import {
  AUTHOR_PRODUCT_FREE_PRICE_LABEL,
  FREE_AUTHOR_PRODUCTS_EMPTY_STATE,
} from "@/lib/author-dashboard/free-author-first-step";
import {
  AUTHOR_TELEGRAM_CHAT_NAME,
  AUTHOR_TELEGRAM_CHAT_URL,
} from "@/lib/authors/community";
import { buildPracticePublicPath } from "@/lib/products/paths";
import {
  authorPublicationScheduleLine,
  isPracticePubliclyAvailable,
} from "@/lib/products/scheduled-publication";
import {
  getAudioPostDisplayLabel,
  getDisplayFormat,
} from "@/lib/author-products/format";
import {
  isAudioPostProductKind,
  isMusicProductKind,
} from "@/lib/author-products/product-kind";
import {
  getVisibleAuthorProductStatus,
  VISIBLE_AUTHOR_PRODUCT_STATUS,
} from "@/lib/author-products/moderation";
import type { AuthorProductListItem, AuthorWorkspace } from "@/lib/author-products/types";
import { authorAccessAllowsContentMutations } from "@/lib/authors/access";
import {
  formatPriceLabel,
  formatUpdatedAt,
  getStatusClassName,
  getStatusLabel,
} from "@/lib/author-products/types";

type AuthorDashboardClientProps = {
  authors: AuthorWorkspace[];
};


function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="m20.6 4.3-2.8 14.1c-.2 1-.8 1.2-1.6.8l-4.5-3.3-2.2 2.1c-.2.2-.5.5-.9.5l.3-4.6 8.4-7.6c.4-.3-.1-.5-.6-.2L6.3 12.1l-4.4-1.4c-1-.3-1-1 .2-1.4L19.3 2.7c.8-.3 1.5.2 1.3 1.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AutumnLeafIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19.5 4.5C14.6 4.7 9.9 6.4 7 10c-2.2 2.7-2.5 6-.7 7.8 1.8 1.8 5.1 1.5 7.8-.7 3.6-2.9 5.3-7.6 5.4-12.6Z" />
      <path d="M5.5 19c2.7-3.7 5.9-6.8 9.8-9.2" />
    </svg>
  );
}

function ProductCard({
  product,
  authorSlug,
}: {
  product: AuthorProductListItem;
  authorSlug: string;
}) {
  const visibleStatus = getVisibleAuthorProductStatus({
    status: product.status,
    moderationStatus: product.moderation_status,
  });
  const isSubmitted =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.SUBMITTED;
  const needsChanges =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.CHANGES_REQUESTED;
  const isPublished =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.PUBLISHED;
  const productIsPublic = isPracticePubliclyAvailable({
    status: product.status,
    scheduledPublishAt: product.scheduled_publish_at,
    publishedAt: product.published_at,
  });
  const scheduleLine = authorPublicationScheduleLine({
    status: product.status,
    moderationStatus: product.moderation_status,
    scheduledPublishAt: product.scheduled_publish_at,
    publishedAt: product.published_at,
  });

  const primaryActionLabel = isSubmitted ? "Просмотреть" : "Редактировать";

  return (
    <article className="rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-[0_8px_22px_rgba(91,62,145,0.06)]">
      <div className="flex flex-col gap-4 sm:flex-row">
        <ProductCoverThumbnail
          slug={product.slug}
          title={product.title}
          coverUrl={product.cover_url}
          coverImage={product.cover_image}
          updatedAt={product.updated_at}
          displayWidth={96}
          className="h-24 w-24 shrink-0 rounded-[18px]"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="line-clamp-2 text-[17px] font-semibold leading-5">
                {product.title}
              </h3>
              <p className="mt-1 text-sm text-[#7d70a2]">
                {isAudioPostProductKind(product.product_kind)
                  ? getAudioPostDisplayLabel(product.format)
                  : getDisplayFormat(product.format) || "Формат не указан"}
              </p>
            </div>

            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusClassName(
                product.status,
                product.moderation_status,
              )}`}
            >
              {scheduleLine ??
                getStatusLabel(product.status, product.moderation_status)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#5f5484]">
            <span>{product.audio_count} аудио</span>
            <span>
              {product.is_free
                ? AUTHOR_PRODUCT_FREE_PRICE_LABEL
                : formatPriceLabel(product.price, product.is_free)}
            </span>
            <span>Обновлён {formatUpdatedAt(product.updated_at)}</span>
            {product.moderation_submitted_at ? (
              <span>
                Отправлен {formatUpdatedAt(product.moderation_submitted_at)}
              </span>
            ) : null}
          </div>

          {needsChanges && product.moderation_review_comment ? (
            <p className="mt-3 rounded-[14px] border border-[#f0d7a8] bg-[#fff8ec] px-3 py-2 text-sm leading-5 text-[#8a5a16]">
              {product.moderation_review_comment}
            </p>
          ) : null}

          {needsChanges && !product.moderation_review_comment ? (
            <p className="mt-3 text-sm text-[#8a5a16]">
              Внесите изменения по замечаниям модератора и отправьте продукт
              повторно.
            </p>
          ) : null}

          {isSubmitted ? (
            <p className="mt-3 text-sm text-[#5f5484]">
              Продукт на проверке. Основные данные сейчас нельзя изменять.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/author-dashboard/products/${product.id}`}
              className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
            >
              {primaryActionLabel}
            </Link>

            {isPublished && productIsPublic ? (
              <Link
                href={buildPracticePublicPath(authorSlug, product.slug)}
                className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
              >
                Открыть
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AuthorDashboardClient({
  authors,
}: AuthorDashboardClientProps) {
  const [products, setProducts] = useState<AuthorProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { selectedAuthor } = useAuthorProjectSelection(
    authors,
    "/author-dashboard",
  );

  useEffect(() => {
    if (!selectedAuthor) {
      return;
    }

    const authorId = selectedAuthor.id;
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/author/products?author_id=${encodeURIComponent(authorId)}`,
          { cache: "no-store" },
        );

        const payload = (await response.json()) as {
          products?: AuthorProductListItem[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "load_failed");
        }

        if (!cancelled) {
          setProducts(payload.products ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить список аудиопродуктов.");
          setProducts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [selectedAuthor]);

  if (!selectedAuthor) {
    return null;
  }

  const newProductHref = `/author-dashboard/products/new?author=${encodeURIComponent(selectedAuthor.slug)}`;
  const musicProducts = products.filter((product) =>
    isMusicProductKind(product.product_kind),
  );
  const musicHref = `/author-dashboard/music?author=${encodeURIComponent(selectedAuthor.slug)}`;


  const canMutateContent = authorAccessAllowsContentMutations(
    selectedAuthor.accessStatus,
  );

  return (
    <div>
      <AuthorDashboardNav authorSlug={selectedAuthor.slug} authorId={selectedAuthor.id} authorRole={selectedAuthor.role} />

      <Link
        href="/osen-zvuchit"
        className="group mt-4 block overflow-hidden rounded-[24px] border border-[#efc873] bg-gradient-to-r from-[#fff4d7] via-[#ffe9bd] to-[#f7d28a] px-5 py-4 text-[#4a2f17] shadow-[0_10px_26px_rgba(181,120,42,0.14)] transition hover:border-[#dfa94a] hover:shadow-[0_12px_30px_rgba(181,120,42,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b97828]"
        aria-label="Подробнее об АудиоСпринте «Осень звучит»"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/75 text-[#b66f22] shadow-sm">
              <AutumnLeafIcon />
            </span>
            <div className="min-w-0">
              <p className="text-[17px] font-semibold text-[#6f3f16]">
                Осень звучит · АудиоСпринт
              </p>
              <p className="mt-1 text-sm leading-5 text-[#80552e]">
                3–18 октября · 100 поисковых запросов · призовой фонд 6 000 ₽
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-[#dfb45d] bg-white/75 px-4 py-2 text-sm font-semibold text-[#8f571d] transition group-hover:bg-white sm:self-auto">
            Подробнее
            <span aria-hidden="true">→</span>
          </span>
        </div>
      </Link>

      <AuthorAccessStatusBanner accessStatus={selectedAuthor.accessStatus} />
      <AuthorTermsRequiredBanner
        authorId={selectedAuthor.id}
        authorSlug={selectedAuthor.slug}
        accessStatus={selectedAuthor.accessStatus}
        productCount={loading ? -1 : products.length}
      />

      <section className="mt-4 rounded-[22px] border border-[#d7c4f5] bg-[#faf6ff] px-5 py-4 shadow-[0_8px_22px_rgba(91,62,145,0.05)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-[#25135c]">
              Чат «{AUTHOR_TELEGRAM_CHAT_NAME}» в Telegram
            </h2>
            <p className="mt-1 text-sm leading-5 text-[#5f5484]">
              Новости АудиоЛада для авторов, обучающие материалы, полезные подсказки и важные обновления.
            </p>
          </div>
          <a
            href={AUTHOR_TELEGRAM_CHAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#7042c5] px-5 text-sm font-semibold text-white"
          >
            <TelegramIcon />
            Присоединиться к чату
          </a>
        </div>
      </section>

      <AuthorOnboardingChecklist
        key={selectedAuthor.id}
        authorId={selectedAuthor.id}
        authorSlug={selectedAuthor.slug}
        newProductHref={newProductHref}
      />

      <div className="mt-6 rounded-[22px] border border-[#d7c4f5] bg-white px-5 py-4 shadow-[0_8px_22px_rgba(91,62,145,0.06)]">
        <p className="text-sm text-[#5f5484]">
          Продукты текущего проекта{" "}
          <span className="font-semibold text-[#25135c]">
            «{selectedAuthor.name}»
          </span>
        </p>
        <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
          Новый альбом или практика создаются внутри этого проекта.
        </p>

        <Link
          href={newProductHref}
          aria-disabled={!canMutateContent}
          className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[22px] px-6 py-4 text-center text-base font-semibold text-white shadow-[0_10px_24px_rgba(112,66,197,0.28)] sm:w-auto ${
            canMutateContent
              ? "bg-[#7042c5] hover:bg-[#5e32ad]"
              : "pointer-events-none bg-[#b7a5df] opacity-70"
          }`}
        >
          <PlusIcon />
          Создать аудиопродукт
        </Link>
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[21px] font-semibold">Аудиопродукты</h2>
          {musicProducts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium text-[#3f3560]">Все продукты</span>
              <span className="text-[#cbbce6]">·</span>
              <Link
                href={musicHref}
                className="font-medium text-[#6b5b95] hover:underline"
              >
                Музыка · {musicProducts.length}
              </Link>
            </div>
          ) : null}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-[#7d70a2]">Загрузка списка…</p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
            {error}
          </p>
        ) : null}

        {!loading && !error && products.length === 0 ? (
          <div className="mt-4 rounded-[22px] border border-dashed border-[#d9c9ef] bg-[#fbf8ff] px-5 py-6">
            <h3 className="text-[17px] font-semibold text-[#2f2548]">
              {FREE_AUTHOR_PRODUCTS_EMPTY_STATE.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              {FREE_AUTHOR_PRODUCTS_EMPTY_STATE.body}
            </p>
            <Link
              href={newProductHref}
              aria-disabled={!canMutateContent}
              className={`mt-4 inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-white sm:w-auto ${
                canMutateContent
                  ? "bg-[#7042c5]"
                  : "pointer-events-none bg-[#b7a5df] opacity-70"
              }`}
            >
              {FREE_AUTHOR_PRODUCTS_EMPTY_STATE.ctaLabel}
            </Link>
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              authorSlug={selectedAuthor.slug}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
