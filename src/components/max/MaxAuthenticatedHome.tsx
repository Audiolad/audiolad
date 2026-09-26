"use client";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import MaxAudioPlayer from "@/components/max/MaxAudioPlayer";
import MaxBottomNav from "@/components/max/MaxBottomNav";
import MaxCatalogSearch, {
  type MaxCatalogProduct,
} from "@/components/max/MaxCatalogSearch";
import MaxTabPlaceholder from "@/components/max/MaxTabPlaceholder";
import { readMaxInitData } from "@/lib/max/bridge";
import { formatMaxDuration } from "@/lib/max/format-duration";
import {
  MAX_PLAYBACK_AUDIO_PATH,
  MAX_PLAYBACK_PREVIEW_PATH,
  MAX_PLAYBACK_SESSION_PATH,
  MAX_PRODUCT_PATH,
} from "@/lib/max/host";
import type { MaxPlaybackSession } from "@/lib/max/playback-types";
import {
  MAX_INITIAL_PRIMARY_TAB,
  MAX_PRIMARY_TABS,
  MAX_SHELL_CONTENT_BOTTOM_PADDING,
  type MaxPrimaryTab,
} from "@/lib/max/primary-tabs";
import { useEffect, useState } from "react";

type MaxProductDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      product: {
        title: string;
        subtitle: string | null;
        authorName: string | null;
        formatLabel: string;
        coverUrl: string | null;
        priceLabel: string;
        isFree: boolean;
        statsLabel: string | null;
        topics: Array<{ key: string; title: string }>;
        contents: Array<{ title: string; position: number; durationSeconds: number | null }>;
        recommendations: MaxCatalogProduct[];
      };
    }
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

export default function MaxAuthenticatedHome() {
  const [selected, setSelected] = useState<MaxCatalogProduct | null>(null);
  const [detail, setDetail] = useState<MaxProductDetailState>({ status: "idle" });
  const [playback, setPlayback] = useState<MaxPlaybackState>({ status: "idle" });
  const [activeTab, setActiveTab] = useState<MaxPrimaryTab>(MAX_INITIAL_PRIMARY_TAB);

  function openCatalogProduct(product: MaxCatalogProduct) {
    setDetail({ status: "loading" });
    setPlayback({ status: "loading" });
    setSelected(product);
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
        const product = payload?.product;
        if (
          product &&
          Array.isArray(product.contents) &&
          Array.isArray(product.topics) &&
          Array.isArray(product.recommendations)
        ) {
          setDetail({ status: "ready", product });
        } else setDetail({ status: "error" });
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
    if (next === activeTab) {
      return;
    }
    if (activeTab === "catalog") {
      setPlayback({ status: "idle" }); setDetail({ status: "idle" }); setSelected(null);
    }
    setActiveTab(next);
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
      <div className="mx-auto max-w-lg" hidden={activeTab !== "catalog"}>
        <MaxCatalogSearch onSelectProduct={openCatalogProduct} />
      </div>
      {activeTab === "catalog" ? null : (
        <MaxTabPlaceholder title={activeTabLabel} />
      )}
      {activeTab === "catalog" && selected ? (
        <div className="fixed inset-0 overflow-y-auto bg-[#faf8ff] p-4">
          <button type="button" onClick={() => { setPlayback({ status: "idle" }); setDetail({ status: "idle" }); setSelected(null); }} className="min-h-11 text-sm font-medium text-[#7042c5]">
            ← Назад в каталог
          </button>
          {detail.status === "loading" ? <p className="mt-6 text-sm text-[#6c5d94]">Детали продукта загружаются…</p> : null}
          {detail.status === "not_found" ? <p className="mt-6 text-sm text-[#6c5d94]">Продукт недоступен.</p> : null}
          {detail.status === "error" ? <p className="mt-6 text-sm text-[#6c5d94]">Не удалось загрузить продукт.</p> : null}
          {detail.status === "ready" ? (
            <>
              {detail.product.coverUrl ? (
                <img
                  src={detail.product.coverUrl}
                  alt=""
                  className="mt-4 aspect-square w-full max-w-[280px] mx-auto rounded-2xl object-cover"
                />
              ) : null}
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
                {detail.product.formatLabel}
              </p>
              <h2 className="mt-1 text-2xl font-semibold">{detail.product.title}</h2>
              {detail.product.subtitle ? (
                <p className="mt-2 text-sm text-[#6c5d94]">{detail.product.subtitle}</p>
              ) : null}
              {detail.product.authorName ? (
                <p className="mt-2 text-sm text-[#6c5d94]">{detail.product.authorName}</p>
              ) : null}
              {detail.product.statsLabel ? (
                <p className="mt-2 text-sm text-[#6c5d94]">{detail.product.statsLabel}</p>
              ) : null}
              {detail.product.topics.length ? (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Темы продукта">
                  {detail.product.topics.map((topic) => (
                    <li
                      key={topic.key}
                      className="rounded-full border border-[#ddcfef] bg-white px-3 py-1.5 text-xs font-medium text-[#7042c5]"
                    >
                      {topic.title}
                    </li>
                  ))}
                </ul>
              ) : null}
              {!detail.product.isFree ? (
                <p className="mt-2 text-sm font-medium text-[#7042c5]">{detail.product.priceLabel}</p>
              ) : null}
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
                <MaxAudioPlayer
                  session={playback.session}
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
              ) : null}
              {playback.status !== "ready" && detail.product.contents.length ? (
                <ol className="mt-6 space-y-2 text-sm">
                  {detail.product.contents.map((track) => (
                    <li key={`${track.position}-${track.title}`}>
                      {track.position}. {track.title}
                      {track.durationSeconds !== null ? ` · ${formatMaxDuration(track.durationSeconds)}` : ""}
                    </li>
                  ))}
                </ol>
              ) : null}
              {detail.product.recommendations.length ? (
                <section className="mt-8 pb-6" aria-labelledby="max-author-recommendations-title">
                  <h3
                    id="max-author-recommendations-title"
                    className="text-lg font-semibold text-[#25135c]"
                  >
                    Ещё от автора
                  </h3>
                  <ul className="mt-3 grid grid-cols-2 gap-2">
                    {detail.product.recommendations.map((product) => (
                      <li
                        key={`${product.authorSlug}/${product.slug}`}
                        className="min-w-0"
                      >
                        <button
                          type="button"
                          onClick={() => openCatalogProduct(product)}
                          className="flex w-full min-w-0 flex-col overflow-hidden rounded-[18px] border border-[#eadff8] bg-white text-left shadow-[0_4px_14px_rgba(91,62,145,0.05)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                        >
                          <div className="aspect-square w-full bg-[#ede6f8]">
                            {product.coverUrl ? (
                              <img
                                src={product.coverUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="px-2.5 pb-2.5 pt-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
                              {product.formatLabel}
                            </p>
                            <p className="line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-[#25135c]">
                              {product.title}
                            </p>
                            {!product.isFree ? (
                              <p className="mt-1 whitespace-nowrap text-xs font-semibold leading-4 text-[#7042c5]">
                                {product.priceLabel}
                              </p>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {selected ? null : (
        <MaxBottomNav activeTab={activeTab} onSelectTab={selectMaxTab} />
      )}
    </section>
  );
}
