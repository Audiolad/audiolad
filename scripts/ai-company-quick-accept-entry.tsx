import { useState } from "react";
import { createRoot } from "react-dom/client";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import { buildAiCompanyDashboard, parseCompanyStatus, parseHistoryFilters } from "../src/lib/admin/ai-company-dashboard";
import { useAiCompanyDisclosureState } from "../src/lib/admin/ai-company-disclosure";
import raw from "./fixtures/ai-company/core28-current.json";

const filters = parseHistoryFilters({});
const first = buildAiCompanyDashboard(parseCompanyStatus(raw)!, filters);

// Fake acceptance endpoint: first task fails once, then succeeds; refresh moves accepted rows to the archive.
const w = window as unknown as { __acceptCalls: Array<Record<string, unknown>>; __failNext: boolean; __refreshes: number };
w.__acceptCalls = [];
w.__failNext = true;
w.__refreshes = 0;
const accepted = new Set<string>();
window.fetch = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  w.__acceptCalls.push({ url, body });
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (w.__failNext) {
    w.__failNext = false;
    return { json: async () => ({ ok: false, code: "stale_result", message: "Результат изменился. Обновите табло." }) } as Response;
  }
  accepted.add(body.taskId);
  return { json: async () => ({ ok: true, message: "Решение сохранено." }) } as Response;
}) as typeof fetch;

function Board() {
  const { openDetails, onToggleDetail } = useAiCompanyDisclosureState();
  const [model, setModel] = useState(first);
  function refresh() {
    w.__refreshes += 1;
    setModel((prev) => {
      const moved = prev.ownerReview.filter((d) => accepted.has(d.taskId));
      return {
        ...prev,
        ownerReview: prev.ownerReview.filter((d) => !accepted.has(d.taskId)),
        acceptedArchive: [
          ...prev.acceptedArchive,
          ...moved.map((d) => ({ ...d, acceptance: d.acceptance ? { ...d.acceptance, state: "accepted" as const } : null })),
        ],
      };
    });
  }
  return (
    <AiCompanyDashboardView
      model={model}
      filters={filters}
      sourceError={null}
      acceptanceAvailable
      canAccept
      initialTab="review"
      onRefresh={refresh}
      openDetails={openDetails}
      onToggleDetail={onToggleDetail}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Board />);
