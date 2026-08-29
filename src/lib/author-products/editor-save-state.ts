export type ProductEditorSaveOutcome = "saved" | "failed";

export function applyProductEditorSaveToDirty(input: {
  dirty: boolean;
  saved: boolean;
}): boolean {
  return input.saved ? false : input.dirty;
}

export function shouldSubmitProductAfterSave(saved: boolean): boolean {
  return saved === true;
}

export function nextProductEditorBaselineAfterSave<T>(input: {
  saved: boolean;
  currentBaseline: T;
  nextBaseline: T;
}): T {
  return input.saved ? input.nextBaseline : input.currentBaseline;
}

export function serializeProductEditorBaseline(
  form: {
    authorId: string;
    title: string;
    subtitle: string;
    description: string;
    productKind: string;
    publicationClass: string | null;
    musicUsagePermission: string | null;
    formatPreset: string;
    customFormat: string;
    slug: string;
    isFree: boolean;
    price: number;
    catalogVisibility: string;
    listeningNoticeEnabled: boolean;
    listeningNoticeTitle: string;
    listeningNoticeText: string;
    promoEnabled: boolean;
    promoTitle: string;
    promoText: string;
    promoButtonText: string;
    promoUrl: string;
    promoOpenInNewTab: boolean;
    seoPrimaryQuery: string;
    seoTitle: string;
    seoDescription: string;
  },
  audioItems: Array<{
    id: string;
    title: string;
    description: string | null;
    audio_path: string | null;
  }>,
): string {
  return JSON.stringify({
    authorId: form.authorId,
    title: form.title,
    subtitle: form.subtitle,
    description: form.description,
    productKind: form.productKind,
    publicationClass: form.publicationClass,
    musicUsagePermission: form.musicUsagePermission,
    formatPreset: form.formatPreset,
    customFormat: form.customFormat,
    slug: form.slug,
    isFree: form.isFree,
    price: form.price,
    catalogVisibility: form.catalogVisibility,
    listeningNoticeEnabled: form.listeningNoticeEnabled,
    listeningNoticeTitle: form.listeningNoticeTitle,
    listeningNoticeText: form.listeningNoticeText,
    promoEnabled: form.promoEnabled,
    promoTitle: form.promoTitle,
    promoText: form.promoText,
    promoButtonText: form.promoButtonText,
    promoUrl: form.promoUrl,
    promoOpenInNewTab: form.promoOpenInNewTab,
    seoPrimaryQuery: form.seoPrimaryQuery,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    audioItems: audioItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description ?? "",
      audio_path: item.audio_path ?? "",
    })),
  });
}

export function isProductEditorDirty(
  currentSerialized: string,
  baselineSerialized: string | null,
): boolean {
  if (baselineSerialized === null) {
    return true;
  }

  return currentSerialized !== baselineSerialized;
}

export function resolveProductEditorSaveOutcome(saved: boolean): ProductEditorSaveOutcome {
  return saved ? "saved" : "failed";
}
