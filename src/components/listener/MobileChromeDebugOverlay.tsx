"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  emitMobileChromeDebug,
  formatMobileChromeDebugLog,
  getMobileChromeDebugEvents,
  isMobileChromeDebugEnabled,
  subscribeMobileChromeDebug,
} from "@/lib/listener/mobile-chrome-debug";

function subscribeAlwaysEnabled(onStoreChange: () => void) {
  return subscribeMobileChromeDebug(onStoreChange);
}

export default function MobileChromeDebugOverlay() {
  const enabled = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => {};
      }

      window.addEventListener("popstate", onStoreChange);
      return () => window.removeEventListener("popstate", onStoreChange);
    },
    isMobileChromeDebugEnabled,
    () => false,
  );
  const eventCount = useSyncExternalStore(
    subscribeAlwaysEnabled,
    () => getMobileChromeDebugEvents().length,
    () => 0,
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    emitMobileChromeDebug("debug-enabled");

    function onFocusIn() {
      emitMobileChromeDebug("focusin");
    }
    function onFocusOut() {
      emitMobileChromeDebug("focusout");
    }
    function onWindowResize() {
      emitMobileChromeDebug("window.resize");
    }
    function onScroll() {
      emitMobileChromeDebug("scroll");
    }
    function onPopState() {
      emitMobileChromeDebug("after-router-replace", { source: "popstate" });
    }
    function onVisualViewportResize() {
      emitMobileChromeDebug("visualViewport.resize");
    }
    function onVisualViewportScroll() {
      emitMobileChromeDebug("visualViewport.scroll");
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPopState);
    window.visualViewport?.addEventListener("resize", onVisualViewportResize);
    window.visualViewport?.addEventListener("scroll", onVisualViewportScroll);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPopState);
      window.visualViewport?.removeEventListener(
        "resize",
        onVisualViewportResize,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        onVisualViewportScroll,
      );
    };
  }, [enabled]);

  const copyLog = useCallback(async () => {
    const text = formatMobileChromeDebugLog();
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
        setCopyState("copied");
      } catch {
        setCopyState("failed");
      }
    }
    window.setTimeout(() => setCopyState("idle"), 1600);
  }, []);

  if (!enabled) {
    return null;
  }

  const latest = getMobileChromeDebugEvents().at(-1);

  return (
    <div
      data-mobile-chrome-debug-overlay=""
      role="region"
      aria-label="Mobile chrome debug"
      style={{
        position: "fixed",
        right: 8,
        bottom: "calc(var(--platform-bottom-chrome, 68px) + 8px)",
        zIndex: 80,
        width: 168,
        maxWidth: "calc(100vw - 16px)",
        margin: 0,
        padding: "8px 8px 7px",
        borderRadius: 12,
        border: "1px solid rgba(37, 19, 92, 0.18)",
        background: "rgba(255, 253, 253, 0.94)",
        boxShadow: "0 8px 20px rgba(37, 19, 92, 0.12)",
        color: "#25135c",
        fontSize: 11,
        lineHeight: 1.35,
        pointerEvents: "auto",
        transform: "none",
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>
        chrome debug · {eventCount}
      </p>
      <p
        style={{
          margin: "4px 0 8px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {latest
          ? `${latest.type} · ${Math.round(latest.topChrome?.height ?? 0)}/${Math.round(latest.spacerHeight ?? 0)}`
          : "waiting for events"}
      </p>
      <button
        type="button"
        data-mobile-chrome-debug-copy=""
        onClick={() => {
          void copyLog();
        }}
        style={{
          display: "inline-flex",
          minHeight: 32,
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          border: 0,
          borderRadius: 999,
          background: "#7042c5",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.02em",
        }}
      >
        {copyState === "copied"
          ? "COPIED"
          : copyState === "failed"
            ? "COPY FAILED"
            : "COPY DEBUG LOG"}
      </button>
    </div>
  );
}
