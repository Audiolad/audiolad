import { buildAuthRouteHref } from "@/lib/auth/routes";
import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";

export const GUEST_HOME_INTRO =
  "АудиоЛад – платформа авторского аудио: медитации, аудиопрактики, музыка, аудиокурсы.";

export const GUEST_HOME_LISTEN_FREE_CTA = {
  label: "Начать слушать бесплатно",
  href: "/catalog?access=free",
} as const;

export type GuestHomeSlide = {
  id: string;
  src: `/images/home/guest-slider/${string}`;
  href: string;
  ariaLabel: string;
};

export const GUEST_HOME_SLIDES: readonly GuestHomeSlide[] = [
  {
    id: "01",
    src: "/images/home/guest-slider/01-audio-practices.webp",
    href: "/catalog",
    ariaLabel:
      "Слайд 1: Аудиопрактики на разные задачи. Сон, расслабление, энергия, внутреннее спокойствие, развитие и другие состояния.",
  },
  {
    id: "02",
    src: "/images/home/guest-slider/02-audio-practices.webp",
    href: "/catalog?access=free",
    ariaLabel:
      "Слайд 2: Начните бесплатно. Откройте бесплатные практики и начните знакомство с платформой без оплаты.",
  },
  {
    id: "03",
    src: "/images/home/guest-slider/03-audio-practices.webp",
    href: "/catalog?class=release",
    ariaLabel:
      "Слайд 3: Фоновая музыка. Музыка для сна, расслабления, работы, концентрации и спокойного фона.",
  },
  {
    id: "04",
    src: "/images/home/guest-slider/04-audio-practices.webp",
    href: "/playlists/catalog",
    ariaLabel:
      "Слайд 4: Готовые плейлисты. Собранные подборки для сна, расслабления, фона, ритуалов и ежедневного прослушивания.",
  },
  {
    id: "05",
    src: "/images/home/guest-slider/05-audio-practices.webp",
    href: "/catalog?access=paid",
    ariaLabel:
      "Слайд 5: Аудиокурсы и программы. Проходите аудиокурсы и программы последовательно, в удобном формате и в своём темпе.",
  },
  {
    id: "06",
    src: "/images/home/guest-slider/06-audio-practices.webp",
    href: buildAuthRouteHref("/auth/sign-up", "/my-practices"),
    ariaLabel:
      "Слайд 6: Своя аудиотека и загрузка своего аудио. Сохраняйте любимые практики и загружайте свою музыку, медитации и аудио в одно удобное место.",
  },
  {
    id: "07",
    src: "/images/home/guest-slider/07-audio-practices.webp",
    href: BECOME_AUTHOR_HREF,
    ariaLabel:
      "Слайд 7: Станьте автором АудиоЛада. Создавайте свои аудиопрактики, медитации, аудиокурсы и программы, публикуйте их на платформе и развивайте своё авторское пространство.",
  },
];
