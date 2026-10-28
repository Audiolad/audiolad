"use client";

/**
 * Shared transport controls of the AudioLad Business player (a8240527): the venue program
 * player (/spa) and the Music section (guest and owner) render the same buttons for the
 * same controller (src/lib/business-app/spa-online-player.ts).
 * The venue cabinet uses round icon buttons. Other callers keep the text buttons.
 */
type Props = {
  /** data-testid prefix: "<prefix>-play", "<prefix>-next", "<prefix>-now". */
  testIdPrefix: string;
  playing: boolean;
  loading: boolean;
  nowTitle: string | null;
  onToggle: () => void;
  onNext: () => void;
  /** Starting playback is not allowed (pausing always is). */
  startDisabled?: boolean;
  nextDisabled?: boolean;
  /** Accessible name while audio is playing. The guest player keeps «Пауза». */
  pauseLabel?: string;
  volume?: number;
  onVolume?: (value: number) => void;
  /** "round" is the venue player. "text" is the shared default. */
  appearance?: "text" | "round";
  /** Round play control size. The sticky bar uses compact. */
  size?: "large" | "compact";
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8.2 5.1v13.8l11.4-6.9L8.2 5.1z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.4 4.8h3.7v14.4H6.4zm7.5 0h3.7v14.4h-3.7z" fill="currentColor" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.2 4.6v14.8l11.2-7.4L4.2 4.6z" fill="currentColor" />
      <path d="M17 4.6h3.2v14.8H17z" fill="currentColor" />
    </svg>
  );
}

export default function BusinessPlayerControls({
  testIdPrefix,
  playing,
  loading,
  nowTitle,
  onToggle,
  onNext,
  startDisabled = false,
  nextDisabled = false,
  pauseLabel = "Пауза",
  volume,
  onVolume,
  appearance = "text",
  size = "large",
}: Props) {
  const active = playing || loading;
  const playLabel = active ? pauseLabel : "Играть";
  const round = appearance === "round";
  return (
    <div className={`mt-4 flex flex-wrap items-center gap-3 business-app-player-controls${round ? ` business-transport business-transport--${size}` : ""}`}>
      <button
        type="button"
        data-testid={`${testIdPrefix}-play`}
        data-state={active ? "pause" : "play"}
        onClick={onToggle}
        disabled={!active && startDisabled}
        aria-label={round ? playLabel : undefined}
        className={round
          ? `business-play-btn business-play-btn--${size} business-app-focus-ring`
          : "business-app-btn business-app-btn-primary business-app-focus-ring"}
      >
        {round ? (active ? <PauseIcon /> : <PlayIcon />) : playLabel}
      </button>
      <button
        type="button"
        data-testid={`${testIdPrefix}-next`}
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={round ? "Следующий трек" : undefined}
        title={round ? "Следующий трек" : undefined}
        className={round
          ? "business-next-btn business-app-focus-ring"
          : "business-app-btn business-app-btn-secondary business-app-focus-ring"}
      >
        {round ? <NextIcon /> : "Следующий"}
      </button>
      {onVolume ? (
        <label className="business-workspace-volume">
          <span className="business-app-muted">Громкость</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume ?? 0.8}
            onChange={(event) => onVolume(Number(event.target.value))}
            data-testid={`${testIdPrefix}-volume`}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={volume ?? 0.8}
          />
        </label>
      ) : null}
      <span className="business-app-muted" data-testid={`${testIdPrefix}-now`}>
        {loading ? "Загрузка…" : nowTitle ?? ""}
      </span>
    </div>
  );
}
