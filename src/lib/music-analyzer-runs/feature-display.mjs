import { MUSIC_ANALYZER_ENERGY_PUBLIC } from "./features.mjs";

/** @param {import('./features.mjs').FeatureSet} set */
export function featureDisplayRows(set) {
  const f = set.features;
  const labels = { energy_0_100: "Энергия — предварительная оценка", rhythm_salience: "Ритмическая активность", perceived_speed: "Воспринимаемая скорость", vocal_role: "Вокал / речь", dynamic_spread_db: "Динамические перепады", loudness_range_lu: "Диапазон громкости (LRA)", loudness_lufs: "Интегральная громкость", true_peak_dbtp: "Истинный пик" };
  /** @type {Record<string, string>} */
  const words = { instrumental: "инструментал", vocal: "вокал", mixed: "смешанный", spoken: "речь", slow: "медленно", moderate: "умеренно", fast: "быстро", unknown: "не определено" };
  return Object.entries(labels).filter(([key]) => MUSIC_ANALYZER_ENERGY_PUBLIC || key !== "energy_0_100").map(([key, label]) => {
    const existingDynamics = key === "dynamic_spread_db" && f.dynamic_spread_db?.status !== "manual" && f.dynamics_db?.value != null;
    const item = existingDynamics ? f.dynamics_db : f[key];
    const displayLabel = existingDynamics ? "Динамика (P95–P5)" : label;
    let value = "не определено";
    if (typeof item?.value === "number") value = `${Number(item.value.toFixed(1))}${key === "energy_0_100" ? " / 100" : key === "rhythm_salience" ? " / 1" : key === "loudness_lufs" ? " LUFS" : key === "true_peak_dbtp" ? " dBTP" : key === "loudness_range_lu" ? " LU" : " дБ"}`;
    else if (typeof item?.value === "string") value = words[item.value] ?? item.value;
    if (key === "rhythm_salience" && (f.rhythm_state?.value === "uncertain" || f.tempo?.value?.rhythm === "uncertain")) value += " · ритм неопределён";
    return { key, label: displayLabel, value, status: item?.status === "manual" ? "ручная поправка" : item?.status === "candidate" ? "оценка" : item?.status === "measured" ? "измерено" : "нет данных",
      confidence: item?.confidence == null ? "уверенность не калибрована" : `уверенность ${Math.round(item.confidence * 100)}%`,
      source: item?.source ?? "unavailable", version: item?.model_version ?? "unknown", reason: key === "energy_0_100" ? `Шкала калибруется. ${item?.reason ?? ""}`.trim() : item?.reason ?? null };
  });
}
