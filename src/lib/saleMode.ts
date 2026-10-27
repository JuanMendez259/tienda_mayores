/**
 * Modo de venta por tienda: `'normal'` o `'reducida'`. Vive en
 * `localStorage` porque es una preferencia de esta caja, no un dato
 * de negocio que deba sincronizarse.
 */

export type SaleMode = 'normal' | 'reducida';

const PREFIX = 'pos-abarrotes:vista:';

function storageKey(storeId: string): string {
  return `${PREFIX}${storeId}`;
}

export function loadSaleMode(storeId: string): SaleMode {
  if (typeof localStorage === 'undefined') return 'normal';
  try {
    return localStorage.getItem(storageKey(storeId)) === 'reducida'
      ? 'reducida'
      : 'normal';
  } catch {
    return 'normal';
  }
}

export function saveSaleMode(storeId: string, mode: SaleMode): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(storeId), mode);
  } catch {
    // Sin espacio o almacenamiento bloqueado: el modo dura la sesión.
  }
}
