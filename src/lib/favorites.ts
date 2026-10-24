/**
 * Favoritos del mostrador: productos marcados por tienda para tenerlos a un
 * toque. Viven en `localStorage` porque son una preferencia de esta caja, no
 * un dato de negocio que deba sincronizarse.
 */

const PREFIX = 'pos-abarrotes:favoritos:';

function storageKey(storeId: string): string {
  return `${PREFIX}${storeId}`;
}

export function loadFavorites(storeId: string): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(storeId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export function saveFavorites(storeId: string, productIds: readonly string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(storeId), JSON.stringify([...new Set(productIds)]));
  } catch {
    // Sin espacio o almacenamiento bloqueado: los favoritos duran la sesión.
  }
}

/** Alterna un producto y devuelve la lista nueva. */
export function toggleFavorite(storeId: string, productId: string): string[] {
  const current = loadFavorites(storeId);
  const next = current.includes(productId)
    ? current.filter((id) => id !== productId)
    : [...current, productId];
  saveFavorites(storeId, next);
  return next;
}
