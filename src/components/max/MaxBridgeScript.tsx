"use client";

import Script from "next/script";
import { useCallback, useEffect, useState } from "react";

import {
  MAX_WEB_APP_SCRIPT_SRC,
  readMaxBridgeSnapshot,
  readMaxInitData,
  type MaxBridgeSnapshot,
} from "@/lib/max/bridge";
import { MAX_SESSION_VERIFY_PATH } from "@/lib/max/host";

/**
 * Loads official MAX Bridge CDN only on the MAX entry surface.
 * Does not perform a separate messenger init. Missing `WebApp` is normal
 * in a regular browser and must not throw.
 *
 * When `window.WebApp.initData` is non-empty, POSTs the raw string to the
 * Stage 1 verifier. Never treats initDataUnsafe / platform / version as
 * verified identity. Does not display user id, query_id, or raw initData.
 */

export const MAX_SHELL_STATUS_NEUTRAL = "АудиоЛад открыт внутри MAX";
export const MAX_SHELL_STATUS_CONNECTING = "Подключение к MAX…";
export const MAX_SHELL_STATUS_VERIFIED = "Подключение к MAX подтверждено";

type ShellStatus = "neutral" | "connecting" | "verified";

const STATUS_COPY: Record<ShellStatus, string> = {
  neutral: MAX_SHELL_STATUS_NEUTRAL,
  connecting: MAX_SHELL_STATUS_CONNECTING,
  verified: MAX_SHELL_STATUS_VERIFIED,
};

export default function MaxBridgeScript() {
  const [snapshot, setSnapshot] = useState<MaxBridgeSnapshot>(() =>
    readMaxBridgeSnapshot(),
  );
  const [bridgeTick, setBridgeTick] = useState(0);
  const [status, setStatus] = useState<ShellStatus>("neutral");

  const refresh = useCallback(() => {
    setSnapshot(readMaxBridgeSnapshot());
    setBridgeTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const initData = readMaxInitData();
    if (!initData) {
      return;
    }

    let cancelled = false;
    setStatus("connecting");

    void (async () => {
      try {
        const response = await fetch(MAX_SESSION_VERIFY_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        const payload = (await response.json()) as { ok?: unknown };
        if (!cancelled && response.ok && payload.ok === true) {
          setStatus("verified");
          return;
        }
      } catch {
        // Ordinary browser / failed verify: keep the existing technical line.
      }

      if (!cancelled) {
        setStatus("neutral");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bridgeTick]);

  return (
    <>
      <Script
        src={MAX_WEB_APP_SCRIPT_SRC}
        strategy="afterInteractive"
        onLoad={refresh}
        onError={refresh}
      />
      <p
        hidden
        data-max-in-max={snapshot.inMax ? "true" : "false"}
        data-max-platform={snapshot.platform ?? ""}
        data-max-version={snapshot.version ?? ""}
      />
      <p className="mt-8 text-sm font-medium text-[#7042c5]">
        {STATUS_COPY[status]}
      </p>
    </>
  );
}
