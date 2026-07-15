import FormattedPlainText from "@/components/FormattedPlainText";
import {
  formatAudioDuration,
  formatAudioCountLabel,
  formatProductDuration,
  isMultiAudioProduct,
  sumDurationSeconds,
} from "@/lib/products/duration";
import type { PublicAudioItem } from "@/lib/products/public-audio-items";

type ProductContentsSectionProps = {
  items: PublicAudioItem[];
  durationMinutesFallback?: number | null;
  productTitle?: string;
};

function shouldShowItemDescription(
  description: string | null,
): description is string {
  return typeof description === "string" && description.length > 0;
}

export default function ProductContentsSection({
  items,
  durationMinutesFallback,
  productTitle,
}: ProductContentsSectionProps) {
  if (!isMultiAudioProduct(items.length)) {
    return null;
  }

  const sortedItems = [...items].sort((left, right) => left.position - right.position);
  const totalDurationSeconds = sumDurationSeconds(sortedItems);
  const totalDurationLabel = formatProductDuration(
    totalDurationSeconds,
    durationMinutesFallback,
  );
  const normalizedProductTitle = productTitle?.trim().toLowerCase() ?? "";

  return (
    <section className="mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold">Содержание</h2>
        <p className="text-sm text-[#7d70a2]">
          {formatAudioCountLabel(sortedItems.length)}
          {totalDurationLabel ? ` · ${totalDurationLabel}` : ""}
        </p>
      </div>

      <ol className="mt-4 space-y-3">
        {sortedItems.map((item, index) => {
          const durationLabel = formatAudioDuration(item.durationSeconds);
          const showDuplicateTitle =
            normalizedProductTitle.length > 0 &&
            item.title.trim().toLowerCase() === normalizedProductTitle;

          return (
            <li
              key={item.id}
              className="rounded-[18px] border border-[#f0e6fb] bg-[#fcfaff] px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <span className="w-6 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-[#8a7ca9]">
                  {index + 1}.
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[15px] font-medium leading-6 text-[#25135c]">
                      {item.title}
                    </p>

                    {durationLabel ? (
                      <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-[#7d70a2]">
                        {durationLabel}
                      </span>
                    ) : null}
                  </div>

                  {shouldShowItemDescription(item.description) &&
                  !showDuplicateTitle ? (
                    <FormattedPlainText
                      text={item.description}
                      className="mt-1 text-sm leading-6 text-[#7d70a2]"
                    />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
