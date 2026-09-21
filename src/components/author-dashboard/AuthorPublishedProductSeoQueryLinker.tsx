"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SearchMatch = {
  queryId: string;
  queryText: string;
  frequency: number | null;
  availability:
    | "available"
    | "used_other"
    | "reserved_other"
    | "own_unlinked"
    | "linked_this";
  statusLabel: string;
  exactNormalizedMatch: boolean;
};

type Props = {
  productId: string;
  legacySeoPrimaryQuery: string;
  onAttached: (payload: {
    queryId: string;
    queryText: string;
    reservationId: string;
  }) => void;
};

function formatMonthlyFrequency(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
  return `Запросов в месяц: ${value.toLocaleString("ru-RU")}`;
}

export default function AuthorPublishedProductSeoQueryLinker({
  productId,
  legacySeoPrimaryQuery,
  onAttached,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [pending, setPending] = useState(false);
  const [attachPending, setAttachPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [exactNormalizedMatch, setExactNormalizedMatch] = useState(false);
  const [searchedPhrase, setSearchedPhrase] = useState("");
  const [confirmCreate, setConfirmCreate] = useState(false);

  const legacyHint = legacySeoPrimaryQuery.trim();
  const canAdoptLegacy = Boolean(legacyHint);

  async function runSearch(nextPhrase: string) {
    const value = nextPhrase.trim();
    if (!value) return;
    setPending(true);
    setMessage(null);
    setConfirmCreate(false);
    setMatches([]);
    setExactNormalizedMatch(false);
    setSearchedPhrase(value);
    const response = await fetch(
      `/api/author/products/${productId}/seo-primary-query?${new URLSearchParams({
        q: value,
      })}`,
    );
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setMessage(
        typeof payload.message === "string"
          ? payload.message
          : "Не удалось найти запросы.",
      );
      return;
    }
    setMatches(Array.isArray(payload.matches) ? payload.matches : []);
    setExactNormalizedMatch(Boolean(payload.exactNormalizedMatch));
  }

  async function attach(input: { queryId?: string; queryText?: string }) {
    const key = input.queryId ?? input.queryText ?? "attach";
    setAttachPending(key);
    setMessage(null);
    const response = await fetch(
      `/api/author/products/${productId}/seo-primary-query`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query_id: input.queryId,
          query_text: input.queryText,
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setAttachPending(null);
    if (!response.ok) {
      setMessage(
        typeof payload.message === "string"
          ? payload.message
          : "Не удалось закрепить запрос.",
      );
      return;
    }
    onAttached({
      queryId: payload.queryId as string,
      queryText: payload.queryText as string,
      reservationId: payload.reservationId as string,
    });
    setMessage(
      typeof payload.message === "string"
        ? payload.message
        : "Запрос закреплён за этим продуктом.",
    );
    setOpen(false);
    setConfirmCreate(false);
    router.refresh();
  }

  return (
    <section
      className="rounded-[22px] border border-[#d7c4f5] bg-[#faf6ff] p-5"
      data-testid="author-published-product-seo-linker"
    >
      <h3 className="text-base font-semibold text-[#25135c]">
        Основной поисковый запрос
      </h3>
      <p className="mt-2 text-sm leading-6 text-[#4c3d78]">
        Закрепите поисковый запрос, под который опубликован этот продукт.
      </p>

      {canAdoptLegacy ? (
        <div className="mt-3 rounded-[18px] border border-[#eadff8] bg-white p-4">
          <p className="text-sm leading-6 text-[#4c3d78]">
            Сейчас в продукте указан запрос:
          </p>
          <p className="mt-1 text-base font-semibold text-[#25135c]">
            {legacyHint}
          </p>
          <button
            type="button"
            disabled={Boolean(attachPending)}
            onClick={() => {
              setMessage(null);
              // Single user action: find-or-create + attach via published RPC.
              // Occupied queries surface as API error; no second confirm step.
              void attach({ queryText: legacyHint });
            }}
            className="mt-3 inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {attachPending === legacyHint
              ? "Закрепляем…"
              : "Закрепить этот запрос"}
          </button>
        </div>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMessage(null);
          }}
          className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white"
        >
          Закрепить поисковый запрос
        </button>
      ) : (
        <div className="mt-4 space-y-3 rounded-[18px] border border-[#eadff8] bg-white p-4">
          <label className="block text-sm font-medium text-[#25135c]">
            Поиск по базе запросов
            <input
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void runSearch(phrase);
                }
              }}
              placeholder="Например: фоновая музыка для спа"
              className="mt-2 min-h-11 w-full rounded-xl border border-[#d7c4f5] bg-[#faf6ff] px-3 text-sm outline-none focus:border-[#7042c5]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !phrase.trim()}
              onClick={() => void runSearch(phrase)}
              className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Ищем…" : "Найти"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmCreate(false);
              }}
              className="inline-flex min-h-10 items-center rounded-full border border-[#d7c4f5] px-4 text-sm font-medium text-[#5f5484]"
            >
              Скрыть
            </button>
          </div>

          {searchedPhrase ? (
            <div className="space-y-3 pt-1">
              {matches.length === 0 ? (
                <p className="text-sm text-[#796ba0]">
                  Подходящих запросов в базе не найдено.
                </p>
              ) : (
                <div className="grid gap-3">
                  {matches.map((item) => {
                    const frequencyLabel = formatMonthlyFrequency(item.frequency);
                    const canSelect =
                      item.availability === "available" ||
                      item.availability === "own_unlinked";
                    return (
                      <article
                        key={item.queryId}
                        className="rounded-[16px] border border-[#eadff8] bg-[#faf6ff] p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[#25135c]">
                              {item.queryText}
                            </p>
                            {frequencyLabel ? (
                              <p className="mt-1 text-sm text-[#5f5484]">
                                {frequencyLabel}
                              </p>
                            ) : null}
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#7042c5]">
                            {item.statusLabel}
                          </span>
                        </div>
                        {canSelect ? (
                          <button
                            type="button"
                            disabled={Boolean(attachPending)}
                            onClick={() =>
                              void attach({ queryId: item.queryId })
                            }
                            className="mt-3 inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {attachPending === item.queryId
                              ? "Закрепляем…"
                              : "Закрепить за продуктом"}
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}

              {!exactNormalizedMatch && searchedPhrase ? (
                <div className="rounded-[16px] border border-dashed border-[#cbbce6] bg-white p-4">
                  <p className="text-sm leading-6 text-[#4c3d78]">
                    Такого запроса пока нет в базе АудиоЛада.
                  </p>
                  {!confirmCreate ? (
                    <button
                      type="button"
                      onClick={() => setConfirmCreate(true)}
                      className="mt-3 inline-flex min-h-10 items-center rounded-full border border-[#bda6e1] bg-white px-4 text-sm font-semibold text-[#7042c5]"
                    >
                      Добавить запрос и закрепить
                    </button>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm leading-6 text-[#4c3d78]">
                        Запрос будет добавлен в базу и закреплён за этим
                        опубликованным продуктом. Самостоятельно заменить его
                        после закрепления нельзя.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={Boolean(attachPending)}
                          onClick={() =>
                            void attach({ queryText: searchedPhrase })
                          }
                          className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {attachPending === searchedPhrase
                            ? "Добавляем…"
                            : "Подтвердить"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCreate(false)}
                          className="inline-flex min-h-10 items-center rounded-full border border-[#d7c4f5] px-4 text-sm font-medium text-[#5f5484]"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

            </div>
          ) : null}
        </div>
      )}

      {message ? (
        <p role="status" className="mt-3 text-sm font-medium text-[#4c3d78]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
