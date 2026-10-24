/**
 * Cola de ventas pendientes para el modo sin conexión (Fase 3, sección 9).
 *
 * Las ventas se guardan en IndexedDB con su `client_uuid` (idempotencia). Al
 * volver la red se envían una por una; el backend deduplica por `client_uuid`,
 * así que un reenvío nunca duplica la venta. Si IndexedDB no está disponible
 * (por ejemplo en pruebas), se usa un arreglo en memoria como respaldo.
 */
import type { CheckoutInput } from '../data/repository';

export interface PendingSale {
  client_uuid: string;
  created_at: string;
  input: CheckoutInput;
}

const DB_NAME = 'pos-abarrotes';
const STORE = 'pending_sales';

/** Evento para que la interfaz refresque el contador de ventas pendientes. */
export const PENDING_SALES_EVENT = 'pos:pending-sales-changed';

let memory: PendingSale[] = [];
let dbPromise: Promise<IDBDatabase | null> | null = null;

function notifyChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PENDING_SALES_EVENT));
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'client_uuid' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      }),
  );
}

/** Encoda una venta para enviarla cuando vuelva la conexión. */
export async function enqueueSale(input: CheckoutInput): Promise<void> {
  const entry: PendingSale = {
    client_uuid: input.client_uuid,
    created_at: new Date().toISOString(),
    input,
  };
  const existing = memory.find((e) => e.client_uuid === entry.client_uuid);
  if (existing) {
    memory = memory.map((e) => (e.client_uuid === entry.client_uuid ? entry : e));
  } else {
    memory = [...memory, entry];
  }
  await withStore('readwrite', (store) => store.put(entry));
  notifyChange();
}

/** Lista las ventas pendientes, más antiguas primero. */
export async function listPendingSales(): Promise<PendingSale[]> {
  const result = await withStore<PendingSale[]>('readonly', (store) => store.getAll());
  const entries = result ?? memory;
  return [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Quita una venta ya sincronizada. */
export async function removePendingSale(clientUuid: string): Promise<void> {
  memory = memory.filter((e) => e.client_uuid !== clientUuid);
  await withStore('readwrite', (store) => store.delete(clientUuid));
  notifyChange();
}

/** Número de ventas pendientes por enviar. */
export async function pendingCount(): Promise<number> {
  const result = await withStore<number>('readonly', (store) => store.count());
  return result ?? memory.length;
}

/** Borra toda la cola (útil en pruebas). */
export async function clearPendingSales(): Promise<void> {
  memory = [];
  await withStore('readwrite', (store) => store.clear());
  notifyChange();
}
