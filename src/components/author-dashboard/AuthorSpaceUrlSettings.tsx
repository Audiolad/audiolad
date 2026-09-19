"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  clearAuthorProjectCookieClient,
  setAuthorProjectCookieClient,
} from "@/lib/author-projects/selection";
import { buildAuthorPublicPath } from "@/lib/products/paths";

type Props = {
  authorId: string;
  authorName: string;
  currentSlug: string;
  isOwner: boolean;
};

type EligibilityResponse = {
  can_change_slug: boolean;
  change_code: string;
  change_message: string;
  can_delete: boolean;
  delete_code: string;
  delete_message: string;
};

const SITE_HOST = "audiolad.ru";

export default function AuthorSpaceUrlSettings({
  authorId,
  authorName,
  currentSlug,
  isOwner,
}: Props) {
  const router = useRouter();
  const [eligibility, setEligibility] = useState<EligibilityResponse | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftSlug, setDraftSlug] = useState(currentSlug);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraftSlug(currentSlug);
  }, [currentSlug]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingEligibility(true);
      try {
        const response = await fetch(
          `/api/author/space?author_id=${encodeURIComponent(authorId)}`,
        );
        const payload = (await response.json()) as EligibilityResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "load_failed");
        }
        if (!cancelled) {
          setEligibility(payload);
        }
      } catch {
        if (!cancelled) {
          setEligibility(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingEligibility(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  const previewPath = useMemo(
    () => buildAuthorPublicPath(draftSlug.trim().toLowerCase() || currentSlug),
    [draftSlug, currentSlug],
  );

  const canChange = Boolean(eligibility?.can_change_slug);
  const canDelete = Boolean(eligibility?.can_delete);

  async function saveSlug() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/author/space", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_id: authorId, slug: draftSlug }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        slug?: string;
        noop?: boolean;
      };
      if (!response.ok) {
        throw new Error(payload.message || payload.error || "save_failed");
      }
      const nextSlug = payload.slug ?? draftSlug;
      setAuthorProjectCookieClient(nextSlug);
      setSuccess(
        payload.noop
          ? "Адрес уже актуален."
          : "Адрес страницы обновлён. Старый URL будет перенаправлять на новый.",
      );
      setEditing(false);
      setConfirmOpen(false);
      router.replace(`/author/profile?author=${encodeURIComponent(nextSlug)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить адрес.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSpace() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/author/space?author_id=${encodeURIComponent(authorId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || payload.error || "delete_failed");
      }
      clearAuthorProjectCookieClient();
      setDeleteConfirmOpen(false);
      router.replace("/author");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось удалить пространство.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
      <h2 className="text-lg font-semibold">Адрес страницы</h2>
      <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
        Публичная страница автора:{" "}
        <span className="font-medium text-[#3b2f5a]">
          {SITE_HOST}
          {buildAuthorPublicPath(currentSlug)}
        </span>
      </p>

      {loadingEligibility ? (
        <p className="mt-4 text-sm text-[#7d70a2]">Проверяем доступные действия…</p>
      ) : (
        <div className="mt-4 space-y-4">
          {!editing ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!canChange || busy}
                onClick={() => {
                  setEditing(true);
                  setError(null);
                  setSuccess(null);
                }}
                className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#cbb7ef]"
              >
                Изменить адрес
              </button>
              {!canChange && eligibility?.change_message ? (
                <p className="text-sm text-[#7d70a2]">{eligibility.change_message}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Новый адрес</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-[#7d70a2]">{SITE_HOST}/authors/</span>
                  <input
                    value={draftSlug}
                    onChange={(event) => setDraftSlug(event.target.value)}
                    className="min-w-[220px] flex-1 rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm"
                    disabled={busy}
                  />
                </div>
              </label>
              <p className="text-sm text-[#7d70a2]">
                Будет: {SITE_HOST}
                {previewPath}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmOpen(true)}
                  className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white disabled:bg-[#cbb7ef]"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setDraftSlug(currentSlug);
                    setConfirmOpen(false);
                  }}
                  className="rounded-full border border-[#ddcfef] px-4 py-2 text-sm font-medium text-[#3b2f5a]"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {confirmOpen ? (
            <div className="rounded-[18px] border border-[#eadff8] bg-[#faf7ff] p-4 text-sm text-[#3b2f5a]">
              <p className="font-semibold">Адрес страницы изменится</p>
              <p className="mt-2">
                Было: {SITE_HOST}
                {buildAuthorPublicPath(currentSlug)}
              </p>
              <p className="mt-1">
                Станет: {SITE_HOST}
                {previewPath}
              </p>
              <p className="mt-2 text-[#7d70a2]">
                Старый адрес будет автоматически перенаправлять на новый.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveSlug()}
                  className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-medium text-white"
                >
                  Подтвердить
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-full border border-[#ddcfef] px-4 py-2 text-sm"
                >
                  Назад
                </button>
              </div>
            </div>
          ) : null}

          <div className="border-t border-[#eadff8] pt-4">
            <h3 className="text-base font-semibold text-[#9b1c1c]">
              Удалить авторское пространство
            </h3>
            {canDelete ? (
              <>
                <p className="mt-2 text-sm text-[#7d70a2]">
                  Можно удалить только полностью пустое пространство без продуктов и
                  финансовой истории.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="mt-3 rounded-full border border-[#f0b4b4] bg-[#fff5f5] px-4 py-2 text-sm font-medium text-[#9b1c1c]"
                >
                  Удалить авторское пространство
                </button>
              </>
            ) : (
              <p className="mt-2 text-sm text-[#7d70a2]">
                {eligibility?.delete_message ||
                  "Удаление недоступно для этого пространства."}
              </p>
            )}
          </div>

          {deleteConfirmOpen ? (
            <div className="rounded-[18px] border border-[#f0b4b4] bg-[#fff5f5] p-4 text-sm">
              <p className="font-semibold text-[#9b1c1c]">
                Удалить авторское пространство «{authorName}»?
              </p>
              <p className="mt-2 text-[#7d70a2]">
                Действие необратимо. Страница автора и история её адресов будут удалены.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteSpace()}
                  className="rounded-full bg-[#9b1c1c] px-4 py-2 text-sm font-medium text-white"
                >
                  Удалить
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="rounded-full border border-[#ddcfef] bg-white px-4 py-2 text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-[#9b1c1c]">{error}</p> : null}
          {success ? <p className="text-sm text-[#2f6b3a]">{success}</p> : null}
        </div>
      )}
    </section>
  );
}
