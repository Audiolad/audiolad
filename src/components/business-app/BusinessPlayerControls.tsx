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
        {active ? "Пауза" : "Играть"}
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
      <span className="business-app-muted" data-testid={`${testIdPrefix}-now`}>
        {loading ? "Загрузка…" : nowTitle ?? ""}
      </span>
    </div>
  );
}
