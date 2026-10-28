"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  confirmAuthorSlugChangeAsAdmin,
  previewAuthorSlugChangeAsAdmin,
} from "@/app/(platform)/admin/authors/slug/actions";
import {
  AUTHOR_SLUG_CONFIRM_ERROR,
  AUTHOR_SLUG_PREVIEW_ERROR,
  CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE,
  STALE_SERVER_ACTION_MESSAGE,
  isStaleServerActionError,
  type ChangeAuthorSlugAdminState,
} from "@/app/(platform)/admin/authors/slug/state";
import { buildAuthorPublicPath } from "@/lib/products/paths";

type ChangeAuthorSlugFormViewProps = {
  preview: ChangeAuthorSlugAdminState;
  done: ChangeAuthorSlugAdminState | null;
  error: string | null;
  pending: boolean;
  previewPending: boolean;
  confirmPending: boolean;
  initialLookup?: string;
  initialSlug?: string;
  previewAction: (formData: FormData) => void;
  confirmAction: (formData: FormData) => void;
};

export function ChangeAuthorSlugFormView({
  preview,
  done,
  error,
  pending,
  previewPending,
  confirmPending,
  initialLookup = "",
  initialSlug = "",
  previewAction,
  confirmAction,
}: ChangeAuthorSlugFormViewProps) {
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
            placeholder="ivanov или /authors/ivanov"
            defaultValue={preview.previousSlug || initialLookup}
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
            defaultValue={preview.slug || initialSlug}
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
            Было <code>{preview.previousSlug}</code> – станет{" "}
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
        <p className="rounded-[16px] bg-[#fff1f1] px-4 py-3 text-sm text-[#a11d1d]" role="alert">
          {error}
        </p>
      ) : null}
      {done?.message ? (
        <div className="rounded-[16px] bg-[#f1fff6] px-4 py-3 text-sm text-[#146c3a]">
          <p>{done.message}</p>
          {done.slug ? (
            <Link
              href={buildAuthorPublicPath(done.slug)}
              className="mt-2 inline-block font-medium text-[#146c3a] underline"
            >
              Открыть страницу автора
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

async function runSlugAction(
  action: (
    previous: ChangeAuthorSlugAdminState,
    formData: FormData,
  ) => Promise<ChangeAuthorSlugAdminState>,
  fallback: string,
  previous: ChangeAuthorSlugAdminState,
  formData: FormData,
): Promise<ChangeAuthorSlugAdminState> {
  try {
    return await action(previous, formData);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_")
    ) {
      throw error;
    }
    if (isStaleServerActionError(error)) {
      return { ok: false, error: STALE_SERVER_ACTION_MESSAGE };
    }
    return { ok: false, error: fallback };
  }
}

export default function ChangeAuthorSlugForm({
  initialLookup = "",
  initialSlug = "",
}: {
  initialLookup?: string;
  initialSlug?: string;
}) {
  const [previewState, previewAction, previewPending] = useActionState(
    (previous: ChangeAuthorSlugAdminState, formData: FormData) =>
      runSlugAction(
        previewAuthorSlugChangeAsAdmin,
        AUTHOR_SLUG_PREVIEW_ERROR,
        previous,
        formData,
      ),
    CHANGE_AUTHOR_SLUG_ADMIN_INITIAL_STATE,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    (previous: ChangeAuthorSlugAdminState, formData: FormData) =>
      runSlugAction(
        confirmAuthorSlugChangeAsAdmin,
        AUTHOR_SLUG_CONFIRM_ERROR,
        previous,
        formData,
      ),
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
    <ChangeAuthorSlugFormView
      preview={preview}
      done={done}
      error={error}
      pending={pending}
      previewPending={previewPending}
      confirmPending={confirmPending}
      initialLookup={initialLookup}
      initialSlug={initialSlug}
      previewAction={previewAction}
      confirmAction={confirmAction}
    />
  );
}
