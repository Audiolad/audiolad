export type GraduateCarouselEdges = {
  overflow: boolean;
  canPrev: boolean;
  canNext: boolean;
};

/** Whether the row can scroll, and which ends are still hidden. */
export function graduateCarouselEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  tolerance = 2,
): GraduateCarouselEdges {
  const max = Math.max(0, scrollWidth - clientWidth);
  const overflow = max > tolerance;
  return {
    overflow,
    canPrev: overflow && scrollLeft > tolerance,
    canNext: overflow && scrollLeft < max - tolerance,
  };
}

/** One card plus the gap between cards, in the scroll direction. */
export function graduateCarouselStep(cardWidth: number, gap: number, direction: -1 | 1): number {
  return direction * (cardWidth + gap);
}
