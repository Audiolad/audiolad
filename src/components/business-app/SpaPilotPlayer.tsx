"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { getSpaTrackUrl, refreshSpaManifest, syncSpaPlaybackLog } from "@/app/business-app/spa/actions";
import { formatOfflineLabel } from "@/lib/business-app/spa-player-core";
import { SpaPlayerEngine, type AudioLike, type EngineDeps, type EngineStatus } from "@/lib/business-app/spa-player-engine";
import type { SpaManifestItem } from "@/lib/business-app/spa-manifest";
import { offlineCacheDeadline } from "@/lib/business-app/spa-manifest";
import { WebAudioTrack } from "@/lib/business-app/spa-webaudio";

type Props = { programId: string; programName: string; initialManifest: unknown; playerId: string | null; zoneId: string | null };

const CACHE_NAME = "business-spa-audio-v1";
const cacheKey = (id: string) => `/__business-spa-audio/${id}`;
const MANIFEST_REFRESH_MS = 5 * 60 * 1000;
const LOG_FLUSH_MS = 60 * 1000;

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function browserCache(): EngineDeps["cache"] {
  const open = () => caches.open(CACHE_NAME);
  return {
    async get(id) {
      if (typeof caches === "undefined") return null;
      const res = await (await open()).match(cacheKey(id));
      if (!res) return null;
      return {
        data: await res.blob(),
        cachedAt: Number(res.headers.get("x-spa-cached-at")) || 0,
        // Copies without a server deadline (older format) are treated as expired.
        until: Number(res.headers.get("x-spa-cache-until")) || 0,
      };
    },
    async put(id, data, cachedAt, until) {
      if (typeof caches === "undefined") return;
      await (await open()).put(
        cacheKey(id),
        new Response(data, { headers: { "content-type": data.type || "audio/mpeg", "x-spa-cached-at": String(cachedAt), "x-spa-cache-until": String(until) } }),
      );
    },
    async delete(id) {
      if (typeof caches !== "undefined") await (await open()).delete(cacheKey(id));
    },
    async keys() {
      if (typeof caches === "undefined") return [];
      return (await (await open()).keys()).map((r) => new URL(r.url).pathname.split("/").pop() ?? "");
    },
    async clear() {
      if (typeof caches !== "undefined") await caches.delete(CACHE_NAME);
    },
    // One exclusive lock per copy across engine instances and tabs (Web Locks API), so a
    // late delete/put of a disposed instance or another tab can't interleave (A20 #3).
    lock<T>(id: string, fn: () => Promise<T>): Promise<T> {
      const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
      return locks ? (locks.request(`business-spa-cache:${id}`, fn) as Promise<T>) : fn();
    },
  };
}

type View = {
  items: SpaManifestItem[];
  status: EngineStatus;
  current: SpaManifestItem | null;
  cachedAt: Map<string, number>;
  cacheUntil: Map<string, number>;
  message: string | null;
};
const EMPTY_VIEW: View = { items: [], status: "idle", current: null, cachedAt: new Map(), cacheUntil: new Map(), message: null };

function snapshot(e: SpaPlayerEngine | null): View {
  if (!e) return EMPTY_VIEW;
  return { items: e.items, status: e.status, current: e.current, cachedAt: new Map(e.cachedAt), cacheUntil: new Map(e.cacheUntil), message: e.message };
}

export default function SpaPilotPlayer({ programId, programName, initialManifest, playerId, zoneId }: Props) {
  const refA = useRef<HTMLAudioElement | null>(null);
  const refB = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<SpaPlayerEngine | null>(null);
  const [view, setView] = useState<View>(EMPTY_VIEW);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  useEffect(() => {
    if (!refA.current || !refB.current) return;
    // Web Audio slots give sample-accurate, latency-proof transitions (checklist item 2);
    // <audio> elements remain the fallback where AudioContext is unavailable.
    const Ctx = typeof window !== "undefined" ? window.AudioContext : undefined;
    const audioCtx = Ctx ? new Ctx() : null;
    const audios: [AudioLike, AudioLike] = audioCtx
      ? [new WebAudioTrack(audioCtx), new WebAudioTrack(audioCtx)]
      : [refA.current as unknown as AudioLike, refB.current as unknown as AudioLike];
    const deps: EngineDeps = {
      audios,
      now: () => Date.now(),
      online: () => navigator.onLine,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (t) => window.clearTimeout(t as number),
      sign: async (id, purpose) => {
        const r = await getSpaTrackUrl(id, purpose);
        return r.ok ? { ok: true, data: { url: r.data.url, offlineCacheUntil: r.data.offlineCacheUntil } } : r;
      },
      fetchManifest: () => refreshSpaManifest(),
      sync: (events) => syncSpaPlaybackLog(events),
      download: async (url) => {
        try {
          const res = await fetch(url);
          return res.ok ? await res.blob() : null;
        } catch {
          return null;
        }
      },
      cache: browserCache(),
      objectUrl: { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) },
      storage: {
        get: (k) => localStorage.getItem(k),
        set: (k, v) => localStorage.setItem(k, v),
        remove: (k) => localStorage.removeItem(k),
      },
      uuid: () => crypto.randomUUID(),
      onChange: () => setView(snapshot(engineRef.current)),
      programId,
      playerId,
      zoneId,
    };
    const engine = new SpaPlayerEngine(deps);
    engineRef.current = engine;
    void engine.init(initialManifest).then(() => {
      void engine.downloadAll();
      void engine.flushLog();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void engine.refresh();
    };
    const onHide = () => {
      engine.saveResume();
      engine.closeSegment("skip");
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    const r1 = window.setInterval(() => void engine.refresh(), MANIFEST_REFRESH_MS);
    const r2 = window.setInterval(() => void engine.flushLog(), LOG_FLUSH_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
      window.clearInterval(r1);
      window.clearInterval(r2);
      engine.dispose();
      audios.forEach((a) => a.pause());
      void audioCtx?.close();
      engineRef.current = null;
    };
  }, [programId, playerId, zoneId, initialManifest]);

  const { items, status, current, cachedAt, cacheUntil, message } = view;
  let until: Date | null = null;
  for (const item of items) {
    const at = cachedAt.get(item.audioItemId);
    const m = at === undefined ? null : offlineCacheDeadline(item, new Date(at));
    const server = cacheUntil.get(item.audioItemId);
    // Label shows the binding deadline: min(manifest window, server deadline of the copy).
    const d = m && server !== undefined ? new Date(Math.min(m.getTime(), server)) : null;
    if (d && (!until || d < until)) until = d;
  }
  const cachedCount = items.filter((i) => cachedAt.has(i.audioItemId)).length;

  return (
    <section className="spa-pilot" data-testid="spa-pilot" style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>{programName}</h1>
      <p style={{ fontSize: 13, opacity: 0.7 }}>Пилот: страница видна только участникам пилота.</p>
      <p data-testid="spa-network" style={{ margin: "12px 0", fontWeight: online ? 400 : 600 }}>
        {online ? "Онлайн" : formatOfflineLabel(until)}
        {online && until ? ` · сохранено ${cachedCount}/${items.length}, ${formatOfflineLabel(until)}` : null}
      </p>
      {status === "no_access" ? (
        <p data-testid="spa-no-access">Доступ к пилоту закрыт.</p>
      ) : items.length === 0 ? (
        <p data-testid="spa-empty">В программе пока нет треков, разрешённых для Business.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "12px 0" }}>
            <button
              type="button"
              data-testid="spa-play"
              onClick={() => void engineRef.current?.toggle()}
              style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid currentColor" }}
            >
              {status === "playing" ? "Пауза" : status === "needs_gesture" ? "Продолжить" : "Играть"}
            </button>
            <span data-testid="spa-now">{current ? current.title : ""}</span>
          </div>
          {message ? <p role="alert">{message}</p> : null}
          <ol data-testid="spa-tracks">
            {items.map((i) => (
              <li key={i.audioItemId} style={{ fontWeight: current?.audioItemId === i.audioItemId ? 600 : 400 }}>
                {i.title} {cachedAt.has(i.audioItemId) ? "· сохранён" : ""}
              </li>
            ))}
          </ol>
        </>
      )}
      <audio ref={refA} preload="auto" />
      <audio ref={refB} preload="auto" />
    </section>
  );
}
