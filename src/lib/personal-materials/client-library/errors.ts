export class MyMaterialsClientError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function mapMyMaterialsFetchError(response: Response): MyMaterialsClientError {
  if (response.status === 401) {
    return new MyMaterialsClientError("unauthorized", 401);
  }
  if (response.status === 404) {
    return new MyMaterialsClientError("not_found", 404);
  }
  if (response.status === 429) {
    return new MyMaterialsClientError("rate_limited", 429);
  }
  return new MyMaterialsClientError("internal_error", response.status || 500);
}

export function getMyMaterialsErrorMessage(error: unknown): string {
  if (error instanceof MyMaterialsClientError) {
    if (error.code === "not_found") {
      return "Материал недоступен";
    }
    if (error.code === "unauthorized") {
      return "Войдите, чтобы открыть материалы.";
    }
    if (error.code === "rate_limited") {
      return "Слишком много запросов. Попробуйте позже.";
    }
  }
  return "Не удалось загрузить данные. Попробуйте ещё раз.";
}
