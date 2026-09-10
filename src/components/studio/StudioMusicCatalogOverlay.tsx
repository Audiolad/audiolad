"use client";

import { useEffect, useRef, useState } from "react";

import { StudioMusicCatalogCard } from "@/components/studio/StudioMusicCatalogCard";
import { buildBuySignInHref } from "@/lib/auth/buy-sign-in";
import {
  markStudioMusicCatalogItemAvailable,
  resolveStudioMusicCatalogAction,
} from "@/lib/studio-music/catalog-actions";
import type {
  StudioMusicCatalogFilter,
  StudioMusicCatalogItem,
  StudioMusicCatalogResult,
} from "@/lib/studio-music/catalog";
import {
  mapStudioMusicAcquireClientError,
  resolveStudioMusicCheckoutUiError,
} from "@/lib/studio-music/client-errors";
import { STUDIO_MUSIC_GRANT_SOURCE } from "@/lib/studio-music/access";

const FILTERS: Array<{
  id: StudioMusicCatalogFilter;
  label: string;
  authOnly?: boolean;
}> = [
  { id: "all", label: "Вся" },
  { id: "mine", label: "Моя", authOnly: true },
  { id: "free", label: "Бесплатная" },
];

function previewKeyFor(publicationId: string, audioItemId: string) {
  return `${publicationId}:${audioItemId}`;
}

function StudioMusicCatalogOverlayBody({
  onClose,
}: {
  onClose: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [filter, setFilter] = useState<StudioMusicCatalogFilter>("all");
  const [authenticated, setAuthenticated] = useState(false);
  const [items, setItems] = useState<StudioMusicCatalogItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);
  const [busyPublicationId, setBusyPublicationId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const stopPreview = () => {
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
  };

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog(cursor: string | null) {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          filter,
          limit: "20",
        });
        if (cursor) {
          params.set("cursor", cursor);
        }
        const response = await fetch(
          `/api/studio/music/catalog?${params.toString()}`,
          { cache: "no-store" },
        );
        if (filter === "mine" && response.status === 401) {
          if (!cancelled) {
            setAuthenticated(false);
            setFilter("all");
          }
          return;
        }
        if (!response.ok) {
          throw new Error("catalog_unavailable");
        }
        const body = (await response.json()) as StudioMusicCatalogResult;
        if (cancelled) {
          return;
        }
        setAuthenticated(body.viewer.authenticated);
        setItems((current) => (cursor ? [...current, ...body.items] : body.items));
        setNextCursor(body.nextCursor);
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить каталог музыки");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCatalog(null);
    return () => {
      cancelled = true;
    };
  }, [filter]);

  useEffect(() => {
    const audio = audioRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        stopPreview();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [onClose]);

  const playPreview = async (publicationId: string, audioItemId: string) => {
    const key = previewKeyFor(publicationId, audioItemId);
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

  const patchItem = (
    publicationId: string,
    updater: (item: StudioMusicCatalogItem) => StudioMusicCatalogItem,
  ) => {
    setItems((current) =>
      current.map((item) =>
        item.publication_id === publicationId ? updater(item) : item,
      ),
    );
  };

  const refreshPublication = async (publicationId: string) => {
    const params = new URLSearchParams({
      filter,
      limit: "20",
    });
    const response = await fetch(
      `/api/studio/music/catalog?${params.toString()}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return;
    }
    const body = (await response.json()) as StudioMusicCatalogResult;
    const next = body.items.find((item) => item.publication_id === publicationId);
    if (!next) {
      return;
    }
    patchItem(publicationId, () => next);
  };

  const redirectToSignIn = () => {
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "";
    const href = buildBuySignInHref(currentPath, currentPath);
    if (href) {
      window.location.assign(href);
    }
  };

  const acquirePublication = async (item: StudioMusicCatalogItem) => {
    const action = resolveStudioMusicCatalogAction(item);
    if (action.kind !== "free" && action.kind !== "paid") {
      return;
    }

    setBusyPublicationId(item.publication_id);
    setActionErrors((current) => {
      const next = { ...current };
      delete next[item.publication_id];
      return next;
    });
    setError(null);

    try {
      if (action.kind === "free") {
        const response = await fetch("/api/studio/music/acquire", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ practiceId: item.publication_id }),
        });
        const body: unknown = await response.json().catch(() => null);

        if (response.status === 401) {
          redirectToSignIn();
          return;
        }

        const errorCode =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : undefined;

        if (!response.ok) {
          setActionErrors((current) => ({
            ...current,
            [item.publication_id]: mapStudioMusicAcquireClientError(errorCode),
          }));
          return;
        }

        patchItem(item.publication_id, (current) =>
          markStudioMusicCatalogItemAvailable(current, {
            grantSource: STUDIO_MUSIC_GRANT_SOURCE.FREE,
          }),
        );
        await refreshPublication(item.publication_id);
        return;
      }

      const response = await fetch("/api/checkout/studio-music", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          practiceId: item.publication_id,
          ...(typeof item.studio_effective_minor === "number" &&
          Number.isInteger(item.studio_effective_minor) &&
          item.studio_effective_minor > 0
            ? { expectedAmountMinor: item.studio_effective_minor }
            : {}),
        }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        redirectToSignIn();
        return;
      }

      const errorCode =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : undefined;

      if (errorCode === "already_studio_entitled") {
        patchItem(item.publication_id, (current) =>
          markStudioMusicCatalogItemAvailable(current, {
            grantSource: STUDIO_MUSIC_GRANT_SOURCE.PURCHASE,
          }),
        );
        await refreshPublication(item.publication_id);
        return;
      }

      if (errorCode === "price_changed") {
        const currentAmount =
          body &&
          typeof body === "object" &&
          "current_amount_minor" in body &&
          typeof (body as { current_amount_minor?: unknown }).current_amount_minor ===
            "number"
            ? (body as { current_amount_minor: number }).current_amount_minor
            : null;
        const message =
          body &&
          typeof body === "object" &&
          "message" in body &&
          typeof (body as { message?: unknown }).message === "string"
            ? (body as { message: string }).message
            : resolveStudioMusicCheckoutUiError({
                httpStatus: response.status,
                errorCode,
              });
        if (currentAmount && currentAmount > 0) {
          patchItem(item.publication_id, (current) => ({
            ...current,
            studio_effective_minor: currentAmount,
          }));
        }
        setActionErrors((current) => ({
          ...current,
          [item.publication_id]: message,
        }));
        await refreshPublication(item.publication_id);
        return;
      }

      const paymentUrl =
        body &&
        typeof body === "object" &&
        "payment" in body &&
        (body as { payment?: { payment_url?: unknown } }).payment &&
        typeof (body as { payment: { payment_url?: unknown } }).payment
          .payment_url === "string"
          ? (body as { payment: { payment_url: string } }).payment.payment_url
          : null;

      const uiError = resolveStudioMusicCheckoutUiError({
        httpStatus: response.status,
        errorCode,
        paymentUrl,
      });

      if (uiError) {
        setActionErrors((current) => ({
          ...current,
          [item.publication_id]: uiError,
        }));
        return;
      }

      window.location.assign(paymentUrl as string);
    } catch {
      setActionErrors((current) => ({
        ...current,
        [item.publication_id]:
          action.kind === "free"
            ? mapStudioMusicAcquireClientError("internal_error")
            : resolveStudioMusicCheckoutUiError({
                httpStatus: 0,
                networkFailed: true,
              }),
      }));
    } finally {
      setBusyPublicationId(null);
    }
  };

  const loadMore = async () => {
    if (!nextCursor) {
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        filter,
        limit: "20",
        cursor: nextCursor,
      });
      const response = await fetch(
        `/api/studio/music/catalog?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("catalog_unavailable");
      }
      const body = (await response.json()) as StudioMusicCatalogResult;
      setItems((current) => [...current, ...body.items]);
      setNextCursor(body.nextCursor);
    } catch {
      setError("Не удалось загрузить каталог музыки");
    } finally {
      setLoading(false);
    }
  };

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
              setItems([]);
              setNextCursor(null);
              setFilter(item.id);
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
                busy={busyPublicationId === item.publication_id}
                actionError={actionErrors[item.publication_id] ?? null}
                onPreview={(publicationId, audioItemId) => {
                  void playPreview(publicationId, audioItemId);
                }}
                onAcquire={(next) => {
                  void acquirePublication(next);
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
            onClick={() => void loadMore()}
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

export function StudioMusicCatalogOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return <StudioMusicCatalogOverlayBody onClose={onClose} />;
}
