import { installMailingEditorTestDom } from "./admin-mailing-editor-test-dom.mjs";

installMailingEditorTestDom();

// The nav's import chain reaches the analytics client, which subscribes to window events at load.
for (const name of ["addEventListener", "removeEventListener"]) {
  if (typeof globalThis.window[name] !== "function") globalThis.window[name] = () => {};
}

// Node 20 lacks the navigator that React DOM expects; Node 22 already supplies it.
if (typeof globalThis.navigator === "undefined") {
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "audiolad-test-dom" }, configurable: true });
}
