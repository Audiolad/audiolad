"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import type { AudioItemRow } from "@/lib/author-products/types";
import {
  PRODUCT_VIDEO_EXPORT_PROGRESS_POLL_MS,
  PRODUCT_VIDEO_ORIENTATIONS,
  PRODUCT_VIDEO_ORIENTATION_META,
  isProductVideoExportAuthorSlug,
  type ProductVideoOrientation,
} from "@/lib/product-video-export/contract";
import { productVideoRenderStatusView } from "@/lib/product-video-export/progress";

type VideoAudioItem = Pick<
  AudioItemRow,
  | "id"
  | "title"
  | "audio_path"
  | "audio_prepare_status"
  | "position"
>;

type CoverState = {
  hasCover: boolean;
  previewUrl: string | null;
  busy: boolean;
  error: string | null;
};

type RenderState = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed" | "superseded";
  stale: boolean;
  error_message_safe: string | null;
  progress_percent: number | null;
};

type Props = {
  practiceId: string | null;
  authorSlug: string | null;
  audioItems: VideoAudioItem[];
  getPracticeId: () => Promise<string | null>;
  disabled?: boolean;
};

const EMPTY_COVER: CoverState = {
  hasCover: false,
  previewUrl: null,
  busy: false,
  error: null,
};

function key(audioId: string, orientation: ProductVideoOrientation) {
  return `${audioId}:${orientation}`;
}

function readProgressPercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function ProductVideoJobStatus({ state }: { state: RenderState | null }) {
  if (!state) {
    return <p className="mt-2 text-sm text-[#7d70a2]">Не создано</p>;
  }
  const view = productVideoRenderStatusView({
    status: state.status,
    stale: state.stale,
    progressPercent: state.progress_percent,
  });
  const prominent =
    !state.stale &&
    (state.status === "queued" ||
      state.status === "processing" ||
      state.status === "completed" ||
      state.status === "failed");
  const tone =
    state.status === "failed" && !state.stale
      ? "text-base font-semibold text-[#9b3d3d]"
      : prominent
        ? "text-base font-semibold text-[#3f3560]"
        : "text-sm font-medium text-[#3f3560]";
  return (
    <div className="mt-2">
      <p className={tone} role="status" aria-live="polite">
        {view.label}
        {view.percent != null ? (
          <span className="ml-2 tabular-nums">{view.percent}%</span>
        ) : null}
      </p>
      {view.showBar && view.percent != null ? (
        <div
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#efe8f8]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={view.percent}
          aria-valuetext={`${view.percent}%`}
          aria-label={view.label}
        >
          <div
            className={`h-full rounded-full bg-[#7042c5] ${
              view.animate
                ? "motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out motion-reduce:transition-none"
                : ""
            }`}
            style={{ width: `${view.percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function AuthorProductVideoExport({
  practiceId,
  authorSlug,
  audioItems,
  getPracticeId,
  disabled = false,
}: Props) {
  const enabled = isProductVideoExportAuthorSlug(authorSlug);
  const [resolvedPracticeId, setResolvedPracticeId] = useState(practiceId);
  const [covers, setCovers] = useState<
    Record<ProductVideoOrientation, CoverState>
  >({
    landscape_16_9: EMPTY_COVER,
    portrait_9_16: EMPTY_COVER,
  });
  const [renders, setRenders] = useState<Record<string, RenderState | null>>({});
  const [renderBusy, setRenderBusy] = useState<Record<string, boolean>>({});
  const [renderErrors, setRenderErrors] = useState<Record<string, string | null>>(
    {},
  );
  const landscapeInputRef = useRef<HTMLInputElement>(null);
  const portraitInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (practiceId) setResolvedPracticeId(practiceId);
  }, [practiceId]);

  const playableItems = useMemo(
    () =>
      audioItems.filter(
        (item) =>
          !item.id.startsWith("temp-") &&
          Boolean(item.audio_path) &&
          item.audio_prepare_status !== "queued" &&
          item.audio_prepare_status !== "processing",
      ),
    [audioItems],
  );

  const loadCovers = useCallback(async () => {
    if (!enabled || !resolvedPracticeId) return;
    await Promise.all(
      PRODUCT_VIDEO_ORIENTATIONS.map(async (orientation) => {
        try {
          const response = await fetch(
            `/api/author/products/${resolvedPracticeId}/video-covers/${orientation}`,
            { cache: "no-store" },
          );
          const payload = (await response.json()) as {
            hasCover?: boolean;
            previewUrl?: string | null;
          };
          if (!response.ok) return;
          setCovers((current) => ({
            ...current,
            [orientation]: {
              ...current[orientation],
              hasCover: payload.hasCover === true,
              previewUrl: payload.previewUrl ?? null,
              error: null,
            },
          }));
        } catch {
          // Keep the upload UI usable; a later refresh retries.
        }
      }),
    );
  }, [enabled, resolvedPracticeId]);

  const loadRenderStates = useCallback(async (onlyAudioIds?: readonly string[]) => {
    if (!enabled || !resolvedPracticeId) return;
    const items = onlyAudioIds
      ? playableItems.filter((item) => onlyAudioIds.includes(item.id))
      : playableItems;
    await Promise.all(
      items.map(async (item) => {
        try {
          const response = await fetch(
            `/api/author/products/${resolvedPracticeId}/video/${item.id}`,
            { cache: "no-store" },
          );
          const payload = (await response.json()) as {
            states?: Partial<Record<ProductVideoOrientation, RenderState | null>>;
          };
          if (!response.ok || !payload.states) return;
          setRenders((current) => {
            const next = { ...current };
            for (const orientation of PRODUCT_VIDEO_ORIENTATIONS) {
              const incoming = payload.states?.[orientation] ?? null;
              next[key(item.id, orientation)] = incoming
                ? {
                    ...incoming,
                    progress_percent: readProgressPercent(incoming.progress_percent),
                  }
                : null;
            }
            return next;
          });
        } catch {
          // Polling will retry.
        }
      }),
    );
  }, [enabled, playableItems, resolvedPracticeId]);

  useEffect(() => {
    void loadCovers();
  }, [loadCovers]);

  useEffect(() => {
    void loadRenderStates();
  }, [loadRenderStates]);

  const activeAudioIds = useMemo(() => {
    const ids: string[] = [];
    for (const item of playableItems) {
      const active = PRODUCT_VIDEO_ORIENTATIONS.some((orientation) => {
        const state = renders[key(item.id, orientation)];
        return (
          state &&
          !state.stale &&
          (state.status === "queued" || state.status === "processing")
        );
      });
      if (active) ids.push(item.id);
    }
    return ids;
  }, [playableItems, renders]);
  const activeAudioIdsRef = useRef(activeAudioIds);
  activeAudioIdsRef.current = activeAudioIds;
  const hasActiveRender = activeAudioIds.length > 0;

  useEffect(() => {
    if (!hasActiveRender) return;
    const timer = window.setInterval(() => {
      const ids = activeAudioIdsRef.current;
      if (ids.length === 0) return;
      void loadRenderStates(ids);
    }, PRODUCT_VIDEO_EXPORT_PROGRESS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasActiveRender, loadRenderStates]);

  async function ensurePracticeId() {
    if (resolvedPracticeId) return resolvedPracticeId;
    const id = await getPracticeId();
    if (id) setResolvedPracticeId(id);
    return id;
  }

  async function uploadCover(
    orientation: ProductVideoOrientation,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setCovers((current) => ({
      ...current,
      [orientation]: {
        ...current[orientation],
        busy: true,
        error: null,
      },
    }));
    try {
      const id = await ensurePracticeId();
      if (!id) throw new Error("Сначала сохраните черновик продукта.");
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/author/products/${id}/video-covers/${orientation}`,
        { method: "POST", body: form },
      );
      const payload = (await response.json()) as {
        previewUrl?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error === "invalid_video_cover"
            ? "Выберите корректное изображение JPEG, PNG или WebP."
            : payload.error === "video_cover_path_rejected" ||
                payload.error === "video_cover_persist_failed"
              ? "Не удалось сохранить видеообложку. Попробуйте ещё раз или обратитесь в поддержку."
              : "Не удалось загрузить видеообложку.",
        );
      }
      setCovers((current) => ({
        ...current,
        [orientation]: {
          hasCover: true,
          previewUrl: payload.previewUrl ?? null,
          busy: false,
          error: null,
        },
      }));
      await loadRenderStates();
    } catch (error) {
      setCovers((current) => ({
        ...current,
        [orientation]: {
          ...current[orientation],
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : "Не удалось загрузить видеообложку.",
        },
      }));
    }
  }

  async function deleteCover(orientation: ProductVideoOrientation) {
    if (!resolvedPracticeId) return;
    setCovers((current) => ({
      ...current,
      [orientation]: { ...current[orientation], busy: true, error: null },
    }));
    try {
      const response = await fetch(
        `/api/author/products/${resolvedPracticeId}/video-covers/${orientation}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Не удалось удалить видеообложку.");
      setCovers((current) => ({
        ...current,
        [orientation]: {
          hasCover: false,
          previewUrl: null,
          busy: false,
          error: null,
        },
      }));
      await loadRenderStates();
    } catch (error) {
      setCovers((current) => ({
        ...current,
        [orientation]: {
          ...current[orientation],
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : "Не удалось удалить видеообложку.",
        },
      }));
    }
  }

  async function createVideo(
    audioId: string,
    orientation: ProductVideoOrientation,
  ) {
    const id = await ensurePracticeId();
    if (!id) return;
    const renderKey = key(audioId, orientation);
    setRenderBusy((current) => ({ ...current, [renderKey]: true }));
    setRenderErrors((current) => ({ ...current, [renderKey]: null }));
    try {
      const response = await fetch(
        `/api/author/products/${id}/video/${audioId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orientation }),
        },
      );
      const payload = (await response.json()) as {
        job?: RenderState;
        error?: string;
      };
      if (!response.ok || !payload.job) {
        const message =
          payload.error === "video_cover_required"
            ? "Сначала загрузите соответствующую видеообложку."
            : payload.error === "audio_not_ready"
              ? "Аудио ещё не готово."
              : "Не удалось поставить видео в очередь.";
        throw new Error(message);
      }
      setRenders((current) => ({
        ...current,
        [renderKey]: {
          ...payload.job!,
          stale: false,
          progress_percent: readProgressPercent(payload.job?.progress_percent),
        },
      }));
    } catch (error) {
      setRenderErrors((current) => ({
        ...current,
        [renderKey]:
          error instanceof Error
            ? error.message
            : "Не удалось создать видео.",
      }));
    } finally {
      setRenderBusy((current) => ({ ...current, [renderKey]: false }));
    }
  }

  if (!enabled) return null;

  return (
    <section className="mt-5 space-y-5 rounded-[20px] border border-[#e4d7f4] bg-[#fbf8ff] p-4">
      <div>
        <h3 className="text-[18px] font-semibold text-[#3f3560]">
          Видео для площадок
        </h3>
        <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
          Загрузите отдельные обложки и создайте готовый MP4 из обложки и аудио.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {PRODUCT_VIDEO_ORIENTATIONS.map((orientation) => {
          const meta = PRODUCT_VIDEO_ORIENTATION_META[orientation];
          const cover = covers[orientation];
          const inputRef =
            orientation === "landscape_16_9"
              ? landscapeInputRef
              : portraitInputRef;
          return (
            <div
              key={orientation}
              className="rounded-[18px] border border-[#eadff8] bg-white p-4"
            >
              <p className="text-sm font-medium text-[#3f3560]">
                {meta.coverLabel}
              </p>
              <button
                type="button"
                disabled={disabled || cover.busy}
                onClick={() => inputRef.current?.click()}
                className={`group mt-3 flex overflow-hidden rounded-[16px] border border-[#d9c9ef] bg-[#f8f4fc] disabled:opacity-60 ${
                  orientation === "landscape_16_9"
                    ? "aspect-video w-full max-w-sm"
                    : "aspect-[9/16] h-48"
                }`}
              >
                {cover.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="m-auto px-4 text-center text-xs text-[#8c79b6]">
                    Нет видеообложки {meta.ratioLabel}
                  </span>
                )}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={disabled || cover.busy}
                onChange={(event) => void uploadCover(orientation, event)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={disabled || cover.busy}
                  onClick={() => inputRef.current?.click()}
                  className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
                >
                  {cover.busy
                    ? "Загрузка…"
                    : cover.hasCover
                      ? "Изменить"
                      : "Загрузить"}
                </button>
                {cover.hasCover ? (
                  <button
                    type="button"
                    disabled={disabled || cover.busy}
                    onClick={() => void deleteCover(orientation)}
                    className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7d70a2] disabled:opacity-60"
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-xs leading-5 text-[#7d70a2]">
                JPEG, PNG или WebP. Изображение автоматически приводится к{" "}
                {meta.width}×{meta.height}.
              </p>
              {cover.error ? (
                <p className="mt-2 text-sm text-[#9b3d3d]">{cover.error}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-[#3f3560]">
          Создать MP4 из аудио
        </h4>
        {audioItems.length === 0 ? (
          <p className="text-sm text-[#7d70a2]">
            Сначала добавьте аудио к продукту.
          </p>
        ) : (
          audioItems.map((item) => {
            const playable = playableItems.some((row) => row.id === item.id);
            return (
              <div
                key={item.id}
                className="rounded-[18px] border border-[#eadff8] bg-white p-4"
              >
                <p className="text-sm font-semibold text-[#3f3560]">
                  {item.title || `Аудио ${item.position}`}
                </p>
                {!playable ? (
                  <p className="mt-2 text-sm text-[#7d70a2]">
                    Аудио ещё не загружено или обрабатывается.
                  </p>
                ) : null}
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {PRODUCT_VIDEO_ORIENTATIONS.map((orientation) => {
                    const meta = PRODUCT_VIDEO_ORIENTATION_META[orientation];
                    const renderKey = key(item.id, orientation);
                    const state = renders[renderKey] ?? null;
                    const active =
                      state &&
                      !state.stale &&
                      (state.status === "queued" ||
                        state.status === "processing");
                    const currentReady =
                      state &&
                      !state.stale &&
                      state.status === "completed";
                    const canCreate =
                      playable &&
                      covers[orientation].hasCover &&
                      !active &&
                      !renderBusy[renderKey] &&
                      !disabled;
                    const recreate =
                      currentReady ||
                      Boolean(state?.stale) ||
                      state?.status === "failed";
                    return (
                      <div
                        key={orientation}
                        className="rounded-[16px] border border-[#eee6f7] p-3"
                      >
                        <p className="text-sm font-medium text-[#3f3560]">
                          {meta.ratioLabel}
                        </p>
                        <ProductVideoJobStatus state={state} />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!canCreate}
                            onClick={() => void createVideo(item.id, orientation)}
                            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {renderBusy[renderKey]
                              ? "Ставим в очередь…"
                              : recreate
                                ? "Создать заново"
                                : meta.buttonLabel}
                          </button>
                          {currentReady && resolvedPracticeId ? (
                            <a
                              href={`/api/author/products/${resolvedPracticeId}/video/${item.id}/download?orientation=${orientation}`}
                              className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
                            >
                              Скачать MP4
                            </a>
                          ) : null}
                        </div>
                        {!covers[orientation].hasCover ? (
                          <p className="mt-2 text-xs text-[#7d70a2]">
                            Сначала загрузите видеообложку {meta.ratioLabel}.
                          </p>
                        ) : null}
                        {state?.status === "failed" && !state.stale ? (
                          <p className="mt-2 text-sm text-[#9b3d3d]" role="alert">
                            {state.error_message_safe ||
                              "Не удалось создать видео. Попробуйте ещё раз."}
                          </p>
                        ) : null}
                        {renderErrors[renderKey] ? (
                          <p className="mt-2 text-xs text-[#9b3d3d]">
                            {renderErrors[renderKey]}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
