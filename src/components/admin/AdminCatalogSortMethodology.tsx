"use client";

import { useState } from "react";

import {
  CATALOG_SORT_METHODOLOGY_CHANGELOG,
  CATALOG_SORT_METHODOLOGY_SECTIONS,
  CATALOG_SORT_METHODOLOGY_VERSION,
} from "@/lib/admin/catalog-sort-methodology";

export default function AdminCatalogSortMethodology() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm"
      data-admin-catalog-sort-methodology
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-[#25135c]">
          Методика расчёта популярности и рейтинга
        </span>
        <span className="text-sm text-[#7042c5]">{open ? "Скрыть" : "Открыть"}</span>
      </button>

      {open ? (
        <div className="mt-4 space-y-4 text-sm leading-6 text-[#5d4f7d]">
          <p className="text-xs text-[#9485b4]">
            Версия методики: {CATALOG_SORT_METHODOLOGY_VERSION}
          </p>

          {CATALOG_SORT_METHODOLOGY_SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="font-semibold text-[#25135c]">{section.title}</h3>
              <p className="mt-1">{section.body}</p>
            </section>
          ))}

          <section>
            <h3 className="font-semibold text-[#25135c]">Журнал изменений</h3>
            <ul className="mt-2 space-y-1">
              {CATALOG_SORT_METHODOLOGY_CHANGELOG.map((entry) => (
                <li key={entry.version}>
                  <span className="font-medium text-[#25135c]">{entry.version}</span>
                  {" — "}
                  {entry.summary}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}