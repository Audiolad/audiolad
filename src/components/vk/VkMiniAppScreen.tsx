"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import { PlayIcon } from "@/components/home/HomeIcons";
import {
  FEATURED_CARD_CHIP_CLASS,
  FEATURED_CARD_META_CLASS,
  FEATURED_CARD_PRIMARY_CTA_CLASS,
  FEATURED_CARD_SUBTITLE_CLASS,
  FEATURED_CARD_TITLE_CLASS,
} from "@/components/home/FeaturedProductCard";
import MaxAudioPlayer from "@/components/max/MaxAudioPlayer";
import MaxBottomNav from "@/components/max/MaxBottomNav";
import MaxCatalogSearch, {
  type MaxCatalogTopicNavigationRequest,
} from "@/components/max/MaxCatalogSearch";
import MaxPlaylists from "@/components/max/MaxPlaylists";
import { MiniAppGuestTransportProvider } from "@/components/mini-app/MiniAppGuestTransport";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import VkHomePanel from "@/components/vk/VkHomePanel";
import type { PublicCatalogSection } from "@/lib/catalog/catalog-sections";
import type {
  CatalogAccessFilter,
  CatalogClassFilter,
} from "@/lib/catalog/listing-contract";
import { resolveMaxGuestHomeSlideAction } from "@/lib/max/guest-home-slider";
import type { MaxCatalogProduct } from "@/lib/max/catalog-product";
import { formatMaxDuration } from "@/lib/max/format-duration";
import { MAX_HOME_SHELVES, type MaxHomeShelfId } from "@/lib/max/home";
import { decideMaxProductTrackAction } from "@/lib/max/max-audio-playback";
import type { MaxPlaybackSession } from "@/lib/max/playback-types";
import {
  MAX_SHELL_CONTENT_BOTTOM_PADDING,
  MAX_TAB_BAR_HEIGHT_PX,
  type MaxPrimaryTab,
} from "@/lib/max/primary-tabs";
import { PLAY_ACTION_LABEL, PREVIEW_ACTION_LABEL } from "@/lib/ui/action-labels";
import { initVkBridge, openVkExternalHttps } from "@/lib/vk/bridge";
import { createVkGuestTransport } from "@/lib/vk/guest-transport";
import {
  VK_GUEST_LOGIN_LABEL,
  VK_GUEST_SIGNUP_LABEL,
  VK_LIBRARY_GUEST_MESSAGE,
  VK_LIBRARY_TITLE,
  VK_PROFILE_GUEST_STATUS,
  VK_PROFILE_TITLE,
} from "@/lib/vk/guest-copy";
import { readVkLaunchTarget } from "@/lib/vk/launch-target";
import { readVkPlaybackAudioResponse } from "@/lib/vk/playback-client";
import { readVkProductView, type VkProductView } from "@/lib/vk/product-view";
import {
  resolveVkShellLaunch,
  vkDetailBackTarget,
  vkTabSelectionAfterSelect,
  type VkDetailOrigin,
} from "@/lib/vk/shell";

type VkProductSelection =
  | { kind: "token"; token: string }
  | { kind: "slugs"; authorSlug: string; productSlug: string };

type DetailState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error" }
  | { status: "ready"; product: VkProductView };

type PlaybackState =
  | { status: "idle" | "loading" | "access_required" | "preview_unavailable" | "no_audio" | "error" }
  | { status: "ready"; session: MaxPlaybackSession };

function readPlaybackSession(value: unknown): MaxPlaybackSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    "practiceId" in row ||
    "audio_path" in row ||
    "storage_path" in row ||
    typeof row.title !== "string" ||
    typeof row.authorSlug !== "string" ||
    typeof row.productSlug !== "string" ||
    (row.playbackMode !== "full" && row.playbackMode !== "preview") ||
    !Array.isArray(row.tracks)
  ) {
    return null;
  }

  const tracks = row.tracks.flatMap((track) => {
    if (!track || typeof track !== "object" || Array.isArray(track)) return [];
    const item = track as Record<string, unknown>;
    if ("audio_path" in item || "storage_path" in item || "practiceId" in item) return [];
    if (typeof item.trackId !== "string" || typeof item.title !== "string") return [];
    if (typeof item.position !== "number") return [];
    if (item.durationSeconds !== null && typeof item.durationSeconds !== "number") return [];
    return [{
      trackId: item.trackId,
      title: item.title,
      position: item.position,
      durationSeconds: item.durationSeconds === null ? null : item.durationSeconds,
      coverUrl: typeof item.coverUrl === "string" || item.coverUrl === null ? item.coverUrl : null,
    }];
  });
  if (tracks.length !== row.tracks.length || tracks.length === 0) return null;

  return {
    authorSlug: row.authorSlug,
    productSlug: row.productSlug,
    title: row.title,
    authorName: typeof row.authorName === "string" || row.authorName === null ? row.authorName : null,
    formatLabel: typeof row.formatLabel === "string" || row.formatLabel === null ? row.formatLabel : null,
    coverUrl: typeof row.coverUrl === "string" || row.coverUrl === null ? row.coverUrl : null,
    playbackMode: row.playbackMode,
    tracks,
  };
}

function selectionBody(selection: VkProductSelection): Record<string, string> {
  if (selection.kind === "token") return { target: selection.token };
  return { authorSlug: selection.authorSlug, productSlug: selection.productSlug };
}

function selectionKey(selection: VkProductSelection): string {
  return selection.kind === "token"
    ? `token:${selection.token}`
    : `slug:${selection.authorSlug}/${selection.productSlug}`;
}

function homeShelfTarget(shelfId: MaxHomeShelfId): {
  section: PublicCatalogSection | null;
  access: CatalogAccessFilter;
} {
  const shelf = MAX_HOME_SHELVES.find((item) => item.id === shelfId);
  return {
    section: shelf?.section ?? null,
    access: shelf?.access ?? "all",
  };
}

function VkGuestAuthActions() {
  return (
    <div className="mt-6 flex flex-col gap-3">
      <button
        type="button"
        disabled
        className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white opacity-60"
      >
        {VK_GUEST_LOGIN_LABEL}
      </button>
      <button
        type="button"
        disabled
        className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-full border border-[#7042c5] px-5 py-3 text-[17px] font-medium text-[#7042c5] opacity-60"
      >
        {VK_GUEST_SIGNUP_LABEL}
      </button>
    </div>
  );
}

function VkProductDetail({ selection }: { selection: VkProductSelection }) {
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [playback, setPlayback] = useState<PlaybackState>({ status: "loading" });
  const [listenArmed, setListenArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const playRef = useRef<(() => void) | null>(null);
  const pauseRef = useRef<(() => void) | null>(null);
  const selectTrackRef = useRef<((index: number) => void) | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingTrackIndexRef = useRef<number | null>(null);

  const fetchAudio = useCallback(async (trackId: string, signal: AbortSignal) => {
    const response = await fetch("/api/vk/playback/audio", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...selectionBody(selection), trackId }),
      cache: "no-store",
      signal,
    });
    return readVkPlaybackAudioResponse(response);
  }, [selection]);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/vk/product", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selectionBody(selection)),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => ({
        status: response.status,
        payload: await response.json().catch(() => null),
      }))
      .then(({ status, payload }) => {
        if (controller.signal.aborted) return;
        if (status === 404) {
          setDetail({ status: "not_found" });
          setPlayback({ status: "idle" });
          return;
        }
        const product = readVkProductView(payload?.product);
        if (!product) {
          setDetail({ status: "error" });
          setPlayback({ status: "idle" });
          return;
        }
        setDetail({ status: "ready", product });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDetail({ status: "error" });
          setPlayback({ status: "idle" });
        }
      });

    return () => controller.abort();
  }, [selection]);

  useEffect(() => {
    if (detail.status !== "ready") return;
    const controller = new AbortController();
    void fetch("/api/vk/playback/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selectionBody(selection)),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => ({
        status: response.status,
        payload: await response.json().catch(() => null),
      }))
      .then(({ status, payload }) => {
        if (controller.signal.aborted) return;
        if (status === 403 && payload?.reason === "preview_unavailable") {
          setPlayback({ status: "preview_unavailable" });
          return;
        }
        if (status === 403) {
          setPlayback({ status: "access_required" });
          return;
        }
        if (status === 404 && payload?.reason === "no_audio") {
          setPlayback({ status: "no_audio" });
          return;
        }
        const session = readPlaybackSession(payload?.session);
        if (!session || "practiceId" in (payload?.session ?? {})) {
          setPlayback({ status: "error" });
          return;
        }
        setPlayback({ status: "ready", session });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPlayback({ status: "error" });
      });
    return () => controller.abort();
  }, [detail.status, selection]);

  const bindPlay = useCallback((play: () => void) => {
    playRef.current = play;
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false;
      play();
    }
  }, []);

  const bindSelectTrack = useCallback((selectTrack: (index: number) => void) => {
    selectTrackRef.current = selectTrack;
    if (pendingTrackIndexRef.current == null) return;
    const index = pendingTrackIndexRef.current;
    pendingTrackIndexRef.current = null;
    selectTrack(index);
  }, []);

  function startListening() {
    if (playback.status !== "ready") return;
    const firstId = playback.session.tracks[0]?.trackId ?? null;
    if (firstId) setActiveTrackId(firstId);
    setListenArmed(true);
    if (playRef.current) playRef.current();
    else pendingPlayRef.current = true;
  }

  function pressTrack(audioItemId: string) {
    if (playback.status !== "ready") return;
    const decision = decideMaxProductTrackAction({
      tracks: playback.session.tracks,
      audioItemId,
      activeTrackId,
      listenArmed,
      isPlaying: playing,
    });
    if (decision.type === "ignore") return;
    if (decision.type === "pause") {
      pauseRef.current?.();
      return;
    }
    if (decision.type === "resume") {
      setListenArmed(true);
      if (playRef.current) playRef.current();
      else pendingPlayRef.current = true;
      return;
    }
    const track = playback.session.tracks[decision.index];
    if (!track) return;
    pendingPlayRef.current = false;
    setActiveTrackId(track.trackId);
    setListenArmed(true);
    if (selectTrackRef.current) selectTrackRef.current(decision.index);
    else pendingTrackIndexRef.current = decision.index;
  }

  const product = detail.status === "ready" ? detail.product : null;
  const playableTrackIds = new Set(
    playback.status === "ready" ? playback.session.tracks.map((track) => track.trackId) : [],
  );
  const playLabel =
    playback.status === "ready" && playback.session.playbackMode === "preview"
      ? PREVIEW_ACTION_LABEL
      : PLAY_ACTION_LABEL;

  return (
    <article data-vk-product="">
      {detail.status === "loading" ? (
        <p className="mt-6 text-sm text-[#6c5d94]">Загрузка релиза…</p>
      ) : null}
      {detail.status === "not_found" ? (
        <p className="mt-6 text-sm text-[#6c5d94]">Этот релиз недоступен.</p>
      ) : null}
      {detail.status === "error" ? (
        <p className="mt-6 text-sm text-[#6c5d94]">Не удалось загрузить релиз.</p>
      ) : null}
      {product ? (
        <>
          <ProductCoverThumbnail
            slug={product.productSlug}
            title={product.title}
            coverUrl={product.coverUrl}
            authorName={product.metaLine}
            className="aspect-square w-full rounded-[28px]"
            displayWidth={640}
            priority
          />
          {product.formatLabel ? (
            <p className={`${FEATURED_CARD_CHIP_CLASS} mt-4`}>{product.formatLabel}</p>
          ) : null}
          <h1 className={FEATURED_CARD_TITLE_CLASS}>{product.title}</h1>
          {product.subtitle ? (
            <p className={FEATURED_CARD_SUBTITLE_CLASS}>{product.subtitle}</p>
          ) : null}
          {product.metaLine ? (
            <p className={FEATURED_CARD_META_CLASS} data-vk-product-meta="">
              {product.metaLine}
            </p>
          ) : null}

          {playback.status === "loading" ? (
            <p className="mt-4 text-sm text-[#6c5d94]">Проверяем доступ к прослушиванию…</p>
          ) : null}
          {playback.status === "access_required" || playback.status === "preview_unavailable" ? (
            <p className="mt-4 text-sm text-[#6c5d94]">Для прослушивания нужен доступ к продукту.</p>
          ) : null}
          {playback.status === "no_audio" ? (
            <p className="mt-4 text-sm text-[#6c5d94]">В этом релизе пока нет аудио.</p>
          ) : null}
          {playback.status === "error" ? (
            <p className="mt-4 text-sm text-[#6c5d94]">Не удалось подготовить прослушивание.</p>
          ) : null}

          {playback.status === "ready" ? (
            <div
              className={listenArmed ? undefined : "pointer-events-none absolute h-px w-px overflow-hidden"}
              inert={listenArmed ? undefined : true}
            >
              <MaxAudioPlayer
                session={playback.session}
                hideTrackList
                onBindPlay={bindPlay}
                onBindPause={(pause) => {
                  pauseRef.current = pause;
                }}
                onBindSelectTrack={bindSelectTrack}
                onPlayingChange={setPlaying}
                onActiveTrackChange={(track) => setActiveTrackId(track.trackId)}
                fetchAudio={fetchAudio}
              />
            </div>
          ) : null}

          {!listenArmed && playback.status === "ready" ? (
            <button type="button" onClick={startListening} className={`${FEATURED_CARD_PRIMARY_CTA_CLASS} mt-4`}>
              <PlayIcon />
              {playLabel}
            </button>
          ) : null}

          {product.contents.length ? (
            <ol className="mt-6 space-y-1.5" data-vk-product-contents="" aria-label="Треки">
              {product.contents.map((track) => {
                const playable = playableTrackIds.has(track.audioItemId);
                const active = activeTrackId === track.audioItemId;
                const playingThis = active && playing && listenArmed;
                return (
                  <li
                    key={track.audioItemId}
                    className={`flex min-h-11 items-center gap-2 rounded-xl px-1 py-1 ${active && listenArmed ? "bg-[#f3edfb]" : ""}`}
                  >
                    {playable ? (
                      <button
                        type="button"
                        aria-label={playingThis ? `Пауза ${track.title}` : `Слушать ${track.title}`}
                        onClick={() => pressTrack(track.audioItemId)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-xs text-white"
                      >
                        <span aria-hidden="true">{playingThis ? "II" : "▶"}</span>
                      </button>
                    ) : (
                      <span className="h-9 w-9 shrink-0" aria-hidden="true" />
                    )}
                    <span className="w-6 shrink-0 text-center text-xs text-[#6c5d94]">{track.position}</span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${active && listenArmed ? "font-medium text-[#7042c5]" : "text-[#25135c]"}`}>
                      {track.title}
                    </span>
                    {track.durationSeconds !== null ? (
                      <span className="shrink-0 text-xs text-[#6c5d94]">
                        {formatMaxDuration(track.durationSeconds)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

export default function VkMiniAppScreen() {
  const guestTransport = useMemo(() => createVkGuestTransport(), []);
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<MaxPrimaryTab>("home");
  const [selection, setSelection] = useState<VkProductSelection | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<VkDetailOrigin>("catalog");
  const [catalogTopicNavigation, setCatalogTopicNavigation] =
    useState<MaxCatalogTopicNavigationRequest | null>(null);
  const appliedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    void initVkBridge();
  }, []);

  useEffect(() => {
    let cancelled = false;

    function openDeeplink(token: string) {
      if (appliedTokenRef.current === token) return;
      appliedTokenRef.current = token;
      setDetailOrigin("deeplink");
      setActiveTab("catalog");
      setSelection({ kind: "token", token });
    }

    function readLaunch() {
      return resolveVkShellLaunch(
        readVkLaunchTarget({
          hash: window.location.hash,
          search: window.location.search,
        }),
      );
    }

    queueMicrotask(() => {
      if (cancelled) return;
      const launch = readLaunch();
      if (launch.productToken) openDeeplink(launch.productToken);
      else setActiveTab(launch.tab);
      setReady(true);
    });

    function onHashChange() {
      const next = readLaunch();
      if (next.productToken) openDeeplink(next.productToken);
    }

    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  function closeProductDetail() {
    setSelection(null);
    setActiveTab(vkDetailBackTarget(detailOrigin));
  }

  function selectVkTab(next: MaxPrimaryTab) {
    const decision = vkTabSelectionAfterSelect({
      activeTab,
      nextTab: next,
      hasProductDetail: selection !== null,
    });
    if (decision.closeProductDetail) setSelection(null);
    if (decision.tab !== activeTab) setActiveTab(decision.tab);
  }

  function openCatalogFromHome(target: {
    section: PublicCatalogSection | null;
    access: CatalogAccessFilter;
    publicationClass?: CatalogClassFilter;
  }) {
    setSelection(null);
    setActiveTab("catalog");
    setCatalogTopicNavigation((current) => ({
      requestId: (current?.requestId ?? 0) + 1,
      section: target.section,
      access: target.access,
      publicationClass: target.publicationClass ?? "all",
    }));
  }

  function openProduct(product: MaxCatalogProduct, origin: VkDetailOrigin) {
    setDetailOrigin(origin);
    setActiveTab(origin === "home" ? "catalog" : activeTab);
    setSelection({
      kind: "slugs",
      authorSlug: product.authorSlug,
      productSlug: product.slug,
    });
  }

  function applyGuestHomeSlide(slideId: string) {
    const action = resolveMaxGuestHomeSlideAction(slideId);
    if (!action || action.type === "signup") return;
    if (action.type === "external") {
      openVkExternalHttps(action.url);
      return;
    }
    if (action.type === "playlists") {
      selectVkTab("playlists");
      return;
    }
    openCatalogFromHome({
      section: action.section,
      access: action.access,
      publicationClass: action.publicationClass,
    });
  }

  const showProduct = ready && activeTab === "catalog" && selection !== null;
  const backLabel = detailOrigin === "home" ? "← Назад на главную" : "← Назад в каталог";

  return (
    <MiniAppGuestTransportProvider value={guestTransport}>
      <main
        data-vk-shell=""
        className="min-h-dvh bg-[#faf8ff] px-4 pt-[max(1rem,env(safe-area-inset-top))] text-[#25135c]"
        style={{ paddingBottom: MAX_SHELL_CONTENT_BOTTOM_PADDING }}
      >
        {activeTab === "catalog" ? null : (
          <header className="mx-auto flex min-h-11 w-full max-w-lg items-center border-b border-[#e8def5] pb-3">
            <AudioladHorizontalLogo
              className="h-8 w-auto max-w-full object-contain object-left"
              linkClassName="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              href={null}
              priority
              sizes="160px"
            />
          </header>
        )}

        {!ready ? (
          <p className="mx-auto mt-8 w-full max-w-lg text-sm text-[#6c5d94]">Загрузка…</p>
        ) : null}

        <div className="mx-auto w-full max-w-lg" hidden={!ready || activeTab !== "catalog"}>
          <MaxCatalogSearch
            onSelectProduct={(product) => openProduct(product, "catalog")}
            topicNavigationRequest={catalogTopicNavigation}
          />
        </div>

        {ready && activeTab === "home" ? (
          <div className="mx-auto w-full max-w-lg" data-vk-panel="home">
            <VkHomePanel
              onListenFree={() => openCatalogFromHome({ section: null, access: "free" })}
              onSlideAction={applyGuestHomeSlide}
              onOpenSection={(section) => openCatalogFromHome({ section, access: "all" })}
              onOpenShelf={(shelfId) => openCatalogFromHome(homeShelfTarget(shelfId))}
              onSelectProduct={(product) => openProduct(product, "home")}
            />
          </div>
        ) : null}

        {ready && activeTab === "playlists" ? (
          <div data-vk-panel="playlists">
            <MaxPlaylists guestMode />
          </div>
        ) : null}

        {ready && activeTab === "library" ? (
          <div className="mx-auto w-full max-w-lg" data-vk-panel="library" data-vk-library-guest="">
            <h1 className="mt-5 text-[26px] font-semibold leading-tight text-[#25135c]">
              {VK_LIBRARY_TITLE}
            </h1>
            <section className="mt-5 rounded-[20px] border border-[#eadff8] bg-white px-4 py-4">
              <p className="text-sm leading-5 text-[#4a3d73]">{VK_LIBRARY_GUEST_MESSAGE}</p>
            </section>
            <VkGuestAuthActions />
          </div>
        ) : null}

        {ready && activeTab === "profile" ? (
          <div className="mx-auto w-full max-w-lg" data-vk-panel="profile" data-vk-profile-guest="">
            <h1 className="mt-5 text-[26px] font-semibold leading-tight text-[#25135c]">
              {VK_PROFILE_TITLE}
            </h1>
            <section className="mt-5 rounded-[20px] border border-[#eadff8] bg-white px-4 py-4">
              <p className="text-sm leading-5 text-[#4a3d73]">{VK_PROFILE_GUEST_STATUS}</p>
            </section>
            <VkGuestAuthActions />
          </div>
        ) : null}

        {showProduct && selection ? (
          <div
            className="fixed inset-x-0 top-0 z-10 overflow-y-auto bg-[#faf8ff] px-4 pt-[max(1rem,env(safe-area-inset-top))]"
            style={{ bottom: `calc(${MAX_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))` }}
            data-vk-product-layer=""
          >
            <div className="mx-auto max-w-lg pb-6">
              <button
                type="button"
                onClick={closeProductDetail}
                className="min-h-11 text-sm font-medium text-[#7042c5]"
              >
                {backLabel}
              </button>
              <VkProductDetail key={selectionKey(selection)} selection={selection} />
            </div>
          </div>
        ) : null}

        <MaxBottomNav activeTab={activeTab} onSelectTab={selectVkTab} />
      </main>
    </MiniAppGuestTransportProvider>
  );
}
