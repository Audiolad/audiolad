"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  ADMIN_COMMERCIAL_APPLICATION_ACTION_INITIAL_STATE,
  type AdminCommercialApplicationActionState,
} from "@/app/admin/commercial-applications/action-state";
import {
  approveCommercialApplication,
  rejectCommercialApplication,
  requestCommercialApplicationChanges,
  takeCommercialApplicationInReview,
  updateCommercialApplicationAdminNote,
} from "@/app/admin/commercial-applications/actions";
import { getAdminApplicationStatusLabel } from "@/lib/admin/application-status";
import { getAuthorAccessStatusLabel } from "@/lib/authors/access";
import type { AdminAuthorCommercialApplicationDetail } from "@/lib/author-commercial-applications/types";

type CommercialApplicationReviewFormProps = {
  application: AdminAuthorCommercialApplicationDetail;
};

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
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#25135c]">
        {value}
      </p>
    </div>
  );
}

function ActionFeedback({
  state,
}: {
  state: AdminCommercialApplicationActionState;
}) {
  if (state.ok && state.message) {
    return (
      <div className="rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-3 text-sm text-[#3d8d65]">
        {state.message}
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-3 text-sm text-[#b34f63]">
        {state.error}
      </div>
    );
  }

  return null;
}

export default function CommercialApplicationReviewForm({
  application,
}: CommercialApplicationReviewFormProps) {
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [adminNote, setAdminNote] = useState(application.admin_note ?? "");
  const [reviewComment, setReviewComment] = useState(
    application.review_comment ?? "",
  );

  const [takeState, takeAction, takePending] = useActionState(
    takeCommercialApplicationInReview,
    ADMIN_COMMERCIAL_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [changesState, changesAction, changesPending] = useActionState(
    requestCommercialApplicationChanges,
    ADMIN_COMMERCIAL_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectCommercialApplication,
    ADMIN_COMMERCIAL_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [approveState, approveAction, approvePending] = useActionState(
    approveCommercialApplication,
    ADMIN_COMMERCIAL_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [noteState, noteAction, notePending] = useActionState(
    updateCommercialApplicationAdminNote,
    ADMIN_COMMERCIAL_APPLICATION_ACTION_INITIAL_STATE,
  );

  const feedbackState =
    approveState.ok || approveState.error
      ? approveState
      : rejectState.ok || rejectState.error
        ? rejectState
        : changesState.ok || changesState.error
          ? changesState
          : takeState.ok || takeState.error
            ? takeState
            : noteState.ok || noteState.error
              ? noteState
              : ADMIN_COMMERCIAL_APPLICATION_ACTION_INITIAL_STATE;

  const canTake = application.status === "submitted";
  const canRequestChanges = application.status === "in_review";
  const canApprove = ["submitted", "in_review", "needs_changes"].includes(
    application.status,
  );
  const canReject = canApprove;

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Данные заявки</h2>

        <div className="mt-4 space-y-4">
          <InfoRow
            label="Автор"
            value={
              application.authorName
                ? `${application.authorName}${
                    application.authorSlug ? ` (${application.authorSlug})` : ""
                  }`
                : application.author_id
            }
          />
          {application.authorSlug ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#9485b4]">
                Публичная страница автора
              </p>
              <Link
                href={`/authors/${application.authorSlug}`}
                className="mt-1 inline-block text-sm font-medium text-[#7042c5]"
              >
                /authors/{application.authorSlug}
              </Link>
            </div>
          ) : null}
          <InfoRow
            label="Статус доступа автора"
            value={
              application.accessStatus
                ? getAuthorAccessStatusLabel(
                    application.accessStatus as Parameters<
                      typeof getAuthorAccessStatusLabel
                    >[0],
                  )
                : "—"
            }
          />
          <InfoRow
            label="Подал"
            value={
              application.creatorDisplayName ||
              application.creatorEmail ||
              application.created_by
            }
          />
          <InfoRow
            label="Планируемые платные продукты"
            value={application.planned_products || "—"}
          />
          <InfoRow label="Темы" value={application.topics || "—"} />
          <InfoRow label="Формат" value={application.format_plan || "—"} />
          <InfoRow
            label="Подтверждение прав"
            value={application.rights_confirmation ? "Да" : "Нет"}
          />
          <InfoRow
            label="Комментарий команде"
            value={application.team_comment?.trim() || "—"}
          />
          <InfoRow
            label="Текущий статус"
            value={getAdminApplicationStatusLabel(application.status)}
          />
          <InfoRow
            label="Создана"
            value={formatDateTime(application.created_at)}
          />
          <InfoRow
            label="Отправлена"
            value={formatDateTime(application.submitted_at)}
          />
          <InfoRow
            label="Рассмотрена"
            value={formatDateTime(application.reviewed_at)}
          />
          {application.review_comment ? (
            <InfoRow
              label="Комментарий заявителю"
              value={application.review_comment}
            />
          ) : null}
        </div>
      </section>

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Рассмотрение</h2>

        <div className="mt-4 space-y-4">
          <ActionFeedback state={feedbackState} />

          <label className="block">
            <span className="text-sm font-medium text-[#25135c]">
              Внутренняя заметка
            </span>
            <textarea
              name="adminNote"
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              rows={4}
              placeholder="Заметка видна только команде платформы"
              className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c]"
            />
          </label>

          <form action={noteAction}>
            <input type="hidden" name="applicationId" value={application.id} />
            <input type="hidden" name="adminNote" value={adminNote} />
            <button
              type="submit"
              disabled={notePending}
              className="inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5] disabled:opacity-60"
            >
              {notePending ? "Сохранение…" : "Сохранить внутреннюю заметку"}
            </button>
          </form>

          {(canRequestChanges || canReject) && (
            <label className="block">
              <span className="text-sm font-medium text-[#25135c]">
                Комментарий для заявителя
              </span>
              <textarea
                name="reviewComment"
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                rows={4}
                placeholder="Этот текст увидит заявитель при запросе изменений или отклонении"
                className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c]"
              />
            </label>
          )}

          <div className="flex flex-col gap-3">
            {canTake ? (
              <form action={takeAction} className="contents">
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="adminNote" value={adminNote} />
                <button
                  type="submit"
                  disabled={takePending}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {takePending ? "Обработка…" : "Взять в работу"}
                </button>
              </form>
            ) : null}

            {canRequestChanges ? (
              <form action={changesAction} className="contents">
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="adminNote" value={adminNote} />
                <input type="hidden" name="reviewComment" value={reviewComment} />
                <button
                  type="submit"
                  disabled={changesPending}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5] disabled:opacity-60"
                >
                  {changesPending ? "Обработка…" : "Запросить изменения"}
                </button>
              </form>
            ) : null}

            {canApprove ? (
              <>
                {!showApproveConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowApproveConfirm(true)}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white"
                  >
                    Одобрить
                  </button>
                ) : (
                  <div className="rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-4">
                    <p className="text-sm leading-6 text-[#2f5f45]">
                      Автору будет открыт коммерческий статус. Следующие шаги
                      подготовки кабинета станут доступны в онбординге.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <form action={approveAction}>
                        <input
                          type="hidden"
                          name="applicationId"
                          value={application.id}
                        />
                        <input type="hidden" name="adminNote" value={adminNote} />
                        <button
                          type="submit"
                          disabled={approvePending}
                          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {approvePending ? "Обработка…" : "Подтвердить одобрение"}
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => setShowApproveConfirm(false)}
                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : null}

            {canReject ? (
              <form action={rejectAction} className="contents">
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="adminNote" value={adminNote} />
                <input type="hidden" name="reviewComment" value={reviewComment} />
                <button
                  type="submit"
                  disabled={rejectPending}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#efc7cf] bg-[#fff8f9] px-5 text-sm font-medium text-[#b34f63] disabled:opacity-60"
                >
                  {rejectPending ? "Обработка…" : "Отклонить"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">История</h2>
        {application.applicationEvents.length === 0 ? (
          <p className="mt-3 text-sm text-[#796ba0]">История решений пока пуста.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {application.applicationEvents.map((event) => (
              <li
                key={event.id}
                className="rounded-[16px] border border-[#efe6fa] bg-[#faf6ff] px-4 py-3"
              >
                <p className="text-sm font-medium text-[#25135c]">
                  {event.from_status ?? "—"} → {event.to_status}
                </p>
                <p className="mt-1 text-xs text-[#796ba0]">
                  {formatDateTime(event.created_at)}
                </p>
                {event.staff_comment ? (
                  <p className="mt-2 text-sm text-[#5f5484]">
                    Внутренний комментарий: {event.staff_comment}
                  </p>
                ) : null}
                {event.applicant_comment ? (
                  <p className="mt-2 text-sm text-[#5f5484]">
                    Комментарий заявителю: {event.applicant_comment}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
