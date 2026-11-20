"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { BUSINESS_POINT_COOKIE } from "@/lib/business-app/point-session";
import {
  VPN_NOTICE_STORAGE_KEY,
  VPN_NOTICE_TEXT,
  VPN_NOTICE_TTL_MS,
  VPN_NOTICE_VISIBLE_MS,
  parseVpnNoticeShownUntil,
  shouldShowVpnNotice,
} from "@/lib/vpn-notice/decision";

function hasHallDeviceCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim().startsWith(`${BUSINESS_POINT_COOKIE}=`));
}

function readShownUntil(): number | null {
  try {
    return parseVpnNoticeShownUntil(window.localStorage.getItem(VPN_NOTICE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeShownUntil(until: number): void {
  try {
    window.localStorage.setItem(VPN_NOTICE_STORAGE_KEY, String(until));
  } catch {
    // Private mode may refuse storage; the notice still hides for this page.
  }
}

function subscribeNoop(): () => void {
  return () => {};
}

export default function VpnNoticeBanner({
  country,
  hostname,
}: {
  country: string;
  hostname: string;
}) {
  const pathname = usePathname() ?? "/";
  // Server and the hydration pass stay hidden; after hydration we read localStorage / cookies.
  const ready = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [done, setDone] = useState(false);
  const allowed =
    ready &&
    shouldShowVpnNotice({
      country,
      hostname,
      pathname,
      shownUntil: readShownUntil(),
      hallDevice: hasHallDeviceCookie(),
    });

  useEffect(() => {
    if (!allowed) return;
    writeShownUntil(Date.now() + VPN_NOTICE_TTL_MS);
    const hide = window.setTimeout(() => setDone(true), VPN_NOTICE_VISIBLE_MS);
    return () => window.clearTimeout(hide);
  }, [allowed]);

  if (!allowed || done) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="vpn-notice"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        pointerEvents: "none",
        paddingTop: "env(safe-area-inset-top, 0px)",
        animation: `audiolad-vpn-notice ${VPN_NOTICE_VISIBLE_MS}ms ease forwards`,
      }}
    >
      <style>{`@keyframes audiolad-vpn-notice{0%,85%{opacity:1}100%{opacity:0}}`}</style>
      <div
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          margin: 0,
          padding: "10px 8px 10px 16px",
          borderRadius: 0,
          background: "rgba(47, 32, 20, 0.94)",
          color: "#fff8ef",
          boxShadow: "0 6px 20px rgba(40, 24, 12, 0.22)",
          fontSize: 13,
          lineHeight: 1.35,
          letterSpacing: 0,
        }}
      >
        <p style={{ margin: 0, flex: 1, textAlign: "center" }}>{VPN_NOTICE_TEXT}</p>
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => setDone(true)}
          style={{
            flex: "0 0 auto",
            width: 32,
            height: 32,
            border: 0,
            borderRadius: 8,
            background: "transparent",
            color: "#fff8ef",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
