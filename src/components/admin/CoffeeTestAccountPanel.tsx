"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { resetCoffeeTestAccountAction } from "@/app/(platform)/admin/business-coffee-test-account/actions";
import {
  COFFEE_TEST_RESET_COUNT_LABELS,
  COFFEE_TEST_RESET_ERROR_TEXT,
  type CoffeeTestAccount,
  type CoffeeTestResetCounts,
  type CoffeeTestResetErrorCode,
} from "@/lib/admin/coffee-test-reset/model";

const GREEN = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white disabled:opacity-60";
const DANGER = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#b34f63] px-5 text-sm font-medium text-white disabled:opacity-60";
const OUTLINE = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9cdef] bg-white px-5 text-sm font-medium text-[#25135c] disabled:opacity-60";

function formatDate(value: string | null): string {
  if (!value) return "ещё не сбрасывался";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow",
  }).format(new Date(value)) + " (МСК)";
}

export function CoffeeTestResetDialog({ account, pending, error, onCancel, onConfirm }: {
  account: CoffeeTestAccount;
  pending: boolean;
  error: CoffeeTestResetErrorCode | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#25135c]/40 p-3 sm:items-center"
      onKeyDown={(event) => { if (event.key === "Escape" && !pending) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="coffee-test-reset-title"
        className="max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-[22px] bg-white p-5 text-[#25135c] shadow-xl">
        <h3 id="coffee-test-reset-title" className="text-[19px] font-semibold">
          Сбросить тестовый аккаунт {account.emailMasked}?
        </h3>
        <p className="mt-3 text-sm font-medium">Что произойдёт</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[#4f4370]">
          <li>Кофейня аккаунта закроется, подарок «7 дней» и принятие оферты отвяжутся – их можно получить заново.</li>
          <li>30 минут гостем начнутся заново на этом устройстве и в этой сети.</li>
          <li>Вы выйдете из аккаунта на этом устройстве, cookies и данные кофейни в браузере очистятся.</li>
          <li>Откроется первый визит на coffee.audiolad.ru.</li>
        </ul>
        <p className="mt-3 text-sm font-medium">Что не трогаем</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[#4f4370]">
          <li>Оплаты, заказы и чеки – остаются в истории, ничего не удаляется.</li>
          <li>Аналитика не удаляется – события аккаунта помечаются как тестовые.</li>
          <li>Другие устройства и сети: там 30 минут не обнуляются.</li>
        </ul>
        {error ? (
          <p role="alert" className="mt-4 rounded-[14px] border border-[#efc7cf] bg-[#fff8f9] px-3 py-2 text-sm text-[#b34f63]">
            {COFFEE_TEST_RESET_ERROR_TEXT[error]}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" className={OUTLINE} disabled={pending} onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className={DANGER} disabled={pending} onClick={onConfirm}>
            {pending ? "Сбрасываем…" : "Сбросить – начать с нуля"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CoffeeTestResetDone({ counts, next }: { counts: CoffeeTestResetCounts; next: string }) {
  return (
    <div role="status" className="rounded-[22px] border border-[#cfe6d8] bg-[#f3fbf6] p-5 text-sm text-[#25135c]">
      <p className="font-medium">Готово – открываем кофейню с нуля.</p>
      <ul className="mt-2 space-y-1 text-[#4f4370]">
        {COFFEE_TEST_RESET_COUNT_LABELS.filter(([key]) => (counts[key] ?? 0) > 0).map(([key, label]) => (
          <li key={key}>{label}: {counts[key]}</li>
        ))}
      </ul>
      <a href={next} className={`${GREEN} mt-4`}>Открыть кофейню</a>
    </div>
  );
}

export function CoffeeTestAccountCard({ account, onReset }: { account: CoffeeTestAccount; onReset: () => void }) {
  return (
    <article className="rounded-[22px] border border-[#eadff8] bg-[#fcfaff] p-5 text-[#25135c]">
      <p className="text-[17px] font-semibold">{account.emailMasked}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-[#4f4370] sm:grid-cols-3">
        <div><dt className="inline">Кофейни: </dt><dd className="inline">{account.organizations}</dd></div>
        <div><dt className="inline">Подарок: </dt><dd className="inline">{account.gifts > 0 ? "получен" : "нет"}</dd></div>
        <div><dt className="inline">Оферта: </dt><dd className="inline">{account.offerAcceptances > 0 ? "принята" : "нет"}</dd></div>
        <div><dt className="inline">Оплаченные периоды: </dt><dd className="inline">{account.subscriptionPeriods}</dd></div>
        <div className="col-span-2"><dt className="inline">Последний сброс: </dt><dd className="inline">{formatDate(account.lastResetAt)}</dd></div>
      </dl>
      <button type="button" className={`${GREEN} mt-4`} onClick={onReset}>
        Начать путь кофейни заново
      </button>
    </article>
  );
}

export default function CoffeeTestAccountPanel({ accounts }: { accounts: CoffeeTestAccount[] }) {
  const [selected, setSelected] = useState<CoffeeTestAccount | null>(null);
  const [error, setError] = useState<CoffeeTestResetErrorCode | null>(null);
  const [done, setDone] = useState<{ counts: CoffeeTestResetCounts; next: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => window.location.assign(done.next), 2500);
    return () => window.clearTimeout(timer);
  }, [done]);

  if (done) return <CoffeeTestResetDone counts={done.counts} next={done.next} />;
  if (accounts.length === 0) {
    return (
      <p className="rounded-[22px] border border-[#eadff8] bg-[#faf6ff] p-5 text-sm text-[#4f4370]">
        Тестовых аккаунтов нет. Адрес добавляется только на сервере – в список тестовых аккаунтов базы.
      </p>
    );
  }

  const confirm = () => {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await resetCoffeeTestAccountAction({ targetUserId: selected.userId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // This admin origin keeps its own storage; the coffee origin is wiped on /test-reset.
      setSelected(null);
      setDone({ counts: result.counts, next: result.next });
    });
  };

  return (
    <div className="space-y-4">
      {accounts.map((account) => (
        <CoffeeTestAccountCard key={account.userId} account={account}
          onReset={() => { setError(null); setSelected(account); }} />
      ))}
      {selected ? (
        <CoffeeTestResetDialog account={selected} pending={pending} error={error}
          onCancel={() => setSelected(null)} onConfirm={confirm} />
      ) : null}
    </div>
  );
}
