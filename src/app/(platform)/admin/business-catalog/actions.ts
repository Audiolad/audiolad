'use server';
import { revalidatePath } from 'next/cache';
import { createClosedBusinessAlbum, saveBusinessPassport, verifyBusinessMaster, decideBusinessPassport } from '@/lib/business-track-passports/admin.server';

export async function closedCatalogAction(command: string, audioItemId: string, fields: Record<string, unknown>) {
  try {
    if (command === 'create') await createClosedBusinessAlbum(String(fields.author_id ?? ''), String(fields.title ?? ''));
    else if (command === 'save') await saveBusinessPassport(audioItemId, fields);
    else if (command === 'verify') await verifyBusinessMaster(audioItemId);
    else if (command === 'approve' || command === 'revoke') await decideBusinessPassport(audioItemId, command);
    else return { ok: false, message: 'Неизвестное действие.' };
    revalidatePath('/admin/business-catalog');
    return { ok: true, message: 'Изменения сохранены.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Не удалось сохранить изменения.' };
  }
}
