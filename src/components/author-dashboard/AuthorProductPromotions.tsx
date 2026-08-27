"use client";

import { useCallback, useEffect, useState } from "react";

import { formatRubles } from "@/lib/products/price-format";
import {
  durationToSeconds,
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
  is_active: boolean;
  start_token: string;
};

type AuthorProductPromotionsProps = {
  practiceId: string | null;
  basePrice: number;
  disabled?: boolean;
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
}: AuthorProductPromotionsProps) {
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(() => Boolean(practiceId));
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [salePrice, setSalePrice] = useState("499");
  const [promotionType, setPromotionType] = useState<
    "calendar" | "personal_countdown"
  >("personal_countdown");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [durationAmount, setDurationAmount] = useState("20");
  const [durationUnit, setDurationUnit] =
    useState<PromotionDurationUnit>("minutes");
  const [aboveTimerText, setAboveTimerText] = useState(
    DEFAULT_PERSONAL_TIMER_ABOVE_TEXT,
  );
  const [belowButtonText, setBelowButtonText] = useState(
    DEFAULT_PERSONAL_TIMER_BELOW_TEXT,
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

  async function handleCreate() {
    if (!practiceId) {
      setError("Сначала сохраните продукт.");
      return;
    }

    const sale = Number(salePrice);

    if (!Number.isInteger(sale)) {
      setError("Цена акции должна быть целым числом.");
      return;
    }

    setCreating(true);
    setError(null);

    const body: Record<string, unknown> = {
      name: name.trim() || "Акция",
      promotion_type: promotionType,
      sale_price: sale,
      is_active: true,
    };

    if (promotionType === PRICE_PROMOTION_TYPES.CALENDAR) {
      body.starts_at = startsAt ? new Date(startsAt).toISOString() : "";
      body.ends_at = endsAt ? new Date(endsAt).toISOString() : "";
    } else {
      body.duration_amount = Number(durationAmount);
      body.duration_unit = durationUnit;
      body.duration_seconds = durationToSeconds(
        Number(durationAmount),
        durationUnit,
      );
      body.above_timer_text = aboveTimerText;
      body.below_button_text = belowButtonText;
    }

    try {
      const response = await fetch(
        `/api/author/products/${practiceId}/price-promotions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(
          payload.error === "invalid_sale_price"
            ? "Цена акции должна быть ниже базовой и в диапазоне 49–100 000 ₽."
            : "Не удалось создать акцию.",
        );
        return;
      }

      setName("");
      await load();
    } finally {
      setCreating(false);
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

    await load();
  }

  if (!practiceId) {
    return (
      <p className="text-sm text-[#7d70a2]">
        Сохраните продукт, чтобы добавить акции.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] p-4">
        <p className="text-sm font-medium text-[#3f3560]">Новая акция</p>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
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
              value={salePrice}
              disabled={disabled}
              onChange={(event) => setSalePrice(event.target.value)}
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
                setPromotionType(nextType);
                if (nextType === "personal_countdown") {
                  setAboveTimerText((current) =>
                    current.trim() ? current : DEFAULT_PERSONAL_TIMER_ABOVE_TEXT,
                  );
                  setBelowButtonText((current) =>
                    current.trim()
                      ? current
                      : DEFAULT_PERSONAL_TIMER_BELOW_TEXT,
                  );
                }
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
                value={startsAt}
                disabled={disabled}
                onChange={(event) => setStartsAt(event.target.value)}
                className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 outline-none focus:border-[#9a74d8]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[#7d70a2]">Конец</span>
              <input
                type="datetime-local"
                value={endsAt}
                disabled={disabled}
                onChange={(event) => setEndsAt(event.target.value)}
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
                value={durationAmount}
                disabled={disabled}
                onChange={(event) => setDurationAmount(event.target.value)}
                className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 outline-none focus:border-[#9a74d8]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[#7d70a2]">Единица</span>
              <select
                value={durationUnit}
                disabled={disabled}
                onChange={(event) =>
                  setDurationUnit(event.target.value as PromotionDurationUnit)
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
                value={aboveTimerText}
                disabled={disabled}
                maxLength={PERSONAL_TIMER_COPY_MAX_LENGTH}
                rows={2}
                onChange={(event) => setAboveTimerText(event.target.value)}
                className="w-full resize-y rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 text-sm outline-none focus:border-[#9a74d8]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[#7d70a2]">Текст под кнопкой</span>
              <textarea
                data-author-promo-below-button
                value={belowButtonText}
                disabled={disabled}
                maxLength={PERSONAL_TIMER_COPY_MAX_LENGTH}
                rows={3}
                onChange={(event) => setBelowButtonText(event.target.value)}
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

        <button
          type="button"
          disabled={disabled || creating}
          onClick={() => void handleCreate()}
          className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Добавить акцию
        </button>
      </div>

      {error ? <p className="text-sm text-[#8d4d57]">{error}</p> : null}
      {loading ? <p className="text-sm text-[#7d70a2]">Загрузка акций…</p> : null}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-[18px] border border-[#eadff8] bg-white px-4 py-3"
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
                  <p className="mt-2 break-all text-xs text-[#7d70a2]">
                    Триггер: ?promo={row.start_token}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
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
