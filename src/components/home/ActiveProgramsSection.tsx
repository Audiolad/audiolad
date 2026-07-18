import Link from "next/link";

import AuthorLink from "@/components/authors/AuthorLink";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { ActiveProgramItem } from "@/lib/home/types";

import { PlayIcon } from "./HomeIcons";
import HomeSectionHeader from "./HomeSectionHeader";

type ActiveProgramsSectionProps = {
  programs: ActiveProgramItem[];
};

export default function ActiveProgramsSection({
  programs,
}: ActiveProgramsSectionProps) {
  if (programs.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 xl:mt-8" aria-label="Ваши программы">
      <HomeSectionHeader title="Ваши программы" href="/my-practices" />

      <div className="mt-3.5 space-y-3 xl:mt-4">
        {programs.map((program) => (
          <article
            key={program.product.id}
            className="flex gap-4 rounded-[24px] border border-[#eadff8] bg-white p-3 shadow-sm"
          >
            <Link
              href={program.product.href}
              className="w-[96px] shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <ProductCoverThumbnail
                slug={program.product.slug}
                title={program.product.title}
                coverUrl={program.product.coverUrl}
                coverImage={program.product.coverImage}
                updatedAt={program.product.updatedAt}
                authorName={program.product.authorName}
                format={program.product.format}
                displayWidth={96}
                className="aspect-square w-full rounded-[20px]"
              />
            </Link>

            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-[17px] font-semibold leading-5 text-[#25135c]">
                {program.product.title}
              </h3>

              {program.product.authorName ? (
                <AuthorLink
                  authorSlug={program.product.authorSlug}
                  authorName={program.product.authorName}
                  className="mt-1 text-sm font-medium text-[#7042c5]"
                />
              ) : null}

              <p className="mt-2 text-sm text-[#7d70a2]">{program.stepLabel}</p>

              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eee6f7]"
                role="progressbar"
                aria-valuenow={program.progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-[#7042c5]"
                  style={{
                    width: `${Math.min(100, Math.max(0, program.progressPercent))}%`,
                  }}
                />
              </div>

              <Link
                href={program.listenHref}
                className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7042c5] text-white">
                  <PlayIcon />
                </span>
                Продолжить
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
