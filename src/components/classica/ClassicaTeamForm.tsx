"use client";

import { useActionState } from "react";

import { classicaIdleState } from "@/lib/classica/production/action-state";
import { grantClassicaRoleAction } from "@/lib/classica/production/actions";

export default function ClassicaTeamForm() {
  const [state, action] = useActionState(grantClassicaRoleAction, classicaIdleState);

  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-[#e4d7f4] bg-white p-4">
      <label className="text-sm">
        Email пользователя
        <input name="email" type="email" required className="mt-1 w-full rounded-xl border border-[#e4d7f4] px-3 py-2" />
      </label>
      <label className="text-sm">
        Роль
        <select name="role" className="mt-1 w-full rounded-xl border border-[#e4d7f4] px-3 py-2">
          <option value="classica_operator">Оператор</option>
          <option value="classica_moderator">Модератор</option>
        </select>
      </label>
      {state.error ? <p className="text-sm text-[#9b2c4a]">{state.error}</p> : null}
      <button type="submit" className="w-fit rounded-xl bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
        Назначить
      </button>
    </form>
  );
}
