"use client";

import { useEffect, useState } from "react";

import AdminAppreciationBlock from "@/components/admin/AdminAppreciationBlock";
import {
  projectAppreciationAnalytics,
  type AppreciationAnalyticsProjection,
} from "@/lib/admin/appreciation-analytics";

export default function AdminAppreciationPanel() {
  const [data, setData] = useState<AppreciationAnalyticsProjection | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/analytics/appreciation", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as AppreciationAnalyticsProjection;
        if (!cancelled && payload?.summary && Array.isArray(payload.rows)) {
          setData(payload);
        }
      } catch {
        if (!cancelled) setData(projectAppreciationAnalytics([]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <p className="text-sm text-[#796ba0]">Загрузка благодарностей…</p>
    );
  }

  return <AdminAppreciationBlock data={data} />;
}
