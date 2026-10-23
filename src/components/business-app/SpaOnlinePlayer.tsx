"use client";

import { useEffect, useRef, useState } from "react";

import BusinessPlayerControls from "@/components/business-app/BusinessPlayerControls";
import { deriveSpaPlaybackState, getSpaDeviceSecret, SpaLiveEvidence, sendSpaLiveReport, type SpaLiveReport, type SpaPlaybackState } from "@/lib/business-app/spa-live-report";
import { fetchSpaManifest, fetchSpaTrackUrl, postSpaReport, watchSpaBuild } from "@/lib/business-app/spa-player-client";
import { parseSpaManifest, type SpaManifestItem } from "@/lib/business-app/spa-manifest";
import { SpaOnlinePlayer as Controller, type OnlineStatus } from "@/lib/business-app/spa-online-player";

/**
 * Business SPA pilot, stage 1: online-only player (no offline cache, nothing stored on
 * the device). The offline player (SpaPilotPlayer) is deferred to the next stage.
 */

type Props = { programName: string; initialManifest: unknown };

const MANIFEST_REFRESH_MS = 60 * 1000;

function parseItems(raw: unknown): SpaManifestItem[] {
  try {
    return parseSpaManifest(raw).items;
  } catch {
    return [];
  }
}

type View = { items: SpaManifestItem[]; status: OnlineStatus; current: SpaManifestItem | null; message: string | null };

export default function SpaOnlinePlayer({ programName, initialManifest }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctlRef = useRef<Controller | null>(null);
  const [view, setView] = useState<View>(() => ({ items: parseItems(initialManifest), status: "idle", current: null, message: null }));
  const [newBuild, setNewBuild] = useState(false);

  // A newer deploy only shows a gentle hint; never auto-reload (music must not stop).
  useEffect(() => watchSpaBuild(() => setNewBuild(true)), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const evidence = new SpaLiveEvidence();
    const deviceSecret = getSpaDeviceSecret(
      typeof window !== "undefined" ? window.sessionStorage : null,
      () => crypto.randomUUID(),
    );
    const sendPlayback = (r: SpaLiveReport) => postSpaReport({ kind: "playback", deviceSecret, report: r });
    const heartbeatOnce = () => { try { void postSpaReport({ kind: "heartbeat", deviceSecret }).catch(() => {}); } catch { /* best effort */ } };
    let lastState = "";
    let lastTrack: string | null = null;
    const report = () => {
      const c = ctlRef.current;
      // Sample the element itself so a track that was already playing is confirmed too.
      evidence.onTimeUpdate(audio.currentTime, Date.now(), audio.paused || audio.ended);
      const state: SpaPlaybackState = deriveSpaPlaybackState(c?.status, audio, Boolean(c?.current));
      sendSpaLiveReport(sendPlayback,
        evidence.report(state, c?.current?.audioItemId ?? null, Date.now()));
    };
    const ctl = new Controller(
      {
        audio,
        now: () => Date.now(),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (t) => window.clearTimeout(t as number),
        sign: async (id) => {
          try {
            const r = await fetchSpaTrackUrl(id);
            return r.ok ? { ok: true, data: { url: r.data.url } } : r;
          } catch {
            return { ok: false, reason: "network" };
          }
        },
        onChange: () => {
          const c = ctlRef.current;
          if (c) {
            setView({ items: c.items, status: c.status, current: c.current, message: c.message });
            const track = c.current?.audioItemId ?? null;
            if (c.status === "loading" || (c.status === "paused" && audio.paused) || c.status === "idle" || c.status === "error" || c.status === "no_access" || track !== lastTrack) evidence.reset();
            if (c.status !== lastState || track !== lastTrack) {
              lastState = c.status;
              lastTrack = track;
              report();
            }
          }
        },
      },
      parseItems(initialManifest),
    );
    ctlRef.current = ctl;
    const onPlaying = () => { evidence.onPlaying(audio.currentTime); report(); };
    const onTimeUpdate = () => evidence.onTimeUpdate(audio.currentTime, Date.now(), audio.paused || audio.ended);
    const onPause = () => { evidence.reset(audio.currentTime); report(); };
    const onEnded = () => {
      evidence.reset();
      if (ctl.items.length === 0) {
        sendSpaLiveReport(sendPlayback, evidence.report("stopped", null, Date.now()));
      }
      void ctl.onEnded();
    };
    const onError = () => { evidence.reset(); void ctl.onError(); };
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    const refresh = async () => {
      try {
        const r = await fetchSpaManifest();
        if (!r.ok && r.reason === "no_access") return void ctl.applyManifest(null);
        if (r.ok) void ctl.applyManifest(parseItems(r.data));
      } catch {
        // offline / transient: keep current list; the server still gates every URL.
      }
    };
    // (1) connectivity heartbeat and (2) playback state are separate reports.
    heartbeatOnce();
    const heartbeat = window.setInterval(() => {
      heartbeatOnce();
      if (ctlRef.current?.current) report();
    }, 60_000);
    const timer = window.setInterval(() => void refresh(), MANIFEST_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(heartbeat);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      ctl.dispose();
      ctlRef.current = null;
    };
  }, [initialManifest]);

  const { items, status, current, message } = view;
  const ctl = () => ctlRef.current;

  return (
    <section className="spa-pilot business-app-card mx-auto max-w-[720px]" data-testid="spa-pilot">
      <h1 className="text-2xl font-semibold text-[var(--biz-text)]">{programName}</h1>
      <p className="mt-1 text-[0.82rem] business-app-muted">Ранний доступ: страница открыта только участникам. Музыка играет через интернет.</p>
      {status === "no_access" ? (
        <p className="mt-3" data-testid="spa-no-access">Доступ к музыке закрыт.</p>
      ) : items.length === 0 ? (
        <p className="mt-3 business-app-muted" data-testid="spa-empty">В программе пока нет треков с подтверждёнными правами для заведений.</p>
      ) : (
        <>
          <BusinessPlayerControls
            testIdPrefix="spa"
            playing={status === "playing"}
            loading={status === "loading"}
            nowTitle={current ? current.title : null}
            onToggle={() => void ctl()?.toggle()}
            onNext={() => void ctl()?.next()}
          />
          {message ? <p className="business-app-alert mt-3" data-tone="warn" role="alert">{message}</p> : null}
          <ol className="business-app-tracklist" data-testid="spa-tracks">
            {items.map((i, idx) => (
              <li key={i.audioItemId}>
                <button
                  type="button"
                  onClick={() => void ctl()?.playIndex(idx)}
                  className="business-app-focus-ring"
                  aria-current={current?.audioItemId === i.audioItemId ? "true" : undefined}
                >
                  {i.title || "Без названия"}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      {newBuild ? (
        <p className="mt-4 text-[0.82rem] business-app-muted" data-testid="spa-new-build">
          Доступна новая версия страницы. Музыка продолжит играть; обновите страницу, когда будет удобно.
        </p>
      ) : null}
      <audio ref={audioRef} preload="none" playsInline />
    </section>
  );
}
