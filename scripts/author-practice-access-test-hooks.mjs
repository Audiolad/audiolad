import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const MOCKS = [
  {
    test: (specifier) => specifier === "server-only",
    file: join(root, "stub-server-only-empty.mjs"),
  },
  {
    test: (specifier) => specifier === "next/headers" || specifier.includes("/next/headers"),
    file: join(root, "lib/author-practice-access-mocks/next-headers.mjs"),
  },
  {
    test: (specifier) =>
      specifier === "@/lib/supabase/server" ||
      specifier.includes("/src/lib/supabase/server"),
    file: join(root, "lib/author-practice-access-mocks/supabase-server.mjs"),
  },
  {
    test: (specifier) =>
      specifier === "@/lib/author-support/context" ||
      specifier.includes("/src/lib/author-support/context"),
    file: join(root, "lib/author-practice-access-mocks/author-support-context.mjs"),
  },
  {
    test: (specifier) =>
      specifier === "@/lib/author-support/store" ||
      specifier.includes("/src/lib/author-support/store"),
    file: join(root, "lib/author-practice-access-mocks/author-support-store.mjs"),
  },
];

export async function resolve(specifier, context, nextResolve) {
  const mock = MOCKS.find((entry) => entry.test(specifier));
  if (mock) {
    return {
      shortCircuit: true,
      url: pathToFileURL(mock.file).href,
    };
  }

  return nextResolve(specifier, context);
}
