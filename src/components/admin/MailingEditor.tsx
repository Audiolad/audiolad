"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  launchMailingAction,
  previewMailingAction,
  previewMailingRecipientsAction,
  saveMailingDraftAction,
  searchMailingAuthorsAction,
  sendMailingTestAction,
} from "@/app/(platform)/admin/mailings/actions";
import type { AuthorCampaignFilter } from "@/lib/admin/mailings/validation";
import { formatHumanSenderLabel, getSenderIdentity } from "@/lib/email/sender-identities";
import { normalizeOptionalCampaignLink } from "@/lib/email/templates/manual-campaign";

type EditorProps = {
  campaignId?: string;
  canSend: boolean;
  initial: {
    name: string;
    messageType: "author_operational" | "author_marketing";
    subject: string;
    preheader: string;
    heading: string;
    paragraphs: string;
    ctaLabel: string;
    ctaUrl: string;
    infoTitle: string;
    infoText: string;
    secondaryLabel: string;
    secondaryUrl: string;
    filterKind: AuthorCampaignFilter["kind"];
    authorIds: string[];
  };
};

const fieldClass =
  "mt-1 w-full rounded-xl border border-[#e4d7f4] bg-white px-3 py-2 text-sm text-[#25135c] outline-none focus:border-[#7042c5]";

function paragraphsFromText(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function MailingEditor({ campaignId, canSend, initial }: EditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [authorQuery, setAuthorQuery] = useState("");
  const [authorHits, setAuthorHits] = useState<Array<{ authorId: string; name: string; email: string | null }>>([]);
  const sender = formatHumanSenderLabel(getSenderIdentity("authors"));

  const payload = useMemo(() => {
    const filter: AuthorCampaignFilter =
      state.filterKind === "specific_authors"
        ? { version: 1, kind: "specific_authors", authorIds: state.authorIds }
        : { version: 1, kind: state.filterKind };
    return {
      campaignId,
      name: state.name,
      audienceType: "authors",
      messageType: state.messageType,
      senderIdentity: "authors",
      subject: state.subject,
      preheader: state.preheader,
      filter,
      content: {
        heading: state.heading,
        paragraphs: paragraphsFromText(state.paragraphs),
        cta: normalizeOptionalCampaignLink({ label: state.ctaLabel, url: state.ctaUrl }),
        infoBlock: { title: state.infoTitle, text: state.infoText },
        secondaryLink: normalizeOptionalCampaignLink({
          label: state.secondaryLabel,
          url: state.secondaryUrl,
        }),
      },
    };
  }, [campaignId, state]);

  function update<K extends keyof typeof state>(key: K, value: (typeof state)[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
      <form
        className="space-y-4 rounded-3xl border border-[#e4d7f4] bg-white p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await saveMailingDraftAction(payload);
            if (!result.ok) {
              setMessage(`Не удалось сохранить: ${result.code}`);
              return;
            }
            setMessage("Черновик сохранён");
            if (!campaignId) {
              router.push(`/admin/mailings/${result.id}`);
            } else {
              router.refresh();
            }
          });
        }}
      >
        <label className="block text-sm font-semibold">
          Внутреннее название
          <input className={fieldClass} value={state.name} onChange={(event) => update("name", event.target.value)} />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Аудитория</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked readOnly /> Авторы
          </label>
          <label className="flex items-center gap-2 text-sm text-[#7d70a2]">
            <input type="radio" disabled /> Слушатели — скоро
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Тип письма</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={state.messageType === "author_operational"}
              onChange={() => update("messageType", "author_operational")}
            />
            Служебное
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={state.messageType === "author_marketing"}
              onChange={() => update("messageType", "author_marketing")}
            />
            Информационное / продвижение
          </label>
        </fieldset>

        <label className="block text-sm font-semibold">
          Отправитель
          <input className={fieldClass} value={sender} readOnly />
        </label>

        <label className="block text-sm font-semibold">
          Тема
          <input className={fieldClass} required value={state.subject} onChange={(event) => update("subject", event.target.value)} />
        </label>
        <label className="block text-sm font-semibold">
          Прехедер
          <input className={fieldClass} value={state.preheader} onChange={(event) => update("preheader", event.target.value)} />
        </label>
        <label className="block text-sm font-semibold">
          Заголовок
          <input className={fieldClass} required value={state.heading} onChange={(event) => update("heading", event.target.value)} />
        </label>
        <label className="block text-sm font-semibold">
          Текст
          <textarea
            className={`${fieldClass} min-h-40`}
            required
            value={state.paragraphs}
            onChange={(event) => update("paragraphs", event.target.value)}
            placeholder={"Каждая строка — отдельный абзац.\nМожно использовать {{first_name}}."}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Кнопка
            <input className={fieldClass} value={state.ctaLabel} onChange={(event) => update("ctaLabel", event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Ссылка кнопки
            <input className={fieldClass} value={state.ctaUrl} onChange={(event) => update("ctaUrl", event.target.value)} placeholder="https://" />
          </label>
          <label className="block text-sm font-semibold">
            Инфо-блок, заголовок
            <input className={fieldClass} value={state.infoTitle} onChange={(event) => update("infoTitle", event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Инфо-блок, текст
            <input className={fieldClass} value={state.infoText} onChange={(event) => update("infoText", event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Дополнительная ссылка
            <input className={fieldClass} value={state.secondaryLabel} onChange={(event) => update("secondaryLabel", event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            URL дополнительной ссылки
            <input className={fieldClass} value={state.secondaryUrl} onChange={(event) => update("secondaryUrl", event.target.value)} placeholder="https://" />
          </label>
        </div>

        <label className="block text-sm font-semibold">
          Фильтр авторов
          <select
            className={fieldClass}
            value={state.filterKind}
            onChange={(event) => update("filterKind", event.target.value as AuthorCampaignFilter["kind"])}
          >
            <option value="all_authors">Все авторы</option>
            <option value="specific_authors">Конкретные авторы</option>
            <option value="published_products">С опубликованными продуктами</option>
            <option value="no_published_products">Без опубликованных продуктов</option>
            <option value="commercial_authors">Коммерческие авторы</option>
          </select>
        </label>

        {state.filterKind === "specific_authors" ? (
          <div className="space-y-2">
            <label className="block text-sm font-semibold">
              Поиск автора
              <input
                className={fieldClass}
                value={authorQuery}
                onChange={(event) => setAuthorQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5]"
              onClick={() => {
                startTransition(async () => {
                  setAuthorHits(await searchMailingAuthorsAction(authorQuery));
                });
              }}
            >
              Найти
            </button>
            <ul className="space-y-1 text-sm">
              {authorHits.map((hit) => (
                <li key={hit.authorId}>
                  <button
                    type="button"
                    className="text-left text-[#7042c5]"
                    onClick={() => {
                      if (!state.authorIds.includes(hit.authorId)) {
                        update("authorIds", [...state.authorIds, hit.authorId]);
                      }
                    }}
                  >
                    {hit.name} {hit.email ? `· ${hit.email}` : ""}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#7d70a2]">Выбрано: {state.authorIds.length}</p>
          </div>
        ) : null}

        {message ? <p className="text-sm text-[#5e2ca5]">{message}</p> : null}
        {summary ? <p className="text-sm text-[#25135c]">{summary}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
            Сохранить черновик
          </button>
          <button
            type="button"
            className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5]"
            onClick={() => {
              startTransition(async () => {
                const result = await previewMailingAction(payload);
                if (!result.ok) {
                  setMessage(`Предпросмотр: ${result.code}`);
                  return;
                }
                setPreviewHtml(result.html);
                setPreviewMeta(`${result.sender} · ${result.subject}`);
              });
            }}
          >
            Предпросмотр
          </button>
          <button
            type="button"
            className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5]"
            onClick={() => {
              startTransition(async () => {
                const result = await previewMailingRecipientsAction(payload);
                if (!result.ok) {
                  setSummary(`Получатели: ${result.code}`);
                  return;
                }
                const item = result.summary;
                setSummary(
                  `Найдено ${item.found}. Исключено suppressions ${item.suppressed}. Исключено согласия ${item.consentExcluded}. Некорректный email ${item.invalidOrNoEmail}. Прочие исключения ${item.excludedOther}. К отправке ${item.ready}.`,
                );
              });
            }}
          >
            Посчитать получателей
          </button>
        </div>

        {canSend ? (
          <div className="space-y-3 border-t border-[#e4d7f4] pt-4">
            <label className="block text-sm font-semibold">
              Тестовый адрес
              <input className={fieldClass} value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="email администратора или @audiolad.ru" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5]"
                onClick={() => {
                  startTransition(async () => {
                    const result = await sendMailingTestAction({ ...payload, requestedEmail: testEmail });
                    setMessage(result.ok ? "Тест поставлен в отправку" : `Тест не отправлен: ${result.code}`);
                  });
                }}
              >
                Отправить тест
              </button>
              {campaignId ? (
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-full bg-[#25135c] px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    if (!window.confirm("Запустить рассылку? Снимок получателей после этого не пересчитывается.")) {
                      return;
                    }
                    startTransition(async () => {
                      const result = await launchMailingAction(campaignId);
                      setMessage(result.ok ? `Запущено, к отправке ${result.ready}` : `Запуск не выполнен: ${result.code}`);
                      if (result.ok) router.refresh();
                    });
                  }}
                >
                  Отправить
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      <aside className="space-y-3">
        <p className="text-sm text-[#7d70a2]">{previewMeta ?? "Предпросмотр использует тот же renderer, что и отправка."}</p>
        <div className="overflow-hidden rounded-3xl border border-[#e4d7f4] bg-white">
          <p className="px-3 py-2 text-xs font-semibold text-[#7d70a2]">Desktop</p>
          <iframe title="Предпросмотр письма, desktop" className="h-[640px] w-full bg-[#f7f5ff]" sandbox="" srcDoc={previewHtml ?? "<p style='font-family:Arial;padding:24px;color:#7d70a2'>Нажмите «Предпросмотр»</p>"} />
        </div>
        <div className="mx-auto w-[375px] max-w-full overflow-hidden rounded-3xl border border-[#e4d7f4] bg-white">
          <p className="px-3 py-2 text-xs font-semibold text-[#7d70a2]">Mobile</p>
          <iframe title="Предпросмотр письма, mobile" className="h-[640px] w-full bg-[#f7f5ff]" sandbox="" srcDoc={previewHtml ?? ""} />
        </div>
      </aside>
    </div>
  );
}
