import { isBusinessOnlyPractice, type BusinessOnlyFlagRow } from '@/lib/products/business-only';

export const BUSINESS_ONLY_BADGE = 'Только для АудиоЛад Бизнес – не публикуется в открытом АудиоЛаде';
export const PASSPORT_FIELDS = {
  al_code: 'Код AL-T-', generator_tool: 'Инструмент генерации', generator_plan: 'Тариф генератора',
  generated_at: 'Дата генерации', generation_ref: 'ID или ссылка генерации',
  terms_snapshot_ref: 'Ссылка на сохранённые условия тарифа', human_contribution: 'Вклад человека',
  human_contribution_details: 'Описание вклада человека', source_sha256: 'SHA-256 исходного файла',
  master_sha256: 'SHA-256 мастер-файла', fingerprint_sha256: 'SHA-256 аудиоотпечатка',
  shazam_checked_at: 'Дата проверки Shazam', shazam_result: 'Результат Shazam',
  acoustid_checked_at: 'Дата проверки AcoustID', acoustid_result: 'Результат AcoustID',
  never_published_checked_at: 'Дата проверки отсутствия публикаций',
  evidence_inventory_sha256: 'SHA-256 описи доказательств', notes: 'Примечания',
} as const;
export type PassportField = keyof typeof PASSPORT_FIELDS;
export type Passport = Partial<Record<PassportField, string | null>> & {
  audio_item_id?: string; status?: 'draft' | 'approved' | 'revoked';
  stored_master_sha256?: string | null; stored_master_asset_id?: string | null;
  stored_master_sha256_verified_at?: string | null;
};
export function passportMissing(p: Passport): string[] {
  const missing: string[] = [];
  for (const [field, label] of Object.entries(PASSPORT_FIELDS)) {
    if (field === 'notes' || field === 'human_contribution_details') continue;
    const value = p[field as PassportField];
    if (!value?.trim()) missing.push(label);
    else if (field.endsWith('_sha256') && !/^[0-9a-f]{64}$/.test(value)) missing.push(`${label}: нужны 64 строчные шестнадцатеричные цифры`);
    else if (field.endsWith('_at') && !Number.isFinite(Date.parse(value))) missing.push(`${label}: неверная дата`);
  }
  if (p.al_code && !/^AL-T-[A-Za-z0-9-]+$/.test(p.al_code)) missing.push('Код должен начинаться с AL-T-');
  if (p.human_contribution && !['human', 'none'].includes(p.human_contribution)) missing.push('Выберите вклад человека');
  if (p.human_contribution === 'human' && !p.human_contribution_details?.trim()) missing.push(PASSPORT_FIELDS.human_contribution_details);
  if (p.shazam_result && p.shazam_result !== 'not_found') missing.push('Shazam: найдено совпадение');
  if (p.acoustid_result && p.acoustid_result !== 'not_found') missing.push('AcoustID: найдено совпадение');
  if (!p.stored_master_asset_id || !p.stored_master_sha256_verified_at) missing.push('Проверьте хеш сохранённого мастер-файла');
  if (p.master_sha256 && p.master_sha256 !== p.stored_master_sha256) missing.push('Хеш мастер-файла не совпадает');
  return missing;
}
export function businessOnlyVisibilityConflict(row: BusinessOnlyFlagRow, body: Record<string, unknown>) {
  if (!isBusinessOnlyPractice(row)) return null;
  if (!('catalog_visibility' in body) && !('is_catalog_listed' in body)) return null;
  return { error: 'business_only_visibility_locked', message: 'Видимость закрытого альбома Бизнеса менять нельзя.' };
}
