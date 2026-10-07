"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  AI_COMPANY_LIVE_REFRESH_MS,
  startScopedPageRefresh,
} from "@/lib/admin/ai-company-live-refresh";

/** Soft-refreshes the live ИИ-компания tablo. Unmount cancels the timer. */
export default function AiCompanyLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    return startScopedPageRefresh(() => {
      router.refresh();
    }, AI_COMPANY_LIVE_REFRESH_MS);
  }, [router]);

  return null;
}
