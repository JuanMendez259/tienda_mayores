/**
 * Estado de los dispositivos para la pantalla de diagnóstico (parte de hardware
 * de F-704). Se guarda solo en memoria: no requiere base de datos.
 */
export interface ScanEvent {
  code: string;
  at: string;
}

let lastScan: ScanEvent | null = null;
const listeners = new Set<() => void>();

/** Registra el último código leído por el escáner (F-102). */
export function recordScan(code: string): void {
  lastScan = { code, at: new Date().toISOString() };
  for (const listener of listeners) listener();
}

/** Último código leído, o null. */
export function getLastScan(): ScanEvent | null {
  return lastScan;
}

/** Se suscribe a los cambios del estado de dispositivos. */
export function subscribeDeviceStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
