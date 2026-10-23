import AiCompanyDashboard from "@/components/admin/AiCompanyDashboard";
import AiCompanyLiveRefresh from "@/components/admin/AiCompanyLiveRefresh";
import { isAiCompanyOwner, requireAiCompanyView } from "@/lib/admin/guard";
import {
  ARCHIVE_PAGE_SIZE,
  composeAiCompanyBoard,
  loadCompanyStatusWindow,
  parseBoardTabParam,
  parseCompanyStatus,
  parseHistoryFilters,
} from "@/lib/admin/ai-company-dashboard";

export const dynamic = "force-dynamic";

async function loadStatusPage(
  path: string,
  timeoutMs: number,
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
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
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

/** One acceptance view with the requested «Архив» window (cursor pages are chained in loadCompanyStatusWindow). */
function loadStatus(
  filters: ReturnType<typeof parseHistoryFilters>,
  acceptance: "current" | "archive" | "all",
) {
  const timeoutMs = (filters.archiveLimit ?? ARCHIVE_PAGE_SIZE) > ARCHIVE_PAGE_SIZE ? 15000 : 8000;
  return loadCompanyStatusWindow((path) => loadStatusPage(path, timeoutMs), filters, acceptance);
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
    archive_limit?: string;
    tab?: string;
  }>;
}) {
  // Owner/admin with ai_company.view, or the read-only ai_company_viewer role.
  const session = await requireAiCompanyView();
  const params = await searchParams;
  const filters = parseHistoryFilters({
    period: params.period,
    status: params.status,
    agent: params.agent,
    history_offset: params.history_offset,
    history_before: params.history_before,
    archive_limit: params.archive_limit,
  });
  const [current, archive] = await Promise.all([loadStatus(filters, "current"), loadStatus(filters, "archive")]);
  const { model, acceptanceAvailable, sourceError } = composeAiCompanyBoard(current, archive, filters);
  // Core records decisions as actor `sergey`: only the platform owner session gets live buttons.
  const canAccept = isAiCompanyOwner(session.access);

  return (
    <>
      <AiCompanyLiveRefresh />
      <AiCompanyDashboard
        model={model}
        filters={filters}
        sourceError={sourceError}
        acceptanceAvailable={acceptanceAvailable}
        canAccept={canAccept}
        initialTab={parseBoardTabParam(params.tab)}
      />
    </>
  );
}
