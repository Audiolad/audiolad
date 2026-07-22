"use client";

import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorAccessStatusBanner from "@/components/author-dashboard/AuthorAccessStatusBanner";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { getDisplayFormat } from "@/lib/author-products/format";
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

type ProductListView = "active" | "archive";

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

function ProductCard({
  product,
  authorSlug,
}: {
  product: AuthorProductListItem;
  authorSlug: string;
}) {
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
                {getDisplayFormat(product.format) || "Формат не указан"}
              </p>
            </div>

            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusClassName(product.status)}`}
            >
              {getStatusLabel(product.status)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#5f5484]">
            <span>{product.audio_count} аудио</span>
            <span>{formatPriceLabel(product.price, product.is_free)}</span>
            <span>Обновлён {formatUpdatedAt(product.updated_at)}</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/author-dashboard/products/${product.id}`}
              className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
            >
              Редактировать
            </Link>

            {product.status === "published" ? (
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<AuthorProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listView, setListView] = useState<ProductListView>("active");

  const selectedAuthor = useMemo(() => {
    const slug = searchParams.get("author");
    return authors.find((author) => author.slug === slug) ?? authors[0] ?? null;
  }, [authors, searchParams]);

  useEffect(() => {
    if (!selectedAuthor) {
      return;
    }

    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/author/products?author_id=${encodeURIComponent(selectedAuthor.id)}`,
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

  function handleAuthorChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("author", slug);
    router.replace(`/author-dashboard?${params.toString()}`);
  }

  if (!selectedAuthor) {
    return null;
  }

  const newProductHref = `/author-dashboard/products/new?author=${encodeURIComponent(selectedAuthor.slug)}`;
  const activeProducts = products.filter((product) => product.status !== "archived");
  const archivedProducts = products.filter((product) => product.status === "archived");
  const visibleProducts = listView === "archive" ? archivedProducts : activeProducts;

  const canMutateContent = authorAccessAllowsContentMutations(
    selectedAuthor.accessStatus,
  );

  return (
    <div>
      <AuthorDashboardNav authorSlug={selectedAuthor.slug} />
      <AuthorAccessStatusBanner accessStatus={selectedAuthor.accessStatus} />

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="block flex-1">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Авторское пространство
          </span>
          <select
            value={selectedAuthor.slug}
            onChange={(event) => handleAuthorChange(event.target.value)}
            className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#9a74d8]"
          >
            {authors.map((author) => (
              <option key={author.id} value={author.slug}>
                {author.name}
              </option>
            ))}
          </select>
        </label>

        <Link
          href={newProductHref}
          aria-disabled={!canMutateContent}
          className={`inline-flex items-center justify-center gap-2 rounded-[22px] px-5 py-4 text-center font-semibold text-white ${
            canMutateContent
              ? "bg-[#7042c5]"
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

          <div className="inline-flex rounded-full border border-[#e4d7f4] bg-white p-1">
            <button
              type="button"
              onClick={() => setListView("active")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                listView === "active"
                  ? "bg-[#7042c5] text-white"
                  : "text-[#7042c5]"
              }`}
            >
              Основной список
            </button>
            <button
              type="button"
              onClick={() => setListView("archive")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                listView === "archive"
                  ? "bg-[#7042c5] text-white"
                  : "text-[#7042c5]"
              }`}
            >
              Архив{archivedProducts.length > 0 ? ` (${archivedProducts.length})` : ""}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-[#7d70a2]">Загрузка списка…</p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
            {error}
          </p>
        ) : null}

        {!loading && !error && visibleProducts.length === 0 ? (
          <p className="mt-4 rounded-[22px] border border-dashed border-[#d9c9ef] bg-[#fbf8ff] px-5 py-6 text-sm text-[#7d70a2]">
            {listView === "archive"
              ? "В архиве пока нет аудиопродуктов."
              : "Пока нет аудиопродуктов. Создайте первый черновик."}
          </p>
        ) : null}

        <div className="mt-4 space-y-4">
          {visibleProducts.map((product) => (
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
