import type { SupabaseClient } from "@supabase/supabase-js";

import { listAuthorWorkspacesForUser } from "@/lib/author-products/auth";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import {
  enrichCatalogProducts,
  getContinueListening,
  loadAudioSummaryMap,
} from "@/lib/home/listening-progress";
import type { ContinueListeningItem } from "@/lib/home/types";
import { resolveInitialPlayback } from "@/lib/listen/progress";
import type { ListenProgressEntry } from "@/lib/listen/types";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";

import { getCurrentAuthorApplication } from "@/lib/author-applications/queries";
import { resolveProfileApplicationVariant } from "@/lib/author-applications/status";
import type { ProfileApplicationVariant } from "@/lib/author-applications/types";
import {
  getAuthorWorkspaceCountLabel,
  getDisplayName,
  getInitial,
  getProfileRolePrimaryLabel,
} from "./display-name";
import type {
  ProfileAuthorSection,
  ProfileCardData,
  ProfileContinueState,
  ProfileCounter,
  ProfilePageData,
} from "./types";

type ProfileRow = {
  full_name: string | null;
  role: string | null;
};

type ProgressRow = {
  practice_id: string;
  audio_item_id: string;
  position_seconds: number;
  completed: boolean;
};

type AudioItemRow = {
  id: string;
  practice_id: string;
  duration_seconds: number | null;
  position: number;
};

function isAccessActive(expiresAt: string | null): boolean {
  if (expiresAt === null) {
    return true;
  }

  return new Date(expiresAt) > new Date();
}

function formatCounterValue(
  value: number | null | undefined,
  hasError: boolean,
): number | null {
  if (hasError) {
    return null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  return value;
}

async function countActiveLibraryItems(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ count: number | null; error: boolean }> {
  const { data, error } = await supabase
    .from("user_practices")
    .select("id, expires_at")
    .eq("user_id", userId);

  if (error) {
    console.error("profile_library_count_error", error.message);
    return { count: null, error: true };
  }

  const count = (data ?? []).filter((row) =>
    isAccessActive(row.expires_at),
  ).length;

  return { count, error: false };
}

async function countOwnedPlaylists(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ count: number | null; error: boolean }> {
  const { count, error } = await supabase
    .from("playlists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    console.error("profile_playlists_count_error", error.message);
    return { count: null, error: true };
  }

  return { count: count ?? 0, error: false };
}

async function countCompletedPractices(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ count: number | null; error: boolean }> {
  const { data: progressRows, error: progressError } = await supabase
    .from("practice_audio_progress")
    .select("practice_id, audio_item_id, position_seconds, completed")
    .eq("user_id", userId);

  if (progressError) {
    console.error("profile_completed_count_error", progressError.message);
    return { count: null, error: true };
  }

  if (!progressRows?.length) {
    return { count: 0, error: false };
  }

  const practiceIds = [
    ...new Set((progressRows as ProgressRow[]).map((row) => row.practice_id)),
  ];

  const { data: audioItems, error: audioError } = await supabase
    .from("audio_items")
    .select("id, practice_id, duration_seconds, position")
    .in("practice_id", practiceIds)
    .eq("status", "published")
    .order("position", { ascending: true });

  if (audioError) {
    console.error("profile_completed_audio_error", audioError.message);
    return { count: null, error: true };
  }

  const tracksByPractice = new Map<
    string,
    Array<{ id: string; durationSeconds: number | null }>
  >();

  for (const item of (audioItems ?? []) as AudioItemRow[]) {
    const current = tracksByPractice.get(item.practice_id) ?? [];

    current.push({
      id: item.id,
      durationSeconds: item.duration_seconds,
    });

    tracksByPractice.set(item.practice_id, current);
  }

  let completedCount = 0;

  for (const practiceId of practiceIds) {
    const tracks = tracksByPractice.get(practiceId) ?? [];

    if (tracks.length === 0) {
      continue;
    }

    const progress: ListenProgressEntry[] = (progressRows as ProgressRow[])
      .filter((row) => row.practice_id === practiceId)
      .map((row) => ({
        audioItemId: row.audio_item_id,
        positionSeconds: row.position_seconds,
        completed: row.completed,
      }));

    const initial = resolveInitialPlayback(tracks, progress);

    if (initial.allCompleted) {
      completedCount += 1;
    }
  }

  return { count: completedCount, error: false };
}

async function loadContinueListeningItem(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ item: ContinueListeningItem | null; error: boolean }> {
  try {
    const catalogProducts = await getPublishedCatalogProducts(supabase);
    const practiceIds = catalogProducts.map((product) => product.id);
    const audioSummaryMap = await loadAudioSummaryMap(supabase, practiceIds);
    const allProducts = enrichCatalogProducts(catalogProducts, audioSummaryMap);
    const catalogProductMap = new Map(
      allProducts.map((product) => [product.id, product]),
    );

    const item = await getContinueListening(
      supabase,
      userId,
      catalogProductMap,
      audioSummaryMap,
    );

    return { item, error: false };
  } catch (error) {
    console.error("profile_continue_listening_error", error);
    return { item: null, error: true };
  }
}

function buildContinueState(
  item: ContinueListeningItem | null,
  hasError: boolean,
): ProfileContinueState {
  if (hasError) {
    return { kind: "error" };
  }

  if (item) {
    return { kind: "item", item };
  }

  return { kind: "empty" };
}

function buildAuthorSection(
  workspaces: AuthorWorkspace[],
  applicationVariant: ProfileApplicationVariant | null,
  reviewComment: string | null,
): ProfileAuthorSection {
  if (workspaces.length > 0) {
    return { kind: "member", workspaces };
  }

  if (applicationVariant) {
    return {
      kind: "application",
      variant: applicationVariant,
      reviewComment,
    };
  }

  return {
    kind: "application",
    variant: "none",
  };
}

function buildCounters(
  library: { count: number | null; error: boolean },
  playlists: { count: number | null; error: boolean },
  completed: { count: number | null; error: boolean },
): ProfileCounter[] {
  return [
    {
      key: "library",
      value: formatCounterValue(library.count, library.error),
      label: "в аудиотеке",
      href: "/my-practices",
    },
    {
      key: "playlists",
      value: formatCounterValue(playlists.count, playlists.error),
      label: "плейлистов",
      href: "/playlists",
    },
    {
      key: "completed",
      value: formatCounterValue(completed.count, completed.error),
      label: "завершено",
      href: completed.error ? null : "/history?filter=completed",
    },
  ];
}

export async function getProfilePageData(
  supabase: SupabaseClient,
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  },
): Promise<ProfilePageData> {
  const [
    profileResult,
    libraryCount,
    playlistsCount,
    completedCount,
    continueResult,
    authorWorkspaces,
    authorApplication,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .maybeSingle(),
    countActiveLibraryItems(supabase, user.id),
    countOwnedPlaylists(supabase, user.id),
    countCompletedPractices(supabase, user.id),
    loadContinueListeningItem(supabase, user.id),
    listAuthorWorkspacesForUser(user.id).catch((error) => {
      console.error("profile_author_workspaces_error", error);
      return [] as Awaited<ReturnType<typeof listAuthorWorkspacesForUser>>;
    }),
    getCurrentAuthorApplication(supabase, user.id).catch((error) => {
      console.error("profile_author_application_error", error);
      return null;
    }),
  ]);

  if (profileResult.error) {
    console.error("profile_card_load_error", profileResult.error.message);
  }

  const profile = (profileResult.data as ProfileRow | null) ?? null;
  const displayName = getDisplayName(profile, user);
  const workspaceCount = authorWorkspaces.length;

  const card: ProfileCardData = {
    displayName,
    initial: getInitial(displayName),
    email: user.email?.trim() ?? "",
    rolePrimaryLabel: getProfileRolePrimaryLabel(workspaceCount),
    authorWorkspaceCountLabel: getAuthorWorkspaceCountLabel(workspaceCount),
  };

  return {
    card,
    continueState: buildContinueState(
      continueResult.item,
      continueResult.error,
    ),
    counters: buildCounters(libraryCount, playlistsCount, completedCount),
    authorSection: buildAuthorSection(
      authorWorkspaces,
      resolveProfileApplicationVariant({
        workspaceCount: authorWorkspaces.length,
        applicationStatus: authorApplication?.status ?? null,
      }),
      authorApplication?.review_comment ?? null,
    ),
  };
}

export function formatCounterDisplay(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return String(value);
}

export function getAuthorMemberRoleLabel(
  role: AuthorWorkspace["role"],
): string {
  if (role === "owner") {
    return "Владелец";
  }

  return "Редактор";
}
