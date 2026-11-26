"use client";

import { useMemo, useState } from "react";
import {
  BULK_TRACK_TITLES_OVERFLOW_MESSAGE,
  bulkTrackTitleApplyState,
  parseBulkTrackTitleLines,
} from "@/lib/author-products/music-album-bulk-track-titles";

type MusicAlbumBulkTrackTitlesPanelProps = {
  trackCount: number;
  disabled?: boolean;
  canUndo: boolean;
  successMessage: string | null;
  onApply: (names: string[]) => void;
  onUndo: () => void;
};

export default function MusicAlbumBulkTrackTitlesPanel({
  trackCount,
  disabled = false,
  canUndo,
  successMessage,
  onApply,
  onUndo,
}: MusicAlbumBulkTrackTitlesPanelProps) {
  const [text, setText] = useState("");

  const names = useMemo(() => parseBulkTrackTitleLines(text), [text]);
  const applyState = bulkTrackTitleApplyState(names.length, trackCount);

  return (
    <div className="rounded-[20px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-5">
      <h3 className="text-sm font-semibold text-[#25135c]">
        Массовое заполнение названий треков
      </h3>
      <p className="mt-2 text-sm text-[#5f5484]">
        Вставьте список названий треков – каждое название с новой строки.
      </p>

      <label className="mt-4 block">
        <textarea
          value={text}
          rows={8}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-sm text-[#25135c] outline-none focus:border-[#9a74d8] disabled:opacity-60"
          placeholder={"Бежевые перчатки\nМягкий свинг\nТёплый аккорд"}
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#5f5484]">
        <span>Введено названий: {names.length}</span>
        <span>Треков в альбоме: {trackCount}</span>
      </div>

      {applyState.overflow ? (
        <p role="alert" className="mt-3 text-sm text-[#9b3d3d]">
          {BULK_TRACK_TITLES_OVERFLOW_MESSAGE}
        </p>
      ) : null}

      {successMessage ? (
        <p role="status" className="mt-3 text-sm text-[#5f5484]">
          {successMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={disabled || !applyState.canApply}
          onClick={() => onApply(names)}
          className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Заполнить названия треков
        </button>
        {canUndo ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onUndo}
            className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Отменить последнее заполнение
          </button>
        ) : null}
      </div>
    </div>
  );
}