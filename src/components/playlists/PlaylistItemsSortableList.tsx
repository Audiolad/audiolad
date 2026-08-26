"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, type ReactNode } from "react";

import { PlaylistItemDragHandle } from "@/components/playlists/PlaylistItemDragHandle";
import { playlistItemKey } from "@/lib/playlists/playlist-item-identity";

export type PlaylistSortableIdentity = {
  practiceId: string;
  audioItemId?: string | null;
};

export type PlaylistItemsSortableRenderContext<T> = {
  item: T;
  index: number;
  dragHandle: ReactNode;
  isDragging: boolean;
};

export type PlaylistItemsSortableListProps<T extends PlaylistSortableIdentity> = {
  items: T[];
  disabled?: boolean;
  className?: string;
  onReorder: (payload: { fromIndex: number; toIndex: number; item: T }) => void;
  renderRow: (context: PlaylistItemsSortableRenderContext<T>) => ReactNode;
};

function itemId(item: PlaylistSortableIdentity): string {
  return playlistItemKey(item.practiceId, item.audioItemId);
}

function SortablePlaylistItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: (args: { dragHandle: ReactNode; isDragging: boolean }) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id, disabled });

  const dragHandle = (
    <PlaylistItemDragHandle
      ref={setActivatorNodeRef}
      disabled={disabled}
      isDragging={isDragging}
      attributes={attributes}
      listeners={disabled ? undefined : listeners}
    />
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`relative ${isDragging ? "z-10 opacity-40" : ""}`}
      data-playlist-sortable-id={id}
      data-playlist-drop-target={isOver && !isDragging ? "true" : undefined}
    >
      {isOver && !isDragging ? (
        <div
          className="pointer-events-none absolute inset-x-3 -top-0.5 z-20 h-0.5 rounded-full bg-[#7042c5]"
          aria-hidden
        />
      ) : null}
      {children({ dragHandle, isDragging })}
    </div>
  );
}

export default function PlaylistItemsSortableList<
  T extends PlaylistSortableIdentity,
>({
  items,
  disabled = false,
  className,
  onReorder,
  renderRow,
}: PlaylistItemsSortableListProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );
  const ids = items.map(itemId);
  const activeIndex = activeId ? ids.indexOf(activeId) : -1;
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null;
  const dragDisabled = disabled || items.length < 2;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id || dragDisabled) {
      return;
    }

    const fromIndex = ids.indexOf(String(active.id));
    const toIndex = ids.indexOf(String(over.id));
    const item = items[fromIndex];

    if (fromIndex < 0 || toIndex < 0 || !item) {
      return;
    }

    onReorder({ fromIndex, toIndex, item });
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>
        {items.map((item, index) => {
          const id = itemId(item);

          return (
            <SortablePlaylistItem key={id} id={id} disabled={dragDisabled}>
              {({ dragHandle, isDragging }) =>
                renderRow({
                  item,
                  index,
                  dragHandle,
                  isDragging,
                })
              }
            </SortablePlaylistItem>
          );
        })}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeItem ? (
          <div className="rounded-[16px] shadow-[0_12px_28px_rgba(91,62,145,0.18)]">
            {renderRow({
              item: activeItem,
              index: activeIndex,
              dragHandle: <PlaylistItemDragHandle isDragging />,
              isDragging: true,
            })}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
