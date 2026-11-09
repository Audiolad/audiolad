"use client";

import { useState, useTransition } from "react";

import { createPartnerCodeAction, revokePartnerCodeAction } from "@/app/(platform)/admin/business-partner-codes/actions";
import type { PartnerCodeAdminRow } from "@/lib/admin/business-partner-codes";
import {
  PARTNER_CODE_DEFAULT_PERIODS,
  PARTNER_CODE_DEFAULT_UNIT_PRICE_RUB,
  PARTNER_CODE_PURPOSES,
  PARTNER_CODE_STATUS_LABELS,
  formatPartnerCode,
  partnerCodeLink,
} from "@/lib/business/partner-codes";
import { BUSINESS_PLAN_MONTHLY_PRICE_RUB } from "@/lib/business/plan";

const GREEN = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white disabled:opacity-60";
const OUTLINE = "inline-flex min-h-9 items-center justify-center rounded-full border border-[#d9cdef] bg-white px-4 text-sm font-medium text-[#25135c] disabled:opacity-60";
const INPUT = "min-h-11 rounded-xl border border-[#d9cdef] bg-white px-3 text-sm text-[#25135c]";

function formatDate(value: string | null): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Europe/Moscow" }).format(new Date(value));
}

export default function BusinessPartnerCodesPanel({ rows, origin }: { rows: PartnerCodeAdminRow[]; origin: string }) {
  const [purpose, setPurpose] = useState<keyof typeof PARTNER_CODE_PURPOSES>("custdev");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState(String(PARTNER_CODE_DEFAULT_UNIT_PRICE_RUB));
  const [periods, setPeriods] = useState(String(PARTNER_CODE_DEFAULT_PERIODS));
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const create = () => start(async () => {
    setError(null);
    const result = await createPartnerCodeAction({ purpose, note, unitPriceRub: price, periods });
    if (result.ok) {
      setCreated(result.code);
      setNote("");
    } else {
      setError(result.error === "invalid"
        ? `Проверьте поля: цена – целое число рублей меньше ${BUSINESS_PLAN_MONTHLY_PRICE_RUB}, периодов – от 1 до 12.`
        : "Не удалось создать код. Попробуйте ещё раз.");
    }
  });

  return (
    <div className="space-y-6">
      <form className="space-y-3 rounded-[22px] border border-[#e6def5] bg-white p-5" onSubmit={(event) => { event.preventDefault(); create(); }}>
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
        {created ? (
          <div role="status" className="rounded-xl bg-[#f3fbf6] p-3 text-sm" data-testid="admin-partner-code-created">
            <p>Код: <strong className="font-mono">{formatPartnerCode(created)}</strong></p>
            <p className="break-all">Персональная ссылка: <span className="font-mono">{partnerCodeLink(origin, created)}</span></p>
          </div>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-[22px] border border-[#e6def5] bg-white">
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
              <tr key={row.id} className="border-t border-[#f0eafa] align-top" data-testid="admin-partner-code-row" data-status={row.status}>
                <td className="p-3 font-mono">{row.codeDisplay}</td>
                <td className="p-3">{row.purposeLabel}{row.note ? <span className="block text-[#796ba0]">{row.note}</span> : null}</td>
                <td className="p-3">{row.unitPriceRub} ₽ × {row.discountPeriods}</td>
                <td className="p-3">{PARTNER_CODE_STATUS_LABELS[row.status]}</td>
                <td className="p-3">{row.organizationId ? (row.organizationName || "Без названия") : "–"}</td>
                <td className="p-3">{formatDate(row.firstPaidAt)}</td>
                <td className="p-3">{row.periodsApplied} из {row.discountPeriods}</td>
                <td className="p-3">
                  {row.organizationId
                    ? `${row.periodsLeft} ${row.periodsLeft === 1 ? "оплата" : row.periodsLeft >= 2 && row.periodsLeft <= 4 ? "оплаты" : "оплат"}${row.discountPaidUntil ? `, оплачено до ${formatDate(row.discountPaidUntil)}` : ""}`
                    : "–"}
                </td>
                <td className="p-3">
                  {row.canRevoke ? (
                    <button type="button" className={OUTLINE} disabled={pending}
                      onClick={() => start(async () => { await revokePartnerCodeAction({ id: row.id }); })}>
                      Отозвать
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
