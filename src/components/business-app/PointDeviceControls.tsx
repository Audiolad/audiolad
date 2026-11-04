"use client";

import { ENABLE_MUSIC_LABEL, useCabinetPlayerOptional } from "@/components/business-app/workspace/BusinessCabinetPlayer";
import { RECONNECTING_MESSAGE } from "@/lib/business-app/spa-online-player";

/** On the paired device the buttons act at once. There is no remote confirm. */
export default function PointDeviceControls() {
  const player = useCabinetPlayerOptional();
  const playing = player?.view.status === "playing" || player?.view.status === "loading";
  // Autoplay refused (reload, reconnect without a tap): one green button, no other hint.
  const needsGesture = player?.view.needsGesture === true;
  const reconnecting = player?.view.status === "loading" && player.view.message === RECONNECTING_MESSAGE;
  return (
    <section className="business-app-card space-y-3" data-testid="biz-point-controls" aria-label="Плеер в зале">
      <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Музыка в зале</h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Кнопки действуют на это устройство сразу.
      </p>
      {reconnecting ? (
        <p className="text-sm leading-6 text-[var(--biz-text-muted)]" role="status" data-testid="biz-point-reconnecting">
          {RECONNECTING_MESSAGE}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {needsGesture ? (
          <button
            type="button"
            className="business-app-btn business-app-btn-cta business-app-focus-ring"
            data-testid="biz-point-enable-music"
            onClick={() => void player?.toggle()}
          >
            {ENABLE_MUSIC_LABEL}
          </button>
        ) : (
          <button
            type="button"
            className="business-app-btn business-app-btn-primary business-app-focus-ring"
            data-testid="biz-point-toggle"
            onClick={() => void player?.toggle()}
          >
            {playing ? "Пауза" : "Играть"}
          </button>
        )}
        <button
          type="button"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          disabled={!player?.canChangeMusic}
          data-testid="biz-point-next"
          onClick={() => void player?.next()}
        >
          Следующий трек
        </button>
      </div>
    </section>
  );
}
