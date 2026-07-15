import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { ContinueListeningItem, HomeProduct } from "@/lib/home/types";

import { PlayIcon } from "./HomeIcons";
import HomeStartSuggestions from "./HomeStartSuggestions";

type ContinueListeningProps = {
  item: ContinueListeningItem | null;
  startSuggestions: HomeProduct[];
};

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-[#eee6f7]"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-[#7042c5] transition-[width]"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export default function ContinueListening({
  item,
  startSuggestions,
}: ContinueListeningProps) {
  if (!item) {
    return <HomeStartSuggestions products={startSuggestions} />;
  }

  const { product } = item;

  return (
    <section className="mt-6" aria-label="Продолжить прослушивание">
      <h2 className="text-[22px] font-semibold leading-tight text-[#25135c]">
        Продолжить прослушивание
      </h2>

      <article className="mt-4 overflow-hidden rounded-[28px] border border-[#eadff8] bg-white p-4 shadow-[0_12px_30px_rgba(91,62,145,0.08)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link
            href={product.href}
            className="mx-auto w-[min(100%,200px)] shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:mx-0 sm:w-[168px]"
          >
            <ProductCoverThumbnail
              slug={product.slug}
              title={product.title}
              coverUrl={product.coverUrl}
              className="aspect-square w-full rounded-[24px]"
            />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
              {product.productTypeLabel}
            </p>

            <h3 className="mt-1 text-[20px] font-semibold leading-tight text-[#25135c]">
              {product.title}
            </h3>

            {product.authorName ? (
              <p className="mt-2 text-sm font-medium text-[#7042c5]">
                {product.authorName}
              </p>
            ) : null}

            {item.isProgram && item.currentTrackTitle ? (
              <p className="mt-2 text-sm text-[#7d70a2]">
                Сейчас: {item.currentTrackTitle}
              </p>
            ) : null}

            {item.stepLabel ? (
              <p className="mt-1 text-sm font-medium text-[#5f3f9d]">
                {item.stepLabel}
              </p>
            ) : null}

            <div className="mt-4">
              <ProgressBar percent={item.progressPercent} />
              <p className="mt-2 text-sm text-[#7d70a2]">{item.progressLabel}</p>
            </div>

            <Link
              href={item.listenHref}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <PlayIcon />
              {item.isProgram ? "Продолжить программу" : "Продолжить"}
            </Link>
          </div>
        </div>
      </article>
    </section>
  );
}
