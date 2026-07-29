import Link from "next/link";
import Image from "next/image";

import {
  formatPrivateDuration,
  getPrivateProgressLabel,
} from "@/lib/private-audio/mappers";
import type { PrivateAudioListItemDto } from "@/lib/private-audio/types";

type PrivateAudioCardProps = {
  item: PrivateAudioListItemDto;
};

function CoverFallback({ title }: { title: string }) {
  const letter = title.trim().charAt(0).toUpperCase() || "А";

  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#e8ddf8] to-[#d4c2ef] text-2xl font-semibold text-[#7042c5]"
    >
      {letter}
    </div>
  );
}

export default function PrivateAudioCard({ item }: PrivateAudioCardProps) {
  const durationLabel = formatPrivateDuration(item.durationSeconds);
  const progressLabel = getPrivateProgressLabel(item.progress);
  const href = `/my-library/private-audio/${encodeURIComponent(item.id)}`;

  return (
    <article className="rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-sm">
      <div className="flex gap-4">
        <Link
          href={href}
          className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[18px] bg-[#f4eefc]"
        >
          {item.coverUrl ? (
            <Image
              src={item.coverUrl}
              alt=""
              fill
              unoptimized
              className="object-cover"
              sizes="88px"
            />
          ) : (
            <CoverFallback title={item.title} />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={href}
                className="block truncate text-[17px] font-semibold text-[#25135c] hover:text-[#7042c5]"
              >
                {item.title}
              </Link>
              {item.authorText ? (
                <p className="mt-1 truncate text-sm text-[#7d70a2]">
                  {item.authorText}
                </p>
              ) : (
                <p className="mt-1 text-sm text-[#7d70a2]">Мой материал</p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-[#f4eefc] px-2.5 py-1 text-[11px] font-medium text-[#7042c5]">
              Только для вас
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7d70a2]">
            {durationLabel ? <span>{durationLabel}</span> : null}
            <span>{progressLabel}</span>
          </div>

          <Link
            href={href}
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[14px] bg-[#7042c5] px-4 text-sm font-semibold text-white"
          >
            {item.progress.positionSeconds > 0 && !item.progress.completed
              ? "Продолжить"
              : "Слушать"}
          </Link>
        </div>
      </div>
    </article>
  );
}
