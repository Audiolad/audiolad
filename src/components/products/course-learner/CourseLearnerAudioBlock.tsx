"use client";

import { useProductContentsPlayback } from "@/components/products/useProductContentsPlayback";
import { formatAudioDuration } from "@/lib/products/duration";
import type { LearnerCourseAudioBlock } from "@/lib/course-content/learner-types";

type CourseLearnerAudioBlockProps = {
  block: LearnerCourseAudioBlock;
  authorSlug: string;
  productSlug: string;
};

export default function CourseLearnerAudioBlock({
  block,
  authorSlug,
  productSlug,
}: CourseLearnerAudioBlockProps) {
  const {
    playTrack,
    loadingTrackId,
    errorMessage,
    clearErrorMessage,
    activeTrackId,
    enabled,
  } = useProductContentsPlayback({
    authorSlug,
    productSlug,
    enabled: true,
  });

  const isLoading = loadingTrackId === block.audioItemId;
  const isActive = activeTrackId === block.audioItemId;
  const durationLabel = formatAudioDuration(block.durationSeconds);

  return (
    <div className="min-w-0 max-w-full">
      <button
        type="button"
        disabled={!enabled || isLoading}
        aria-label={`Слушать: ${block.title}`}
        aria-busy={isLoading || undefined}
        aria-current={isActive ? "true" : undefined}
        onClick={() => {
          clearErrorMessage();
          void playTrack(block.audioItemId);
        }}
        className={`flex w-full min-w-0 max-w-full items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
          isActive
            ? "border-[#cdb6ea] bg-[#f3ebff]"
            : "border-[#f0e6fb] bg-[#fcfaff] hover:border-[#dcc9f2] hover:bg-[#f7f2ff]"
        } ${isLoading ? "opacity-75" : ""}`}
      >
        <span className="min-w-0 break-words text-[15px] font-medium leading-6 text-[#25135c]">
          {block.title}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-[#7d70a2]">
          {isLoading ? <span className="text-xs">Запуск…</span> : null}
          {durationLabel ? (
            <span className="tabular-nums">{durationLabel}</span>
          ) : (
            <span>Слушать</span>
          )}
        </span>
      </button>
      {errorMessage ? (
        <p className="mt-2 text-sm leading-6 text-[#b34f63]" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
