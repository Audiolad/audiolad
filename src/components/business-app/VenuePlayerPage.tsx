"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { provisionVenuePlayer } from "@/app/business-app/actions";
import BusinessEligibilityProbePanel from "@/components/business-app/BusinessEligibilityProbePanel";
import { BUSINESS_RIGHTS_PLAYER_GATE_NOTE } from "@/lib/business-app/rights-status-copy";
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
      setError(rpcError.message || "heartbeat_failed");
      return null;
    }
    const payload = data as {
      ok?: boolean;
      recommended_interval_seconds?: number;
      server_time?: string;
    } | null;
    if (!payload?.ok) {
      setHeartbeatOk(false);
      setError("heartbeat_invalid_response");
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
      } catch (err) {
        setPopOk(false);
        setError(err instanceof Error ? err.message : "pop_args_invalid");
        return null;
      }

      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "apply_business_playback_usage_heartbeat",
        args,
      );
      if (rpcError) {
        setPopOk(false);
        setError(rpcError.message || "pop_emit_failed");
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
        setError("pop_invalid_response");
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
      setError("domain_incomplete");
      return;
    }
    setPhase("provisioning");
    setError(null);
    const result = await provisionVenuePlayer({
      organizationId: domain.location.organizationId,
      zoneId: domain.location.defaultZoneId,
      displayName: `Player · ${domain.location.name}`,
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
      setError("missing_credential");
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      setError("audio_element_missing");
      return;
    }
    try {
      audio.loop = true;
      await audio.play();
      setPhase("playing");
      await startHeartbeatLoop(credential);
      await startPopLoop(credential);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "play_failed");
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
      <section className="business-app-span-full rounded-2xl border border-white/10 bg-black/20 p-6">
        <h1 className="text-2xl font-bold">Venue Player</h1>
        <p className="mt-2 text-[1.05rem] opacity-90">
          Войдите как владелец точки, чтобы создать Player и запустить эфир.
        </p>
      </section>
    );
  }

  if (!domain.location?.defaultZoneId) {
    return (
      <section className="business-app-span-full rounded-2xl border border-white/10 bg-black/20 p-6">
        <h1 className="text-2xl font-bold">Venue Player</h1>
        <p className="mt-2 text-[1.05rem] opacity-90">
          Сначала создайте организацию и точку на Главной — затем сюда вернётесь
          для назначения Player на зону.
        </p>
      </section>
    );
  }

  return (
    <section className="business-app-span-full space-y-4">
      <header className="rounded-2xl border border-white/10 bg-black/20 p-6">
        <p className="text-sm font-semibold uppercase tracking-wide opacity-70">
          Venue Player · runtime v0 · PoP
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Эфир точки</h1>
        <p className="mt-2 text-[1.05rem] opacity-90">
          Точка: <strong>{domain.location.name}</strong>
          {playerCode ? (
            <>
              {" "}
              · Player <code className="text-sm">{playerCode}</code>
            </>
          ) : null}
        </p>
        <p className="mt-2 text-sm opacity-70">{pilot.description}</p>
        <p className="mt-1 text-xs opacity-50">
          Proof of Play →{" "}
          <code>apply_business_playback_usage_heartbeat</code> (evidence;
          allowlist audio_item, не eligible-каталог).
        </p>
        <p className="mt-1 text-xs opacity-50">{BUSINESS_RIGHTS_PLAYER_GATE_NOTE}</p>
      </header>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 space-y-4">
        <audio ref={audioRef} src={pilot.src} preload="auto" />
        <div className="flex flex-wrap gap-3">
          {!credential ? (
            <button
              type="button"
              className="rounded-xl bg-emerald-500 px-5 py-3 text-base font-semibold text-black disabled:opacity-50"
              disabled={phase === "provisioning"}
              onClick={() => void onProvision()}
            >
              {phase === "provisioning"
                ? "Создаём Player…"
                : "Создать Player и назначить на зону"}
            </button>
          ) : null}
          {credential && phase !== "playing" ? (
            <button
              type="button"
              className="rounded-xl bg-sky-400 px-5 py-3 text-base font-semibold text-black"
              onClick={() => void onStartPlayback()}
            >
              Старт эфира (пилот-тон + heartbeat + PoP)
            </button>
          ) : null}
          {phase === "playing" ? (
            <button
              type="button"
              className="rounded-xl bg-amber-300 px-5 py-3 text-base font-semibold text-black"
              onClick={onStopPlayback}
            >
              Стоп
            </button>
          ) : null}
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="opacity-60">Фаза</dt>
            <dd className="font-semibold">{phase}</dd>
          </div>
          <div>
            <dt className="opacity-60">Heartbeat (A2)</dt>
            <dd className="font-semibold">
              {heartbeatOk ? "ok" : "—"}
              {lastHeartbeatAt ? ` · ${lastHeartbeatAt}` : ""}
            </dd>
          </div>
          <div>
            <dt className="opacity-60">Proof of Play (A3)</dt>
            <dd className="font-semibold">
              {popOk ? "ok" : "—"}
              {lastPopAcceptedMs != null
                ? ` · accepted_ms=${lastPopAcceptedMs}`
                : ""}
              {popSampleSeq > 0 ? ` · seq=${popSampleSeq}` : ""}
              {lastPopAt ? ` · ${lastPopAt}` : ""}
            </dd>
          </div>
          <div>
            <dt className="opacity-60">PoP audio_item (allowlist)</dt>
            <dd className="font-semibold break-all text-xs">
              {VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="opacity-60">Трек (audio)</dt>
            <dd className="font-semibold">
              {pilot.title} · {pilot.program}
            </dd>
          </div>
        </dl>

        {error ? (
          <p
            className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-100"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {credential ? (
          <p className="text-xs opacity-50 break-all">
            Credential хранится в sessionStorage этой вкладки (не логируется в UI
            целиком в проде-политике; для slice показан хвост):{" "}
            <code>…{credential.slice(-8)}</code>
          </p>
        ) : null}
      </div>

      <BusinessEligibilityProbePanel compact />
    </section>
  );
}
