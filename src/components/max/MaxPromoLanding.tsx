"use client";

import { useEffect, useRef, useState } from "react";

import MaxAudioPlayer from "@/components/max/MaxAudioPlayer";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { openMaxExternalLink, readMaxInitData } from "@/lib/max/bridge";
import {
  MAX_PLAYBACK_AUDIO_PATH,
  MAX_PLAYBACK_PREVIEW_PATH,
  MAX_PLAYBACK_SESSION_PATH,
  MAX_PROMO_PATH,
} from "@/lib/max/host";
import {
  trackMaxPromoCompletedOnce,
  trackMaxPromoCtaClicked,
  trackMaxPromoPlayStartedOnce,
  trackMaxPromoViewedOnce,
} from "@/lib/max/promo-analytics-client";
import type { MaxPlaybackSession } from "@/lib/max/playback-types";
import {
  readMaxPromoPage,
  type MaxPromoPage,
  type MaxPromoProduct,
} from "@/lib/max/promo-view";
import type { MaxPromoTarget } from "@/lib/max/promo-target";

type PromoLoadState =
  | { status: "loading" }
  | { status: "ready"; page: MaxPromoPage }
  | { status: "not_found" }
  | { status: "error" };

type PromoPlaybackState =
  | { status: "idle" }
  | { status: "loading"; practiceId: string }
  | {
      status: "ready";
      practiceId: string;
      session: MaxPlaybackSession;
      playbackTicket: string;
    }
  | { status: "error"; practiceId: string; message: string };

function durationLabel(minutes: number | null): string | null {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return null;
  return `${Math.round(minutes)} мин`;
}

function isMaxChatCta(page: MaxPromoPage): boolean {
  const href = page.cta?.href;
  if (!href) return false;
  try {
    const host = new URL(href, "https://audiolad.ru").hostname.toLowerCase();
    return host === "max.ru" || host === "web.max.ru" || host === "max.audiolad.ru";
  } catch {
    return false;
  }
}

function openPromoCta(page: MaxPromoPage) {
  const cta = page.cta;
  if (!cta) return;
  const href =
    cta.kind === "internal"
      ? new URL(cta.href, "https://audiolad.ru").toString()
      : cta.href;
  openMaxExternalLink(href);
}

function playbackFailureMessage(status: number, reason: unknown): string {
  if (status === 403 && reason === "preview_unavailable") {
    return "Предпрослушивание пока недоступно.";
  }
  if (status === 403) {
    return "Для прослушивания нужен доступ к продукту.";
  }
  if (status === 404 && reason === "no_audio") {
    return "В этой практике пока нет аудио.";
  }
  return "Не удалось подготовить прослушивание.";
}

export default function MaxPromoLanding({
  target,
  onClose,
}: {
  target: MaxPromoTarget;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<PromoLoadState>({ status: "loading" });
  const [playback, setPlayback] = useState<PromoPlaybackState>({ status: "idle" });
  const pendingAutoPlayRef = useRef<string | null>(null);

  useEffect(() => {
    const initData = readMaxInitData();
    if (!initData) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setLoad({ status: "error" });
      });
      return () => {
        cancelled = true;
      };
    }
    const controller = new AbortController();
    void fetch(MAX_PROMO_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        initData,
        authorSlug: target.authorSlug,
        promoSlug: target.promoSlug,
      }),
    })
      .then(async (response) => ({
        status: response.status,
        payload: await response.json().catch(() => null),
      }))
      .then(({ status, payload }) => {
        if (controller.signal.aborted) return;
        if (status === 404) {
          setLoad({ status: "not_found" });
          return;
        }
        if (!payload?.ok) {
          setLoad({ status: "error" });
          return;
        }
        const page = readMaxPromoPage(payload.page);
        if (!page) {
          setLoad({ status: "error" });
          return;
        }
        setLoad({ status: "ready", page });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: "error" });
      });
    return () => controller.abort();
  }, [target.authorSlug, target.promoSlug]);

  useEffect(() => {
    if (load.status === "ready") {
      trackMaxPromoViewedOnce(load.page.promoPageId);
    }
  }, [load]);

    async function startProduct(product: MaxPromoProduct) {
    const initData = readMaxInitData();
    if (!initData) {
      setPlayback({
        status: "error",
        practiceId: product.practiceId,
        message: "Не удалось подтвердить сессию MAX.",
      });
      return;
    }

    setPlayback({ status: "loading", practiceId: product.practiceId });
    pendingAutoPlayRef.current = product.practiceId;
    try {
      const response = await fetch(MAX_PLAYBACK_SESSION_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          initData,
          authorSlug: product.authorSlug,
          productSlug: product.slug,
        }),
      });
      const payload = await response.json().catch(() => null);
      const session = payload?.session;
      const playbackTicket =
        typeof payload?.playbackTicket === "string" ? payload.playbackTicket : "";
      if (
        !response.ok ||
        !session ||
        !playbackTicket ||
        !Array.isArray(session.tracks)
      ) {
        setPlayback({
          status: "error",
          practiceId: product.practiceId,
          message: playbackFailureMessage(response.status, payload?.reason),
        });
        return;
      }
      setPlayback({
        status: "ready",
        practiceId: product.practiceId,
        session,
        playbackTicket,
      });
    } catch {
      setPlayback({
        status: "error",
        practiceId: product.practiceId,
        message: "Не удалось подготовить прослушивание.",
      });
    }
  }

  if (load.status === "loading") {
    return <p className="mt-6 text-sm text-[#6c5d94]">Загружаем подарок…</p>;
  }
  if (load.status === "not_found") {
    return (
      <div className="mt-6">
        <p className="text-sm text-[#6c5d94]">Промостраница недоступна.</p>
        <button type="button" onClick={onClose} className="mt-4 min-h-11 text-sm font-medium text-[#7042c5]">
          ← В каталог
        </button>
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="mt-6">
        <p className="text-sm text-[#6c5d94]">Не удалось загрузить страницу.</p>
        <button type="button" onClick={onClose} className="mt-4 min-h-11 text-sm font-medium text-[#7042c5]">
          ← В каталог
        </button>
      </div>
    );
  }

  const page = load.page;
  return (
    <div data-max-promo-page="">
      <button
        type="button"
        onClick={onClose}
        className="min-h-11 text-sm font-medium text-[#7042c5]"
      >
        ← В каталог
      </button>

      <div className="mt-3 overflow-hidden rounded-[28px] border border-[#eadff8] bg-[#fbf8ff]">
        {page.bannerUrl ? (
          <div className="border-b border-[#eadff8]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.bannerUrl} alt="" className="h-40 w-full object-cover" />
          </div>
        ) : null}

        <div className="border-b border-[#eadff8] bg-white px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9485b4]">
            АудиоЛад
          </p>
          <h1 className="mt-3 text-[26px] font-semibold leading-tight text-[#2f2548]">
            {page.publicTitle}
          </h1>
          {page.publicDescription ? (
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[#5f5484]">
              {page.publicDescription}
            </p>
          ) : null}
          {page.authorName ? (
            <p className="mt-4 text-sm text-[#7d70a2]">
              Автор: <span className="font-medium text-[#7042c5]">{page.authorName}</span>
            </p>
          ) : null}
        </div>

        <div className="space-y-4 px-5 py-6">
          {page.products.map((product) => {
            const isLoading =
              playback.status === "loading" && playback.practiceId === product.practiceId;
            const isReady =
              playback.status === "ready" && playback.practiceId === product.practiceId;
            const isError =
              playback.status === "error" && playback.practiceId === product.practiceId;
            const meta = [product.format, durationLabel(product.durationMinutes)]
              .filter(Boolean)
              .join(" · ");

            return (
              <article
                key={product.practiceId}
                className="rounded-[22px] border border-[#eadff8] bg-white p-4"
              >
                <div className="flex gap-4">
                  <ProductCoverThumbnail
                    slug={product.slug}
                    title={product.title}
                    coverUrl={product.coverUrl}
                    authorName={product.authorName}
                    format={product.format}
                    className="h-24 w-24 shrink-0 rounded-[18px]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
                      {product.format ?? "Аудиопрактика"}
                    </p>
                    <h2 className="mt-1 text-[17px] font-semibold leading-snug text-[#2f2548]">
                      {product.title}
                    </h2>
                    {meta ? <p className="mt-2 text-sm text-[#7d70a2]">{meta}</p> : null}
                    {!isReady ? (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => void startProduct(product)}
                        className="mt-4 min-h-11 rounded-full bg-[#7042c5] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {isLoading ? "Подготавливаем…" : "Начать слушать"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {isError ? (
                  <p className="mt-3 text-sm text-[#b34f63]" role="alert">
                    {playback.message}
                  </p>
                ) : null}

                {isReady ? (
                  <MaxAudioPlayer
                    session={playback.session}
                    onBindPlay={(play) => {
                      if (pendingAutoPlayRef.current === product.practiceId) {
                        pendingAutoPlayRef.current = null;
                        play();
                      }
                    }}
                    onPlaybackStarted={({ trackId }) => {
                      trackMaxPromoPlayStartedOnce(
                        page.promoPageId,
                        product.practiceId,
                        trackId,
                      );
                    }}
                    onPlaybackCompleted={({ trackId, durationSeconds }) => {
                      trackMaxPromoCompletedOnce(
                        page.promoPageId,
                        product.practiceId,
                        trackId,
                        durationSeconds,
                      );
                    }}
                    fetchAudio={async (trackId, signal) => {
                      if (playback.session.playbackMode === "preview") {
                        const response = await fetch(MAX_PLAYBACK_PREVIEW_PATH, {
                          method: "POST",
                          credentials: "same-origin",
                          headers: { "Content-Type": "application/json" },
                          cache: "no-store",
                          signal,
                          body: JSON.stringify({
                            playbackTicket: playback.playbackTicket,
                            trackId,
                          }),
                        });
                        if (!response.ok) {
                          const payload = await response.json().catch(() => null);
                          return { ok: false as const, reason: payload?.reason ?? "error" };
                        }
                        return {
                          ok: true as const,
                          url: URL.createObjectURL(await response.blob()),
                          objectUrl: true,
                        };
                      }

                      const response = await fetch(MAX_PLAYBACK_AUDIO_PATH, {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json" },
                        cache: "no-store",
                        signal,
                        body: JSON.stringify({
                          playbackTicket: playback.playbackTicket,
                          trackId,
                        }),
                      });
                      const payload = await response.json().catch(() => null);
                      return response.ok && typeof payload?.url === "string"
                        ? { ok: true as const, url: payload.url }
                        : { ok: false as const, reason: payload?.reason ?? "error" };
                    }}
                  />
                ) : null}
              </article>
            );
          })}
        </div>

        {page.cta ? (
          <section
            className="border-t border-[#eadff8] bg-white px-5 py-6"
            aria-label="Действие после прослушивания"
          >
            {page.cta.heading ? (
              <h2 className="text-[20px] font-semibold leading-snug text-[#2f2548]">
                {page.cta.heading}
              </h2>
            ) : null}
            {page.cta.description ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#5f5484]">
                {page.cta.description}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                trackMaxPromoCtaClicked(page.promoPageId, {
                  position: "after_practices",
                  destination_kind: page.cta?.kind ?? "external",
                  destination_host: page.cta?.host ?? null,
                  open_mode: page.cta?.openInNewTab ? "new_tab" : "same_tab",
                });
                openPromoCta(page);
              }}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
            >
              {page.cta.label}
            </button>
            {isMaxChatCta(page) ? (
              <p className="mt-2 text-center text-xs leading-5 text-[#8c7dab]">
                Откроется чат в MAX.
              </p>
            ) : null}
          </section>
        ) : null}

        {page.footerText ? (
          <div className="border-t border-[#eadff8] bg-white px-5 py-6">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#5f5484]">
              {page.footerText}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
