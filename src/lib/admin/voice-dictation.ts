/**
 * Voice dictation for comment fields on /admin/ai-company (7a6fc09c): the browser's Web Speech API
 * (SpeechRecognition / webkitSpeechRecognition, ru-RU). Recognition runs in the browser (Chrome/Yandex send
 * audio to their own speech service); this app never receives or stores audio, only the text lands in the field.
 * The UI is a thin component (VoiceDictationButton); the logic here is framework-free so it is unit-tested.
 */

export const DICTATION_LANG = "ru-RU";

export const DICTATION_ERRORS: Record<string, string> = {
  "not-allowed": "Нет доступа к микрофону. Разрешите его в настройках браузера.",
  "service-not-allowed": "Нет доступа к микрофону. Разрешите его в настройках браузера.",
  "audio-capture": "Микрофон не найден.",
  network: "Нет связи с сервисом распознавания речи.",
  "no-speech": "Речь не услышана. Попробуйте ещё раз.",
  "language-not-supported": "Браузер не распознаёт русскую речь.",
};
export const DICTATION_ERROR_FALLBACK = "Не удалось распознать речь.";

export function dictationErrorText(code: string): string | null {
  if (code === "aborted") return null; // our own stop
  return DICTATION_ERRORS[code] ?? DICTATION_ERROR_FALLBACK;
}

type ResultAlternative = { transcript: string };
type ResultItem = { isFinal: boolean; length: number; [index: number]: ResultAlternative };
export type RecognitionResultEvent = { resultIndex: number; results: { length: number; [index: number]: ResultItem } };

export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => RecognitionLike;

/** The browser's recognizer constructor, or null (button hidden). */
export function speechRecognitionCtor(scope: unknown = typeof window === "undefined" ? undefined : window): RecognitionCtor | null {
  if (!scope || typeof scope !== "object") return null;
  const w = scope as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === "function" ? (ctor as RecognitionCtor) : null;
}

/**
 * Insert recognized text at the caret (or the end), with single spaces around it.
 * Returns the new value and the caret after the inserted text.
 */
export function insertDictation(value: string, caret: number | null | undefined, text: string): { value: string; caret: number } {
  const piece = text.replace(/\s+/g, " ").trim();
  const at = caret == null || caret < 0 || caret > value.length ? value.length : caret;
  if (!piece) return { value, caret: at };
  const before = value.slice(0, at);
  const after = value.slice(at);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && !/^\s/.test(after) ? " " : "";
  const next = before + lead + piece + trail + after;
  return { value: next, caret: (before + lead + piece).length };
}

export type DictationHandlers = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onListening: (listening: boolean) => void;
};

/** One recognition session per press; a second press stops it. */
export function createDictation(Ctor: RecognitionCtor, handlers: DictationHandlers) {
  let recognition: RecognitionLike | null = null;
  return {
    get listening() {
      return recognition !== null;
    },
    start() {
      if (recognition) return;
      const r = new Ctor();
      r.lang = DICTATION_LANG;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const item = event.results[i];
          const text = item?.[0]?.transcript ?? "";
          if (item?.isFinal) handlers.onFinal(text);
          else interim += text;
        }
        handlers.onInterim(interim.trim());
      };
      r.onerror = (event) => {
        const message = dictationErrorText(event?.error ?? "");
        if (message) handlers.onError(message);
      };
      r.onend = () => {
        if (recognition === r) recognition = null;
        handlers.onInterim("");
        handlers.onListening(false);
      };
      recognition = r;
      try {
        r.start();
        handlers.onListening(true);
      } catch {
        recognition = null;
        handlers.onError(DICTATION_ERROR_FALLBACK);
        handlers.onListening(false);
      }
    },
    stop() {
      recognition?.stop();
    },
    abort() {
      const r = recognition;
      recognition = null;
      r?.abort();
    },
  };
}
