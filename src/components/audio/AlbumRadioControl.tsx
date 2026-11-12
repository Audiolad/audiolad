"use client";

import { useGlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayerProvider";

export default function AlbumRadioControl({ compact = false }: { compact?: boolean }) {
  const { session, activeQueue, albumRadioEnabled, albumRadioAvailable, setAlbumRadioEnabled } = useGlobalAudioPlayer();
  const radio = activeQueue?.source.kind === "album_radio";
  if (!session || (!radio && !albumRadioAvailable)) return null;
  return (
    <label className={compact
      ? "flex min-h-5 cursor-pointer items-center gap-1 text-[10px]"
      : "flex min-h-8 cursor-pointer items-center justify-center gap-2 text-xs"}>
      <input type="checkbox" checked={albumRadioEnabled}
        onChange={(event) => setAlbumRadioEnabled(event.target.checked)} />
      <span>{radio ? "Радио по альбому" : compact ? "Автопродолжение" : "Продолжать похожей музыкой"}</span>
      {radio && !albumRadioEnabled && !compact ? <span>– до конца трека</span> : null}
    </label>
  );
}
