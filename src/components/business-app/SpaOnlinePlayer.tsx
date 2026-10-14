"use client";

import { useEffect, useRef, useState } from "react";

import { getSpaTrackUrl, refreshSpaManifest, reportSpaPlayerHeartbeat, reportSpaPlayerPlayback } from "@/app/business-app/spa/actions";
import { getSpaDeviceSecret, SpaLiveEvidence, sendSpaLiveReport, type SpaPlaybackState } from "@/lib/business-app/spa-live-report";
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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const evidence = new SpaLiveEvidence();
    const deviceSecret = getSpaDeviceSecret(
      typeof window !== "undefined" ? window.sessionStorage : null,
      () => crypto.randomUUID(),
    );
    const sendPlayback = (r: Parameters<typeof reportSpaPlayerPlayback>[1]) => reportSpaPlayerPlayback(deviceSecret, r);
    const heartbeatOnce = () => { try { void reportSpaPlayerHeartbeat(deviceSecret).catch(() => {}); } catch { /* best effort */ } };
    let lastState = "";
    let lastTrack: string | null = null;
    const report = () => {
      const c = ctlRef.current;
      const state: SpaPlaybackState = c?.status === "error" ? "error"
        : audio.ended ? "stopped" : c?.status === "paused" || (c?.status === "playing" && audio.paused) ? "paused"
          : c?.status === "playing" ? "playing" : "stopped";
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
            const r = await getSpaTrackUrl(id, "stream");
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
            if (c.status === "loading" || c.status === "paused" || c.status === "idle" || c.status === "error" || c.status === "no_access" || track !== lastTrack) evidence.reset();
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
    const onTimeUpdate = () => evidence.onTimeUpdate(audio.currentTime, Date.now());
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
        const r = await refreshSpaManifest();
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
    <section className="spa-pilot" data-testid="spa-pilot" style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>{programName}</h1>
      <p style={{ fontSize: 13, opacity: 0.7 }}>Пилот: страница видна только участникам пилота. Воспроизведение через интернет.</p>
      {status === "no_access" ? (
        <p data-testid="spa-no-access">Доступ к пилоту закрыт.</p>
      ) : items.length === 0 ? (
        <p data-testid="spa-empty">В программе пока нет треков, разрешённых для Business.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="spa-play"
              onClick={() => void ctl()?.toggle()}
              style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid currentColor", fontSize: 16 }}
            >
              {status === "playing" || status === "loading" ? "Пауза" : "Играть"}
            </button>
            <button
              type="button"
              data-testid="spa-next"
              onClick={() => void ctl()?.next()}
              style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid currentColor", fontSize: 16 }}
            >
              Следующий
            </button>
            <span data-testid="spa-now">{status === "loading" ? "Загрузка…" : current ? current.title : ""}</span>
          </div>
          {message ? <p role="alert">{message}</p> : null}
          <ol data-testid="spa-tracks" style={{ paddingLeft: 20 }}>
            {items.map((i, idx) => (
              <li key={i.audioItemId} style={{ padding: "6px 0" }}>
                <button
                  type="button"
                  onClick={() => void ctl()?.playIndex(idx)}
                  style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", fontSize: 16, fontWeight: current?.audioItemId === i.audioItemId ? 600 : 400 }}
                >
                  {i.title || "Без названия"}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      <audio ref={audioRef} preload="none" playsInline />
    </section>
  );
}
