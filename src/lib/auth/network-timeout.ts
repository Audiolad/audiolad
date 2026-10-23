export const AUTH_NETWORK_TIMEOUT_MS = 20_000;
export const AUTH_NETWORK_ERROR_MESSAGE = "Нет связи с сервером. Проверьте интернет или отключите VPN и попробуйте снова.";

export class AuthNetworkTimeoutError extends Error {
  constructor() {
    super(AUTH_NETWORK_ERROR_MESSAGE);
    this.name = "AuthNetworkTimeoutError";
  }
}

export async function withAuthNetworkTimeout<T>(
  task: Promise<T> | (() => Promise<T>),
  timeoutMs = AUTH_NETWORK_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AuthNetworkTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([
      typeof task === "function" ? Promise.resolve().then(task) : task,
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function isAuthNetworkFailure(error: unknown): boolean {
  if (error instanceof AuthNetworkTimeoutError) {
    return true;
  }

  if (
    error instanceof TypeError &&
    /fetch|network|load failed/i.test(error.message)
  ) {
    return true;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    (("name" in error && error.name === "AuthRetryableFetchError") ||
      ("status" in error && error.status === 0))
  );
}
