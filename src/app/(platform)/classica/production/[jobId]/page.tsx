import Link from "next/link";
import { notFound } from "next/navigation";

import ClassicaCardForm from "@/components/classica/ClassicaCardForm";
import ClassicaPlayback from "@/components/classica/ClassicaPlayback";
import ClassicaUploadForm from "@/components/classica/ClassicaUploadForm";
import {
  classicaCanAdmin,
  classicaCanModerate,
  classicaCanOperate,
  requireClassicaProductionAccess,
} from "@/lib/classica/production/access";
import {
  markClassicaStatusAction,
  prepareClassicaPackagingAction,
  publishClassicaJobAction,
  reassignClassicaJobAction,
  releaseClassicaJobAction,
  reviewClassicaJobAction,
  submitClassicaJobAction,
  takeClassicaJobAction,
} from "@/lib/classica/production/actions";
import { formatRubMinor } from "@/lib/classica/production/money";
import { checklistForJob, getClassicaJob } from "@/lib/classica/production/queries";
import {
  canAdminReleaseClassicaJob,
  canEditClassicaCard,
  canSubmitClassicaJob,
  classicaMarkTargets,
  classicaStatusLabel,
} from "@/lib/classica/production/status";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  created: "Создано",
  card_saved: "Карточка сохранена",
  packaging_prepared: "Оформление подготовлено",
  taken: "Взято в работу",
  unreserved: "Бронь снята",
  returned_to_queue: "Возвращено в очередь",
  reassigned: "Переназначено",
  status_changed: "Статус изменён",
  submitted: "Сдано на проверку",
  commented: "Комментарий",
  returned: "Возвращено на доработку",
  accepted: "Принято",
  published: "Опубликовано",
  asset_added: "Файл добавлен",
  asset_removed: "Файл удалён",
  playback_confirmed: "Воспроизведение подтверждено",
};

const DECISION_LABELS: Record<string, string> = {
  accept: "Принято",
  return: "На доработку",
  comment: "Комментарий",
};

type PageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function ClassicaJobPage({ params, searchParams }: PageProps) {
  const session = await requireClassicaProductionAccess();
  const { jobId } = await params;
  const query = await searchParams;
  const job = await getClassicaJob(session.supabase, jobId);
  if (!job) {
    notFound();
  }

  const isAdmin = classicaCanAdmin(session.access);
  const canEdit = canEditClassicaCard(job.status, {
    isAssignee: job.assigneeId === session.userId,
    isAdmin,
  });
  const checklist = checklistForJob(job);
  const audio = job.assets.find((asset) => asset.kind === "final_audio");
  const cover = job.assets.find((asset) => asset.kind === "cover");
  const sliders = job.assets.filter((asset) => asset.kind === "slider");
  let operators: Array<{ user_id: string; label: string }> = [];
  if (isAdmin) {
    const options = await session.supabase.rpc("classica_production_operator_options");
    operators = (options.data ?? []) as Array<{ user_id: string; label: string }>;
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#796ba0]">{job.composerName}</p>
          <h2 className="text-2xl font-semibold">{job.title}</h2>
          <p className="mt-1 text-sm">
            {classicaStatusLabel(job.status)} · {formatRubMinor(job.taskCostMinor)}
            {job.assigneeLabel ? ` · ${job.assigneeLabel}` : ""}
          </p>
          {job.productionSeconds != null ? (
            <p className="text-sm text-[#796ba0]">
              В производстве: {Math.round(job.productionSeconds / 60)} мин. Возвратов: {job.returnCount}
            </p>
          ) : (
            <p className="text-sm text-[#796ba0]">Возвратов: {job.returnCount}</p>
          )}
        </div>
        {job.status === "published" && job.composerSlug && job.slug ? (
          <Link className="text-sm font-medium text-[#7042c5]" href={`/classica/${job.composerSlug}/${job.slug}`}>
            Открыть страницу
          </Link>
        ) : null}
      </div>
      {query.error ? (
        <p className="rounded-xl bg-[#fff4f6] px-3 py-2 text-sm text-[#9b2c4a]">{query.error}</p>
      ) : null}

      <section className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
        <h3 className="font-semibold">Чеклист перед сдачей</h3>
        <ul className="mt-3 grid gap-1 text-sm">
          {checklist.items.map((item) => (
            <li key={item.id}>
              {item.passed ? "✓" : "○"} {item.label}
            </li>
          ))}
        </ul>
        {canSubmitClassicaJob(job.status) && (isAdmin || job.assigneeId === session.userId) ? (
          <form action={submitClassicaJobAction} className="mt-4">
            <input type="hidden" name="job_id" value={job.id} />
            <button
              type="submit"
              disabled={!checklist.ready}
              className="rounded-xl bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Сдать на проверку
            </button>
          </form>
        ) : null}
      </section>

      {job.status === "queued" && classicaCanOperate(session.access) ? (
        <form action={takeClassicaJobAction}>
          <input type="hidden" name="job_id" value={job.id} />
          <button type="submit" className="rounded-xl bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
            Взять в работу
          </button>
        </form>
      ) : null}

      {isAdmin && canAdminReleaseClassicaJob(job.status) ? (
        <section className="grid gap-3 rounded-2xl border border-[#e4d7f4] bg-white p-4">
          <h3 className="font-semibold">Администратор</h3>
          <div className="flex flex-wrap gap-3">
            <form action={releaseClassicaJobAction}>
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="release_action" value="unreserved" />
              <button type="submit" className="text-sm font-semibold text-[#7042c5]">
                Снять бронь
              </button>
            </form>
            <form action={releaseClassicaJobAction}>
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="release_action" value="returned_to_queue" />
              <button type="submit" className="text-sm font-semibold text-[#7042c5]">
                Вернуть в очередь
              </button>
            </form>
          </div>
          <form action={reassignClassicaJobAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="job_id" value={job.id} />
            <select name="assignee_id" className="rounded-xl border border-[#e4d7f4] px-3 py-2 text-sm">
              {operators.map((operator) => (
                <option key={operator.user_id} value={operator.user_id}>
                  {operator.label}
                </option>
              ))}
            </select>
            <button type="submit" className="text-sm font-semibold text-[#7042c5]">
              Переназначить
            </button>
          </form>
        </section>
      ) : null}

      {classicaMarkTargets(job.status).length > 0 && canEdit ? (
        <div className="flex flex-wrap gap-2">
          {classicaMarkTargets(job.status).map((status) => (
            <form key={status} action={markClassicaStatusAction}>
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="status" value={status} />
              <button type="submit" className="rounded-full border border-[#e4d7f4] bg-white px-3 py-1 text-sm">
                {classicaStatusLabel(status)}
              </button>
            </form>
          ))}
        </div>
      ) : null}

      {canEdit ? (
        <form action={prepareClassicaPackagingAction}>
          <input type="hidden" name="job_id" value={job.id} />
          <button type="submit" className="rounded-xl border border-[#7042c5] px-4 py-2 text-sm font-semibold text-[#7042c5]">
            Подготовить оформление
          </button>
        </form>
      ) : null}

      {audio?.signedUrl ? (
        <ClassicaPlayback
          jobId={job.id}
          src={audio.signedUrl}
          confirmed={Boolean(job.audioPlaybackConfirmedAt)}
          canConfirm={canEdit}
        />
      ) : (
        <p className="text-sm text-[#796ba0]">Итоговое аудио ещё не загружено.</p>
      )}

      {canEdit ? (
        <div className="grid gap-3 md:grid-cols-2">
          <ClassicaUploadForm
            jobId={job.id}
            kind="final_audio"
            label="Итоговое аудио"
            accept="audio/*"
            assets={job.assets.filter((asset) => asset.kind === "final_audio")}
          />
          <ClassicaUploadForm
            jobId={job.id}
            kind="source_render"
            label="Исходный рендер"
            accept="audio/*"
            assets={job.assets.filter((asset) => asset.kind === "source_render")}
          />
          <ClassicaUploadForm
            jobId={job.id}
            kind="source_file"
            label="Файл источника"
            accept=".xml,.musicxml,.mid,.midi,.pdf,.zip,audio/*"
            assets={job.assets.filter((asset) => asset.kind === "source_file")}
          />
          <ClassicaUploadForm
            jobId={job.id}
            kind="cover"
            label="Обложка"
            accept="image/jpeg,image/png,image/webp"
            showText
            assets={job.assets.filter((asset) => asset.kind === "cover")}
          />
          <ClassicaUploadForm
            jobId={job.id}
            kind="slider"
            label="Изображение для слайдера"
            accept="image/jpeg,image/png,image/webp"
            showText
            assets={sliders}
          />
        </div>
      ) : (
        <ul className="grid gap-2 text-sm">
          {cover ? <li>Обложка: {cover.altText || cover.titleText || "загружена"}</li> : null}
          {sliders.map((image) => (
            <li key={image.id}>{image.altText || image.titleText || "Изображение слайдера"}</li>
          ))}
        </ul>
      )}

      <ClassicaCardForm job={job} readOnly={!canEdit} />

      {job.status === "in_review" && classicaCanModerate(session.access) ? (
        <section className="grid gap-3 rounded-2xl border border-[#e4d7f4] bg-white p-4">
          <h3 className="font-semibold">Проверка</h3>
          <form action={reviewClassicaJobAction} className="grid gap-2">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="decision" value="accept" />
            <button type="submit" className="w-fit rounded-xl bg-[#2f7d4a] px-4 py-2 text-sm font-semibold text-white">
              Принять
            </button>
          </form>
          <form action={reviewClassicaJobAction} className="grid gap-2">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="decision" value="return" />
            <textarea
              name="reason"
              required
              minLength={3}
              placeholder="Причина возврата"
              className="min-h-20 rounded-xl border border-[#e4d7f4] px-3 py-2 text-sm"
            />
            <button type="submit" className="w-fit rounded-xl border border-[#9b2c4a] px-4 py-2 text-sm font-semibold text-[#9b2c4a]">
              Вернуть на доработку
            </button>
          </form>
          <form action={reviewClassicaJobAction} className="grid gap-2">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="decision" value="comment" />
            <textarea
              name="comment"
              required
              minLength={2}
              placeholder="Комментарий"
              className="min-h-20 rounded-xl border border-[#e4d7f4] px-3 py-2 text-sm"
            />
            <button type="submit" className="w-fit text-sm font-semibold text-[#7042c5]">
              Оставить комментарий
            </button>
          </form>
        </section>
      ) : null}

      {job.status === "accepted" && isAdmin ? (
        <form action={publishClassicaJobAction}>
          <input type="hidden" name="job_id" value={job.id} />
          <button type="submit" className="rounded-xl bg-[#25135c] px-4 py-2 text-sm font-semibold text-white">
            Опубликовать
          </button>
        </form>
      ) : null}

      <section>
        <h3 className="font-semibold">Проверки</h3>
        <ul className="mt-2 grid gap-2 text-sm">
          {job.reviews.map((review) => (
            <li key={review.id} className="rounded-xl bg-white px-3 py-2">
              <span className="font-medium">{DECISION_LABELS[review.decision] ?? review.decision}</span>
              {" · "}
              {review.reviewerLabel} · {new Date(review.createdAt).toLocaleString("ru-RU")}
              {review.reason ? <p>Причина: {review.reason}</p> : null}
              {review.comment ? <p>{review.comment}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">История</h3>
        <ul className="mt-2 grid gap-2 text-sm">
          {job.events.map((event) => (
            <li key={event.id}>
              {new Date(event.createdAt).toLocaleString("ru-RU")} · {event.actorLabel ?? "система"} ·{" "}
              {ACTION_LABELS[event.action] ?? event.action}
              {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus
                ? ` (${classicaStatusLabel(event.fromStatus)} → ${classicaStatusLabel(event.toStatus)})`
                : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
