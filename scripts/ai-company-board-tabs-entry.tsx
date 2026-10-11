import { createRoot } from "react-dom/client";

import { AiCompanyDashboardView, parseBoardTabParam } from "../src/components/admin/AiCompanyDashboard";
import { composeAiCompanyBoard, parseCompanyStatus, parseHistoryFilters } from "../src/lib/admin/ai-company-dashboard";
import { useAiCompanyDisclosureState } from "../src/lib/admin/ai-company-disclosure";
import raw from "./fixtures/ai-company/core29-launch.json";

const status = parseCompanyStatus(raw)!;
const filters = parseHistoryFilters({});
const { model } = composeAiCompanyBoard({ data: status, error: null }, { data: null, error: "нет" }, filters);

// Records launch presses. The board never flips a status locally: the row must stay as it is.
const w = window as unknown as { __launchCalls: Array<Record<string, unknown>> };
w.__launchCalls = [];
window.fetch = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  w.__launchCalls.push({ url, body });
  await new Promise((resolve) => setTimeout(resolve, 150));
  return {
    json: async () => ({ ok: true, message: "Передана в мост Грога. Подтверждения исполнителя пока нет: это ещё не «выполнено»." }),
  } as Response;
}) as typeof fetch;

function Board() {
  const { openDetails, onToggleDetail } = useAiCompanyDisclosureState();
  return (
    <AiCompanyDashboardView
      model={model}
      filters={filters}
      sourceError={null}
      acceptanceAvailable
      canAccept
      initialTab={parseBoardTabParam(new URLSearchParams(window.location.search).get("tab"))}
      onRefresh={() => undefined}
      openDetails={openDetails}
      onToggleDetail={onToggleDetail}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Board />);
