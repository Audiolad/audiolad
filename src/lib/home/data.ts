import type { SupabaseClient } from "@supabase/supabase-js";

import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { getCurrentAuthorApplication } from "@/lib/author-applications/queries";
import { resolveProfileApplicationVariant } from "@/lib/author-applications/status";
import { resolveShowBecomeAuthorPromo } from "@/lib/listener/author-cta";
import { buildAuthorPublicPath } from "@/lib/products/paths";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { loadPublicAuthorsList } from "@/lib/authors/public-list-data";

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
  const { authors, error } = await loadPublicAuthorsList(supabase);

  if (error) {
    throw error;
  }

  return authors.map((author) => ({
    id: author.id,
    name: author.name,
    slug: author.slug,
    positioningText: author.positioningText,
    avatarUrl: author.avatarUrl,
    publishedCount: author.publishedCount,
    href: buildAuthorPublicPath(author.slug),
  }));
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
    authors,
    authorWorkspaces,
    authorApplication,
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
      "personal_authors",
      () => getPublishedAuthors(supabase),
      [],
      { userId },
    ),
    safeHomeSection(
      "personal_author_workspaces",
      () => listAuthorWorkspacesForUser(userId),
      [],
      { userId },
    ),
    safeHomeSection(
      "personal_author_application",
      () => getCurrentAuthorApplication(supabase, userId),
      null,
      { userId },
    ),
  ]);

  const applicationVariant = resolveProfileApplicationVariant({
    workspaceCount: authorWorkspaces.length,
    applicationStatus: authorApplication?.status ?? null,
  });

  const showBecomeAuthorPromo = resolveShowBecomeAuthorPromo({
    workspaces: authorWorkspaces,
    applicationVariant,
  });

  const shownIds = new Set<string>();

  if (continueListening) {
    shownIds.add(continueListening.product.id);
  }

  const forYouProducts = excludeProducts(
    takeUniqueProducts(
      [recentlyListened, freeProducts, allProducts.slice(0, 12)],
      8,
    ),
    shownIds,
  );

  for (const product of forYouProducts) {
    shownIds.add(product.id);
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

  const startSuggestions = takeUniqueProducts([freeProducts, allProducts], 4);
  const newProducts = excludeProducts(allProducts.slice(0, 8), shownIds);
  const greetingFirstName = getGreetingFirstName(profile, userMetadata);

  return {
    greetingFirstName,
    continueListening,
    startSuggestions,
    forYouProducts,
    recentlyListened: visibleRecentlyListened,
    activePrograms: visibleActivePrograms,
    newProducts,
    authors,
    showBecomeAuthorPromo,
  };
}
