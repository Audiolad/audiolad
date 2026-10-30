// Which template a pack belongs to. The sz («Сергей и Зоя») and coffee (АудиоЛад Кофейни) templates
// live in separate folders (lib/sites/sz, lib/sites/coffee) and must never receive each other's packs.
export const COFFEE_TEMPLATE_ID = "audiolad-coffee-guide-v1";

export function packTemplate(raw) {
  if (raw && typeof raw === "object" && (raw.site === "coffee" || raw.template === COFFEE_TEMPLATE_ID)) return "coffee";
  return "sz-or-legacy";
}

/** Error text when a pack does not belong to the requested --site, otherwise null. */
export function packTemplateMismatch(site, raw) {
  const kind = packTemplate(raw);
  if (site !== "coffee" && kind === "coffee") return `шаблоны не смешиваются: это пакет кофеен (site coffee), а запуск с --site ${site} – запускайте с --site coffee`;
  if (site === "coffee" && (raw?.site !== "coffee" || raw?.template !== COFFEE_TEMPLATE_ID)) {
    return `шаблоны не смешиваются: для --site coffee пакет должен содержать "site": "coffee" и "template": "${COFFEE_TEMPLATE_ID}"`;
  }
  return null;
}
