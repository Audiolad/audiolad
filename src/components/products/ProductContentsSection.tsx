import {
  formatAudioCountLabel,
  formatProductDuration,
  isMultiAudioProduct,
  sumDurationSeconds,
} from "@/lib/products/duration";
import type { PlaybackCoverPractice } from "@/lib/products/cover-display";
import type { PublicAudioItem } from "@/lib/products/public-audio-items";
import ProductContentsInteractiveList, {
  type ProductContentsPlaybackConfig,
} from "@/components/products/ProductContentsInteractiveList";

type ProductContentsSectionProps = {
  items: PublicAudioItem[];
  durationMinutesFallback?: number | null;
  productTitle?: string;
  practiceCover: PlaybackCoverPractice;
  playback: ProductContentsPlaybackConfig;
};

export default function ProductContentsSection({
  items,
  durationMinutesFallback,
  productTitle,
  practiceCover,
  playback,
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

  return (
    <section className="mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold">Содержание</h2>
        <p className="text-sm text-[#7d70a2]">
          {formatAudioCountLabel(sortedItems.length)}
          {totalDurationLabel ? ` · ${totalDurationLabel}` : ""}
        </p>
      </div>

      <ProductContentsInteractiveList
        items={sortedItems}
        productTitle={productTitle}
        practiceCover={practiceCover}
        playback={playback}
      />
    </section>
  );
}
