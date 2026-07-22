"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE,
  approveAuthorApplication,
  rejectAuthorApplication,
  requestAuthorApplicationChanges,
  restoreLinkedAuthorAccess,
  resendAuthorApplicationApprovedEmail,
  returnAuthorApplicationToReview,
  suspendLinkedAuthorAccess,
  takeAuthorApplicationInReview,
  updateAuthorApplicationAdminNote,
  type AdminAuthorApplicationActionState,
} from "@/app/admin/author-applications/actions";
import { getAdminApplicationStatusLabel } from "@/lib/admin/application-status";
import { getAuthorAccessStatusLabel } from "@/lib/authors/access";
import type { AdminAuthorApplicationDetail } from "@/lib/author-applications/types";

type AuthorApplicationReviewFormProps = {
  application: AdminAuthorApplicationDetail;
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

function ActionFeedback({ state }: { state: AdminAuthorApplicationActionState }) {
  if (state.ok && state.message) {
    return (
      <div className="rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-3 text-sm text-[#3d8d65]">
        {state.message}
        {state.warning ? (
          <p className="mt-2 text-[#8a6a1f]">{state.warning}</p>
        ) : null}
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

  if (state.warning) {
    return (
      <div className="rounded-[18px] border border-[#f0dfab] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a6a1f]">
        {state.warning}
      </div>
    );
  }

  return null;
}

function StatusEventList({
  application,
}: {
  application: AdminAuthorApplicationDetail;
}) {
  const events = [
    ...application.applicationEvents.map((event) => ({
      id: event.id,
      createdAt: event.created_at,
      label: `${event.from_status ?? "—"} → ${event.to_status}`,
      staffComment: event.staff_comment,
      applicantComment: event.applicant_comment,
      kind: "application" as const,
    })),
    ...application.accessEvents.map((event) => ({
      id: event.id,
      createdAt: event.created_at,
      label: `access: ${event.from_status ?? "—"} → ${event.to_status}`,
      staffComment: event.reason,
      applicantComment: null,
      kind: "access" as const,
    })),
  ].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  if (events.length === 0) {
    return (
      <p className="text-sm text-[#796ba0]">История решений пока пуста.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <li
          key={`${event.kind}-${event.id}`}
          className="rounded-[16px] border border-[#efe6fa] bg-[#faf6ff] px-4 py-3"
        >
          <p className="text-sm font-medium text-[#25135c]">{event.label}</p>
          <p className="mt-1 text-xs text-[#796ba0]">
            {formatDateTime(event.createdAt)}
          </p>
          {event.staffComment ? (
            <p className="mt-2 text-sm text-[#5f5484]">
              Внутренний комментарий: {event.staffComment}
            </p>
          ) : null}
          {event.applicantComment ? (
            <p className="mt-2 text-sm text-[#5f5484]">
              Комментарий заявителю: {event.applicantComment}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function AuthorApplicationReviewForm({
  application,
}: AuthorApplicationReviewFormProps) {
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showResendConfirm, setShowResendConfirm] = useState(false);
  const [adminNote, setAdminNote] = useState(application.admin_note ?? "");
  const [reviewComment, setReviewComment] = useState(
    application.review_comment ?? "",
  );
  const [suspendReason, setSuspendReason] = useState("");

  const [takeState, takeAction, takePending] = useActionState(
    takeAuthorApplicationInReview,
    ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [changesState, changesAction, changesPending] = useActionState(
    requestAuthorApplicationChanges,
    ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [returnState, returnAction, returnPending] = useActionState(
    returnAuthorApplicationToReview,
    ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectAuthorApplication,
    ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [approveState, approveAction, approvePending] = useActionState(
    approveAuthorApplication,
    ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [suspendState, suspendAction, suspendPending] = useActionState(
    suspendLinkedAuthorAccess,
    ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [restoreState, restoreAction, restorePending] = useActionState(
    restoreLinkedAuthorAccess,
    ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [noteState, noteAction, notePending] = useActionState(
    updateAuthorApplicationAdminNote,
    ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE,
  );
  const [resendState, resendAction, resendPending] = useActionState(
    resendAuthorApplicationApprovedEmail,
    ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE,
  );

  const feedbackState =
    approveState.ok || approveState.error || approveState.warning
      ? approveState
      : rejectState.ok || rejectState.error
        ? rejectState
        : changesState.ok || changesState.error
          ? changesState
          : takeState.ok || takeState.error
            ? takeState
            : returnState.ok || returnState.error
              ? returnState
              : suspendState.ok || suspendState.error
                ? suspendState
                : restoreState.ok || restoreState.error
                  ? restoreState
                  : noteState.ok || noteState.error
                    ? noteState
                    : resendState.ok || resendState.error
                      ? resendState
                      : ADMIN_AUTHOR_APPLICATION_ACTION_INITIAL_STATE;

  const contactEmail = application.contact_email?.trim() ?? "";
  const contactDetails = application.contact_details?.trim() ?? "";
  const copyText = [contactEmail, contactDetails].filter(Boolean).join("\n");

  async function handleCopyContacts() {
    if (!copyText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      // Clipboard may be unavailable.
    }
  }

  const linkedAuthor = application.linkedAuthor;
  const canTake = application.status === "submitted";
  const canRequestChanges = application.status === "in_review";
  const canReturnToReview = application.status === "needs_changes";
  const canApprove = ["submitted", "in_review", "needs_changes"].includes(
    application.status,
  );
  const canReject = canApprove;
  const canSuspend =
    linkedAuthor &&
    ["free", "commercial_pending", "commercial"].includes(
      linkedAuthor.accessStatus,
    );
  const canRestore = linkedAuthor?.accessStatus === "suspended";
  const emailDelivery = application.accessGrantedEmailDelivery;
  const canSendAccessEmail =
    application.status === "approved" && Boolean(linkedAuthor);
  const emailAlreadySent = emailDelivery?.status === "sent";

  function renderEmailDeliveryStatus() {
    if (!canSendAccessEmail) {
      return null;
    }

    if (!emailDelivery) {
      return (
        <p className="text-sm text-[#796ba0]">Отправка ещё не выполнялась.</p>
      );
    }

    if (emailDelivery.status === "sent") {
      return (
        <p className="text-sm text-[#3d8d65]">
          Письмо отправлено
          {emailDelivery.sentAt
            ? `: ${formatDateTime(emailDelivery.sentAt)}`
            : "."}
        </p>
      );
    }

    if (emailDelivery.status === "failed") {
      return (
        <div className="space-y-1">
          <p className="text-sm text-[#b34f63]">Письмо не отправлено.</p>
          {emailDelivery.lastError ? (
            <p className="text-sm text-[#796ba0]">{emailDelivery.lastError}</p>
          ) : null}
        </div>
      );
    }

    return (
      <p className="text-sm text-[#796ba0]">
        Отправка ещё не завершена (статус: ожидание).
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Данные заявки</h2>

        <div className="mt-4 space-y-4">
          <InfoRow label="Имя" value={application.display_name} />
          <InfoRow
            label="Электронная почта"
            value={contactEmail || application.userEmail || "—"}
          />
          <InfoRow
            label="Пользователь"
            value={
              application.userDisplayName
                ? `${application.userDisplayName} (${application.user_id})`
                : application.user_id
            }
          />
          <InfoRow
            label="Телефон, MAX или другой способ связи"
            value={contactDetails || "—"}
          />
          <InfoRow label="Тематика" value={application.direction} />
          <InfoRow label="О себе" value={application.about} />
          <InfoRow
            label="Планируемые материалы"
            value={application.planned_content}
          />
          <InfoRow label="Опыт" value={application.experience?.trim() || "—"} />
          <InfoRow label="Ссылки" value={application.links?.trim() || "—"} />
          <InfoRow
            label="Текущий статус"
            value={getAdminApplicationStatusLabel(application.status)}
          />
          <InfoRow
            label="Связанное авторское пространство"
            value={
              linkedAuthor
                ? `${linkedAuthor.name} (${linkedAuthor.slug})`
                : "—"
            }
          />
          <InfoRow
            label="Статус авторского доступа"
            value={
              linkedAuthor
                ? getAuthorAccessStatusLabel(
                    linkedAuthor.accessStatus as Parameters<
                      typeof getAuthorAccessStatusLabel
                    >[0],
                  )
                : "—"
            }
          />
          {linkedAuthor ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#9485b4]">
                Публичная страница автора
              </p>
              <Link
                href={`/authors/${linkedAuthor.slug}`}
                className="mt-1 inline-block text-sm font-medium text-[#7042c5]"
              >
                /authors/{linkedAuthor.slug}
              </Link>
            </div>
          ) : null}
          <InfoRow
            label="Создана"
            value={formatDateTime(application.created_at)}
          />
          <InfoRow
            label="Отправлена"
            value={formatDateTime(application.submitted_at)}
          />
          <InfoRow
            label="Одобрена"
            value={formatDateTime(application.approved_at)}
          />
          {application.review_comment ? (
            <InfoRow
              label="Комментарий заявителю"
              value={application.review_comment}
            />
          ) : null}
        </div>

        {copyText ? (
          <button
            type="button"
            onClick={handleCopyContacts}
            className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
          >
            Скопировать контакты
          </button>
        ) : null}
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

            {canReturnToReview ? (
              <form action={returnAction} className="contents">
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="adminNote" value={adminNote} />
                <button
                  type="submit"
                  disabled={returnPending}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5] disabled:opacity-60"
                >
                  {returnPending ? "Обработка…" : "Вернуть на рассмотрение"}
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
                      Будет создано новое авторское пространство и открыт
                      бесплатный кабинет автора. Автор сможет публиковать только
                      бесплатные продукты.
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
                          className="inline-flex min-h-11 items-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {approvePending ? "Одобрение…" : "Подтвердить одобрение"}
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => setShowApproveConfirm(false)}
                        className="inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
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
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#efc7cf] px-5 text-sm font-medium text-[#b34f63] disabled:opacity-60"
                >
                  {rejectPending ? "Обработка…" : "Отклонить"}
                </button>
              </form>
            ) : null}
          </div>

          {linkedAuthor && (canSuspend || canRestore) ? (
            <div className="border-t border-[#efe6fa] pt-4">
              <h3 className="text-sm font-semibold text-[#25135c]">
                Управление авторским доступом
              </h3>

              {canSuspend ? (
                <form action={suspendAction} className="mt-3 space-y-3">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input type="hidden" name="authorId" value={linkedAuthor.id} />
                  <label className="block">
                    <span className="text-sm font-medium text-[#25135c]">
                      Причина приостановки
                    </span>
                    <textarea
                      name="reason"
                      value={suspendReason}
                      onChange={(event) => setSuspendReason(event.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c]"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={suspendPending}
                    className="inline-flex min-h-11 items-center rounded-full border border-[#efc7cf] px-5 text-sm font-medium text-[#b34f63] disabled:opacity-60"
                  >
                    {suspendPending ? "Обработка…" : "Приостановить доступ"}
                  </button>
                </form>
              ) : null}

              {canRestore ? (
                <form action={restoreAction} className="mt-3">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input type="hidden" name="authorId" value={linkedAuthor.id} />
                  <button
                    type="submit"
                    disabled={restorePending}
                    className="inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5] disabled:opacity-60"
                  >
                    {restorePending ? "Обработка…" : "Восстановить доступ"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {canSendAccessEmail ? (
        <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#25135c]">
            Письмо об открытии кабинета
          </h2>
          <div className="mt-4 space-y-4">
            {renderEmailDeliveryStatus()}

            {emailAlreadySent ? (
              <>
                {!showResendConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowResendConfirm(true)}
                    className="inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
                  >
                    Отправить повторно
                  </button>
                ) : (
                  <div className="rounded-[18px] border border-[#f0dfab] bg-[#fffaf0] px-4 py-4">
                    <p className="text-sm leading-6 text-[#8a6a1f]">
                      Письмо уже было успешно отправлено. Повторная отправка
                      создаст новое письмо получателю.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <form action={resendAction}>
                        <input
                          type="hidden"
                          name="applicationId"
                          value={application.id}
                        />
                        <input type="hidden" name="forceResend" value="1" />
                        <button
                          type="submit"
                          disabled={resendPending}
                          className="inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {resendPending ? "Отправка…" : "Подтвердить повторную отправку"}
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => setShowResendConfirm(false)}
                        className="inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <form action={resendAction}>
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="forceResend" value="0" />
                <button
                  type="submit"
                  disabled={resendPending}
                  className="inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5] disabled:opacity-60"
                >
                  {resendPending
                    ? "Отправка…"
                    : emailDelivery?.status === "failed"
                      ? "Отправить повторно"
                      : "Отправить письмо"}
                </button>
              </form>
            )}
          </div>
        </section>
      ) : null}

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">История решений</h2>
        <div className="mt-4">
          <StatusEventList application={application} />
        </div>
      </section>
    </div>
  );
}
