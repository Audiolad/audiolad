import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAuthorPublicPath } from "@/lib/products/paths";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";

import { buildPersonalGreetingContent } from "./greeting";
import { getGreetingFirstName } from "./profile-name";
import {
  enrichCatalogProducts,
  excludeProducts,
  getActivePrograms,
  getContinueListening,
  getRecentlyListenedProducts,
  isProgramProduct,
  loadAudioSummaryMap,
  takeUniqueProducts,
} from "./listening-progress";
import { safeHomeSection } from "./safe";
import type {
  GuestHomeData,
  HomeAuthor,
  HomeProduct,
  PersonalHomeData,
} from "./types";

function buildCatalogProductMap(products: HomeProduct[]): Map<string, HomeProduct> {
  return new Map(products.map((product) => [product.id, product]));
}

async function getPublishedAuthors(
  supabase: SupabaseClient,
): Promise<HomeAuthor[]> {
  const { data: practices, error } = await supabase
    .from("practices")
    .select(
      `
      id,
      author_id,
      authors!inner (
        id,
        name,
        slug,
        description,
        avatar_url
      )
    `,
    )
    .eq("status", "published")
    .eq("is_catalog_listed", true)
    .not("author_id", "is", null);

  if (error) {
    throw error;
  }

  if (!practices?.length) {
    return [];
  }

  const authorMap = new Map<
    string,
    {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      avatarUrl: string | null;
      publishedCount: number;
    }
  >();

  for (const row of practices as Array<{
    author_id: string;
    authors:
      | {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          avatar_url: string | null;
        }
      | Array<{
          id: string;
          name: string;
          slug: string;
          description: string | null;
          avatar_url: string | null;
        }>;
  }>) {
    const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;

    if (!author?.slug?.trim() || !author?.name?.trim()) {
      continue;
    }

    const existing = authorMap.get(author.id);

    if (existing) {
      existing.publishedCount += 1;
      continue;
    }

    authorMap.set(author.id, {
      id: author.id,
      name: author.name.trim(),
      slug: author.slug.trim(),
      description: author.description?.trim() || null,
      avatarUrl: author.avatar_url?.trim() || null,
      publishedCount: 1,
    });
  }

  return [...authorMap.values()]
    .sort((left, right) => right.publishedCount - left.publishedCount)
    .map((author) => ({
      id: author.id,
      name: author.name,
      slug: author.slug,
      description: author.description,
      avatarUrl: author.avatarUrl,
      publishedCount: author.publishedCount,
      href: buildAuthorPublicPath(author.slug),
    }));
}

async function getLibraryProducts(
  supabase: SupabaseClient,
  userId: string,
  catalogProductMap: Map<string, HomeProduct>,
): Promise<HomeProduct[]> {
  const { data: libraryRows, error } = await supabase
    .from("user_practices")
    .select(
      `
      id,
      expires_at,
      practices (
        id
      )
    `,
    )
    .eq("user_id", userId)
    .order("granted_at", { ascending: false });

  if (error) {
    throw error;
  }

  if (!libraryRows?.length) {
    return [];
  }

  const now = Date.now();
  const practiceIds: string[] = [];

  for (const row of libraryRows as Array<{
    expires_at: string | null;
    practices: { id: string } | { id: string }[] | null;
  }>) {
    const expiresAt = row.expires_at;

    if (expiresAt !== null && Date.parse(expiresAt) <= now) {
      continue;
    }

    const practice = Array.isArray(row.practices)
      ? row.practices[0]
      : row.practices;

    if (practice?.id) {
      practiceIds.push(practice.id);
    }
  }

  return practiceIds.flatMap((practiceId) => {
    const product = catalogProductMap.get(practiceId);
    return product ? [product] : [];
  });
}

function selectTimeOfDayProducts(
  products: HomeProduct[],
  daySeed: number,
  limit = 6,
): HomeProduct[] {
  if (products.length === 0) {
    return [];
  }

  const offset = daySeed % products.length;
  const rotated = [...products.slice(offset), ...products.slice(0, offset)];

  return rotated.slice(0, limit);
}

export async function getGuestHomeData(
  supabase: SupabaseClient,
): Promise<GuestHomeData> {
  const catalogProducts = await safeHomeSection(
    "guest_catalog",
    () => getPublishedCatalogProducts(supabase),
    [],
  );

  const practiceIds = catalogProducts.map((product) => product.id);
  const audioSummaryMap = await safeHomeSection(
    "guest_audio_summaries",
    () => loadAudioSummaryMap(supabase, practiceIds),
    new Map<string, { audioCount: number; totalDurationSeconds: number }>(),
  );

  const products = enrichCatalogProducts(catalogProducts, audioSummaryMap);
  const freeProducts = products.filter((product) => product.isFree);
  const featuredFreeProduct = freeProducts[0] ?? null;
  const programProducts = products.filter(isProgramProduct).slice(0, 8);

  const authors = await safeHomeSection(
    "guest_authors",
    () => getPublishedAuthors(supabase),
    [],
  );

  return {
    featuredFreeProduct,
    freeProducts: freeProducts.slice(0, 12),
    newProducts: products.slice(0, 8),
    programProducts,
    authors,
  };
}

export async function getPersonalHomeData(
  supabase: SupabaseClient,
  userId: string,
  userMetadata: Record<string, unknown> | undefined,
): Promise<PersonalHomeData> {
  const profile = await safeHomeSection(
    "personal_profile",
    async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },
    null,
    { userId },
  );

  const catalogProducts = await safeHomeSection(
    "personal_catalog",
    () => getPublishedCatalogProducts(supabase),
    [],
    { userId },
  );

  const practiceIds = catalogProducts.map((product) => product.id);
  const audioSummaryMap = await safeHomeSection(
    "personal_audio_summaries",
    () => loadAudioSummaryMap(supabase, practiceIds),
    new Map<string, { audioCount: number; totalDurationSeconds: number }>(),
    { userId },
  );

  const allProducts = enrichCatalogProducts(catalogProducts, audioSummaryMap);
  const catalogProductMap = buildCatalogProductMap(allProducts);
  const freeProducts = allProducts.filter((product) => product.isFree);

  const [
    continueListening,
    recentlyListened,
    activePrograms,
    libraryProducts,
  ] = await Promise.all([
    safeHomeSection(
      "personal_continue_listening",
      () =>
        getContinueListening(
          supabase,
          userId,
          catalogProductMap,
          audioSummaryMap,
        ),
      null,
      { userId },
    ),
    safeHomeSection(
      "personal_recently_listened",
      () =>
        getRecentlyListenedProducts(
          supabase,
          userId,
          catalogProductMap,
          audioSummaryMap,
        ),
      [],
      { userId },
    ),
    safeHomeSection(
      "personal_active_programs",
      () =>
        getActivePrograms(
          supabase,
          userId,
          catalogProductMap,
          audioSummaryMap,
        ),
      [],
      { userId },
    ),
    safeHomeSection(
      "personal_library",
      () => getLibraryProducts(supabase, userId, catalogProductMap),
      [],
      { userId },
    ),
  ]);

  const shownIds = new Set<string>();

  if (continueListening) {
    shownIds.add(continueListening.product.id);
  }

  const visibleRecentlyListened = recentlyListened.filter(
    (product) => !shownIds.has(product.id),
  );

  for (const product of visibleRecentlyListened) {
    shownIds.add(product.id);
  }

  const visibleActivePrograms = activePrograms.filter(
    (program) => !shownIds.has(program.product.id),
  );

  for (const program of visibleActivePrograms) {
    shownIds.add(program.product.id);
  }

  const visibleLibraryProducts = excludeProducts(
    libraryProducts.slice(0, 8),
    shownIds,
  );

  for (const product of visibleLibraryProducts) {
    shownIds.add(product.id);
  }

  const startSuggestions = takeUniqueProducts([freeProducts, allProducts], 4);

  const forYouProducts = excludeProducts(
    takeUniqueProducts(
      [recentlyListened, freeProducts, allProducts.slice(0, 12)],
      8,
    ),
    shownIds,
  );

  const timeOfDayProducts = excludeProducts(
    selectTimeOfDayProducts(
      takeUniqueProducts([freeProducts, allProducts], 12),
      new Date().getDate(),
      6,
    ),
    shownIds,
  );

  const newProducts = excludeProducts(allProducts.slice(0, 8), shownIds);
  const personalFreeProducts = excludeProducts(freeProducts.slice(0, 8), shownIds);
  const greetingFirstName = getGreetingFirstName(profile, userMetadata);
  const greetingContent = buildPersonalGreetingContent(greetingFirstName);

  return {
    greetingTitle: greetingContent.greetingTitle,
    greetingPhrase: greetingContent.greetingPhrase,
    timeOfDaySectionTitle: greetingContent.timeOfDaySectionTitle,
    continueListening,
    startSuggestions,
    forYouProducts,
    activePrograms: visibleActivePrograms,
    recentlyListened: visibleRecentlyListened,
    libraryProducts: visibleLibraryProducts,
    timeOfDayProducts,
    newProducts,
    freeProducts: personalFreeProducts,
  };
}
