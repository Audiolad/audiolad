export type MaxProductGallerySlide = {
  id: string;
  image_url: string;
  alt: string;
};

export type MaxProductRecommendationView = {
  authorSlug: string;
  slug: string;
  title: string;
  subtitle: string | null;
  authorName: string | null;
  formatLabel: string;
  coverUrl: string | null;
  priceLabel: string;
  isFree: boolean;
  durationLabel: string | null;
};

export type MaxProductRatingView = {
  enabled: boolean;
  aggregate: {
    totalStars: number;
    ratingCount: number;
  };
};

export type MaxProductDetailView = {
  title: string;
  subtitle: string | null;
  formatLabel: string;
  coverUrl: string | null;
  metaLine: string | null;
  priceLabel: string;
  isFree: boolean;
  gallery: MaxProductGallerySlide[];
  topics: Array<{ key: string; title: string }>;
  contents: Array<{
    title: string;
    position: number;
    durationSeconds: number | null;
  }>;
  recommendationsTitle: string;
  recommendations: MaxProductRecommendationView[];
  rating: MaxProductRatingView;
  appreciation: { authorName: string } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

export function readMaxProductDetail(value: unknown): MaxProductDetailView | null {
  if (!isRecord(value)) return null;
  const title = readString(value.title);
  const formatLabel = readString(value.formatLabel);
  const priceLabel = readString(value.priceLabel);
  const recommendationsTitle = readString(value.recommendationsTitle);
  const subtitle = readNullableString(value.subtitle);
  const coverUrl = readNullableString(value.coverUrl);
  const metaLine = readNullableString(value.metaLine);
  if (
    !title ||
    formatLabel === null ||
    !priceLabel ||
    !recommendationsTitle ||
    subtitle === undefined ||
    coverUrl === undefined ||
    metaLine === undefined ||
    typeof value.isFree !== "boolean" ||
    !Array.isArray(value.gallery) ||
    !Array.isArray(value.topics) ||
    !Array.isArray(value.contents) ||
    !Array.isArray(value.recommendations) ||
    "description" in value ||
    "usageItems" in value ||
    "faqItems" in value ||
    "relatedListens" in value ||
    "seoTitle" in value ||
    "seoDescription" in value
  ) {
    return null;
  }

  const gallery = value.gallery.flatMap((slide) => {
    if (!isRecord(slide)) return [];
    const id = readString(slide.id);
    const imageUrl = readString(slide.image_url);
    const alt = readString(slide.alt);
    if (!id || imageUrl === null || alt === null) return [];
    return [{ id, image_url: imageUrl, alt }];
  });
  if (gallery.length !== value.gallery.length) return null;

  const topics = value.topics.flatMap((topic) => {
    if (!isRecord(topic)) return [];
    const key = readString(topic.key);
    const topicTitle = readString(topic.title);
    if (!key || !topicTitle) return [];
    return [{ key, title: topicTitle }];
  });
  if (topics.length !== value.topics.length) return null;

  const contents = value.contents.flatMap((track) => {
    if (!isRecord(track)) return [];
    const trackTitle = readString(track.title);
    const position = track.position;
    const durationSeconds = track.durationSeconds;
    if (!trackTitle || typeof position !== "number") return [];
    if (durationSeconds !== null && typeof durationSeconds !== "number") return [];
    return [{
      title: trackTitle,
      position,
      durationSeconds: durationSeconds === null ? null : durationSeconds,
    }];
  });
  if (contents.length !== value.contents.length) return null;

  const recommendations = value.recommendations.flatMap((item) => {
    if (!isRecord(item)) return [];
    const authorSlug = readString(item.authorSlug);
    const slug = readString(item.slug);
    const itemTitle = readString(item.title);
    const itemFormat = readString(item.formatLabel);
    const itemPrice = readString(item.priceLabel);
    const itemSubtitle = readNullableString(item.subtitle);
    const authorName = readNullableString(item.authorName);
    const itemCover = readNullableString(item.coverUrl);
    const durationLabel = readNullableString(item.durationLabel);
    if (
      !authorSlug ||
      !slug ||
      !itemTitle ||
      itemFormat === null ||
      !itemPrice ||
      itemSubtitle === undefined ||
      authorName === undefined ||
      itemCover === undefined ||
      durationLabel === undefined ||
      typeof item.isFree !== "boolean" ||
      "href" in item
    ) {
      return [];
    }
    return [{
      authorSlug,
      slug,
      title: itemTitle,
      subtitle: itemSubtitle,
      authorName,
      formatLabel: itemFormat,
      coverUrl: itemCover,
      priceLabel: itemPrice,
      isFree: item.isFree,
      durationLabel,
    }];
  });
  if (recommendations.length !== value.recommendations.length) return null;

  if (!isRecord(value.rating)) return null;
  const aggregate = value.rating.aggregate;
  if (
    typeof value.rating.enabled !== "boolean" ||
    !isRecord(aggregate) ||
    typeof aggregate.totalStars !== "number" ||
    typeof aggregate.ratingCount !== "number"
  ) {
    return null;
  }

  let appreciation: { authorName: string } | null = null;
  if (value.appreciation !== null) {
    if (!isRecord(value.appreciation)) return null;
    const authorName = readString(value.appreciation.authorName);
    if (!authorName) return null;
    appreciation = { authorName };
  }

  return {
    title,
    subtitle,
    formatLabel,
    coverUrl,
    metaLine,
    priceLabel,
    isFree: value.isFree,
    gallery,
    topics,
    contents,
    recommendationsTitle,
    recommendations,
    rating: {
      enabled: value.rating.enabled,
      aggregate: {
        totalStars: aggregate.totalStars,
        ratingCount: aggregate.ratingCount,
      },
    },
    appreciation,
  };
}
