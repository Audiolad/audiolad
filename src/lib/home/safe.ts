export const EMPTY_GUEST_HOME_DATA = {
  featuredFreeProduct: null,
  freeProducts: [],
  newProducts: [],
  programProducts: [],
  authors: [],
} as const;

export const EMPTY_PERSONAL_HOME_DATA = {
  greetingFirstName: null,
  continueListening: null,
  startSuggestions: [],
  forYouProducts: [],
  recentlyListened: [],
  activePrograms: [],
  newProducts: [],
  authors: [],
  showBecomeAuthorPromo: false,
} as const;

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "unknown_error";
  }
}

function extractSupabaseFields(error: unknown): SupabaseLikeError {
  if (!error || typeof error !== "object") {
    return {};
  }

  const record = error as Record<string, unknown>;

  return {
    message: typeof record.message === "string" ? record.message : undefined,
    code: typeof record.code === "string" ? record.code : undefined,
    details: typeof record.details === "string" ? record.details : undefined,
    hint: typeof record.hint === "string" ? record.hint : undefined,
  };
}

export function logHomeSectionError(
  section: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const supabase = extractSupabaseFields(error);

  console.error("[home] section_failed", {
    section,
    message: formatError(error),
    supabaseCode: supabase.code ?? null,
    supabaseMessage: supabase.message ?? null,
    supabaseDetails: supabase.details ?? null,
    ...context,
  });
}

export type SafeHomeSectionResult<T> =
  | { ok: true; value: T }
  | { ok: false; value: T };

export async function safeHomeSection<T>(
  section: string,
  loader: () => Promise<T>,
  fallback: T,
  context?: Record<string, unknown>,
): Promise<T> {
  const result = await safeHomeSectionResult(section, loader, fallback, context);
  return result.value;
}

export async function safeHomeSectionResult<T>(
  section: string,
  loader: () => Promise<T>,
  fallback: T,
  context?: Record<string, unknown>,
): Promise<SafeHomeSectionResult<T>> {
  try {
    return { ok: true, value: await loader() };
  } catch (error) {
    logHomeSectionError(section, error, context);
    return { ok: false, value: fallback };
  }
}

export function safeHomeSectionSync<T>(
  section: string,
  loader: () => T,
  fallback: T,
  context?: Record<string, unknown>,
): T {
  try {
    return loader();
  } catch (error) {
    logHomeSectionError(section, error, context);
    return fallback;
  }
}
