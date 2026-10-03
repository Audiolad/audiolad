import {
  formatAnalyzedAtMoscow,
  formatDisplayedBpm,
  formatDisplayedDuration,
  formatDisplayedLufs,
  formatDisplayedMeasureDetail,
  formatDisplayedQuantity,
  instrumentPlaceLabel,
  rowQuantityDisplay,
} from "@/lib/music-analyzer-runs/passport-display";
import type {
  MusicAnalyzerPassport,
  PassportMeasureDisplay,
  PassportRow,
  PassportTone,
} from "@/lib/music-analyzer-runs/passport";

export type MusicPassportMode = "full" | "product";

/** Identity of one run. Commit and snapshot SHA stay out of this model. */
export type MusicPassportHeader = {
  filename: string;
  analyzedAt: string | null;
  analyzerVersion: string | null;
  statusLabel: string;
  fileVersion: number | null;
};

export type MusicPassportAnalyzerSnapshot = {
  version: string | null;
  commit: string | null;
};

export type MusicPassportAnalyzerProvenance = {
  sha256: string | null;
  analyzerGitCommit: string | null;
  analyzerContentCommit: string | null;
  modelCheckpoint: string | null;
  device: string | null;
  taxonomy: string | null;
  prompt: string | null;
};

type MusicPassportProps = {
  mode: MusicPassportMode;
  passport: MusicAnalyzerPassport | null;
  header: MusicPassportHeader;
  snapshot: MusicPassportAnalyzerSnapshot;
  provenance: MusicPassportAnalyzerProvenance;
  developerJson?: unknown;
  notice?: { tone: "error" | "info"; text: string } | null;
};

function toneClass(tone: PassportTone | null): string {
  if (tone === "high") return "bg-[#efe6ff] text-[#25135c]";
  if (tone === "medium") return "bg-[#f7f1e4] text-[#5c4a78]";
  if (tone === "low") return "bg-[#f4f1f8] text-[#796ba0]";
  return "bg-[#f6f3fb] text-[#5c4a78]";
}

function badgeClass(status: PassportMeasureDisplay["status"]): string {
  if (status === "published") return "bg-[#efe6ff] text-[#25135c]";
  return "bg-[#f7f1e4] text-[#6b4e16]";
}

function shown(value: string | null | undefined): string {
  if (typeof value === "string" && value.trim()) return value;
  return "не указано";
}

function displayedQuantity(value: string | null): string | null {
  return formatDisplayedQuantity(value);
}

function Tag({ row }: { row: PassportRow }) {
  const quantity = rowQuantityDisplay(row);
  const primary = displayedQuantity(quantity.primary);
  const max = displayedQuantity(quantity.max);
  const visible = primary ?? max;
  return (
    <li className={`inline-flex max-w-full flex-wrap items-baseline gap-x-2 rounded-full px-3 py-1 text-sm ${toneClass(row.tone)}`}>
      <span className="font-medium" data-passport-signal="label">{row.label}</span>
      {row.bandLabel ? (
        <span className="font-medium" data-passport-signal="band">{row.bandLabel}</span>
      ) : null}
      {visible ? (
        <span className="text-[11px] font-normal text-[#796ba0]" data-passport-quantity="secondary">{visible}</span>
      ) : null}
      {primary && max ? (
        <span className="text-[11px] font-normal text-[#796ba0]" data-passport-quantity="secondary">max {max}</span>
      ) : null}
    </li>
  );
}

function TagGroup({ title, rows }: { title: string; rows: PassportRow[] }) {
  return (
    <section className="rounded-[22px] border border-[#e4d7f4] bg-white p-4">
      <h3 className="text-sm font-medium text-[#796ba0]">{title}</h3>
      {rows.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {rows.map((row, index) => (
            <Tag key={`${row.label}-${row.rank ?? index}`} row={row} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#796ba0]">не указано</p>
      )}
    </section>
  );
}

function MeasureCard({
  title,
  measure,
  unit,
}: {
  title: string;
  measure: PassportMeasureDisplay;
  unit: string | null;
}) {
  const detail = formatDisplayedMeasureDetail(measure);
  const bpm = unit === "BPM";
  const primary = bpm ? formatDisplayedBpm(measure.primary) ?? measure.primary : measure.primary;
  const secondary = bpm ? formatDisplayedBpm(measure.secondary) ?? measure.secondary : measure.secondary;
  return (
    <section className="rounded-[22px] border border-[#e4d7f4] bg-white p-4">
      <h3 className="text-sm font-medium text-[#796ba0]">{title}</h3>
      <p className="mt-3 text-[2rem] font-semibold leading-none tracking-tight text-[#25135c]">
        {primary ?? "—"}
      </p>
      {primary && unit ? <p className="mt-2 text-sm font-medium text-[#796ba0]">{unit}</p> : null}
      {!primary ? <p className="mt-2 text-sm text-[#796ba0]">не указано</p> : null}
      {measure.badge ? (
        <p className="mt-3">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass(measure.status)}`}>
            {measure.badge}
          </span>
        </p>
      ) : null}
      {secondary ? (
        <p className="mt-2 text-sm text-[#5c4a78]">
          кандидат: {secondary}{unit ? ` ${unit}` : ""}
        </p>
      ) : null}
      {detail ? (
        <p className={`mt-2 text-sm ${measure.withheld ? "text-[#8a5a2a]" : "text-[#796ba0]"}`}>{detail}</p>
      ) : null}
      {measure.confidence ? <p className="mt-2 text-xs text-[#796ba0]">{measure.confidence}</p> : null}
    </section>
  );
}

function InstrumentList({ rows }: { rows: PassportRow[] }) {
  return (
    <section className="rounded-[22px] border border-[#e4d7f4] bg-white p-4">
      <h3 className="text-sm font-medium text-[#796ba0]">Инструменты</h3>
      {rows.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {rows.map((row, index) => {
            const quantity = rowQuantityDisplay(row);
            const primary = displayedQuantity(quantity.primary);
            const max = displayedQuantity(quantity.max);
            const visible = primary ?? max;
            return (
              <li key={`${row.label}-${row.rank ?? index}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-[#25135c]">
                <span className="min-w-28 text-[#796ba0]">{instrumentPlaceLabel(row, index)}</span>
                <span className="font-medium">{row.label}</span>
                <span className="text-[#796ba0]">{visible ?? "оценка не указана"}</span>
                {primary && max ? <span className="text-xs text-[#796ba0]">max {max}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-[#796ba0]">не указано</p>
      )}
    </section>
  );
}

function ProvenanceList({
  provenance,
  snapshot,
}: {
  provenance: MusicPassportAnalyzerProvenance;
  snapshot: MusicPassportAnalyzerSnapshot;
}) {
  const snapshotCommit = snapshot.commit && snapshot.commit !== provenance.analyzerGitCommit
    ? snapshot.commit
    : null;
  const rows: Array<{ label: string; value: string | null; mono?: boolean }> = [
    { label: "Версия анализатора", value: snapshot.version ?? provenance.analyzerGitCommit },
    ...(snapshotCommit ? [{ label: "Снимок", value: snapshotCommit, mono: true }] : []),
    { label: "SHA256", value: provenance.sha256, mono: true },
    { label: "Коммит анализатора", value: provenance.analyzerGitCommit, mono: true },
    { label: "Содержание", value: provenance.analyzerContentCommit, mono: true },
    { label: "Чекпоинт", value: provenance.modelCheckpoint },
    { label: "Устройство", value: provenance.device },
    { label: "Таксономия", value: provenance.taxonomy },
    { label: "Промпт", value: provenance.prompt },
  ];
  return (
    <dl className="grid gap-3 border-t border-[#e4d7f4] p-4 text-sm sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-[#796ba0]">{row.label}</dt>
          <dd className={`mt-1 break-all text-[#25135c] ${row.mono ? "font-mono text-xs" : ""}`}>{shown(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

const INSTRUMENT_LIMIT: Record<MusicPassportMode, number> = {
  full: 10,
  product: 5,
};

function technicalValue(label: string, value: string): string {
  if (value === "—" || !value.trim()) return "не указано";
  if (label === "Длительность") return formatDisplayedDuration(value) ?? "не указано";
  if (label === "LUFS") return formatDisplayedLufs(value) ?? value;
  return value;
}

export function MusicPassport({
  mode,
  passport,
  header,
  snapshot,
  provenance,
  developerJson,
  notice = null,
}: MusicPassportProps) {
  const research = mode === "full";
  const showDeveloperJson = research && developerJson != null;
  const instruments = passport?.instruments.slice(0, INSTRUMENT_LIMIT[mode]) ?? [];
  const statusLine = [
    research ? "Музыкальный паспорт · экспериментальная версия" : "Музыкальный паспорт",
    header.statusLabel,
    header.fileVersion != null ? `прогон ${header.fileVersion}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <section className="space-y-4" aria-labelledby="music-passport-heading">
      <header data-passport-header="true">
        <p className="text-xs font-medium text-[#796ba0]">{statusLine}</p>
        <h2 id="music-passport-heading" className="mt-2 text-[22px] font-semibold text-[#25135c]">
          {header.filename}
        </h2>
        <p className="mt-1 text-sm text-[#25135c]">{formatAnalyzedAtMoscow(header.analyzedAt)}</p>
      </header>
      {notice ? (
        <p className={`text-sm ${notice.tone === "error" ? "text-[#8b2f4b]" : "text-[#796ba0]"}`}>{notice.text}</p>
      ) : null}
      {passport ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MeasureCard title="Темп" measure={passport.bpmDisplay} unit="BPM" />
            <MeasureCard title="Тональность" measure={passport.keyDisplay} unit={null} />
            <TagGroup title="Жанр" rows={passport.genres} />
            <TagGroup title="Стиль" rows={passport.styles} />
          </div>
          <TagGroup title="Характер и настроение" rows={passport.moods} />
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1 basis-full lg:basis-[28rem]">
              <InstrumentList rows={instruments} />
            </div>
            <section
              className="w-fit max-w-full self-start rounded-[22px] border border-[#e4d7f4] bg-white p-4"
              data-sound-character="fit"
            >
              <h3 className="text-sm font-medium text-[#796ba0]">Характер звучания</h3>
              {passport.sound ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  <Tag row={passport.sound} />
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[#796ba0]">не указано</p>
              )}
            </section>
          </div>
          <section className="rounded-[22px] border border-[#e4d7f4] bg-white p-4">
            <h3 className="text-sm font-medium text-[#796ba0]">Технические данные</h3>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {passport.technical.map((row) => (
                <li key={row.label}>
                  <span className="text-[#796ba0]">{row.label}</span>{" "}
                  <span className="text-[#25135c]">{technicalValue(row.label, row.value)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
      {research ? (
        <details className="rounded-[22px] border border-[#e4d7f4] bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[#25135c]">О версии анализа</summary>
          <ProvenanceList
            provenance={provenance}
            snapshot={{
              version: snapshot.version ?? header.analyzerVersion,
              commit: snapshot.commit,
            }}
          />
        </details>
      ) : null}
      {showDeveloperJson ? (
        <details className="rounded-[22px] border border-[#e4d7f4] bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[#25135c]">
            Данные разработчика / Raw JSON
          </summary>
          <pre className="max-h-[32rem] overflow-auto border-t border-[#e4d7f4] p-4 text-xs leading-5 text-[#25135c]">
            {JSON.stringify(developerJson, null, 2)}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
