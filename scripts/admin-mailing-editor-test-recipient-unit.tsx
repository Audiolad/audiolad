import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import MailingEditor, { MAILING_TEST_RECIPIENT_PRESETS } from "../src/components/admin/MailingEditor";

const YANDEX_LABEL = "Яндекс — petpovss@yandex.ru";
const YANDEX_EMAIL = "petpovss@yandex.ru";
const AUDIOLAD_LABEL = "АудиоЛад — 1@audiolad.ru";
const AUDIOLAD_EMAIL = "1@audiolad.ru";
const MANUAL_EMAIL = "manual-check@example.com";

type RecordedSend = {
  requestedEmail?: unknown;
  audienceType?: unknown;
  campaignId?: unknown;
};

type ActionLog = {
  sends: RecordedSend[];
  launches: unknown[];
  saves: unknown[];
  previews: unknown[];
  searches: unknown[];
};

function actionLog(): ActionLog {
  const bucket = (globalThis as typeof globalThis & { __audioladMailingEditorTest?: ActionLog })
    .__audioladMailingEditorTest;
  if (!bucket) {
    throw new Error("Мок действия рассылки не установлен");
  }
  return bucket;
}

function resetActionLog() {
  (globalThis as typeof globalThis & { __audioladMailingEditorTest?: ActionLog }).__audioladMailingEditorTest = {
    sends: [],
    launches: [],
    saves: [],
    previews: [],
    searches: [],
  };
}

const initial = {
  name: "Проверка пресетов",
  messageType: "author_operational" as const,
  subject: "Тема теста",
  preheader: "",
  heading: "Заголовок",
  paragraphs: "Текст письма",
  ctaLabel: "",
  ctaUrl: "",
  infoTitle: "",
  infoText: "",
  secondaryLabel: "",
  secondaryUrl: "",
  filterKind: "all_authors" as const,
  authorIds: [] as string[],
};

function elementsUnder(node: Node): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes.item(index);
    if (!child || child.nodeType !== Node.ELEMENT_NODE) continue;
    const element = child as HTMLElement;
    found.push(element, ...elementsUnder(element));
  }
  return found;
}

function buttonByLabel(container: ParentNode, label: string): HTMLButtonElement {
  const matches = elementsUnder(container).filter(
    (element) => element.tagName === "BUTTON" && (element.textContent ?? "").trim() === label,
  );
  assert.equal(matches.length, 1, label);
  return matches[0] as HTMLButtonElement;
}

function emailInput(container: ParentNode): HTMLInputElement {
  const matches = elementsUnder(container).filter(
    (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "один адрес",
  );
  assert.equal(matches.length, 1);
  return matches[0] as HTMLInputElement;
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  const setValue = descriptor?.set;
  if (typeof setValue !== "function") {
    throw new Error("input value setter is missing");
  }
  setValue.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function renderEditor(props: { canSend: boolean; campaignId?: string }) {
  resetActionLog();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(MailingEditor, {
        campaignId: props.campaignId,
        canSend: props.canSend,
        initial,
      }),
    );
  });
  return {
    container,
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function main() {
  assert.deepEqual(
    MAILING_TEST_RECIPIENT_PRESETS.map((preset) => ({ label: preset.label, email: preset.email })),
    [
      { label: YANDEX_LABEL, email: YANDEX_EMAIL },
      { label: AUDIOLAD_LABEL, email: AUDIOLAD_EMAIL },
    ],
  );

  const opened = await renderEditor({ canSend: true });
  const yandex = buttonByLabel(opened.container, YANDEX_LABEL);
  const audiolad = buttonByLabel(opened.container, AUDIOLAD_LABEL);
  const input = emailInput(opened.container);
  assert.equal(yandex.getAttribute("aria-pressed"), "false");
  assert.equal(audiolad.getAttribute("aria-pressed"), "false");
  assert.equal(input.value, "");
  assert.equal(actionLog().sends.length, 0);
  assert.equal(actionLog().launches.length, 0);

  await act(async () => {
    yandex.click();
  });
  assert.equal(input.value, YANDEX_EMAIL);
  assert.equal(yandex.getAttribute("aria-pressed"), "true");
  assert.equal(audiolad.getAttribute("aria-pressed"), "false");
  assert.equal(actionLog().sends.length, 0, "выбор Яндекса не отправляет письмо");
  assert.equal(actionLog().launches.length, 0);
  assert.equal(actionLog().saves.length, 0);

  await act(async () => {
    audiolad.click();
  });
  assert.equal(input.value, AUDIOLAD_EMAIL);
  assert.equal(yandex.getAttribute("aria-pressed"), "false");
  assert.equal(audiolad.getAttribute("aria-pressed"), "true");
  assert.equal(actionLog().sends.length, 0, "выбор АудиоЛад не отправляет письмо");

  await act(async () => {
    setNativeInputValue(input, MANUAL_EMAIL);
  });
  assert.equal(emailInput(opened.container).value, MANUAL_EMAIL);
  assert.equal(buttonByLabel(opened.container, YANDEX_LABEL).getAttribute("aria-pressed"), "false");
  assert.equal(buttonByLabel(opened.container, AUDIOLAD_LABEL).getAttribute("aria-pressed"), "false");
  assert.equal(actionLog().sends.length, 0, "ручной ввод не отправляет письмо");

  await act(async () => {
    buttonByLabel(opened.container, "Отправить тест").click();
  });
  assert.equal(actionLog().sends.length, 1);
  assert.equal(actionLog().launches.length, 0);
  assert.equal(actionLog().sends[0]?.requestedEmail, MANUAL_EMAIL);
  assert.equal(typeof actionLog().sends[0]?.requestedEmail, "string");
  assert.match(opened.container.textContent ?? "", new RegExp(`Тест отправлен на ${MANUAL_EMAIL}`));

  await act(async () => {
    buttonByLabel(opened.container, YANDEX_LABEL).click();
  });
  assert.equal(actionLog().sends.length, 1);
  await act(async () => {
    buttonByLabel(opened.container, "Отправить тест").click();
  });
  assert.equal(actionLog().sends.length, 2);
  assert.equal(actionLog().sends[1]?.requestedEmail, YANDEX_EMAIL);
  assert.equal(String(actionLog().sends[1]?.requestedEmail).includes(","), false);
  assert.equal(String(actionLog().sends[1]?.requestedEmail).includes(";"), false);
  assert.equal(actionLog().launches.length, 0);
  assert.match(opened.container.textContent ?? "", new RegExp(`Тест отправлен на ${YANDEX_EMAIL}`));
  await opened.cleanup();

  (globalThis as { __audioladMailingListing?: unknown }).__audioladMailingListing = {
    ok: true,
    summary: {},
    total: 3,
    truncated: false,
    entries: [
      { name: "Тест Один", email: "one@example.com", status: "queued", reason: null },
      { name: "Тест Два", email: "one@example.com", status: "excluded", reason: "duplicate" },
      { name: "Тест Три", email: "very.long.address.for.wrapping@example.com", status: "excluded", reason: "consent" },
    ],
  };
  const listed = await renderEditor({ canSend: false });
  assert.equal(actionLog().previews.length, 0, "список не грузится до нажатия");
  assert.doesNotMatch(listed.container.textContent ?? "", /Тест Один/);
  await act(async () => {
    buttonByLabel(listed.container, "Показать получателей").click();
  });
  const listedText = listed.container.textContent ?? "";
  assert.equal(actionLog().previews.length, 1);
  assert.match(listedText, /Тест Один/);
  assert.match(listedText, /one@example\.com/);
  assert.match(listedText, /Исключены \(2\)/);
  assert.match(listedText, /Дубль адреса — один адрес получит письмо один раз/);
  assert.match(listedText, /Нет согласия/);
  const closeButton = elementsUnder(listed.container).find((el) => el.getAttribute("aria-label") === "Закрыть");
  assert.ok(closeButton?.className.includes("h-11"));
  await act(async () => {
    (closeButton as HTMLElement).click();
  });
  assert.doesNotMatch(listed.container.textContent ?? "", /Тест Один/);
  Object.defineProperty(document.body, "style", { value: { overflow: "" }, configurable: true });
  await act(async () => {
    buttonByLabel(listed.container, "Показать получателей").click();
  });
  assert.equal(document.body.style.overflow, "hidden", "фон не скроллится при открытом списке");
  await act(async () => {
    const escape = new Event("keydown", { bubbles: true }) as Event & { key?: string };
    escape.key = "Escape";
    document.dispatchEvent(escape);
  });
  assert.doesNotMatch(listed.container.textContent ?? "", /Тест Один/, "Esc закрывает список");
  assert.notEqual(document.body.style.overflow, "hidden");
  await listed.cleanup();

  const existing = await renderEditor({ canSend: true, campaignId: "10000000-0000-4000-8000-000000000001" });
  assert.equal(buttonByLabel(existing.container, YANDEX_LABEL).getAttribute("aria-pressed"), "false");
  assert.equal(buttonByLabel(existing.container, AUDIOLAD_LABEL).getAttribute("aria-pressed"), "false");
  assert.equal(emailInput(existing.container).value, "");
  assert.equal(elementsUnder(existing.container).some((element) => element.textContent?.trim() === "Отправить"), true);
  await act(async () => {
    buttonByLabel(existing.container, AUDIOLAD_LABEL).click();
  });
  assert.equal(actionLog().sends.length, 0);
  assert.equal(emailInput(existing.container).value, AUDIOLAD_EMAIL);
  await act(async () => {
    buttonByLabel(existing.container, "Отправить тест").click();
  });
  assert.equal(actionLog().sends.length, 1);
  assert.equal(actionLog().sends[0]?.requestedEmail, AUDIOLAD_EMAIL);
  assert.equal(actionLog().sends[0]?.campaignId, "10000000-0000-4000-8000-000000000001");
  assert.equal(actionLog().launches.length, 0);
  assert.match(existing.container.textContent ?? "", new RegExp(`Тест отправлен на ${AUDIOLAD_EMAIL}`));
  await existing.cleanup();

  const hidden = await renderEditor({ canSend: false, campaignId: "10000000-0000-4000-8000-000000000001" });
  assert.equal((hidden.container.textContent ?? "").includes(YANDEX_LABEL), false);
  assert.equal((hidden.container.textContent ?? "").includes(AUDIOLAD_LABEL), false);
  assert.equal((hidden.container.textContent ?? "").includes("Куда отправить тест"), false);
  assert.equal((hidden.container.textContent ?? "").includes("Отправить тест"), false);
  assert.equal(actionLog().sends.length, 0);
  assert.equal(actionLog().launches.length, 0);
  await hidden.cleanup();

  console.log("admin-mailing-editor-test-recipient-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
