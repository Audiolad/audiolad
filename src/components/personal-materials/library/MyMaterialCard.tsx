import Link from "next/link";

import AuthorAvatarImage from "@/components/authors/AuthorAvatarImage";
import {
  formatClaimedAt,
  getClientLibraryStatusClassName,
  getClientLibraryStatusLabel,
  getMyMaterialDisplayTitle,
  getProgressLabel,
  getProgressPercent,
  resolveClientLibraryUiStatus,
} from "@/lib/personal-materials/client-library/display";
import { formatGuestMaterialDate } from "@/lib/personal-materials/guest/display";
import { getPersonalMaterialTypeLabel } from "@/lib/personal-materials/client/status-labels";
import type { MyPersonalMaterialListItemDto } from "@/lib/personal-materials/client-library/types";

type MyMaterialCardProps = {
  material: MyPersonalMaterialListItemDto;
};

export default function MyMaterialCard({ material }: MyMaterialCardProps) {
  const title = getMyMaterialDisplayTitle(material.title, material.materialType);
  const status = resolveClientLibraryUiStatus({
    availability: material.availability,
    completed: material.progress.completed,
    hasAudio: material.hasAudio,
  });
  const progressLabel = getProgressLabel(material.progress);
  const percent = getProgressPercent(material.progress);
  const typeLabel = getPersonalMaterialTypeLabel(material.materialType);

  return (
    <article className="rounded-2xl border border-[#ece6f5] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full">
          <AuthorAvatarImage
            name={material.author.name}
            avatarUrl={material.author.avatarUrl}
            size={44}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-[#9a91b8]">
            {typeLabel}
          </p>
          <h2 className="break-words text-base font-semibold text-[#2f2647] sm:text-lg">
            {title}
          </h2>
          <p className="break-words text-sm text-[#6d628f]">{material.author.name}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getClientLibraryStatusClassName(status)}`}
        >
          {getClientLibraryStatusLabel(status)}
        </span>
      </div>

      <div className="mt-4 space-y-1 text-sm text-[#6d628f]">
        {material.diagnosticDate && (
          <p>{formatGuestMaterialDate(material.diagnosticDate)}</p>
        )}
        <p>Сохранено {formatClaimedAt(material.claimedAt)}</p>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium text-[#5f5484]">{progressLabel}</p>
        {percent !== null && (
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[#efe8f8]"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={progressLabel}
          >
            <div
              className="h-full rounded-full bg-[#7042c5]"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      <Link
        href={`/my-materials/${encodeURIComponent(material.id)}`}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
      >
        Открыть
      </Link>
    </article>
  );
}
