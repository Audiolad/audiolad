/**
 * Permanent (301) redirects of retired vertical guide URLs. Dependency-free on purpose:
 * next.config.ts imports this file directly.
 *
 * /b/coffee/muzyka-dlya-kofeyni was the pilot reference article. It was rebuilt as
 * «Кофе в зёрнах для кофейни» and its address changed with the topic.
 */
export const VERTICAL_GUIDE_LEGACY_REDIRECTS: ReadonlyArray<{ source: string; destination: string }> = [
  { source: "/b/coffee/muzyka-dlya-kofeyni", destination: "/b/coffee/kofe-v-zernah-dlya-kofeyni" },
];

export function buildVerticalGuideRedirects() {
  return VERTICAL_GUIDE_LEGACY_REDIRECTS.map(({ source, destination }) => ({
    source,
    destination,
    statusCode: 301 as const,
  }));
}
