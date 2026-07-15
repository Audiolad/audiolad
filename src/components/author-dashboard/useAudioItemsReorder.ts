"use client";

import { useCallback, useRef, useState } from "react";

import { mergeServerAudioItems } from "@/lib/author-products/form-merge";
import type { AudioItemRow, AuthorProductDetail } from "@/lib/author-products/types";

const REORDER_ERROR_MESSAGE = "Не удалось изменить порядок аудио.";

type UseAudioItemsReorderOptions = {
  practiceId: string | null;
  audioItems: AudioItemRow[];
  setAudioItems: React.Dispatch<React.SetStateAction<AudioItemRow[]>>;
};

function withSequentialPositions(items: AudioItemRow[]): AudioItemRow[] {
  return items.map((item, index) => ({
    ...item,
    position: index + 1,
  }));
}

function reorderByIndices(
  items: AudioItemRow[],
  fromIndex: number,
  toIndex: number,
): AudioItemRow[] {
  if (fromIndex === toIndex) {
    return items;
  }

  const nextOrder = [...items];
  const [moved] = nextOrder.splice(fromIndex, 1);
  nextOrder.splice(toIndex, 0, moved);

  return withSequentialPositions(nextOrder);
}

function findDropIndex(
  clientY: number,
  items: AudioItemRow[],
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

export function useAudioItemsReorder({
  practiceId,
  audioItems,
  setAudioItems,
}: UseAudioItemsReorderOptions) {
  const [reorderNotice, setReorderNotice] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [draggingAudioId, setDraggingAudioId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const reorderInFlightRef = useRef(false);
  const itemElementsRef = useRef(new Map<string, HTMLElement>());
  const dragStateRef = useRef<{
    audioId: string;
    fromIndex: number;
    pointerId: number;
  } | null>(null);

  const setItemElement = useCallback((audioId: string, element: HTMLElement | null) => {
    if (!element) {
      itemElementsRef.current.delete(audioId);
      return;
    }

    itemElementsRef.current.set(audioId, element);
  }, []);

  const applyAudioReorder = useCallback(
    async (nextOrder: AudioItemRow[]) => {
      if (reorderInFlightRef.current) {
        return false;
      }

      const previousOrder = audioItems;
      const optimisticOrder = withSequentialPositions(nextOrder);

      reorderInFlightRef.current = true;
      setReorderBusy(true);
      setReorderNotice(null);
      setAudioItems(optimisticOrder);

      if (!practiceId) {
        reorderInFlightRef.current = false;
        setReorderBusy(false);
        return true;
      }

      try {
        const response = await fetch(
          `/api/author/products/${practiceId}/audio/reorder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order: optimisticOrder.map((item) => item.id),
            }),
          },
        );

        const payload = (await response.json()) as {
          product?: AuthorProductDetail;
        };

        if (!response.ok || !payload.product) {
          setAudioItems(previousOrder);
          setReorderNotice(REORDER_ERROR_MESSAGE);
          return false;
        }

        setAudioItems((current) =>
          mergeServerAudioItems(current, payload.product!.audio_items),
        );
        return true;
      } catch {
        setAudioItems(previousOrder);
        setReorderNotice(REORDER_ERROR_MESSAGE);
        return false;
      } finally {
        reorderInFlightRef.current = false;
        setReorderBusy(false);
      }
    },
    [audioItems, practiceId, setAudioItems],
  );

  const moveAudioItem = useCallback(
    async (audioId: string, direction: "up" | "down") => {
      const index = audioItems.findIndex((item) => item.id === audioId);

      if (index < 0) {
        return;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= audioItems.length) {
        return;
      }

      await applyAudioReorder(reorderByIndices(audioItems, index, targetIndex));
    },
    [applyAudioReorder, audioItems],
  );

  const resetDragState = useCallback(() => {
    dragStateRef.current = null;
    setDraggingAudioId(null);
    setDragOverIndex(null);
  }, []);

  const handleDragPointerDown = useCallback(
    (audioId: string, event: React.PointerEvent<HTMLButtonElement>) => {
      if (reorderInFlightRef.current) {
        return;
      }

      const fromIndex = audioItems.findIndex((item) => item.id === audioId);

      if (fromIndex < 0) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      dragStateRef.current = {
        audioId,
        fromIndex,
        pointerId: event.pointerId,
      };
      setDraggingAudioId(audioId);
      setDragOverIndex(fromIndex);
      setReorderNotice(null);
    },
    [audioItems],
  );

  const handleDragPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const dragState = dragStateRef.current;

      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      const nextDropIndex = findDropIndex(
        event.clientY,
        audioItems,
        itemElementsRef.current,
      );

      setDragOverIndex(nextDropIndex);
    },
    [audioItems],
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
        audioItems,
        itemElementsRef.current,
      );

      resetDragState();

      if (fromIndex === toIndex) {
        return;
      }

      await applyAudioReorder(reorderByIndices(audioItems, fromIndex, toIndex));
    },
    [applyAudioReorder, audioItems, resetDragState],
  );

  const handleDragPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      void finishDrag(event);
    },
    [finishDrag],
  );

  const handleDragPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      resetDragState();
    },
    [resetDragState],
  );

  return {
    applyAudioReorder,
    moveAudioItem,
    reorderNotice,
    reorderBusy,
    draggingAudioId,
    dragOverIndex,
    setItemElement,
    handleDragPointerDown,
    handleDragPointerMove,
    handleDragPointerUp,
    handleDragPointerCancel,
  };
}
