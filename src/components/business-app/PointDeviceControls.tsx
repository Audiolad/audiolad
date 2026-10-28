"use client";

import { useCabinetPlayerOptional } from "@/components/business-app/workspace/BusinessCabinetPlayer";

/** On the paired device the buttons act at once. There is no remote confirm. */
export default function PointDeviceControls() {
  const player = useCabinetPlayerOptional();
  const playing = player?.view.status === "playing" || player?.view.status === "loading";
  return (
    <section className="business-app-card space-y-3" data-testid="biz-point-controls" aria-label="Плеер в зале">
      <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Музыка в зале</h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        Кнопки действуют на это устройство сразу.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="business-app-btn business-app-btn-primary business-app-focus-ring"
          data-testid="biz-point-toggle"
          onClick={() => void player?.toggle()}
        >
          {playing ? "Пауза" : "Играть"}
        </button>
        <button
          type="button"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          data-testid="biz-point-next"
          onClick={() => void player?.next()}
        >
          Следующий трек
        </button>
      </div>
    </section>
  );
}
