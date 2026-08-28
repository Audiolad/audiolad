export async function headers() {
  return {
    get() {
      return null;
    },
  };
}

export async function cookies() {
  return {
    getAll() {
      return [];
    },
    get() {
      return undefined;
    },
    set() {},
  };
}
