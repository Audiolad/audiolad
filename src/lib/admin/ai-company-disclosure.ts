"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

export const AI_COMPANY_OPEN_ROWS_KEY = "audiolad:ai-company:open-rows";
export const AI_COMPANY_SCROLL_KEY = "audiolad:ai-company:scroll";

const OPEN_ROWS_EVENT = "audiolad-ai-company-open";

export function serializeOpenRows(open: Record<string, boolean>): string {
  const compact: Record<string, true> = {};
  for (const [key, value] of Object.entries(open)) {
    if (value === true && key) compact[key] = true;
  }
  return JSON.stringify(compact);
}

export function parseOpenRows(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true && key) next[key] = true;
    }
    return next;
  } catch {
    return {};
  }
}

export function toggleOpenRow(current: Record<string, boolean>, key: string): Record<string, boolean> {
  return { ...current, [key]: current[key] !== true };
}

function subscribeOpenRows(onStoreChange: () => void) {
  const notify = () => onStoreChange();
  window.addEventListener("storage", notify);
  window.addEventListener(OPEN_ROWS_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(OPEN_ROWS_EVENT, notify);
  };
}

function readOpenRowsSnapshot() {
  return window.sessionStorage.getItem(AI_COMPANY_OPEN_ROWS_KEY) ?? "{}";
}

function readOpenRowsServerSnapshot() {
  return "{}";
}

export function useAiCompanyDisclosureState() {
  const raw = useSyncExternalStore(subscribeOpenRows, readOpenRowsSnapshot, readOpenRowsServerSnapshot);
  const openDetails = parseOpenRows(raw);
  const restoringScroll = useRef(true);

  useEffect(() => {
    const y = Number(window.sessionStorage.getItem(AI_COMPANY_SCROLL_KEY));
    const onScroll = () => {
      if (restoringScroll.current) return;
      window.sessionStorage.setItem(AI_COMPANY_SCROLL_KEY, String(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (Number.isFinite(y) && y > 0) {
      window.requestAnimationFrame(() => {
        window.scrollTo(0, y);
        restoringScroll.current = false;
      });
    } else {
      restoringScroll.current = false;
    }
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onToggleDetail = (key: string, open: boolean) => {
    const next = { ...parseOpenRows(readOpenRowsSnapshot()), [key]: open };
    window.sessionStorage.setItem(AI_COMPANY_OPEN_ROWS_KEY, serializeOpenRows(next));
    window.dispatchEvent(new Event(OPEN_ROWS_EVENT));
  };

  return { openDetails, onToggleDetail };
}
