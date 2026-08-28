"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AudioDragHandle } from "@/components/author-dashboard/AudioDragHandle";
import AuthorCourseBuilder from "@/components/author-dashboard/AuthorCourseBuilder";
import AuthorProductGallery from "@/components/author-dashboard/AuthorProductGallery";
import CoverUploadBlock from "@/components/author-dashboard/CoverUploadBlock";
import { useAudioItemsReorder } from "@/components/author-dashboard/useAudioItemsReorder";
import AuthorProductPromotions from "@/components/author-dashboard/AuthorProductPromotions";
import PracticeVisibilityUsersEditor from "@/components/author-dashboard/PracticeVisibilityUsersEditor";
import {
  CATALOG_VISIBILITY,
  type CatalogVisibility,
} from "@/lib/products/catalog-visibility";
import TopicSelector from "@/components/author-products/TopicSelector";
import {
  MAX_PAID_PRICE_RUB,
  MIN_PAID_PRICE_RUB,
} from "@/lib/pricing/money";
import type { AuthorProductTopicFormData } from "@/lib/author-products/topic-form-data";
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
  PRODUCT_UNDER_MODERATION_MESSAGE,
  VISIBLE_AUTHOR_PRODUCT_STATUS,
  canWithdrawPracticeFromModeration,
  getVisibleAuthorProductStatus,
} from "@/lib/author-products/moderation";
import {
  CUSTOM_FORMAT_LABEL,
  CUSTOM_FORMAT_VALUE,
  PRODUCT_PRESET_FORMATS,
  isCustomFormatSelection,
  resolveFormatForStorage,
  validateCustomFormatForPublish,
} from "@/lib/author-products/format";
import { PRODUCT_LANGUAGE_GUIDELINES } from "@/lib/author-products/language-guidelines";
import {
  MUSIC_KIND_LABEL,
  MUSIC_USAGE_PERMISSION,
  MUSIC_USAGE_PERMISSION_INTRO,
  PRODUCT_KIND,
  canChangeProductKind,
  getMusicUsagePermissionDescription,
  getMusicUsagePermissionLabel,
  type MusicUsagePermission,
  type ProductKind,
} from "@/lib/author-products/product-kind";
import {
  AUTHOR_PUBLICATION_CLASS_LABELS,
  isCoursePublication,
  isProductGalleryEligible,
  publicationClassToCabinetBranch,
  publicationClassToLegacyKind,
  resolveCreateClassification,
  type PublicationClass,
} from "@/lib/author-products/publication-class";
import {
  PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH,
  PROMO_RECOMMENDATION_TEXT_MAX_LENGTH,
  PROMO_RECOMMENDATION_TITLE_MAX_LENGTH,
} from "@/lib/products/promo-recommendation";
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
  applyProductEditorSaveToDirty,
  isProductEditorDirty,
  serializeProductEditorBaseline,
  shouldSubmitProductAfterSave,
} from "@/lib/author-products/editor-save-state";
import {
  getProductCreateErrorMessage,
  getProductSaveErrorMessage,
  logProductSaveFailure,
} from "@/lib/author-products/save-errors";
import { buildUnlockedProductIdentityFields } from "@/lib/author-products/save-payload";
import {
  mergeServerAudioItems,
  mergeServerProductIntoForm,
  productDetailToFormSnapshot,
  resolveAudioItemIdAfterDraftCreate,
} from "@/lib/author-products/form-merge";
import { buildPracticePublicPath } from "@/lib/author-products/utils";
import AuthorAccessStatusBanner from "@/components/author-dashboard/AuthorAccessStatusBanner";
import {
  AUTHOR_PRODUCT_FREE_PRICE_LABEL,
  buildAuthorStatusHref,
  buildCommercialStatusHelpHref,
  PAID_PRICING_COMMERCIAL_STATUS_MORE_LABEL,
} from "@/lib/author-dashboard/free-author-first-step";
import {
  authorAccessAllowsContentMutations,
  authorAccessAllowsPaidProducts,
  getPaidPricingDisabledReason,
} from "@/lib/authors/access";
import { buildPracticePublishPreviewPath } from "@/lib/products/paths";
import {
  isPublishNotReadyResponse,
  PUBLISH_PREVIEW_NOT_READY_MESSAGE,
  shouldOpenPublishPreviewFromForm,
} from "@/lib/products/publish-preview";
import { formatRubles } from "@/lib/products/price-format";
import {
  createDefaultListeningNoticeFormState,
  DEFAULT_LISTENING_NOTICE_TEXT,
  DEFAULT_LISTENING_NOTICE_TITLE,
} from "@/lib/products/listening-notice";
import type { AssignedTopic, TopicOption } from "@/lib/topics/types";
import { assertPublishedTopicMinimum } from "@/lib/topics/limits";
import {
  evaluateCoursePublishContentGate,
  shouldCreateDefaultAudioItem,
  shouldShowPracticeListeningNotice,
  shouldShowSharedTrackCoverToggle,
  type CoursePublishContentSnapshot,
} from "@/lib/author-products/course-builder-shared";

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
  initialPublicationClass?: PublicationClass | null;
  topicFormData: AuthorProductTopicFormData;
  mode: "create" | "edit";
};

type FormState = {
  authorId: string;
  title: string;
  subtitle: string;
  description: string;
  productKind: ProductKind;
  publicationClass: PublicationClass | null;
  musicUsagePermission: MusicUsagePermission | null;
  formatPreset: string;
  customFormat: string;
  slug: string;
  isFree: boolean;
  price: number;
  isCatalogListed: boolean;
  catalogVisibility: CatalogVisibility;
  promoEnabled: boolean;
  promoTitle: string;
  promoText: string;
  promoButtonText: string;
  promoUrl: string;
  promoOpenInNewTab: boolean;
  coverUrl: string | null;
  coverVersion: string | null;
  coverImage?: unknown;
  useSharedCover: boolean;
  listeningNoticeEnabled: boolean;
  listeningNoticeTitle: string;
  listeningNoticeText: string;
  status: string;
  moderationStatus: string;
  moderationSubmittedAt: string | null;
  moderationReviewComment: string | null;
  moderationAttempt: number;
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

  return (
    trimmed === `Аудио ${slotNumber}` ||
    trimmed === `Трек ${slotNumber}`
  );
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
  initialPublicationClass?: PublicationClass | null,
): FormState {
  if (initialProduct) {
    return productDetailToFormSnapshot(initialProduct);
  }

  const author =
    authors.find((item) => item.slug === initialAuthorSlug) ?? authors[0];
  const listeningDefaults = createDefaultListeningNoticeFormState();
  const classification = resolveCreateClassification({
    publicationClass: initialPublicationClass,
  });
  const created = classification.ok
    ? classification.value
    : {
        publicationClass: "practice" as const,
        productKind: PRODUCT_KIND.PRACTICE,
      };

  return {
    authorId: author?.id ?? "",
    title: "",
    subtitle: "",
    description: "",
    productKind: created.productKind,
    publicationClass: created.publicationClass,
    musicUsagePermission:
      created.productKind === PRODUCT_KIND.MUSIC
        ? MUSIC_USAGE_PERMISSION.LISTEN_ONLY
        : null,
    formatPreset: "",
    customFormat: "",
    slug: "",
    isFree: true,
    price: 99,
    isCatalogListed: true,
    catalogVisibility: CATALOG_VISIBILITY.LISTED,
    promoEnabled: false,
    promoTitle: "",
    promoText: "",
    promoButtonText: "",
    promoUrl: "",
    promoOpenInNewTab: false,
    coverUrl: null,
    coverVersion: null,
    coverImage: null,
    useSharedCover: true,
    listeningNoticeEnabled: listeningDefaults.listeningNoticeEnabled,
    listeningNoticeTitle: listeningDefaults.listeningNoticeTitle,
    listeningNoticeText: listeningDefaults.listeningNoticeText,
    status: "draft",
    moderationStatus: "not_submitted",
    moderationSubmittedAt: null,
    moderationReviewComment: null,
    moderationAttempt: 0,
    publishedAt: null,
  };
}

function buildInitialTopicKeys(topicFormData: AuthorProductTopicFormData): string[] {
  return [
    ...topicFormData.selectedTopicKeys,
    ...topicFormData.archivedTopics.map((topic) => topic.key),
  ];
}

function getActiveTopicKeysForSync(
  topicKeys: string[],
  archivedTopics: AssignedTopic[],
): string[] {
  const archivedKeySet = new Set(archivedTopics.map((topic) => topic.key));

  return topicKeys.filter((key) => !archivedKeySet.has(key));
}

function countActiveSelectedTopics(
  topicKeys: string[],
  topicOptions: TopicOption[],
  archivedTopics: AssignedTopic[],
): number {
  const optionKeys = new Set(topicOptions.map((topic) => topic.key));
  const archivedKeySet = new Set(archivedTopics.map((topic) => topic.key));

  return topicKeys.filter(
    (key) => optionKeys.has(key) && !archivedKeySet.has(key),
  ).length;
}

function mapTopicOptionsForSelector(
  topicOptions: TopicOption[],
): Array<{ key: string; title: string; isActive: boolean }> {
  return topicOptions.map((topic) => ({
    key: topic.key,
    title: topic.title,
    isActive: true,
  }));
}

function mapArchivedTopicsForSelector(
  archivedTopics: AssignedTopic[],
): Array<{ key: string; title: string; isActive: boolean; isArchived: true }> {
  return archivedTopics.map((topic) => ({
    key: topic.key,
    title: topic.title,
    isActive: false,
    isArchived: true as const,
  }));
}

function buildProductSavePayload(
  form: FormState,
  slugLocked: boolean,
) {
  return {
    ...buildUnlockedProductIdentityFields({
      slugLocked,
      authorId: form.authorId,
      slug: form.slug,
    }),
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    description: form.description.trim() || null,
    product_kind: form.productKind,
    ...(form.publicationClass
      ? {
          publication_class: form.publicationClass,
          cabinet_branch: publicationClassToCabinetBranch(
            form.publicationClass,
          ),
        }
      : {}),
    music_usage_permission:
      form.productKind === PRODUCT_KIND.MUSIC
        ? form.musicUsagePermission
        : null,
    format:
      form.productKind === PRODUCT_KIND.MUSIC
        ? MUSIC_KIND_LABEL
        : form.productKind === PRODUCT_KIND.AUDIO_POST
          ? "Аудиопост"
          : resolveFormatForStorage(form.formatPreset, form.customFormat),
    is_free:
      form.productKind === PRODUCT_KIND.AUDIO_POST ? true : form.isFree,
    price:
      form.productKind === PRODUCT_KIND.AUDIO_POST || form.isFree
        ? 0
        : form.price,
    is_catalog_listed: form.catalogVisibility === CATALOG_VISIBILITY.LISTED,
    catalog_visibility: form.catalogVisibility,
    promo_enabled: form.promoEnabled,
    promo_title: form.promoTitle,
    promo_text: form.promoText,
    promo_button_text: form.promoButtonText,
    promo_url: form.promoUrl,
    promo_open_in_new_tab: form.promoOpenInNewTab,
    use_shared_cover: form.useSharedCover,
    listening_notice_enabled:
      form.productKind === PRODUCT_KIND.MUSIC
        ? false
        : form.listeningNoticeEnabled,
    listening_notice_title: form.listeningNoticeTitle,
    listening_notice_text: form.listeningNoticeText,
  };
}

export default function AuthorProductForm({
  authors,
  initialAuthorSlug,
  initialProduct,
  initialPublicationClass,
  topicFormData,
  mode,
}: AuthorProductFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm(
      authors,
      initialAuthorSlug,
      initialProduct,
      initialPublicationClass,
    ),
  );
  const [audioItems, setAudioItems] = useState<AudioItemRow[]>(() => {
    if (initialProduct?.audio_items) {
      return initialProduct.audio_items;
    }

    if (!shouldCreateDefaultAudioItem(initialPublicationClass)) {
      return [];
    }

    return [
      {
        id: "temp-1",
        practice_id: "temp",
        title:
          initialProduct?.practice.product_kind === PRODUCT_KIND.MUSIC ||
          initialPublicationClass === "release"
            ? "Трек 1"
            : "Аудио 1",
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
    ];
  });
  const [topicOptions, setTopicOptions] = useState<TopicOption[]>(
    topicFormData.topicOptions,
  );
  const [topicLimit, setTopicLimit] = useState(topicFormData.topicLimit);
  const [archivedTopics, setArchivedTopics] = useState<AssignedTopic[]>(
    topicFormData.archivedTopics,
  );
  const [topicKeys, setTopicKeys] = useState<string[]>(() =>
    buildInitialTopicKeys(topicFormData),
  );
  const [topicError, setTopicError] = useState<string | undefined>(undefined);
  const [submitIssueScrollKey, setSubmitIssueScrollKey] = useState(0);
  const [practiceId, setPracticeId] = useState(initialProduct?.practice.id ?? "");
  const practiceIdRef = useRef(initialProduct?.practice.id ?? "");
  const savedBaselineRef = useRef<string | null>(
    initialProduct
      ? serializeProductEditorBaseline(
          productDetailToFormSnapshot(initialProduct),
          initialProduct.audio_items,
        )
      : null,
  );
  const [editorDirty, setEditorDirty] = useState(() =>
    initialProduct
      ? false
      : true,
  );
  const [contentLockedAfterSale, setContentLockedAfterSale] = useState(
    initialProduct?.contentLockedAfterSale === true,
  );
  const [deleteLockedAfterPaidPurchase, setDeleteLockedAfterPaidPurchase] =
    useState(initialProduct?.deleteLockedAfterPaidPurchase === true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [courseContentSnapshot, setCourseContentSnapshot] =
    useState<CoursePublishContentSnapshot>({ lessonCount: 0, blockCount: 0 });
  const [publishing, setPublishing] = useState(false);
  const publishInFlightRef = useRef(false);
  const [uploadingAudioId, setUploadingAudioId] = useState<string | null>(null);
  const [savingSharedCover, setSavingSharedCover] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    subtitle?: string;
    description?: string;
    formatCustom?: string;
    listeningNoticeTitle?: string;
    listeningNoticeText?: string;
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

  function requestScrollToFirstSubmitIssue() {
    setSubmitIssueScrollKey((key) => key + 1);
  }

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

  useEffect(() => {
    if (submitIssueScrollKey === 0) {
      return;
    }

    document
      .querySelector<HTMLElement>("[data-submit-issue]")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [submitIssueScrollKey]);

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

  useEffect(() => {
    const current = serializeProductEditorBaseline(form, audioItems);
    setEditorDirty(isProductEditorDirty(current, savedBaselineRef.current));
  }, [form, audioItems]);

  const slugLocked =
    form.status === "published" ||
    form.status === "unpublished" ||
    Boolean(form.publishedAt);
  const visibleStatus = getVisibleAuthorProductStatus({
    status: form.status,
    moderationStatus: form.moderationStatus,
  });
  const isPublished =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.PUBLISHED;
  const isUnpublished =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.UNPUBLISHED;
  const isSubmitted =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.SUBMITTED;
  const needsChanges =
    visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.CHANGES_REQUESTED;
  const isDraft = visibleStatus === VISIBLE_AUTHOR_PRODUCT_STATUS.DRAFT;

  const selectedAuthor = useMemo(
    () => authors.find((author) => author.id === form.authorId) ?? null,
    [authors, form.authorId],
  );
  const selectedAuthorAccessStatus = selectedAuthor?.accessStatus ?? "free";
  const canBypassProductModeration =
    selectedAuthor?.canBypassProductModeration === true;
  const canMutateContent = authorAccessAllowsContentMutations(
    selectedAuthorAccessStatus,
  );
  const canEditPublicFields =
    canMutateContent &&
    (isDraft ||
      needsChanges ||
      (canBypassProductModeration && (isPublished || isUnpublished)));
  const isCourse = isCoursePublication(form.publicationClass, form.productKind);
  const canUsePaidPricing = authorAccessAllowsPaidProducts(
    selectedAuthorAccessStatus,
  );
  const paidPricingDisabledReason = getPaidPricingDisabledReason(
    selectedAuthorAccessStatus,
  );

  const publicPath =
    form.slug && selectedAuthor?.slug
      ? buildPracticePublicPath(selectedAuthor.slug, form.slug)
      : "";
  const publishPreviewPath =
    form.slug && selectedAuthor?.slug
      ? buildPracticePublishPreviewPath(selectedAuthor.slug, form.slug)
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
        product_kind: form.productKind,
        ...(form.publicationClass
          ? {
              publication_class: form.publicationClass,
              cabinet_branch: publicationClassToCabinetBranch(
                form.publicationClass,
              ),
            }
          : {}),
      }),
    });

    const payload = (await response.json()) as {
      product?: AuthorProductDetail;
      error?: string;
    };

    if (!response.ok || !payload.product?.practice.id) {
      logProductSaveFailure({
        stage: "create_draft",
        error: payload.error,
        status: response.status,
      });
      setError(
        getProductCreateErrorMessage({
          error: payload.error,
          status: response.status,
        }),
      );
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
    setContentLockedAfterSale(product.contentLockedAfterSale === true);
    setDeleteLockedAfterPaidPurchase(
      product.deleteLockedAfterPaidPurchase === true,
    );
  }

  function handleProductCoverUpdated({
    coverUrl,
    coverImage,
    product,
  }: {
    coverUrl: string | null;
    coverImage?: unknown;
    product?: AuthorProductDetail;
  }) {
    if (product) {
      applyServerProductPreservingDraft(product);
    } else {
      setForm((current) => ({
        ...current,
        coverUrl,
        coverImage: coverImage ?? null,
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

  async function applyTopicFormData(data: AuthorProductTopicFormData) {
    setTopicOptions(data.topicOptions);
    setTopicLimit(data.topicLimit);
    setArchivedTopics(data.archivedTopics);
    setTopicKeys(buildInitialTopicKeys(data));
  }

  async function syncProductTopics(targetPracticeId: string): Promise<boolean> {
    setTopicError(undefined);

    const response = await fetch(
      `/api/author/products/${targetPracticeId}/topics`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic_keys: getActiveTopicKeysForSync(topicKeys, archivedTopics),
        }),
      },
    );

    const payload = (await response.json()) as {
      topics?: AuthorProductTopicFormData;
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      setTopicError(
        payload.message ?? "Не удалось сохранить темы продукта.",
      );
      return false;
    }

    if (payload.topics) {
      await applyTopicFormData(payload.topics);
    }

    return true;
  }

  async function reloadSavedProduct(
    targetPracticeId: string,
  ): Promise<AuthorProductDetail | null> {
    const [productResponse, topicsResponse] = await Promise.all([
      fetch(`/api/author/products/${targetPracticeId}`, {
        cache: "no-store",
      }),
      fetch(`/api/author/products/${targetPracticeId}/topics`, {
        cache: "no-store",
      }),
    ]);

    const productPayload = (await productResponse.json()) as {
      product?: AuthorProductDetail;
      error?: string;
    };
    const topicsPayload = (await topicsResponse.json()) as {
      topics?: AuthorProductTopicFormData;
      error?: string;
    };

    if (!productResponse.ok || !productPayload.product) {
      return null;
    }

    setForm(
      buildInitialForm(authors, initialAuthorSlug, productPayload.product),
    );
    setAudioItems(productPayload.product.audio_items);

    if (topicsResponse.ok && topicsPayload.topics) {
      await applyTopicFormData(topicsPayload.topics);
    }

    return productPayload.product;
  }

  async function saveProduct(): Promise<boolean> {
    if (isSubmitted) {
      setError(PRODUCT_UNDER_MODERATION_MESSAGE);
      return false;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});
    setTopicError(undefined);

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
        message?: string;
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
            fieldKey === "formatCustom" ||
            fieldKey === "listeningNoticeTitle" ||
            fieldKey === "listeningNoticeText"
          ) {
            setFieldErrors({ [fieldKey]: fieldMessage });
            return false;
          }
        }

        logProductSaveFailure({
          stage: "patch_product",
          practiceId: id,
          error: payload.error,
          status: response.status,
        });
        setError(
          getProductSaveErrorMessage({
            error: payload.error,
            message: payload.message,
            status: response.status,
          }),
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

      const topicsSynced = await syncProductTopics(id);

      if (!topicsSynced) {
        setError("Не удалось сохранить темы продукта.");
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

      savedBaselineRef.current = serializeProductEditorBaseline(
        productDetailToFormSnapshot(reloaded),
        reloaded.audio_items,
      );
      setEditorDirty(applyProductEditorSaveToDirty({ dirty: true, saved: true }));
      router.refresh();
      return true;
    } catch {
      logProductSaveFailure({
        stage: "save_product",
        practiceId: practiceIdRef.current,
        networkError: true,
      });
      setError(getProductSaveErrorMessage({ networkError: true }));
      setEditorDirty(
        applyProductEditorSaveToDirty({ dirty: editorDirty, saved: false }),
      );
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
        isPublished || isUnpublished || form.publishedAt
          ? "Изменения сохранены."
          : "Черновик сохранён.",
      );
    }
  }

  async function openPublishPreviewTab(): Promise<boolean> {
    setBusy(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});
    setTopicError(undefined);

    const previewTab = window.open("about:blank", "_blank");

    try {
      const ensured = await ensurePracticeId();

      if (!ensured) {
        previewTab?.close();
        return false;
      }

      const saved = await saveProduct();

      if (!saved) {
        previewTab?.close();
        return false;
      }

      // saveProduct clears busy in its finally; keep the editor busy until the tab opens.
      setBusy(true);

      const productResponse = await fetch(
        `/api/author/products/${ensured.practiceId}`,
        { cache: "no-store" },
      );
      const productPayload = (await productResponse.json()) as {
        product?: AuthorProductDetail;
      };
      const practice = productPayload.product?.practice;
      const authorSlug =
        authors.find((author) => author.id === practice?.author_id)?.slug ??
        selectedAuthor?.slug;
      const productSlug = practice?.slug?.trim();

      if (!authorSlug || !productSlug) {
        previewTab?.close();
        setError("Не удалось открыть предпросмотр: нет публичного адреса.");
        return false;
      }

      const href = buildPracticePublishPreviewPath(authorSlug, productSlug);

      if (previewTab) {
        previewTab.opener = null;
        previewTab.location.href = href;
      } else {
        window.open(href, "_blank");
      }

      return true;
    } catch {
      previewTab?.close();
      setError("Не удалось открыть предпросмотр.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function publishProduct() {
    if (publishInFlightRef.current) {
      return;
    }

    if (
      shouldOpenPublishPreviewFromForm({
        publishedAt: form.publishedAt,
        canBypassProductModeration,
      })
    ) {
      await openPublishPreviewTab();
      return;
    }

    publishInFlightRef.current = true;
    setPublishing(true);
    setBusy(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});
    setTopicError(undefined);

    if (form.productKind === PRODUCT_KIND.PRACTICE) {
      if (!validateCustomFormatForPublish(form.formatPreset, form.customFormat)) {
        setFieldErrors({
          formatCustom: "Укажите название своего формата",
        });
        publishInFlightRef.current = false;
        setPublishing(false);
        setBusy(false);
        return;
      }

      if (isCustomFormatSelection(form.formatPreset)) {
        const lengthError = validateStoredFormatLength(form.customFormat);

        if (lengthError) {
          setFieldErrors({
            formatCustom: getProductFieldErrorMessage(lengthError) ?? undefined,
          });
          publishInFlightRef.current = false;
          setPublishing(false);
          setBusy(false);
          return;
        }
      }
    }

    const activeTopicCount = countActiveSelectedTopics(
      topicKeys,
      topicOptions,
      archivedTopics,
    );
    const topicMinimumCheck = assertPublishedTopicMinimum(activeTopicCount);

    if (!topicMinimumCheck.ok) {
      setTopicError(topicMinimumCheck.message);
      publishInFlightRef.current = false;
      setPublishing(false);
      setBusy(false);
      return;
    }

    const courseContentCheck = evaluateCoursePublishContentGate({
      publicationClass: form.publicationClass,
      productKind: form.productKind,
      publishedAt: form.publishedAt,
      lessonCount: courseContentSnapshot.lessonCount,
      blockCount: courseContentSnapshot.blockCount,
      lessons: courseContentSnapshot.lessons,
    });

    if (!courseContentCheck.ok) {
      setError(courseContentCheck.message);
      publishInFlightRef.current = false;
      setPublishing(false);
      setBusy(false);
      return;
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

      // saveProduct clears busy in its finally; keep publishing until redirect/error.
      setBusy(true);
      setPublishing(true);

      const response = await fetch(`/api/author/products/${id}/publish`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        error?: string;
        message?: string;
        publishReady?: boolean;
      };

      if (!response.ok) {
        if (isPublishNotReadyResponse(payload)) {
          setError(
            payload.message ?? PUBLISH_PREVIEW_NOT_READY_MESSAGE,
          );
        } else if (payload.error === "missing_custom_format") {
          setFieldErrors({
            formatCustom:
              payload.message ?? "Укажите название своего формата",
          });
        } else if (
          payload.error === "topic_min_required" ||
          payload.error === "topic_limit_exceeded" ||
          payload.error === "topic_not_found"
        ) {
          setTopicError(
            payload.message ?? "Не удалось опубликовать аудиопродукт.",
          );
        } else {
          setError(payload.message ?? "Не удалось опубликовать аудиопродукт.");
        }
        return;
      }

      const practice = payload.product?.practice;
      const authorSlug =
        authors.find((author) => author.id === practice?.author_id)?.slug ??
        selectedAuthor?.slug;
      const productSlug = practice?.slug?.trim();

      if (authorSlug && productSlug) {
        window.location.replace(
          buildPracticePublicPath(authorSlug, productSlug),
        );
        return;
      }

      if (payload.product) {
        applyServerProductPreservingDraft(payload.product);
      }

      setMessage(payload.message ?? "Аудиопродукт опубликован.");
    } catch {
      setError("Не удалось опубликовать аудиопродукт.");
    } finally {
      publishInFlightRef.current = false;
      setPublishing(false);
      setBusy(false);
    }
  }

  async function unpublishProduct() {
    if (!practiceId) {
      return;
    }

    if (
      !window.confirm(
        "Продукт исчезнет из публичного каталога и станет недоступен для новых покупок. Пользователи, которые уже приобрели его, сохранят доступ.",
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

  async function startEditingProduct() {
    if (!practiceId) {
      return;
    }

    const confirmed = window.confirm(
      isPublished
        ? "Продукт будет снят с публикации, а текущее одобрение модерации будет сброшено. После изменений его потребуется отправить на модерацию повторно."
        : "После перехода к редактированию повторная публикация без модерации станет недоступна.",
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/author/products/${practiceId}/start-editing`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.product) {
        setError(payload.message ?? "Не удалось перейти к редактированию.");
        return;
      }

      applyServerProductPreservingDraft(payload.product);
      setMessage(
        payload.message ??
          "Продукт готов к редактированию. После изменений отправьте его на модерацию.",
      );
    } catch {
      setError("Не удалось перейти к редактированию.");
    } finally {
      setBusy(false);
    }
  }

  async function submitForModeration() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});
    setTopicError(undefined);

    if (form.productKind === PRODUCT_KIND.PRACTICE) {
      if (!validateCustomFormatForPublish(form.formatPreset, form.customFormat)) {
        setFieldErrors({
          formatCustom: "Укажите название своего формата",
        });
        requestScrollToFirstSubmitIssue();
        setBusy(false);
        return;
      }
    }

    const activeTopicCount = countActiveSelectedTopics(
      topicKeys,
      topicOptions,
      archivedTopics,
    );
    const topicMinimumCheck = assertPublishedTopicMinimum(activeTopicCount);

    if (!topicMinimumCheck.ok) {
      setTopicError(topicMinimumCheck.message);
      requestScrollToFirstSubmitIssue();
      setBusy(false);
      return;
    }

    const courseContentCheck = evaluateCoursePublishContentGate({
      publicationClass: form.publicationClass,
      productKind: form.productKind,
      publishedAt: form.publishedAt,
      lessonCount: courseContentSnapshot.lessonCount,
      blockCount: courseContentSnapshot.blockCount,
      lessons: courseContentSnapshot.lessons,
    });

    if (!courseContentCheck.ok) {
      setError(courseContentCheck.message);
      requestScrollToFirstSubmitIssue();
      setBusy(false);
      return;
    }

    try {
      const ensured = await ensurePracticeId();
      if (!ensured) {
        requestScrollToFirstSubmitIssue();
        return;
      }
      const id = ensured.practiceId;
      const saved = await saveProduct();
      if (!shouldSubmitProductAfterSave(saved)) {
        requestScrollToFirstSubmitIssue();
        return;
      }

      const response = await fetch(
        `/api/author/products/${id}/submit-for-moderation`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        if (
          payload.error === "topic_min_required" ||
          payload.error === "topic_limit_exceeded" ||
          payload.error === "topic_not_found"
        ) {
          setTopicError(
            payload.message ?? "Не удалось отправить продукт на модерацию.",
          );
        } else {
          setError(
            payload.message ?? "Не удалось отправить продукт на модерацию.",
          );
        }
        requestScrollToFirstSubmitIssue();
        return;
      }

      if (payload.product) {
        applyServerProductPreservingDraft(payload.product);
      }
      setMessage(payload.message ?? "Продукт отправлен на модерацию.");
    } catch {
      setError("Не удалось отправить продукт на модерацию.");
      requestScrollToFirstSubmitIssue();
    } finally {
      setBusy(false);
    }
  }

  async function withdrawFromModeration() {
    if (!practiceId) {
      return;
    }

    const confirmed = window.confirm(
      "Отозвать продукт с модерации? После отзыва вы снова сможете его редактировать.",
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/author/products/${practiceId}/withdraw-from-moderation`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        product?: AuthorProductDetail;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? "Не удалось отозвать продукт с модерации.");
        return;
      }

      if (payload.product) {
        applyServerProductPreservingDraft(payload.product);
      }
      setMessage(
        payload.message ??
          "Продукт отозван с модерации. Теперь его можно редактировать.",
      );
    } catch {
      setError("Не удалось отозвать продукт с модерации.");
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
        "Продукт будет удалён из кабинета, каталога и пользовательских библиотек. Восстановление через кабинет автора не предусмотрено.",
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
      applyServerProductPreservingDraft(payload.product);
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
        message?: string;
      } | null = null;

      if (text) {
        try {
          payload = JSON.parse(text) as {
            product?: AuthorProductDetail;
            error?: string;
            message?: string;
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
          [audioId]: getAudioUploadErrorMessage(
            payload?.error,
            response.status,
            payload?.message,
          ),
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
      let payload: {
        product?: AuthorProductDetail;
        error?: string;
        message?: string;
      } | null = null;

      if (text) {
        try {
          payload = JSON.parse(text) as {
            product?: AuthorProductDetail;
            error?: string;
            message?: string;
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
          [audioId]:
            payload?.message?.trim() ||
            getAudioUploadErrorMessage(
              payload?.error,
              response.status,
              payload?.message,
            ) ||
            "Не удалось удалить MP3.",
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
    <div className="min-w-0 space-y-8">
      {selectedAuthor ? (
        <AuthorAccessStatusBanner accessStatus={selectedAuthorAccessStatus} />
      ) : null}

      {contentLockedAfterSale ? (
        <p className="rounded-[18px] border border-[#e4d7f4] bg-[#f8f4ff] px-4 py-3 text-sm text-[#5f5484]">
          Этот продукт уже приобретён слушателями. Его можно снять с публикации,
          но удалить продукт или аудиоматериалы нельзя.
        </p>
      ) : null}

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

      {isSubmitted ? (
        <div className="rounded-[18px] border border-[#c9d7f5] bg-[#f3f6ff] px-4 py-3 text-sm text-[#35518f]">
          <p className="font-semibold">На модерации</p>
          <p className="mt-1 leading-5">
            Продукт отправлен на модерацию. Пока проверка не завершена, основные
            данные и аудиоматериалы нельзя изменять.
          </p>
        </div>
      ) : null}

      {needsChanges ? (
        <div className="rounded-[18px] border border-[#f0d7a8] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5a16]">
          <p className="font-semibold">Требуются изменения</p>
          {form.moderationReviewComment ? (
            <p className="mt-2 whitespace-pre-wrap leading-5">
              {form.moderationReviewComment}
            </p>
          ) : null}
          <p className="mt-2 leading-5">
            Внесите необходимые изменения и повторно отправьте продукт на
            модерацию.
          </p>
        </div>
      ) : null}

      <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px] font-semibold">Основная информация</h2>
          {mode === "edit" ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClassName(
                form.status,
                form.moderationStatus,
              )}`}
            >
              {getStatusLabel(form.status, form.moderationStatus)}
            </span>
          ) : null}
        </div>

        <div
          className="rounded-[18px] border border-[#e4d7f4] bg-[#fbf8ff] px-4 py-3"
          role="note"
          aria-label={PRODUCT_LANGUAGE_GUIDELINES.formNotice.title}
        >
          <p className="text-sm font-semibold text-[#3f3560]">
            {PRODUCT_LANGUAGE_GUIDELINES.formNotice.title}
          </p>
          <p className="mt-1.5 text-sm leading-5 text-[#5f5484]">
            {PRODUCT_LANGUAGE_GUIDELINES.formNotice.body}{" "}
            <Link
              href={PRODUCT_LANGUAGE_GUIDELINES.helpArticlePath}
              className="font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Подробнее в справке
            </Link>
          </p>
        </div>

        {mode === "create" && selectedAuthor ? (
          <p className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#5f5484]">
            Продукт будет опубликован от проекта{" "}
            <span className="font-semibold text-[#25135c]">
              «{selectedAuthor.name}»
            </span>
            .
          </p>
        ) : (
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Проект</span>
            <select
              value={form.authorId}
              disabled={slugLocked}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  authorId: event.target.value,
                }))
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
        )}

        <fieldset className="block">
          <legend className="mb-2 block text-sm font-medium">Тип продукта</legend>
          {form.publicationClass ? (
            publicationClassToCabinetBranch(form.publicationClass) ===
            "product" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    {
                      value: "practice",
                      description:
                        "Медитации, практики, программы и другие аудиоматериалы.",
                    },
                    {
                      value: "course",
                      description:
                        "Курс из нескольких материалов в одной публикации.",
                    },
                    {
                      value: "audiobook",
                      description: "Аудиокнига как отдельный продукт.",
                    },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${form.publicationClass === option.value ? "border-[#9a74d8] bg-[#f8f4ff]" : "border-[#e4d7f4] bg-white"} ${!canChangeProductKind(form.publishedAt) ? "opacity-70" : ""}`}
                  >
                    <input
                      type="radio"
                      name="publication_class"
                      className="mt-1"
                      checked={form.publicationClass === option.value}
                      disabled={
                        busy || !canChangeProductKind(form.publishedAt)
                      }
                      onChange={() => {
                        setForm((current) => ({
                          ...current,
                          publicationClass: option.value,
                          productKind: publicationClassToLegacyKind(
                            option.value,
                          ),
                          musicUsagePermission: null,
                        }));
                      }}
                    />
                    <span>
                      <span className="block text-sm font-medium text-[#3f3560]">
                        {AUTHOR_PUBLICATION_CLASS_LABELS[option.value]}
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#5f5484]">
                {AUTHOR_PUBLICATION_CLASS_LABELS[form.publicationClass]}
              </p>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
            <label className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${form.productKind === PRODUCT_KIND.PRACTICE ? "border-[#9a74d8] bg-[#f8f4ff]" : "border-[#e4d7f4] bg-white"} ${!canChangeProductKind(form.publishedAt) ? "opacity-70" : ""}`}>
              <input
                type="radio"
                name="product_kind"
                className="mt-1"
                checked={form.productKind === PRODUCT_KIND.PRACTICE}
                disabled={busy || !canChangeProductKind(form.publishedAt)}
                onChange={() => {
                  setForm((current) => ({
                    ...current,
                    productKind: PRODUCT_KIND.PRACTICE,
                    publicationClass: null,
                    musicUsagePermission: null,
                    formatPreset: "",
                    customFormat: "",
                  }));
                }}
              />
              <span>
                <span className="block text-sm font-medium text-[#3f3560]">Аудиопрактика</span>
                <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                  Медитации, практики, программы и другие аудиоматериалы.
                </span>
              </span>
            </label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${form.productKind === PRODUCT_KIND.MUSIC ? "border-[#9a74d8] bg-[#f8f4ff]" : "border-[#e4d7f4] bg-white"} ${!canChangeProductKind(form.publishedAt) ? "opacity-70" : ""}`}>
              <input
                type="radio"
                name="product_kind"
                className="mt-1"
                checked={form.productKind === PRODUCT_KIND.MUSIC}
                disabled={busy || !canChangeProductKind(form.publishedAt)}
                onChange={() => {
                  setForm((current) => ({
                    ...current,
                    productKind: PRODUCT_KIND.MUSIC,
                    publicationClass: null,
                    musicUsagePermission:
                      current.musicUsagePermission ??
                      MUSIC_USAGE_PERMISSION.LISTEN_ONLY,
                    formatPreset: "",
                    customFormat: "",
                    listeningNoticeEnabled: false,
                  }));
                  setAudioItems((current) =>
                    current.map((item, index) =>
                      isDefaultAudioTitle(item.title, index + 1)
                        ? { ...item, title: `Трек ${index + 1}` }
                        : item,
                    ),
                  );
                }}
              />
              <span>
                <span className="block text-sm font-medium text-[#3f3560]">Музыка</span>
                <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                  Отдельный трек или альбом из нескольких аудиофайлов.
                </span>
              </span>
            </label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${form.productKind === PRODUCT_KIND.AUDIO_POST ? "border-[#9a74d8] bg-[#f8f4ff]" : "border-[#e4d7f4] bg-white"} ${!canChangeProductKind(form.publishedAt) ? "opacity-70" : ""}`}>
              <input
                type="radio"
                name="product_kind"
                className="mt-1"
                checked={form.productKind === PRODUCT_KIND.AUDIO_POST}
                disabled={busy || !canChangeProductKind(form.publishedAt)}
                onChange={() => {
                  setForm((current) => ({
                    ...current,
                    productKind: PRODUCT_KIND.AUDIO_POST,
                    publicationClass: null,
                    musicUsagePermission: null,
                    formatPreset: "",
                    customFormat: "",
                    isFree: true,
                    price: 0,
                    useSharedCover: true,
                    listeningNoticeEnabled: false,
                  }));
                }}
              />
              <span>
                <span className="block text-sm font-medium text-[#3f3560]">Аудиопост</span>
                <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                  Бесплатный аудиоматериал с возможной рекомендацией после прослушивания.
                </span>
              </span>
            </label>
            </div>
          )}
          {!canChangeProductKind(form.publishedAt) ? (
            <p className="mt-2 text-sm text-[#7d70a2]">
              Тип продукта нельзя изменить после первой публикации.
            </p>
          ) : null}
        </fieldset>

        <label
          className="block"
          data-submit-issue={fieldErrors.title ? "" : undefined}
        >
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
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
            {PRODUCT_LANGUAGE_GUIDELINES.fieldHints.title}
          </p>
          <CharCounter value={form.title} max={PRODUCT_CONTENT_LIMITS.title} />
          {fieldErrors.title ? (
            <p className="mt-2 text-sm text-[#9b3d3d]">{fieldErrors.title}</p>
          ) : null}
        </label>

        <label
          className="block"
          data-submit-issue={fieldErrors.subtitle ? "" : undefined}
        >
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
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
            {PRODUCT_LANGUAGE_GUIDELINES.fieldHints.subtitle}
          </p>
          <CharCounter
            value={form.subtitle}
            max={PRODUCT_CONTENT_LIMITS.subtitle}
          />
          {fieldErrors.subtitle ? (
            <p className="mt-2 text-sm text-[#9b3d3d]">{fieldErrors.subtitle}</p>
          ) : null}
        </label>

        <label
          className="block"
          data-submit-issue={fieldErrors.description ? "" : undefined}
        >
          <span className="mb-2 block text-sm font-medium">
            {form.productKind === PRODUCT_KIND.AUDIO_POST
              ? "Описание (необязательно)"
              : "Описание"}
          </span>
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
          <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
            {PRODUCT_LANGUAGE_GUIDELINES.fieldHints.description}
          </p>
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

        {form.productKind === PRODUCT_KIND.PRACTICE ? (
        <>
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
            <label
              className="block"
              data-submit-issue={fieldErrors.formatCustom ? "" : undefined}
            >
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
        </>
        ) : null}

        {form.productKind === PRODUCT_KIND.AUDIO_POST ? (
          <div>
            <span className="mb-2 block text-sm font-medium">Формат</span>
            <p className="rounded-[18px] border border-[#e4d7f4] bg-[#fbf8ff] px-4 py-3 text-sm text-[#5f5484]">
              Аудиопост
            </p>
          </div>
        ) : null}

        {form.productKind === PRODUCT_KIND.MUSIC ? (
          <fieldset className="block space-y-3">
            <legend className="mb-1 block text-sm font-medium">
              Условия использования музыки
            </legend>
            <p className="text-sm leading-5 text-[#7d70a2]">
              {MUSIC_USAGE_PERMISSION_INTRO}
            </p>
            {(
              [
                MUSIC_USAGE_PERMISSION.LISTEN_ONLY,
                MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED,
              ] as const
            ).map((value) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${
                  form.musicUsagePermission === value
                    ? "border-[#9a74d8] bg-[#f8f4ff]"
                    : "border-[#e4d7f4] bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="music_usage_permission"
                  className="mt-1"
                  checked={form.musicUsagePermission === value}
                  disabled={busy}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      musicUsagePermission: value,
                    }))
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-[#3f3560]">
                    {getMusicUsagePermissionLabel(value)}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                    {getMusicUsagePermissionDescription(value)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <div data-submit-issue={topicError ? "" : undefined}>
          <span className="mb-2 block text-sm font-medium">Темы</span>
          <TopicSelector
            options={mapTopicOptionsForSelector(topicOptions)}
            archivedTopics={mapArchivedTopicsForSelector(archivedTopics)}
            value={topicKeys}
            limit={topicLimit}
            disabled={busy || reorderBusy}
            error={topicError}
            onChange={(keys) => {
              setTopicError(undefined);
              setTopicKeys(keys);
            }}
          />
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
          coverImage={form.coverImage}
          buildUploadUrl={(id) => `/api/author/products/${id}/cover`}
          buildDeleteUrl={(id) => `/api/author/products/${id}/cover`}
          getPracticeId={getPracticeIdForCoverUpload}
          onUpdated={handleProductCoverUpdated}
          hint={`${PRODUCT_LANGUAGE_GUIDELINES.coverTechnicalHint}. ${PRODUCT_LANGUAGE_GUIDELINES.fieldHints.cover}`}
          uploadLabel="Загрузить обложку"
          replaceLabel="Заменить обложку"
        />

        {isProductGalleryEligible(form.publicationClass, form.productKind) ? (
          <AuthorProductGallery
            practiceId={practiceId || null}
            initialSlides={initialProduct?.gallery_slides ?? []}
            getPracticeId={getPracticeIdForCoverUpload}
            disabled={!canMutateContent || busy}
          />
        ) : null}

        {shouldShowSharedTrackCoverToggle(
          form.publicationClass,
          form.productKind,
        ) ? (
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
        ) : null}

        {form.productKind !== PRODUCT_KIND.AUDIO_POST ? (
        <div>
          <span className="mb-2 block text-sm font-medium">Цена</span>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, isFree: true }))}
              disabled={!canEditPublicFields}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                form.isFree
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#c6afe6] text-[#7042c5]"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {AUTHOR_PRODUCT_FREE_PRICE_LABEL}
            </button>
            <button
              type="button"
              disabled={!canMutateContent || !canUsePaidPricing}
              onClick={() =>
                setForm((current) => ({ ...current, isFree: false, price: 99 }))
              }
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                !form.isFree
                  ? "bg-[#7042c5] text-white"
                  : "border border-[#c6afe6] text-[#7042c5]"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              Платно
            </button>
          </div>

          {!canUsePaidPricing && paidPricingDisabledReason ? (
            <div className="mt-2 space-y-1 text-sm leading-5 text-[#7d70a2]">
              <p>{paidPricingDisabledReason}</p>
              <p>
                <a
                  href={
                    selectedAuthor?.slug
                      ? buildAuthorStatusHref(selectedAuthor.slug)
                      : buildCommercialStatusHelpHref()
                  }
                  className="font-medium text-[#7042c5] underline-offset-2 hover:underline"
                >
                  {PAID_PRICING_COMMERCIAL_STATUS_MORE_LABEL}
                </a>
              </p>
            </div>
          ) : null}

          {!form.isFree ? (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm text-[#7d70a2]">
                  Полная цена, ₽
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_PAID_PRICE_RUB}
                  max={MAX_PAID_PRICE_RUB}
                  step={1}
                  value={form.price}
                  disabled={!canEditPublicFields}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setForm((current) => ({
                      ...current,
                      price: Number.isInteger(next) ? next : current.price,
                    }));
                  }}
                  className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {PAID_PRICE_OPTIONS.map((price) => (
                  <button
                    key={price}
                    type="button"
                    disabled={!canEditPublicFields}
                    onClick={() =>
                      setForm((current) => ({ ...current, price }))
                    }
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                      form.price === price
                        ? "bg-[#7042c5] text-white"
                        : "border border-[#c6afe6] text-[#7042c5]"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {formatRubles(price)}
                  </button>
                ))}
              </div>
              <p className="text-sm text-[#7d70a2]">
                Можно указать любую сумму от {MIN_PAID_PRICE_RUB} до{" "}
                {MAX_PAID_PRICE_RUB.toLocaleString("ru-RU")} ₽. Подсказки только
                заполняют поле.
              </p>
            </div>
          ) : null}

          {!form.isFree ? (
            <div className="mt-5">
              <span className="mb-2 block text-sm font-medium">Акции</span>
              <AuthorProductPromotions
                practiceId={practiceId || null}
                basePrice={form.price}
                disabled={!canEditPublicFields || busy}
                authorSlug={selectedAuthor?.slug ?? null}
                productSlug={form.slug || null}
              />
            </div>
          ) : null}
        </div>
        ) : null}

        <fieldset className="block">
          <legend className="mb-2 block text-sm font-medium">
            Кому показывать продукт?
          </legend>
          <div className="grid gap-3">
            <label className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${form.catalogVisibility === CATALOG_VISIBILITY.LISTED ? "border-[#9a74d8] bg-[#f8f4ff]" : "border-[#e4d7f4] bg-white"}`}>
              <input
                type="radio"
                name="catalog_visibility"
                className="mt-1"
                checked={form.catalogVisibility === CATALOG_VISIBILITY.LISTED}
                disabled={busy}
                onChange={() =>
                  setForm((current) => ({
                    ...current,
                    catalogVisibility: CATALOG_VISIBILITY.LISTED,
                    isCatalogListed: true,
                  }))
                }
              />
              <span>
                <span className="block text-sm font-medium text-[#3f3560]">Всем</span>
                <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                  Обычный продукт каталога. Виден всем в каталоге и по прямой ссылке.
                </span>
              </span>
            </label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${form.catalogVisibility === CATALOG_VISIBILITY.SELECTED_USERS ? "border-[#9a74d8] bg-[#f8f4ff]" : "border-[#e4d7f4] bg-white"}`}>
              <input
                type="radio"
                name="catalog_visibility"
                className="mt-1"
                checked={form.catalogVisibility === CATALOG_VISIBILITY.SELECTED_USERS}
                disabled={busy}
                onChange={() =>
                  setForm((current) => ({
                    ...current,
                    catalogVisibility: CATALOG_VISIBILITY.SELECTED_USERS,
                    isCatalogListed: false,
                  }))
                }
              />
              <span>
                <span className="block text-sm font-medium text-[#3f3560]">
                  Только выбранным пользователям
                </span>
                <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                  В каталоге видят только добавленные пользователи. Остальным продукт не существует.
                </span>
              </span>
            </label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${form.catalogVisibility === CATALOG_VISIBILITY.UNLISTED ? "border-[#9a74d8] bg-[#f8f4ff]" : "border-[#e4d7f4] bg-white"}`}>
              <input
                type="radio"
                name="catalog_visibility"
                className="mt-1"
                checked={form.catalogVisibility === CATALOG_VISIBILITY.UNLISTED}
                disabled={busy}
                onChange={() =>
                  setForm((current) => ({
                    ...current,
                    catalogVisibility: CATALOG_VISIBILITY.UNLISTED,
                    isCatalogListed: false,
                  }))
                }
              />
              <span>
                <span className="block text-sm font-medium text-[#3f3560]">
                  Только по ссылке
                </span>
                <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                  Не показывается в каталоге. Любой, у кого есть ссылка, может открыть страницу.
                </span>
              </span>
            </label>
          </div>
          {form.catalogVisibility === CATALOG_VISIBILITY.SELECTED_USERS ? (
            <PracticeVisibilityUsersEditor
              practiceId={practiceId || null}
              disabled={busy}
            />
          ) : null}
        </fieldset>
      </section>

      {isCourse ? (
        <AuthorCourseBuilder
          practiceId={practiceId || null}
          getPracticeId={getPracticeIdForCoverUpload}
          disabled={!canMutateContent || busy}
          onContentSnapshotChange={setCourseContentSnapshot}
        />
      ) : null}

      {shouldShowPracticeListeningNotice(
        form.publicationClass,
        form.productKind,
      ) ? (
      <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-[20px] font-semibold">
          Рекомендации перед прослушиванием
        </h2>

        <div className="rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.listeningNoticeEnabled}
              disabled={busy}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  listeningNoticeEnabled: event.target.checked,
                }))
              }
              className="mt-1 h-4 w-4 shrink-0 rounded border-[#c6afe6] text-[#7042c5] focus:ring-[#9a74d8]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[#3f3560]">
                Показывать рекомендации на странице продукта
              </span>
              <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                Блок отображается на публичной странице продукта и на экране
                прослушивания.
              </span>
            </span>
          </label>
        </div>

        <div
          className={`space-y-4 ${form.listeningNoticeEnabled ? "" : "pointer-events-none opacity-50"}`}
        >
          <label
            className="block"
            data-submit-issue={
              fieldErrors.listeningNoticeTitle ? "" : undefined
            }
          >
            <span className="mb-2 block text-sm font-medium">Заголовок</span>
            <input
              value={form.listeningNoticeTitle}
              maxLength={PRODUCT_CONTENT_LIMITS.listeningNoticeTitle}
              disabled={!form.listeningNoticeEnabled || busy}
              onChange={(event) => {
                setFieldErrors((current) => ({
                  ...current,
                  listeningNoticeTitle: undefined,
                }));
                setForm((current) => ({
                  ...current,
                  listeningNoticeTitle: event.target.value,
                }));
              }}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
            />
            <CharCounter
              value={form.listeningNoticeTitle}
              max={PRODUCT_CONTENT_LIMITS.listeningNoticeTitle}
            />
            {fieldErrors.listeningNoticeTitle ? (
              <p className="mt-2 text-sm text-[#9b3d3d]">
                {fieldErrors.listeningNoticeTitle}
              </p>
            ) : null}
          </label>

          <label
            className="block"
            data-submit-issue={
              fieldErrors.listeningNoticeText ? "" : undefined
            }
          >
            <span className="mb-2 block text-sm font-medium">
              Текст рекомендаций
            </span>
            <textarea
              value={form.listeningNoticeText}
              maxLength={PRODUCT_CONTENT_LIMITS.listeningNoticeText}
              disabled={!form.listeningNoticeEnabled || busy}
              onChange={(event) => {
                setFieldErrors((current) => ({
                  ...current,
                  listeningNoticeText: undefined,
                }));
                setForm((current) => ({
                  ...current,
                  listeningNoticeText: event.target.value,
                }));
              }}
              rows={5}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
            />
            <CharCounter
              value={form.listeningNoticeText}
              max={PRODUCT_CONTENT_LIMITS.listeningNoticeText}
            />
            {fieldErrors.listeningNoticeText ? (
              <p className="mt-2 text-sm text-[#9b3d3d]">
                {fieldErrors.listeningNoticeText}
              </p>
            ) : null}
          </label>

          <button
            type="button"
            disabled={!form.listeningNoticeEnabled || busy}
            onClick={() =>
              setForm((current) => ({
                ...current,
                listeningNoticeTitle: DEFAULT_LISTENING_NOTICE_TITLE,
                listeningNoticeText: DEFAULT_LISTENING_NOTICE_TEXT,
              }))
            }
            className="text-sm font-semibold text-[#7042c5] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Вернуть стандартный текст
          </button>
        </div>
      </section>
      ) : null}

      {form.productKind === PRODUCT_KIND.AUDIO_POST ? (
        <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
          <h2 className="text-[20px] font-semibold">
            Рекомендация после прослушивания
          </h2>
          <label className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-3">
            <input
              type="checkbox"
              checked={form.promoEnabled}
              disabled={busy}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  promoEnabled: event.target.checked,
                }))
              }
              className="mt-1 h-4 w-4 shrink-0 rounded border-[#c6afe6] text-[#7042c5] focus:ring-[#9a74d8]"
            />
            <span className="text-sm font-medium text-[#3f3560]">
              Показывать рекомендацию
            </span>
          </label>
          <div className={`space-y-4 ${form.promoEnabled ? "" : "pointer-events-none opacity-50"}`}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Заголовок</span>
              <input
                value={form.promoTitle}
                maxLength={PROMO_RECOMMENDATION_TITLE_MAX_LENGTH}
                disabled={!form.promoEnabled || busy}
                onChange={(event) => setForm((current) => ({ ...current, promoTitle: event.target.value }))}
                className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
              />
              <CharCounter value={form.promoTitle} max={PROMO_RECOMMENDATION_TITLE_MAX_LENGTH} />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Текст</span>
              <textarea
                value={form.promoText}
                maxLength={PROMO_RECOMMENDATION_TEXT_MAX_LENGTH}
                disabled={!form.promoEnabled || busy}
                onChange={(event) => setForm((current) => ({ ...current, promoText: event.target.value }))}
                rows={4}
                className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
              />
              <CharCounter value={form.promoText} max={PROMO_RECOMMENDATION_TEXT_MAX_LENGTH} />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Текст кнопки</span>
              <input
                value={form.promoButtonText}
                maxLength={PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH}
                disabled={!form.promoEnabled || busy}
                onChange={(event) => setForm((current) => ({ ...current, promoButtonText: event.target.value }))}
                className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
              />
              <CharCounter value={form.promoButtonText} max={PROMO_RECOMMENDATION_BUTTON_TEXT_MAX_LENGTH} />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Ссылка</span>
              <input
                type="url"
                value={form.promoUrl}
                disabled={!form.promoEnabled || busy}
                onChange={(event) => setForm((current) => ({ ...current, promoUrl: event.target.value }))}
                className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
                placeholder="https://"
              />
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-[#5f5484]">
              <input
                type="checkbox"
                checked={form.promoOpenInNewTab}
                disabled={!form.promoEnabled || busy}
                onChange={(event) => setForm((current) => ({ ...current, promoOpenInNewTab: event.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#c6afe6] text-[#7042c5] focus:ring-[#9a74d8]"
              />
              Открывать ссылку в новой вкладке
            </label>
          </div>
        </section>
      ) : null}

      {isCourse ? null : (
      <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-[20px] font-semibold">
          {form.productKind === PRODUCT_KIND.MUSIC
            ? "Треки"
            : "Содержание аудиопродукта"}
        </h2>

        {reorderNotice ? (
          <p className="text-sm text-[#9b3d3d]">{reorderNotice}</p>
        ) : null}

        <div className="space-y-4">
          {audioItems.map((audioItem, index) => (
            <article
              key={audioItem.id}
              ref={(element) => setItemElement(audioItem.id, element)}
              data-submit-issue={
                audioFieldErrors[audioItem.id]?.title ||
                audioFieldErrors[audioItem.id]?.description ||
                audioUploadErrors[audioItem.id]
                  ? ""
                  : undefined
              }
              className={`rounded-[20px] border bg-[#fbf8ff] p-4 transition ${
                draggingAudioId === audioItem.id
                  ? "border-[#9a74d8] opacity-70 shadow-sm"
                  : dragOverIndex === index && draggingAudioId
                    ? "border-[#9a74d8] ring-2 ring-[#d9c9ef]"
                    : "border-[#eee6f7]"
              }`}
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {form.productKind !== PRODUCT_KIND.AUDIO_POST ? (
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
                  ) : null}
                  <h3 className="font-semibold">Аудио {index + 1}</h3>
                </div>
                {form.productKind !== PRODUCT_KIND.AUDIO_POST ? (
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
                ) : null}
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

              {!form.useSharedCover && form.productKind !== PRODUCT_KIND.AUDIO_POST ? (
                <div className="mt-4">
                  <CoverUploadBlock
                    label="Обложка трека"
                    coverUrl={audioItem.cover_url}
                    coverImage={audioItem.cover_image}
                    coverVersion={
                      audioItem.cover_url ? audioItem.updated_at : null
                    }
                    previewWidth={80}
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
                  {contentLockedAfterSale && audioItem.audio_path ? null : (
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
                  )}

                  {audioItem.audio_path && !contentLockedAfterSale ? (
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

                  {audioItems.length > 1 && !contentLockedAfterSale ? (
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

          {form.productKind !== PRODUCT_KIND.AUDIO_POST ? (
          <button
            type="button"
            disabled={busy || reorderBusy || !canEditPublicFields}
            onClick={() => void addAudioItem()}
            className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Добавить аудио
          </button>
          ) : null}
        </div>
      </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          disabled={busy || !canEditPublicFields}
          onClick={() => void saveDraft()}
          className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
        >
          {isPublished || isUnpublished || form.publishedAt
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
              disabled={busy || !canMutateContent}
              onClick={() => void startEditingProduct()}
              className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
            >
              Снять и редактировать
            </button>
          </>
        ) : null}

        {isUnpublished ? (
          <>
            <button
              type="button"
              disabled={busy || !canMutateContent}
              onClick={() => void startEditingProduct()}
              className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
            >
              Перейти к редактированию
            </button>
            <button
              type="button"
              disabled={busy || !canMutateContent || !publishPreviewPath}
              onClick={() => void openPublishPreviewTab()}
              className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
            >
              Предпросмотр
            </button>
            <button
              type="button"
              disabled={busy || publishing || !canMutateContent}
              onClick={() => void publishProduct()}
              className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
            >
              {publishing ? "Публикуем…" : "Опубликовать снова"}
            </button>
          </>
        ) : null}

        {isDraft && canBypassProductModeration ? (
          <>
            <button
              type="button"
              disabled={busy || publishing || !canMutateContent}
              onClick={() => void openPublishPreviewTab()}
              className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
            >
              Предпросмотр
            </button>
            <button
              type="button"
              disabled={busy || publishing || !canMutateContent}
              onClick={() => void publishProduct()}
              className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
            >
              {publishing ? "Публикуем…" : "Опубликовать"}
            </button>
          </>
        ) : null}

        {isDraft && !canBypassProductModeration ? (
          <>
            <button
              type="button"
              disabled={busy || !canEditPublicFields}
              onClick={() => void openPublishPreviewTab()}
              className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
            >
              Предпросмотр
            </button>
            <button
              type="button"
              disabled={busy || !canEditPublicFields}
              onClick={() => void submitForModeration()}
              className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
            >
              Отправить на модерацию
            </button>
          </>
        ) : null}

        {needsChanges ? (
          <button
            type="button"
            disabled={busy || !canEditPublicFields}
            onClick={() => void submitForModeration()}
            className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
          >
            Повторно отправить на модерацию
          </button>
        ) : null}

        {error &&
        ((isDraft && !canBypassProductModeration) || needsChanges) ? (
          <p
            data-submit-issue
            className="w-full rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]"
          >
            {error}
          </p>
        ) : null}

        {isSubmitted &&
        canWithdrawPracticeFromModeration({
          moderationStatus: form.moderationStatus,
        }) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void withdrawFromModeration()}
            className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Отозвать с модерации
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

        {mode === "edit" && practiceId && !deleteLockedAfterPaidPurchase ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void deleteProduct()}
            className="rounded-[22px] border border-[#f2c7c7] px-5 py-4 font-semibold text-[#9b3d3d] disabled:opacity-60"
          >
            Удалить продукт
          </button>
        ) : null}

        {mode === "edit" && practiceId && deleteLockedAfterPaidPurchase ? (
          <p className="w-full text-sm text-[#9b3d3d]">
            Удалить этот продукт нельзя, потому что его уже приобрели
            пользователи. Вы можете снять продукт с публикации – новые покупки
            прекратятся, а прежние покупатели сохранят доступ.
          </p>
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
