"use client";

import { useSyncExternalStore } from "react";

import type { GuideWorksheet as GuideWorksheetData } from "@/lib/business/vertical-guides/types";

import { GuideParagraphs } from "./GuideSections";

/**
 * Blank for the reader's own coffee shop: the same criteria as the article table, with an
 * empty field per row. Answers stay only in this browser (`localStorage`, like the
 * checklist); nothing is sent anywhere. «Очистить» empties the blank.
 */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readRaw(storageKey: string): string {
  try {
    return window.localStorage.getItem(storageKey) ?? memory.get(storageKey) ?? "";
  } catch {
    return memory.get(storageKey) ?? "";
  }
}

function parseValues(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

function write(storageKey: string, values: Record<string, string>) {
  const raw = JSON.stringify(values);
  memory.set(storageKey, raw);
  try {
    window.localStorage.setItem(storageKey, raw);
  } catch {
    // Private mode: keep the values in memory for this visit.
  }
  for (const listener of listeners) listener();
}

export default function GuideWorksheet({ worksheet }: { worksheet: GuideWorksheetData }) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(worksheet.storageKey), () => "");
  const values = parseValues(raw);
  const filled = worksheet.fields.filter((field) => (values[field.id] ?? "").trim().length > 0).length;

  return (
    <section className="guide-wrap guide-block guide-prose guide-worksheet" aria-labelledby={worksheet.id} data-guide-worksheet="true">
      <h2 id={worksheet.id} className="guide-display guide-h2">
        {worksheet.heading}
      </h2>
      <GuideParagraphs paragraphs={worksheet.intro} keyPrefix={`${worksheet.id}-intro`} />
      <div className="guide-worksheet__card">
        <p className="guide-worksheet__progress" aria-live="polite">
          Заполнено {filled} из {worksheet.fields.length}
        </p>
        {worksheet.fields.map((field) => (
          <label key={field.id} className="guide-worksheet__field">
            <span className="guide-worksheet__label">{field.label}</span>
            <textarea
              rows={2}
              value={values[field.id] ?? ""}
              placeholder={field.hint}
              onChange={(event) => write(worksheet.storageKey, { ...values, [field.id]: event.target.value })}
            />
          </label>
        ))}
        <div className="guide-worksheet__actions">
          <button type="button" className="guide-worksheet__clear" onClick={() => write(worksheet.storageKey, {})}>
            Очистить бланк
          </button>
        </div>
        <p className="guide-worksheet__note">{worksheet.note}</p>
      </div>
    </section>
  );
}
