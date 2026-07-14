"use client";

type AudioDragHandleProps = {
  disabled?: boolean;
  isDragging?: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

function DragHandleIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="7" cy="6" r="1.4" />
      <circle cx="13" cy="6" r="1.4" />
      <circle cx="7" cy="10" r="1.4" />
      <circle cx="13" cy="10" r="1.4" />
      <circle cx="7" cy="14" r="1.4" />
      <circle cx="13" cy="14" r="1.4" />
    </svg>
  );
}

export function AudioDragHandle({
  disabled = false,
  isDragging = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: AudioDragHandleProps) {
  return (
    <button
      type="button"
      aria-label="Перетащить аудио"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={`flex shrink-0 items-center justify-center rounded-[12px] border border-[#d9c9ef] bg-white px-2 py-2 text-[#8c79b6] transition touch-none select-none ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing"
      } ${isDragging ? "border-[#9a74d8] bg-[#f3ebff] text-[#7042c5] shadow-sm" : ""}`}
    >
      <DragHandleIcon />
    </button>
  );
}
