"use client";

/**
 * Shared transport controls of the AudioLad Business player (a8240527): the venue program
 * player (/spa) and the Music section (guest and owner) render the same buttons for the
 * same controller (src/lib/business-app/spa-online-player.ts).
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
  /** Label while audio is playing. The guest player keeps «Пауза». */
  pauseLabel?: string;
  volume?: number;
  onVolume?: (value: number) => void;
};

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
}: Props) {
  const active = playing || loading;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 business-app-player-controls">
      <button
        type="button"
        data-testid={`${testIdPrefix}-play`}
        onClick={onToggle}
        disabled={!active && startDisabled}
        className="business-app-btn business-app-btn-primary business-app-focus-ring"
      >
        {active ? pauseLabel : "Играть"}
      </button>
      <button
        type="button"
        data-testid={`${testIdPrefix}-next`}
        onClick={onNext}
        disabled={nextDisabled}
        className="business-app-btn business-app-btn-secondary business-app-focus-ring"
      >
        Следующий
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
