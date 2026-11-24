/**
 * t1666u (Sergey 24.11.2026 11:20): three key benefits on the guest first screen for Yandex Direct
 * traffic. Wording follows the coffee legal section («Правовая информация»): rights come directly from the
 * rightsholder, the offer collects nothing for rights organizations, and a claim is answered by us.
 * No promise that a claim can never come – only that we defend the venue.
 * «Без повторов» follows the hall queue: recently played tracks go to the back of a new mix
 * (cafe-queue/auto-topup.ts) and the queue tops itself up.
 */
export const GUEST_COFFEE_BENEFITS = [
  {
    id: "legal",
    title: "Полностью легально",
    text: "Без платежей РАО и ВОИС. Права – напрямую от правообладателя, при претензии защищаем заведение.",
  },
  {
    id: "no-repeats",
    title: "Без надоедливых повторов",
    text: "Очередь обновляется сама, недавние треки уходят в конец.",
  },
  {
    id: "coffee",
    title: "Под атмосферу кофейни",
    text: "Музыка подобрана для кофеен и включается в пару нажатий.",
  },
] as const;

/** t1667u (Sergey 24.11.2026 11:22): guest footer with the five legal section pages. */
export const GUEST_COFFEE_LEGAL_FOOTER_TITLE = "Документы";
