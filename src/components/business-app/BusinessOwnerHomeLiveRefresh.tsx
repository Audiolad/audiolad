"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { startOwnerHomeLiveRefresh } from "@/lib/business-app/owner-home-live-refresh";

/** Soft-refreshes the owner home (server re-reads live state as this owner). */
export default function BusinessOwnerHomeLiveRefresh() {
  const router = useRouter();
  useEffect(() => startOwnerHomeLiveRefresh(() => router.refresh()), [router]);
  return null;
}
