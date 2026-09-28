export async function postMusicLab(
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: body === undefined ? "{}" : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, payload };
}

export function labErrorMessage(code: unknown): string {
  if (code === "responses_locked") {
    return "Оценка уже завершена. Ответы закрыты.";
  }
  if (code === "invalid_answers") {
    return "Проверьте поля формы. Можно выбрать «Не уверен», если нет уверенного ответа.";
  }
  if (code === "incomplete") {
    return "Ещё не все обязательные ответы заполнены.";
  }
  if (code === "audio_missing") {
    return "Аудио ещё не загружено в закрытое хранилище лаборатории.";
  }
  return "Не удалось сохранить. Попробуйте ещё раз.";
}
