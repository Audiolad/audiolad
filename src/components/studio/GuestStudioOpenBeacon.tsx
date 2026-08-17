"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { trackGuestStudioEvent } from "@/lib/studio/guest-analytics";

const STORAGE_KEY = "audiolad_guest_studio_open";

export function GuestStudioOpenBeacon({
  accessMode,
}: {
  accessMode: "author" | "guest";
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (accessMode !== "guest") return;
    if (typeof window === "undefined") return;
    const fromTry = searchParams.get("from") === "try";
    if (!fromTry && window.sessionStorage.getItem(STORAGE_KEY)) return;
    window.sessionStorage.setItem(STORAGE_KEY, "1");
    void trackGuestStudioEvent("guest_studio_open", "/studio/try");
  }, [accessMode, searchParams]);
  return null;
}
