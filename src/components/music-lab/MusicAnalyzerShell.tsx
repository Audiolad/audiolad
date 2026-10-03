"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import AdminShell from "@/components/admin/AdminShell";

/**
 * Listening pages keep the human-listening campaign name.
 * Analyzer run pages use the automatic lab name already used by the runs hub.
 */
export function MusicAnalyzerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const automaticRun = pathname === "/music-analyzer/runs" || pathname.startsWith("/music-analyzer/runs/");
  return (
    <AdminShell
      title="Музыкальная лаборатория"
      subtitle={automaticRun ? "Автоанализ" : "Human Listening Validation v0.5"}
      backHref="/profile"
      backLabel="Назад в профиль"
    >
      {children}
    </AdminShell>
  );
}
