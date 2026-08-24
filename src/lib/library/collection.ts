/**
 * Аудиотека collection: merge user_practices (entitlement) + library_saves.
 *
 * Save is a bookmark. Entitlement is listen access.
 * canListen is never derived from isSaved.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  LIBRARY_SAVES_TABLE,
  createSupabaseLibrarySavesStore,
} from "@/lib/library/saves";

export type LibraryCollectionEntitlement = {
  id: string;
  practiceId: string;
  accessSource: string;
  grantedAt: string;
  expiresAt: string | null;
};

export type LibraryCollectionSave = {
  practiceId: string;
  createdAt: string;
};

export type LibraryCollectionPractice = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  durationMinutes: number | null;
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt: string | null;
  audioUrl: string | null;
  isFree: boolean | null;
  price: number | null;
  authorName: string | null;
  authorSlug: string | null;
};

export type LibraryCollectionItem = {
  id: string;
  practiceId: string;
  isSaved: boolean;
  canListen: boolean;
  accessSource: string | null;
  grantedAt: string | null;
  practice: LibraryCollectionPractice | null;
};

type AuthorRow = {
  name: string | null;
  slug: string | null;
};

type PracticeRow = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  cover_image?: unknown;
  updated_at: string | null;
  audio_url: string | null;
  authors: AuthorRow | AuthorRow[] | null;
};

type EntitlementRow = {
  id: string;
  access_source: string;
  granted_at: string;
  expires_at: string | null;
  practice_id?: string;
  practices: PracticeRow | PracticeRow[] | null;
};

const LIBRARY_CARD_PRACTICE_SELECT = `
  id,
  title,
  slug,
  format,
  duration_minutes,
  price,
  is_free,
  cover_url,
  cover_image,
  updated_at,
  authors!practices_author_id_fkey (
    name,
    slug
  )
`;

const LIBRARY_ENTITLED_PRACTICE_SELECT = `
  id,
  title,
  slug,
  format,
  duration_minutes,
  price,
  is_free,
  cover_url,
  cover_image,
  updated_at,
  audio_url,
  authors!practices_author_id_fkey (
    name,
    slug
  )
`;

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function isLibraryEntitlementActive(
  expiresAt: string | null,
  now: Date = new Date(),
): boolean {
  if (expiresAt === null) {
    return true;
  }

  const expiresDate = new Date(expiresAt);

  if (Number.isNaN(expiresDate.getTime())) {
    return false;
  }

  return expiresDate > now;
}

export function resolveLibraryCollectionAccess(input: {
  entitlement: Pick<LibraryCollectionEntitlement, "accessSource" | "expiresAt"> | null;
  isSaved: boolean;
  now?: Date;
}): {
  isSaved: boolean;
  canListen: boolean;
  accessSource: string | null;
} {
  const active =
    input.entitlement &&
    isLibraryEntitlementActive(input.entitlement.expiresAt, input.now);

  return {
    isSaved: input.isSaved,
    canListen: Boolean(active),
    accessSource: active ? input.entitlement?.accessSource ?? null : null,
  };
}

export function resolveLibraryCollectionSortAt(input: {
  saveCreatedAt?: string | null;
  grantedAt?: string | null;
}): number {
  return Math.max(
    parseTimestamp(input.saveCreatedAt),
    parseTimestamp(input.grantedAt),
  );
}

function getAuthorName(practice: PracticeRow | null): string | null {
  const name = normalizeOne(practice?.authors ?? null)?.name?.trim();
  return name ? name : null;
}

function getAuthorSlug(practice: PracticeRow | null): string | null {
  const slug = normalizeOne(practice?.authors ?? null)?.slug?.trim();
  return slug || null;
}

export function toLibraryCollectionPractice(
  practice: PracticeRow | LibraryCollectionPractice | null,
  canListen: boolean,
): LibraryCollectionPractice | null {
  if (!practice) {
    return null;
  }

  if ("audioUrl" in practice) {
    return {
      ...practice,
      audioUrl: canListen ? practice.audioUrl : null,
    };
  }

  return {
    id: practice.id,
    title: practice.title,
    slug: practice.slug,
    format: practice.format,
    durationMinutes: practice.duration_minutes,
    coverUrl: practice.cover_url,
    coverImage: practice.cover_image ?? null,
    updatedAt: practice.updated_at,
    audioUrl: canListen ? practice.audio_url ?? null : null,
    isFree: practice.is_free,
    price: practice.price,
    authorName: getAuthorName(practice),
    authorSlug: getAuthorSlug(practice),
  };
}

export function mergeLibraryCollection(input: {
  entitlements: LibraryCollectionEntitlement[];
  saves: LibraryCollectionSave[];
  practices: Map<string, LibraryCollectionPractice | PracticeRow | null>;
  now?: Date;
}): LibraryCollectionItem[] {
  const now = input.now ?? new Date();
  const savesByPracticeId = new Map(
    input.saves.map((save) => [save.practiceId, save]),
  );
  const entitlementsByPracticeId = new Map(
    input.entitlements.map((row) => [row.practiceId, row]),
  );
  const practiceIds = new Set([
    ...entitlementsByPracticeId.keys(),
    ...savesByPracticeId.keys(),
  ]);

  const items: LibraryCollectionItem[] = [];

  for (const practiceId of practiceIds) {
    const entitlement = entitlementsByPracticeId.get(practiceId) ?? null;
    const save = savesByPracticeId.get(practiceId) ?? null;
    const access = resolveLibraryCollectionAccess({
      entitlement,
      isSaved: Boolean(save),
      now,
    });

    if (!access.isSaved && !access.canListen) {
      continue;
    }

    const sortAt = resolveLibraryCollectionSortAt({
      saveCreatedAt: save?.createdAt,
      grantedAt: entitlement?.grantedAt,
    });
    const sortSource =
      sortAt === parseTimestamp(save?.createdAt)
        ? (save?.createdAt ?? entitlement?.grantedAt ?? null)
        : (entitlement?.grantedAt ?? save?.createdAt ?? null);

    items.push({
      id: access.canListen && entitlement ? entitlement.id : `save:${practiceId}`,
      practiceId,
      isSaved: access.isSaved,
      canListen: access.canListen,
      accessSource: access.accessSource,
      grantedAt: sortSource,
      practice: toLibraryCollectionPractice(
        input.practices.get(practiceId) ?? null,
        access.canListen,
      ),
    });
  }

  return items.sort((left, right) => {
    const delta =
      resolveLibraryCollectionSortAt({
        saveCreatedAt: savesByPracticeId.get(right.practiceId)?.createdAt,
        grantedAt: entitlementsByPracticeId.get(right.practiceId)?.grantedAt,
      }) -
      resolveLibraryCollectionSortAt({
        saveCreatedAt: savesByPracticeId.get(left.practiceId)?.createdAt,
        grantedAt: entitlementsByPracticeId.get(left.practiceId)?.grantedAt,
      });

    if (delta !== 0) {
      return delta;
    }

    return right.practiceId.localeCompare(left.practiceId);
  });
}

function asEntitlementRow(value: unknown): EntitlementRow | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const row = value as EntitlementRow;

  if (
    typeof row.id !== "string" ||
    typeof row.granted_at !== "string" ||
    typeof row.access_source !== "string"
  ) {
    return null;
  }

  return row;
}

function asPracticeRow(value: unknown): PracticeRow | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const row = value as PracticeRow;

  if (typeof row.id !== "string" || typeof row.slug !== "string") {
    return null;
  }

  return row;
}

export async function loadLibraryCollection(
  supabase: SupabaseClient,
  userId: string,
  options?: { now?: Date },
): Promise<{ items: LibraryCollectionItem[]; error: boolean }> {
  if (!userId) {
    return { items: [], error: false };
  }

  const store = createSupabaseLibrarySavesStore(supabase);
  let entitlementError = false;
  let saveError = false;

  const [entitlementResult, saves] = await Promise.all([
    supabase
      .from("user_practices")
      .select(
        `
        id,
        access_source,
        granted_at,
        expires_at,
        practice_id,
        practices (
          ${LIBRARY_ENTITLED_PRACTICE_SELECT}
        )
      `,
      )
      .eq("user_id", userId)
      .order("granted_at", { ascending: false }),
    store.listForUser(userId).catch((error) => {
      console.error(
        "library_collection_saves_error",
        error instanceof Error ? error.message : error,
      );
      saveError = true;
      return [] as Awaited<ReturnType<typeof store.listForUser>>;
    }),
  ]);

  if (entitlementResult.error) {
    console.error(
      "library_collection_entitlements_error",
      entitlementResult.error.message,
    );
    entitlementError = true;
  }

  const entitlements: LibraryCollectionEntitlement[] = [];
  const practices = new Map<string, PracticeRow | LibraryCollectionPractice | null>();

  for (const raw of entitlementResult.data ?? []) {
    const row = asEntitlementRow(raw);

    if (!row) {
      continue;
    }

    const practice = asPracticeRow(normalizeOne(row.practices));
    const practiceId = practice?.id ?? row.practice_id;

    if (!practiceId) {
      continue;
    }

    entitlements.push({
      id: row.id,
      practiceId,
      accessSource: row.access_source,
      grantedAt: row.granted_at,
      expiresAt: row.expires_at,
    });

    if (practice) {
      practices.set(practice.id, practice);
    }
  }

  const missingPracticeIds = saves
    .map((save) => save.practiceId)
    .filter((practiceId) => !practices.has(practiceId));

  if (missingPracticeIds.length > 0) {
    const { data: savedPractices, error: savedPracticesError } = await supabase
      .from("practices")
      .select(LIBRARY_CARD_PRACTICE_SELECT)
      .in("id", missingPracticeIds);

    if (savedPracticesError) {
      console.error(
        "library_collection_saved_practices_error",
        savedPracticesError.message,
      );
      entitlementError = true;
    }

    for (const raw of savedPractices ?? []) {
      const practice = asPracticeRow(raw);

      if (practice) {
        practices.set(practice.id, practice);
      }
    }
  }

  return {
    items: mergeLibraryCollection({
      entitlements,
      saves: saves.map((save) => ({
        practiceId: save.practiceId,
        createdAt: save.createdAt,
      })),
      practices,
      now: options?.now,
    }),
    error: entitlementError || saveError,
  };
}

export const LIBRARY_COLLECTION_TABLES = {
  entitlements: "user_practices",
  saves: LIBRARY_SAVES_TABLE,
} as const;
