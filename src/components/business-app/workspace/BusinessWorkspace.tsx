"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";

import { useReportBusinessChromeAccess } from "@/components/business-app/BusinessAccessLine";
import {
  BusinessCabinetPlayerProvider,
  useCabinetPlayer,
  useCabinetPlayerOptional,
} from "@/components/business-app/workspace/BusinessCabinetPlayer";
import {
  BUSINESS_CONNECT_VENUE_CTA,
  BUSINESS_CONNECT_VENUE_NOTE,
  BUSINESS_EMPTY_CATALOG_NOTE,
  BUSINESS_GIFT_CTA,
  BUSINESS_GIFT_TITLE,
  BUSINESS_SPACE_CLOSED_NOTE,
  BUSINESS_STORE_UNAVAILABLE_NOTE,
  BUSINESS_SUBSCRIPTION_NOTE,
  BUSINESS_UNCONFIRMED_NOTE,
  BUSINESS_WORKSPACE_AUTOPLAY_NOTE,
} from "@/lib/access-grants/copy";
import { ruDaysWord } from "@/lib/access-grants/policy";
import { groupWorkspaceTracks, workspaceShelfTrackNumber } from "@/lib/business-workspace/shelves";
import {
  workspaceDeadlineDelay,
  workspacePlaybackAllowed,
  workspacePlayerOpen,
  type WorkspacePageModel,
} from "@/lib/business-workspace/model";

export default function BusinessWorkspace({ model }: { model: WorkspacePageModel }) {
  const parent = useCabinetPlayerOptional();
  if (parent) return <BusinessWorkspaceView model={model} />;
  return (
    <BusinessCabinetPlayerProvider initialModel={model.tracks.length > 0 ? model : null}>
      <BusinessWorkspaceView model={model} />
    </BusinessCabinetPlayerProvider>
  );
}

function BusinessWorkspaceView({ model: initialModel }: { model: WorkspacePageModel }) {
  const player = useCabinetPlayer();
  const adopt = player.adopt;
  const release = player.release;
  const playIndex = player.playIndex;
  const currentIndex = player.view.index;
  const [refreshed, setRefreshed] = useState<{ source: WorkspacePageModel; value: WorkspacePageModel } | null>(null);
  const model = refreshed?.source === initialModel ? refreshed.value : initialModel;
  const open = workspacePlayerOpen(model);
  const reportChromeAccess = useReportBusinessChromeAccess();
  const reportedStatus = model.status;
  const reportedEndsAt = model.endsAt;
  useLayoutEffect(() => {
    if (model.tracks.length > 0) adopt(model);
  }, [model, adopt]);
  useEffect(() => {
    if ((reportedStatus === "trial" || reportedStatus === "paid") && reportedEndsAt) {
      reportChromeAccess({ mode: reportedStatus, endsAt: reportedEndsAt });
    }
  }, [reportChromeAccess, reportedStatus, reportedEndsAt]);
  const [offerNoted, setOfferNoted] = useState(false);

  useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof setTimeout>;
    let expired = false;
    const check = () => {
      if (expired) return;
      if (workspacePlaybackAllowed(model.endsAt, Date.now())) {
        clearTimeout(timer);
        timer = setTimeout(check, workspaceDeadlineDelay(model.endsAt, Date.now()));
        return;
      }
      expired = true;
      release();
      setRefreshed({ source: initialModel, value: { ...model, status: "offer", daysLeft: 0, tracks: [] } });
      const params = new URLSearchParams({ space: model.spaceId });
      void fetch(`/api/business/workspace/state?${params.toString()}`, { credentials: "same-origin", cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return;
          const json = await res.json() as { ok?: boolean; model?: WorkspacePageModel };
          if (!json.ok || !json.model) return;
          const value = workspacePlayerOpen(json.model) && !workspacePlaybackAllowed(json.model.endsAt, Date.now())
            ? { ...json.model, status: "offer" as const, daysLeft: 0, tracks: [] }
            : json.model;
          setRefreshed({ source: initialModel, value });
        }).catch(() => { /* The local offer stays closed until access can be refreshed. */ });
    };
    timer = setTimeout(check, workspaceDeadlineDelay(model.endsAt, Date.now()));
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [open, model, initialModel, release]);

  const offer = () => {
    setOfferNoted(true);
    const params = new URLSearchParams({ space: model.spaceId });
    void fetch(`/api/business/workspace/state?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ kind: "offer_click" }),
    }).catch(() => {
      /* The subscribe button stays on this screen. Nothing is charged. */
    });
  };

  const shelves = groupWorkspaceTracks(model.tracks);

  return (
    <div className="business-app-span-full mx-auto max-w-3xl space-y-4" data-testid="biz-workspace" data-space={model.spaceId} data-status={model.status}>
      <header>
        <p className="business-app-eyebrow">{BUSINESS_GIFT_TITLE}</p>
        <h1 className="mt-1 text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)]">{model.spaceTitle}</h1>
        {model.status === "trial" && model.daysLeft !== null ? (
          <p className="mt-2 text-[1.15rem] font-bold text-[var(--biz-text)]" data-testid="biz-workspace-days">
            Осталось {model.daysLeft} {ruDaysWord(model.daysLeft)}
            {model.endsAtLabel ? <span className="mt-1 block text-base font-normal text-[var(--biz-text-muted)]" data-testid="biz-workspace-until">до {model.endsAtLabel}</span> : null}
          </p>
        ) : null}
        {model.status === "paid" && model.endsAtLabel ? (
          <p className="mt-2 text-[var(--biz-text-muted)]" data-testid="biz-workspace-paid-until">Подписка до {model.endsAtLabel}</p>
        ) : null}
      </header>

      <p className="text-sm leading-6 text-[var(--biz-text-muted)]" data-testid="biz-workspace-rules">{model.rules}</p>

      {model.status === "anonymous" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-anonymous">
          <p>Чтобы открыть кабинет, подтвердите почту по письму. Карта не нужна.</p>
          <div className="flex flex-wrap gap-2">
            <a className="business-app-btn business-app-btn-primary business-app-focus-ring" href={model.signUpHref} data-testid="biz-workspace-signup">
              {BUSINESS_GIFT_CTA}
            </a>
            <a className="business-app-btn business-app-btn-secondary business-app-focus-ring" href={model.signInHref}>
              Войти
            </a>
          </div>
        </section>
      ) : null}

      {model.status === "unconfirmed" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-unconfirmed">
          <p>{BUSINESS_UNCONFIRMED_NOTE}</p>
          <p className="flex flex-wrap gap-3">
            <a className="underline" href={model.signInHref}>Перейти и войти после подтверждения</a>
            <Link className="underline" href={model.helpHref}>Перейти и найти письмо</Link>
          </p>
        </section>
      ) : null}

      {model.status === "unavailable" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-unavailable">
          <p>{BUSINESS_STORE_UNAVAILABLE_NOTE}</p>
          <a className="underline" href={`/music`}>Перейти и повторить</a>
        </section>
      ) : null}

      {!model.spaceEnabled ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-closed-space">
          <p>{BUSINESS_SPACE_CLOSED_NOTE}</p>
          <Link className="underline" href={model.cafeHref}>Перейти и открыть «Кафе, рестораны и отели»</Link>
        </section>
      ) : null}

      {model.status === "offer" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-offer">
          <h2 className="text-[1.15rem] font-bold">Подписка {model.priceLabel} {model.periodLabel}</h2>
          {model.endsAtLabel ? <p data-testid="biz-workspace-ended">Подарочный период закончился {model.endsAtLabel}.</p> : null}
          <p>{BUSINESS_SUBSCRIPTION_NOTE}</p>
          <button type="button" className="business-app-btn business-app-btn-primary business-app-focus-ring" onClick={offer} data-testid="biz-workspace-subscribe">
            Оформить подписку
          </button>
          {offerNoted ? <p data-testid="biz-workspace-offer-noted">Запрос отмечен. Деньги не списываются.</p> : null}
        </section>
      ) : null}

      {showEmpty(model) && model.needsVenue ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-connect">
          <p>{BUSINESS_CONNECT_VENUE_NOTE}</p>
          <p>
            <a className="business-app-btn business-app-btn-primary business-app-focus-ring" href={model.onboardingHref} data-testid="biz-workspace-connect-venue">
              {BUSINESS_CONNECT_VENUE_CTA}
            </a>
          </p>
        </section>
      ) : null}

      {showEmpty(model) && !model.needsVenue ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-empty">
          <p>{BUSINESS_EMPTY_CATALOG_NOTE}</p>
          <p className="flex flex-wrap gap-3">
            <a className="underline" href={model.rightsHref}>Как устроены права на музыку</a>
            <Link className="underline" href={model.onboardingHref}>Перейти и подключить точку</Link>
          </p>
        </section>
      ) : null}

      {open && model.tracks.length > 0 ? (
        <section className="business-app-card" data-testid="biz-workspace-tracks">
          <p className="text-sm text-[var(--biz-text-muted)]">{BUSINESS_WORKSPACE_AUTOPLAY_NOTE}</p>
          {shelves.map((shelf) => (
            <section key={shelf.key} className="mt-3 space-y-2">
              {shelf.title ? (
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[1.05rem] font-bold" data-testid="biz-workspace-shelf">{shelf.title}</h2>
                  <button type="button" className="text-sm underline" onClick={() => void playIndex(shelf.firstIndex)}>
                    Играть эту подборку
                  </button>
                </div>
              ) : null}
              {shelf.albums.map((album) => (
                <div key={`${shelf.key}:${album.key}`}>
                  {album.title ? <h3 className="text-sm font-semibold text-[var(--biz-text-muted)]" data-testid="biz-workspace-album">{album.title}</h3> : null}
                  <ol className="business-atmosphere-tracks">
                    {album.tracks.map(({ track, index }) => (
                      <li key={track.audioItemId} data-current={currentIndex === index ? "true" : undefined}>
                        <button
                          type="button"
                          className="business-atmosphere-track business-app-focus-ring"
                          onClick={() => void playIndex(index)}
                        >
                          <span>{workspaceShelfTrackNumber(shelf, track.audioItemId)}</span>
                          <span>{track.title}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </section>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function showEmpty(model: WorkspacePageModel): boolean {
  return workspacePlayerOpen(model) && model.tracks.length === 0;
}
