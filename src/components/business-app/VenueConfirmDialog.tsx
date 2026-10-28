"use client";

export default function VenueConfirmDialog({
  text,
  onYes,
  onNo,
}: {
  text: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="business-app-card space-y-3" role="dialog" aria-modal="true" data-testid="biz-venue-confirm">
      <p className="text-[1.05rem] text-[var(--biz-text)]">{text}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="business-app-btn business-app-btn-primary business-app-focus-ring" onClick={onYes} data-testid="biz-venue-confirm-yes">
          Да
        </button>
        <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring" onClick={onNo} data-testid="biz-venue-confirm-no">
          Отмена
        </button>
      </div>
    </div>
  );
}
