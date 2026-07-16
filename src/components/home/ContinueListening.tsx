import Link from "next/link";

import CoverOverlayCard from "@/components/home/CoverOverlayCard";
import type { ContinueListeningItem, HomeProduct } from "@/lib/home/types";

import { PlayIcon } from "./HomeIcons";
import HomeStartSuggestions from "./HomeStartSuggestions";

type ContinueListeningProps = {
  item: ContinueListeningItem | null;
  startSuggestions: HomeProduct[];
};

function OverlayProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-white/25"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-[#b794f6] transition-[width]"
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

      <CoverOverlayCard
        slug={product.slug}
        title={product.title}
        coverUrl={product.coverUrl}
        authorName={product.authorName}
        format={product.format}
        className="mt-4"
      >
        <span className="inline-flex w-fit rounded-full bg-[#7042c5]/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white backdrop-blur-sm">
          {product.productTypeLabel}
        </span>

        <div className="mt-auto min-w-0 pt-6">
          <h3 className="line-clamp-2 text-[22px] font-semibold leading-tight text-white sm:text-[24px]">
            <Link
              href={product.href}
              className="hover:text-white/90 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {product.title}
            </Link>
          </h3>

          {product.authorName ? (
            <p className="mt-1.5 line-clamp-1 text-sm font-medium text-white/85">
              {product.authorName}
            </p>
          ) : null}

          {item.isProgram && item.currentTrackTitle ? (
            <p className="mt-2 line-clamp-1 text-xs text-white/70">
              Сейчас: {item.currentTrackTitle}
            </p>
          ) : null}

          {item.stepLabel ? (
            <p className="mt-1 line-clamp-1 text-xs font-medium text-white/75">
              {item.stepLabel}
            </p>
          ) : null}

          <div className="mt-4">
            <OverlayProgressBar percent={item.progressPercent} />
            <p className="mt-2 flex items-center gap-1.5 text-sm text-white/85">
              <span className="inline-flex shrink-0 opacity-90 [&_svg]:h-3.5 [&_svg]:w-3.5">
                <PlayIcon />
              </span>
              {item.progressLabel}
            </p>
          </div>

          <Link
            href={item.listenHref}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(37,19,92,0.35)] transition-colors hover:bg-[#6234b5] active:bg-[#5a2fa3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <PlayIcon />
            {item.isProgram ? "Продолжить программу" : "Продолжить"}
          </Link>
        </div>
      </CoverOverlayCard>
    </section>
  );
}
