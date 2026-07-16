"use client";

import { useState } from "react";

import { useGlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayerProvider";
import {
  buildOwnerPlaylistQueue,
  buildPublicPlaylistQueue,
} from "@/lib/playlists/build-playlist-queue";
import type { PlaylistDetailItemView } from "@/lib/playlists/detail";
import type { PublicPlaylistItemView } from "@/lib/playlists/public-detail";

type PlayAllButtonProps =
  | {
      variant: "owner";
      playlistId: string;
      title: string;
      items: PlaylistDetailItemView[];
    }
  | {
      variant: "public";
      playlistSlug: string;
      title: string;
      items: PublicPlaylistItemView[];
    };

export default function PlayAllButton(props: PlayAllButtonProps) {
  const { loadPlaylistQueue } = useGlobalAudioPlayer();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playableCount =
    props.variant === "owner"
      ? props.items.filter((item) => item.available && item.listenHref).length
      : props.items.filter(
          (item) =>
            item.available &&
            typeof item.href === "string" &&
            item.href.startsWith("/listen/"),
        ).length;

  if (playableCount === 0) {
    return null;
  }

  async function handleClick() {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    const built =
      props.variant === "owner"
        ? buildOwnerPlaylistQueue({
            playlistId: props.playlistId,
            title: props.title,
            items: props.items,
          })
        : buildPublicPlaylistQueue({
            playlistSlug: props.playlistSlug,
            title: props.title,
            items: props.items,
          });

    if (!built.ok) {
      setError("Не удалось запустить плейлист. Попробуйте ещё раз.");
      setLoading(false);
      return;
    }

    const result = await loadPlaylistQueue(built.queue);

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={loading}
        onClick={() => void handleClick()}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-medium text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        {loading ? "Запуск…" : "Слушать всё"}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-[#b34f63]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
