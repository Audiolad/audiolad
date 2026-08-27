import type { SupabaseClient } from "@supabase/supabase-js";

import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import { getCurrentAuthorApplication } from "@/lib/author-applications/queries";
import { resolveProfileApplicationVariant } from "@/lib/author-applications/status";
import { resolveShowBecomeAuthorPromo } from "@/lib/listener/author-cta";
import { resolveInitialPlayback } from "@/lib/listen/progress";
import type { ListenProgressEntry } from "@/lib/listen/types";
import { buildAuthorPublicPath } from "@/lib/products/paths";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { loadPublicAuthorsList } from "@/lib/authors/public-list-data";

import {
  getMoscowDateKey,
  selectDailyFreeGiftProducts,
} from "./daily-free-gifts";
import {
  selectDailyForYouProducts,
  type ForYouListeningState,
} from "./daily-for-you";
import { getGreetingFirstName } from "./profile-name";
import {
  enrichCatalogProducts,
  getActivePrograms,
  getContinueListening,
  getRecentlyListenedProducts,
  isProgramProduct,
  loadAudioSummaryMap,
  takeUniqueProducts,
} from "./listening-progress";
import { safeHomeSection, safeHomeSectionResult } from "./safe";
import type {
  GuestHomeData,
  HomeAuthor,
  HomeProduct,
  PersonalHomeData,
} from "./types";

function buildCatalogProductMap(products: HomeProduct[]): Map<string, HomeProduct> {
  return new Map(products.map((product) => [product.id, product]));
}

type ForYouLibraryRow = {
  practice_id: string;
};

type ForYouProgressRow = {
  practice_id: string;
  audio_item_id: string;
  position_seconds: number;
  completed: boolean;
};

type ForYouAudioRow = {
  id: string;
  practice_id: string;
  duration_seconds: number | null;
};

async function getDailyForYouProducts(
  supabase: SupabaseClient,
  userId: string,
  products: HomeProduct[],
): Promise<HomeProduct[]> {
  if (products.length === 0) {
    return [];
  }

  const practiceIds = products.map((product) => product.id);
  const [libraryResult, progressResult, audioResult] = await Promise.all([
    supabase
      .from("user_practices")
      .select("practice_id")
      .eq("user_id", userId)
      .in("practice_id", practiceIds),
    supabase
      .from("practice_audio_progress")
      .select("practice_id, audio_item_id, position_seconds, completed")
      .eq("user_id", userId)
      .in("practice_id", practiceIds),
    supabase
      .from("audio_items")
      .select("id, practice_id, duration_seconds")
      .in("practice_id", practiceIds)
      .eq("status", "published"),
  ]);

  if (libraryResult.error || progressResult.error || audioResult.error) {
    throw new Error("personal_for_you_data_load_failed");
  }

  const libraryPracticeIds = new Set(
    (libraryResult.data ?? []).map(
      (row) => (row as ForYouLibraryRow).practice_id,
    ),
  );
  const progressByPractice = new Map<string, ListenProgressEntry[]>();

  for (const row of (progressResult.data ?? []) as ForYouProgressRow[]) {
    const current = progressByPractice.get(row.practice_id) ?? [];
    current.push({
      audioItemId: row.audio_item_id,
      positionSeconds: row.position_seconds,
      completed: row.completed,
    });
    progressByPractice.set(row.practice_id, current);
  }

  const tracksByPractice = new Map<
    string,
    Array<{ id: string; durationSeconds: number | null }>
  >();

  for (const row of (audioResult.data ?? []) as ForYouAudioRow[]) {
    const current = tracksByPractice.get(row.practice_id) ?? [];
    current.push({ id: row.id, durationSeconds: row.duration_seconds });
    tracksByPractice.set(row.practice_id, current);
  }

  return selectDailyForYouProducts({
    products: products.map((product) => {
      const progress = progressByPractice.get(product.id) ?? [];
      const tracks = tracksByPractice.get(product.id) ?? [];
      let listeningState: ForYouListeningState = "unplayed";

      if (progress.length > 0) {
        listeningState = resolveInitialPlayback(tracks, progress).allCompleted
          ? "completed"
          : "in_progress";
      }

      return {
        ...product,
        isInLibrary: libraryPracticeIds.has(product.id),
        listeningState,
      };
    }),
    userId,
    dateKey: getMoscowDateKey(),
    limit: 6,
  });
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
  const dailyFreeGiftProducts = selectDailyFreeGiftProducts({
    products: freeProducts,
    featuredProductId: featuredFreeProduct?.id ?? null,
    dateKey: getMoscowDateKey(),
    limit: 8,
  });
  const programProducts = products.filter(isProgramProduct).slice(0, 8);

  const authors = await safeHomeSection(
    "guest_authors",
    () => getPublishedAuthors(supabase),
    [],
  );

  return {
    featuredFreeProduct,
    freeProducts: dailyFreeGiftProducts,
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
    forYouProducts,
    authors,
    authorWorkspacesResult,
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
      "personal_for_you",
      () => getDailyForYouProducts(supabase, userId, allProducts),
      [],
      { userId },
    ),
    safeHomeSection(
      "personal_authors",
      () => getPublishedAuthors(supabase),
      [],
      { userId },
    ),
    safeHomeSectionResult(
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

  const authorWorkspaces = authorWorkspacesResult.value;

  const applicationVariant = resolveProfileApplicationVariant({
    workspaceCount: authorWorkspaces.length,
    applicationStatus: authorApplication?.status ?? null,
  });

  const showBecomeAuthorPromo = resolveShowBecomeAuthorPromo({
    workspaces: authorWorkspaces,
    applicationVariant,
    roleLookupStatus: authorWorkspacesResult.ok ? "confirmed" : "unknown",
  });

  const shownIds = new Set<string>();

  if (continueListening) {
    shownIds.add(continueListening.product.id);
  }

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
  // Keep absolute newest by catalog order; do not dedupe against upper rails.
  const newProducts = allProducts.slice(0, 8);
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
