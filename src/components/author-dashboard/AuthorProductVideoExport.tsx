"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import type { AudioItemRow } from "@/lib/author-products/types";
import {
  PRODUCT_VIDEO_EXPORT_BUCKET,
  PRODUCT_VIDEO_EXPORT_MAX_BACKGROUND_BYTES,
  PRODUCT_VIDEO_EXPORT_PROGRESS_POLL_MS,
  PRODUCT_VIDEO_ORIENTATIONS,
  PRODUCT_VIDEO_ORIENTATION_META,
  isProductVideoAudioReady,
  type ProductVideoOrientation,
} from "@/lib/product-video-export/contract";
import { productVideoRenderStatusView } from "@/lib/product-video-export/progress";
import {
  STUDIO_RESUMABLE_MIN_BYTES,
  isStudioResumableUploadError,
  uploadStudioFileResumable,
} from "@/lib/studio/resumable-upload";
import { createClient } from "@/lib/supabase/client";

type VideoAudioItem = Pick<
  AudioItemRow,
  | "id"
  | "title"
  | "audio_path"
  | "audio_prepare_status"
  | "music_master"
  | "position"
>;

type CoverState = {
  hasCover: boolean;
  previewUrl: string | null;
  busy: boolean;
  error: string | null;
};

type BackgroundState = {
  hasBackground: boolean;
  previewUrl: string | null;
  posterUrl: string | null;
  busy: boolean;
  phase: "idle" | "uploading" | "processing";
  uploadPercent: number | null;
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
  audioItems: VideoAudioItem[];
  getPracticeId: () => Promise<string | null>;
  disabled?: boolean;
  disabledReason?: string | null;
};

const EMPTY_COVER: CoverState = {
  hasCover: false,
  previewUrl: null,
  busy: false,
  error: null,
};

const EMPTY_BACKGROUND: BackgroundState = {
  hasBackground: false,
  previewUrl: null,
  posterUrl: null,
  busy: false,
  phase: "idle",
  uploadPercent: null,
  error: null,
};

function key(audioId: string, orientation: ProductVideoOrientation) {
  return `${audioId}:${orientation}`;
}

function readProgressPercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function VideoPlatformChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-6 w-6 shrink-0 text-[#7042c5] transition-transform duration-200 ${
        expanded ? "rotate-180" : ""
      }`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

export function AuthorProductVideoExport({
  practiceId,
  audioItems,
  getPracticeId,
  disabled = false,
  disabledReason = null,
}: Props) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [resolvedPracticeId, setResolvedPracticeId] = useState(practiceId);
  const [covers, setCovers] = useState<
    Record<ProductVideoOrientation, CoverState>
  >({
    landscape_16_9: EMPTY_COVER,
    portrait_9_16: EMPTY_COVER,
  });
  const [backgrounds, setBackgrounds] = useState<
    Record<ProductVideoOrientation, BackgroundState>
  >({
    landscape_16_9: EMPTY_BACKGROUND,
    portrait_9_16: EMPTY_BACKGROUND,
  });
  const [renders, setRenders] = useState<Record<string, RenderState | null>>({});
  const [renderBusy, setRenderBusy] = useState<Record<string, boolean>>({});
  const [renderErrors, setRenderErrors] = useState<Record<string, string | null>>(
    {},
  );
  const landscapeInputRef = useRef<HTMLInputElement>(null);
  const portraitInputRef = useRef<HTMLInputElement>(null);
  const landscapeBackgroundInputRef = useRef<HTMLInputElement>(null);
  const portraitBackgroundInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (practiceId) setResolvedPracticeId(practiceId);
  }, [practiceId]);

  const playableItems = useMemo(
    () =>
      audioItems.filter(
        (item) => isProductVideoAudioReady({
          id: item.id,
          audioPath: item.audio_path,
          audioPrepareStatus: item.audio_prepare_status,
          hasActiveMusicDelivery: item.music_master?.hasActiveDelivery,
        }),
      ),
    [audioItems],
  );

  const loadCovers = useCallback(async () => {
    if (!resolvedPracticeId) return;
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
          if (!response.ok) {
            setCovers((current) => ({
              ...current,
              [orientation]: {
                ...current[orientation],
                error:
                  "Не удалось проверить видеообложку. Обновите страницу или обратитесь в поддержку.",
              },
            }));
            return;
          }
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
          setCovers((current) => ({
            ...current,
            [orientation]: {
              ...current[orientation],
              error:
                "Не удалось проверить видеообложку. Обновите страницу или обратитесь в поддержку.",
            },
          }));
        }
      }),
    );
  }, [resolvedPracticeId]);

  const loadBackgrounds = useCallback(async () => {
    if (!resolvedPracticeId) return;
    await Promise.all(
      PRODUCT_VIDEO_ORIENTATIONS.map(async (orientation) => {
        try {
          const response = await fetch(
            `/api/author/products/${resolvedPracticeId}/video-backgrounds/${orientation}`,
            { cache: "no-store" },
          );
          const payload = (await response.json()) as {
            hasBackground?: boolean;
            previewUrl?: string | null;
            posterUrl?: string | null;
          };
          if (!response.ok) return;
          setBackgrounds((current) => ({
            ...current,
            [orientation]: {
              hasBackground: payload.hasBackground === true,
              previewUrl: payload.previewUrl ?? null,
              posterUrl: payload.posterUrl ?? null,
              busy: false,
              phase: "idle",
              uploadPercent: null,
              error: null,
            },
          }));
        } catch {
          // Keep the form usable; a later refresh retries.
        }
      }),
    );
  }, [resolvedPracticeId]);

  const loadRenderStates = useCallback(async (onlyAudioIds?: readonly string[]) => {
    if (!resolvedPracticeId) return;
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
  }, [playableItems, resolvedPracticeId]);

  useEffect(() => {
    void loadCovers();
  }, [loadCovers]);

  useEffect(() => {
    void loadBackgrounds();
  }, [loadBackgrounds]);

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

  async function uploadBackground(
    orientation: ProductVideoOrientation,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size <= 0 || file.size > PRODUCT_VIDEO_EXPORT_MAX_BACKGROUND_BYTES) {
      setBackgrounds((current) => ({
        ...current,
        [orientation]: {
          ...current[orientation],
          error: "Видеофон должен быть не больше 200 МБ.",
        },
      }));
      return;
    }
    setBackgrounds((current) => ({
      ...current,
      [orientation]: {
        ...current[orientation],
        busy: true,
        phase: "uploading",
        uploadPercent: 0,
        error: null,
      },
    }));
    let uploadPath: string | null = null;
    let uploadPracticeId: string | null = null;
    try {
      const id = await ensurePracticeId();
      if (!id) throw new Error("Сначала сохраните черновик продукта.");
      uploadPracticeId = id;
      const start = await fetch(
        `/api/author/products/${id}/video-backgrounds/${orientation}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
          }),
        },
      );
      const started = (await start.json()) as {
        uploadPath?: string;
        contentType?: string;
        signedUpload?: { path?: string; token?: string };
        error?: string;
      };
      if (
        !start.ok ||
        !started.uploadPath ||
        !started.contentType ||
        !started.signedUpload?.path ||
        !started.signedUpload.token
      ) {
        throw new Error(
          started.error === "invalid_video_background"
            ? "Выберите корректный MP4, MOV или WebM не больше 200 МБ."
            : "Не удалось начать загрузку видеофона.",
        );
      }
      uploadPath = started.uploadPath;
      const uploadFile =
        file.type === started.contentType
          ? file
          : new File([file], file.name, {
              type: started.contentType,
              lastModified: file.lastModified,
            });
      let uploaded = false;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
      if (supabaseUrl && uploadFile.size >= STUDIO_RESUMABLE_MIN_BYTES) {
        try {
          await uploadStudioFileResumable({
            supabaseUrl,
            bucket: PRODUCT_VIDEO_EXPORT_BUCKET,
            signedUpload: {
              path: started.signedUpload.path,
              token: started.signedUpload.token,
            },
            file: uploadFile,
            contentType: started.contentType,
            onProgress: ({ percent }) => {
              setBackgrounds((current) => ({
                ...current,
                [orientation]: {
                  ...current[orientation],
                  uploadPercent: Math.min(99, percent),
                },
              }));
            },
          });
          uploaded = true;
        } catch (error) {
          if (
            !isStudioResumableUploadError(error) ||
            error.kind !== "unsupported"
          ) {
            throw new Error("Не удалось загрузить видеофон.");
          }
        }
      }
      if (!uploaded) {
        const { error: uploadError } = await createClient().storage
          .from(PRODUCT_VIDEO_EXPORT_BUCKET)
          .uploadToSignedUrl(
            started.signedUpload.path,
            started.signedUpload.token,
            uploadFile,
            { contentType: started.contentType, upsert: false },
          );
        if (uploadError) throw new Error("Не удалось загрузить видеофон.");
      }
      setBackgrounds((current) => ({
        ...current,
        [orientation]: {
          ...current[orientation],
          phase: "processing",
          uploadPercent: 99,
        },
      }));
      const finalize = await fetch(
        `/api/author/products/${id}/video-backgrounds/${orientation}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upload_path: uploadPath,
            file_size: file.size,
          }),
        },
      );
      const finalized = (await finalize.json()) as {
        previewUrl?: string | null;
        posterUrl?: string | null;
        error?: string;
      };
      if (!finalize.ok) {
        const message =
          finalized.error === "invalid_video_background"
            ? "Видеофон повреждён, длится больше 60 секунд или имеет слишком большое разрешение."
            : finalized.error === "video_background_upload_incomplete"
              ? "Загрузка видеофона не завершилась. Попробуйте ещё раз."
              : "Не удалось проверить видеофон.";
        uploadPath = null;
        throw new Error(message);
      }
      uploadPath = null;
      setBackgrounds((current) => ({
        ...current,
        [orientation]: {
          hasBackground: true,
          previewUrl: finalized.previewUrl ?? null,
          posterUrl: finalized.posterUrl ?? null,
          busy: false,
          phase: "idle",
          uploadPercent: null,
          error: null,
        },
      }));
      await loadRenderStates();
    } catch (error) {
      if (uploadPath && uploadPracticeId) {
        void fetch(
          `/api/author/products/${uploadPracticeId}/video-backgrounds/${orientation}?uploadPath=${encodeURIComponent(uploadPath)}`,
          { method: "DELETE" },
        );
      }
      setBackgrounds((current) => ({
        ...current,
        [orientation]: {
          ...current[orientation],
          busy: false,
          phase: "idle",
          uploadPercent: null,
          error:
            error instanceof Error
              ? error.message
              : "Не удалось загрузить видеофон.",
        },
      }));
    }
  }

  async function deleteBackground(orientation: ProductVideoOrientation) {
    if (!resolvedPracticeId) return;
    setBackgrounds((current) => ({
      ...current,
      [orientation]: {
        ...current[orientation],
        busy: true,
        error: null,
      },
    }));
    try {
      const response = await fetch(
        `/api/author/products/${resolvedPracticeId}/video-backgrounds/${orientation}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Не удалось удалить видеофон.");
      setBackgrounds((current) => ({
        ...current,
        [orientation]: EMPTY_BACKGROUND,
      }));
      await loadRenderStates();
    } catch (error) {
      setBackgrounds((current) => ({
        ...current,
        [orientation]: {
          ...current[orientation],
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : "Не удалось удалить видеофон.",
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
          payload.error === "video_visual_required"
            ? "Загрузите обложку или видеофон для выбранного формата."
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

  return (
    <section
      className="mt-5 mb-6 overflow-hidden rounded-[20px] border border-[#eadff8] bg-[#fcfbfe]"
      data-author-product-video-export="true"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        data-testid="author-product-video-export-toggle"
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <span className="min-w-0 text-[15px] font-semibold text-[#7042c5]">
          Видео для площадок
        </span>
        <VideoPlatformChevron expanded={expanded} />
        <span className="sr-only">
          {expanded ? "Свернуть блок видео" : "Развернуть блок видео"}
        </span>
      </button>

      <div
        id={panelId}
        data-testid="author-product-video-export-body"
        hidden={!expanded}
        inert={!expanded}
        className="space-y-5 border-t border-[#eadff8] p-4"
      >
        <p className="text-sm leading-5 text-[#7d70a2]">
          Для каждого формата можно использовать обложку, короткий видеофон
          или оба материала. Видеофон зациклится под ваше аудио.
        </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {PRODUCT_VIDEO_ORIENTATIONS.map((orientation) => {
          const meta = PRODUCT_VIDEO_ORIENTATION_META[orientation];
          const cover = covers[orientation];
          const background = backgrounds[orientation];
          const inputRef =
            orientation === "landscape_16_9"
              ? landscapeInputRef
              : portraitInputRef;
          const backgroundInputRef =
            orientation === "landscape_16_9"
              ? landscapeBackgroundInputRef
              : portraitBackgroundInputRef;
          return (
            <div
              key={orientation}
              className="rounded-[18px] border border-[#eadff8] bg-white p-4"
            >
              <p className="text-sm font-medium text-[#3f3560]">
                {meta.coverLabel.replace("Видеообложка", "Обложка")}
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
                    Нет обложки {meta.ratioLabel}
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

              <div className="mt-5 border-t border-[#eee6f7] pt-4">
                <p className="text-sm font-medium text-[#3f3560]">
                  Видеофон {meta.ratioLabel}
                </p>
                <div
                  className={`mt-3 overflow-hidden rounded-[16px] border border-[#d9c9ef] bg-[#181228] ${
                    orientation === "landscape_16_9"
                      ? "aspect-video w-full max-w-sm"
                      : "aspect-[9/16] h-48"
                  }`}
                >
                  {background.previewUrl ? (
                    <video
                      src={background.previewUrl}
                      poster={background.posterUrl ?? undefined}
                      controls
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[#cbbbe2]">
                      Нет видеофона {meta.ratioLabel}
                    </div>
                  )}
                </div>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                  className="sr-only"
                  disabled={disabled || background.busy}
                  onChange={(event) =>
                    void uploadBackground(orientation, event)
                  }
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabled || background.busy}
                    onClick={() => backgroundInputRef.current?.click()}
                    className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
                  >
                    {background.busy
                      ? background.phase === "processing"
                        ? "Проверяем видео…"
                        : `Загрузка${
                            background.uploadPercent == null
                              ? "…"
                              : ` ${background.uploadPercent}%`
                          }`
                      : background.hasBackground
                        ? "Заменить видеофон"
                        : "Загрузить видеофон"}
                  </button>
                  {background.hasBackground ? (
                    <button
                      type="button"
                      disabled={disabled || background.busy}
                      onClick={() => void deleteBackground(orientation)}
                      className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7d70a2] disabled:opacity-60"
                    >
                      Удалить
                    </button>
                  ) : null}
                </div>
                {background.busy &&
                background.uploadPercent != null ? (
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-full bg-[#efe8f8]"
                    role="progressbar"
                    aria-label="Загрузка видеофона"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={background.uploadPercent}
                  >
                    <div
                      className="h-full rounded-full bg-[#7042c5] motion-safe:transition-[width] motion-safe:duration-300"
                      style={{ width: `${background.uploadPercent}%` }}
                    />
                  </div>
                ) : null}
                <p className="mt-3 text-xs leading-5 text-[#7d70a2]">
                  MP4, MOV или WebM, до 200 МБ и 60 секунд. Звук видеофона
                  будет отключён.
                </p>
                {background.error ? (
                  <p className="mt-2 text-sm text-[#9b3d3d]">
                    {background.error}
                  </p>
                ) : null}
              </div>
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
                    const hasVisual =
                      covers[orientation].hasCover ||
                      backgrounds[orientation].hasBackground;
                    const blockedReason = !playable
                      ? item.audio_prepare_status === "queued" ||
                        item.audio_prepare_status === "processing"
                        ? "Аудио обрабатывается. Создание видео станет доступно, когда обработка завершится."
                        : "Нет готового аудио. Загрузите аудиофайл и дождитесь завершения обработки."
                      : active
                        ? "Видео уже создаётся. Дождитесь завершения."
                        : renderBusy[renderKey]
                          ? "Задание добавляется в очередь."
                          : disabled
                            ? disabledReason ||
                              "Создание видео временно недоступно для этого продукта."
                            : covers[orientation].busy
                              ? "Видеообложка загружается. Дождитесь завершения."
                              : backgrounds[orientation].busy
                                ? "Видеофон загружается. Дождитесь завершения."
                                : !hasVisual
                                  ? covers[orientation].error ||
                                    backgrounds[orientation].error ||
                                    `Сначала загрузите обложку или видеофон ${meta.ratioLabel}.`
                                  : null;
                    const canCreate = blockedReason === null;
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
                        {currentReady && resolvedPracticeId ? (
                          <video
                            src={`/api/author/products/${resolvedPracticeId}/video/${item.id}/playback?orientation=${orientation}`}
                            poster={
                              covers[orientation].previewUrl ??
                              backgrounds[orientation].posterUrl ??
                              undefined
                            }
                            controls
                            playsInline
                            preload="metadata"
                            className={`mt-3 rounded-[14px] bg-[#181228] object-cover ${
                              orientation === "landscape_16_9"
                                ? "aspect-video w-full"
                                : "aspect-[9/16] h-64"
                            }`}
                          />
                        ) : null}
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
                        {blockedReason ? (
                          <p className="mt-2 text-xs text-[#7d70a2]">
                            {blockedReason}
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
      </div>
    </section>
  );
}
