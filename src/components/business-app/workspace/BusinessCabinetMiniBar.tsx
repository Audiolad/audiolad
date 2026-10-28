"use client";

import { useLayoutEffect, useRef } from "react";

import BusinessPlayerControls from "@/components/business-app/BusinessPlayerControls";

/**
 * The thin cabinet player (#1031). The guest coffee page uses the same bar.
 */
export default function BusinessCabinetMiniBar({
  title,
  coverSrc,
  onCoverError,
  playing,
  loading,
  onToggle,
  onNext,
  onClose,
  onOpen,
  onSeek,
  currentTime,
  duration,
  timeLabel,
  volume,
  onVolume,
  message,
  messageTestId,
  note,
  noteTestId,
  testId,
  progressTestId,
  openTestId,
  closeTestId,
  controlsPrefix,
  ariaLabel,
}: {
  title: string;
  coverSrc: string | null;
  onCoverError?: () => void;
  playing: boolean;
  loading: boolean;
  onToggle: () => void;
  onNext: () => void;
  onClose: () => void;
  onOpen?: () => void;
  onSeek?: (ratio: number) => void;
  currentTime: number;
  duration: number;
  timeLabel: string;
  volume?: number;
  onVolume?: (value: number) => void;
  message?: string | null;
  messageTestId?: string;
  note?: string | null;
  noteTestId?: string;
  testId: string;
  progressTestId: string;
  openTestId: string;
  closeTestId: string;
  controlsPrefix: string;
  ariaLabel: string;
}) {
  const barRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const shell = bar?.closest(".business-app-shell");
    if (!bar || !(shell instanceof HTMLElement)) return;
    const apply = () => {
      shell.style.setProperty("--biz-cabinet-player-height", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--biz-cabinet-player-height");
    };
  }, [title, message, note, playing, loading, timeLabel]);

  const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  return (
    <section ref={barRef} className="business-cabinet-player" aria-label={ariaLabel} data-testid={testId}>
      <div
        className="business-cabinet-player__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, Math.round(duration))}
        aria-valuenow={Math.round(currentTime)}
        aria-label="Прогресс трека"
        data-testid={progressTestId}
        onClick={(event) => {
          if (!onSeek) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width <= 0) return;
          onSeek((event.clientX - rect.left) / rect.width);
        }}
      >
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      <button type="button" className="business-cabinet-player__open business-app-focus-ring" data-testid={openTestId} onClick={onOpen}>
        <span className="business-cabinet-player__cover" data-has-image={coverSrc ? "true" : "false"}>
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- public catalog cover, same as the cabinet bar
            <img src={coverSrc} alt="" width={40} height={40} onError={onCoverError} />
          ) : null}
        </span>
        <span className="business-cabinet-player__title">{title}</span>
      </button>
      <p className="business-cabinet-player__time" data-testid={`${controlsPrefix}-time`}>
        {timeLabel}
      </p>
      <BusinessPlayerControls
        testIdPrefix={controlsPrefix}
        playing={playing}
        loading={loading}
        nowTitle={null}
        onToggle={onToggle}
        onNext={onNext}
        volume={volume}
        onVolume={onVolume}
        appearance="round"
        size="compact"
      />
      <button
        type="button"
        className="business-cabinet-player__close business-app-focus-ring"
        aria-label="Закрыть плеер"
        data-testid={closeTestId}
        onClick={onClose}
      >
        <span aria-hidden="true">×</span>
      </button>
      {message ? (
        <p className="business-app-alert business-cabinet-player__note" data-tone="warn" role="alert" data-testid={messageTestId}>
          {message}
        </p>
      ) : null}
      {note ? <p className="text-sm text-[var(--biz-text-muted)] business-cabinet-player__note" data-testid={noteTestId}>{note}</p> : null}
    </section>
  );
}
