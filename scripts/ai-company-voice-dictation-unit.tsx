/**
 * Voice dictation on /admin/ai-company comment fields (7a6fc09c): shared component + Web Speech controller.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { VoiceDictationButton } from "../src/components/admin/VoiceDictationButton";
import {
  DICTATION_LANG,
  activeDictation,
  bindDictation,
  createDictation,
  resolveCaret,
  dictationErrorText,
  insertDictation,
  speechRecognitionCtor,
  type RecognitionLike,
  type RecognitionResultEvent,
} from "../src/lib/admin/voice-dictation";

// --- insertion at the caret / end, spacing, editable plain text
assert.deepEqual(insertDictation("", null, " привет  мир "), { value: "привет мир", caret: 10 });
assert.deepEqual(insertDictation("Дизайн", null, "не сделан"), { value: "Дизайн не сделан", caret: 16 });
assert.deepEqual(insertDictation("Дизайн сделан", 6, "не"), { value: "Дизайн не сделан", caret: 9 });
assert.deepEqual(insertDictation("abc ", 99, "x"), { value: "abc x", caret: 5 });
assert.deepEqual(insertDictation("abc", 1, "   "), { value: "abc", caret: 1 });

// --- support detection: hidden without the API
assert.equal(speechRecognitionCtor(undefined), null);
assert.equal(speechRecognitionCtor({}), null);
class Fake implements RecognitionLike {
  static last: Fake | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  started = 0;
  stopped = 0;
  onresult: ((event: RecognitionResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    Fake.last = this;
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}
assert.equal(speechRecognitionCtor({ webkitSpeechRecognition: Fake }), Fake);
assert.equal(speechRecognitionCtor({ SpeechRecognition: Fake, webkitSpeechRecognition: class {} }), Fake);

// --- session: ru-RU, interim shown, final appended, second press stops
const log: string[] = [];
const finals: string[] = [];
const d = createDictation(Fake, {
  onInterim: (t) => log.push("interim:" + t),
  onFinal: (t) => finals.push(t),
  onError: (m) => log.push("error:" + m),
  onListening: (on) => log.push("listening:" + on),
});
d.start();
const r = Fake.last!;
assert.equal(r.lang, DICTATION_LANG);
assert.equal(DICTATION_LANG, "ru-RU");
assert.equal(r.interimResults, true);
assert.equal(r.continuous, true);
assert.equal(d.listening, true);
d.start();
assert.equal(r.started, 1, "no second session while listening");
const result = (items: Array<[string, boolean]>, from = 0): RecognitionResultEvent => {
  const results: RecognitionResultEvent["results"] = { length: items.length };
  items.forEach(([t, f], i) => (results[i] = { isFinal: f, length: 1, 0: { transcript: t } }));
  return { resultIndex: from, results };
};
r.onresult!(result([["мобильный диз", false]]));
r.onresult!(result([["мобильный дизайн не сделан", true], [" плей", false]]));
assert.deepEqual(finals, ["мобильный дизайн не сделан"]);
assert.ok(log.includes("interim:мобильный диз"));
assert.ok(log.includes("interim:плей"));
d.stop();
assert.equal(r.stopped, 1);
assert.equal(d.listening, false);
assert.deepEqual(log.slice(-2), ["interim:", "listening:false"]);

// --- errors in short Russian; our own abort is silent
assert.match(dictationErrorText("not-allowed")!, /Нет доступа к микрофону/);
assert.match(dictationErrorText("audio-capture")!, /Микрофон не найден/);
assert.equal(dictationErrorText("aborted"), null);
assert.ok(dictationErrorText("weird"));
d.start();
Fake.last!.onerror!({ error: "not-allowed" });
assert.ok(log.some((l) => l.startsWith("error:Нет доступа к микрофону")));

// --- after stop/abort nothing more lands (late results of the same recognizer are ignored)
{
  const got: string[] = [];
  const s1 = createDictation(Fake, { onInterim: () => {}, onFinal: (t) => got.push(t), onError: () => {}, onListening: () => {} });
  s1.start();
  const rec = Fake.last!;
  s1.stop();
  rec.onresult!(result([["поздний текст", true]]));
  assert.deepEqual(got, [], "late final after stop ignored");
}

// --- insertion point recomputed when the field was edited during dictation
assert.equal(resolveCaret({ value: "abc def", anchor: 3, snapshot: "abc def", focusedCaret: null }), 3);
assert.equal(resolveCaret({ value: "abc def!", anchor: 3, snapshot: "abc def", focusedCaret: null }), 8, "edited, not focused → end");
assert.equal(resolveCaret({ value: "abc def!", anchor: 3, snapshot: "abc def", focusedCaret: 1 }), 1, "edited, focused → live caret");
assert.equal(resolveCaret({ value: "abc", anchor: null, snapshot: null, focusedCaret: null }), 3);

// --- binding (everything the button does), with a fake textarea
function harness() {
  const area = { value: "", selectionStart: 0 as number | null, disabled: false, readOnly: false };
  let focused = false;
  const states: boolean[] = [];
  const b = bindDictation({
    Ctor: Fake,
    getField: () => area,
    isFocused: () => focused,
    onChange: (next) => {
      area.value = next;
    },
    onInterim: () => {},
    onListening: (on) => states.push(on),
    onError: () => {},
  });
  return { area, b, states, focus: (v: boolean) => (focused = v) };
}
{
  // REQUIRED: start → disable (form busy / submit) → recognizer stopped, no more text lands
  const h = harness();
  h.area.value = "Причина:";
  h.b.toggle();
  const rec = Fake.last!;
  rec.onresult!(result([["не работает", true]]));
  assert.equal(h.area.value, "Причина: не работает");
  let aborted = 0;
  const origAbort = rec.abort.bind(rec);
  rec.abort = () => { aborted += 1; origAbort(); };
  h.b.setDisabled(true);
  assert.equal(aborted, 1, "recognizer aborted when disabled");
  assert.equal(h.b.listening, false);
  assert.equal(h.states.at(-1), false, "indicator off");
  rec.onresult!(result([["лишний текст после отправки", true]]));
  assert.equal(h.area.value, "Причина: не работает", "no text after disable");
  h.b.setDisabled(false);
  assert.equal(h.b.listening, false, "re-enabling does not restart");
}
{
  // submit ends the session the same way
  const h = harness();
  h.b.toggle();
  const rec = Fake.last!;
  h.b.submit();
  rec.onresult!(result([["после submit", true]]));
  assert.equal(h.area.value, "");
  assert.equal(h.b.listening, false);
}
{
  // unmount cleanup: dispose stops the recognizer, frees the page slot, ignores late results, no restart
  const h = harness();
  h.b.toggle();
  const rec = Fake.last!;
  assert.ok(activeDictation());
  h.b.dispose();
  assert.equal(h.b.listening, false);
  assert.equal(activeDictation(), null);
  rec.onresult!(result([["после размонтирования", true]]));
  assert.equal(h.area.value, "");
  h.b.toggle();
  assert.equal(h.b.listening, false, "disposed binding never starts again");
}
{
  // one dictation on the page: starting the second stops the first
  const a = harness();
  const b = harness();
  a.b.toggle();
  const recA = Fake.last!;
  b.b.toggle();
  assert.equal(a.b.listening, false);
  assert.equal(b.b.listening, true);
  recA.onresult!(result([["в чужое поле", true]]));
  assert.equal(a.area.value, "");
  b.b.toggle();
  assert.equal(activeDictation(), null);
}
{
  // caret: remembered on press; field edited mid-dictation → insertion recomputed (end when not focused)
  const h = harness();
  h.area.value = "начало конец";
  h.area.selectionStart = 6;
  h.focus(true);
  h.b.rememberCaret();
  h.focus(false);
  h.b.toggle();
  const rec = Fake.last!;
  rec.onresult!(result([["середина", true]]));
  assert.equal(h.area.value, "начало середина конец");
  h.area.value += " правка"; // he typed while dictating
  rec.onresult!(result([["ещё", true]]));
  assert.equal(h.area.value, "начало середина конец правка ещё");
  h.b.toggle();
}

// --- component: no button where the API is missing (server / unsupported browser); marker present
const markup = renderToStaticMarkup(<VoiceDictationButton field="x" fieldRef={{ current: null }} onChange={() => undefined} />);
assert.match(markup, /data-voice-field="x"/);
assert.doesNotMatch(markup, /data-voice-button/);

// --- every comment field on the board has the shared component, exactly once, wired to its own textarea
const src = readFileSync("src/components/admin/AiCompanyDashboard.tsx", "utf8");
const fields: Array<[string, string]> = [
  ["acceptance-comment", "commentRef"],
  ["acceptance-remark", "remarkRef"],
  ["evidence-description", "descriptionRef"],
  ["lifecycle-reason", "reasonRef"],
];
for (const [field, ref] of fields) {
  assert.equal(src.split(`field="${field}"`).length - 1, 1, field);
  assert.match(src, new RegExp(`field="${field}" fieldRef=\\{${ref}\\}`), field);
  assert.match(src, new RegExp(`<textarea[^>]*ref=\\{${ref}\\}|ref=\\{${ref}\\}[\\s\\S]{0,40}value=`), ref);
}
// all editable textareas are covered (the only other one is the read-only copy fallback)
const textareas = [...src.matchAll(/<textarea([\s\S]*?)\/>/g)].map((m) => m[1]);
const editable = textareas.filter((attrs) => !/readOnly/.test(attrs));
assert.equal(editable.length, fields.length, "every editable textarea has a voice button");
// no audio leaves for our server: the component and controller make no network calls
const component = readFileSync("src/components/admin/VoiceDictationButton.tsx", "utf8");
assert.match(component, /setDisabled\(disabled\)/, "component ends the session when disabled");
assert.match(component, /addEventListener\("submit"/, "component ends the session on form submit");
assert.match(component, /useEffect\(\(\) => \(\) => binding\.current\?\.dispose\(\), \[\]\)/, "component disposes on unmount");
for (const file of ["src/components/admin/VoiceDictationButton.tsx", "src/lib/admin/voice-dictation.ts"]) {
  assert.doesNotMatch(readFileSync(file, "utf8"), /fetch\(|XMLHttpRequest|MediaRecorder|getUserMedia/, file);
}

console.log("ai-company voice dictation unit: ok");
