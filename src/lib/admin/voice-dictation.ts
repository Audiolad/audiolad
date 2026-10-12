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

/**
 * Where the next recognized phrase goes. `anchor` is where the previous insertion ended and `snapshot` the field
 * value right after it. If the field was edited since (value differs), the anchor is stale: use the live caret
 * when the field is focused, otherwise the end.
 */
export function resolveCaret(input: {
  value: string;
  anchor: number | null;
  snapshot: string | null;
  focusedCaret: number | null;
}): number {
  const { value, anchor, snapshot, focusedCaret } = input;
  if (anchor != null && snapshot === value && anchor >= 0 && anchor <= value.length) return anchor;
  if (focusedCaret != null && focusedCaret >= 0 && focusedCaret <= value.length) return focusedCaret;
  return value.length;
}

export type DictationHandlers = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onListening: (listening: boolean) => void;
};

type Session = { abort: () => void };
// One dictation on the page at a time: starting one ends the previous.
let activeSession: Session | null = null;
export function activeDictation(): Session | null {
  return activeSession;
}

/**
 * One recognition session per press; a second press stops it.
 * - stop() (Sergey's own second press): recognition.stop(); the phrase being recognized is kept — the final result
 *   that arrives after stop is inserted, and if the session ends with only interim text, that text is inserted.
 * - abort() (form disabled / submitted, unmount, another dictation started): recognition.abort(); every later
 *   result of that recognizer is ignored, so nothing lands after submit.
 */
export function createDictation(Ctor: RecognitionCtor, handlers: DictationHandlers) {
  let recognition: RecognitionLike | null = null;
  let stopping = false;
  let pendingInterim = "";
  const self: Session & { readonly listening: boolean; start(): void; stop(): void } = {
    get listening() {
      return recognition !== null && !stopping;
    },
    start() {
      if (recognition && !stopping) return;
      if (recognition) self.abort(); // a stop whose end never came
      if (activeSession && activeSession !== self) activeSession.abort();
      const r = new Ctor();
      r.lang = DICTATION_LANG;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      const live = () => recognition === r;
      r.onresult = (event) => {
        if (!live()) return;
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const item = event.results[i];
          const text = item?.[0]?.transcript ?? "";
          if (item?.isFinal) handlers.onFinal(text);
          else interim += text;
        }
        pendingInterim = interim.trim();
        handlers.onInterim(pendingInterim);
      };
      r.onerror = (event) => {
        if (!live()) return;
        const message = dictationErrorText(event?.error ?? "");
        if (message) handlers.onError(message);
      };
      r.onend = () => {
        if (!live()) return;
        // The session ended with words still unconfirmed: keep them (Sergey speaks, then presses stop).
        if (pendingInterim) handlers.onFinal(pendingInterim);
        end();
      };
      recognition = r;
      stopping = false;
      pendingInterim = "";
      activeSession = self;
      try {
        r.start();
        handlers.onListening(true);
      } catch {
        end();
        handlers.onError(DICTATION_ERROR_FALLBACK);
      }
    },
    stop() {
      const r = recognition;
      if (!r || stopping) return;
      stopping = true;
      handlers.onListening(false);
      try {
        r.stop(); // results still being recognized arrive, then onend
      } catch {
        if (pendingInterim) handlers.onFinal(pendingInterim);
        end();
      }
    },
    abort() {
      const r = recognition;
      if (!r) return;
      end();
      try {
        r.abort();
      } catch {
        // already stopped
      }
    },
  };
  function end() {
    recognition = null;
    stopping = false;
    pendingInterim = "";
    if (activeSession === self) activeSession = null;
    handlers.onInterim("");
    handlers.onListening(false);
  }
  return self;
}

/** The textarea bits the binding needs (a real HTMLTextAreaElement satisfies it). */
export type DictationField = { value: string; selectionStart: number | null; disabled: boolean; readOnly: boolean };

/**
 * Everything VoiceDictationButton does, without React, so it is unit-tested: toggle on press, remember the caret
 * on press, end the session when disabled / on submit / on unmount, insert final text where it belongs.
 */
export function bindDictation(input: {
  Ctor: RecognitionCtor;
  getField: () => DictationField | null;
  isFocused: () => boolean;
  onChange: (next: string) => void;
  onInterim: (text: string) => void;
  onListening: (listening: boolean) => void;
  onError: (message: string) => void;
}) {
  let anchor: { at: number | null; snapshot: string | null } = { at: null, snapshot: null };
  let disposed = false;
  const dictation = createDictation(input.Ctor, {
    onInterim: input.onInterim,
    onListening: input.onListening,
    onError: input.onError,
    onFinal: (text) => {
      const area = input.getField();
      if (disposed || !area || area.disabled || area.readOnly) return;
      const caret = resolveCaret({
        value: area.value,
        anchor: anchor.at,
        snapshot: anchor.snapshot,
        focusedCaret: input.isFocused() ? area.selectionStart : null,
      });
      const next = insertDictation(area.value, caret, text);
      anchor = { at: next.caret, snapshot: next.value };
      input.onChange(next.value);
    },
  });
  return {
    get listening() {
      return dictation.listening;
    },
    /** Before the field loses focus to the button. */
    rememberCaret() {
      const area = input.getField();
      anchor = area && input.isFocused() ? { at: area.selectionStart, snapshot: area.value } : { at: null, snapshot: null };
    },
    toggle() {
      if (disposed) return;
      if (dictation.listening) dictation.stop();
      else dictation.start();
    },
    setDisabled(disabled: boolean) {
      if (disabled) dictation.abort();
    },
    submit() {
      dictation.abort();
    },
    dispose() {
      disposed = true;
      dictation.abort();
    },
  };
}
