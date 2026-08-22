"use client";

import Script from "next/script";
import { useCallback, useState } from "react";

import {
  MAX_WEB_APP_SCRIPT_SRC,
  readMaxBridgeSnapshot,
  type MaxBridgeSnapshot,
} from "@/lib/max/bridge";

/**
 * Loads official MAX Bridge CDN only on the MAX entry surface.
 * Does not call Telegram-style `WebApp.ready()`. Missing `WebApp` is normal
 * in a regular browser and must not throw.
 */
export default function MaxBridgeScript() {
  const [snapshot, setSnapshot] = useState<MaxBridgeSnapshot>(() =>
    readMaxBridgeSnapshot(),
  );

  const refresh = useCallback(() => {
    setSnapshot(readMaxBridgeSnapshot());
  }, []);

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
    </>
  );
}
