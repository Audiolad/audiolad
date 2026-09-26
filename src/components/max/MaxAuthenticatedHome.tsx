"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
import MaxProductDetailView from "@/components/max/MaxProductDetailView";
import MaxPromoLanding from "@/components/max/MaxPromoLanding";
import MaxTabPlaceholder from "@/components/max/MaxTabPlaceholder";
import { readMaxInitData } from "@/lib/max/bridge";
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
  MAX_INITIAL_PRIMARY_TAB,
  MAX_PRIMARY_TABS,
  MAX_SHELL_CONTENT_BOTTOM_PADDING,
  MAX_TAB_BAR_HEIGHT_PX,
  type MaxPrimaryTab,
} from "@/lib/max/primary-tabs";
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

export default function MaxAuthenticatedHome({
  initialStartTarget = null,
}: {
  initialStartTarget?: MaxResolvedStartTarget | null;
}) {
  const [selected, setSelected] = useState<MaxSelectedProduct | null>(null);
  const [detail, setDetail] = useState<MaxProductDetailState>({ status: "idle" });
  const [playback, setPlayback] = useState<MaxPlaybackState>({ status: "idle" });
  const [listenArmed, setListenArmed] = useState(false);
  const [activeTab, setActiveTab] = useState<MaxPrimaryTab>(MAX_INITIAL_PRIMARY_TAB);
  const [catalogTopicNavigation, setCatalogTopicNavigation] =
    useState<MaxCatalogTopicNavigationRequest | null>(null);
  const [promoTarget, setPromoTarget] = useState<MaxPromoTarget | null>(null);
  const playRef = useRef<(() => void) | null>(null);
  const pendingPlayRef = useRef(false);
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
        setListenArmed(false);
        setDetail({ status: "loading" });
        setPlayback({ status: "loading" });
        setSelected({
          authorSlug: initialStartTarget.authorSlug,
          slug: initialStartTarget.productSlug,
        });
        return;
      }

      setPromoTarget(readMaxPromoTargetFromLocation());
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

  function closeProductDetail() {
    pendingPlayRef.current = false;
    setListenArmed(false);
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
    pendingPlayRef.current = false;
    setListenArmed(false);
    setDetail({ status: "loading" });
    setPlayback({ status: "loading" });
    setSelected(product);
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

  function selectMaxTab(next: MaxPrimaryTab) {
    if (promoTarget) {
      closePromoLanding();
    }
    if (next === activeTab) {
      if (next === "catalog" && selected) closeProductDetail();
      return;
    }
    if (activeTab === "catalog") {
      pendingPlayRef.current = false;
      setListenArmed(false);
      setPlayback({ status: "idle" }); setDetail({ status: "idle" }); setSelected(null);
    }
    setActiveTab(next);
  }

  function startListening() {
    setListenArmed(true);
    if (playRef.current) playRef.current();
    else pendingPlayRef.current = true;
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
      {activeTab === "catalog" ? null : (
        <MaxTabPlaceholder title={activeTabLabel} />
      )}
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
      {activeTab === "catalog" && selected && !promoTarget ? (
        <div
          className="fixed inset-x-0 top-0 z-10 overflow-y-auto bg-[#faf8ff] px-4 pt-[max(1rem,env(safe-area-inset-top))]"
          style={{ bottom: `calc(${MAX_TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))` }}
        >
          <div className="mx-auto max-w-lg pb-6">
          <button type="button" onClick={closeProductDetail} className="min-h-11 text-sm font-medium text-[#7042c5]">
            ← Назад в каталог
          </button>
          {detail.status === "loading" ? <p className="mt-6 text-sm text-[#6c5d94]">Детали продукта загружаются…</p> : null}
          {detail.status === "not_found" ? <p className="mt-6 text-sm text-[#6c5d94]">Продукт недоступен.</p> : null}
          {detail.status === "error" ? <p className="mt-6 text-sm text-[#6c5d94]">Не удалось загрузить продукт.</p> : null}
          {detail.status === "ready" ? (
            <MaxProductDetailView
              authorSlug={selected.authorSlug}
              productSlug={selected.slug}
              product={detail.product}
              onOpenRecommendation={openCatalogProduct}
              onOpenTopic={openCatalogTopic}
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
                  onBindPlay={bindPlay}
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
