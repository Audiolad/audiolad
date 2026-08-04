"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  buildAuthorDashboardHref,
  buildAuthorNewProductHref,
  FREE_AUTHOR_FIRST_PRODUCT_BANNER,
  shouldShowAuthorTermsRequiredBanner,
  shouldShowFreeAuthorFirstProductBanner,
} from "@/lib/author-dashboard/free-author-first-step";
import type { AuthorAccessStatus } from "@/lib/authors/access";
import type { AuthorTermsStatusView } from "@/lib/author-terms/types";

type Props = {
  authorId: string;
  authorSlug: string;
  accessStatus: AuthorAccessStatus | string;
  productCount: number;
};

export default function AuthorTermsRequiredBanner({
  authorId,
  authorSlug,
  accessStatus,
  productCount,
}: Props) {
  const [status, setStatus] = useState<AuthorTermsStatusView | null>(null);
  const showFirstProductBanner = shouldShowFreeAuthorFirstProductBanner(
    accessStatus,
    productCount,
  );
  const mayNeedTerms = shouldShowAuthorTermsRequiredBanner(accessStatus);

  useEffect(() => {
    if (!mayNeedTerms) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/author/terms?author_id=${encodeURIComponent(authorId)}`,
        );
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          status?: AuthorTermsStatusView;
        };
        if (!cancelled && data.status) {
          setStatus(data.status);
        }
      } catch {
        // Banner is best-effort; commercial writes still fail server-side.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorId, mayNeedTerms]);

  if (showFirstProductBanner) {
    const newProductHref = buildAuthorNewProductHref(authorSlug);
    const dashboardHref = buildAuthorDashboardHref(authorSlug);

    return (
      <aside className="mb-5 rounded-[22px] border border-[#d7c4f5] bg-[#faf6ff] px-4 py-4">
        <p className="text-[15px] font-semibold text-[#25135c]">
          {FREE_AUTHOR_FIRST_PRODUCT_BANNER.title}
        </p>
        <p className="mt-2 text-sm leading-6 text-[#5f5484]">
          {FREE_AUTHOR_FIRST_PRODUCT_BANNER.body}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href={newProductHref}
            className="inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
          >
            {FREE_AUTHOR_FIRST_PRODUCT_BANNER.ctaLabel}
          </Link>
          <Link
            href={dashboardHref}
            className="inline-flex min-h-11 items-center rounded-full border border-[#7042c5] px-4 text-sm font-semibold text-[#7042c5]"
          >
            {FREE_AUTHOR_FIRST_PRODUCT_BANNER.secondaryCtaLabel}
          </Link>
        </div>
      </aside>
    );
  }

  if (!mayNeedTerms || !status?.currentVersion || status.acceptedCurrent) {
    return null;
  }

  return (
    <aside className="mb-5 rounded-[22px] border border-[#f0d4a8] bg-[#fff8ec] px-4 py-4">
      <p className="text-[15px] font-semibold text-[#5c3b10]">
        Нужно принять Авторские условия сотрудничества
      </p>
      <p className="mt-2 text-sm leading-6 text-[#7a5520]">
        Кабинет и существующие материалы доступны. Публикация платных продуктов,
        изменение цены и данных для выплат будут доступны после принятия
        актуальной редакции.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          href={`/author-dashboard/commercial/terms?author=${encodeURIComponent(authorSlug)}`}
          className="inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
        >
          Принять условия
        </Link>
        <Link
          href="/author-terms"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-full border border-[#7042c5] px-4 text-sm font-semibold text-[#7042c5]"
        >
          Открыть документ
        </Link>
      </div>
    </aside>
  );
}
