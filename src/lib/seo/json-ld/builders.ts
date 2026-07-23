import {
  DEFAULT_AUTHOR_SHORT_POSITIONING,
} from "@/lib/authors/brand-assets";
import { isProductFree } from "@/lib/products/price-format";
import {
  buildAuthorPublicPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";
import { buildPromoPageUrl } from "@/lib/promo-pages/paths";
import { buildPublicPlaylistPath } from "@/lib/playlists/public-url";
import { getAppOrigin } from "@/lib/seo/app-origin";

import { secondsToIso8601Duration } from "./duration";
import { resolveJsonLdImageUrl } from "./url-policy";

export type JsonLdNode = Record<string, unknown>;

export type BreadcrumbItemInput = {
  name: string;
  path: string;
};

export type AuthorJsonLdInput = {
  name: string;
  slug: string;
  authorType: string;
  description: string | null;
  imageUrl: string | null;
  topics?: ReadonlyArray<{ title: string }>;
  sameAs?: ReadonlyArray<string>;
};

export type PracticeTrackJsonLdInput = {
  name: string;
  position: number;
  durationSeconds: number | null;
  contentUrl?: string | null;
  encodingFormat?: string | null;
};

export type PracticeJsonLdInput = {
  title: string;
  description: string | null;
  authorSlug: string;
  authorName: string;
  authorType?: string;
  productSlug: string;
  imageUrl: string | null;
  isFree: boolean | null;
  price: number | null;
  tracks?: ReadonlyArray<PracticeTrackJsonLdInput>;
  origin?: string;
};

export type PromoProductJsonLdInput = {
  title: string;
  authorSlug: string;
  productSlug: string;
  position: number;
};

export type PromoPageJsonLdInput = {
  title: string;
  description: string | null;
  authorSlug: string;
  promoSlug: string;
  products: ReadonlyArray<PromoProductJsonLdInput>;
  origin?: string;
};

export type PlaylistItemJsonLdInput = {
  title: string;
  href: string | null;
  position: number;
};

export type PlaylistJsonLdInput = {
  title: string;
  slug: string;
  description: string | null;
  items: ReadonlyArray<PlaylistItemJsonLdInput>;
  origin?: string;
};

const SITE_NAME = "АудиоЛад";
const SITE_DESCRIPTION =
  "Платформа аудиопрактик, медитаций и энергетических программ";

function originUrl(origin = getAppOrigin()): string {
  return origin.replace(/\/$/, "");
}

function absolutePath(path: string, origin = getAppOrigin()): string {
  return `${originUrl(origin)}${path.startsWith("/") ? path : `/${path}`}`;
}

function resolveAuthorSchemaType(authorType: string | undefined): "Person" | "Organization" {
  return authorType === "person" ? "Person" : "Organization";
}

export function buildOrganizationJsonLd(origin = getAppOrigin()): JsonLdNode {
  const siteOrigin = originUrl(origin);

  return {
    "@type": "Organization",
    "@id": `${siteOrigin}/#organization`,
    name: SITE_NAME,
    url: `${siteOrigin}/`,
    logo: `${siteOrigin}/audiolad-logo.png`,
    description: SITE_DESCRIPTION,
  };
}

export function buildWebSiteJsonLd(origin = getAppOrigin()): JsonLdNode {
  const siteOrigin = originUrl(origin);

  return {
    "@type": "WebSite",
    "@id": `${siteOrigin}/#website`,
    url: `${siteOrigin}/`,
    name: SITE_NAME,
    inLanguage: "ru-RU",
    publisher: {
      "@id": `${siteOrigin}/#organization`,
    },
  };
}

export function buildHomeJsonLd(origin = getAppOrigin()): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": [buildOrganizationJsonLd(origin), buildWebSiteJsonLd(origin)],
  };
}

export function buildBreadcrumbListJsonLd(
  items: ReadonlyArray<BreadcrumbItemInput>,
  origin = getAppOrigin(),
): JsonLdNode | null {
  if (items.length === 0) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolutePath(item.path, origin),
    })),
  };
}

export function buildAuthorJsonLd(
  input: AuthorJsonLdInput,
  origin = getAppOrigin(),
): JsonLdNode | null {
  const canonicalUrl = absolutePath(buildAuthorPublicPath(input.slug), origin);
  const schemaType = resolveAuthorSchemaType(input.authorType);
  const description =
    input.description?.trim() &&
    input.description.trim() !== DEFAULT_AUTHOR_SHORT_POSITIONING
      ? input.description.trim()
      : null;
  const image = resolveJsonLdImageUrl(input.imageUrl, origin);
  const knowsAbout =
    input.topics
      ?.map((topic) => topic.title.trim())
      .filter(Boolean) ?? [];
  const sameAs =
    input.sameAs?.map((url) => url.trim()).filter(Boolean) ?? [];

  const authorNode: JsonLdNode = {
    "@context": "https://schema.org",
    "@type": schemaType,
    "@id": `${canonicalUrl}#author`,
    name: input.name,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    description,
    image,
    knowsAbout: knowsAbout.length > 0 ? knowsAbout : undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
  };

  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: "Авторы", path: "/authors" },
      { name: input.name, path: buildAuthorPublicPath(input.slug) },
    ],
    origin,
  );

  if (breadcrumbs) {
    return {
      "@context": "https://schema.org",
      "@graph": [authorNode, breadcrumbs],
    };
  }

  return authorNode;
}

function buildPracticeAuthorNode(
  input: Pick<
    PracticeJsonLdInput,
    "authorName" | "authorSlug" | "authorType"
  >,
  origin = getAppOrigin(),
): JsonLdNode {
  const authorUrl = absolutePath(buildAuthorPublicPath(input.authorSlug), origin);

  return {
    "@type": resolveAuthorSchemaType(input.authorType),
    "@id": `${authorUrl}#author`,
    name: input.authorName,
    url: authorUrl,
  };
}

function buildPracticeOffer(
  input: Pick<PracticeJsonLdInput, "authorSlug" | "productSlug" | "price">,
  origin = getAppOrigin(),
): JsonLdNode | null {
  if (
    typeof input.price !== "number" ||
    !Number.isFinite(input.price) ||
    input.price <= 0
  ) {
    return null;
  }

  return {
    "@type": "Offer",
    price: input.price.toFixed(0),
    priceCurrency: "RUB",
    url: absolutePath(
      buildPracticePublicPath(input.authorSlug, input.productSlug),
      origin,
    ),
    availability: "https://schema.org/InStock",
  };
}

function buildPracticeAudioNodes(
  tracks: ReadonlyArray<PracticeTrackJsonLdInput> | undefined,
): JsonLdNode[] | undefined {
  if (!tracks || tracks.length === 0) {
    return undefined;
  }

  const audioNodes = tracks
    .map((track) => {
      const duration = secondsToIso8601Duration(track.durationSeconds);

      return {
        "@type": "AudioObject",
        name: track.name,
        position: track.position,
        duration,
        encodingFormat: track.encodingFormat?.trim() || undefined,
      };
    })
    .filter((node) => Boolean(node.name));

  return audioNodes.length > 0 ? audioNodes : undefined;
}

export function buildPracticeJsonLd(
  input: PracticeJsonLdInput,
  origin = getAppOrigin(),
): JsonLdNode | null {
  const canonicalUrl = absolutePath(
    buildPracticePublicPath(input.authorSlug, input.productSlug),
    origin,
  );
  const free = isProductFree(input.isFree, input.price);
  const offer = free ? null : buildPracticeOffer(input, origin);
  const audio = buildPracticeAudioNodes(input.tracks);

  const creativeWork: JsonLdNode = {
    "@type": "CreativeWork",
    "@id": `${canonicalUrl}#creative-work`,
    name: input.title,
    url: canonicalUrl,
    description: input.description?.trim() || undefined,
    image: resolveJsonLdImageUrl(input.imageUrl, origin),
    author: buildPracticeAuthorNode(input, origin),
    publisher: {
      "@id": `${originUrl(origin)}/#organization`,
    },
    inLanguage: "ru-RU",
    ...(free ? { isAccessibleForFree: true } : {}),
    ...(offer ? { offers: offer } : {}),
    ...(audio ? { associatedMedia: audio } : {}),
  };

  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: "Каталог", path: "/catalog" },
      {
        name: input.authorName,
        path: buildAuthorPublicPath(input.authorSlug),
      },
      {
        name: input.title,
        path: buildPracticePublicPath(input.authorSlug, input.productSlug),
      },
    ],
    origin,
  );

  return {
    "@context": "https://schema.org",
    "@graph": breadcrumbs ? [creativeWork, breadcrumbs] : [creativeWork],
  };
}

export function buildPromoPageJsonLd(
  input: PromoPageJsonLdInput,
  origin = getAppOrigin(),
): JsonLdNode | null {
  const canonicalUrl = buildPromoPageUrl(
    origin,
    input.authorSlug,
    input.promoSlug,
  );
  const products = [...input.products].sort((a, b) => a.position - b.position);

  const itemList =
    products.length > 0
      ? {
          "@type": "ItemList",
          itemListElement: products.map((product, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: absolutePath(
              buildPracticePublicPath(product.authorSlug, product.productSlug),
              origin,
            ),
            name: product.title,
          })),
        }
      : undefined;

  const pageNode: JsonLdNode = {
    "@type": "CollectionPage",
    "@id": `${canonicalUrl}#webpage`,
    name: input.title,
    url: canonicalUrl,
    description: input.description?.trim() || undefined,
    inLanguage: "ru-RU",
    isPartOf: {
      "@id": `${originUrl(origin)}/#website`,
    },
    mainEntity: itemList,
  };

  return {
    "@context": "https://schema.org",
    "@graph": [pageNode],
  };
}

export function buildPublicPlaylistJsonLd(
  input: PlaylistJsonLdInput,
  origin = getAppOrigin(),
): JsonLdNode | null {
  const canonicalUrl = absolutePath(
    buildPublicPlaylistPath(input.slug),
    origin,
  );
  const availableItems = input.items.filter((item) => item.href);

  const itemList =
    availableItems.length > 0
      ? {
          "@type": "ItemList",
          itemListElement: availableItems.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: absolutePath(item.href!, origin),
            name: item.title,
          })),
        }
      : undefined;

  const collectionPage: JsonLdNode = {
    "@type": "CollectionPage",
    "@id": `${canonicalUrl}#collection`,
    name: input.title,
    url: canonicalUrl,
    description: input.description?.trim() || undefined,
    inLanguage: "ru-RU",
    isPartOf: {
      "@id": `${originUrl(origin)}/#website`,
    },
    mainEntity: itemList,
  };

  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: input.title, path: `/p/${input.slug}` },
    ],
    origin,
  );

  return {
    "@context": "https://schema.org",
    "@graph": breadcrumbs ? [collectionPage, breadcrumbs] : [collectionPage],
  };
}

export function shouldEmitPracticeJsonLd(input: {
  status: string | null | undefined;
  isFixtureMarked: boolean;
}): boolean {
  return input.status === "published" && !input.isFixtureMarked;
}

export function shouldEmitAuthorJsonLd(input: {
  isFixtureMarked: boolean;
}): boolean {
  return !input.isFixtureMarked;
}
