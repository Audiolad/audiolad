/**
 * Partner origins allowed to frame /embed/* pages. Plain module: next.config imports it.
 * Adding an origin here is the only way to allow framing; everything else stays 'self'.
 */
export const EMBED_FRAME_ANCESTORS = [
  "https://sergey-zoya.ru",
  "https://www.sergey-zoya.ru",
] as const;

export function buildEmbedFrameAncestorsPolicy(): string {
  return `frame-ancestors 'self' ${EMBED_FRAME_ANCESTORS.join(" ")}`;
}
