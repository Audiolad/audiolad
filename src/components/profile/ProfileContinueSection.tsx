import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { ProfileContinueState } from "@/lib/profile/types";

type ProfileContinueSectionProps = {
  state: ProfileContinueState;
};

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-[#eee6f7]"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Прогресс прослушивания ${percent} процентов`}
    >
      <div
        className="h-full rounded-full bg-[#7042c5] transition-[width]"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export default function ProfileContinueSection({
  state,
}: ProfileContinueSectionProps) {
  if (state.kind === "hidden") {
    return null;
  }

  return (
    <section className="mt-6" aria-labelledby="profile-continue-heading">
      <h2
        id="profile-continue-heading"
        className="text-[21px] font-semibold text-[#25135c]"
      >
        Продолжить
      </h2>

      {state.kind === "error" ? (
        <p className="mt-4 rounded-[22px] border border-[#eadff8] bg-white px-5 py-4 text-sm leading-6 text-[#796ba0]">
          Не удалось загрузить прогресс.
        </p>
      ) : null}

      {state.kind === "empty" ? (
        <div className="mt-4 rounded-[22px] border border-[#eadff8] bg-white px-5 py-5">
          <p className="text-sm leading-6 text-[#796ba0]">
            Вы ещё не начали слушать.
          </p>

          <Link
            href="/catalog"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Выбрать практику
          </Link>
        </div>
      ) : null}

      {state.kind === "item" ? (
        <article className="mt-4 rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm">
          <div className="flex gap-4">
            <div className="h-[72px] w-[72px] shrink-0">
              <ProductCoverThumbnail
                slug={state.item.product.slug}
                title={state.item.product.title}
                coverUrl={state.item.product.coverUrl}
                authorName={state.item.product.authorName}
                format={state.item.product.format}
                className="h-[72px] w-[72px] rounded-[18px]"
              />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-[17px] font-semibold leading-6 text-[#25135c]">
                {state.item.product.title}
              </h3>

              {state.item.product.authorName ? (
                <p className="mt-1 truncate text-sm font-medium text-[#7042c5]">
                  {state.item.product.authorName}
                </p>
              ) : null}

              {state.item.isProgram && state.item.stepLabel ? (
                <p className="mt-1 text-sm text-[#796ba0]">
                  {state.item.stepLabel}
                </p>
              ) : null}

              <div className="mt-3">
                <ProgressBar percent={state.item.progressPercent} />
              </div>

              <p className="mt-2 text-xs text-[#796ba0]">
                {state.item.progressLabel}
              </p>
            </div>
          </div>

          <Link
            href={state.item.listenHref}
            className="mt-4 flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Продолжить
          </Link>
        </article>
      ) : null}
    </section>
  );
}
