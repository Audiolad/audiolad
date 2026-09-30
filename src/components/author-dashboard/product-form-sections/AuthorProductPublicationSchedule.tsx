"use client";

import {
  formatMoscowDateTime,
  isoToMoscowDateTimeLocal,
  moscowDateTimeLocalMin,
  moscowDateTimeLocalToIso,
} from "@/lib/author-products/publication-schedule";

type AuthorProductPublicationScheduleProps = {
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
};

export default function AuthorProductPublicationSchedule({
  value,
  disabled,
  onChange,
}: AuthorProductPublicationScheduleProps) {
  const localValue = isoToMoscowDateTimeLocal(value);

  return (
    <section className="rounded-[22px] border border-[#e4d7f4] bg-[#fbf8ff] p-5">
      <h3 className="text-[17px] font-semibold text-[#25135c]">
        Отложенная публикация
      </h3>
      <p className="mt-2 text-sm leading-6 text-[#6f628e]">
        Можно отправить продукт на модерацию заранее. После одобрения он
        автоматически появится на платформе в выбранные дату и время.
      </p>

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-medium text-[#3f3560]">
          Дата и время публикации — МСК
        </span>
        <input
          type="datetime-local"
          value={localValue}
          min={moscowDateTimeLocalMin()}
          disabled={disabled}
          onChange={(event) =>
            onChange(moscowDateTimeLocalToIso(event.target.value))
          }
          className="w-full rounded-[18px] border border-[#d9c9ef] bg-white px-4 py-3 text-[#25135c] outline-none focus:border-[#9a74d8] disabled:bg-[#f4f1f8] disabled:text-[#8a80a3]"
        />
      </label>

      <p className="mt-2 text-xs leading-5 text-[#7d70a2]">
        Время всегда московское (МСК, UTC+3), независимо от часового пояса
        автора. Оставьте поле пустым — продукт выйдет сразу после одобрения.
      </p>

      {value ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-[#4457a5]">
            Запланировано: {formatMoscowDateTime(value)} МСК
          </p>
          {!disabled ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-sm font-semibold text-[#7042c5] underline underline-offset-2"
            >
              Убрать дату
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
