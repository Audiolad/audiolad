import type { ProfileApplicationVariant } from "@/lib/author-applications/types";
import { BECOME_AUTHOR_HREF } from "@/lib/profile/constants";

export function getProfileApplicationCopy(variant: ProfileApplicationVariant): {
  heading: string;
  description: string;
  ctaLabel: string | null;
  ctaHref: string | null;
} {
  switch (variant) {
    case "draft":
      return {
        heading: "Стать автором АудиоЛада",
        description: "Заявка автора не отправлена. Вы начали заполнять заявку.",
        ctaLabel: "Продолжить",
        ctaHref: BECOME_AUTHOR_HREF,
      };
    case "submitted":
      return {
        heading: "Стать автором АудиоЛада",
        description: "Заявка автора отправлена.",
        ctaLabel: "Посмотреть заявку",
        ctaHref: BECOME_AUTHOR_HREF,
      };
    case "in_review":
      return {
        heading: "Стать автором АудиоЛада",
        description: "Заявка автора рассматривается.",
        ctaLabel: "Посмотреть статус",
        ctaHref: BECOME_AUTHOR_HREF,
      };
    case "needs_changes":
      return {
        heading: "Стать автором АудиоЛада",
        description: "Нужно уточнить заявку автора.",
        ctaLabel: "Дополнить заявку",
        ctaHref: BECOME_AUTHOR_HREF,
      };
    case "approved_pending_access":
      return {
        heading: "Стать автором АудиоЛада",
        description: "Заявка автора одобрена. Мы готовим доступ к кабинету.",
        ctaLabel: null,
        ctaHref: null,
      };
    case "rejected":
      return {
        heading: "Стать автором АудиоЛада",
        description: "Статус заявки автора.",
        ctaLabel: "Посмотреть решение",
        ctaHref: BECOME_AUTHOR_HREF,
      };
    default:
      return {
        heading: "Стать автором АудиоЛада",
        description:
          "Создавайте аудиопрактики и программы, находите слушателей и развивайте своё авторское направление.",
        ctaLabel: "Узнать, как стать автором",
        ctaHref: BECOME_AUTHOR_HREF,
      };
  }
}
