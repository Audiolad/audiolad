"use client";

import Link from "next/link";

import AuthorSeoDiscoveryPanel from "@/components/author-dashboard/AuthorSeoDiscoveryPanel";
import {
  buildAuthorProductCreateHref,
} from "@/lib/seo-queries/reservation-product-create-href";
import type { SeoQueryOpportunity } from "@/lib/seo-queries/types";
import {
  countActiveAuthorSeoReservations,
  lifecycleLabel,
} from "@/lib/seo-queries/types";

type Props = {
  authorId: string;
  authorSlug: string;
  publicationClass: string;
  opportunities: SeoQueryOpportunity[];
};

function formatMonthlyFrequency(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
  return `Запросов в месяц: ${value.toLocaleString("ru-RU")}`;
}

/**
 * Pre-create SEO query selection for Aurafon closed beta.
 * Not a wizard step — sits between type chooser and AuthorProductForm.
 */
export default function AuthorProductSeoQueryStep({
  authorId,
  authorSlug,
  publicationClass,
  opportunities,
}: Props) {
  const activeCount = countActiveAuthorSeoReservations(opportunities);
  const ownUnlinked = opportunities.filter(
    (item) =>
      Boolean(item.reservationId) &&
      item.lifecycle !== "published" &&
      !item.productId,
  );
  const skipHref = buildAuthorProductCreateHref({
    authorSlug,
    publicationClass,
    seoQuerySkip: true,
  });

  return (
    <div className="space-y-5" data-testid="author-product-seo-query-step">
      <section className="rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-[0_8px_22px_rgba(91,62,145,0.05)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#7042c5]">
          Бета
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[#25135c]">
          Выберите поисковый запрос
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#4c3d78]">
          Закрепите свободный запрос или продолжите с уже взятым в работу.
          Можно создать продукт и без поискового запроса.
        </p>
        <Link
          href={skipHref}
          className="mt-4 inline-flex min-h-10 items-center rounded-full border border-[#bda6e1] bg-white px-4 text-sm font-semibold text-[#7042c5]"
          data-testid="author-product-seo-query-skip"
        >
          Продолжить без поискового запроса
        </Link>
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
            {ownUnlinked.map((item) => (
              <article
                key={item.reservationId ?? item.id}
                className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-[#25135c]">
                      {item.queryText}
                    </h4>
                    {formatMonthlyFrequency(item.frequency) ? (
                      <p className="mt-1 text-sm text-[#5f5484]">
                        {formatMonthlyFrequency(item.frequency)}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#7042c5]">
                    {lifecycleLabel(item.lifecycle)}
                  </span>
                </div>
                {item.reservationId ? (
                  <Link
                    href={buildAuthorProductCreateHref({
                      authorSlug,
                      publicationClass,
                      reservationId: item.reservationId,
                    })}
                    className="mt-3 inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
                  >
                    Выбрать и продолжить
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <AuthorSeoDiscoveryPanel
        authorId={authorId}
        authorSlug={authorSlug}
        variant="product-create"
        publicationClass={publicationClass}
        activeReservationCount={activeCount}
      />
    </div>
  );
}
