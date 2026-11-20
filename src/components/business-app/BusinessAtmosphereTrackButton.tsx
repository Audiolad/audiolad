"use client";

import { useState } from "react";

import CabinetCoverImage from "@/components/business-app/CabinetCoverImage";
import { cabinetAlbumCoverUrl } from "@/lib/business-app/album-cover";

type Props = {
  title: string;
  subtitle?: string | null;
  time?: string | null;
  /** Queue position. Omitted on the venue "up next" list, which does not number rows. */
  number?: number | null;
  current?: boolean;
  playing?: boolean;
  disabled?: boolean;
  coverUrl?: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
  onClick: () => void;
  testId?: string;
};

/**
 * One track row for the cabinet music lists (guest atmosphere and the signed-in queue).
 * The thumbnail is the album cover already shown in the public catalog. A number, when
 * this list uses one, or ♪ while this row is playing, sits on the thumbnail.
 */
export default function BusinessAtmosphereTrackButton({
  title,
  subtitle,
  time,
  number,
  current = false,
  playing = false,
  disabled = false,
  coverUrl,
  coverImage,
  updatedAt,
  onClick,
  testId,
}: Props) {
  const [failed, setFailed] = useState(false);
  const src = cabinetAlbumCoverUrl({ coverUrl, coverImage, updatedAt });
  const showImage = Boolean(src) && !failed;
  const mark = playing ? "♪" : number ?? null;

  return (
    <button
      type="button"
      className="business-atmosphere-track business-app-focus-ring"
      data-current={current ? "true" : undefined}
      aria-current={current ? "true" : undefined}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      <span
        className="business-atmosphere-track__cover"
        data-has-image={showImage ? "true" : "false"}
        data-playing={playing ? "true" : "false"}
        aria-hidden="true"
      >
        {showImage && src ? (
          <CabinetCoverImage src={src} width={46} height={46} onError={() => setFailed(true)} />
        ) : null}
        {mark != null ? <span className="business-atmosphere-track__mark">{mark}</span> : null}
      </span>
      <span className="business-atmosphere-track__meta">
        <span className="business-atmosphere-track__title">{title}</span>
        {subtitle ? <span className="business-atmosphere-track__album">{subtitle}</span> : null}
      </span>
      {time ? <span className="business-atmosphere-track__time">{time}</span> : null}
    </button>
  );
}
