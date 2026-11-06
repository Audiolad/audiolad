/** Name and street address of one point. Stored on business_locations.name and address_line1. */

export const VENUE_NAME_MAX = 120;
export const VENUE_ADDRESS_MAX = 200;

export type VenuePlace = {
  name: string;
  addressLine1: string;
};

export type VenuePlaceValidation = { ok: true; value: VenuePlace } | { ok: false; error: string };

export function validateVenuePlace(input: { name: string; addressLine1: string }): VenuePlaceValidation {
  const name = input.name.trim();
  const addressLine1 = input.addressLine1.trim();
  if (name.length < 1 || name.length > VENUE_NAME_MAX) {
    return { ok: false, error: "Укажите название точки: от 1 до 120 символов." };
  }
  if (addressLine1.length < 1 || addressLine1.length > VENUE_ADDRESS_MAX || /[\u0000-\u001F\u007F]/.test(addressLine1)) {
    return { ok: false, error: "Укажите адрес точки: от 1 до 200 символов, одной строкой." };
  }
  return { ok: true, value: { name, addressLine1 } };
}

/** One short cabinet line. Empty when the address is still missing. */
export function venuePlaceLine(name: string | null | undefined, addressLine1: string | null | undefined): string | null {
  const place = (addressLine1 ?? "").trim();
  const title = (name ?? "").trim();
  if (!place || !title) return null;
  return `${title} – ${place}`;
}
