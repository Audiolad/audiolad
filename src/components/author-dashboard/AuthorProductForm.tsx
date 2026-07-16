"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AudioDragHandle } from "@/components/author-dashboard/AudioDragHandle";
import CoverUploadBlock from "@/components/author-dashboard/CoverUploadBlock";
import { useAudioItemsReorder } from "@/components/author-dashboard/useAudioItemsReorder";
import type {
  AuthorProductDetail,
  AuthorWorkspace,
  AudioItemRow,
} from "@/lib/author-products/types";
import {
  PAID_PRICE_OPTIONS,
  getStatusLabel,
  getStatusClassName,
} from "@/lib/author-products/types";
import {
  CUSTOM_FORMAT_LABEL,
  CUSTOM_FORMAT_VALUE,
  PRODUCT_PRESET_FORMATS,
  isCustomFormatSelection,
  parsePracticeFormat,
  resolveFormatForStorage,
  validateCustomFormatForPublish,
} from "@/lib/author-products/format";
import {
  PRODUCT_CONTENT_LIMITS,
  getAudioUploadErrorMessage,
  getProductFieldErrorMessage,
  getProductFieldKeyForError,
  validateMp3FileClient,
  validateStoredFormatLength,
  type ProductFieldErrorCode,
} from "@/lib/author-products/limits";
import {
  mergeServerAudioItems,
  mergeServerProductIntoForm,
  resolveAudioItemIdAfterDraftCreate,
} from "@/lib/author-products/form-merge";
import { buildPracticePublicPath } from "@/lib/author-products/utils";
import { formatRubles } from "@/lib/products/price-format";

type PracticeContext = {
  practiceId: string;
  audioItems: AudioItemRow[];
};

function CharCounter({ value, max }: { value: string; max: number }) {
  return (
    <p className="mt-1 text-right text-xs text-[#7d70a2]">
      {value.length} / {max}
    </p>
  );
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
  formatPreset: string;
  customFormat: string;
  slug: string;
  isFree: boolean;
  price: number;
  coverUrl: string | null;
  coverVersion: string | null;
  useSharedCover: boolean;
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
    const { preset, customFormat } = parsePracticeFormat(practice.format);

    return {
      authorId: practice.author_id,
      title: practice.title,
      subtitle: practice.subtitle ?? "",
      description: practice.description ?? "",
      formatPreset: preset,
      customFormat,
      slug: practice.slug,
      isFree: practice.is_free === true,
      price: practice.is_free === true ? 99 : practice.price,
      coverUrl: practice.cover_url,
      coverVersion: practice.cover_url ? practice.updated_at : null,
      useSharedCover: practice.use_shared_cover !== false,
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
    formatPreset: "",
    customFormat: "",
    slug: "",
    isFree: true,
    price: 99,
    coverUrl: null,
    coverVersion: null,
    useSharedCover: true,
    status: "draft",
    publishedAt: null,
  };
}

function buildProductSavePayload(
  form: FormState,
  slugLocked: boolean,
) {
  return {
    ...(slugLocked ? {} : { author_id: form.authorId, slug: form.slug }),
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    description: form.description.trim() || null,
    format: resolveFormatForStorage(form.formatPreset, form.customFormat),
    is_free: form.isFree,
    price: form.isFree ? 0 : form.price,
    use_shared_cover: form.useSharedCover,
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
        cover_url: null,
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
  const practiceIdRef = useRef(initialProduct?.practice.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingAudioId, setUploadingAudioId] = useState<string | null>(null);
  const [savingSharedCover, setSavingSharedCover] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    subtitle?: string;
    description?: string;
    formatCustom?: string;
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
  const titleInputRefs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocusAudioIdRef = useRef<string | null>(null);
  const addAudioInFlightRef = useRef(false);

  const setTitleInputRef = useCallback(
    (audioId: string, element: HTMLInputElement | null) => {
      if (!element) {
        titleInputRefs.current.delete(audioId);
        return;
      }

      titleInputRefs.current.set(audioId, element);
    },
    [],
  );

  const focusNewAudioCard = useCallback((audioId: string) => {
    const titleInput = titleInputRefs.current.get(audioId);

    if (!titleInput) {
      return;
    }

    titleInput.scrollIntoView({ behavior: "smooth", block: "center" });
    requestAnimationFrame(() => {
      titleInput.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    const audioId = pendingFocusAudioIdRef.current;

    if (!audioId) {
      return;
    }

    pendingFocusAudioIdRef.current = null;
    requestAnimationFrame(() => {
      focusNewAudioCard(audioId);
    });
  }, [audioItems, focusNewAudioCard]);

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

  const slugLocked =
    form.status === "published" ||
    form.status === "unpublished" ||
    form.status === "archived" ||
    Boolean(form.publishedAt);
  const isPublished = form.status === "published";
  const isUnpublished = form.status === "unpublished";
  const isArchived = form.status === "archived";
  const isDraft = form.status === "draft";

  const selectedAuthor = useMemo(
    () => authors.find((author) => author.id === form.authorId) ?? null,
    [authors, form.authorId],
  );

  const publicPath =
    form.slug && selectedAuthor?.slug
      ? buildPracticePublicPath(selectedAuthor.slug, form.slug)
      : "";

  async function getPracticeIdForCoverUpload(): Promise<string | null> {
    const existingPracticeId = practiceIdRef.current || practiceId;

    if (existingPracticeId) {
      return existingPracticeId;
    }

    const ensured = await ensurePracticeId();

    return ensured?.practiceId ?? null;
  }

  async function ensurePracticeId(
    localItemsSnapshot?: AudioItemRow[],
  ): Promise<PracticeContext | null> {
    const existingPracticeId = practiceIdRef.current || practiceId;

    if (existingPracticeId) {
      return {
        practiceId: existingPracticeId,
        audioItems: localItemsSnapshot ?? audioItems,
      };
    }

    if (!form.authorId || !form.title.trim()) {
      setError("Укажите автора и название, чтобы сохранить черновик.");
      return null;
    }

    const itemsBeforeCreate = localItemsSnapshot ?? audioItems;

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
    const mergedAudioItems = mergeServerAudioItems(
      itemsBeforeCreate,
      created.audio_items,
    );

    practiceIdRef.current = created.practice.id;
    setPracticeId(created.practice.id);
    setAudioItems(mergedAudioItems);
    setForm((current) => ({
      ...current,
      slug: created.practice.slug,
      status: created.practice.status,
    }));

    if (mode === "create" && typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        `/author-dashboard/products/${created.practice.id}`,
      );
    }

    return {
      practiceId: created.practice.id,
      audioItems: mergedAudioItems,
    };
  }

  function applyServerProductPreservingDraft(product: AuthorProductDetail) {
    setForm((current) => mergeServerProductIntoForm(current, product));
    setAudioItems((current) =>
      mergeServerAudioItems(current, product.audio_items),
    );
  }

  function handleProductCoverUpdated({
    coverUrl,
    product,
  }: {
    coverUrl: string | null;
    product?: AuthorProductDetail;
  }) {
    if (product) {
      applyServerProductPreservingDraft(product);
    } else {
      setForm((current) => ({
        ...current,
        coverUrl,
        coverVersion: coverUrl ? String(Date.now()) : null,
      }));
    }

    setMessage(coverUrl ? "Обложка загружена." : "Обложка удалена.");
  }

  async function handleUseSharedCoverChange(nextValue: boolean) {
    const previousValue = form.useSharedCover;
    setForm((current) => ({ ...current, useSharedCover: nextValue }));
    setSavingSharedCover(true);
    setError(null);

    try {
      const ensured = await ensurePracticeId();

      if (!ensured) {
        setForm((current) => ({ ...current, useSharedCover: previousValue }));
        return;
      }

      const response = await fetch(
        `/api/author/products/${ensured.practiceId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ use_shared_cover: nextValue }),
        },
      );

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        error?: string;
      };

      if (!response.ok || !payload.product) {
        setForm((current) => ({ ...current, useSharedCover: previousValue }));
        setError("Не удалось сохранить настройку обложек.");
        return;
      }

      applyServerProductPreservingDraft(payload.product);
    } catch {
      setForm((current) => ({ ...current, useSharedCover: previousValue }));
      setError("Не удалось сохранить настройку обложек.");
    } finally {
      setSavingSharedCover(false);
    }
  }

  async function saveAllAudioItemsFromState(
    targetPracticeId: string,
    items: AudioItemRow[],
  ): Promise<{ ok: true } | { ok: false; message: string; audioId?: string }> {
    for (const item of items) {
      if (item.id.startsWith("temp-")) {
        continue;
      }

      const title = item.title.trim();

      if (!title) {
        return {
          ok: false,
          message: `Укажите название для аудио ${item.position}.`,
          audioId: item.id,
        };
      }

      const response = await fetch(
        `/api/author/products/${targetPracticeId}/audio/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: item.description?.trim() || null,
          }),
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

        return {
          ok: false,
          message:
            fieldMessage ??
            `Не удалось сохранить аудио «${title}».`,
          audioId: item.id,
        };
      }
    }

    return { ok: true };
  }

  async function reloadSavedProduct(targetPracticeId: string): Promise<boolean> {
    const response = await fetch(`/api/author/products/${targetPracticeId}`, {
      cache: "no-store",
    });

    const payload = (await response.json()) as {
      product?: AuthorProductDetail;
      error?: string;
    };

    if (!response.ok || !payload.product) {
      return false;
    }

    setForm(buildInitialForm(authors, initialAuthorSlug, payload.product));
    setAudioItems(payload.product.audio_items);
    return true;
  }

  async function saveProduct(): Promise<boolean> {
    setBusy(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});

    try {
      const ensured = await ensurePracticeId();

      if (!ensured) {
        return false;
      }

      const id = ensured.practiceId;

      const response = await fetch(`/api/author/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProductSavePayload(form, slugLocked)),
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
            payload.error as ProductFieldErrorCode,
          );

          if (
            fieldKey === "title" ||
            fieldKey === "subtitle" ||
            fieldKey === "description" ||
            fieldKey === "formatCustom"
          ) {
            setFieldErrors({ [fieldKey]: fieldMessage });
            return false;
          }
        }

        setError(
          payload.error === "update_failed"
            ? "Не удалось сохранить изменения продукта. Обновите страницу и попробуйте снова."
            : "Не удалось сохранить аудиопродукт.",
        );
        return false;
      }

      const audioSaveResult = await saveAllAudioItemsFromState(
        id,
        ensured.audioItems,
      );

      if (!audioSaveResult.ok) {
        if (audioSaveResult.audioId) {
          setAudioFieldErrors((current) => ({
            ...current,
            [audioSaveResult.audioId!]: {
              title: audioSaveResult.message,
            },
          }));
        }

        setError(audioSaveResult.message);
        await reloadSavedProduct(id);
        return false;
      }

      const reloaded = await reloadSavedProduct(id);

      if (!reloaded) {
        setError(
          "Изменения сохранены, но не удалось обновить форму. Обновите страницу.",
        );
        return false;
      }

      router.refresh();
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
      setMessage(
        isPublished || isArchived || form.publishedAt
          ? "Изменения сохранены."
          : "Черновик сохранён.",
      );
    }
  }

  async function publishProduct() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});

    if (!validateCustomFormatForPublish(form.formatPreset, form.customFormat)) {
      setFieldErrors({
        formatCustom: "Укажите название своего формата",
      });
      setBusy(false);
      return;
    }

    if (isCustomFormatSelection(form.formatPreset)) {
      const lengthError = validateStoredFormatLength(form.customFormat);

      if (lengthError) {
        setFieldErrors({
          formatCustom: getProductFieldErrorMessage(lengthError) ?? undefined,
        });
        setBusy(false);
        return;
      }
    }

    try {
      const ensured = await ensurePracticeId();

      if (!ensured) {
        return;
      }

      const id = ensured.practiceId;

      const saved = await saveProduct();

      if (!saved) {
        return;
      }

      const response = await fetch(`/api/author/products/${id}/publish`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        if (payload.error === "missing_custom_format") {
          setFieldErrors({
            formatCustom:
              payload.message ?? "Укажите название своего формата",
          });
        } else {
          setError(payload.message ?? "Не удалось опубликовать аудиопродукт.");
        }
        return;
      }

      if (payload.product) {
        applyServerProductPreservingDraft(payload.product);
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

    if (
      !window.confirm(
        "Снять аудиопродукт с публикации? Он исчезнет из каталога, но останется в вашем списке и будет доступен пользователям с уже выданным доступом.",
      )
    ) {
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
        error?: string;
      };

      if (!response.ok || !payload.product) {
        setError(
          payload.message ?? "Не удалось снять аудиопродукт с публикации.",
        );
        return;
      }

      applyServerProductPreservingDraft(payload.product);
      setMessage(payload.message ?? "Аудиопродукт снят с публикации.");
    } catch {
      setError("Не удалось снять аудиопродукт с публикации.");
    } finally {
      setBusy(false);
    }
  }

  async function archiveProduct() {
    if (!practiceId) {
      return;
    }

    if (
      !window.confirm(
        "Переместить аудиопродукт в архив? Он исчезнет из основного списка, но останется доступен пользователям с уже выданным доступом.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/author/products/${practiceId}/archive`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.product) {
        setError(payload.message ?? "Не удалось переместить аудиопродукт в архив.");
        return;
      }

      applyServerProductPreservingDraft(payload.product);
      setMessage(payload.message ?? "Аудиопродукт перемещён в архив.");
    } catch {
      setError("Не удалось переместить аудиопродукт в архив.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromArchiveProduct() {
    if (!practiceId) {
      return;
    }

    if (
      !window.confirm(
        "Вернуть аудиопродукт из архива? Он появится в основном списке со статусом «Снят с публикации» и не будет автоматически опубликован в каталоге.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/author/products/${practiceId}/restore-from-archive`,
        { method: "POST" },
      );

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        message?: string;
      };

      if (!response.ok || !payload.product) {
        setError("Не удалось вернуть аудиопродукт из архива.");
        return;
      }

      applyServerProductPreservingDraft(payload.product);
      setMessage(payload.message ?? "Аудиопродукт возвращён из архива.");
    } catch {
      setError("Не удалось вернуть аудиопродукт из архива.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct() {
    if (!practiceId) {
      return;
    }

    if (
      !window.confirm(
        "Удалить аудиопродукт без возможности восстановления? Это действие необратимо.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/author/products/${practiceId}`, {
        method: "DELETE",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? "Не удалось удалить аудиопродукт.");
        return;
      }

      router.push("/author-dashboard");
      router.refresh();
    } catch {
      setError("Не удалось удалить аудиопродукт.");
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
      setAudioItems((current) =>
        mergeServerAudioItems(current, payload.product!.audio_items),
      );
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
    if (addAudioInFlightRef.current || busy) {
      return;
    }

    addAudioInFlightRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const ensured = await ensurePracticeId();

      if (!ensured) {
        return;
      }

      const id = ensured.practiceId;

      const response = await fetch(`/api/author/products/${id}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Аудио ${audioItems.length + 1}`,
        }),
      });

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        audio_item?: AudioItemRow;
      };

      if (!response.ok || !payload.product) {
        setError("Не удалось добавить аудио.");
        return;
      }

      const newAudioId =
        payload.audio_item?.id ??
        payload.product.audio_items[payload.product.audio_items.length - 1]?.id;

      if (newAudioId) {
        pendingFocusAudioIdRef.current = newAudioId;
      }

      setAudioItems((current) =>
        mergeServerAudioItems(current, payload.product!.audio_items),
      );
    } catch {
      setError("Не удалось добавить аудио.");
    } finally {
      addAudioInFlightRef.current = false;
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
      setAudioItems((current) =>
        mergeServerAudioItems(current, payload.product!.audio_items),
      );
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
    const localItemsBeforeCreate = audioItems;

    try {
      const ensured = await ensurePracticeId(localItemsBeforeCreate);

      if (!ensured) {
        setAudioUploadErrors((current) => ({
          ...current,
          [audioId]: "Не удалось загрузить MP3.",
        }));
        return;
      }

      const id = ensured.practiceId;
      const targetAudioId = resolveAudioItemIdAfterDraftCreate(
        audioId,
        localItemsBeforeCreate,
        ensured.audioItems,
      );

      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch(
        `/api/author/products/${id}/audio/${targetAudioId}/upload`,
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

      applyServerProductPreservingDraft(payload.product);
      setAudioPreviewVersions((current) => ({
        ...current,
        [targetAudioId]: (current[targetAudioId] ?? 0) + 1,
      }));
      setMessage("Аудио загружено.");
      void loadAudioPreview(id, targetAudioId);
      await autofillAudioTitleFromFile(
        targetAudioId,
        file,
        currentTitle,
        slotNumber,
      );
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
      const ensured = practiceId
        ? { practiceId, audioItems }
        : await ensurePracticeId();

      if (!ensured) {
        setAudioUploadErrors((current) => ({
          ...current,
          [audioId]: "Не удалось удалить MP3.",
        }));
        return;
      }

      const id = ensured.practiceId;
      const targetAudioId = resolveAudioItemIdAfterDraftCreate(
        audioId,
        audioItems,
        ensured.audioItems,
      );

      const response = await fetch(
        `/api/author/products/${id}/audio/${targetAudioId}/file`,
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

      applyServerProductPreservingDraft(payload.product);
      setAudioPreviewUrls((current) => {
        const next = { ...current };
        delete next[targetAudioId];
        return next;
      });
      setAudioPreviewErrors((current) => {
        const next = { ...current };
        delete next[targetAudioId];
        return next;
      });
      setAudioPreviewVersions((current) => {
        const next = { ...current };
        delete next[targetAudioId];
        return next;
      });
      delete audioPreviewRequestIds.current[targetAudioId];
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px] font-semibold">Основная информация</h2>
          {mode === "edit" ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClassName(form.status)}`}
            >
              {getStatusLabel(form.status)}
            </span>
          ) : null}
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Автор</span>
          <select
            value={form.authorId}
            disabled={slugLocked}
            onChange={(event) =>
              setForm((current) => ({ ...current, authorId: event.target.value }))
            }
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
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
            value={form.formatPreset}
            onChange={(event) => {
              const value = event.target.value;

              setFieldErrors((current) => ({
                ...current,
                formatCustom: undefined,
              }));
              setForm((current) => ({
                ...current,
                formatPreset: value,
                customFormat:
                  value === CUSTOM_FORMAT_VALUE ? current.customFormat : "",
              }));
            }}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
          >
            <option value="">Выберите формат</option>
            {PRODUCT_PRESET_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
            <option value={CUSTOM_FORMAT_VALUE}>{CUSTOM_FORMAT_LABEL}</option>
          </select>
        </label>

        <div
          className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
            isCustomFormatSelection(form.formatPreset)
              ? "mt-3 grid-rows-[1fr] opacity-100"
              : "mt-0 grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Название формата
              </span>
              <input
                value={form.customFormat}
                maxLength={PRODUCT_CONTENT_LIMITS.customFormat}
                onChange={(event) => {
                  setFieldErrors((current) => ({
                    ...current,
                    formatCustom: undefined,
                  }));
                  setForm((current) => ({
                    ...current,
                    customFormat: event.target.value,
                  }));
                }}
                placeholder="Например: молитва, настрой, звуковая практика"
                className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
              />
              <CharCounter
                value={form.customFormat}
                max={PRODUCT_CONTENT_LIMITS.customFormat}
              />
              {fieldErrors.formatCustom ? (
                <p className="mt-2 text-sm text-[#9b3d3d]">
                  {fieldErrors.formatCustom}
                </p>
              ) : null}
            </label>
          </div>
        </div>

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

        <CoverUploadBlock
          label="Обложка"
          coverUrl={form.coverUrl}
          coverVersion={form.coverVersion}
          buildUploadUrl={(id) => `/api/author/products/${id}/cover`}
          buildDeleteUrl={(id) => `/api/author/products/${id}/cover`}
          getPracticeId={getPracticeIdForCoverUpload}
          onUpdated={handleProductCoverUpdated}
          hint="Квадратная обложка от 1000 × 1000 px · JPG, PNG или WebP · до 3 МБ"
          uploadLabel="Загрузить обложку"
          replaceLabel="Заменить обложку"
        />

        <div className="mt-4 rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.useSharedCover}
              disabled={savingSharedCover || busy}
              onChange={(event) =>
                void handleUseSharedCoverChange(event.target.checked)
              }
              className="mt-1 h-4 w-4 shrink-0 rounded border-[#c6afe6] text-[#7042c5] focus:ring-[#9a74d8]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[#3f3560]">
                Использовать общую обложку для всех треков
              </span>
              <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                Отключите, если каждому треку нужна собственная обложка —
                например, для историй, сказок, лекций, глав или выпусков.
              </span>
            </span>
          </label>
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
                  {formatRubles(price)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-[20px] font-semibold">Содержание аудиопродукта</h2>

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
                  ref={(element) => setTitleInputRef(audioItem.id, element)}
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
                  onBlur={(event) =>
                    void updateAudioItem(audioItem.id, {
                      title: event.currentTarget.value.trim(),
                    })
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
                  onBlur={(event) =>
                    void updateAudioItem(audioItem.id, {
                      description: event.currentTarget.value,
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

              {!form.useSharedCover ? (
                <div className="mt-4">
                  <CoverUploadBlock
                    label="Обложка трека"
                    coverUrl={audioItem.cover_url}
                    coverVersion={
                      audioItem.cover_url ? audioItem.updated_at : null
                    }
                    buildUploadUrl={(id) =>
                      `/api/author/products/${id}/audio/${audioItem.id}/cover`
                    }
                    buildDeleteUrl={(id) =>
                      `/api/author/products/${id}/audio/${audioItem.id}/cover`
                    }
                    getPracticeId={getPracticeIdForCoverUpload}
                    disabled={
                      audioItem.id.startsWith("temp-") ||
                      !practiceId ||
                      savingSharedCover
                    }
                    onUpdated={({ coverUrl, product }) => {
                      if (product) {
                        applyServerProductPreservingDraft(product);
                        setMessage(
                          coverUrl
                            ? "Обложка трека загружена."
                            : "Обложка трека удалена.",
                        );
                      }
                    }}
                    deleteConfirmMessage="Удалить обложку трека?"
                    hint="Если обложка не загружена, используется общая обложка продукта. · JPG, PNG или WebP · от 1000 × 1000 px · до 3 МБ"
                    previewSize="compact"
                    uploadLabel="Загрузить обложку трека"
                    replaceLabel="Заменить обложку трека"
                  />
                </div>
              ) : null}

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

          <button
            type="button"
            disabled={busy || reorderBusy}
            onClick={() => void addAudioItem()}
            className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Добавить аудио
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveDraft()}
          className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
        >
          {isPublished || isUnpublished || isArchived || form.publishedAt
            ? "Сохранить изменения"
            : "Сохранить черновик"}
        </button>

        {isPublished ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void unpublishProduct()}
              className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
            >
              Снять с публикации
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void archiveProduct()}
              className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
            >
              Переместить в архив
            </button>
          </>
        ) : null}

        {isUnpublished ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void publishProduct()}
              className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
            >
              Опубликовать
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void archiveProduct()}
              className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
            >
              Переместить в архив
            </button>
          </>
        ) : null}

        {isDraft ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void publishProduct()}
            className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
          >
            Опубликовать
          </button>
        ) : null}

        {isArchived ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void restoreFromArchiveProduct()}
            className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Вернуть из архива
          </button>
        ) : null}

        {isPublished && publicPath ? (
          <Link
            href={publicPath}
            className="rounded-[22px] border border-[#c6afe6] px-5 py-4 text-center font-semibold text-[#7042c5]"
          >
            Открыть публичную карточку
          </Link>
        ) : null}

        {mode === "edit" && practiceId && isDraft ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void deleteProduct()}
            className="rounded-[22px] border border-[#f2c7c7] px-5 py-4 font-semibold text-[#9b3d3d] disabled:opacity-60"
          >
            Удалить продукт
          </button>
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
