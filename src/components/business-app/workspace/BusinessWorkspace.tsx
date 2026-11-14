"use client";

import { locationSoundProfile, locationSoundPrefs } from "@/lib/business-app/location-sound-settings";

import BusinessGuestStartCta from "../BusinessGuestStartCta";
import { useGuestStartEnabled } from "../BusinessDomainProvider";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useBusinessHostname } from "@/components/business-app/BusinessDomainProvider";
import { businessAuthHref } from "@/lib/access-grants/paths";
import { businessCabinetHomePath } from "@/lib/business-app/host";

import { useReportBusinessChromeAccess } from "@/components/business-app/BusinessAccessLine";
import BusinessEligibilityProbePanel from "@/components/business-app/BusinessEligibilityProbePanel";
import BusinessAtmosphereTrackButton from "@/components/business-app/BusinessAtmosphereTrackButton";
import BusinessPlayerControls from "@/components/business-app/BusinessPlayerControls";
import { useBusinessCabinetMode } from "@/components/business-app/BusinessPointMode";
import {
  BusinessCabinetPlayerProvider,
  useCabinetPlayer,
  useCabinetPlayerOptional,
} from "@/components/business-app/workspace/BusinessCabinetPlayer";
import { cabinetAlbumCoverUrl } from "@/lib/business-app/album-cover";
import { atmospherePlaybackPlan, peekAtmosphereRestart, takeAtmosphereRestart } from "@/lib/business-app/cafe-queue/atmosphere-restart";
import { FEEDBACK_RESULT_MS, feedbackHoldMs } from "@/lib/business-app/cafe-queue/feedback-phase";
import { voteCafeFeedback, type CafeQueueFeedbackKind } from "@/lib/business-app/cafe-queue/prefs";
import { CAFE_QUEUE_TOPUP_NOTE } from "@/lib/business-app/cafe-queue/auto-topup";
import { cafeQueueBuildKey, cafeQueueIndices, cafeUpcomingIndices, cafeUpcomingMoreCount, cafeUpcomingMoreLabel, cafeUniqueAhead, CAFE_QUEUE_PREVIEW } from "@/lib/business-app/cafe-queue/order";
import { formatPlaybackClock } from "@/lib/business-app/playback-clock";
import { stepWorkspaceVolume, WORKSPACE_VOLUME_STEP } from "@/lib/business-workspace/playback";
import CafeQueueControls, { CafeTrackFeedback, type CafeFeedbackPhase } from "@/components/business-app/workspace/CafeQueueControls";
import { useCafeQueuePreferences } from "@/components/business-app/workspace/useCafeQueuePreferences";
import {
  BUSINESS_CONNECT_VENUE_CTA,
  BUSINESS_CONNECT_VENUE_NOTE,
  BUSINESS_EMPTY_CATALOG_NOTE,
  BUSINESS_GIFT_CTA,
  BUSINESS_STORE_UNAVAILABLE_NOTE,
  BUSINESS_UNCONFIRMED_NOTE,
} from "@/lib/access-grants/copy";
import {
  workspacePlayerOpen,
  type WorkspacePageModel,
  type WorkspaceTrack,
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
  const hostname = useBusinessHostname();
  const guestStartEnabled = useGuestStartEnabled();
  const player = useCabinetPlayer();
  // Day-time choices stay with the owner (cabinet-mode.ts), also in the preview. Ratings are the
  // owner's and, while the owner's switch is on, the hall's (trackRatings: if_allowed).
  const cabinet = useBusinessCabinetMode();
  const adopt = player.adopt;
  const playIndex = player.playIndex;
  const setQueueOrder = player.setQueueOrder;
  const applyAtmosphereQueue = player.applyAtmosphereQueue;
  const currentIndex = player.view.index;
  const sound = initialModel.soundSettings;
  const queue = useCafeQueuePreferences(sound ? { profile: locationSoundProfile(sound), prefs: locationSoundPrefs(sound), hours: sound.hours } : null);
  const [failedNowCover, setFailedNowCover] = useState<string | null>(null);
  const [feedbackPhase, setFeedbackPhase] = useState<CafeFeedbackPhase>("idle");
  const [feedbackBusyKind, setFeedbackBusyKind] = useState<CafeQueueFeedbackKind | null>(null);
  const feedbackTicket = useRef(0);
  const feedbackStarted = useRef(0);
  const feedbackPending = useRef(false);
  const feedbackTimers = useRef<number[]>([]);
  // The persistent provider owns access refreshes even while this screen is unmounted.
  const model = player.accessModel?.spaceId === initialModel.spaceId ? player.accessModel : initialModel;
  const open = workspacePlayerOpen(model);
  const reportChromeAccess = useReportBusinessChromeAccess();
  const reportedStatus = model.status;
  const reportedEndsAt = model.endsAt;
  useLayoutEffect(() => {
    adopt(initialModel);
  }, [initialModel, adopt]);
  useEffect(() => {
    // Hall access copy is owned by its existing server context. Do not publish the
    // refreshed playback deadline to staff chrome (it can outlast the contract).
    if (cabinet.side === "venue") return;
    if ((reportedStatus === "trial" || reportedStatus === "paid" || reportedStatus === "grace") && reportedEndsAt) {
      reportChromeAccess({
        mode: reportedStatus,
        endsAt: reportedEndsAt,
        ...(reportedStatus === "grace" && model.playbackUntil ? { graceEndsAt: model.playbackUntil } : {}),
      });
    }
  }, [cabinet.side, model.playbackUntil, reportChromeAccess, reportedStatus, reportedEndsAt]);
  // The live refresh (router.refresh every few seconds) passes a new model object with the same
  // tracks. The queue request depends on this key, not on object identity: an unchanged key keeps
  // the queue the player already has instead of asking the server for a new random mix.
  // A saved «Пересобрать атмосферу» bumps the revision: a new queue even for unchanged choices,
  // and the request for the previous one is cancelled.
  const queueBuildKey = `${cafeQueueBuildKey({
    spaceId: model.spaceId,
    tracks: model.tracks,
    character: queue.profile.character,
    direction: queue.profile.direction,
    daypart: queue.effectiveDaypart,
    feedback: queue.feedback,
  })}#${queue.atmosphereRevision}`;
  const queueInputRef = useRef({ model, queue });
  useLayoutEffect(() => {
    queueInputRef.current = { model, queue };
  });
  const boundaryRef = useRef<string | null>(null);
  const statusRef = useRef(player.view.status);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    const playing = model.tracks[currentIndex];
    boundaryRef.current = player.queueOrder && playing ? playing.audioItemId : null;
    statusRef.current = player.view.status;
    currentIndexRef.current = currentIndex;
  }, [player.queueOrder, model.tracks, currentIndex, player.view.status]);
  useEffect(() => () => {
    for (const timer of feedbackTimers.current) window.clearTimeout(timer);
  }, []);
  const settleFeedback = (ticket: number, started: number, ok: boolean) => {
    if (ticket === 0 || ticket !== feedbackTicket.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = window.setTimeout(() => {
      if (ticket !== feedbackTicket.current) return;
      setFeedbackPhase(ok ? "confirmed" : "error");
      const back = window.setTimeout(() => {
        if (ticket !== feedbackTicket.current) return;
        setFeedbackPhase("idle");
        setFeedbackBusyKind(null);
      }, FEEDBACK_RESULT_MS);
      feedbackTimers.current.push(back);
    }, feedbackHoldMs(Date.now() - started, reduced));
    feedbackTimers.current.push(hold);
  };
  useEffect(() => {
    if (player.pointDevice) return;
    const { model, queue } = queueInputRef.current;
    if (!open || !queue.ready || !queue.effectiveDaypart || model.tracks.length === 0) return;
    const ac = new AbortController();
    let cancelled = false;
    const ticket = feedbackTicket.current;
    const started = feedbackStarted.current;
    const pending = feedbackPending.current;
    const params = new URLSearchParams({ space: model.spaceId });
    void fetch(`/api/business/workspace/queue?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: ac.signal,
      body: JSON.stringify({
        character: queue.profile.character,
        direction: queue.profile.direction,
        daypart: queue.effectiveDaypart,
        // Calm/lively is no longer offered. A stored offset stays on the device and is not applied.
        energyOffset: 0,
        feedback: queue.feedback,
        boundaryAudioItemId: boundaryRef.current ?? undefined,
      }),
    })
      .then(async (res) => {
        let ok = false;
        if (res.ok) {
          const json = await res.json() as { ok?: boolean; order?: unknown };
          if (!cancelled && json.ok === true && Array.isArray(json.order)) {
            const indices = cafeQueueIndices(model.tracks, json.order);
            const plan = atmospherePlaybackPlan({
              tracks: model.tracks,
              orderedIds: json.order,
              restart: peekAtmosphereRestart(),
              status: statusRef.current,
              currentIndex: currentIndexRef.current,
            });
            if (plan && indices.length > 0) {
              takeAtmosphereRestart();
              applyAtmosphereQueue(indices);
            } else if (!cancelled) {
              setQueueOrder(indices);
            }
            ok = indices.length > 0;
          }
        }
        if (!cancelled && pending) {
          feedbackPending.current = false;
          settleFeedback(ticket, started, ok);
        }
      })
      .catch(() => {
        if (!cancelled && pending) {
          feedbackPending.current = false;
          settleFeedback(ticket, started, false);
        }
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [
    player.pointDevice,
    open,
    queue.ready,
    queueBuildKey,
    setQueueOrder,
    applyAtmosphereQueue,
  ]);

  const current = model.tracks[currentIndex] ?? model.tracks[0] ?? null;
  const author = current?.authorName?.trim() ?? "";
  const album = current?.albumTitle?.trim() ?? "";
  const nowCover = current ? cabinetAlbumCoverUrl({ coverUrl: current.coverUrl }) : null;
  const duration = player.view.duration > 0 ? player.view.duration : (current?.durationSeconds ?? 0);
  const ratio = duration > 0 ? Math.min(1, Math.max(0, player.view.currentTime / duration)) : 0;
  const playOrder = player.queueOrder ?? model.tracks.map((_, index) => index);
  const ahead = current ? cafeUniqueAhead(model.tracks, playOrder, currentIndex) : [];
  const previewOrder = ahead.length > 0 || !current
    ? ahead
    : cafeUpcomingIndices(playOrder, currentIndex);
  const upcoming = queueRows(model.tracks, previewOrder);
  const aheadTotal = typeof player.queueAheadCount === "number" && player.queueAheadCount >= ahead.length ? player.queueAheadCount : ahead.length;
  const moreLabel = cafeUpcomingMoreLabel(cafeUpcomingMoreCount(aheadTotal));
  return (
    <div className="business-app-span-full business-music-stage mx-auto max-w-3xl space-y-4" data-testid="biz-workspace" data-space={model.spaceId} data-status={model.status}>
      {model.status === "anonymous" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-anonymous">
          <p>{guestStartEnabled ? "Откройте кабинет без регистрации. Карта не нужна." : "Чтобы открыть кабинет, подтвердите почту по письму. Карта не нужна."}</p>
          <div className="flex flex-wrap gap-2">
            <BusinessGuestStartCta className="business-app-btn business-app-btn-primary business-app-focus-ring" href={businessAuthHref(hostname, "sign-up", true)} testId="biz-workspace-signup">
              {BUSINESS_GIFT_CTA}
            </BusinessGuestStartCta>
            <a className="business-app-btn business-app-btn-secondary business-app-focus-ring" href={businessAuthHref(hostname, "sign-in", true)}>
              Войти
            </a>
          </div>
        </section>
      ) : null}

      {model.status === "unconfirmed" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-unconfirmed">
          <p>{BUSINESS_UNCONFIRMED_NOTE}</p>
          <p className="flex flex-wrap gap-3">
            <a className="underline" href={businessAuthHref(hostname, "sign-in", true)}>Перейти и войти после подтверждения</a>
            <Link className="underline" href={model.helpHref}>Перейти и найти письмо</Link>
          </p>
        </section>
      ) : null}

      {model.status === "unavailable" ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-unavailable">
          <p>{BUSINESS_STORE_UNAVAILABLE_NOTE}</p>
          <Link className="underline" href="/music">Перейти и повторить</Link>
        </section>
      ) : null}

      {!model.spaceEnabled ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-closed-space">
          <p>Это направление пока закрыто.</p>
          <Link className="underline" href={model.cafeHref}>Открыть музыку</Link>
        </section>
      ) : null}

      {model.status === "offer" ? (
        <section className="business-app-card space-y-2" data-testid="biz-workspace-offer">
          <p>
            {cabinet.side === "venue"
              ? "Попросите владельца продлить доступ."
              : model.endsAtLabel
                ? `Подарочный период закончился ${model.endsAtLabel}. Полный плеер закрыт.`
                : "Подарочный период закончился. Полный плеер закрыт."}
          </p>
          {cabinet.can("payLink") ? (
            <p>
              <Link className="underline" href={`${businessCabinetHomePath(hostname)}#dostup`} data-testid="biz-workspace-terms">Условия и подписка</Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {showEmpty(model) && model.needsVenue ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-connect">
          <p>{BUSINESS_CONNECT_VENUE_NOTE}</p>
          <p>
            <Link className="business-app-btn business-app-btn-primary business-app-focus-ring" href={model.onboardingHref} data-testid="biz-workspace-connect-venue">
              {BUSINESS_CONNECT_VENUE_CTA}
            </Link>
          </p>
        </section>
      ) : null}

      {showEmpty(model) && !model.needsVenue ? (
        <section className="business-app-card space-y-3" data-testid="biz-workspace-empty">
          <p>{BUSINESS_EMPTY_CATALOG_NOTE}</p>
          <p className="flex flex-wrap gap-3">
            <a className="underline" href={model.rightsHref}>Как устроены права на музыку</a>
            <Link className="underline" href={model.onboardingHref}>Перейти и подключить кофейню</Link>
          </p>
        </section>
      ) : null}

      {playbackBlocked(model) ? (
        <BusinessEligibilityProbePanel compact />
      ) : null}

      {open && current ? (
        <>
          <section className="business-app-card" data-testid="biz-now-playing" aria-label={player.hallMirror ? HALL_NOW_TITLE : "Сейчас играет"} data-hall-mirror={player.hallMirror ? "true" : "false"}>
            <h2 className="text-[1.05rem] font-bold">{player.hallMirror ? HALL_NOW_TITLE : "Сейчас играет"}</h2>
            <div className="business-now__head">
              <span className="business-now__cover" data-has-image={nowCover && failedNowCover !== nowCover ? "true" : "false"} data-testid="biz-now-cover">
                {nowCover && failedNowCover !== nowCover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- public catalog cover, same file as the bottom bar
                  <img src={nowCover} alt="" width={80} height={80} onError={() => setFailedNowCover(nowCover)} />
                ) : null}
              </span>
              <div className="business-now__meta">
                <p className="business-now__title" data-testid="biz-now-title">{current.title}</p>
                {author ? <p className="business-now__byline" data-testid="biz-now-author">{author}</p> : null}
                {album ? <p className="business-now__byline" data-testid="biz-now-album">{album}</p> : null}
              </div>
            </div>
            <div
              className="business-now__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, Math.round(duration))}
              aria-valuenow={Math.round(player.view.currentTime)}
              aria-label="Прогресс трека"
              data-testid="biz-now-progress"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                if (rect.width <= 0) return;
                player.seek((event.clientX - rect.left) / rect.width);
              }}
            >
              <span style={{ width: `${ratio * 100}%` }} />
            </div>
            {player.hallMirror ? null : <div className="business-now__volume">
              <p className="business-now__volume-title" id="biz-now-volume-caption">Громкость</p>
              <div className="business-now__volume-ends">
                <button
                  type="button"
                  className="business-now__volume-step"
                  aria-label="Тише"
                  data-testid="biz-now-volume-down"
                  onClick={() => player.setVolume(stepWorkspaceVolume(player.volume, -1))}
                >
                  ↓ Тише
                </button>
                <button
                  type="button"
                  className="business-now__volume-step"
                  aria-label="Громче"
                  data-testid="biz-now-volume-up"
                  onClick={() => player.setVolume(stepWorkspaceVolume(player.volume, 1))}
                >
                  Громче ↑
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={WORKSPACE_VOLUME_STEP}
                value={player.volume}
                onChange={(event) => player.setVolume(Number(event.target.value))}
                data-testid="biz-now-volume"
                aria-labelledby="biz-now-volume-caption"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={player.volume}
              />
            </div>}
            <p className="business-cabinet-player__time" data-testid="biz-now-time">
              {formatPlaybackClock(player.view.currentTime)} / {formatPlaybackClock(duration)}
            </p>
            <BusinessPlayerControls
              testIdPrefix="biz-now"
              playing={player.view.status === "playing"}
              loading={player.view.status === "loading"}
              nowTitle={null}
              onToggle={() => void player.toggle()}
              previousDisabled={!player.canChangeMusic}
              nextDisabled={!player.canNext}
              onPrevious={() => void player.previous()}
              onNext={() => void player.next()}
              appearance="round"
              size="large"
            />
            {/* Hall device: the live switch from the venue sound poll, not only the page load. */}
            {cabinet.can("trackRatings") && (!player.pointDevice || player.canChangeMusic) ? <CafeTrackFeedback
              phase={feedbackPhase}
              busyKind={feedbackBusyKind}
              onFeedback={(kind) => {
                if (feedbackPhase !== "idle") return;
                feedbackPending.current = true;
                feedbackTicket.current += 1;
                feedbackStarted.current = Date.now();
                setFeedbackPhase("working");
                setFeedbackBusyKind(kind);
                if (player.pointDevice) {
                  // The hall plays its own queue (the queue effect above is the owner's): the vote
                  // rebuilds the hall queue here, after the server checks the owner's switch.
                  const ticket = feedbackTicket.current;
                  const started = feedbackStarted.current;
                  const votes = voteCafeFeedback(queue.feedback, current.audioItemId, kind);
                  queue.vote(current.audioItemId, kind);
                  const daypart = queue.effectiveDaypart;
                  void player.steerHall(votes, daypart ? { character: queue.profile.character, direction: queue.profile.direction, daypart } : null)
                    .then((result) => {
                      if (ticket !== feedbackTicket.current) return;
                      feedbackPending.current = false;
                      settleFeedback(ticket, started, result === "applied");
                    });
                  return;
                }
                queue.vote(current.audioItemId, kind);
              }}
            /> : null}
          </section>
          {cabinet.can("daypartSettings") ? <section className="business-app-card">
            <CafeQueueControls
              mode={queue.prefs.daypartMode}
              effectiveDaypart={queue.effectiveDaypart}
              onDaypart={queue.setDaypartMode}
              hours={queue.hours}
            />
          </section> : null}
          <section className="business-app-card business-track-panel" data-testid="biz-now-queue" aria-label="Дальше в очереди">
            <h2 className="text-[1.05rem] font-bold">Дальше в очереди</h2>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--biz-text-muted)]">Дальше снова зазвучит эта композиция.</p>
            ) : (
              <ol className="business-atmosphere-tracks mt-2">
                {upcoming.slice(0, CAFE_QUEUE_PREVIEW).map(({ track, index }) => {
                  // Title + album only. If the album is missing, line 2 stays empty – never the artist.
                  const lineAlbum = track.albumTitle?.trim() ?? "";
                  return (
                    <li key={`${track.audioItemId}:${index}`}>
                      <BusinessAtmosphereTrackButton
                        title={track.title}
                        subtitle={lineAlbum}
                        time={track.durationSeconds != null ? formatPlaybackClock(track.durationSeconds) : null}
                        coverUrl={track.coverUrl}
                        disabled={!player.canChangeMusic}
                        onClick={() => void playIndex(index)}
                      />
                    </li>
                  );
                })}
              </ol>
            )}
            {moreLabel ? (
              <p className="mt-2 text-sm text-[var(--biz-text-muted)]" data-testid="biz-now-more">
                {moreLabel}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-[var(--biz-text-muted)]" data-testid="biz-now-queue-autotopup">
              {CAFE_QUEUE_TOPUP_NOTE}
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

/** Owner screens while a live hall device plays: the card shows the hall, not this phone. */
export const HALL_NOW_TITLE = "Сейчас играет в зале";

function showEmpty(model: WorkspacePageModel): boolean {
  return workspacePlayerOpen(model) && model.tracks.length === 0;
}

/** Rights check stays on «Музыка» only while the player has nothing to play. */
function playbackBlocked(model: WorkspacePageModel): boolean {
  return !workspacePlayerOpen(model) || model.tracks.length === 0;
}

/** Rows for the queue list. Indices that no longer point at a track are skipped. */
function queueRows(
  tracks: readonly WorkspaceTrack[],
  indices: readonly number[],
): { track: WorkspaceTrack; index: number }[] {
  return indices.flatMap((index) => {
    const track = tracks[index];
    return track ? [{ track, index }] : [];
  });
}
