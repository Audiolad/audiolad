"use client";

import { useEffect, useState } from "react";

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
      const payload = await response.json().catch(() => null) as JazzRelaxPassportView | { error?: string } | null;
      if (cancelled) return;
      if (!response.ok || !payload || !("progressLabel" in payload)) {
        setError(payload && "error" in payload && payload.error ? payload.error : "Не удалось прочитать музыкальный паспорт.");
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
      const payload = await response.json().catch(() => null) as JazzRelaxPassportView | { error?: string } | null;
      if (cancelled) return;
      setPending(false);
      if (!response.ok || !payload || !("progressLabel" in payload)) {
        setError(payload && "error" in payload && payload.error ? payload.error : "Не удалось создать музыкальный паспорт.");
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
          const payload = await response.json().catch(() => null) as JazzRelaxPassportView | null;
          if (!response.ok || !payload || !("progressLabel" in payload)) return;
          setStatus(payload);
          onStatus(payload);
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [status, practiceId, onStatus]);

  if (!status && !error) return null;

  const failed = status?.tracks.filter((track) => track.state === "failed") ?? [];

  return (
    <div className="space-y-3 rounded-[22px] border border-[#eadff8] bg-[#fcf8ff] p-4">
      {status ? (
        <p className="font-semibold text-[#2b2140]">{status.progressLabel}</p>
      ) : null}
      {status && status.phase === "completed" && status.summary.length > 0 ? (
        <ul className="space-y-1 text-sm text-[#5c5278]">
          {status.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {failed.map((track) => (
        <div key={track.audioItemId} className="flex flex-wrap items-center gap-3 text-sm text-[#5c5278]">
          <span>Не удалось проанализировать: {track.title}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              void fetch(`/api/author/products/${practiceId}/music-passport`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "retry", audioItemId: track.audioItemId }),
              }).then(async (response) => {
                const payload = await response.json().catch(() => null) as JazzRelaxPassportView | { error?: string } | null;
                if (!response.ok || !payload || !("progressLabel" in payload)) {
                  setError(payload && "error" in payload && payload.error ? payload.error : "Не удалось повторить анализ.");
                  return;
                }
                setError(null);
                setStatus(payload);
                onStatus(payload);
              }).catch(() => setError("Не удалось повторить анализ."));
            }}
            className="rounded-full border border-[#d9c9ef] px-3 py-1 font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Повторить анализ
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              void fetch(`/api/author/products/${practiceId}/music-passport`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reanalyze", audioItemId: track.audioItemId }),
              }).then(async (response) => {
                const payload = await response.json().catch(() => null) as JazzRelaxPassportView | { error?: string } | null;
                if (!response.ok || !payload || !("progressLabel" in payload)) {
                  setError(payload && "error" in payload && payload.error ? payload.error : "Не удалось запустить анализ.");
                  return;
                }
                setError(null);
                setStatus(payload);
                onStatus(payload);
              }).catch(() => setError("Не удалось запустить анализ."));
            }}
            className="rounded-full border border-[#d9c9ef] px-3 py-1 font-semibold text-[#5f5484] disabled:opacity-60"
          >
            Проанализировать заново текущей версией
          </button>
        </div>
      ))}
      {status && status.readyCount > 0 ? (
        <button
          type="button"
          disabled={pending || status.phase === "running"}
          onClick={() => {
            setPending(true);
            void fetch(`/api/author/products/${practiceId}/music-passport`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "reanalyze" }),
            }).then(async (response) => {
              const payload = await response.json().catch(() => null) as JazzRelaxPassportView | { error?: string } | null;
              setPending(false);
              if (!response.ok || !payload || !("progressLabel" in payload)) {
                setError(payload && "error" in payload && payload.error ? payload.error : "Не удалось запустить анализ.");
                return;
              }
              setError(null);
              setStatus(payload);
              onStatus(payload);
            }).catch(() => {
              setPending(false);
              setError("Не удалось запустить анализ.");
            });
          }}
          className="rounded-full border border-[#d9c9ef] px-4 py-2 text-sm font-semibold text-[#5f5484] disabled:opacity-60"
        >
          Проанализировать заново текущей версией
        </button>
      ) : null}
      {error ? <p className="text-sm text-[#9b3d55]">{error}</p> : null}
    </div>
  );
}
