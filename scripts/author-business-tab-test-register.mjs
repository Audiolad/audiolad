import { installMailingEditorTestDom } from "./admin-mailing-editor-test-dom.mjs";

installMailingEditorTestDom();

// The nav's import chain reaches the analytics client, which subscribes to window events at load.
for (const name of ["addEventListener", "removeEventListener"]) {
  if (typeof globalThis.window[name] !== "function") globalThis.window[name] = () => {};
}
