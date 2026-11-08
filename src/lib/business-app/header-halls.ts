/** Existing halls only, in the same array order as «Мои точки». */
export type BusinessHeaderHall = { id: string; name: string; status: string };

export function businessHeaderHallOptions(
  halls: readonly BusinessHeaderHall[],
  currentLocationId: string,
  venueOn: boolean,
) {
  const labels = halls.map((hall) => hall.name.trim() || "Кофейня");
  return halls.map((hall, index) => ({
    id: `venue-${hall.id}`,
    locationId: hall.id,
    label: labels.filter((label) => label === labels[index]).length > 1
      ? `Точка ${index + 1}: ${labels[index]}` : labels[index],
    selected: venueOn && hall.id === currentLocationId,
    disabled: hall.status !== "active",
    hall,
  }));
}

/** Select the shared location cookie before opening the preview; current hall needs no action. */
export async function openBusinessHeaderHall(
  hall: BusinessHeaderHall,
  currentLocationId: string,
  select: (id: string) => Promise<{ ok: boolean }>,
  open: () => void,
): Promise<boolean> {
  if (hall.status !== "active") return false;
  if (hall.id !== currentLocationId) {
    try {
      if (!(await select(hall.id)).ok) return false;
    } catch {
      return false;
    }
  }
  open();
  return true;
}
