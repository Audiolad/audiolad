export function formatClientDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();

  if (first && last) {
    return `${first} ${last}`;
  }

  return first || last;
}
