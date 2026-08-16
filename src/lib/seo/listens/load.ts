import { loadPublicPlaylistBySlug } from "@/lib/playlists/public-detail";
import {
  isPlatformEditorialPublicPlaylist,
  isPlayablePublicPlaylistItem,
} from "@/lib/playlists/public-seo";
import {
  isValidPlaylistPublicSlug,
  normalizePlaylistPublicSlug,
} from "@/lib/playlists/public-slug";
import { buildSiteCanonicalUrl } from "@/lib/seo/public-page-metadata";

import { getListenPageBySlug } from "./registry";
import { buildListenPagePath, isValidListenPageSlug } from "./paths";
import type { ListenPageData, ListenPageDefinition } from "./types";

export type ListenPlaylistLoadResult =
  | { ok: true; detail: ListenPageData["playlist"] }
  | { ok: false; reason: "not_found" | "error" };

export type ListenPlaylistGateInput = {
  found: boolean;
  slugMatches: boolean;
  isPlatformOwned: boolean;
  isEditorial: boolean;
  isPublic: boolean;
  isPublished: boolean;
  playableCount: number;
};

export type ListenPlaylistRejectReason =
  | "missing"
  | "slug_mismatch"
  | "not_platform_owned"
  | "not_editorial"
  | "not_public"
  | "not_published"
  | "empty_unplayable";

export function evaluateListenPlaylistGate(
  input: ListenPlaylistGateInput,
): { ok: true } | { ok: false; reason: ListenPlaylistRejectReason } {
  if (!input.found) {
    return { ok: false, reason: "missing" };
  }

  if (!input.slugMatches) {
    return { ok: false, reason: "slug_mismatch" };
  }

  if (!input.isPlatformOwned) {
    return { ok: false, reason: "not_platform_owned" };
  }

  if (!input.isEditorial) {
    return { ok: false, reason: "not_editorial" };
  }

  if (!input.isPublic) {
    return { ok: false, reason: "not_public" };
  }

  if (!input.isPublished) {
    return { ok: false, reason: "not_published" };
  }

  if (input.playableCount <= 0) {
    return { ok: false, reason: "empty_unplayable" };
  }

  return { ok: true };
}

export function resolveListenPageFromPlaylist(input: {
  definition: ListenPageDefinition;
  loaded: ListenPlaylistLoadResult;
}): ListenPageData | null {
  const expectedSlug = normalizePlaylistPublicSlug(input.definition.playlistSlug);

  if (!isValidPlaylistPublicSlug(expectedSlug)) {
    return null;
  }

  if (!input.loaded.ok) {
    return null;
  }

  const detail = input.loaded.detail;
  const playableCount = detail.items.filter(isPlayablePublicPlaylistItem).length;
  const gate = evaluateListenPlaylistGate({
    found: true,
    slugMatches: detail.playlist.slug === expectedSlug,
    isPlatformOwned: detail.playlist.isPlatformOwned,
    isEditorial: detail.playlist.isEditorial,
    isPublic: detail.playlist.visibility === "public",
    isPublished: Boolean(detail.playlist.published_at),
    playableCount,
  });

  if (!gate.ok) {
    return null;
  }

  if (
    !isPlatformEditorialPublicPlaylist({
      isEditorial: detail.playlist.isEditorial,
      ownerType: detail.playlist.isPlatformOwned ? "platform" : "user",
    })
  ) {
    return null;
  }

  const path = buildListenPagePath(input.definition.slug);

  return {
    definition: input.definition,
    path,
    canonicalUrl: buildSiteCanonicalUrl(path),
    playlist: detail,
  };
}

export async function loadListenPageData(
  slug: string,
): Promise<ListenPageData | null> {
  if (!isValidListenPageSlug(slug)) {
    return null;
  }

  const definition = getListenPageBySlug(slug);

  if (!definition) {
    return null;
  }

  const loaded = await loadPublicPlaylistBySlug(definition.playlistSlug);
  return resolveListenPageFromPlaylist({ definition, loaded });
}
