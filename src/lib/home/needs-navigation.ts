export type HomeNeedItem = {
  id: string;
  title: string;
  href: string;
};

export const HOME_NEED_ITEMS: HomeNeedItem[] = [
  { id: "relax", title: "Расслабиться", href: "/catalog?need=relax" },
  { id: "restore", title: "Восстановить силы", href: "/catalog?need=restore" },
  { id: "sleep", title: "Лучше спать", href: "/catalog?need=sleep" },
  {
    id: "confidence",
    title: "Почувствовать уверенность",
    href: "/catalog?need=confidence",
  },
  { id: "relationships", title: "Отношения", href: "/catalog?need=relationships" },
  { id: "abundance", title: "Изобилие", href: "/catalog?need=abundance" },
  { id: "knowledge", title: "Новые знания", href: "/catalog?need=knowledge" },
  {
    id: "programs",
    title: "Программы по шагам",
    href: "/catalog?need=programs",
  },
];
