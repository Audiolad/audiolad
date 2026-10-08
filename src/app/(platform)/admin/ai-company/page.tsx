import AiCompanyDashboard from "@/components/admin/AiCompanyDashboard";
import AiCompanyLiveRefresh from "@/components/admin/AiCompanyLiveRefresh";
import { requireAdminPermission } from "@/lib/admin/guard";
import {
  companyStatusRequestPath,
  composeAiCompanyBoard,
  parseCompanyStatus,
  parseHistoryFilters,
} from "@/lib/admin/ai-company-dashboard";

export const dynamic = "force-dynamic";

async function loadStatus(
  filters: ReturnType<typeof parseHistoryFilters>,
  acceptance: "current" | "archive" | "all",
): Promise<{
  data: ReturnType<typeof parseCompanyStatus>;
  error: string | null;
}> {
  const base = process.env.COMPANY_CORE_URL ?? process.env.COMPANY_API_URL;
  const token = process.env.COMPANY_API_TOKEN;
  if (!base || !token) {
    return { data: null, error: "Company Core не настроен: отсутствует URL или серверный токен." };
  }
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}${companyStatusRequestPath(filters, acceptance)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { data: null, error: `Company Core вернул HTTP ${response.status}.` };
    const data = parseCompanyStatus(await response.json());
    if (!data) return { data: null, error: "Company Core вернул несовместимый набор данных." };
    return { data, error: null };
  } catch (error) {
    console.error("ai_company_status_load_error", error);
    return { data: null, error: "Company Core сейчас недоступен." };
  }
}

export default async function AiCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    status?: string;
    agent?: string;
    history_offset?: string;
    history_before?: string;
  }>;
}) {
  const session = await requireAdminPermission("ai_company.view");
  const params = await searchParams;
  const filters = parseHistoryFilters({
    period: params.period,
    status: params.status,
    agent: params.agent,
    history_offset: params.history_offset,
    history_before: params.history_before,
  });
  const [current, archive] = await Promise.all([loadStatus(filters, "current"), loadStatus(filters, "archive")]);
  const { model, acceptanceAvailable, sourceError } = composeAiCompanyBoard(current, archive, filters);
  // Core records decisions as actor `sergey`: only the platform owner session gets live buttons.
  const canAccept = session.access.roles.includes("owner");

  return (
    <>
      <AiCompanyLiveRefresh />
      <AiCompanyDashboard
        model={model}
        filters={filters}
        sourceError={sourceError}
        acceptanceAvailable={acceptanceAvailable}
        canAccept={canAccept}
      />
    </>
  );
}
