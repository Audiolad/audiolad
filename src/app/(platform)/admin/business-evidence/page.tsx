import BusinessEvidenceExtractPanel, {
  type EvidenceExtractRow,
  type EvidenceLocationOption,
} from "@/components/admin/BusinessEvidenceExtractPanel";
import BusinessEvidenceMatcherPanel, {
  type MatcherIndexView,
  type MatcherJobRow,
} from "@/components/admin/BusinessEvidenceMatcherPanel";
import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import { BUSINESS_EVIDENCE_HREF, JOB_STATE_TEXT } from "@/lib/evidence/constants";
import { REGISTRY_STATUS_TEXT } from "@/lib/evidence/index-registry";
import { ensureIndexRegisteredSafe } from "@/lib/evidence/index-registry.server";
import { listJobs, loadEngineState } from "@/lib/evidence/matcher.server";
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
  let index: MatcherIndexView = { ready: false, installed: false, olaf: false, summary: null, build: null, building: false, failed: [] };
  let jobs: MatcherJobRow[] = [];
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
    const engine = await loadEngineState();
    // M4: the active index version goes into the append-only registry (once per version).
    const registry = engine.index
      ? await ensureIndexRegisteredSafe(engine.index.version)
      : null;
    const mb = (n: number | null) => (n === null ? "" : `, ${Math.max(1, Math.round(n / 1024 / 1024))} МБ`);
    index = {
      ready: engine.ready,
      installed: engine.pythonOk,
      olaf: engine.olafOk && engine.index?.olaf.available !== false,
      summary: engine.index
        ? `Версия ${engine.index.version} от ${formatLocal(engine.index.builtAt, "Europe/Moscow")} МСК: треков каталога ${engine.index.counts.catalog}, контрольных чужих ${engine.index.counts.control}${mb(engine.index.sizeBytes)}.${registry ? ` ${REGISTRY_STATUS_TEXT[registry.status].replace(/^./, (c) => c.toUpperCase())}${registry.registered_at ? ` ${formatLocal(registry.registered_at, "Europe/Moscow")} МСК` : ""}.` : ""}`
        : null,
      build: engine.build
        ? engine.build.state === "running"
          ? `Сборка: ${engine.build.done ?? 0} из ${engine.build.total ?? "?"} треков.`
          : engine.build.state === "waiting"
            ? "Сборка ждёт очереди."
            : engine.build.state === "failed"
              ? "Последняя сборка не удалась."
              : null
        : null,
      building: engine.build?.state === "running" || engine.build?.state === "waiting",
      failed: engine.index?.failed.map((f) => f.code) ?? [],
    };
    const names = new Map(locations.map((l) => [l.id, l.label]));
    jobs = (await listJobs()).map((j) => ({
      id: j.id,
      created: `${formatLocal(j.createdAtUtc, "Europe/Moscow")} МСК`,
      name: j.input.name,
      state: JOB_STATE_TEXT[j.state] ?? j.state,
      place: j.locationId ? names.get(j.locationId) ?? null : null,
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
        Доказательства для споров с РАО и ВОИС: сверка записи инспектора с каталогом и журналом воспроизведения,
        выписка журнала с хешами и печатью сервиса.
      </p>
      {loadError ? (
        <div className="mt-5 rounded-[22px] border border-[#efc7cf] bg-[#fff8f9] p-5 text-sm text-[#b34f63]">
          Не удалось загрузить данные. Попробуйте обновить страницу.
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          <BusinessEvidenceMatcherPanel index={index} locations={locations} jobs={jobs} />
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
