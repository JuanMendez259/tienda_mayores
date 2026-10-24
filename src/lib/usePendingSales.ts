import { useCallback, useEffect, useState } from 'react';
import { PENDING_SALES_EVENT, pendingCount } from './offlineQueue';
import { flushPendingSales, type SyncResult } from './sync';

/**
 * Contador de ventas guardadas sin conexión. Se refresca cuando cambia la cola
 * (encolar, sincronizar o borrar) y cuando el navegador recupera la red.
 */
export function usePendingSales() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setCount(await pendingCount());
    } catch {
      // IndexedDB puede no estar disponible; el contador queda como estaba.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Diferido para no encadenar renders dentro del cuerpo del efecto.
    const initial = setTimeout(() => void refresh(), 0);
    const onChange = () => void refresh();
    const goOnline = () => {
      setOnline(true);
      void refresh();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener(PENDING_SALES_EVENT, onChange);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      clearTimeout(initial);
      window.removeEventListener(PENDING_SALES_EVENT, onChange);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [refresh]);

  /** Envía la cola ahora y devuelve cuántas ventas se sincronizaron. */
  const sync = useCallback(async (): Promise<SyncResult> => {
    setSyncing(true);
    try {
      const result = await flushPendingSales();
      await refresh();
      return result;
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  return { count, online, syncing, sync, refresh };
}
