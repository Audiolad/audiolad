import BusinessEvidenceExtractPanel, {
  type EvidenceExtractRow,
  type EvidenceLocationOption,
} from "@/components/admin/BusinessEvidenceExtractPanel";
import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { BUSINESS_EVIDENCE_HREF } from "@/lib/evidence/constants";
import { listEvidenceLocations, listExtracts } from "@/lib/evidence/extract.server";
import { formatLocal } from "@/lib/evidence/play-log";

export const dynamic = "force-dynamic";

function toInput(local: string) {
  return local.slice(0, 16).replace(" ", "T");
}

/** «АудиоЛад Бизнес» → «Сверка записей» (t1578u). Owner only. */
export default async function AdminBusinessEvidencePage() {
  await requirePlatformOwnerAccess(BUSINESS_EVIDENCE_HREF);

  let locations: EvidenceLocationOption[] = [];
  let extracts: EvidenceExtractRow[] = [];
  let loadError = false;
  try {
    const rows = await listEvidenceLocations();
    locations = rows.map((l) => ({
      id: l.id,
      label: `${l.organizationName || "Без названия"} – ${l.name}${l.address ? `, ${l.address}` : ""}`,
      timezone: l.timezone,
    }));
    extracts = (await listExtracts()).map((x) => ({
      id: x.id,
      created: `${formatLocal(x.createdAtUtc, "Europe/Moscow")} МСК`,
      place: `${x.organizationName} – ${x.locationName}`,
      period: `${x.fromLocal} – ${x.toLocal} (${x.timezone})`,
      facts: x.facts,
      plays: x.plays,
      manifestSha256: x.manifestSha256,
      files: x.files,
    }));
  } catch (error) {
    console.error("admin_business_evidence_page_error", error instanceof Error ? error.message : "unknown");
    loadError = true;
  }

  const now = new Date();
  const tz = locations[0]?.timezone ?? "Europe/Moscow";
  const defaultTo = toInput(formatLocal(now.toISOString(), tz));
  const defaultFrom = toInput(formatLocal(new Date(now.getTime() - 2 * 3600 * 1000).toISOString(), tz));

  return (
    <section aria-labelledby="admin-business-evidence-heading">
      <h2 id="admin-business-evidence-heading" className="text-[21px] font-semibold">
        Сверка записей
      </h2>
      <p className="mt-1 text-sm text-[#796ba0]">
        Доказательства для споров с РАО и ВОИС: выписка журнала воспроизведения точки с хешами и печатью сервиса.
      </p>
      {loadError ? (
        <div className="mt-5 rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
          Не удалось загрузить данные. Попробуйте обновить страницу.
        </div>
      ) : (
        <div className="mt-5">
          <BusinessEvidenceExtractPanel
            locations={locations}
            extracts={extracts}
            defaultFrom={defaultFrom}
            defaultTo={defaultTo}
          />
        </div>
      )}
    </section>
  );
}
