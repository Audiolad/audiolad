"use client";

import { useActionState } from "react";

import { classicaIdleState } from "@/lib/classica/production/action-state";
import { saveClassicaPromptAction } from "@/lib/classica/production/actions";

export default function ClassicaPromptForm({ body }: { body: string }) {
  const [state, action] = useActionState(saveClassicaPromptAction, classicaIdleState);

  return (
    <form action={action} className="grid gap-3">
      <textarea
        name="body"
        defaultValue={body}
        className="min-h-80 w-full rounded-2xl border border-[#e4d7f4] px-3 py-2 text-sm"
      />
      {state.error ? <p className="text-sm text-[#9b2c4a]">{state.error}</p> : null}
      <button type="submit" className="w-fit rounded-xl bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
        Сохранить промпт
      </button>
    </form>
  );
}
