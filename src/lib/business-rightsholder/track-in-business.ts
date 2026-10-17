/** Business grant row as read for the status screen. */
export type BusinessGrantLayerRow = {
  audio_item_id: string;
  rights_layer: string;
  valid_from: string | null;
  valid_until: string | null;
};

/**
 * Tracks that are «В АудиоЛад Бизнес»: BOTH layers (recording + composition) have a live grant
 * that is valid now (valid_from ≤ now < valid_until). Rows must already be verified and not ceased.
 */
export function tracksLiveInBusiness(rows: readonly BusinessGrantLayerRow[], now: Date = new Date()): Set<string> {
  const nowMs = now.getTime();
  const layers = new Map<string, Set<string>>();
  for (const g of rows) {
    if (g.valid_from && Date.parse(g.valid_from) > nowMs) continue;
    if (g.valid_until && Date.parse(g.valid_until) <= nowMs) continue;
    const id = String(g.audio_item_id);
    if (!layers.has(id)) layers.set(id, new Set());
    layers.get(id)!.add(g.rights_layer);
  }
  return new Set([...layers].filter(([, l]) => l.has("recording") && l.has("composition")).map(([id]) => id));
}
