"use client";

import { useActionState } from "react";

import {
  CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE,
  confirmAuthorSlugChangeAsAdmin,
  previewAuthorSlugChangeAsAdmin,
  type ChangeAuthorSlugAdminState,
} from "@/app/(platform)/admin/authors/slug/actions";

export default function ChangeAuthorSlugForm() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewAuthorSlugChangeAsAdmin,
    CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmAuthorSlugChangeAsAdmin,
    CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE,
  );

  const preview: ChangeAuthorSlugAdminState =
    previewState.step === "preview" && previewState.ok
      ? previewState
      : CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE;
  const done =
    confirmState.step === "done" && confirmState.ok ? confirmState : null;
  const error = confirmState.error || previewState.error || null;
  const pending = previewPending || confirmPending;

  return (
    <div className="space-y-5">
      <form
        action={previewAction}
        className="space-y-5 rounded-[22px] border border-[#eadff8] bg-white p-5"
      >
        <div>
          <h2 className="text-lg font-semibold text-[#25135c]">
            Сменить slug авторского пространства
          </h2>
          <p className="mt-1 text-sm text-[#796ba0]">
            Право <code>authors.manage</code>. Сначала найдите автора по
            текущему slug или ссылке <code>/authors/&#123;slug&#125;</code>, затем
            подтвердите смену.
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-[#25135c]">
            Автор (slug, /authors/… или UUID)
          </span>
          <input
            required
            name="author_lookup"
            placeholder="ivanov или https://audiolad.ru/authors/ivanov"
            defaultValue={preview.previousSlug ?? ""}
            className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#25135c]"
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
            defaultValue={preview.slug ?? ""}
            className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm text-[#25135c]"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-[18px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {previewPending ? "Ищу…" : "Показать подтверждение"}
        </button>
      </form>

      {preview.step === "preview" && preview.authorId && preview.slug ? (
        <form
          action={confirmAction}
          className="space-y-4 rounded-[22px] border border-[#d9c8f5] bg-[#f7f2ff] p-5"
        >
          <input type="hidden" name="author_id" value={preview.authorId} />
          <input type="hidden" name="previous_slug" value={preview.previousSlug ?? ""} />
          <input type="hidden" name="slug" value={preview.slug} />
          <input type="hidden" name="confirm" value="yes" />

          <h3 className="text-base font-semibold text-[#25135c]">
            Подтверждение смены URL
          </h3>
          <p className="text-sm text-[#47357a]">
            Автор: <strong>{preview.authorName}</strong>
          </p>
          <p className="text-sm text-[#47357a]">
            Было <code>{preview.previousSlug}</code> → Станет{" "}
            <code>{preview.slug}</code>
          </p>
          <p className="text-sm text-[#796ba0]">
            Старый адрес останется в истории и будет отдавать 308 на новый.
          </p>

          <button
            type="submit"
            disabled={pending}
            className="rounded-[18px] bg-[#4b2a9a] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {confirmPending ? "Сохраняю…" : "Подтвердить смену slug"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="rounded-[16px] bg-[#fff1f1] px-4 py-3 text-sm text-[#a11d1d]">
          {error}
        </p>
      ) : null}
      {done?.message ? (
        <p className="rounded-[16px] bg-[#f1fff6] px-4 py-3 text-sm text-[#146c3a]">
          {done.message}
        </p>
      ) : null}
    </div>
  );
}
