/** Shared school start date — keep FAQ, hero and final screen aligned. */
export const SCHOOL_START_DAY = "20";
export const SCHOOL_START_DAY_END = "21";
export const SCHOOL_START_MONTH = "августа";
export const SCHOOL_START_YEAR = "2026";

/** Single text node for hero pill — avoids flex collapsing spaces between spans. */
export const SCHOOL_START_LABEL = `Старт – ${SCHOOL_START_DAY} ${SCHOOL_START_MONTH} ${SCHOOL_START_YEAR} года`;

/** Shared intensive schedule — tariffs section only. */
export const SCHOOL_INTENSIVE_TIME_START = "18:00";
export const SCHOOL_INTENSIVE_TIME_END = "20:00";
export const SCHOOL_TIMEZONE_LABEL = "по московскому времени";

/** Banner above all participation options. */
export const SCHOOL_INTENSIVE_SCHEDULE_BANNER = `Онлайн-интенсив: ${SCHOOL_START_DAY}–${SCHOOL_START_DAY_END} ${SCHOOL_START_MONTH} ${SCHOOL_START_YEAR} года · ${SCHOOL_INTENSIVE_TIME_START}–${SCHOOL_INTENSIVE_TIME_END} ${SCHOOL_TIMEZONE_LABEL}`;

/** First feature line in the Standard option (year lives in the banner). */
export const SCHOOL_INTENSIVE_STANDARD_FEATURE = `Два дня живого онлайн-интенсива – ${SCHOOL_START_DAY} и ${SCHOOL_START_DAY_END} ${SCHOOL_START_MONTH}, с ${SCHOOL_INTENSIVE_TIME_START} до ${SCHOOL_INTENSIVE_TIME_END} ${SCHOOL_TIMEZONE_LABEL}`;

/** FAQ sentence with en-dash. */
export const SCHOOL_START_FAQ_ANSWER = `Старт первого потока – ${SCHOOL_START_DAY} ${SCHOOL_START_MONTH} ${SCHOOL_START_YEAR} года.`;
