"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createStudioWorkspace } from "@/app/(platform)/admin/authors/new/actions";
import { CREATE_STUDIO_WORKSPACE_INITIAL_STATE } from "@/lib/admin/studio-author-workspace-form-state";

export default function CreateStudioWorkspaceForm() {
  const [state, action, pending] = useActionState(
    createStudioWorkspace,
    CREATE_STUDIO_WORKSPACE_INITIAL_STATE,
  );

  return (
    <div className="space-y-5">
      <form
        action={action}
        className="space-y-5 rounded-[22px] border border-[#eadff8] bg-white p-5"
      >
        <div>
          <h2 className="text-lg font-semibold text-[#25135c]">Новая студия</h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Будет создано авторское пространство типа «Студия» с одним владельцем.
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-[#25135c]">Название студии</span>
          <input
            required
            name="name"
            minLength={2}
            maxLength={100}
            className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#25135c]"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-[#25135c]">Slug</span>
          <input
            required
            name="slug"
            minLength={2}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            autoCapitalize="none"
            spellCheck={false}
            className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#25135c]"
          />
          <span className="mt-1 block text-xs text-[#796ba0]">
            Строчные латинские буквы, цифры и дефисы.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-[#25135c]">
            Владелец (UUID или email)
          </span>
          <input
            required
            name="owner"
            type="text"
            autoCapitalize="none"
            spellCheck={false}
            className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#25135c]"
          />
        </label>

        {!state.ok && state.error ? (
          <p className="rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-3 text-sm text-[#b34f63]">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Создание…" : "Создать студию"}
        </button>
      </form>

      {state.ok ? (
        <section className="rounded-[22px] border border-[#cfe8d9] bg-[#f3fbf6] p-5 text-sm text-[#2f5f45]">
          <p className="font-medium">{state.message}</p>
          <dl className="mt-3 space-y-1">
            <div>
              <dt className="inline">Название: </dt>
              <dd className="inline">{state.workspace.name}</dd>
            </div>
            <div>
              <dt className="inline">Slug: </dt>
              <dd className="inline">{state.workspace.slug}</dd>
            </div>
            <div>
              <dt className="inline">ID пространства: </dt>
              <dd className="inline break-all">{state.workspace.authorId}</dd>
            </div>
            <div>
              <dt className="inline">Владелец: </dt>
              <dd className="inline">
                {state.workspace.owner.displayName ??
                  state.workspace.owner.email ??
                  state.workspace.owner.id}
              </dd>
            </div>
          </dl>
          <Link
            href={`/author-dashboard?author=${encodeURIComponent(state.workspace.slug)}`}
            className="mt-4 inline-block font-medium text-[#7042c5]"
          >
            Открыть кабинет автора
          </Link>
        </section>
      ) : null}
    </div>
  );
}
