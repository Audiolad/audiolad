const ONE_TIME_ACCESS_STORAGE_KEY = "audiolad_pm_access_url";

export function assertOneTimeAccessNotPersisted(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return (
    window.localStorage.getItem(ONE_TIME_ACCESS_STORAGE_KEY) === null &&
    window.sessionStorage.getItem(ONE_TIME_ACCESS_STORAGE_KEY) === null
  );
}

export function persistOneTimeAccessForTestOnly(): void {
  // Intentionally no-op: raw access URLs must never be written to storage.
}
