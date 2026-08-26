export const MEDITATION_SOLUTIONS_PUBLIC_PATH =
  "/p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy";

export const MEDITATION_SOLUTIONS_PRACTICE_SLUG = "25-meditation-solutions";

export const MEDITATION_SOLUTIONS_IMAGE_DIR =
  "/products/25-meditation-solutions";

export const MEDITATION_SOLUTIONS_HERO_IMAGE = `${MEDITATION_SOLUTIONS_IMAGE_DIR}/hero.jpg`;

export const MEDITATION_SOLUTIONS_H1 =
  "25 готовых решений для создания своих медитаций";

export const MEDITATION_SOLUTIONS_SUBTITLE =
  "Как создать свою медитацию с нуля: выбрать тему, написать текст для медитации, записать медитацию самостоятельно, добавить музыку и получить готовый MP3.";

export const MEDITATION_SOLUTIONS_OFFER_LINE =
  "25 готовых тем, текстов, шаблонов, инструкций и практических инструментов – от первой идеи до готовой медитации с голосом и музыкой.";

export const MEDITATION_SOLUTIONS_SEO_TITLE =
  "25 готовых решений для создания своих медитаций | АудиоЛад";

export const MEDITATION_SOLUTIONS_SEO_DESCRIPTION =
  MEDITATION_SOLUTIONS_SUBTITLE;

export const MEDITATION_SOLUTIONS_BASE_PRICE_RUB = 4999;
export const MEDITATION_SOLUTIONS_SALE_PRICE_RUB = 499;
export const MEDITATION_SOLUTIONS_TIMER_SECONDS = 20 * 60;
export const MEDITATION_SOLUTIONS_TIMER_CAPTION = "Предложение действует ещё:";
export const MEDITATION_SOLUTIONS_TIMER_UNIT = "мин.";
export const MEDITATION_SOLUTIONS_ONCE_NOTE =
  "Это предложение показывается вам один раз. После окончания таймера продукт останется доступен по полной цене 4 999 ₽.";
export const MEDITATION_SOLUTIONS_BUY_LABEL = "Купить";
export const MEDITATION_SOLUTIONS_BONUS_BADGE = "БОНУС";

export const MEDITATION_SOLUTIONS_FORBIDDEN_PHRASE = "своей медитации";

export type MeditationSolutionsPractice = {
  id: string;
  slug: string;
  authorId: string | null;
  basePrice: number | null;
};

export const MEDITATION_SOLUTIONS_CARD_FORMATS = [
  "PDF + аудио",
  "PDF",
  "Аудио",
  "Аудио + PDF",
] as const;

export type MeditationSolutionsCardFormat =
  (typeof MEDITATION_SOLUTIONS_CARD_FORMATS)[number];

export type MeditationSolutionsCard = {
  id: string;
  imageSrc: string;
  title: string;
  description: string;
  format: MeditationSolutionsCardFormat;
  bonus?: boolean;
};

export const MEDITATION_SOLUTIONS_CARDS: readonly MeditationSolutionsCard[] = [
  {
    id: "item-01",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-01.jpg`,
    title: "1. Как сделать медитацию: пошаговый план от идеи до готового MP3",
    description:
      "Пошаговая карта всего процесса – от первой идеи до готовой записи с голосом и музыкой.",
    format: "PDF + аудио",
  },
  {
    id: "item-02",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-02.jpg`,
    title: "2. Как создать свою медитацию: 50 готовых тем",
    description:
      "50 идей для медитаций, чтобы быстро выбрать тему и начать создавать свою практику.",
    format: "PDF",
  },
  {
    id: "item-03",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-03.jpg`,
    title: "3. Текст для медитации: готовая структура из 7 частей",
    description:
      "Готовый каркас, который помогает собрать текст медитации от вступления до завершения.",
    format: "PDF",
  },
  {
    id: "item-04",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-04.jpg`,
    title: "4. Как написать текст для медитации: пошаговый конструктор",
    description:
      "Последовательно соберите собственный сценарий, даже если раньше никогда не писали медитации.",
    format: "PDF",
  },
  {
    id: "item-05",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-05.jpg`,
    title: "5. Паспорт будущей медитации: готовый шаблон",
    description:
      "Определите тему, аудиторию, результат, настроение, голос и музыку ещё до начала записи.",
    format: "PDF",
  },
  {
    id: "item-06",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-06.jpg`,
    title: "6. 20 готовых начал для текста медитации",
    description:
      "Готовые варианты первых фраз, чтобы красиво и естественно начать свою медитацию.",
    format: "PDF",
  },
  {
    id: "item-07",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-07.jpg`,
    title: "7. Как записать медитацию самостоятельно",
    description:
      "Простая инструкция для самостоятельной записи без сложной студии и лишнего оборудования.",
    format: "Аудио",
  },
  {
    id: "item-08",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-08.jpg`,
    title: "8. Как записать медитацию голосом",
    description:
      "Как говорить естественно, спокойно и убедительно, не превращая практику в чтение текста.",
    format: "Аудио",
  },
  {
    id: "item-09",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-09.jpg`,
    title: "9. Как записать медитацию с музыкой",
    description:
      "Как соединить голос и музыкальный фон и получить цельную готовую аудиопрактику.",
    format: "Аудио",
  },
  {
    id: "item-10",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-10.jpg`,
    title: "10. Музыка для записи медитаций: как выбрать правильный фон",
    description:
      "Разберитесь, какая музыка поддерживает голос и атмосферу, а какая начинает мешать практике.",
    format: "PDF",
  },
  {
    id: "item-11",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-11.jpg`,
    title: "11. 10 красивых способов завершить медитацию",
    description:
      "Готовые варианты мягкого завершения практики и возвращения слушателя к обычному состоянию.",
    format: "PDF",
  },
  {
    id: "item-12",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-12.jpg`,
    title: "12. Как создать и записать свою медитацию в Студии АудиоЛад",
    description:
      "Практический путь от записи голоса до готового MP3 прямо в Студии АудиоЛада.",
    format: "Аудио + PDF",
  },
  {
    id: "item-13",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-13.jpg`,
    title: "13. 30 готовых названий для медитаций",
    description:
      "Примеры и формулы, которые помогут быстро придумать понятное и привлекательное название.",
    format: "PDF",
  },
  {
    id: "item-14",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-14.jpg`,
    title: "14. Формула сильной темы для медитации",
    description:
      "Превратите общую идею в конкретную тему с понятным состоянием и результатом для слушателя.",
    format: "PDF",
  },
  {
    id: "item-15",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-15.jpg`,
    title: "15. Аффирмации для медитации: готовые формулы и примеры",
    description:
      "Готовые конструкции и примеры, которые можно адаптировать под разные темы медитаций.",
    format: "PDF",
  },
  {
    id: "item-16",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-16.jpg`,
    title: "16. Конструктор основной части медитации",
    description:
      "Соберите центральную часть практики из понятных элементов и не теряйте логику сценария.",
    format: "PDF",
  },
  {
    id: "item-17",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-17.jpg`,
    title: "17. Медитация «из точки А в точку Б»: готовая формула результата",
    description:
      "Определите исходное и желаемое состояние слушателя и постройте практику между ними.",
    format: "PDF",
  },
  {
    id: "item-18",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-18.jpg`,
    title: "18. 10 форматов медитаций и аудиопрактик, которые можно создавать",
    description:
      "Выберите подходящий формат – от классической медитации до визуализации, настроя и аудиопрактики.",
    format: "PDF",
  },
  {
    id: "item-19",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-19.jpg`,
    title: "19. 15 способов быстро расслабить человека в начале медитации",
    description:
      "Готовые приёмы для дыхания, внимания и расслабления, которые можно использовать во вступлении.",
    format: "Аудио + PDF",
  },
  {
    id: "item-20",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-20.jpg`,
    title: "20. Конструктор визуализации для медитации",
    description:
      "Создавайте образы, пространства и внутренние путешествия по простой готовой структуре.",
    format: "PDF",
  },
  {
    id: "item-21",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-21.jpg`,
    title: "21. Как подготовить голос к записи медитации за 5 минут",
    description:
      "Короткая подготовка перед записью, чтобы голос звучал свободнее, спокойнее и естественнее.",
    format: "Аудио",
  },
  {
    id: "item-22",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-22.jpg`,
    title: "22. 5 вариантов голоса и интонации для разных медитаций",
    description:
      "Сравните разные способы подачи и подберите интонацию под тему и настроение своей практики.",
    format: "Аудио",
  },
  {
    id: "item-23",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-23.jpg`,
    title: "23. Как записать чистый голос для медитации",
    description:
      "Практические настройки записи, которые помогают получить более аккуратный и понятный голос.",
    format: "PDF",
  },
  {
    id: "item-24",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-24.jpg`,
    title: "24. Голос и музыка в медитации: формула правильного баланса",
    description:
      "Настройте соотношение голоса и музыки так, чтобы фон создавал атмосферу и не перекрывал слова.",
    format: "Аудио",
  },
  {
    id: "item-25",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/item-25.jpg`,
    title: "25. Как из одной медитации создать серию из 7 аудиопрактик",
    description:
      "Превратите одну удачную тему в целую последовательность взаимосвязанных аудиопрактик.",
    format: "PDF",
  },
  {
    id: "bonus-26",
    imageSrc: `${MEDITATION_SOLUTIONS_IMAGE_DIR}/bonus-26.jpg`,
    title:
      "Бонус. Как использовать медитации и аудиопрактики для привлечения клиентов",
    description:
      "15 готовых способов встроить аудио в свою работу, продвижение, консультации, программы и продукты.",
    format: "PDF + аудио",
    bonus: true,
  },
] as const;

export function assertMeditationSolutionsCopyLock(value: string): boolean {
  return !value.includes(MEDITATION_SOLUTIONS_FORBIDDEN_PHRASE);
}
