"use client";

import Link from "next/link";
import type { MusicLabResultsView } from "@/lib/music-lab/results-types";

export default function ResultsPanel({ view }: { view: MusicLabResultsView }) {
  if (view.locked) {
    return (
      <div className="rounded-[22px] border border-[#e4d7f4] bg-white p-6">
        <h2 className="text-[24px] font-semibold text-[#25135c]">Результаты закрыты</h2>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          Раздел откроется после завершения ручной оценки.
        </p>
        <Link href="/music-analyzer" className="mt-5 inline-flex text-sm font-medium text-[#7042c5]">
          К разделам
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#796ba0]">Результаты</p>
          <h2 className="text-[28px] font-semibold text-[#25135c]">Сводка проверки</h2>
        </div>
        <Link href="/music-analyzer" className="text-sm font-medium text-[#7042c5]">
          К разделам
        </Link>
      </div>

      <section className="rounded-[22px] border border-[#e4d7f4] bg-white p-5">
        <h3 className="text-lg font-semibold text-[#25135c]">Слепая похожесть</h3>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          Средняя человеческая оценка 0–3 после снятия анонимности наборов.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {view.similarity.map((system) => (
            <article key={system.label} className="rounded-[16px] bg-[#f7f2fc] p-4">
              <p className="text-sm text-[#796ba0]">{system.label}</p>
              <p className="mt-1 text-2xl font-semibold text-[#25135c]">
                {system.mean === null ? "—" : system.mean.toLocaleString("ru-RU")}
              </p>
              <p className="mt-1 text-xs text-[#796ba0]">Числовых оценок: {system.numericCount}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[22px] border border-[#e4d7f4] bg-white p-5">
        <h3 className="text-lg font-semibold text-[#25135c]">Поля паспорта</h3>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          Числа появятся после импорта готового результата. Модели здесь не считаются.
        </p>
        <ul className="mt-4 divide-y divide-[#f0e7f8]">
          {view.slots.map((slot) => (
            <li key={slot.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
              <span className="text-sm font-medium text-[#25135c]">{slot.title}</span>
              <span className="text-sm text-[#4d3f73]">
                {slot.text ?? "Ожидается импорт результата"}
                {slot.policyLabel ? ` · ${slot.policyLabel}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[22px] border border-[#e4d7f4] bg-white p-5">
        <h3 className="text-lg font-semibold text-[#25135c]">Политика поля</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {view.policies.map((policy) => (
            <li key={policy.code} className="rounded-full bg-[#f7f2fc] px-3 py-2 text-sm text-[#25135c]">
              {policy.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
