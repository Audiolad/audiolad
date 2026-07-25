export function createClientEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const random = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${random()}-${random()}`;
}
