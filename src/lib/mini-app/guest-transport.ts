import type { MaxPlaylistCardModel } from "@/lib/max/playlist-types";

/** Filters shared by the MAX and VK catalog views. */
export type MiniAppCatalogListQuery = {
  query?: string;
  section?: string | null;
  topic?: string | null;
  access?: string;
  publicationClass?: string;
};

export type MiniAppPlaybackAudioResult =
  | { ok: true; url: string; objectUrl?: boolean }
  | { ok: false; reason: string };

/**
 * Optional data plane for a guest mini-app shell.
 * MAX keeps using initData when this transport is absent.
 */
export type MiniAppGuestTransport = {
  postCatalog: (
    query: MiniAppCatalogListQuery,
    signal: AbortSignal,
  ) => Promise<{ ok: boolean; payload: unknown }>;
  postCatalogTopics: (
    signal: AbortSignal,
  ) => Promise<{ ok: boolean; payload: unknown }>;
  postPlaylistCatalog: (input: {
    query: string;
    sort: string;
    access: string;
    cursor: string | null;
    signal: AbortSignal | undefined;
  }) => Promise<{ items: MaxPlaylistCardModel[]; nextCursor: string | null }>;
  postPlaylistDetail: (
    slug: string,
    signal: AbortSignal,
  ) => Promise<{ status: number; payload: unknown }>;
  postPlaybackSession: (input: {
    authorSlug: string;
    productSlug: string;
    audioItemId?: string;
  }) => Promise<{ ok: boolean; status: number; payload: unknown }>;
  fetchPlaybackAudio: (input: {
    authorSlug: string;
    productSlug: string;
    trackId: string;
    playbackMode: "full" | "preview";
    signal: AbortSignal;
  }) => Promise<MiniAppPlaybackAudioResult>;
};
