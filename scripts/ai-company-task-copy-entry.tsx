import { createRoot } from "react-dom/client";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import { buildAiCompanyDashboard, parseCompanyStatus, parseHistoryFilters } from "../src/lib/admin/ai-company-dashboard";
import { useAiCompanyDisclosureState } from "../src/lib/admin/ai-company-disclosure";

const brief = `Первая строка постановки.\n\n${"А".repeat(80)}\nКОНЕЦ-ПОСТАНОВКИ api_key=super-secret-value`;
const status = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  agents: [],
  tasks: [
    {
      id: "copy-sergey",
      title: "Решение Сергея по обложке",
      status: "blocked",
      blocked_reason: "Нет правки обложки",
      decision_owner: "Sergey",
      request: "Приложить файл обложки",
      next_action: "Сергей подтверждает файл",
      executor: "cursor",
      brief,
      executive_run: {
        run_id: "bc-copy-sergey",
        pr_url: "https://github.com/Audiolad/audiolad/pull/801",
      },
      received_at: "2026-10-07T06:00:00.000Z",
      last_event_at: "2026-10-07T06:20:00.000Z",
    },
  ],
  gates: [
    {
      id: "g-sergey",
      task_id: "copy-sergey",
      reason: "Нет правки обложки",
      decision_owner: "Sergey",
      request: "Приложить файл обложки",
      next_action: "Сергей подтверждает файл",
    },
  ],
});

if (!status) throw new Error("copy fixture did not parse");
const model = buildAiCompanyDashboard(status, parseHistoryFilters({}));

function Harness() {
  const disclosure = useAiCompanyDisclosureState();
  return (
    <AiCompanyDashboardView
      model={model}
      filters={parseHistoryFilters({})}
      sourceError={null}
      onRefresh={() => undefined}
      openDetails={disclosure.openDetails}
      onToggleDetail={disclosure.onToggleDetail}
    />
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("missing root");
createRoot(root).render(<Harness />);
