"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AudioDragHandle } from "@/components/author-dashboard/AudioDragHandle";
import AuthorCourseBuilder from "@/components/author-dashboard/AuthorCourseBuilder";
import { AuthorPracticeAccessLinks } from "@/components/author-dashboard/AuthorPracticeAccessLinks";
import AuthorProductGallery from "@/components/author-dashboard/AuthorProductGallery";
import CoverUploadBlock from "@/components/author-dashboard/CoverUploadBlock";
import { AuthorProductCharCounter as CharCounter } from "@/components/author-dashboard/product-form-sections/AuthorProductCharCounter";
import AuthorProductFormActions from "@/components/author-dashboard/product-form-sections/AuthorProductFormActions";
import AuthorProductWizardStepNav from "@/components/author-dashboard/product-wizard/AuthorProductWizardStepNav";
import AuthorProductWizardStepper from "@/components/author-dashboard/product-wizard/AuthorProductWizardStepper";
import AuthorProductFormStatusNotices from "@/components/author-dashboard/product-form-sections/AuthorProductFormStatusNotices";
import AuthorProductListeningNoticeSection from "@/components/author-dashboard/product-form-sections/AuthorProductListeningNoticeSection";
import AuthorProductPostListenPromoSection from "@/components/author-dashboard/product-form-sections/AuthorProductPostListenPromoSection";
import { useAudioItemsReorder } from "@/components/author-dashboard/useAudioItemsReorder";
import AuthorProductPromotions from "@/components/author-dashboard/AuthorProductPromotions";
import AuthorProductSeoSection from "@/components/author-dashboard/AuthorProductSeoSection";
import AuthorPublishedProductSeoQueryLinker from "@/components/author-dashboard/AuthorPublishedProductSeoQueryLinker";
import type { PracticeSeoContentInput } from "@/lib/products/practice-seo-content";
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
  getVisibleAuthorProductStatus,
  shouldSaveProductBeforePublish,
} from "@/lib/author-products/moderation";
import { isAuthorProductWizardEnabled } from "@/lib/author-products/product-wizard-beta";
import { isPublishedProductSeoAttachEnabled } from "@/lib/seo-queries/published-product-seo-attach-gate";
import {
  buildAuthorProductEditPath,
  buildWizardStepHref,
  nextProductWizardStep,
  previousProductWizardStep,
  shouldShowProductWizardStep,
} from "@/lib/author-products/product-wizard-navigation";
import {
  PRODUCT_WIZARD_DEFAULT_STEP,
  PRODUCT_WIZARD_STEP_COUNT,
  type ProductWizardStep,
} from "@/lib/author-products/product-wizard-steps";
import { isMusicProductWizardEnabled } from "@/lib/author-products/music-product-wizard";
import {
  CATALOG_SECTION_FIELD_LABEL,
  CATALOG_SECTION_FIELD_OPTIONS,
  buildCatalogSectionSaveField,
  isCatalogSectionFieldEnabled,
  readStoredCatalogSection,
  suggestCatalogSection,
  suggestCatalogSectionFromFormFields,
} from "@/lib/author-products/catalog-section-field";
import {
  isCatalogSection,
  type CatalogSection,
} from "@/lib/catalog/catalog-sections";
import type { SeoReservationProductFormContext } from "@/lib/seo-queries/seo-reservation-product-context";
import { linkSeoReservationToProduct } from "@/lib/seo-queries/seo-reservation-product-context";
import {
  AUDIO_PRODUCT_AUTHOR_REQUIRED_MESSAGE,
  hasAudioProductAuthor,
} from "@/lib/author-products/audio-product-author";
import { validateMusicTrackTitleCyrillic } from "@/lib/author-products/music-track-title";
import {
  AUDIO_POST_CUSTOM_TYPE_FIELD_LABEL,
  AUDIO_POST_CUSTOM_TYPE_LABEL,
  AUDIO_POST_CUSTOM_TYPE_PLACEHOLDER,
  AUDIO_POST_PRESET_FORMATS,
  CUSTOM_FORMAT_LABEL,
  CUSTOM_FORMAT_VALUE,
  PRODUCT_PRESET_FORMATS,
  isCustomFormatSelection,
  resolveAudioPostFormatForStorage,
  resolveFormatForStorage,
} from "@/lib/author-products/format";
import { PRODUCT_LANGUAGE_GUIDELINES } from "@/lib/author-products/language-guidelines";
import {
  AUTHOR_DESCRIPTION_HELPER,
  AUTHOR_DESCRIPTION_LABEL,
} from "@/lib/products/product-copy";
import {
  AUDIO_POST_KIND_LABEL,
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
import { uploadAuthorProductAudioDirect } from "@/lib/author-products/direct-audio-upload-client";
import { uploadMusicMasterDirect } from "@/lib/author-products/music-master-upload-client";
import { validateMusicMasterFileClient } from "@/lib/author-products/music-master-upload-contract";
import {
  MUSIC_DELIVERY_REPLACE_LABEL,
  MUSIC_DELIVERY_UNSUPPORTED_TEXT,
  MUSIC_DELIVERY_UPLOAD_HINT,
  MUSIC_DELIVERY_UPLOAD_LABEL,
  hasPlayableAuthorAudioPreview,
  musicCabinetStatus,
  resolveMusicUploadMode,
} from "@/lib/listen/music-delivery";
import {
  PRODUCT_AUDIO_FILE_ACCEPT,
  PRODUCT_AUDIO_SIZE_HINT,
  PRODUCT_CONTENT_LIMITS,
  getAudioUploadErrorMessage,
  getProductFieldErrorMessage,
  getProductFieldKeyForError,
  validateOrdinaryProductAudioFileClient,
  validateStoredFormatLength,
  type ProductFieldErrorCode,
} from "@/lib/author-products/limits";
import {
  AUDIO_PREPARE_FAILED_MESSAGE,
  AUDIO_PREPARE_PROCESSING_HINT,
  AUDIO_PREPARE_PROCESSING_STATUS,
  isAudioPrepareInFlight,
} from "@/lib/author-products/audio-prepare-status";
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
import { canConfigureProductAppreciation } from "@/lib/author-products/appreciation-override";
import {
  buildListenerAppreciationOverrideField,
  buildUnlockedProductIdentityFields,
} from "@/lib/author-products/save-payload";
import {
  buildAuthorProductPriceFields,
  parsePriceInputDraft,
  validatePaidPriceInputDraft,
  validateStudioMusicPaidPriceInputDraft,
} from "@/lib/author-products/price-input-draft";
import {
  formatAlbumBatchCreateFailure,
  formatAlbumBatchOverflowMessage,
  formatAlbumBatchSkipMessage,
  MAX_MUSIC_ALBUM_BATCH_FILES,
  planMusicAlbumBatch,
  deriveAlbumTrackTitle,
} from "@/lib/author-products/music-album-batch";
import {
  appendCreatedAudioItem,
  applyMusicAudioItemDeletion,
  mergeServerAudioItems,
  mergeServerProductIntoForm,
  patchAudioItemAfterMusicMasterFinalize,
  patchAudioItemFromUpload,
  productDetailToFormSnapshot,
  resolveAudioItemIdAfterDraftCreate,
} from "@/lib/author-products/form-merge";
import {
  dropMusicUpload,
  emptyMusicQueue,
  enqueueReadyMusicUploads,
  finishMusicUpload,
  musicQueueBlocksTrackCreation,
  musicQueueEntry,
  musicQueueHasLocalFile,
  musicQueueHasReady,
  retargetMusicUpload,
  retryMusicUpload,
  stageMusicFile,
  type MusicQueueSnapshot,
} from "@/lib/author-products/music-track-upload-queue";
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
  DEFAULT_STUDIO_MUSIC_FIXED_RUBLES,
  MIN_STUDIO_MUSIC_PRICE_RUBLES,
  STUDIO_MUSIC_PRICING_MODE,
  defaultStudioMusicPricingModeForForm,
  studioMusicPricingModeAfterListenerFlip,
  type StudioMusicPricingMode,
} from "@/lib/studio-music/pricing";
import { STUDIO_NEW_FREE_POLICY_COPY } from "@/lib/studio-music/new-free-policy";
import {
  createDefaultListeningNoticeFormState,
  DEFAULT_LISTENING_NOTICE_TEXT,
  DEFAULT_LISTENING_NOTICE_TITLE,
} from "@/lib/products/listening-notice";
import type { AssignedTopic, TopicOption } from "@/lib/topics/types";
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

function AudioPostTypePicker({
  formatPreset,
  customFormat,
  disabled,
  formatCustomError,
  onPresetChange,
  onCustomChange,
}: {
  formatPreset: string;
  customFormat: string;
  disabled: boolean;
  formatCustomError?: string;
  onPresetChange: (preset: string) => void;
  onCustomChange: (value: string) => void;
}) {
  const selected = formatPreset || AUDIO_POST_KIND_LABEL;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {AUDIO_POST_PRESET_FORMATS.map((option) => (
          <label
            key={option}
            className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${
              selected === option
                ? "border-[#9a74d8] bg-[#f8f4ff]"
                : "border-[#e4d7f4] bg-white"
            } ${disabled ? "opacity-70" : ""}`}
          >
            <input
              type="radio"
              name="audio_post_display_type"
              className="mt-1"
              checked={selected === option}
              disabled={disabled}
              onChange={() => onPresetChange(option)}
            />
            <span className="text-sm font-medium text-[#3f3560]">{option}</span>
          </label>
        ))}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${
            isCustomFormatSelection(selected)
              ? "border-[#9a74d8] bg-[#f8f4ff]"
              : "border-[#e4d7f4] bg-white"
          } ${disabled ? "opacity-70" : ""}`}
        >
          <input
            type="radio"
            name="audio_post_display_type"
            className="mt-1"
            checked={isCustomFormatSelection(selected)}
            disabled={disabled}
            onChange={() => onPresetChange(CUSTOM_FORMAT_VALUE)}
          />
          <span className="text-sm font-medium text-[#3f3560]">
            {AUDIO_POST_CUSTOM_TYPE_LABEL}
          </span>
        </label>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
          isCustomFormatSelection(selected)
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <label
            className="block"
            data-submit-issue={formatCustomError ? "" : undefined}
          >
            <span className="mb-2 block text-sm font-medium">
              {AUDIO_POST_CUSTOM_TYPE_FIELD_LABEL}
            </span>
            <input
              value={customFormat}
              maxLength={PRODUCT_CONTENT_LIMITS.customFormat}
              disabled={disabled}
              onChange={(event) => onCustomChange(event.target.value)}
              placeholder={AUDIO_POST_CUSTOM_TYPE_PLACEHOLDER}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            />
            <CharCounter
              value={customFormat}
              max={PRODUCT_CONTENT_LIMITS.customFormat}
            />
            {formatCustomError ? (
              <p className="mt-2 text-sm text-[#9b3d3d]">{formatCustomError}</p>
            ) : null}
          </label>
        </div>
      </div>
    </div>
  );
}

type AuthorProductFormProps = {
  authors: AuthorWorkspace[];
  relatedProductOptions?: Array<{ value: string; label: string }>;
  initialAuthorSlug?: string;
  initialProduct?: AuthorProductDetail;
  initialPublicationClass?: PublicationClass | null;
  initialWizardStep?: ProductWizardStep;
  initialSeoReservationContext?: SeoReservationProductFormContext | null;
  topicFormData: AuthorProductTopicFormData;
  mode: "create" | "edit";
};

type FormState = {
  authorId: string;
  title: string;
  subtitle: string;
  description: string;
  audioProductAuthor: string;
  productKind: ProductKind;
  publicationClass: PublicationClass | null;
  musicUsagePermission: MusicUsagePermission | null;
  studioMusicPricingMode: StudioMusicPricingMode | null;
  studioMusicPriceRubles: number;
  formatPreset: string;
  customFormat: string;
  slug: string;
  isFree: boolean;
  price: number;
  isCatalogListed: boolean;
  catalogVisibility: CatalogVisibility;
  catalogSection: CatalogSection;
  promoEnabled: boolean;
  promoTitle: string;
  promoText: string;
  promoButtonText: string;
  promoUrl: string;
  promoOpenInNewTab: boolean;
  listenerAppreciationOverride: boolean | null;
  coverUrl: string | null;
  coverVersion: string | null;
  coverImage?: unknown;
  useSharedCover: boolean;
  listeningNoticeEnabled: boolean;
  listeningNoticeTitle: string;
  listeningNoticeText: string;
  seoPrimaryQuery: string;
  seoSecondaryQueries: string[];
  seoTitle: string;
  seoDescription: string;
  seoAbout: string;
  authorRecommendationsTitle: string;
  seoContent: PracticeSeoContentInput;
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

function authorAudioPreviewFingerprint(item: AudioItemRow): string {
  return [
    item.id,
    item.audio_path?.trim() || "",
    item.active_music_delivery_asset_id || "",
    item.music_master?.hasActiveDelivery ? "1" : "0",
  ].join("|");
}

function audioItemHasPlayablePreview(item: AudioItemRow): boolean {
  return hasPlayableAuthorAudioPreview({
    audioPath: item.audio_path,
    activeMusicDeliveryAssetId: item.active_music_delivery_asset_id,
    hasActiveDelivery: item.music_master?.hasActiveDelivery,
  });
}

const AUDIO_TITLE_SAVE_ERROR =
  "Аудио загружено, но название аудио не удалось сохранить. Введите его вручную.";

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
  const withoutExtension = fileName.trim().replace(/\.(mp3|wav|m4a|aac)$/i, "").trim();

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

function resolveFormAudioProductAuthor(
  authors: AuthorWorkspace[],
  authorId: string,
  productAudioProductAuthor: string | null | undefined,
): string {
  if (hasAudioProductAuthor(productAudioProductAuthor)) {
    return (productAudioProductAuthor as string).trim();
  }

  const workspace =
    authors.find((item) => item.id === authorId) ?? authors[0] ?? null;
  return workspace?.defaultAudioProductAuthor ?? "";
}

function buildInitialForm(
  authors: AuthorWorkspace[],
  initialAuthorSlug: string | undefined,
  initialProduct: AuthorProductDetail | undefined,
  initialPublicationClass?: PublicationClass | null,
  initialSeoReservationContext?: SeoReservationProductFormContext | null,
): FormState {
  if (initialProduct) {
    const snapshot = productDetailToFormSnapshot(initialProduct);
    const linkedQueryText =
      initialSeoReservationContext?.linked &&
      initialSeoReservationContext.queryText.trim()
        ? initialSeoReservationContext.queryText.trim()
        : null;
    return {
      ...snapshot,
      audioProductAuthor: resolveFormAudioProductAuthor(
        authors,
        snapshot.authorId,
        initialProduct.practice.audio_product_author,
      ),
      seoPrimaryQuery: linkedQueryText ?? snapshot.seoPrimaryQuery,
    };
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
    audioProductAuthor: resolveFormAudioProductAuthor(
      authors,
      author?.id ?? "",
      null,
    ),
    productKind: created.productKind,
    publicationClass: created.publicationClass,
    musicUsagePermission:
      created.productKind === PRODUCT_KIND.MUSIC
        ? MUSIC_USAGE_PERMISSION.LISTEN_ONLY
        : null,
    studioMusicPricingMode: null,
    studioMusicPriceRubles: DEFAULT_STUDIO_MUSIC_FIXED_RUBLES,
    formatPreset:
      created.productKind === PRODUCT_KIND.AUDIO_POST
        ? AUDIO_POST_KIND_LABEL
        : "",
    customFormat: "",
    slug: "",
    isFree: true,
    price: 99,
    isCatalogListed: true,
    catalogVisibility: CATALOG_VISIBILITY.LISTED,
    catalogSection: suggestCatalogSection({
      productKind: created.productKind,
      publicationClass: created.publicationClass,
      format:
        created.productKind === PRODUCT_KIND.AUDIO_POST
          ? AUDIO_POST_KIND_LABEL
          : null,
    }),
    promoEnabled: false,
    promoTitle: "",
    promoText: "",
    promoButtonText: "",
    promoUrl: "",
    promoOpenInNewTab: false,
    listenerAppreciationOverride: null,
    coverUrl: null,
    coverVersion: null,
    coverImage: null,
    useSharedCover: true,
    listeningNoticeEnabled: listeningDefaults.listeningNoticeEnabled,
    listeningNoticeTitle: listeningDefaults.listeningNoticeTitle,
    listeningNoticeText: listeningDefaults.listeningNoticeText,
    seoPrimaryQuery: initialSeoReservationContext?.queryText ?? "",
    seoSecondaryQueries: [],
    seoTitle: "",
    seoDescription: "",
    seoAbout: "",
    authorRecommendationsTitle: "",
    seoContent: {
      usageItems: [],
      faqItems: [],
      relatedPracticeIds: [],
      relatedListenSlugs: [],
    },
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

function getAudioPostFormatFieldError(
  preset: string,
  customFormat: string,
): string | undefined {
  const result = resolveAudioPostFormatForStorage(preset, customFormat);

  if (result.ok) {
    return undefined;
  }

  if (result.error === "missing_custom_format") {
    return "Укажите название типа продукта";
  }

  return getProductFieldErrorMessage(result.error) ?? undefined;
}

function resolveAudioPostFormatForSave(
  preset: string,
  customFormat: string,
): string {
  const result = resolveAudioPostFormatForStorage(preset, customFormat);

  return result.ok ? result.format : AUDIO_POST_KIND_LABEL;
}

function buildProductSavePayload(
  form: FormState,
  slugLocked: boolean,
  canConfigureAppreciation: boolean,
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
    audio_product_author: form.audioProductAuthor.trim() || null,
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
    studio_music_pricing_mode:
      form.productKind === PRODUCT_KIND.MUSIC &&
      form.musicUsagePermission ===
        MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED
        ? form.studioMusicPricingMode
        : null,
    ...buildAuthorProductPriceFields(form),
    format:
      form.productKind === PRODUCT_KIND.MUSIC
        ? MUSIC_KIND_LABEL
        : form.productKind === PRODUCT_KIND.AUDIO_POST
          ? resolveAudioPostFormatForSave(form.formatPreset, form.customFormat)
          : resolveFormatForStorage(form.formatPreset, form.customFormat),
    ...buildCatalogSectionSaveField({
      authorId: form.authorId,
      productKind: form.productKind,
      publicationClass: form.publicationClass,
      catalogSection: form.catalogSection,
    }),
    is_free:
      form.productKind === PRODUCT_KIND.AUDIO_POST ? true : form.isFree,
    is_catalog_listed: form.catalogVisibility === CATALOG_VISIBILITY.LISTED,
    catalog_visibility: form.catalogVisibility,
    promo_enabled: form.promoEnabled,
    promo_title: form.promoTitle,
    promo_text: form.promoText,
    promo_button_text: form.promoButtonText,
    promo_url: form.promoUrl,
    promo_open_in_new_tab: form.promoOpenInNewTab,
    ...buildListenerAppreciationOverrideField({
      canConfigureAppreciation,
      listenerAppreciationOverride: form.listenerAppreciationOverride,
    }),
    use_shared_cover: form.useSharedCover,
    listening_notice_enabled:
      form.productKind === PRODUCT_KIND.MUSIC
        ? false
        : form.listeningNoticeEnabled,
    listening_notice_title: form.listeningNoticeTitle,
    listening_notice_text: form.listeningNoticeText,
    seo_primary_query: form.seoPrimaryQuery.trim() || null,
    seo_secondary_queries: form.seoSecondaryQueries.map((item) => item.trim()).filter(Boolean),
    seo_title: form.seoTitle.trim() || null,
    seo_description: form.seoDescription.trim() || null,
    author_recommendations_title: form.authorRecommendationsTitle,
    seo_content: {
      usage_items: form.seoContent.usageItems,
      faq_items: form.seoContent.faqItems,
      related_practice_ids: form.seoContent.relatedPracticeIds,
      related_listen_slugs: form.seoContent.relatedListenSlugs,
    },
  };
}

export default function AuthorProductForm({
  authors,
  relatedProductOptions = [],
  initialAuthorSlug,
  initialProduct,
  initialPublicationClass,
  initialWizardStep = PRODUCT_WIZARD_DEFAULT_STEP,
  initialSeoReservationContext = null,
  topicFormData,
  mode,
}: AuthorProductFormProps) {
  const router = useRouter();
  const [wizardStep, setWizardStep] =
    useState<ProductWizardStep>(initialWizardStep);
  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm(
      authors,
      initialAuthorSlug,
      initialProduct,
      initialPublicationClass,
      initialSeoReservationContext,
    ),
  );
  const [catalogSectionOverridden, setCatalogSectionOverridden] = useState(
    () =>
      mode === "edit" &&
      readStoredCatalogSection(
        initialProduct?.practice.catalog_section,
      ) !== null,
  );
  function mergeFormWithCatalogSuggestion(
    current: FormState,
    patch: Partial<FormState>,
  ): FormState {
    const next = { ...current, ...patch };

    if (
      !isCatalogSectionFieldEnabled({
        authorId: next.authorId,
        productKind: next.productKind,
        publicationClass: next.publicationClass,
      }) ||
      catalogSectionOverridden
    ) {
      return next;
    }

    return {
      ...next,
      catalogSection: suggestCatalogSectionFromFormFields({
        productKind: next.productKind,
        publicationClass: next.publicationClass,
        formatPreset: next.formatPreset,
        customFormat: next.customFormat,
      }),
    };
  }
  const [seoReservationContext, setSeoReservationContext] =
    useState<SeoReservationProductFormContext | null>(
      initialSeoReservationContext ?? null,
    );
  const [studioMusicPriceDraft, setStudioMusicPriceDraft] = useState(() =>
    String(form.studioMusicPriceRubles),
  );
  const [listenerPriceDraft, setListenerPriceDraft] = useState(() =>
    String(form.price),
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
          {
            ...productDetailToFormSnapshot(initialProduct),
            audioProductAuthor: resolveFormAudioProductAuthor(
              authors,
              initialProduct.practice.author_id,
              initialProduct.practice.audio_product_author,
            ),
          },
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
  const [musicQueue, setMusicQueue] = useState<MusicQueueSnapshot>(emptyMusicQueue);
  const [albumDropActive, setAlbumDropActive] = useState(false);
  const [albumBatchNotice, setAlbumBatchNotice] = useState<string | null>(null);
  const [albumBatchProgress, setAlbumBatchProgress] = useState<{
    created: number;
    total: number;
  } | null>(null);
  const albumFileInputRef = useRef<HTMLInputElement | null>(null);
  const musicQueueRef = useRef(musicQueue);
  const musicFilesRef = useRef(new Map<string, File>());
  const musicAbortRef = useRef(new Map<string, AbortController>());
  const musicLaunchRef = useRef<(audioId: string) => void>(() => undefined);
  const audioItemsRef = useRef(audioItems);
  audioItemsRef.current = audioItems;
  const ensurePracticeInFlightRef = useRef<Promise<PracticeContext | null> | null>(
    null,
  );
  musicQueueRef.current = musicQueue;
  const [savingSharedCover, setSavingSharedCover] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    subtitle?: string;
    description?: string;
    audioProductAuthor?: string;
    formatCustom?: string;
    listeningNoticeTitle?: string;
    listeningNoticeText?: string;
    seoPrimaryQuery?: string;
    seoSecondaryQueries?: string;
    seoTitle?: string;
    seoDescription?: string;
    seoAbout?: string;
    authorRecommendationsTitle?: string;
    studioMusicPrice?: string;
    price?: string;
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
  const audioPreviewFingerprints = useRef<Record<string, string>>({});
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
    if (form.productKind === PRODUCT_KIND.MUSIC || !practiceId) {
      return;
    }
    const pending = audioItems.some((item) =>
      isAudioPrepareInFlight(item.audio_prepare_status),
    );
    if (!pending) {
      return;
    }
    const timer = window.setInterval(() => {
      void reloadSavedProduct(practiceId);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [audioItems, form.productKind, practiceId]);

  useEffect(() => {
    if (
      form.productKind !== PRODUCT_KIND.MUSIC ||
      !musicQueueHasLocalFile(musicQueue)
    ) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [form.productKind, musicQueue]);

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
    preserveLocalMedia: form.productKind === PRODUCT_KIND.MUSIC,
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

  const audioPreviewSourceKey = audioItems
    .map((item) => authorAudioPreviewFingerprint(item))
    .join("\n");

  useEffect(() => {
    if (!practiceId) {
      return;
    }

    const itemsToPreview = audioItems.filter(
      (item) => !item.id.startsWith("temp-") && audioItemHasPlayablePreview(item),
    );
    const playableIds = new Set(itemsToPreview.map((item) => item.id));

    for (const audioId of Object.keys(audioPreviewFingerprints.current)) {
      if (playableIds.has(audioId)) {
        continue;
      }
      delete audioPreviewFingerprints.current[audioId];
      setAudioPreviewUrls((current) => {
        if (!(audioId in current)) return current;
        const next = { ...current };
        delete next[audioId];
        return next;
      });
      setAudioPreviewErrors((current) => {
        if (!(audioId in current)) return current;
        const next = { ...current };
        delete next[audioId];
        return next;
      });
      setAudioPreviewLoading((current) => {
        if (!(audioId in current)) return current;
        const next = { ...current };
        delete next[audioId];
        return next;
      });
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      for (const item of itemsToPreview) {
        const fingerprint = authorAudioPreviewFingerprint(item);
        if (audioPreviewFingerprints.current[item.id] === fingerprint) {
          continue;
        }
        audioPreviewFingerprints.current[item.id] = fingerprint;
        setAudioPreviewVersions((current) => ({
          ...current,
          [item.id]: (current[item.id] ?? 0) + 1,
        }));
        void loadAudioPreview(practiceId, item.id);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [practiceId, audioPreviewSourceKey, loadAudioPreview, audioItems]);

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
  const canConfigureStudioMusic = authorAccessAllowsPaidProducts(
    selectedAuthorAccessStatus,
  );

  const canBypassProductModeration =
    selectedAuthor?.canBypassProductModeration === true;

  const musicProductWizard = isMusicProductWizardEnabled({
    authorId: form.authorId,
    productKind: form.productKind,
    publicationClass: form.publicationClass,
  });
  const wizardEnabled =
    isAuthorProductWizardEnabled(form.authorId) || musicProductWizard;
  const publishedProductStatus =
    initialProduct?.practice.status === "published";
  const hasRelationalPrimarySeoQuery = Boolean(
    initialProduct?.practice.primary_seo_query_id ||
      seoReservationContext?.linked,
  );
  const publishedSeoAttachEnabled = isPublishedProductSeoAttachEnabled({
    authorId: form.authorId,
    productKind: form.productKind,
    publicationClass: form.publicationClass,
  });
  const showPublishedSeoLinker =
    mode === "edit" &&
    publishedProductStatus &&
    publishedSeoAttachEnabled &&
    !hasRelationalPrimarySeoQuery;

  const showWizardStep = (step: ProductWizardStep) =>
    shouldShowProductWizardStep({
      wizardEnabled,
      activeStep: wizardStep,
      step,
    });

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
  const canConfigureAppreciation = canConfigureProductAppreciation({
    accessStatus: selectedAuthorAccessStatus,
    isFree: form.isFree,
    productKind: form.productKind,
    publicationClass: form.publicationClass,
  });
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
        ...buildCatalogSectionSaveField({
          authorId: form.authorId,
          productKind: form.productKind,
          publicationClass: form.publicationClass,
          catalogSection: form.catalogSection,
        }),
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
      const nextPath = wizardEnabled
        ? buildAuthorProductEditPath(created.practice.id, {
            step: wizardStep,
            preserveSearch: window.location.search,
            includeStep: true,
          })
        : buildAuthorProductEditPath(created.practice.id);
      window.history.replaceState(null, "", nextPath);
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
    if (isCourse) {
      return { ok: true };
    }

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

    const nextForm = buildInitialForm(
      authors,
      initialAuthorSlug,
      productPayload.product,
      undefined,
      seoReservationContext,
    );
    setForm(nextForm);
    setCatalogSectionOverridden(true);
    setStudioMusicPriceDraft(String(nextForm.studioMusicPriceRubles));
    setListenerPriceDraft(String(nextForm.price));
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
    if (
      form.productKind === PRODUCT_KIND.MUSIC &&
      musicQueueHasLocalFile(musicQueueRef.current)
    ) {
      setError(
        "Сначала загрузите выбранные треки или уберите файлы, которые ещё не отправлены. Сохранение сейчас сотрёт их.",
      );
      return false;
    }

    const studioMusicPrice =
      form.productKind === PRODUCT_KIND.MUSIC &&
      form.musicUsagePermission ===
        MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED &&
      form.studioMusicPricingMode === STUDIO_MUSIC_PRICING_MODE.FIXED
        ? validateStudioMusicPaidPriceInputDraft(studioMusicPriceDraft)
        : null;
    const listenerPrice = !form.isFree
      ? validatePaidPriceInputDraft(listenerPriceDraft)
      : null;

    if ((studioMusicPrice && !studioMusicPrice.ok) || (listenerPrice && !listenerPrice.ok)) {
      setFieldErrors({
        ...(studioMusicPrice && !studioMusicPrice.ok
          ? { studioMusicPrice: "Укажите целую цену от 499 до 100 000 ₽." }
          : {}),
        ...(listenerPrice && !listenerPrice.ok
          ? { price: "Укажите целую цену от 49 до 100 000 ₽." }
          : {}),
      });
      requestScrollToFirstSubmitIssue();
      return false;
    }

    const formForSave = {
      ...form,
      ...(studioMusicPrice?.ok
        ? { studioMusicPriceRubles: studioMusicPrice.rubles }
        : {}),
      ...(listenerPrice?.ok ? { price: listenerPrice.rubles } : {}),
    };

    setBusy(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});
    setTopicError(undefined);

    if (form.productKind === PRODUCT_KIND.AUDIO_POST) {
      const formatCustomError = getAudioPostFormatFieldError(
        form.formatPreset,
        form.customFormat,
      );

      if (formatCustomError) {
        setFieldErrors({ formatCustom: formatCustomError });
        setBusy(false);
        return false;
      }
    }

    try {
      const ensured = await ensurePracticeId();

      if (!ensured) {
        return false;
      }

      const id = ensured.practiceId;

      const response = await fetch(`/api/author/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildProductSavePayload(
            formForSave,
            slugLocked,
            canConfigureAppreciation,
          ),
        ),
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
            fieldKey === "audioProductAuthor" ||
            fieldKey === "description" ||
            fieldKey === "formatCustom" ||
            fieldKey === "listeningNoticeTitle" ||
            fieldKey === "listeningNoticeText" ||
            fieldKey === "seoPrimaryQuery" ||
            fieldKey === "seoSecondaryQueries" ||
            fieldKey === "seoTitle" ||
            fieldKey === "seoDescription" ||
            fieldKey === "seoAbout" ||
            fieldKey === "authorRecommendationsTitle"
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

      if (
        seoReservationContext &&
        !seoReservationContext.linked &&
        seoReservationContext.reservationId
      ) {
        const linkResult = await linkSeoReservationToProduct({
          authorId: formForSave.authorId || reloaded.practice.author_id,
          reservationId: seoReservationContext.reservationId,
          productId: id,
          publicationClass: formForSave.publicationClass,
        });
        if (!linkResult.ok) {
          setError(linkResult.message);
          setBusy(false);
          return false;
        }
        setSeoReservationContext({
          ...seoReservationContext,
          linked: true,
          expiresAt: null,
        });
        setForm((current) => ({
          ...current,
          seoPrimaryQuery: seoReservationContext.queryText,
        }));
      }

      savedBaselineRef.current = serializeProductEditorBaseline(
        {
          ...productDetailToFormSnapshot(reloaded),
          audioProductAuthor: resolveFormAudioProductAuthor(
            authors,
            reloaded.practice.author_id,
            reloaded.practice.audio_product_author,
          ),
          seoPrimaryQuery:
            seoReservationContext?.queryText ||
            reloaded.practice.seo_primary_query ||
            "",
        },
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
    if (!assertMusicProductReadyForPublish()) {
      return false;
    }
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

      const saveBeforePreview = shouldSaveProductBeforePublish({
        status: form.status,
        moderationStatus: form.moderationStatus,
        canBypassProductModeration,
      });

      if (saveBeforePreview) {
        const saved = await saveProduct();

        if (!saved) {
          previewTab?.close();
          return false;
        }

        // saveProduct clears busy in its finally; keep the editor busy until the tab opens.
        setBusy(true);
      }

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

    if (!assertMusicProductReadyForPublish()) {
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

    if (
      form.productKind === PRODUCT_KIND.PRACTICE &&
      isCustomFormatSelection(form.formatPreset)
    ) {
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

    if (form.productKind === PRODUCT_KIND.AUDIO_POST) {
      const formatCustomError = getAudioPostFormatFieldError(
        form.formatPreset,
        form.customFormat,
      );

      if (formatCustomError) {
        setFieldErrors({ formatCustom: formatCustomError });
        publishInFlightRef.current = false;
        setPublishing(false);
        setBusy(false);
        return;
      }
    }

    const courseContentCheck = evaluateCoursePublishContentGate({
      publicationClass: form.publicationClass,
      productKind: form.productKind,
      publishedAt: form.publishedAt,
      lessonCount: courseContentSnapshot.lessonCount,
      blockCount: courseContentSnapshot.blockCount,
      lessons: courseContentSnapshot.lessons,
      accessLevels: courseContentSnapshot.access_levels,
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
      const saveBeforePublish = shouldSaveProductBeforePublish({
        status: form.status,
        moderationStatus: form.moderationStatus,
        canBypassProductModeration,
      });

      if (saveBeforePublish) {
        const saved = await saveProduct();

        if (!saved) {
          return;
        }

        // saveProduct clears busy in its finally; keep publishing until redirect/error.
        setBusy(true);
        setPublishing(true);
      }

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

    const courseContentCheck = evaluateCoursePublishContentGate({
      publicationClass: form.publicationClass,
      productKind: form.productKind,
      publishedAt: form.publishedAt,
      lessonCount: courseContentSnapshot.lessonCount,
      blockCount: courseContentSnapshot.blockCount,
      lessons: courseContentSnapshot.lessons,
      accessLevels: courseContentSnapshot.access_levels,
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
      setAudioItems((current) => {
        if (form.productKind === PRODUCT_KIND.MUSIC) {
          const serverItem = payload.product!.audio_items.find(
            (item) => item.id === audioId,
          );
          if (!serverItem) {
            return current;
          }
          return current.map((item) =>
            item.id === audioId
              ? {
                  ...item,
                  title: item.title.trim() ? item.title : serverItem.title,
                  description: item.description ?? serverItem.description,
                }
              : item,
          );
        }
        return mergeServerAudioItems(current, payload.product!.audio_items);
      });
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
    if (
      form.productKind === PRODUCT_KIND.MUSIC &&
      musicQueueBlocksTrackCreation(musicQueueRef.current)
    ) {
      setError("Дождитесь завершения текущей загрузки, затем добавьте трек.");
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
      const isMusic = form.productKind === PRODUCT_KIND.MUSIC;

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

      if (!response.ok || !payload.product || (isMusic && !payload.audio_item)) {
        setError("Не удалось добавить аудио.");
        return;
      }

      const newAudioId =
        payload.audio_item?.id ??
        payload.product.audio_items[payload.product.audio_items.length - 1]?.id;

      if (newAudioId) {
        pendingFocusAudioIdRef.current = newAudioId;
      }

      if (isMusic && payload.audio_item) {
        applyMusicProductLevel(payload.product);
        setAudioItems((current) =>
          appendCreatedAudioItem(current, payload.audio_item!),
        );
      } else {
        setAudioItems((current) =>
          mergeServerAudioItems(current, payload.product!.audio_items),
        );
      }
    } catch {
      setError("Не удалось добавить аудио.");
    } finally {
      addAudioInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function addAlbumTracks(files: File[]) {
    if (
      form.productKind !== PRODUCT_KIND.MUSIC ||
      addAudioInFlightRef.current ||
      busy
    ) {
      return;
    }
    if (musicQueueBlocksTrackCreation(musicQueueRef.current)) {
      setAlbumBatchNotice(
        "Дождитесь завершения текущей загрузки, затем добавьте треки.",
      );
      return;
    }

    const plan = planMusicAlbumBatch(files);
    const notices = [
      formatAlbumBatchSkipMessage(plan.skipped),
      formatAlbumBatchOverflowMessage(plan.overflow),
    ].filter((notice): notice is string => Boolean(notice));
    setAlbumBatchNotice(notices.length > 0 ? notices.join(" ") : null);
    if (plan.accepted.length === 0) {
      return;
    }

    addAudioInFlightRef.current = true;
    setBusy(true);
    setError(null);
    setAlbumBatchProgress({ created: 0, total: plan.accepted.length });
    let created = 0;
    const stagedIds: string[] = [];

    try {
      const ensured = await ensurePracticeId();
      if (!ensured) {
        return;
      }

      for (const file of plan.accepted) {
        const response = await fetch(
          `/api/author/products/${ensured.practiceId}/audio`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: deriveAlbumTrackTitle(file.name) }),
          },
        );
        const payload = (await response.json()) as {
          product?: AuthorProductDetail;
          audio_item?: AudioItemRow;
        };
        if (!response.ok || !payload.audio_item) {
          setError(
            formatAlbumBatchCreateFailure(created, plan.accepted.length, file.name),
          );
          return;
        }
        if (payload.product) {
          applyMusicProductLevel(payload.product);
        }
        const audioItem = payload.audio_item;
        setAudioItems((current) => appendCreatedAudioItem(current, audioItem));
        stageMusicTrackFile(audioItem.id, file);
        stagedIds.push(audioItem.id);
        created += 1;
        setAlbumBatchProgress({ created, total: plan.accepted.length });
      }
    } catch {
      const failedName = plan.accepted[created]?.name ?? "файл";
      setError(
        formatAlbumBatchCreateFailure(created, plan.accepted.length, failedName),
      );
    } finally {
      addAudioInFlightRef.current = false;
      setBusy(false);
      setAlbumBatchProgress(null);
      if (stagedIds.length > 0) {
        startReadyMusicUploads(stagedIds);
      }
    }
  }

  function commitMusicQueue(next: MusicQueueSnapshot) {
    musicQueueRef.current = next;
    setMusicQueue(next);
  }

  function launchMusicQueueIds(audioIds: string[]) {
    for (const audioId of audioIds) {
      musicLaunchRef.current(audioId);
    }
  }

  function forgetMusicTrack(audioId: string) {
    musicAbortRef.current.get(audioId)?.abort();
    musicAbortRef.current.delete(audioId);
    musicFilesRef.current.delete(audioId);
    const step = dropMusicUpload(musicQueueRef.current, audioId);
    commitMusicQueue(step.snapshot);
    launchMusicQueueIds(step.launchIds);
  }

  async function ensurePracticeIdShared() {
    if (practiceIdRef.current) {
      return ensurePracticeId(audioItemsRef.current);
    }
    if (!ensurePracticeInFlightRef.current) {
      ensurePracticeInFlightRef.current = ensurePracticeId(
        audioItemsRef.current,
      ).finally(() => {
        ensurePracticeInFlightRef.current = null;
      });
    }
    return ensurePracticeInFlightRef.current;
  }

  async function launchMusicUpload(requestedAudioId: string) {
    const started = musicQueueEntry(musicQueueRef.current, requestedAudioId);
    if (!started || started.phase !== "uploading") {
      return;
    }
    const generation = started.generation;
    const kind = started.kind;
    let audioId = requestedAudioId;
    const controller = new AbortController();
    musicAbortRef.current.set(audioId, controller);

    const failUpload = (message: string) => {
      setAudioUploadErrors((current) => ({ ...current, [audioId]: message }));
      const step = finishMusicUpload(
        musicQueueRef.current,
        audioId,
        generation,
        message,
      );
      if (step.ignored) {
        return;
      }
      commitMusicQueue(step.snapshot);
      launchMusicQueueIds(step.launchIds);
    };

    try {
      const file = musicFilesRef.current.get(audioId);
      if (!file) {
        failUpload("Не удалось загрузить аудио.");
        return;
      }
      const ensured = await ensurePracticeIdShared();
      if (controller.signal.aborted) {
        return;
      }
      if (!ensured) {
        failUpload(
          kind === "master"
            ? "Не удалось загрузить WAV-мастер."
            : "Не удалось загрузить аудио.",
        );
        return;
      }
      const targetAudioId = resolveAudioItemIdAfterDraftCreate(
        audioId,
        audioItemsRef.current,
        ensured.audioItems,
      );
      if (targetAudioId !== audioId) {
        musicFilesRef.current.set(targetAudioId, file);
        musicFilesRef.current.delete(audioId);
        musicAbortRef.current.delete(audioId);
        musicAbortRef.current.set(targetAudioId, controller);
        commitMusicQueue(
          retargetMusicUpload(musicQueueRef.current, audioId, targetAudioId),
        );
        audioId = targetAudioId;
      }
      const currentEntry = musicQueueEntry(musicQueueRef.current, audioId);
      if (!currentEntry || currentEntry.generation !== generation) {
        return;
      }
      const slotNumber =
        audioItemsRef.current.findIndex((item) => item.id === audioId) + 1;
      const currentTitle =
        audioItemsRef.current.find((item) => item.id === audioId)?.title ?? "";
      const result =
        kind === "master"
          ? await uploadMusicMasterDirect({
              practiceId: ensured.practiceId,
              audioId,
              file,
              signal: controller.signal,
            })
          : await uploadAuthorProductAudioDirect({
              practiceId: ensured.practiceId,
              audioId,
              file,
              signal: controller.signal,
            });
      const after = musicQueueEntry(musicQueueRef.current, audioId);
      if (!after || after.generation !== generation || controller.signal.aborted) {
        return;
      }
      if (!result.ok) {
        failUpload(
          getAudioUploadErrorMessage(result.error, result.status, result.message),
        );
        return;
      }
      if ("product" in result) {
        const serverItem = result.product.audio_items.find(
          (item) => item.id === audioId,
        );
        if (serverItem) {
          setAudioItems((current) =>
            patchAudioItemFromUpload(current, audioId, serverItem),
          );
        }
        setForm((current) => mergeServerProductIntoForm(current, result.product));
        setContentLockedAfterSale(result.product.contentLockedAfterSale === true);
        setDeleteLockedAfterPaidPurchase(
          result.product.deleteLockedAfterPaidPurchase === true,
        );
        setMessage("Аудио загружено.");
      } else if (result.assetId) {
        setAudioItems((current) =>
          patchAudioItemAfterMusicMasterFinalize(current, audioId, {
            assetId: result.assetId!,
            lifecycleState: result.lifecycleState,
            transcodeStatus: result.transcodeStatus,
          }),
        );
        setMessage(result.message);
      } else {
        setMessage(result.message);
      }
      musicFilesRef.current.delete(audioId);
      setAudioUploadErrors((current) => {
        const next = { ...current };
        delete next[audioId];
        return next;
      });
      const step = finishMusicUpload(musicQueueRef.current, audioId, generation);
      if (!step.ignored) {
        commitMusicQueue(step.snapshot);
        launchMusicQueueIds(step.launchIds);
        void autofillAudioTitleFromFile(audioId, file, currentTitle, slotNumber);
      }
    } catch {
      if (!controller.signal.aborted) {
        failUpload(
          kind === "master"
            ? "Не удалось загрузить WAV-мастер."
            : "Не удалось загрузить аудио.",
        );
      }
    } finally {
      if (musicAbortRef.current.get(audioId) === controller) {
        musicAbortRef.current.delete(audioId);
      }
    }
  }

  musicLaunchRef.current = (audioId: string) => {
    void launchMusicUpload(audioId);
  };

  function stageMusicTrackFile(audioId: string, file: File) {
    const mode = resolveMusicUploadMode(file);
    if (!mode) {
      setAudioUploadErrors((current) => ({
        ...current,
        [audioId]: MUSIC_DELIVERY_UNSUPPORTED_TEXT,
      }));
      return;
    }
    const validationError =
      mode === "master"
        ? validateMusicMasterFileClient(file)
        : validateOrdinaryProductAudioFileClient(file);
    if (validationError) {
      setAudioUploadErrors((current) => ({
        ...current,
        [audioId]: validationError,
      }));
      return;
    }
    musicAbortRef.current.get(audioId)?.abort();
    musicAbortRef.current.delete(audioId);
    musicFilesRef.current.set(audioId, file);
    const step = stageMusicFile(
      musicQueueRef.current,
      audioId,
      mode,
      file.name,
    );
    commitMusicQueue(step.snapshot);
    launchMusicQueueIds(step.launchIds);
    setAudioUploadErrors((current) => {
      const next = { ...current };
      delete next[audioId];
      return next;
    });
  }

  function startReadyMusicUploads(extraOrderedIds: readonly string[] = []) {
    const order: string[] = [];
    const seen = new Set<string>();
    const pushId = (audioId: string) => {
      if (seen.has(audioId)) {
        return;
      }
      seen.add(audioId);
      order.push(audioId);
    };
    for (const audioId of audioItemsRef.current.map((item) => item.id)) {
      pushId(audioId);
    }
    for (const audioId of extraOrderedIds) {
      pushId(audioId);
    }
    for (const entry of musicQueueRef.current.entries) {
      if (entry.phase === "ready") {
        pushId(entry.audioId);
      }
    }
    const step = enqueueReadyMusicUploads(musicQueueRef.current, order);
    commitMusicQueue(step.snapshot);
    launchMusicQueueIds(step.launchIds);
  }

  function uploadAllMusicTracks() {
    startReadyMusicUploads();
  }

  function retryMusicTrack(audioId: string) {
    setAudioUploadErrors((current) => {
      const next = { ...current };
      delete next[audioId];
      return next;
    });
    const step = retryMusicUpload(musicQueueRef.current, audioId);
    commitMusicQueue(step.snapshot);
    launchMusicQueueIds(step.launchIds);
  }

  function applyMusicProductLevel(product: AuthorProductDetail) {
    setForm((current) => mergeServerProductIntoForm(current, product));
    setContentLockedAfterSale(product.contentLockedAfterSale === true);
    setDeleteLockedAfterPaidPurchase(
      product.deleteLockedAfterPaidPurchase === true,
    );
  }

  async function deleteAudioItem(audioId: string, hasFile: boolean) {
    const target = audioItems.find((item) => item.id === audioId);
    if (
      form.productKind !== PRODUCT_KIND.MUSIC &&
      isAudioPrepareInFlight(target?.audio_prepare_status)
    ) {
      setError(
        "Аудио ещё обрабатывается. Дождитесь завершения или загрузите другой файл.",
      );
      return;
    }
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

    if (form.productKind === PRODUCT_KIND.MUSIC) {
      forgetMusicTrack(audioId);
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

    if (payload.product && form.productKind === PRODUCT_KIND.MUSIC) {
      applyMusicProductLevel(payload.product);
      setAudioItems((current) =>
        applyMusicAudioItemDeletion(
          current,
          audioId,
          payload.product!.audio_items,
        ),
      );
    } else if (payload.product) {
      applyServerProductPreservingDraft(payload.product);
    }
  }

  async function uploadAudio(
    audioId: string,
    file: File,
    mode: "legacy" | "master" = "legacy",
  ) {
    const isMusicMaster = mode === "master";
    if (form.productKind === PRODUCT_KIND.MUSIC && resolveMusicUploadMode(file) == null) {
      setAudioUploadErrors((current) => ({
        ...current,
        [audioId]: MUSIC_DELIVERY_UNSUPPORTED_TEXT,
      }));
      return;
    }
    const validationError = isMusicMaster
      ? validateMusicMasterFileClient(file)
      : validateOrdinaryProductAudioFileClient(file);

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
          [audioId]: isMusicMaster
            ? "Не удалось загрузить WAV-мастер."
            : "Не удалось загрузить аудио.",
        }));
        return;
      }

      const id = ensured.practiceId;
      const targetAudioId = resolveAudioItemIdAfterDraftCreate(
        audioId,
        localItemsBeforeCreate,
        ensured.audioItems,
      );

      const result = isMusicMaster
        ? await uploadMusicMasterDirect({
            practiceId: id,
            audioId: targetAudioId,
            file,
          })
        : await uploadAuthorProductAudioDirect({
            practiceId: id,
            audioId: targetAudioId,
            file,
          });

      if (!result.ok) {
        setAudioUploadErrors((current) => ({
          ...current,
          [audioId]: getAudioUploadErrorMessage(
            result.error,
            result.status,
            result.message,
          ),
        }));
        return;
      }

      if ("message" in result) {
        await reloadSavedProduct(id);
        setMessage(result.message);
      } else {
        applyServerProductPreservingDraft(result.product);
        setMessage("Аудио загружено.");
        await autofillAudioTitleFromFile(
          targetAudioId,
          file,
          currentTitle,
          slotNumber,
        );
      }
    } catch {
      setAudioUploadErrors((current) => ({
        ...current,
        [audioId]: isMusicMaster
          ? "Не удалось загрузить WAV-мастер."
          : "Не удалось загрузить аудио.",
      }));
    } finally {
      setUploadingAudioId(null);
    }
  }

  async function deleteAudioFile(audioId: string) {
    const target = audioItems.find((item) => item.id === audioId);
    if (
      form.productKind !== PRODUCT_KIND.MUSIC &&
      isAudioPrepareInFlight(target?.audio_prepare_status)
    ) {
      setError(
        "Аудио ещё обрабатывается. Дождитесь завершения или загрузите другой файл.",
      );
      return;
    }
    if (!window.confirm("Удалить аудио?")) {
      return;
    }

    if (form.productKind === PRODUCT_KIND.MUSIC) {
      forgetMusicTrack(audioId);
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
          [audioId]: "Не удалось удалить аудио.",
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
            [audioId]: "Не удалось удалить аудио.",
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
            "Не удалось удалить аудио.",
        }));
        return;
      }

      if (form.productKind === PRODUCT_KIND.MUSIC) {
        applyMusicProductLevel(payload.product);
        const serverItem = payload.product.audio_items.find(
          (item) => item.id === targetAudioId,
        );
        if (serverItem) {
          setAudioItems((current) =>
            patchAudioItemFromUpload(current, targetAudioId, serverItem),
          );
        }
      } else {
        applyServerProductPreservingDraft(payload.product);
      }
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
      setMessage("Аудио удалено.");
    } catch {
      setAudioUploadErrors((current) => ({
        ...current,
        [audioId]: "Не удалось удалить аудио.",
      }));
    } finally {
      setDeletingAudioFileId(null);
    }
  }

  function goToWizardStep(nextStep: ProductWizardStep) {
    setWizardStep(nextStep);
    if (typeof window === "undefined") {
      return;
    }
    const nextHref = buildWizardStepHref(
      window.location.pathname,
      window.location.search,
      nextStep,
    );
    window.history.replaceState(null, "", nextHref);
  }

  function canJumpToWizardStep(step: ProductWizardStep) {
    if (!wizardEnabled) {
      return false;
    }
    if (step === wizardStep) {
      return true;
    }
    // Back always; forward only after a draft id exists (saved product).
    if (step < wizardStep) {
      return true;
    }
    return Boolean(practiceIdRef.current || practiceId);
  }

  function applyMusicAuthorFieldError(): boolean {
    if (!musicProductWizard) {
      return false;
    }
    if (hasAudioProductAuthor(form.audioProductAuthor)) {
      return false;
    }
    setFieldErrors((current) => ({
      ...current,
      audioProductAuthor: AUDIO_PRODUCT_AUTHOR_REQUIRED_MESSAGE,
    }));
    return true;
  }

  function applyMusicTrackTitleErrors(): boolean {
    if (!musicProductWizard) {
      return false;
    }
    let hasInvalid = false;
    const nextErrors: Record<string, { title?: string; description?: string }> =
      { ...audioFieldErrors };
    for (const item of audioItems) {
      const titleError = validateMusicTrackTitleCyrillic(item.title);
      if (titleError) {
        hasInvalid = true;
        nextErrors[item.id] = {
          ...nextErrors[item.id],
          title: titleError,
        };
      }
    }
    if (hasInvalid) {
      setAudioFieldErrors(nextErrors);
    }
    return hasInvalid;
  }

  function assertMusicProductReadyForPublish(): boolean {
    if (!musicProductWizard) {
      return true;
    }
    if (applyMusicAuthorFieldError()) {
      goToWizardStep(1);
      requestScrollToFirstSubmitIssue();
      return false;
    }
    if (applyMusicTrackTitleErrors()) {
      goToWizardStep(2);
      requestScrollToFirstSubmitIssue();
      return false;
    }
    return true;
  }

  async function saveWizardStep() {
    await saveDraft();
    if (musicProductWizard && wizardStep === 1) {
      if (applyMusicAuthorFieldError()) {
        requestScrollToFirstSubmitIssue();
      }
    }
    if (musicProductWizard && wizardStep === 2) {
      if (applyMusicTrackTitleErrors()) {
        requestScrollToFirstSubmitIssue();
      }
    }
  }

  async function saveWizardStepAndContinue() {
    setError(null);
    setMessage(null);
    const saved = await saveProduct();
    if (!saved) {
      return;
    }
    setMessage("Черновик сохранён.");

    if (musicProductWizard && wizardStep === 1) {
      if (applyMusicAuthorFieldError()) {
        requestScrollToFirstSubmitIssue();
        return;
      }
    }
    if (musicProductWizard && wizardStep === 2) {
      if (applyMusicTrackTitleErrors()) {
        requestScrollToFirstSubmitIssue();
        return;
      }
    }

    const next = nextProductWizardStep(wizardStep);
    if (next) {
      goToWizardStep(next);
    }
  }

  function goWizardBack() {
    const prev = previousProductWizardStep(wizardStep);
    if (prev) {
      goToWizardStep(prev);
    }
  }

  return (
    <div className="min-w-0 space-y-8">
      {selectedAuthor ? (
        <AuthorAccessStatusBanner accessStatus={selectedAuthorAccessStatus} />
      ) : null}

      <AuthorProductFormStatusNotices
        contentLockedAfterSale={contentLockedAfterSale}
        message={message}
        error={error}
        isSubmitted={isSubmitted}
        needsChanges={needsChanges}
        moderationReviewComment={form.moderationReviewComment}
      />

      {wizardEnabled ? (
        <AuthorProductWizardStepper
          activeStep={wizardStep}
          onSelectStep={goToWizardStep}
          canJumpToStep={canJumpToWizardStep}
        />
      ) : null}

      <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!wizardEnabled || wizardStep === 1 ? (
            <h2 className="text-[20px] font-semibold">Основная информация</h2>
          ) : (
            <h2 className="text-[20px] font-semibold">
              {wizardStep === 2
                ? "Материалы"
                : wizardStep === 3
                  ? "Описание и продвижение"
                  : "Условия и публикация"}
            </h2>
          )}
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

{showWizardStep(1) ? (
        <>
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

        {seoReservationContext ? (
          <div className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3">
            <p className="text-sm font-semibold text-[#3f3560]">
              Поисковый запрос для продукта
            </p>
            <p className="mt-1 text-sm font-medium text-[#25135c]">
              «{seoReservationContext.queryText}»
            </p>
            <p className="mt-1.5 text-sm leading-5 text-[#5f5484]">
              {seoReservationContext.linked
                ? "Запрос связан с этим продуктом."
                : "Запрос забронирован за вами. После первого сохранения он будет связан с этим продуктом."}
            </p>
            {!seoReservationContext.linked && seoReservationContext.expiresAt ? (
              <p className="mt-1 text-sm text-[#5f5484]">
                Забронирован до{" "}
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }).format(new Date(seoReservationContext.expiresAt))}
              </p>
            ) : null}
          </div>
        ) : null}

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
                setForm((current) =>
                  mergeFormWithCatalogSuggestion(current, {
                    authorId: event.target.value,
                  }),
                )
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
                        setForm((current) =>
                          mergeFormWithCatalogSuggestion(current, {
                            publicationClass: option.value,
                            productKind: publicationClassToLegacyKind(
                              option.value,
                            ),
                            musicUsagePermission: null,
                          }),
                        );
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
            ) : publicationClassToCabinetBranch(form.publicationClass) ===
              "post" ? (
              <AudioPostTypePicker
                formatPreset={form.formatPreset}
                customFormat={form.customFormat}
                disabled={busy}
                formatCustomError={fieldErrors.formatCustom}
                onPresetChange={(value) => {
                  setFieldErrors((current) => ({
                    ...current,
                    formatCustom: undefined,
                  }));
                  setForm((current) =>
                    mergeFormWithCatalogSuggestion(current, {
                      formatPreset: value,
                      customFormat:
                        value === CUSTOM_FORMAT_VALUE
                          ? current.customFormat
                          : "",
                    }),
                  );
                }}
                onCustomChange={(value) => {
                  setFieldErrors((current) => ({
                    ...current,
                    formatCustom: undefined,
                  }));
                  setForm((current) =>
                    mergeFormWithCatalogSuggestion(current, {
                      customFormat: value,
                    }),
                  );
                }}
              />
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
                  setForm((current) =>
                    mergeFormWithCatalogSuggestion(current, {
                      productKind: PRODUCT_KIND.PRACTICE,
                      publicationClass: null,
                      musicUsagePermission: null,
                      formatPreset: "",
                      customFormat: "",
                    }),
                  );
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
                  setForm((current) =>
                    mergeFormWithCatalogSuggestion(current, {
                      productKind: PRODUCT_KIND.MUSIC,
                      publicationClass: null,
                      musicUsagePermission:
                        current.musicUsagePermission ??
                        MUSIC_USAGE_PERMISSION.LISTEN_ONLY,
                      formatPreset: "",
                      customFormat: "",
                      listeningNoticeEnabled: false,
                    }),
                  );
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
                  setForm((current) =>
                    mergeFormWithCatalogSuggestion(current, {
                      productKind: PRODUCT_KIND.AUDIO_POST,
                      publicationClass: null,
                      musicUsagePermission: null,
                      formatPreset: AUDIO_POST_KIND_LABEL,
                      customFormat: "",
                      isFree: true,
                      price: 0,
                      useSharedCover: true,
                      listeningNoticeEnabled: false,
                    }),
                  );
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

        {musicProductWizard ? (
          <label
            className="block"
            data-submit-issue={fieldErrors.audioProductAuthor ? "" : undefined}
          >
            <span className="mb-2 block text-sm font-medium">Автор музыки</span>
            <input
              value={form.audioProductAuthor}
              maxLength={PRODUCT_CONTENT_LIMITS.audioProductAuthor}
              onChange={(event) => {
                setFieldErrors((current) => ({
                  ...current,
                  audioProductAuthor: undefined,
                }));
                setForm((current) => ({
                  ...current,
                  audioProductAuthor: event.target.value,
                }));
              }}
              placeholder="Например: Сергей Петров"
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            />
            <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
              Укажите имя и фамилию автора музыки.
            </p>
            <CharCounter
              value={form.audioProductAuthor}
              max={PRODUCT_CONTENT_LIMITS.audioProductAuthor}
            />
            {fieldErrors.audioProductAuthor ? (
              <p className="mt-2 text-sm text-[#9b3d3d]">
                {fieldErrors.audioProductAuthor}
              </p>
            ) : null}
          </label>
        ) : null}

</>
        ) : null}

{showWizardStep(3) ? (
        <label
          className="block"
          data-submit-issue={fieldErrors.description ? "" : undefined}
        >
          <span className="mb-2 block text-sm font-medium">
            {form.productKind === PRODUCT_KIND.AUDIO_POST
              ? `${AUTHOR_DESCRIPTION_LABEL} (необязательно)`
              : AUTHOR_DESCRIPTION_LABEL}
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
            {AUTHOR_DESCRIPTION_HELPER}
          </p>
          <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
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

) : null}

{showWizardStep(1) ? (
        <>
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
              setForm((current) =>
                mergeFormWithCatalogSuggestion(current, {
                  formatPreset: value,
                  customFormat:
                    value === CUSTOM_FORMAT_VALUE ? current.customFormat : "",
                }),
              );
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
                  setForm((current) =>
                    mergeFormWithCatalogSuggestion(current, {
                      customFormat: event.target.value,
                    }),
                  );
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

        {form.productKind === PRODUCT_KIND.AUDIO_POST &&
        publicationClassToCabinetBranch(form.publicationClass ?? "practice") !==
          "post" ? (
          <fieldset className="block">
            <legend className="mb-2 block text-sm font-medium">
              Тип продукта
            </legend>
            <AudioPostTypePicker
              formatPreset={form.formatPreset}
              customFormat={form.customFormat}
              disabled={busy}
              formatCustomError={fieldErrors.formatCustom}
              onPresetChange={(value) => {
                setFieldErrors((current) => ({
                  ...current,
                  formatCustom: undefined,
                }));
                setForm((current) =>
                  mergeFormWithCatalogSuggestion(current, {
                    formatPreset: value,
                    customFormat:
                      value === CUSTOM_FORMAT_VALUE ? current.customFormat : "",
                  }),
                );
              }}
              onCustomChange={(value) => {
                setFieldErrors((current) => ({
                  ...current,
                  formatCustom: undefined,
                }));
                setForm((current) =>
                  mergeFormWithCatalogSuggestion(current, {
                    customFormat: value,
                  }),
                );
              }}
            />
          </fieldset>
        ) : null}

        {isCatalogSectionFieldEnabled({
          authorId: form.authorId,
          productKind: form.productKind,
          publicationClass: form.publicationClass,
        }) ? (
          <label className="block" data-catalog-section="">
            <span className="mb-2 block text-sm font-medium">
              {CATALOG_SECTION_FIELD_LABEL}
            </span>
            <select
              name="catalog_section"
              value={form.catalogSection}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value;

                if (!isCatalogSection(value)) {
                  return;
                }

                setCatalogSectionOverridden(true);
                setForm((current) => ({
                  ...current,
                  catalogSection: value,
                }));
              }}
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            >
              {CATALOG_SECTION_FIELD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

</>
        ) : null}

<div
        className={
          musicProductWizard && wizardStep === 4
            ? "flex flex-col gap-6"
            : "contents"
        }
      >
        <div
          className={
            musicProductWizard && wizardStep === 4 ? "order-2" : undefined
          }
        >
{showWizardStep(4) ? (
        <>
        {form.productKind === PRODUCT_KIND.MUSIC ? (
          <fieldset className="block space-y-3">
            <legend className="mb-1 block text-sm font-medium">
              {musicProductWizard
                ? "Использование музыки в Студии АудиоЛада"
                : "Условия использования музыки"}
            </legend>
            <p className="text-sm leading-5 text-[#7d70a2]">
              {musicProductWizard
                ? "Другие авторы могут использовать вашу музыку при создании медитаций, практик и других аудиопродуктов в Студии АудиоЛада. За каждое такое использование вы получаете оплату."
                : MUSIC_USAGE_PERMISSION_INTRO}
            </p>
            {(
              [
                MUSIC_USAGE_PERMISSION.LISTEN_ONLY,
                MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED,
              ] as const
            ).map((value) => {
              const reuseOption =
                value === MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED;
              const optionDisabled =
                busy || (reuseOption && !canConfigureStudioMusic);
              return (
              <label
                key={value}
                className={`flex items-start gap-3 rounded-[18px] border px-4 py-3 ${
                  optionDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                } ${
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
                  disabled={optionDisabled}
                  onChange={() => {
                    if (optionDisabled) return;
                    if (
                      value === MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED
                    ) {
                      const nextMode = defaultStudioMusicPricingModeForForm({
                        reuseAllowed: true,
                        listenerIsFree: form.isFree,
                      });
                      setStudioMusicPriceDraft(
                        String(DEFAULT_STUDIO_MUSIC_FIXED_RUBLES),
                      );
                      setForm((current) => ({
                        ...current,
                        musicUsagePermission: value,
                        studioMusicPricingMode: nextMode,
                        studioMusicPriceRubles: DEFAULT_STUDIO_MUSIC_FIXED_RUBLES,
                      }));
                      return;
                    }
                    setForm((current) => ({
                      ...current,
                      musicUsagePermission: value,
                      studioMusicPricingMode: null,
                    }));
                  }}
                />
                <span>
                  <span className="block text-sm font-medium text-[#3f3560]">
                    {musicProductWizard
                      ? value === MUSIC_USAGE_PERMISSION.LISTEN_ONLY
                        ? "Только для прослушивания"
                        : "Разрешить использование в Студии АудиоЛада"
                      : getMusicUsagePermissionLabel(value)}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-[#7d70a2]">
                    {getMusicUsagePermissionDescription(value)}
                  </span>
                </span>
              </label>
              );
            })}
            {!canConfigureStudioMusic ? (
              <p className="text-sm leading-5 text-[#7d70a2]">
                «Для прослушивания и использования авторами» доступно после
                получения коммерческого статуса.
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {form.productKind === PRODUCT_KIND.MUSIC &&
        form.musicUsagePermission ===
          MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED ? (
          <fieldset className="block space-y-3">
            <legend className="mb-1 block text-sm font-medium">
              {musicProductWizard
                ? "Стоимость использования музыки в Студии"
                : "Использование в Студии АудиоЛада"}
            </legend>
            <p className="text-sm leading-5 text-[#7d70a2]">
              {musicProductWizard ? (
                <>
                  Выберите стоимость использования вашей музыки другим автором.
                  Минимальная стоимость — {MIN_STUDIO_MUSIC_PRICE_RUBLES} ₽.
                </>
              ) : (
                <>
                  Разрешите другим авторам использовать вашу музыку при создании
                  медитаций и практик.
                </>
              )}
            </p>
            <p className="text-sm leading-5 text-[#7d70a2]">
              {STUDIO_NEW_FREE_POLICY_COPY.newProductsPaidOnly}
            </p>
            {form.studioMusicPricingMode === STUDIO_MUSIC_PRICING_MODE.FREE ? (
              <p className="text-sm leading-5 text-[#7d70a2]">
                {STUDIO_NEW_FREE_POLICY_COPY.grandfatheredKept}{" "}
                {STUDIO_NEW_FREE_POLICY_COPY.grandfatheredExplain}
              </p>
            ) : null}
            {!canConfigureStudioMusic &&
            form.musicUsagePermission ===
              MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED ? (
              <p className="text-sm leading-5 text-[#7d70a2]">
                Настройки лицензии для Студии доступны только при коммерческом
                статусе. Текущие значения сохранены и показаны только для
                просмотра.
              </p>
            ) : null}
            {(
              [
                {
                  value: STUDIO_MUSIC_PRICING_MODE.FREE,
                  label: "Бесплатно — сохранено ранее",
                  show:
                    form.studioMusicPricingMode ===
                    STUDIO_MUSIC_PRICING_MODE.FREE,
                },
                {
                  value: STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER,
                  label:
                    "Автоматическая цена (в 2 раза дороже текущей цены прослушивания)",
                  show: !form.isFree,
                },
                {
                  value: STUDIO_MUSIC_PRICING_MODE.FIXED,
                  label: "Своя цена",
                  show: true,
                },
              ] as const
            )
              .filter((option) => option.show)
              .map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 ${
                    form.studioMusicPricingMode === option.value
                      ? "border-[#9a74d8] bg-[#f8f4ff]"
                      : "border-[#e4d7f4] bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="studio_music_pricing_mode"
                    className="mt-1"
                    checked={form.studioMusicPricingMode === option.value}
                    disabled={
                      busy ||
                      !canEditPublicFields ||
                      !canConfigureStudioMusic
                    }
                    onChange={() => {
                      if (!canConfigureStudioMusic) return;
                      const shouldSetDefaultPrice =
                        option.value === STUDIO_MUSIC_PRICING_MODE.FIXED &&
                        !validateStudioMusicPaidPriceInputDraft(studioMusicPriceDraft).ok;

                      if (shouldSetDefaultPrice) {
                        setStudioMusicPriceDraft(
                          String(DEFAULT_STUDIO_MUSIC_FIXED_RUBLES),
                        );
                      }

                      setForm((current) => ({
                        ...current,
                        studioMusicPricingMode: option.value,
                        studioMusicPriceRubles:
                          shouldSetDefaultPrice
                            ? DEFAULT_STUDIO_MUSIC_FIXED_RUBLES
                            : current.studioMusicPriceRubles,
                      }));
                    }}
                  />
                  <span className="block text-sm font-medium text-[#3f3560]">
                    {option.label}
                  </span>
                </label>
              ))}
            {form.studioMusicPricingMode === STUDIO_MUSIC_PRICING_MODE.FIXED ? (
              <label
                className="block"
                data-submit-issue={fieldErrors.studioMusicPrice ? "" : undefined}
              >
                <span className="mb-1 block text-sm text-[#7d70a2]">
                  Цена для Студии, ₽
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_STUDIO_MUSIC_PRICE_RUBLES}
                  max={MAX_PAID_PRICE_RUB}
                  step={1}
                  value={studioMusicPriceDraft}
                  disabled={
                    busy ||
                    !canEditPublicFields ||
                    !canConfigureStudioMusic
                  }
                  onChange={(event) => {
                    if (!canConfigureStudioMusic) return;
                    const draft = event.target.value;
                    const rubles = parsePriceInputDraft(draft);

                    setStudioMusicPriceDraft(draft);
                    setFieldErrors((current) => ({
                      ...current,
                      studioMusicPrice: undefined,
                    }));
                    if (rubles !== null) {
                      setForm((current) => ({
                        ...current,
                        studioMusicPriceRubles: rubles,
                      }));
                    }
                  }}
                  className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
                />
                {fieldErrors.studioMusicPrice ? (
                  <p className="mt-2 text-sm text-[#9b3d3d]">
                    {fieldErrors.studioMusicPrice}
                  </p>
                ) : null}
              </label>
            ) : null}
            <p className="text-sm leading-5 text-[#7d70a2]">
              Минимальная цена лицензии для Студии — {MIN_STUDIO_MUSIC_PRICE_RUBLES}{' '}
              ₽. Покупатель получает постоянное право использовать эту музыку в
              Студии. Автор получает 70% с каждой продажи.
            </p>
          </fieldset>
        ) : null}

</>
        ) : null}
        </div>


{showWizardStep(3) ? (
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

) : null}

{showWizardStep(1) ? (
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

) : null}

{showWizardStep(2) ? (
        <>
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

</>
        ) : null}

        <div
          className={
            musicProductWizard && wizardStep === 4 ? "order-1" : undefined
          }
        >
{showWizardStep(4) ? (
        <>
        {musicProductWizard ? (
          <div className="mb-2">
            <h3 className="text-[18px] font-semibold text-[#3f3560]">
              Доступ для слушателей АудиоЛада
            </h3>
            <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
              Выберите, как ваша музыка будет доступна слушателям АудиоЛада.
            </p>
          </div>
        ) : null}
        {form.productKind !== PRODUCT_KIND.AUDIO_POST ? (
        <div>
          <span className="mb-2 block text-sm font-medium">
            {musicProductWizard ? "Цена для слушателей" : "Цена"}
          </span>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  isFree: true,
                  studioMusicPricingMode: studioMusicPricingModeAfterListenerFlip({
                    reuseAllowed:
                      current.musicUsagePermission ===
                      MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED,
                    listenerIsFree: true,
                    currentMode: current.studioMusicPricingMode,
                  }),
                }))
              }
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
              onClick={() => {
                setListenerPriceDraft("99");
                setForm((current) => ({
                  ...current,
                  isFree: false,
                  price: 99,
                  studioMusicPricingMode: studioMusicPricingModeAfterListenerFlip({
                    reuseAllowed:
                      current.musicUsagePermission ===
                      MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED,
                    listenerIsFree: false,
                    currentMode: current.studioMusicPricingMode,
                  }),
                }));
              }}
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
              <label
                className="block"
                data-submit-issue={fieldErrors.price ? "" : undefined}
              >
                <span className="mb-1 block text-sm text-[#7d70a2]">
                  Полная цена, ₽
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_PAID_PRICE_RUB}
                  max={MAX_PAID_PRICE_RUB}
                  step={1}
                  value={listenerPriceDraft}
                  disabled={!canEditPublicFields}
                  onChange={(event) => {
                    const draft = event.target.value;
                    const rubles = parsePriceInputDraft(draft);

                    setListenerPriceDraft(draft);
                    setFieldErrors((current) => ({
                      ...current,
                      price: undefined,
                    }));
                    if (rubles !== null) {
                      setForm((current) => ({ ...current, price: rubles }));
                    }
                  }}
                  className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
                />
                {fieldErrors.price ? (
                  <p className="mt-2 text-sm text-[#9b3d3d]">
                    {fieldErrors.price}
                  </p>
                ) : null}
              </label>
              <div className="flex flex-wrap gap-2">
                {PAID_PRICE_OPTIONS.map((price) => (
                  <button
                    key={price}
                    type="button"
                    disabled={!canEditPublicFields}
                    onClick={() => {
                      setListenerPriceDraft(String(price));
                      setForm((current) => ({ ...current, price }));
                    }}
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

          {canConfigureAppreciation ? (
            <fieldset className="mt-5 rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-3">
              <legend className="px-1 text-sm font-medium text-[#3f3560]">
                Поблагодарить автора
              </legend>
              <p className="mt-1 text-sm leading-5 text-[#7d70a2]">
                Показывать «Поблагодарить автора» для этого бесплатного продукта.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { value: null, label: "Используется настройка автора" },
                  { value: true, label: "Включено" },
                  { value: false, label: "Выключено" },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    disabled={!canEditPublicFields}
                    aria-pressed={form.listenerAppreciationOverride === option.value}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        listenerAppreciationOverride: option.value,
                      }))
                    }
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                      form.listenerAppreciationOverride === option.value
                        ? "bg-[#7042c5] text-white"
                        : "border border-[#c6afe6] text-[#7042c5]"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
        ) : null}

</>
        ) : null}


        </div>
        <div
          className={
            musicProductWizard && wizardStep === 4 ? "order-3" : undefined
          }
        >
{showWizardStep(4) ? (
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
) : null}
        </div>
      </div>

      </section>

      {showWizardStep(2) ? (
        isCourse ? (
          <AuthorCourseBuilder
            practiceId={practiceId || null}
            getPracticeId={getPracticeIdForCoverUpload}
            disabled={!canMutateContent || busy}
            basePrice={form.price}
            isFree={form.isFree}
            onContentSnapshotChange={setCourseContentSnapshot}
          />
        ) : null
      ) : null}

      {showWizardStep(4) ? (
        practiceId ? (
          <AuthorPracticeAccessLinks
            practiceId={practiceId}
            publicationClass={form.publicationClass}
            levels={(courseContentSnapshot.access_levels ?? []).map((level) => ({
              level: level.level,
              title: level.title,
              description: level.description,
            }))}
            disabled={!canMutateContent || busy}
          />
        ) : null
      ) : null}

      {showWizardStep(4) &&
      shouldShowPracticeListeningNotice(
        form.publicationClass,
        form.productKind,
      ) ? (
      <AuthorProductListeningNoticeSection
        enabled={form.listeningNoticeEnabled}
        title={form.listeningNoticeTitle}
        text={form.listeningNoticeText}
        titleError={fieldErrors.listeningNoticeTitle}
        textError={fieldErrors.listeningNoticeText}
        busy={busy}
        onEnabledChange={(enabled) =>
          setForm((current) => ({
            ...current,
            listeningNoticeEnabled: enabled,
          }))
        }
        onTitleChange={(listeningNoticeTitle) =>
          setForm((current) => ({
            ...current,
            listeningNoticeTitle,
          }))
        }
        onTextChange={(listeningNoticeText) =>
          setForm((current) => ({
            ...current,
            listeningNoticeText,
          }))
        }
        onClearTitleError={() =>
          setFieldErrors((current) => ({
            ...current,
            listeningNoticeTitle: undefined,
          }))
        }
        onClearTextError={() =>
          setFieldErrors((current) => ({
            ...current,
            listeningNoticeText: undefined,
          }))
        }
        onResetDefaults={() =>
          setForm((current) => ({
            ...current,
            listeningNoticeTitle: DEFAULT_LISTENING_NOTICE_TITLE,
            listeningNoticeText: DEFAULT_LISTENING_NOTICE_TEXT,
          }))
        }
      />
      ) : null}

      {showWizardStep(4) && form.productKind === PRODUCT_KIND.AUDIO_POST ? (
        <AuthorProductPostListenPromoSection
          promoEnabled={form.promoEnabled}
          promoTitle={form.promoTitle}
          promoText={form.promoText}
          promoButtonText={form.promoButtonText}
          promoUrl={form.promoUrl}
          promoOpenInNewTab={form.promoOpenInNewTab}
          busy={busy}
          onPromoEnabledChange={(promoEnabled) =>
            setForm((current) => ({ ...current, promoEnabled }))
          }
          onPromoTitleChange={(promoTitle) =>
            setForm((current) => ({ ...current, promoTitle }))
          }
          onPromoTextChange={(promoText) =>
            setForm((current) => ({ ...current, promoText }))
          }
          onPromoButtonTextChange={(promoButtonText) =>
            setForm((current) => ({ ...current, promoButtonText }))
          }
          onPromoUrlChange={(promoUrl) =>
            setForm((current) => ({ ...current, promoUrl }))
          }
          onPromoOpenInNewTabChange={(promoOpenInNewTab) =>
            setForm((current) => ({ ...current, promoOpenInNewTab }))
          }
        />
      ) : null}

      {showWizardStep(2) && !isCourse ? (
      <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-[20px] font-semibold">
          {form.productKind === PRODUCT_KIND.MUSIC
            ? "Треки"
            : "Содержание аудиопродукта"}
        </h2>

        {reorderNotice ? (
          <p className="text-sm text-[#9b3d3d]">{reorderNotice}</p>
        ) : null}

        {form.productKind === PRODUCT_KIND.MUSIC ? (
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              if (
                !busy &&
                !albumBatchProgress &&
                canEditPublicFields &&
                !musicQueueBlocksTrackCreation(musicQueue)
              ) {
                setAlbumDropActive(true);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setAlbumDropActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setAlbumDropActive(false);
              if (albumBatchProgress || addAudioInFlightRef.current) {
                return;
              }
              const dropped = Array.from(event.dataTransfer.files);
              void addAlbumTracks(dropped);
            }}
            className={`rounded-[20px] border border-dashed px-4 py-5 text-center ${
              albumBatchProgress
                ? "border-[#7042c5] bg-[#f4ecff]"
                : albumDropActive
                  ? "border-[#7042c5] bg-[#f4ecff]"
                  : "border-[#c6afe6] bg-[#fbf8ff]"
            }`}
          >
            {albumBatchProgress ? (
              <div>
                <span
                  className="mx-auto inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#c6afe6] border-t-[#7042c5]"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold text-[#25135c]">
                  Подготавливаем треки…
                </p>
                <p className="mt-1 text-sm text-[#5f5484]">
                  Создано {albumBatchProgress.created} из {albumBatchProgress.total}
                </p>
              </div>
            ) : (
            <>
            <p className="text-sm font-semibold text-[#25135c]">
              Добавить треки альбома
            </p>
            <p className="mt-2 text-sm text-[#5f5484]">
              Перетащите сюда WAV или MP3
            </p>
            <p className="my-2 text-sm text-[#7d70a2]">или</p>
            <button
              type="button"
              disabled={
                busy ||
                reorderBusy ||
                !canEditPublicFields ||
                musicQueueBlocksTrackCreation(musicQueue)
              }
              onClick={() => albumFileInputRef.current?.click()}
              className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
            >
              Выбрать файлы
            </button>
            <input
              ref={albumFileInputRef}
              type="file"
              multiple
              accept="audio/wav,audio/x-wav,audio/wave,.wav,audio/mpeg,.mp3"
              className="hidden"
              disabled={
                busy ||
                !canEditPublicFields ||
                musicQueueBlocksTrackCreation(musicQueue)
              }
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                event.target.value = "";
                void addAlbumTracks(selected);
              }}
            />
            <p className="mt-3 text-sm text-[#7d70a2]">
              Можно выбрать до {MAX_MUSIC_ALBUM_BATCH_FILES} файлов одновременно.
            </p>
            </>
            )}
            {musicQueueBlocksTrackCreation(musicQueue) && !albumBatchProgress ? (
              <p className="mt-3 text-sm text-[#9b3d3d]">
                Дождитесь завершения текущей загрузки, затем добавьте треки.
              </p>
            ) : null}
            {albumBatchNotice ? (
              <p className="mt-3 text-sm text-[#9b3d3d]">{albumBatchNotice}</p>
            ) : null}
          </div>
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
                <span className="mb-2 block text-sm font-medium">
                  {musicProductWizard
                    ? "Название (обязательно, на русском языке)"
                    : "Название"}
                </span>
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
                  {musicProductWizard
                    ? "Подназвание (необязательно)"
                    : "Краткое описание"}
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
                    {form.productKind === PRODUCT_KIND.MUSIC
                      ? (musicQueueEntry(musicQueue, audioItem.id)?.phase === "ready"
                          ? "Файл выбран"
                          : musicQueueEntry(musicQueue, audioItem.id)?.phase === "queued"
                            ? "В очереди"
                            : musicQueueEntry(musicQueue, audioItem.id)?.phase === "uploading"
                              ? "Загрузка…"
                              : musicQueueEntry(musicQueue, audioItem.id)?.phase === "error"
                                ? "Ошибка"
                                : musicCabinetStatus({
                                    hasLegacyAudioPath: Boolean(audioItem.audio_path),
                                    hasActiveDelivery: Boolean(audioItem.music_master?.hasActiveDelivery),
                                    lifecycleState: audioItem.music_master?.lifecycleState,
                                    transcodeStatus: audioItem.music_master?.transcodeStatus,
                                  }).text)
                      : isAudioPrepareInFlight(audioItem.audio_prepare_status)
                        ? AUDIO_PREPARE_PROCESSING_STATUS
                        : audioItem.audio_prepare_status === "failed"
                          ? AUDIO_PREPARE_FAILED_MESSAGE
                        : audioItem.audio_path
                          ? "Аудио загружено"
                          : "Аудио ещё не загружено"}
                  </p>
                  {isAudioPrepareInFlight(audioItem.audio_prepare_status) ? (
                    <p className="mt-2">{AUDIO_PREPARE_PROCESSING_HINT}</p>
                  ) : null}
                  {form.productKind === PRODUCT_KIND.MUSIC &&
                  musicQueueEntry(musicQueue, audioItem.id)?.fileName &&
                  musicQueueEntry(musicQueue, audioItem.id)?.phase !== "uploading" ? (
                    <p className="mt-2">
                      {musicQueueEntry(musicQueue, audioItem.id)?.fileName}
                    </p>
                  ) : null}
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

                {audioItemHasPlayablePreview(audioItem) && practiceId && !audioItem.id.startsWith("temp-") ? (
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
                        className="w-full"
                      />
                    ) : null}
                  </div>
                ) : null}

                <p className="text-sm leading-5 text-[#7d70a2]">
                  {form.productKind === PRODUCT_KIND.MUSIC
                    ? MUSIC_DELIVERY_UPLOAD_HINT
                    : PRODUCT_AUDIO_SIZE_HINT}
                </p>

                <div className="flex flex-wrap gap-2">
                  {contentLockedAfterSale && audioItem.audio_path ? null : (
                    <label
                      className={`inline-flex rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white ${
                        uploadingAudioId === audioItem.id ||
                        deletingAudioFileId === audioItem.id ||
                        musicQueueEntry(musicQueue, audioItem.id)?.phase === "uploading"
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer"
                      }`}
                    >
                      {uploadingAudioId === audioItem.id ||
                      musicQueueEntry(musicQueue, audioItem.id)?.phase === "uploading"
                        ? "Загрузка…"
                        : form.productKind === PRODUCT_KIND.MUSIC
                          ? audioItem.audio_path || audioItem.music_master
                            ? MUSIC_DELIVERY_REPLACE_LABEL
                            : MUSIC_DELIVERY_UPLOAD_LABEL
                          : audioItem.audio_path || isAudioPrepareInFlight(audioItem.audio_prepare_status)
                            ? "Заменить аудио"
                            : "Загрузить аудио"}
                      <input
                        type="file"
                        accept={
                          form.productKind === PRODUCT_KIND.MUSIC
                            ? "audio/wav,audio/x-wav,audio/wave,.wav,audio/mpeg,.mp3"
                            : PRODUCT_AUDIO_FILE_ACCEPT
                        }
                        className="hidden"
                        disabled={
                          uploadingAudioId === audioItem.id ||
                          deletingAudioFileId === audioItem.id ||
                          musicQueueEntry(musicQueue, audioItem.id)?.phase === "uploading"
                        }
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (!file) return;
                          if (form.productKind === PRODUCT_KIND.MUSIC) {
                            stageMusicTrackFile(audioItem.id, file);
                            startReadyMusicUploads([audioItem.id]);
                            return;
                          }
                          void uploadAudio(audioItem.id, file, "legacy");
                        }}
                      />
                    </label>
                  )}

                  {audioItem.audio_path &&
                  !contentLockedAfterSale &&
                  (form.productKind === PRODUCT_KIND.MUSIC ||
                    !isAudioPrepareInFlight(audioItem.audio_prepare_status)) ? (
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
                        : "Удалить аудио"}
                    </button>
                  ) : null}

                  {audioItems.length > 1 &&
                  !contentLockedAfterSale &&
                  (form.productKind === PRODUCT_KIND.MUSIC ||
                    !isAudioPrepareInFlight(audioItem.audio_prepare_status)) ? (
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

                {form.productKind === PRODUCT_KIND.MUSIC &&
                musicQueueEntry(musicQueue, audioItem.id)?.phase === "error" ? (
                  <button
                    type="button"
                    onClick={() => retryMusicTrack(audioItem.id)}
                    className="rounded-full border border-[#ebc9c9] px-4 py-2 text-sm font-semibold text-[#9b3d3d]"
                  >
                    Повторить
                  </button>
                ) : null}

                {audioUploadErrors[audioItem.id] ? (
                  <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
                    {audioUploadErrors[audioItem.id]}
                  </p>
                ) : null}
              </div>
            </article>
          ))}

          {form.productKind === PRODUCT_KIND.MUSIC && musicQueueHasReady(musicQueue) ? (
            <button
              type="button"
              onClick={uploadAllMusicTracks}
              className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
            >
              Продолжить загрузку
            </button>
          ) : null}
          {form.productKind === PRODUCT_KIND.MUSIC &&
          musicQueueHasLocalFile(musicQueue) ? (
            <p className="text-sm text-[#7d70a2]">
              Выбранные файлы ещё не сохранены на сервере. Не уходите со страницы и не сохраняйте черновик, пока загрузка не закончится.
            </p>
          ) : null}

          {form.productKind !== PRODUCT_KIND.AUDIO_POST ? (
          <>
          <button
            type="button"
            disabled={
              busy ||
              reorderBusy ||
              !canEditPublicFields ||
              (form.productKind === PRODUCT_KIND.MUSIC &&
                musicQueueBlocksTrackCreation(musicQueue))
            }
            onClick={() => void addAudioItem()}
            className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Добавить аудио
          </button>
          {form.productKind === PRODUCT_KIND.MUSIC &&
          musicQueueBlocksTrackCreation(musicQueue) ? (
            <p className="text-sm text-[#9b3d3d]">
              Дождитесь завершения текущей загрузки, затем добавьте трек.
            </p>
          ) : null}
          </>
          ) : null}
        </div>
      </section>
      ) : null}

      {showWizardStep(3) ? (
      <>
      {showPublishedSeoLinker && practiceId ? (
        <AuthorPublishedProductSeoQueryLinker
          productId={practiceId}
          legacySeoPrimaryQuery={form.seoPrimaryQuery}
          onAttached={(payload) => {
            setSeoReservationContext({
              reservationId: payload.reservationId,
              queryId: payload.queryId,
              queryText: payload.queryText,
              expiresAt: null,
              linked: true,
            });
            setForm((current) => ({
              ...current,
              seoPrimaryQuery: payload.queryText,
            }));
          }}
        />
      ) : null}
      {hasRelationalPrimarySeoQuery &&
      publishedSeoAttachEnabled &&
      publishedProductStatus ? (
        <div className="mb-4 rounded-[22px] border border-[#eadff8] bg-white p-4">
          <p className="text-sm font-semibold text-[#25135c]">
            Запрос закреплён за этим продуктом
          </p>
          <p className="mt-1 text-sm leading-6 text-[#4c3d78]">
            «{form.seoPrimaryQuery || seoReservationContext?.queryText || "—"}»
          </p>
        </div>
      ) : null}
      <AuthorProductSeoSection
        title={form.title}
        subtitle={form.subtitle}
        description={form.description}
        productKind={form.productKind}
        authorId={form.authorId}
        publicationClass={form.publicationClass}
        isFree={form.productKind === PRODUCT_KIND.AUDIO_POST ? true : form.isFree}
        seoPrimaryQuery={form.seoPrimaryQuery}
        primaryQueryLocked={Boolean(
          seoReservationContext ||
            initialProduct?.practice.primary_seo_query_id ||
            showPublishedSeoLinker,
        )}
        primaryQueryLockHint={
          seoReservationContext?.linked ||
          initialProduct?.practice.primary_seo_query_id
            ? "Запрос закреплён за этим продуктом."
            : showPublishedSeoLinker
              ? "Для опубликованного продукта закрепите основной запрос через блок выше."
              : seoReservationContext
                ? "Этот запрос выбран для продукта и будет связан после сохранения."
                : undefined
        }
        seoSecondaryQueries={form.seoSecondaryQueries}
        seoTitle={form.seoTitle}
        seoDescription={form.seoDescription}
        authorRecommendationsTitle={form.authorRecommendationsTitle}
        seoContent={form.seoContent}
        relatedProductOptions={relatedProductOptions}
        relatedProductSourceId={practiceId || undefined}
        publicPath={publicPath}
        fieldErrors={{
          seoPrimaryQuery: fieldErrors.seoPrimaryQuery,
          seoSecondaryQueries: fieldErrors.seoSecondaryQueries,
          seoTitle: fieldErrors.seoTitle,
          seoDescription: fieldErrors.seoDescription,
          authorRecommendationsTitle: fieldErrors.authorRecommendationsTitle,
        }}
        disabled={!canEditPublicFields || busy}
        onChange={(patch) => {
          setFieldErrors((current) => ({
            ...current,
            ...(patch.seoPrimaryQuery !== undefined
              ? { seoPrimaryQuery: undefined }
              : {}),
            ...(patch.seoSecondaryQueries !== undefined
              ? { seoSecondaryQueries: undefined }
              : {}),
            ...(patch.seoTitle !== undefined ? { seoTitle: undefined } : {}),
            ...(patch.seoDescription !== undefined
              ? { seoDescription: undefined }
              : {}),
            ...(patch.authorRecommendationsTitle !== undefined
              ? { authorRecommendationsTitle: undefined }
              : {}),
          }));
          setForm((current) => ({ ...current, ...patch }));
        }}
      />
      </>
      ) : null}

      {wizardEnabled && wizardStep < PRODUCT_WIZARD_STEP_COUNT ? (
        <AuthorProductWizardStepNav
          showBack={wizardStep > 1}
          showContinue
          busy={busy}
          canSave={canEditPublicFields && !musicQueueHasLocalFile(musicQueue)}
          onBack={goWizardBack}
          onSave={() => void saveWizardStep()}
          onSaveAndContinue={() => void saveWizardStepAndContinue()}
        />
      ) : null}

      {wizardEnabled && wizardStep === PRODUCT_WIZARD_STEP_COUNT ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={goWizardBack}
            className="w-fit rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
          >
            Назад
          </button>
          <AuthorProductFormActions
        mode={mode}
        busy={busy}
        publishing={publishing}
        canEditPublicFields={canEditPublicFields}
        canMutateContent={canMutateContent}
        canBypassProductModeration={canBypassProductModeration}
        isPublished={isPublished}
        isUnpublished={isUnpublished}
        isDraft={isDraft}
        isSubmitted={isSubmitted}
        needsChanges={needsChanges}
        publishedAt={form.publishedAt}
        moderationStatus={form.moderationStatus}
        practiceId={practiceId}
        publicPath={publicPath}
        publishPreviewPath={publishPreviewPath}
        deleteLockedAfterPaidPurchase={deleteLockedAfterPaidPurchase}
        saveDisabled={musicQueueHasLocalFile(musicQueue)}
        error={error}
        onSaveDraft={() => void saveDraft()}
        onUnpublish={() => void unpublishProduct()}
        onStartEditing={() => void startEditingProduct()}
        onOpenPublishPreview={() => void openPublishPreviewTab()}
        onPublish={() => void publishProduct()}
        onSubmitForModeration={() => void submitForModeration()}
        onWithdrawFromModeration={() => void withdrawFromModeration()}
        onDeleteProduct={() => void deleteProduct()}
      />
        </div>
      ) : null}

      {!wizardEnabled ? (
        <AuthorProductFormActions
          mode={mode}
          busy={busy}
          publishing={publishing}
          canEditPublicFields={canEditPublicFields}
          canMutateContent={canMutateContent}
          canBypassProductModeration={canBypassProductModeration}
          isPublished={isPublished}
          isUnpublished={isUnpublished}
          isDraft={isDraft}
          isSubmitted={isSubmitted}
          needsChanges={needsChanges}
          publishedAt={form.publishedAt}
          moderationStatus={form.moderationStatus}
          practiceId={practiceId}
          publicPath={publicPath}
          publishPreviewPath={publishPreviewPath}
          deleteLockedAfterPaidPurchase={deleteLockedAfterPaidPurchase}
          saveDisabled={musicQueueHasLocalFile(musicQueue)}
          error={error}
          onSaveDraft={() => void saveDraft()}
          onUnpublish={() => void unpublishProduct()}
          onStartEditing={() => void startEditingProduct()}
          onOpenPublishPreview={() => void openPublishPreviewTab()}
          onPublish={() => void publishProduct()}
          onSubmitForModeration={() => void submitForModeration()}
          onWithdrawFromModeration={() => void withdrawFromModeration()}
          onDeleteProduct={() => void deleteProduct()}
        />
      ) : null}

      {selectedAuthor ? (
        <p className="text-xs text-[#7d70a2]">
          Работаете от имени: {selectedAuthor.name}
          {mode === "create" ? " · новый аудиопродукт" : ""}
        </p>
      ) : null}
    </div>
  );
}
