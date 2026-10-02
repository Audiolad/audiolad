import type { ReactNode } from "react";

import type { MusicAnalyzerPassport, PassportFact, PassportRow, PassportTone } from "@/lib/music-analyzer-runs/passport";

function toneClass(tone: PassportTone | null): string {
  if (tone === "high") return "bg-[#efe6ff] text-[#25135c]";
  if (tone === "medium") return "bg-[#f7f1e4] text-[#5c4a78]";
  if (tone === "low") return "bg-[#f4f1f8] text-[#796ba0]";
  return "bg-[#f6f3fb] text-[#5c4a78]";
}

function Card({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`rounded-[22px] border border-[#e4d7f4] bg-white p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <h4 className="text-sm font-medium text-[#796ba0]">{title}</h4>
      <div className="mt-2 text-sm leading-6 text-[#25135c]">{children}</div>
    </section>
  );
}

function Fact({ fact }: { fact: PassportFact }) {
  return (
    <div>
      <p className="text-base font-semibold text-[#25135c]">{fact.headline}</p>
      {fact.lines.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-sm text-[#5c4a78]">
          {fact.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Rows({ rows, emphasizeFirst = false }: { rows: PassportRow[]; emphasizeFirst?: boolean }) {
  if (rows.length === 0) return <p>—</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((row, index) => (
        <li key={`${row.label}-${row.rank ?? index}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={emphasizeFirst && index === 0 ? "font-semibold" : undefined}>{row.label}</span>
          {row.score ? <span className="text-[#796ba0]">{row.score}</span> : null}
          {row.rank != null ? <span className="text-[#796ba0]">ранг {row.rank}</span> : null}
          {row.bandLabel ? (
            <span className={`rounded-full px-2 py-0.5 text-xs ${toneClass(row.tone)}`}>{row.bandLabel}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function RunPassport({ passport }: { passport: MusicAnalyzerPassport }) {
  return (
    <section className="space-y-3" aria-labelledby="music-passport-heading">
      <div>
        <h3 id="music-passport-heading" className="text-lg font-semibold text-[#25135c]">
          Музыкальный паспорт
        </h3>
        <p className="mt-1 text-sm text-[#796ba0]">Результат анализа</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="Темп (BPM)">
          <Fact fact={passport.bpm} />
        </Card>
        <Card title="Тональность">
          <Fact fact={passport.key} />
        </Card>
        <Card title="Жанр">
          <Rows rows={passport.genres} emphasizeFirst />
        </Card>
        <Card title="Стиль">
          <Rows rows={passport.styles} emphasizeFirst />
        </Card>
        <Card title="Характер / настроение">
          <Rows rows={passport.moods} emphasizeFirst />
        </Card>
        <Card title="Инструменты">
          <Rows rows={passport.instruments} />
        </Card>
        <Card title="Звучание">
          {passport.sound ? <Rows rows={[passport.sound]} emphasizeFirst /> : <p>—</p>}
        </Card>
        <Card title="Техническое" wide>
          <dl className="grid gap-2 sm:grid-cols-2">
            {passport.technical.map((row) => (
              <div key={row.label}>
                <dt className="text-[#796ba0]">{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </section>
  );
}
