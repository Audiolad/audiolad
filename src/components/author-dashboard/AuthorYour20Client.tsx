"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorPartnerInvitees from "@/components/author-dashboard/AuthorPartnerInvitees";
import AuthorPartnerRewards from "@/components/author-dashboard/AuthorPartnerRewards";
import {
  buildAuthorPartnerInviteMessage,
  buildAuthorPartnerInviteUrl,
} from "@/lib/author-partner/invite-link";
import type { AuthorPartnerProfileView } from "@/lib/author-partner/profile-types";
import {
  changeAuthorPartnerCodeAction,
  ensureAuthorPartnerProfileAction,
} from "@/lib/author-partner/your-20-actions";
import type { PartnerInviteeView } from "@/lib/author-partner/invitees";
import type { PartnerRewardDashboard } from "@/lib/author-partner/rewards";
import type { AuthorWorkspace } from "@/lib/author-products/types";

type Props = {
  authors: AuthorWorkspace[];
  initialAuthorId: string;
  initialProfile: AuthorPartnerProfileView | null;
  initialLoadError?: string | null;
  initialInvitees: PartnerInviteeView[];
  initialInviteesError?: string | null;
  initialRewards: PartnerRewardDashboard | null;
  initialRewardsError?: string | null;
  siteOrigin: string;
};

export default function AuthorYour20Client({
  authors,
  initialAuthorId,
  initialProfile,
  initialLoadError = null,
  initialInvitees,
  initialInviteesError = null,
  initialRewards,
  initialRewardsError = null,
  siteOrigin,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedAuthor = useMemo(() => {
    const slug = searchParams.get("author");
    const bySlug = slug
      ? authors.find((author) => author.slug === slug)
      : null;
    return (
      bySlug ??
      authors.find((author) => author.id === initialAuthorId) ??
      authors[0] ??
      null
    );
  }, [authors, initialAuthorId, searchParams]);

  const [profile, setProfile] = useState<AuthorPartnerProfileView | null>(
    initialProfile,
  );
  const [codeDraft, setCodeDraft] = useState(
    initialProfile?.exists ? initialProfile.primaryCode : "",
  );
  const [error, setError] = useState<string | null>(initialLoadError);
  const [info, setInfo] = useState<string | null>(null);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);

  const inviteUrl =
    profile && profile.exists
      ? buildAuthorPartnerInviteUrl(profile.primaryCode, siteOrigin)
      : "";

  function flashCopy(label: string) {
    setCopyFlash(label);
    window.setTimeout(() => setCopyFlash(null), 1800);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      flashCopy(label);
    } catch {
      setError("Не удалось скопировать. Выделите текст вручную.");
    }
  }

  function onEnsure() {
    if (!selectedAuthor) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await ensureAuthorPartnerProfileAction(selectedAuthor.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setProfile(result.profile);
      if (result.profile.exists) {
        setCodeDraft(result.profile.primaryCode);
      }
      setInfo("Ссылка создана");
      router.refresh();
    });
  }

  function onSaveCode() {
    if (!selectedAuthor) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await changeAuthorPartnerCodeAction(
        selectedAuthor.id,
        codeDraft,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setProfile(result.profile);
      if (result.profile.exists) {
        setCodeDraft(result.profile.primaryCode);
      }
      setInfo(
        result.previousCodeKeptAsAlias
          ? "Код сохранён. Предыдущая ссылка продолжит работать."
          : "Код сохранён",
      );
      router.refresh();
    });
  }

  if (!selectedAuthor) {
    return (
      <p className="text-sm text-[#7d70a2]">
        Авторское пространство не найдено.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <AuthorDashboardNav
        authorSlug={selectedAuthor.slug}
        authorId={selectedAuthor.id}
        authorRole={selectedAuthor.role}
      />

      <section className="rounded-[24px] border border-[#eadff8] bg-white px-4 py-5 sm:px-5">
        <h2 className="text-[18px] font-semibold text-[#2b2144]">Ваши 20%</h2>
        <p className="mt-1 text-sm text-[#7d70a2]">
          Приглашайте новых авторов в АудиоЛад
        </p>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#4a3f6b]">
          <p>
            Приглашайте авторов в АудиоЛад и получайте 20% от суммы роялти,
            фактически начисленной приглашённому автору.
          </p>
          <p>
            Партнёрское вознаграждение вы будете получать в течение трёх лет с
            момента, когда приглашённый вами пользователь становится автором
            АудиоЛада.
          </p>
          <p>
            Приглашённый вами автор бесплатно получает дополнительное авторское
            пространство. То есть получает бонус – возможность создать ещё один
            проект внутри своего аккаунта.
          </p>
        </div>

        <div className="mt-4 rounded-[18px] border border-[#d9c7f2] bg-[#faf6ff] px-4 py-3 text-sm leading-relaxed text-[#4a3f6b]">
          Ваш доход не уменьшает роялти приглашённого автора – партнёрское вознаграждение выплачивает АудиоЛад из своей доли.
        </div>

      </section>

      <AuthorPartnerRewards
        dashboard={initialRewards}
        loadError={initialRewardsError}
      />

      <AuthorPartnerInvitees
        invitees={initialInvitees}
        loadError={initialInviteesError}
      />

      {!profile ? (
        <section className="rounded-[24px] border border-[#f3c6c6] bg-[#fff5f5] px-4 py-5 sm:px-5">
          <h3 className="text-[17px] font-semibold text-[#9b2c2c]">
            Не удалось загрузить данные
          </h3>
          <p className="mt-2 text-sm text-[#9b2c2c]">
            {error ??
              "Не удалось загрузить данные ссылки. Обновите страницу."}
          </p>
        </section>
      ) : !profile.exists ? (
        <section className="rounded-[24px] border border-[#eadff8] bg-white px-4 py-5 sm:px-5">
          <h3 className="text-[17px] font-semibold">Создайте свою ссылку</h3>
          <p className="mt-2 text-sm text-[#7d70a2]">АудиоЛад создаст для вас персональный код приглашения. После этого вы сможете заменить его на свой.</p>
          <button
            type="button"
            disabled={isPending}
            onClick={onEnsure}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5f35b0] disabled:opacity-60"
          >
            {isPending ? "Создаём…" : "Создать мою ссылку"}
          </button>
        </section>
      ) : (
        <>
          <section className="rounded-[24px] border border-[#eadff8] bg-white px-4 py-5 sm:px-5">
            <h3 className="text-[17px] font-semibold">Ваша ссылка</h3>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 break-all rounded-[16px] border border-[#eadff8] bg-[#faf6ff] px-3 py-3 text-sm text-[#2b2144]">
                {inviteUrl}
              </div>
              <button
                type="button"
                onClick={() => copyText(inviteUrl, "Ссылка скопирована")}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-[#e4d7f4] bg-white px-4 py-2 text-sm font-semibold text-[#7042c5]"
              >
                Скопировать ссылку
              </button>
            </div>
          </section>

          <section className="rounded-[24px] border border-[#eadff8] bg-white px-4 py-5 sm:px-5">
            <h3 className="text-[17px] font-semibold">Код приглашения</h3>
            <p className="mt-1 text-sm text-[#7d70a2]">
              Код используется в вашей персональной ссылке. Автоматический код
              можно заменить на любой свободный, который вам нравится (например,
              natalya или natalya-meditation).
            </p>
            <input
              value={codeDraft}
              onChange={(event) => setCodeDraft(event.target.value)}
              spellCheck={false}
              autoCapitalize="characters"
              className="mt-3 w-full min-h-11 rounded-[16px] border border-[#eadff8] px-3 py-2.5 text-sm font-semibold tracking-wide text-[#2b2144] outline-none focus:border-[#7042c5]"
              aria-label="Код приглашения"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={onSaveCode}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isPending ? "Сохраняем…" : "Сохранить код"}
              </button>
              <button
                type="button"
                onClick={() => copyText(profile.primaryCode, "Код скопирован")}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#e4d7f4] bg-white px-4 py-2 text-sm font-semibold text-[#7042c5]"
              >
                Скопировать код
              </button>
              <button
                type="button"
                onClick={() =>
                  copyText(
                    buildAuthorPartnerInviteMessage(inviteUrl),
                    "Приглашение скопировано",
                  )
                }
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#e4d7f4] bg-white px-4 py-2 text-sm font-semibold text-[#7042c5]"
              >
                Скопировать приглашение
              </button>
            </div>
          </section>
        </>
      )}
      {error ? (
        <p className="rounded-[16px] border border-[#f3c6c6] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b2c2c]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-[16px] border border-[#cfe8d4] bg-[#f3fbf5] px-4 py-3 text-sm text-[#216e3a]">
          {info}
        </p>
      ) : null}
      {copyFlash ? (
        <p className="text-sm font-semibold text-[#7042c5]">{copyFlash}</p>
      ) : null}
    </div>
  );
}
