"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type {
  AuthorProductDetail,
  AuthorWorkspace,
  AudioItemRow,
} from "@/lib/author-products/types";
import { MULTI_AUDIO_PUBLISH_MESSAGE } from "@/lib/author-products/publish";
import {
  PAID_PRICE_OPTIONS,
  PRODUCT_FORMATS,
} from "@/lib/author-products/types";
import {
  PRODUCT_CONTENT_LIMITS,
  getProductFieldErrorMessage,
  getProductFieldKeyForError,
} from "@/lib/author-products/limits";
import { buildPracticePublicPath } from "@/lib/author-products/utils";

const MAX_COVER_BYTES = 10 * 1024 * 1024;
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
    return "Размер обложки не должен превышать 10 МБ.";
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

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
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
        setError(payload.message ?? MULTI_AUDIO_PUBLISH_MESSAGE);
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
  ) {
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
      return;
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

      return;
    }

    if (payload.product) {
      setAudioItems(payload.product.audio_items);
      setAudioFieldErrors((current) => {
        const next = { ...current };
        delete next[audioId];
        return next;
      });
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

  async function moveAudioItem(audioId: string, direction: "up" | "down") {
    const index = audioItems.findIndex((item) => item.id === audioId);

    if (index < 0) {
      return;
    }

    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= audioItems.length) {
      return;
    }

    const nextOrder = [...audioItems];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, moved);

    setAudioItems(
      nextOrder.map((item, position) => ({ ...item, position: position + 1 })),
    );

    if (!practiceId) {
      return;
    }

    const response = await fetch(`/api/author/products/${practiceId}/audio/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order: nextOrder.map((item) => item.id),
      }),
    });

    const payload = (await response.json()) as {
      product?: AuthorProductDetail;
    };

    if (response.ok && payload.product) {
      setAudioItems(payload.product.audio_items);
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
          "Файл слишком большой. Максимальный размер обложки — 10 МБ.",
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

  async function uploadAudio(audioId: string, file: File) {
    setUploadingAudioId(audioId);
    setError(null);

    try {
      const id = await ensurePracticeId();

      if (!id) {
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

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
      };

      if (!response.ok || !payload.product) {
        setError("Не удалось загрузить MP3.");
        return;
      }

      setForm(buildInitialForm(authors, initialAuthorSlug, payload.product));
      setAudioItems(payload.product.audio_items);
      setMessage("Аудио загружено.");
    } catch {
      setError("Не удалось загрузить MP3.");
    } finally {
      setUploadingAudioId(null);
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
              <p className="mt-3 text-sm leading-5 text-[#7d70a2]">
                Квадратная обложка от 1000 × 1000 px · JPG, PNG или WebP · до
                10 МБ
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

        <div className="space-y-4">
          {audioItems.map((audioItem, index) => (
            <article
              key={audioItem.id}
              className="rounded-[20px] border border-[#eee6f7] bg-[#fbf8ff] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Аудио {index + 1}</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => void moveAudioItem(audioItem.id, "up")}
                    className="rounded-full border border-[#d9c9ef] px-3 py-1 text-sm disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === audioItems.length - 1}
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

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-[#5f5484]">
                  {audioItem.audio_path ? "MP3 загружен" : "MP3 ещё не загружен"}
                  <span className="ml-2">
                    Продолжительность: {formatDuration(audioItem.duration_seconds)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
                    {uploadingAudioId === audioItem.id ? "Загрузка…" : "Загрузить MP3"}
                    <input
                      type="file"
                      accept="audio/mpeg,.mp3"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void uploadAudio(audioItem.id, file);
                        }
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      void deleteAudioItem(audioItem.id, Boolean(audioItem.audio_path))
                    }
                    className="rounded-full border border-[#ebc9c9] px-4 py-2 text-sm font-semibold text-[#9b3d3d]"
                  >
                    Удалить
                  </button>
                </div>
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
