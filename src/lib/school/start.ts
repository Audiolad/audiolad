/** Shared school start date — keep FAQ, hero and final screen aligned. */
export const SCHOOL_START_DAY = "29";
export const SCHOOL_START_DAY_END = "30";
export const SCHOOL_START_MONTH = "октября";
export const SCHOOL_START_YEAR = "2026";
/** ISO month for CourseInstance dates — keep in sync with SCHOOL_START_MONTH. */
export const SCHOOL_START_MONTH_ISO = "10";

/** Single text node for hero pill — avoids flex collapsing spaces between spans. */
export const SCHOOL_START_LABEL = `Старт – ${SCHOOL_START_DAY} ${SCHOOL_START_MONTH} ${SCHOOL_START_YEAR} года`;

/** Shared intensive schedule — tariffs section only. */
export const SCHOOL_INTENSIVE_TIME_START = "18:00";
export const SCHOOL_INTENSIVE_TIME_END = "20:00";
export const SCHOOL_TIMEZONE_LABEL = "по московскому времени";

export const SCHOOL_INTENSIVE_TITLE = "Онлайн-интенсив";

/** Dates + time for the intensive (shown under the title). */
export const SCHOOL_INTENSIVE_SCHEDULE_LINE = `${SCHOOL_START_DAY}–${SCHOOL_START_DAY_END} ${SCHOOL_START_MONTH} ${SCHOOL_START_YEAR} года · ${SCHOOL_INTENSIVE_TIME_START}–${SCHOOL_INTENSIVE_TIME_END} ${SCHOOL_TIMEZONE_LABEL}`;

/** First feature line in the Standard option (year lives in the schedule panel). */
export const SCHOOL_INTENSIVE_STANDARD_FEATURE = `Два дня живого онлайн-интенсива – ${SCHOOL_START_DAY} и ${SCHOOL_START_DAY_END} ${SCHOOL_START_MONTH}, с ${SCHOOL_INTENSIVE_TIME_START} до ${SCHOOL_INTENSIVE_TIME_END} ${SCHOOL_TIMEZONE_LABEL}`;

/** Practical mentoring period — Premium and VIP only. */
export const SCHOOL_MENTORING_START_DAY = "03";
export const SCHOOL_MENTORING_START_MONTH = "ноября";
export const SCHOOL_MENTORING_END_DAY = "30";
export const SCHOOL_MENTORING_END_MONTH = "ноября";
export const SCHOOL_MENTORING_YEAR = SCHOOL_START_YEAR;
/** ISO month for CourseInstance endDate — keep in sync with SCHOOL_MENTORING_END_MONTH. */
export const SCHOOL_MENTORING_END_MONTH_ISO = "11";

export const SCHOOL_MENTORING_TITLE =
  "Практическое сопровождение (наставничество)";

export const SCHOOL_MENTORING_PERIOD = `${SCHOOL_MENTORING_START_DAY} ${SCHOOL_MENTORING_START_MONTH} – ${SCHOOL_MENTORING_END_DAY} ${SCHOOL_MENTORING_END_MONTH} ${SCHOOL_MENTORING_YEAR} года`;

export const SCHOOL_MENTORING_SCOPE_NOTE =
  "Входит в варианты «Премиум» и VIP";

/** FAQ sentence with en-dash. */
export const SCHOOL_START_FAQ_ANSWER = `Старт первого потока – ${SCHOOL_START_DAY} ${SCHOOL_START_MONTH} ${SCHOOL_START_YEAR} года.`;
