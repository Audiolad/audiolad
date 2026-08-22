"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";

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
 * verifier. Never treats initDataUnsafe / platform / version as verified
 * identity. Does not display user id, query_id, or raw initData. Does not
 * write the database from the browser; missing initData skips POST.
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
  const [status, setStatus] = useState<ShellStatus>("neutral");
  const verifyGeneration = useRef(0);

  const refreshAndVerify = useCallback(() => {
    setSnapshot(readMaxBridgeSnapshot());

    const initData = readMaxInitData();
    if (!initData) {
      return;
    }

    const generation = ++verifyGeneration.current;
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
        if (generation !== verifyGeneration.current) {
          return;
        }
        if (response.ok && payload.ok === true) {
          setStatus("verified");
          return;
        }
      } catch {
        // Ordinary browser / failed verify: keep the existing technical line.
      }

      if (generation === verifyGeneration.current) {
        setStatus("neutral");
      }
    })();
  }, []);

  return (
    <>
      <Script
        src={MAX_WEB_APP_SCRIPT_SRC}
        strategy="afterInteractive"
        onReady={refreshAndVerify}
        onError={refreshAndVerify}
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
