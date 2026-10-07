"use client";

import { useEffect, useState } from "react";

import { AlbumMusicPassport } from "@/components/music-passport/AlbumMusicPassport";
import { MusicPassport } from "@/components/music-passport/MusicPassport";
import {
  describeJazzRelaxPassportActivity,
  JAZZ_RELAX_PASSPORT_ENQUEUE_MAX_REQUESTS,
  jazzRelaxPassportEnqueueShouldContinue,
  type JazzRelaxPassportActivity,
  type JazzRelaxPassportView,
} from "@/lib/music-passport/jazz-relax-status";

type PassportCommand = {
  nonce: number;
  action: "start" | "retry" | "reanalyze";
  audioItemId?: string;
};

type JazzRelaxMusicPassportPanelProps = {
  practiceId: string;
  command: PassportCommand | null;
  saving?: boolean;
  onStatus: (status: JazzRelaxPassportView) => void;
  onEnqueueActive?: (active: boolean) => void;
  onPollFailed?: (failed: boolean) => void;
};

const EMPTY_PROVENANCE = {
  sha256: null,
  analyzerGitCommit: null,
  analyzerContentCommit: null,
  modelCheckpoint: null,
  device: null,
  taxonomy: null,
  prompt: null,
};

function isPassportView(payload: unknown): payload is JazzRelaxPassportView {
  return typeof payload === "object"
    && payload !== null
    && "progressLabel" in payload
    && "enqueueDeferred" in payload
    && typeof payload.enqueueDeferred === "boolean";
}

async function runJazzRelaxPassportRequests(input: {
  practiceId: string;
  action: "start" | "retry" | "reanalyze";
  audioItemId?: string;
  isCancelled?: () => boolean;
  onView: (view: JazzRelaxPassportView) => void;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  let cursor: string | null = null;
  let latest: JazzRelaxPassportView | null = null;
  const failure = input.action === "retry"
    ? "Не удалось повторить анализ."
    : input.action === "reanalyze"
      ? "Не удалось запустить анализ."
      : "Не удалось создать музыкальный паспорт.";
  for (let attempt = 0; attempt < JAZZ_RELAX_PASSPORT_ENQUEUE_MAX_REQUESTS; attempt += 1) {
    if (input.isCancelled?.()) return { ok: true };
    let response: Response;
    try {
      response = await fetch(`/api/author/products/${input.practiceId}/music-passport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: input.action,
          ...(input.audioItemId ? { audioItemId: input.audioItemId } : {}),
          ...(cursor ? { enqueueAfterAudioItemId: cursor } : {}),
        }),
      });
    } catch {
      return {
        ok: false,
        message: "Связь прервалась. Уже поставленные треки сохранены. Нажмите кнопку ещё раз, чтобы продолжить.",
      };
    }
    const payload = await response.json().catch(() => null) as unknown;
    if (input.isCancelled?.()) return { ok: true };
    if (!response.ok || !isPassportView(payload)) {
      const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : failure;
      return { ok: false, message };
    }
    latest = payload;
    input.onView(payload);
    if (!jazzRelaxPassportEnqueueShouldContinue({
      singleTrack: Boolean(input.audioItemId),
      enqueueDeferred: payload.enqueueDeferred,
    })) {
      return { ok: true };
    }
    if (!payload.enqueueCursor || payload.enqueueCursor === cursor) {
      return { ok: false, message: "Не все треки поставлены в очередь. Нажмите кнопку ещё раз." };
    }
    cursor = payload.enqueueCursor;
  }
  if (latest?.enqueueDeferred) {
    return { ok: false, message: "Не все треки поставлены в очередь. Нажмите кнопку ещё раз." };
  }
  return { ok: true };
}

export function JazzRelaxPassportActivityNotice({
  activity,
  live = false,
}: {
  activity: JazzRelaxPassportActivity;
  /** One live region announces the stage. The duplicate near the other surface stays silent. */
  live?: boolean;
}) {
  if (!activity.headline || activity.kind === "completed") return null;
  return (
    <div
      className="rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3"
      data-passport-activity={activity.kind}
      aria-live={live ? "polite" : "off"}
      aria-atomic="true"
      aria-busy={activity.ariaBusy ? "true" : "false"}
      role={live ? "status" : undefined}
    >
      <p className="text-sm font-semibold text-[#25135c]">{activity.headline}</p>
      {activity.statusNotice ? (
        <p className="mt-1 text-sm text-[#5f5484]">{activity.statusNotice}</p>
      ) : null}
      {activity.closeHint ? (
        <p className="mt-2 text-sm text-[#3f3560]" data-passport-close="true">
          {activity.closeHint}
        </p>
      ) : null}
      {activity.readyLabel ? (
        <p className="mt-1 text-sm text-[#5f5484]">{activity.readyLabel}</p>
      ) : null}
      {activity.indeterminate ? (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-[#f3e9ff]"
          role="progressbar"
          aria-label={activity.headline}
          aria-valuetext={activity.headline}
        >
          <div className="h-full w-1/3 rounded-full bg-[#7042c5] motion-safe:animate-pulse motion-reduce:animate-none" />
        </div>
      ) : null}
      {activity.progress ? (
        <div className="mt-3">
          <div
            className="flex h-2 overflow-hidden rounded-full bg-[#f3e9ff]"
            role="progressbar"
            aria-label="Доля готовых треков"
            aria-valuemin={0}
            aria-valuemax={activity.progress.total}
            aria-valuenow={activity.progress.ready}
            aria-valuetext={activity.readyLabel ?? undefined}
          >
            <div
              className="h-full rounded-full bg-[#7042c5]"
              style={{ flexGrow: activity.progress.ready, flexBasis: 0 }}
            />
            <div
              className="h-full"
              style={{
                flexGrow: Math.max(0, activity.progress.total - activity.progress.ready),
                flexBasis: 0,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-[#7d70a2]">
            Доля готовых треков: {activity.progress.ready} из {activity.progress.total}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function JazzRelaxPassportBody({
  status,
  pending,
  saving = false,
  pollFailed = false,
  onRetry,
  onReanalyzeTrack,
  onReanalyzeAll,
}: {
  status: JazzRelaxPassportView;
  pending: boolean;
  saving?: boolean;
  pollFailed?: boolean;
  onRetry: (audioItemId: string) => void;
  onReanalyzeTrack: (audioItemId: string) => void;
  onReanalyzeAll: () => void;
}) {
  const activity = describeJazzRelaxPassportActivity({
    saving,
    enqueueing: pending,
    status,
    pollFailed,
  });
  const album = status.phase === "completed" || status.phase === "partial" ? status.album : null;
  const showTracks = status.phase === "completed" || status.phase === "partial" || status.phase === "failed";
  const showNotice = activity.headline.length > 0 && activity.kind !== "completed";
  if (!showNotice && !album && !showTracks && status.readyCount === 0 && status.summary.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3 rounded-[22px] border border-[#eadff8] bg-[#fcf8ff] p-4">
      {showNotice ? <JazzRelaxPassportActivityNotice activity={activity} /> : null}
      {album ? <AlbumMusicPassport album={album} /> : null}
      {!album && status.phase === "completed" && status.summary.length > 0 ? (
        <ul className="space-y-1 text-sm text-[#5c5278]">
          {status.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {showTracks ? (
        <section className="space-y-3" data-track-passports="true">
          <h3 className="text-sm font-semibold text-[#25135c]">Паспорта треков</h3>
          {status.tracks.map((track) => {
            if (track.state === "ready" && track.productPassport) {
              return (
                <details
                  key={track.audioItemId}
                  className="rounded-[22px] border border-[#e4d7f4] bg-white"
                  data-track-passport="product"
                >
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[#25135c]">
                    {track.title}
                  </summary>
                  <div className="border-t border-[#e4d7f4] p-4">
                    <MusicPassport
                      mode="product"
                      passport={track.productPassport.passport}
                      header={{
                        filename: track.productPassport.filename,
                        analyzedAt: track.productPassport.analyzedAt,
                        analyzerVersion: null,
                        statusLabel: "Готово",
                        fileVersion: null,
                      }}
                      snapshot={{ version: null, commit: null }}
                      provenance={EMPTY_PROVENANCE}
                    />
                  </div>
                </details>
              );
            }
            if (track.state !== "failed") return null;
            return (
              <div
                key={track.audioItemId}
                className="flex flex-wrap items-center gap-3 rounded-[22px] border border-[#e4d7f4] bg-white p-4 text-sm text-[#5c5278]"
                data-track-passport="failed"
              >
                <span>Не удалось проанализировать: {track.title}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onRetry(track.audioItemId)}
                  className="rounded-full border border-[#d9c9ef] px-3 py-1 font-semibold text-[#7042c5] disabled:opacity-60"
                >
                  Повторить анализ
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onReanalyzeTrack(track.audioItemId)}
                  className="rounded-full border border-[#d9c9ef] px-3 py-1 font-semibold text-[#5f5484] disabled:opacity-60"
                >
                  Проанализировать заново текущей версией
                </button>
              </div>
            );
          })}
        </section>
      ) : null}
      {status.readyCount > 0 ? (
        <button
          type="button"
          disabled={pending || status.phase === "running"}
          onClick={onReanalyzeAll}
          className="rounded-full border border-[#d9c9ef] px-4 py-2 text-sm font-semibold text-[#5f5484] disabled:opacity-60"
        >
          Проанализировать заново текущей версией
        </button>
      ) : null}
    </div>
  );
}

export default function JazzRelaxMusicPassportPanel({
  practiceId,
  command,
  saving = false,
  onStatus,
  onEnqueueActive,
  onPollFailed,
}: JazzRelaxMusicPassportPanelProps) {
  const [status, setStatus] = useState<JazzRelaxPassportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [seenCommandNonce, setSeenCommandNonce] = useState<number | null>(null);
  if (command && command.nonce !== seenCommandNonce) {
    setSeenCommandNonce(command.nonce);
    setPending(true);
    setError(null);
    setPollFailed(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/author/products/${practiceId}/music-passport`);
      const payload = await response.json().catch(() => null) as unknown;
      if (cancelled) return;
      if (!response.ok || !isPassportView(payload)) {
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Не удалось прочитать музыкальный паспорт.";
        setError(message);
        return;
      }
      setError(null);
      setPollFailed(false);
      onPollFailed?.(false);
      setStatus(payload);
      onStatus(payload);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [practiceId, onStatus, onPollFailed]);

  useEffect(() => {
    if (!command) return;
    let cancelled = false;
    onEnqueueActive?.(true);
    void (async () => {
      const result = await runJazzRelaxPassportRequests({
        practiceId,
        action: command.action,
        audioItemId: command.audioItemId,
        isCancelled: () => cancelled,
        onView: (view) => {
          setError(null);
          setPollFailed(false);
          onPollFailed?.(false);
          setStatus(view);
          onStatus(view);
        },
      });
      if (cancelled) return;
      if (!result.ok) setError(result.message);
      setPending(false);
      onEnqueueActive?.(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [command, practiceId, onStatus, onEnqueueActive, onPollFailed]);

  useEffect(() => {
    const watch = Boolean(status && (
      status.phase === "running"
      || status.albumLaunch === "preparing"
      || status.launchInFlight
    ));
    if (!watch || pending) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/author/products/${practiceId}/music-passport`)
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as unknown;
          if (!response.ok || !isPassportView(payload)) {
            setPollFailed(true);
            onPollFailed?.(true);
            return;
          }
          setPollFailed(false);
          onPollFailed?.(false);
          setStatus(payload);
          onStatus(payload);
        })
        .catch(() => {
          setPollFailed(true);
          onPollFailed?.(true);
        });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [status, pending, practiceId, onStatus, onPollFailed]);

  async function postAction(action: "retry" | "reanalyze", audioItemId?: string) {
    const result = await runJazzRelaxPassportRequests({
      practiceId,
      action,
      audioItemId,
      onView: (view) => {
        setError(null);
        setStatus(view);
        onStatus(view);
      },
    });
    if (!result.ok) setError(result.message);
  }

  const savingActivity = describeJazzRelaxPassportActivity({
    saving,
    enqueueing: pending,
    status,
    pollFailed,
  });
  if (!status && !error && !saving && !pending && !pollFailed) return null;

  return (
    <div className="space-y-3">
      {!status && (saving || pending || pollFailed) ? (
        <JazzRelaxPassportActivityNotice activity={savingActivity} />
      ) : null}
      {status ? (
        <JazzRelaxPassportBody
          status={status}
          pending={pending}
          saving={saving}
          pollFailed={pollFailed}
          onRetry={(audioItemId) => {
            void postAction("retry", audioItemId).catch(() => setError("Не удалось повторить анализ."));
          }}
          onReanalyzeTrack={(audioItemId) => {
            void postAction("reanalyze", audioItemId).catch(() => setError("Не удалось запустить анализ."));
          }}
          onReanalyzeAll={() => {
            setPending(true);
            void postAction("reanalyze")
              .catch(() => setError("Не удалось запустить анализ."))
              .finally(() => setPending(false));
          }}
        />
      ) : null}
      {error ? <p className="text-sm text-[#9b3d55]">{error}</p> : null}
    </div>
  );
}
