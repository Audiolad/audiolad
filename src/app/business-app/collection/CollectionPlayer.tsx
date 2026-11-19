"use client";

import { useEffect, useRef, useState } from "react";
import BusinessAtmosphereTrackButton from "@/components/business-app/BusinessAtmosphereTrackButton";
import BusinessCabinetMiniBar from "@/components/business-app/workspace/BusinessCabinetMiniBar";
import { SpaOnlinePlayer, type OnlineStatus } from "@/lib/business-app/spa-online-player";
import { FadingAudio } from "@/lib/business-app/player-fade";
import { formatPlaybackClock } from "@/lib/business-app/playback-clock";
import { workspaceItems } from "@/lib/business-workspace/model";
import { COLLECTION_API, collectionTrackPath, type PersonalCollection } from "@/lib/business-collections/model";

/** Same sequential engine and controls as the coffee cabinet. No venue reporting or trial side effects. */
export default function CollectionPlayer({ collection }: { collection: PersonalCollection }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const controller = useRef<SpaOnlinePlayer | null>(null);
  const fader = useRef<FadingAudio | null>(null);
  const [view, setView] = useState<{ index: number; status: OnlineStatus; message: string | null }>({ index: -1, status: "idle", message: null });
  const [clock, setClock] = useState({ now: 0, duration: 0 });
  const [denied, setDenied] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let disposed = false;
    let blocked = false;
    const fade = new FadingAudio(audio);
    fader.current = fade;
    const ctl = new SpaOnlinePlayer({
      audio: fade,
      now: () => Date.now(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (timer) => window.clearTimeout(timer as number),
      sign: async (trackId) => blocked
        ? { ok: false, reason: "no_access" }
        : { ok: true, data: { url: collectionTrackPath("audio", collection.id, trackId) } },
      onChange: () => {
        if (!disposed) setView({ index: ctl.index, status: ctl.status, message: ctl.message });
      },
    }, workspaceItems(collection.tracks, null));
    controller.current = ctl;
    const sample = () => {
      if (ctl.fadingOutPrevious) return;
      setClock({ now: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
      ctl.onProgress(audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const ended = () => { void ctl.onEnded(); };
    const error = () => { void ctl.onError(); };
    const other = (event: Event) => { if (event.target !== audio && (ctl.status === "playing" || ctl.status === "loading")) void ctl.toggle(); };
    const abort = new AbortController();
    const check = async () => {
      if (blocked || disposed) return;
      const timeout = window.setTimeout(() => abort.abort(), 10_000);
      try {
        const response = await fetch(`${COLLECTION_API}/state`, { cache: "no-store", credentials: "same-origin", signal: abort.signal });
        const state = await response.json();
        if (disposed) return;
        const ids: unknown = state.tracks;
        if (!response.ok || state.ok !== true || state.id !== collection.id || !Array.isArray(ids) ||
            collection.tracks.some((track) => !ids.includes(track.audioItemId))) {
          blocked = true;
          setDenied(true);
          ctl.dispose();
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
      } catch {
        // Fail closed on a lost permission check; refresh is explicit after recovery.
        if (!disposed) {
          blocked = true;
          setDenied(true);
          ctl.dispose();
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
      } finally { window.clearTimeout(timeout); }
    };
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    const timer = window.setInterval(() => void check(), 15_000);
    audio.addEventListener("timeupdate", sample);
    audio.addEventListener("ended", ended);
    audio.addEventListener("error", error);
    document.addEventListener("play", other, true);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      abort.abort();
      window.clearInterval(timer);
      audio.removeEventListener("timeupdate", sample);
      audio.removeEventListener("ended", ended);
      audio.removeEventListener("error", error);
      document.removeEventListener("play", other, true);
      document.removeEventListener("visibilitychange", visible);
      ctl.dispose();
      fade.dispose();
      controller.current = null;
      fader.current = null;
    };
  }, [collection]);

  const current = collection.tracks[view.index];
  const albums = [...new Map(collection.tracks.map((track) => [track.albumId, track])).values()];
  const duration = clock.duration || current?.durationSeconds || 0;
  return <div className="space-y-4" data-testid="personal-collection-player">
    {denied ? <p role="alert">Доступ к подборке изменился или соединение потеряно. Обновите страницу.</p> : null}
    <p>{albums.length} альбомов · {collection.tracks.length} треков</p>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      {albums.map((album) => <figure key={album.albumId}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={album.coverUrl} alt={album.albumTitle} width={180} height={180} className="aspect-square rounded-xl object-cover" loading="lazy" />
        <figcaption>{album.albumTitle}</figcaption>
      </figure>)}
    </div>
    <ol className="business-atmosphere-tracks">
      {collection.tracks.map((track, index) => <li key={track.audioItemId}>
        <BusinessAtmosphereTrackButton title={track.title} subtitle={track.albumTitle} number={index + 1}
          coverUrl={track.coverUrl} current={view.index === index} playing={view.index === index && view.status === "playing"}
          disabled={denied} time={formatPlaybackClock(track.durationSeconds ?? 0)}
          onClick={() => { void controller.current?.playIndex(index); }} />
      </li>)}
    </ol>
    {!collection.tracks.length ? <p>Сейчас нет доступных записей. Обратитесь к администратору подборки.</p> : null}
    {!denied && collection.tracks.length ? <BusinessCabinetMiniBar
      title={current?.title ?? "Слушать подборку"} coverSrc={current?.coverUrl ?? null}
      playing={view.status === "playing"} loading={view.status === "loading"}
      onToggle={() => { void controller.current?.toggle(); }} onNext={() => { void controller.current?.next(); }}
      onClose={() => { const ctl = controller.current; if (ctl && (ctl.status === "playing" || ctl.status === "loading")) void ctl.toggle(); }}
      onSeek={(ratio) => { if (audioRef.current && duration > 0) audioRef.current.currentTime = ratio * duration; }}
      currentTime={clock.now} duration={duration} timeLabel={`${formatPlaybackClock(clock.now)} / ${formatPlaybackClock(duration)}`}
      volume={volume} onVolume={(value) => { setVolume(value); fader.current?.setVolume(value); }} message={view.message}
      testId="collection-player" progressTestId="collection-progress" openTestId="collection-open"
      closeTestId="collection-close" controlsPrefix="collection" ariaLabel="Плеер АудиоЛад Кофейня" /> : null}
    <audio ref={audioRef} preload="none" playsInline data-testid="collection-audio" />
  </div>;
}
