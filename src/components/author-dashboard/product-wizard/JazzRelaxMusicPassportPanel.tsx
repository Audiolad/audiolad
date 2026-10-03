"use client";

import { useEffect, useState } from "react";

import { AlbumMusicPassport } from "@/components/music-passport/AlbumMusicPassport";
import { MusicPassport } from "@/components/music-passport/MusicPassport";
import type { JazzRelaxPassportView } from "@/lib/music-passport/jazz-relax-status";

type PassportCommand = {
  nonce: number;
  action: "start" | "retry" | "reanalyze";
  audioItemId?: string;
};

type JazzRelaxMusicPassportPanelProps = {
  practiceId: string;
  command: PassportCommand | null;
  onStatus: (status: JazzRelaxPassportView) => void;
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
    && "progressLabel" in payload;
}

export function JazzRelaxPassportBody({
  status,
  pending,
  onRetry,
  onReanalyzeTrack,
  onReanalyzeAll,
}: {
  status: JazzRelaxPassportView;
  pending: boolean;
  onRetry: (audioItemId: string) => void;
  onReanalyzeTrack: (audioItemId: string) => void;
  onReanalyzeAll: () => void;
}) {
  const album = status.phase === "completed" || status.phase === "partial" ? status.album : null;
  const showTracks = status.phase === "completed" || status.phase === "partial" || status.phase === "failed";
  return (
    <div className="space-y-3 rounded-[22px] border border-[#eadff8] bg-[#fcf8ff] p-4">
      <p className="font-semibold text-[#2b2140]">{status.progressLabel}</p>
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
  onStatus,
}: JazzRelaxMusicPassportPanelProps) {
  const [status, setStatus] = useState<JazzRelaxPassportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [seenCommandNonce, setSeenCommandNonce] = useState<number | null>(null);
  if (command && command.nonce !== seenCommandNonce) {
    setSeenCommandNonce(command.nonce);
    setPending(true);
    setError(null);
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
      setStatus(payload);
      onStatus(payload);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [practiceId, onStatus]);

  useEffect(() => {
    if (!command) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/author/products/${practiceId}/music-passport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: command.action,
          ...(command.audioItemId ? { audioItemId: command.audioItemId } : {}),
        }),
      });
      const payload = await response.json().catch(() => null) as unknown;
      if (cancelled) return;
      setPending(false);
      if (!response.ok || !isPassportView(payload)) {
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Не удалось создать музыкальный паспорт.";
        setError(message);
        return;
      }
      setStatus(payload);
      onStatus(payload);
    })();
    return () => {
      cancelled = true;
    };
  }, [command, practiceId, onStatus]);

  useEffect(() => {
    if (!status || status.phase !== "running") return;
    const timer = window.setInterval(() => {
      void fetch(`/api/author/products/${practiceId}/music-passport`)
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as unknown;
          if (!response.ok || !isPassportView(payload)) return;
          setStatus(payload);
          onStatus(payload);
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [status, practiceId, onStatus]);

  async function postAction(action: "retry" | "reanalyze", audioItemId?: string) {
    const response = await fetch(`/api/author/products/${practiceId}/music-passport`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ...(audioItemId ? { audioItemId } : {}),
      }),
    });
    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok || !isPassportView(payload)) {
      const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : action === "retry"
          ? "Не удалось повторить анализ."
          : "Не удалось запустить анализ.";
      setError(message);
      return;
    }
    setError(null);
    setStatus(payload);
    onStatus(payload);
  }

  if (!status && !error) return null;

  return (
    <div className="space-y-3">
      {status ? (
        <JazzRelaxPassportBody
          status={status}
          pending={pending}
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
