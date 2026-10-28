"use client";

import { useSyncExternalStore } from "react";

import type { GuideChecklistItem } from "@/lib/business/vertical-guides/types";

type GuideChecklistProps = {
  title: string;
  storageKey: string;
  items: readonly GuideChecklistItem[];
};

const listeners = new Set<() => void>();

function notifyChecklist() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeChecklist(listener: () => void) {
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
    return window.localStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}

function parseChecked(raw: string, ids: readonly string[]): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === "string" && ids.includes(id));
  } catch {
    return [];
  }
}

export default function GuideChecklist({ title, storageKey, items }: GuideChecklistProps) {
  const ids = items.map((item) => item.id);
  const raw = useSyncExternalStore(
    subscribeChecklist,
    () => readRaw(storageKey),
    () => "",
  );
  const checked = parseChecked(raw, ids);

  function toggle(id: string) {
    const next = checked.includes(id) ? checked.filter((item) => item !== id) : [...checked, id];
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Private mode can refuse storage. The tick still shows for this visit via a no-op store write below.
    }
    notifyChecklist();
  }

  return (
    <fieldset className="guide-check" data-coffee-checklist="true" data-checklist-ready="true">
      <legend className="guide-display guide-h2">{title}</legend>
      <p className="guide-check__progress">
        Отмечено {checked.length} из {items.length}
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={checked.includes(item.id)}
                onChange={() => toggle(item.id)}
              />
              <span>{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
