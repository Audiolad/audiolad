"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import PersonalMaterialAudioPlayer from "@/components/personal-materials/guest/PersonalMaterialAudioPlayer";
import PersonalMaterialDescription from "@/components/personal-materials/guest/PersonalMaterialDescription";
import PersonalMaterialHeader from "@/components/personal-materials/guest/PersonalMaterialHeader";
import PersonalMaterialRecommendation from "@/components/personal-materials/guest/PersonalMaterialRecommendation";
import PersonalMaterialReturnChatCta from "@/components/personal-materials/PersonalMaterialReturnChatCta";
import { saveMyPersonalMaterialProgressRequest } from "@/lib/personal-materials/client-library/api";
import {
  getMyMaterialDisplayTitle,
  getProgressLabel,
} from "@/lib/personal-materials/client-library/display";
import { mergeGuestAndServerProgress } from "@/lib/personal-materials/client-library/mappers";
import type { MyPersonalMaterialDetailDto } from "@/lib/personal-materials/client-library/types";
import { shouldRenderOptionalBlock } from "@/lib/personal-materials/access";
import { formatGuestMaterialDate } from "@/lib/personal-materials/guest/display";
import {
  clearPersonalMaterialGuestProgress,
  readPersonalMaterialGuestProgress,
} from "@/lib/personal-materials/guest/progress";
import { getPersonalMaterialTypeLabel } from "@/lib/personal-materials/client/status-labels";

type MyMaterialDetailClientProps = {
  material: MyPersonalMaterialDetailDto;
};

function readMergedInitialProgress(material: MyPersonalMaterialDetailDto) {
  const guest = readPersonalMaterialGuestProgress(material.id);
  return mergeGuestAndServerProgress({
    server: material.progress,
    guest,
  });
}

export default function MyMaterialDetailClient({
  material,
}: MyMaterialDetailClientProps) {
  const initialMerged = useMemo(() => {
    if (typeof window === "undefined") {
      return material.progress;
    }
    return readMergedInitialProgress(material);
  }, [material]);

  const [progressLabel, setProgressLabel] = useState(() =>
    getProgressLabel(initialMerged),
  );

  useEffect(() => {
    const guest = readPersonalMaterialGuestProgress(material.id);
    const merged = mergeGuestAndServerProgress({
      server: material.progress,
      guest,
    });

    const needsUpload =
      guest !== null &&
      (merged.positionSeconds > material.progress.positionSeconds ||
        (merged.completed && !material.progress.completed));

    if (needsUpload) {
      void saveMyPersonalMaterialProgressRequest(material.id, {
        positionSeconds: merged.positionSeconds,
        durationSeconds: merged.durationSeconds ?? undefined,
        completed: merged.completed,
      })
        .then(() => {
          clearPersonalMaterialGuestProgress(material.id);
        })
        .catch(() => {
          // Keep local progress if sync fails; retry on next open.
        });
      return;
    }

    if (guest) {
      clearPersonalMaterialGuestProgress(material.id);
    }
  }, [material]);

  const handlePersist = useCallback(
    (input: {
      positionSeconds: number;
      durationSeconds: number;
      completed: boolean;
    }) => {
      setProgressLabel(
        getProgressLabel({
          positionSeconds: input.positionSeconds,
          durationSeconds: input.durationSeconds || material.progress.durationSeconds,
          completed: input.completed,
        }),
      );

      void saveMyPersonalMaterialProgressRequest(material.id, {
        positionSeconds: input.positionSeconds,
        durationSeconds:
          input.durationSeconds || material.progress.durationSeconds || undefined,
        completed: input.completed,
      }).catch(() => {
        // Silent autosave failure — do not interrupt listening.
      });
    },
    [material.id, material.progress.durationSeconds],
  );

  const title = getMyMaterialDisplayTitle(material.title, material.materialType);
  const typeLabel = getPersonalMaterialTypeLabel(material.materialType);
  const authorHref = material.author.slug
    ? `/authors/${encodeURIComponent(material.author.slug)}`
    : null;

  if (!material.hasAudio || material.availability === "unavailable") {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <Link
          href="/my-materials"
          className="text-sm font-semibold text-[#7042c5]"
          aria-label="Назад к списку материалов"
        >
          ← Назад
        </Link>
        <h1 className="mt-6 text-xl font-semibold text-[#2f2647]">Материал недоступен</h1>
        <p className="mt-3 text-sm leading-6 text-[#6d628f]">
          Он был удалён или принадлежит другому пользователю.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-3xl bg-white p-5 shadow-sm sm:p-8">
      <Link
        href="/my-materials"
        className="inline-flex text-sm font-semibold text-[#7042c5]"
        aria-label="Назад к списку материалов"
      >
        ← Назад
      </Link>

      <p className="text-xs font-medium uppercase tracking-wide text-[#9a91b8]">
        {typeLabel}
      </p>
      <h1 className="break-words text-2xl font-semibold text-[#2f2647]">{title}</h1>

      <div className="flex items-center justify-between gap-3">
        <PersonalMaterialHeader
          authorName={material.author.name}
          authorAvatarUrl={material.author.avatarUrl}
        />
        {authorHref && (
          <Link href={authorHref} className="shrink-0 text-sm font-semibold text-[#7042c5]">
            Профиль автора
          </Link>
        )}
      </div>

      {material.diagnosticDate && (
        <p className="text-sm text-[#6d628f]">
          {formatGuestMaterialDate(material.diagnosticDate)}
        </p>
      )}

      <p className="text-sm font-medium text-[#5f5484]" aria-live="polite">
        {progressLabel}
      </p>

      <PersonalMaterialAudioPlayer
        materialId={material.id}
        audioApiPath={`/api/my-materials/${encodeURIComponent(material.id)}/audio`}
        progressMode="server"
        initialPositionSeconds={initialMerged.positionSeconds}
        onProgressPersist={handlePersist}
      />

      {shouldRenderOptionalBlock(material.description) && (
        <PersonalMaterialDescription description={material.description} />
      )}

      {shouldRenderOptionalBlock(material.recommendation) && (
        <PersonalMaterialRecommendation recommendation={material.recommendation} />
      )}

      <PersonalMaterialReturnChatCta
        returnUrl={material.returnUrl}
        returnButtonLabel={material.returnButtonLabel}
      />

      <footer className="border-t border-[#ece6f5] pt-5 text-sm leading-6 text-[#6d628f]">
        Этот материал сохранён в вашем личном кабинете и доступен независимо от
        персональной ссылки.
      </footer>
    </div>
  );
}
