"use client";

import { useSyncExternalStore } from "react";

import {
  LISTENER_IMPRESSION_INVITE,
  LISTENER_IMPRESSION_INVITE_ACTION,
  LISTENER_IMPRESSION_INVITE_DISMISS,
} from "@/lib/practice-comments/copy";

const STORAGE_PREFIX = "audiolad-impression-invite:";
const CHANGE_EVENT = "audiolad-impression-invite-change";
const dismissedIds = new Set<string>();

export function impressionInviteDismissed(practiceId: string): boolean {
  if (dismissedIds.has(practiceId)) return true;
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}${practiceId}`) === "dismissed";
  } catch {
    return false;
  }
}

export function dismissImpressionInvite(practiceId: string): void {
  dismissedIds.add(practiceId);
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${practiceId}`, "dismissed");
  } catch {
    // Private mode can block storage. The in-memory flag still closes this view.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeInvite(onStoreChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CHANGE_EVENT, onStoreChange);
}

export default function ListenerImpressionInvite({
  href,
  practiceId,
  tone = "dark",
}: {
  href: string;
  practiceId: string;
  tone?: "dark" | "light";
}) {
  const open = useSyncExternalStore(
    subscribeInvite,
    () => !impressionInviteDismissed(practiceId),
    () => false,
  );

  if (!open) return null;

  const dark = tone === "dark";

  return (
    <div
      className={
        dark
          ? "mt-4 rounded-[20px] border border-white/20 bg-white/10 px-4 py-3 text-left text-white"
          : "rounded-[20px] border border-[#eadff8] bg-[#fbf8ff] px-4 py-3 text-[#2b2144]"
      }
      data-listener-impression-invite="true"
    >
      <p className="text-sm leading-6">{LISTENER_IMPRESSION_INVITE}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={href}
          className={
            dark
              ? "inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#4b2f86]"
              : "inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
          }
        >
          {LISTENER_IMPRESSION_INVITE_ACTION}
        </a>
        <button
          type="button"
          className={
            dark
              ? "inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white"
              : "inline-flex min-h-11 items-center justify-center rounded-full border border-[#e4d7f4] bg-white px-4 py-2 text-sm font-semibold text-[#7042c5]"
          }
          onClick={() => {
            dismissImpressionInvite(practiceId);
          }}
        >
          {LISTENER_IMPRESSION_INVITE_DISMISS}
        </button>
      </div>
    </div>
  );
}
