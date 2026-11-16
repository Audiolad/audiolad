'use server';
import { revalidatePath } from 'next/cache';
import { createClosedBusinessAlbum, saveBusinessPassport, verifyBusinessMaster, decideBusinessPassport } from '@/lib/business-track-passports/admin.server';
import { applyAlbumSharedPassportFields, autoFillBusinessPassportTrack, approveReadyBusinessPassports } from '@/lib/business-track-passports/auto-fill.server';
import { saveCatalogPassportDefaults, uploadBusinessPassportLicense } from '@/lib/business-track-passports/license.server';

function fail(error: unknown) {
  return { ok: false as const, message: error instanceof Error ? error.message : 'Не удалось сохранить изменения.' };
}

export async function closedCatalogAction(command: string, audioItemId: string, fields: Record<string, unknown>, options?: { keys?: unknown }) {
  try {
    if (command === 'create') await createClosedBusinessAlbum(String(fields.author_id ?? ''), String(fields.title ?? ''));
    else if (command === 'save') {
      // t1485u: the passport form sends only the keys the operator changed (never wipes a
      // Shazam result written by the worker after the form was opened).
      const keys = Array.isArray(options?.keys) ? options.keys.filter((key): key is string => typeof key === 'string') : undefined;
      await saveBusinessPassport(audioItemId, fields, keys ? { keys } : undefined);
    }
    else if (command === 'verify') await verifyBusinessMaster(audioItemId);
    else if (command === 'approve' || command === 'revoke') await decideBusinessPassport(audioItemId, command);
    else return { ok: false, message: 'Неизвестное действие.' };
    revalidatePath('/admin/business-catalog');
    return { ok: true, message: 'Изменения сохранены.' };
  } catch (error) {
    return fail(error);
  }
}

export async function applyAlbumSharedPassportAction(albumId: string, fields: Record<string, string>) {
  try {
    const result = await applyAlbumSharedPassportFields(albumId, fields);
    revalidatePath('/admin/business-catalog');
    const skipped = result.skipped > 0 ? ` Пропущено допущенных или отозванных: ${result.skipped}.` : '';
    return { ...result, ok: true as const, message: `Общие поля записаны в ${result.applied} черновик(ов).${skipped}` };
  } catch (error) {
    return fail(error);
  }
}

export async function autoFillPassportTrackAction(audioItemId: string) {
  try {
    const result = await autoFillBusinessPassportTrack(audioItemId);
    revalidatePath('/admin/business-catalog');
    return result;
  } catch (error) {
    return {
      ok: false,
      trackId: audioItemId,
      title: '',
      filled: [],
      skipped: [],
      errors: [error instanceof Error ? error.message : 'Не удалось заполнить автоматически.'],
      message: error instanceof Error ? error.message : 'Не удалось заполнить автоматически.',
    };
  }
}

export async function approveReadyPassportsAction(albumId: string) {
  try {
    const result = await approveReadyBusinessPassports(albumId);
    revalidatePath('/admin/business-catalog');
    const errors = result.errors.length
      ? ` Ошибки: ${result.errors.map((item) => `${item.title} – ${item.message}`).join(' ')}`
      : '';
    return {
      ...result,
      ok: result.errors.length === 0,
      message: result.approved === 0 && result.errors.length === 0
        ? 'Нет готовых черновиков для допуска. Нужны заполненные поля, проверка хеша мастера и результат Shazam «совпадений нет».'
        : `Допущено ${result.approved} паспорт(ов). Пропущено: ${result.skipped}.${errors}`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function uploadPassportLicenseAction(formData: FormData) {
  try {
    const scopeValue = String(formData.get('scope') ?? '');
    const albumId = String(formData.get('albumId') ?? '');
    const file = formData.get('file');
    if (!(file instanceof File)) throw new Error('Выберите PDF с образцом лицензии.');
    const scope = scopeValue === 'catalog' ? 'catalog' as const : { albumId };
    const ref = await uploadBusinessPassportLicense(scope, file);
    revalidatePath('/admin/business-catalog');
    return { ok: true as const, message: 'Образец лицензии сохранён закрыто и может заполнять условия тарифа у всех треков.', ref };
  } catch (error) {
    return fail(error);
  }
}

export async function saveCatalogDefaultsAction(scopeValue: string, albumId: string, fields: Record<string, string>) {
  try {
    const scope = scopeValue === 'catalog' ? 'catalog' as const : { albumId };
    const defaults = await saveCatalogPassportDefaults(scope, fields);
    revalidatePath('/admin/business-catalog');
    return { ok: true as const, message: scopeValue === 'catalog' ? 'Настройки каталога сохранены. Их можно поменять, если сменится тариф.' : 'Настройки этого альбома сохранены и будут использованы вместо каталожных.', defaults };
  } catch (error) {
    return fail(error);
  }
}
