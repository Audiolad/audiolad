"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createPartnerCodeAction, revokePartnerCodeAction } from "@/app/(platform)/admin/business-partner-codes/actions";
import type { PartnerCodeAdminRow } from "@/lib/admin/business-partner-codes";
import {
  PARTNER_CODE_DEFAULT_PERIODS,
  PARTNER_CODE_DEFAULT_UNIT_PRICE_RUB,
  PARTNER_CODE_PURPOSES,
  PARTNER_CODE_STATUS_LABELS,
  partnerCodePublicLink,
} from "@/lib/business/partner-codes";
import { BUSINESS_PLAN_MONTHLY_PRICE_RUB } from "@/lib/business/plan";

const GREEN = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white disabled:opacity-60";
const OUTLINE = "inline-flex min-h-9 items-center justify-center rounded-full border border-[#d9cdef] bg-white px-4 text-sm font-medium text-[#25135c] disabled:opacity-60";
const OUTLINE_SM = "inline-flex min-h-9 items-center justify-center rounded-full border border-[#d9cdef] bg-white px-3 text-xs font-medium text-[#25135c] disabled:opacity-60";
const INPUT = "min-h-11 rounded-xl border border-[#d9cdef] bg-white px-3 text-sm text-[#25135c]";

function formatDate(value: string | null): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Europe/Moscow" }).format(new Date(value));
}

function remainingLabel(row: PartnerCodeAdminRow): string {
  if (!row.organizationId) return "–";
  const word = row.periodsLeft === 1 ? "оплата" : row.periodsLeft >= 2 && row.periodsLeft <= 4 ? "оплаты" : "оплат";
  return `${row.periodsLeft} ${word}${row.discountPaidUntil ? `, оплачено до ${formatDate(row.discountPaidUntil)}` : ""}`;
}

function CopyButtons({ codeDisplay, link }: { codeDisplay: string; link: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(kind: "code" | "link", value: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mt-2 space-y-2" data-testid="admin-partner-code-copy">
      <p className="break-all font-mono text-xs text-[#796ba0]" data-testid="admin-partner-code-link">{link}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={OUTLINE_SM} onClick={() => void copy("code", codeDisplay)} data-testid="admin-partner-copy-code">
          {copied === "code" ? "Скопировано" : "Скопировать код"}
        </button>
        <button type="button" className={OUTLINE_SM} onClick={() => void copy("link", link)} data-testid="admin-partner-copy-link">
          {copied === "link" ? "Скопировано" : "Скопировать ссылку"}
        </button>
      </div>
    </div>
  );
}

function CodeCell({ row }: { row: PartnerCodeAdminRow }) {
  return (
    <div>
      <p className="font-mono text-sm font-semibold text-[#25135c]">{row.codeDisplay}</p>
      <CopyButtons codeDisplay={row.codeDisplay} link={partnerCodePublicLink(row.code)} />
    </div>
  );
}

function RowActions({ row, pending, onRevoke }: { row: PartnerCodeAdminRow; pending: boolean; onRevoke: () => void }) {
  if (!row.canRevoke) return null;
  return (
    <button type="button" className={OUTLINE} disabled={pending} onClick={onRevoke} data-testid="admin-partner-revoke">
      Отозвать
    </button>
  );
}

export default function BusinessPartnerCodesPanel({ rows }: { rows: PartnerCodeAdminRow[] }) {
  const router = useRouter();
  const [purpose, setPurpose] = useState<keyof typeof PARTNER_CODE_PURPOSES>("custdev");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState(String(PARTNER_CODE_DEFAULT_UNIT_PRICE_RUB));
  const [periods, setPeriods] = useState(String(PARTNER_CODE_DEFAULT_PERIODS));
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!highlightCode) return;
    const node = document.querySelector(`[data-partner-code="${highlightCode}"]`);
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightCode(null), 3500);
    return () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    };
  }, [highlightCode, rows]);

  const create = () => start(async () => {
    setError(null);
    const result = await createPartnerCodeAction({ purpose, note, unitPriceRub: price, periods });
    if (result.ok) {
      setHighlightCode(result.code);
      setPurpose("custdev");
      setNote("");
      setPrice(String(PARTNER_CODE_DEFAULT_UNIT_PRICE_RUB));
      setPeriods(String(PARTNER_CODE_DEFAULT_PERIODS));
      router.refresh();
    } else {
      setError(result.error === "invalid"
        ? `Проверьте поля: цена – целое число рублей меньше ${BUSINESS_PLAN_MONTHLY_PRICE_RUB}, периодов – от 1 до 12.`
        : "Не удалось создать код. Попробуйте ещё раз.");
    }
  });

  const rowClass = (row: PartnerCodeAdminRow) =>
    highlightCode === row.code
      ? "border-t border-[#cfead9] bg-[#eef9f2] transition-colors"
      : "border-t border-[#f0eafa] bg-white transition-colors";

  return (
    <div className="space-y-6">
      <form className="space-y-3 rounded-[22px] border border-[#e6def5] bg-white p-5" onSubmit={(event) => { event.preventDefault(); create(); }} data-testid="admin-partner-code-form">
        <h3 className="text-[17px] font-semibold">Новый код</h3>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">Назначение
            <select className={INPUT} value={purpose} onChange={(event) => setPurpose(event.target.value as keyof typeof PARTNER_CODE_PURPOSES)}>
              {Object.entries(PARTNER_CODE_PURPOSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm">Кому / заметка
            <input className={INPUT} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="Например: кастдев, кофейня на Ленина" />
          </label>
          <label className="flex w-[140px] flex-col gap-1 text-sm">Цена за точку, ₽
            <input className={INPUT} inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
          <label className="flex w-[140px] flex-col gap-1 text-sm">Оплаченных периодов
            <input className={INPUT} inputMode="numeric" value={periods} onChange={(event) => setPeriods(event.target.value)} />
          </label>
        </div>
        <p className="text-sm text-[#796ba0]">
          По умолчанию: {PARTNER_CODE_DEFAULT_UNIT_PRICE_RUB} ₽ за точку на {PARTNER_CODE_DEFAULT_PERIODS} оплаченных периода по 30 дней,
          затем {BUSINESS_PLAN_MONTHLY_PRICE_RUB} ₽. Получатель увидит {BUSINESS_PLAN_MONTHLY_PRICE_RUB} ₽ зачёркнутой рядом с новой ценой.
        </p>
        <button type="submit" className={GREEN} disabled={pending}>Создать код</button>
        {error ? <p role="alert" className="text-sm text-[#b34f63]">{error}</p> : null}
      </form>

      <div className="hidden overflow-x-auto rounded-[22px] border border-[#e6def5] bg-white md:block" data-testid="admin-partner-codes-table">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="text-[#796ba0]">
            <tr>
              <th className="p-3 font-medium">Код</th>
              <th className="p-3 font-medium">Назначение</th>
              <th className="p-3 font-medium">Условия</th>
              <th className="p-3 font-medium">Статус</th>
              <th className="p-3 font-medium">Аккаунт</th>
              <th className="p-3 font-medium">Первая оплата</th>
              <th className="p-3 font-medium">Периодов по цене кода</th>
              <th className="p-3 font-medium">Осталось</th>
              <th className="p-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td className="p-3 text-[#796ba0]" colSpan={9}>Кодов пока нет.</td></tr>
            ) : rows.map((row) => (
              <tr
                key={row.id}
                className={`${rowClass(row)} align-top`}
                data-testid="admin-partner-code-row"
                data-status={row.status}
                data-partner-code={row.code}
              >
                <td className="p-3"><CodeCell row={row} /></td>
                <td className="p-3">{row.purposeLabel}{row.note ? <span className="block text-[#796ba0]">{row.note}</span> : null}</td>
                <td className="p-3">{row.unitPriceRub} ₽ × {row.discountPeriods}</td>
                <td className="p-3">{PARTNER_CODE_STATUS_LABELS[row.status]}</td>
                <td className="p-3">{row.organizationId ? (row.organizationName || "Без названия") : "–"}</td>
                <td className="p-3">{formatDate(row.firstPaidAt)}</td>
                <td className="p-3">{row.periodsApplied} из {row.discountPeriods}</td>
                <td className="p-3">{remainingLabel(row)}</td>
                <td className="p-3">
                  <RowActions
                    row={row}
                    pending={pending}
                    onRevoke={() => start(async () => { await revokePartnerCodeAction({ id: row.id }); router.refresh(); })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden" data-testid="admin-partner-codes-cards">
        {rows.length === 0 ? (
          <div className="rounded-[22px] border border-[#e6def5] bg-white p-4 text-sm text-[#796ba0]">Кодов пока нет.</div>
        ) : rows.map((row) => (
          <article
            key={row.id}
            className={`rounded-[22px] border border-[#e6def5] p-4 ${highlightCode === row.code ? "bg-[#eef9f2]" : "bg-white"}`}
            data-testid="admin-partner-code-row"
            data-status={row.status}
            data-partner-code={row.code}
          >
            <CodeCell row={row} />
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-[#796ba0]">Назначение</dt>
                <dd>{row.purposeLabel}{row.note ? <span className="block text-[#796ba0]">{row.note}</span> : null}</dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[#796ba0]">Условия</dt>
                  <dd>{row.unitPriceRub} ₽ × {row.discountPeriods}</dd>
                </div>
                <div>
                  <dt className="text-[#796ba0]">Статус</dt>
                  <dd>{PARTNER_CODE_STATUS_LABELS[row.status]}</dd>
                </div>
              </div>
              <div>
                <dt className="text-[#796ba0]">Аккаунт</dt>
                <dd>{row.organizationId ? (row.organizationName || "Без названия") : "–"}</dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[#796ba0]">Первая оплата</dt>
                  <dd>{formatDate(row.firstPaidAt)}</dd>
                </div>
                <div>
                  <dt className="text-[#796ba0]">Периодов</dt>
                  <dd>{row.periodsApplied} из {row.discountPeriods}</dd>
                </div>
              </div>
              <div>
                <dt className="text-[#796ba0]">Осталось</dt>
                <dd>{remainingLabel(row)}</dd>
              </div>
            </dl>
            <div className="mt-3">
              <RowActions
                row={row}
                pending={pending}
                onRevoke={() => start(async () => { await revokePartnerCodeAction({ id: row.id }); router.refresh(); })}
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
