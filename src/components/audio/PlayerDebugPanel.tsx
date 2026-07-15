"use client";

import { useCallback, useMemo, useState } from "react";

import {
  getPlayerDebugLogText,
  isPlayerDebugEnabled,
} from "@/lib/audio/player-debug";

export default function PlayerDebugPanel() {
  const enabled = useMemo(() => isPlayerDebugEnabled(), []);
  const [logText, setLogText] = useState("");

  const refresh = useCallback(() => {
    setLogText(getPlayerDebugLogText());
  }, []);

  if (!enabled) {
    return null;
  }

  async function copyLog() {
    const text = getPlayerDebugLogText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
  }

  return (
    <div className="fixed left-2 right-2 top-2 z-[100] max-h-[40vh] overflow-auto rounded-lg border border-white/20 bg-black/85 p-2 text-[10px] leading-snug text-white shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">Player debug</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded bg-white/15 px-2 py-1 text-[10px] font-medium"
          >
            Обновить
          </button>
          <button
            type="button"
            onClick={() => void copyLog()}
            className="rounded bg-white/15 px-2 py-1 text-[10px] font-medium"
          >
            Скопировать журнал плеера
          </button>
        </div>
      </div>
      <pre className="whitespace-pre-wrap break-all">{logText || "—"}</pre>
    </div>
  );
}
