import Link from "next/link";

import AuthorLink from "@/components/authors/AuthorLink";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { ProfileContinueState } from "@/lib/profile/types";

type ProfileContinueSectionProps = {
  state: ProfileContinueState;
};

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-[#eee6f7] lg:h-2"
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
    <section
      className="mt-6 min-w-0 lg:mt-6 lg:self-start"
      aria-labelledby="profile-continue-heading"
    >
      <h2
        id="profile-continue-heading"
        className="text-[21px] font-semibold text-[#25135c] lg:text-[22px]"
      >
        Продолжить
      </h2>

      {state.kind === "error" ? (
        <p className="mt-4 rounded-[22px] border border-[#eadff8] bg-white px-5 py-4 text-sm leading-6 text-[#796ba0] lg:px-6 lg:py-5">
          Не удалось загрузить прогресс.
        </p>
      ) : null}

      {state.kind === "empty" ? (
        <div className="mt-4 rounded-[22px] border border-[#eadff8] bg-white px-5 py-5 lg:px-6 lg:py-6">
          <p className="text-sm leading-6 text-[#796ba0] lg:text-[15px]">
            Вы ещё не начали слушать.
          </p>

          <p className="mt-2 text-sm leading-6 text-[#796ba0] lg:text-[15px]">
            Выберите практику в каталоге и возвращайтесь к ней с любого
            устройства.
          </p>

          <Link
            href="/catalog"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] lg:mt-6"
          >
            Выбрать практику
          </Link>
        </div>
      ) : null}

      {state.kind === "item" ? (
        <article className="mt-4 rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm lg:p-6">
          <div className="flex gap-4 lg:gap-5">
            <div className="h-[72px] w-[72px] shrink-0 lg:h-[112px] lg:w-[112px]">
              <ProductCoverThumbnail
                slug={state.item.product.slug}
                title={state.item.product.title}
                coverUrl={state.item.product.coverUrl}
                coverImage={state.item.product.coverImage}
                updatedAt={state.item.product.updatedAt}
                authorName={state.item.product.authorName}
                format={state.item.product.format}
                displayWidth={112}
                className="h-[72px] w-[72px] rounded-[18px] lg:h-[112px] lg:w-[112px] lg:rounded-[22px]"
              />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-[17px] font-semibold leading-6 text-[#25135c] lg:text-[19px] lg:leading-7">
                {state.item.product.title}
              </h3>

              {state.item.product.authorName ? (
                <AuthorLink
                  authorSlug={state.item.product.authorSlug}
                  authorName={state.item.product.authorName}
                  className="mt-1 truncate text-sm font-medium text-[#7042c5] lg:text-[15px]"
                />
              ) : null}

              {state.item.isProgram && state.item.stepLabel ? (
                <p className="mt-1 text-sm text-[#796ba0] lg:text-[15px]">
                  {state.item.stepLabel}
                </p>
              ) : null}

              <div className="mt-3 lg:mt-4">
                <ProgressBar percent={state.item.progressPercent} />
              </div>

              <p className="mt-2 text-xs text-[#796ba0] lg:text-sm">
                {state.item.progressLabel}
              </p>
            </div>
          </div>

          <Link
            href={state.item.listenHref}
            className="mt-4 flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] lg:mt-6"
          >
            Продолжить
          </Link>
        </article>
      ) : null}
    </section>
  );
}
