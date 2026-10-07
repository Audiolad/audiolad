import { createRoot } from "react-dom/client";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import { buildAiCompanyDashboard, parseCompanyStatus, parseHistoryFilters } from "../src/lib/admin/ai-company-dashboard";
import { useAiCompanyDisclosureState } from "../src/lib/admin/ai-company-disclosure";

const headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const status = parseCompanyStatus({
  generated_at: "2026-10-07T06:39:00.000Z",
  agents: [
    {
      slug: "engineering",
      status: "working",
      current_task_id: "b01cd5d3-052b-4e21-9236-184b3c5f2a5e",
      last_heartbeat_at: "2026-10-07T06:20:00.000Z",
    },
  ],
  tasks: [
    {
      id: "b01cd5d3-052b-4e21-9236-184b3c5f2a5e",
      title: "Сделать рабочее табло ИИ-компании с живыми задачами Company Core",
      status: "in_progress",
      role: "engineering",
      executor: "cursor",
      started_at: "2026-10-07T06:00:00.000Z",
      last_event_at: "2026-10-07T06:35:00.000Z",
      received_at: "2026-10-07T05:00:00.000Z",
      executive_run: {
        provider: "cursor",
        head_sha: headSha,
        pr_url: "https://github.com/Audiolad/audiolad/pull/797",
        last_event_at: "2026-10-07T06:35:00.000Z",
      },
    },
    {
      id: "queue-compact",
      title: "Длинное название постановки, которое на закрытой строке остаётся в одну строку",
      status: "queued",
      role: "product",
      executor: "cursor",
      received_at: "2026-10-07T06:10:00.000Z",
      last_event_at: "2026-10-07T06:12:00.000Z",
    },
  ],
  gates: [
    {
      id: "gate-sergey",
      task_id: "queue-compact",
      reason: "Нет правки обложки: файл не приложен к постановке",
      decision_owner: "Sergey",
      request: "Приложить файл обложки",
      next_action: "Сергей подтверждает файл",
    },
  ],
  heartbeats: [{ service_key: "cursor", observed_at: "2026-10-07T06:30:00.000Z", state: "online" }],
});

if (!status) throw new Error("compact row fixture did not parse");
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
