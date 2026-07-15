"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AudioDragHandle } from "@/components/author-dashboard/AudioDragHandle";
import { useAudioItemsReorder } from "@/components/author-dashboard/useAudioItemsReorder";
import type {
  AuthorProductDetail,
  AuthorWorkspace,
  AudioItemRow,
} from "@/lib/author-products/types";
import {
  PAID_PRICE_OPTIONS,
  PRODUCT_FORMATS,
} from "@/lib/author-products/types";
import {
  MAX_COVER_BYTES,
  PRODUCT_CONTENT_LIMITS,
  getAudioUploadErrorMessage,
  getProductFieldErrorMessage,
  getProductFieldKeyForError,
  validateMp3FileClient,
} from "@/lib/author-products/limits";
import { buildPracticePublicPath } from "@/lib/author-products/utils";

const MIN_COVER_DIMENSION = 1000;
const ALLOWED_COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function CharCounter({ value, max }: { value: string; max: number }) {
  return (
    <p className="mt-1 text-right text-xs text-[#7d70a2]">
      {value.length} / {max}
    </p>
  );
}

function CoverPlaceholderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="5"
        width="16"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path
        d="m5 17 4.5-4.5a1 1 0 0 1 1.4 0L15 17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 14.5 15.5 12a1 1 0 0 1 1.4 0L19 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoverPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-[#d9c9ef] bg-[#f8f4fc] px-2 text-center">
      <span className="text-[#9a86c4]">
        <CoverPlaceholderIcon />
      </span>
      <span className="text-xs text-[#8c79b6]">Нет обложки</span>
    </div>
  );
}

function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image_decode_failed"));
    };

    image.src = objectUrl;
  });
}

async function validateCoverFile(file: File): Promise<string | null> {
  const fileName = file.name.trim().toLowerCase();
  const hasAllowedExtension =
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".webp");

  if (!ALLOWED_COVER_MIME_TYPES.has(file.type.trim().toLowerCase()) || !hasAllowedExtension) {
    return "Загрузите обложку в формате JPG, PNG или WebP.";
  }

  if (file.size > MAX_COVER_BYTES) {
    return "Размер обложки не должен превышать 3 МБ.";
  }

  try {
    const { width, height } = await readImageDimensions(file);

    if (width < MIN_COVER_DIMENSION || height < MIN_COVER_DIMENSION) {
      return "Минимальный размер обложки — 1000 × 1000 пикселей.";
    }

    if (width !== height) {
      return "Обложка должна быть квадратной — соотношение сторон 1:1.";
    }
  } catch {
    return "Не удалось прочитать изображение. Проверьте файл и попробуйте снова.";
  }

  return null;
}

function buildCoverDisplayUrl(
  coverUrl: string | null,
  version: string | null,
): string | null {
  if (!coverUrl) {
    return null;
  }

  if (!version) {
    return coverUrl;
  }

  const separator = coverUrl.includes("?") ? "&" : "?";

  return `${coverUrl}${separator}v=${encodeURIComponent(version)}`;
}

type AuthorProductFormProps = {
  authors: AuthorWorkspace[];
  initialAuthorSlug?: string;
  initialProduct?: AuthorProductDetail;
  mode: "create" | "edit";
};

type FormState = {
  authorId: string;
  title: string;
  subtitle: string;
  description: string;
  format: string;
  slug: string;
  isFree: boolean;
  price: number;
  coverUrl: string | null;
  coverVersion: string | null;
  status: string;
  publishedAt: string | null;
};

function formatDurationLong(seconds: number | null): string {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes} мин ${secs} сек`;
}

function formatFileSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);

  if (megabytes >= 0.1) {
    return `${megabytes.toLocaleString("ru-RU", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} МБ`;
  }

  const kilobytes = bytes / 1024;
  return `${kilobytes.toLocaleString("ru-RU", {
    maximumFractionDigits: 0,
  })} КБ`;
}

const AUDIO_PREVIEW_SOFT_ERROR =
  "Аудиофайл загружен, но предпрослушивание пока недоступно. Обновите страницу.";

const AUDIO_TITLE_SAVE_ERROR =
  "MP3 загружен, но название аудио не удалось сохранить. Введите его вручную.";

const AUDIO_TITLE_TRUNCATED_NOTICE =
  "Название аудио сокращено до 100 символов. Вы можете отредактировать его вручную.";

function isDefaultAudioTitle(title: string, slotNumber: number): boolean {
  const trimmed = title.trim();

  if (!trimmed) {
    return true;
  }

  return trimmed === `Аудио ${slotNumber}`;
}

function deriveTitleFromFilename(fileName: string): {
  title: string;
  truncated: boolean;
} {
  const withoutExtension = fileName.trim().replace(/\.mp3$/i, "").trim();

  if (!withoutExtension) {
    return { title: "", truncated: false };
  }

  const limit = PRODUCT_CONTENT_LIMITS.audioTitle;

  if (withoutExtension.length <= limit) {
    return { title: withoutExtension, truncated: false };
  }

  const slice = withoutExtension.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  const title =
    lastSpace > 0
      ? slice.slice(0, lastSpace).trimEnd()
      : slice;

  return {
    title: title || slice,
    truncated: true,
  };
}

function buildInitialForm(
  authors: AuthorWorkspace[],
  initialAuthorSlug: string | undefined,
  initialProduct: AuthorProductDetail | undefined,
): FormState {
  if (initialProduct) {
    const practice = initialProduct.practice;

    return {
      authorId: practice.author_id,
      title: practice.title,
      subtitle: practice.subtitle ?? "",
      description: practice.description ?? "",
      format: practice.format ?? "",
      slug: practice.slug,
      isFree: practice.is_free,
      price: practice.is_free ? 99 : practice.price,
      coverUrl: practice.cover_url,
      coverVersion: practice.cover_url ? practice.updated_at : null,
      status: practice.status,
      publishedAt: practice.published_at,
    };
  }

  const author =
    authors.find((item) => item.slug === initialAuthorSlug) ?? authors[0];

  return {
    authorId: author?.id ?? "",
    title: "",
    subtitle: "",
    description: "",
    format: "",
    slug: "",
    isFree: true,
    price: 99,
    coverUrl: null,
    coverVersion: null,
    status: "draft",
    publishedAt: null,
  };
}

export default function AuthorProductForm({
  authors,
  initialAuthorSlug,
  initialProduct,
  mode,
}: AuthorProductFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm(authors, initialAuthorSlug, initialProduct),
  );
  const [audioItems, setAudioItems] = useState<AudioItemRow[]>(
    initialProduct?.audio_items ?? [
      {
        id: "temp-1",
        practice_id: "temp",
        title: "Аудио 1",
        description: null,
        audio_path: null,
        duration_seconds: null,
        original_file_name: null,
        file_size_bytes: null,
        position: 1,
        is_preview: false,
        status: "draft",
        created_at: "",
        updated_at: "",
      },
    ],
  );
  const [practiceId, setPracticeId] = useState(initialProduct?.practice.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingAudioId, setUploadingAudioId] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [deletingCover, setDeletingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverDisplayError, setCoverDisplayError] = useState<string | null>(
    null,
  );
  const [coverPreviewFailureKey, setCoverPreviewFailureKey] = useState<
    string | null
  >(null);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    subtitle?: string;
    description?: string;
  }>({});
  const [audioFieldErrors, setAudioFieldErrors] = useState<
    Record<string, { title?: string; description?: string }>
  >({});
  const [audioUploadErrors, setAudioUploadErrors] = useState<
    Record<string, string>
  >({});
  const [audioTitleNotices, setAudioTitleNotices] = useState<
    Record<string, string>
  >({});
  const [audioPreviewUrls, setAudioPreviewUrls] = useState<
    Record<string, string>
  >({});
  const [audioPreviewLoading, setAudioPreviewLoading] = useState<
    Record<string, boolean>
  >({});
  const [audioPreviewErrors, setAudioPreviewErrors] = useState<
    Record<string, string>
  >({});
  const [audioPreviewVersions, setAudioPreviewVersions] = useState<
    Record<string, number>
  >({});
  const [deletingAudioFileId, setDeletingAudioFileId] = useState<string | null>(
    null,
  );
  const audioPreviewRequestIds = useRef<Record<string, number>>({});

  const {
    moveAudioItem,
    reorderNotice,
    reorderBusy,
    draggingAudioId,
    dragOverIndex,
    setItemElement,
    handleDragPointerDown,
    handleDragPointerMove,
    handleDragPointerUp,
    handleDragPointerCancel,
  } = useAudioItemsReorder({
    practiceId,
    audioItems,
    setAudioItems,
  });

  const loadAudioPreview = useCallback(
    async (targetPracticeId: string, audioId: string) => {
      const requestId = (audioPreviewRequestIds.current[audioId] ?? 0) + 1;
      audioPreviewRequestIds.current[audioId] = requestId;

      setAudioPreviewLoading((current) => ({ ...current, [audioId]: true }));
      setAudioPreviewErrors((current) => {
        const next = { ...current };
        delete next[audioId];
        return next;
      });
      setAudioPreviewUrls((current) => {
        const next = { ...current };
        delete next[audioId];
        return next;
      });

      try {
        const response = await fetch(
          `/api/author/products/${targetPracticeId}/audio/${audioId}/preview`,
        );
        const text = await response.text();
        let payload: { url?: string; error?: string } | null = null;

        if (text) {
          try {
            payload = JSON.parse(text) as { url?: string; error?: string };
          } catch {
            if (audioPreviewRequestIds.current[audioId] === requestId) {
              setAudioPreviewErrors((current) => ({
                ...current,
                [audioId]: AUDIO_PREVIEW_SOFT_ERROR,
              }));
            }
            return;
          }
        }

        if (audioPreviewRequestIds.current[audioId] !== requestId) {
          return;
        }

        if (!response.ok || !payload?.url) {
          setAudioPreviewErrors((current) => ({
            ...current,
            [audioId]: AUDIO_PREVIEW_SOFT_ERROR,
          }));
          return;
        }

        setAudioPreviewUrls((current) => ({
          ...current,
          [audioId]: payload.url!,
        }));
      } catch {
        if (audioPreviewRequestIds.current[audioId] === requestId) {
          setAudioPreviewErrors((current) => ({
            ...current,
            [audioId]: AUDIO_PREVIEW_SOFT_ERROR,
          }));
        }
      } finally {
        if (audioPreviewRequestIds.current[audioId] === requestId) {
          setAudioPreviewLoading((current) => ({ ...current, [audioId]: false }));
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!practiceId) {
      return;
    }

    const itemsToPreview = audioItems.filter(
      (item) => item.audio_path && !item.id.startsWith("temp-"),
    );

    if (itemsToPreview.length === 0) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      for (const item of itemsToPreview) {
        void loadAudioPreview(practiceId, item.id);
      }
    });

    return () => {
      cancelled = true;
    };
    // Initial preview load for existing MP3 on page open; upload/replace calls loadAudioPreview directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceId]);

  const slugLocked = form.status === "published" || Boolean(form.publishedAt);
  const publicPath = form.slug ? buildPracticePublicPath(form.slug) : "";

  const coverDisplaySrc = useMemo(
    () => buildCoverDisplayUrl(form.coverUrl, form.coverVersion),
    [form.coverUrl, form.coverVersion],
  );

  const coverPreviewKey = `${form.coverUrl ?? ""}:${form.coverVersion ?? ""}`;
  const coverPreviewFailed = coverPreviewFailureKey === coverPreviewKey;

  const showCoverPreview = Boolean(coverDisplaySrc) && !coverPreviewFailed;

  const selectedAuthor = useMemo(
    () => authors.find((author) => author.id === form.authorId) ?? null,
    [authors, form.authorId],
  );

  async function ensurePracticeId(): Promise<string | null> {
    if (practiceId) {
      return practiceId;
    }

    if (!form.authorId || !form.title.trim()) {
      setError("Укажите автора и название, чтобы сохранить черновик.");
      return null;
    }

    const response = await fetch("/api/author/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author_id: form.authorId,
        title: form.title.trim(),
      }),
    });

    const payload = (await response.json()) as {
      product?: AuthorProductDetail;
      error?: string;
    };

    if (!response.ok || !payload.product?.practice.id) {
      setError("Не удалось создать черновик.");
      return null;
    }

    const created = payload.product;
    setPracticeId(created.practice.id);
    setAudioItems(created.audio_items);
    setForm((current) => ({
      ...current,
      slug: created.practice.slug,
      status: created.practice.status,
    }));
    router.replace(`/author-dashboard/products/${created.practice.id}`);

    return created.practice.id;
  }

  async function saveProduct(): Promise<boolean> {
    setBusy(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});

    try {
      const id = await ensurePracticeId();

      if (!id) {
        return false;
      }

      const response = await fetch(`/api/author/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: form.authorId,
          title: form.title,
          subtitle: form.subtitle,
          description: form.description,
          format: form.format,
          slug: form.slug,
          is_free: form.isFree,
          price: form.isFree ? 0 : form.price,
        }),
      });

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        error?: string;
      };

      if (!response.ok || !payload.product) {
        const fieldMessage = payload.error
          ? getProductFieldErrorMessage(payload.error)
          : null;

        if (fieldMessage && payload.error) {
          const fieldKey = getProductFieldKeyForError(
            payload.error as
              | "title_too_long"
              | "subtitle_too_long"
              | "description_too_long"
              | "audio_title_too_long"
              | "audio_description_too_long",
          );

          if (
            fieldKey === "title" ||
            fieldKey === "subtitle" ||
            fieldKey === "description"
          ) {
            setFieldErrors({ [fieldKey]: fieldMessage });
            return false;
          }
        }

        setError("Не удалось сохранить аудиопродукт.");
        return false;
      }

      setForm(buildInitialForm(authors, initialAuthorSlug, payload.product));
      setAudioItems(payload.product.audio_items);
      setMessage("Изменения сохранены.");
      return true;
    } catch {
      setError("Не удалось сохранить аудиопродукт.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setError(null);
    setMessage(null);

    const saved = await saveProduct();

    if (saved) {
      setMessage("Черновик сохранён.");
    }
  }

  async function publishProduct() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const id = await ensurePracticeId();

      if (!id) {
        return;
      }

      await saveProduct();

      const response = await fetch(`/api/author/products/${id}/publish`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? "Не удалось опубликовать аудиопродукт.");
        return;
      }

      if (payload.product) {
        setForm(buildInitialForm(authors, initialAuthorSlug, payload.product));
        setAudioItems(payload.product.audio_items);
      }

      setMessage(payload.message ?? "Аудиопродукт опубликован.");
    } catch {
      setError("Не удалось опубликовать аудиопродукт.");
    } finally {
      setBusy(false);
    }
  }

  async function unpublishProduct() {
    if (!practiceId) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/author/products/${practiceId}/unpublish`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        message?: string;
      };

      if (!response.ok || !payload.product) {
        setError("Не удалось снять аудиопродукт с публикации.");
        return;
      }

      setForm(buildInitialForm(authors, initialAuthorSlug, payload.product));
      setAudioItems(payload.product.audio_items);
      setMessage(payload.message ?? "Аудиопродукт снят с публикации.");
    } catch {
      setError("Не удалось снять аудиопродукт с публикации.");
    } finally {
      setBusy(false);
    }
  }

  async function updateAudioItem(
    audioId: string,
    updates: { title?: string; description?: string },
  ): Promise<boolean> {
    if (!practiceId || audioId.startsWith("temp-")) {
      setAudioItems((items) =>
        items.map((item) =>
          item.id === audioId
            ? {
                ...item,
                title: updates.title ?? item.title,
                description:
                  updates.description !== undefined
                    ? updates.description || null
                    : item.description,
              }
            : item,
        ),
      );
      return true;
    }

    const response = await fetch(
      `/api/author/products/${practiceId}/audio/${audioId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );

    const payload = (await response.json()) as {
      product?: AuthorProductDetail;
      error?: string;
    };

    if (!response.ok) {
      const fieldMessage = payload.error
        ? getProductFieldErrorMessage(payload.error)
        : null;

      if (fieldMessage && payload.error) {
        const fieldKey = getProductFieldKeyForError(
          payload.error as
            | "title_too_long"
            | "subtitle_too_long"
            | "description_too_long"
            | "audio_title_too_long"
            | "audio_description_too_long",
        );

        if (fieldKey === "audioTitle" || fieldKey === "audioDescription") {
          setAudioFieldErrors((current) => ({
            ...current,
            [audioId]: {
              ...current[audioId],
              [fieldKey === "audioTitle" ? "title" : "description"]: fieldMessage,
            },
          }));
        }
      }

      return false;
    }

    if (payload.product) {
      setAudioItems(payload.product.audio_items);
      setAudioFieldErrors((current) => {
        const next = { ...current };
        delete next[audioId];
        return next;
      });
      return true;
    }

    return false;
  }

  async function autofillAudioTitleFromFile(
    audioId: string,
    file: File,
    currentTitle: string,
    slotNumber: number,
  ) {
    if (!isDefaultAudioTitle(currentTitle, slotNumber)) {
      return;
    }

    const derived = deriveTitleFromFilename(file.name);

    if (!derived.title) {
      return;
    }

    setAudioTitleNotices((current) => {
      const next = { ...current };
      delete next[audioId];
      return next;
    });
    setAudioItems((items) =>
      items.map((item) =>
        item.id === audioId ? { ...item, title: derived.title } : item,
      ),
    );

    try {
      const saved = await updateAudioItem(audioId, { title: derived.title });

      if (!saved) {
        setAudioTitleNotices((current) => ({
          ...current,
          [audioId]: AUDIO_TITLE_SAVE_ERROR,
        }));
        return;
      }

      if (derived.truncated) {
        setAudioTitleNotices((current) => ({
          ...current,
          [audioId]: AUDIO_TITLE_TRUNCATED_NOTICE,
        }));
      }
    } catch {
      setAudioTitleNotices((current) => ({
        ...current,
        [audioId]: AUDIO_TITLE_SAVE_ERROR,
      }));
    }
  }

  async function addAudioItem() {
    setBusy(true);
    setError(null);

    try {
      const id = await ensurePracticeId();

      if (!id) {
        return;
      }

      const response = await fetch(`/api/author/products/${id}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Аудио ${audioItems.length + 1}`,
        }),
      });

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
      };

      if (!response.ok || !payload.product) {
        setError("Не удалось добавить аудио.");
        return;
      }

      setAudioItems(payload.product.audio_items);
    } catch {
      setError("Не удалось добавить аудио.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAudioItem(audioId: string, hasFile: boolean) {
    if (audioItems.length <= 1) {
      setError("У продукта должно остаться хотя бы одно аудио.");
      return;
    }

    if (
      hasFile &&
      !window.confirm("Удалить это аудио вместе с загруженным файлом?")
    ) {
      return;
    }

    if (!practiceId || audioId.startsWith("temp-")) {
      setAudioItems((items) =>
        items
          .filter((item) => item.id !== audioId)
          .map((item, index) => ({ ...item, position: index + 1 })),
      );
      return;
    }

    const response = await fetch(
      `/api/author/products/${practiceId}/audio/${audioId}`,
      { method: "DELETE" },
    );

    const payload = (await response.json()) as {
      product?: AuthorProductDetail;
      message?: string;
    };

    if (!response.ok) {
      setError(payload.message ?? "Не удалось удалить аудио.");
      return;
    }

    if (payload.product) {
      setAudioItems(payload.product.audio_items);
    }
  }

  async function uploadCover(file: File) {
    setUploadingCover(true);
    setCoverError(null);
    setCoverDisplayError(null);
    setCoverPreviewFailureKey(null);

    const validationError = await validateCoverFile(file);

    if (validationError) {
      setCoverError(validationError);
      setUploadingCover(false);
      return;
    }

    try {
      const id = await ensurePracticeId();

      if (!id) {
        setCoverError("Не удалось загрузить обложку.");
        return;
      }

      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch(`/api/author/products/${id}/cover`, {
        method: "POST",
        body: formData,
      });

      let payload: {
        product?: AuthorProductDetail;
        cover_url?: string;
      } | null = null;

      if (response.status === 413) {
        setCoverError(
          "Файл слишком большой. Максимальный размер обложки — 3 МБ.",
        );
        return;
      }

      const responseText = await response.text();

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            product?: AuthorProductDetail;
            cover_url?: string;
          };
        } catch {
          if (!response.ok) {
            setCoverError("Не удалось загрузить обложку.");
            return;
          }
        }
      }

      if (!response.ok) {
        setCoverError("Не удалось загрузить обложку.");
        return;
      }

      if (payload?.product) {
        setForm(buildInitialForm(authors, initialAuthorSlug, payload.product));
        setAudioItems(payload.product.audio_items);
      } else if (payload?.cover_url) {
        setForm((current) => ({
          ...current,
          coverUrl: payload.cover_url ?? null,
          coverVersion: String(Date.now()),
        }));
      }

      setCoverError(null);
      setCoverDisplayError(null);
      setCoverPreviewFailureKey(null);
      setMessage("Обложка загружена.");
    } catch {
      setCoverError("Не удалось загрузить обложку.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function deleteCover() {
    if (!form.coverUrl) {
      return;
    }

    if (!window.confirm("Удалить обложку?")) {
      return;
    }

    setDeletingCover(true);
    setCoverError(null);
    setCoverDisplayError(null);

    try {
      const id = practiceId || (await ensurePracticeId());

      if (!id) {
        setCoverError("Не удалось удалить обложку.");
        return;
      }

      const response = await fetch(`/api/author/products/${id}/cover`, {
        method: "DELETE",
      });

      let payload: {
        product?: AuthorProductDetail;
        cover_url?: string | null;
      } | null = null;

      const responseText = await response.text();

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            product?: AuthorProductDetail;
            cover_url?: string | null;
          };
        } catch {
          if (!response.ok) {
            setCoverError("Не удалось удалить обложку.");
            return;
          }
        }
      }

      if (!response.ok) {
        setCoverError("Не удалось удалить обложку.");
        return;
      }

      if (payload?.product) {
        setForm(buildInitialForm(authors, initialAuthorSlug, payload.product));
        setAudioItems(payload.product.audio_items);
      } else {
        setForm((current) => ({
          ...current,
          coverUrl: null,
          coverVersion: null,
        }));
      }

      setCoverPreviewFailureKey(null);
      setCoverDisplayError(null);
      setCoverError(null);
      setMessage("Обложка удалена.");
    } catch {
      setCoverError("Не удалось удалить обложку.");
    } finally {
      setDeletingCover(false);
    }
  }

  async function uploadAudio(audioId: string, file: File) {
    const validationError = validateMp3FileClient(file);

    if (validationError) {
      setAudioUploadErrors((current) => ({
        ...current,
        [audioId]: validationError,
      }));
      return;
    }

    setUploadingAudioId(audioId);
    setAudioUploadErrors((current) => {
      const next = { ...current };
      delete next[audioId];
      return next;
    });
    setAudioPreviewUrls((current) => {
      const next = { ...current };
      delete next[audioId];
      return next;
    });
    setAudioPreviewErrors((current) => {
      const next = { ...current };
      delete next[audioId];
      return next;
    });

    const slotNumber = audioItems.findIndex((item) => item.id === audioId) + 1;
    const currentTitle = audioItems.find((item) => item.id === audioId)?.title ?? "";

    try {
      const id = await ensurePracticeId();

      if (!id) {
        setAudioUploadErrors((current) => ({
          ...current,
          [audioId]: "Не удалось загрузить MP3.",
        }));
        return;
      }

      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch(
        `/api/author/products/${id}/audio/${audioId}/upload`,
        {
          method: "POST",
          body: formData,
        },
      );

      const text = await response.text();
      let payload: {
        product?: AuthorProductDetail;
        error?: string;
      } | null = null;

      if (text) {
        try {
          payload = JSON.parse(text) as {
            product?: AuthorProductDetail;
            error?: string;
          };
        } catch {
          setAudioUploadErrors((current) => ({
            ...current,
            [audioId]: getAudioUploadErrorMessage(undefined, response.status),
          }));
          return;
        }
      }

      if (!response.ok || !payload?.product) {
        setAudioUploadErrors((current) => ({
          ...current,
          [audioId]: getAudioUploadErrorMessage(payload?.error, response.status),
        }));
        return;
      }

      setForm(buildInitialForm(authors, initialAuthorSlug, payload.product));
      setAudioItems(payload.product.audio_items);
      setAudioPreviewVersions((current) => ({
        ...current,
        [audioId]: (current[audioId] ?? 0) + 1,
      }));
      setMessage("Аудио загружено.");
      void loadAudioPreview(id, audioId);
      await autofillAudioTitleFromFile(audioId, file, currentTitle, slotNumber);
    } catch {
      setAudioUploadErrors((current) => ({
        ...current,
        [audioId]: "Не удалось загрузить MP3.",
      }));
    } finally {
      setUploadingAudioId(null);
    }
  }

  async function deleteAudioFile(audioId: string) {
    if (!window.confirm("Удалить MP3?")) {
      return;
    }

    setDeletingAudioFileId(audioId);
    setAudioUploadErrors((current) => {
      const next = { ...current };
      delete next[audioId];
      return next;
    });

    try {
      const id = practiceId || (await ensurePracticeId());

      if (!id) {
        setAudioUploadErrors((current) => ({
          ...current,
          [audioId]: "Не удалось удалить MP3.",
        }));
        return;
      }

      const response = await fetch(
        `/api/author/products/${id}/audio/${audioId}/file`,
        {
          method: "DELETE",
        },
      );

      const text = await response.text();
      let payload: { product?: AuthorProductDetail; error?: string } | null =
        null;

      if (text) {
        try {
          payload = JSON.parse(text) as {
            product?: AuthorProductDetail;
            error?: string;
          };
        } catch {
          setAudioUploadErrors((current) => ({
            ...current,
            [audioId]: "Не удалось удалить MP3.",
          }));
          return;
        }
      }

      if (!response.ok || !payload?.product) {
        setAudioUploadErrors((current) => ({
          ...current,
          [audioId]: "Не удалось удалить MP3.",
        }));
        return;
      }

      setForm(buildInitialForm(authors, initialAuthorSlug, payload.product));
      setAudioItems(payload.product.audio_items);
      setAudioPreviewUrls((current) => {
        const next = { ...current };
        delete next[audioId];
        return next;
      });
      setAudioPreviewErrors((current) => {
        const next = { ...current };
        delete next[audioId];
        return next;
      });
      setAudioPreviewVersions((current) => {
        const next = { ...current };
        delete next[audioId];
        return next;
      });
      delete audioPreviewRequestIds.current[audioId];
      setMessage("MP3 удалён.");
    } catch {
      setAudioUploadErrors((current) => ({
        ...current,
        [audioId]: "Не удалось удалить MP3.",
      }));
    } finally {
      setDeletingAudioFileId(null);
    }
  }

  return (
    <div className="space-y-8">
      {message ? (
        <p className="rounded-[18px] border border-[#d7ebdf] bg-[#f3fbf6] px-4 py-3 text-sm text-[#2f7a55]">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {error}
        </p>
      ) : null}

      <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-[20px] font-semibold">Основная информация</h2>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Автор</span>
          <select
            value={form.authorId}
            disabled={slugLocked}
            onChange={(event) =>
              setForm((current) => ({ ...current, authorId: event.target.value }))
            }
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-[#f7f2fc]"
          >
            {authors.map((author) => (
              <option key={author.id} value={author.id}>
                {author.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Название</span>
          <input
            value={form.title}
            maxLength={PRODUCT_CONTENT_LIMITS.title}
            onChange={(event) => {
              setFieldErrors((current) => ({ ...current, title: undefined }));
              setForm((current) => ({ ...current, title: event.target.value }));
            }}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            placeholder="Название аудиопродукта"
          />
          <CharCounter value={form.title} max={PRODUCT_CONTENT_LIMITS.title} />
          {fieldErrors.title ? (
            <p className="mt-2 text-sm text-[#9b3d3d]">{fieldErrors.title}</p>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Подзаголовок</span>
          <input
            value={form.subtitle}
            maxLength={PRODUCT_CONTENT_LIMITS.subtitle}
            onChange={(event) => {
              setFieldErrors((current) => ({ ...current, subtitle: undefined }));
              setForm((current) => ({ ...current, subtitle: event.target.value }));
            }}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
          />
          <CharCounter
            value={form.subtitle}
            max={PRODUCT_CONTENT_LIMITS.subtitle}
          />
          {fieldErrors.subtitle ? (
            <p className="mt-2 text-sm text-[#9b3d3d]">{fieldErrors.subtitle}</p>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Описание</span>
          <textarea
            value={form.description}
            maxLength={PRODUCT_CONTENT_LIMITS.description}
            onChange={(event) => {
              setFieldErrors((current) => ({
                ...current,
                description: undefined,
              }));
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }));
            }}
            rows={5}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
          />
          <CharCounter
            value={form.description}
            max={PRODUCT_CONTENT_LIMITS.description}
          />
          {fieldErrors.description ? (
            <p className="mt-2 text-sm text-[#9b3d3d]">
              {fieldErrors.description}
            </p>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Публичный формат</span>
          <select
            value={form.format}
            onChange={(event) =>
              setForm((current) => ({ ...current, format: event.target.value }))
            }
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
          >
            <option value="">Выберите формат</option>
            {PRODUCT_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="mb-2 block text-sm font-medium">Адрес продукта</span>
          {slugLocked ? (
            <p className="rounded-[18px] border border-[#e4d7f4] bg-[#fbf8ff] px-4 py-3 text-sm">
              {publicPath}
            </p>
          ) : (
            <input
              value={form.slug}
              onChange={(event) =>
                setForm((current) => ({ ...current, slug: event.target.value }))
              }
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
              placeholder="Адрес создастся автоматически из названия"
            />
          )}
          {publicPath ? (
            <p className="mt-2 text-xs text-[#7d70a2]">Публичный адрес: {publicPath}</p>
          ) : null}
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium">Обложка</span>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="aspect-square h-28 w-28 shrink-0 overflow-hidden rounded-[18px]">
              {showCoverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverDisplaySrc ?? undefined}
                  alt=""
                  className="block h-full w-full object-contain"
                  onLoad={() => {
                    setCoverPreviewFailureKey(null);
                    setCoverDisplayError(null);
                  }}
                  onError={() => {
                    setCoverPreviewFailureKey(coverPreviewKey);
                    setCoverDisplayError(
                      "Не удалось отобразить обложку. Попробуйте загрузить файл ещё раз.",
                    );
                  }}
                />
              ) : (
                <CoverPlaceholder />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]">
                  {uploadingCover ? "Загрузка…" : "Загрузить обложку"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void uploadCover(file);
                      }
                    }}
                  />
                </label>
                {form.coverUrl ? (
                  <button
                    type="button"
                    onClick={() => void deleteCover()}
                    disabled={deletingCover || uploadingCover}
                    className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7d70a2] disabled:opacity-60"
                  >
                    {deletingCover ? "Удаление…" : "Удалить обложку"}
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-5 text-[#7d70a2]">
                Квадратная обложка от 1000 × 1000 px · JPG, PNG или WebP · до
                3 МБ
              </p>
            </div>
          </div>
          {coverDisplayError ? (
            <p className="mt-3 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
              {coverDisplayError}
            </p>
          ) : null}
          {coverError ? (
            <p className="mt-3 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
              {coverError}
            </p>
          ) : null}
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium">Цена</span>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, isFree: true }))}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                form.isFree
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#c6afe6] text-[#7042c5]"
              }`}
            >
              Бесплатно
            </button>
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({ ...current, isFree: false, price: 99 }))
              }
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                !form.isFree
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#c6afe6] text-[#7042c5]"
              }`}
            >
              Платно
            </button>
          </div>

          {!form.isFree ? (
            <select
              value={form.price}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  price: Number(event.target.value),
                }))
              }
              className="mt-3 w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            >
              {PAID_PRICE_OPTIONS.map((price) => (
                <option key={price} value={price}>
                  {price.toLocaleString("ru-RU")} ₽
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[20px] font-semibold">Содержание аудиопродукта</h2>
          <button
            type="button"
            onClick={() => void addAudioItem()}
            className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
          >
            Добавить аудио
          </button>
        </div>

        {reorderNotice ? (
          <p className="text-sm text-[#9b3d3d]">{reorderNotice}</p>
        ) : null}

        <div className="space-y-4">
          {audioItems.map((audioItem, index) => (
            <article
              key={audioItem.id}
              ref={(element) => setItemElement(audioItem.id, element)}
              className={`rounded-[20px] border bg-[#fbf8ff] p-4 transition ${
                draggingAudioId === audioItem.id
                  ? "border-[#9a74d8] opacity-70 shadow-sm"
                  : dragOverIndex === index && draggingAudioId
                    ? "border-[#9a74d8] ring-2 ring-[#d9c9ef]"
                    : "border-[#eee6f7]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <AudioDragHandle
                    disabled={reorderBusy}
                    isDragging={draggingAudioId === audioItem.id}
                    onPointerDown={(event) =>
                      handleDragPointerDown(audioItem.id, event)
                    }
                    onPointerMove={handleDragPointerMove}
                    onPointerUp={handleDragPointerUp}
                    onPointerCancel={handleDragPointerCancel}
                  />
                  <h3 className="font-semibold">Аудио {index + 1}</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={index === 0 || reorderBusy}
                    onClick={() => void moveAudioItem(audioItem.id, "up")}
                    className="rounded-full border border-[#d9c9ef] px-3 py-1 text-sm disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={
                      index === audioItems.length - 1 || reorderBusy
                    }
                    onClick={() => void moveAudioItem(audioItem.id, "down")}
                    className="rounded-full border border-[#d9c9ef] px-3 py-1 text-sm disabled:opacity-40"
                  >
                    ↓
                  </button>
                </div>
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium">Название</span>
                <input
                  value={audioItem.title}
                  maxLength={PRODUCT_CONTENT_LIMITS.audioTitle}
                  onChange={(event) => {
                    const title = event.target.value;
                    setAudioFieldErrors((current) => ({
                      ...current,
                      [audioItem.id]: {
                        ...current[audioItem.id],
                        title: undefined,
                      },
                    }));
                    setAudioTitleNotices((current) => {
                      const next = { ...current };
                      delete next[audioItem.id];
                      return next;
                    });
                    setAudioItems((items) =>
                      items.map((item) =>
                        item.id === audioItem.id ? { ...item, title } : item,
                      ),
                    );
                  }}
                  onBlur={() =>
                    void updateAudioItem(audioItem.id, { title: audioItem.title })
                  }
                  className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
                />
                <CharCounter
                  value={audioItem.title}
                  max={PRODUCT_CONTENT_LIMITS.audioTitle}
                />
                {audioFieldErrors[audioItem.id]?.title ? (
                  <p className="mt-2 text-sm text-[#9b3d3d]">
                    {audioFieldErrors[audioItem.id]?.title}
                  </p>
                ) : null}
                {audioTitleNotices[audioItem.id] ? (
                  <p
                    className={`mt-2 text-sm ${
                      audioTitleNotices[audioItem.id] === AUDIO_TITLE_SAVE_ERROR
                        ? "text-[#9b3d3d]"
                        : "text-[#7d70a2]"
                    }`}
                  >
                    {audioTitleNotices[audioItem.id]}
                  </p>
                ) : null}
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium">
                  Краткое описание
                </span>
                <textarea
                  value={audioItem.description ?? ""}
                  maxLength={PRODUCT_CONTENT_LIMITS.audioDescription}
                  onChange={(event) => {
                    const description = event.target.value;
                    setAudioFieldErrors((current) => ({
                      ...current,
                      [audioItem.id]: {
                        ...current[audioItem.id],
                        description: undefined,
                      },
                    }));
                    setAudioItems((items) =>
                      items.map((item) =>
                        item.id === audioItem.id
                          ? { ...item, description: description || null }
                          : item,
                      ),
                    );
                  }}
                  onBlur={() =>
                    void updateAudioItem(audioItem.id, {
                      description: audioItem.description ?? "",
                    })
                  }
                  rows={3}
                  className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
                />
                <CharCounter
                  value={audioItem.description ?? ""}
                  max={PRODUCT_CONTENT_LIMITS.audioDescription}
                />
                {audioFieldErrors[audioItem.id]?.description ? (
                  <p className="mt-2 text-sm text-[#9b3d3d]">
                    {audioFieldErrors[audioItem.id]?.description}
                  </p>
                ) : null}
              </label>

              <div className="mt-4 space-y-3">
                <div className="text-sm text-[#5f5484]">
                  <p className="font-medium text-[#3f3560]">
                    {audioItem.audio_path ? "MP3 загружен" : "MP3 ещё не загружен"}
                  </p>
                  {audioItem.audio_path ? (
                    <div className="mt-2 space-y-1">
                      {audioItem.original_file_name ? (
                        <p>{audioItem.original_file_name}</p>
                      ) : null}
                      <p>{formatDurationLong(audioItem.duration_seconds)}</p>
                      {audioItem.file_size_bytes != null ? (
                        <p>{formatFileSize(audioItem.file_size_bytes)}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <p className="text-sm leading-5 text-[#7d70a2]">MP3 · до 50 МБ</p>

                {audioItem.audio_path && practiceId && !audioItem.id.startsWith("temp-") ? (
                  <div className="mt-3">
                    {audioPreviewLoading[audioItem.id] ? (
                      <p className="text-sm text-[#7d70a2]">
                        Подготавливаем предпрослушивание…
                      </p>
                    ) : null}
                    {audioPreviewErrors[audioItem.id] ? (
                      <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
                        {audioPreviewErrors[audioItem.id]}
                      </p>
                    ) : null}
                    {audioPreviewUrls[audioItem.id] ? (
                      <audio
                        key={`${audioItem.id}-${audioPreviewVersions[audioItem.id] ?? 0}`}
                        controls
                        preload="none"
                        src={audioPreviewUrls[audioItem.id]}
                        className="mt-2 w-full"
                      />
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <label
                    className={`inline-flex rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white ${
                      uploadingAudioId === audioItem.id ||
                      deletingAudioFileId === audioItem.id
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer"
                    }`}
                  >
                    {uploadingAudioId === audioItem.id
                      ? "Загрузка…"
                      : audioItem.audio_path
                        ? "Заменить MP3"
                        : "Загрузить MP3"}
                    <input
                      type="file"
                      accept="audio/mpeg,.mp3"
                      className="hidden"
                      disabled={
                        uploadingAudioId === audioItem.id ||
                        deletingAudioFileId === audioItem.id
                      }
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) {
                          void uploadAudio(audioItem.id, file);
                        }
                      }}
                    />
                  </label>

                  {audioItem.audio_path ? (
                    <button
                      type="button"
                      disabled={
                        uploadingAudioId === audioItem.id ||
                        deletingAudioFileId === audioItem.id
                      }
                      onClick={() => void deleteAudioFile(audioItem.id)}
                      className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7d70a2] disabled:opacity-60"
                    >
                      {deletingAudioFileId === audioItem.id
                        ? "Удаление…"
                        : "Удалить MP3"}
                    </button>
                  ) : null}

                  {audioItems.length > 1 ? (
                    <button
                      type="button"
                      disabled={
                        uploadingAudioId === audioItem.id ||
                        deletingAudioFileId === audioItem.id
                      }
                      onClick={() =>
                        void deleteAudioItem(
                          audioItem.id,
                          Boolean(audioItem.audio_path),
                        )
                      }
                      className="rounded-full border border-[#ebc9c9] px-4 py-2 text-sm font-semibold text-[#9b3d3d] disabled:opacity-60"
                    >
                      Удалить
                    </button>
                  ) : null}
                </div>

                {audioUploadErrors[audioItem.id] ? (
                  <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
                    {audioUploadErrors[audioItem.id]}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveDraft()}
          className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
        >
          Сохранить черновик
        </button>

        {form.status === "published" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void unpublishProduct()}
            className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
          >
            Снять с публикации
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void publishProduct()}
            className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
          >
            Опубликовать
          </button>
        )}

        {form.status === "published" && form.slug ? (
          <Link
            href={`/practice/${form.slug}`}
            className="rounded-[22px] border border-[#c6afe6] px-5 py-4 text-center font-semibold text-[#7042c5]"
          >
            Открыть публичную карточку
          </Link>
        ) : null}
      </div>

      {selectedAuthor ? (
        <p className="text-xs text-[#7d70a2]">
          Работаете от имени: {selectedAuthor.name}
          {mode === "create" ? " · новый аудиопродукт" : ""}
        </p>
      ) : null}
    </div>
  );
}
