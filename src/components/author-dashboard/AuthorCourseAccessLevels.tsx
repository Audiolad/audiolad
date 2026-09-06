"use client";

import { useState } from "react";

import {
  COURSE_ACCESS_LEVELS_ADD_NEXT_LABEL,
  COURSE_ACCESS_LEVELS_ADD_SECOND_LABEL,
  COURSE_ACCESS_LEVELS_BASE_PRICE_LABEL,
  COURSE_ACCESS_LEVELS_LEGACY_COPY,
  COURSE_ACCESS_LEVELS_SECTION_TITLE,
  getCourseBuilderErrorMessage,
  type CourseBuilderAccessLevelDto,
  type CourseBuilderSnapshot,
} from "@/lib/author-products/course-builder-shared";
import { formatRubles } from "@/lib/products/price-format";

type DraftLevel = {
  title: string;
  description: string;
  upgrade_price: string;
};

const emptyDraft = (): DraftLevel => ({
  title: "",
  description: "",
  upgrade_price: "",
});

export function AuthorCourseAccessLevels({
  practiceId,
  levels,
  basePrice,
  isFree,
  disabled,
  onSnapshot,
  onError,
}: {
  practiceId: string | null;
  levels: CourseBuilderAccessLevelDto[];
  basePrice: number;
  isFree: boolean;
  disabled: boolean;
  onSnapshot: (snapshot: CourseBuilderSnapshot) => void;
  onError: (message: string | null) => void;
}) {
  const [draftMode, setDraftMode] = useState<"idle" | "bootstrap" | "append">(
    "idle",
  );
  const [draftL1, setDraftL1] = useState<DraftLevel>(emptyDraft);
  const [draftNext, setDraftNext] = useState<DraftLevel>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const configured = levels.length > 0;
  const maxLevel = configured
    ? Math.max(...levels.map((level) => level.level))
    : 0;

  async function postSnapshot(
    url: string,
    init: RequestInit,
  ): Promise<CourseBuilderSnapshot | null> {
    if (!practiceId) {
      onError("Сохраните продукт, чтобы настроить уровни доступа.");
      return null;
    }

    setBusy(true);
    onError(null);

    try {
      const response = await fetch(url, init);
      const payload = (await response.json()) as CourseBuilderSnapshot & {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        onError(payload.message ?? getCourseBuilderErrorMessage(payload.error));
        return null;
      }

      onSnapshot(payload);
      return payload;
    } catch {
      onError("Не удалось сохранить уровни доступа.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveBootstrap() {
    const snapshot = await postSnapshot(
      `/api/author/products/${practiceId}/course/access-levels`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          levels: [
            {
              level: 1,
              title: draftL1.title,
              description: draftL1.description,
            },
            {
              level: 2,
              title: draftNext.title,
              description: draftNext.description,
              upgrade_price: Number(draftNext.upgrade_price),
            },
          ],
        }),
      },
    );

    if (snapshot) {
      setDraftMode("idle");
      setDraftL1(emptyDraft());
      setDraftNext(emptyDraft());
    }
  }

  async function saveAppend() {
    const snapshot = await postSnapshot(
      `/api/author/products/${practiceId}/course/access-levels`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftNext.title,
          description: draftNext.description,
          upgrade_price: Number(draftNext.upgrade_price),
        }),
      },
    );

    if (snapshot) {
      setDraftMode("idle");
      setDraftNext(emptyDraft());
    }
  }

  async function saveLevel(
    level: CourseBuilderAccessLevelDto,
    next: { title: string; description: string; upgrade_price: string },
  ) {
    await postSnapshot(
      `/api/author/products/${practiceId}/course/access-levels/${level.level}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: next.title,
          description: next.description,
          upgrade_price:
            level.level <= 1 ? null : Number(next.upgrade_price),
        }),
      },
    );
  }

  async function deleteHighest() {
    if (maxLevel <= 1) {
      return;
    }

    const confirmed = window.confirm(
      `Удалить уровень ${maxLevel}? Уроки и доступ слушателей не будут перенесены автоматически.`,
    );

    if (!confirmed) {
      return;
    }

    await postSnapshot(
      `/api/author/products/${practiceId}/course/access-levels/${maxLevel}`,
      { method: "DELETE" },
    );
  }

  return (
    <div
      data-author-course-access-levels
      className="space-y-4 rounded-[20px] border border-[#eee6f7] bg-[#fbf8ff] p-4"
    >
      <h3 className="text-[18px] font-semibold">
        {COURSE_ACCESS_LEVELS_SECTION_TITLE}
      </h3>

      {!configured && draftMode === "idle" ? (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-[#5c5278]">
            {COURSE_ACCESS_LEVELS_LEGACY_COPY}
          </p>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => setDraftMode("bootstrap")}
            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {COURSE_ACCESS_LEVELS_ADD_SECOND_LABEL}
          </button>
        </div>
      ) : null}

      {!configured && draftMode === "bootstrap" ? (
        <div className="space-y-4">
          <AccessLevelDraftFields
            heading="Уровень 1"
            draft={draftL1}
            disabled={disabled || busy}
            showUpgradePrice={false}
            basePrice={basePrice}
            isFree={isFree}
            onChange={setDraftL1}
          />
          <AccessLevelDraftFields
            heading="Уровень 2"
            draft={draftNext}
            disabled={disabled || busy}
            showUpgradePrice
            onChange={setDraftNext}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => void saveBootstrap()}
              className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Сохранить уровни
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraftMode("idle");
                setDraftL1(emptyDraft());
                setDraftNext(emptyDraft());
              }}
              className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {configured
        ? levels.map((level) => (
            <AccessLevelCard
              key={level.id}
              level={level}
              disabled={disabled || busy}
              canDelete={level.level === maxLevel && level.level > 1}
              basePrice={basePrice}
              isFree={isFree}
              onSave={(next) => void saveLevel(level, next)}
              onDelete={() => void deleteHighest()}
            />
          ))
        : null}

      {configured && draftMode === "append" ? (
        <AccessLevelDraftFields
          heading={`Уровень ${maxLevel + 1}`}
          draft={draftNext}
          disabled={disabled || busy}
          showUpgradePrice
          onChange={setDraftNext}
        />
      ) : null}

      {configured ? (
        <div className="flex flex-wrap gap-2">
          {draftMode === "append" ? (
            <>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => void saveAppend()}
                className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Сохранить уровень
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraftMode("idle");
                  setDraftNext(emptyDraft());
                }}
                className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
              >
                Отмена
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => setDraftMode("append")}
              className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
            >
              {COURSE_ACCESS_LEVELS_ADD_NEXT_LABEL}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AccessLevelDraftFields({
  heading,
  draft,
  disabled,
  showUpgradePrice,
  basePrice,
  isFree,
  onChange,
}: {
  heading: string;
  draft: DraftLevel;
  disabled: boolean;
  showUpgradePrice: boolean;
  basePrice?: number;
  isFree?: boolean;
  onChange: (next: DraftLevel) => void;
}) {
  return (
    <div className="space-y-3 rounded-[18px] border border-[#eadff8] bg-white p-4">
      <p className="text-sm font-semibold text-[#3f3560]">{heading}</p>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Название</span>
        <input
          value={draft.title}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, title: event.target.value })
          }
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Описание <span className="font-normal text-[#8c79b6]">необязательно</span>
        </span>
        <textarea
          value={draft.description}
          disabled={disabled}
          rows={3}
          onChange={(event) =>
            onChange({ ...draft, description: event.target.value })
          }
          className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 text-sm outline-none focus:border-[#9a74d8]"
        />
      </label>
      {showUpgradePrice ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Доплата, ₽</span>
          <input
            inputMode="numeric"
            value={draft.upgrade_price}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...draft,
                upgrade_price: event.target.value.replace(/[^\d]/g, ""),
              })
            }
            className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
          />
        </label>
      ) : (
        <p className="text-sm text-[#5c5278]">
          <span className="font-medium text-[#3f3560]">
            {COURSE_ACCESS_LEVELS_BASE_PRICE_LABEL}:{" "}
          </span>
          {isFree || !basePrice || basePrice <= 0
            ? "Подарок"
            : formatRubles(basePrice)}
        </p>
      )}
    </div>
  );
}

function AccessLevelCard({
  level,
  disabled,
  canDelete,
  basePrice,
  isFree,
  onSave,
  onDelete,
}: {
  level: CourseBuilderAccessLevelDto;
  disabled: boolean;
  canDelete: boolean;
  basePrice: number;
  isFree: boolean;
  onSave: (next: DraftLevel) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(level.title);
  const [description, setDescription] = useState(level.description ?? "");
  const [upgradePrice, setUpgradePrice] = useState(
    level.upgrade_price != null ? String(level.upgrade_price) : "",
  );

  function persistIfChanged() {
    const currentPrice =
      level.upgrade_price != null ? String(level.upgrade_price) : "";
    if (
      title.trim() === level.title &&
      description.trim() === (level.description ?? "") &&
      upgradePrice === currentPrice
    ) {
      return;
    }

    onSave({
      title,
      description,
      upgrade_price: upgradePrice,
    });
  }

  return (
    <div
      data-author-access-level={level.level}
      className="space-y-3 rounded-[18px] border border-[#eadff8] bg-white p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#3f3560]">
          Уровень {level.level}
        </p>
        {canDelete ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            className="text-xs font-semibold text-[#9b3d3d] disabled:opacity-50"
          >
            Удалить
          </button>
        ) : null}
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Название</span>
        <input
          value={title}
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => persistIfChanged()}
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Описание <span className="font-normal text-[#8c79b6]">необязательно</span>
        </span>
        <textarea
          value={description}
          disabled={disabled}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => persistIfChanged()}
          className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 text-sm outline-none focus:border-[#9a74d8]"
        />
      </label>
      {level.level <= 1 ? (
        <p className="text-sm text-[#5c5278]">
          <span className="font-medium text-[#3f3560]">
            {COURSE_ACCESS_LEVELS_BASE_PRICE_LABEL}:{" "}
          </span>
          {isFree || basePrice <= 0 ? "Подарок" : formatRubles(basePrice)}
        </p>
      ) : (
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Доплата, ₽</span>
          <input
            inputMode="numeric"
            value={upgradePrice}
            disabled={disabled}
            onChange={(event) =>
              setUpgradePrice(event.target.value.replace(/[^\d]/g, ""))
            }
            onBlur={() => persistIfChanged()}
            className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
          />
        </label>
      )}
    </div>
  );
}
