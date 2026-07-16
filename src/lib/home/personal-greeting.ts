export const PERSONAL_HOME_GREETINGS_WITH_NAME = [
  "{name}, привет!",
  "{name}, рады вас видеть",
  "{name}, снова рады вам",
  "{name}, добро пожаловать",
  "{name}, хорошо, что вы здесь",
] as const;

export const PERSONAL_HOME_GREETINGS_ANONYMOUS = [
  "Рады вас видеть",
  "Снова рады вам",
  "Добро пожаловать",
  "Хорошо, что вы здесь",
] as const;

export const PERSONAL_HOME_WISDOM_PHRASES = [
  "Иногда достаточно одного спокойного вдоха, чтобы услышать себя.",
  "Ваш внутренний ритм важнее внешней спешки.",
  "Небольшая пауза может изменить весь день.",
  "То, чему вы уделяете внимание, постепенно становится сильнее.",
  "Забота о себе начинается с нескольких минут тишины.",
  "Сегодня можно не торопиться и всё равно двигаться вперёд.",
  "Внутреннее спокойствие помогает увидеть верное решение.",
  "Ваш голос тоже может стать для кого-то поддержкой.",
  "Необязательно делать много. Иногда важно сделать главное.",
  "Состояние, из которого вы действуете, меняет результат.",
  "Каждый новый день можно начать с возвращения к себе.",
  "Тишина не останавливает движение — она помогает выбрать направление.",
  "Даже короткая практика может вернуть ощущение опоры.",
  "Сначала услышьте себя, а затем отвечайте миру.",
  "Мягкость к себе не мешает силе.",
  "То, что создаётся с вниманием, чувствуется без объяснений.",
  "Иногда путь открывается после того, как мы перестаём торопить его.",
  "Ваше настоящее состояние важнее идеального плана.",
  "Достаточно одного маленького шага, сделанного осознанно.",
  "Спокойствие — это пространство, в котором рождаются новые решения.",
  "Вы можете начать заново с любого момента.",
  "Внутренняя опора растёт каждый раз, когда вы выбираете себя.",
  "Голос, записанный с живым чувством, находит своего слушателя.",
  "Сегодня хороший день, чтобы услышать то, что давно звучит внутри.",
] as const;

export const PERSONAL_HOME_STORAGE_KEYS = {
  lastGreeting: "audiolad.personalHome.lastGreeting",
  lastWisdom: "audiolad.personalHome.lastWisdom",
} as const;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function normalizeStoredIndex(
  index: number | null | undefined,
  total: number,
): number | null {
  if (total <= 0) {
    return null;
  }

  if (index === null || index === undefined || !Number.isFinite(index)) {
    return null;
  }

  const rounded = Math.trunc(index);

  if (rounded < 0 || rounded >= total) {
    return null;
  }

  return rounded;
}

export function getNextRotatingIndex(
  total: number,
  previousIndex: number | null,
): number {
  if (total <= 0) {
    return 0;
  }

  if (total === 1) {
    return 0;
  }

  const previous = normalizeStoredIndex(previousIndex, total);

  if (previous === null) {
    return 0;
  }

  return (previous + 1) % total;
}

export function formatPersonalGreeting(
  template: string,
  name: string | null,
): string {
  const trimmed = name?.trim();

  if (!trimmed) {
    return template.replace(/\{name\},?\s*/g, "").trim();
  }

  return template.replace("{name}", trimmed);
}

export function getPersonalGreetingTemplateCount(firstName: string | null): number {
  return firstName?.trim()
    ? PERSONAL_HOME_GREETINGS_WITH_NAME.length
    : PERSONAL_HOME_GREETINGS_ANONYMOUS.length;
}

export function getPersonalGreetingAtIndex(
  index: number,
  firstName: string | null,
): string {
  const trimmed = firstName?.trim();
  const templates = trimmed
    ? PERSONAL_HOME_GREETINGS_WITH_NAME
    : PERSONAL_HOME_GREETINGS_ANONYMOUS;
  const safeIndex = normalizeStoredIndex(index, templates.length) ?? 0;
  const template = templates[safeIndex];
  const greeting = trimmed ? formatPersonalGreeting(template, trimmed) : template;

  return trimmed ? `${greeting} 💜` : greeting;
}

export function getPersonalHomeWisdomAtIndex(index: number): string {
  const safeIndex =
    normalizeStoredIndex(index, PERSONAL_HOME_WISDOM_PHRASES.length) ?? 0;

  return PERSONAL_HOME_WISDOM_PHRASES[safeIndex];
}

export function parseStoredIndex(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function readPersonalHomeStoredIndex(
  storage: StorageLike | null | undefined,
  key: string,
): number | null {
  try {
    return parseStoredIndex(storage?.getItem(key) ?? null);
  } catch {
    return null;
  }
}

export function writePersonalHomeStoredIndex(
  storage: StorageLike | null | undefined,
  key: string,
  index: number,
): void {
  try {
    storage?.setItem(key, String(index));
  } catch {
    // localStorage may be unavailable in embedded browsers or private mode.
  }
}

export type PersonalHomeVisitContent = {
  greetingIndex: number;
  greetingTitle: string;
  wisdomIndex: number;
  wisdomPhrase: string;
};

export function resolvePersonalHomeVisitContent(
  firstName: string | null,
  storedGreetingIndex: number | null,
  storedWisdomIndex: number | null,
): PersonalHomeVisitContent {
  const greetingCount = getPersonalGreetingTemplateCount(firstName);
  const greetingIndex = getNextRotatingIndex(greetingCount, storedGreetingIndex);
  const wisdomIndex = getNextRotatingIndex(
    PERSONAL_HOME_WISDOM_PHRASES.length,
    storedWisdomIndex,
  );

  return {
    greetingIndex,
    greetingTitle: getPersonalGreetingAtIndex(greetingIndex, firstName),
    wisdomIndex,
    wisdomPhrase: getPersonalHomeWisdomAtIndex(wisdomIndex),
  };
}

export function getPersonalHomeVisitContentFromStorage(
  storage: StorageLike | null | undefined,
  firstName: string | null,
): PersonalHomeVisitContent {
  const storedGreetingIndex = readPersonalHomeStoredIndex(
    storage,
    PERSONAL_HOME_STORAGE_KEYS.lastGreeting,
  );
  const storedWisdomIndex = readPersonalHomeStoredIndex(
    storage,
    PERSONAL_HOME_STORAGE_KEYS.lastWisdom,
  );

  const content = resolvePersonalHomeVisitContent(
    firstName,
    storedGreetingIndex,
    storedWisdomIndex,
  );

  writePersonalHomeStoredIndex(
    storage,
    PERSONAL_HOME_STORAGE_KEYS.lastGreeting,
    content.greetingIndex,
  );
  writePersonalHomeStoredIndex(
    storage,
    PERSONAL_HOME_STORAGE_KEYS.lastWisdom,
    content.wisdomIndex,
  );

  return content;
}
