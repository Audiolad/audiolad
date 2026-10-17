// Mounted (React 19 client, StrictMode) checks for the evidence file field: selection,
// replace, remove, provider reset, image load / error states and object-URL cleanup.
// Uses the repository's small test DOM (no extra dependency).
import assert from "node:assert/strict";
import { StrictMode, act, createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import * as fieldModule from "../src/components/author-dashboard/business/EvidenceFileField";
import type { RightsholderEvidenceKind } from "../src/lib/business-rightsholder/examples";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod: any = fieldModule;
const Field = typeof mod.default === "function" ? mod.default : mod.default?.default;
const useEvidencePreviews = mod.useEvidencePreviews ?? mod.default?.useEvidencePreviews;

const created: string[] = [];
const revoked: string[] = [];
let n = 0;
URL.createObjectURL = () => { const u = `blob:test-${++n}`; created.push(u); return u; };
URL.revokeObjectURL = (u: string) => { revoked.push(u); };

type Api = { select: (kind: RightsholderEvidenceKind, file: File | null) => void; reset: () => void };
const api: Partial<Api> = {};

function Harness() {
  const { previews, setPreview, clearPreviews } = useEvidencePreviews();
  const [files, setFiles] = useState<Record<RightsholderEvidenceKind, File | null>>({ generation: null, paid_period: null });
  useEffect(() => {
    api.select = (kind, file) => { setPreview(kind, file); setFiles((p) => ({ ...p, [kind]: file })); };
    api.reset = () => { clearPreviews(); setFiles({ generation: null, paid_period: null }); };
  });
  return createElement("div", null, (["generation", "paid_period"] as const).map((kind) =>
    createElement(Field, {
      key: kind, kind, inputId: `f-${kind}`, label: kind, required: true, hint: "h",
      file: files[kind], previewUrl: previews[kind] ?? null, onSelect: (f: File | null) => api.select!(kind, f),
    })));
}

function all(node: Node, out: Element[] = []): Element[] {
  for (const child of Array.from(node.childNodes ?? [])) {
    if ((child as Element).nodeType === 1) { out.push(child as Element); all(child, out); }
  }
  return out;
}
const text = (node: Node): string => (node.nodeType === 3 ? node.nodeValue ?? "" : Array.from(node.childNodes ?? []).map(text).join(""));
const field = (c: Node, kind: string) => all(c).find((el) => el.getAttribute("data-evidence-field") === kind)!;
const imgOf = (el: Element) => all(el).find((x) => x.tagName === "IMG");
const buttons = (el: Element) => all(el).filter((x) => x.tagName === "BUTTON");

async function fire(el: Element, type: string) {
  await act(async () => {
    const ev = new Event(type, { bubbles: false });
    el.dispatchEvent(ev);
  });
}

async function main() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(StrictMode, null, createElement(Harness))));

  const gen = () => field(container, "generation");
  assert.match(text(gen()), /Выбрать файл/);
  assert.equal(gen().getAttribute("data-evidence-state"), "empty");

  // Select an image: thumbnail + «Загружается…» until decoded, then «✓ Скриншот загружен».
  const png = new File([new Uint8Array(100)], "shot.png", { type: "image/png" });
  await act(async () => api.select!("generation", png));
  let img = imgOf(gen());
  assert.ok(img, "thumbnail rendered");
  assert.equal(img!.getAttribute("src"), "blob:test-1");
  assert.match(text(gen()), /Загружается…/);
  await fire(img!, "load");
  assert.match(text(gen()), /✓ Скриншот загружен/);
  assert.equal(gen().getAttribute("data-evidence-state"), "ok");
  assert.deepEqual(buttons(gen()).map((b) => text(b)).filter((t) => t === "Заменить" || t === "Удалить"), ["Заменить", "Удалить"]);

  // Replace: old URL revoked, new one shown, decode state reset.
  const webp = new File([new Uint8Array(100)], "shot2.webp", { type: "image/webp" });
  await act(async () => api.select!("generation", webp));
  img = imgOf(gen());
  assert.equal(img!.getAttribute("src"), "blob:test-2");
  assert.deepEqual(revoked, ["blob:test-1"]);
  assert.match(text(gen()), /Загружается…/);
  await fire(img!, "error");
  assert.match(text(gen()), /Не удалось открыть изображение – выберите другой файл/);
  assert.equal(gen().getAttribute("data-evidence-state"), "error");

  // Remove via the «Удалить» button.
  const remove = buttons(gen()).find((b) => text(b) === "Удалить")!;
  await act(async () => { (remove as HTMLElement).click(); });
  assert.match(text(gen()), /Выбрать файл/);
  assert.deepEqual(revoked, ["blob:test-1", "blob:test-2"]);

  // PDF: icon, no object URL, done at once.
  const pdf = new File([new Uint8Array(100)], "receipt.pdf", { type: "application/pdf" });
  await act(async () => api.select!("paid_period", pdf));
  const paid = field(container, "paid_period");
  assert.equal(imgOf(paid), undefined);
  assert.match(text(paid), /receipt\.pdf/);
  assert.match(text(paid), /✓ PDF загружен/);
  assert.equal(created.length, 2);

  // Provider reset clears everything; unmount revokes what is still live.
  await act(async () => api.select!("generation", png));
  await act(async () => api.reset!());
  assert.deepEqual(revoked, ["blob:test-1", "blob:test-2", "blob:test-3"]);
  assert.match(text(field(container, "paid_period")), /Выбрать файл/);
  await act(async () => api.select!("generation", png));
  await act(async () => root.unmount());
  assert.deepEqual(revoked, ["blob:test-1", "blob:test-2", "blob:test-3", "blob:test-4"]);
  console.log("business-evidence-file-field-mounted-unit: ok");
}

main().catch((error) => { console.error(error); process.exit(1); });
