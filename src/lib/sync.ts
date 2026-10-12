/**
 * Sincronización de ventas guardadas sin conexión (F-704 / sección 9).
 *
 * Envía en orden las ventas pendientes. La idempotencia por `client_uuid` en el
 * backend garantiza que reenviar una venta no la duplica.
 */
import { repository } from '../data';
import { logError } from './errorLog';
import { listPendingSales, removePendingSale } from './offlineQueue';

export interface SyncResult {
  sent: number;
  failed: number;
}

/** Reenvía todas las ventas pendientes. Devuelve cuántas se enviaron. */
export async function flushPendingSales(): Promise<SyncResult> {
  const pending = await listPendingSales();
  let sent = 0;
  let failed = 0;
  for (const entry of pending) {
    try {
      await repository.checkout(entry.input);
      await removePendingSale(entry.client_uuid);
      sent += 1;
    } catch (cause) {
      failed += 1;
      logError(cause, 'sync');
    }
  }
  return { sent, failed };
}
