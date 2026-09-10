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

  return (
    <article className="studio-music-catalog-card overflow-hidden rounded-xl border border-white/10 bg-[#121b28]">
      <div className="aspect-square bg-[#0d131d]">
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
      <div className="space-y-2 p-3">
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
        <p className="text-xs font-semibold text-[#d8c8fb]">{item.display_label}</p>
        <div className="flex flex-wrap gap-2">
          {!isAlbum && primaryTrackId ? (
            <button
              type="button"
              onClick={() => onPreview(item.publication_id, primaryTrackId)}
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
              onClick={() => setExpanded((current) => !current)}
              className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-[#e2e8f5]"
            >
              {expanded ? "Скрыть треки" : "Треки"}
            </button>
          ) : null}
          {action.kind === "free" || action.kind === "paid" ? (
            <button
              type="button"
              onClick={() => onAcquire?.(item)}
              disabled={busy}
              aria-busy={busy}
              className="rounded-md border border-[#9d7ae8] px-3 py-1.5 text-xs font-semibold text-[#e8dcff] disabled:opacity-60"
            >
              {busy ? STUDIO_MUSIC_LOADING_LABEL : action.label}
            </button>
          ) : null}
        </div>
        {actionError ? (
          <p role="alert" className="text-xs text-rose-200">
            {actionError}
          </p>
        ) : null}
        {isAlbum && expanded ? (
          <ul className="space-y-2 border-t border-white/10 pt-2">
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
                  onClick={() => onPreview(item.publication_id, track.id)}
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
      </div>
    </article>
  );
}
