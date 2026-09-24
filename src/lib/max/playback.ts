import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { GUEST_ORDINARY_CATALOG_VIEWER } from "@/lib/catalog/visibility-query";
import { loadListenSessionPayload } from "@/lib/listen/load-session-payload";
import { signEntitledListenAudio } from "@/lib/listen/sign-entitled-audio";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import {
  getPracticeByAuthorAndSlug,
  type PublicPracticeRow,
} from "@/lib/products/lookup";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildMaxStorefrontPreviewClip } from "@/lib/max/preview-audio";
import {
  resolveMaxStorefrontPreview,
  type MaxStorefrontPreview,
  type MaxStorefrontPreviewDeps,
} from "@/lib/max/storefront-preview";
import type {
  MaxPlaybackMode,
  MaxPlaybackSession,
  MaxPlaybackTrack,
} from "@/lib/max/playback-types";

export type { MaxPlaybackMode, MaxPlaybackSession, MaxPlaybackTrack };

export type GetMaxPlaybackSessionResult =
  | {
      ok: true;
      playbackMode: "full";
      session: MaxPlaybackSession;
    }
  | {
      ok: true;
      playbackMode: "preview";
      session: MaxPlaybackSession;
      previewDurationSeconds: number;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "access_required"
        | "preview_unavailable"
        | "no_audio"
        | "storage_unavailable";
    };

export type SignMaxPlaybackAudioResult =
  | { ok: true; url: string; expiresIn: number }
  | {
      ok: false;
      reason:
        | "not_found"
        | "access_required"
        | "forbidden"
        | "audio_missing"
        | "sign_failed"
        | "storage_unavailable";
    };

export type MaxPlaybackDeps = {
  createClient?: () => SupabaseClient;
  listCatalog?: typeof getPublishedCatalogProducts;
  getPractice?: typeof getPracticeByAuthorAndSlug;
  loadSession?: typeof loadListenSessionPayload;
  signAudio?: typeof signEntitledListenAudio;
  resolvePreview?: (
    practice: PublicPracticeRow,
    supabase: SupabaseClient,
  ) => Promise<MaxStorefrontPreview>;
  preview?: MaxStorefrontPreviewDeps;
  buildPreviewClip?: typeof buildMaxStorefrontPreviewClip;
};

let playbackDeps: MaxPlaybackDeps | null = null;

export function setMaxPlaybackDepsForTests(deps: MaxPlaybackDeps | null) {
  playbackDeps = deps;
}

function client(deps?: MaxPlaybackDeps) {
  return (deps?.createClient ?? playbackDeps?.createClient ?? createServiceRoleClient)();
}

async function resolveListedPractice(
  authorSlug: string,
  productSlug: string,
  deps?: MaxPlaybackDeps,
): Promise<
  | { ok: true; practice: PublicPracticeRow }
  | { ok: false; reason: "not_found" | "storage_unavailable" }
> {
  const supabase = client(deps);
  const listCatalog = deps?.listCatalog ?? playbackDeps?.listCatalog ?? getPublishedCatalogProducts;
  const getPractice = deps?.getPractice ?? playbackDeps?.getPractice ?? getPracticeByAuthorAndSlug;

  try {
    const products = await listCatalog(supabase, {
      viewer: GUEST_ORDINARY_CATALOG_VIEWER,
      throwOnStorageError: true,
    });
    const listed = products.find(
      (item) => item.authorSlug === authorSlug && item.slug === productSlug,
    );
    if (!listed) {
      return { ok: false, reason: "not_found" };
    }

    const loaded = await getPractice(supabase, authorSlug, productSlug);
    if (loaded.error) {
      return { ok: false, reason: "storage_unavailable" };
    }
    if (!loaded.practice) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: true, practice: loaded.practice };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

function toSafeSession(
  authorSlug: string,
  productSlug: string,
  payload: Extract<Awaited<ReturnType<typeof loadListenSessionPayload>>, { ok: true }>,
  playbackMode: MaxPlaybackMode = "full",
): MaxPlaybackSession {
  return {
    authorSlug,
    productSlug,
    title: payload.session.practiceTitle,
    authorName: payload.session.authorName ?? null,
    formatLabel: payload.session.format ?? null,
    coverUrl: payload.session.coverImageUrl ?? null,
    playbackMode,
    tracks: payload.session.tracks.map((track) => ({
      trackId: track.id,
      title: track.title,
      position: track.position,
      durationSeconds: track.durationSeconds,
      coverUrl: track.coverImageUrl ?? null,
    })),
  };
}

function practiceAuthorName(practice: PublicPracticeRow): string | null {
  const authors = practice.authors;
  const author = Array.isArray(authors) ? authors[0] : authors;
  const name = author?.name?.trim();
  return name || null;
}

function toPreviewSession(
  authorSlug: string,
  productSlug: string,
  practice: PublicPracticeRow,
  preview: Extract<MaxStorefrontPreview, { ok: true }>,
): MaxPlaybackSession {
  return {
    authorSlug,
    productSlug,
    title: practice.title,
    authorName: practiceAuthorName(practice),
    formatLabel: practice.format ?? null,
    coverUrl: practice.cover_url ?? null,
    playbackMode: "preview",
    tracks: [preview.track],
  };
}

export async function getMaxPlaybackSession(
  userId: string,
  authorSlug: string,
  productSlug: string,
  deps?: MaxPlaybackDeps,
): Promise<GetMaxPlaybackSessionResult> {
  try {
    const listed = await resolveListedPractice(authorSlug, productSlug, deps);
    if (!listed.ok) {
      return listed;
    }

    const supabase = client(deps);
    const loadSession = deps?.loadSession ?? playbackDeps?.loadSession ?? loadListenSessionPayload;
    const payload = await loadSession(supabase, authorSlug, productSlug, userId, {
      forceStartAtBeginning: true,
      serviceRole: supabase,
    });

    if (!payload.ok) {
      if (payload.reason === "no_audio") {
        return { ok: false, reason: "no_audio" };
      }
      if (payload.reason === "not_found") {
        return { ok: false, reason: "not_found" };
      }
      if (payload.reason !== "unavailable") {
        return { ok: false, reason: "storage_unavailable" };
      }

      const resolvePreview =
        deps?.resolvePreview ??
        playbackDeps?.resolvePreview ??
        ((practice: PublicPracticeRow, client: SupabaseClient) =>
          resolveMaxStorefrontPreview(practice, client, deps?.preview ?? playbackDeps?.preview));
      const preview = await resolvePreview(listed.practice, supabase);
      if (!preview.ok) {
        return preview;
      }

      return {
        ok: true,
        playbackMode: "preview",
        session: toPreviewSession(authorSlug, productSlug, listed.practice, preview),
        previewDurationSeconds: preview.previewDurationSeconds,
      };
    }

    return {
      ok: true,
      playbackMode: "full",
      session: toSafeSession(authorSlug, productSlug, payload, "full"),
    };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

export async function signMaxPlaybackAudio(
  userId: string,
  authorSlug: string,
  productSlug: string,
  trackId: string,
  deps?: MaxPlaybackDeps,
): Promise<SignMaxPlaybackAudioResult> {
  try {
    const listed = await resolveListedPractice(authorSlug, productSlug, deps);
    if (!listed.ok) {
      return listed;
    }

    const signAudio = deps?.signAudio ?? playbackDeps?.signAudio ?? signEntitledListenAudio;
    return await signAudio(
      {
        userId,
        authorSlug,
        productSlug,
        audioId: trackId,
        practice: listed.practice,
      },
      { createClient: deps?.createClient ?? playbackDeps?.createClient },
    );
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

export async function buildMaxPlaybackPreviewClip(
  authorSlug: string,
  productSlug: string,
  trackId: string,
  deps?: MaxPlaybackDeps,
): Promise<
  | { ok: true; bytes: Uint8Array; startMs: number; endMs: number }
  | {
      ok: false;
      reason: "not_found" | "preview_unavailable" | "forbidden" | "storage_unavailable";
    }
> {
  try {
    const listed = await resolveListedPractice(authorSlug, productSlug, deps);
    if (!listed.ok) {
      return listed;
    }

    const supabase = client(deps);
    const buildClip =
      deps?.buildPreviewClip ??
      playbackDeps?.buildPreviewClip ??
      buildMaxStorefrontPreviewClip;
    return await buildClip({
      supabase,
      practice: listed.practice,
      trackId,
      preview: deps?.preview ?? playbackDeps?.preview,
    });
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}
