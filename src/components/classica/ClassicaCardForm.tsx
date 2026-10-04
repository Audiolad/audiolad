"use client";

import { useActionState, useEffect, useState } from "react";

import ClassicaCardSaveButton from "@/components/classica/ClassicaCardSaveButton";
import { classicaIdleState, type ClassicaActionState } from "@/lib/classica/production/action-state";
import { saveClassicaCardAction } from "@/lib/classica/production/actions";
import {
  CLASSICA_CARD_SAVE_SUCCESS_MS,
  classicaCardSavePhase,
  isClassicaCardSaveSuccess,
} from "@/lib/classica/production/card-save-feedback";
import type { ClassicaJobRecord } from "@/lib/classica/production/queries";

const inputClass =
  "mt-1 w-full rounded-xl border border-[#e4d7f4] bg-white px-3 py-2 text-sm text-[#25135c]";

function Field({
  label,
  name,
  defaultValue,
  doubtful,
  as = "input",
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  doubtful?: boolean;
  as?: "input" | "textarea";
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">
        {label}
        {doubtful ? (
          <span className="ml-2 text-xs font-semibold text-[#9b2c4a]">нужна проверка</span>
        ) : null}
      </span>
      {as === "textarea" ? (
        <textarea className={`${inputClass} min-h-28`} name={name} defaultValue={defaultValue ?? ""} />
      ) : (
        <input className={inputClass} name={name} type={type} defaultValue={defaultValue ?? ""} />
      )}
    </label>
  );
}

type ClassicaCardFormProps = {
  job: ClassicaJobRecord;
  readOnly?: boolean;
};

export default function ClassicaCardForm({ job, readOnly = false }: ClassicaCardFormProps) {
  const [state, action, pending] = useActionState(saveClassicaCardAction, classicaIdleState);
  const [hiddenSuccess, setHiddenSuccess] = useState<ClassicaActionState | null>(null);
  const succeeded = isClassicaCardSaveSuccess(state);
  const phase = classicaCardSavePhase({
    pending,
    succeeded,
    successDismissed: hiddenSuccess === state,
  });
  const flags = job.packagingFlags;

  useEffect(() => {
    if (!succeeded || pending) {
      return;
    }
    const timer = window.setTimeout(() => {
      setHiddenSuccess(state);
    }, CLASSICA_CARD_SAVE_SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [pending, state, succeeded]);

  return (
    <form action={action} className="grid gap-6">
      <fieldset disabled={readOnly} className="grid gap-6">
      <input type="hidden" name="job_id" value={job.id} />
      <section className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
        <h2 className="text-base font-semibold">Идентификация</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Композитор" name="composer_name" defaultValue={job.composerName} />
          <Field label="Название" name="title" defaultValue={job.title} />
          <Field label="Альтернативное название" name="alternative_title" defaultValue={job.alternativeTitle} />
          <Field label="Система каталога (opus, BWV, K, D, other)" name="catalogue_system" defaultValue={job.catalogueSystem} />
          <Field label="Номер опуса / каталога" name="catalogue_number" defaultValue={job.catalogueNumber} />
          <Field label="Тональность" name="musical_key" defaultValue={job.musicalKey} />
          <Field label="Часть / номер" name="movement_label" defaultValue={job.movementLabel} />
          <Field label="Год, если известен" name="composition_year" defaultValue={job.compositionYear} />
        </div>
      </section>

      <section className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
        <h2 className="text-base font-semibold">SEO</h2>
        <div className="mt-3 grid gap-3">
          <Field label="Основной запрос" name="primary_query" defaultValue={job.primaryQuery} />
          <Field
            label="Дополнительные запросы, каждый с новой строки"
            name="extra_queries"
            as="textarea"
            defaultValue={job.extraQueries.join("\n")}
          />
          <Field label="SEO title" name="seo_title" defaultValue={job.seoTitle} doubtful={flags.seo_title} />
          <Field
            label="SEO description"
            name="seo_description"
            as="textarea"
            defaultValue={job.seoDescription}
            doubtful={flags.seo_description}
          />
          <Field label="Slug произведения" name="slug" defaultValue={job.slug} />
          <Field label="Slug композитора, если нужен свой" name="composer_slug" defaultValue={job.composerSlug} />
        </div>
      </section>

      <section className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
        <h2 className="text-base font-semibold">Источник и права</h2>
        <div className="mt-3 grid gap-3">
          <Field label="Источник партитуры" name="score_source" defaultValue={job.scoreSource} />
          <Field label="Ссылка" name="source_url" defaultValue={job.sourceUrl} />
          <label className="block text-sm">
            <span className="font-medium">Тип источника</span>
            <select className={inputClass} name="source_type" defaultValue={job.sourceType ?? ""}>
              <option value="">Не выбран</option>
              <option value="musicxml">MusicXML</option>
              <option value="midi">MIDI</option>
              <option value="pdf">PDF</option>
              <option value="other">Другое</option>
            </select>
          </label>
          <Field label="Описание источника" name="source_description" as="textarea" defaultValue={job.sourceDescription} />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="rights_checked" defaultChecked={job.rightsChecked} />
            Права проверены
          </label>
          <Field label="Комментарий по правам" name="rights_comment" as="textarea" defaultValue={job.rightsComment} />
        </div>
      </section>

      <section className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
        <h2 className="text-base font-semibold">Текст страницы</h2>
        <div className="mt-3 grid gap-3">
          <Field label="Заголовок" name="heading" defaultValue={job.heading} doubtful={flags.heading} />
          <Field label="Подзаголовок" name="subtitle" defaultValue={job.subtitle} doubtful={flags.subtitle} />
          <Field
            label="Короткое описание"
            name="short_description"
            as="textarea"
            defaultValue={job.shortDescription}
            doubtful={flags.short_description}
          />
          <Field label="Основной текст" name="body" as="textarea" defaultValue={job.body} doubtful={flags.body} />
          <Field label="О произведении" name="about_work" as="textarea" defaultValue={job.aboutWork} doubtful={flags.about_work} />
          <Field
            label="О композиторе"
            name="about_composer"
            as="textarea"
            defaultValue={job.aboutComposer}
            doubtful={flags.about_composer}
          />
          <Field
            label="На что обратить внимание при прослушивании"
            name="listening_notes"
            as="textarea"
            defaultValue={job.listeningNotes}
            doubtful={flags.listening_notes}
          />
        </div>
        <div className="mt-4 grid gap-3">
          <h3 className="text-sm font-semibold">FAQ, необязательно</h3>
          {[1, 2, 3, 4].map((index) => (
            <div key={index} className="grid gap-2 md:grid-cols-2">
              <input
                className={inputClass}
                name={`faq_q_${index}`}
                placeholder={`Вопрос ${index}`}
                defaultValue={job.faq[index - 1]?.question ?? ""}
              />
              <input
                className={inputClass}
                name={`faq_a_${index}`}
                placeholder={`Ответ ${index}`}
                defaultValue={job.faq[index - 1]?.answer ?? ""}
              />
            </div>
          ))}
          <h3 className="text-sm font-semibold">Дополнительные блоки</h3>
          {[1, 2].map((index) => (
            <div key={index} className="grid gap-2">
              <input
                className={inputClass}
                name={`block_h_${index}`}
                placeholder={`Заголовок блока ${index}`}
                defaultValue={job.extraBlocks[index - 1]?.heading ?? ""}
              />
              <textarea
                className={`${inputClass} min-h-20`}
                name={`block_b_${index}`}
                placeholder="Текст блока"
                defaultValue={job.extraBlocks[index - 1]?.body ?? ""}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
        <h2 className="text-base font-semibold">Очередь</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Приоритет, больше — раньше" name="priority" type="number" defaultValue={job.priority} />
          <label className="block text-sm">
            <span className="font-medium">Сложность</span>
            <select className={inputClass} name="complexity" defaultValue={job.complexity}>
              <option value="low">Низкая</option>
              <option value="medium">Средняя</option>
              <option value="high">Высокая</option>
            </select>
          </label>
          <Field label="Срок" name="due_on" type="date" defaultValue={job.dueOn} />
          <Field
            label="Стоимость, ₽"
            name="task_cost_rubles"
            type="number"
            defaultValue={Math.round(job.taskCostMinor / 100)}
          />
        </div>
      </section>

      </fieldset>
      {state.error ? <p className="text-sm text-[#9b2c4a]">{state.error}</p> : null}
      {readOnly ? null : <ClassicaCardSaveButton phase={phase} />}
    </form>
  );
}
