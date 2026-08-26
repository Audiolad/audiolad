"use client";

import { useCallback, useRef, useState } from "react";

function reorderByIndices<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (fromIndex === toIndex) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function findDropIndex<T extends { id: string }>(
  clientY: number,
  items: readonly T[],
  itemElements: Map<string, HTMLElement>,
): number {
  for (const [index, item] of items.entries()) {
    const element = itemElements.get(item.id);

    if (!element) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    if (clientY < midpoint) {
      return index;
    }
  }

  return Math.max(items.length - 1, 0);
}

type UsePointerReorderOptions<T extends { id: string }> = {
  items: readonly T[];
  disabled?: boolean;
  onReorder: (next: T[]) => void | Promise<void>;
};

export function usePointerReorder<T extends { id: string }>({
  items,
  disabled = false,
  onReorder,
}: UsePointerReorderOptions<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const itemElementsRef = useRef(new Map<string, HTMLElement>());
  const dragStateRef = useRef<{
    id: string;
    fromIndex: number;
    pointerId: number;
  } | null>(null);
  const inFlightRef = useRef(false);

  const setItemElement = useCallback((id: string, element: HTMLElement | null) => {
    if (!element) {
      itemElementsRef.current.delete(id);
      return;
    }

    itemElementsRef.current.set(id, element);
  }, []);

  const resetDragState = useCallback(() => {
    dragStateRef.current = null;
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverIndex(null);
  }, []);

  const handlePointerDown = useCallback(
    (id: string, event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || inFlightRef.current) {
        return;
      }

      const fromIndex = items.findIndex((item) => item.id === id);

      if (fromIndex < 0) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        id,
        fromIndex,
        pointerId: event.pointerId,
      };
      draggingIdRef.current = id;
      setDraggingId(id);
      setDragOverIndex(fromIndex);
    },
    [disabled, items],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;

      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      setDragOverIndex(
        findDropIndex(event.clientY, items, itemElementsRef.current),
      );
    },
    [items],
  );

  const finishDrag = useCallback(
    async (event: React.PointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;

      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const fromIndex = dragState.fromIndex;
      const toIndex = findDropIndex(
        event.clientY,
        items,
        itemElementsRef.current,
      );

      resetDragState();

      if (fromIndex === toIndex) {
        return;
      }

      inFlightRef.current = true;

      try {
        await onReorder(reorderByIndices(items, fromIndex, toIndex));
      } finally {
        inFlightRef.current = false;
      }
    },
    [items, onReorder, resetDragState],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      void finishDrag(event);
    },
    [finishDrag],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      resetDragState();
    },
    [resetDragState],
  );

  return {
    draggingId,
    draggingIdRef,
    dragOverIndex,
    setItemElement,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
