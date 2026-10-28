"use client";

import { useSyncExternalStore } from "react";

import type { GuideChecklistItem } from "@/lib/business/vertical-guides/types";

type GuideChecklistProps = {
  title: string;
  storageKey: string;
  items: readonly GuideChecklistItem[];
};

const memory = new Map<string, string>();
const failedWrites = new Set<string>();
const listeners = new Set<() => void>();

function subscribeChecklist(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    try {
      if (event.storageArea !== window.localStorage) {
        return;
      }
    } catch {
      return;
    }
    if (event.key === null) {
      memory.clear();
      failedWrites.clear();
    } else {
      memory.set(event.key, event.newValue ?? "");
      failedWrites.delete(event.key);
    }
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readRaw(storageKey: string): string {
  if (failedWrites.has(storageKey)) {
    return memory.get(storageKey) ?? "";
  }
  try {
    return window.localStorage.getItem(storageKey) ?? "";
  } catch {
    return memory.get(storageKey) ?? "";
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
  const raw = useSyncExternalStore(subscribeChecklist, () => readRaw(storageKey), () => "");
  const checked = parseChecked(raw, items.map((item) => item.id));

  function toggle(id: string) {
    const next = checked.includes(id) ? checked.filter((item) => item !== id) : [...checked, id];
    const nextRaw = JSON.stringify(next);
    memory.set(storageKey, nextRaw);
    try {
      window.localStorage.setItem(storageKey, nextRaw);
      failedWrites.delete(storageKey);
    } catch {
      failedWrites.add(storageKey);
    }
    for (const listener of listeners) {
      listener();
    }
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
