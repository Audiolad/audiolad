import type { Metadata } from "next";

/** VK entry must not become an indexable page. */
export function buildVkPageMetadata(): Metadata {
  return {
    title: "АудиоЛад",
    description: "Музыка, медитации, аудиопрактики и аудиокурсы",
    robots: {
      index: false,
      follow: false,
      noarchive: true,
    },
    alternates: {
      canonical: "https://audiolad.ru/vk",
    },
  };
}
