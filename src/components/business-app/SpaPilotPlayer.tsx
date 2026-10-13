"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { getSpaTrackUrl, refreshSpaManifest, syncSpaPlaybackLog } from "@/app/business-app/spa/actions";
import { canStartTrack, offlineCacheDeadline, parseSpaManifest, type SpaManifest, type SpaManifestItem } from "@/lib/business-app/spa-manifest";
import {
  ackLog,
  enqueueLog,
  formatOfflineLabel,
  nextIndex,
  offlineUntil,
  parseLogQueue,
  parseResume,
  resolveResume,
  type SpaLogEvent,
} from "@/lib/business-app/spa-player-core";

type Props = { programId: string; programName: string; initialManifest: unknown; playerId: string | null; zoneId: string | null };

const CACHE_NAME = "business-spa-audio-v1";
const cacheKey = (id: string) => `/__business-spa-audio/${id}`;
const MANIFEST_REFRESH_MS = 5 * 60 * 1000;
const LOG_FLUSH_MS = 60 * 1000;
const RESUME_SAVE_MS = 5 * 1000;

function safeParse(raw: unknown): SpaManifest | null {
  try {
    return raw ? parseSpaManifest(raw) : null;
  } catch {
    return null;
  }
}

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function uuid(): string {
  return crypto.randomUUID();
}

function gainToVolume(gainDb: number | null): number {
  if (gainDb === null) return 1;
  return Math.max(0, Math.min(1, Math.pow(10, gainDb / 20)));
}

type Segment = { audioItemId: string; startedAt: Date; playedMs: number; offline: boolean };

export default function SpaPilotPlayer({ programId, programName, initialManifest, canLog }: Props) {
  const resumeKey = `business-spa-resume:${programId}`;
  const logKey = `business-spa-log:${programId}`;
  const orderKey = `business-spa-order:${programId}`;

  const [manifest, setManifest] = useState<SpaManifest | null>(() => safeParse(initialManifest));
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(true);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [cachedAt, setCachedAt] = useState<Map<string, Date>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const refA = useRef<HTMLAudioElement | null>(null);
  const refB = useRef<HTMLAudioElement | null>(null);
  const audioRefs = useMemo(() => [refA, refB], []);
  const active = useRef(0);
  const preparedNext = useRef<{ slot: number; audioItemId: string } | null>(null);
  const objectUrls = useRef<Map<HTMLAudioElement, string>>(new Map());
  const segment = useRef<Segment | null>(null);
  const lastTime = useRef<number>(0);
  const manifestRef = useRef<SpaManifest | null>(manifest);
  const indexRef = useRef(index);
  const cachedAtRef = useRef(cachedAt);
  useEffect(() => {
    manifestRef.current = manifest;
    indexRef.current = index;
    cachedAtRef.current = cachedAt;
  }, [manifest, index, cachedAt]);

  const items = useMemo(() => manifest?.items ?? [], [manifest]);

  // ---------- offline cache (Cache API) ----------
  const readCached = useCallback(async (item: SpaManifestItem): Promise<Blob | null> => {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(cacheKey(item.audioItemId));
    if (!res) return null;
    const at = new Date(Number(res.headers.get("x-spa-cached-at")) || 0);
    const deadline = offlineCacheDeadline(item, at);
    if (!deadline || Date.now() >= deadline.getTime()) {
      await cache.delete(cacheKey(item.audioItemId));
      return null;
    }
    return res.blob();
  }, []);

  const scanCache = useCallback(async (m: SpaManifest) => {
    if (typeof caches === "undefined") return;
    const cache = await caches.open(CACHE_NAME);
    const allowed = new Set(m.items.map((i) => i.audioItemId));
    // Drop anything no longer in the program (removed in admin / rights lost).
    for (const req of await cache.keys()) {
      const id = new URL(req.url).pathname.split("/").pop() ?? "";
      if (!allowed.has(id)) await cache.delete(req);
    }
    const map = new Map<string, Date>();
    for (const item of m.items) {
      const res = await cache.match(cacheKey(item.audioItemId));
      if (!res) continue;
      const at = new Date(Number(res.headers.get("x-spa-cached-at")) || 0);
      const deadline = offlineCacheDeadline(item, at);
      if (!deadline || Date.now() >= deadline.getTime()) {
        await cache.delete(cacheKey(item.audioItemId));
        continue;
      }
      map.set(item.audioItemId, at);
    }
    setCachedAt(map);
  }, []);

  const downloadAll = useCallback(async (m: SpaManifest) => {
    if (typeof caches === "undefined" || !navigator.onLine) return;
    const cache = await caches.open(CACHE_NAME);
    for (const item of m.items) {
      if (!item.offlineAllowed || cachedAtRef.current.has(item.audioItemId)) continue;
      const signed = await getSpaTrackUrl(item.audioItemId);
      if (!signed.ok) continue;
      try {
        const res = await fetch(signed.data);
        if (!res.ok) continue;
        const blob = await res.blob();
        const now = Date.now();
        await cache.put(
          cacheKey(item.audioItemId),
          new Response(blob, { headers: { "content-type": blob.type || "audio/mpeg", "x-spa-cached-at": String(now) } }),
        );
        setCachedAt((prev) => new Map(prev).set(item.audioItemId, new Date(now)));
      } catch {
        // network dropped mid-download: try again on the next refresh
      }
    }
  }, []);

  // ---------- play log ----------
  const pushLog = useCallback(
    (ev: SpaLogEvent) => {
      const q = enqueueLog(parseLogQueue(localStorage.getItem(logKey)), ev);
      localStorage.setItem(logKey, JSON.stringify(q));
    },
    [logKey],
  );

  const closeSegment = useCallback(
    (kind: "complete" | "skip" | "error") => {
      const s = segment.current;
      segment.current = null;
      if (!s || !canLog || s.playedMs < 1000) return;
      pushLog({
        client_event_id: uuid(),
        audio_item_id: s.audioItemId,
        event: kind,
        started_at: s.startedAt.toISOString(),
        ended_at: new Date(Math.max(Date.now(), s.startedAt.getTime())).toISOString(),
        played_ms: Math.round(s.playedMs),
        offline: s.offline,
      });
    },
    [canLog, pushLog],
  );

  const flushLog = useCallback(async () => {
    if (!canLog || !navigator.onLine) return;
    const q = parseLogQueue(localStorage.getItem(logKey));
    if (q.length === 0) return;
    const batch = q.slice(0, 500);
    const res = await syncSpaPlaybackLog(batch);
    if (res.ok) {
      const rest = ackLog(parseLogQueue(localStorage.getItem(logKey)), res.data);
      localStorage.setItem(logKey, JSON.stringify(rest));
    }
  }, [canLog, logKey]);

  // ---------- sources & gapless switching ----------
  const srcFor = useCallback(
    async (item: SpaManifestItem): Promise<string | null> => {
      const blob = await readCached(item);
      if (blob) return URL.createObjectURL(blob);
      if (!navigator.onLine) return null;
      const signed = await getSpaTrackUrl(item.audioItemId);
      return signed.ok ? signed.data : null;
    },
    [readCached],
  );

  const loadInto = useCallback(
    async (el: HTMLAudioElement, item: SpaManifestItem, positionSec = 0): Promise<boolean> => {
      const src = await srcFor(item);
      if (!src) return false;
      const old = objectUrls.current.get(el);
      if (old) URL.revokeObjectURL(old);
      if (src.startsWith("blob:")) objectUrls.current.set(el, src);
      else objectUrls.current.delete(el);
      el.preload = "auto";
      el.src = src;
      el.volume = gainToVolume(item.gainDb);
      if (positionSec > 0) {
        await new Promise<void>((resolve) => {
          const seek = () => {
            try {
              el.currentTime = positionSec;
            } catch {
              /* not seekable yet */
            }
            resolve();
          };
          if (el.readyState >= 1) seek();
          else el.addEventListener("loadedmetadata", seek, { once: true });
          window.setTimeout(resolve, 15000);
        });
      }
      return true;
    },
    [srcFor],
  );

  /** First playable index starting at `from` (wraps once). */
  const findPlayable = useCallback((from: number): number => {
    const m = manifestRef.current;
    if (!m || m.items.length === 0) return -1;
    const n = m.items.length;
    for (let k = 0; k < n; k++) {
      const i = (from + k) % n;
      const it = m.items[i];
      if (canStartTrack(it, new Date(), cachedAtRef.current.get(it.audioItemId) ?? null, navigator.onLine)) return i;
    }
    return -1;
  }, []);

  const prepareNext = useCallback(
    async (fromIndex: number) => {
      const m = manifestRef.current;
      if (!m) return;
      const ni = findPlayable(nextIndex(m.items.length, fromIndex));
      if (ni < 0) return;
      const slot = 1 - active.current;
      const el = audioRefs[slot].current;
      if (!el) return;
      if (await loadInto(el, m.items[ni])) preparedNext.current = { slot, audioItemId: m.items[ni].audioItemId };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findPlayable, loadInto],
  );

  const startAt = useCallback(
    async (i: number, positionSec = 0) => {
      const m = manifestRef.current;
      if (!m) return;
      const pi = findPlayable(i);
      if (pi < 0) {
        setPlaying(false);
        setError(navigator.onLine ? "Нет доступных треков." : "Нет сохранённых треков для офлайна.");
        return;
      }
      const el = audioRefs[active.current].current;
      if (!el) return;
      if (!(await loadInto(el, m.items[pi], positionSec))) {
        setError("Не удалось загрузить трек.");
        return;
      }
      try {
        await el.play();
        setNeedsGesture(false);
        setPlaying(true);
        setError(null);
        setIndex(pi);
        segment.current = { audioItemId: m.items[pi].audioItemId, startedAt: new Date(), playedMs: 0, offline: !navigator.onLine };
        lastTime.current = el.currentTime;
        void prepareNext(pi);
      } catch {
        setNeedsGesture(true);
        setIndex(pi);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findPlayable, loadInto, prepareNext],
  );

  const onEnded = useCallback(async () => {
    const m = manifestRef.current;
    if (!m) return;
    closeSegment("complete");
    const prep = preparedNext.current;
    preparedNext.current = null;
    if (prep && prep.slot === 1 - active.current) {
      // Gapless: the next track is already buffered in the other element.
      const el = audioRefs[prep.slot].current;
      const ni = m.items.findIndex((it) => it.audioItemId === prep.audioItemId);
      if (el && ni >= 0) {
        active.current = prep.slot;
        try {
          await el.play();
          setIndex(ni);
          segment.current = { audioItemId: prep.audioItemId, startedAt: new Date(), playedMs: 0, offline: !navigator.onLine };
          lastTime.current = el.currentTime;
          void prepareNext(ni);
          return;
        } catch {
          /* fall through */
        }
      }
    }
    await startAt(nextIndex(m.items.length, indexRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSegment, prepareNext, startAt]);

  // timeupdate: accumulate played time + persist resume point
  useEffect(() => {
    const els = audioRefs.map((r) => r.current).filter(Boolean) as HTMLAudioElement[];
    const onTime = (e: Event) => {
      const el = e.target as HTMLAudioElement;
      if (el !== audioRefs[active.current].current || !segment.current) return;
      const d = el.currentTime - lastTime.current;
      if (d > 0 && d < 5) segment.current.playedMs += d * 1000;
      lastTime.current = el.currentTime;
      if (!navigator.onLine) segment.current.offline = true;
    };
    const onEnd = (e: Event) => {
      if (e.target === audioRefs[active.current].current) void onEnded();
    };
    els.forEach((el) => {
      el.addEventListener("timeupdate", onTime);
      el.addEventListener("ended", onEnd);
    });
    return () =>
      els.forEach((el) => {
        el.removeEventListener("timeupdate", onTime);
        el.removeEventListener("ended", onEnd);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEnded]);

  useEffect(() => {
    const save = () => {
      const el = audioRefs[active.current].current;
      const s = segment.current;
      if (!el || !s) return;
      localStorage.setItem(resumeKey, JSON.stringify({ audioItemId: s.audioItemId, positionSec: el.currentTime, savedAt: Date.now() }));
    };
    const t = window.setInterval(save, RESUME_SAVE_MS);
    const onHide = () => {
      save();
      closeSegment("skip");
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("pagehide", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeKey, closeSegment]);

  // manifest refresh (removed tracks drop out, renamed titles update) + log flush
  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    const res = await refreshSpaManifest();
    if (!res.ok) return;
    const next = safeParse(res.data);
    if (!next) return;
    const prev = manifestRef.current;
    setManifest(next);
    manifestRef.current = next;
    localStorage.setItem(orderKey, JSON.stringify(next.items.map((i) => i.audioItemId)));
    await scanCache(next);
    const currentId = segment.current?.audioItemId;
    if (currentId && !next.items.some((i) => i.audioItemId === currentId)) {
      // Current track was removed from Business: stop it and move on.
      closeSegment("skip");
      const r = resolveResume(next.items, { audioItemId: currentId, positionSec: 0, savedAt: Date.now() }, prev?.items.map((i) => i.audioItemId) ?? []);
      preparedNext.current = null;
      await startAt(r.index);
    } else if (prev && prev.contentHash !== next.contentHash && segment.current) {
      preparedNext.current = null;
      const ci = next.items.findIndex((i) => i.audioItemId === segment.current?.audioItemId);
      if (ci >= 0) {
        setIndex(ci);
        void prepareNext(ci);
      }
    }
    void downloadAll(next);
  }, [closeSegment, downloadAll, orderKey, prepareNext, scanCache, startAt]);

  useEffect(() => {
    const m = manifestRef.current;
    if (m) {
      void scanCache(m).then(() => downloadAll(m));
      const r = resolveResume(m.items, parseResume(localStorage.getItem(resumeKey)), JSON.parse(localStorage.getItem(orderKey) ?? "[]"));
      setIndex(r.index);
      localStorage.setItem(orderKey, JSON.stringify(m.items.map((i) => i.audioItemId)));
      // Try to continue right away; browsers may require a tap (needsGesture).
      if (r.index >= 0) void startAt(r.index, r.positionSec);
    }
    const goOnline = () => {
      // Close the offline segment so its minutes are uploaded now.
      const s = segment.current;
      if (s?.offline) {
        closeSegment("skip");
        const el = audioRefs[active.current].current;
        if (el && !el.paused) {
          segment.current = { audioItemId: s.audioItemId, startedAt: new Date(), playedMs: 0, offline: false };
          lastTime.current = el.currentTime;
        }
      }
      void flushLog();
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", goOnline);
    document.addEventListener("visibilitychange", onVisible);
    const r1 = window.setInterval(() => void refresh(), MANIFEST_REFRESH_MS);
    const r2 = window.setInterval(() => void flushLog(), LOG_FLUSH_MS);
    void flushLog();
    return () => {
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(r1);
      window.clearInterval(r2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async () => {
    const el = audioRefs[active.current].current;
    if (!el) return;
    if (playing) {
      el.pause();
      closeSegment("skip");
      setPlaying(false);
      return;
    }
    if (el.src && segment.current === null && index >= 0 && !needsGesture) {
      await el.play();
      setPlaying(true);
      segment.current = { audioItemId: items[index].audioItemId, startedAt: new Date(), playedMs: 0, offline: !navigator.onLine };
      lastTime.current = el.currentTime;
      return;
    }
    const r = resolveResume(items, parseResume(localStorage.getItem(resumeKey)));
    await startAt(r.index >= 0 ? r.index : 0, r.positionSec);
  };

  const until = manifest ? offlineUntil(manifest, cachedAt) : null;
  const cachedCount = items.filter((i) => cachedAt.has(i.audioItemId)).length;
  const current = index >= 0 ? items[index] : null;

  return (
    <section className="spa-pilot" data-testid="spa-pilot" style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600 }}>{programName}</h1>
      <p style={{ fontSize: 13, opacity: 0.7 }}>Пилот: страница видна только участникам пилота.</p>
      <p data-testid="spa-network" style={{ margin: "12px 0", fontWeight: online ? 400 : 600 }}>
        {online ? "Онлайн" : formatOfflineLabel(until)}
        {online && until ? ` · сохранено ${cachedCount}/${items.length}, ${formatOfflineLabel(until)}` : null}
      </p>
      {items.length === 0 ? (
        <p data-testid="spa-empty">В программе пока нет треков, разрешённых для Business.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "12px 0" }}>
            <button type="button" data-testid="spa-play" onClick={() => void toggle()} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid currentColor" }}>
              {playing ? "Пауза" : needsGesture && index >= 0 ? "Продолжить" : "Играть"}
            </button>
            <span data-testid="spa-now">{current ? current.title : ""}</span>
          </div>
          {error ? <p role="alert">{error}</p> : null}
          <ol data-testid="spa-tracks">
            {items.map((i, n) => (
              <li key={i.audioItemId} style={{ fontWeight: n === index ? 600 : 400 }}>
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
