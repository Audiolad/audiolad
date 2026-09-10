"use client";

import { useState } from "react";

import { formatAudioDuration } from "@/lib/products/duration";
import {
  resolveStudioMusicCatalogAction,
  STUDIO_MUSIC_LOADING_LABEL,
} from "@/lib/studio-music/catalog-actions";
import type { StudioMusicCatalogItem } from "@/lib/studio-music/catalog";

export function StudioMusicCatalogCard({
  item,
  activePreviewKey,
  busy = false,
  actionError = null,
  onPreview,
  onAcquire,
}: {
  item: StudioMusicCatalogItem;
  activePreviewKey: string | null;
  busy?: boolean;
  actionError?: string | null;
  onPreview: (publicationId: string, audioItemId: string) => void;
  onAcquire?: (item: StudioMusicCatalogItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isAlbum = item.kind === "album";
  const primaryTrackId = item.tracks[0]?.id ?? null;
  const action = resolveStudioMusicCatalogAction(item);
  const previewKeyFor = (audioItemId: string) =>
    `${item.publication_id}:${audioItemId}`;

  const toggleExpand = () => {
    if (!isAlbum) {
      return;
    }
    setExpanded((current) => !current);
  };

  return (
    <article className="studio-music-catalog-card overflow-hidden rounded-xl border border-white/10 bg-[#121b28]">
      <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
        <div className="h-36 w-full shrink-0 overflow-hidden rounded-lg bg-[#0d131d] md:h-[136px] md:w-[136px]">
          {item.cover.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover.url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl text-[#5c6780]">
              ♪
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="line-clamp-2 text-sm font-semibold text-[#e8edf8]">
            {item.title}
          </h3>
          <p className="truncate text-xs text-[#9ba7bb]">{item.author.name}</p>
          <p className="text-xs text-[#8b95a8]">
            {item.kind_label}
            {isAlbum
              ? ` · ${item.items_count}`
              : item.duration_seconds
                ? ` · ${formatAudioDuration(item.duration_seconds)}`
                : ""}
          </p>
          {item.subtitle ? (
            <p className="line-clamp-2 text-xs text-[#97a4b8]">{item.subtitle}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 md:w-[220px] md:items-end">
          {action.kind === "available" || action.kind === "own" ? (
            <p className="text-xs font-semibold text-[#d8c8fb]">
              {item.display_label}
            </p>
          ) : (
            <div className="space-y-0.5 text-xs text-[#c9d4e8] md:text-right">
              <p>{item.listener_price_label}</p>
              <p className="font-semibold text-[#d8c8fb]">
                {item.studio_price_label}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 md:justify-end">
            {!isAlbum && primaryTrackId ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPreview(item.publication_id, primaryTrackId);
                }}
                className="rounded-md bg-[#7650bd] px-3 py-1.5 text-xs font-semibold text-white"
              >
                {activePreviewKey === previewKeyFor(primaryTrackId)
                  ? "Стоп"
                  : "Слушать"}
              </button>
            ) : null}
            {isAlbum ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpand();
                }}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-[#e2e8f5]"
              >
                {expanded ? "Скрыть треки" : "Треки"}
              </button>
            ) : null}
            {action.kind === "free" || action.kind === "paid" ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAcquire?.(item);
                }}
                disabled={busy}
                aria-busy={busy}
                className="rounded-md border border-[#9d7ae8] px-3 py-1.5 text-xs font-semibold text-[#e8dcff] disabled:opacity-60"
              >
                {busy ? STUDIO_MUSIC_LOADING_LABEL : action.label}
              </button>
            ) : null}
          </div>
          {actionError ? (
            <p role="alert" className="text-xs text-rose-200 md:text-right">
              {actionError}
            </p>
          ) : null}
        </div>
      </div>
      {isAlbum && expanded ? (
        <ul className="space-y-2 border-t border-white/10 px-3 pb-3 pt-2">
          {item.tracks.map((track) => (
            <li
              key={track.id}
              className="flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs text-[#e2e8f5]">{track.title}</p>
                <p className="text-[11px] text-[#8b95a8]">
                  {formatAudioDuration(track.duration_seconds) ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPreview(item.publication_id, track.id);
                }}
                className="shrink-0 rounded-md bg-[#7650bd] px-2 py-1 text-[11px] font-semibold text-white"
              >
                {activePreviewKey === previewKeyFor(track.id)
                  ? "Стоп"
                  : "Слушать"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
