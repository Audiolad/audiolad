"use client";

import type { MiniAppGuestTransport } from "@/lib/mini-app/guest-transport";
import { readMaxPlaylistCatalogPayload } from "@/lib/max/playlist-types";
import { readVkPlaybackAudioResponse } from "@/lib/vk/playback-client";

async function postJson(path: string, body: unknown, signal: AbortSignal | undefined) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function catalogBody(query: {
  query?: string;
  section?: string | null;
  topic?: string | null;
  access?: string;
  publicationClass?: string;
}) {
  const body: Record<string, string> = {};
  if (query.query) body.query = query.query;
  if (query.section) body.section = query.section;
  if (query.topic) body.topic = query.topic;
  if (query.access && query.access !== "all") body.access = query.access;
  if (query.publicationClass && query.publicationClass !== "all") {
    body.class = query.publicationClass;
  }
  return body;
}

/** Guest VK adapters. No MAX initData and no AudioLad user id. */
export function createVkGuestTransport(): MiniAppGuestTransport {
  return {
    async postCatalog(query, signal) {
      const { response, payload } = await postJson("/api/vk/catalog", catalogBody(query), signal);
      return { ok: response.ok, payload };
    },
    async postCatalogTopics(signal) {
      const { response, payload } = await postJson("/api/vk/catalog/topics", {}, signal);
      return { ok: response.ok, payload };
    },
    async postPlaylistCatalog(input) {
      const body: Record<string, string> = {};
      if (input.query) body.q = input.query;
      if (input.sort && input.sort !== "newest") body.sort = input.sort;
      if (input.access && input.access !== "all") body.access = input.access;
      if (input.cursor) body.cursor = input.cursor;
      const { response, payload } = await postJson("/api/vk/playlists/catalog", body, input.signal);
      const page = readMaxPlaylistCatalogPayload(payload);
      if (!response.ok || !page) {
        throw new Error("vk_playlist_catalog_unavailable");
      }
      return page;
    },
    async postPlaylistDetail(slug, signal) {
      const { response, payload } = await postJson(
        "/api/vk/playlists/detail",
        { slug },
        signal,
      );
      return { status: response.status, payload };
    },
    async postPlaybackSession(input) {
      const { response, payload } = await postJson(
        "/api/vk/playback/session",
        {
          authorSlug: input.authorSlug,
          productSlug: input.productSlug,
        },
        undefined,
      );
      return { ok: response.ok, status: response.status, payload };
    },
    async fetchPlaybackAudio(input) {
      const response = await fetch("/api/vk/playback/audio", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorSlug: input.authorSlug,
          productSlug: input.productSlug,
          trackId: input.trackId,
        }),
        cache: "no-store",
        signal: input.signal,
      });
      return readVkPlaybackAudioResponse(response);
    },
  };
}
