"use client";

import Link from "next/link";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { provisionVenuePlayer } from "@/app/business-app/actions";
import BusinessEligibilityProbePanel from "@/components/business-app/BusinessEligibilityProbePanel";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { createClient } from "@/lib/supabase/client";
import {
  VENUE_PLAYER_APP_VERSION,
  VENUE_PLAYER_CREDENTIAL_STORAGE_KEY,
  VENUE_PLAYER_POP_SAMPLE_INTERVAL_MS,
  VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID,
  buildBusinessPopHeartbeatArgs,
  createVenuePlayerUuid,
  getVenuePlayerPilotTrack,
  isVenuePlayerCredential,
  resolveHeartbeatIntervalSeconds,
  type BusinessPopPhase,
} from "@/lib/business-app/venue-player";

type RuntimePhase =
  | "idle"
  | "provisioning"
  | "ready"
  | "playing"
  | "error";

export default function VenuePlayerPage() {
  const domain = useBusinessDomain();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackSessionIdRef = useRef<string>("");
  const sampleSeqRef = useRef(0);
  const lastPositionMsRef = useRef(0);
  const playStartedAtMsRef = useRef(0);
  const [credential, setCredential] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem(VENUE_PLAYER_CREDENTIAL_STORAGE_KEY);
      return stored && isVenuePlayerCredential(stored) ? stored : "";
    } catch {
      return "";
    }
  });
  const [playerCode, setPlayerCode] = useState<string>("");
  const [phase, setPhase] = useState<RuntimePhase>(() => {
    try {
      const stored = sessionStorage.getItem(VENUE_PLAYER_CREDENTIAL_STORAGE_KEY);
      return stored && isVenuePlayerCredential(stored) ? "ready" : "idle";
    } catch {
      return "idle";
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null);
  const [heartbeatOk, setHeartbeatOk] = useState(false);
  const [popOk, setPopOk] = useState(false);
  const [lastPopAcceptedMs, setLastPopAcceptedMs] = useState<number | null>(
    null,
  );
  const [lastPopAt, setLastPopAt] = useState<string | null>(null);
  const [popSampleSeq, setPopSampleSeq] = useState(0);
  const pilot = useMemo(() => getVenuePlayerPilotTrack(), []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const stopPopLoop = useCallback(() => {
    if (popTimerRef.current) {
      clearInterval(popTimerRef.current);
      popTimerRef.current = null;
    }
  }, []);

  const sendHeartbeat = useCallback(async (cred: string) => {
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "record_business_player_heartbeat",
      {
        p_credential: cred,
        p_client_time: new Date().toISOString(),
        p_app_version: VENUE_PLAYER_APP_VERSION,
      },
    );
    if (rpcError) {
      setHeartbeatOk(false);
      setError("Не удалось связаться с плеером. Попробуйте ещё раз.");
      return null;
    }
    const payload = data as {
      ok?: boolean;
      recommended_interval_seconds?: number;
      server_time?: string;
    } | null;
    if (!payload?.ok) {
      setHeartbeatOk(false);
      setError("Плеер не подтвердил подключение. Попробуйте ещё раз.");
      return null;
    }
    setHeartbeatOk(true);
    setLastHeartbeatAt(
      typeof payload.server_time === "string"
        ? payload.server_time
        : new Date().toISOString(),
    );
    setError(null);
    return resolveHeartbeatIntervalSeconds(payload.recommended_interval_seconds);
  }, []);

  const sendPopSample = useCallback(
    async (cred: string, phaseName: BusinessPopPhase) => {
      if (!playbackSessionIdRef.current) return null;
      const nowMs = Date.now();
      const positionMs = Math.max(
        0,
        Math.floor(nowMs - playStartedAtMsRef.current),
      );
      const prior =
        sampleSeqRef.current === 0 ? null : lastPositionMsRef.current;
      sampleSeqRef.current += 1;
      const sampleSeq = sampleSeqRef.current;
      let args;
      try {
        args = buildBusinessPopHeartbeatArgs({
          credential: cred,
          clientEventId: createVenuePlayerUuid(),
          playbackSessionId: playbackSessionIdRef.current,
          sampleSeq,
          audioItemId: VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID,
          positionMs,
          priorPositionMs: prior,
          phase: phaseName,
        });
      } catch {
        setPopOk(false);
        setError("Не удалось подготовить сведения о воспроизведении.");
        return null;
      }

      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "apply_business_playback_usage_heartbeat",
        args,
      );
      if (rpcError) {
        setPopOk(false);
        setError("Не удалось отправить сведения о воспроизведении.");
        return null;
      }
      const payload = data as {
        ok?: boolean;
        accepted_ms?: number;
        duplicate?: boolean;
        server_time?: string;
      } | null;
      if (!payload?.ok) {
        setPopOk(false);
        setError("Не удалось подтвердить отправку сведений о воспроизведении.");
        return null;
      }
      lastPositionMsRef.current = positionMs;
      setPopOk(true);
      setPopSampleSeq(sampleSeq);
      setLastPopAcceptedMs(
        typeof payload.accepted_ms === "number" ? payload.accepted_ms : 0,
      );
      setLastPopAt(
        typeof payload.server_time === "string"
          ? payload.server_time
          : new Date().toISOString(),
      );
      setError(null);
      return payload;
    },
    [],
  );

  const startHeartbeatLoop = useCallback(
    async (cred: string) => {
      stopHeartbeat();
      const firstInterval = await sendHeartbeat(cred);
      if (firstInterval == null) return;
      let intervalSec = firstInterval;
      heartbeatTimerRef.current = setInterval(() => {
        void (async () => {
          const next = await sendHeartbeat(cred);
          if (next != null && next !== intervalSec) {
            intervalSec = next;
            stopHeartbeat();
            heartbeatTimerRef.current = setInterval(() => {
              void sendHeartbeat(cred);
            }, intervalSec * 1000);
          }
        })();
      }, intervalSec * 1000);
    },
    [sendHeartbeat, stopHeartbeat],
  );

  const startPopLoop = useCallback(
    async (cred: string) => {
      stopPopLoop();
      playbackSessionIdRef.current = createVenuePlayerUuid();
      sampleSeqRef.current = 0;
      lastPositionMsRef.current = 0;
      playStartedAtMsRef.current = Date.now();
      setPopSampleSeq(0);
      setLastPopAcceptedMs(null);
      // Baseline sample (accepted_ms=0) then cadence advances.
      await sendPopSample(cred, "advance");
      popTimerRef.current = setInterval(() => {
        void sendPopSample(cred, "advance");
      }, VENUE_PLAYER_POP_SAMPLE_INTERVAL_MS);
    },
    [sendPopSample, stopPopLoop],
  );

  useEffect(
    () => () => {
      stopHeartbeat();
      stopPopLoop();
    },
    [stopHeartbeat, stopPopLoop],
  );

  async function onProvision() {
    if (domain.status !== "authenticated" || !domain.location?.defaultZoneId) {
      setError("Данные точки пока недоступны. Попробуйте обновить страницу.");
      return;
    }
    setPhase("provisioning");
    setError(null);
    const result = await provisionVenuePlayer({
      organizationId: domain.location.organizationId,
      zoneId: domain.location.defaultZoneId,
      displayName: `Плеер · ${domain.location.name}`,
    });
    if (!result.ok) {
      setPhase("error");
      setError(result.error);
      return;
    }
    try {
      sessionStorage.setItem(
        VENUE_PLAYER_CREDENTIAL_STORAGE_KEY,
        result.credential,
      );
    } catch {
      // ignore
    }
    setCredential(result.credential);
    setPlayerCode(result.playerCode);
    setPhase("ready");
  }

  async function onStartPlayback() {
    if (!isVenuePlayerCredential(credential)) {
      setError("Сначала подключите плеер к залу кнопкой выше.");
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      setError("Плеер пока не готов. Обновите страницу и попробуйте ещё раз.");
      return;
    }
    try {
      audio.loop = true;
      await audio.play();
      setPhase("playing");
      await startHeartbeatLoop(credential);
      await startPopLoop(credential);
    } catch {
      setPhase("error");
      setError("Не удалось включить звук. Проверьте интернет и попробуйте ещё раз.");
    }
  }

  function onStopPlayback() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    stopHeartbeat();
    stopPopLoop();
    if (isVenuePlayerCredential(credential) && sampleSeqRef.current > 0) {
      void sendPopSample(credential, "pause");
    }
    setPhase(credential ? "ready" : "idle");
  }

  if (domain.status === "anonymous") {
    return (
      <section className="business-app-span-full business-app-card">
        <h1 className="text-2xl font-bold text-[var(--biz-text)]">Плеер точки</h1>
        <p className="mt-2 text-[1.05rem] text-[var(--biz-text-muted)]">
          <a href="https://audiolad.ru/auth/sign-in" className="underline">Войдите как владелец точки</a>, чтобы подключить плеер и включить музыку.</p>
      </section>
    );
  }

  if (!domain.location?.defaultZoneId) {
    return (
      <section className="business-app-span-full business-app-card">
        <h1 className="text-2xl font-bold text-[var(--biz-text)]">Плеер точки</h1>
        <p className="mt-2 text-[1.05rem] text-[var(--biz-text-muted)]">
          <Link href="/" className="underline">Подключите заведение на главной</Link>, затем вернитесь сюда, чтобы настроить плеер зала.</p>
      </section>
    );
  }

  return (
    <section className="business-app-span-full space-y-4">
      <header className="business-app-card">
        <p className="business-app-eyebrow">
          Плеер точки
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--biz-text)] sm:text-3xl">Эфир точки</h1>
        <p className="mt-2 text-[1.05rem] text-[var(--biz-text-muted)]">
          Точка: <strong>{domain.location.name}</strong>
          {playerCode ? (
            <>
              {" "}
               · Плеер <code className="text-sm">{playerCode}</code>
            </>
          ) : null}
        </p>
        <p className="mt-2 text-sm text-[var(--biz-text-muted)]">{pilot.description}</p>
        <p className="mt-1 text-xs text-[var(--biz-text-muted)]">
          Плеер отправляет{" "}
          сведения о воспроизведении. Проверочный звук помогает проверить подключение и не входит в музыкальную подборку.</p>
        <p className="mt-1 text-xs text-[var(--biz-text-muted)]">
          В заведении можно включать только треки с{" "}
          подтверждёнными правами.</p>
      </header>

      <div className="business-app-card space-y-4">
        <audio ref={audioRef} src={pilot.src} preload="auto" />
        <div className="flex flex-wrap gap-3">
          {!credential ? (
            <button
              type="button"
              className="business-app-btn business-app-btn-primary business-app-focus-ring"
              disabled={phase === "provisioning"}
              onClick={() => void onProvision()}
            >
              {phase === "provisioning"
                ? "Подключаем плеер…"
                : "Подключить плеер к залу"}
            </button>
          ) : null}
          {credential && phase !== "playing" ? (
            <button
              type="button"
              className="business-app-btn business-app-btn-primary business-app-focus-ring"
              onClick={() => void onStartPlayback()}
            >
              Включить проверочный звук</button>
          ) : null}
          {phase === "playing" ? (
            <button
              type="button"
              className="business-app-btn business-app-btn-secondary business-app-focus-ring"
              onClick={onStopPlayback}
            >
              Стоп
            </button>
          ) : null}
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--biz-text-muted)]">Состояние</dt>
            <dd className="font-semibold text-[var(--biz-text)]">{{ idle: "Ожидает подключения", provisioning: "Подключается", ready: "Готов", playing: "Играет", error: "Ошибка" }[phase]}</dd>
          </div>
          <div>
            <dt className="text-[var(--biz-text-muted)]">Связь с плеером</dt>
            <dd className="font-semibold text-[var(--biz-text)]">
              {heartbeatOk ? "Подтверждено" : "–"}
              {lastHeartbeatAt ? ` · ${lastHeartbeatAt}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--biz-text-muted)]">Учёт воспроизведения</dt>
            <dd className="font-semibold text-[var(--biz-text)]">
              {popOk ? "Подтверждено" : "–"}
              {lastPopAcceptedMs != null
                ? ` · учтено миллисекунд: ${lastPopAcceptedMs}`
                : ""}
              {popSampleSeq > 0 ? ` · номер сообщения: ${popSampleSeq}` : ""}
              {lastPopAt ? ` · ${lastPopAt}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--biz-text-muted)]">Код проверочного звука</dt>
            <dd className="font-semibold break-all text-xs text-[var(--biz-text)]">
              {VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--biz-text-muted)]">Трек</dt>
            <dd className="font-semibold text-[var(--biz-text)]">
              {pilot.title} · {pilot.program}
            </dd>
          </div>
        </dl>

        {error ? (
          <p
            className="business-app-alert"
            data-tone="error"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {credential ? (
          <p className="text-xs text-[var(--biz-text-muted)] break-all">
            Ключ подключения сохранён для этой вкладки. Последние знаки: {" "}
            <code>…{credential.slice(-8)}</code>
          </p>
        ) : null}
      </div>

      <BusinessEligibilityProbePanel compact />
    </section>
  );
}
