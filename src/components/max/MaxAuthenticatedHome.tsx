"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PublicCatalogSection } from "@/lib/catalog/catalog-sections";
import type {
  CatalogAccessFilter,
  CatalogClassFilter,
} from "@/lib/catalog/listing-contract";
import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import {
  FEATURED_CARD_ACTIONS_CLASS,
  FEATURED_CARD_PRIMARY_CTA_CLASS,
} from "@/components/home/FeaturedProductCard";
import { PlayIcon } from "@/components/home/HomeIcons";
import MaxAudioPlayer from "@/components/max/MaxAudioPlayer";
import MaxBottomNav from "@/components/max/MaxBottomNav";
import MaxCatalogSearch, {
  type MaxCatalogProduct,
  type MaxCatalogTopicNavigationRequest,
} from "@/components/max/MaxCatalogSearch";
import MaxHome from "@/components/max/MaxHome";
import MaxLibrary from "@/components/max/MaxLibrary";
import MaxPlaylists from "@/components/max/MaxPlaylists";
import MaxProductDetailView from "@/components/max/MaxProductDetailView";
import MaxProfile, { MaxGuestProfile } from "@/components/max/MaxProfile";
import MaxPromoLanding from "@/components/max/MaxPromoLanding";
import { readMaxInitData } from "@/lib/max/bridge";
import { decideMaxProductTrackAction } from "@/lib/max/max-audio-playback";
import {
  MAX_PLAYBACK_AUDIO_PATH,
  MAX_PLAYBACK_PREVIEW_PATH,
  MAX_PLAYBACK_SESSION_PATH,
  MAX_PRODUCT_PATH,
} from "@/lib/max/host";
import type { MaxPlaybackSession } from "@/lib/max/playback-types";
import {
  readMaxPromoTargetFromLocation,
  type MaxPromoTarget,
} from "@/lib/max/promo-target";
import { readMaxProductDetail, type MaxProductDetailView as MaxProductDetailModel } from "@/lib/max/product-view";
import {
  openMaxGuestHomeExternalSlide,
  resolveMaxGuestHomeSlideAction,
} from "@/lib/max/guest-home-slider";
import { MAX_HOME_SHELVES, type MaxHomeShelfId } from "@/lib/max/home";
import {
  MAX_PRIMARY_TABS,
  MAX_SHELL_CONTENT_BOTTOM_PADDING,
  MAX_TAB_BAR_HEIGHT_PX,
  resolveInitialMaxPrimaryTab,
  type MaxPrimaryTab,
} from "@/lib/max/primary-tabs";
import {
  MAX_SHELL_LOGIN_CTA,
  MAX_SHELL_SIGNUP_CTA,
} from "@/lib/max/session-shell";
import type { MaxResolvedStartTarget } from "@/lib/max/startapp";
import { PLAY_ACTION_LABEL, PREVIEW_ACTION_LABEL } from "@/lib/ui/action-labels";

type MaxSelectedProduct = Pick<MaxCatalogProduct, "authorSlug" | "slug">;

type MaxProductDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; product: MaxProductDetailModel }
  | { status: "not_found" }
  | { status: "error" };
type MaxPlaybackState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; session: MaxPlaybackSession; playbackTicket: string }
  | { status: "access_required" }
  | { status: "preview_unavailable" }
  | { status: "no_audio" }
  | { status: "error" };

export { formatMaxDuration } from "@/lib/max/format-duration";

function initialMaxSelectedProduct(
  startTarget: MaxResolvedStartTarget | null | undefined,
): MaxSelectedProduct | null {
  if (startTarget?.kind !== "product") return null;
  return {
    authorSlug: startTarget.authorSlug,
    slug: startTarget.productSlug,
  };
}

function initialMaxPromoTarget(
  startTarget: MaxResolvedStartTarget | null | undefined,
): MaxPromoTarget | null {
  if (startTarget?.kind === "promo") {
    return {
      authorSlug: startTarget.authorSlug,
      promoSlug: startTarget.promoSlug,
    };
  }
  if (startTarget?.kind === "product") return null;
  return readMaxPromoTargetFromLocation();
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

export default function MaxAuthenticatedHome({
  initialStartTarget = null,
  guestMode = false,
  onRequestLogin,
  onRequestSignup,
  onUnlinkAccount,
  unlinking = false,
}: {
  initialStartTarget?: MaxResolvedStartTarget | null;
  guestMode?: boolean;
  onRequestLogin?: () => void;
  onRequestSignup?: () => void;
  onUnlinkAccount?: () => Promise<boolean>;
  unlinking?: boolean;
}) {
  const [selected, setSelected] = useState<MaxSelectedProduct | null>(() =>
    initialMaxSelectedProduct(initialStartTarget),
  );
  const [detail, setDetail] = useState<MaxProductDetailState>(() =>
    initialStartTarget?.kind === "product" ? { status: "loading" } : { status: "idle" },
  );
  const [playback, setPlayback] = useState<MaxPlaybackState>(() =>
    initialStartTarget?.kind === "product" ? { status: "loading" } : { status: "idle" },
  );
  const [listenArmed, setListenArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MaxPrimaryTab>(() =>
    resolveInitialMaxPrimaryTab(
      initialStartTarget,
      Boolean(readMaxPromoTargetFromLocation()),
    ),
  );
  const [catalogTopicNavigation, setCatalogTopicNavigation] =
    useState<MaxCatalogTopicNavigationRequest | null>(null);
  const [promoTarget, setPromoTarget] = useState<MaxPromoTarget | null>(() =>
    initialMaxPromoTarget(initialStartTarget),
  );
  const [detailOrigin, setDetailOrigin] = useState<"catalog" | "library">("catalog");
  const [playlistRequest, setPlaylistRequest] = useState<{
    id: number;
    slug: string;
  } | null>(null);
  const playRef = useRef<(() => void) | null>(null);
  const pauseRef = useRef<(() => void) | null>(null);
  const selectTrackRef = useRef<((index: number) => void) | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingTrackIndexRef = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;

      if (initialStartTarget?.kind === "promo") {
        setActiveTab("catalog");
        setSelected(null);
        setPromoTarget({
          authorSlug: initialStartTarget.authorSlug,
          promoSlug: initialStartTarget.promoSlug,
        });
        return;
      }

      if (initialStartTarget?.kind === "product") {
        setActiveTab("catalog");
        setPromoTarget(null);
        pendingPlayRef.current = false;
        pendingTrackIndexRef.current = null;
        setListenArmed(false);
        setPlaying(false);
        setActiveTrackId(null);
        setDetail({ status: "loading" });
        setPlayback({ status: "loading" });
        setSelected({
          authorSlug: initialStartTarget.authorSlug,
          slug: initialStartTarget.productSlug,
        });
        return;
      }

      const locationPromo = readMaxPromoTargetFromLocation();
      setPromoTarget(locationPromo);
      if (locationPromo) {
        setActiveTab("catalog");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialStartTarget]);

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

  const reportActiveTrack = useCallback((track: { trackId: string | null }) => {
    setActiveTrackId((current) => (current === track.trackId ? current : track.trackId));
  }, []);

  function resetArmedPlayback() {
    pendingPlayRef.current = false;
    pendingTrackIndexRef.current = null;
    setListenArmed(false);
    setPlaying(false);
    setActiveTrackId(null);
  }

  function closeProductDetail() {
    resetArmedPlayback();
    setPlayback({ status: "idle" }); setDetail({ status: "idle" }); setSelected(null);
  }

  function closePromoLanding() {
    setPromoTarget(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("promo");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  function openCatalogProduct(product: MaxCatalogProduct) {
    setDetailOrigin(activeTab === "library" ? "library" : "catalog");
    resetArmedPlayback();
    setDetail({ status: "loading" });
    setPlayback({ status: "loading" });
    setSelected(product);
  }

  function openLibraryPlaylist(slug: string) {
    const trimmed = slug.trim();
    if (!trimmed) return;
    setPlaylistRequest((current) => ({
      slug: trimmed,
      id: (current?.id ?? 0) + 1,
    }));
    selectMaxTab("playlists");
  }

  function openCatalogTopic(topicKey: string) {
    const key = topicKey.trim();
    if (!key) return;
    closeProductDetail();
    setActiveTab("catalog");
    setCatalogTopicNavigation((current) => ({
      key,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }

  function openCatalogFromHome(target: {
    section: PublicCatalogSection | null;
    access: CatalogAccessFilter;
    publicationClass?: CatalogClassFilter;
  }) {
    closeProductDetail();
    if (promoTarget) {
      closePromoLanding();
    }
    setActiveTab("catalog");
    setCatalogTopicNavigation((current) => ({
      requestId: (current?.requestId ?? 0) + 1,
      section: target.section,
      access: target.access,
      publicationClass: target.publicationClass ?? "all",
    }));
  }

  function openHomeProduct(product: MaxCatalogProduct) {
    if (promoTarget) {
      closePromoLanding();
    }
    setActiveTab("catalog");
    openCatalogProduct(product);
  }

  useEffect(() => {
    if (!selected) {
      return;
    }
    const initData = readMaxInitData();
    if (!initData) return;
    const controller = new AbortController();
    void fetch(MAX_PRODUCT_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, authorSlug: selected.authorSlug, productSlug: selected.slug }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => ({ status: response.status, payload: await response.json().catch(() => null) }))
      .then(({ status, payload }) => {
        if (controller.signal.aborted) return;
        if (status === 404) return setDetail({ status: "not_found" });
        const product = readMaxProductDetail(payload?.product);
        if (product) setDetail({ status: "ready", product });
        else setDetail({ status: "error" });
      })
      .catch(() => { if (!controller.signal.aborted) setDetail({ status: "error" }); });
    return () => controller.abort();
  }, [selected]);

  useEffect(() => {
    if (!selected || detail.status !== "ready") {
      return;
    }
    const initData = readMaxInitData();
    if (!initData) {
      return;
    }
    const controller = new AbortController();
    void fetch(MAX_PLAYBACK_SESSION_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initData,
        authorSlug: selected.authorSlug,
        productSlug: selected.slug,
      }),
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
          return setPlayback({ status: "preview_unavailable" });
        }
        if (status === 403) return setPlayback({ status: "access_required" });
        if (status === 404 && payload?.reason === "no_audio") {
          return setPlayback({ status: "no_audio" });
        }
        const session = payload?.session;
        const playbackTicket =
          typeof payload?.playbackTicket === "string" ? payload.playbackTicket : "";
        if (
          session &&
          playbackTicket &&
          (session.playbackMode === "full" || session.playbackMode === "preview") &&
          Array.isArray(session.tracks) &&
          session.tracks.every((track: { trackId?: unknown }) => typeof track.trackId === "string")
        ) {
          setPlayback({ status: "ready", session, playbackTicket });
        } else {
          setPlayback({ status: "error" });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setPlayback({ status: "error" });
      });
    return () => controller.abort();
  }, [detail.status, selected]);

  function applyGuestHomeSlide(slideId: string) {
    const action = resolveMaxGuestHomeSlideAction(slideId);
    if (!action) return;
    if (action.type === "external") {
      openMaxGuestHomeExternalSlide(action.url);
      return;
    }
    if (action.type === "library") {
      selectMaxTab("library");
      return;
    }
    if (action.type === "playlists") {
      selectMaxTab("playlists");
      return;
    }
    openCatalogFromHome({
      section: action.section,
      access: action.access,
      publicationClass: action.publicationClass,
    });
  }

  function selectMaxTab(next: MaxPrimaryTab) {
    if (promoTarget) {
      closePromoLanding();
    }
    if (next === activeTab) {
      if (next === "catalog" && selected) closeProductDetail();
      if (next === "library" && selected) closeProductDetail();
      return;
    }
    if (activeTab === "catalog" || activeTab === "library") {
      resetArmedPlayback();
      setPlayback({ status: "idle" }); setDetail({ status: "idle" }); setSelected(null);
    }
    setActiveTab(next);
  }

  function startListening() {
    pendingTrackIndexRef.current = null;
    if (playback.status === "ready") {
      const firstId = playback.session.tracks[0]?.trackId ?? null;
      if (firstId) setActiveTrackId(firstId);
    }
    setListenArmed(true);
    if (playRef.current) playRef.current();
    else pendingPlayRef.current = true;
  }

  function pressProductTrack(audioItemId: string) {
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
    if (selectTrackRef.current) {
      selectTrackRef.current(decision.index);
      return;
    }
    pendingTrackIndexRef.current = decision.index;
  }

  const activeTabLabel =
    MAX_PRIMARY_TABS.find((tab) => tab.id === activeTab)?.label ?? "";

  return (
    <section
      className="min-h-screen bg-[#faf8ff] px-4 pt-[max(1rem,env(safe-area-inset-top))] text-[#25135c]"
      style={{ paddingBottom: MAX_SHELL_CONTENT_BOTTOM_PADDING }}
    >
      {activeTab === "catalog" ? null : (
        <header className="flex min-h-11 items-center border-b border-[#e8def5] pb-3">
          <AudioladHorizontalLogo
            className="h-8 w-auto max-w-full object-contain object-left"
            linkClassName="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            href={null}
            priority
            sizes="144px"
          />
        </header>
      )}
      <div className="mx-auto max-w-lg" hidden={activeTab !== "catalog" || Boolean(promoTarget)}>
        <MaxCatalogSearch
          onSelectProduct={openCatalogProduct}
          topicNavigationRequest={catalogTopicNavigation}
        />
      </div>
      {activeTab === "home" ? (
        <div className="mx-auto max-w-lg">
          <MaxHome
            guestMode={guestMode}
            onListenFree={() => openCatalogFromHome({ section: null, access: "free" })}
            onSlideAction={applyGuestHomeSlide}
            onOpenSection={(section) => openCatalogFromHome({ section, access: "all" })}
            onOpenShelf={(shelfId) => openCatalogFromHome(homeShelfTarget(shelfId))}
            onSelectProduct={openHomeProduct}
          />
        </div>
      ) : null}
      {activeTab === "playlists" ? (
        <MaxPlaylists
          guestMode={guestMode}
          onRequestLogin={onRequestLogin}
          onRequestSignup={onRequestSignup}
          requestedSlug={playlistRequest}
          onRequestedSlugApplied={() => setPlaylistRequest(null)}
        />
      ) : null}
      {activeTab === "library" ? (
        <MaxLibrary
          title={activeTabLabel}
          guestMode={guestMode}
          onRequestLogin={onRequestLogin}
          onRequestSignup={onRequestSignup}
          onOpenProduct={openCatalogProduct}
          onOpenPlaylist={openLibraryPlaylist}
          onBrowseCatalog={() => selectMaxTab("catalog")}
          onOpenPlaylists={() => selectMaxTab("playlists")}
        />
      ) : null}
      {activeTab === "profile" && guestMode ? (
        <MaxGuestProfile onLogin={onRequestLogin} onSignup={onRequestSignup} />
      ) : null}
      {activeTab === "profile" && !guestMode && onUnlinkAccount ? (
        <MaxProfile
          submitting={unlinking}
          onLogout={onUnlinkAccount}
          onOpenPlaylists={() => selectMaxTab("playlists")}
        />
      ) : null}
      {activeTab === "catalog" && promoTarget ? (
        <div
          className="fixed inset-x-0 top-0 z-10 overflow-y-auto bg-[#faf8ff] px-4 pt-[max(1rem,env(safe-area-inset-top))]"
          style={{ bottom: `calc(${MAX_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))` }}
        >
          <div className="mx-auto max-w-lg pb-6">
            <MaxPromoLanding target={promoTarget} onClose={closePromoLanding} />
          </div>
        </div>
      ) : null}
      {(activeTab === "catalog" && selected && !promoTarget) ||
      (activeTab === "library" && selected && !promoTarget) ? (
        <div
          className="fixed inset-x-0 top-0 z-10 overflow-y-auto bg-[#faf8ff] px-4 pt-[max(1rem,env(safe-area-inset-top))]"
          style={{
            bottom: `calc(${MAX_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <div className="mx-auto max-w-lg pb-6">
            <button type="button" onClick={closeProductDetail} className="min-h-11 text-sm font-medium text-[#7042c5]">
              {detailOrigin === "library" ? "← Назад в аудиотеку" : "← Назад в каталог"}
            </button>
          {detail.status === "loading" ? <p className="mt-6 text-sm text-[#6c5d94]">Детали продукта загружаются…</p> : null}
          {detail.status === "not_found" ? <p className="mt-6 text-sm text-[#6c5d94]">Продукт недоступен.</p> : null}
          {detail.status === "error" ? <p className="mt-6 text-sm text-[#6c5d94]">Не удалось загрузить продукт.</p> : null}
          {detail.status === "ready" ? (
            <MaxProductDetailView
              authorSlug={selected.authorSlug}
              productSlug={selected.slug}
              product={detail.product}
              trackPlayback={{
                playableTrackIds:
                  playback.status === "ready"
                    ? playback.session.tracks.map((track) => track.trackId)
                    : [],
                activeTrackId: listenArmed ? activeTrackId : null,
                isPlaying: listenArmed && playing,
                onPressTrack: pressProductTrack,
              }}
              onOpenRecommendation={openCatalogProduct}
              onOpenTopic={openCatalogTopic}
              guestMode={guestMode}
              onRequestLogin={onRequestLogin}
              listenSlot={
                <>
                  {playback.status === "loading" ? (
                    <p className="mt-4 text-sm text-[#6c5d94]">Проверяем доступ к прослушиванию…</p>
                  ) : null}
                  {playback.status === "access_required" ? (
                    <p className="mt-4 text-sm text-[#6c5d94]">Для прослушивания нужен доступ к продукту.</p>
                  ) : null}
                  {playback.status === "preview_unavailable" ? (
                    <p className="mt-4 text-sm text-[#6c5d94]">Предпрослушивание пока недоступно.</p>
                  ) : null}
                  {guestMode &&
                  (playback.status === "access_required" ||
                    playback.status === "preview_unavailable") ? (
                    <div className="mt-4 flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={onRequestLogin}
                        className={FEATURED_CARD_PRIMARY_CTA_CLASS}
                      >
                        {MAX_SHELL_LOGIN_CTA}
                      </button>
                      <button
                        type="button"
                        onClick={onRequestSignup}
                        className="w-full rounded-full border border-[#7042c5] px-5 py-4 text-[17px] font-medium text-[#7042c5]"
                      >
                        {MAX_SHELL_SIGNUP_CTA}
                      </button>
                    </div>
                  ) : null}
                  {playback.status === "no_audio" ? (
                    <p className="mt-4 text-sm text-[#6c5d94]">В этом продукте пока нет аудио.</p>
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
                  onActiveTrackChange={reportActiveTrack}
                  fetchAudio={async (trackId, signal) => {
                    if (playback.session.playbackMode === "preview") {
                      const response = await fetch(MAX_PLAYBACK_PREVIEW_PATH, {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          playbackTicket: playback.playbackTicket,
                          trackId,
                        }),
                        cache: "no-store",
                        signal,
                      });
                      if (!response.ok) {
                        const payload = await response.json().catch(() => null);
                        return { ok: false, reason: payload?.reason ?? "error" };
                      }
                      const blob = await response.blob();
                      return {
                        ok: true,
                        url: URL.createObjectURL(blob),
                        objectUrl: true,
                      };
                    }
                    const response = await fetch(MAX_PLAYBACK_AUDIO_PATH, {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        playbackTicket: playback.playbackTicket,
                        trackId,
                      }),
                      cache: "no-store",
                      signal,
                    });
                    const payload = await response.json().catch(() => null);
                    if (response.ok && typeof payload?.url === "string") {
                      return { ok: true, url: payload.url };
                    }
                    return { ok: false, reason: payload?.reason ?? "error" };
                  }}
                />
                    </div>
                  ) : null}
                  {!listenArmed &&
                  playback.status !== "access_required" &&
                  playback.status !== "preview_unavailable" &&
                  playback.status !== "no_audio" &&
                  playback.status !== "error" ? (
                    <div
                      data-practice-hero-actions
                      className={`${FEATURED_CARD_ACTIONS_CLASS} practice-product-hero__actions`}
                    >
                      <button
                        type="button"
                        onClick={startListening}
                        className={FEATURED_CARD_PRIMARY_CTA_CLASS}
                      >
                        <PlayIcon />
                        {playback.status === "ready" && playback.session.playbackMode === "preview"
                          ? PREVIEW_ACTION_LABEL
                          : PLAY_ACTION_LABEL}
                      </button>
                    </div>
                  ) : null}
                </>
              }
            />
          ) : null}
          </div>
        </div>
      ) : null}
      <MaxBottomNav activeTab={activeTab} onSelectTab={selectMaxTab} />
    </section>
  );
}
