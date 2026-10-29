/**
 * Owner slides for the coffee pilot carousel, in carousel order.
 * The only external URL allowed on the pilot page.
 */
export const FOUR_CUPS_MAX_HREF = "https://max-potok.ru/r/gqwvf";

export const FOUR_CUPS_MAX_LABEL = "Выбрать чашку и узнать характер кофейни в MAX";

export const FOUR_CUPS_SLIDES = [
  {
    src: "/images/b/coffee/four-cups/01-intro.jpg",
    alt: "Обложка «Четыре чашки»: зёрна кофе, белые цветы и вопрос, какой характер у вашей кофейни.",
  },
  {
    src: "/images/b/coffee/four-cups/02-cup-1.jpg",
    alt: "Чашка 1: светлая керамическая кружка с латте-артом в форме сердца, рядом сухоцветы и кофейные зёрна.",
  },
  {
    src: "/images/b/coffee/four-cups/03-cup-2.jpg",
    alt: "Чашка 2: тёмно-зелёный бумажный стакан с чёрной крышкой на каменной столешнице.",
  },
  {
    src: "/images/b/coffee/four-cups/04-cup-3.jpg",
    alt: "Чашка 3: белая фарфоровая чашка с золотым ободком и блюдцем на тёмном мраморе.",
  },
  {
    src: "/images/b/coffee/four-cups/05-cup-4.jpg",
    alt: "Чашка 4: керамическая кружка с голубой глазурью и коричневым низом, латте с сердечком.",
  },
  {
    src: "/images/b/coffee/four-cups/06-all-cups.jpg",
    alt: "Все четыре чашки рядом: светлая кружка, зелёный стакан, фарфор с золотом и голубая керамика.",
  },
  {
    src: "/images/b/coffee/four-cups/07-final.jpg",
    alt: "Финал «Четыре чашки»: вопрос, какую чашку вы выбрали, и приглашение нажать кнопку ниже.",
  },
] as const;

/** The single picture of the bottom block: all four cups side by side. */
export const FOUR_CUPS_FINAL_IMAGE = {
  src: "/images/b/coffee/four-cups/06-all-cups.jpg",
  alt: "Кофе в зёрнах для кофейни – четыре чашки, четыре характера: светлая кружка, зелёный стакан, фарфор с золотом и голубая керамика.",
} as const;
