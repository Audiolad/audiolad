import AiCompanyDashboard from "@/components/admin/AiCompanyDashboard";
import { requireAdminPermission } from "@/lib/admin/guard";
import {
  buildAiCompanyDashboard,
  parseCompanyStatus,
  parseHistoryFilters,
} from "@/lib/admin/ai-company-dashboard";

export const dynamic = "force-dynamic";

async function loadStatus(): Promise<{ data: ReturnType<typeof parseCompanyStatus>; error: string | null }> {
  const base = process.env.COMPANY_CORE_URL ?? process.env.COMPANY_API_URL;
  const token = process.env.COMPANY_API_TOKEN;
  if (!base || !token) {
    return { data: null, error: "Company Core не настроен: отсутствует URL или серверный токен." };
  }
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/v1/status`, {
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
  searchParams: Promise<{ period?: string; status?: string; agent?: string }>;
}) {
  await requireAdminPermission("ai_company.view");
  const filters = parseHistoryFilters(await searchParams);
  const { data, error } = await loadStatus();

  if (!data) {
    return (
      <section aria-labelledby="ai-company-unavailable">
        <meta httpEquiv="refresh" content="45" />
        <h2 id="ai-company-unavailable" className="text-[21px] font-semibold">
          ИИ-компания
        </h2>
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          <strong>Требует внимания (Attention): нет достоверных данных</strong>
          <p className="mt-2 text-sm">{error}</p>
          <p className="mt-2 text-sm">Фиктивное состояние не подставлено. Повтор через 45 секунд.</p>
        </div>
      </section>
    );
  }

  const model = buildAiCompanyDashboard(data, filters);

  return (
    <section aria-labelledby="ai-company-heading">
      <meta httpEquiv="refresh" content="45" />
      <AiCompanyDashboard model={model} filters={filters} />
    </section>
  );
}
