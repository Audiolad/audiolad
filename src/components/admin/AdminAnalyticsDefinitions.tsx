"use client";

import { useState } from "react";

import {
  ADMIN_ANALYTICS_METHOD_NOTES,
  ADMIN_METRIC_DEFINITIONS,
  metricKindLabel,
} from "@/lib/admin/analytics-metrics-dictionary";

export default function AdminAnalyticsDefinitions() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[22px] border border-[#eadff8] bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-[#25135c]">
          Как считается статистика
        </span>
        <span className="text-sm text-[#7042c5]">{open ? "Скрыть" : "Открыть"}</span>
      </button>

      {open ? (
        <div className="mt-4 space-y-4">
          <ul className="space-y-2 text-sm leading-6 text-[#5d4f7d]">
            {ADMIN_ANALYTICS_METHOD_NOTES.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>

          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="text-[#796ba0]">
                <tr className="border-b border-[#eadff8]">
                  <th className="px-2 py-2 font-medium">Метрика</th>
                  <th className="px-2 py-2 font-medium">Тип</th>
                  <th className="px-2 py-2 font-medium">Формула</th>
                  <th className="px-2 py-2 font-medium">≈ Метрика</th>
                </tr>
              </thead>
              <tbody>
                {ADMIN_METRIC_DEFINITIONS.map((metric) => (
                  <tr key={metric.key} className="border-b border-[#f3ecfb]">
                    <td className="px-2 py-3">
                      <p className="font-medium text-[#25135c]">{metric.label}</p>
                      <p className="text-xs text-[#9485b4]">{metric.shortDescription}</p>
                    </td>
                    <td className="px-2 py-3">{metricKindLabel(metric.kind)}</td>
                    <td className="px-2 py-3 text-xs text-[#5d4f7d]">
                      {metric.formula}
                      <span className="mt-1 block text-[#9485b4]">{metric.sqlSource}</span>
                    </td>
                    <td className="px-2 py-3">
                      {metric.comparableToMetrika ? "да" : "нет"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
