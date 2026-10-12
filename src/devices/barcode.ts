/**
 * Escáner de código de barras USB, modo teclado (F-102, sección 8.5).
 *
 * El escáner emula teclas y termina con Enter. Para no confundirlo con tecleo
 * humano se mide el tiempo entre teclas: si llegan muy rápido y el código es
 * largo, se trata como escaneo. No se roba el foco de los campos de texto.
 */
import { useEffect, useRef } from 'react';
import { recordScan } from './deviceStatus';

/** Tiempo máximo entre teclas para considerarlas parte de un escaneo. */
const MAX_INTERVAL_MS = 50;
/** Longitud mínima de un código escaneado. */
const MIN_LENGTH = 6;

/**
 * Escucha el teclado global y llama a `onScan` al detectar un escaneo.
 * Devuelve la función para quitar el listener.
 */
export function attachBarcodeScanner(onScan: (code: string) => void): () => void {
  if (typeof document === 'undefined') return () => {};

  let buffer = '';
  let lastAt = 0;

  function handleKeyDown(event: KeyboardEvent) {
    const now = Date.now();
    if (event.key === 'Enter') {
      const code = buffer;
      buffer = '';
      if (code.length >= MIN_LENGTH && now - lastAt <= MAX_INTERVAL_MS * 2) {
        event.preventDefault();
        recordScan(code);
        onScan(code);
      }
      return;
    }
    if (event.key.length !== 1) {
      buffer = '';
      return;
    }
    if (now - lastAt > MAX_INTERVAL_MS) buffer = '';
    buffer += event.key;
    lastAt = now;
  }

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}

/** Hook que conecta el escáner mientras está activo. */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true): void {
  const callbackRef = useRef(onScan);
  useEffect(() => {
    callbackRef.current = onScan;
  });
  useEffect(() => {
    if (!enabled) return;
    return attachBarcodeScanner((code) => callbackRef.current(code));
  }, [enabled]);
}
