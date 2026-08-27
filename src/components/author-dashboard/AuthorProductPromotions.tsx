"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatRubles } from "@/lib/products/price-format";
import { buildPracticePromoPreviewPath } from "@/lib/products/paths";
import {
  EMPTY_AUTHOR_PROMOTION_FORM,
  buildPromotionWriteBody,
  promotionToFormDraft,
  type AuthorPromotionFormDraft,
  type PromotionDurationUnit,
} from "@/lib/pricing/author-promotions";
import {
  DEFAULT_PERSONAL_TIMER_ABOVE_TEXT,
  DEFAULT_PERSONAL_TIMER_BELOW_TEXT,
  PERSONAL_TIMER_COPY_MAX_LENGTH,
  PERSONAL_TIMER_FULL_PRICE_TOKEN,
  PERSONAL_TIMER_TIME_LEFT_TOKEN,
} from "@/lib/pricing/personal-timer-copy";
import { PRICE_PROMOTION_TYPES } from "@/lib/pricing/types";

type PromotionRow = {
  id: string;
  name: string;
  promotion_type: "calendar" | "personal_countdown";
  sale_price: number;
  starts_at: string | null;
  ends_at: string | null;
  duration_seconds: number | null;
  above_timer_text?: string | null;
  below_button_text?: string | null;
  is_active: boolean;
  start_token: string;
};

type AuthorProductPromotionsProps = {
  practiceId: string | null;
  basePrice: number;
  disabled?: boolean;
  authorSlug?: string | null;
  productSlug?: string | null;
};

function statusLabel(row: PromotionRow): string {
  if (!row.is_active) {
    return "Выключена";
  }

  if (row.promotion_type === "calendar") {
    const now = Date.now();
    const start = row.starts_at ? Date.parse(row.starts_at) : NaN;
    const end = row.ends_at ? Date.parse(row.ends_at) : NaN;

    if (Number.isFinite(start) && now < start) {
      return "Запланирована";
    }

    if (Number.isFinite(end) && now >= end) {
      return "Завершена";
    }

    return "Идёт";
  }

  return "Персональный таймер";
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  if (seconds % 86400 === 0) {
    return `${seconds / 86400} д.`;
  }

  if (seconds % 3600 === 0) {
    return `${seconds / 3600} ч.`;
  }

  return `${Math.round(seconds / 60)} мин.`;
}

export default function AuthorProductPromotions({
  practiceId,
  basePrice,
  disabled = false,
  authorSlug = null,
  productSlug = null,
}: AuthorProductPromotionsProps) {
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(() => Boolean(practiceId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AuthorPromotionFormDraft>(
    EMPTY_AUTHOR_PROMOTION_FORM,
  );

  const applyPromotionsPayload = useCallback(
    (payload: { promotions?: PromotionRow[]; error?: string }, ok: boolean) => {
      if (!ok) {
        setError("Не удалось загрузить акции.");
        setLoading(false);
        return;
      }

      setRows(payload.promotions ?? []);
      setError(null);
      setLoading(false);
    },
    [],
  );

  const load = useCallback(async () => {
    if (!practiceId) {
      return;
    }

    const response = await fetch(
      `/api/author/products/${practiceId}/price-promotions`,
    );
    const payload = (await response.json()) as {
      promotions?: PromotionRow[];
      error?: string;
    };
    applyPromotionsPayload(payload, response.ok);
  }, [applyPromotionsPayload, practiceId]);

  useEffect(() => {
    if (!practiceId) {
      return;
    }

    let cancelled = false;

    void fetch(`/api/author/products/${practiceId}/price-promotions`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          promotions?: PromotionRow[];
          error?: string;
        };
        return { ok: response.ok, payload };
      })
      .then((result) => {
        if (cancelled) {
          return;
        }

        applyPromotionsPayload(result.payload, result.ok);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Не удалось загрузить акции.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applyPromotionsPayload, practiceId]);

  function resetForm() {
    setEditingId(null);
    setDraft(EMPTY_AUTHOR_PROMOTION_FORM);
  }

  function openEdit(row: PromotionRow) {
    setEditingId(row.id);
    setDraft(promotionToFormDraft(row));
    setError(null);
  }

  function cancelEdit() {
    resetForm();
    setError(null);
  }

  async function handleSubmit() {
    if (!practiceId) {
      setError("Сначала сохраните продукт.");
      return;
    }

    const sale = Number(draft.salePrice);

    if (!Number.isInteger(sale)) {
      setError("Цена акции должна быть целым числом.");
      return;
    }

    const editingRow = editingId
      ? rows.find((row) => row.id === editingId)
      : undefined;

    setSaving(true);
    setError(null);

    const body = buildPromotionWriteBody(draft, {
      isActive: editingRow ? editingRow.is_active : true,
    });

    try {
      const response = await fetch(
        editingRow
          ? `/api/author/products/${practiceId}/price-promotions/${editingRow.id}`
          : `/api/author/products/${practiceId}/price-promotions`,
        {
          method: editingRow ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(
          payload.error === "invalid_sale_price"
            ? "Цена акции должна быть ниже базовой и в диапазоне 49–100 000 ₽."
            : editingRow
              ? "Не удалось сохранить изменения."
              : "Не удалось создать акцию.",
        );
        return;
      }

      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function patchPromotion(
    id: string,
    updates: Record<string, unknown>,
  ) {
    if (!practiceId) {
      return;
    }

    const response = await fetch(
      `/api/author/products/${practiceId}/price-promotions/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );

    if (!response.ok) {
      setError("Не удалось обновить акцию.");
      return;
    }

    await load();
  }

  async function deletePromotion(id: string) {
    if (!practiceId) {
      return;
    }

    const response = await fetch(
      `/api/author/products/${practiceId}/price-promotions/${id}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      setError("Не удалось удалить акцию.");
      return;
    }

    if (editingId === id) {
      resetForm();
    }

    await load();
  }

  if (!practiceId) {
    return (
      <p className="text-sm text-[#7d70a2]">
        Сохраните продукт, чтобы добавить акции.
      </p>
    );
  }

  const promotionType = draft.promotionType;

  return (
    <div className="space-y-4">
      <div
        className="space-y-3 rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] p-4"
        data-author-promo-form={editingId ? "edit" : "create"}
      >
        <p className="text-sm font-medium text-[#3f3560]">
          {editingId ? "Редактировать акцию" : "Новая акция"}
        </p>
        <input
          value={draft.name}
          onChange={(event) =>
            setDraft((current) => ({ ...current, name: event.target.value }))
          }
          disabled={disabled}
          placeholder="Название"
          className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 text-sm outline-none focus:border-[#9a74d8]"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-[#7d70a2]">Цена по акции, ₽</span>
            <input
              type="number"
              inputMode="numeric"
              min={49}
              max={Math.max(48, basePrice - 1)}
              step={1}
              value={draft.salePrice}
              disabled={disabled}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  salePrice: event.target.value,
                }))
              }
              className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 outline-none focus:border-[#9a74d8]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[#7d70a2]">Тип</span>
            <select
              value={promotionType}
              disabled={disabled}
              onChange={(event) => {
                const nextType =
                  event.target.value === "calendar"
                    ? "calendar"
                    : "personal_countdown";
                setDraft((current) => ({
                  ...current,
                  promotionType: nextType,
                  aboveTimerText:
                    nextType === "personal_countdown"
                      ? current.aboveTimerText.trim()
                        ? current.aboveTimerText
                        : DEFAULT_PERSONAL_TIMER_ABOVE_TEXT
                      : current.aboveTimerText,
                  belowButtonText:
                    nextType === "personal_countdown"
                      ? current.belowButtonText.trim()
                        ? current.belowButtonText
                        : DEFAULT_PERSONAL_TIMER_BELOW_TEXT
                      : current.belowButtonText,
                }));
              }}
              className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 outline-none focus:border-[#9a74d8]"
            >
              <option value="personal_countdown">Персональный таймер</option>
              <option value="calendar">Календарная</option>
            </select>
          </label>
        </div>

        {promotionType === "calendar" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[#7d70a2]">Начало</span>
              <input
                type="datetime-local"
                value={draft.startsAt}
                disabled={disabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    startsAt: event.target.value,
                  }))
                }
                className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 outline-none focus:border-[#9a74d8]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[#7d70a2]">Конец</span>
              <input
                type="datetime-local"
                value={draft.endsAt}
                disabled={disabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    endsAt: event.target.value,
                  }))
                }
                className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 outline-none focus:border-[#9a74d8]"
              />
            </label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[#7d70a2]">Длительность</span>
              <input
                type="number"
                min={1}
                step={1}
                value={draft.durationAmount}
                disabled={disabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    durationAmount: event.target.value,
                  }))
                }
                className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 outline-none focus:border-[#9a74d8]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[#7d70a2]">Единица</span>
              <select
                value={draft.durationUnit}
                disabled={disabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    durationUnit: event.target.value as PromotionDurationUnit,
                  }))
                }
                className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 outline-none focus:border-[#9a74d8]"
              >
                <option value="minutes">минуты</option>
                <option value="hours">часы</option>
                <option value="days">дни</option>
              </select>
            </label>
          </div>
        )}

        {promotionType === "personal_countdown" ? (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[#7d70a2]">Текст над таймером</span>
              <textarea
                data-author-promo-above-timer
                value={draft.aboveTimerText}
                disabled={disabled}
                maxLength={PERSONAL_TIMER_COPY_MAX_LENGTH}
                rows={2}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    aboveTimerText: event.target.value,
                  }))
                }
                className="w-full resize-y rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 text-sm outline-none focus:border-[#9a74d8]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[#7d70a2]">Текст под кнопкой</span>
              <textarea
                data-author-promo-below-button
                value={draft.belowButtonText}
                disabled={disabled}
                maxLength={PERSONAL_TIMER_COPY_MAX_LENGTH}
                rows={3}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    belowButtonText: event.target.value,
                  }))
                }
                className="w-full resize-y rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 text-sm outline-none focus:border-[#9a74d8]"
              />
            </label>
            <p className="text-xs leading-5 text-[#7d70a2]">
              {PERSONAL_TIMER_TIME_LEFT_TOKEN} — оставшееся время
              <br />
              {PERSONAL_TIMER_FULL_PRICE_TOKEN} — обычная цена продукта
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void handleSubmit()}
            data-author-promo-submit={editingId ? "edit" : "create"}
            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {editingId ? "Сохранить изменения" : "Добавить акцию"}
          </button>
          {editingId ? (
            <button
              type="button"
              disabled={disabled || saving}
              onClick={cancelEdit}
              data-author-promo-cancel
              className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
            >
              Отмена
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-[#8d4d57]">{error}</p> : null}
      {loading ? <p className="text-sm text-[#7d70a2]">Загрузка акций…</p> : null}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-[18px] border border-[#eadff8] bg-white px-4 py-3"
            data-author-promo-card={row.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-[#25135c]">{row.name}</p>
                <p className="mt-1 text-sm text-[#7d70a2]">
                  {formatRubles(row.sale_price)} ·{" "}
                  {row.promotion_type === "calendar"
                    ? "календарная"
                    : `таймер ${formatDuration(row.duration_seconds)}`}{" "}
                  · {statusLabel(row)}
                </p>
                {row.promotion_type === "personal_countdown" ? (
                  <div className="mt-2 space-y-1 text-xs text-[#7d70a2]">
                    <p className="break-all">
                      Триггер: ?promo={row.start_token}
                    </p>
                    {row.above_timer_text ? (
                      <p data-author-promo-card-above={row.id}>
                        {row.above_timer_text}
                      </p>
                    ) : null}
                    {row.below_button_text ? (
                      <p data-author-promo-card-below={row.id}>
                        {row.below_button_text}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {authorSlug && productSlug ? (
                  <Link
                    href={buildPracticePromoPreviewPath(
                      authorSlug,
                      productSlug,
                      row.id,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-author-promo-preview={row.id}
                    className="rounded-full border border-[#c6afe6] px-3 py-1.5 text-xs font-semibold text-[#7042c5]"
                  >
                    Предпросмотр акции
                  </Link>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => openEdit(row)}
                  data-author-promo-edit={row.id}
                  className="rounded-full border border-[#c6afe6] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-60"
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    void patchPromotion(row.id, { is_active: !row.is_active })
                  }
                  className="rounded-full border border-[#c6afe6] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-60"
                >
                  {row.is_active ? "Выключить" : "Включить"}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void deletePromotion(row.id)}
                  className="rounded-full border border-[#f2d4d8] px-3 py-1.5 text-xs font-semibold text-[#8d4d57] disabled:opacity-60"
                >
                  Удалить
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
