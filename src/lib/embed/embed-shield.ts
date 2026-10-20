export type EmbedRect = { x: number; y: number; width: number; height: number };

export function computeEmbedShield(
  viewport: { width: number; height: number },
  controls: EmbedRect[],
  pad = 4,
): EmbedRect[] {
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
      viewport.width <= 0 || viewport.height <= 0) return [];
  const width = Math.floor(viewport.width);
  const height = Math.floor(viewport.height);
  if (width <= 0 || height <= 0) return [];
  const padding = Number.isFinite(pad) ? Math.max(0, pad) : 4;
  const holes = controls.flatMap((rect) => {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
        rect.width <= 0 || rect.height <= 0) return [];
    // Round holes outwards before splitting, so integer shields never cover a control.
    const left = Math.max(0, Math.min(width, Math.floor(rect.x - padding)));
    const top = Math.max(0, Math.min(height, Math.floor(rect.y - padding)));
    const right = Math.max(0, Math.min(width, Math.ceil(rect.x + rect.width + padding)));
    const bottom = Math.max(0, Math.min(height, Math.ceil(rect.y + rect.height + padding)));
    return right > left && bottom > top ? [{ left, top, right, bottom }] : [];
  });
  const edges = [...new Set([0, height, ...holes.flatMap(({ top, bottom }) => [top, bottom])])]
    .sort((a, b) => a - b);
  const result: EmbedRect[] = [];
  let previous = new Map<string, EmbedRect>();
  for (let i = 0; i < edges.length - 1; i++) {
    const top = edges[i];
    const bottom = edges[i + 1];
    const intervals = holes.filter((hole) => hole.top < bottom && hole.bottom > top)
      .sort((a, b) => a.left - b.left);
    const current = new Map<string, EmbedRect>();
    const add = (left: number, right: number) => {
      if (right <= left || bottom <= top) return;
      const key = `${left}:${right - left}`;
      const prior = previous.get(key);
      const rect = prior ?? { x: left, y: top, width: right - left, height: 0 };
      rect.height += bottom - top;
      if (!prior) result.push(rect);
      current.set(key, rect);
    };
    let left = 0;
    for (const hole of intervals) {
      add(left, hole.left);
      left = Math.max(left, hole.right);
    }
    add(left, width);
    previous = current;
  }
  return result.sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 16);
}
