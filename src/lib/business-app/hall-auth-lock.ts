/**
 * One account change at a time on this browser tab: the hall cleanup (check the session id, then
 * sign out) and the owner's password sign-in on «Кабинет владельца» never interleave, so the
 * cleanup cannot end a session that was just created by the password form.
 */
let tail: Promise<unknown> = Promise.resolve();

export function runHallAuthExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
