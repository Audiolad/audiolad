/**
 * Approximate location from a DB-IP Lite City record (task 253821e0, PR 3).
 * Kept: country code, region and city names. Dropped: coordinates, postal codes,
 * the IP itself and everything else in the record.
 * IP Geolocation by DB-IP (https://db-ip.com), CC BY 4.0.
 */

export type BusinessGeo = { country: string | null; region: string | null; city: string | null };

type Names = { names?: Record<string, unknown> } | undefined;

function placeName(value: Names): string | null {
  const names = value?.names;
  if (!names || typeof names !== "object") return null;
  const raw = typeof names.ru === "string" ? names.ru : typeof names.en === "string" ? names.en : null;
  if (!raw) return null;
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return clean ? clean.slice(0, 80) : null;
}

export function businessGeoFromRecord(record: unknown): BusinessGeo | null {
  if (!record || typeof record !== "object") return null;
  const r = record as { country?: { iso_code?: unknown }; subdivisions?: unknown; city?: Names };
  const iso = typeof r.country?.iso_code === "string" && /^[A-Z]{2}$/.test(r.country.iso_code) ? r.country.iso_code : null;
  const region = Array.isArray(r.subdivisions) ? placeName(r.subdivisions[0] as Names) : null;
  const city = placeName(r.city);
  if (!iso && !region && !city) return null;
  return { country: iso, region, city };
}
