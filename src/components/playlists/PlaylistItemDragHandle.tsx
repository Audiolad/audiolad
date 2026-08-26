"use client";

import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { forwardRef } from "react";

type PlaylistItemDragHandleProps = {
  disabled?: boolean;
  isDragging?: boolean;
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
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

export const PlaylistItemDragHandle = forwardRef<
  HTMLButtonElement,
  PlaylistItemDragHandleProps
>(function PlaylistItemDragHandle(
  { disabled = false, isDragging = false, attributes, listeners },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-playlist-drag-handle="true"
      aria-label="Перетащить"
      disabled={disabled}
      {...attributes}
      {...listeners}
      onPointerDown={(event) => {
        event.stopPropagation();
        listeners?.onPointerDown?.(event);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className={`flex h-10 w-8 shrink-0 items-center justify-center rounded-[12px] text-[#8c79b6] transition touch-none select-none ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : "cursor-grab active:cursor-grabbing"
      } ${isDragging ? "bg-[#f3ebff] text-[#7042c5]" : ""}`}
    >
      <DragHandleIcon />
    </button>
  );
});
