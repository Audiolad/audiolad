export const UNCERTAIN_LABEL = "Не уверен";

export const COARSE_GENRES = [
  { id: "jazz", label: "Джаз" },
  { id: "lounge", label: "Лаунж" },
  { id: "ambient", label: "Эмбиент" },
  { id: "meditation", label: "Медитация" },
  { id: "sleep", label: "Музыка для сна" },
  { id: "classical", label: "Классика" },
  { id: "pop", label: "Поп" },
  { id: "electronic", label: "Электроника" },
  { id: "song", label: "Песня" },
  { id: "spoken", label: "Речь" },
  { id: "other", label: "Другое" },
  { id: "uncertain", label: UNCERTAIN_LABEL },
] as const;

export const STYLES = [
  { id: "smooth_jazz", label: "Smooth jazz" },
  { id: "lounge_jazz", label: "Lounge jazz" },
  { id: "spa", label: "Spa / массаж" },
  { id: "new_age", label: "New age" },
  { id: "ambient_pad", label: "Эмбиент-пэд" },
  { id: "piano_solo", label: "Соло фортепиано" },
  { id: "acoustic", label: "Акустика" },
  { id: "vocal_ballad", label: "Вокальная баллада" },
  { id: "spoken_word", label: "Разговорный голос" },
  { id: "energetic_pop", label: "Энергичный поп" },
  { id: "lofi", label: "Lo-fi" },
  { id: "orchestral", label: "Оркестр" },
] as const;

export const VOCAL_ROLES = [
  { id: "instrumental", label: "Инструментал" },
  { id: "vocal", label: "Вокал" },
  { id: "mixed", label: "Смешанное" },
  { id: "spoken", label: "Речь" },
  { id: "uncertain", label: UNCERTAIN_LABEL },
] as const;

export const INSTRUMENTS = [
  { id: "piano", label: "Фортепиано" },
  { id: "guitar", label: "Гитара" },
  { id: "bass", label: "Бас" },
  { id: "drums", label: "Ударные" },
  { id: "saxophone", label: "Саксофон" },
  { id: "strings", label: "Струнные" },
  { id: "synth", label: "Синтезатор" },
  { id: "flute", label: "Флейта" },
  { id: "voice", label: "Голос" },
  { id: "nature", label: "Природа и шумы" },
  { id: "other", label: "Другое" },
] as const;

export const MOODS = [
  { id: "calm", label: "Спокойное" },
  { id: "warm", label: "Тёплое" },
  { id: "sad", label: "Грустное" },
  { id: "joyful", label: "Радостное" },
  { id: "energetic", label: "Энергичное" },
  { id: "dreamy", label: "Мечтательное" },
  { id: "tense", label: "Напряжённое" },
  { id: "meditative", label: "Медитативное" },
  { id: "cozy", label: "Уютное" },
  { id: "solemn", label: "Торжественное" },
] as const;

export const SOUND_CHARACTERS = [
  { id: "soft", label: "Мягкий" },
  { id: "dense", label: "Плотный" },
  { id: "transparent", label: "Прозрачный" },
  { id: "warm", label: "Тёплый" },
  { id: "cool", label: "Холодный" },
  { id: "spacious", label: "Пространственный" },
  { id: "dry", label: "Сухой" },
  { id: "rhythmic", label: "Ритмичный" },
  { id: "static", label: "Статичный" },
  { id: "bright", label: "Яркий" },
] as const;

export const SIMILARITY_SCORES = [
  { value: 0 as const, label: "Совсем не похоже" },
  { value: 1 as const, label: "Слабо похоже" },
  { value: 2 as const, label: "Похоже" },
  { value: 3 as const, label: "Очень похоже" },
];

const KEY_ROOTS = [
  ["C", "До"],
  ["Db", "Ре-бемоль"],
  ["D", "Ре"],
  ["Eb", "Ми-бемоль"],
  ["E", "Ми"],
  ["F", "Фа"],
  ["Gb", "Соль-бемоль"],
  ["G", "Соль"],
  ["Ab", "Ля-бемоль"],
  ["A", "Ля"],
  ["Bb", "Си-бемоль"],
  ["B", "Си"],
] as const;

export const MUSICAL_KEYS = KEY_ROOTS.flatMap(([code, name]) => [
  { id: `${code} major`, label: `${name} мажор` },
  { id: `${code} minor`, label: `${name} минор` },
]);

export const FIELD_POLICY_LABELS = {
  AUTO: "Авто",
  SUGGEST_CONFIRM: "Подсказка и подтверждение",
  MANUAL: "Вручную",
  HIDDEN: "Скрыто",
  DROP: "Не использовать",
} as const;

export const RESULT_SLOT_TITLES = {
  genre_top1: "Крупный жанр: топ-1",
  genre_top3: "Крупный жанр: попадание в топ-3",
  style_top1: "Стиль: топ-1",
  style_top3: "Стиль: топ-3",
  vocal: "Роль голоса",
  instruments: "Инструменты: точность и полнота",
  mood: "Настроение: пересечение",
  bpm: "Темп",
  key: "Тональность",
} as const;

export const MOOD_LIMIT = 4;
export const SOUND_LIMIT = 4;
export const COMMENT_LIMIT = 2000;
export const OTHER_INSTRUMENT_LIMIT = 160;
