"use client";

import { useCallback, useRef, useState } from "react";

import { ResponsiveCoverImage } from "@/components/images/ResponsiveImage";
import {
  CATALOG_GALLERY_MAX_SLIDES,
  validateGallerySlideFile,
} from "@/lib/author-products/gallery-validation-client";
import {
  getAuthorGalleryErrorMessage,
  type AuthorGallerySlide,
} from "@/lib/author-products/gallery-shared";
import type { ImageManifest } from "@/lib/images/image-types";
import { buildProductCoverResponsiveProps } from "@/lib/products/cover-display";

type AuthorProductGalleryProps = {
  practiceId: string | null;
  initialSlides?: AuthorGallerySlide[];
  getPracticeId: () => Promise<string | null>;
  disabled?: boolean;
};

function SquarePreview({
  src,
  alt,
  manifest,
  srcSet,
  sizes,
}: {
  src: string | null;
  alt: string;
  manifest?: ImageManifest | null;
  srcSet?: string | null;
  sizes?: string;
}) {
  if (!src) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-[18px] border border-[#d9c9ef] bg-[#f8f4fc] text-center text-[11px] leading-4 text-[#8c79b6]">
        Слайд
      </div>
    );
  }

  if (manifest) {
    return (
      <div className="h-20 w-20 overflow-hidden rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff]">
        <ResponsiveCoverImage
          src={src}
          alt={alt}
          className="block h-full w-full object-cover"
          manifest={manifest}
          srcSet={srcSet}
          sizes={sizes}
          displayWidth={80}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className="h-20 w-20 overflow-hidden rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="block h-full w-full object-cover"
        draggable={false}
      />
    </div>
  );
}

export default function AuthorProductGallery({
  practiceId,
  initialSlides = [],
  getPracticeId,
  disabled = false,
}: AuthorProductGalleryProps) {
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [slides, setSlides] = useState<AuthorGallerySlide[]>(initialSlides);
  const [uploading, setUploading] = useState(false);
  const [busySlideId, setBusySlideId] = useState<string | null>(null);
  const [replaceSlideId, setReplaceSlideId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySlides = useCallback((next: AuthorGallerySlide[]) => {
    setSlides(next);
    setError(null);
  }, []);

  const openAddPicker = useCallback(() => {
    if (disabled || uploading || slides.length >= CATALOG_GALLERY_MAX_SLIDES) {
      return;
    }

    addInputRef.current?.click();
  }, [disabled, slides.length, uploading]);

  const openReplacePicker = useCallback(
    (slideId: string) => {
      if (disabled || uploading || busySlideId) {
        return;
      }

      setReplaceSlideId(slideId);
      replaceInputRef.current?.click();
    },
    [busySlideId, disabled, uploading],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);

      const validationError = await validateGallerySlideFile(file);

      if (validationError) {
        setError(validationError);
        setUploading(false);
        return;
      }

      try {
        const id = await getPracticeId();

        if (!id) {
          setError("Не удалось загрузить слайд галереи.");
          return;
        }

        const formData = new FormData();
        formData.set("file", file);

        const response = await fetch(`/api/author/products/${id}/gallery`, {
          method: "POST",
          body: formData,
        });

        if (response.status === 413) {
          setError("Размер изображения не должен превышать 3 МБ.");
          return;
        }

        const payload = (await response.json()) as {
          slides?: AuthorGallerySlide[];
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          setError(
            payload.message || getAuthorGalleryErrorMessage(payload.error),
          );
          return;
        }

        applySlides(payload.slides ?? []);
      } catch {
        setError("Не удалось загрузить слайд галереи.");
      } finally {
        setUploading(false);
      }
    },
    [applySlides, getPracticeId],
  );

  const replaceFile = useCallback(
    async (slideId: string, file: File) => {
      setBusySlideId(slideId);
      setError(null);

      const validationError = await validateGallerySlideFile(file);

      if (validationError) {
        setError(validationError);
        setBusySlideId(null);
        return;
      }

      try {
        const id = await getPracticeId();

        if (!id) {
          setError("Не удалось заменить слайд.");
          return;
        }

        const formData = new FormData();
        formData.set("file", file);

        const response = await fetch(
          `/api/author/products/${id}/gallery/${slideId}`,
          {
            method: "PATCH",
            body: formData,
          },
        );

        if (response.status === 413) {
          setError("Размер изображения не должен превышать 3 МБ.");
          return;
        }

        const payload = (await response.json()) as {
          slides?: AuthorGallerySlide[];
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          setError(
            payload.message || getAuthorGalleryErrorMessage(payload.error),
          );
          return;
        }

        applySlides(payload.slides ?? []);
      } catch {
        setError("Не удалось заменить слайд.");
      } finally {
        setBusySlideId(null);
      }
    },
    [applySlides, getPracticeId],
  );

  const persistOrder = useCallback(
    async (nextSlides: AuthorGallerySlide[]) => {
      const previous = slides;
      applySlides(nextSlides);
      setBusySlideId("reorder");

      try {
        const id = await getPracticeId();

        if (!id) {
          setSlides(previous);
          setError("Не удалось изменить порядок слайдов.");
          return;
        }

        const response = await fetch(
          `/api/author/products/${id}/gallery/reorder`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slides: nextSlides.map((slide, index) => ({
                id: slide.id,
                position: index,
              })),
            }),
          },
        );
        const payload = (await response.json()) as {
          slides?: AuthorGallerySlide[];
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          setSlides(previous);
          setError(
            payload.message || getAuthorGalleryErrorMessage(payload.error),
          );
          return;
        }

        applySlides(payload.slides ?? nextSlides);
      } catch {
        setSlides(previous);
        setError("Не удалось изменить порядок слайдов.");
      } finally {
        setBusySlideId(null);
      }
    },
    [applySlides, getPracticeId, slides],
  );

  const handleAddChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (file) {
        void uploadFile(file);
      }
    },
    [uploadFile],
  );

  const handleReplaceChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      const slideId = replaceSlideId;
      event.target.value = "";
      setReplaceSlideId(null);

      if (file && slideId) {
        void replaceFile(slideId, file);
      }
    },
    [replaceFile, replaceSlideId],
  );

  const deleteSlide = useCallback(
    async (slideId: string) => {
      if (!window.confirm("Удалить слайд из галереи?")) {
        return;
      }

      setBusySlideId(slideId);
      setError(null);

      try {
        const id = await getPracticeId();

        if (!id) {
          setError("Не удалось удалить слайд.");
          return;
        }

        const response = await fetch(
          `/api/author/products/${id}/gallery/${slideId}`,
          { method: "DELETE" },
        );
        const payload = (await response.json()) as {
          slides?: AuthorGallerySlide[];
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          setError(
            payload.message || getAuthorGalleryErrorMessage(payload.error),
          );
          return;
        }

        applySlides(payload.slides ?? []);
      } catch {
        setError("Не удалось удалить слайд.");
      } finally {
        setBusySlideId(null);
      }
    },
    [applySlides, getPracticeId],
  );

  const atLimit = slides.length >= CATALOG_GALLERY_MAX_SLIDES;
  const isBusy = uploading || Boolean(busySlideId);

  return (
    <section
      data-author-product-gallery
      data-author-product-gallery-id={practiceId ?? ""}
    >
      <span className="mb-2 block text-sm font-medium">Галерея продукта</span>
      <p className="mb-4 text-sm leading-5 text-[#7d70a2]">
        Дополнительные квадратные слайды для карточки в каталоге. Обложка
        задаётся выше и здесь не меняется. JPG, PNG или WebP · 1:1 · от 400 ×
        400 px · до 3 МБ · не больше {CATALOG_GALLERY_MAX_SLIDES} слайдов.
        Перетащите слайд, чтобы изменить порядок.
      </p>

      <div className="space-y-3">
        {slides.map((slide, index) => {
          const slidePreview = buildProductCoverResponsiveProps(
            slide.image_url,
            slide.image_manifest,
            slide.created_at,
            80,
          );
          const isDragging = draggingId === slide.id;
          const isDropTarget = dragOverId === slide.id && draggingId !== slide.id;

          return (
            <div
              key={slide.id}
              data-author-gallery-slide={slide.id}
              draggable={!disabled && !isBusy}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", slide.id);
                draggingIdRef.current = slide.id;
                setDraggingId(slide.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverId(slide.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const fromId = draggingIdRef.current ?? draggingId;
                draggingIdRef.current = null;
                setDraggingId(null);
                setDragOverId(null);

                if (!fromId || fromId === slide.id) {
                  return;
                }

                const fromIndex = slides.findIndex((item) => item.id === fromId);
                const toIndex = slides.findIndex((item) => item.id === slide.id);

                if (fromIndex < 0 || toIndex < 0) {
                  return;
                }

                const next = [...slides];
                const [moved] = next.splice(fromIndex, 1);
                next.splice(toIndex, 0, moved);
                void persistOrder(
                  next.map((item, nextIndex) => ({
                    ...item,
                    position: nextIndex,
                  })),
                );
              }}
              onDragEnd={() => {
                draggingIdRef.current = null;
                setDraggingId(null);
                setDragOverId(null);
              }}
              className={`flex items-center gap-3 rounded-[18px] border px-3 py-3 ${
                isDropTarget
                  ? "border-[#9a74d8] bg-[#f8f4ff]"
                  : "border-[#e4d7f4]"
              } ${isDragging ? "opacity-60" : ""} ${
                disabled || isBusy ? "cursor-default" : "cursor-grab"
              }`}
            >
              <SquarePreview
                src={slidePreview.src ?? slide.image_url}
                alt={slide.alt || `Слайд ${index + 1}`}
                manifest={slidePreview.manifest}
                srcSet={slidePreview.srcSet}
                sizes={slidePreview.sizes}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#3f3560]">
                  Слайд {index + 1}
                </p>
                <p className="mt-1 text-xs text-[#7d70a2]">
                  {index + 1} из {slides.length}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openReplacePicker(slide.id)}
                  disabled={disabled || isBusy}
                  className="rounded-full border border-[#c6afe6] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busySlideId === slide.id ? "…" : "Заменить"}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSlide(slide.id)}
                  disabled={disabled || isBusy}
                  className="rounded-full border border-[#e4d7f4] px-3 py-1.5 text-xs font-semibold text-[#7d70a2] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Удалить
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openAddPicker}
          disabled={disabled || uploading || atLimit}
          className="inline-flex cursor-pointer rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] transition-colors hover:border-[#bda6e1] hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading
            ? "Загрузка…"
            : atLimit
              ? "Достигнут лимит 30 слайдов"
              : "Добавить слайд"}
        </button>
        <span className="text-sm text-[#7d70a2]">
          {slides.length} / {CATALOG_GALLERY_MAX_SLIDES}
        </span>
      </div>

      <input
        ref={addInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleAddChange}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleReplaceChange}
      />

      {error ? (
        <p className="mt-3 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
