export type SchoolGetCourseTariffId = "standard" | "premium" | "vip";

export const GETCOURSE_WIDGETS = {
  standard: {
    widgetId: "1639253",
    scriptId: "45c8fbc8c7b622917c3912fa89eec54b9ad0bc93",
    src: "https://petrovss.pro/pl/lite/widget/script?id=1639253",
    label: "Стандарт",
  },
  premium: {
    widgetId: "1639262",
    scriptId: "df873123c3e713653a0796e39dd5ab13ff65be2c",
    src: "https://petrovss.pro/pl/lite/widget/script?id=1639262",
    label: "Премиум",
  },
  vip: {
    widgetId: "1639263",
    scriptId: "627554c9e9ce85b4380209edd9c93aa0d80c2f00",
    src: "https://petrovss.pro/pl/lite/widget/script?id=1639263",
    label: "VIP",
  },
} as const;

export type SchoolGetCourseWidget = (typeof GETCOURSE_WIDGETS)[SchoolGetCourseTariffId];
