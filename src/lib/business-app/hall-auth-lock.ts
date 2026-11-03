/**
 * One account change at a time on this browser: the hall cleanup (check the session id, then sign
 * out) and the owner's password sign-in on «Кабинет владельца» never interleave, so the cleanup
 * cannot end a session that was just created by the password form. Across tabs of this site via
 * the Web Locks API; a tab-level queue where it is missing.
 */
const LOCK_NAME = "audiolad-business-hall-auth";

let tail: Promise<unknown> = Promise.resolve();

function runInTab<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function runHallAuthExclusive<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) return runInTab(task);
  return runInTab(() => locks.request(LOCK_NAME, { mode: "exclusive" }, () => task()) as Promise<T>);
}
