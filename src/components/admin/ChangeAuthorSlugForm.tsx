"use client";

import { useActionState } from "react";

import {
  CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE,
  changeAuthorSlugAsAdmin,
} from "@/app/(platform)/admin/authors/slug/actions";

export default function ChangeAuthorSlugForm() {
  const [state, action, pending] = useActionState(
    changeAuthorSlugAsAdmin,
    CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE,
  );

  return (
    <form
      action={action}
      className="space-y-5 rounded-[22px] border border-[#eadff8] bg-white p-5"
    >
      <div>
        <h2 className="text-lg font-semibold text-[#25135c]">
          Сменить slug авторского пространства
        </h2>
        <p className="mt-1 text-sm text-[#796ba0]">
          Право <code>authors.manage</code>: смена возможна даже при
          опубликованных продуктах и финансовой истории. Старый slug уходит в
          историю и отдаёт 308 на текущий.
        </p>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-[#25135c]">
          Author ID (UUID)
        </span>
        <input
          required
          name="author_id"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 font-mono text-sm text-[#25135c]"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#25135c]">Новый slug</span>
        <input
          required
          name="slug"
          minLength={2}
          maxLength={80}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="new-author-slug"
          className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#25135c]"
        />
      </label>

      {state.error ? (
        <p className="rounded-[16px] bg-[#fff1f1] px-4 py-3 text-sm text-[#a11d1d]">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? (
        <p className="rounded-[16px] bg-[#f1fff6] px-4 py-3 text-sm text-[#146c3a]">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-[18px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Сохраняю…" : "Сменить slug"}
      </button>
    </form>
  );
}
