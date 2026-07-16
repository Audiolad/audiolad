import Link from "next/link";

import {
  formatCounterDisplay,
  getAuthorMemberRoleLabel,
} from "@/lib/profile/queries";
import {
  BECOME_AUTHOR_HREF,
  SETTINGS_LEGAL_SECTION_ID,
} from "@/lib/profile/constants";
import type {
  ProfileAuthorSection,
  ProfileCardData,
  ProfileCounter,
} from "@/lib/profile/types";

type ProfileUserCardProps = {
  card: ProfileCardData;
};

export function ProfileUserCard({ card }: ProfileUserCardProps) {
  return (
    <section
      className="relative mt-6 min-w-0 overflow-hidden rounded-[28px] border border-[#eadff8] bg-gradient-to-br from-[#fffaff] to-[#f2e6fb] p-5 shadow-[0_12px_30px_rgba(90,60,145,0.08)] lg:p-6"
      aria-labelledby="profile-user-name"
    >
      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#d8b8f2]/25 blur-2xl" />

      <div className="relative flex items-center gap-4 lg:gap-5">
        <div
          className="flex h-[92px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] border-2 border-white bg-[#f7effe] shadow-sm lg:h-[100px] lg:w-[100px]"
          aria-hidden="true"
        >
          <span className="text-4xl text-[#7042c5]">{card.initial}</span>
        </div>

        <div className="min-w-0">
          <h2
            id="profile-user-name"
            className="line-clamp-2 text-[25px] font-semibold leading-tight"
            title={card.displayName}
          >
            {card.displayName}
          </h2>

          {card.email ? (
            <p className="mt-1 truncate text-sm text-[#796ba0]" title={card.email}>
              {card.email}
            </p>
          ) : null}

          <p className="mt-1 text-sm text-[#796ba0]">{card.rolePrimaryLabel}</p>

          {card.authorWorkspaceCountLabel ? (
            <p className="mt-1 text-xs text-[#9485b4]">
              {card.authorWorkspaceCountLabel}
            </p>
          ) : null}

          <Link
            href="/profile/edit"
            className="mt-3 inline-flex min-h-11 items-center rounded-full border border-[#bda6e1] px-4 py-2 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Редактировать профиль
          </Link>
        </div>
      </div>
    </section>
  );
}

type ProfileCountersProps = {
  counters: ProfileCounter[];
};

export function ProfileCounters({ counters }: ProfileCountersProps) {
  return (
    <section
      className="mt-5 grid min-w-0 grid-cols-3 gap-3"
      aria-label="Сводка"
    >
      {counters.map((counter) => {
        const valueLabel = formatCounterDisplay(counter.value);
        const content = (
          <>
            <p className="text-xl font-semibold text-[#7042c5]">{valueLabel}</p>
            <p className="mt-1 text-xs text-[#796ba0]">{counter.label}</p>
          </>
        );

        if (counter.href) {
          return (
            <Link
              key={counter.key}
              href={counter.href}
              className="rounded-[18px] border border-white/80 bg-white/65 px-2 py-3 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              aria-label={`${counter.label}: ${valueLabel}`}
            >
              {content}
            </Link>
          );
        }

        return (
          <div
            key={counter.key}
            className="rounded-[18px] border border-white/80 bg-white/65 px-2 py-3 text-center"
            aria-label={`${counter.label}: ${valueLabel}`}
          >
            {content}
          </div>
        );
      })}
    </section>
  );
}

export function ProfileQuickLinks() {
  return (
    <section className="mt-6 min-w-0" aria-label="Быстрые разделы">
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/my-practices"
          className="flex min-h-[94px] flex-col items-center justify-center rounded-[22px] border border-[#eadff8] bg-white px-2 text-center shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <span className="text-2xl text-[#7042c5]" aria-hidden="true">
            ▥
          </span>
          <span className="mt-2 text-[11px] leading-4">Аудиотека</span>
        </Link>

        <Link
          href="/playlists"
          className="flex min-h-[94px] flex-col items-center justify-center rounded-[22px] border border-[#eadff8] bg-white px-2 text-center shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <span className="text-2xl text-[#7042c5]" aria-hidden="true">
            ♫
          </span>
          <span className="mt-2 text-[11px] leading-4">Плейлисты</span>
        </Link>

        <Link
          href="/history"
          className="col-span-2 flex min-h-[94px] flex-col items-center justify-center rounded-[22px] border border-[#eadff8] bg-white px-2 text-center shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <span className="text-2xl text-[#7042c5]" aria-hidden="true">
            ◷
          </span>
          <span className="mt-2 text-[11px] leading-4">История</span>
        </Link>
      </div>
    </section>
  );
}

type ProfileAuthorSectionProps = {
  section: ProfileAuthorSection;
};

export function ProfileAuthorBlock({ section }: ProfileAuthorSectionProps) {
  if (section.kind === "hidden") {
    return null;
  }

  if (section.kind === "prospect") {
    return (
      <section className="mt-8 min-w-0" aria-labelledby="profile-author-heading">
        <h2 id="profile-author-heading" className="text-[21px] font-semibold">
          Стать автором АудиоЛада
        </h2>

        <p className="mt-3 text-sm leading-6 text-[#796ba0]">
          Создавайте аудиопрактики и программы, находите слушателей и развивайте
          своё авторское направление.
        </p>

        <Link
          href={BECOME_AUTHOR_HREF}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Узнать, как стать автором
        </Link>
      </section>
    );
  }

  const { workspaces } = section;
  const dashboardHref =
    workspaces.length === 1
      ? `/author-dashboard?author=${encodeURIComponent(workspaces[0]!.slug)}`
      : "/author-dashboard";

  return (
    <section className="mt-8 min-w-0" aria-labelledby="profile-author-heading">
      <h2 id="profile-author-heading" className="text-[21px] font-semibold">
        Для авторов
      </h2>

      <div className="mt-4 rounded-[22px] border border-[#eadff8] bg-white p-5">
        {workspaces.length === 1 ? (
          <>
            <p className="text-[17px] font-semibold text-[#25135c]">
              {workspaces[0]!.name}
            </p>
            <p className="mt-1 text-sm text-[#796ba0]">
              {getAuthorMemberRoleLabel(workspaces[0]!.role)}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-[#7042c5]">
              {workspaces.length} авторских пространства
            </p>
            <ul className="mt-3 space-y-1 text-sm text-[#796ba0]">
              {workspaces.slice(0, 2).map((workspace) => (
                <li key={workspace.id}>{workspace.name}</li>
              ))}
            </ul>
          </>
        )}

        <Link
          href={dashboardHref}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Открыть кабинет автора
        </Link>
      </div>
    </section>
  );
}

export function ProfileAccountSection() {
  return (
    <section className="mt-8 min-w-0" aria-labelledby="profile-account-heading">
      <h2 id="profile-account-heading" className="text-[21px] font-semibold">
        Аккаунт
      </h2>

      <div className="mt-4 overflow-hidden rounded-[22px] border border-[#eadff8] bg-white">
        <Link
          href="/settings"
          className="flex min-h-[56px] w-full items-center justify-between border-b border-[#eee6f7] px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5]"
        >
          <span className="text-[15px] leading-6 text-[#25135c]">Настройки</span>
          <span className="text-xl text-[#7042c5]" aria-hidden="true">
            ›
          </span>
        </Link>

        <Link
          href={`/settings#${SETTINGS_LEGAL_SECTION_ID}`}
          className="flex min-h-[56px] w-full items-center justify-between px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5]"
        >
          <span className="text-[15px] leading-6 text-[#25135c]">
            Правовая информация
          </span>
          <span className="text-xl text-[#7042c5]" aria-hidden="true">
            ›
          </span>
        </Link>
      </div>
    </section>
  );
}

type ProfileSignOutSectionProps = {
  signOutAction: () => Promise<void>;
};

export function ProfileSignOutSection({ signOutAction }: ProfileSignOutSectionProps) {
  return (
    <section className="mt-8 min-w-0">
      <form action={signOutAction}>
        <button
          type="submit"
          className="min-h-11 w-full rounded-[20px] border border-[#efc7cf] bg-[#fff8f9] px-5 py-4 font-semibold text-[#b34f63] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b34f63]"
        >
          Выйти
        </button>
      </form>
    </section>
  );
}
