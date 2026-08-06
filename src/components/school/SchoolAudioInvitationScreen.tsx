"use client";

import { useCallback, useState } from "react";

import SchoolAudioInvitationPlayer from "@/components/school/SchoolAudioInvitationPlayer";
import {
  SCHOOL_INVITATION_AUTHOR_NAME,
  SCHOOL_INVITATION_CANONICAL_URL,
  SCHOOL_INVITATION_EXTRA,
  SCHOOL_INVITATION_LABEL,
  SCHOOL_INVITATION_SUBTITLE,
  SCHOOL_INVITATION_TITLE,
} from "@/lib/school/audio-invitation";
import { formatAudioDuration } from "@/lib/products/duration";

export default function SchoolAudioInvitationScreen() {
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);

  const handleMeta = useCallback(
    (meta: { durationSeconds: number; coverImageUrl: string | null }) => {
      setCoverImageUrl(meta.coverImageUrl);
      setDurationSeconds(
        meta.durationSeconds > 0 ? meta.durationSeconds : null,
      );
    },
    [],
  );

  const durationLabel = formatAudioDuration(durationSeconds);

  return (
    <section
      className="school-invite"
      aria-label="Аудиоприглашение в Школу Аудиопрактик"
    >
      <div className="school-invite__inner">
        <div className="school-invite__cover">
          {coverImageUrl ? (
            // Same-origin storage URL from session; avoid next/image remote config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="school-invite__cover-image"
              src={coverImageUrl}
              alt="Обложка аудиопоста «Приглашение в Школу Аудиопрактик»"
              width={440}
              height={440}
              decoding="async"
            />
          ) : (
            <div className="school-invite__cover-fallback" aria-hidden="true" />
          )}
        </div>

        <div className="school-invite__body">
          <p className="school-invite__eyebrow">{SCHOOL_INVITATION_LABEL}</p>
          <h2 className="school-invite__title">{SCHOOL_INVITATION_TITLE}</h2>
          <p className="school-invite__subtitle">{SCHOOL_INVITATION_SUBTITLE}</p>

          <div className="school-invite__meta">
            <p className="school-invite__author">{SCHOOL_INVITATION_AUTHOR_NAME}</p>
            <p className="school-invite__extra">{SCHOOL_INVITATION_EXTRA}</p>
            {durationLabel ? (
              <p className="school-invite__duration">
                <span className="school-number">{durationLabel}</span>
              </p>
            ) : null}
          </div>

          <SchoolAudioInvitationPlayer onMeta={handleMeta} />

          <a
            className="school-invite__link"
            href={SCHOOL_INVITATION_CANONICAL_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть аудиопост в АудиоЛаде
          </a>
        </div>
      </div>
    </section>
  );
}
