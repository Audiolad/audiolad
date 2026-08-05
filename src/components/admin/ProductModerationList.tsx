import Link from "next/link";

import type { AdminProductModerationListItem } from "@/lib/admin/product-moderation-queries";
import {
  getVisibleAuthorProductStatus,
  getVisibleAuthorProductStatusLabel,
} from "@/lib/author-products/moderation";
import { getProductKindLabel } from "@/lib/author-products/product-kind";
import { getProductPriceLabel } from "@/lib/products/price-format";

type ProductModerationListProps = {
  products: AdminProductModerationListItem[];
  emptyMessage: string;
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(totalSeconds: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function productKindLabel(kind: string): string {
  return getProductKindLabel(kind);
}

export default function ProductModerationList({
  products,
  emptyMessage,
}: ProductModerationListProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-[22px] border border-[#eadff8] bg-white p-8 text-center">
        <p className="text-base font-medium text-[#25135c]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-[22px] border border-[#eadff8] bg-white md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#eee6f7] bg-[#faf6ff] text-[#796ba0]">
              <tr>
                <th className="px-4 py-3 font-medium">Продукт</th>
                <th className="px-4 py-3 font-medium">Автор</th>
                <th className="px-4 py-3 font-medium">Тип / цена</th>
                <th className="px-4 py-3 font-medium">Аудио</th>
                <th className="px-4 py-3 font-medium">Отправка</th>
                <th className="px-4 py-3 font-medium">Статусы</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const visible = getVisibleAuthorProductStatus({
                  status: product.status,
                  moderationStatus: product.moderationStatus,
                });

                return (
                  <tr
                    key={product.id}
                    className="border-b border-[#f3edf9] last:border-b-0"
                  >
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/product-moderation/${product.id}`}
                        className="font-medium text-[#25135c] hover:underline"
                      >
                        {product.title}
                      </Link>
                      {product.isResubmission ? (
                        <p className="mt-1 text-xs text-[#b67a1d]">
                          Повторная отправка · попытка {product.moderationAttempt}
                        </p>
                      ) : product.moderationAttempt > 0 ? (
                        <p className="mt-1 text-xs text-[#796ba0]">
                          Первая отправка
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/product-moderation/${product.id}`}
                        className="font-medium text-[#25135c] hover:underline"
                      >
                        {product.authorName}
                      </Link>
                      {product.authorSlug ? (
                        <p className="mt-1 text-xs text-[#796ba0]">
                          /{product.authorSlug}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-[#796ba0]">
                      <div>{productKindLabel(product.productKind)}</div>
                      {product.productKind !== "audio_post" ? (
                        <div className="mt-1">
                          {getProductPriceLabel(product.price, product.isFree)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-[#796ba0]">
                      {product.audioCount} · {formatDuration(product.totalDurationSeconds)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-[#796ba0]">
                      {formatDateTime(product.moderationSubmittedAt)}
                    </td>
                    <td className="px-4 py-4 text-[#796ba0]">
                      <div>{getVisibleAuthorProductStatusLabel(visible)}</div>
                      <div className="mt-1 text-xs">
                        {product.status} / {product.moderationStatus}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/admin/product-moderation/${product.id}`}
                        className="inline-flex rounded-full bg-[#7042c5] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Проверить
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {products.map((product) => {
          const visible = getVisibleAuthorProductStatus({
            status: product.status,
            moderationStatus: product.moderationStatus,
          });

          return (
            <article
              key={product.id}
              className="rounded-[22px] border border-[#eadff8] bg-white p-4"
            >
              <Link
                href={`/admin/product-moderation/${product.id}`}
                className="text-[16px] font-semibold text-[#25135c]"
              >
                {product.title}
              </Link>
              <p className="mt-1 text-sm text-[#796ba0]">
                <Link
                  href={`/admin/product-moderation/${product.id}`}
                  className="hover:underline"
                >
                  {product.authorName}
                </Link>
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#796ba0]">
                <span>{productKindLabel(product.productKind)}</span>
                {product.productKind !== "audio_post" ? (
                  <span>
                    {getProductPriceLabel(product.price, product.isFree)}
                  </span>
                ) : null}
                <span>
                  {product.audioCount} аудио ·{" "}
                  {formatDuration(product.totalDurationSeconds)}
                </span>
                <span>{getVisibleAuthorProductStatusLabel(visible)}</span>
                {product.isResubmission ? (
                  <span className="text-[#b67a1d]">
                    Повтор · попытка {product.moderationAttempt}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-[#796ba0]">
                Отправлен {formatDateTime(product.moderationSubmittedAt)}
              </p>
              <Link
                href={`/admin/product-moderation/${product.id}`}
                className="mt-3 inline-flex rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
              >
                Проверить
              </Link>
            </article>
          );
        })}
      </div>
    </>
  );
}
