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
  | { status: "ready"; product: { title: string; subtitle: string | null; description: string | null; authorName: string | null; formatLabel: string; coverUrl: string | null; priceLabel: string; statsLabel: string | null; contents: Array<{ title: string; position: number; durationSeconds: number | null }> } }
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
        if (product && Array.isArray(product.contents)) {
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
              <h2 className="mt-2 text-2xl font-semibold">{detail.product.title}</h2>
              {detail.product.subtitle ? (
                <p className="mt-2 text-sm text-[#6c5d94]">{detail.product.subtitle}</p>
              ) : null}
              {detail.product.authorName ? (
                <p className="mt-2 text-sm text-[#6c5d94]">{detail.product.authorName}</p>
              ) : null}
              {detail.product.statsLabel ? (
                <p className="mt-2 text-sm text-[#6c5d94]">{detail.product.statsLabel}</p>
              ) : null}
              {!selected.isFree ? (
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
              {detail.product.description ? (
                <p className="mt-6 whitespace-pre-line text-sm text-[#4a3d73]">{detail.product.description}</p>
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
