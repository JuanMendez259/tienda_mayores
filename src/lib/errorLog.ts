/**
 * Registro de errores para soporte (F-706).
 *
 * Guarda los últimos errores del cliente en `localStorage` para que el dueño
 * pueda revisarlos desde el panel de diagnóstico. Si `localStorage` no está
 * disponible, se conservan solo en memoria.
 */
export interface ErrorLogEntry {
  at: string;
  message: string;
  stack?: string;
  context?: string;
}

const STORAGE_KEY = 'pos-error-log';
const MAX_ENTRIES = 50;

let memory: ErrorLogEntry[] = [];

function read(): ErrorLogEntry[] {
  if (typeof localStorage === 'undefined') return memory;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return memory;
    const parsed = JSON.parse(raw) as ErrorLogEntry[];
    return Array.isArray(parsed) ? parsed : memory;
  } catch {
    return memory;
  }
}

function write(entries: ErrorLogEntry[]): void {
  memory = entries.slice(0, MAX_ENTRIES);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Sin espacio o bloqueado: nos quedamos con la copia en memoria.
  }
}

/** Guarda un error con marca de tiempo. */
export function logError(error: unknown, context?: string): void {
  const normalized =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: typeof error === 'string' ? error : JSON.stringify(error) };
  const entry: ErrorLogEntry = {
    at: new Date().toISOString(),
    message: normalized.message,
    stack: normalized.stack,
    context,
  };
  write([entry, ...read()]);
}

/** Devuelve los errores registrados, más recientes primero. */
export function listErrors(): ErrorLogEntry[] {
  return read();
}

/** Limpia el registro de errores. */
export function clearErrors(): void {
  write([]);
}

/** Captura errores globales del navegador para el registro. */
export function installErrorHandlers(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    logError(event.error ?? event.message, 'window.error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason, 'unhandledrejection');
  });
}
