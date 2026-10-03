"use client";

import { useActionState } from "react";

import { classicaIdleState } from "@/lib/classica/production/action-state";
import { createClassicaJobAction } from "@/lib/classica/production/actions";

const inputClass =
  "mt-1 w-full rounded-xl border border-[#e4d7f4] px-3 py-2 text-sm";

export default function CreateClassicaJobForm() {
  const [state, action] = useActionState(createClassicaJobAction, classicaIdleState);

  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-[#e4d7f4] bg-white p-4">
      <label className="text-sm">
        Композитор
        <input className={inputClass} name="composer_name" required />
      </label>
      <label className="text-sm">
        Название
        <input className={inputClass} name="title" required />
      </label>
      <label className="text-sm">
        Альтернативное название
        <input className={inputClass} name="alternative_title" />
      </label>
      <label className="text-sm">
        Система каталога
        <input className={inputClass} name="catalogue_system" placeholder="BWV" />
      </label>
      <label className="text-sm">
        Номер
        <input className={inputClass} name="catalogue_number" placeholder="BWV 565" />
      </label>
      <label className="text-sm">
        Тональность
        <input className={inputClass} name="musical_key" />
      </label>
      <label className="text-sm">
        Год
        <input className={inputClass} name="composition_year" inputMode="numeric" />
      </label>
      <label className="text-sm">
        Основной SEO-запрос
        <input className={inputClass} name="primary_query" />
      </label>
      <label className="text-sm">
        Приоритет
        <input className={inputClass} name="priority" type="number" min={0} max={100} defaultValue={3} />
      </label>
      <label className="text-sm">
        Сложность
        <select className={inputClass} name="complexity" defaultValue="medium">
          <option value="low">Низкая</option>
          <option value="medium">Средняя</option>
          <option value="high">Высокая</option>
        </select>
      </label>
      <label className="text-sm">
        Срок
        <input className={inputClass} name="due_on" type="date" />
      </label>
      <label className="text-sm">
        Стоимость, ₽
        <input className={inputClass} name="task_cost_rubles" type="number" min={0} defaultValue={0} />
      </label>
      {state.error ? <p className="text-sm text-[#9b2c4a]">{state.error}</p> : null}
      <button type="submit" className="w-fit rounded-xl bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
        Создать работу
      </button>
    </form>
  );
}
