"use client";

import { useActionState } from "react";

import {
  updateAuthorApplicationReview,
  type UpdateAuthorApplicationState,
} from "@/app/admin/author-applications/actions";
import { ADMIN_APPLICATION_STATUS_OPTIONS } from "@/lib/admin/application-status";
import type { AuthorApplicationRow } from "@/lib/author-applications/types";

type AuthorApplicationReviewFormProps = {
  application: AuthorApplicationRow;
};

const INITIAL_STATE: UpdateAuthorApplicationState = { ok: false };

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[#9485b4]">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#25135c]">
        {value}
      </p>
    </div>
  );
}

export default function AuthorApplicationReviewForm({
  application,
}: AuthorApplicationReviewFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateAuthorApplicationReview,
    INITIAL_STATE,
  );
  const contact = application.contact?.trim() ?? "";

  async function handleCopyContact() {
    if (!contact) {
      return;
    }

    try {
      await navigator.clipboard.writeText(contact);
    } catch {
      // Clipboard may be unavailable in some browsers.
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Данные заявки</h2>

        <div className="mt-4 space-y-4">
          <InfoRow label="Имя" value={application.display_name} />
          <InfoRow label="Контакт" value={contact || "—"} />
          <InfoRow label="Тематика" value={application.direction} />
          <InfoRow label="О себе" value={application.about} />
          <InfoRow
            label="Планируемые материалы"
            value={application.planned_content}
          />
          <InfoRow label="Опыт" value={application.experience?.trim() || "—"} />
          <InfoRow label="Ссылки" value={application.links?.trim() || "—"} />
          <InfoRow
            label="Согласие на обработку данных"
            value={application.consent_personal_data ? "Дано" : "Не дано"}
          />
          <InfoRow
            label="Есть готовые материалы"
            value={application.has_ready_materials ? "Да" : "Нет"}
          />
          <InfoRow
            label="Интерес к обучению"
            value={application.wants_training ? "Да" : "Нет"}
          />
          <InfoRow
            label="Интерес к школе авторов"
            value={application.interested_in_school ? "Да" : "Нет"}
          />
          <InfoRow
            label="Создана"
            value={formatDateTime(application.created_at)}
          />
          <InfoRow
            label="Отправлена"
            value={formatDateTime(application.submitted_at)}
          />
        </div>

        {contact ? (
          <button
            type="button"
            onClick={handleCopyContact}
            className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
          >
            Скопировать контакт
          </button>
        ) : null}
      </section>

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Рассмотрение</h2>

        {state.ok ? (
          <div className="mt-4 rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-3 text-sm text-[#3d8d65]">
            Изменения сохранены.
          </div>
        ) : null}

        {state.error ? (
          <div className="mt-4 rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-3 text-sm text-[#b34f63]">
            {state.error}
          </div>
        ) : null}

        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="applicationId" value={application.id} />

          <label className="block">
            <span className="text-sm font-medium text-[#25135c]">Статус</span>
            <select
              name="status"
              defaultValue={application.status}
              disabled={isPending}
              className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#25135c]"
            >
              {ADMIN_APPLICATION_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-[#25135c]">
              Внутренняя заметка
            </span>
            <textarea
              name="adminNote"
              defaultValue={application.admin_note ?? ""}
              rows={5}
              disabled={isPending}
              placeholder="Заметка видна только команде платформы"
              className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c]"
            />
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white disabled:opacity-60"
          >
            {isPending ? "Сохранение…" : "Сохранить изменения"}
          </button>
        </form>
      </section>
    </div>
  );
}
