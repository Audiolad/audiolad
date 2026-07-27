export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: new URL("./stub-server-only-empty.mjs", import.meta.url).href,
    };
  }

  return nextResolve(specifier, context);
}
