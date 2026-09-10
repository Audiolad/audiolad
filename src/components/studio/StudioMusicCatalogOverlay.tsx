"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { StudioMusicCatalogCard } from "@/components/studio/StudioMusicCatalogCard";
import type {
  StudioMusicCatalogFilter,
  StudioMusicCatalogItem,
  StudioMusicCatalogResult,
} from "@/lib/studio-music/catalog";

const FILTERS: Array<{
  id: StudioMusicCatalogFilter;
  label: string;
  authOnly?: boolean;
}> = [
  { id: "all", label: "Вся" },
  { id: "mine", label: "Моя", authOnly: true },
  { id: "free", label: "Бесплатная" },
];

export function StudioMusicCatalogOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [filter, setFilter] = useState<StudioMusicCatalogFilter>("all");
  const [authenticated, setAuthenticated] = useState(false);
  const [items, setItems] = useState<StudioMusicCatalogItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);

  const stopPreview = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setActivePreviewKey(null);
  }, []);

  const loadPage = useCallback(
    async (nextFilter: StudioMusicCatalogFilter, cursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          filter: nextFilter,
          limit: "20",
        });
        if (cursor) {
          params.set("cursor", cursor);
        }
        const response = await fetch(
          `/api/studio/music/catalog?${params.toString()}`,
          { cache: "no-store" },
        );
        if (nextFilter === "mine" && response.status === 401) {
          setAuthenticated(false);
          setFilter("all");
          setItems([]);
          setNextCursor(null);
          await loadPage("all", null);
          return;
        }
        if (!response.ok) {
          throw new Error("catalog_unavailable");
        }
        const body = (await response.json()) as StudioMusicCatalogResult;
        setAuthenticated(body.viewer.authenticated);
        setItems((current) => (cursor ? [...current, ...body.items] : body.items));
        setNextCursor(body.nextCursor);
      } catch {
        setError("Не удалось загрузить каталог музыки");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      stopPreview();
      return;
    }
    setFilter("all");
    setItems([]);
    setNextCursor(null);
    void loadPage("all", null);
  }, [open, loadPage, stopPreview]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        stopPreview();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, stopPreview]);

  const playPreview = async (publicationId: string, audioItemId: string) => {
    const key = `${publicationId}:${audioItemId}`;
    if (activePreviewKey === key) {
      stopPreview();
      return;
    }
    stopPreview();
    const params = new URLSearchParams({ publicationId, audioItemId });
    const response = await fetch(
      `/api/studio/music/preview?${params.toString()}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      setError("Не удалось включить превью");
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.src = objectUrl;
    setActivePreviewKey(key);
    void audio.play().catch(() => {
      setError("Не удалось включить превью");
      stopPreview();
    });
  };

  if (!open) {
    return null;
  }

  const visibleFilters = FILTERS.filter(
    (item) => !item.authOnly || authenticated,
  );

  return (
    <div
      className="studio-music-catalog-overlay fixed inset-0 z-40 flex flex-col overflow-y-auto bg-[#0b1019] text-[#e2e8f5]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-music-catalog-title"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0b1019] px-4 py-3">
        <h2
          id="studio-music-catalog-title"
          className="text-lg font-semibold text-white"
        >
          Музыка для медитаций
        </h2>
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onClose();
          }}
          className="h-10 rounded-lg border border-white/15 px-4 text-sm font-semibold text-[#e2e8f5]"
        >
          Закрыть
        </button>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3">
        {visibleFilters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              stopPreview();
              setFilter(item.id);
              setItems([]);
              setNextCursor(null);
              void loadPage(item.id, null);
            }}
            className={`h-9 rounded-full px-4 text-sm font-semibold ${
              filter === item.id
                ? "bg-[#7650bd] text-white"
                : "border border-white/15 text-[#c9d4e8]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 px-4 pb-8">
        {error ? (
          <p role="alert" className="mb-3 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
        {items.length === 0 && !loading ? (
          <p className="text-sm text-[#97a4b8]">Пока нет музыки в этом разделе.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <StudioMusicCatalogCard
                key={item.publication_id}
                item={item}
                activePreviewKey={activePreviewKey}
                onPreview={(publicationId, audioItemId) => {
                  void playPreview(publicationId, audioItemId);
                }}
              />
            ))}
          </div>
        )}
        {loading ? (
          <p className="mt-4 text-sm text-[#97a4b8]">Загрузка…</p>
        ) : null}
        {nextCursor && !loading ? (
          <button
            type="button"
            onClick={() => void loadPage(filter, nextCursor)}
            className="mt-4 h-10 rounded-lg border border-white/15 px-4 text-sm font-semibold"
          >
            Ещё
          </button>
        ) : null}
      </div>

      <audio
        ref={audioRef}
        className="sr-only"
        preload="none"
        onEnded={stopPreview}
      />
    </div>
  );
}
