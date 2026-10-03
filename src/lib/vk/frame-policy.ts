/** Official VK web origins that frame Mini Apps. No app-alias imports: next.config loads this file. */
export const VK_OFFICIAL_FRAME_ANCESTORS = [
  "https://vk.com",
  "https://m.vk.com",
  "https://vk.ru",
  "https://m.vk.ru",
] as const;

export function buildVkFrameAncestorsPolicy(): string {
  return `frame-ancestors 'self' ${VK_OFFICIAL_FRAME_ANCESTORS.join(" ")}`;
}
