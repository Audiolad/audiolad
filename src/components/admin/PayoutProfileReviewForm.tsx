"use client";

import { useActionState, useState } from "react";

import {
  ADMIN_PAYOUT_PROFILE_ACTION_INITIAL_STATE,
  pickAdminPayoutProfileFeedback,
  type AdminPayoutProfileActionKind,
  type AdminPayoutProfileActionState,
} from "@/app/(platform)/admin/payout-profiles/action-state";
import { canStaffTransitionPayoutProfileStatus } from "@/lib/author-payout-profiles/status";
import {
  rejectPayoutProfile,
  requestPayoutProfileChanges,
  takePayoutProfileInReview,
  verifyPayoutProfile,
} from "@/app/(platform)/admin/payout-profiles/actions";
import type { AuthorPayoutProfileAdminDetail } from "@/lib/author-payout-profiles/types";
import {
  getAuthorPayoutMethodLabel,
  getAuthorPayoutRecipientTypeLabel,
} from "@/lib/author-payout-profiles/types";
import {
  formatPayoutProfileVerifyBlockedMessage,
  getAdminPayoutProfileStatusLabel,
  payoutBankNameLooksInvalid,
} from "@/lib/author-payout-profiles/admin-status";

type PayoutProfileReviewFormProps = {
  profile: AuthorPayoutProfileAdminDetail;
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
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function DecisionSummary({
  profile,
}: {
  profile: AuthorPayoutProfileAdminDetail;
}) {
  const who = profile.reviewed_by_name ?? "сотрудник платформы";

  if (profile.status === "verified") {
    return (
      <div
        data-payout-decision="verified"
        className="rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-3 text-sm leading-6 text-[#2f7a52]"
      >
        <p className="font-semibold">Данные подтверждены</p>
        <p className="mt-1">
          {formatDateTime(profile.verified_at)} (МСК) · {who}
        </p>
      </div>
    );
  }

  if (profile.status === "rejected") {
    return (
      <div
        data-payout-decision="rejected"
        className="rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-3 text-sm leading-6 text-[#b34f63]"
      >
        <p className="font-semibold">Анкета отклонена</p>
        <p className="mt-1">
          {formatDateTime(profile.rejected_at)} (МСК) · {who}
        </p>
      </div>
    );
  }

  if (profile.status === "needs_changes") {
    return (
      <div
        data-payout-decision="needs_changes"
        className="rounded-[18px] border border-[#f0e2b8] bg-[#fff9e8] px-4 py-3 text-sm leading-6 text-[#8a6a1f]"
      >
        <p className="font-semibold">Автору отправлен запрос изменений</p>
        <p className="mt-1">{who}</p>
      </div>
    );
  }

  return null;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[#9485b4]">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-[#25135c]">
        {value}
      </p>
    </div>
  );
}

function ActionFeedback({ state }: { state: AdminPayoutProfileActionState }) {
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
      <div className="rounded-[18px] border border-[#f0e2b8] bg-[#fff9e8] px-4 py-3 text-sm text-[#8a6a1f]">
        {state.warning}
      </div>
    );
  }

  return null;
}

export default function PayoutProfileReviewForm({
  profile,
}: PayoutProfileReviewFormProps) {
  const [showVerifyConfirm, setShowVerifyConfirm] = useState(false);
  const [staffNote, setStaffNote] = useState(profile.staff_note ?? "");
  const [reviewComment, setReviewComment] = useState(
    profile.review_comment ?? "",
  );

  const [takeState, takeAction, takePending] = useActionState(
    takePayoutProfileInReview,
    ADMIN_PAYOUT_PROFILE_ACTION_INITIAL_STATE,
  );
  const [changesState, changesAction, changesPending] = useActionState(
    requestPayoutProfileChanges,
    ADMIN_PAYOUT_PROFILE_ACTION_INITIAL_STATE,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectPayoutProfile,
    ADMIN_PAYOUT_PROFILE_ACTION_INITIAL_STATE,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyPayoutProfile,
    ADMIN_PAYOUT_PROFILE_ACTION_INITIAL_STATE,
  );

  // Show feedback of the most recently submitted action only, so an old
  // red error (e.g. a refused confirmation) never hides a later success.
  const [lastAction, setLastAction] = useState<AdminPayoutProfileActionKind | null>(
    null,
  );
  const feedbackState = pickAdminPayoutProfileFeedback(lastAction, {
    take: takeState,
    changes: changesState,
    reject: rejectState,
    verify: verifyState,
  });

  // Buttons follow the server-side staff transition rules exactly.
  const canTake = canStaffTransitionPayoutProfileStatus(profile.status, "in_review");
  const canRequestChanges = canStaffTransitionPayoutProfileStatus(
    profile.status,
    "needs_changes",
  );
  const canVerify = canStaffTransitionPayoutProfileStatus(profile.status, "verified");
  const canReject = canStaffTransitionPayoutProfileStatus(profile.status, "rejected");

  const fields = profile.fields;
  const fullName = [fields.last_name, fields.first_name, fields.middle_name]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      data-payout-profile-form="true"
      data-admin-form="true"
      className="ym-hide-content space-y-5"
    >
      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Данные анкеты</h2>

        <div className="mt-4 space-y-4">
          <InfoRow label="Автор" value={profile.author_name} />
          <InfoRow
            label="Правовой статус"
            value={getAuthorPayoutRecipientTypeLabel(profile.recipient_type)}
          />
          <InfoRow label="Статус" value={getAdminPayoutProfileStatusLabel(profile.status)} />
          <InfoRow label="Версия" value={String(profile.version)} />
          {profile.recipient_type === "individual_entrepreneur" && fields.legal_name ? (
            <InfoRow label="Наименование ИП" value={fields.legal_name} />
          ) : null}
          <InfoRow label="ФИО" value={fullName || "—"} />
          <InfoRow label="ИНН" value={fields.inn || "—"} />
          {fields.ogrnip ? (
            <InfoRow label="ОГРНИП" value={fields.ogrnip} />
          ) : null}
          <InfoRow label="Email" value={fields.email || "—"} />
          <InfoRow label="Телефон" value={fields.phone || "—"} />
          <InfoRow
            label="Способ выплаты"
            value={
              profile.payout_method
                ? getAuthorPayoutMethodLabel(profile.payout_method)
                : "–"
            }
          />
          <InfoRow label="Банк" value={fields.bank_name || "—"} />
          {payoutBankNameLooksInvalid(fields.bank_name) ? (
            <p
              data-payout-bank-name-invalid="true"
              className="-mt-2 text-xs leading-5 text-[#b34f63]"
            >
              В поле «Банк» нет названия банка – похоже, указан номер.
            </p>
          ) : null}
          <InfoRow label="БИК" value={fields.bank_bik || "—"} />
          <InfoRow label="Расчётный счёт" value={fields.bank_account || "—"} />
          {fields.bank_correspondent_account ? (
            <InfoRow
              label="Корреспондентский счёт"
              value={fields.bank_correspondent_account}
            />
          ) : null}
          {fields.registration_address ? (
            <InfoRow
              label="Адрес регистрации"
              value={fields.registration_address}
            />
          ) : null}
          {fields.tax_residency_note ? (
            <InfoRow
              label="Примечание о налоговом резидентстве"
              value={fields.tax_residency_note}
            />
          ) : null}
          {profile.recipient_type === "self_employed" ? (
            <InfoRow
              label="Режим НПД подтверждён автором"
              value={profile.is_npd_declared ? "Да" : "Нет"}
            />
          ) : null}
          {profile.author_revision_comment ? (
            <InfoRow
              label="Комментарий автора"
              value={profile.author_revision_comment}
            />
          ) : null}
          <InfoRow label="Отправлена" value={formatDateTime(profile.submitted_at)} />
          <InfoRow label="Обновлена" value={formatDateTime(profile.updated_at)} />
          {profile.review_comment ? (
            <InfoRow
              label="Комментарий автору"
              value={profile.review_comment}
            />
          ) : null}
        </div>
      </section>

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Рассмотрение</h2>

        <div className="mt-4 space-y-4">
          <div className="rounded-[18px] border border-[#f0e2b8] bg-[#fff9e8] px-4 py-3 text-sm leading-6 text-[#8a6a1f]">
            Не вставляйте банковские реквизиты, ИНН, телефон или адрес в
            комментарии – используйте общие формулировки.
          </div>

          <DecisionSummary profile={profile} />

          {canVerify && profile.verify_blockers.length > 0 ? (
            <div
              data-payout-verify-blockers="true"
              className="rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-3 text-sm leading-6 text-[#b34f63]"
            >
              {formatPayoutProfileVerifyBlockedMessage(profile.verify_blockers)}
            </div>
          ) : null}

          <ActionFeedback state={feedbackState} />

          <label className="block">
            <span className="text-sm font-medium text-[#25135c]">
              Внутренняя заметка
            </span>
            <textarea
              name="staffNote"
              value={staffNote}
              onChange={(event) => setStaffNote(event.target.value)}
              rows={3}
              placeholder="Заметка видна только команде платформы"
              className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c]"
            />
          </label>

          {(canRequestChanges || canReject) && (
            <label className="block">
              <span className="text-sm font-medium text-[#25135c]">
                Комментарий для автора
              </span>
              <textarea
                name="reviewComment"
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                rows={4}
                placeholder="Этот текст увидит автор при запросе изменений или отклонении"
                className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c]"
              />
            </label>
          )}

          <div className="flex flex-col gap-3">
            {canTake ? (
              <form
                action={takeAction}
                onSubmit={() => setLastAction("take")}
                className="contents"
              >
                <input type="hidden" name="profileId" value={profile.id} />
                <input type="hidden" name="staffNote" value={staffNote} />
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
              <form
                action={changesAction}
                onSubmit={() => setLastAction("changes")}
                className="contents"
              >
                <input type="hidden" name="profileId" value={profile.id} />
                <input type="hidden" name="staffNote" value={staffNote} />
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

            {canVerify ? (
              <>
                {!showVerifyConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowVerifyConfirm(true)}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white"
                  >
                    Подтвердить данные
                  </button>
                ) : (
                  <div className="rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-4">
                    <p className="text-sm leading-6 text-[#2f5f45]">
                      Автор получит уведомление о подтверждении данных для
                      выплат.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <form
                        action={verifyAction}
                        onSubmit={() => setLastAction("verify")}
                      >
                        <input type="hidden" name="profileId" value={profile.id} />
                        <input type="hidden" name="staffNote" value={staffNote} />
                        <button
                          type="submit"
                          disabled={verifyPending}
                          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {verifyPending ? "Обработка…" : "Подтвердить"}
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => setShowVerifyConfirm(false)}
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
              <form
                action={rejectAction}
                onSubmit={() => setLastAction("reject")}
                className="contents"
              >
                <input type="hidden" name="profileId" value={profile.id} />
                <input type="hidden" name="staffNote" value={staffNote} />
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
    </div>
  );
}
